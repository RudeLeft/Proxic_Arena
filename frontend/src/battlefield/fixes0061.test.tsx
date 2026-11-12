// @vitest-environment jsdom

// Spec 0061 -- nothing thrown away by one click; say why a card left
// (F-0061-A, C, D, E; B's notice words are the worker's, its showing here).

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Decision, DecisionOption, SnapshotCard } from "../match";
import { newNotices, noticeParts } from "../notices";
import { Board } from "./Board";
import { DISCARD_KIND, discardCount, discardWords, togglePick } from "./discard";
import { syntheticBoard } from "./fixture";
import { boardFromSnapshot } from "./fromSnapshot";
import { ActionPopup, DiscardAct } from "./GameScreen";
import { PRIORITY_KIND, clickOn, questionOf, throwsAway } from "./interaction";
import { layout } from "./layout";
import { GRAVE_TAG_HOLD_MS, MOVE_MS, fateMs, graveTagFrames } from "./motion";
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

describe("a card going to a graveyard carries its tag (F-0061-D)", () => {
  const size = { width: 1920, height: 1080 };
  const calls: { element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (
      this: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      calls.push({ element: this, frames, options });
      return { onfinish: null, cancel() {} };
    };
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const start = syntheticBoard(24, 30, 2);
  const viewer = start.viewerSeat;
  const out = layout(start, size);
  const slot = out.slots.find((s) => {
    const c = start.battlefield.find((card) => card.id === s.ids[0]);
    return s.ids.length === 1 && c?.kind === "creature" && c.seat === viewer && !s.attached.length;
  })!;
  const bears = start.battlefield.find((card) => card.id === slot.ids[0])!;
  function draw(battlefield = start.battlefield, hand = start.hand, graves = new Map()) {
    return (
      <Board
        battlefield={battlefield}
        hand={hand}
        opponentName="Bob"
        viewerSeat={viewer}
        artUrl={(art) => art}
        arrivals={new Map()}
        departures={new Map()}
        graves={graves}
      />
    );
  }
  const tags = (c: HTMLElement) =>
    [...c.querySelectorAll("[data-grave-tag]")].map((t) => [
      t.getAttribute("data-grave-tag"),
      t.textContent,
    ]);

  // Spec 0066, item 6: the game no longer tags a death on the battlefield
  // ("Died", "Destroyed", "Sacrificed" are gone; fixes0066 checks none is
  // drawn). The page still carries any tag the game gives a table card.
  it("a table card's tag rides on it, after its shatter, to the graveyard", () => {
    const view = render(draw());
    calls.length = 0;
    view.rerender(
      draw(
        start.battlefield.filter((c) => c.id !== bears.id),
        start.hand,
        new Map([[bears.id, "Countered by Negate"]]),
      ),
    );
    expect(tags(view.container)).toEqual([[bears.id, "Countered by Negate"]]);
    const tag = view.container.querySelector("[data-grave-tag]")!;
    expect(tag.classList.contains("bf-return-tag")).toBe(true); // A-14's look
    const run = calls.find((c) => c.element === tag)!;
    const ghost = calls.find(
      (c) => c.element === view.container.querySelector(`[data-ghost-of="${bears.id}"]`),
    )!;
    expect(run.options.delay).toBe(ghost.options.delay); // sets off with the card
    expect(run.options.duration).toBe(fateMs("defeated") + MOVE_MS + GRAVE_TAG_HOLD_MS);
    expect(run.frames[0]!.opacity).toBe(0);
    expect(run.frames.at(-1)!.opacity).toBe(0); // gone after its hold
  });

  it("Discarded: too many cards -- rides on the hand card to the graveyard", () => {
    const view = render(draw());
    const card = start.hand[0]!;
    calls.length = 0;
    view.rerender(
      draw(
        start.battlefield,
        start.hand.slice(1),
        new Map([[card.id, "Discarded: too many cards"]]),
      ),
    );
    expect(tags(view.container)).toEqual([[card.id, "Discarded: too many cards"]]);
  });

  it("no tag without the game's reason (a spell that resolved, an older worker)", () => {
    const view = render(draw());
    view.rerender(draw(start.battlefield.filter((c) => c.id !== bears.id)));
    expect(view.container.querySelector("[data-grave-tag]")).toBeNull();
  });

  it("the move record's tag reaches the board, only for a graveyard", () => {
    const snap = {
      ...(fromSnapshotInput() as object),
      moves: [
        {
          card: "card:62",
          from: { zone: "hand", seat: 1 },
          to: { zone: "graveyard", seat: 1 },
          why: "cycled",
          said: "Cycled",
        },
        {
          card: "card:7",
          from: { zone: "battlefield", seat: 1 },
          to: { zone: "hand", seat: 1 },
          why: null,
          said: null,
        },
      ],
    };
    const data = boardFromSnapshot(snap as never, null);
    expect([...data.graves]).toEqual([["card:62", "Cycled"]]);
  });

  it("spec 0074, Amendment 1: a discard or a counter carries no tag (the report window explains it)", () => {
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
        {
          card: "card:63",
          from: { zone: "stack", seat: null },
          to: { zone: "graveyard", seat: 2 },
          why: "countered",
          said: "Countered by Counterspell",
        },
        {
          card: "card:64",
          from: { zone: "hand", seat: 2 },
          to: { zone: "graveyard", seat: 2 },
          why: "cycled",
          said: "Cycled",
        },
      ],
    };
    const data = boardFromSnapshot(snap as never, null);
    expect([...data.graves]).toEqual([["card:64", "Cycled"]]);
  });

  it("the tag's frames: over the card, then by the pile, held, then gone", () => {
    const { frames, duration } = graveTagFrames(300, -200, 0, MOVE_MS);
    expect(duration).toBe(MOVE_MS + GRAVE_TAG_HOLD_MS);
    expect(String(frames.at(-1)!.transform)).toContain("translate(300px, -200px)");
    expect(String(frames[0]!.transform)).toContain("translate(0px, 0px)");
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
