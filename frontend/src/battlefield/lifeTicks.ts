// Spec 0067, item 1 (owner 2026-11-09, canvas batch-1109 "A · Step per hit")
// -- the life on a plate steps down as each attacker hits.
//
// The board the game sends already holds the life after the whole damage
// step, but the fights play one at a time (fights.ts) and an attacker
// reaches the player a second or more later. So while the fights play, the
// plate shows the board's life LESS what has not landed yet: it holds the
// life from before the damage and drops by each hit's amount at that hit's
// impact on the fight clock (lifelink adds when its blow lands). When the
// clock ends -- or a click hurries it to its end -- nothing is left to
// come, and the plate is the board's number again: never wrong for long,
// and the number it settles on is always the game's (ARCH-003: a view of
// the board, not a second count). A pile of identical tokens fights as one
// drawn card (fights.ts), so it is one step for the pile's total.
//
// Spec 0077 (owner 2026-11-12, canvas life-1112) -- every other life change
// steps too: damage and loss (one look, "A · Impact"), gain (a green rise)
// and poison (the badge by the shield), point by point, on a clock of their
// own that starts when the spell's beam lands (or at once, with no beam).
// The plate shows the board's life less what is still to come on every
// clock; poison works the same way on the badge.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FightPlan } from "./fights";
import type { LifeChange } from "../match";

/** One change still to come on a plate: when (on its clock) and by how much (-3, +2). */
export interface LifeStep {
  seat: number;
  at: number;
  amount: number;
  /** Spec 0077 -- poison counters on the badge, not life. */
  poison?: boolean;
  /**
   * Spec 0077 -- a blow lands with this step: the shield shakes (life) or the
   * badge pulses (poison). Unsaid: a drop in life is a blow, a rise is not,
   * poison always is -- so a change told point by point marks only its first.
   */
  blow?: boolean;
}

/** Whether [step] is a blow (see LifeStep.blow). */
export function isBlow(step: LifeStep): boolean {
  return step.blow ?? (step.poison === true || step.amount < 0);
}

/**
 * Every life change a plan's fights show, timed from the plan's start plus
 * [hold]. Spec 0077: an infect hit is poison, on the badge at its blow; and
 * poison the round's changes tell beyond those hits (toxic) lands at its
 * attacker's blow, else the last.
 */
export function lifeSteps(
  plan: FightPlan,
  hold = 0,
  changes: readonly LifeChange[] = [],
): LifeStep[] {
  const out: LifeStep[] = [];
  const infected = new Map<number, number>();
  plan.fights.forEach((fight, n) => {
    for (const strike of fight.strikes) {
      if (!strike.target.startsWith("player:")) continue;
      const seat = Number(strike.target.slice("player:".length));
      if (!Number.isFinite(seat) || strike.amount <= 0) continue;
      if (strike.poison) {
        out.push({ seat, at: hold + strike.at, amount: strike.amount, poison: true });
        infected.set(seat, (infected.get(seat) ?? 0) + strike.amount);
        continue;
      }
      out.push({ seat, at: hold + strike.at, amount: -strike.amount });
    }
    const gains = [...fight.gains, ...(n === plan.fights.length - 1 ? plan.unsourced : [])];
    for (const gain of gains) {
      if (gain.amount > 0) out.push({ seat: gain.player, at: hold + gain.at, amount: gain.amount });
    }
  });
  const last = plan.fights[plan.fights.length - 1];
  for (const change of changes) {
    if (!change.combat || change.kind !== "poison" || !last) continue;
    const covered = Math.min(change.amount, infected.get(change.player) ?? 0);
    infected.set(change.player, (infected.get(change.player) ?? 0) - covered);
    const rest = change.amount - covered;
    if (rest <= 0) continue;
    const fight = plan.fights.find((f) => f.attacker === change.source) ?? last;
    out.push({ seat: change.player, at: hold + fight.impact, amount: rest, poison: true });
  }
  return out;
}

/** Spec 0077 -- the pace a change steps at: a point each this, ... */
export const LIFE_POINT_MS = 90;
/** ... never longer than this for the whole change (a drain of 20 does not hold the table). */
export const LIFE_CHANGE_MAX_MS = 900;
/** One change (a trigger) to the next, so each reads as its own. */
export const LIFE_BEAT_MS = 450;

/** Spec 0077 -- one change as it will play: when it lands, and how long its points take. */
export interface PlayedChange {
  change: LifeChange;
  /** When it lands, from its clock's start. */
  at: number;
  /** How long its points take to step. */
  span: number;
}

