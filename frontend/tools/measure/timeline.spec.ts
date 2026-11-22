// Phase 11 P11-D0, "where the time goes, end to end" (owner 2026-11-21).
// Not part of the browser suite: run it through ci/measure.mjs (three runs,
// compared, and a chart per moment):
//
//   PROXIC_TEST_TIMING=true docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
//   node ci/measure.mjs timeline
//
// For four moments, one timeline each from the player's click to both
// screens showing the result, every step timed (timeline.ts): the page's
// input, the network, the server, the pipe, the worker (Forge deciding, each
// seat's board: its view, history, hidden ids removed, written), the server
// again (pictures, the socket), the network, and on each page its parse,
// handler, React's commit, and the frame's style, layout and paint.
//
// 1. "tap-one-land": a creature being paid for, the first land clicked.
// 2. "cast-target": Giant Growth, from the click on it through its target
//    and payment to the spell on the stack on both screens.
// 3. "combat": an attack with every creature that leaves the guest alive
//    (at least ATTACKERS), the guest blocking nothing, to the damage on both
//    screens.
// 4. "karn-restart": Karn Liberated's -14, from the click, through the guest
//    passing, to game 2's first board on both screens (the guest's held
//    under its report window, spec 0102).
// 1-3 are one game of the mono-green deck, dealt (spec 0098) so the host has
// Giant Growth and creatures early; 4 is a game of the Karn deck, the host
// dealt Karn and lands. Each step runs alone: the bot waits for both pages to
// go quiet before its next click, and bot time between steps is in no slice.
//
// Each run writes timeline-<cpu>x.json in PROXIC_MEASURE_OUT: a row per
// moment and page ("4x combat host"), every slice summed over the moment's
// steps (`ms_<slice>`), and the steps themselves (`steps`, not compared).
// PROXIC_MEASURE_CPU=1,4 slows both pages' CPU.

import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs, testUser } from "../../e2e/helpers";
import {
  answer,
  cardCount,
  choices,
  clearEverything,
  clickNow,
  discardIfAsked as discardAsked,
  isAsked,
  matchPanel as panelOf,
  sharedDeck,
  startAMatch,
  watchGame,
} from "../../e2e/match-helpers";
import {
  attackLeavingThemAlive,
  attackers,
  hostsMove,
  matchPanel,
  step,
  theirLife,
} from "../../e2e/speed-kit";
import { OUT, writeResult, type Row } from "./results";
import { installProbe, pageProbe, quiet, settle, traced, type PageProbe } from "./timeline-probe";
import {
  SLICES,
  clockOffset,
  momentRows,
  momentSteps,
  readMarks,
  type StepTimeline,
} from "./timeline";

const green = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const karn = join(process.cwd(), "..", "Test Deck", "karn-deck.zip");
const CPUS = (process.env.PROXIC_MEASURE_CPU ?? "1,4").split(",").map(Number);
const CONTAINER = process.env.PROXIC_E2E_CONTAINER ?? "proxic-arena-arena-server-1";
/** The fewest attackers (piles count each) for "a big combat". */
const ATTACKERS = 5;

test.skip(({ browserName }) => browserName !== "chromium", "Chrome's DevTools protocol only");
test.beforeEach(() =>
  test.skip(!existsSync(green) || !existsSync(karn), "no green or Karn deck package"),
);

const docker = (args: string[]) =>
  execFileSync("docker", args, { encoding: "utf8", maxBuffer: 512 * 2 ** 20, timeout: 60_000 });
/** The server's log since [since] (ISO time): its marks are in it. */
const serverLog = (since: string) => docker(["logs", "--since", since, CONTAINER]);
/** The match's worker log (MatchWorker's stderrTarget): its marks are in it. */
const workerLog = (matchId: string) =>
  docker(["exec", CONTAINER, "cat", `/data/match-logs/${matchId}.log`]);

