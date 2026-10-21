// The battlefield bridge — BATTLEFIELD_RENDERING.md §6 tier 2, §7 steps 3
// and 4; PHASE_07 §7.42, §7.44, PHASE 7 AMENDMENTS 4, 5 and 6.
//
// layout() is proven by its Vitest suite (tier 1). This proves the
// RENDERER obeys it, through the real path: the real server, a real
// browser, the real CSS. For seeded synthetic boards at several window
// sizes, every drawn card's bounding box must equal the box layout()
// computes for that same board and window -- so the maths and the pixels
// cannot drift apart without this failing.
//
// It then checks, on the boxes the browser actually drew, what Amendment 4
// promised the owner: no card covers a card in another row, nothing
// crosses the divider, and tilted corners really are clipped. And, step 4,
// that after any change the board MOVES and then settles exactly there.

import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { applyChanges, syntheticBoard, type SyntheticBoard } from "../src/battlefield/fixture";
import {
  HAND_ORIGIN,
  TAPPED_ORIGIN,
  layout,
  type Box,
  type RowId,
} from "../src/battlefield/layout";
import { MOVE_MS, bandOf, handZoomBox } from "../src/battlefield/motion";

type Point = [number, number];

/** A box's four drawn corners: rotated about its origin, as CSS does. */
function corners(box: Box, origin: { x: number; y: number }): Point[] {
  const px = box.x + origin.x * box.w;
  const py = box.y + origin.y * box.h;
  const t = (box.rotation * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return (
    [
      [box.x, box.y],
      [box.x + box.w, box.y],
      [box.x + box.w, box.y + box.h],
      [box.x, box.y + box.h],
    ] as Point[]
  ).map(([x, y]) => {
    const dx = x - px;
    const dy = y - py;
    return [px + dx * cos - dy * sin, py + dx * sin + dy * cos];
  });
}

function bounds(points: Point[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/** A convex polygon cut to the band top <= y <= bottom. */
function clipToBand(poly: Point[], top: number, bottom: number): Point[] {
  const cut = (input: Point[], keep: (y: number) => boolean, line: number) => {
    const out: Point[] = [];
    input.forEach((a, i) => {
      const b = input[(i + 1) % input.length]!;
      if (keep(a[1])) out.push(a);
      if (keep(a[1]) !== keep(b[1])) {
        const t = (line - a[1]) / (b[1] - a[1]);
        out.push([a[0] + t * (b[0] - a[0]), line]);
      }
    });
    return out;
  };
  return cut(
    cut(poly, (y) => y >= top, top),
    (y) => y <= bottom,
    bottom,
  );
}

/** How deep two convex polygons overlap (0 if they do not). */
function overlap(p: Point[], q: Point[]): number {
  if (p.length < 3 || q.length < 3) return 0;
  let least = Infinity;
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]!;
      const [x2, y2] = poly[(i + 1) % poly.length]!;
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (length === 0) continue;
      const nx = (y1 - y2) / length;
      const ny = (x2 - x1) / length;
      const span = (points: Point[]) => {
        const v = points.map(([x, y]) => x * nx + y * ny);
        return [Math.min(...v), Math.max(...v)] as const;
      };
      const [a1, b1] = span(p);
      const [a2, b2] = span(q);
      const depth = Math.min(b1, b2) - Math.max(a1, a2);
      if (depth <= 0) return 0;
      least = Math.min(least, depth);
    }
  }
  return least;
}

interface Drawn {
  id: string;
  zone: string;
  tag: boolean;
  attachedTo: string | null;
  label: string;
  rect: { left: number; top: number; right: number; bottom: number };
}

interface Seen {
  width: number;
  height: number;
  nameFont: number | null;
  cardH: number | null;
  ghosts: number;
  moving: number;
  drawn: Drawn[];
}

/** What the browser drew: every button's box, and what is still moving. */
function readBoard(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[data-testid="battlefield"]')!;
    const name = document.querySelector<HTMLElement>(".bf-name");
    const slot = document.querySelector<HTMLElement>(".bf-slot");
    const drawn = [...board.querySelectorAll<HTMLElement>("button[data-object-id]")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.objectId!,
        zone: el.dataset.zone!,
        tag: el.classList.contains("bf-tag"),
        attachedTo: el.dataset.attachedTo ?? null,
        label: el.getAttribute("aria-label") ?? "",
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      };
    });
    return {
      width: board.clientWidth,
      height: board.clientHeight,
      nameFont: name ? parseFloat(getComputedStyle(name).fontSize) : null,
      cardH: slot ? parseFloat(getComputedStyle(slot).height) : null,
      ghosts: board.querySelectorAll("[data-ghost-of]").length,
      moving: document.getAnimations().filter((a) => a.playState === "running").length,
      drawn,
    };
  });
}

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3440, height: 1440 },
  { width: 1280, height: 1024 },
];
// [permanents, faces, seed]: empty, light, mid-game, past overflow, and
// so far past it that cards shrink (on the 1280x1024 window).
const BOARDS: [number, number, number][] = [
  [0, 0, 1],
  [12, 10, 7],
  [40, 30, 1],
  [90, 30, 3],
  [200, 30, 3],
];
const TOLERANCE = 0.1; // px: sub-pixel rounding, nothing more

