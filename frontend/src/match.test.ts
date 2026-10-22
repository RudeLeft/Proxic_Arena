// The match reducer — PHASE_06 §6.99–§6.104, §6.110–§6.113.
//
// Every test here is about a moment where the page could show
// something that is not true: a question that has been answered,
// an answer that was refused, an empty game where a decision is
// still pending. §6.112 is the standard they are all measured
// against — a disconnect, a refusal or a race must never result
// in a player being passed for.

import { describe, expect, it } from "vitest";
import { EMPTY_MATCH, concessionText, reduceMatch, type MatchState } from "./match";

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

/**
 * Some decisions have no "no" — PHASE_06 §6.105.
 *
 * Discarding to hand size is the plain case: the rules say
 * discard, so only WHICH is open, and Forge's own input disables
 * cancelling for it. The page must not offer a Pass the server
 * will refuse — a button that always fails reads as the game
 * being broken.
 */
describe("a decision that cannot be refused", () => {
  const MANDATORY = {
    type: "DECISION_REQUEST",
    decisionId: 9,
    actedForSeat: 1,
    kind: "chooseCardsToDiscardToMaximumHandSize",
    stateVersion: 3,
    mandatory: true,
    options: [{ actionId: "discard:card:12", label: "Mountain" }],
  };

  it("is carried as mandatory", () => {
    const state = apply([MANDATORY]);
    expect(state.decision?.mandatory).toBe(true);
  });

  // An older server that does not send the field must not
  // accidentally make a decision unrefusable.
  it("defaults to optional when the server says nothing", () => {
    const state = apply([QUESTION]);
    expect(state.decision?.mandatory).toBe(false);
  });

  it("only true means true", () => {
    const state = apply([{ ...MANDATORY, mandatory: "yes" }]);
    expect(state.decision?.mandatory).toBe(false);
  });

  it("explains a refused pass in words a player can act on", () => {
    const state = apply([
      MANDATORY,
      { type: "DECISION_REFUSED", decisionId: 9, reason: "PASS_NOT_ALLOWED" },
    ]);
    expect(state.notice).toContain("cannot be skipped");
    // And the question stays, because it still needs answering.
    expect(state.decision?.decisionId).toBe(9);
  });
});

// The board — PHASE_06 §6.40, §6.41, §6.42.
//
// What the page is allowed to believe about game state. §6.42 is
// the one that matters: hidden information is removed before
// serialisation, so these tests are about handling what arrives,
// never about concealing it afterwards.
describe("the board", () => {
  const SNAPSHOT = {
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: 10,
      turn: 3,
      phase: "MAIN1",
      activeSeat: 1,
      seat: 1,
      players: [
        { seat: 1, name: "RudeLeft", life: 20, handCount: 6, libraryCount: 52, graveyardCount: 1 },
        { seat: 2, name: "Pat", life: 18, handCount: 7, libraryCount: 51, graveyardCount: 0 },
      ],
      battlefield: [
        { id: "card:51", seat: 1, name: "Mountain", tapped: true, faceDown: false, known: true },
        { id: "card:77", seat: 2, name: "Face-down", tapped: false, faceDown: true, known: false },
      ],
      hand: [
        {
          id: "card:9",
          seat: 1,
          name: "Staggershock",
          tapped: false,
          faceDown: false,
          known: true,
        },
      ],
      graveyard: [],
      stack: [{ id: "stack:3", description: "Staggershock" }],
    },
  };

  it("reads the board the server sent", () => {
    const state = apply([SNAPSHOT]);
    expect(state.board?.turn).toBe(3);
    expect(state.board?.players).toHaveLength(2);
    expect(state.board?.battlefield[0]?.tapped).toBe(true);
    expect(state.board?.hand[0]?.name).toBe("Staggershock");
    expect(state.board?.stack[0]?.id).toBe("stack:3");
  });

  /**
   * §6.41 — the revision is monotonic, and an older snapshot
   * must not overwrite a newer one. Frames are ordered on one
   * socket, but a reconnect sends the STORED snapshot while a
   * live one may already be in flight.
   */
  it("ignores a snapshot older than the one it has", () => {
    const state = apply([
      SNAPSHOT,
      { type: "MATCH_SNAPSHOT", state: { ...SNAPSHOT.state, stateRevision: 4, turn: 1 } },
    ]);
    expect(state.board?.turn).toBe(3);
  });

  it("takes a newer one", () => {
    const state = apply([
      SNAPSHOT,
      { type: "MATCH_SNAPSHOT", state: { ...SNAPSHOT.state, stateRevision: 11, turn: 4 } },
    ]);
    expect(state.board?.turn).toBe(4);
  });

  /**
   * An unidentified card is unidentified. The page does not
   * decide this and cannot undo it — the identity was never on
   * the wire (§6.42).
   */
  it("keeps a card it was not told the identity of unknown", () => {
    const state = apply([SNAPSHOT]);
    const faceDown = state.board?.battlefield.find((card) => card.id === "card:77");
    expect(faceDown?.known).toBe(false);
    expect(faceDown?.name).toBe("Face-down");
  });

  // Only an explicit true counts, so a malformed frame errs
  // toward showing LESS rather than more.
  it("treats anything but true as not known", () => {
    const state = apply([
      {
        type: "MATCH_SNAPSHOT",
        state: {
          ...SNAPSHOT.state,
          battlefield: [{ id: "card:1", seat: 2, name: "Mountain", known: "yes" }],
        },
      },
    ]);
    expect(state.board?.battlefield[0]?.known).toBe(false);
  });

  it("ignores a snapshot with no revision rather than blanking the board", () => {
    const state = apply([SNAPSHOT, { type: "MATCH_SNAPSHOT", state: { turn: 9 } }]);
    expect(state.board?.turn).toBe(3);
  });

  // §6.48 — a decision arrives after the state it refers to, and
  // the ids match, so the page never matches up by name.
  it("shares object ids with decisions", () => {
    const state = apply([
      SNAPSHOT,
      {
        type: "DECISION_REQUEST",
        decisionId: 1,
        actedForSeat: 1,
        stateVersion: 10,
        options: [{ actionId: "card:51", label: "Mountain" }],
      },
    ]);
    const onBoard = state.board?.battlefield.map((card) => card.id) ?? [];
    expect(onBoard).toContain(state.decision?.options[0]?.actionId);
  });
});

