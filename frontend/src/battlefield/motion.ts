// Movement on the battlefield — BATTLEFIELD_RENDERING.md §5.1, §5.7 and §7
// step 4; PHASE_07 §7.34-§7.36, PHASE 7 AMENDMENTS 4 and 6.
//
// Pure geometry, like layout(): where each card is drawn (as a CSS
// transform), where the zones in the rail are (cards travel to and from
// them), and where a pointed-at hand card rises to. (Spec 0040 removed the
// clip that cut a tilted card's corners: a 5-degree tilt fits its line.) The Board only applies
// what these return; the timing is CSS's and the Web Animations API's.

import type { Box, Geometry, Side } from "./layout";

/**
 * How long a move takes: Phase 10 A-00, "A · Glide" (owner 2026-11-06,
 * Amendment 3) -- 450 ms, a gentle arc, the card lifting as it travels.
 * It replaced Phase 7 Amendment 6's 250 ms straight line.
 */
export const MOVE_MS = 450;
/** Glide's curve: eases in and out. */
export const MOVE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
/** How far the path bows upward, as a share of the distance travelled. */
export const GLIDE_ARC = 0.14;
/** How much bigger a card is mid-flight (a long move; less for a short one). */
export const GLIDE_LIFT = 0.08;
/**
 * The quick settle for what is not a journey -- a pointed-at hand card
 * rising, the stack re-ordering (CSS transitions).
 */
export const SETTLE_MS = 250;
export const SETTLE_EASING = "cubic-bezier(0.2, 0.7, 0.2, 1)";
/**
 * Phase 10 (owner 2026-10-30 at lock, shown on the A-00 canvas): when the
 * player acts while things move, what is moving finishes in this long --
 * never snaps.
 */
export const HURRY_MS = 100;
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

// --- Glide (Phase 10 A-00) ----------------------------------------------------