/**
 * Everything wrong with what is on screen, against layout() for `board`.
 * Collected, then asserted once per board: a 200-card board makes tens of
 * thousands of comparisons, and one failure list reads better.
 */
async function differences(
  page: Page,
  board: SyntheticBoard,
  viewport: { width: number; height: number },
  probeCorners: boolean,
): Promise<{ wrong: string[]; shrunk: number; seen: Seen }> {
  const seen = await readBoard(page);
  const wrong: string[] = [];
  if (seen.width !== viewport.width || seen.height !== viewport.height)
    wrong.push(`the board is ${seen.width}x${seen.height}, not the window`);
  const expected = layout(board, viewport);
  const byId = new Map(seen.drawn.map((d) => [d.id, d]));
  if (byId.size !== seen.drawn.length) wrong.push("an id is drawn twice");
  for (const d of seen.drawn) if (d.label === "") wrong.push(`${d.id} has no name`);
  if (seen.ghosts > 0) wrong.push(`${seen.ghosts} ghost(s) still on the board`);
  let shrunk = 0;

  // Every slot's lead card and every hand card: drawn where layout() says,
  // to a tenth of a pixel. Pile members are not drawn.
  const placed: {
    id: string;
    row: RowId;
    whole: Point[];
    band: { top: number; bottom: number };
    poly: Point[];
  }[] = [];
  const check = (id: string, box: Box, origin: { x: number; y: number }) => {
    const d = byId.get(id);
    if (!d) {
      wrong.push(`${id} is not drawn`);
      return null;
    }
    const want = bounds(corners(box, origin));
    for (const side of ["left", "top", "right", "bottom"] as const) {
      if (Math.abs(d.rect[side] - want[side]) >= TOLERANCE)
        wrong.push(`${d.label}: ${side} is ${d.rect[side]}, layout() says ${want[side]}`);
    }
    return d;
  };
  for (const slot of expected.slots) {
    if (slot.box.scale < 1) shrunk++;
    const d = check(slot.ids[0]!, slot.box, TAPPED_ORIGIN);
    if (!d) continue;
    if (d.zone !== slot.row) wrong.push(`${d.label} is in ${d.zone}, not ${slot.row}`);
    for (const member of slot.ids.slice(1))
      if (byId.has(member)) wrong.push(`pile member ${member} is drawn`);
    // Auras and Equipment: a tag on its host (AMENDMENT 4).
    for (const id of slot.attached) {
      const tag = byId.get(id);
      if (!tag?.tag || tag.attachedTo !== slot.ids[0])
        wrong.push(`${id} is not a name tag on ${slot.ids[0]}`);
    }
    const band = bandOf(expected.geometry, slot.row);
    const whole = corners(slot.box, TAPPED_ORIGIN);
    placed.push({
      id: d.id,
      row: slot.row,
      whole,
      band,
      poly: clipToBand(whole, band.top, band.bottom),
    });
  }
  for (const card of board.hand) check(card.id, expected.boxes.get(card.id)!, HAND_ORIGIN);
  const drawnCards = seen.drawn.filter((d) => !d.tag).length;
  if (drawnCards !== expected.slots.length + board.hand.length)
    wrong.push(
      `${drawnCards} cards drawn, layout() has ${expected.slots.length + board.hand.length}`,
    );

  // AMENDMENT 4, measured: no card covers a card of another row, and no
  // card reaches past the divider, as its band clips it.
  const half = viewport.height / 2;
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i]!;
    const ys = a.poly.map((p) => p[1]);
    const opponent = a.row.startsWith("opponent");
    if (opponent ? Math.max(...ys) > half + TOLERANCE : Math.min(...ys) < half - TOLERANCE)
      wrong.push(`${a.id} crosses the divider`);
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j]!;
      if (a.row === b.row) continue; // a squeezed row overlaps by design (§7.51)
      const depth = overlap(a.poly, b.poly);
      if (depth >= 0.5) wrong.push(`${a.id} (${a.row}) covers ${b.id} (${b.row}) by ${depth}px`);
    }
  }

  // ...and the clipping is real, not assumed: just inside a corner tip
  // that leaves its band, the browser must not find that card.
  if (probeCorners) {
    const probes: { id: string; x: number; y: number }[] = [];
    for (const a of placed) {
      const cx = a.whole.reduce((n, p) => n + p[0], 0) / 4;
      const cy = a.whole.reduce((n, p) => n + p[1], 0) / 4;
      for (const [x, y] of a.whole) {
        const k = 2 / Math.hypot(cx - x, cy - y);
        const px = x + (cx - x) * k;
        const py = y + (cy - y) * k;
        if (py < a.band.top - 0.5 || py > a.band.bottom + 0.5)
          probes.push({ id: a.id, x: px, y: py });
      }
    }
    if (board.battlefield.length >= 40 && probes.length === 0)
      wrong.push("no tilted corner to probe");
    const hits = await page.evaluate(
      (points) =>
        points.map(
          (p) =>
            (document.elementFromPoint(p.x, p.y)?.closest("[data-object-id]") as HTMLElement | null)
              ?.dataset.objectId ?? null,
        ),
      probes,
    );
    probes.forEach((probe, i) => {
      if (hits[i] === probe.id) wrong.push(`${probe.id}'s corner tip is not clipped`);
    });
  }
  return { wrong, shrunk, seen };
}