/** The ms between two points of an [amount]-point change. */
export function pointMs(amount: number): number {
  return amount <= 1 ? 0 : Math.min(LIFE_POINT_MS, LIFE_CHANGE_MAX_MS / amount);
}

/**
 * Spec 0077 -- when each of a round's changes (not combat's: those play with
 * the fights) lands. The first lands at [start]; one source's changes to
 * different players land together (Gray Merchant: Bob's loss and Alice's
 * gain); anything else -- another trigger, the same player again (Soul
 * Warden x3) -- waits for the one before to have stepped, and a beat.
 */
export function planChanges(changes: readonly LifeChange[], start: number): PlayedChange[] {
  const out: PlayedChange[] = [];
  let at = start;
  let group: PlayedChange[] = [];
  for (const change of changes) {
    if (change.combat) continue;
    const joins =
      group.length > 0 &&
      change.source !== undefined &&
      group.every((g) => g.change.source === change.source && g.change.player !== change.player);
    if (!joins && group.length > 0) {
      at += Math.max(LIFE_BEAT_MS, ...group.map((g) => g.span + LIFE_POINT_MS * 2));
      group = [];
    }
    const span = pointMs(change.amount) * (change.amount - 1);
    const played = { change, at, span };
    group.push(played);
    out.push(played);
  }
  return out;
}

/** Spec 0077 -- a played change's points: one a step, the first a blow (not a gain's). */
export function changeSteps(played: readonly PlayedChange[]): LifeStep[] {
  const out: LifeStep[] = [];
  for (const { change, at } of played) {
    const ms = pointMs(change.amount);
    const sign = change.kind === "damage" || change.kind === "loss" ? -1 : 1;
    for (let i = 0; i < change.amount; i++) {
      out.push({
        seat: change.player,
        at: at + i * ms,
        amount: sign,
        ...(change.kind === "poison" ? { poison: true } : {}),
        blow: i === 0 && change.kind !== "gain",
      });
    }
  }
  return out;
}

/** How much of [seat]'s change is still to come at [t]: the board's life less this is what shows. */
export function stillToCome(
  steps: readonly LifeStep[],
  seat: number,
  t: number,
  poison = false,
): number {
  let sum = 0;
  for (const step of steps)
    if (step.seat === seat && step.at > t && (step.poison === true) === poison) sum += step.amount;
  return sum;
}

/** The life a plate shows: the board's, less what has not landed yet. */
export function shownLife(
  life: number,
  steps: readonly LifeStep[],
  seat: number,
  t: number,
): number {
  return life - stillToCome(steps, seat, t);
}

/** Spec 0077 -- the poison the badge shows: the board's, less what has not landed yet. */
export function shownPoison(
  poison: number,
  steps: readonly LifeStep[],
  seat: number,
  t: number,
): number {
  return Math.max(0, poison - stillToCome(steps, seat, t, true));
}

// --- the clocks now playing ------------------------------------------------------

interface Run {
  /** Where the clock is, in ms from its start. */
  now: () => number;
  steps: LifeStep[];
}

/** The fights' clock (spec 0067), and spec 0077's for every other change. */
export type LifeClock = "fights" | "life";

const runs = new Map<LifeClock, Run>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/**
 * What is still to come on [clock] now, timed from this moment -- to carry
 * into the next one when a new round arrives before it is over (first
 * strike, then the regular damage).
 */
export function lifeStillPlaying(clock: LifeClock = "fights"): LifeStep[] {
  const run = runs.get(clock);
  if (!run) return [];
  const t = run.now();
  return run.steps.filter((step) => step.at > t).map((step) => ({ ...step, at: step.at - t }));
}

/** A clock starts: the plates follow [now] until [endLifeSteps]. */
export function startLifeSteps(
  now: () => number,
  steps: LifeStep[],
  clock: LifeClock = "fights",
): void {
  if (steps.length > 0) runs.set(clock, { now, steps });
  else runs.delete(clock);
  notify();
}

/**
 * The clock ended or was hurried (or the board went): the plates show the
 * board's numbers. No clock named: every one.
 */
export function endLifeSteps(clock?: LifeClock): void {
  if (clock === undefined) {
    if (runs.size === 0) return;
    runs.clear();
  } else if (!runs.delete(clock)) return;
  notify();
}

/**
 * Spec 0089 (Q1 A) -- every change still to come on any plate has landed: the
 * last hit of the game is in, and each count reads the board's number. (A
 * clock may still be running its rising "−N"; that is not a hit to wait for.)
 */
