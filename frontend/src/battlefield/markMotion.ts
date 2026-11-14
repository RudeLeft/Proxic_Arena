// Spec 0085 (owner 2026-11-13, canvas gaps-marks-1113) -- how the marks and
// the held-card tabs move. Pure, like motion.ts: the canvas's numbers and the
// frames they make; the Board decides what changed (from the game's boards).
//
//   2 B · Rise, then settle as a square: the ability's icon rises off the
//   card like a +N (RISE_MS, up by RISE_UP of the card's height plus a
//   little), holds above it, then drops into its square at the lower left
//   (DROP_MS); the square pops as it lands (POP_MS). The canvas: rise 0.5 s,
//   held to 0.85 s, drop 0.45 s, pop 0.3 s. A mark that ends shrinks away
//   (CardBadges' MARK_OUT_MS).
//   4 A · A picture tab on the holder: it shows once the held card has gone
//   into exile, with a glow, and the holder glows. When the holder goes, the
//   tab flies to the held card's exile pile (HELD_FLY_MS), the pile glows,
//   and the card rises out of it (0074's Rise and show) FREED_WAIT_MS after
//   the holder set off; a card that stays in exile (an imprint, a Hideaway
//   card) is sunk into the pile with its tab and never rises.

export const RISE_MS = 500;
export const RISE_HOLD_MS = 350;
export const DROP_MS = 450;
export const POP_MS = 300;
/** The icon's whole trip: up, held, down into its square. */
export const RISER_MS = RISE_MS + RISE_HOLD_MS + DROP_MS;
/** How far up it rises: this share of the card's height, plus RISE_UP_PX (the canvas's 0.42 h + 16 px). */
export const RISE_UP = 0.42;
export const RISE_UP_PX = 16;
/** It starts this share of the card's height above the card's middle (the canvas's 0.08). */
export const RISE_FROM = 0.08;
/** Two or more risers from one card stand this far apart (the canvas's 30 px of a 92 px card). */
export const RISER_APART = 0.33;
/** The riser's size: from RISER_START to RISER_TOP of the card's height (the canvas's 22 and 26 of 92). */
export const RISER_START = 0.24;
export const RISER_TOP = 0.28;
/** Several cards gaining at once (Heroic Intervention) start this far apart (the canvas's 0.1 s). */
export const RISER_BEAT_MS = 100;

const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/**
 * The rising icon's frames, for an element of size `top` (px) whose
 * top-left is at the board's origin: its centre goes from `from` up by
 * `up`, holds, then down to `to`, shrinking to `end` (the square's size).
 * Run linear over RISER_MS.
 */
export function riserFrames(
  from: { x: number; y: number },
  up: number,
  to: { x: number; y: number },
  start: number,
  top: number,
  end: number,
): Keyframe[] {
  const frames: Keyframe[] = [];
  const at = (x: number, y: number, size: number, opacity: number, ms: number) =>
    frames.push({
      offset: ms / RISER_MS,
      opacity,
      transform: `translate(${(x - top / 2).toFixed(1)}px, ${(y - top / 2).toFixed(1)}px) scale(${(size / top).toFixed(3)})`,
    });
  const steps = 6;
  for (let k = 0; k <= steps; k++) {
    const q = k / steps;
    at(
      from.x,
      from.y - easeOut(q) * up,
      lerp(start, top, easeOut(q)),
      Math.min(1, q * 5),
      q * RISE_MS,
    );
  }
  at(from.x, from.y - up, top, 1, RISE_MS + RISE_HOLD_MS);
  for (let k = 1; k <= steps; k++) {
    const q = k / steps;
    const e = easeIO(q);
    at(
      lerp(from.x, to.x, e),
      lerp(from.y - up, to.y, e),
      lerp(top, end, e),
      k === steps ? 0 : 1,
      RISE_MS + RISE_HOLD_MS + q * DROP_MS,
    );
  }
  return frames;
}

/**
 * The square's own frames, run linear over RISER_MS + POP_MS from the
 * riser's start: unseen until the icon lands in it, then it pops (x1.3).
 */
export function markLandFrames(): Keyframe[] {
  const total = RISER_MS + POP_MS;
  const land = RISER_MS / total;
  return [
    { offset: 0, opacity: 0, transform: "scale(1)" },
    { offset: land - 0.001, opacity: 0, transform: "scale(1)" },
    { offset: land, opacity: 1, transform: "scale(1)" },
    { offset: land + (1 - land) / 2, opacity: 1, transform: "scale(1.3)" },
    { offset: 1, opacity: 1, transform: "scale(1)" },
  ];
}
export const MARK_LAND_MS = RISER_MS + POP_MS;

