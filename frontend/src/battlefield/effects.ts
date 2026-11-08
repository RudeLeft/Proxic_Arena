// Lines and combat effects — BATTLEFIELD_RENDERING.md §5.5 and §7 step 5;
// PHASE 7 AMENDMENTS 4 and 7.
//
// Pure geometry, like layout() and motion.ts: where each relationship line
// starts and ends, and its curve. The shapes are the PixiJS mock's
// (`proxic-arena-spike-10`: attack-, block-, target- and
// attach-presentation.mjs), ported to plain points for SVG. (AMENDMENT 7's
// swoop is gone: Phase 10 A-13 plays combat one fight at a time, in
// fights.ts.) Nothing here decides what attacks, blocks or targets what:
// that is Forge's, and arrives as data (§7.61 B3, B4, B13).

import type { Box, Geometry, Slot } from "./layout";
import type { Point } from "./motion";

/** Stacking, between the battlefield (up to ~2000) and the hand (10000). */
/** A card selected to attack or block (W-14): lifted over its neighbours,
    so its seal shows (Amendment 13, item 10); under the lines. */
export const Z_MARKED = 4400;
export const Z_LINES = 5000;
export const Z_EFFECTS = 6000;

/** A spell's damage number (AMENDMENT 7 item 5). Combat's fights are fights.ts
 * (Phase 10 A-13), which replaced AMENDMENT 7's swoop. */
export const NUMBER_MS = 1000;

/** What a line or a hit points at: a permanent, or a player. */
export type TargetRef = { object: string } | { player: number };

/**
 * The colours of each line (owner 2026-10-21, MTG Arena-style): one family
 * of clean, glowing arrows -- gold for a spell's target, ember for an
 * attack, steel blue for a block, copper for an attachment.
 */
export const LINE_THEME = {
  attack: { aura: "#ff5a1f", body: "#ff7a3d", core: "#ffe1c4" },
  block: { aura: "#3aa8ff", body: "#6cc6ff", core: "#e4f5ff" },
  target: { aura: "#f0a830", body: "#f4c25e", core: "#fff4d6" },
  attach: { aura: "#b9782f", body: "#d6a15c", core: "#ffdfac" },
  // Spec 0028 — an ability on the stack, back to the permanent it came from: faint.
  source: { aura: "#5c6472", body: "#8a8f98", core: "#d8dde4" },
} as const;
export type LineKind = keyof typeof LINE_THEME;

/** A point of a card in its own fractions (0..1), where it is drawn. */
export function pointOn(box: Box, origin: { x: number; y: number }, fx: number, fy: number): Point {
  const px = box.x + origin.x * box.w;
  const py = box.y + origin.y * box.h;
  const t = (box.rotation * Math.PI) / 180;
  const dx = box.x + fx * box.w - px;
  const dy = box.y + fy * box.h - py;
  return {
    x: px + dx * Math.cos(t) - dy * Math.sin(t),
    y: py + dx * Math.sin(t) + dy * Math.cos(t),
  };
}

export const centreOf = (box: Box, origin: { x: number; y: number }) =>
  pointOn(box, origin, 0.5, 0.5);

export interface Curve {
  start: Point;
  c1: Point;
  c2: Point;
  end: Point;
}

/**
 * A line's curve. Each kind bends as the mock's did; `lane` spreads
 * several lines into one object apart (the mock's lanes).
 */
export function curve(kind: LineKind, start: Point, end: Point, lane = 0): Curve {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / dist;
  const ny = dx / dist;
  if (kind === "attach" || kind === "source") {
    const bend = Math.min(40, dist * 0.08);
    return {
      start,
      c1: { x: start.x + dx * 0.32 + nx * bend, y: start.y + dy * 0.32 + ny * bend },
      c2: { x: start.x + dx * 0.68 + nx * bend, y: start.y + dy * 0.68 + ny * bend },
      end,
    };
  }
  const bend =
    kind === "block"
      ? Math.min(70, dist * 0.085) + lane * 41
      : Math.min(95, dist * 0.11) + lane * 75;
  const back = kind === "block" ? 0.7 : 0.72;
  return {
    start,
    c1: { x: start.x + dx * 0.33 + nx * bend, y: start.y + dy * 0.33 + ny * bend },
    c2: { x: start.x + dx * back - nx * bend * 0.35, y: start.y + dy * back - ny * bend * 0.35 },
    end,
  };
}

