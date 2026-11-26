// The repaint probe of the measuring kit (PHASE_11 P11-C5): where on the
// screen the browser really drew again, and what it keeps in layers.
//
// Chrome's `Paint` event (probes.ts) names a paint layer's clip, which for a
// composited layer is unbounded: it says that something painted, not where.
// The compositor knows where. With the trace categories below, every frame
// the compositor draws carries a snapshot of its layer tree
// (`LayerTreeHostImpl:snapshot`), and each layer Blink invalidated in that
// frame's commit carries the rectangles it invalidated, with the object
// that asked and why (`annotated_invalidation_rects`, recorded while the
// `blink.invalidation` category is on). Those rectangles are what the
// compositor raster again: the repainted area. Each is in its layer's own
// space; the layer's quad on screen (`layer_quad`) places it.
//
// - Painted area: per commit, the union of every invalidated rectangle on
//   screen (inside the window), on a 2 px grid, summed over the commits.
// - Outside the target: the part of it outside the moment's target boxes
//   (the changed cards' boxes and the plates or counts that changed, which
//   the measure gives), on the same grid.
// - Layers: how many the compositor holds, how many draw, and the memory
//   their tiles take (`gpu_memory_usage`, a software raster's shared memory
//   in headless Chromium, a GPU's elsewhere), the most over the stretch.
// - Who: the area each invalidating object asked for, by its name (its tag
//   and class), to name the causes.
//
// The snapshots are heavy (about 160 KB a frame, every frame), so this runs
// apart from the redraw timer (probes.ts), whose times it would skew, and
// the trace file is read line by line. Chromium only.

import type { Page } from "@playwright/test";
import type { Bench, State } from "./bench";
import { copyFileSync, createReadStream, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

export const REPAINT_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline.layers",
  "disabled-by-default-blink.invalidation",
];

/** A box on screen, CSS px (the measure runs at a device scale of 1). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** A card's box: with [grow], its lift shadow is counted in (`SHADOW`). */
  card?: boolean;
}

/**
 * How far a card's own drawing reaches past its box, as a share of its
 * longer side: a card gliding is lifted (Phase 10 A-00, battlefield.css
 * `.bf-moving .bf-card`: a shadow 0.1 of its height down, blurred 0.22),
 * and the compositor cuts the moving card's layer evenly round it (190 x 230
 * for a 97 x 136 card, RUN 2026-11-25): about 0.35 of its height each way.
 */
export const SHADOW = 0.35;

export interface Layer {
  layer_id?: number;
  layer_name?: string;
  bounds?: { width: number; height: number };
  layer_quad?: number[];
  draws_content?: number | boolean;
  gpu_memory_usage?: number;
  annotated_invalidation_rects?: { client: string; geometry_rect: number[]; reason: string }[];
}

export interface Snapshot {
  pid: number;
  ts: number;
  tree: number;
  frame: number;
  layers: Layer[];
  tileBytes: number;
}

export interface Repaint {
  /** Commits that invalidated something. */
  commits: number;
  /** Painted area, thousands of px squared: the union of each commit's invalidations, summed. */
  paintedKpx: number;
  /** The part of it outside the target boxes. */
  outsideKpx: number;
  /** The part outside the target boxes with each card's own lift shadow counted in (`SHADOW`). */
  outsideShadowKpx: number;
  /** Invalidated rectangles, all commits. */
  rects: number;
  /** The compositor's layers: the most at once, and the most that draw. */
  layers: number;
  drawingLayers: number;
  /** Their tiles' memory, KB: the most at once. */
  layerMemKb: number;
  /** Blink's Paint events for the page's frame (as probes.ts counts them). */
  paints: number;
  /** Area (px squared) by the object that asked for it, inside and outside the target. */
  byClient: Record<string, { inside: number; outside: number; reasons: string[] }>;
}

/** The mark the measured stretch starts at (console.timeStamp), and how long after the trace starts. */
const START = "proxic-repaint-start";
const LEAD_IN_MS = 400;

const W = 1920;
const H = 1080;
const CELL = 2;
const GW = W / CELL;
const GH = H / CELL;

/** A layer's own (x, y) on screen: the quad's corners, bilinear (a layer is a parallelogram). */
function placer(layer: Layer) {
  const q = layer.layer_quad!;
  const w = layer.bounds?.width || 1;
  const h = layer.bounds?.height || 1;
  return (x: number, y: number): [number, number] => {
    const u = x / w;
    const v = y / h;
    return [
      (1 - u) * (1 - v) * q[0]! + u * (1 - v) * q[2]! + u * v * q[4]! + (1 - u) * v * q[6]!,
      (1 - u) * (1 - v) * q[1]! + u * (1 - v) * q[3]! + u * v * q[5]! + (1 - u) * v * q[7]!,
    ];
  };
}