/** Two players signed in with the probe in both pages, the deck shared, nothing left over. */
async function twoPlayers(browser: Browser, pkg: string) {
  const options = { viewport: { width: 1920, height: 1080 } };
  const contexts = [await browser.newContext(options), await browser.newContext(options)];
  for (const c of contexts) await c.addInitScript(installProbe);
  const [host, guest] = [await contexts[0]!.newPage(), await contexts[1]!.newPage()];
  await signIn(host);
  await clearEverything(host);
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const deck = await sharedDeck(host, guest, pkg);
  const done = async () => {
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    for (const c of contexts) await c.close();
  };
  return { host, guest, deck, done };
}

/** The match id, from the page's match socket. */
function matchIdOf(page: Page): Promise<string> {
  return new Promise((resolve) =>
    page.on("websocket", (ws) => {
      const m = /\/ws\/matches\/([0-9a-f-]{36})/.exec(ws.url());
      if (m) resolve(m[1]!);
    }),
  );
}

interface Measured {
  rows: Row[];
  /** The best clock offset seen in this game (the smallest round trip). */
  clock?: { offset: number; rtt: number } | null;
  steps: { moment: string; steps: StepTimeline[] }[];
}

/** One moment, traced on both pages, joined with the server's and the worker's marks. */
async function moment(
  name: string,
  cpu: number,
  browser: Browser,
  probes: PageProbe[],
  matchId: string,
  into: Measured,
  run: () => Promise<void>,
) {
  await quiet(probes);
  const since = new Date(Date.now() - 5_000).toISOString();
  const { runs, from, to, traceSynced } = await traced(browser, probes, run);
  // The worker's log is a file the worker writes; the server's goes through docker.
  await probes[0]!.page.waitForTimeout(500);
  const server = readMarks(serverLog(since), matchId);
  const worker = readMarks(workerLog(matchId));
  expect(
    server.length > 0 && worker.length > 0,
    "no timing marks: start the stack with PROXIC_TEST_TIMING=true (docker-compose.local.yml)",
  ).toBe(true);
  // The clocks' offset from the quickest answer round trip of the game so far.
  const now = clockOffset(runs, server);
  if (now && (!into.clock || now.rtt < into.clock.rtt)) into.clock = now;
  const clock = into.clock;
  const steps = momentSteps(runs, server, worker, clock?.offset ?? 0, from, to);
  const key = `${cpu}x ${name}`;
  into.rows.push(...(momentRows(key, steps) as Row[]));
  into.rows.push({
    key: `${key} clock`,
    offsetMs: clock ? Math.round(clock.offset * 100) / 100 : null,
    rttMs: clock ? Math.round(clock.rtt * 100) / 100 : null,
    hostTraceSynced: traceSynced[0] ? 1 : 0,
    guestTraceSynced: traceSynced[1] ? 1 : 0,
    // A check on the network times' clock: a message is read after it arrives,
    // so the quickest arrival-to-handler gap is small and never negative.
    ...Object.fromEntries(
      runs.map((r) => {
        const gaps = r.msgs
          .filter((m) => m.t0 >= from && r.net[m.messageId] !== undefined)
          .map((m) => m.t0 - r.net[m.messageId]!);
        return [
          `${r.role}NetToHandlerMinMs`,
          gaps.length ? Math.round(Math.min(...gaps) * 100) / 100 : null,
        ];
      }),
    ),
  });
  into.steps.push({ moment: key, steps });
  // The moment's raw records, beside the run's file: the evidence each step was joined from.
  const inWindow = <T extends { t: number }>(xs: T[]) =>
    xs.filter((x) => x.t >= from - 2_000 && x.t <= to);
  const raw = join(OUT, "raw");
  mkdirSync(raw, { recursive: true });
  writeFileSync(
    join(raw, `${key.replace(/ /g, "-")}.json`),
    JSON.stringify({
      from,
      to,
      clock,
      pages: runs.map((r) => ({
        ...r,
        msgs: r.msgs.filter((m) => m.t0 >= from - 2_000 && m.t0 <= to),
        sends: inWindow(r.sends),
        inputs: inWindow(r.inputs),
        commits: r.commits
          .map((c, i) => ({ i, ...c }))
          .filter((c) => c.t >= from - 2_000 && c.t <= to),
      })),
      server: server.filter((m) => m.t / 1000 >= from - 10_000),
      worker: worker.filter((m) => m.t / 1000 >= from - 10_000),
    }),
  );
  for (const s of steps)
    console.log(
      `[timeline] ${key} decision ${s.decisionId} by ${s.acting}: both ${Math.round(s.bothMs)} ms; ` +
        s.seats.map((p) => `${p.role} ${Math.round(p.totalMs)} ms (${p.type})`).join(", ") +
        (s.missing.length ? `; missing: ${s.missing.join("; ")}` : ""),
    );
  expect(steps.length, `${key}: no step was timed`).toBeGreaterThan(0);
}

