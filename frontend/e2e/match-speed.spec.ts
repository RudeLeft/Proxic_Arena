// A real game's speed, in the browser -- spec 0095 (owner 2026-11-16, item 3:
// "the game needs to be very snappy").
//
// Two players play the mono-green deck (protocol/fixtures/green-deck) until
// the table holds 28 or more permanents, and the host's page is timed over
// five moments of a real game: idle (the host's move, the guest waiting),
// hovering over the hand, a cast, an all-out combat that leaves the guest
// alive, and the blow that ends the game. Once at real speed, once with the
// host page's CPU slowed four times (CDP), as a slower laptop runs it.
//
// What is recorded (lifted from the frame-rate deep dive's scratch tools):
// every frame interval (requestAnimationFrame); the page's main-thread
// JavaScript (CDP Performance.getMetrics ScriptDuration, ms per second);
// every React commit, through a stand-in for the DevTools hook installed
// before the page's scripts, with how many components rendered and whether
// the game screen and each player's plate were among them (found by the
// element they draw first, so it works on the minified build); the game
// updates the match socket brought; and, for idle, every repaint (Chrome's
// own trace, "Paint" events of each page's frame).
//
// Budgets: SPEED_BUDGETS below. F-0095-B: the waiting player's view of the
// glowing plate is screenshot at four moments of the glow, and again with
// the glow as it was before 0095 (its box-shadow keyframes, put back), and
// the two must match as F-0090-B's glow does.
//
// PROXIC_SPEED_OUT=<folder> writes every number and a screenshot of each
// moment there; PROXIC_SPEED_PROFILE=1 adds the host page's CPU profile of
// each moment (<cpu>x-<moment>.cpuprofile), to find where its time goes;
// PROXIC_SPEED_TRACE=1 keeps Chrome's trace of each (<cpu>x-<moment>.trace.json),
// with PROXIC_SPEED_TRACE_CATEGORIES's categories too (spec 0096: gpu, cc, v8...).

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cpus, tmpdir } from "node:os";
import { secondPassword, secondUser, signIn, signInAs } from "./helpers";
import {
  boardCards,
  cardCount,
  clearEverything,
  clickNow,
  settle,
  sharedDeck,
  startAMatch,
  watchGame,
} from "./match-helpers";
import {
  BIG,
  RECORDER,
  attackLeavingThemAlive,
  attackWithAll,
  attackers,
  castable,
  countUpdates,
  drive,
  hostsMove,
  hoverHand,
  matchPanel,
  over,
  percentile,
  probe,
  r1,
  scriptMs,
  step,
  theirLife,
  type Probe,
} from "./speed-kit";
import { pageShare, type Share } from "./page-share";

const r2 = (x: number) => Math.round(x * 100) / 100;

