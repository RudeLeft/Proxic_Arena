// Spec 0078 (owner 2026-11-12, canvas pt-1112) -- a creature getting bigger
// or smaller, the damage left on it, a planeswalker's loyalty, and the
// counters on a card, changing as they change instead of in one step.
//
// The page sees numbers change, never what changed them (ARCH-002: no rule
// is worked out here). Comparing the board drawn with the new one gives,
// for each permanent still on the table, its size before and now -- power,
// the toughness it has LEFT (toughness less damage, look A of item 6) and
// loyalty -- and its counters. What kind of change it was is read from what
// the game sent: a counter that came or went, damage the round's damage
// wave dealt, the turn's end (cleanup), or anything else.
//
// The number switches to the new size in one step, with a pop, as the rising
// number appears (Amendment 1, owner 2026-11-12: no counting on cards; the
// life shield keeps 0077's count), on a clock of the board's own so a click
// hurries it (A-00): what shows is the board's size less what is still to
// come. The looks (pop, glow, shake, rising number, badge growing
// in) are each a Web Animation on the card, started from the same moment.

import { useEffect, useLayoutEffect, useState } from "react";
import { LIFE_CHANGE_MAX_MS, LIFE_POINT_MS } from "./lifeTicks";

/** What a card's number says: power, the toughness it has left, loyalty. */
export interface Size {
  power: number | null;
  toughness: number | null;
  loyalty: number | null;
}

/** The facts a size is read from (a battlefield card, as the game sent it). */
export interface Sized {
  id: string;
  name: string;
  faceDown: boolean;
  power: number | null;
  toughness: number | null;
  damage?: number | undefined;
  counters?: readonly { name: string; count: number }[];
}

/**
 * How a change looks (the canvas's, per the owner's choices):
 * - up: bigger -- pop, green "+3/+3", a soft green edge (1 A, 4 A)
 * - down: smaller -- the small shake, a red "−4/−4" (3 A); a counter taken
 *   off that makes it smaller looks the same (8 B)
 * - worn: the turn's end -- back in grey with a grey float (5 B)
 * - hit: damage dealt -- the fight (or the spell's burst) already showed the
 *   number; the toughness left pops down in red, no float (6 A)
 * - healed: damage gone at the turn's end -- grey, with a grey "+3" (Amendment 1)
 * - loyalUp / loyalDown: a planeswalker -- gold "+1", red "−3" with the
 *   shake (7 A)
 */
export type SizeLook = "up" | "down" | "worn" | "hit" | "healed" | "loyalUp" | "loyalDown";

/** One permanent's change this round. */
export interface SizeChange {
  card: string;
  from: Size;
  to: Size;
  /** Null: only its badges change (a charge counter). */
  look: SizeLook | null;
  /** The rising number ("+3/+3", "−1", "−3/−3"), or none. */
  float: string | null;
  /** Its counters that changed, with how many before and now. */
  badges: { name: string; from: number; to: number }[];
  /** A counter came: the badge goes first, the number rises off it (2 A). */
  fromBadge: boolean;
}

/** The round's changes. A new key is a new round. */
export interface SizeChanges {
  key: string;
  changes: SizeChange[];
  /**
   * Item 4 -- each creature that left the battlefield this round: its size as
   * it last stood there, as the game sent it with its move (`last`).
   */
  last: ReadonlyMap<string, { power: number; toughness: number }>;
}

const PT_COUNTERS = new Set(["P1P1", "M1M1"]);

/** A card's size as its number shows it: the toughness it has left. */
export function sizeOf(card: Sized): Size {
  const loyalty = card.counters?.find((c) => c.name === "LOYALTY")?.count ?? null;
  if (card.power === null || card.toughness === null)
    return { power: null, toughness: null, loyalty };
  return {
    power: card.power,
    toughness: card.toughness - Math.max(0, card.damage ?? 0),
    loyalty: null,
  };
}

/** "+3", "−4" (the minus sign, as 0077's floats), "+0". */
export function signed(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}

/**
 * Every change between two boards. [wornOff]: the turn ended in between
 * (cleanup ran: a pump wears off, damage goes). [struck]: the permanents the
 * round's damage wave hit (their number already showed it).
 */
