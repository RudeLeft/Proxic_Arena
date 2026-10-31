// PHASE_09 W-04, W-05, W-06 — many copies of one trigger, answered once.
import { describe, expect, it } from "vitest";
import type { Decision, DecisionOption, StackEntry } from "../match";
import {
  abilityWords,
  afterAuto,
  autoAnswer,
  confirmTitle,
  copiesOnStack,
  endsCopies,
  isCopyTarget,
  orderGroups,
  orderOf,
  sameTrigger,
  sensibleOrder,
  yesNo,
  type Copies,
} from "./triggers";

const option = (
  actionId: string,
  label: string,
  objectId: string | null = null,
): DecisionOption => ({
  actionId,
  label,
  objectId,
  payable: true,
  cost: null,
});

function decision(over: Partial<Decision>): Decision {
  return {
    decisionId: 1,
    actedForSeat: 1,
    kind: "chooseTargetsFor",
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

const BOGGART = "Boggart Shenanigans";
const target = (copy: number, copies = 7) =>
  decision({
    kind: "chooseTargetsFor",
    about: { name: BOGGART, kind: "trigger", from: null, copy, copies },
    options: [
      option("target:player:0", "RudeLeft", "player:1"),
      option("target:player:1", "Pat", "player:2"),
    ],
  });
const confirm = (name = BOGGART) =>
  decision({
    kind: "confirmTrigger",
    mandatory: true,
    about: { name, kind: "trigger", from: null, copy: null, copies: null },
    options: [
      option("confirm:yes", `Yes — use the triggered ability of ${name}?`),
      option("confirm:no", "No"),
    ],
  });

describe("many copies of one trigger (W-06)", () => {
  it("knows a target question for one of several copies", () => {
    expect(isCopyTarget(target(1))).toBe(true);
    expect(isCopyTarget(target(1, 1))).toBe(false);
    expect(
      isCopyTarget(
        decision({
          about: { name: "Lightning Bolt", kind: "spell", from: "hand", copy: null, copies: null },
        }),
      ),
    ).toBe(false);
  });

  it("answers the same target for the later copies, and never for the first", () => {
    const copies: Copies = { name: BOGGART, target: "player:1", yesLeft: 0, noLeft: 0 };
    expect(autoAnswer(target(1), copies)).toBeNull();
    expect(autoAnswer(target(2), copies)).toBe("target:player:0");
    expect(autoAnswer(target(7), copies)).toBe("target:player:0");
    // Not "same target": asked every time.
    expect(autoAnswer(target(2), { ...copies, target: null })).toBeNull();
    // The target is gone: asked.
    const gone = { ...target(3), options: [option("target:player:1", "Pat", "player:2")] };
    expect(autoAnswer(gone, copies)).toBeNull();
  });

  it("answers yes while the player said yes to all, then asks again", () => {
    let copies: Copies = { name: BOGGART, target: null, yesLeft: 2, noLeft: 0 };
    expect(autoAnswer(confirm(), copies)).toBe("confirm:yes");
    copies = afterAuto(confirm(), copies);
    expect(copies.yesLeft).toBe(1);
    copies = afterAuto(confirm(), copies);
    expect(autoAnswer(confirm(), copies)).toBeNull();
    // Another card's trigger is never answered for the player.
    expect(
      autoAnswer(confirm("Blood Artist"), { name: BOGGART, target: null, yesLeft: 3, noLeft: 0 }),
    ).toBeNull();
  });

  it("ends with a new batch or another card's question", () => {
    const copies: Copies = { name: BOGGART, target: "player:1", yesLeft: 0, noLeft: 0 };
    expect(endsCopies(target(1), copies)).toBe(true);
    expect(endsCopies(target(2), copies)).toBe(false);
    expect(endsCopies(confirm("Blood Artist"), copies)).toBe(true);
    expect(endsCopies(confirm(), copies)).toBe(false);
    expect(endsCopies(decision({ kind: "chooseSpellAbilityToPlay" }), copies)).toBe(false);
  });

  it("counts the copies on the stack, this one included", () => {
    // As Forge words them: each copy ends with what caused it.
    const entry = (
      n: number,
      name = BOGGART,
      words = "deal 1 damage (Targeting: [[Pat]])",
    ): StackEntry => ({
      id: `stack:${n}`,
      description: `${words} [Zone Changer: Goblin Token (${150 + n})]`,
      source: name === BOGGART ? "card:81" : "card:9",
      name,
      controller: 1,
      kind: "trigger",
      targets: [],
      art: null,
      manaCost: null,
    });
    const stack = [entry(1), entry(2), entry(3), entry(4, "Blood Artist"), entry(5)];
    expect(copiesOnStack(stack, BOGGART)).toBe(4);
    // A copy aimed somewhere else is not answered by the same yes.
    expect(
      copiesOnStack(
        [...stack, entry(6, BOGGART, "deal 1 damage (Targeting: [[RudeLeft]])")],
        BOGGART,
      ),
    ).toBe(4);
    expect(copiesOnStack(stack, "Blood Artist")).toBe(1);
    expect(copiesOnStack(stack, "Zulaport Cutthroat")).toBe(0);
  });
});

describe("yes/no questions in plain words (W-04)", () => {
  it("finds the yes and the no", () => {
    expect(yesNo(confirm())?.yes.actionId).toBe("confirm:yes");
    expect(yesNo(confirm())?.no.actionId).toBe("confirm:no");
    expect(yesNo(target(1))).toBeNull();
  });

  it("makes the question a title", () => {
    expect(confirmTitle("Yes — use the triggered ability of Boggart Shenanigans?")).toBe(
      "Use Boggart Shenanigans?",
    );
    expect(confirmTitle("Yes — pay {2} for Rhystic Study?")).toBe("Pay {2} for Rhystic Study?");
  });
});

describe("an order question's words (W-05)", () => {
  it("keeps the ability's words, without the card, the cost or the cause", () => {
    expect(
      abilityWords(
        "Boggart Shenanigans — {0} — Whenever another Goblin you control dies, deal 1 damage. [Zone Changer: Goblin Token (122)]",
        BOGGART,
      ),
    ).toBe("Whenever another Goblin you control dies, deal 1 damage.");
    expect(abilityWords("Blood Artist — Whenever a creature dies, drain 1.", "Blood Artist")).toBe(
      "Whenever a creature dies, drain 1.",
    );
  });
});

describe("the order tray groups copies (W-05)", () => {
  const boggart = (n: number) =>
    option(
      `trigger:${n}:card:81`,
      `Boggart Shenanigans — {0} — Deal 1 damage. [Zone Changer: Goblin Token (${120 + n})]`,
      "card:81",
    );
  const arsonist = option(
    "trigger:9:card:5",
    "Goblin Arsonist — When it dies, deal 1 damage.",
    "card:5",
  );

  it("shows other copies of the same card as one card too (owner 2026-10-30)", () => {
    const arsonist2 = option(
      "trigger:7:card:6",
      "Goblin Arsonist — When it dies, deal 1 damage.",
      "card:6",
    );
    const groups = orderGroups([boggart(0), arsonist, arsonist2]);
    expect(groups.map((g) => g.options.length)).toEqual([1, 2]);
  });

  it("shows copies of one ability as one card", () => {
    const groups = orderGroups([boggart(0), arsonist, boggart(1), boggart(2)]);
    expect(groups.map((g) => g.options.length)).toEqual([3, 1]);
  });

  it("orders every copy together, the clicked card first", () => {
    const groups = orderGroups([boggart(0), arsonist, boggart(1)]);
    const order = orderOf(groups, [groups[1]!.key]);
    expect(order.map((o) => o.actionId)).toEqual([
      "trigger:9:card:5",
      "trigger:0:card:81",
      "trigger:1:card:81",
    ]);
  });
});

describe("calmer trigger storms (spec 0043)", () => {
  const SERGEANT = "Skirk Drill Sergeant";
  const pay = decision({
    kind: "confirmPayment",
    mandatory: true,
    about: { name: SERGEANT, kind: "trigger", from: null, copy: null, copies: null },
    options: [
      option("confirm:yes", "Yes — Pay {2}{R} for Skirk Drill Sergeant?"),
      option("confirm:no", "No"),
    ],
  });

  it("Skip all answers no for the rest of that card's payments", () => {
    let copies: Copies = { name: SERGEANT, target: null, yesLeft: 0, noLeft: 2 };
    expect(autoAnswer(pay, copies)).toBe("confirm:no");
    copies = afterAuto(pay, copies);
    expect(copies.noLeft).toBe(1);
    expect(autoAnswer(pay, { ...copies, noLeft: 0 })).toBeNull();
    expect(autoAnswer(pay, { ...copies, name: BOGGART })).toBeNull();
  });

  it("opens the order tray with damage first and payments last", () => {
    const groups = orderGroups([
      option("t:0", "Skirk Drill Sergeant — {0} — Whenever a Goblin dies, you may pay {2}{R}."),
      option(
        "t:1",
        "Mogg War Marshal — {0} — When it dies, create a 1/1 red Goblin creature token.",
      ),
      option("t:2", "Mudbutton Torchrunner — {0} — When it dies, it deals 3 damage to any target."),
    ]);
    expect(sensibleOrder(groups).map((g) => g.options[0]!.actionId)).toEqual(["t:2", "t:1", "t:0"]);
  });

  it("tells identical triggers from different ones", () => {
    const entry = (over: Partial<StackEntry>): StackEntry => ({
      id: "stack:1",
      description:
        "Skirk Drill Sergeant (12) - you may pay {2}{R}. [Zone Changer: Goblin Token (40)]",
      source: "card:12",
      name: SERGEANT,
      controller: 1,
      kind: "trigger",
      targets: [],
      art: null,
      manaCost: null,
      ...over,
    });
    const a = entry({});
    expect(
      sameTrigger(a, entry({ id: "stack:2", description: a.description.replace("(40)", "(41)") })),
    ).toBe(true);
    expect(sameTrigger(a, entry({ id: "stack:3", controller: 2 }))).toBe(false);
    expect(sameTrigger(a, entry({ id: "stack:4", targets: [{ player: 2 }] }))).toBe(false);
    expect(sameTrigger(a, entry({ id: "stack:5", kind: "spell" }))).toBe(false);
  });
});
