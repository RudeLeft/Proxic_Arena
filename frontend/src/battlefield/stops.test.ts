// The Pass button's words — PHASE_07 §7.53, specs 0034 and 0035.

import { describe, expect, it } from "vitest";
import type { MatchOutcome } from "../lobby";
import type { Snapshot } from "../match";
import { combatPart, gameOverWords, passWords, waitingLine } from "./stops";

function board(
  phase: string,
  activeSeat: number,
  stack: { name: string }[] = [],
  battlefield: { seat: number; attacking: boolean }[] = [],
): Snapshot {
  return {
    phase,
    activeSeat,
    stack,
    battlefield,
    players: [
      { seat: 1, name: "Alice" },
      { seat: 2, name: "Bob" },
    ],
  } as unknown as Snapshot;
}

/** A creature on the battlefield, for spec 0034's words. */
const creature = (id: string, seat: number, power: number, more: object = {}) => ({
  id,
  seat,
  power,
  kind: "creature",
  tapped: false,
  sick: false,
  attacking: false,
  blocking: false,
  keywords: [],
  name: `Bear ${id}`,
  ...more,
});

describe("passWords", () => {
  it("says what passing does next, as MTG Arena's button does", () => {
    expect(passWords(board("UPKEEP", 1), 1).word).toBe("Next");
    expect(passWords(board("MAIN2", 1), 1)).toEqual({ word: "End turn", sub: "Over to Bob" });
    const attack = [creature("card:1", 1, 2, { attacking: true })];
    expect(passWords(board("COMBAT_DECLARE_BLOCKERS", 1, [], attack), 1)).toEqual({
      word: "Next",
      sub: "To damage",
    });
    // Nobody attacked: combat is over, on either side of the table.
    expect(passWords(board("COMBAT_DECLARE_ATTACKERS", 1), 1).sub).toBe("To Main 2");
    expect(passWords(board("COMBAT_DECLARE_ATTACKERS", 2), 1).sub).toBe("Bob goes on to Main 2");
    expect(passWords(board("COMBAT_END", 1), 1)).toEqual({ word: "Next", sub: "To Main 2" });
  });

  it("from Main 1, says where a pass lands: attacks only when something could attack (spec 0034)", () => {
    const ready = board("MAIN1", 1, [], [creature("card:1", 1, 2)] as never[]);
    expect(passWords(ready, 1)).toEqual({ word: "Next", sub: "To attacks" });
    // Tapped, summoning sick or a defender: nothing can attack.
    for (const more of [{ tapped: true }, { sick: true }, { keywords: ["Defender"] }]) {
      const idle = board("MAIN1", 1, [], [creature("card:1", 1, 2, more)] as never[]);
      expect(passWords(idle, 1)).toEqual({ word: "Next", sub: "Nothing can attack · to Main 2" });
    }
    // Haste attacks the turn it arrives.
    const hasty = board("MAIN1", 1, [], [
      creature("card:1", 1, 2, { sick: true, keywords: ["Haste"] }),
    ] as never[]);
    expect(passWords(hasty, 1).sub).toBe("To attacks");
  });

  it("on the opponent's turn says where they go next (spec 0034)", () => {
    expect(passWords(board("MAIN1", 2), 1)).toEqual({ word: "Pass", sub: "Bob goes on to combat" });
    expect(passWords(board("UPKEEP", 2), 1).sub).toBe("Bob goes on to their draw");
    expect(passWords(board("MAIN2", 2), 1).sub).toBe("Bob goes on to their end step");
    expect(passWords(board("END_OF_TURN", 2), 1).sub).toBe("Your turn next");
  });

  it("names whose spell resolves and what it targets (spec 0034)", () => {
    const bolt = (controller: number, targets: object[]) =>
      board("MAIN1", 1, [{ name: "Lightning Bolt", controller, targets } as never]);
    expect(passWords(bolt(2, [{ player: 1 }]), 1)).toEqual({
      word: "Resolve",
      sub: "Bob’s Lightning Bolt → you",
    });
    expect(passWords(bolt(1, [{ player: 2 }]), 1).sub).toBe("Your Lightning Bolt → Bob");
    const atBear = {
      ...bolt(2, [{ object: "card:7" }, { player: 1 }]),
      battlefield: [creature("card:7", 1, 2)],
    } as unknown as Snapshot;
    expect(passWords(atBear, 1).sub).toBe("Bob’s Lightning Bolt → Bear card:7 +1");
    expect(passWords(bolt(2, []), 1).sub).toBe("Bob’s Lightning Bolt");
  });

  it("while they attack, says the blocks come next, with the power coming (owner 2026-10-22, spec 0034)", () => {
    const attacking = [
      creature("card:1", 2, 3, { attacking: true }),
      creature("card:2", 2, 4, { attacking: true }),
      creature("card:3", 1, 2),
    ];
    expect(passWords(board("COMBAT_DECLARE_ATTACKERS", 2, [], attacking), 1)).toEqual({
      word: "To blocks",
      sub: "2 attackers · 7 power coming",
    });
    const blocked = {
      ...board("COMBAT_DECLARE_BLOCKERS", 2, [], attacking),
      combat: {
        attackers: [
          { id: "card:1", target: { player: 1 } },
          { id: "card:2", target: { player: 1 } },
        ],
        blocks: [{ blocker: "card:3", attacker: "card:2" }],
      },
    } as unknown as Snapshot;
    expect(passWords(blocked, 1)).toEqual({ word: "To damage", sub: "3 power gets through" });
    // No attack, or another step of their turn: back to them.
    expect(passWords(board("COMBAT_DECLARE_ATTACKERS", 2, [], []), 1).word).toBe("Pass");
    expect(passWords(board("COMBAT_END", 2, [], attacking), 1).word).toBe("Pass");
  });
});

