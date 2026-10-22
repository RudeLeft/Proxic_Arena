// The performance budget — BATTLEFIELD_RENDERING.md §6, §7 step 6.
//
//   PROXIC_BENCH=1 [PROXIC_BENCH_OUT=file.json] npx playwright test e2e/benchmark.spec.ts
//
// Opt-in, like production.spec: the numbers belong to the machine they
// were measured on (the owner's), not to a shared CI runner, and they are
// committed as evidence with that machine named. Drives /dev/bench at 80
// permanents showing 60 different pictures, at 1920x1080 and 3840x2160,
// with pictures at a scan's full size ("full", as served today) and at the
// size the table draws them ("fit", the planned srcset), five runs each.
//
// Budgets (§6):
//   60 fps sustained through a full re-centre at 80 permanents
//   a new face visible <= 100 ms after entering play
//   <= 150 MB decoded-image memory with 60 distinct faces at 4K
//   first paint of a 40-permanent board <= 300 ms after snapshot
//     (measured here at 80, twice the budget's board)
//
// Decoded-image memory is the renderer's own account of it: Chromium's
// memory-infra dump, allocator "cc/image_memory".
//
// It runs in a REAL browser window (headed), with the machine's graphics
// and screen refresh: a headless browser schedules frames on a timer and
// misses some whenever many animations run, which measured the browser,
// not the board (idle control: 1 of 24 windows hitched headless while
// 15 of 24 re-centres did; headed, 0 of 24 re-centres did). And it never
// polls the page while something moves -- polling is main-thread work.

import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { signIn } from "./helpers";

test.skip(process.env.PROXIC_BENCH !== "1", "benchmarks run only when asked (PROXIC_BENCH=1)");
test.use({ headless: false });

declare global {
  interface Window {
    __bench?: Bench;
  }
}

interface Bench {
  ready: boolean;
  faces: number;
  res: string;
  scale: number;
  firstPaintMs?: number;
  allFacesMs?: number;
  frames?: number[];
  longTasks?: number;
  newFaceMs?: number;
  decodedBytes?: number;
}

const read = (page: Page) => page.evaluate(() => window.__bench);

async function until(page: Page, test: (b: Bench) => boolean) {
  await expect
    .poll(
      async () => {
        const b = await read(page);
        return b ? test(b) : false;
      },
      { timeout: 90_000 },
    )
    .toBe(true);
  return (await read(page))!;
}

/** The renderer's decoded-image cache, in bytes (memory-infra). */
async function imageMemory(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Tracing.start", {
    traceConfig: {
      includedCategories: ["disabled-by-default-memory-infra"],
    },
    transferMode: "ReturnAsStream",
  });
  await cdp.send("Tracing.requestMemoryDump", { deterministic: true, levelOfDetail: "detailed" });
  const complete = new Promise<{ stream: string }>((done) =>
    cdp.once("Tracing.tracingComplete", (e) => done(e as { stream: string })),
  );
  await cdp.send("Tracing.end");
  const { stream } = await complete;
  let data = "";
  for (;;) {
    const r = await cdp.send("IO.read", { handle: stream });
    data += r.base64Encoded ? Buffer.from(r.data, "base64").toString() : r.data;
    if (r.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  await cdp.detach();
  const parsed = JSON.parse(data) as { traceEvents?: unknown[] } | unknown[];
  const events = (Array.isArray(parsed) ? parsed : (parsed.traceEvents ?? [])) as {
    ph?: string;
    args?: { dumps?: { allocators?: Record<string, { attrs?: { size?: { value: string } } }> } };
  }[];
  let most = 0;
  for (const e of events) {
    if (e.ph !== "v") continue;
    const size = e.args?.dumps?.allocators?.["cc/image_memory"]?.attrs?.size?.value;
    if (size) most = Math.max(most, parseInt(size, 16));
  }
  return most;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};
const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))]! : NaN;
};

const CONFIGS = [
  { width: 1920, height: 1080, res: "full" },
  { width: 1920, height: 1080, res: "fit" },
  { width: 3840, height: 2160, res: "full" },
  { width: 3840, height: 2160, res: "fit" },
  // What the game actually sends the table: the server's 384-px copy
  // (2026-10-21; the first measurement compared only full and fit).
  { width: 1920, height: 1080, res: "served" },
  { width: 3840, height: 2160, res: "served" },
];
const RUNS = 5;
const SHIFTS = 4;

test("the battlefield's performance budget", async ({ page, browserName }) => {
  test.setTimeout(30 * 60_000);
  await signIn(page);
  const report: Record<string, unknown>[] = [];

  for (const config of CONFIGS) {
    await page.setViewportSize({ width: config.width, height: config.height });
    const firstPaint: number[] = [];
    const allFaces: number[] = [];
    const newFace: number[] = [];
    const frames: number[] = [];
    let longTasks = 0;
    let memory = 0;
    let estimate = 0;
    let scale = 1;
    let faces = 0;
    for (let run = 0; run < RUNS; run++) {
      await page.goto(`/dev/bench?permanents=80&faces=60&seed=${run + 1}&res=${config.res}`);
      const ready = await until(page, (b) => b.ready);
      scale = ready.scale;
      faces = ready.faces;
      await page.getByRole("button", { name: "Show board" }).click();
      const shown = await until(page, (b) => b.allFacesMs !== undefined);
      firstPaint.push(shown.firstPaintMs!);
      allFaces.push(shown.allFacesMs!);
      estimate = shown.decodedBytes!;
      if (run === 0) {
        await page.waitForTimeout(500);
        memory = await imageMemory(page);
      }
      for (let i = 0; i < SHIFTS; i++) {
        await page.getByRole("button", { name: "Shift all" }).click();
        await page.waitForTimeout(900); // hands off while it moves
        const shifted = await until(page, (b) => (b.frames?.length ?? 0) > 0);
        frames.push(...shifted.frames!);
        longTasks += shifted.longTasks ?? 0;
        await page.evaluate(() => {
          if (window.__bench) delete window.__bench.frames;
        });
        await page.waitForTimeout(150);
      }
      await page.getByRole("button", { name: "New face" }).click();
      newFace.push((await until(page, (b) => b.newFaceMs !== undefined)).newFaceMs!);
    }
    const row = {
      viewport: `${config.width}x${config.height}`,
      pictures: config.res,
      pictureScale: Number(scale.toFixed(3)),
      distinctFaces: faces,
      firstPaintMs: { median: median(firstPaint), all: firstPaint.map(Math.round) },
      allFacesDecodedMs: { median: median(allFaces) },
      newFaceMs: { median: median(newFace), all: newFace.map(Math.round) },
      reCentreFrames: {
        count: frames.length,
        p50: percentile(frames, 0.5),
        p95: percentile(frames, 0.95),
        worst: Math.max(...frames),
        over25ms: frames.filter((f) => f > 25).length,
        longTasks,
      },
      decodedImageMB: { measured: memory / 1e6, fromPixels: estimate / 1e6 },
    };
    report.push(row);
    console.log(JSON.stringify(row));
  }

  const result = {
    measured: new Date().toISOString(),
    machine: {
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      memoryGB: Math.round(totalmem() / 1e9),
    },
    browser: `${browserName} (${process.env.PROXIC_E2E_CHANNEL ?? "msedge"}), headed (a real window)`,
    board: "80 permanents (twice the first-paint budget's 40), 60 distinct pictures",
    runs: RUNS,
    results: report,
  };
  if (process.env.PROXIC_BENCH_OUT) {
    writeFileSync(process.env.PROXIC_BENCH_OUT, JSON.stringify(result, null, 2) + "\n");
  }
});
