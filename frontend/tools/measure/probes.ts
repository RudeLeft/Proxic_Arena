// The redraw probes of the measuring kit (PHASE_11 P11-C1).
//
// One `Timer` per measured page: Chrome's own account of a stretch of time,
// cut into what the page's code did and what the test did.
//
// - JavaScript: CDP `Performance.getMetrics` ScriptDuration (all of it, as
//   match-speed reads it), and a CPU profile sampled every 200 us whose
//   samples are split by their stack: a stack with a frame of the app's own
//   bundle (`/assets/`) is the page's ("app"); garbage collection is its own
//   line ("gc"); every other stack with JavaScript in it is the test's
//   (Playwright's injected script answering locators, `page.evaluate`).
// - Style and layout: Chrome's trace (`UpdateLayoutTree`, `Layout`) for the
//   page's main frame. A layout forced from JavaScript carries its stack;
//   forced by a stack with no app frame, it is the test's.
// - Paints: the trace's `Paint` events of the page's frame: how many, their
//   time, and the area of their clips inside the window. Chrome's clip is the
//   paint layer's (a composited layer's is unbounded, counted as the whole
//   window), not the damaged rectangle: a coarse area, for before/after on
//   the same scene. The damaged area itself needs the trace's invalidation
//   tracking, which P11-C5 adds.
// - Frames: requestAnimationFrame intervals and React commits, from
//   speed-kit's RECORDER (put in the page before its scripts).
//
// Chromium only (CDP). The page is never polled by the timer itself.

import type { CDPSession, Page } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A frame of the app's own code: the built bundle is served from /assets/. */
const APP_FRAME = /\/assets\/[^/]+\.js/;

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string };
  children?: number[];
}
interface Profile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
}

interface TraceEvent {
  name: string;
  ph?: string;
  ts?: number;
  dur?: number;
  args?: {
    data?: { frame?: string; clip?: number[]; nodeName?: string };
    beginData?: { frame?: string; stackTrace?: { url?: string }[] };
  };
}

export interface Took {
  /** Wall time of the stretch, ms. */
  ms: number;
  scriptMs: number;
  appMs: number;
  testMs: number;
  gcMs: number;
  styleMs: number;
  layoutMs: number;
  /** Style and layout forced by the test's own JavaScript (inside the two above). */
  testLayoutMs: number;
  paints: number;
  paintMs: number;
  /** Painted area, thousands of CSS px squared: each clip quad's bounds inside the window, summed. */
  paintKpx: number;
  frames: number[];
  /** Each commit: [components rendered, GameScreen among them (0/1), plates among them]. */
  commits: number[][];
}

/** The area of a quad's bounding box inside a [w] x [h] window. */
const clippedArea = (q: number[], w: number, h: number) => {
  const xs = [q[0]!, q[2]!, q[4]!, q[6]!].map((x) => Math.min(w, Math.max(0, x)));
  const ys = [q[1]!, q[3]!, q[5]!, q[7]!].map((y) => Math.min(h, Math.max(0, y)));
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

/** Split a CPU profile's sampled time into the page's, the test's and GC. */
export function attribute(profile: Profile): { app: number; test: number; gc: number } {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const kind = new Map<number, "app" | "test" | "gc" | "none">();
  const classify = (id: number): "app" | "test" | "gc" | "none" => {
    const known = kind.get(id);
    if (known) return known;
    const leaf = byId.get(id)!;
    let k: "app" | "test" | "gc" | "none" = "none";
    if (leaf.callFrame.functionName === "(garbage collector)") k = "gc";
    else {
      let js = false;
      for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
        const f = byId.get(at)!.callFrame;
        if (APP_FRAME.test(f.url)) {
          k = "app";
          break;
        }
        if (!f.functionName.startsWith("(") || f.url) js = true;
      }
      if (k === "none" && js) k = "test";
    }
    kind.set(id, k);
    return k;
  };
  const out = { app: 0, test: 0, gc: 0 };
  profile.samples.forEach((id, i) => {
    const k = classify(id);
    // timeDeltas[i] is the time before sample i; the next delta is this sample's span.
    const dt = (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i] ?? 0) / 1000;
    if (k !== "none") out[k] += dt;
  });
  return out;
}

export interface Timer {
  page: Page;
  cdp: CDPSession;
  frame: string;
  cpu: number;
  /** Times [during]: everything in `Took`, for this page. */
  time(during: () => Promise<void>): Promise<Took>;
}