export function sizeChanges(
  before: readonly Sized[],
  now: readonly Sized[],
  opts: { wornOff: boolean; struck: ReadonlySet<string> },
): SizeChange[] {
  const was = new Map(before.map((c) => [c.id, c]));
  const out: SizeChange[] = [];
  for (const card of now) {
    const old = was.get(card.id);
    // A card that changed what it is (flipped, turned face up) is A-09's.
    if (!old || old.faceDown !== card.faceDown || old.name !== card.name) continue;
    const from = sizeOf(old);
    const to = sizeOf(card);
    const counts = (c: Sized) => new Map((c.counters ?? []).map((k) => [k.name, k.count]));
    const a = counts(old);
    const b = counts(card);
    const badges: SizeChange["badges"] = [];
    for (const name of new Set([...a.keys(), ...b.keys()])) {
      if (name === "LOYALTY") continue;
      const x = a.get(name) ?? 0;
      const y = b.get(name) ?? 0;
      if (x !== y) badges.push({ name, from: x, to: y });
    }
    const dL = (to.loyalty ?? 0) - (from.loyalty ?? 0);
    const sized = from.power !== null && to.power !== null;
    const dP = sized ? to.power! - from.power! : 0;
    const dT = sized ? to.toughness! - from.toughness! : 0;
    const dDamage = sized ? (card.damage ?? 0) - (old.damage ?? 0) : 0;
    // The size apart from damage: what a pump, an Anthem or a counter did.
    const sP = dP;
    const sT = dT + dDamage;
    let look: SizeLook | null = null;
    let float: string | null = null;
    const counterSized = badges.some((k) => PT_COUNTERS.has(k.name));
    const came = badges.some((k) => PT_COUNTERS.has(k.name) && k.to > k.from);
    if (from.loyalty !== null && to.loyalty !== null && dL !== 0) {
      if (opts.struck.has(card.id) && dL < 0) look = "hit";
      else {
        look = dL > 0 ? "loyalUp" : "loyalDown";
        float = signed(dL);
      }
    } else if (sP !== 0 || sT !== 0) {
      const bigger = sP + sT > 0 || (sP + sT === 0 && sT > 0);
      if (opts.wornOff && !counterSized) look = "worn";
      else look = bigger ? "up" : "down";
      float = `${signed(sP)}/${signed(sT)}`;
    } else if (dDamage !== 0) {
      look = dDamage > 0 ? "hit" : "healed";
      // Amendment 1 (owner): the damage going rises too, in grey ("+3").
      if (look === "healed") float = signed(dT);
    }
    if (look === null && badges.length === 0) continue;
    out.push({
      card: card.id,
      from,
      to,
      look,
      float,
      badges,
      fromBadge: came && (look === "up" || look === "down"),
    });
  }
  return out;
}

// --- timing (the canvas's) ------------------------------------------------------

/** The badge goes first; the number pops this long after (2 A). */
export const BADGE_LEAD_MS = 120;
/** The first point lands this long after the pop starts. */
export const TICK_LEAD_MS = 40;
/** The number pops (scale 1.3) over this long. */
export const POP_MS = 380;
/** The card's edge glows (soft, in the change's colour) over this long. */
export const GLOW_MS = 900;
/** The small shake (0077's impact), on a change that harms. */
export const SHAKE_MS = 360;
/** The rising number's life. */
export const FLOAT_MS = 1150;
/** The tint on the number lasts its pop, and this. */
export const TINT_AFTER_MS = 120;
/** A badge grows in, pops its number, shrinks away. */
export const BADGE_GROW_MS = 380;
export const BADGE_POP_MS = 360;
export const BADGE_OUT_MS = 320;
/** Item 4 -- a creature shrunk to death breaks this long after it reached its last size. */
export const SHRINK_BEAT_MS = 600;

/** The colours, as the canvas's (and 0077's): up, down, gold, quiet. */
export const SIZE_COLOUR: Record<SizeLook, string> = {
  up: "#7be08a",
  down: "#ff6b57",
  hit: "#ff6b57",
  loyalDown: "#ff6b57",
  loyalUp: "#f2c95c",
  worn: "#c9d2cc",
  healed: "#c9d2cc",
};

/** How many points a change counts. */
export function pointsOf(change: { from: Size; to: Size }): number {
  const d = (a: number | null, b: number | null) => Math.abs((b ?? 0) - (a ?? 0));
  return Math.max(
    d(change.from.power, change.to.power),
    d(change.from.toughness, change.to.toughness),
    d(change.from.loyalty, change.to.loyalty),
  );
}

/** The ms between two points (0077's pace). */
export function sizePointMs(points: number): number {
  return Math.min(LIFE_POINT_MS, LIFE_CHANGE_MAX_MS / Math.max(1, points));
}

/** When the number starts counting, from when the change plays. */
export function countFrom(change: Pick<SizeChange, "fromBadge">): number {
  return (change.fromBadge ? BADGE_LEAD_MS : 0) + TICK_LEAD_MS;
}

/** How long a change takes to count, from when it plays. */
export function countSpan(change: SizeChange): number {
  // Amendment 1: one switch, no count -- the tint lasts the pop.
  return countFrom(change) + POP_MS - TICK_LEAD_MS;
}

/** One point of a change, still to come or landed: what it adds to each number. */
export interface SizeStep {
  card: string;
  at: number;
  power: number;
  toughness: number;
  loyalty: number;
}

/** A change, timed on its clock: when it plays. */
export interface PlayedSize {
  key: string;
  change: SizeChange;
  at: number;
}

