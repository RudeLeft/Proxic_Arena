// @vitest-environment jsdom

// Spec 0061 -- nothing thrown away by one click; say why a card left
// (F-0061-A, C, D, E; B's notice words are the worker's, its showing here).

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Decision, DecisionOption, SnapshotCard } from "../match";
import { newNotices, noticeParts } from "../notices";
import { DISCARD_KIND, discardCount, discardWords, togglePick } from "./discard";
import { boardFromSnapshot } from "./fromSnapshot";
import { ActionPopup, DiscardAct } from "./GameScreen";
import { PRIORITY_KIND, clickOn, questionOf, throwsAway } from "./interaction";
import { payLine, payTitle } from "./QuestionWindows";

function decision(kind: string, options: DecisionOption[], over: Partial<Decision> = {}): Decision {
  return {
    decisionId: 1,
    actedForSeat: 1,
    kind,
    stateVersion: 1,
    options,
    mandatory: false,
    prompt: null,
    searchable: false,
    optionCount: options.length,
    results: null,
    unavailable: {},
    about: null,
    looking: [],
    window: false,
    ...over,
  };
}

const cycle: DecisionOption = {
  actionId: "action:20:card:5",
  label: "Forgotten Cave · {R} · Cycling",
  objectId: "card:5",
  payable: true,
  cost: null,
  use: {
    kind: "cycling",
    title: "Cycle it instead",
    cost: "{R}",
    line: "Discard Forgotten Cave and draw a card. You won't have it as a land.",
  },
};
const land: DecisionOption = {
  actionId: "action:19:card:5",
  label: "Forgotten Cave · no cost · Play land",
  objectId: "card:5",
  payable: true,
  cost: null,
  use: { kind: "land", title: "Play it as your land", cost: null, line: "It comes in tapped." },
};

// --- item 1: a card that would be thrown away never goes with one click -------------

describe("a cycling card with only cycling offered opens its menu (F-0061-A)", () => {
  const visible = new Set(["card:5", "card:6"]);

  it("one click on Forgotten Cave after the land drop offers, never answers", () => {
    const q = questionOf(decision(PRIORITY_KIND, [cycle]), visible);
    expect(clickOn(q, "card:5")).toEqual({ kind: "offer", objectId: "card:5", options: [cycle] });
  });

  it("every way of throwing a card away does the same; its one play still goes on a click", () => {
    for (const kind of ["cycling", "landcycling", "channel"]) {
      const one = { ...cycle, use: { ...cycle.use!, kind } };
      expect(throwsAway(one)).toBe(true);
      expect(clickOn(questionOf(decision(PRIORITY_KIND, [one]), visible), "card:5").kind).toBe(
        "offer",
      );
    }
    // The play alone (Amendment 12): the click is the choice, as before.
    expect(clickOn(questionOf(decision(PRIORITY_KIND, [land]), visible), "card:5")).toEqual({
      kind: "answer",
      actionId: land.actionId,
    });
    const shock = { ...land, objectId: "card:6", actionId: "action:3:card:6" };
    delete (shock as { use?: unknown }).use;
    expect(clickOn(questionOf(decision(PRIORITY_KIND, [shock]), visible), "card:6").kind).toBe(
      "answer",
    );
  });

  it("the menu shows the play first, greyed, with why, then the red cycling", () => {
    const onChoose = vi.fn();
    const c = render(
      <ActionPopup
        box={{ x: 500, y: 900, w: 100, h: 140 }}
        name="Forgotten Cave"
        card={null}
        artUrl={(a) => a}
        options={[cycle]}
        notNow={[
          {
            label: "Play it as your land",
            why: "You've already played a land this turn",
            use: "land",
          },
        ]}
        why={null}
        busy={false}
        onChoose={onChoose}
        onInspect={vi.fn()}
        onClose={vi.fn()}
      />,
    ).container;
    const rows = [...c.querySelectorAll(".gs-popup-actions > li")];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.classList.contains("gs-ab-use-no")).toBe(true);
    expect(rows[0]!.querySelector("button")).toBeNull(); // greyed: nothing to click
    expect(rows[0]!.querySelector(".gs-ab-title")!.textContent).toBe("Play it as your land");
    expect(rows[0]!.querySelector(".gs-ab-why")!.textContent).toBe(
      "You've already played a land this turn",
    );
    const red = rows[1]!.querySelector<HTMLButtonElement>("button.gs-ab-discard")!;
    expect(red.querySelector(".gs-ab-title")!.textContent).toBe("Cycle it instead: {R}");
    expect(onChoose).not.toHaveBeenCalled(); // opening it did nothing
    fireEvent.click(red);
    expect(onChoose).toHaveBeenCalledWith(cycle.actionId);
  });
});

// --- item 2: a turn passed for you is said ------------------------------------------

describe("the passed-turn notice shows, after the sixth too (F-0061-B)", () => {
  it("the notice is a title and a line", () => {
    expect(
      noticeParts("Nothing you can play this turn -- 1 land, no land in hand. Passing your turn."),
    ).toEqual({
      title: "Nothing you can play this turn",
      line: "1 land, no land in hand. Passing your turn.",
    });
    expect(noticeParts("You flipped heads.")).toEqual({ title: "You flipped heads." });
  });

  it("a notice after the list is full (six kept) is still new", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    const full = { notices: six, noticesTotal: 6 };
    // The old count, by length, saw nothing new once six were kept.
    expect(newNotices({ notices: ["b", "c", "d", "e", "f", "Nothing"] }, 6, null)).toEqual([]);
    expect(
      newNotices({ notices: ["b", "c", "d", "e", "f", "Nothing"], noticesTotal: 7 }, 6, 6),
    ).toEqual(["Nothing"]);
    expect(newNotices(full, 6, 6)).toEqual([]);
    expect(newNotices(full, 0, null)).toEqual(six); // the first board: as before
  });
});