describe("gameOverWords (spec 0034)", () => {
  const outcome = (winningSeat: number | null, more: object = {}) =>
    ({
      kind: "WINNER",
      winningSeat,
      endedOnTurn: 7,
      reason: null,
      concededSeat: null,
      ...more,
    }) as MatchOutcome;
  const lives = (one: number, two: number) =>
    ({
      ...board("MAIN1", 1),
      players: [
        { seat: 1, name: "Alice", life: one },
        { seat: 2, name: "Bob", life: two },
      ],
    }) as unknown as Snapshot;

  it("says who won, and why when the board shows it", () => {
    expect(gameOverWords(lives(5, 0), 1, outcome(1))).toEqual({
      word: "You won",
      sub: "Bob’s life reached 0",
      turn: "Turn 7",
    });
    expect(gameOverWords(lives(0, 5), 1, outcome(2))).toEqual({
      word: "Bob won",
      sub: "Your life reached 0",
      turn: "Turn 7",
    });
    expect(gameOverWords(lives(5, 5), 1, outcome(1, { concededSeat: 2 })).sub).toBe("Bob conceded");
    expect(gameOverWords(lives(5, 5), 1, outcome(2, { concededSeat: 1 })).sub).toBe("You conceded");
    // Nothing to say why: the turn alone, never said twice (W-24).
    expect(gameOverWords(lives(5, 5), 1, outcome(1)).sub).toBe("");
  });

  it("gives Forge's reason for the loss (spec 0045)", () => {
    expect(gameOverWords(lives(5, 5), 1, outcome(1, { lossReason: "Milled" })).sub).toBe(
      "Bob lost: had to draw from an empty library",
    );
    expect(gameOverWords(lives(5, 5), 1, outcome(2, { lossReason: "Milled" })).sub).toBe(
      "You lost: had to draw from an empty library",
    );
    expect(gameOverWords(lives(5, 0), 1, outcome(1, { lossReason: "Unheard" })).sub).toBe(
      "Bob’s life reached 0",
    );
  });

  it("says Game over without a winner", () => {
    expect(gameOverWords(lives(5, 5), 1, null).word).toBe("Game over");
    expect(gameOverWords(lives(5, 5), 1, { ...outcome(null), kind: "DRAW" }).word).toBe("A draw");
    expect(gameOverWords(lives(5, 5), 1, null, true).sub).toBe(
      "The game stopped before it finished. Nobody won it.",
    );
  });

  it("gives Forge's own sentence for an alternate win, word for word (P6-AP)", () => {
    const maniac = outcome(1, { reason: "has won due to effect of 'Laboratory Maniac'" });
    expect(gameOverWords(lives(20, 20), 2, maniac)).toEqual({
      word: "Alice won",
      sub: "The winner has won due to effect of 'Laboratory Maniac'",
      turn: "Turn 7",
    });
  });

  it("a spectator is nobody's you (W-24)", () => {
    expect(gameOverWords(lives(5, 0), -1, outcome(1))).toEqual({
      word: "Alice won",
      sub: "Bob’s life reached 0",
      turn: "Turn 7",
    });
  });
});

