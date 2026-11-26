// Phase 11's redraw and wire measures (P11-C1, P11-D1). Not part of the
// browser suite: run it through ci/measure.mjs (three runs, compared), against
// the local stack on :8080, with nothing else using the shared test accounts:
//
//   node ci/measure.mjs redraw              both tests, 1x and 4x, 3 runs
//   node ci/measure.mjs redraw --grep bench only the replayed table
//
// Everything is per game update (B7: a per-second figure swings with how long
// a combat lasts), from Chrome's own account (tools/measure/probes.ts): React
// components rendered, the game screen's and each plate's renders, the page's
// own JavaScript (a CPU profile, split from the test's), style and layout
// time, paints and the area painted, and frames p95/worst.
//
// 1. "bench": a real game page whose match socket is taken over once the game
//    runs: no polling, no clicks, the same boards in the same rhythm every run
//    (the jumps tool's method). A table of 40 permanents a side, then:
//    - "bench-idle": 4 s with nothing sent (a still table does no work);
//    - "tap-one-land": 20 boards, each tapping or untapping one Forest;
//    - "bench-40": 20 boards of a busy table (a land taps, a creature enters,
//      one attacks, life drops, one dies), one a second;
//    - "tap-one-land-10", "tap-one-land-100" (P11-C2): the land tap again on
//      a table of 10 and of 100 permanents a side, for how the work scales.
//    The boards go as the server sends them (P11-C2: a whole board, then
//    MATCH_DELTAs, delta.ts DeltaStream); PROXIC_MEASURE_WHOLE=1 sends each whole.
// 2. "game": match-speed's real game (speed-kit's bot, the mono-green deck)
//    over its fixed moments (idle, hover, cast, combat, end), timed on the
//    host's page; the test's own JavaScript is reported apart ("testMs").
//    The wire measure rides on it: every socket message both pages read,
//    and the server's CPU per board (its container's process 1).
//
// Both at 1x and with the measured page's CPU slowed 4x (PROXIC_MEASURE_CPU=1
// or 4 runs one). Results: redraw-bench-<cpu>x.json, redraw-game-<cpu>x.json
// and wire-game-<cpu>x.json in PROXIC_MEASURE_OUT.

import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  boardCards,
  cardCount,
  clickNow,
  settle,
  startAMatch,
  watchGame,
} from "../../e2e/match-helpers";
import {
  BIG,
  attackLeavingThemAlive,
  attackWithAll,
  attackers,
  castable,
  drive,
  hostsMove,
  hoverHand,
  matchPanel,
  over,
  step,
  theirLife,
} from "../../e2e/speed-kit";
import { bigTable, busyChange, still, takeOver, twoPlayers } from "./bench";
import { perUpdate, timer, type Timer } from "./probes";
import { serverCpuMs, writeResult, type Row } from "./results";
import { boardMakeup, countBytes, wireBytesIn, wireNumbers, type Counter } from "./wire";

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const CPUS = (process.env.PROXIC_MEASURE_CPU ?? "1,4").split(",").map(Number);
/** P11-C2: the bench sends every board whole (as before P11-D4's deltas reached it). */
const WHOLE = process.env.PROXIC_MEASURE_WHOLE === "1";
/** P11-C2: the table sizes (permanents a side) the land tap is also timed on, beside 40. */
const SIDES = [10, 100];

test.skip(({ browserName }) => browserName !== "chromium", "Chrome's DevTools protocol only");
test.beforeEach(() => test.skip(!existsSync(pkg), "no green deck package"));

// --- 1. the replayed table ---------------------------------------------------------------------