// --- item 3: the end-of-turn discard is on purpose ----------------------------------

describe("the hand-size discard needs a pick and Discard (F-0061-C)", () => {
  it("a click picks; another click changes the pick; with two to go, two are picked", () => {
    expect(togglePick([], "card:9", 1)).toEqual(["card:9"]);
    expect(togglePick(["card:9"], "card:4", 1)).toEqual(["card:4"]);
    expect(togglePick(["card:9"], "card:9", 1)).toEqual([]);
    expect(togglePick(["card:9"], "card:4", 2)).toEqual(["card:9", "card:4"]);
    expect(togglePick(["card:9", "card:4"], "card:7", 2)).toEqual(["card:4", "card:7"]);
  });

  it("the game says how many; an older worker means one", () => {
    const d = decision(DISCARD_KIND, [], { mandatory: true });
    expect(discardCount(d)).toBe(1);
    expect(
      discardCount({
        ...d,
        arrange: { discard: 2 } as unknown as NonNullable<Decision["arrange"]>,
      }),
    ).toBe(2);
  });

  it("the button: grey until picked, then names the card (the canvas's words)", () => {
    expect(discardWords([], 1)).toEqual({
      word: "Discard 1",
      sub: "Click a card to pick it",
      ready: false,
    });
    expect(discardWords(["Elvish Warrior"], 1)).toEqual({
      word: "Discard Elvish Warrior",
      sub: "Or click another card",
      ready: true,
    });
    expect(discardWords(["Shock"], 2)).toEqual({
      word: "Discard 2",
      sub: "1 picked · click 1 more",
      ready: false,
    });
    expect(discardWords(["Shock", "Overrun"], 2).word).toBe("Discard 2 cards");
  });

  it("only the button discards, and only once a card is picked", () => {
    const onDiscard = vi.fn();
    const idle = render(
      <DiscardAct
        discard={{ heading: "Discard a card", ...discardWords([], 1) }}
        busy={false}
        onDiscard={onDiscard}
      />,
    ).container;
    const grey = idle.querySelector<HTMLButtonElement>("button.gs-act-discard")!;
    expect(grey.disabled).toBe(true);
    expect(grey.classList.contains("gs-act-discard-idle")).toBe(true);
    const ready = render(
      <DiscardAct
        discard={{ heading: "Discard a card", ...discardWords(["Elvish Warrior"], 1) }}
        busy={false}
        onDiscard={onDiscard}
      />,
    ).container;
    const red = ready.querySelector<HTMLButtonElement>("button.gs-act-discard")!;
    expect(red.textContent).toContain("Discard Elvish Warrior");
    expect(red.classList.contains("gs-act-discard-idle")).toBe(false);
    fireEvent.click(red);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    // The scripted games find the question by its heading.
    expect(ready.querySelector(".gs-question-title")!.textContent).toBe("Discard a card");
  });
});

// --- item 4: every card going to a graveyard says why -------------------------------

// Spec 0097, item 9 (owner 2026-11-16): the tag was retired -- no page showed
// it since 0074/0075 -- and the worker no longer sends one. The why stays.
describe("a card going to a graveyard carries no word tag (F-0061-D, retired by spec 0097)", () => {
  it("a move's why reaches the board; a stray word tag is not read", () => {
    const snap = {
      ...(fromSnapshotInput() as object),
      moves: [
        {
          card: "card:62",
          from: { zone: "hand", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
          why: "discarded",
          said: "Discarded: too many cards",
        },
      ],
    };
    const data = boardFromSnapshot(snap as never, null);
    expect("graves" in data).toBe(false);
    expect(JSON.stringify(data)).not.toContain("too many cards");
  });
});

function fromSnapshotInput() {
  return {
    stateRevision: 2,
    seat: 1,
    gameEpoch: 1,
    turn: 3,
    phase: "MAIN1",
    activeSeat: 1,
    prioritySeat: 1,
    players: [],
    notices: [],
    battlefield: [] as SnapshotCard[],
    hand: [],
    otherHands: [],
    casting: [],
    graveyard: [],
    exile: [],
    stack: [],
    combat: null,
  };
}

// --- item 5: the payment window says what it's for ----------------------------------

describe("the ability payment title names the ability (F-0061-E)", () => {
  const pay = decision("applyManaToCost", [], {
    owing: "{R}",
    about: {
      name: "Forgotten Cave",
      kind: "ability",
      from: null,
      copy: null,
      copies: null,
      card: "card:62",
      pay: "to cycle Forgotten Cave",
      then: "Then Forgotten Cave goes to your graveyard and you draw a card.",
    },
  });

  it("Pay {R} to cycle Forgotten Cave, and what follows", () => {
    expect(payTitle(pay)).toBe("Pay {R} to cycle Forgotten Cave");
    expect(payLine(pay)).toBe("Then Forgotten Cave goes to your graveyard and you draw a card.");
  });

  it("a spell's payment keeps its title; another question is untouched", () => {
    const spell = { ...pay, about: { ...pay.about!, kind: "spell", pay: null, then: null } };
    expect(payTitle(spell)).toBeNull();
    expect(payTitle({ ...pay, kind: "chooseTargetsFor" })).toBeNull();
  });
});