/** The grid cells a screen box covers (clipped to the window). */
function cells(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  // A hair's give, so a quad's float arithmetic (130.00000001) takes no extra row.
  const e = 1e-6;
  const cx0 = Math.max(0, Math.floor(Math.max(0, x0) / CELL + e));
  const cy0 = Math.max(0, Math.floor(Math.max(0, y0) / CELL + e));
  const cx1 = Math.min(GW, Math.ceil(Math.min(W, x1) / CELL - e));
  const cy1 = Math.min(GH, Math.ceil(Math.min(H, y1) / CELL - e));
  return [cx0, cy0, cx1, cy1];
}

/** The target boxes as grid cells. */
export function targetMask(boxes: Box[], grow = false): Uint8Array {
  const mask = new Uint8Array(GW * GH);
  for (const b of boxes) {
    const g = grow && b.card ? SHADOW * Math.max(b.width, b.height) : 0;
    const [x0, y0, x1, y1] = cells(b.x - g, b.y - g, b.x + b.width + g, b.y + b.height + g);
    for (let y = y0; y < y1; y++) mask.fill(1, y * GW + x0, y * GW + Math.max(x0, x1));
  }
  return mask;
}

/** A short name for an invalidating object: its tag and first class ("DIV bf-slot"). */
export function clientName(client: string): string {
  const object = /^Layout\w+ (?:\([^)]*\) )?(.*)$/.exec(client)?.[1];
  const tag = object
    ? /^(#text|#document|::[a-z-]+|[A-Za-z][A-Za-z0-9]*)(?: class='([^' ]+)[^']*')?/.exec(object)
    : null;
  if (!tag) return client.slice(0, 60);
  return tag[2] ? `${tag[1]} ${tag[2]}` : tag[1]!;
}

/**
 * The repaint numbers of [snapshots] (the host page's, in time order) against
 * [mask]: each commit counted once (a layer tree's `source_frame_number`).
 */
export function measureSnapshots(
  snapshots: Snapshot[],
  mask: Uint8Array,
  shadowMask: Uint8Array = mask,
): Omit<Repaint, "paints"> {
  const out: Omit<Repaint, "paints"> = {
    commits: 0,
    paintedKpx: 0,
    outsideKpx: 0,
    outsideShadowKpx: 0,
    rects: 0,
    layers: 0,
    drawingLayers: 0,
    layerMemKb: 0,
    byClient: {},
  };
  const seen = new Set<string>();
  const grid = new Uint8Array(GW * GH);
  for (const s of snapshots) {
    out.layers = Math.max(out.layers, s.layers.length);
    out.drawingLayers = Math.max(
      out.drawingLayers,
      s.layers.filter((l) => l.draws_content === 1 || l.draws_content === true).length,
    );
    out.layerMemKb = Math.max(out.layerMemKb, Math.round(s.tileBytes / 1024));
    const key = `${s.tree}:${s.frame}`;
    if (seen.has(key)) continue;
    seen.add(key);
    grid.fill(0);
    let any = false;
    for (const layer of s.layers) {
      const rects = layer.annotated_invalidation_rects;
      if (!rects?.length || !layer.layer_quad || layer.layer_quad.length !== 8) continue;
      const place = placer(layer);
      for (const r of rects) {
        const [x, y, w, h] = r.geometry_rect as [number, number, number, number];
        const pts = [place(x, y), place(x + w, y), place(x, y + h), place(x + w, y + h)];
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const [cx0, cy0, cx1, cy1] = cells(
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        );
        if (cx1 <= cx0 || cy1 <= cy0) continue;
        out.rects++;
        any = true;
        let inside = 0;
        let outside = 0;
        for (let cy = cy0; cy < cy1; cy++)
          for (let cx = cx0; cx < cx1; cx++) {
            const i = cy * GW + cx;
            if (mask[i]) inside++;
            else outside++;
            grid[i] = 1;
          }
        const name = clientName(r.client);
        const c = (out.byClient[name] ??= { inside: 0, outside: 0, reasons: [] });
        c.inside += inside * CELL * CELL;
        c.outside += outside * CELL * CELL;
        if (!c.reasons.includes(r.reason)) c.reasons.push(r.reason);
      }
    }
    if (!any) continue;
    out.commits++;
    let painted = 0;
    let outside = 0;
    let outsideShadow = 0;
    for (let i = 0; i < grid.length; i++)
      if (grid[i]) {
        painted++;
        if (!mask[i]) outside++;
        if (!shadowMask[i]) outsideShadow++;
      }
    out.paintedKpx += (painted * CELL * CELL) / 1000;
    out.outsideKpx += (outside * CELL * CELL) / 1000;
    out.outsideShadowKpx += (outsideShadow * CELL * CELL) / 1000;
  }
  out.paintedKpx = Math.round(out.paintedKpx * 10) / 10;
  out.outsideKpx = Math.round(out.outsideKpx * 10) / 10;
  out.outsideShadowKpx = Math.round(out.outsideShadowKpx * 10) / 10;
  return out;
}

