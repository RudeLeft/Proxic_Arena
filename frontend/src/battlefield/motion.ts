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
