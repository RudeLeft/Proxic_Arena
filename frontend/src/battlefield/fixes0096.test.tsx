// @vitest-environment jsdom

// Spec 0096 -- the board keeps its cards between game updates (owner
// 2026-11-16, item 3: "the game needs to be very snappy"). The real game
// screen, its socket replaced, handed the boards the worker sends (TEST-003:
// nothing is handed the board as props). A card nothing happened to keeps its
// drawing: React does not walk into it, so its button keeps the very props it
// had. layout() keeps the places, boxes and lines that did not change.
// F-0096-A's numbers are the browser speed test's (e2e/match-speed.spec.ts).

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { keepCards, type BoardData } from "./fromSnapshot";
import { layout, type LayoutCard } from "./layout";

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
beforeEach(() => {
  socket.answers = [];
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
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
  Element.prototype.animate = function () {
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

type Card = { id: string; seat: number; name: string; kind: string; types: string } & Record<
  string,
  unknown
>;
const land = (id: number, name: string, seat = 1): Card => ({
  id: `card:${id}`,
  seat,
  name,
  kind: "land",
  types: `Basic Land — ${name}`,
  known: true,
  enteredAt: id,
});
const bear = (id: number, seat: number): Card => ({
  id: `card:${id}`,
  seat,
  name: `Bear ${id}`,
  kind: "creature",
  types: "Creature — Bear",
  known: true,
  power: 2,
  toughness: 2,
  enteredAt: id,
});
/** Every card a fresh object each update, as the socket brings them. */
const TABLE = () => [
  land(1, "Forest"),
  land(2, "Mountain"),
  land(3, "Island"),
  bear(4, 1),
  bear(5, 2),
  land(6, "Swamp", 2),
];

let revision = 0;
function send(message: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, message)));
}
function board(battlefield: Card[], over: Record<string, unknown> = {}) {
  revision += 1;
  send({
    type: "MATCH_SNAPSHOT",
    state: {
      stateRevision: revision,
      gameEpoch: 1,
      turn: 5,
      phase: "MAIN1",
      activeSeat: 1,
      seat: 1,
      players: [
        { seat: 1, name: "Alice", life: 20, handCount: 1, libraryCount: 50 },
        { seat: 2, name: "Bob", life: 20, handCount: 2, libraryCount: 50 },
      ],
      battlefield,
      hand: [{ id: "card:9", seat: 1, name: "Shock", kind: "instant", types: "Instant" }],
      graveyard: [],
      exile: [],
      stack: [],
      ...over,
    },
  });
}

const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
const button = (c: ParentNode, id: string) =>
  c.querySelector<HTMLElement>(`button[data-object-id="${id}"]`)!;
/** The props React last gave this element (it keeps them on the element). */
const propsOf = (el: Element): unknown => {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"))!;
  return (el as unknown as Record<string, unknown>)[key];
};

describe("F-0096-A · a card nothing happened to keeps its drawing", () => {
  it("one land taps: every other card's button, and the hand's, keep the props they had; the tapped land's are new", () => {
    const c = open();
    board(TABLE());
    const ids = ["card:1", "card:2", "card:3", "card:4", "card:5", "card:6", "card:9"];
    const before = new Map(ids.map((id) => [id, propsOf(button(c, id))]));
    // The next update: every card a new object, only the Mountain changed.
    board(TABLE().map((card) => (card.id === "card:2" ? { ...card, tapped: true } : card)));
    expect(button(c, "card:2").dataset["tapped"]).toBe("true");
    expect(propsOf(button(c, "card:2"))).not.toBe(before.get("card:2"));
    for (const id of ids.filter((one) => one !== "card:2"))
      expect(propsOf(button(c, id)), id).toBe(before.get(id));
    // A kept card still answers a click as itself (its drawing is not stale).
    send({
      type: "DECISION_REQUEST",
      decisionId: 1,
      actedForSeat: 1,
      stateVersion: revision,
      kind: "chooseTarget",
      options: [{ actionId: "t:5", label: "Bear 5", objectId: "card:5" }],
      prompt: "Choose a target",
    });
    expect(button(c, "card:5").dataset["choosable"]).toBe("true");
    expect(button(c, "card:4").dataset["choosable"]).toBeUndefined();
    fireEvent.click(button(c, "card:5"));
    expect(socket.answers.at(-1)![1]).toBe("t:5");
  });
});