export function pathOf(c: Curve | Route): string {
  const pieces: Route = "start" in c ? [c] : c;
  const n = (v: number) => Math.round(v * 10) / 10;
  const first = pieces[0]!;
  return (
    `M ${n(first.start.x)} ${n(first.start.y)}` +
    pieces
      .map(
        (p) =>
          ` C ${n(p.c1.x)} ${n(p.c1.y)}, ${n(p.c2.x)} ${n(p.c2.y)}, ${n(p.end.x)} ${n(p.end.y)}`,
      )
      .join("")
  );
}

// --- spec 0063: "ride the middle" (owner 2026-11-07, curve B) ---------------

/**
 * A line made of cubic pieces end to end (each piece starts where the one
 * before ends, in the direction it ended in).
 */
export type Route = readonly Curve[];

/**
 * One end of a line: where it is, and `out`, the unit direction pointing
 * away from what it belongs to -- the way the line leaves a start, and the
 * way a line comes in from at an end (it then travels along -out).
 */
export interface Port {
  at: Point;
  out: Point;
}

/** How long, in card heights, a line takes to turn from a card's edge into the middle. */
export const RIDE_ELBOW = 0.36;
/** How far off its target a line's tip stops, in card heights (a hair's gap, as the canvas). */
export const TIP_GAP = 0.03;

/**
 * A card's edge facing the middle of the table -- the top edge of a card on
 * your side, the bottom edge on the other -- at its middle, on the frame
 * (tilt included), and the way out of it, toward the middle. `off` moves
 * it that far out (a line's tip stops a hair off the card).
 */
export function facingPort(
  box: Box,
  origin: { x: number; y: number },
  middle: number,
  off = 0,
  share = 1,
): Port {
  const below = centreOf(box, origin).y > middle;
  const at = pointOn(box, origin, share / 2, below ? 0 : 1);
  const out = { x: 0, y: below ? -1 : 1 };
  return { at: { x: at.x + out.x * off, y: at.y + out.y * off }, out };
}

/**
 * How much of a card shows, from its left, in a line squeezed so tight
 * that the next card covers its right side (1: all of it): a line leaves
 * the middle of the edge that shows (`facingPort`'s `share`).
 */
export function shownShare(slots: readonly Slot[], lead: string): number {
  const slot = slots.find((s) => s.ids[0] === lead);
  if (!slot) return 1;
  const { x, w } = slot.box;
  let next = x + w;
  for (const other of slots) {
    if (other.row === slot.row && other.box.x > x + 0.5) next = Math.min(next, other.box.x);
  }
  return Math.max(0.1, Math.min(1, (next - x) / w));
}

/**
 * A life circle (centre `ring`), from the table's side: a line comes in
 * from where it leaves the middle (the play area's edge, `g.rail.x`) and
 * stops `off` from the centre -- outside the circle, never over the total.
 */
export function lifePort(ring: Point, g: Geometry, off: number): Port {
  const dx = g.rail.x - ring.x;
  const dy = g.height / 2 - ring.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  const out = { x: dx / len, y: dy / len };
  return { at: { x: ring.x + out.x * off, y: ring.y + out.y * off }, out };
}

const straight = (a: Point, b: Point): Curve => ({
  start: a,
  c1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
  c2: { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 },
  end: b,
});

/**
 * Spec 0063, curve B (the canvas "arrows-1107"): a line leaves its card's
 * edge straight out, turns into the open strip along the middle of the
 * table (y = `middle`, between the two front lines), rides it, and turns
 * out of it to land straight onto its end. Each card's turn is the same
 * shape, decided only by where the card and its target are, so the same
 * board always draws the same line, and lines from one row to one target
 * all join the same ride (they meet, never cross). `via`, if given, is
 * where along the middle the landing begins (a player's life circle, in
 * the rail: the line leaves the middle at the play area's edge); else the
 * landing turns in from the middle toward the end's edge as the start's
 * turn does. `cardH` scales the turns.
 */
