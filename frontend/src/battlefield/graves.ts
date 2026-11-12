// Spec 0074 (owner 2026-11-12, on the canvas "grave-1112") -- discards,
// mills, countered spells, and cards leaving a graveyard or exile.
//
// Pure, like motion.ts and piles.ts: the approved canvas's numbers and the
// frames they make. The Board decides what moved (from the game's moves and
// the boards it drew); these say how it looks.
//
//   Discarded, A · Lift and drop: the card lifts out of the hand (A-14's
//   lift) and drops, face up and whole, into its owner's graveyard tile;
//   the other player's leaves the middle of his fan as a back and turns
//   face up on the way. Several, one after another.
//   Milled, C · Stream: cards slide off the library tile one after another,
//   turn face up beside the plate and drop into the graveyard; after ten,
//   the rest go together as one bundle.
//   Countered, F · Struck by the beam: the countering spell's beam flares, a
//   pulse runs down it, the spell drains to grey and crumbles to ash, then
//   goes to its graveyard.
//   Out of a graveyard or exile, H · Rise and show: the card rises out of
//   its tile, stops enlarged so it can be read, then glides where it goes
//   (turning face down into a hidden hand or a library). A whole graveyard
//   exiled at once is swept to the exile tile as one.
//
// Positions here are a card's CENTRE, its scale and rotation; poseTransform
// turns one into the transform of a card element that turns about `origin`.
// The canvas's distances are in its 720-pixel-high table's pixels (its card
// is 112 high), scaled to the real board by `k` (board height / 720) and to
// the real card by its height.

import type { Box } from "./layout";
import { cubicBezier, MOVE_MS, placement, type Point } from "./motion";

/** A card drawn at a moment: centre, rotation, scale (sx squeezes it edge-on), opacity, filter. */
export interface Pose {
  x: number;
  y: number;
  r: number;
  s: number;
  sx?: number;
  o: number;
  filter?: string;
}

const ease = cubicBezier(0.4, 0, 0.2, 1);
const easeOut = cubicBezier(0, 0, 0.2, 1);
const S = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** The canvas table's height: its numbers are scaled by board height / this. */
export const CANVAS_H = 720;

/** Where a box's card centre is, with its scale and rotation. */
export function poseOf(box: Box, origin: { x: number; y: number }): Pose {
  const px = box.x + origin.x * box.w;
  const py = box.y + origin.y * box.h;
  const t = (box.rotation * Math.PI) / 180;
  const dx = box.w / 2 - origin.x * box.w;
  const dy = box.h / 2 - origin.y * box.h;
  return {
    x: px + dx * Math.cos(t) - dy * Math.sin(t),
    y: py + dx * Math.sin(t) + dy * Math.cos(t),
    r: box.rotation,
    s: box.scale,
    o: 1,
  };
}

/**
 * The transform that draws a cardW x cardH element, turning about `origin`
 * (fractions of the card), with its centre at the pose's (x, y).
 */
export function poseTransform(
  p: Pose,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
): string {
  const ox = origin.x * cardW;
  const oy = origin.y * cardH;
  const sx = (p.sx ?? 1) * p.s;
  const sy = p.s;
  const a = (p.r * Math.PI) / 180;
  const vx = (cardW / 2 - ox) * sx;
  const vy = (cardH / 2 - oy) * sy;
  const tx = p.x - (ox + vx * Math.cos(a) - vy * Math.sin(a));
  const ty = p.y - (oy + vx * Math.sin(a) + vy * Math.cos(a));
  return `translate3d(${tx}px, ${ty}px, 0) rotate(${p.r}deg) scale(${sx}, ${sy})`;
}

/**
 * Keyframes of one movement over `duration`, sampled every `step` ms (and at
 * each of `marks`): `at(ms)` says where the card is. Run linear over the
 * duration. `last`, when given, is the exact final transform (a card landing
 * where the layout puts it).
 */
export function track(
  duration: number,
  at: (ms: number) => Pose,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  marks: readonly number[] = [],
  last?: string,
  step = 20,
): Keyframe[] {
  const times = new Set<number>([0, duration, ...marks.filter((m) => m > 0 && m < duration)]);
  for (let ms = step; ms < duration; ms += step) times.add(ms);
  const sorted = [...times].sort((a, b) => a - b);
  return sorted.map((ms) => {
    const p = at(ms);
    const frame: Keyframe = {
      offset: duration ? ms / duration : 1,
      transform: ms === duration && last ? last : poseTransform(p, cardW, cardH, origin),
      opacity: p.o,
    };
    if (p.filter !== undefined) frame["filter"] = p.filter;
    return frame;
  });
}

