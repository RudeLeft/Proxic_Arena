// Spec 0105 -- F-0105-F: the page's arrivals fit the worker's allowances.
//
// The worker holds an unanswered stack object ARRIVE + REST ms
// (forge-worker StackRests: ARRIVE_SPELL_MS, ARRIVE_ABILITY_MS), so each
// seat's ring runs at least REST_MS after its card lands. That holds only
// while the page's slowest arrival fits the allowance: the other player's
// spell (flip, face-up hold, flight) and a trigger's rise. Spec 0106 scales
// those; this test re-runs against its pace.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDED_FADE_MS, RISE_MS, SPELL_WAIT_MS, STACK_IN_MS } from "./Board";
import { BALL_MS } from "./manaBalls";
import { FLIP_MS, FLY_MS, HOLD_MS, DECIDE_MS } from "./CastingCard";
import { LANDING_BEAT_MS, THEIR_SPELL_HOLD_MS } from "./GameScreen";

/** The worker's own constants, read from its source: one number, two languages. */
function worker(name: string): number {
  const source = readFileSync(
    resolve(
      __dirname,
      "../../../forge-worker/src/main/java/net/barnflix/proxic/worker/game/StackRests.java",
    ),
    "utf8",
  );
  const m = new RegExp(`static final long ${name} = (\\d+);`).exec(source);
  if (!m) throw new Error(`StackRests.${name} not found`);
  return Number(m[1]);
}

describe("F-0105-F · the page's arrivals fit the worker's allowances", () => {
  it("the worker's numbers are the owner's (Q2 B)", () => {
    expect(worker("REST_MS")).toBe(2500);
    expect(worker("REST_NEXT_MS")).toBe(800);
    expect(worker("ARRIVE_SPELL_MS")).toBe(3100);
    expect(worker("ARRIVE_ABILITY_MS")).toBe(700);
  });

  // Amendment 1 (owner 2026-11-19): the caster's mana balls land before the
  // other player's card turns over, and the stack card fades in after the
  // flight -- both are in the arrival (measured 2495-2553 ms in the real game).
  const theirArrival = BALL_MS + FLIP_MS + HOLD_MS + FLY_MS + LANDED_FADE_MS;

  it("the other player's spell reaches the stack within ARRIVE_SPELL_MS", () => {
    expect(theirArrival).toBeLessThanOrEqual(worker("ARRIVE_SPELL_MS"));
    // ...and still at spec 0106's 1.25x pace on movement.
    expect(theirArrival * 1.25).toBeLessThanOrEqual(worker("ARRIVE_SPELL_MS"));
    // The caster's own: it waits DECIDE_MS, then flies.
    expect(DECIDE_MS + FLY_MS).toBeLessThanOrEqual(worker("ARRIVE_SPELL_MS"));
  });

  it("a trigger or ability reaches the stack within ARRIVE_ABILITY_MS", () => {
    expect(RISE_MS).toBeLessThanOrEqual(worker("ARRIVE_ABILITY_MS"));
    expect(STACK_IN_MS).toBeLessThanOrEqual(worker("ARRIVE_ABILITY_MS"));
  });

  it("the other player's hold covers the flight it holds for, with a landing beat", () => {
    expect(THEIR_SPELL_HOLD_MS).toBe(FLIP_MS + HOLD_MS + FLY_MS + LANDING_BEAT_MS);
    expect(THEIR_SPELL_HOLD_MS).toBeGreaterThanOrEqual(FLIP_MS + HOLD_MS + FLY_MS);
  });

  it("the cascade trigger's safety wait outlasts the longest rest", () => {
    expect(SPELL_WAIT_MS).toBeGreaterThan(worker("ARRIVE_SPELL_MS") + worker("REST_MS"));
  });
});