export function ride(start: Port, end: Port, middle: number, cardH: number, via?: number): Route {
  const s = start.at;
  const e = end.at;
  const vertical = (p: Port) => Math.abs(p.out.y) > 0.7;
  const goal = via ?? e.x;
  const h = Math.sign(goal - s.x) || 1;
  const room = Math.max(0, h * (goal - s.x));
  const vEnd = Math.abs(e.y - middle);
  // Each turn wants RIDE_ELBOW of a card height along the middle (more for
  // a far edge); when the two ends are closer than that, they share it.
  let e1 = RIDE_ELBOW * cardH;
  let e2 = via === undefined ? Math.max(RIDE_ELBOW * cardH, vEnd * 0.6) : 0;
  if (e1 + e2 > room) {
    const k = room / Math.max(0.001, e1 + e2);
    e1 *= k;
    e2 *= k;
  }
  const p1 = { x: s.x + h * e1, y: middle };
  const p2 = { x: goal - h * e2, y: middle };
  const lead = vertical(start) ? Math.abs(middle - s.y) * 0.55 : e1 * 0.45;
  const pieces: Curve[] = [
    {
      start: s,
      c1: { x: s.x + start.out.x * lead, y: s.y + start.out.y * lead },
      c2: { x: p1.x - h * e1 * 0.55, y: middle },
      end: p1,
    },
  ];
  if (Math.abs(p2.x - p1.x) > 0.5) pieces.push(straight(p1, p2));
  if (via === undefined) {
    const tail = vertical(end) ? vEnd * 0.55 : e2 * 0.45;
    pieces.push({
      start: p2,
      c1: { x: p2.x + h * e2 * 0.55, y: middle },
      c2: { x: e.x + end.out.x * tail, y: e.y + end.out.y * tail },
      end: e,
    });
  } else {
    // Into a life circle: out of the middle, then straight along `out`.
    const far = Math.hypot(e.x - p2.x, e.y - p2.y);
    pieces.push({
      start: p2,
      c1: { x: p2.x + h * Math.abs(e.x - p2.x) * 0.5, y: middle },
      c2: { x: e.x + end.out.x * far * 0.45, y: e.y + end.out.y * far * 0.45 },
      end: e,
    });
  }
  return pieces;
}

/** A plain line that leaves `start` straight out and lands straight along `end.out`. */
export function swing(start: Port, end: Port): Route {
  const s = start.at;
  const e = end.at;
  const d = Math.hypot(e.x - s.x, e.y - s.y) * 0.35;
  return [
    {
      start: s,
      c1: { x: s.x + start.out.x * d, y: s.y + start.out.y * d },
      c2: { x: e.x + end.out.x * d, y: e.y + end.out.y * d },
      end: e,
    },
  ];
}

const bez = (c: Curve, t: number): Point => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const f = t * t * t;
  return {
    x: a * c.start.x + b * c.c1.x + d * c.c2.x + f * c.end.x,
    y: a * c.start.y + b * c.c1.y + d * c.c2.y + f * c.end.y,
  };
};

/** Points along a route, `per` to a piece (its ends included). */
export function routePoints(r: Route, per = 24): Point[] {
  const out: Point[] = [r[0]!.start];
  for (const c of r) for (let i = 1; i <= per; i++) out.push(bez(c, i / per));
  return out;
}

/** The point `share` (0..1) of the way along a route, by length. */
export function routeAt(r: Route, share: number): Point {
  const pts = routePoints(r);
  const lengths = [0];
  for (let i = 1; i < pts.length; i++)
    lengths.push(
      lengths[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y),
    );
  const want = lengths[lengths.length - 1]! * share;
  const i = Math.max(
    1,
    lengths.findIndex((l) => l >= want),
  );
  const span = Math.max(0.001, lengths[i]! - lengths[i - 1]!);
  const t = (want - lengths[i - 1]!) / span;
  return {
    x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * t,
    y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * t,
  };
}

/**
 * The route with its last piece stopping `by` short of its tip, along the
 * way it arrives: the body ends under the arrowhead, so the head (not the
 * stroke's round cap) makes the point.
 */
export function trimmed(r: Route, by: number): Route {
  const last = r[r.length - 1]!;
  const u = arrival(last);
  return [
    ...r.slice(0, -1),
    { ...last, end: { x: last.end.x - u.x * by, y: last.end.y - u.y * by } },
  ];
}

/** The direction the curve arrives in, at its end. */
function arrival(c: Curve): Point {
  let dx = c.end.x - c.c2.x;
  let dy = c.end.y - c.c2.y;
  if (Math.hypot(dx, dy) < 0.001) {
    dx = c.end.x - c.c1.x;
    dy = c.end.y - c.c1.y;
  }
  if (Math.hypot(dx, dy) < 0.001) {
    dx = c.end.x - c.start.x;
    dy = c.end.y - c.start.y;
  }
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return { x: dx / len, y: dy / len };
}