const pkg = join(process.cwd(), "..", "Test Deck", "green-deck.zip");
const OUT = process.env.PROXIC_SPEED_OUT ?? join("test-results", "speed");
const PROFILE = process.env.PROXIC_SPEED_PROFILE === "1";
const TRACE = process.env.PROXIC_SPEED_TRACE === "1";
/** Spec 0096 -- more of Chrome's trace for diagnosis (comma-separated categories), with PROXIC_SPEED_TRACE=1. */
const TRACE_CATEGORIES = (process.env.PROXIC_SPEED_TRACE_CATEGORIES ?? "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);
/**
 * Spec 0095's budgets. Frames in ms; JavaScript in ms per second of the
 * moment (CPU slowed 4x); re-renders per game update; repaints per second.
 *
 * Set from the measured runs (As built, 2026-11-16; owner's PC, headless
 * Edge), as the spec says when a measured machine differs (0090's lesson):
 * - p95 at real speed 20, not 17: headless frames jitter to 17.1-18.0 on
 *   their own (before and after alike).
 * - the game's end has its own frame budgets: one frame of 100-135 ms
 *   about 7 s into it, and p95 up to 23 at real speed, before and after
 *   alike, with no long task of the page's own in Chrome's trace --
 *   flagged to the owner.
 * - (0095) JavaScript at 4x 130 for both, not 80 and 70 (set again by 0096,
 *   below): the page's JavaScript per
 *   second fell little (a cast 73-125 after, 89-97 before; combat 80-97
 *   after, 95-98 before), though its renders halved: what is left is the
 *   board's own drawing per game update -- flagged to the owner.
 * - a repaint loop is what idle must not have: under 1 a second (a single
 *   repaint in 6 s, 0.2, was seen once in a while on the waiting page).
 * The re-render budgets are the spec's.
 * - frame budgets raised from CI's first run (28e07b8, 2026-11-16): CI's
 *   headless frames come in 16.7 ms steps and its machine is slower --
 *   1x combat p95 33.4 / slowest 83.4, 4x combat slowest 100.1, 4x end
 *   p95 50. Frames now catch a page that runs at half speed or worse; the
 *   re-render, JavaScript and repaint budgets (all met on CI) are the
 *   real guards.
 * - 1x end slowest frame 200, not 150: the single slow frame at the game's
 *   end reached 159.9 locally (0093 A1 run). Spec 0096 found it: it is not
 *   this page's. Both players' pages run in this one browser and share its
 *   GPU process; at the end, the GPU process's main thread spends 100-160 ms
 *   in one raster flush of the OTHER page's tiles (SwiftShader's software GL,
 *   headless), and this page's frame waits for it. No task on either page's
 *   main thread. Kept at 200 (it is the test's, not a player's).
 *   P11-C6 follow-up (owner 2026-11-25, "Measure one page"): the end is
 *   timed with the other page paused (guestPaused). With it paused, the
 *   GPU process still spent 250 ms finishing one of THIS page's frames as
 *   its end banner came (SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass,
 *   headless software drawing; trace, 1x); in headed Edge with the PC's GPU
 *   the end's slowest frame was 66.7. The 200 stays (owner).
 * - Spec 0096 (the board keeps its cards): JavaScript at 4x 100 for a cast
 *   and 88 for a combat -- not the spec's 80 and 70, which were not met:
 *   after, a cast 65-87 and a combat 78-84 over three runs (before, 81-126
 *   and 91-108). A cast's numbers swing with the game (how many updates the
 *   moment holds), so its budget sits above them; combat's sits between
 *   after and before. What is left is React's own walk of the board, the
 *   glide pass, and the test's own polling (about 17-20 of it). Enforced
 *   off CI only (0095 A1); HEAD's page fails one or both in every run.
 * - P11-C6 follow-up (owner 2026-11-25, "Work per update"): the per-second
 *   JavaScript budgets (0096's 80/70, loosened to 100/88) are retired. A
 *   per-second figure follows the bot's pace as much as the page (a bot that
 *   stopped waiting 200 ms for combat doubled it, the page unchanged). The 4x
 *   cast and combat are now held to the page's own JavaScript per game
 *   update (pageMsPerUpdate4x, ms): a CPU profile of the moment, every sample
 *   given to whoever's script was running (page-share.ts), the test's own
 *   work (Playwright's scripts, the recorder) taken out and everything
 *   else (garbage collection too) left in. On the owner's PC (9 runs,
 *   2026-11-25, nothing else busy) a cast read 6.5-10.5 ms (higher when the
 *   moment catches fewer updates) and a combat 5.0-7.5; the limits sit
 *   above the slowest by about the runs' spread: cast 12, combat 8.5. (With
 *   a PC game running, a combat read 9.1.) A page busy 5 ms more
 *   on each message read 13.2 and 10.4 and failed both (As built: P11-C6
 *   follow-up). Printed, not enforced, on CI, as the other timings.
 *   ScriptDuration per second is still printed.
 */
const SPEED_BUDGETS = {
  frames: {
    1: { p95: 40, worst: 120, endP95: 40, endWorst: 200 },
    4: { p95: 40, worst: 150, endP95: 67, endWorst: 200 },
  },
  pageMsPerUpdate4x: { combat: 8.5, cast: 12 },
  gameScreenPerUpdate: 2,
  seatPerUpdate: 2,
  idlePaintsPerSecond: 1,
} as const;

type Scene = "idle" | "hover" | "cast" | "combat" | "end";

interface Row {
  scene: Scene;
  cpu: number;
  seconds: number;
  board: number;
  frames: { n: number; p50: number; p95: number; worst: number; worstAt: number };
  scriptMsPerSecond: number;
  taskMsPerSecond: number;
  rendersPerSecond: number;
  commitsPerSecond: number;
  updates: number;
  gameScreenRenders: number;
  seatRenders: number;
  gameScreenPerUpdate: number | null;
  seatPerUpdate: number | null;
  /**
   * P11-C6 follow-up (4x cast and combat): from the CPU profile, the page's
   * own JavaScript per game update -- everything but the test's own, garbage
   * collection included -- and the test's own (pageShare), ms.
   */
  pageMsPerUpdate?: number;
  testMsPerUpdate?: number;
  paintsPerSecond?: { acting: number; waiting: number };
  /**
   * What repainted, when a page did: each Paint's ms from the moment's
   * start and the node Chrome names (CI 9d9b399 failed on 1.5 a second
   * with nothing saying what painted), and the looks still playing on
   * each page as the moment began.
   */
  painters?: { acting: string[]; waiting: string[] };
  playing?: { acting: string[]; waiting: string[] };
}

/**
 * Times [during] on [main]: frames, JavaScript, renders and updates; with
 * [paints], every repaint of both pages (Chrome's trace) as well.
 */
async function measure(
  scene: Scene,
  cpu: number,
  main: Probe,
  during: () => Promise<void>,
  paints?: Probe,
): Promise<Row> {
  const page = main.page;
  // P11-C6 follow-up: the 4x cast and combat are always profiled, for the
  // page's own JavaScript per update (pageShare). Started before the frames
  // are marked, given a moment, and stopped after they are read: a profiler
  // starting stalls the page's next frame (183-367 ms at 4x the first time
  // in a page, measured), which is not the game's (and see warmProfiler).
  const split = cpu === 4 && (scene === "cast" || scene === "combat");
  if (PROFILE || split) {
    await startProfiler(main);
    await page.waitForTimeout(300);
  }
  const mark = await page.evaluate(() => {
    const P = (window as unknown as { __speed: { frames: number[]; commits: number[][] } }).__speed;
    (P as unknown as { walk: boolean }).walk = true;
    return { f: P.frames.length, c: P.commits.length, now: performance.now() };
  });
  const updates0 = main.updates;
  const m0 = await scriptMs(main);
  const traceFile = TRACE
    ? join(OUT, `${cpu}x-${scene}.trace.json`)
    : join(tmpdir(), `proxic-speed-${process.pid}-${Date.now()}.json`);
  if (TRACE) mkdirSync(OUT, { recursive: true });
  if (paints || TRACE)
    await page
      .context()
      .browser()!
      .startTracing(page, {
        path: traceFile,
        categories: ["devtools.timeline", ...(TRACE ? TRACE_CATEGORIES : [])],
      });
  const playing = paints
    ? { acting: await playingNow(page), waiting: await playingNow(paints.page) }
    : undefined;
  await during();
  let painted: { acting: number; waiting: number } | undefined;
  let painters: { acting: string[]; waiting: string[] } | undefined;
  const m1 = await scriptMs(main);
  const got = await page.evaluate((mk) => {
    const P = (window as unknown as { __speed: { frames: number[]; commits: number[][] } }).__speed;
    (P as unknown as { walk: boolean }).walk = false;
    return {
      frames: P.frames.slice(mk.f),
      commits: P.commits.slice(mk.c),
      span: performance.now() - mk.now,
    };
  }, mark);
  let share: Share | undefined;
  if (PROFILE || split) {
    const { profile } = await main.cdp.send("Profiler.stop");
    if (split) share = pageShare(profile);
    if (PROFILE) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `${cpu}x-${scene}.cpuprofile`), JSON.stringify(profile));
    }
  }
  if (TRACE && !paints) await page.context().browser()!.stopTracing();
  if (paints) {
    await page.context().browser()!.stopTracing();
    const trace = JSON.parse(readFileSync(traceFile, "utf8")) as {
      traceEvents: {
        name: string;
        ts?: number;
        args?: { data?: { frame?: string; nodeName?: string } };
      }[];
    };
    if (!TRACE) rmSync(traceFile, { force: true });
    const of = (frame: string) =>
      trace.traceEvents.filter((e) => e.name === "Paint" && e.args?.data?.frame === frame);
    const secs = got.span / 1000;
    painted = {
      acting: r1(of(main.frame).length / secs),
      waiting: r1(of(paints.frame).length / secs),
    };
    // A loop, not Math.min(...): a trace with PROXIC_SPEED_TRACE_CATEGORIES
    // holds more events than a call's arguments may (RangeError, P11-C6).
    const t0 = trace.traceEvents.reduce((m, e) => (e.ts && e.ts < m ? e.ts : m), Infinity);
    const who = (frame: string) =>
      of(frame).map(
        (e) => `${Math.round(((e.ts ?? t0) - t0) / 1000)} ms ${e.args?.data?.nodeName ?? "?"}`,
      );
    painters = { acting: who(main.frame), waiting: who(paints.frame) };
  }
  // The moment as it ends, once it is timed: a screenshot stalls the
  // page's frames (about 100 ms headless), so none is taken while timing.
  await snap(page, `${cpu}x-${scene}`).catch(() => undefined);
  const secs = got.span / 1000;
  const updates = main.updates - updates0;
  const renders = got.commits.reduce((sum, c) => sum + Math.max(0, c[0]!), 0);
  const gameScreen = got.commits.reduce((sum, c) => sum + c[1]!, 0);
  // Per plate: the two plates' renders, over two.
  const seats = got.commits.reduce((sum, c) => sum + c[2]!, 0) / 2;
  const board =
    (await cardCount(boardCards(page, "viewer")).catch(() => 0)) +
    (await cardCount(boardCards(page, "opponent")).catch(() => 0));
  const row: Row = {
    scene,
    cpu,
    seconds: r1(secs),
    board,
    frames: {
      n: got.frames.length,
      p50: r1(percentile(got.frames, 0.5)),
      p95: r1(percentile(got.frames, 0.95)),
      worst: r1(Math.max(0, ...got.frames)),
      // When the slowest frame ended, in ms from the moment's start.
      worstAt: Math.round(
        got.frames
          .slice(0, got.frames.indexOf(Math.max(0, ...got.frames)) + 1)
          .reduce((a, b) => a + b, 0),
      ),
    },
    scriptMsPerSecond: r1(((m1.script - m0.script) * 1000) / secs),
    taskMsPerSecond: r1(((m1.task - m0.task) * 1000) / secs),
    rendersPerSecond: r1(renders / secs),
    commitsPerSecond: r1(got.commits.length / secs),
    updates,
    gameScreenRenders: gameScreen,
    seatRenders: seats,
    gameScreenPerUpdate: updates > 0 ? r1(gameScreen / updates) : null,
    seatPerUpdate: updates > 0 ? r1(seats / updates) : null,
    ...(share
      ? {
          pageMsPerUpdate: r2(share.charged / Math.max(1, updates)),
          testMsPerUpdate: r2(share.test / Math.max(1, updates)),
        }
      : {}),
    ...(painted ? { paintsPerSecond: painted } : {}),
    ...(painters && (painters.acting.length || painters.waiting.length) ? { painters } : {}),
    ...(playing && (playing.acting.length || playing.waiting.length) ? { playing } : {}),
  };
  if (row.painters || row.playing)
    console.log(
      `[speed ${cpu}x] ${scene}: painted ${JSON.stringify(row.painters ?? {})}; ` +
        `playing at the start ${JSON.stringify(row.playing ?? {})}`,
    );
  console.log(
    `[speed ${cpu}x] ${scene}: frames p50 ${row.frames.p50} p95 ${row.frames.p95} worst ${row.frames.worst} (${row.frames.n}); ` +
      `JS ${row.scriptMsPerSecond} ms/s (task ${row.taskMsPerSecond}); renders ${row.rendersPerSecond}/s; ` +
      (share
        ? `page JS ${row.pageMsPerUpdate} ms/update (test ${row.testMsPerUpdate}, other ${r1(share.other)} ms); `
        : "") +
      `updates ${updates}, GameScreen ${gameScreen} (${row.gameScreenPerUpdate}/update), plate ${seats} (${row.seatPerUpdate}/update)` +
      (painted ? `; repaints/s acting ${painted.acting}, waiting ${painted.waiting}` : "") +
      `; table ${board}`,
  );
  return row;
}

