// Spec 0090 -- speed checks for Phase 10's animations.
//
//   npx playwright test e2e/bench-scenes.spec.ts [--headed]
//   [PROXIC_BENCH_OUT=file.json]  every frame time, with the machine named
//   [PROXIC_BENCH_CPU=4]          the page's CPU slowed that many times (CDP),
//                                 as a slower laptop would run it
//
// F-0090-A: each of the speed test's Phase 10 scenes (/dev/bench?scene=,
// benchScenes.ts) is played RUNS times at 1920x1080 and its frame intervals
// recorded; the slowest are held to the scene's budget (benchBudgets.ts).
// It runs in the browser suite, so CI's machine is held to it on every run
// (headless there; the budget is set loose enough for that, see the spec's
// As built). Nothing polls the page while a scene plays (polling is
// main-thread work): the spec waits out the scene, then reads the result.
//
// Item 4, on the same scenes: a key pressed while the moment plays hurries
// every animation then running to its end (A-00: about a tenth of a second),
// and with reduce motion the moment plays nothing that lasts or loops.
//
// F-0090-B: the glow is the same, by screenshot -- the board's breath now
// against the breath as it was before 0090 (its box-shadow keyframes, put
// back on the same cards), at the same moments of the breath -- and only an
// opacity animates for it. F-0090-C: flyers in step above 12, paused while
// the tab is hidden.

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cpus, totalmem } from "node:os";
import { BUDGETS, SCENES, type SceneName } from "../src/battlefield/benchBudgets";
import { signIn } from "./helpers";

interface Bench {
  ready: boolean;
  sceneMs?: number;
  scene?: { name: string; frames: number[]; longTasks: number; ms: number };
}

const RUNS = 3;
/** F-0090-B: how near the glow must look to the old one (levels of 255). */
const GLOW = { mean: 3, worst: 24 };
const RING = { mean: 30 };
const CPU = Number(process.env.PROXIC_BENCH_CPU ?? 1);
// (benchmark.spec.ts declares window.__bench with its own shape: read it as ours.)
const read = (page: Page) =>
  page.evaluate(() => (window as unknown as { __bench?: Bench }).__bench);

async function until(page: Page, ok: (b: Bench) => boolean, timeout = 60_000) {
  await expect
    .poll(
      async () => {
        const b = await read(page);
        return b ? ok(b) : false;
      },
      { timeout },
    )
    .toBe(true);
  return (await read(page))!;
}

/** The scene's first board drawn and settled; returns how long it records. */
async function showScene(page: Page, scene: SceneName): Promise<number> {
  await page.goto(`/dev/bench?scene=${scene}`);
  const ready = await until(page, (b) => b.ready);
  await page.getByRole("button", { name: "Show board" }).click();
  await page.locator(".bf-card").first().waitFor();
  await page.waitForTimeout(800); // its own entrance played out
  return ready.sceneMs ?? 0;
}

const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))]! : NaN;
};

const report: Record<string, unknown>[] = [];