/** The two halves of a card turning over: the side seen before the turn, and after. */
export type Side2 = "before" | "after";
/** How far either side of edge-on both sides of a turning card are seen. */
const EDGE_OVERLAP = 0.06;
/** Turning over between `a` and `b` (0..1 of a phase): squeezed edge-on, one side at a time. */
function turning(q: number, half: Side2): { sx: number; seen: boolean } {
  const t = Math.max(0, Math.min(1, q));
  return {
    sx: Math.max(0.02, Math.abs(Math.cos(Math.PI * t))),
    // Both sides are seen for a moment while edge-on (a sliver, under a
    // fifth of the card wide): one card turning over, never a frame with
    // neither -- the jump check reads that as the card going and another
    // coming.
    seen: half === "before" ? t < 0.5 + EDGE_OVERLAP : t >= 0.5 - EDGE_OVERLAP,
  };
}

// --- A · Lift and drop (discarded) ----------------------------------------------

/** The lift (A-14's: 12 of the canvas card's 134 pixels, growing to 1.05), then the drop. */
export const DISCARD_LIFT_MS = 180;
export const DISCARD_DROP_MS = 520;
export const DISCARD_MS = DISCARD_LIFT_MS + DISCARD_DROP_MS;
/** Several discards: each this far behind the one before. */
export const DISCARD_BEAT_MS = 120;
const DISCARD_RISE = 12 / 134;
const DISCARD_GROW = 1.05;
/** The drop's arc, in the canvas card's 50/134; the other player's bows down toward the table. */
const DISCARD_ARC = 50 / 134;
const DISCARD_ARC_THEIRS = -2.4;
/** The other player's card turns face up between these shares of the drop. */
const DISCARD_TURN = [0.1, 0.4] as const;

/**
 * One discard, from its place in a hand (`from`) to its owner's graveyard
 * tile (`to`). `theirs`: from the other player's fan at the top (it lifts
 * down, toward the table, and bows down); `half`: for their hidden card, the
 * back ("before", narrowing away) or the face ("after", widening in) --
 * omitted, the card is face up all the way.
 */
export function discardPose(
  ms: number,
  from: Pose,
  to: Pose,
  cardH: number,
  theirs: boolean,
  half?: Side2,
): Pose {
  const h = cardH * from.s;
  const rise = DISCARD_RISE * h * (theirs ? 1 : -1);
  if (ms < DISCARD_LIFT_MS) {
    const p = easeOut(ms / DISCARD_LIFT_MS);
    return {
      x: from.x,
      y: from.y + rise * p,
      r: from.r,
      s: from.s * (1 + (DISCARD_GROW - 1) * p),
      o: half === "after" ? 0 : 1,
    };
  }
  const p = S(ms, DISCARD_LIFT_MS, DISCARD_MS);
  const e = ease(p);
  const k = theirs ? DISCARD_ARC_THEIRS : 1;
  const top = from.s * DISCARD_GROW;
  const s = theirs ? lerp(top, to.s, ease(S(p, 0.45, 1))) : lerp(top, to.s, e);
  const turn = half ? turning(S(p, DISCARD_TURN[0], DISCARD_TURN[1]), half) : null;
  const sink = 1 - S(p, 0.85, 1);
  return {
    x: lerp(from.x, to.x, e),
    y: lerp(from.y + rise, to.y, e) - k * DISCARD_ARC * h * Math.sin(Math.PI * e),
    r: lerp(from.r, to.r, e),
    s,
    ...(turn ? { sx: turn.sx } : {}),
    o: turn && !turn.seen ? 0 : sink,
  };
}

export function discardFrames(
  from: Pose,
  to: Pose,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  theirs: boolean,
  half?: Side2,
): Keyframe[] {
  const turnAt = DISCARD_LIFT_MS + DISCARD_TURN[0] * DISCARD_DROP_MS;
  const edge = DISCARD_LIFT_MS + ((DISCARD_TURN[0] + DISCARD_TURN[1]) / 2) * DISCARD_DROP_MS;
  return track(
    DISCARD_MS,
    (ms) => discardPose(ms, from, to, cardH, theirs, half),
    cardW,
    cardH,
    origin,
    [DISCARD_LIFT_MS, turnAt, edge - 0.5, edge + 0.5],
  );
}