test("bench: a 40-a-side table and one land tapping, replayed", async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  for (const cpu of CPUS) {
    const { host, guest, deck, done } = await twoPlayers(browser, pkg);
    const rows: Row[] = [];
    try {
      const bench = await takeOver(host, guest, deck, WHOLE);
      const b = bench.base;
      const send = bench.send;
      /** Twenty boards, each tapping or untapping one of the viewer's Forests, 0.7 s apart. */
      const tapOneLand = () => {
        const now = bench.now();
        const land = now.battlefield.find((c) => c["seat"] === now.seat && c["kind"] === "land")!;
        return t.time(async () => {
          for (let k = 0; k < 20; k++) {
            const at = bench.now();
            send({
              ...at,
              battlefield: at.battlefield.map((c) =>
                c.id === land.id ? { ...c, tapped: !c["tapped"] } : c,
              ),
            });
            await host.waitForTimeout(700);
          }
        });
      };
      send(bigTable(b));
      await expect(host.locator(".bf-cards [data-zone^='viewer:']").first()).toBeVisible();
      await still(host);
      const t: Timer = await timer(host, cpu);
      const table =
        (await cardCount(boardCards(host, "viewer"))) +
        (await cardCount(boardCards(host, "opponent")));

      const idle = await t.time(() => host.waitForTimeout(4_000));
      rows.push({ key: `${cpu}x bench-idle`, table, ...perUpdate(idle, 0) });

      await still(host);
      const tap = await tapOneLand();
      rows.push({ key: `${cpu}x tap-one-land`, table, ...perUpdate(tap, 20) });

      await still(host);
      const busy = await t.time(async () => {
        for (let k = 0; k < 20; k++) {
          send(busyChange(bench.now(), k));
          await host.waitForTimeout(1_000);
        }
      });
      rows.push({ key: `${cpu}x bench-40`, table, ...perUpdate(busy, 20) });

      // P11-C2 -- how the work scales with the table: the same land tap on a
      // table of 10 and of 100 permanents a side.
      for (const side of SIDES) {
        send(bigTable(b, side));
        await still(host);
        const cards =
          (await cardCount(boardCards(host, "viewer"))) +
          (await cardCount(boardCards(host, "opponent")));
        const scaled = await tapOneLand();
        rows.push({ key: `${cpu}x tap-one-land-${side}`, table: cards, ...perUpdate(scaled, 20) });
      }
      for (const r of rows) console.log(`[redraw] ${JSON.stringify(r)}`);
      writeResult(`redraw-bench-${cpu}x`, "redraw", "chromium", rows);
    } finally {
      await done();
    }
  }
});

// --- 2. the real game -------------------------------------------------------------------------

type Scene = "idle" | "hover" | "cast" | "combat" | "end";

