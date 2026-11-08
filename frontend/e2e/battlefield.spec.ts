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
// promised the owner: no card covers a card in another line, and nothing
// crosses the divider -- and, spec 0040, that a tapped card's corners stay
// inside its line with nothing clipped. And, step 4,
// that after any change the board MOVES and then settles exactly there;
// step 5, that the lines and combat effects follow the game.

import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import {
  COMBAT_SCRIPT_LENGTH,
  applyChanges,
  combatScript,
  syntheticBoard,
  type SyntheticBoard,
} from "../src/battlefield/fixture";
import {
  HAND_ORIGIN,
  TAPPED_ORIGIN,
  inCombat,
  layout,
  type Box,
  type RowId,
} from "../src/battlefield/layout";
import { LIFE_R, MOVE_MS, SWEEP_MS, fateMs, anchors, handZoomBox } from "../src/battlefield/motion";
import { STACK_READ_SCALE, TIP_GAP, stackSpotBoxes } from "../src/battlefield/effects";

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
    // Not the stack's cards (owner 2026-10-21): those are drawn beside the
    // layout, at the play area's right edge, and checked with the lines.
    const drawn = [
      ...board.querySelectorAll<HTMLElement>('button[data-object-id]:not([data-zone="stack"])'),
    ].map((el) => {
      // A flyer's hover-sway (owner item 3) is decoration on top of its
      // place: measure the place, with the sway held still for the read.
      const still = el.classList.contains("bf-fly");
      if (still) el.style.setProperty("animation", "none");
      if (still) el.style.setProperty("translate", "none");
      const r = el.getBoundingClientRect();
      if (still) el.style.removeProperty("animation");
      if (still) el.style.removeProperty("translate");
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
      // Not what plays forever on a settled card (a flyer's sway, the z's;
      // owner item 3): only motion that ends counts as moving.
      moving: document
        .getAnimations()
        .filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity)
        .length,
      drawn,
    };
  });
}

const VIEWPORTS = [
  { width: 1920, height: 947 }, // 1920x1080 in a browser window (AGENTS UI-006)
  { width: 1920, height: 1080 },
  { width: 3440, height: 1440 },
  { width: 2560, height: 1440 },
];
// [permanents, faces, seed]: empty, light, mid-game, past overflow, and
// so far past it that cards shrink.
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
  checkCorners: boolean,
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
    band: { top: number; bottom: number };
    poly: Point[];
  }[] = [];
  const lines = new Map(expected.lines.map((l) => [l.id, l.rect]));
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
    const rect = lines.get(slot.row)!;
    placed.push({
      id: d.id,
      row: slot.row,
      band: { top: rect.y, bottom: rect.y + rect.h },
      poly: corners(slot.box, TAPPED_ORIGIN),
    });
  }
  for (const card of board.hand) check(card.id, expected.boxes.get(card.id)!, HAND_ORIGIN);
  const drawnCards = seen.drawn.filter((d) => !d.tag).length;
  if (drawnCards !== expected.slots.length + board.hand.length)
    wrong.push(
      `${drawnCards} cards drawn, layout() has ${expected.slots.length + board.hand.length}`,
    );

  // AMENDMENT 4, measured: no card covers a card of another line, and no
  // card reaches past the divider.
  const half = viewport.height / 2;
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i]!;
    const ys = a.poly.map((p) => p[1]);
    const opponent = a.row.startsWith("opponent");
    if (opponent ? Math.max(...ys) > half + TOLERANCE : Math.min(...ys) < half - TOLERANCE)
      wrong.push(`${a.id} crosses the divider`);
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j]!;
      if (a.row === b.row) continue; // a squeezed line overlaps by design (§7.51)
      const depth = overlap(a.poly, b.poly);
      if (depth >= 0.5) wrong.push(`${a.id} (${a.row}) covers ${b.id} (${b.row}) by ${depth}px`);
    }
  }

  // Spec 0040: a tapped card's corners stay inside its line (a 5-degree
  // tilt is at most half a pixel taller than it at 1080), and nothing is
  // clipped to make that so.
  if (checkCorners) {
    for (const a of placed) {
      const ys = a.poly.map((p) => p[1]);
      const slack = 0.005 * (a.band.bottom - a.band.top) + TOLERANCE;
      if (Math.min(...ys) < a.band.top - slack || Math.max(...ys) > a.band.bottom + slack)
        wrong.push(`${a.id} leaves its line ${a.row}`);
    }
    const clipped = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>(".bf-slot")].filter(
          (el) => getComputedStyle(el).clipPath !== "none",
        ).length,
    );
    if (clipped > 0) wrong.push(`${clipped} card(s) clipped`);
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

