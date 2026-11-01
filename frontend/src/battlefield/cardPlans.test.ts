// PHASE_09 group 3 (W-07..W-10): the answers a card tray gives for the
// game's one-card-at-a-time questions, and which tray a question is.

import { describe, expect, it } from "vitest";
import type { Decision, DecisionArrange, Snapshot, SnapshotCard } from "../match";
import {
  askingName,
  cardGroups,
  notOffered,
  orderSteps,
  placeWords,
  plainPrompt,
  rowSteps,
  splitSteps,
  stepAnswer,
  trayOf,
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