/** A CSS cubic-bezier as a function of progress (0..1 -> 0..1). */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  return (progress: number) => {
    let t = progress;
    for (let i = 0; i < 8; i++) {
      const error = x(t) - progress;
      const slope = dx(t);
      if (Math.abs(error) < 1e-5 || Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    return y(Math.min(1, Math.max(0, t)));
  };
}

const glideEase = cubicBezier(0.4, 0, 0.2, 1);
/** Samples per move: enough that the arc reads as a curve, not a polygon. */
const GLIDE_STEPS = 20;

/** A placement's numbers: translation, rotation, scale. */
export interface Placed {
  x: number;
  y: number;
  r: number;
  s: number;
}

/**
 * Where an element is drawn right now, mid-animation included (null when
 * the browser can't say). A card interrupted mid-Glide by a newer board
 * sets off again from here, not from where it was heading.
 */
export function placedNow(element: Element): Placed | null {
  if (typeof getComputedStyle !== "function" || typeof DOMMatrixReadOnly !== "function")
    return null;
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") return null;
  try {
    const m = new DOMMatrixReadOnly(transform);
    return { x: m.e, y: m.f, r: (Math.atan2(m.b, m.a) * 180) / Math.PI, s: Math.hypot(m.a, m.b) };
  } catch {
    return null;
  }
}

function parts(box: Box, cardW: number, cardH: number, origin: { x: number; y: number }) {
  const ox = origin.x * cardW;
  const oy = origin.y * cardH;
  return {
    x: box.x - ox * (1 - box.scale),
    y: box.y - oy * (1 - box.scale),
    r: box.rotation,
    s: box.scale,
  };
}

/**
 * The keyframes of one Glide move (Phase 10 A-00): from where a card is
 * drawn to where it goes, along a gentle upward arc, lifting mid-flight,
 * eased in and out. Run them with a linear timing over MOVE_MS: the easing
 * is in the samples, so the arc and the speed stay together. The last frame
 * is exactly `placement(to, ..., toOrigin)`, so the card lands where the
 * layout puts it.
 */
export function glideFrames(
  from: Box,
  to: Box,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  toOrigin: { x: number; y: number } = origin,
  opacity: { from: number; to: number } | null = null,
  start: Placed | null = null,
  /** A-08's pull: a wider bow, and a lean into the turn (degrees). */
  shape: { arc?: number; lean?: number } = {},
): Keyframe[] {
  const a = start ?? parts(from, cardW, cardH, origin);
  const b = parts(to, cardW, cardH, toOrigin);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  // Perpendicular to the path, pointing up the screen.
  let nx = distance ? -dy / distance : 0;
  let ny = distance ? dx / distance : 0;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  // A short hop (a row re-centring) barely lifts; a journey lifts fully.
  const lift = GLIDE_LIFT * Math.min(1, distance / (cardH * 2));
  const frames: Keyframe[] = [];
  for (let k = 0; k <= GLIDE_STEPS; k++) {
    const t = k / GLIDE_STEPS;
    const e = k === GLIDE_STEPS ? 1 : glideEase(t);
    const bow = Math.sin(Math.PI * e) * (shape.arc ?? GLIDE_ARC) * distance;
    const lean = (shape.lean ?? 0) * Math.sin(Math.PI * e) * Math.sign(dx || 1);
    // The ends are exact: the card starts and lands precisely in place.
    const at = k === 0 ? a : k === GLIDE_STEPS ? b : null;
    const x = at ? at.x : a.x + dx * e + nx * bow;
    const y = at ? at.y : a.y + dy * e + ny * bow;
    const r = at ? at.r : a.r + (b.r - a.r) * e + lean;
    const s = at ? at.s : (a.s + (b.s - a.s) * e) * (1 + lift * Math.sin(Math.PI * e));
    const frame: Keyframe = {
      offset: t,
      transform: `translate3d(${x}px, ${y}px, 0) rotate(${r}deg) scale(${s})`,
    };
    if (opacity) frame["opacity"] = opacity.from + (opacity.to - opacity.from) * e;
    frames.push(frame);
  }
  return frames;
}

// --- A card changing form (Phase 10 A-09) --------------------------------------

/**
 * "C · Lift, flip, settle" (owner 2026-11-06, Amendment 11): a card that
 * transforms, changes with day and night, or is turned face up lifts off
 * the table, flips over in the air with a glow, and settles back. The old
 * face (a ghost) lifts and turns edge-on; the card itself, already its new
 * face, turns round from edge-on and settles.
 */
export const FLIP_MS = 760;
const FLIP_LIFT = 0.16; // of the card's height
const FLIP_GROW = 1.14;
const EDGE = 0.475; // when it is edge-on
const UNGLOWED = "drop-shadow(0px 0px 0px rgba(241, 195, 106, 0))";
const GLOWED = "drop-shadow(0px 0px 14px rgba(241, 195, 106, 0.9))";

/** The keyframes for one half of a flip, run on the card itself (`.bf-card`),
 * linear over FLIP_MS: "out" -- the old face; "in" -- the new face. */
export function flipFrames(cardH: number, half: "out" | "in"): Keyframe[] {
  const up = -FLIP_LIFT * cardH;
  const pose = (y: number, s: number, turn: number) =>
    `translateY(${y}px) scale(${s}) perspective(${cardH * 4}px) rotateY(${turn}deg)`;
  if (half === "out") {
    return [
      { offset: 0, transform: pose(0, 1, 0), filter: UNGLOWED, opacity: 1 },
      { offset: 0.25, transform: pose(up, FLIP_GROW, 0), filter: GLOWED, opacity: 1 },
      { offset: EDGE, transform: pose(up, FLIP_GROW, 90), filter: GLOWED, opacity: 1 },
      { offset: EDGE + 0.005, transform: pose(up, FLIP_GROW, 90), filter: GLOWED, opacity: 0 },
      { offset: 1, transform: pose(up, FLIP_GROW, 90), filter: GLOWED, opacity: 0 },
    ];
  }
  return [
    { offset: 0, transform: pose(up, FLIP_GROW, -90), filter: GLOWED, opacity: 0 },
    { offset: EDGE, transform: pose(up, FLIP_GROW, -90), filter: GLOWED, opacity: 0 },
    { offset: EDGE + 0.005, transform: pose(up, FLIP_GROW, -90), filter: GLOWED, opacity: 1 },
    { offset: 0.7, transform: pose(up, FLIP_GROW, 0), filter: GLOWED, opacity: 1 },
    { offset: 1, transform: pose(0, 1, 0), filter: UNGLOWED, opacity: 1 },
  ];
}

// --- Two cards becoming one (Phase 10 A-10) ------------------------------------

/**
 * "B · Fusion burst" (owner 2026-11-06, Amendment 13), as the canvas's
 * `burst()` plays it: the table dims; the two cards are pulled together
 * with a small wind-up away from each other and slam at the merged card's
 * spot (MERGE_PULL_MS); a white flash with rays, sparks and a ring in the
 * merge's colour; the merged card shakes and rises out of the light to
 * MERGE_RISE_SCALE, glowing, and settles (MERGE_RISE_MS). Meld, mutate on
 * top and mutate underneath all look like this.
 */
export type MergeKind = "meld" | "mutate";
export const MERGE_PULL_MS = 560;
export const MERGE_RISE_MS = 760;
/** The whole of it: every part runs this long, so a hurry keeps them together. */
export const MERGE_MS = MERGE_PULL_MS + MERGE_RISE_MS;
export const MERGE_RISE_SCALE = 1.18;
/** The table's dimming at its deepest (black, over the table; not the hand). */
export const MERGE_DIM = 0.45;
/** The flash, sparks and ring after the slam; the merged card's brightening and glow. */
export const MERGE_FLASH_MS = 800;
export const MERGE_RING_MS = 600;
const MERGE_BRIGHT_MS = 600;
const MERGE_GLOW_MS = 900;
/** The merge's colour (r g b): a meld purple, a mutate green (the canvas's). */
export const MERGE_COLOUR: Record<MergeKind, string> = {
  meld: "185 147 232",
  mutate: "110 220 150",
};
// The canvas's curves: the pull speeds into its slam; the rise eases out.
const pullEase = cubicBezier(0.6, 0, 0.9, 0.5);
const riseEase = cubicBezier(0, 0, 0.58, 1);
const MERGE_STEPS = 14;

/**
 * One part of a merge, run linear over MERGE_MS on its element:
 * "partner" -- the card merging in (a meld partner on the table, a
 * mutating spell on the stack), pulled to the right of the spot and gone
 * at the slam; "old" -- the merged card's old face (a ghost), pulled to the
 * left of the spot and gone at the slam; "new" -- the merged card itself,
 * its new face, unseen until the slam, then shaking and rising out of the
 * light, glowing in `colour`, and settling. The canvas's distances are in
 * its 110-pixel-wide card's pixels, scaled to `to`'s width. The last frame
 * of "new" is exactly `placement(to, ..., origin)`: it lands where the
 * layout puts it. `origin` is the element's own transform origin.
 */
export function mergeFrames(
  part: "partner" | "old" | "new",
  from: Box,
  to: Box,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  colour: string,
  start: Placed | null = null,
): Keyframe[] {
  const a = start ?? parts(from, cardW, cardH, origin);
  const b = parts(to, cardW, cardH, origin);
  const k = (cardW * to.scale) / 110;
  const pull: Placed[] =
    part === "partner"
      ? [
          a,
          { x: a.x + (a.x - b.x) * 0.08, y: a.y - 16 * k, r: a.r + 5, s: a.s * 1.05 },
          { x: b.x + 18 * k, y: b.y, r: b.r - 3, s: b.s },
        ]
      : [
          a,
          { x: a.x + (a.x - b.x) * 0.12, y: a.y - 6 * k, r: a.r - 4, s: a.s },
          { x: b.x - 18 * k, y: b.y, r: b.r + 3, s: b.s },
        ];
  const rise: Placed[] = [
    pull[2]!,
    { x: b.x - 6 * k, y: b.y - 4 * k, r: b.r - 2, s: b.s * 1.1 },
    { x: b.x + 5 * k, y: b.y - 14 * k, r: b.r + 2, s: b.s * 1.16 },
    { x: b.x - 3 * k, y: b.y - 18 * k, r: b.r - 1, s: b.s * MERGE_RISE_SCALE },
    { x: b.x, y: b.y - 16 * k, r: b.r, s: b.s * MERGE_RISE_SCALE },
    b,
  ];
  // Along evenly spaced points by eased progress, as the canvas's keyframes.
  const along = (points: Placed[], e: number): Placed => {
    const span = e * (points.length - 1);
    const i = Math.min(points.length - 2, Math.floor(span));
    const f = span - i;
    const p = points[i]!;
    const q = points[i + 1]!;
    return {
      x: p.x + (q.x - p.x) * f,
      y: p.y + (q.y - p.y) * f,
      r: p.r + (q.r - p.r) * f,
      s: p.s + (q.s - p.s) * f,
    };
  };
  // The new face's light: 3x bright at the slam, back to 1 by 600 ms; a
  // glow peaking at 360 ms and gone by 900 ms (the canvas's glowPulse).
  const lightAt = (ms: number) => {
    if (part !== "new" || ms < MERGE_PULL_MS) return { bright: 1, glow: 0 };
    const t = ms - MERGE_PULL_MS;
    const bright = 3 - 2 * Math.min(1, t / MERGE_BRIGHT_MS);
    const peak = MERGE_GLOW_MS * 0.4;
    const glow = t <= peak ? t / peak : Math.max(0, 1 - (t - peak) / (MERGE_GLOW_MS - peak));
    return { bright, glow };
  };
  const frame = (p: Placed, ms: number, seen: boolean): Keyframe => {
    const { bright, glow } = lightAt(ms);
    return {
      offset: ms / MERGE_MS,
      transform: `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.r}deg) scale(${p.s})`,
      opacity: seen ? 1 : 0,
      filter: `brightness(${bright}) drop-shadow(0px 0px ${40 * k * glow}px rgb(${colour} / ${0.95 * glow}))`,
    };
  };
  const before = part !== "new";
  const frames: Keyframe[] = [];
  for (let i = 0; i <= MERGE_STEPS; i++) {
    const t = i / MERGE_STEPS;
    const p = i === 0 ? a : i === MERGE_STEPS ? pull[2]! : along(pull, pullEase(t));
    frames.push(frame(p, t * MERGE_PULL_MS, before));
  }
  // The slam: what was seen goes, what was not is there.
  frames.push({
    ...frame(pull[2]!, MERGE_PULL_MS, !before),
    offset: (MERGE_PULL_MS + 1) / MERGE_MS,
  });
  for (let i = 1; i <= MERGE_STEPS; i++) {
    const t = i / MERGE_STEPS;
    const p = i === MERGE_STEPS ? b : along(rise, riseEase(t));
    // Only the new face rises; the others wait, unseen, where they slammed.
    frames.push(frame(part === "new" ? p : pull[2]!, MERGE_PULL_MS + t * MERGE_RISE_MS, !before));
  }
  return frames;
}

// --- A creature changing sides (Phase 10 A-08) ---------------------------------

/**
 * "C · Pulled across" (owner 2026-11-06, Amendment 7): a gold line reaches
 * from the spell that took it (or, given back, its new controller's side)
 * to the creature, which is pulled along a wider bow, leaning into the
 * turn, gold-edged, and lands with a gold pulse.
 */
export const TETHER_MS = 260;
export const PULL_MS = 560;
export const PULL_ARC = 0.22;
export const PULL_LEAN = 9;
export const PULSE_MS = 420;

// --- Defeated and exiled (Phase 10 A-04, A-05, A-07) ---------------------------

/**
 * How a card leaves the table (owner 2026-11-06, Amendment 5):
 * "defeated" -- destroyed, died or sacrificed, to a graveyard: A · Shatter,
 * a red flash and a shake, it cracks and darkens, then Glides there;
 * "exiled" -- A · Banished: pale light rises, it brightens and lifts, then
 * Glides to exile still glowing.
 */
export type Fate = "defeated" | "exiled";
/** Shatter: the shake, then the crack and darken. */
export const SHAKE_MS = 220;
export const CRACK_MS = 300;
/** Banished: the light rising. */
export const BANISH_MS = 520;
/** A board wipe: the flash across the table before they all go. */
export const SWEEP_MS = 220;
/** This many leaving the table at once is a board wipe (the flash). */
export const WIPE_AT = 3;

/** How long the fate shows before the card sets off. */
export function fateMs(fate: Fate): number {
  return fate === "defeated" ? SHAKE_MS + CRACK_MS : BANISH_MS;
}

const SHATTERED = "brightness(0.55) grayscale(0.6) drop-shadow(0px 0px 0px rgba(191, 224, 255, 0))";
const WHOLE = "brightness(1) grayscale(0) drop-shadow(0px 0px 0px rgba(191, 224, 255, 0))";
const BANISHED =
  "brightness(1.9) grayscale(0.5) drop-shadow(0px 0px 14px rgba(191, 224, 255, 0.85))";

/**
 * One animation for the whole leaving -- the fate, then the Glide -- so a
 * click hurries all of it (A-00). Run linear over the returned duration;
 * the last frame is exactly `placement(to, ..., toOrigin)`.
 */
export function fateFrames(
  fate: Fate,
  from: Box,
  to: Box,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  toOrigin: { x: number; y: number },
): { frames: Keyframe[]; duration: number } {
  const a = parts(from, cardW, cardH, origin);
  const lead = fateMs(fate);
  const duration = lead + MOVE_MS;
  const at = (ms: number) => ms / duration;
  const pose = (p: Placed, filter: string, ms: number): Keyframe => ({
    offset: at(ms),
    transform: `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.r}deg) scale(${p.s})`,
    filter,
    opacity: 1,
  });
  const frames: Keyframe[] = [];
  let off: Placed;
  let filter: string;
  if (fate === "defeated") {
    // A shake: a few pixels each way, then still.
    [0, -5, 5, -4, 3, 0].forEach((dx, i, all) =>
      frames.push(pose({ ...a, x: a.x + dx }, WHOLE, (SHAKE_MS * i) / (all.length - 1))),
    );
    off = { ...a, y: a.y + 4, r: a.r - 6 };
    filter = SHATTERED;
  } else {
    frames.push(pose(a, WHOLE, 0));
    off = { ...a, y: a.y - 18, s: a.s * 1.08 };
    filter = BANISHED;
  }
  frames.push(pose(off, filter, lead));
  // Then Glide, from that pose, fading as it reaches its pile.
  const trip = glideFrames(from, to, cardW, cardH, origin, toOrigin, { from: 1, to: 0.15 }, off);
  for (const frame of trip.slice(1)) {
    frames.push({ ...frame, offset: at(lead + Number(frame["offset"]) * MOVE_MS), filter });
  }
  return { frames, duration };
}

// --- Back to a hand, onto or into a library (Phase 10 A-14) --------------------

/**
 * "D · Lift and glide" (owner 2026-11-06, Amendment 17), as the canvas's
 * `lift()` plays it: the card rises a little (RETURN_RISE of its height,
 * growing to RETURN_GROW) with a soft gold glow over RETURN_RISE_MS, then
 * glides on a gentle arc (RETURN_ARC of its height above the straight
 * line) to where it goes and settles there over RETURN_GLIDE_MS. Going
 * somewhere hidden (a library, the other player's hand) it turns face down
 * on the way (returnBackFrames). The canvas's distances are in its
 * 134-pixel-high card's pixels, scaled to the card.
 */
export const RETURN_RISE_MS = 180;
export const RETURN_GLIDE_MS = 520;
/** The whole of it: one animation, so a click hurries all of it. */
export const RETURN_MS = RETURN_RISE_MS + RETURN_GLIDE_MS;
export const RETURN_RISE = 12 / 134;
export const RETURN_GROW = 1.05;
export const RETURN_ARC = 50 / 134;
/** The face turns down between these shares of the glide (the canvas's 45%-55%). */
const RETURN_TURN = [0.45, 0.55] as const;
/** The gold glow: up by this long into it (the canvas's 30% of 900 ms), gone as it lands. */
const RETURN_GLOW_PEAK_MS = 270;
/** Into a library, it fades into the pile over the glide's last share. */
const RETURN_SINK = 0.15;
/** Shuffled in: the library riffles -- this many backs fan out and back, a beat apart. */
export const RIFFLE_MS = 700;
export const RIFFLE_BEAT_MS = 50;
export const RIFFLE_CARDS = 6;
/** The tag at the destination ("On top of Bob's library"): in, held, out. */
export const RETURN_TAG_MS = 1800;

const riseEaseOut = cubicBezier(0, 0, 0.58, 1);
const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const RETURN_STEPS = 16;
const returnGlow = (ms: number) => {
  const g =
    ms <= RETURN_GLOW_PEAK_MS
      ? ms / RETURN_GLOW_PEAK_MS
      : (RETURN_MS - ms) / (RETURN_MS - RETURN_GLOW_PEAK_MS);
  const a = Math.max(0, Math.min(1, g));
  return `drop-shadow(0px 0px ${12 * a}px rgba(241, 195, 106, ${0.7 * a}))`;
};

/**
 * The keyframes of one return, run linear over RETURN_MS on the card's
 * element: rise, then the arc. The first frame is exactly where the card
 * was (or `start`, where it is drawn mid-move); the last is exactly
 * `placement(to, ..., toOrigin)` -- it lands where the layout puts it (a
 * card of that hand) or on the library pile. `sink`: fade into the pile at
 * the end (a library), otherwise it lands whole.
 */
export function returnFrames(
  from: Box,
  to: Box,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  toOrigin: { x: number; y: number } = origin,
  /**
   * How it is seen on the way: "whole"; "sink" -- fading into a library
   * pile at the end; "out" / "in" -- the two halves of turning face down
   * into the other player's hidden hand: the card fading out, and the
   * hand's new card back fading in on the same path, over the turn.
   */
  seen: "whole" | "sink" | "out" | "in" = "whole",
  start: Placed | null = null,
): Keyframe[] {
  const a = start ?? parts(from, cardW, cardH, origin);
  const b = parts(to, cardW, cardH, toOrigin);
  const top: Placed = { ...a, y: a.y - RETURN_RISE * cardH * a.s, s: a.s * RETURN_GROW };
  const arc = RETURN_ARC * cardH * a.s;
  const frames: Keyframe[] = [];
  const pose = (p: Placed, ms: number, opacity: number): Keyframe => ({
    offset: ms / RETURN_MS,
    transform: `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.r}deg) scale(${p.s})`,
    filter: returnGlow(ms),
    opacity,
  });
  for (let k = 0; k <= RETURN_STEPS; k++) {
    const e = riseEaseOut(k / RETURN_STEPS);
    const p =
      k === 0
        ? a
        : k === RETURN_STEPS
          ? top
          : {
              x: a.x + (top.x - a.x) * e,
              y: a.y + (top.y - a.y) * e,
              r: a.r,
              s: a.s + (top.s - a.s) * e,
            };
    frames.push(pose(p, (k / RETURN_STEPS) * RETURN_RISE_MS, seen === "in" ? 0 : 1));
  }
  for (let k = 1; k <= RETURN_STEPS; k++) {
    const t = k / RETURN_STEPS;
    const e = easeInOutQuad(t);
    const p: Placed =
      k === RETURN_STEPS
        ? b
        : {
            x: top.x + (b.x - top.x) * e,
            y: top.y + (b.y - top.y) * e - Math.sin(Math.PI * e) * arc,
            r: top.r + (b.r - top.r) * e,
            s: top.s + (b.s - top.s) * e,
          };
    const turned = Math.max(
      0,
      Math.min(1, (t - RETURN_TURN[0]) / (RETURN_TURN[1] - RETURN_TURN[0])),
    );
    const opacity =
      seen === "sink"
        ? t > 1 - RETURN_SINK
          ? (1 - t) / RETURN_SINK
          : 1
        : seen === "out"
          ? 1 - turned
          : seen === "in"
            ? turned
            : 1;
    frames.push(pose(p, RETURN_RISE_MS + t * RETURN_GLIDE_MS, opacity));
  }
  return frames;
}

/**
 * The card back drawn over a returning card's face, run linear over
 * RETURN_MS: unseen through the rise and the first part of the glide, then
 * turned down (the canvas's fade between 45% and 55% of the glide).
 */
export function returnBackFrames(): Keyframe[] {
  const at = (share: number) => (RETURN_RISE_MS + share * RETURN_GLIDE_MS) / RETURN_MS;
  return [
    { offset: 0, opacity: 0 },
    { offset: at(RETURN_TURN[0]), opacity: 0 },
    { offset: at(RETURN_TURN[1]), opacity: 1 },
    { offset: 1, opacity: 1 },
  ];
}

/** One back of a riffling library (the canvas's `riffle()`), `k` its size against the canvas's 56-pixel pile. */
export function riffleFrames(i: number, k: number): Keyframe[] {
  const dx = (i % 2 ? 1 : -1) * (14 + i * 3) * k;
  const dy = -(10 + i * 3) * k;
  return [
    { offset: 0, opacity: 1, transform: "translate(-50%, -50%) translate(0px, 0px) rotate(0deg)" },
    {
      offset: 0.4,
      opacity: 1,
      transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${dx / 2 / k}deg)`,
    },
    { offset: 1, opacity: 1, transform: "translate(-50%, -50%) translate(0px, 0px) rotate(0deg)" },
  ];
}

/** The tag's keyframes (the canvas's): it pops in, holds, and fades. `base` places it. */
export function returnTagFrames(base: string): Keyframe[] {
  return [
    { offset: 0, opacity: 0, transform: `${base} translateY(8px) scale(0.8)` },
    { offset: 0.2, opacity: 1, transform: `${base} translateY(0px) scale(1.08)` },
    { offset: 0.85, opacity: 1, transform: `${base} translateY(0px) scale(1)` },
    { offset: 1, opacity: 0, transform: `${base} translateY(0px) scale(1)` },
  ];
}

/**
 * Phase 10 A-00 -- the player acted: everything still moving in `root`
 * finishes in HURRY_MS. Endless animations (a breathing glow) are left
 * alone.
 */
export function hurry(root: Element) {
  if (typeof root.getAnimations !== "function") return;
  for (const animation of root.getAnimations({ subtree: true })) {
    const timing = animation.effect?.getComputedTiming();
    if (!timing || timing.iterations === Infinity || animation.playState !== "running") continue;
    const end = Number(timing.endTime ?? 0);
    const now = Number(animation.currentTime ?? 0);
    const left = (end - now) / Math.abs(animation.playbackRate || 1);
    if (left > HURRY_MS) animation.updatePlaybackRate(animation.playbackRate * (left / HURRY_MS));
  }
}

// --- the rail's zones (from the canvas, AMENDMENT 6) --------------------------

export type ZoneName = "library" | "graveyard" | "exile" | "hand" | "life";
export type AnchorId = `${Side}:${ZoneName}` | "stack";

// As built (game.css, spec 0029's plates), in the rail's 900-pixel units:
// a plate is 216 wide from x 7.4, with a 2 px top border, 1 px sides and
// 10 px padding; a 56 px head (life in the banner at its right); 10 px;
// then 52 px tiles, two a row, 6 px apart. Both plates (opponent's at y
// 26, viewer's at 675: spec 0038) read Library across the row, then Graveyard /
// Exile (spec 0031: the opponent's hand is drawn on the board instead).
// The stack is between them.
const PANEL_X = 7.4 / 900; // a plate's left edge, from the rail's
const PANEL_W = 216 / 900;
const PLATE_TOP: Record<Side, number> = { opponent: 26, viewer: 675 };
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