function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  return problems;
}

test("the drawn battlefield is exactly layout()'s, and keeps Amendment 4", async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watchErrors(page);
  await signIn(page);
  let shrunk = 0;

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const [permanents, faces, seed] of BOARDS) {
      const where = `${permanents} permanents, seed ${seed}, ${viewport.width}x${viewport.height}`;
      await page.goto(`/dev/board?permanents=${permanents}&faces=${faces}&seed=${seed}`);
      await expect(page.getByRole("note")).toContainText("Not a game");
      await page.locator(".bf-slot").first().waitFor();

      const result = await differences(
        page,
        syntheticBoard(permanents, faces, seed),
        viewport,
        true,
      );
      shrunk += result.shrunk;
      expect(result.wrong, where).toEqual([]);

      // AMENDMENT 5: card text at 0.075 of the card's height.
      if (result.seen.nameFont !== null) {
        expect(result.seen.nameFont).toBeCloseTo(0.075 * result.seen.cardH!, 1);
      }
    }
  }
  expect(shrunk, "some board exercised the scale floor (§7.51)").toBeGreaterThan(0);
  expect(problems, "browser reported errors").toEqual([]);
});

test("after every change the board moves, then settles exactly where layout() says", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watchErrors(page);
  await signIn(page);
  const viewport = { width: 1920, height: 1080 };
  await page.setViewportSize(viewport);
  const start = syntheticBoard(40, 30, 1);
  await page.goto("/dev/board?permanents=40&faces=30&seed=1");
  await page.locator(".bf-slot").first().waitFor();
  const settled = MOVE_MS + 250;

  let moved = 0;
  const steps = 16;
  for (let n = 1; n <= steps; n++) {
    const step = applyChanges(start, n, 1);
    await page.getByRole("button", { name: "Next change" }).click();
    await expect(page.getByRole("note")).toContainText(`change ${n} `);
    // Right after the change, something is on its way (AMENDMENT 6)...
    if ((await readBoard(page)).moving > 0) moved++;
    // ...and once it has had time to get there, nothing is, and the board
    // is exactly the new layout, ghosts gone.
    await page.waitForTimeout(settled);
    const result = await differences(page, step.board, viewport, false);
    expect(result.seen.moving, `change ${n} (${step.what}): still moving`).toBe(0);
    expect(result.wrong, `change ${n} (${step.what})`).toEqual([]);
  }
  // Every kind of change moves something; allow for one that found
  // nothing to do (say, no tapped land to untap).
  expect(moved, "changes that moved something").toBeGreaterThanOrEqual(steps - 2);

  // A pointed-at hand card rises and zooms (AMENDMENT 6), then goes back.
  const board = applyChanges(start, steps, 1).board;
  const expected = layout(board, viewport);
  const card = board.hand[Math.floor(board.hand.length / 2)]!;
  const rest = expected.boxes.get(card.id)!;
  const handCard = page.locator(`[data-object-id="${card.id}"]`);
  const visible = bounds(corners(rest, HAND_ORIGIN));
  await page.mouse.move((visible.left + visible.right) / 2, viewport.height - 20);
  await page.waitForTimeout(settled);
  await expect(handCard).toHaveAttribute("data-zoomed", "true");
  const zoom = bounds(corners(handZoomBox(rest, expected.geometry), HAND_ORIGIN));
  const r = (await handCard.boundingBox())!;
  for (const [got, want] of [
    [r.x, zoom.left],
    [r.y, zoom.top],
    [r.x + r.width, zoom.right],
    [r.y + r.height, zoom.bottom],
  ] as const) {
    expect(Math.abs(got - want)).toBeLessThan(TOLERANCE);
  }
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.waitForTimeout(settled);
  await expect(handCard).not.toHaveAttribute("data-zoomed", "true");
  expect((await differences(page, board, viewport, false)).wrong).toEqual([]);

  expect(problems, "browser reported errors").toEqual([]);
});