test.describe("Phase 10's moments, timed (spec 0090)", () => {
  test.describe.configure({ timeout: 10 * 60_000 });
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await signIn(page);
  });

  for (const scene of SCENES) {
    test(`F-0090-A · ${scene}: its slowest frames within the budget`, async ({ page }) => {
      const frames: number[] = [];
      let longTasks = 0;
      // The page's main-thread work while it plays (style, layout, paint,
      // script), in ms per second of the moment: what a repainted shadow
      // costs even when the frames still keep up.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
      const busy = async () => {
        const { metrics } = await cdp.send("Performance.getMetrics");
        const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
        return {
          task: get("TaskDuration"),
          style: get("RecalcStyleDuration"),
          at: get("Timestamp"),
        };
      };
      const work: number[] = [];
      for (let run = 0; run < RUNS; run++) {
        const ms = await showScene(page, scene);
        const from = await busy();
        await page.getByRole("button", { name: "Play" }).click();
        await page.waitForTimeout(ms + 300); // hands off while it plays
        const to = await busy();
        work.push((1000 * (to.task - from.task)) / (to.at - from.at));
        const done = await until(page, (b) => b.scene?.name === scene);
        frames.push(...done.scene!.frames);
        longTasks += done.scene!.longTasks;
      }
      const row = {
        scene,
        frames: frames.length,
        p50: Number(percentile(frames, 0.5).toFixed(1)),
        p95: Number(percentile(frames, 0.95).toFixed(1)),
        worst: Number(Math.max(...frames).toFixed(1)),
        over25ms: frames.filter((f) => f > 25).length,
        over50ms: frames.filter((f) => f > 50).length,
        longTasks,
        mainThreadMsPerS: work.map((w) => Math.round(w)),
        budget: BUDGETS[scene],
        all: frames.map((f) => Number(f.toFixed(1))),
      };
      report.push(row);
      console.log(JSON.stringify({ ...row, all: undefined }));
      // A scene that drew nothing would pass any budget.
      expect(frames.length).toBeGreaterThan(30);
      expect(row.p95, `${scene}: 95th-percentile frame`).toBeLessThanOrEqual(BUDGETS[scene].p95);
      expect(row.worst, `${scene}: slowest frame`).toBeLessThanOrEqual(BUDGETS[scene].worst);
    });
  }

  test("A-00 · a key hurries what each moment is playing; reduce motion plays nothing that lasts", async ({
    page,
  }) => {
    // The moment's animations then running (finite ones: a glow or a hover
    // loops, and is left alone), and after a key, how long each has left.
    const running = () =>
      page.evaluate(() => {
        const root = document.querySelector(".bf-board")!;
        const list = root
          .getAnimations({ subtree: true })
          .filter(
            (a) =>
              a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity,
          );
        (window as unknown as { __hurried: Animation[] }).__hurried = list;
        return list.length;
      });
    const left = () =>
      page.evaluate(() =>
        (window as unknown as { __hurried: Animation[] }).__hurried
          .filter((a) => a.playState === "running")
          .map((a) => {
            const t = a.effect!.getComputedTiming();
            return (Number(t.endTime) - Number(a.currentTime ?? 0)) / Math.abs(a.playbackRate || 1);
          }),
      );
    // When in each moment to press: while its busiest part plays.
    const pressAt: Record<SceneName, number> = {
      wipe: 150,
      tokens: 700,
      combat: 1200,
      flyers: 0,
      wash: 300,
      army: 0,
      storm: 900,
      reports: 2500,
    };
    const hurried: Record<string, unknown> = {};
    for (const scene of SCENES) {
      if (pressAt[scene] === 0) continue; // nothing in it ends: it only loops
      await showScene(page, scene);
      await page.getByRole("button", { name: "Play" }).click();
      await page.waitForTimeout(pressAt[scene]);
      const n = await running();
      expect(n, `${scene}: something is moving when the key is pressed`).toBeGreaterThan(0);
      await page.keyboard.press("Shift");
      await page.waitForTimeout(160);
      const still = await left();
      hurried[scene] = { moving: n, stillRunningAfter160ms: still.length };
      // Each finished (or within a frame of it) a tenth of a second later.
      expect(
        still.filter((ms) => ms > 20),
        `${scene}: animations a key did not hurry`,
      ).toEqual([]);
    }
    console.log(JSON.stringify({ hurried }));

    await page.emulateMedia({ reducedMotion: "reduce" });
    const calm: Record<string, unknown> = {};
    for (const scene of SCENES) {
      const ms = await showScene(page, scene);
      await page.getByRole("button", { name: "Play" }).click();
      // Every animation the moment starts, looked at as it plays.
      let longest = 0;
      const slow = new Set<string>();
      let loops = 0;
      for (let t = 0; t < ms; t += 200) {
        const seen = await page.evaluate(() =>
          document
            .querySelector(".bf-board")!
            .getAnimations({ subtree: true })
            .map((a) => {
              const t = a.effect!.getComputedTiming();
              // Whether it moves anything: a property besides opacity that
              // changes over it (a number that stays put and fades does not).
              const frames = (a.effect as KeyframeEffect).getKeyframes();
              const moves = frames.some((f) =>
                Object.keys(f).some(
                  (k) =>
                    !["offset", "computedOffset", "easing", "composite", "opacity"].includes(k) &&
                    frames.some((g) => g[k] !== f[k]),
                ),
              );
              return {
                loops: t.iterations === Infinity,
                ms: moves ? Number(t.activeDuration) : 0,
                what:
                  (a as unknown as { animationName?: string }).animationName ??
                  (a.effect as KeyframeEffect).target?.className ??
                  "",
              };
            }),
        );
        loops += seen.filter((s) => s.loops).length;
        for (const s of seen) if (!s.loops) longest = Math.max(longest, s.ms);
        for (const s of seen) if (s.loops || s.ms > 300) slow.add(`${s.what} ${s.ms}ms`);
        await page.waitForTimeout(200);
      }
      calm[scene] = { loops, longestMs: longest, slow: [...slow] };
      expect(loops, `${scene}: a looping animation with reduce motion`).toBe(0);
      // Reduce motion: cards go straight there, with a short fade at most;
      // nothing moves for longer (what only fades, a damage number held
      // still, may stay: it is not motion).
      expect(
        longest,
        `${scene}: the longest animation with reduce motion: ${[...slow].join("; ")}`,
      ).toBeLessThanOrEqual(300);
    }
    console.log(JSON.stringify({ reduceMotion: calm }));
    report.push({ hurried, reduceMotion: calm });
  });

  test("F-0090-B · the glow looks as it did, and only an opacity animates", async ({ page }) => {
    await showScene(page, "army");
    await page.getByRole("button", { name: "Play" }).click();
    await page.locator(".bf-card.bf-choosable").first().waitFor();
    await page.waitForTimeout(500);
    // Only opacity animates for the glow: every animation on a choosable
    // card that is not its hover, and on its glow layer.
    const props = await page.evaluate(() => {
      const out: string[] = [];
      for (const a of document.getAnimations()) {
        const effect = a.effect as KeyframeEffect;
        const target = effect.target;
        if (!target) continue;
        const name = (a as unknown as { animationName?: string }).animationName ?? "";
        const glowing = target.matches(".bf-breath, .bf-choosable");
        if (!glowing || name.startsWith("bf-fly")) continue;
        for (const frame of effect.getKeyframes())
          for (const key of Object.keys(frame))
            if (!["offset", "computedOffset", "easing", "composite"].includes(key))
              out.push(`${name}${effect.pseudoElement ?? ""}:${key}`);
      }
      return [...new Set(out)].sort();
    });
    expect(props).toEqual(["gs-breathe-bright::after:opacity", "gs-breathe-dim::before:opacity"]);

    // The same cards at the same moments of the breath (0, a quarter, the
    // half, three quarters), drawn the new way, then the 0089 way: the old
    // keyframes put back on the cards and their glow layers hidden.
    const card = page.locator('.bf-card.bf-choosable:not(.bf-fly)[data-zone^="viewer"]').first();
    const box = (await card.boundingBox())!;
    const clip = { x: box.x - 30, y: box.y - 30, width: box.width + 60, height: box.height + 60 };
    const freeze = (t: number) =>
      page.evaluate((at) => {
        for (const a of document.getAnimations()) {
          const name = (a as unknown as { animationName?: string }).animationName ?? "";
          if (name.startsWith("gs-breathe")) {
            a.pause();
            a.currentTime = at;
          } else if (name.startsWith("bf-fly")) a.pause();
        }
      }, t);
    const shots = async () => {
      const out: string[] = [];
      for (const t of [0, 450, 900, 1350]) {
        await freeze(t);
        await page.waitForTimeout(100);
        out.push((await page.screenshot({ clip })).toString("base64"));
      }
      return out;
    };
    const now = await shots();
    await page.addStyleTag({
      content: `
        .bf-card:not(.bf-fly) + .bf-breath { display: none !important; }
        .bf-card.bf-choosable.bf-breathes:not(.bf-fly) { animation: gs-breathe-0089 1.8s ease-in-out infinite !important; }
        @keyframes gs-breathe-0089 {
          0%, 100% { box-shadow: 0 0 0 1.5px rgb(233 194 122 / 85%), 0 0 6px 1px rgb(255 205 110 / 35%), 0 4px 10px rgb(0 0 0 / 45%); }
          50% { box-shadow: 0 0 0 1.5px #ffd98a, 0 0 18px 5px rgb(255 205 110 / 75%), 0 4px 10px rgb(0 0 0 / 45%); }
        }`,
    });
    const before = await shots();
    if (process.env.PROXIC_GLOW_SHOTS) {
      mkdirSync(process.env.PROXIC_GLOW_SHOTS, { recursive: true });
      [now, before].forEach((list, k) =>
        list.forEach((png, i) =>
          writeFileSync(
            join(process.env.PROXIC_GLOW_SHOTS!, `${k ? "0089" : "0090"}-${i}.png`),
            Buffer.from(png, "base64"),
          ),
        ),
      );
    }
    // Every glowing card's edge in the picture: the 1.5 px ring lies along it.
    const edges = await page.evaluate(
      (c) =>
        [...document.querySelectorAll(".bf-card.bf-breathes")].map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x - c.x, y: r.y - c.y, w: r.width, h: r.height };
        }),
      clip,
    );
    const diffs = await page.evaluate(
      async ([a, b, rects]) => {
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
        // Within 2.5 px of a glowing card's edge (the ring), or not (the glow).
        const onRing = (x: number, y: number) =>
          rects.some((r) => {
            const inside =
              x > r.x - 2.5 && x < r.x + r.w + 2.5 && y > r.y - 2.5 && y < r.y + r.h + 2.5;
            const deep =
              x > r.x + 2.5 && x < r.x + r.w - 2.5 && y > r.y + 2.5 && y < r.y + r.h - 2.5;
            return inside && !deep;
          });
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
          out.push({
            glow: { mean: sum.glow / n.glow, worst: worst.glow },
            ring: { mean: sum.ring / n.ring, worst: worst.ring },
          });
        }
        return out;
      },
      [now, before, edges] as const,
    );
    console.log(JSON.stringify({ glowCompare: diffs }));
    report.push({ glowCompare: diffs });
    for (const d of diffs) {
      // The glow, everywhere but along the card's edge: the same within a
      // few levels of 255 (the cross-fade of its two looks against the old
      // shadow's own blend between them).
      expect(d.glow.mean, "the glow").toBeLessThan(GLOW.mean);
      expect(d.glow.worst, "the glow").toBeLessThanOrEqual(GLOW.worst);
      // The 1.5 px ring along the edge: the same line, anti-aliased on its
      // own layer (about half a pixel's difference in where it fades).
      expect(d.ring.mean, "the ring").toBeLessThan(RING.mean);
    }
  });

  test("F-0090-C · 20 flyers bob in step, and not at all while the tab is hidden", async ({
    page,
  }) => {
    await showScene(page, "flyers");
    const phases = () =>
      page.evaluate(() =>
        document
          .querySelector(".bf-board")!
          .getAnimations({ subtree: true })
          .filter((a) =>
            ["bf-fly", "bf-fly-bob"].includes(
              (a as unknown as { animationName?: string }).animationName ?? "",
            ),
          )
          .map((a) => ({
            state: a.playState,
            // Where in its 5 s bob it is, in ms (its own offset counted).
            at: Math.round(Number(a.effect!.getComputedTiming().progress) * 5000),
          })),
      );
    const running = await phases();
    expect(running.length).toBeGreaterThanOrEqual(20);
    // All at one point of the bob (within a frame).
    expect(
      Math.max(...running.map((p) => p.at)) - Math.min(...running.map((p) => p.at)),
    ).toBeLessThan(20);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect((await phases()).every((p) => p.state === "paused")).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const back = await phases();
    expect(back.every((p) => p.state === "running")).toBe(true);
    expect(Math.max(...back.map((p) => p.at)) - Math.min(...back.map((p) => p.at))).toBeLessThan(
      20,
    );
  });

  test("F-0108-B · a flyer's tab and glow keep their place on it through a bob, lit mid-bob", async ({
    page,
  }) => {
    const shots = process.env.PROXIC_SHOTS ?? "test-results/seen";
    mkdirSync(shots, { recursive: true });
    await showScene(page, "flyer-tab");
    const cdp = await page.context().newCDPSession(page);
    /** Each element's four drawn corners (CDP's content quads: rotation and all), in one go. */
    const corners = async (selectors: string[]) => {
      const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
      const out: number[][] = [];
      for (const selector of selectors) {
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
        const { quads } = await cdp.send("DOM.getContentQuads", { nodeId });
        out.push(quads[0]!);
      }
      return out;
    };
    /** A point in the card's own frame: along its top edge (u) and down its left edge (v). */
    const local = (card: number[], x: number, y: number) => {
      const [ox, oy, tx, ty] = card as [number, number, number, number];
      const lx = card[6]! - ox;
      const ly = card[7]! - oy;
      const top = Math.hypot(tx - ox, ty - oy);
      const left = Math.hypot(lx, ly);
      return {
        u: ((x - ox) * (tx - ox) + (y - oy) * (ty - oy)) / top,
        v: ((x - ox) * lx + (y - oy) * ly) / left,
      };
    };
    const CARD = 'button.bf-card[data-object-id="card:300"]';
    const TAB = 'button.bf-tag[data-object-id="card:301"]';
    const GLOW = `${CARD} + .bf-breath`;
    await page.getByRole("button", { name: "Play" }).click();
    // Lit part way through a bob: wait for the glow (a state), then sample.
    await expect(page.locator(GLOW)).toHaveCount(1, { timeout: 10_000 });
    const samples: {
      cardY: number;
      tab: { u: number; v: number };
      glow: { u: number; v: number };
    }[] = [];
    for (let i = 0; i < 10; i++) {
      const [card, tab, glow] = await corners([CARD, TAB, GLOW]);
      samples.push({
        cardY: card![1]!,
        tab: local(card!, tab![0]!, tab![1]!),
        glow: local(card!, glow![0]!, glow![1]!),
      });
      if (i % 3 === 0) await page.screenshot({ path: join(shots, `0108-flyer-tab-${i}.png`) });
      // Ten looks spread over one 5 s bob (not a frame's wait: the bob is slow).
      await page.waitForTimeout(450);
    }
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const seen = {
      cardMoved: spread(samples.map((s) => s.cardY)),
      tabU: spread(samples.map((s) => s.tab.u)),
      tabV: spread(samples.map((s) => s.tab.v)),
      glowU: spread(samples.map((s) => s.glow.u)),
      glowV: spread(samples.map((s) => s.glow.v)),
    };
    console.log(JSON.stringify({ flyerTab: seen }));
    report.push({ flyerTab: seen });
    // It did bob (or nothing was measured).
    expect(seen.cardMoved, "the flyer bobbed while it was measured").toBeGreaterThan(2);
    for (const [k, v] of Object.entries(seen))
      if (k !== "cardMoved")
        expect(v, `${k}: within 1 px of its place on the card`).toBeLessThan(1);
  });

  test.afterAll(({ browserName }) => {
    if (!process.env.PROXIC_BENCH_OUT) return;
    writeFileSync(
      process.env.PROXIC_BENCH_OUT,
      JSON.stringify(
        {
          measured: new Date().toISOString(),
          machine: {
            cpu: cpus()[0]?.model,
            cores: cpus().length,
            memoryGB: Math.round(totalmem() / 1e9),
          },
          browser: `${browserName} (${process.env.PROXIC_E2E_CHANNEL ?? "msedge"}), ${process.env.PROXIC_BENCH_WINDOW ?? "headless"}`,
          viewport: "1920x1080",
          cpuSlowedBy: CPU,
          runs: RUNS,
          results: report,
        },
        null,
        2,
      ) + "\n",
    );
  });
});