describe("F-0096-A · layout keeps the places, boxes and lines that did not change", () => {
  const card = (over: Partial<LayoutCard> & { id: string; kind: string }): LayoutCard => ({
    seat: 1,
    name: over.id,
    types: over.kind,
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: null,
    toughness: null,
    keywords: [],
    counters: [],
    attachedTo: null,
    ...over,
  });
  const table = (): LayoutCard[] => [
    card({ id: "a", kind: "land", name: "Forest", enteredAt: 1 }),
    card({ id: "b", kind: "land", name: "Mountain", enteredAt: 2 }),
    card({ id: "c", kind: "creature", power: 2, toughness: 2, enteredAt: 3 }),
    card({ id: "d", kind: "creature", seat: 2, power: 3, toughness: 3, enteredAt: 4 }),
  ];
  const vp = { width: 1920, height: 1080 };
  it("the same cards anew: every Slot, Box and Line is the one before; a card that tapped gets its own anew", () => {
    const first = layout({ viewerSeat: 1, hand: [{ id: "h" }], battlefield: table() }, vp);
    const same = layout(
      { viewerSeat: 1, hand: [{ id: "h" }], battlefield: table(), previousLayout: first },
      vp,
    );
    same.slots.forEach((slot, i) => expect(slot).toBe(first.slots[i]));
    same.lines.forEach((line, i) => expect(line).toBe(first.lines[i]));
    for (const [id, box] of same.boxes) expect(box, id).toBe(first.boxes.get(id));
    const tapped = layout(
      {
        viewerSeat: 1,
        hand: [{ id: "h" }],
        battlefield: table().map((c) => (c.id === "d" ? { ...c, tapped: true } : c)),
        previousLayout: same,
      },
      vp,
    );
    const slotOf = (out: ReturnType<typeof layout>, id: string) =>
      out.slots.find((s) => s.ids[0] === id)!;
    expect(slotOf(tapped, "d")).not.toBe(slotOf(same, "d"));
    expect(slotOf(tapped, "d").box.rotation).not.toBe(0);
    for (const id of ["a", "b", "c"]) expect(slotOf(tapped, id), id).toBe(slotOf(same, id));
    expect(tapped.boxes.get("h")).toBe(same.boxes.get("h"));
    // Nothing kept changes a number: the same layout as one made without it.
    const fresh = layout(
      {
        viewerSeat: 1,
        hand: [{ id: "h" }],
        battlefield: table().map((c) => (c.id === "d" ? { ...c, tapped: true } : c)),
      },
      vp,
    );
    expect(tapped.slots).toEqual(fresh.slots);
    expect(tapped.lines).toEqual(fresh.lines);
    expect([...tapped.boxes]).toEqual([...fresh.boxes]);
  });
});

describe("F-0096-A · the game screen's board keeps the cards nothing happened to", () => {
  const data = (tapped: boolean, attackers: string[]): BoardData =>
    ({
      battlefield: [
        { id: "a", name: "Forest", counters: [{ name: "P1P1", count: 1 }], tapped },
        { id: "b", name: "Bear", counters: [], tapped: false },
      ],
      hand: [{ id: "h", name: "Shock" }],
      opponentHand: [{ id: "o" }],
      combat: { attackers: attackers.map((id) => ({ id, target: { player: 2 } })), blocks: [] },
    }) as unknown as BoardData;
  it("an unchanged card, list and combat is the object before; a changed one is the new one, equal to it", () => {
    const first = data(false, ["b"]);
    const same = keepCards(data(false, ["b"]), first);
    expect(same.battlefield).toBe(first.battlefield);
    expect(same.hand).toBe(first.hand);
    expect(same.opponentHand).toBe(first.opponentHand);
    expect(same.combat).toBe(first.combat);
    const next = data(true, []);
    const tapped = keepCards(next, same);
    expect(tapped.battlefield).not.toBe(same.battlefield);
    expect(tapped.battlefield[0]).toBe(next.battlefield[0]);
    expect(tapped.battlefield[1]).toBe(same.battlefield[1]);
    expect(tapped.combat).toBe(next.combat);
    expect(tapped).toEqual(next);
  });
});