// --- C · Stream (milled) ------------------------------------------------------------

/** Each card this far behind the one before (the canvas's 90 ms). */
export const MILL_BEAT_MS = 90;
/** Off the library to beside the plate, turning face up; then into the graveyard. */
export const MILL_OUT_MS = 300;
export const MILL_IN_MS = 420;
export const MILL_MS = MILL_OUT_MS + MILL_IN_MS;
/** This many go one by one; the rest go together as one bundle with its number. */
export const MILL_SHOWN = 10;
/** Its size beside the plate, of a table card. */
export const MILL_SCALE = 0.78;
const MILL_TURN = [0.25, 0.75] as const;

/** A-00's Glide in the canvas's form: eased, bowing up by 14% of the way, lifting up to 8%. */
function glideAt(a: Pose, b: Pose, p: number, cardH: number): Pose {
  const e = ease(p);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const lift = 0.08 * Math.min(1, d / (cardH * 2)) * Math.sin(Math.PI * e);
  return {
    x: a.x + dx * e,
    y: a.y + dy * e - 0.14 * d * Math.sin(Math.PI * e),
    r: lerp(a.r, b.r, e),
    s: lerp(a.s, b.s, e) * (1 + lift),
    o: 1,
  };
}

/**
 * Where the i-th milled card turns face up, beside the plate: the canvas's
 * (960, 215) for the player at the top, (960, 505) at the bottom, on its
 * 720-high table whose plates start at x 1092 -- a little apart from the
 * one before (every third card).
 */
export function millOut(i: number, railX: number, height: number, top: boolean): Point {
  const k = height / CANVAS_H;
  const down = top ? 1 : -1;
  return {
    x: railX - (1092 - 960) * k - (i % 3) * 6 * k,
    y: (top ? 215 : 505) * k + (i % 3) * 4 * k * down,
  };
}

/** One milled card: `half` "before" is its back (off the library), "after" its face. */
export function millPose(
  ms: number,
  library: Pose,
  out: Pose,
  graveyard: Pose,
  cardH: number,
  half: Side2,
): Pose {
  if (ms < MILL_OUT_MS) {
    const p = ms / MILL_OUT_MS;
    const g = glideAt(library, out, p, cardH);
    const t = turning(S(p, MILL_TURN[0], MILL_TURN[1]), half);
    return { ...g, sx: t.sx, o: t.seen ? 1 : 0 };
  }
  const p = S(ms, MILL_OUT_MS, MILL_MS);
  const g = glideAt(out, graveyard, p, cardH);
  return { ...g, o: half === "after" ? 1 - S(p, 0.85, 1) : 0 };
}

export function millFrames(
  library: Pose,
  out: Pose,
  graveyard: Pose,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  half: Side2,
): Keyframe[] {
  const edge = ((MILL_TURN[0] + MILL_TURN[1]) / 2) * MILL_OUT_MS;
  return track(
    MILL_MS,
    (ms) => millPose(ms, library, out, graveyard, cardH, half),
    cardW,
    cardH,
    origin,
    [edge - 0.5, edge + 0.5, MILL_OUT_MS],
  );
}

// --- F · Struck by the beam (countered) ---------------------------------------------

/** The pulse runs down the countering spell's beam. */
export const STRIKE_MS = 300;
/** Then the spell drains to grey and crumbles. */
export const ASH_MS = 600;
/** It sets off for its graveyard after the countering spell has resolved (380) and a beat. */
export const COUNTER_GO_MS = 380 + 40 + ASH_MS;
export const COUNTER_MS = COUNTER_GO_MS + MOVE_MS;
/** The beam: it flares (2.6 times as thick at most) and fades by this long. */
export const STRIKE_FX_MS = STRIKE_MS + 260;
const ASHEN = (p: number, grey: number) =>
  `grayscale(${grey}) brightness(${lerp(1, 0.62, ease(p))}) contrast(${lerp(1, 0.8, p)})`;

/** The countered spell, from its place on the stack (`from`) to its graveyard tile (`to`). */
export function counterPose(ms: number, from: Pose, to: Pose, cardH: number): Pose {
  if (ms < STRIKE_MS) return { ...from, o: 1, filter: ASHEN(0, 0) };
  const shrunk = from.s * (1 - 0.06 / 1.1);
  if (ms < COUNTER_GO_MS) {
    const v = ms - STRIKE_MS;
    const p = S(v, 0, ASH_MS);
    return {
      ...from,
      s: lerp(from.s, shrunk, ease(p)),
      o: 1 - 0.25 * p,
      filter: ASHEN(p, ease(S(v, 0, 300))),
    };
  }
  const p = S(ms, COUNTER_GO_MS, COUNTER_MS);
  const g = glideAt({ ...from, s: shrunk }, to, p, cardH);
  return { ...g, o: 0.75 * (1 - S(p, 0.85, 1)), filter: ASHEN(1, 1) };
}

