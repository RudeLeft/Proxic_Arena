// The match reducer — PHASE_06 §6.99–§6.104, §6.110–§6.113.
//
// Every test here is about a moment where the page could show
// something that is not true: a question that has been answered,
// an answer that was refused, an empty game where a decision is
// still pending. §6.112 is the standard they are all measured
// against — a disconnect, a refusal or a race must never result
// in a player being passed for.

import { describe, expect, it } from "vitest";
import { EMPTY_MATCH, reduceMatch, type MatchState } from "./match";

function apply(messages: Record<string, unknown>[], from: MatchState = EMPTY_MATCH): MatchState {
  return messages.reduce(reduceMatch, from);
}

const QUESTION = {
  type: "DECISION_REQUEST",
  decisionId: 7,
  actedForSeat: 1,
  kind: "chooseSpellAbilityToPlay",
  stateVersion: 42,
  options: [
    { actionId: "action:0:card:7", label: "Mountain - tap" },
    { actionId: "action:1:card:9", label: "Lightning Bolt - cast" },
  ],
};

describe("connecting", () => {
  it("learns its own seat from the greeting", () => {
    const state = apply([{ type: "MATCH_HELLO", matchId: "m-1", seat: 2 }]);
    expect(state.seat).toBe(2);
    expect(state.connection).toBe("open");
  });

  it("ignores a greeting with no seat rather than claiming seat zero", () => {
    const state = apply([{ type: "MATCH_HELLO", matchId: "m-1" }]);
    expect(state.seat).toBeNull();
  });
});

describe("a decision", () => {
  it("arrives with its options in the order Forge gave them", () => {
    const state = apply([QUESTION]);
    expect(state.decision?.decisionId).toBe(7);
    expect(state.decision?.options.map((o) => o.actionId)).toEqual([
      "action:0:card:7",
      "action:1:card:9",
    ]);
  });

  it("drops an option with no action id rather than showing a dead button", () => {
    const state = apply([
      { ...QUESTION, options: [{ label: "nothing to click" }, { actionId: "action:0:card:3" }] },
    ]);
    expect(state.decision?.options).toHaveLength(1);
    // ?.[0] rather than [0]: noUncheckedIndexedAccess makes an
    // index access possibly-undefined, and the assertion above
    // does not narrow it for the compiler.
    expect(state.decision?.options?.[0]?.label).toBeNull();
  });

  // Kotlin's Long does not fit JavaScript's number, so ids may
  // arrive as strings. Becoming NaN here would make every
  // subsequent comparison false and the page would never clear a
  // question.
  it("reads ids sent as strings", () => {
    const state = apply([{ ...QUESTION, decisionId: "7", stateVersion: "42" }]);
    expect(state.decision?.decisionId).toBe(7);
    expect(state.decision?.stateVersion).toBe(42);
  });

  it("ignores a frame missing the seat it is about", () => {
    const state = apply([QUESTION, { type: "DECISION_REQUEST", decisionId: 8, stateVersion: 43 }]);
    expect(state.decision?.decisionId).toBe(7);
  });
});

describe("answering", () => {
  it("clears the question when the server accepts it", () => {
    const state = apply([QUESTION, { type: "DECISION_ACCEPTED", decisionId: 7 }]);
    expect(state.decision).toBeNull();
    expect(state.awaiting).toBeNull();
  });

  /**
   * THE ORDERING ONE. The receipt for decision 7 and the arrival
   * of decision 8 are written by different threads on the
   * server, so they can land either way round. Clearing
   * unconditionally would throw away a live question and leave
   * the player looking at a game that is waiting for them.
   */
  it("a late receipt does not clear the question that replaced it", () => {
    const state = apply([
      QUESTION,
      { ...QUESTION, decisionId: 8 },
      { type: "DECISION_ACCEPTED", decisionId: 7 },
    ]);
    expect(state.decision?.decisionId).toBe(8);
  });

  /**
   * §6.112 — a refusal is not the end of the question.
   *
   * The dangerous version clears the decision on refusal: the
   * player is then looking at an empty game, Forge is still
   * blocked on them, and nothing on screen says so.
   */
  it("a refusal keeps the question and explains itself", () => {
    const state = apply([
      QUESTION,
      { type: "DECISION_REFUSED", decisionId: 7, reason: "STALE_STATE" },
    ]);
    expect(state.decision?.decisionId).toBe(7);
    expect(state.awaiting).toBeNull();
    expect(state.notice).toContain("moved on");
  });

  it("explains a refusal it has never heard of without printing the code", () => {
    const state = apply([
      QUESTION,
      { type: "DECISION_REFUSED", decisionId: 7, reason: "SOMETHING_NEW" },
    ]);
    expect(state.notice).toBe("That answer was not accepted.");
  });

  it("a new question clears a stale notice", () => {
    const state = apply([
      QUESTION,
      { type: "DECISION_REFUSED", decisionId: 7, reason: "DUPLICATE" },
      { ...QUESTION, decisionId: 8 },
    ]);
    expect(state.notice).toBeNull();
    expect(state.decision?.decisionId).toBe(8);
  });
});

describe("what it refuses to invent", () => {
  it("leaves state untouched for a message it does not know", () => {
    const before = apply([QUESTION]);
    expect(reduceMatch(before, { type: "SOMETHING_NEW" })).toEqual(before);
  });

  // Nothing in this module ever produces an answer. There is no
  // auto-pass, no timeout, no "pick the first option" — §6.112
  // forbids all three, and the way to be sure is that no code
  // path here can emit one.
  it("never answers on its own", () => {
    const state = apply([QUESTION]);
    expect(state.awaiting).toBeNull();
    expect(state.decision?.decisionId).toBe(7);
  });
});

/**
 * Only one player holds priority — PHASE_06 §6.38.
 *
 * Reported from a real game: both browsers showed "Your move" at
 * once, one with Forge's actions and one with a Pass-only prompt
 * left over from earlier. Clicking the dead one was refused,
 * which is safe, but it reads as the game having broken — and it
 * means a player cannot tell whose turn it is from the screen.
 */
describe("when priority moves to the other player", () => {
  it("clears the prompt", () => {
    const state = apply([QUESTION, { type: "DECISION_CLEARED" }]);
    expect(state.decision).toBeNull();
    expect(state.awaiting).toBeNull();
  });

  it("clears a refusal notice with it", () => {
    const state = apply([
      QUESTION,
      { type: "DECISION_REFUSED", decisionId: 7, reason: "NOT_PENDING" },
      { type: "DECISION_CLEARED" },
    ]);
    expect(state.notice).toBeNull();
  });

  it("leaves the seat and connection alone", () => {
    const state = apply([
      { type: "MATCH_HELLO", matchId: "m-1", seat: 2 },
      QUESTION,
      { type: "DECISION_CLEARED" },
    ]);
    expect(state.seat).toBe(2);
    expect(state.connection).toBe("open");
  });
});
