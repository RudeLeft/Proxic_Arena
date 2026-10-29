// Lines and combat effects — BATTLEFIELD_RENDERING.md §5.5 and §7 step 5;
// PHASE 7 AMENDMENTS 4 and 7.
//
// Pure geometry, like layout() and motion.ts: where each relationship line
// starts and ends, its curve, and where an attacker lands when combat
// damage is dealt. The shapes are the PixiJS mock's
// (`proxic-arena-spike-10`: attack-, block-, target- and
// attach-presentation.mjs), ported to plain points for SVG. Nothing here
// decides what attacks, blocks or targets what: that is Forge's, and
// arrives as data (§7.61 B3, B4, B13).

import type { Box, Geometry } from "./layout";
import type { Point } from "./motion";

/** Stacking, between the battlefield (up to ~2000) and the hand (10000). */
export const Z_SWOOP = 4500;
export const Z_LINES = 5000;
export const Z_EFFECTS = 6000;

/** The swoop: out, a beat on the target, back (AMENDMENT 4 item 2). */
export const SWOOP_MS = 650;
export const SWOOP_ARRIVE = 0.4; // fraction of SWOOP_MS when it lands
export const SWOOP_LEAVE = 0.6; // ...and when it starts back
export const NUMBER_MS = 1000; // the damage number (AMENDMENT 7 item 5)

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

export function pathOf(c: Curve): string {
  const n = (v: number) => Math.round(v * 10) / 10;
  return `M ${n(c.start.x)} ${n(c.start.y)} C ${n(c.c1.x)} ${n(c.c1.y)}, ${n(c.c2.x)} ${n(c.c2.y)}, ${n(c.end.x)} ${n(c.end.y)}`;
}

/** The direction the curve arrives in, at its end. */
function arrival(c: Curve): Point {
  const dx = c.end.x - c.c2.x;
  const dy = c.end.y - c.c2.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return { x: dx / len, y: dy / len };
}

/** The fire line's arrowhead (the mock's attackArrow), scaled to `size`. */
export function arrowHead(c: Curve, size: number): string {
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

// --- the swoop (AMENDMENT 4 item 2, AMENDMENT 7 items 6-8) --------------------

/**
 * Where an attacker is drawn at the moment its combat damage lands:
 * covering about half of what it hits. One blocker: over the blocker's
 * near half. Several: between them, over the inner half of each. A player
 * or something in the rail: its near edge on that point. It keeps its
 * size and its tilt; only its place changes.
 */
export function swoopBox(
  attacker: Box,
  origin: { x: number; y: number },
  hit: { boxes: Box[]; point?: undefined } | { boxes?: undefined; point: Point },
): Box {
  const from = centreOf(attacker, origin);
  let to: Point;
  if (hit.point) {
    // A player's life total (or anything in the rail): straight at it,
    // stopping with the card's near edge on it.
    const dx = from.x - hit.point.x;
    const dy = from.y - hit.point.y;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const reach = attacker.h / 2;
    to = { x: hit.point.x + (dx / len) * reach, y: hit.point.y + (dy / len) * reach };
  } else {
    // Permanents: straight across the table, as a card is pushed into
    // another -- centred over the target (or between several), its near
    // edge halfway down them, so it covers half of one, or the inner half
    // of each of two side by side.
    const centres = hit.boxes.map((b) => centreOf(b, origin));
    const aim = {
      x: centres.reduce((n, c) => n + c.x, 0) / centres.length,
      y: centres.reduce((n, c) => n + c.y, 0) / centres.length,
    };
    const reach = (hit.boxes[0]!.h + attacker.h) / 4;
    to = { x: aim.x, y: aim.y + (from.y <= aim.y ? -reach : reach) };
  }
  return { ...attacker, x: attacker.x + (to.x - from.x), y: attacker.y + (to.y - from.y) };
}

// --- the stack, as cards (owner 2026-10-21) -----------------------------------

/** How much bigger than a battlefield card a spell on the stack is drawn. */
export const STACK_SCALE = 1.5;
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
export function stackSpotBoxes(g: Geometry, count: number): Box[] {
  if (count <= 0) return [];
  const w = g.cardW * STACK_SCALE;
  const h = g.cardH * STACK_SCALE;
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
    scale: STACK_SCALE,
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
