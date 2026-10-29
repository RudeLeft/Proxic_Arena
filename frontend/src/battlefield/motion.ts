// Movement on the battlefield — BATTLEFIELD_RENDERING.md §5.1, §5.7 and §7
// step 4; PHASE_07 §7.34-§7.36, PHASE 7 AMENDMENTS 4 and 6.
//
// Pure geometry, like layout(): where each card is drawn (as a CSS
// transform), the clip that tucks a tilted card's corners under the next
// band of rows, where the zones in the rail are (cards travel to and from
// them), and where a pointed-at hand card rises to. The Board only applies
// what these return; the timing is CSS's and the Web Animations API's.

import type { Box, Geometry, RowId, Side } from "./layout";

/** How long a move takes (owner decision 2026-10-20, AMENDMENT 6). */
export const MOVE_MS = 250;
/** The curve: quick to start, gentle to land. */
export const MOVE_EASING = "cubic-bezier(0.2, 0.7, 0.2, 1)";
/** How small a card is at a rail zone, as it arrives there or leaves it. */
export const AT_ZONE_SCALE = 0.3;
/** A pointed-at hand card is drawn this much larger (AMENDMENT 6). */
export const HAND_ZOOM = 2;

export interface Point {
  x: number;
  y: number;
}

/** The transform that draws a card of cardW x cardH where `box` says, with
 * scale and rotation about `origin` (fractions of the card). */
export function placement(
  box: Box,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
): { transform: string; transformOrigin: string } {
  const ox = origin.x * cardW;
  const oy = origin.y * cardH;
  const tx = box.x - ox * (1 - box.scale);
  const ty = box.y - oy * (1 - box.scale);
  return {
    transformOrigin: `${ox}px ${oy}px`,
    transform: `translate3d(${tx}px, ${ty}px, 0) rotate(${box.rotation}deg) scale(${box.scale})`,
  };
}

// --- the band clip (AMENDMENT 4) ----------------------------------------------

/**
 * A CSS `clip-path: polygon(...)` that keeps only the part of the card
 * whose DRAWN position lies between `top` and `bottom` (board px).
 *
 * clip-path is in the card's own, untransformed coordinates and moves with
 * it, so the band's two horizontal lines are mapped back through the
 * card's transform: each becomes a straight line across the card, and the
 * card's rectangle (grown by `margin` so a ring or shadow at the sides
 * survives) is cut by the two. Because it rides with the card, a card on
 * its way somewhere is never cut in half by a band it passes through.
 */
export function bandClip(
  box: Box,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  top: number,
  bottom: number,
  margin = 8,
): string {
  const ox = origin.x * cardW;
  const oy = origin.y * cardH;
  const ty = box.y - oy * (1 - box.scale);
  const t = (box.rotation * Math.PI) / 180;
  // Drawn y of the local point (x, y): ty + oy + s * (sin t (x - ox) + cos t (y - oy)).
  const drawnY = (x: number, y: number) =>
    ty + oy + box.scale * (Math.sin(t) * (x - ox) + Math.cos(t) * (y - oy));
  let poly: [number, number][] = [
    [-margin, -margin],
    [cardW + margin, -margin],
    [cardW + margin, cardH + margin],
    [-margin, cardH + margin],
  ];
  // drawnY is linear in (x, y), so each edge crossing is found exactly.
  const cut = (keep: (v: number) => boolean, line: number) => {
    const out: [number, number][] = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      const va = drawnY(a[0], a[1]);
      const vb = drawnY(b[0], b[1]);
      if (keep(va)) out.push(a);
      if (keep(va) !== keep(vb)) {
        const k = (line - va) / (vb - va);
        out.push([a[0] + k * (b[0] - a[0]), a[1] + k * (b[1] - a[1])]);
      }
    });
    poly = out;
  };
  cut((v) => v >= top, top);
  cut((v) => v <= bottom, bottom);
  return `polygon(${poly.map(([x, y]) => `${round(x)}px ${round(y)}px`).join(", ")})`;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** The band a row is in: the rows that share its height on the board. */
export function bandOf(g: Geometry, row: RowId): { top: number; bottom: number } {
  const r = g.rows[row];
  return { top: r.y, bottom: r.y + r.h };
}

// --- the rail's zones (from the canvas, AMENDMENT 6) --------------------------

export type ZoneName = "library" | "graveyard" | "exile" | "hand" | "life";
export type AnchorId = `${Side}:${ZoneName}` | "stack";