export function counterFrames(
  from: Pose,
  to: Pose,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
): Keyframe[] {
  return track(
    COUNTER_MS,
    (ms) => counterPose(ms, from, to, cardH),
    cardW,
    cardH,
    origin,
    [STRIKE_MS, STRIKE_MS + ASH_MS, COUNTER_GO_MS],
    undefined,
    30,
  );
}

/** The beam's flare: how much thicker, at `ms` (the canvas's: 1 + 1.6 over its first 420 ms). */
export function strikeFlare(ms: number): number {
  const q = S(ms, 0, STRIKE_MS + 120);
  return 1 + 1.6 * (q <= 0 || q >= 1 ? 0 : Math.sin(Math.PI * q));
}

/** The beam's keyframes (stroke width `w`): flaring white-gold, then fading. */
export function strikeBeamFrames(w: number): Keyframe[] {
  const at = (ms: number) => ms / STRIKE_FX_MS;
  const frames: Keyframe[] = [];
  for (const ms of [0, 40, 100, 160, 210, 260, 320, 380, 470, STRIKE_FX_MS]) {
    frames.push({
      offset: at(ms),
      strokeWidth: `${w * strikeFlare(ms)}px`,
      stroke: ms < 40 ? "#f1c36a" : "#fff3c9",
      opacity: 1 - S(ms, STRIKE_MS + 80, STRIKE_FX_MS),
    });
  }
  return frames;
}