/** The looks playing to an end on [page] now (running, not looping): name and element. */
function playingNow(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => {
        const timing = a.effect?.getComputedTiming();
        return a.playState === "running" && timing?.iterations !== Infinity;
      })
      .map((a) => {
        const name =
          (a as unknown as { animationName?: string }).animationName || a.id || a.constructor.name;
        const target = (a.effect as KeyframeEffect | null)?.target;
        const cls = target ? String(target.getAttribute("class") ?? target.tagName) : "?";
        return `${name} on ${cls.slice(0, 60)}`;
      }),
  );
}

async function snap(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

/**
 * Idle is a settled table: match-helpers' settle, by React's commits (the
 * probe's `__speed.lastCommit`), not a DOM observer, which would run during
 * the idle row. Not settled in 15 s: idle is measured anyway, and its row
 * says what played.
 */
async function settled(pages: Page[]) {
  if (!(await settle(pages, { clock: "commits" })))
    console.log("[speed] idle: the pages had not settled in 15 s; measured anyway");
}

/** Starts [p]'s CPU profiler, sampling every 250 us. */
async function startProfiler(p: Probe) {
  await p.cdp.send("Profiler.enable");
  await p.cdp.send("Profiler.setSamplingInterval", { interval: 250 });
  await p.cdp.send("Profiler.start");
}

/**
 * P11-C6 follow-up: a profiler started and stopped once as the game begins,
 * so the first start's stall (the page's code listed for it) lands there and
 * not in a timed moment.
 */
async function warmProfiler(p: Probe) {
  await startProfiler(p);
  await p.page.waitForTimeout(500);
  await p.cdp.send("Profiler.stop");
}

/**
 * P11-C6 follow-up (owner 2026-11-25, "Measure one page"): the game's end as
 * one player sees it. Both players' pages run in this one browser and share
 * its GPU process (spec 0096: at the end the other page's drawing held up this
 * page's frame), while a player's browser draws only their own page. So the
 * other page is paused for the moment and woken only while the bot acts on it
 * ([act]); the boards it is sent, the game's end among them, wait until it is
 * woken after the moment. Paused by the debugger (Debugger.pause): its script,
 * its timers and its frames all stop. Page.setWebLifecycleState "frozen" does
 * nothing to a page that is not hidden, and a headless page is never hidden
 * (measured, P11-C6 follow-up).
 */
async function guestPaused(
  guest: Probe,
  during: (act: (step: () => Promise<void>) => Promise<void>) => Promise<void>,
) {
  const cdp = guest.cdp;
  await cdp.send("Debugger.enable");
  const pause = async () => {
    // A pause takes hold at the page's next script (its frame clock runs
    // every frame); wait for it, so nothing the bot asks is left waiting on it.
    const held = new Promise<void>((done) => cdp.once("Debugger.paused", () => done()));
    await cdp.send("Debugger.pause");
    await Promise.race([held, guest.page.waitForTimeout(2_000)]);
  };
  const resume = () => cdp.send("Debugger.resume").catch(() => undefined);
  await pause();
  try {
    await during(async (step) => {
      await resume();
      try {
        await step();
      } finally {
        await pause();
      }
    });
  } finally {
    await resume();
    await cdp.send("Debugger.disable").catch(() => undefined);
  }
}

// --- F-0095-B: the waiting plate's glow, as it was ------------------------------------------------

async function plateGlowMatches(guest: Page) {
  const plate = guest.locator(".gs-seat.gs-seat-deciding").first();
  await expect(plate, "the guest sees the host's plate glowing").toBeVisible();
  const box = (await plate.boundingBox())!;
  const clip = { x: box.x - 30, y: box.y - 30, width: box.width + 60, height: box.height + 60 };
  const freeze = (t: number) =>
    guest.evaluate((at) => {
      for (const a of document.getAnimations()) {
        // The plate's glow: its own animation (before 0095) or its layers'.
        if ((a.effect as KeyframeEffect | null)?.target?.matches(".gs-seat-deciding")) {
          a.pause();
          a.currentTime = at;
        }
      }
    }, t);
  const shots = async () => {
    const out: string[] = [];
    for (const t of [0, 600, 1200, 1800]) {
      await freeze(t);
      await guest.waitForTimeout(100);
      out.push((await guest.screenshot({ clip })).toString("base64"));
    }
    return out;
  };
  // Only an opacity animates for the glow.
  const props = await guest.evaluate(() => {
    const out: string[] = [];
    for (const a of document.getAnimations()) {
      const effect = a.effect as KeyframeEffect;
      if (!effect.target?.matches(".gs-seat-deciding")) continue;
      const name = (a as unknown as { animationName?: string }).animationName ?? "";
      for (const frame of effect.getKeyframes())
        for (const key of Object.keys(frame))
          if (!["offset", "computedOffset", "easing", "composite"].includes(key))
            out.push(`${name}${effect.pseudoElement ?? ""}:${key}`);
    }
    return [...new Set(out)].sort();
  });
  const now = await shots();
  const style = await guest.addStyleTag({
    content: `
      .gs-seat-deciding::before, .gs-seat-deciding::after { display: none !important; }
      .gs-seat-deciding { animation: gs-deciding-0092 2.4s ease-in-out infinite !important; }
      @keyframes gs-deciding-0092 {
        0%, 100% { box-shadow: 0 0 0 2px rgb(217 178 106 / 85%), 0 0 22px rgb(217 178 106 / 45%); }
        50% { box-shadow: 0 0 0 2px rgb(217 178 106 / 40%), 0 0 8px rgb(217 178 106 / 15%); }
      }`,
  });
  const before = await shots();
  await style.evaluate((el) => (el as HTMLElement).remove());
  // Only the glow's own animations were paused: they go on.
  await guest.evaluate(() => {
    for (const a of document.getAnimations())
      if ((a.effect as KeyframeEffect | null)?.target?.matches(".gs-seat-deciding")) a.play();
  });
  mkdirSync(OUT, { recursive: true });
  [now, before].forEach((list, k) =>
    list.forEach((png, i) =>
      writeFileSync(
        join(OUT, `plate-glow-${k ? "0092" : "0095"}-${i}.png`),
        Buffer.from(png, "base64"),
      ),
    ),
  );
  // The plate's border box in the picture: its 2 px ring lies along it.
  const edge = { x: box.x - clip.x, y: box.y - clip.y, w: box.width, h: box.height };
  const diffs = await guest.evaluate(
    async ([a, b, r]) => {
      const pixels = async (png: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${png}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width };
      };
      // Within 4 px of the plate's edge (the 2 px ring, outside it), or not (the glow).
      const onRing = (x: number, y: number) => {
        const inside = x > r.x - 4 && x < r.x + r.w + 4 && y > r.y - 4 && y < r.y + r.h + 4;
        const deep = x > r.x + 4 && x < r.x + r.w - 4 && y > r.y + 4 && y < r.y + r.h - 4;
        return inside && !deep;
      };
      const out: {
        glow: { mean: number; worst: number };
        ring: { mean: number; worst: number };
      }[] = [];
      for (let i = 0; i < a.length; i++) {
        const [{ data: p, w }, { data: q }] = [await pixels(a[i]!), await pixels(b[i]!)];
        const h = p.length / 4 / w;
        const sum = { glow: 0, ring: 0 };
        const n = { glow: 0, ring: 0 };
        const worst = { glow: 0, ring: 0 };
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const k = (y * w + x) * 4;
            const d = Math.max(
              Math.abs(p[k]! - q[k]!),
              Math.abs(p[k + 1]! - q[k + 1]!),
              Math.abs(p[k + 2]! - q[k + 2]!),
            );
            const where = onRing(x + 0.5, y + 0.5) ? "ring" : "glow";
            sum[where] += d;
            n[where] += 1;
            worst[where] = Math.max(worst[where], d);
          }
        const round = (v: number) => Math.round(v * 100) / 100;
        out.push({
          glow: { mean: round(sum.glow / n.glow), worst: worst.glow },
          ring: { mean: round(sum.ring / n.ring), worst: worst.ring },
        });
      }
      return out;
    },
    [now, before, edge] as const,
  );
  return { props, diffs };
}