export async function timer(page: Page, cpu: number): Promise<Timer> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  const { frameTree } = await cdp.send("Page.getFrameTree");
  const frame = frameTree.frame.id;
  const script = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    return metrics.find((m) => m.name === "ScriptDuration")?.value ?? 0;
  };
  return {
    page,
    cdp,
    frame,
    cpu,
    async time(during) {
      const browser = page.context().browser()!;
      const file = join(tmpdir(), `proxic-measure-${process.pid}-${Date.now()}.json`);
      const mark = await page.evaluate(() => {
        const P = (window as unknown as { __speed: { frames: number[]; commits: number[][] } })
          .__speed;
        (P as unknown as { walk: boolean }).walk = true;
        return { f: P.frames.length, c: P.commits.length, now: performance.now() };
      });
      await browser.startTracing(page, { path: file, categories: ["devtools.timeline"] });
      const s0 = await script();
      await cdp.send("Profiler.start");
      await during();
      const { profile } = (await cdp.send("Profiler.stop")) as { profile: Profile };
      const s1 = await script();
      const got = await page.evaluate((mk) => {
        const P = (window as unknown as { __speed: { frames: number[]; commits: number[][] } })
          .__speed;
        (P as unknown as { walk: boolean }).walk = false;
        return {
          frames: P.frames.slice(mk.f),
          commits: P.commits.slice(mk.c),
          span: performance.now() - mk.now,
        };
      }, mark);
      await browser.stopTracing();
      const trace = JSON.parse(readFileSync(file, "utf8")) as { traceEvents: TraceEvent[] };
      // PROXIC_MEASURE_TRACES=<folder> keeps each stretch's trace there.
      const keep = process.env.PROXIC_MEASURE_TRACES;
      if (keep) {
        mkdirSync(keep, { recursive: true });
        copyFileSync(file, join(keep, `trace-${cpu}x-${Date.now()}.json`));
      }
      rmSync(file, { force: true });
      let styleMs = 0;
      let layoutMs = 0;
      let testLayoutMs = 0;
      let paints = 0;
      let paintMs = 0;
      let paintPx = 0;
      const view = page.viewportSize() ?? { width: 1920, height: 1080 };
      for (const e of trace.traceEvents) {
        if (e.name === "UpdateLayoutTree" || e.name === "Layout") {
          if (e.ph !== "X" || e.args?.beginData?.frame !== frame) continue;
          const ms = (e.dur ?? 0) / 1000;
          if (e.name === "Layout") layoutMs += ms;
          else styleMs += ms;
          const stack = e.args.beginData.stackTrace;
          if (stack?.length && !stack.some((f) => APP_FRAME.test(f.url ?? ""))) testLayoutMs += ms;
        } else if (e.name === "Paint" && e.args?.data?.frame === frame) {
          paints++;
          paintMs += (e.dur ?? 0) / 1000;
          const clip = e.args.data.clip;
          if (clip?.length === 8) paintPx += clippedArea(clip, view.width, view.height);
        }
      }
      const split = attribute(profile);
      return {
        ms: got.span,
        scriptMs: (s1 - s0) * 1000,
        appMs: split.app,
        testMs: split.test,
        gcMs: split.gc,
        styleMs,
        layoutMs,
        testLayoutMs,
        paints,
        paintMs,
        paintKpx: paintPx / 1000,
        frames: got.frames,
        commits: got.commits,
      };
    },
  };
}

export const percentile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

/** One measured moment, per update: the row the result file holds. */
export function perUpdate(took: Took, updates: number): Record<string, number> {
  const n = Math.max(1, updates);
  const renders = took.commits.reduce((s, c) => s + Math.max(0, c[0]!), 0);
  const game = took.commits.reduce((s, c) => s + c[1]!, 0);
  const plates = took.commits.reduce((s, c) => s + c[2]!, 0) / 2;
  return {
    updates,
    seconds: r2(took.ms / 1000),
    rendersPerUpdate: r2(renders / n),
    gameScreenPerUpdate: r2(game / n),
    platePerUpdate: r2(plates / n),
    commitsPerUpdate: r2(took.commits.length / n),
    appMsPerUpdate: r2(took.appMs / n),
    scriptMsPerUpdate: r2(took.scriptMs / n),
    testMsPerUpdate: r2(took.testMs / n),
    gcMsPerUpdate: r2(took.gcMs / n),
    styleMsPerUpdate: r2(took.styleMs / n),
    layoutMsPerUpdate: r2(took.layoutMs / n),
    testLayoutMsPerUpdate: r2(took.testLayoutMs / n),
    paintsPerUpdate: r2(took.paints / n),
    paintMsPerUpdate: r2(took.paintMs / n),
    paintKpxPerUpdate: r2(took.paintKpx / n),
    frameP95: r2(percentile(took.frames, 0.95)),
    frameWorst: r2(Math.max(0, ...took.frames)),
    // The old per-second figures, beside the new ones, for match-speed's rows.
    scriptMsPerSecond: r2((took.scriptMs * 1000) / Math.max(1, took.ms)),
    appMsPerSecond: r2((took.appMs * 1000) / Math.max(1, took.ms)),
  };
}
