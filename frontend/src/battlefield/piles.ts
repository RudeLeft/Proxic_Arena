// Spec 0073 (owner 2026-11-12, on the canvas "piles-1112") -- cards and
// tokens visibly join a pile, and peel off it.
//
// Pure, like motion.ts: the numbers of the approved canvas and the frames
// they make. The Board decides who joins and who leaves (from the game's
// moves and the board it drew before); these say how it looks.
//
//   Joining, A · Glide onto the pile: the card Glides (A-00) from where it
//   came from onto the pile; the pile's "×N" ticks up as it lands, never
//   before.
//   Tokens, from their source, one by one: a spark on the spell or ability
//   that made them (or the permanent whose ability it was, Krenko), the
//   token grows out of it and Glides to its pile, the next a beat behind.
//   Leaving, D · Peel off: the card lifts off the top of the pile as the
//   number drops, then plays its usual look (Shatter, Banished).

import type { Box } from "./layout";
import { fateFrames, glideFrames, MOVE_MS, type Fate } from "./motion";

/** D · Peel off: the lift off the top of the pile (the canvas's 160 ms, eased out). */
export const PEEL_MS = 160;
/** It grows this much as it lifts (the canvas's 1.04). */
export const PEEL_GROW = 1.04;

/**
 * Where each card peeling off one pile ends its lift, in its card's width
 * and height, from the pile: the canvas's one (a third across, a fifth up)
 * and two (fanning off to the side); more fan on along the same line.
 */
export function peelOffset(i: number, n: number): { x: number; y: number } {
  if (n <= 1) return { x: 0.33, y: -0.2 };
  if (n === 2) return i === 0 ? { x: 0.3, y: -0.26 } : { x: 0.66, y: -0.08 };
  const k = i / (n - 1);
  return { x: 0.3 + 0.36 * k, y: -0.26 + 0.18 * k };
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * One card peeling off a pile, then its fate -- one animation, so a click
 * hurries all of it (A-00). `dx`, `dy`: where the lift ends, in pixels from
 * the pile. Run linear over the returned duration; the last frame is
 * exactly `placement(to, ..., toOrigin)`.
 */
export function peelFrames(
  fate: Fate,
  from: Box,
  to: Box,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  toOrigin: { x: number; y: number },
  dx: number,
  dy: number,
): { frames: Keyframe[]; duration: number } {
  const off: Box = {
    ...from,
    x: from.x + dx,
    y: from.y + dy,
    scale: from.scale * PEEL_GROW,
    w: from.w * PEEL_GROW,
    h: from.h * PEEL_GROW,
  };
  const ox = origin.x * cardW;
  const oy = origin.y * cardH;
  const at = (b: Box, s: number) =>
    `translate3d(${b.x - ox * (1 - s)}px, ${b.y - oy * (1 - s)}px, 0) rotate(${b.rotation}deg) scale(${s})`;
  const fated = fateFrames(fate, off, to, cardW, cardH, origin, toOrigin);
  const duration = PEEL_MS + fated.duration;
  const share = (ms: number) => ms / duration;
  const whole = "brightness(1) grayscale(0) drop-shadow(0px 0px 0px rgba(191, 224, 255, 0))";
  const frames: Keyframe[] = [];
  const steps = 6;
  for (let k = 0; k < steps; k++) {
    const e = k === 0 ? 0 : easeOut(k / steps);
    const s = from.scale + (off.scale - from.scale) * e;
    const b = { ...from, x: from.x + dx * e, y: from.y + dy * e };
    frames.push({
      offset: share((PEEL_MS * k) / steps),
      transform: at(b, s),
      filter: whole,
      opacity: 1,
    });
  }
  for (const frame of fated.frames) {
    frames.push({ ...frame, offset: share(PEEL_MS + Number(frame.offset) * fated.duration) });
  }
  return { frames, duration };
}

// --- Tokens, from their source ------------------------------------------------

/** A token grows out of its spark (the canvas's 150 ms), then Glides. */
export const TOKEN_GROW_MS = 150;
export const TOKEN_MS = TOKEN_GROW_MS + MOVE_MS;
/** The next token, this far behind: a spell's (150 ms), an ability's (Krenko: 120 ms). */
export const TOKEN_BEAT_MS = 150;
export const TOKEN_BEAT_ABILITY_MS = 120;
/**
 * The first spark, after the resolving spell has glowed a while: the canvas
 * has the spell leave 150 ms after the first spark, and the board's spell
 * leaves at RESOLVE_MS (380), so the first spark is at 230.
 */
export const TOKEN_AFTER_MS = 230;
/** The spark: from 60 ms before its token grows, for 400 ms. */
export const SPARK_LEAD_MS = 60;
export const SPARK_MS = 400;
/** It starts this small (of the card) and Glides from its full size. */
export const TOKEN_FROM = 0.3;

/** The box of a card the size of `to`, centred on `at`, upright. */
export function boxOn(at: { x: number; y: number }, to: Box): Box {
  return { ...to, x: at.x - to.w / 2, y: at.y - to.h / 2, rotation: 0 };
}

/**
 * One token made: it grows out of its source (`from`, a card the size of its
 * place centred on the spark), fading in, then Glides to its place (`to`).
 * Run linear over TOKEN_MS; held unseen at its first frame until it starts.
 */
export function tokenFrames(
  from: Box,
  to: Box,
  cardW: number,
  cardH: number,
  toOrigin: { x: number; y: number },
): Keyframe[] {
  const ox = toOrigin.x * cardW;
  const oy = toOrigin.y * cardH;
  const share = (ms: number) => ms / TOKEN_MS;
  const frames: Keyframe[] = [];
  const steps = 4;
  // Grown about its centre: the place's origin is not its centre.
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  for (let k = 0; k < steps; k++) {
    const e = easeOut(k / steps);
    const s = from.scale * (TOKEN_FROM + (1 - TOKEN_FROM) * e);
    const w = cardW * s;
    const h = cardH * s;
    frames.push({
      offset: share((TOKEN_GROW_MS * k) / steps),
      transform: `translate3d(${cx - w / 2 - ox * (1 - s)}px, ${cy - h / 2 - oy * (1 - s)}px, 0) rotate(0deg) scale(${s})`,
      opacity: e,
    });
  }
  for (const frame of glideFrames(from, to, cardW, cardH, toOrigin, toOrigin, {
    from: 1,
    to: 1,
  })) {
    frames.push({ ...frame, offset: share(TOKEN_GROW_MS + Number(frame.offset) * MOVE_MS) });
  }
  return frames;
}

/** The spark on a token's source: it flares and grows, then fades (the canvas's). */
export function sparkFrames(): Keyframe[] {
  return [
    { offset: 0, opacity: 0, transform: "translate(-50%, -50%) scale(0.3)" },
    { offset: 0.2, opacity: 1, transform: "translate(-50%, -50%) scale(0.54)" },
    { offset: 0.67, opacity: 1, transform: "translate(-50%, -50%) scale(1.2)" },
    { offset: 1, opacity: 0, transform: "translate(-50%, -50%) scale(1.5)" },
  ];
}

// --- Their hidden hand: the card turns face up on the way --------------------

/** It turns over between these shares of its Glide (the canvas's 35%-65%). */
const TURN = [0.35, 0.65] as const;

/**
 * A card leaving the other player's hidden hand turns face up half-way, as
 * the canvas's: one Glide drawn by two elements -- `part` "back" (a card
 * back, narrowing edge-on over the first half of the turn, then gone) and
 * "face" (unseen until edge-on, then widening face up). One picture at a
 * time. `frames` are glideFrames (or any frames with a `scale(s)`).
 */
export function turnUp(frames: Keyframe[], part: "back" | "face"): Keyframe[] {
  return frames.map((frame) => {
    const t = Number(frame.offset ?? 0);
    const q = Math.min(1, Math.max(0, (t - TURN[0]) / (TURN[1] - TURN[0])));
    const shown = part === "back" ? q < 0.5 : q >= 0.5;
    const sx = Math.max(0.02, Math.abs(Math.cos(Math.PI * q)));
    const transform =
      q > 0 && q < 1
        ? String(frame["transform"]).replace(
            /scale\(([^)]+)\)$/,
            (_, s: string) => `scale(${Number(s) * sx}, ${s})`,
          )
        : String(frame["transform"]);
    return { ...frame, transform, opacity: shown ? 1 : 0 };
  });
}

