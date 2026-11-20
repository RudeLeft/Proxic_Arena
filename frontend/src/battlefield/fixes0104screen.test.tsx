// @vitest-environment jsdom

// Spec 0104 -- you always choose. F-0104-G: Appetite for Brains with ONE card
// of mana value 4 or more in Bob's hand: the tray shows his whole hand, Hill
// Giant lit, the other cards dimmed with the game's own reasons, and nothing
// is answered until a real click; afterwards the caster has no window.
// F-0104-H: a plain reveal stays across a turn-change board and closes on
// Close. The real game screen, its socket replaced, handed the board and the
// question the worker sent in a Lab game (check-always-choose, appetite-one).

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { geometry } from "./layout";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  answered: [] as (string | null)[],
  closed: [] as number[],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (_id: number, actionId: string | null) => socket.answered.push(actionId),
      search: () => {},
      concede: () => {},
      endForAway: () => {},
      reportsClosed: (upTo: number) => socket.closed.push(upTo),
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");

beforeEach(() => {
  socket.answered = [];
  socket.closed = [];
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("CSSAnimation", class {});
  vi.stubGlobal("CSSTransition", class {});
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
      onfinish: null,
      oncancel: null,
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0, iterations: 1 }) },
      updatePlaybackRate: () => {},
    } as unknown as Animation;
  };
  (Element.prototype as { getAnimations?: unknown }).getAnimations = () => [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as { animate?: unknown }).animate;
  delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
});
HTMLCanvasElement.prototype.getContext = (() => null) as never;
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => 1920,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => 947,
});

const match = {
  matchId: "m-104",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

// Bob's hand as Alice was shown it (the Lab trace's own cards and ids).
const bob = (id: string, name: string, kind: string, types: string, manaCost?: string) => ({
  id,
  seat: 2,
  owner: 2,
  tapped: false,
  faceDown: false,
  known: true,
  name,
  kind,
  types,
  ...(manaCost ? { manaCost } : {}),
});
const HAND = [
  bob("card:110", "Hill Giant", "creature", "Creature - Giant", "{3}{R}"),
  bob("card:67", "Lightning Bolt", "other", "Instant", "{R}"),
  bob("card:76", "Island", "land", "Basic Land - Island"),
  bob("card:82", "Island", "land", "Basic Land - Island"),
  bob("card:101", "Island", "land", "Basic Land - Island"),
  bob("card:64", "Grizzly Bears", "creature", "Creature - Bear", "{1}{G}"),
  bob("card:119", "Counterspell", "other", "Instant", "{U}{U}"),
];
const WHY = {
  "card:67": "mana value 1",
  "card:76": "a land",
  "card:82": "a land",
  "card:101": "a land",
  "card:64": "mana value 2",
  "card:119": "mana value 2",
};

let revision = 0;
function send(state: Record<string, unknown>) {
  act(() =>
    socket.onState!((previous) => reduceMatch(previous, { type: "MATCH_SNAPSHOT", state })),
  );
}
function state(over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 1,
    phase: "MAIN1",
    activeSeat: 1,
    prioritySeat: 1,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 5, libraryCount: 53 },
      { seat: 2, name: "Bob", life: 20, handCount: 7, libraryCount: 53 },
    ],
    battlefield: [],
    hand: [],
    otherHands: HAND.map((c) => ({ ...c, seen: true })),
    graveyard: [],
    exile: [],
    stack: [
      {
        id: "stack:2",
        source: "card:1",
        name: "Appetite for Brains",
        owner: 1,
        controller: 1,
        manaCost: "{B}",
        kind: "spell",
        targets: [{ player: 2 }],
      },
    ],
    casting: [],
    moves: [],
    ...over,
  };
}
function ask() {
  act(() =>
    socket.onState!((previous) =>
      reduceMatch(previous, {
        type: "DECISION_REQUEST",
        decisionId: 10,
        actedForSeat: 1,
        authorisedSeat: 1,
        kind: "chooseSingleEntityForEffect",
        stateVersion: revision,
        mandatory: true,
        prompt:
          "Appetite for Brains: You choose a card from it with mana value 4 or greater and exile that card.",
        options: [{ actionId: "card:110", label: "Hill Giant", objectId: "card:110" }],
        looking: HAND,
        arrange: { zone: "hand", owner: 2, why: WHY },
      }),
    ),
  );
}
const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
const tiles = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>(".gs-win-tile")];