export function lifeLanded(): boolean {
  for (const run of runs.values()) {
    const t = run.now();
    if (run.steps.some((step) => step.at > t)) return false;
  }
  return true;
}

/**
 * Spec 0089 (Q1 A) -- lifeLanded(), redrawn when it changes (spec 0095: not
 * on every frame of the clocks). While [watch] and a hit is still to land, a
 * frame loop only LOOKS at the clocks; the screen redraws once, the frame the
 * last hit lands. Not watched, nothing redraws for it.
 */
export function useLifeLanded(watch: boolean): boolean {
  const [, redraw] = useState(0);
  const landed = lifeLanded();
  const drawn = useRef(landed);
  drawn.current = landed;
  const watching = useRef(watch);
  watching.current = watch;
  useLayoutEffect(() => {
    const listener = () => {
      if (watching.current && lifeLanded() !== drawn.current) redraw((n) => n + 1);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    if (!watch || landed) return undefined;
    let frame = 0;
    const tick = () => {
      if (lifeLanded()) {
        redraw((n) => n + 1);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [watch, landed]);
  return landed;
}

/** What a plate shows now: its life and poison, the blows landed, and whether more is to come. */
function plateNow(seat: number, life: number, poison: number) {
  let shown = life;
  let shownP = poison;
  let pending = false;
  const landed: LifeStep[] = [];
  for (const run of runs.values()) {
    const t = run.now();
    shown = shownLife(shown, run.steps, seat, t);
    shownP = shownPoison(shownP, run.steps, seat, t);
    for (const step of run.steps) {
      if (step.seat !== seat) continue;
      if (step.at > t) pending = true;
      else if (isBlow(step)) landed.push(step);
    }
  }
  return { life: shown, poison: shownP, pending, landed };
}

/**
 * The plate now: its life and poison, and a count of the blows landed on each.
 * Spec 0095 -- redrawn only when what it shows changes: while something is
 * still to land, a frame loop looks at the clocks and redraws the plate on
 * the frame a point (or a blow) lands, not on every frame.
 */
export function useShownPlate(
  seat: number,
  life: number,
  poison = 0,
): { life: number; hits: number; poison: number; poisonHits: number } {
  const [, redraw] = useState(0);
  const now = plateNow(seat, life, poison);
  // What this drawing shows, for the frame loop and the clocks' listener.
  const drawn = useRef({ life: now.life, poison: now.poison, landed: now.landed.length });
  drawn.current = { life: now.life, poison: now.poison, landed: now.landed.length };
  const args = useRef({ seat, life, poison });
  args.current = { seat, life, poison };
  const pendingRef = useRef(now.pending);
  pendingRef.current = now.pending;
  // Layout, not passive: the board starts its clocks in a layout effect,
  // and a plate told then redraws before the frame is painted -- the new
  // total never shows ahead of the first blow.
  useLayoutEffect(() => {
    const listener = () => {
      const { seat: s, life: l, poison: p } = args.current;
      const next = plateNow(s, l, p);
      const was = drawn.current;
      if (
        next.life !== was.life ||
        next.poison !== was.poison ||
        next.landed.length !== was.landed ||
        next.pending !== pendingRef.current
      )
        redraw((n) => n + 1);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  // While something is still to land on this plate, look at the clock each
  // frame; redraw when a point or a blow lands, or nothing is left to come.
  useEffect(() => {
    if (!now.pending) return undefined;
    let frame = 0;
    const tick = () => {
      const { seat: s, life: l, poison: p } = args.current;
      const next = plateNow(s, l, p);
      const was = drawn.current;
      if (
        next.life !== was.life ||
        next.poison !== was.poison ||
        next.landed.length !== was.landed ||
        !next.pending
      ) {
        redraw((n) => n + 1);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  });
  // A blow: one that landed on a clock now playing (not a new board's own drop).
  const seen = useRef(new WeakSet<LifeStep>());
  const hits = useRef(0);
  const poisonHits = useRef(0);
  for (const step of now.landed) {
    if (seen.current.has(step)) continue;
    seen.current.add(step);
    if (step.poison) poisonHits.current += 1;
    else hits.current += 1;
  }
  return { life: now.life, hits: hits.current, poison: now.poison, poisonHits: poisonHits.current };
}

/** The plate's life now (spec 0067's A): the number, and a count of the hits that landed. */
export function useShownLife(seat: number, life: number): { life: number; hits: number } {
  const plate = useShownPlate(seat, life);
  return { life: plate.life, hits: plate.hits };
}