// Spec 0002 -- owner report 2026-10-23: while Krenko made Goblins, each
// screen said it was waiting for the other player. Phase 9 W-25: whose
// move, in plain words, what the screen shows them doing, and the seat.
describe("waitingLine", () => {
  const krenko = { name: "Krenko, Mob Boss", controller: 1 };
  const table = (prioritySeat: number, stack: object[] = []) =>
    ({ ...board("MAIN1", 1, stack as { name: string }[]), prioritySeat }) as Snapshot;
  const moment = { word: "One moment", sub: "", seat: null };

  it("while nobody is asked, both players read Resolving, naming the top of the stack", () => {
    const busy = table(2, [krenko]);
    const resolving = { word: "Resolving…", sub: "Krenko, Mob Boss", seat: null };
    expect(waitingLine(busy, 1, { seat: null }, 2, true)).toEqual(resolving);
    expect(waitingLine(busy, 2, { seat: null }, 2, true)).toEqual(resolving);
    expect(waitingLine(table(2), 1, { seat: null }, 2, true)).toEqual({
      word: "Resolving…",
      sub: "",
      seat: null,
    });
  });

  it("names the seat the server says is asked, not the one with priority", () => {
    // Priority says seat 2; the server says seat 1 is deciding.
    expect(waitingLine(table(2), 2, { seat: 1 }, 1, false)).toEqual({
      word: "Alice’s move",
      sub: "Main 1 · their turn",
      seat: 1,
    });
    expect(waitingLine(table(2), 1, { seat: 1 }, 1, false)).toEqual(moment);
  });

  it("between two questions, stays on whoever was last asked rather than flicker", () => {
    expect(waitingLine(table(2), 1, { seat: null }, 2, false)).toEqual({
      word: "Bob’s move",
      sub: "Main 1 · your turn",
      seat: 2,
    });
    expect(waitingLine(table(2), 1, { seat: null }, null, false)).toEqual(moment);
  });

  it("says what the other player is doing when the screen shows it (spec 0034)", () => {
    const at = (phase: string, active: number, field: object[] = [], stack: object[] = []) =>
      ({
        ...board(phase, active, stack as { name: string }[], field as never[]),
        prioritySeat: 2,
      }) as Snapshot;
    const sub = (b: Snapshot) => waitingLine(b, 1, { seat: 2 }, 2, false).sub;
    expect(sub(at("COMBAT_DECLARE_ATTACKERS", 2))).toBe("Choosing attackers");
    expect(sub(at("COMBAT_DECLARE_BLOCKERS", 1))).toBe("Choosing blockers");
    // Once they have declared, the step's priority follows: not choosing.
    expect(sub(at("COMBAT_DECLARE_BLOCKERS", 1, [{ seat: 2, blocking: true }]))).toBe(
      "Combat · your turn",
    );
    expect(sub(at("MAIN1", 1, [], [{ name: "Shock", controller: 1 }]))).toBe(
      "May respond to your Shock",
    );
  });

  it("guesses from priority as before when the server has never said", () => {
    expect(waitingLine(table(2), 1, null, null, false).word).toBe("Bob’s move");
    expect(waitingLine(table(1), 1, null, null, false)).toEqual(moment);
    // Their spell on the stack: it is theirs that is going on.
    const theirs = table(1, [{ name: "Shock", controller: 2 }]);
    expect(waitingLine(theirs, 1, null, null, false)).toEqual({
      word: "Bob’s move",
      sub: "Main 1 · your turn",
      seat: 2,
    });
  });

  it("before the first turn, says they are choosing their hand, and how many mulligans (W-15)", () => {
    const pregame = (mulligans: number) =>
      ({
        ...table(2),
        turn: 0,
        players: [
          { seat: 1, name: "Alice", mulligans: 0 },
          { seat: 2, name: "Bob", mulligans },
        ],
      }) as unknown as Snapshot;
    expect(waitingLine(pregame(0), 1, { seat: 2 }, 2, false).sub).toBe(
      "Choosing their opening hand",
    );
    expect(waitingLine(pregame(1), 1, { seat: 2 }, 2, false).sub).toBe("Mulliganed once");
    expect(waitingLine(pregame(3), 1, { seat: 2 }, 2, false).sub).toBe("Mulliganed 3 times");
  });

  it("a spectator waits for whoever is asked, never for a moment of their own", () => {
    expect(waitingLine(table(1), -1, { seat: 1 }, 1, false).word).toBe("Alice’s move");
  });
});

describe("combatPart (spec 0030)", () => {
  it("names the part of combat the ladder's Combat row shows", () => {
    expect(combatPart("COMBAT_DECLARE_ATTACKERS")).toBe("Attackers");
    expect(combatPart("COMBAT_DECLARE_BLOCKERS")).toBe("Blockers");
    expect(combatPart("COMBAT_FIRST_STRIKE_DAMAGE")).toBe("Damage");
    expect(combatPart("COMBAT_DAMAGE")).toBe("Damage");
  });

  it("says nothing at the start or end of combat, or outside it", () => {
    expect(combatPart("COMBAT_BEGIN")).toBeNull();
    expect(combatPart("COMBAT_END")).toBeNull();
    expect(combatPart("MAIN1")).toBeNull();
  });
});