/** Read a Chrome trace file line by line: the host frame's pid, its snapshots and Paint count. */
async function readTrace(file: string, frame: string) {
  const snapshots: Snapshot[] = [];
  let paints = 0;
  let pid: number | null = null;
  let start: number | null = null;
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }) });
  for await (const raw of lines) {
    const line = raw.endsWith(",") ? raw.slice(0, -1) : raw;
    if (pid === null && line.includes(frame)) {
      const m = /"pid":(\d+)/.exec(line);
      if (m) pid = Number(m[1]);
    }
    if (!line.startsWith("{") || line.startsWith('{"traceEvents"')) continue;
    if (start === null && line.includes(START)) {
      const m = /"ts":(\d+)/.exec(line);
      if (m) start = Number(m[1]);
      continue;
    }
    if (!line.includes('"LayerTreeHostImpl:snapshot"') && !line.includes('"name":"Paint"'))
      continue;
    let e: {
      name: string;
      ph: string;
      pid: number;
      ts: number;
      args?: Record<string, unknown>;
    };
    try {
      e = JSON.parse(line) as typeof e;
    } catch {
      continue;
    }
    if (e.name === "Paint") {
      const data = (e.args?.["data"] ?? {}) as { frame?: string };
      if (data.frame === frame) paints++;
      continue;
    }
    if (e.name !== "LayerTreeHostImpl:snapshot" || e.ph !== "I") continue;
    const snap = e.args?.["snapshot"] as
      | {
          active_tree?: { layers?: Layer[]; source_frame_number?: number };
          active_tiles?: { gpu_memory_usage?: number }[];
        }
      | undefined;
    if (!snap?.active_tree) continue;
    snapshots.push({
      pid: e.pid,
      ts: e.ts,
      tree: Number(e.args?.["layerTreeId"] ?? 0),
      frame: snap.active_tree.source_frame_number ?? 0,
      layers: snap.active_tree.layers ?? [],
      tileBytes: (snap.active_tiles ?? []).reduce((s, t) => s + (t.gpu_memory_usage ?? 0), 0),
    });
  }
  // Only what came after the stretch began (the lead-in's commits are not its).
  const from = start ?? 0;
  return { snapshots: snapshots.filter((x) => x.ts >= from), paints, pid, started: start !== null };
}

export interface RepaintProbe {
  /**
   * Trace [during] and measure its repaints against the target boxes, which
   * [target] gives once [during] is over (each moment's measure collects them
   * as it goes: before and after each board).
   */
  time(during: () => Promise<void>, target: () => Box[]): Promise<Repaint>;
}