// What a board needs to be readable — PHASE_06 §6.40, §6.42.
describe("board detail", () => {
  const withCreature = (card: Record<string, unknown>) => ({
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: 20,
      seat: 1,
      turn: 5,
      phase: "COMBAT_DECLARE_BLOCKERS",
      activeSeat: 1,
      players: [{ seat: 1, name: "RudeLeft", life: 20, handCount: 1, libraryCount: 40 }],
      battlefield: [card],
      hand: [],
      graveyard: [],
      stack: [],
    },
  });

  it("reads a creature's power, toughness and state", () => {
    const state = apply([
      withCreature({
        id: "card:7",
        seat: 1,
        name: "Hellspark Elemental",
        kind: "creature",
        types: "Creature - Elemental",
        power: 3,
        toughness: 1,
        damage: 0,
        sick: true,
        attacking: false,
        known: true,
      }),
    ]);
    const card = state.board?.battlefield[0];
    expect(card?.kind).toBe("creature");
    expect(card?.power).toBe(3);
    expect(card?.toughness).toBe(1);
    expect(card?.sick).toBe(true);
  });

  it("reads counters and what a card is attached to", () => {
    const state = apply([
      withCreature({
        id: "card:8",
        seat: 1,
        name: "Bear",
        kind: "creature",
        power: 2,
        toughness: 2,
        known: true,
        counters: [{ name: "P1P1", count: 2 }],
        attachedTo: "card:9",
      }),
    ]);
    const card = state.board?.battlefield[0];
    expect(card?.counters).toEqual([{ name: "P1P1", count: 2 }]);
    expect(card?.attachedTo).toBe("card:9");
    expect(card?.ringBearer).toBe(false);
  });

  it("reads the Ring-bearer mark, and only an explicit true", () => {
    const base = {
      id: "card:8",
      seat: 1,
      name: "Bear",
      kind: "creature",
      power: 2,
      toughness: 2,
      known: true,
    };
    expect(
      apply([withCreature({ ...base, ringBearer: true })]).board?.battlefield[0]?.ringBearer,
    ).toBe(true);
    expect(
      apply([withCreature({ ...base, ringBearer: "yes" })]).board?.battlefield[0]?.ringBearer,
    ).toBe(false);
  });

  /**
   * §6.42 again, and the reason the worker returns early for a
   * hidden card: a face-down creature's real power and toughness
   * are as secret as its name. Sending them would let anybody
   * work out what it is.
   */
  it("a card it may not identify carries no power or type either", () => {
    const state = apply([
      withCreature({
        id: "card:9",
        seat: 2,
        name: "Face-down",
        kind: "unknown",
        known: false,
      }),
    ]);
    const card = state.board?.battlefield[0];
    expect(card?.known).toBe(false);
    expect(card?.power).toBeNull();
    expect(card?.toughness).toBeNull();
    expect(card?.kind).toBe("unknown");
  });

  // Absent fields are not zero. A non-creature has no power, and
  // showing "0/0" for a land would be a lie about the board.
  it("a land has no power or toughness", () => {
    const state = apply([
      withCreature({ id: "card:1", seat: 1, name: "Mountain", kind: "land", known: true }),
    ]);
    expect(state.board?.battlefield[0]?.power).toBeNull();
    expect(state.board?.battlefield[0]?.damage).toBe(0);
  });
});