/**
 * Spec 0085 -- the canvas's "the red mark pulses: that is why": a protection
 * mark swells once (x1.35) as a spell aimed at its card does nothing.
 */
export const WHY_PULSE_MS = 500;
export function whyPulseFrames(): Keyframe[] {
  return [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    offset: p,
    transform: `scale(${(1 + 0.35 * Math.sin(Math.PI * p)).toFixed(3)})`,
  }));
}

// --- 4 A · the held card's tab --------------------------------------------------------

/** The tab grows in with a glow (the canvas: in over 0.12 s, the glow a bump over 0.6 s). */
export const HELD_IN_MS = 600;
export function heldInFrames(): Keyframe[] {
  const glow = (g: number) =>
    `1px 0 3px rgb(0 0 0 / 50%), 0 0 ${(12 * g).toFixed(1)}px ${(4 * g).toFixed(1)}px rgb(241 195 106 / ${(0.9 * g).toFixed(2)})`;
  return [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => ({
    offset: p,
    opacity: Math.min(1, p / 0.2),
    boxShadow: glow(Math.sin(Math.PI * p)),
  }));
}

/** The tab's flight to the exile pile (the canvas's 0.6 s, a 30 px arc, half its size, gone by the end). */
export const HELD_FLY_MS = 600;
/** The arc, as a share of the card's height (the canvas's 30 px of a 76 px card). */
export const HELD_ARC = 0.4;
/**
 * The tab's frames from now: held on its holder's edge for `wait` (until the
 * holder's fate starts), then its flight. Run linear over the duration.
 */
export function heldFlyFrames(
  dx: number,
  dy: number,
  arc: number,
  sink: boolean,
  wait: number,
): { frames: Keyframe[]; duration: number } {
  const duration = wait + HELD_FLY_MS;
  const steps = 8;
  const flight = Array.from({ length: steps + 1 }, (_, k) => {
    const q = k / steps;
    const e = easeIO(q);
    const x = dx * e;
    const y = dy * e - Math.sin(Math.PI * q) * arc;
    // A card that stays in exile sinks into the pile with its tab: smaller.
    const s = 1 - (sink ? 0.7 : 0.5) * q;
    return {
      offset: (wait + q * HELD_FLY_MS) / duration,
      opacity: q < 0.85 ? 1 : k === steps ? 0 : 1 - (q - 0.85) / 0.15,
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`,
    };
  });
  const frames: Keyframe[] =
    wait > 0
      ? [{ offset: 0, opacity: 1, transform: "translate(0px, 0px) scale(1)" }, ...flight]
      : flight;
  return { frames, duration };
}

/** The freed card rises out of its pile this long after its holder set off (the canvas's 0.6 s). */
export const FREED_WAIT_MS = 600;
/** The pile glows from this long before the card rises, for TILE_GLOW_MS (the canvas's 0.15 s, 0.6 s). */
export const TILE_GLOW_LEAD_MS = 150;
export const TILE_GLOW_MS = 600;
export function tileGlowFrames(): Keyframe[] {
  return [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const v = Math.sin(Math.PI * p) * 1.2;
    return {
      offset: p,
      boxShadow:
        v > 0
          ? `0 0 0 ${(1.5 * Math.min(1, v)).toFixed(2)}px #f2c46a, 0 0 ${(14 * v).toFixed(1)}px rgb(242 196 106 / ${Math.min(1, 0.8 * v).toFixed(2)})`
          : "none",
    };
  });
}
/** The freed card glows gold as it rises and is shown, fading as it goes home (the canvas's 0.8 to 0). */
export function freedGlowFrames(duration: number): Keyframe[] {
  const fadeFrom = Math.min(1, 1100 / duration);
  const glow = (g: number) =>
    `drop-shadow(0px 0px ${(16 * g).toFixed(1)}px rgba(241, 195, 106, ${(0.8 * g).toFixed(2)}))`;
  return [
    { offset: 0, filter: glow(0.8) },
    { offset: fadeFrom, filter: glow(0.8) },
    { offset: 1, filter: glow(0) },
  ];
}