/** The fire line's arrowhead (the mock's attackArrow), scaled to `size`:
 * the same size on every line, along the curve's own direction at its tip. */
export function arrowHead(route: Curve | Route, size: number): string {
  const c = "start" in route ? route : route[route.length - 1]!;
  const u = arrival(c);
  const p = { x: -u.y, y: u.x };
  const back = { x: c.end.x - u.x * size, y: c.end.y - u.y * size };
  const half = size / 2;
  const pts = [
    c.end,
    { x: back.x + p.x * half, y: back.y + p.y * half },
    { x: back.x - u.x * size * 0.3, y: back.y - u.y * size * 0.3 },
    { x: back.x - p.x * half, y: back.y - p.y * half },
  ];
  return pts.map((q) => `${Math.round(q.x * 10) / 10},${Math.round(q.y * 10) / 10}`).join(" ");
}

// --- the stack, as cards (owner 2026-10-21) -----------------------------------

/** How much bigger than a battlefield card a spell on the stack is drawn. */
export const STACK_SCALE = 1.5;
/**
 * Phase 9 W-20 (owner 2026-11-02, option A) -- the stack drawn readable:
 * the whole card, the close-up's size. Only while nothing is to be chosen
 * on the table; then the stack steps back to STACK_SCALE, off what might
 * be clicked under it.
 */
export const STACK_READ_SCALE = 3;
/** How much of each card behind the front one shows: its name bar and a little art. */
export const STACK_PEEK = 0.2;
/** The least of it that may show when a tall stack has to tighten: the name bar. */
export const STACK_PEEK_MIN = 0.12;

/**
 * Spec 0028 — where the stack's objects are drawn while they wait: a
 * cascade at the right edge of the play area. The object that resolves
 * next is the front card, lowest; each one under it on the stack sits
 * higher, behind it, so its name bar shows. Every object is drawn, all
 * the same size. A tall stack tightens towards STACK_PEEK_MIN; past what
 * still fits between the turn track and the hand, the oldest are left
 * out (the caption counts them). Centred on the board's middle line when
 * there is room. The boxes come top-of-stack first, as the stack does.
 */
export function stackSpotBoxes(g: Geometry, count: number, scale = STACK_SCALE): Box[] {
  if (count <= 0) return [];
  const w = g.cardW * scale;
  const h = g.cardH * scale;
  const right = g.play.x + g.play.w - g.inset * 2;
  // Between the turn track (the top tenth) and the hand.
  const top = g.height * 0.1;
  const bottom = Math.max(top + h, g.handTop - g.inset);
  const room = bottom - top;
  const most = Math.max(1, Math.floor((room - h) / (h * STACK_PEEK_MIN)) + 1);
  const shown = Math.min(count, most);
  const peek =
    shown > 1
      ? Math.min(h * STACK_PEEK, Math.max(h * STACK_PEEK_MIN, (room - h) / (shown - 1)))
      : 0;
  const total = h + peek * (shown - 1);
  const y0 = Math.min(Math.max(g.height / 2 - total / 2, top), bottom - total);
  return Array.from({ length: shown }, (_, i) => ({
    x: right - w,
    y: y0 + (shown - 1 - i) * peek,
    w,
    h,
    scale,
    rotation: 0,
    z: 0,
  }));
}

/** Where a line from inside an upright box toward `toward` leaves its edge. */
export function rectEdge(box: Box, toward: Point): Point {
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const t = Math.min(
    dx === 0 ? Infinity : box.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : box.h / 2 / Math.abs(dy),
  );
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Where a line toward a circle's centre meets its edge (a life total). */
export function ringEdge(centre: Point, from: Point, r: number): Point {
  const dx = from.x - centre.x;
  const dy = from.y - centre.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return { x: centre.x + (dx / len) * r, y: centre.y + (dy / len) * r };
}

/** Where a player's life total is, for lines and hits that point at them. */
export function playerPoint(seat: number, viewerSeat: number, where: Record<string, Point>): Point {
  return where[`${seat === viewerSeat ? "viewer" : "opponent"}:life`]!;
}

/** How big the impact burst and the damage number are, from the card. */
export function effectSizes(g: Geometry) {
  return {
    burst: g.cardW, // AMENDMENT 7 item 4: about a card wide
    number: g.cardH * 0.22,
    line: Math.max(2, g.cardH * 0.035),
  };
}