// As built (game.css, spec 0029's plates), in the rail's 900-pixel units:
// a plate is 216 wide from x 7.4, with a 2 px top border, 1 px sides and
// 10 px padding; a 56 px head (life in the banner at its right); 10 px;
// then 52 px tiles, two a row, 6 px apart. Both plates (opponent's at y
// 96, viewer's at 656) read Library across the row, then Graveyard /
// Exile (spec 0031: the opponent's hand is drawn on the board instead).
// The stack is between them.
const PANEL_X = 7.4 / 900; // a plate's left edge, from the rail's
const PANEL_W = 216 / 900;
const PLATE_TOP: Record<Side, number> = { opponent: 96, viewer: 656 };
const INNER_X = 7.4 + 1 + 10;
const TILE_W = (216 - 2 - 20 - 6) / 2;
const COLUMN_X = [INNER_X + TILE_W / 2, INNER_X + TILE_W + 6 + TILE_W / 2, INNER_X + TILE_W + 3];
const TILES_Y = 2 + 10 + 56 + 10;
const ROW_Y = [TILES_Y + 26, TILES_Y + 52 + 6 + 26];
/** Each zone's tile, as [row, column]; column 2 is a tile across the whole row. */
const TILE: Record<Side, Partial<Record<ZoneName, [number, number]>>> = {
  opponent: { library: [0, 2], graveyard: [1, 0], exile: [1, 1] },
  viewer: { library: [0, 2], graveyard: [1, 0], exile: [1, 1] },
};
const STACK_Y = 424 / 900;
// The life banner (46 x 54 at the head's right): its centre, and the
// radius lines and hits stop at, so they meet its edge, not its number.
const LIFE_X = (7.4 + 216 - 1 - 10 - 23) / 900;
const LIFE_Y = 2 + 10 + 28;
export const LIFE_R = 27 / 900;

/** Where each zone is on the board: a card travels to or from here. */
export function anchors(g: Geometry): Record<AnchorId, Point> {
  const h = g.height;
  const x = g.rail.x + (PANEL_X + PANEL_W / 2) * h;
  const out = { stack: { x, y: STACK_Y * h } } as Record<AnchorId, Point>;
  for (const side of ["viewer", "opponent"] as const) {
    const top = PLATE_TOP[side];
    out[`${side}:life`] = { x: g.rail.x + LIFE_X * h, y: ((top + LIFE_Y) / 900) * h };
    for (const [zone, [row, column]] of Object.entries(TILE[side]) as [
      ZoneName,
      [number, number],
    ][]) {
      out[`${side}:${zone}`] = {
        x: g.rail.x + (COLUMN_X[column]! / 900) * h,
        y: ((top + ROW_Y[row]!) / 900) * h,
      };
    }
  }
  // Hands: the viewer's fans along the bottom; the opponent's down from
  // the top edge, its mirror (spec 0031).
  const mid = g.play.x + g.play.w / 2;
  out["viewer:hand"] = { x: mid, y: g.handTop + g.cardH / 2 };
  out["opponent:hand"] = { x: mid, y: g.height - g.handTop - g.cardH / 2 };
  return out;
}

/** The box that puts a card's centre on `at`, small. */
export function boxAt(at: Point, g: Geometry): Box {
  const w = g.cardW * AT_ZONE_SCALE;
  const h = g.cardH * AT_ZONE_SCALE;
  return { x: at.x - w / 2, y: at.y - h / 2, w, h, scale: AT_ZONE_SCALE, rotation: 0, z: 0 };
}

// --- the pointed-at hand card (AMENDMENT 6) -----------------------------------

/**
 * Where a hand card goes while it is pointed at: upright, HAND_ZOOM times
 * the size, its bottom edge on the board's bottom inset so the whole card
 * shows, centred over where it was and kept inside the play area.
 */
export function handZoomBox(rest: Box, g: Geometry): Box {
  const w = g.cardW * HAND_ZOOM;
  const h = g.cardH * HAND_ZOOM;
  const centre = rest.x + rest.w / 2;
  const left = Math.min(
    Math.max(centre - w / 2, g.play.x + g.inset),
    g.play.x + g.play.w - g.inset - w,
  );
  return {
    x: left,
    y: g.height - g.inset - h,
    w,
    h,
    scale: HAND_ZOOM,
    rotation: 0,
    z: rest.z + 1000,
  };
}
