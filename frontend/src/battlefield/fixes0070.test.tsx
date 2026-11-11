// @vitest-environment jsdom

// Spec 0070 -- click-to-pay Ribbons: every card picked to pay a cost is
// marked at once (a Ribbon with the cost's word; a tap leans 5 degrees,
// never sideways), a picked card clicked again is taken back, the other
// player is shown nothing, and Reduce motion keeps the Ribbon but does not
// animate the lean (F-0070-A..E). The real game screen, its socket
// replaced: the test hands it the server's messages itself. The worker side
// is CostPicksTest and scripts/check-pay-picks.py.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { EMPTY_MATCH, reduceMatch, type MatchState } from "../match";
import { TAPPED_TILT } from "./layout";
import { PAY_HOLD_MS, PAY_TONES, payMarks } from "./payPicks";
import { PaySign, SIGN_COLOUR } from "./PaySign";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  answers: [] as unknown[][],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (...args: unknown[]) => socket.answers.push(args),
      search: () => {},
      concede: () => {},
      endForAway: () => {},
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");

const size = { width: 1920, height: 1080 };
let reduced = false;
let animations: { element: Element; frames: Keyframe[] }[] = [];
beforeEach(() => {
  reduced = false;
  animations = [];
  socket.answers = [];
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.animate = function (this: Element, frames: Keyframe[]) {
    animations.push({ element: this, frames });
    return {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null,
      playState: "running",
    } as unknown as Animation;
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => size.width,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => size.height,
});

const match: MatchView = {
  matchId: "m-1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

const elf = (id: number) => ({
  id: `card:${id}`,
  seat: 1,
  name: "Llanowar Elves",
  kind: "creature",
  types: "Creature — Elf Druid",
  known: true,
  power: 1,
  toughness: 1,
});
const ELVES = [elf(10), elf(11), elf(12)];
const mountain = (id: number) => ({
  id: `card:${id}`,
  seat: 1,
  name: "Mountain",
  kind: "land",
  types: "Basic Land — Mountain",
  known: true,
});
const bolt = {
  id: "card:40",
  seat: 1,
  name: "Lightning Bolt",
  kind: "instant",
  types: "Instant",
  known: true,
};

let revision = 0;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
}
function board(over: Record<string, unknown>, seat = 1) {
  revision += 1;
  send({
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      turn: 5,
      phase: "MAIN1",
      activeSeat: 1,
      seat,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 1, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 50 },
      ],
      battlefield: ELVES,
      hand: [],
      graveyard: [],
      exile: [],
      stack: [],
      ...over,
    },
  });
}
let asked = 0;
/** A pick question: [left] still to pick from, [picked] so far, and what the cost does. */
function askPick(
  kind: string,
  left: string[],
  picked: string[],
  word: string,
  tone: string,
  lean: boolean,
) {
  asked += 1;
  send({
    type: "DECISION_REQUEST",
    decisionId: asked,
    actedForSeat: 1,
    stateVersion: revision,
    kind,
    options: left.map((id) => ({ actionId: `cost:${id}`, label: "Llanowar Elves", objectId: id })),
    prompt: `Voice of the Woods: tap 5 Elves to pay its cost. (${picked.length + 1} of 5)`,
    picking: {
      word,
      tone,
      ...(lean ? { lean: true } : {}),
      picked: picked.map((id) => ({
        objectId: id,
        actionId: `unpick:${id}`,
        label: "Llanowar Elves",
      })),
    },
  });
}

const cardOnBoard = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`button[data-object-id="${id}"]`)!;
const placeOf = (c: ParentNode, id: string) => cardOnBoard(c, id).parentElement!;
/** Amendment 1: the corner sign beside a card ("tap", "sacrifice"... or "seen"). */
const ribbonOf = (c: ParentNode, id: string) => {
  const sign = placeOf(c, id).querySelector<HTMLElement>(":scope > .bf-pay-sign");
  return sign ? { textContent: (sign.dataset["sign"] ?? "").toUpperCase(), sign } : null;
};

function open(me = "u-1") {
  return render(<GameScreen match={match} me={me} onLeave={() => {}} />).container;
}