// --- the green game: tap one land, cast with a target, a big combat ----------------------------

const viewerChoosable = (page: Page) =>
  page.locator('.bf-cards button[data-controller="viewer"][data-choosable="true"]');
const forestToTap = (page: Page) =>
  viewerChoosable(page)
    .filter({ hasText: /^Forest/ })
    .and(page.locator('[data-tapped="false"]'));
const handCard = (page: Page, name: RegExp) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]')
    .filter({ hasText: name })
    .and(page.locator(':not([data-unpayable="true"])'));
/** Creatures of two mana or more (paid with two land clicks at least). */
const TWO_PLUS =
  /^(Grizzly Bears|Centaur Courser|Steel Leaf Champion|Thornhide Wolves|Colossal Dreadmaw)/;

/** Click, then wait until both pages are quiet. */
async function clickThenQuiet(target: ReturnType<Page["locator"]>, probes: PageProbe[]) {
  const at = Date.now();
  await clickNow(target);
  await settle(probes, at);
}

async function greenGame(browser: Browser, cpu: number, into: Measured) {
  const { host, guest, deck, done } = await twoPlayers(browser, green);
  try {
    const id = matchIdOf(host);
    const forests = Array.from({ length: 8 }, () => "Forest");
    await startAMatch(host, guest, deck, {
      deal: {
        host: {
          hand: [
            "Forest",
            "Forest",
            "Llanowar Elves",
            "Grizzly Bears",
            "Giant Growth",
            "Centaur Courser",
            "Forest",
          ],
          top: [
            "Forest",
            "Grizzly Bears",
            "Forest",
            "Steel Leaf Champion",
            "Forest",
            "Giant Growth",
            ...forests,
          ],
        },
      },
    });
    const matchId = await id;
    const probes = [await pageProbe(host, "host", cpu), await pageProbe(guest, "guest", cpu)];
    const done_ = new Set<string>();
    const deadline = Date.now() + 1_500_000;
    const watch = watchGame([host, guest], () => [...done_], { stuckMs: 90_000 });
    while (done_.size < 3 && Date.now() < deadline) {
      await watch.check();
      if (await hostsMove(host)) {
        // 1. A creature of two mana or more, with two Forests to pay: the first land clicked.
        if (
          !done_.has("tap") &&
          (await handCard(host, TWO_PLUS).count()) > 0 &&
          (await cardCount(forestUntapped(host))) >= 2
        ) {
          await clickThenQuiet(handCard(host, TWO_PLUS), probes);
          const popup = host.locator(".gs-popup .gs-option");
          if ((await popup.count()) > 0) await clickThenQuiet(popup, probes);
          if ((await forestToTap(host).count()) > 0) {
            await moment("tap-one-land", cpu, browser, probes, matchId, into, async () => {
              await clickThenQuiet(forestToTap(host), probes);
            });
            done_.add("tap");
          }
          continue;
        }
        // 2. Giant Growth on a creature, paid: click, target, lands, to the stack.
        if (
          done_.has("tap") &&
          !done_.has("cast") &&
          (await handCard(host, /^Giant Growth/).count()) > 0 &&
          // Two creatures and two Forests: the target and the land are the player's
          // to choose (with one of each, the game can take both itself).
          (await cardCount(boardCreatures(host))) >= 2 &&
          (await cardCount(forestUntapped(host))) >= 2
        ) {
          await moment("cast-target", cpu, browser, probes, matchId, into, async () => {
            const stacked0 = probes.map((p) => p.seen.stacked);
            await clickThenQuiet(handCard(host, /^Giant Growth/), probes);
            // Until the spell is on the stack on both boards (paying may offer the
            // Elves, and a land or the Elves stay clickable for mana after it).
            for (let k = 0; k < 8 && probes.some((p, n) => p.seen.stacked === stacked0[n]); k++) {
              const popup = host.locator(".gs-popup .gs-option");
              const target = viewerChoosable(host)
                .and(host.locator("[data-pt]"))
                .filter({ hasNotText: /^Llanowar Elves/ });
              const theirs = host.locator(
                '.bf-cards button[data-controller="opponent"][data-choosable="true"][data-pt]',
              );
              if ((await popup.count()) > 0) await clickThenQuiet(popup, probes);
              else if ((await target.count()) > 0) await clickThenQuiet(target, probes);
              else if ((await theirs.count()) > 0) await clickThenQuiet(theirs, probes);
              else if ((await forestToTap(host).count()) > 0)
                await clickThenQuiet(forestToTap(host), probes);
              else break;
            }
          });
          done_.add("cast");
          continue;
        }
      }
      // 3. A big combat: every creature that leaves the guest alive, no blocks, to the damage.
      const kind = await matchPanel(host)
        .locator(".gs-combat")
        .getAttribute("data-kind", { timeout: 200 })
        .catch(() => null);
      if (done_.has("cast") && !done_.has("combat") && kind === "declareAttackers") {
        if ((await attackers(host)).length >= ATTACKERS) {
          const life = await theirLife(host);
          await moment("combat", cpu, browser, probes, matchId, into, async () => {
            const damage0 = probes.map((p) => p.seen.damage);
            if (await attackLeavingThemAlive(host, life).catch(() => false))
              await clickThenQuiet(matchPanel(host).locator("button.gs-act-combat"), probes);
            // Each page answers what it is asked (the guest blocks nothing) until both saw the damage.
            const end = Date.now() + 60_000;
            while (Date.now() < end && probes.some((p, k) => p.seen.damage === damage0[k])) {
              for (const p of [guest, host]) {
                const at = Date.now();
                await step(p, false);
                await settle(probes, at);
              }
            }
          });
          done_.add("combat");
          continue;
        }
      }
      for (const p of [host, guest]) await step(p);
      await host.waitForTimeout(100);
    }
    expect([...done_].sort(), "every green moment was timed").toEqual(["cast", "combat", "tap"]);
  } finally {
    await done();
  }
}

