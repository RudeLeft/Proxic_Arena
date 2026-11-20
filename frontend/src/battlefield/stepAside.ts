// Spec 0091 (owner 2026-11-13, C · the casting card steps aside) -- while
// a card under the casting card is spent, sacrificed or tapped to pay for
// the spell, the casting card and its cost pips (or, for the other player,
// the face-down back and its line) slide aside just far enough to uncover
// it, the card's own movement plays in full view, and the casting card
// glides back to the exact middle once it is over. It never stays aside
// (spec 0068, Amendment 1).
//
// Everything here is pure: where the casting card is (castingBox, spec
// 0068), what it covers, which way and how far it steps, and where it is at
// any moment of a step. The board (Board.tsx), the balls (manaBalls.tsx)
// and the card (CastingCard.tsx) all read the same answers.

import type { Box, Geometry } from "./layout";
import { paced, MOVE_MS, SPENT_BEAT_MS, SPENT_FOLD_MS } from "./motion";
import { PEEL_MS } from "./piles";

/** How much bigger than a card on the table. */
const GROW = 2.5;

/**
 * Spec 0068 -- where the casting card floats: centred on the middle of the
 * screen (the game screen fills the window), as big as fits. A pure
 * function of the window's size, so after a resize it is in the new middle.
 */
export function castingBox(g: Geometry): Box {
  const h = Math.min(g.cardH * GROW, g.height * 0.5);
  const w = (h * g.cardW) / g.cardH;
  return {
    x: g.width / 2 - w / 2,
    y: g.height / 2 - h / 2,
    w,
    h,
    scale: h / g.cardH,
    rotation: 0,
    z: 0,
  };
}

/** Spec 0091, item 1 -- the slide aside, and the glide back (about 0.25 s each). */
export const ASIDE_MS = paced(250);
/** Spec 0091, item 3 -- it starts back this long after the last card has finished. */
export const BACK_AFTER_MS = 250; // not paced: a wait (spec 0106)
/** Spec 0091, item 6 -- reduce motion: see-through this long, fading in and out quickly. */
export const STILL_HOLD_MS = 700; // not paced: a wait (spec 0106)
export const STILL_FADE_MS = paced(120);
/** The gap left between the moved card (with its line) and what it uncovers. */
const CLEAR_GAP = 14;
/** The line under the card -- the cost pips (yours; theirs has no caption since spec 0097 item 8). */
const UNDER = 66;
const SIDE_PAD = 24;
/** "Aside": a little sideways, as a share of the card's width (the canvas's 50 px of 244). */
const SIDEWAYS = 0.2;
/** A card counts as under it when this much of it is covered. */
const COVERED_SHARE = 0.2;

/**
 * What the casting card hides: the card itself and the line under it (its
 * cost pips; the other player's card has had no caption since spec 0097,
 * item 8, and keeps the same room).
 */
export function castCoverBox(g: Geometry): Box {
  const card = castingBox(g);
  return { ...card, x: card.x - SIDE_PAD, w: card.w + 2 * SIDE_PAD, h: card.h + UNDER };
}

/** Whether [box] (a card on the table) is under [cover]: a fifth of it or more. */
export function covers(cover: Box, box: Box): boolean {
  const w = Math.min(cover.x + cover.w, box.x + box.w) - Math.max(cover.x, box.x);
  const h = Math.min(cover.y + cover.h, box.y + box.h) - Math.max(cover.y, box.y);
  if (w <= 0 || h <= 0 || box.w <= 0 || box.h <= 0) return false;
  return w * h >= COVERED_SHARE * box.w * box.h;
}

export interface Offset {
  dx: number;
  dy: number;
}

/** A card acting under it this update: spent (folds and goes) or tapped (stays; its ball flies). */
export interface Acting {
  id: string;
  box: Box;
  kind: "spent" | "tapped";
}

/**
 * How long the movements of this update take, from the moment it arrives,
 * when the covered cards wait ASIDE_MS for the card to move first: a spent
 * card folds and goes (its pile's peel first; several spent go a beat
 * apart, spec 0084); a mana's ball flies to its pip and pops (spec 0062).
 */
export function actingMs(spent: number, balls: number): number {
  const fold = spent > 0 ? PEEL_MS + SPENT_BEAT_MS * (spent - 1) + SPENT_FOLD_MS + MOVE_MS : 0;
  // manaBalls: BALL_LAG_MS 70 apart, BALL_MS 620 in flight, POP_MS 260.
  const ball = balls > 0 ? 70 * (balls - 1) + 620 + 260 : 0;
  // A tapped card leans in MOVE_MS.
  return ASIDE_MS + Math.max(fold, ball, MOVE_MS);
}

/**
 * Spec 0091, item 1 -- which way and how far: away from the cards it
 * uncovers, up when they are below its middle (your cards, for you) and
 * down when above (the other player's view of yours), just far enough to
 * clear them, a little sideways; never off the top, nor into the hand.
 * Null when none of [acting] is under it.
 */