// --- The badge ticking ------------------------------------------------------

/** The badge pops as it changes (the canvas's 0.4 over 240 ms). */
export const BADGE_POP = 0.4;
export const BADGE_POP_MS = 240;

/** One change to a pile's number: at `at` ms from now, by `by` (+1 joined, -1 left). */
export interface BadgeChange {
  at: number;
  by: number;
}

/** What the badge says from `from` (ms) until `until`: `n` cards. */
export interface BadgeSpell {
  n: number;
  from: number;
  until: number;
}

/**
 * The numbers a pile shows, in order, from `start` cards as each change
 * happens; the last runs on to `total` (the last change). Only spells with a
 * badge (two or more) matter to the page, but all are returned.
 */
export function badgeSpells(start: number, changes: readonly BadgeChange[]): BadgeSpell[] {
  const sorted = [...changes].sort((a, b) => a.at - b.at);
  const out: BadgeSpell[] = [];
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

/**
 * The keyframes of one badge spell over `total` ms: shown (popping as it
 * starts, unless it is the first) from `from` to `until`, unseen otherwise.
 * Run linear over `total`; the last spell holds its own opacity after.
 */
export function badgeFrames(spell: BadgeSpell, total: number, first: boolean): Keyframe[] {
  const at = (ms: number) => Math.min(1, Math.max(0, ms / Math.max(1, total)));
  const until = Math.min(spell.until, total);
  const frames: Keyframe[] = [];
  const pop = (k: number) => `scale(${1 + BADGE_POP * Math.sin(Math.PI * k)})`;
  if (spell.from > 0) {
    frames.push({ offset: 0, opacity: 0, transform: pop(0) });
    frames.push({ offset: at(spell.from), opacity: 0, transform: pop(0) });
  }
  frames.push({ offset: at(spell.from), opacity: 1, transform: pop(0) });
  if (!first) {
    for (const k of [0.25, 0.5, 0.75, 1]) {
      const ms = spell.from + BADGE_POP_MS * k;
      if (ms < until) frames.push({ offset: at(ms), opacity: 1, transform: pop(k) });
    }
  }
  if (spell.until < Infinity && until < total) {
    frames.push({ offset: at(until), opacity: 1, transform: pop(0) });
    frames.push({ offset: at(until), opacity: 0, transform: pop(0) });
    frames.push({ offset: 1, opacity: 0, transform: pop(0) });
  } else if (frames[frames.length - 1]!.offset !== 1) {
    frames.push({ offset: 1, opacity: 1, transform: pop(0) });
  }
  return frames;
}
