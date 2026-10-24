// PHASE_07 §7.24-§7.33 — what a click means, without a board.

import { describe, expect, it } from "vitest";
import type { Decision } from "../match";
import { PRIORITY_KIND, clickOn, questionOf } from "./interaction";
import { headingFor, hintFor } from "../matchText";

function decision(kind: string, options: Decision["options"], mandatory = false): Decision {
  return {
    decisionId: 1,
    actedForSeat: 1,
    kind,
    stateVersion: 1,
    options,
    mandatory,
    prompt: null,
    searchable: false,
    optionCount: options.length,
    results: null,
    unavailable: {},
    about: null,
    looking: [],
    window: false,
  };
}
const option = (actionId: string, objectId: string | null, label = actionId) => ({
  actionId,
  label,
  objectId,
  payable: true,
  cost: null,
});
const visible = new Set(["card:1", "card:2", "stack:1", "player:2"]);

describe("a question kind this page has never seen (§7.33, P7-I)", () => {
  it("is still answerable: every option listed, the board's clickable, and a pass when allowed", () => {
    const unseen = decision("aQuestionNoReleaseHasYet", [
      option("x", "card:1", "Pick the card"),
      option("y", null, "Pick a word"),
    ]);
    const q = questionOf(unseen, visible);
    // Not mistaken for "your move": the question bar is shown.
    expect(q.context).toBe("choose");
    // Nothing dropped: the answer about a drawn card is on that card, the
    // other one is in the list.
    expect(q.onBoard.get("card:1")!.map((o) => o.actionId)).toEqual(["x"]);
    expect(q.listed.map((o) => o.actionId)).toEqual(["y"]);
    expect(clickOn(q, "card:1")).toEqual({ kind: "answer", actionId: "x" });
    expect(q.canPass).toBe(true);
    // Words for it, generic but never blank.
    expect(headingFor(unseen.kind).length).toBeGreaterThan(0);
    expect(hintFor(unseen.kind, 2).length).toBeGreaterThan(0);
  });
});

describe("questionOf", () => {
  it("puts options about drawn objects on the board and lists the rest", () => {
    const q = questionOf(
      decision("chooseModeForAbility", [
        option("a", "card:1"),
        option("b", "card:1"),
        option("c", null, "Mode two"),
        option("d", "card:99"),
      ]),
      visible,
    );
    expect([...q.onBoard.keys()]).toEqual(["card:1"]);
    expect(q.onBoard.get("card:1")!.map((o) => o.actionId)).toEqual(["a", "b"]);
    // §7.29: nothing is dropped -- the card not drawn is listed, and
    // so are two answers about one card (its modes), which a click on
    // the card cannot tell apart.
    expect(q.listed.map((o) => o.actionId)).toEqual(["a", "b", "c", "d"]);
    expect(q.context).toBe("choose");
  });

  it("knows Forge's priority question and whether passing is allowed", () => {
    expect(questionOf(decision(PRIORITY_KIND, []), visible).context).toBe("priority");
    expect(
      questionOf(decision("chooseCardsToDiscardToMaximumHandSize", [], true), visible).canPass,
    ).toBe(false);
  });
});

describe("clickOn", () => {
  it("selects when nothing is being asked, or nothing is asked about that object", () => {
    expect(clickOn(null, "card:1")).toEqual({ kind: "select", objectId: "card:1" });
    const q = questionOf(decision("chooseTargetsFor", [option("t", "card:2")]), visible);
    expect(clickOn(q, "card:1")).toEqual({ kind: "select", objectId: "card:1" });
  });

  it("on your move, one action is the click; several are offered (AMENDMENT 12)", () => {
    const one = questionOf(decision(PRIORITY_KIND, [option("cast", "card:1")]), visible);
    expect(clickOn(one, "card:1")).toEqual({ kind: "answer", actionId: "cast" });
    const two = questionOf(
      decision(PRIORITY_KIND, [option("cast", "card:1"), option("cycle", "card:1")]),
      visible,
    );
    expect(clickOn(two, "card:1")).toEqual({
      kind: "offer",
      objectId: "card:1",
      options: [option("cast", "card:1"), option("cycle", "card:1")],
    });
  });

  it("inside a context, one answer is the click; several are offered (§7.27, §7.29)", () => {
    const target = questionOf(decision("chooseTargetsFor", [option("t1", "player:2")]), visible);
    expect(clickOn(target, "player:2")).toEqual({ kind: "answer", actionId: "t1" });
    const two = questionOf(
      decision("chooseTargetsFor", [option("x", "card:1"), option("y", "card:1")]),
      visible,
    );
    expect(clickOn(two, "card:1").kind).toBe("offer");
    // On your move, a card's several actions stay on the card.
    const move = questionOf(
      decision(PRIORITY_KIND, [option("x", "card:1"), option("y", "card:1")]),
      visible,
    );
    expect(move.listed).toEqual([]);
  });
});