const forestUntapped = (page: Page) =>
  page
    .locator('.bf-cards button[data-controller="viewer"][data-tapped="false"]')
    .filter({ hasText: /^Forest/ });
const boardCreatures = (page: Page) =>
  page.locator(
    '.bf-cards button[data-controller="viewer"][data-pt]:not([data-zone="viewer:hand"])',
  );

// --- the Karn game: Karn's restart -----------------------------------------------------------

async function karnGame(browser: Browser, cpu: number, into: Measured) {
  const { host, guest, deck, done } = await twoPlayers(browser, karn);
  try {
    const id = matchIdOf(host);
    const plains = (n: number) => Array.from({ length: n }, () => "Plains");
    await startAMatch(host, guest, deck, {
      deal: { host: { hand: ["Karn Liberated", ...plains(6)], top: plains(12) } },
    });
    const matchId = await id;
    const probes = [await pageProbe(host, "host", cpu), await pageProbe(guest, "guest", cpu)];
    const deadline = Date.now() + 1_200_000;
    const watch = watchGame([host, guest], () => "", { allowEnd: true });
    let restarted = false;
    const asking = async (page: Page) =>
      (await isAsked(page)) ||
      (await panelOf(page).getByRole("button", { name: "Pass" }).count()) > 0;
    while (!restarted && Date.now() < deadline) {
      await watch.check();
      const live = (await asking(host)) ? host : (await asking(guest)) ? guest : null;
      if (!live) {
        await host.waitForTimeout(100);
        continue;
      }
      if (await discardAsked(live)) continue;
      const panel = panelOf(live);
      const heading = (await panel.locator(".gs-question-title").allTextContents()).join(" ");
      const options = await choices(live);
      const labels = await options.allTextContents();
      const find = (pattern: RegExp) => labels.findIndex((label) => pattern.test(label));
      if (live === host && find(/-14: Restart the game/) >= 0) {
        const ultimate = options.nth(find(/-14: Restart the game/));
        await moment("karn-restart", cpu, browser, probes, matchId, into, async () => {
          const epoch0 = probes.map((p) => p.seen.epoch);
          const at = Date.now();
          await answer(ultimate);
          await settle(probes, at);
          // Whoever is asked passes (the -14 resolves), until both pages have game 2's board.
          const end = Date.now() + 60_000;
          while (Date.now() < end && probes.some((p, k) => p.seen.epoch === epoch0[k])) {
            for (const p of [guest, host]) {
              const pass = panelOf(p).getByRole("button", { name: "Pass" });
              const at = Date.now();
              if ((await pass.count()) > 0) await answer(pass);
              await settle(probes, at);
            }
          }
        });
        restarted = true;
        break;
      }
      let pick = -1;
      if (/Keep or mulligan/.test(heading)) pick = find(/Keep/);
      else if (/Put a card back/.test(heading)) pick = find(/^Plains/);
      else if (live === host) {
        const mine = panel.locator(
          '.bf-cards button[data-controller="viewer"][data-object-id]:not([data-zone="viewer:hand"])',
        );
        const karnOut = (await mine.filter({ hasText: "Karn" }).count()) > 0;
        const lands = await cardCount(mine.filter({ hasText: "Plains" }));
        pick = find(/\+4: Target player/);
        if (pick < 0) pick = find(/Play land/);
        if (pick < 0 && !karnOut && lands >= 7) pick = find(/^Karn Liberated · \{7\}/);
        if (pick < 0) pick = /Pay the mana|^\s*Pay \{/.test(heading) ? 0 : -1;
        if (pick < 0) pick = find(new RegExp(`^${secondUser}`));
      } else {
        pick = find(/Play land/);
        if (pick < 0 && /Choose one/.test(heading)) pick = 0;
      }
      if (
        pick < 0 &&
        (await panel.getByRole("button", { name: "Pass" }).count()) === 0 &&
        labels.length
      )
        pick = 0;
      if (pick >= 0) await answer(options.nth(pick));
      else await answer(panel.getByRole("button", { name: "Pass" }));
      await live.waitForTimeout(40);
    }
    expect(restarted, `the host (${testUser}) never reached Karn's -14`).toBe(true);
  } finally {
    await done();
  }
}

test("timeline: four moments, click to both screens, every step timed", async ({ browser }) => {
  test.setTimeout(90 * 60_000);
  for (const cpu of CPUS) {
    const into: Measured = { rows: [], steps: [] };
    await greenGame(browser, cpu, into);
    await karnGame(browser, cpu, into);
    for (const r of into.rows) console.log(`[timeline] ${JSON.stringify(r)}`);
    writeResult(`timeline-${cpu}x`, "timeline", "chromium", into.rows, {
      slices: SLICES,
      steps: into.steps,
    });
  }
});