export function asideOffset(g: Geometry, acting: readonly Acting[]): Offset | null {
  const cover = castCoverBox(g);
  const under = acting.filter((a) => covers(cover, a.box));
  if (under.length === 0) return null;
  const left = Math.min(...under.map((a) => a.box.x));
  const right = Math.max(...under.map((a) => a.box.x + a.box.w));
  const top = Math.min(...under.map((a) => a.box.y));
  const bottom = Math.max(...under.map((a) => a.box.y + a.box.h));
  const card = castingBox(g);
  const up = (top + bottom) / 2 >= cover.y + cover.h / 2;
  const dy = up
    ? Math.max(Math.min(0, top - CLEAR_GAP - (cover.y + cover.h)), 8 - card.y)
    : Math.min(
        Math.max(0, bottom + CLEAR_GAP - cover.y),
        Math.max(0, g.handTop - 8 - (cover.y + cover.h)),
      );
  const side = (left + right) / 2 <= card.x + card.w / 2 ? 1 : -1;
  return { dx: side * card.w * SIDEWAYS, dy };
}

/**
 * One step aside, on the page's clock (performance.now): from where it was
 * (`from`: the middle, or still aside from the last step) to `to` over
 * `outMs`, held there until `holdUntil`, then back to the middle over
 * `backMs`. `still` (reduce motion): no slide; see-through instead.
 */
export interface AsideRun {
  key: string;
  /** The card being cast. */
  card: string;
  start: number;
  from: Offset;
  to: Offset;
  outMs: number;
  holdUntil: number;
  backMs: number;
  still: boolean;
  /** Its animation finished (or was hurried to the end). */
  done: boolean;
}

export function runMs(run: AsideRun): number {
  return run.holdUntil + run.backMs;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function mix(a: Offset, b: Offset, t: number): Offset {
  return { dx: a.dx + (b.dx - a.dx) * t, dy: a.dy + (b.dy - a.dy) * t };
}

const NONE: Offset = { dx: 0, dy: 0 };

/** Where the run has the card at [t] (the page's clock): its offset from the middle. */
export function offsetAt(run: AsideRun | null, t: number): Offset {
  if (!run || run.done || run.still) return NONE;
  const e = t - run.start;
  if (e <= 0) return run.from;
  if (e < run.outMs) return mix(run.from, run.to, ease(e / run.outMs));
  if (e < run.holdUntil) return run.to;
  if (e < run.holdUntil + run.backMs)
    return mix(run.to, NONE, ease((e - run.holdUntil) / run.backMs));
  return NONE;
}

/** Whether the run still has the card away from the middle (or see-through) at [t]. */
export function asideAt(run: AsideRun | null, t: number): boolean {
  return !!run && !run.done && t - run.start < runMs(run);
}

/**
 * A new step for this update ([key]): it starts from wherever the last one
 * has the card now, so a second payment while it is still aside carries
 * on from there, and is held until the longer of the two is over (one
 * return, spec 0091 item 3).
 */
export function nextRun(
  previous: AsideRun | null,
  key: string,
  card: string,
  to: Offset,
  acting: number,
  now: number,
  still: boolean,
): AsideRun {
  const carried = previous && previous.card === card && asideAt(previous, now) ? previous : null;
  const left = carried ? Math.max(0, carried.start + carried.holdUntil - now) : 0;
  if (still) {
    return {
      key,
      card,
      start: now,
      from: NONE,
      to: NONE,
      outMs: STILL_FADE_MS,
      holdUntil: Math.max(STILL_HOLD_MS, left),
      backMs: STILL_FADE_MS,
      still: true,
      done: false,
    };
  }
  return {
    key,
    card,
    start: now,
    from: offsetAt(carried, now),
    to,
    outMs: ASIDE_MS,
    holdUntil: Math.max(acting + BACK_AFTER_MS, left),
    backMs: ASIDE_MS,
    still: false,
    done: false,
  };
}

/** The run as Web Animation keyframes on the casting card (added to its own movements). */
export function runFrames(run: AsideRun): Keyframe[] {
  const total = runMs(run);
  if (run.still) {
    return [
      { opacity: 1, offset: 0 },
      { opacity: 0.14, offset: run.outMs / total },
      { opacity: 0.14, offset: run.holdUntil / total },
      { opacity: 1, offset: 1 },
    ];
  }
  const tf = (o: Offset) => `translate(${o.dx.toFixed(1)}px, ${o.dy.toFixed(1)}px)`;
  const curve = "cubic-bezier(0.45, 0, 0.55, 1)";
  return [
    { transform: tf(run.from), offset: 0, easing: curve },
    { transform: tf(run.to), offset: run.outMs / total },
    { transform: tf(run.to), offset: run.holdUntil / total, easing: curve },
    { transform: tf(NONE), offset: 1 },
  ];
}
