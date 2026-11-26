// Phase 11's repaint measure (P11-C5) and the busy board's (P11-B2). Not
// part of the browser suite: run it through ci/measure.mjs (three runs,
// compared), against the local stack on :8080, with nothing else using the
// shared test accounts:
//
//   node ci/measure.mjs repaint                    both tests, 3 runs
//   node ci/measure.mjs repaint --grep "repaint:"  only the repaint rows
//
// 1. "repaint": the replayed table (bench.ts, as the redraw measure's), at
//    10, 40 and 100 permanents a side, and the busy board (B2: 40 a side,
//    16 of each side's creatures flying, past spec 0090's FLY_SYNC_AT). Per
//    moment, from the compositor's own account (repaint.ts): the area drawn
//    again per update, the part of it outside the moment's target (the
//    cards the update changed, before and after, with the piles they leave
//    or join, the stack while a spell is on it, and the plates when a life
//    total changed), the layers the compositor holds and their memory, and
//    who asked for each repaint. Moments: idle (5 s, nothing sent), a land
//    tapping (10 boards), a cast (a creature from the hand onto the stack,
//    two lands paying, then onto the table: 3 times), a combat (two attack,
//    one is blocked, damage, the end of combat: twice); and on the busy
//    board, idle and redraw.spec's busy table (20 boards).
// 2. "busy board": the busy board's frames (p95, worst) and long tasks
//    (over 50 ms on the page's main thread), at 1x and with the page's CPU
//    slowed 4x, beside the same table without flyers; and the redraw
//    timer's numbers (probes.ts) for it.
//
// Results: repaint-bench.json, repaint-causes.json (who repainted, by
// moment: not compared, read by a person) and busy-board-<cpu>x.json in
// PROXIC_MEASURE_OUT. The other page of the game is frozen while a stretch
// is measured (Page.setWebLifecycleState), so its drawing is not in it.

import { expect, test, type Page } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  bigTable,
  busyChange,
  casts,
  combatStep,
  handBears,
  still,
  tapLand,
  takeOver,
  twoPlayers,
} from "./bench";
import { boardCards, cardCount } from "../../e2e/match-helpers";
import { perUpdate, timer } from "./probes";
import { lifecycle, moment, repaintProbe, type Repaint } from "./repaint";
import { OUT, writeResult, type Row } from "./results";

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const CPUS = (process.env.PROXIC_MEASURE_CPU ?? "1,4").split(",").map(Number);
/** Permanents a side the repaint moments run on. */
const SIDES = [10, 40, 100];
/** P11-B2: flyers a side on the busy board (spec 0090's FLY_SYNC_AT is 12 on the whole table). */
const FLYERS = 16;

test.skip(({ browserName }) => browserName !== "chromium", "Chrome's DevTools protocol only");
test.beforeEach(() => test.skip(!existsSync(pkg), "no green deck package"));

const r1 = (x: number) => Math.round(x * 10) / 10;

/** A repaint row: per update, beside the moment's totals. */
function repaintRow(key: string, table: number, r: Repaint, updates: number): Row {
  const n = Math.max(1, updates);
  return {
    key,
    table,
    updates,
    commitsPerUpdate: r1(r.commits / n),
    paintedKpxPerUpdate: r1(r.paintedKpx / n),
    outsideKpxPerUpdate: r1(r.outsideKpx / n),
    outsideShadowKpxPerUpdate: r1(r.outsideShadowKpx / n),
    rectsPerUpdate: r1(r.rects / n),
    paintsPerUpdate: r1(r.paints / n),
    paintedKpx: r.paintedKpx,
    outsideKpx: r.outsideKpx,
    layers: r.layers,
    drawingLayers: r.drawingLayers,
    layerMemKb: r.layerMemKb,
  };
}

async function tableSize(host: Page) {
  return (
    (await cardCount(boardCards(host, "viewer"))) + (await cardCount(boardCards(host, "opponent")))
  );
}