test("the drawn battlefield is exactly layout()'s, and keeps Amendment 4 and spec 0040", async ({
  page,
}) => {
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
  // The longest a change takes: a card leaving the table first shows it
  // was defeated or exiled (Phase 10 A-04/A-05), after a wipe's flash
  // (A-07), then Glides.
  const settled = MOVE_MS + Math.max(fateMs("defeated"), fateMs("exiled")) + SWEEP_MS + 250;

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

/** Is the point inside the convex polygon (with a little slack)? */
function inside(point: { x: number; y: number }, poly: Point[], slack = 1): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const side = ((x2 - x1) * (point.y - y1) - (y2 - y1) * (point.x - x1)) / len;
    if (Math.abs(side) <= slack) continue;
    const s = Math.sign(side);
    if (sign !== 0 && s !== sign) return false;
    sign = s;
  }
  return true;
}

test("lines and combat effects follow the game (Amendments 4 and 7)", async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watchErrors(page);
  await signIn(page);
  const viewport = { width: 1920, height: 1080 };
  await page.setViewportSize(viewport);
  await page.goto("/dev/board?script=combat");
  await page.locator(".bf-slot").first().waitFor();

  for (let n = 1; n < COMBAT_SCRIPT_LENGTH; n++) {
    const scene = combatScript(n);
    // Laid out as the board does: with combat's piles and riders (0037).
    const laid = (s: ReturnType<typeof combatScript>) =>
      s.combat ? { ...s.board, battlefield: inCombat(s.board.battlefield, s.combat) } : s.board;
    const expected = layout(laid(scene), viewport);
    const where = anchors(expected.geometry);
    const what = `step ${n} (${scene.what})`;
    await page.getByRole("button", { name: "Next change" }).click();
    await page.mouse.move(viewport.width / 2, 40);
    await expect(page.getByRole("note")).toContainText(`change ${n} `);

    // Damage: what plays. Phase 10 A-13 -- a combat damage step's wave plays
    // one fight at a time: every fighter's card moves (or, killed, its
    // ghost), and the numbers say what each took; a spell's is a burst and a
    // number.
    if (scene.damage) {
      const playing = await page.evaluate(() => ({
        fighters: [
          ...new Set(
            document
              .getAnimations()
              .filter((a) => a.id === "fight")
              .map((a) => {
                const target = (a.effect as KeyframeEffect).target as HTMLElement;
                return (
                  target.dataset.objectId ??
                  target.closest<HTMLElement>("[data-ghost-of]")?.dataset.ghostOf ??
                  target.querySelector<HTMLElement>(":scope > button")?.dataset.objectId ??
                  ""
                );
              }),
          ),
        ],
        numbers: [
          ...document.querySelectorAll<HTMLElement>("[data-damage-number], [data-fight=number]"),
        ].map((e) => `${e.dataset.damageNumber ?? e.dataset.of} ${e.textContent}`),
        impacts: document.querySelectorAll("[data-impact]").length,
        captions: document.querySelectorAll("[data-fight=caption]").length,
      }));
      const totals = new Map<string, number>();
      for (const hit of scene.damage.hits) {
        const k = "player" in hit.target ? `player:${hit.target.player}` : hit.target.object;
        totals.set(k, (totals.get(k) ?? 0) + hit.amount);
      }
      expect(playing.numbers.sort(), `${what}: numbers`).toEqual(
        [...totals].map(([k, v]) => `${k} −${v}`).sort(),
      );
      if (scene.damage.combat) {
        // Everyone who dealt or took damage fights; no burst of the old swoop.
        const fought = new Set(
          scene.damage.hits.flatMap((h) => [
            h.source,
            ...("object" in h.target ? [h.target.object] : []),
          ]),
        );
        expect(playing.fighters.sort(), `${what}: fighters`).toEqual([...fought].sort());
        expect(playing.impacts, `${what}: bursts`).toBe(0);
        expect(playing.captions, `${what}: one caption a fight`).toBeGreaterThan(0);
      } else {
        expect(playing.impacts, `${what}: bursts`).toBe(totals.size);
      }
    }

    // Once it has all played out: the board is exactly the layout, nothing
    // still moving or showing, and the lines are the scene's.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document
                .getAnimations()
                .filter((a) => a.playState === "running" && !(a instanceof CSSAnimation)).length,
          ),
        { timeout: 15_000, message: `${what}: still moving` },
      )
      .toBe(0);
    await page.waitForTimeout(300);
    const result = await differences(page, laid(scene), viewport, false);
    expect(result.wrong, what).toEqual([]);
    // Nothing moves any more but the lines' own sparks (CSS animations).
    const stillMoving = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running" && !(a instanceof CSSAnimation)).length,
    );
    expect(stillMoving, `${what}: still moving`).toBe(0);
    expect(
      await page.locator("[data-damage-number], [data-impact], [data-fight]").count(),
      what,
    ).toBe(0);

    const readLines = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<SVGGElement>("[data-line]")].map((g) => ({
          kind: g.dataset.line!,
          from: g.dataset.from!,
          to: g.dataset.to!,
          start: g.dataset.start!.split(",").map(Number) as [number, number],
          end: g.dataset.end!.split(",").map(Number) as [number, number],
          // Drawn, not just present: a hidden layer has no size on screen.
          shown: g.getBoundingClientRect().width + g.getBoundingClientRect().height > 4,
        })),
      );
    // Spec 0037: a blocked attacker draws no fire line. Phase 10 A-12: a
    // blocker stands facing the (first) attacker it blocks, so it needs no
    // shield line to it; one blocking several has lines to the others.
    const blocks = scene.combat?.blocks ?? [];
    const blockedIds = new Set(blocks.map((b) => b.attacker));
    const blocksOf = (id: string) => blocks.filter((b) => b.blocker === id).length;
    const faces = (b: (typeof blocks)[number]) => blocks.find((x) => x.blocker === b.blocker) === b;
    const aimKey = (t: { player: number } | { object: string }) =>
      "player" in t ? `player:${t.player}` : t.object;
    // Spec 0059 item 9: attack lines only while an attacker is pointed at.
    const want: string[] = [
      ...blocks
        .filter((b) => blocksOf(b.blocker) > 1 && !faces(b))
        .map((b) => `block ${b.blocker}>${b.attacker}`),
      // Spec 0028: the pointed-at stack object's line, else the front one's;
      // and every ability's faint line back to its permanent.
      ...scene.stack
        .filter((s) =>
          scene.stack.some((x) => x.id === scene.pointedStack)
            ? s.id === scene.pointedStack
            : s === scene.stack[0],
        )
        .flatMap((s) =>
          s.targets.map((t) => `target ${s.id}>${"player" in t ? `player:${t.player}` : t.object}`),
        ),
      ...scene.stack.filter((s) => s.source).map((s) => `source ${s.source}>${s.id}`),
      ...(scene.attaching ? [`attach ${scene.attaching.source}>${scene.attaching.host}`] : []),
    ];
    const atRest = await readLines();
    expect(atRest.map((l) => `${l.kind} ${l.from}>${l.to}`).sort(), `${what}: lines`).toEqual(
      [...want].sort(),
    );
    // Every end is on (or, a tip, a hair off -- spec 0063) the drawn card it
    // belongs to, or on its rail point.
    const tipGap = TIP_GAP * expected.geometry.cardH;
    const outlineOf = (id: string) => {
      const box = expected.boxes.get(id)!;
      return corners(box, TAPPED_ORIGIN);
    };
    const checkEnds = (drawnLines: Awaited<ReturnType<typeof readLines>>) => {
      for (const line of drawnLines) checkEnd(line);
    };
    const checkEnd = (line: Awaited<ReturnType<typeof readLines>>[number]) => {
      expect(line.shown, `${what}: ${line.kind} ${line.from} is not visible`).toBe(true);
      const start = { x: line.start[0], y: line.start[1] };
      const end = { x: line.end[0], y: line.end[1] };
      if (line.from.startsWith("stack:")) {
        // Owner 2026-10-21: from the spell's own card on the stack, drawn
        // at the right edge of the play area -- on that card's edge. Nothing
        // is asked on the dev board, so the stack is readable (Phase 9 W-20).
        const spot = stackSpotBoxes(expected.geometry, scene.stack.length, STACK_READ_SCALE);
        const index = scene.stack.findIndex((s) => s.id === line.from);
        const box = spot[index] ?? spot[spot.length - 1]!;
        const onEdge =
          start.x >= box.x - 1 &&
          start.x <= box.x + box.w + 1 &&
          start.y >= box.y - 1 &&
          start.y <= box.y + box.h + 1 &&
          Math.min(
            Math.abs(start.x - box.x),
            Math.abs(start.x - box.x - box.w),
            Math.abs(start.y - box.y),
            Math.abs(start.y - box.y - box.h),
          ) < 1;
        expect(onEdge, `${what}: ${line.from} starts on its card on the stack`).toBe(true);
      } else {
        expect(
          inside(start, outlineOf(line.from)),
          `${what}: ${line.kind} starts in ${line.from}`,
        ).toBe(true);
      }
      if (line.to.startsWith("stack:")) {
        // An ability's line ends on its own card in the cascade.
        const spot = stackSpotBoxes(expected.geometry, scene.stack.length, STACK_READ_SCALE);
        const box = spot[scene.stack.findIndex((s) => s.id === line.to)]!;
        expect(
          end.x >= box.x - tipGap - 1 &&
            end.x <= box.x + box.w + 1 &&
            end.y >= box.y - 1 &&
            end.y <= box.y + box.h + 1,
          `${what}: ${line.kind} ends on ${line.to}'s card`,
        ).toBe(true);
      } else if (line.to.startsWith("player:")) {
        // A hair off the life circle's edge, never over the total.
        const life = where["viewer:life"];
        const fromCentre = Math.hypot(end.x - life.x, end.y - life.y);
        expect(
          Math.abs(fromCentre - LIFE_R * expected.geometry.height - tipGap) < 1,
          `${what}: ${line.kind} ends by the life circle's edge`,
        ).toBe(true);
      } else {
        expect(
          inside(end, outlineOf(line.to), tipGap + 1),
          `${what}: ${line.kind} ends at ${line.to}`,
        ).toBe(true);
      }
    };
    checkEnds(atRest);

    // Spec 0063: no badge or name pill; every drawn attacker -- blocked ones
    // and piles too -- draws its own arrow while pointed at (one per pile;
    // a blocked one a short arrow to each of its blockers), and moving away
    // takes it off again.
    expect(
      await page.locator("[data-attack-badge], .bf-aim-at, .bf-aim-name").count(),
      `${what}: no badges`,
    ).toBe(0);
    const leadOf = (id: string) => expected.slots.find((s) => s.ids.includes(id))!.ids[0]!;
    const attackers = scene.combat?.attackers ?? [];
    const leads = [...new Set(attackers.map((a) => leadOf(a.id)))];
    for (const lead of leads) {
      const firstOf = new Map<string, string>();
      for (const a of attackers) {
        if (leadOf(a.id) !== lead) continue;
        const ends = blockedIds.has(a.id)
          ? blocks.filter((b) => b.attacker === a.id).map((b) => b.blocker)
          : [aimKey(a.target)];
        for (const to of ends) {
          const key = to.startsWith("player:") ? to : leadOf(to);
          if (!firstOf.has(key)) firstOf.set(key, `${a.id}>${to}`);
        }
      }
      const pointed = [...want, ...[...firstOf.values()].map((line) => `attack ${line}`)];
      // The real pointer, near the card's left edge (the part a squeezed
      // line leaves showing). Not locator.hover(): a flyer bobs, so it is
      // never "stable".
      const box = expected.boxes.get(lead)!;
      await page.mouse.move(box.x + 16, box.y + box.h / 2);
      expect(
        await page.evaluate(
          ([x, y]) =>
            document.elementFromPoint(x!, y!)?.closest<HTMLElement>("[data-object-id]")?.dataset
              .objectId,
          [box.x + 16, box.y + box.h / 2],
        ),
        `${what}: the pointer is on ${lead}`,
      ).toBe(lead);
      await expect
        .poll(async () => (await readLines()).map((l) => `${l.kind} ${l.from}>${l.to}`).sort(), {
          timeout: 5_000,
          message: `${what}: pointing at ${lead}`,
        })
        .toEqual(pointed.sort());
      checkEnds(await readLines());
      await page.mouse.move(viewport.width / 2, 40);
      await expect
        .poll(async () => (await readLines()).length, { timeout: 5_000 })
        .toBe(want.length);
    }
  }
  expect(problems, "browser reported errors").toEqual([]);
});