export async function repaintProbe(page: Page): Promise<RepaintProbe> {
  const browser = page.context().browser()!;
  const cdp = await page.context().newCDPSession(page);
  const { frameTree } = await cdp.send("Page.getFrameTree");
  const frame = frameTree.frame.id;
  await cdp.detach();
  // Turning the invalidation category on makes the first commit after it
  // carry the whole page (Blink starts tracking); one short trace first, so
  // no measured stretch begins with it.
  const warm = join(tmpdir(), `proxic-repaint-warm-${process.pid}-${Date.now()}.json`);
  await browser.startTracing(page, { path: warm, categories: REPAINT_CATEGORIES });
  await page.waitForTimeout(500);
  await browser.stopTracing();
  rmSync(warm, { force: true });
  return {
    async time(during, target) {
      const file = join(tmpdir(), `proxic-repaint-${process.pid}-${Date.now()}.json`);
      await browser.startTracing(page, { path: file, categories: REPAINT_CATEGORIES });
      // A lead-in: the first commits after the trace starts carry the whole
      // page (Blink begins tracking invalidations again), so the stretch
      // starts at a mark put in the trace once they are past.
      await page.waitForTimeout(LEAD_IN_MS);
      await page.evaluate((mark) => console.timeStamp(mark), START);
      await during();
      await browser.stopTracing();
      try {
        const trace = await readTrace(file, frame);
        if (!trace.started)
          throw new Error("repaint: the stretch's start mark is not in the trace");
        // The page's renderer: the process its frame's events came from, else
        // the only one that drew (the measure freezes the other page).
        const pids = new Set(trace.snapshots.map((s) => s.pid));
        const pid = trace.pid ?? (pids.size === 1 ? [...pids][0] : null);
        if (pid === null || pid === undefined)
          throw new Error(`repaint: the page's renderer is not known (${pids.size} drew)`);
        const keep = process.env.PROXIC_REPAINT_TRACES;
        if (keep) {
          mkdirSync(keep, { recursive: true });
          copyFileSync(file, join(keep, `repaint-${Date.now()}.json`));
        }
        const mine = trace.snapshots.filter((s) => s.pid === pid);
        // The page's own tree: the one with the most layers (an iframe or a
        // popup would be its own, smaller tree).
        const trees = new Map<number, number>();
        for (const s of mine) trees.set(s.tree, Math.max(trees.get(s.tree) ?? 0, s.layers.length));
        const tree = [...trees.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const numbers = measureSnapshots(
          mine.filter((s) => s.tree === tree),
          targetMask(target()),
          targetMask(target(), true),
        );
        return { ...numbers, paints: trace.paints };
      } finally {
        rmSync(file, { force: true });
      }
    },
  };
}

/** Each element's box on screen, for [selectors] (every match of each). */
export async function boxesOf(page: Page, selectors: string[]): Promise<Box[]> {
  return page.evaluate(
    (sel) =>
      sel.flatMap((s) =>
        [...document.querySelectorAll(s)].map((el) => {
          const r = el.getBoundingClientRect();
          const card = !el.matches(".gs-seat");
          return { x: r.x, y: r.y, width: r.width, height: r.height, card };
        }),
      ),
    selectors,
  );
}

/** The ids a board changed: every card on the table or in the hand that is new, gone or different. */
export function changedIds(before: State, after: State): string[] {
  const ids = new Set<string>();
  for (const zone of ["battlefield", "hand"] as const) {
    const was = new Map(before[zone].map((c) => [c.id, JSON.stringify(c)]));
    const now = new Map(after[zone].map((c) => [c.id, JSON.stringify(c)]));
    for (const [id, text] of now) if (was.get(id) !== text) ids.add(id);
    for (const id of was.keys()) if (!now.has(id)) ids.add(id);
  }
  return [...ids];
}

/** What a board changes on screen: its cards (and the piles holding them), the stack, the plates. */
export function targetsOf(before: State, after: State): string[] {
  const sel = changedIds(before, after).flatMap((id) => [
    `.bf-cards [data-object-id="${id}"]`,
    `.bf-cards [data-members-ids~="${id}"]`,
  ]);
  const stack = (s: State) => (s["stack"] as unknown[] | undefined)?.length ?? 0;
  if (stack(before) || stack(after)) sel.push(".bf-stack-slot");
  const life = (s: State) => s.players.map((p) => p.life).join(",");
  if (life(before) !== life(after)) sel.push(".gs-seat");
  return sel;
}

/**
 * Send [boards] to the page [gap] ms apart, measuring the repaints against
 * each board's targets, taken before it is sent, just after, and as the
 * next one goes (so a card's box where it was and where it went are both in).
 */
export async function moment(
  host: Page,
  bench: Bench,
  probe: RepaintProbe,
  boards: (now: State) => State | null,
  count: number,
  gap: number,
): Promise<Repaint> {
  const boxes: Box[] = [];
  return probe.time(
    async () => {
      for (let k = 0; k < count; k++) {
        const before = bench.now();
        const next = boards(before);
        if (!next) break;
        const sel = targetsOf(before, next);
        boxes.push(...(await boxesOf(host, sel)));
        bench.send(next);
        await host.waitForTimeout(80);
        boxes.push(...(await boxesOf(host, sel)));
        await host.waitForTimeout(gap - 80);
        boxes.push(...(await boxesOf(host, sel)));
      }
    },
    () => boxes,
  );
}

/** Freeze or wake [page] (its drawing and its scripts), so a measured stretch holds only the host's. */
export async function lifecycle(page: Page, state: "frozen" | "active") {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setWebLifecycleState", { state });
  await cdp.detach();
}
