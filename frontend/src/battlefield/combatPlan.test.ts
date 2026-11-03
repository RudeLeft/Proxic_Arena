// Phase 9 W-14 (Amendment 11): select several, then point -- the
// selection, what it can be pointed at, and the answers the plan gives to
// the game's one-creature-at-a-time questions.

import { describe, expect, it } from "vitest";
import type { Decision, Snapshot, SnapshotCard } from "../match";
import {
  ALL_ATTACK,
  combatTargets,
  planAnswer,
  planFor,
  toggleSelected,
  type CombatPlan,
} from "./combatPlan";

function decision(over: Partial<Decision>): Decision {
  return {
    decisionId: 1,
    actedForSeat: 1,
    kind: "declareAttackers",
    stateVersion: 1,
    options: [],
    mandatory: false,
    prompt: null,
    searchable: false,
    optionCount: 0,
    results: null,
    unavailable: {},
    about: null,
    looking: [],
    window: false,
    ...over,
  };
}

const option = (actionId: string, objectId: string | null) => ({
  actionId,
  objectId,
  label: actionId,
  payable: true,
  cost: null,
});

const attackers = (...ids: number[]) =>
  decision({
    options: [
      ...ids.map((n) => option(`attacker:card:${n}`, `card:${n}`)),
      ...(ids.length >= 2 ? [option(ALL_ATTACK, null)] : []),
    ],
  });
const defender = decision({
  decisionId: 2,
  kind: "chooseDefender",
  mandatory: true,
  options: [option("defender:player:0", "player:2"), option("defender:card:9", "card:9")],
});

describe("selecting", () => {
  it("a creature toggles; a pile selects one more each click, then none", () => {
    const d = attackers(1, 2, 3);
    expect(toggleSelected(d, ["card:1"], [])).toEqual(["card:1"]);
    expect(toggleSelected(d, ["card:1"], ["card:1"])).toEqual([]);
    const pile = ["card:1", "card:2", "card:3"];
    expect(toggleSelected(d, pile, [])).toEqual(["card:1"]);
    expect(toggleSelected(d, pile, ["card:1"])).toEqual(["card:1", "card:2"]);
    expect(toggleSelected(d, pile, ["card:1", "card:2", "card:3"])).toEqual([]);
  });

  it("a card the game does not offer is not selectable: the click means what it always did", () => {
    const d = decision({ options: [option("unattack:card:4", "card:4")] });
    expect(toggleSelected(d, ["card:4"], [])).toBeNull();
  });
});

describe("what a selection can be pointed at", () => {
  const board = {
    seat: 1,
    players: [{ seat: 1 }, { seat: 2 }],
    battlefield: [
      { id: "card:9", seat: 2, types: "Legendary Planeswalker — Elspeth", attacking: false },
      { id: "card:10", seat: 2, types: "Creature — Goblin", attacking: true },
      { id: "card:11", seat: 1, types: "Legendary Planeswalker — Ajani", attacking: false },
    ] as unknown as SnapshotCard[],
  } as unknown as Snapshot;

  it("attacking: the other player and their planeswalkers, never your own", () => {
    expect([...combatTargets("declareAttackers", board)].sort()).toEqual(["card:9", "player:2"]);
  });

  it("blocking: their attackers", () => {
    expect([...combatTargets("declareBlockers", board)]).toEqual(["card:10"]);
  });
});