// Forge's own wording — PHASE_06 §6.90.
describe("a decision's prompt", () => {
  it("is carried when Forge supplies one", () => {
    const state = apply([
      {
        type: "DECISION_REQUEST",
        decisionId: 3,
        actedForSeat: 1,
        stateVersion: 2,
        kind: "chooseSingleEntityForEffect",
        prompt: "Choose a creature to sacrifice",
        options: [{ actionId: "card:4", label: "Bear" }],
      },
    ]);
    expect(state.decision?.prompt).toBe("Choose a creature to sacrifice");
  });

  // Absent is null, not an empty string: the page shows nothing
  // rather than an empty line where a question should be.
  it("is null when Forge has none", () => {
    const state = apply([QUESTION]);
    expect(state.decision?.prompt).toBeNull();
  });
});

// P6-AG — naming a card is answered by searching, and only a
// name the server SENT can be chosen. These are the moments the
// page could show the wrong list.
describe("a question answered by searching", () => {
  const NAMING = {
    type: "DECISION_REQUEST",
    decisionId: 9,
    actedForSeat: 1,
    kind: "chooseCardName",
    stateVersion: 50,
    mandatory: true,
    searchable: true,
    optionCount: 34334,
    options: [],
  };
  const BOLT = {
    type: "DECISION_OPTIONS",
    decisionId: 9,
    query: "bolt",
    total: 1,
    options: [{ actionId: "name:4410", label: "Lightning Bolt" }],
  };

  it("arrives searchable, with how many names are allowed and none sent", () => {
    const state = apply([NAMING]);
    expect(state.decision?.searchable).toBe(true);
    expect(state.decision?.optionCount).toBe(34334);
    expect(state.decision?.options).toEqual([]);
    expect(state.decision?.results).toBeNull();
  });

  it("shows what a search matched", () => {
    const state = apply([NAMING, BOLT]);
    expect(state.decision?.results?.query).toBe("bolt");
    expect(state.decision?.results?.options.map((o) => o.label)).toEqual(["Lightning Bolt"]);
  });

  it("drops results for a question that is no longer on screen", () => {
    const state = apply([NAMING, { ...BOLT, decisionId: 8 }]);
    expect(state.decision?.results).toBeNull();
  });

  it("starts a new question with no results from the last one", () => {
    const state = apply([NAMING, BOLT, { ...NAMING, decisionId: 10 }]);
    expect(state.decision?.results).toBeNull();
  });

  it("says why a search was refused, and keeps the question", () => {
    const state = apply([
      NAMING,
      { type: "DECISION_SEARCH_REFUSED", decisionId: 9, reason: "NOT_YOURS" },
    ]);
    expect(state.decision?.decisionId).toBe(9);
    expect(state.notice).toMatch(/not yours/i);
  });

  it("treats an ordinary question as not searchable", () => {
    const state = apply([QUESTION]);
    expect(state.decision?.searchable).toBe(false);
  });
});

// §6.70 — a restarted game is a different game, and the board says so.
describe("the game epoch", () => {
  const BOARD = {
    type: "MATCH_SNAPSHOT",
    state: { stateRevision: 1, seat: 1, turn: 9, phase: "MAIN1", activeSeat: 1, players: [] },
  };

  it("is the first game when the worker does not say", () => {
    expect(apply([BOARD]).board?.gameEpoch).toBe(1);
  });

  it("follows the worker into a restarted game", () => {
    const restarted = {
      ...BOARD,
      state: { ...BOARD.state, stateRevision: 2, gameEpoch: 2, turn: 1 },
    };
    const state = apply([BOARD, restarted]);
    expect(state.board?.gameEpoch).toBe(2);
    expect(state.board?.turn).toBe(1);
  });
});

// §6.37 — under Mindslaver the controller sees the controlled
// player's hand, because Forge says so; the page shows what it was
// sent and nothing else.
describe("other players' hands", () => {
  const BOARD = {
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: 3,
      seat: 1,
      turn: 5,
      phase: "MAIN1",
      activeSeat: 2,
      players: [],
      otherHands: [{ id: "card:61", seat: 2, known: true, name: "Mountain", kind: "land" }],
    },
  };

  it("are the cards Forge let this viewer see, with whose they are", () => {
    const state = apply([BOARD]);
    expect(state.board?.otherHands.map((card) => [card.id, card.seat, card.name])).toEqual([
      ["card:61", 2, "Mountain"],
    ]);
  });

  it("are empty when nothing is shared, as in an ordinary game", () => {
    const state = apply([{ ...BOARD, state: { ...BOARD.state, otherHands: undefined } }]);
    expect(state.board?.otherHands).toEqual([]);
  });
});