test("repaint: what one update draws again, at 10, 40 and 100 a side, and the busy board", async ({
  browser,
}) => {
  test.setTimeout(30 * 60_000);
  const { host, guest, deck, done } = await twoPlayers(browser, pkg);
  const rows: Row[] = [];
  const causes: Record<string, Repaint["byClient"]> = {};
  const keep = (key: string, table: number, r: Repaint, updates: number) => {
    rows.push(repaintRow(key, table, r, updates));
    causes[key] = r.byClient;
    console.log(`[repaint] ${JSON.stringify(rows.at(-1))}`);
  };
  try {
    const bench = await takeOver(host, guest, deck);
    await lifecycle(guest, "frozen");
    const probe = await repaintProbe(host);
    for (const side of SIDES) {
      const table = bigTable(bench.base, side);
      bench.send({ ...table, hand: handBears(table, 4) });
      await expect(host.locator(".bf-cards [data-zone^='viewer:']").first()).toBeVisible();
      await still(host);
      const cards = await tableSize(host);
      const idle = await probe.time(
        () => host.waitForTimeout(5_000),
        () => [],
      );
      keep(`${side} idle`, cards, idle, 0);
      await still(host);
      keep(`${side} tap-one-land`, cards, await moment(host, bench, probe, tapLand, 10, 700), 10);
      await still(host);
      keep(`${side} cast`, cards, await moment(host, bench, probe, casts(), 6, 1_200), 6);
      await still(host);
      let k = 0;
      keep(
        `${side} combat`,
        cards,
        await moment(host, bench, probe, (now) => combatStep(k++)(now), 8, 1_200),
        8,
      );
    }
    // P11-B2 -- the busy board: 40 a side, 16 of each side's creatures flying.
    bench.send({ ...bigTable(bench.base, 40, FLYERS), hand: [] });
    await still(host);
    const cards = await tableSize(host);
    keep(
      "b2 idle",
      cards,
      await probe.time(
        () => host.waitForTimeout(5_000),
        () => [],
      ),
      0,
    );
    await still(host);
    let k = 0;
    keep(
      "b2 busy",
      cards,
      await moment(host, bench, probe, (now) => busyChange(now, k++), 20, 1_000),
      20,
    );
    writeResult("repaint-bench", "repaint", "chromium", rows);
    writeFileSync(join(OUT, "repaint-causes.json"), JSON.stringify(causes, null, 1));
  } finally {
    await lifecycle(guest, "active").catch(() => undefined);
    await done();
  }
});

/** Long tasks on [page] while [during] runs: how many, their total and the longest, ms. */
async function longTasks(page: Page, during: () => Promise<unknown>) {
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __longObs?: PerformanceObserver };
    w.__long = [];
    w.__longObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    });
    w.__longObs.observe({ type: "longtask" });
  });
  await during();
  const tasks = await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __longObs?: PerformanceObserver };
    w.__longObs?.disconnect();
    return w.__long;
  });
  return {
    longTasks: tasks.length,
    longTaskMs: r1(tasks.reduce((s, d) => s + d, 0)),
    longestTaskMs: r1(Math.max(0, ...tasks)),
  };
}

test("busy board: frames and long tasks, 40 a side with flyers (P11-B2)", async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  for (const cpu of CPUS) {
    const { host, guest, deck, done } = await twoPlayers(browser, pkg);
    const rows: Row[] = [];
    try {
      const bench = await takeOver(host, guest, deck);
      await lifecycle(guest, "frozen");
      for (const flyers of [FLYERS, 0]) {
        const name = flyers ? "b2" : "b2-no-flyers";
        bench.send({ ...bigTable(bench.base, 40, flyers), hand: [] });
        await expect(host.locator(".bf-cards [data-zone^='viewer:']").first()).toBeVisible();
        await still(host);
        const t = await timer(host, cpu);
        const cards = await tableSize(host);
        let idle: Awaited<ReturnType<typeof t.time>> | null = null;
        const idleLong = await longTasks(host, async () => {
          idle = await t.time(() => host.waitForTimeout(5_000));
        });
        rows.push({
          key: `${cpu}x ${name} idle`,
          table: cards,
          ...perUpdate(idle!, 0),
          ...idleLong,
        });
        await still(host);
        let busy: Awaited<ReturnType<typeof t.time>> | null = null;
        const busyLong = await longTasks(host, async () => {
          busy = await t.time(async () => {
            for (let k = 0; k < 20; k++) {
              bench.send(busyChange(bench.now(), k));
              await host.waitForTimeout(1_000);
            }
          });
        });
        rows.push({
          key: `${cpu}x ${name} busy`,
          table: cards,
          ...perUpdate(busy!, 20),
          ...busyLong,
        });
        await t.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await t.cdp.detach();
      }
      for (const r of rows) console.log(`[busy] ${JSON.stringify(r)}`);
      writeResult(`busy-board-${cpu}x`, "redraw", "chromium", rows);
    } finally {
      await lifecycle(guest, "active").catch(() => undefined);
      await done();
    }
  }
});
