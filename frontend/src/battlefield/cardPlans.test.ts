// PHASE_09 group 3 (W-07..W-10): the answers a card tray gives for the
// game's one-card-at-a-time questions, and which tray a question is.

import { describe, expect, it } from "vitest";
import type { Decision, DecisionArrange, Snapshot, SnapshotCard } from "../match";
import {
  DAMAGE_TO_PLAYER,
  askingName,
  cardGroups,
  notOffered,
  orderSteps,
  damageSteps,
  divideSteps,
  placeWords,
  plainPrompt,
  rowSteps,
  splitSteps,
  stepAnswer,
  trayOf,
  usualDivide,
  usualSplit,
} from "./cardPlans";

const card = (id: string, name: string, types = "Instant"): SnapshotCard =>
  ({ id, name, types, kind: "spell" }) as unknown as SnapshotCard;

const arrange = (a: Partial<DecisionArrange>): DecisionArrange => ({
  to: null,
  first: null,
  shuffle: false,
  zone: null,
  split: false,
  piles: null,
  ...a,
});

function decision(over: Partial<Decision>): Decision {
  return {
    decisionId: 1,
    actedForSeat: 1,
    kind: "orderMoveToZoneList",
    stateVersion: 1,
    options: [],
    mandatory: true,
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

const option = (actionId: string, objectId: string | null, label = actionId) => ({
  actionId,
  objectId,
  label,
  payable: true,
  cost: null,
});

describe("the steps a tray plans", () => {
  it("orders all but the last card: the game places it", () => {
    expect(orderSteps("orderMoveToZoneList", ["card:1", "card:2", "card:3"])).toEqual([
      { kind: "orderMoveToZoneList", card: "card:1" },
      { kind: "orderMoveToZoneList", card: "card:2" },
    ]);
  });

  it("scry: the cards sent away, then that's all, then the top in draw order", () => {
    expect(
      rowSteps("arrangeForScry", ["card:1", "card:2", "card:3"], ["card:2"], ["card:3", "card:1"]),
    ).toEqual([
      { kind: "arrangeForScry", card: "card:2" },
      { kind: "arrangeForScry", pass: true },
      { kind: "arrangeForScry", card: "card:3" },
    ]);
  });

  it("scry: every card to the bottom needs no 'that's all' and no order", () => {
    expect(rowSteps("arrangeForScry", ["card:1", "card:2"], ["card:1", "card:2"], [])).toEqual([
      { kind: "arrangeForScry", card: "card:1" },
      { kind: "arrangeForScry", card: "card:2" },
    ]);
  });

  it("the split: pile 1 picked, then that's all; all five in pile 1 needs none", () => {
    const five = ["card:1", "card:2", "card:3", "card:4", "card:5"];
    expect(splitSteps("chooseEntitiesForEffect", five, ["card:4"])).toEqual([
      { kind: "chooseEntitiesForEffect", card: "card:4" },
      { kind: "chooseEntitiesForEffect", pass: true },
    ]);
    expect(splitSteps("chooseEntitiesForEffect", five, five)).toHaveLength(5);
    expect(splitSteps("chooseEntitiesForEffect", five, [])).toEqual([
      { kind: "chooseEntitiesForEffect", pass: true },
    ]);
  });
});

describe("a step answers only the question it was made for", () => {
  const order = decision({
    options: [option("order:card:1", "card:1"), option("order:card:2", "card:2")],
  });

  it("picks the option about its card", () => {
    expect(stepAnswer({ kind: "orderMoveToZoneList", card: "card:2" }, order)).toBe("order:card:2");
  });

  it("does not fit another kind of question, or a card no longer offered", () => {
    expect(stepAnswer({ kind: "arrangeForScry", card: "card:2" }, order)).toBeUndefined();
    expect(stepAnswer({ kind: "orderMoveToZoneList", card: "card:9" }, order)).toBeUndefined();
  });

  it("passes only where the game allows a pass", () => {
    expect(stepAnswer({ kind: "orderMoveToZoneList", pass: true }, order)).toBeUndefined();
    expect(
      stepAnswer({ kind: "orderMoveToZoneList", pass: true }, { ...order, mandatory: false }),
    ).toBeNull();
  });

  it("answers Ponder's shuffle with the Yes or the No the player chose", () => {
    const shuffle = decision({
      kind: "confirmAction",
      options: [
        option("confirm:yes", null, "Yes — Do you want to shuffle the library?"),
        option("confirm:no", null, "No"),
      ],
    });
    expect(stepAnswer({ kind: "confirmAction", yes: true }, shuffle)).toBe("confirm:yes");
    expect(stepAnswer({ kind: "confirmAction", yes: false }, shuffle)).toBe("confirm:no");
  });
});

describe("which tray a question is", () => {
  const three = [card("card:1", "Swamp"), card("card:2", "Opt"), card("card:3", "Island")];
  const objects = three.map((c) => option(`x:${c.id}`, c.id));

  it("ordering cards, scry's two rows and its second half", () => {
    expect(
      trayOf(decision({ looking: three, options: objects, arrange: arrange({ to: "top" }) })),
    ).toBe("order");
    expect(
      trayOf(
        decision({ kind: "arrangeForScry", looking: three, options: objects, mandatory: false }),
      ),
    ).toBe("rows");
    expect(
      trayOf(
        decision({ kind: "arrangeForScry", looking: three, options: objects, mandatory: true }),
      ),
    ).toBe("order");
    const top = [
      option("willPutCardOnTop:0", null, "Top"),
      option("willPutCardOnTop:1", null, "Bottom"),
    ];
    expect(
      trayOf(decision({ kind: "willPutCardOnTop", looking: three.slice(0, 1), options: top })),
    ).toBe("rows");
  });

  it("a hidden zone, the split and the piles; anything else keeps its window", () => {
    const search = decision({
      kind: "chooseSingleEntityForEffect",
      looking: three,
      options: objects,
    });
    expect(trayOf({ ...search, arrange: arrange({ zone: "library" }) })).toBe("hidden");
    expect(trayOf({ ...search, arrange: arrange({ split: true }) })).toBe("split");
    expect(
      trayOf(
        decision({
          kind: "chooseCardsPile",
          arrange: arrange({
            piles: [
              { cards: [], count: 1 },
              { cards: [], count: 4 },
            ],
          }),
        }),
      ),
    ).toBe("piles");
    expect(trayOf(decision({ kind: "chooseEntitiesForEffect", options: objects }))).toBeNull();
  });
});

describe("the card asking", () => {
  it("is the one resolving, not the first name the words contain", () => {
    const board = { stack: [{ name: "Impulse" }] } as unknown as Snapshot;
    const asked = decision({
      prompt: "Choose card(s) to put into hand You are looking at: Fact or Fiction, Island",
    });
    expect(askingName(board, asked)).toBe("Impulse");
    expect(
      askingName(board, {
        ...asked,
        about: { name: "Ponder", kind: "spell", from: null, copy: null, copies: null },
      }),
    ).toBe("Ponder");
  });
});

describe("a search as one picture per card", () => {
  it("groups copies, spells before lands, and dims what can't be chosen with why", () => {
    const groups = cardGroups(
      [
        card("card:1", "Island", "Basic Land — Island"),
        card("card:2", "Opt"),
        card("card:3", "Island", "Basic Land — Island"),
      ],
      [card("card:9", "Swamp", "Basic Land — Swamp")],
    );
    expect(groups.map((g) => [g.card.name, g.ids.length, g.why])).toEqual([
      ["Opt", 1, null],
      ["Island", 2, null],
      ["Swamp", 0, "can't be chosen"],
    ]);
    expect(notOffered(card("card:9", "Swamp", "Basic Land — Swamp"), [card("card:2", "Opt")])).toBe(
      "a land",
    );
  });

  it("keeps the game's words, without the list the pictures already show", () => {
    expect(
      plainPrompt(
        "Select a card from your library Demonic Tutor - Looking at cards in Island, Swamp, and 36 more.",
        "Demonic Tutor",
      ),
    ).toBe("Select a card from your library.");
    expect(
      plainPrompt("Choose card(s) to put into hand You are looking at: Swamp, Opt.", "Impulse"),
    ).toBe("Choose card(s) to put into hand.");
    expect(plainPrompt("Discard 1 from RudeLeft's hand", null)).toBe(
      "Discard 1 from RudeLeft's hand.",
    );
  });

  it("says where each numbered card ends up", () => {
    expect(placeWords(0, "top", "top")).toBe("Top card");
    expect(placeWords(1, "top", "top")).toBe("2nd from the top");
    expect(placeWords(0, "bottom", "bottom")).toBe("Very bottom");
    expect(placeWords(2, "bottom", "bottom")).toBe("3rd from the bottom");
  });
});

describe("combat damage among blockers (owner 2026-11-01, item 5)", () => {
  const two = [
    { card: "card:1", lethal: 2 },
    { card: "card:2", lethal: 4 },
  ];

  it("starts from lethal to each in order, the rest to the last", () => {
    expect(usualSplit({ damage: 6, blockers: two, trample: false, divides: false })).toEqual({
      blockers: [2, 4],
      player: 0,
    });
    expect(usualSplit({ damage: 8, blockers: two, trample: false, divides: false })).toEqual({
      blockers: [2, 6],
      player: 0,
    });
    expect(usualSplit({ damage: 3, blockers: two, trample: false, divides: false })).toEqual({
      blockers: [2, 1],
      player: 0,
    });
  });

  it("with trample, the rest goes to the player", () => {
    expect(usualSplit({ damage: 8, blockers: two, trample: true, divides: false })).toEqual({
      blockers: [2, 4],
      player: 2,
    });
  });

  it("answers the one-point questions: each blocker's points, then the player's", () => {
    const kind = "assignCombatDamage";
    expect(damageSteps(kind, ["card:1", "card:2"], { blockers: [2, 1], player: 2 })).toEqual([
      { kind, card: "card:1" },
      { kind, card: "card:1" },
      { kind, card: "card:2" },
      { kind, action: DAMAGE_TO_PLAYER },
      { kind, action: DAMAGE_TO_PLAYER },
    ]);
  });

  it("a step for the player answers only where the player is offered", () => {
    const step = { kind: "assignCombatDamage", action: DAMAGE_TO_PLAYER };
    const asked = decision({
      kind: "assignCombatDamage",
      options: [option("damage:card:1", "card:1"), option(DAMAGE_TO_PLAYER, null)],
    });
    expect(stepAnswer(step, asked)).toBe(DAMAGE_TO_PLAYER);
    expect(
      stepAnswer(step, { ...asked, options: [option("damage:card:1", "card:1")] }),
    ).toBeUndefined();
  });

  it("is the damage tray when the question carries the fight", () => {
    const fight = { damage: 6, attacker: "card:9", blockers: two, trample: false, divides: false };
    expect(
      trayOf(decision({ kind: "assignCombatDamage", arrange: { ...arrange({}), damage: fight } })),
    ).toBe("damage");
    expect(trayOf(decision({ kind: "assignCombatDamage" }))).toBeNull();
  });
});

// W-11 (Amendment 14): a split "divided as you choose", in one tray.
describe("the split", () => {
  const thunder = {
    total: 5,
    what: "damage",
    targets: [
      { object: "player:2", lethal: null },
      { object: "card:7", lethal: 3 },
      { object: "card:9", lethal: 2 },
    ],
    at: 0,
    values: [1, 2, 3],
  };

  it("starts with enough to kill each creature in order, the rest to the player", () => {
    expect(usualDivide(thunder)).toEqual([1, 3, 1]);
    expect(usualDivide({ ...thunder, total: 9 })).toEqual([4, 3, 2]);
    // Too little to kill anything: 1 each.
    expect(usualDivide({ ...thunder, total: 3 })).toEqual([1, 1, 1]);
    // No player: the rest to the last target.
    expect(
      usualDivide({
        total: 7,
        targets: [
          { object: "card:1", lethal: 2 },
          { object: "card:2", lethal: 2 },
        ],
      }),
    ).toEqual([2, 5]);
  });

  it("answers only the shares the game asks: never the last, never one with no choice", () => {
    const kind = "divideAsYouChoose";
    expect(divideSteps(kind, 5, [1, 3, 1])).toEqual([
      { kind, value: 1 },
      { kind, value: 3 },
    ]);
    // 3 over 3: every share is 1, nothing is asked.
    expect(divideSteps(kind, 3, [1, 1, 1])).toEqual([]);
    // 4 over 3: the first may take 2; after it took 2 the second has no choice.
    expect(divideSteps(kind, 4, [2, 1, 1])).toEqual([{ kind, value: 2 }]);
    expect(divideSteps(kind, 4, [1, 2, 1])).toEqual([
      { kind, value: 1 },
      { kind, value: 2 },
    ]);
  });

  it("is a tray from its first share, and a share is answered by its value", () => {
    const first = decision({
      kind: "divideAsYouChoose",
      options: [option("divide:1", null), option("divide:2", null), option("divide:3", null)],
      arrange: arrange({ divide: thunder }),
    });
    expect(trayOf(first)).toBe("divide");
    expect(trayOf({ ...first, arrange: arrange({ divide: { ...thunder, at: 1 } }) })).toBeNull();
    expect(stepAnswer({ kind: "divideAsYouChoose", value: 3 }, first)).toBe("divide:3");
    expect(stepAnswer({ kind: "divideAsYouChoose", value: 4 }, first)).toBeUndefined();
  });
});