describe("each card picked to tap is marked at once and leans (F-0070-A)", () => {
  it("TAP on the picked Elf, leaning 5 degrees; the others upright and choosable", () => {
    const c = open();
    board({});
    askPick("CostTapType", ["card:10", "card:11", "card:12"], [], "TAP", "tap", true);
    expect(c.querySelectorAll(".bf-pay-sign")).toHaveLength(0);
    askPick("CostTapType", ["card:11", "card:12"], ["card:10"], "TAP", "tap", true);
    const picked = cardOnBoard(c, "card:10");
    expect(picked.dataset["payPicked"]).toBe("TAP");
    expect(picked.className).toContain("bf-pay-tap");
    expect(picked.getAttribute("aria-label")).toContain("picked: tap");
    expect(ribbonOf(c, "card:10")?.textContent).toBe("TAP");
    // Leans as a tapped card does -- never sideways -- and is not tapped yet.
    expect(placeOf(c, "card:10").style.transform).toContain(`rotate(${TAPPED_TILT}deg)`);
    expect(TAPPED_TILT).toBe(5);
    expect(picked.dataset["tapped"]).toBe("false");
    // The picked Elf stands apart from its pile; the others stay upright.
    const other = cardOnBoard(c, "card:11");
    expect(other.dataset["payPicked"]).toBeUndefined();
    expect(other.dataset["choosable"]).toBe("true");
    expect(placeOf(c, "card:11").style.transform).toContain("rotate(0deg)");
    expect(ribbonOf(c, "card:11")).toBeNull();
    // A second pick: both marked.
    askPick("CostTapType", ["card:12"], ["card:10", "card:11"], "TAP", "tap", true);
    expect(c.querySelectorAll(".bf-pay-sign")).toHaveLength(2);
  });

  it("paid: the marks go, and the Elves are tapped (the game's snapshot)", () => {
    const c = open();
    board({});
    askPick("CostTapType", ["card:12"], ["card:10", "card:11"], "TAP", "tap", true);
    send({ type: "DECISION_ACCEPTED", decisionId: asked });
    board({ battlefield: ELVES.map((e) => ({ ...e, tapped: e.id !== "card:12" })) });
    // Held until the game's next question: nothing flickers off between.
    expect(c.querySelectorAll(".bf-pay-sign")).toHaveLength(2);
    asked += 1;
    send({
      type: "DECISION_REQUEST",
      decisionId: asked,
      actedForSeat: 1,
      stateVersion: revision,
      kind: "chooseSpellAbilityToPlay",
      options: [],
    });
    expect(c.querySelectorAll(".bf-pay-sign")).toHaveLength(0);
    expect(cardOnBoard(c, "card:10").dataset["tapped"]).toBe("true");
    expect(placeOf(c, "card:10").style.transform).toContain(`rotate(${TAPPED_TILT}deg)`);
  });
});