// §6.85 — keywords are Forge's current ones, and a card with none
// says nothing rather than something printed.
describe("a card's current keywords", () => {
  const card = (extra: Record<string, unknown>) => ({
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: 4,
      seat: 1,
      turn: 6,
      phase: "MAIN1",
      activeSeat: 1,
      players: [],
      battlefield: [
        { id: "card:35", seat: 1, known: true, name: "Serra Angel", kind: "creature", ...extra },
      ],
    },
  });

  it("are read as Forge sent them", () => {
    const state = apply([card({ keywords: ["Flying", "Vigilance"] })]);
    expect(state.board?.battlefield[0]?.keywords).toEqual(["Flying", "Vigilance"]);
  });

  it("are none when Forge sends none, as under Humility", () => {
    const state = apply([card({})]);
    expect(state.board?.battlefield[0]?.keywords).toEqual([]);
  });
});

// §6.96 — player and global state, carried as Forge sent it.
describe("player and global state", () => {
  const BOARD = {
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: 5,
      seat: 1,
      turn: 7,
      phase: "MAIN1",
      activeSeat: 1,
      dayTime: "day",
      players: [
        {
          seat: 1,
          name: "Alice",
          life: 20,
          designations: ["monarch"],
          counters: [{ name: "ENERGY", count: 2 }],
        },
        {
          seat: 2,
          name: "Bob",
          life: 20,
          counters: [{ name: "POISON", count: 3 }],
          command: ["Undercity (room: Lost Well)", "The Ring"],
          ringTempted: 2,
          dungeonsCompleted: ["Undercity"],
        },
      ],
    },
  };

  it("reads counters, designations and the command zone per player", () => {
    const [alice, bob] = apply([BOARD]).board!.players;
    expect(alice?.designations).toEqual(["monarch"]);
    expect(alice?.counters).toEqual([{ name: "ENERGY", count: 2 }]);
    expect(bob?.counters).toEqual([{ name: "POISON", count: 3 }]);
    expect(bob?.command).toEqual(["Undercity (room: Lost Well)", "The Ring"]);
    expect(bob?.designations).toEqual([]);
  });

  it("reads the Ring's temptations and completed dungeons, zero and none when absent", () => {
    const [alice, bob] = apply([BOARD]).board!.players;
    expect(bob?.ringTempted).toBe(2);
    expect(bob?.dungeonsCompleted).toEqual(["Undercity"]);
    expect(alice?.ringTempted).toBe(0);
    expect(alice?.dungeonsCompleted).toEqual([]);
  });

  it("reads day or night, and nothing before either", () => {
    expect(apply([BOARD]).board?.dayTime).toBe("day");
    const before = { ...BOARD, state: { ...BOARD.state, dayTime: undefined } };
    expect(apply([before]).board?.dayTime).toBeNull();
  });
});

describe("concede (PHASE_07 §7.55)", () => {
  it("records the server's answer and words it for the player", () => {
    const sent = reduceMatch(EMPTY_MATCH, { type: "CONCEDE_ACCEPTED" });
    expect(sent.concession).toBe("SENT");
    expect(concessionText(sent.concession)).toBe("You conceded. Ending the game…");

    const early = reduceMatch(EMPTY_MATCH, { type: "CONCEDE_REFUSED", reason: "NOT_STARTED" });
    expect(early.concession).toBe("NOT_STARTED");
    expect(concessionText(early.concession)).toMatch(/Abandon ends it with no winner/);

    expect(concessionText(null)).toBeNull();
    expect(concessionText("SOMETHING_NEW")).toBe("That concession was not accepted.");
  });
});

describe("a step nobody is asked at (PHASE_07 AMENDMENT 13)", () => {
  const BOARD = {
    type: "MATCH_SNAPSHOT",
    state: { stateRevision: 1, seat: 1, turn: 4, phase: "MAIN1", activeSeat: 1, players: [] },
  };
  it("moves the step bar and keeps the cards", () => {
    const before = apply([BOARD]);
    const after = reduceMatch(before, {
      type: "MATCH_STEP",
      state: { turn: 5, phase: "END_OF_TURN", activeSeat: 2, prioritySeat: 2, gameEpoch: 1 },
    });
    expect(after.board?.phase).toBe("END_OF_TURN");
    expect(after.board?.turn).toBe(5);
    expect(after.board?.activeSeat).toBe(2);
    expect(after.board?.battlefield).toBe(before.board?.battlefield);
  });

  it("is ignored with no board yet, or from another game of the match", () => {
    expect(
      reduceMatch(EMPTY_MATCH, { type: "MATCH_STEP", state: { phase: "UPKEEP" } }).board,
    ).toBeNull();
    const before = apply([BOARD]);
    const other = reduceMatch(before, {
      type: "MATCH_STEP",
      state: { phase: "UPKEEP", gameEpoch: 2 },
    });
    expect(other.board?.phase).toBe(before.board?.phase);
  });
});