describe("F-0104-G · one card fits: it is lit, the rest dimmed with the game's reasons, and it waits", () => {
  it("shows Bob's whole hand, Hill Giant lit and clickable, the others dimmed with why", () => {
    const c = open();
    send(state());
    ask();
    const all = tiles(c);
    expect(all.map((t) => t.querySelector(".gs-win-tile-name")!.textContent)).toEqual([
      "Hill Giant",
      "Lightning Bolt",
      "Island",
      "Island",
      "Island",
      "Grizzly Bears",
      "Counterspell",
    ]);
    const giant = all[0]!;
    expect(giant.disabled).toBe(false);
    expect(giant.classList.contains("gs-win-tile-lit")).toBe(true);
    expect(giant.querySelector(".gs-win-tile-caption")).toBeNull();
    const rest = all.slice(1);
    expect(rest.every((t) => t.disabled && !t.classList.contains("gs-win-tile-lit"))).toBe(true);
    expect(rest.map((t) => t.querySelector(".gs-win-tile-caption")!.textContent)).toEqual([
      "mana value 1",
      "a land",
      "a land",
      "a land",
      "mana value 2",
      "mana value 2",
    ]);
    // The tray's words: whose hand, and the card's own words (its name is the tray's line).
    expect(c.textContent).toContain("Look at Bob’s hand.");
    expect(c.textContent).toContain(
      "You choose a card from it with mana value 4 or greater and exile that card.",
    );
    expect(c.textContent).toContain("Appetite for Brains · only you see these");
    // Owner 2026-11-19: the hand's window is the wide tray (seven cards in one row at 1920x1080).
    const tray = c.querySelector<HTMLElement>(".gs-tray")!;
    expect(parseFloat(tray.style.maxWidth)).toBeCloseTo(
      geometry({ width: 1920, height: 947 }).play.w * 0.88,
      1,
    );
  });

  it("answers nothing by itself; the click on Hill Giant answers it; no window for the caster after", () => {
    const c = open();
    send(state());
    ask();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(socket.answered).toEqual([]);
    // A dimmed card's click does nothing.
    fireEvent.click(tiles(c)[1]!);
    expect(socket.answered).toEqual([]);
    fireEvent.click(tiles(c)[0]!);
    expect(socket.answered).toEqual(["card:110"]);
    act(() =>
      socket.onState!((previous) =>
        reduceMatch(previous, { type: "DECISION_ACCEPTED", decisionId: 10 }),
      ),
    );
    // The board after: Hill Giant in Bob's exile, no report and no reveal for Alice.
    send(
      state({
        stack: [],
        otherHands: HAND.slice(1).map((x) => ({ ...x, seen: true })),
        exile: [{ ...HAND[0], seen: undefined }],
      }),
    );
    expect(c.querySelector(".gs-reveal")).toBeNull();
    expect(tiles(c)).toHaveLength(0);
  });
});

describe("F-0104-H · a plain reveal stays across the turn line until it is closed", () => {
  it("Appetite for Brains on a hand with nothing to take: the reveal survives the next turn; Close closes it", () => {
    const c = open();
    const reveal = {
      key: "reveal:1",
      stamp: 1,
      title: "Appetite for Brains revealed:",
      cards: HAND.slice(1).map((x, i) => ({ ...x, id: `revealed:1:${i}`, to: "hand" })),
    };
    send(state({ stack: [], reveal }));
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("Appetite for Brains revealed");
    // Alice's turn passes at once: Bob's turn begins, the worker keeps sending it.
    send(state({ stack: [], turn: 2, phase: "UPKEEP", activeSeat: 2, prioritySeat: 2, reveal }));
    send(state({ stack: [], turn: 2, phase: "MAIN1", activeSeat: 2, prioritySeat: 2, reveal }));
    expect(c.querySelector(".gs-reveal")!.textContent).toContain("Appetite for Brains revealed");
    fireEvent.click(c.querySelector(".gs-reveal-close")!);
    expect(c.querySelector(".gs-reveal")).toBeNull();
    expect(socket.closed).toEqual([1]);
    // The board sent again (a reload): still closed.
    send(state({ stack: [], turn: 2, phase: "MAIN1", activeSeat: 2, prioritySeat: 2, reveal }));
    expect(c.querySelector(".gs-reveal")).toBeNull();
  });
});