describe("the plan answers the game's questions", () => {
  it("each creature joins, then its follow-up gets the target", () => {
    const plan = planFor(attackers(1, 2, 3), ["card:1", "card:2"], ["card:9"]);
    expect(plan.all).toBeNull();
    let move = planAnswer(attackers(1, 2, 3), plan);
    expect(move.answer).toBe("attacker:card:1");
    move = planAnswer(defender, move.plan!);
    expect(move.answer).toBe("defender:card:9");
    move = planAnswer(attackers(2, 3), move.plan!);
    expect(move.answer).toBe("attacker:card:2");
    move = planAnswer(defender, move.plan!);
    expect(move.answer).toBe("defender:card:9");
    move = planAnswer(attackers(3), move.plan!);
    expect(move.answer).toBeNull();
    expect(move.plan).toBeNull();
    expect(move.left).toEqual([]);
  });

  it("no follow-up asked (one thing to attack): the next creature goes", () => {
    const plan = planFor(attackers(1, 2, 3), ["card:1", "card:2"], ["player:2"]);
    let move = planAnswer(attackers(1, 2, 3), plan);
    expect(move.answer).toBe("attacker:card:1");
    move = planAnswer(attackers(2, 3), move.plan!);
    expect(move.answer).toBe("attacker:card:2");
    move = planAnswer(attackers(3), move.plan!);
    expect(move.plan).toBeNull();
  });

  it("every creature to one place is one answer, All attack, then each follow-up", () => {
    const plan = planFor(attackers(1, 2), ["card:1", "card:2"], ["card:9"]);
    expect(plan.all).toBe("card:9");
    let move = planAnswer(attackers(1, 2), plan);
    expect(move.answer).toBe(ALL_ATTACK);
    move = planAnswer(defender, move.plan!);
    expect(move.answer).toBe("defender:card:9");
    move = planAnswer(defender, move.plan!);
    expect(move.answer).toBe("defender:card:9");
    move = planAnswer(decision({ options: [option("unattack:card:1", "card:1")] }), move.plan!);
    expect(move.plan).toBeNull();
  });

  it("a creature the game no longer offers stops the plan; it and the rest stay selected, with why", () => {
    const plan = planFor(attackers(1, 2, 3), ["card:2", "card:3"], ["player:2"]);
    const refused = decision({
      options: [option("attacker:card:3", "card:3")],
      unavailable: { "card:2": "It's tapped." },
    });
    const move = planAnswer(refused, plan);
    expect(move.answer).toBeNull();
    expect(move.plan).toBeNull();
    expect(move.left).toEqual(["card:2", "card:3"]);
    expect(move.why).toBe("It's tapped.");
  });

  it("a target the follow-up does not offer is left to the player; the rest stay selected", () => {
    const plan: CombatPlan = {
      kind: "declareAttackers",
      steps: [
        { creature: "card:1", target: "card:77", sent: true },
        { creature: "card:2", target: "card:77", sent: false },
      ],
      all: null,
    };
    const move = planAnswer(defender, plan);
    expect(move.answer).toBeNull();
    expect(move.left).toEqual(["card:2"]);
  });

  it("blocking a pile of attackers puts one blocker on each, in turn", () => {
    const blockers = decision({
      kind: "declareBlockers",
      options: [option("blocker:card:1", "card:1"), option("blocker:card:2", "card:2")],
    });
    const plan = planFor(blockers, ["card:1", "card:2"], ["card:20", "card:21"]);
    expect(plan.steps.map((s) => s.target)).toEqual(["card:20", "card:21"]);
    let move = planAnswer(blockers, plan);
    expect(move.answer).toBe("blocker:card:1");
    const which = decision({
      decisionId: 3,
      kind: "chooseBlockTarget",
      mandatory: true,
      options: [option("blocked:card:20", "card:20"), option("blocked:card:21", "card:21")],
    });
    move = planAnswer(which, move.plan!);
    expect(move.answer).toBe("blocked:card:20");
    move = planAnswer(blockers, move.plan!);
    expect(move.answer).toBe("blocker:card:2");
    move = planAnswer(which, move.plan!);
    expect(move.answer).toBe("blocked:card:21");
  });

  it("any other question ends the plan", () => {
    const plan = planFor(attackers(1, 2), ["card:1"], ["player:2"]);
    const move = planAnswer(decision({ kind: "chooseSpellAbilityToPlay" }), plan);
    expect(move).toEqual({ answer: null, plan: null, left: [], why: null });
  });
});