// --- the game -------------------------------------------------------------------------------------

async function playAndTime(
  browser: import("@playwright/test").Browser,
  cpu: number,
): Promise<{ rows: Row[]; glow?: Awaited<ReturnType<typeof plateGlowMatches>> }> {
  const options = { viewport: { width: 1920, height: 1080 } };
  const contexts: BrowserContext[] = [
    await browser.newContext(options),
    await browser.newContext(options),
  ];
  for (const c of contexts) await c.addInitScript(RECORDER);
  const [host, guest] = [await contexts[0]!.newPage(), await contexts[1]!.newPage()];
  let hostProbe: Probe | undefined;
  let guestProbe: Probe | undefined;
  countUpdates(host, () => hostProbe);
  countUpdates(guest, () => guestProbe);
  await signIn(host);
  await clearEverything(host);
  await signInAs(guest, secondUser, secondPassword);
  await clearEverything(guest);
  const rows: Row[] = [];
  let glow: Awaited<ReturnType<typeof plateGlowMatches>> | undefined;
  try {
    const deck = await sharedDeck(host, guest, pkg);
    await startAMatch(host, guest, deck);
    hostProbe = await probe(host, cpu);
    if (cpu === 4) await warmProfiler(hostProbe);
    guestProbe = await probe(guest, 1);
    const done = new Set<Scene>();
    const deadline = Date.now() + 1_200_000;
    let ended = false;
    const watch = watchGame([host, guest], () => [...done], { stuckMs: 90_000 });
    while (!ended && Date.now() < deadline) {
      await watch.check();
      const total =
        (await cardCount(boardCards(host, "viewer")).catch(() => 0)) +
        (await cardCount(boardCards(host, "opponent")).catch(() => 0));
      if (total >= BIG && !done.has("cast") && (await hostsMove(host))) {
        const spell = castable(host);
        if ((await spell.count()) > 0) {
          await host.mouse.move(960, 500);
          await host.waitForTimeout(1500);
          // Idle is a settled table: both pages done drawing what came last
          // (CI 9d9b399: 1.5 repaints a second on the waiting page, after a
          // spell the host had just cast -- see settle()).
          await settled([host, guest]);
          rows.push(
            await measure("idle", cpu, hostProbe, () => host.waitForTimeout(6000), guestProbe),
          );
          if (cpu === 1) glow = await plateGlowMatches(guest);
          rows.push(await measure("hover", cpu, hostProbe, () => hoverHand(host)));
          await host.mouse.move(960, 500);
          rows.push(
            await measure("cast", cpu, hostProbe, async () => {
              await clickNow(spell);
              await host.waitForTimeout(150);
              const popup = host.locator(".gs-popup .gs-option");
              if ((await popup.count()) > 0) await clickNow(popup);
              await drive([guest, host], 6000);
            }),
          );
          done.add("idle").add("hover").add("cast");
          continue;
        }
      }
      const kind = await matchPanel(host)
        .locator(".gs-combat")
        .getAttribute("data-kind", { timeout: 200 })
        .catch(() => null);
      if (done.has("cast") && kind === "declareAttackers") {
        const life = await theirLife(host);
        const power = (await attackers(host)).reduce((s, a) => s + a.power, 0);
        if (!done.has("combat")) {
          rows.push(
            await measure("combat", cpu, hostProbe, async () => {
              if (await attackLeavingThemAlive(host, life).catch(() => false))
                await clickNow(matchPanel(host).locator("button.gs-act-combat"));
              await drive([guest, host], 9000);
            }),
          );
          done.add("combat");
          continue;
        }
        if (power >= life) {
          rows.push(
            await measure("end", cpu, hostProbe, () =>
              guestPaused(guestProbe!, async (act) => {
                if (await attackWithAll(host).catch(() => false))
                  await clickNow(matchPanel(host).locator("button.gs-act-combat"));
                const end = Date.now() + 20_000;
                while (Date.now() < end && !(await over(host))) {
                  await act(() => step(guest, false));
                  await step(host, false);
                  await host.waitForTimeout(150);
                }
                await host.waitForTimeout(4000);
              }),
            ),
          );
          done.add("end");
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
    expect([...done].sort(), "every moment was timed").toEqual(
      ["cast", "combat", "end", "hover", "idle"].sort(),
    );
    return { rows, ...(glow ? { glow } : {}) };
  } finally {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      join(OUT, `speed-${cpu}x.json`),
      JSON.stringify(
        { machine: `${cpus()[0]?.model ?? "?"} x${cpus().length}`, cpu, rows, glow },
        null,
        1,
      ),
    );
    await clearEverything(host).catch(() => undefined);
    await clearEverything(guest).catch(() => undefined);
    for (const c of contexts) await c.close();
  }
}

/** Every budget this run missed, in words. */
// Timings on CI's shared machines swing run to run (frames 33-67 ms and
// JavaScript 130-184 ms/s at 4x on the same commit, 28e07b8 and 726c14d), so
// there the frame and JavaScript budgets are printed, not enforced; they are
// enforced on a fixed machine (the once-per-release local run, TEST-013.2).
// The counts -- re-renders per update and idle repaints -- do not depend on
// the machine and are enforced everywhere.
const TIMINGS_ENFORCED = !process.env.CI;

function misses(rows: Row[], cpu: 1 | 4): string[] {
  const out: string[] = [];
  const timed: string[] = [];
  const frames = SPEED_BUDGETS.frames[cpu];
  for (const row of rows) {
    const at = `${cpu}x ${row.scene}`;
    const p95 = row.scene === "end" ? frames.endP95 : frames.p95;
    if (row.frames.p95 > p95) timed.push(`${at}: frame p95 ${row.frames.p95} > ${p95}`);
    const worst = row.scene === "end" ? frames.endWorst : frames.worst;
    if (row.frames.worst > worst) timed.push(`${at}: slowest frame ${row.frames.worst} > ${worst}`);
    if (cpu === 4 && (row.scene === "combat" || row.scene === "cast")) {
      const limit = SPEED_BUDGETS.pageMsPerUpdate4x[row.scene];
      const ms = row.pageMsPerUpdate;
      if (ms === undefined) timed.push(`${at}: the page's JavaScript per update was not measured`);
      else if (ms > limit)
        timed.push(`${at}: the page's JavaScript ${ms} ms per update > ${limit}`);
    }
    // Re-renders per game update: the moments the game sends updates in.
    if (row.scene === "cast" || row.scene === "combat" || row.scene === "end") {
      const updates = Math.max(1, row.updates);
      if (row.gameScreenRenders / updates > SPEED_BUDGETS.gameScreenPerUpdate)
        out.push(
          `${at}: GameScreen drew ${row.gameScreenRenders} times for ${row.updates} updates`,
        );
    }
    // A plate's own renders, outside a life count (no life changes in a cast).
    if (row.scene === "cast") {
      const updates = Math.max(1, row.updates);
      if (row.seatRenders / updates > SPEED_BUDGETS.seatPerUpdate)
        out.push(`${at}: each plate drew ${row.seatRenders} times for ${row.updates} updates`);
    }
    if (row.paintsPerSecond) {
      const { acting, waiting } = row.paintsPerSecond;
      if (acting >= SPEED_BUDGETS.idlePaintsPerSecond)
        out.push(`${at}: the acting player's page repainted ${acting} times a second`);
      if (waiting >= SPEED_BUDGETS.idlePaintsPerSecond)
        out.push(`${at}: the waiting player's page repainted ${waiting} times a second`);
    }
  }
  if (TIMINGS_ENFORCED) return [...timed, ...out];
  for (const t of timed) console.log(`[speed] over budget on CI (not enforced): ${t}`);
  return out;
}

// A trace records the page after every step the test takes, in the page:
// that would be timed as the game's own work.
test.use({ trace: "off", screenshot: "off" });

test.describe("a real game's speed (spec 0095)", () => {
  test.describe.configure({ timeout: 25 * 60_000 });
  test.beforeEach(() => {
    test.skip(!existsSync(pkg), "no green deck package (CI builds it)");
  });

  test("F-0095-A, F-0095-B · at real speed: frames, re-renders, idle repaints; the plate's glow as it was", async ({
    browser,
  }) => {
    const { rows, glow } = await playAndTime(browser, 1);
    expect(misses(rows, 1)).toEqual([]);
    expect(glow, "the waiting plate's glow was compared").toBeDefined();
    console.log(`[speed] plate glow ${JSON.stringify(glow)}`);
    expect(glow!.props).toEqual([
      "gs-deciding-soft::after:opacity",
      "gs-deciding-strong::before:opacity",
    ]);
    // As F-0090-B: the glow within a few levels of 255; along the edge, where
    // two still shadows fading into each other meet the old animated one's
    // in-between looks, the ring on average.
    for (const d of glow!.diffs) {
      expect(d.glow.mean).toBeLessThan(3);
      expect(d.glow.worst).toBeLessThanOrEqual(24);
      expect(d.ring.mean).toBeLessThan(30);
    }
  });

  test("F-0095-A · with the CPU slowed 4x: frames, JavaScript, re-renders, idle repaints", async ({
    browser,
  }) => {
    const { rows } = await playAndTime(browser, 4);
    expect(misses(rows, 4)).toEqual([]);
  });
});
