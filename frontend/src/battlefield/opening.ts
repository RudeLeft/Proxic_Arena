// Spec 0089 (Q2 A -- owner 2026-11-13, canvas deep2-gameflow-1113) -- the
// opening hand and mulligans: dealt from the library.
//
//   - The 7 are dealt one by one from the Library tile into the opening-hand
//     window, turning face up as they land; the tile counts down, "−7".
//   - A mulligan turns them face down and sweeps them back into the library
//     ("+7"); the game's own riffle plays on the tile (spec 0084), and 7 are
//     dealt again.
//   - The cards put back go to the bottom of the library ("+N").
//   - Keep glides the hand down into place.
//   - The other player sees the backs go into the library and come back, and
//     is never shown a card: their fan's backs, by place, never by an id.
//
// The moments are the canvas's, from the update that brings the moves (the
// game deals, sweeps back and deals again in one update). Each card's
// movement is a Web Animation (A-00: a click hurries it); with reduce motion
// nothing moves -- the cards simply are where the game says.

/** One card dealt to the next (the canvas's 0.1 s); each glides 0.5 s. */
export const DEAL_BEAT_MS = 100;
export const DEAL_MS = 500;
/** A card leaves the tile this small (of the window's card; of a fan's back: 0.42). */
export const DEAL_FROM = 0.3;
export const DEAL_FROM_FAN = 0.42;
/** The "−7" rises off the tile 0.3 s after the deal begins. */
export const DEAL_NUMBER_AT = 300;
/** A mulligan: each turns face down (0.2 s, 40 ms apart), then glides back (0.45 s, 60 ms apart, from 0.2 s). */
export const TURN_DOWN_MS = 200;
export const TURN_DOWN_BEAT_MS = 40;
export const SWEEP_AT = 200;
export const SWEEP_BEAT_MS = 60;
export const SWEEP_MS = 450;
/** The riffle plays on the tile once the seven are in (the canvas's 1.05 s); then the deal again (2.05 s). */
export const RIFFLE_AT = 1050;
export const REDEAL_AT = 2050;
/** A card put back glides to the bottom of the library (0.5 s), turning face down half-way. */
export const PUT_BACK_MS = 500;
/** Keep: the window fades (0.3 s) as the hand glides down into place (0.62 s). */
export const KEEP_FADE_MS = 300;
export const KEEP_MS = 620;

/** When the [i]th card of a deal sets off: at once, or after a mulligan's sweep and riffle. */
export function dealAt(i: number, afterSweep: boolean): number {
  return (afterSweep ? REDEAL_AT : 0) + i * DEAL_BEAT_MS;
}

/** When the [i]th card of a mulligan glides back. */
export function sweepAt(i: number): number {
  return SWEEP_AT + i * SWEEP_BEAT_MS;
}

/** When the [i]th card of a mulligan has landed in the library (its "+1"). */
export function sweptAt(i: number): number {
  return sweepAt(i) + SWEEP_MS;
}

const easeIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** A point on the A-00 Glide (a bow of 14% of the distance, lifting 8%) from a to b at p. */
function glidePose(
  a: { x: number; y: number; s: number },
  b: { x: number; y: number; s: number },
  p: number,
): { x: number; y: number; s: number } {
  const e = easeIO(p);
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const bow = Math.sin(Math.PI * p);
  return {
    x: a.x + (b.x - a.x) * e,
    y: a.y + (b.y - a.y) * e - 0.14 * d * bow,
    s: (a.s + (b.s - a.s) * e) * (1 + 0.08 * bow),
  };
}

/**
 * A card dealt (or swept back, `reverse`) between the tile and its place, as
 * frames for the card's own element sitting at its place (`card`: its
 * movement) and for the card back laid over its face (`back`: shown while it
 * is face down): `dx, dy` from its place's centre to the tile's centre, `s`
 * its size at the tile. Dealt, it shows its back for the first half and turns
 * face up as it lands (scaleX |cos|, the canvas's); swept back, it stays a
 * back the whole way (`turns` false: it turned face down first).
 */
export function dealFrames(
  dx: number,
  dy: number,
  s: number,
  reverse = false,
  turns = true,
): { card: Keyframe[]; back: Keyframe[] } {
  const card: Keyframe[] = [];
  const back: Keyframe[] = [];
  for (let k = 0; k <= 10; k++) {
    const p = k / 10;
    const q = reverse ? 1 - p : p;
    const g = glidePose({ x: dx, y: dy, s }, { x: 0, y: 0, s: 1 }, q);
    // Exactly at rest at its place (no "-0.0").
    if (q === 1) Object.assign(g, { x: 0, y: 0, s: 1 });
    const flip = turns ? Math.max(0.05, Math.abs(Math.cos(Math.PI * q))) : 1;
    card.push({
      offset: p,
      transform: `translate(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px) scale(${(g.s * flip).toFixed(3)}, ${g.s.toFixed(3)})`,
    });
    back.push({ offset: p, opacity: (turns ? q < 0.5 : true) ? 1 : 0 });
  }
  return { card, back };
}

/** A card turning face down where it stands: it narrows edge-on and widens again as its back. */
export function turnDownFrames(): { card: Keyframe[]; back: Keyframe[] } {
  const qs = [0, 0.25, 0.5, 0.75, 1];
  return {
    card: qs.map((q) => ({
      offset: q,
      transform: `scale(${Math.max(0.05, Math.abs(Math.cos(Math.PI * q))).toFixed(3)}, 1)`,
    })),
    back: qs.map((q) => ({ offset: q, opacity: q >= 0.5 ? 1 : 0 })),
  };
}