/** A change's points, one a step (the canvas's tickAt): each number one nearer. */
export function sizeSteps(played: readonly PlayedSize[]): SizeStep[] {
  // Amendment 1 (owner, 2026-11-12): no counting on cards -- the number
  // switches to the new size in one step, with its pop, as the float rises.
  // (The life shield, spec 0077, still counts point by point.)
  return played
    .filter(({ change }) => pointsOf(change) > 0)
    .map(({ change, at }) => {
      const d = (a: number | null, b: number | null) => (b ?? 0) - (a ?? 0);
      return {
        card: change.card,
        at: at + countFrom(change),
        power: d(change.from.power, change.to.power),
        toughness: d(change.from.toughness, change.to.toughness),
        loyalty: d(change.from.loyalty, change.to.loyalty),
      };
    });
}

/** How long a round's changes take, looks and all. */
export function sizesLength(played: readonly PlayedSize[]): number {
  return Math.max(
    0,
    ...played.map((p) => p.at + Math.max(countSpan(p.change) + TINT_AFTER_MS, FLOAT_MS, GLOW_MS)),
  );
}

// --- the clocks now playing ------------------------------------------------------

interface Run {
  now: () => number;
  steps: SizeStep[];
  played: PlayedSize[];
}

const runs = new Map<string, Run>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** A clock starts: the cards' numbers follow [now] until [endSizeSteps]. */
export function startSizeSteps(
  clock: string,
  now: () => number,
  played: PlayedSize[],
  carried: SizeStep[] = [],
): void {
  runs.set(clock, { now, steps: [...carried, ...sizeSteps(played)], played });
  notify();
}

/** The points still to come on [clock], timed from now (carried into the next round). */
export function sizesStillPlaying(clock: string): SizeStep[] {
  const run = runs.get(clock);
  if (!run) return [];
  const t = run.now();
  return run.steps.filter((s) => s.at > t).map((s) => ({ ...s, at: s.at - t }));
}

/** Every number reads its clock again now (each one does, each frame, while it counts). */
export function redrawSizes(): void {
  notify();
}

/** The clock ended or was hurried (or the board went): the numbers are the board's. */
export function endSizeSteps(clock?: string): void {
  if (clock === undefined) {
    if (runs.size === 0) return;
    runs.clear();
  } else if (!runs.delete(clock)) return;
  notify();
}

/** One change of [card] now playing, and how far into it its clock is. */
export interface Playing {
  key: string;
  change: SizeChange;
  /** ms from now until it plays (negative: it started that long ago). */
  wait: number;
}

/** Each change of [card] on a clock now. */
export function playingOf(card: string): Playing[] {
  const out: Playing[] = [];
  for (const run of runs.values()) {
    const t = run.now();
    for (const p of run.played)
      if (p.change.card === card) out.push({ key: p.key, change: p.change, wait: p.at - t });
  }
  return out;
}

/** Redraw on any clock starting or ending, and each frame while [card] has points to come. */
function useSizeClock(card: string): number {
  const [n, redraw] = useState(0);
  // Layout, not passive: the board starts its clocks in a layout effect, and
  // a number told then redraws before the frame is painted -- the new size
  // never shows ahead of its change.
  useLayoutEffect(() => {
    const listener = () => redraw((x) => x + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  let pending = false;
  for (const run of runs.values()) {
    const t = run.now();
    if (run.steps.some((s) => s.card === card && s.at > t)) pending = true;
    if (
      run.played.some(
        (p) =>
          p.change.card === card && p.at + Math.max(countSpan(p.change), BADGE_OUT_MS) + 200 > t,
      )
    )
      pending = true;
  }
  useEffect(() => {
    if (!pending) return undefined;
    let frame = 0;
    const tick = () => {
      redraw((x) => x + 1);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [pending]);
  return n;
}

/**
 * [card]'s number now: the board's [size] less what is still to come, and
 * the colour of a change counting now (its tint), if one is.
 */
export function useShownSize(card: string, size: Size): { size: Size; tint: string | null } {
  useSizeClock(card);
  let power = size.power;
  let toughness = size.toughness;
  let loyalty = size.loyalty;
  let tint: string | null = null;
  for (const run of runs.values()) {
    const t = run.now();
    for (const s of run.steps) {
      if (s.card !== card || s.at <= t) continue;
      if (power !== null) power -= s.power;
      if (toughness !== null) toughness -= s.toughness;
      if (loyalty !== null) loyalty -= s.loyalty;
    }
    for (const p of run.played) {
      if (p.change.card !== card || p.change.look === null) continue;
      const begin = p.at + countFrom(p.change);
      if (t >= begin && t < p.at + countSpan(p.change) + TINT_AFTER_MS)
        tint = SIZE_COLOUR[p.change.look];
    }
  }
  return { size: { power, toughness, loyalty }, tint };
}

/** [card]'s badge changes on a clock now (a badge taken off shows until it has gone). */
export function useBadgeChanges(card: string): Playing[] {
  useSizeClock(card);
  return playingOf(card).filter(
    (p) => p.change.badges.length > 0 && p.wait + BADGE_OUT_MS + 60 > 0,
  );
}
