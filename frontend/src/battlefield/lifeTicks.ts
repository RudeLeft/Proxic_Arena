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

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FightPlan } from "./fights";

/** One change still to come on a plate: when (on the fight clock) and by how much (-3, +2). */
export interface LifeStep {
  seat: number;
  at: number;
  amount: number;
}

/** Every life change a plan's fights show, timed from the plan's start plus [hold]. */
export function lifeSteps(plan: FightPlan, hold = 0): LifeStep[] {
  const out: LifeStep[] = [];
  plan.fights.forEach((fight, n) => {
    for (const strike of fight.strikes) {
      if (!strike.target.startsWith("player:")) continue;
      const seat = Number(strike.target.slice("player:".length));
      if (!Number.isFinite(seat) || strike.amount <= 0) continue;
      out.push({ seat, at: hold + strike.at, amount: -strike.amount });
    }
    const gains = [...fight.gains, ...(n === plan.fights.length - 1 ? plan.unsourced : [])];
    for (const gain of gains) {
      if (gain.amount > 0) out.push({ seat: gain.player, at: hold + gain.at, amount: gain.amount });
    }
  });
  return out;
}

/** How much of [seat]'s change is still to come at [t]: the board's life less this is what shows. */
export function stillToCome(steps: readonly LifeStep[], seat: number, t: number): number {
  let sum = 0;
  for (const step of steps) if (step.seat === seat && step.at > t) sum += step.amount;
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

// --- the fights now playing ------------------------------------------------------

interface Run {
  /** Where the fight clock is, in ms from its start. */
  now: () => number;
  steps: LifeStep[];
}

let run: Run | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/**
 * What is still to come of the fights playing now, timed from this moment
 * -- to carry into the next clock when a new damage step arrives before
 * these fights are over (first strike, then the regular damage).
 */
export function lifeStillPlaying(): LifeStep[] {
  if (!run) return [];
  const t = run.now();
  return run.steps.filter((step) => step.at > t).map((step) => ({ ...step, at: step.at - t }));
}

/** Fights begin on a new clock: the plates follow [now] until [endLifeSteps]. */
export function startLifeSteps(now: () => number, steps: LifeStep[]): void {
  run = steps.length > 0 ? { now, steps } : null;
  notify();
}

/** The clock ended or was hurried (or the board went): every plate shows the board's life. */
export function endLifeSteps(): void {
  if (!run) return;
  run = null;
  notify();
}

/** The plate's life now (the canvas's A): the number, and a count of the hits that landed. */
export function useShownLife(seat: number, life: number): { life: number; hits: number } {
  const [, redraw] = useState(0);
  // Layout, not passive: the board starts its fights in a layout effect,
  // and a plate told then redraws before the frame is painted -- the new
  // total never shows ahead of the first blow.
  useLayoutEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const current = run;
  const shown = current ? shownLife(life, current.steps, seat, current.now()) : life;
  const pending = current
    ? current.steps.some((s) => s.seat === seat && s.at > current.now())
    : false;
  // While something is still to land on this plate, look at the clock each frame.
  useEffect(() => {
    if (!pending) return undefined;
    let frame = 0;
    const tick = () => {
      redraw((n) => n + 1);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [pending]);
  // A hit: the number went down on the same board (not a new board's own drop).
  const was = useRef({ life, shown });
  const hits = useRef(0);
  if (was.current.shown !== shown) {
    if (shown < was.current.shown && current) hits.current += 1;
    was.current = { life, shown };
  }
  return { life: shown, hits: hits.current };
}