test("game: match-speed's moments, per update, and the wire", async ({ browser }) => {
  test.setTimeout(50 * 60_000);
  for (const cpu of CPUS) {
    const { host, guest, deck, done, taps } = await twoPlayers(browser, pkg, true, true);
    const wires: Counter[] = [countBytes(host), countBytes(guest)];
    /** What crossed the wire on each seat's match socket, beside what its page read. */
    const onWire = (i: number, from: number, to: number) => {
      const bytes = wireBytesIn(taps[i]!.chunks, from, to);
      const read = wireNumbers(wires[i]!.between(from, to), 1)["matchBytesIn"]!;
      return {
        matchWireBytesIn: bytes,
        wireShare: read ? Math.round((bytes / read) * 1000) / 1000 : null,
      };
    };
    // Every match-socket message the host page reads is a game update (as match-speed counts).
    const hostUpdates = () =>
      wires[0]!.frames.filter((f) => f.socket === "match" && f.dir === "in");
    const rows: Row[] = [];
    const wireRows: Row[] = [];
    try {
      await startAMatch(host, guest, deck);
      const start = Date.now();
      const cpu0 = serverCpuMs();
      const t = await timer(host, cpu);
      const timed = async (scene: Scene, during: () => Promise<void>) => {
        const from = Date.now();
        const u0 = hostUpdates().length;
        const took = await t.time(during);
        const to = Date.now();
        const updates = hostUpdates().length - u0;
        const table =
          (await cardCount(boardCards(host, "viewer")).catch(() => 0)) +
          (await cardCount(boardCards(host, "opponent")).catch(() => 0));
        const row: Row = { key: `${cpu}x ${scene}`, table, ...perUpdate(took, updates) };
        rows.push(row);
        console.log(`[redraw] ${JSON.stringify(row)}`);
        if (scene === "combat" || scene === "cast")
          wires.forEach((w, i) =>
            wireRows.push({
              key: `${cpu}x ${scene} seat${i + 1}`,
              ...wireNumbers(w.between(from, to), (to - from) / 1000),
              ...onWire(i, from, to),
            }),
          );
      };
      const done_ = new Set<Scene>();
      const deadline = Date.now() + 1_500_000;
      const watch = watchGame([host, guest], () => [...done_], { stuckMs: 90_000 });
      let ended = false;
      while (!ended && Date.now() < deadline) {
        await watch.check();
        const total =
          (await cardCount(boardCards(host, "viewer")).catch(() => 0)) +
          (await cardCount(boardCards(host, "opponent")).catch(() => 0));
        if (total >= BIG && !done_.has("cast") && (await hostsMove(host))) {
          const spell = castable(host);
          if ((await spell.count()) > 0) {
            await host.mouse.move(960, 500);
            await host.waitForTimeout(1500);
            await settle([host, guest], { clock: "commits" });
            await timed("idle", () => host.waitForTimeout(6000));
            await timed("hover", () => hoverHand(host));
            await host.mouse.move(960, 500);
            await timed("cast", async () => {
              await clickNow(spell);
              await host.waitForTimeout(150);
              const popup = host.locator(".gs-popup .gs-option");
              if ((await popup.count()) > 0) await clickNow(popup);
              await drive([guest, host], 6000);
            });
            done_.add("idle").add("hover").add("cast");
            continue;
          }
        }
        const kind = await matchPanel(host)
          .locator(".gs-combat")
          .getAttribute("data-kind", { timeout: 200 })
          .catch(() => null);
        if (done_.has("cast") && kind === "declareAttackers") {
          const life = await theirLife(host);
          const power = (await attackers(host)).reduce((s, a) => s + a.power, 0);
          if (!done_.has("combat")) {
            await timed("combat", async () => {
              if (await attackLeavingThemAlive(host, life).catch(() => false))
                await clickNow(matchPanel(host).locator("button.gs-act-combat"));
              await drive([guest, host], 9000);
            });
            done_.add("combat");
            continue;
          }
          if (power >= life) {
            await timed("end", async () => {
              if (await attackWithAll(host).catch(() => false))
                await clickNow(matchPanel(host).locator("button.gs-act-combat"));
              await drive([guest, host], 20_000, () => over(host));
              await host.waitForTimeout(4000);
            });
            done_.add("end");
            ended = true;
            break;
          }
          if (await attackWithAll(host).catch(() => false))
            await clickNow(matchPanel(host).locator("button.gs-act-combat"));
          continue;
        }
        for (const p of [host, guest]) await step(p);
        await host.waitForTimeout(100);
      }
      expect([...done_].sort(), "every moment was timed").toEqual(
        ["cast", "combat", "end", "hover", "idle"].sort(),
      );
      const end = Date.now();
      const cpu1 = serverCpuMs();
      const seconds = (end - start) / 1000;
      const seats = wires.map((w) => wireNumbers(w.between(start, end), seconds));
      seats.forEach((s, i) =>
        wireRows.push({ key: `${cpu}x whole game seat${i + 1}`, ...s, ...onWire(i, start, end) }),
      );
      const boards = seats.reduce((a, s) => a + s["boards"]!, 0);
      wireRows.push({
        key: `${cpu}x whole game server`,
        seconds: Math.round(seconds),
        boards,
        serverCpuMs: cpu0 === null || cpu1 === null ? null : cpu1 - cpu0,
        serverCpuMsPerBoard:
          cpu0 === null || cpu1 === null ? null : Math.round(((cpu1 - cpu0) / boards) * 100) / 100,
      });
      wires.forEach((w, i) =>
        wireRows.push({ key: `${cpu}x largest board seat${i + 1}`, ...boardMakeup(w.largest) }),
      );
      for (const r of wireRows) console.log(`[wire] ${JSON.stringify(r)}`);
      writeResult(`redraw-game-${cpu}x`, "redraw", "chromium", rows);
      writeResult(`wire-game-${cpu}x`, "wire", "chromium", wireRows);
    } finally {
      await done();
    }
  }
});