describe("between a pick and the next question (no flicker)", () => {
  it("the card clicked is marked at once and stays marked; the marks go if no question comes", () => {
    vi.useFakeTimers();
    try {
      const c = open();
      board({});
      askPick("CostTapType", ["card:11", "card:12"], ["card:10"], "TAP", "tap", true);
      fireEvent.click(cardOnBoard(c, "card:11"));
      expect(socket.answers.at(-1)).toEqual([asked, "cost:card:11"]);
      expect(ribbonOf(c, "card:11")?.textContent).toBe("TAP");
      send({ type: "DECISION_ACCEPTED", decisionId: asked });
      expect(ribbonOf(c, "card:10")?.textContent).toBe("TAP");
      expect(ribbonOf(c, "card:11")?.textContent).toBe("TAP");
      expect(placeOf(c, "card:11").style.transform).toContain(`rotate(${TAPPED_TILT}deg)`);
      act(() => {
        vi.advanceTimersByTime(PAY_HOLD_MS + 10);
      });
      expect(c.querySelectorAll(".bf-pay-sign")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a picked card clicked again is taken back (F-0070-B)", () => {
  it("answers with its take-back, not as a pick", () => {
    const c = open();
    board({});
    askPick("CostTapType", ["card:11", "card:12"], ["card:10"], "TAP", "tap", true);
    fireEvent.click(cardOnBoard(c, "card:10"));
    expect(socket.answers.at(-1)).toEqual([asked, "unpick:card:10"]);
    // The game asks again without it: no mark, upright, choosable.
    askPick("CostTapType", ["card:10", "card:11", "card:12"], [], "TAP", "tap", true);
    expect(cardOnBoard(c, "card:10").dataset["payPicked"]).toBeUndefined();
    expect(c.querySelectorAll(".bf-pay-sign")).toHaveLength(0);
    // A click on it now picks it again.
    fireEvent.click(cardOnBoard(c, "card:10"));
    expect(socket.answers.at(-1)).toEqual([asked, "cost:card:10"]);
  });
});

describe("every card-by-card cost shows its word (F-0070-C)", () => {
  it("SACRIFICE: a red Ribbon, no lean", () => {
    const c = open();
    board({ battlefield: [mountain(30), mountain(31), mountain(32)] });
    askPick("CostSacrifice", ["card:31", "card:32"], ["card:30"], "SACRIFICE", "sacrifice", false);
    expect(ribbonOf(c, "card:30")?.textContent).toBe("SACRIFICE");
    expect(cardOnBoard(c, "card:30").className).toContain("bf-pay-sacrifice");
    expect(placeOf(c, "card:30").style.transform).toContain("rotate(0deg)");
  });

  it("DISCARD on a card in the hand", () => {
    const c = open();
    board({ hand: [bolt] });
    askPick("CostDiscard", [], ["card:40"], "DISCARD", "discard", false);
    expect(ribbonOf(c, "card:40")?.textContent).toBe("DISCARD");
    expect(ribbonOf(c, "card:40")?.sign.textContent).toBe("");
    expect(cardOnBoard(c, "card:40").className).toContain("bf-pay-discard");
  });

  it("each kind has its colour; a kind the page does not know is drawn plainly, never dropped", () => {
    for (const tone of PAY_TONES) {
      const marks = payMarks({
        picking: {
          word: "W",
          tone,
          lean: false,
          picked: [{ objectId: "card:1", actionId: "unpick:card:1", label: "" }],
        },
      } as never);
      expect(marks.get("card:1")?.tone).toBe(tone);
    }
    const odd = payMarks({
      picking: {
        word: "PAY",
        tone: "spin",
        lean: false,
        picked: [{ objectId: "card:1", actionId: "x", label: "" }],
      },
    } as never);
    expect(odd.get("card:1")).toEqual({ word: "PAY", tone: "other", lean: false, actionId: "x" });
    expect(payMarks(null).size).toBe(0);
    // Each tone has its sign (Amendment 1): a colour and an icon, no words.
    for (const tone of PAY_TONES) {
      const sign = render(<PaySign tone={tone} />).container.querySelector(".bf-pay-sign")!;
      expect(SIGN_COLOUR[tone]).toMatch(/^#[0-9a-f]{6}$/);
      expect(sign.querySelector("svg")!.childElementCount).toBeGreaterThan(0);
      expect(sign.textContent).toBe("");
    }
  });

  it("the question carries the picks as sent; a pick without its ids is dropped", () => {
    const state = reduceMatch(EMPTY_MATCH, {
      type: "DECISION_REQUEST",
      decisionId: 3,
      actedForSeat: 1,
      stateVersion: 1,
      kind: "CostReturn",
      options: [],
      picking: {
        word: "TO HAND",
        tone: "hand",
        picked: [
          { objectId: "card:5", actionId: "unpick:card:5", label: "Island" },
          { objectId: "card:6" },
        ],
      },
    });
    expect(state.decision?.picking).toEqual({
      word: "TO HAND",
      tone: "hand",
      lean: false,
      picked: [{ objectId: "card:5", actionId: "unpick:card:5", label: "Island" }],
    });
    const none = reduceMatch(EMPTY_MATCH, {
      type: "DECISION_REQUEST",
      decisionId: 4,
      actedForSeat: 1,
      stateVersion: 1,
      kind: "CostReturn",
      options: [],
    });
    expect(none.decision?.picking).toBeNull();
  });
});

describe("the other player sees nothing until it is paid (F-0070-D)", () => {
  it("their table, while seat 1 picks: no Ribbon, nothing leaning", () => {
    // Bob's page: the game sends him the board, never seat 1's question.
    const c = open("u-2");
    board({}, 2);
    expect(c.querySelectorAll(".bf-pay-sign, [data-pay-picked]")).toHaveLength(0);
    const cards = [...c.querySelectorAll<HTMLElement>('button[data-controller="opponent"]')];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.parentElement!.style.transform).toContain("rotate(0deg)");
  });
});

describe("Reduce motion (F-0070-E)", () => {
  it("the Ribbon still shows; the lean is not animated -- and is, with motion", () => {
    const leanAnimations = (c: ParentNode) =>
      animations.filter(
        (a) =>
          a.element === placeOf(c, "card:10") &&
          a.frames.some((f) => String(f.transform ?? "").includes(`rotate(${TAPPED_TILT}deg)`)),
      );
    reduced = true;
    let c = open();
    board({});
    askPick("CostTapType", ["card:10", "card:11", "card:12"], [], "TAP", "tap", true);
    askPick("CostTapType", ["card:11", "card:12"], ["card:10"], "TAP", "tap", true);
    expect(ribbonOf(c, "card:10")?.textContent).toBe("TAP");
    expect(placeOf(c, "card:10").style.transform).toContain(`rotate(${TAPPED_TILT}deg)`);
    expect(leanAnimations(c)).toHaveLength(0);
    document.body.innerHTML = "";

    reduced = false;
    animations = [];
    c = open();
    board({});
    askPick("CostTapType", ["card:10", "card:11", "card:12"], [], "TAP", "tap", true);
    askPick("CostTapType", ["card:11", "card:12"], ["card:10"], "TAP", "tap", true);
    expect(leanAnimations(c).length).toBeGreaterThan(0);

    const css = readFileSync(join(process.cwd(), "src", "battlefield", "game.css"), "utf-8");
    const still = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
    expect(still).toMatch(/\.bf-pay-sign\s*\{\s*animation: none;/);
  });
});

describe("no words on a picked card: a corner sign (F-0070-F)", () => {
  it("the canvas's sign for each cost, beside the card, and no word anywhere on it", () => {
    const c = open();
    board({ battlefield: [...ELVES, mountain(30), mountain(31)] });
    askPick("CostTapType", ["card:11"], ["card:10"], "TAP", "tap", true);
    const sign = placeOf(c, "card:10").querySelector<HTMLElement>(":scope > .bf-pay-sign")!;
    expect(sign.dataset["sign"]).toBe("tap");
    expect(sign.style.color).toBe("rgb(244, 194, 94)");
    expect(placeOf(c, "card:10").textContent).not.toMatch(/TAP/);
    askPick("CostSacrifice", ["card:31"], ["card:30"], "SACRIFICE", "sacrifice", false);
    expect(ribbonOf(c, "card:30")?.textContent).toBe("SACRIFICE");
    expect(placeOf(c, "card:30").textContent).not.toMatch(/SACRIFICE/);
    expect(c.querySelector(".bf-pay-ribbon")).toBeNull();
  });
});

describe("the seen eye, both ways (F-0070-G, F-0070-H)", () => {
  it("your hand card the other player has seen wears the eye until it leaves your hand", () => {
    const c = open();
    board({
      hand: [
        { ...bolt, seen: true },
        { ...bolt, id: "card:41" },
      ],
    });
    expect(cardOnBoard(c, "card:40").dataset["seen"]).toBe("true");
    expect(ribbonOf(c, "card:40")?.textContent).toBe("SEEN");
    expect(cardOnBoard(c, "card:40").getAttribute("aria-label")).toContain("has seen it");
    expect(cardOnBoard(c, "card:41").dataset["seen"]).toBeUndefined();
    expect(ribbonOf(c, "card:41")).toBeNull();
    // Played: gone from the hand, and with it the eye.
    board({ hand: [{ ...bolt, id: "card:41" }] });
    expect(c.querySelectorAll('[data-sign="seen"]')).toHaveLength(0);
  });

  it("a card they revealed to you stays face up in their hand, with the eye", () => {
    const c = open();
    const theirs = { ...bolt, id: "card:50", seat: 2, owner: 2, seen: true };
    board({ otherHands: [theirs] });
    const shown = cardOnBoard(c, "card:50");
    expect(shown.dataset["face"]).toBe("up");
    expect(shown.dataset["seen"]).toBe("true");
    expect(shown.getAttribute("aria-label")).toContain("revealed to you");
    expect(placeOf(c, "card:50").querySelector('[data-sign="seen"]')).not.toBeNull();
    // It left their hand: the game stops sending it, and it is a back again.
    board({ otherHands: [] });
    expect(c.querySelector('button[data-object-id="card:50"]')).toBeNull();
    expect(c.querySelectorAll('[data-sign="seen"]')).toHaveLength(0);
  });
});