/** The pulse running down the beam, at the beam's points (in order, from the countering spell). */
export function strikePulseFrames(points: readonly Point[]): Keyframe[] {
  const at = (ms: number) => ms / STRIKE_FX_MS;
  const n = points.length - 1;
  const frames: Keyframe[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * STRIKE_MS;
    const f = ease(i / steps) * n;
    const j = Math.min(n - 1, Math.floor(f));
    const a = points[j]!;
    const b = points[j + 1] ?? a;
    const x = lerp(a.x, b.x, f - j);
    const y = lerp(a.y, b.y, f - j);
    frames.push({
      offset: at(t),
      transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(1.1)`,
      opacity: i === 0 || i === steps ? 0 : 1,
    });
  }
  frames.push({ ...frames[frames.length - 1]!, offset: 1, opacity: 0 });
  return frames;
}

/** The ripple on the countered spell bursting (by 40 canvas pixels), fading. */
export function strikeRingFrames(r: number, k: number): Keyframe[] {
  const at = (ms: number) => ms / STRIKE_FX_MS;
  const big = (ms: number) => easeOut(S(ms, STRIKE_MS - 40, STRIKE_MS + 260));
  const frames: Keyframe[] = [
    { offset: 0, opacity: 0, transform: "translate(-50%, -50%) scale(1)" },
  ];
  for (const ms of [
    STRIKE_MS - 40,
    STRIKE_MS + 20,
    STRIKE_MS + 80,
    STRIKE_MS + 160,
    STRIKE_FX_MS,
  ]) {
    const b = big(ms);
    frames.push({
      offset: at(ms),
      opacity: b <= 0 ? 1 : 1 - b,
      transform: `translate(-50%, -50%) scale(${(r + 40 * k * b) / r})`,
    });
  }
  return frames;
}

// --- H · Rise and show (out of a graveyard or exile) ---------------------------------

/** It rises out of the tile to beside the plate, enlarged ... */
export const SHOW_RISE_MS = 300;
/** ... stays there to be read ... */
export const SHOW_HOLD_MS = 600;
/** ... then glides where it goes. */
export const SHOW_GLIDE_MS = 520;
export const SHOW_MS = SHOW_RISE_MS + SHOW_HOLD_MS + SHOW_GLIDE_MS;
/** Several: each this far behind the one before. */
export const SHOW_BEAT_MS = 110;
/** Its size while shown, of a table card. */
export const SHOW_SCALE = 1.2;
/** Into a hidden place it turns face down between these shares of the glide. */
const SHOW_TURN = [0.4, 0.6] as const;
const SHOW_ARC = 50 / 134;

/** Where it stops to be read: the canvas's (985, 230) at the top, (985, 500) at the bottom. */
export function showAt(railX: number, height: number, top: boolean): Point {
  const k = height / CANVAS_H;
  return { x: railX - (1092 - 985) * k, y: (top ? 230 : 500) * k };
}

/** Where it goes, as the canvas bows each: up, down to the other player's fan, a little into exile. */
export type ShowTo = "table" | "hand" | "theirHand" | "library" | "exile" | "graveyard";
const SHOW_BOW: Record<ShowTo, number> = {
  table: 1,
  hand: 1,
  theirHand: -0.8,
  library: 1,
  exile: 0.6,
  graveyard: 1,
};

const goldGlow = (g: number) =>
  `brightness(1) drop-shadow(0px 0px ${14 * g}px rgba(241, 195, 106, ${0.85 * g}))`;
const coldGlow = (b: number, g: number) =>
  `brightness(${b}) drop-shadow(0px 0px ${12 * g}px rgba(191, 224, 255, ${0.85 * g}))`;

/**
 * One card out of a graveyard or exile: from its tile (`from`) up to `show`
 * (its centre, at SHOW_SCALE), held, then to `to`. Into a hidden place
 * (`hidden`) it turns face down on the way: `half` "before" is its face,
 * "after" the card back that takes over (the other player's new back, or the
 * back drawn over it into a library). Into a library or exile it sinks into
 * the tile at the end.
 */
export function showPose(
  ms: number,
  from: Pose,
  show: Point,
  to: Pose,
  cardH: number,
  where: ShowTo,
  half: Side2 | null,
): Pose {
  const exiling = where === "exile";
  const big = SHOW_SCALE;
  const shown = (o: number): number => (half === "after" ? 0 : o);
  if (ms < SHOW_RISE_MS) {
    const p = easeOut(ms / SHOW_RISE_MS);
    return {
      x: lerp(from.x, show.x, p),
      y: lerp(from.y, show.y, p),
      r: lerp(from.r, 0, p),
      s: lerp(from.s, big, p),
      o: shown(lerp(0.5, 1, p)),
      filter: exiling ? coldGlow(lerp(1, 1.6, p), p) : goldGlow(0.75 * p),
    };
  }
  if (ms < SHOW_RISE_MS + SHOW_HOLD_MS) {
    return {
      x: show.x,
      y: show.y,
      r: 0,
      s: big,
      o: shown(1),
      filter: exiling ? coldGlow(1.6, 1) : goldGlow(0.75),
    };
  }
  const p = S(ms, SHOW_RISE_MS + SHOW_HOLD_MS, SHOW_MS);
  const e = ease(p);
  const k = SHOW_BOW[where];
  const sinks = where === "library" || where === "exile" || where === "graveyard";
  const turn = half ? turning(S(p, SHOW_TURN[0], SHOW_TURN[1]), half) : null;
  return {
    x: lerp(show.x, to.x, e),
    y: lerp(show.y, to.y, e) - k * SHOW_ARC * cardH * Math.sin(Math.PI * e),
    r: lerp(0, to.r, e),
    s: lerp(big, to.s, e),
    ...(turn ? { sx: turn.sx } : {}),
    o: (turn && !turn.seen ? 0 : 1) * (sinks ? 1 - S(p, 0.85, 1) : 1),
    filter: exiling ? coldGlow(1.6, 1) : goldGlow(0.75 * (1 - e)),
  };
}

export function showFrames(
  from: Pose,
  show: Point,
  to: Pose,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  where: ShowTo,
  half: Side2 | null,
  /** The exact landing (a card of the table or a hand), when it lands as one. */
  landing?: Box,
): Keyframe[] {
  const glideStart = SHOW_RISE_MS + SHOW_HOLD_MS;
  const edge = glideStart + ((SHOW_TURN[0] + SHOW_TURN[1]) / 2) * SHOW_GLIDE_MS;
  const frames = track(
    SHOW_MS,
    (ms) => showPose(ms, from, show, to, cardH, where, half),
    cardW,
    cardH,
    origin,
    [SHOW_RISE_MS, glideStart, edge - 0.5, edge + 0.5],
    landing ? placement(landing, cardW, cardH, origin).transform : undefined,
    30,
  );
  if (landing) frames[frames.length - 1]!["filter"] = goldGlow(0);
  return frames;
}

// --- Swept as one (a whole graveyard exiled) -----------------------------------------

/** They lift out together, fanned, glowing; hold; then slide into exile together. */
export const SWEPT_LIFT_MS = 520;
export const SWEPT_HOLD_MS = 250;
export const SWEPT_MS = SWEPT_LIFT_MS + SWEPT_HOLD_MS + MOVE_MS;
export const SWEPT_SCALE = 0.66;

/** Where the i-th of n swept cards is held: the canvas's (1035, 245), fanned 9 apart. */
export function sweptAt(i: number, n: number, railX: number, height: number, top: boolean): Pose {
  const k = height / CANVAS_H;
  const off = i - (n - 1) / 2;
  return {
    x: railX - (1092 - 1035) * k + off * 9 * k,
    y: (top ? 245 : CANVAS_H - 245) * k - Math.abs(off) * 2 * k,
    r: off * 3,
    s: SWEPT_SCALE,
    o: 1,
  };
}

export function sweptPose(ms: number, from: Pose, held: Pose, to: Pose, cardH: number): Pose {
  if (ms < SWEPT_LIFT_MS) {
    const p = ms / SWEPT_LIFT_MS;
    const g = glideAt(from, held, p, cardH);
    return { ...g, filter: coldGlow(lerp(1, 1.7, p), p) };
  }
  if (ms < SWEPT_LIFT_MS + SWEPT_HOLD_MS) return { ...held, filter: coldGlow(1.7, 1) };
  const p = S(ms, SWEPT_LIFT_MS + SWEPT_HOLD_MS, SWEPT_MS);
  const g = glideAt(held, to, p, cardH);
  return { ...g, o: 1 - S(p, 0.8, 1), filter: coldGlow(1.7, 1) };
}

export function sweptFrames(
  from: Pose,
  held: Pose,
  to: Pose,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
): Keyframe[] {
  return track(
    SWEPT_MS,
    (ms) => sweptPose(ms, from, held, to, cardH),
    cardW,
    cardH,
    origin,
    [SWEPT_LIFT_MS, SWEPT_LIFT_MS + SWEPT_HOLD_MS],
    undefined,
    30,
  );
}

// --- The tiles' numbers ---------------------------------------------------------

/** The canvas's pop as a tile's number changes: 0.35 over 220 ms. */
export const TILE_POP = 0.35;
export const TILE_POP_MS = 220;

/** One change to a tile's number: at `at` ms, by `by`. */
export interface TileChange {
  at: number;
  by: number;
}

/** The numbers a tile shows from `start`, each from its change until the next. */
export function tileSpells(
  start: number,
  changes: readonly TileChange[],
): { n: number; from: number; until: number }[] {
  const sorted = [...changes].sort((a, b) => a.at - b.at);
  const out: { n: number; from: number; until: number }[] = [];
  let n = start;
  let from = 0;
  for (const c of sorted) {
    if (c.at > from) out.push({ n, from, until: c.at });
    n += c.by;
    from = Math.max(from, c.at);
  }
  out.push({ n, from, until: Infinity });
  return out;
}

/** One number's keyframes over `total`: seen only from `from` to `until`, popping as it starts. */
export function tileFrames(
  spell: { from: number; until: number },
  total: number,
  first: boolean,
): Keyframe[] {
  const at = (ms: number) => Math.min(1, Math.max(0, ms / Math.max(1, total)));
  const pop = (q: number) => `scale(${1 + TILE_POP * Math.sin(Math.PI * q)})`;
  const frames: Keyframe[] = [];
  if (spell.from > 0) {
    frames.push({ offset: 0, opacity: 0, transform: pop(0) });
    frames.push({ offset: at(spell.from), opacity: 0, transform: pop(0) });
  }
  frames.push({ offset: at(spell.from), opacity: 1, transform: pop(0) });
  if (!first) {
    for (const q of [0.25, 0.5, 0.75, 1]) {
      const ms = spell.from + TILE_POP_MS * q;
      if (ms < Math.min(spell.until, total))
        frames.push({ offset: at(ms), opacity: 1, transform: pop(q) });
    }
  }
  if (spell.until < total) {
    frames.push({ offset: at(spell.until), opacity: 1, transform: pop(0) });
    frames.push({ offset: at(spell.until), opacity: 0, transform: pop(0) });
    frames.push({ offset: 1, opacity: 0, transform: pop(0) });
  } else if (frames[frames.length - 1]!.offset !== 1) {
    frames.push({ offset: 1, opacity: 1, transform: pop(0) });
  }
  return frames;
}
