// @vitest-environment jsdom

// Spec 0124 (owner 2026-11-27) -- P11-A4 and A5 on the page. The real game
// screen, its socket replaced, handed the boards and frames the worker sends:
// F-0124-A "Bob's move" over "Passing" while the other player acts during
// your passing turn (Q2), and "Passing" back once the stack is empty;
// F-0124-C the ante cards in the standard report window, under the game's
// own medallion (Q3); the grey "GAME" notices are gone (fixes0097, F-0124-E).

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: () => {},
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
  matchId: "m-1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

let revision = 0;
function send(state: Record<string, unknown>) {
  act(() =>
    socket.onState!((previous) => reduceMatch(previous, { type: "MATCH_SNAPSHOT", state })),
  );
}
function message(frame: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, frame)));
}
function state(over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 5,
    phase: "MAIN1",
    activeSeat: 1,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 3, libraryCount: 41 },
      { seat: 2, name: "Bob", life: 20, handCount: 5, libraryCount: 44 },
    ],
    battlefield: [],
    hand: [],
    otherHands: [],
    graveyard: [],
    exile: [],
    stack: [],
    casting: [],
    moves: [],
    notices: [],
    ...over,
  };
}
const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;

const passingNow = (c: HTMLElement) => c.querySelector("[data-passing]");
const waitingWords = (c: HTMLElement) =>
  [...c.querySelectorAll(".gs-waiting")].map((n) => n.textContent ?? "").join(" | ");

describe("F-0124-A · while Bob acts during your passing turn: Bob's move, then Passing again", () => {
  const passing = { turn: 5, why: "Two lands; no land in hand" };
  const bolt = {
    id: "stack:9",
    kind: "spell",
    source: "card:60",
    controller: 2,
    name: "Lightning Bolt",
    description: "Lightning Bolt - Lightning Bolt deals 3 damage to any target.",
    manaCost: "{R}",
    targets: [{ object: "card:31" }],
  };

  it("Bob's Bolt on the stack, Bob choosing: the button says Bob's move, not Passing", () => {
    const c = open();
    send(state({ passing, phase: "COMBAT_BEGIN" }));
    expect(passingNow(c)).not.toBeNull();
    message({ type: "MATCH_ASKING", seat: 2, doing: "Choosing" });
    send(state({ passing, phase: "COMBAT_BEGIN", stack: [bolt] }));
    expect(passingNow(c)).toBeNull();
    expect(waitingWords(c)).toContain("Bob’s move");
    expect(waitingWords(c)).not.toContain("Nothing to play");
  });

  it("the Bolt waiting on the stack with nobody asked: still not Passing", () => {
    const c = open();
    send(state({ passing, phase: "COMBAT_BEGIN" }));
    message({ type: "MATCH_ASKING", seat: null });
    send(state({ passing, phase: "COMBAT_BEGIN", stack: [bolt] }));
    expect(passingNow(c)).toBeNull();
  });

  it("the stack empty again and nobody asked: Passing is back, with its reason", () => {
    const c = open();
    message({ type: "MATCH_ASKING", seat: 2, doing: "Choosing" });
    send(state({ passing, phase: "COMBAT_BEGIN", stack: [bolt] }));
    expect(passingNow(c)).toBeNull();
    message({ type: "MATCH_ASKING", seat: null });
    send(state({ passing, phase: "COMBAT_BEGIN", stack: [] }));
    // Bob's spell is held up to be shown first (GameScreen's THEIR_SPELL_HOLD_MS).
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(passingNow(c)).not.toBeNull();
    expect(passingNow(c)!.textContent).toContain("Nothing to play: Two lands; no land in hand");
  });

  it("Bob asked with an empty stack (his chance before your attack): Bob's move", () => {
    const c = open();
    send(state({ passing, phase: "COMBAT_BEGIN" }));
    message({ type: "MATCH_ASKING", seat: 2 });
    expect(passingNow(c)).toBeNull();
    expect(waitingWords(c)).toContain("Bob’s move");
    message({ type: "MATCH_ASKING", seat: 1 });
    message({ type: "MATCH_ASKING", seat: null });
    expect(passingNow(c)).not.toBeNull();
  });
});

describe("F-0124-C · the ante cards: the report window, the game's medallion", () => {
  const ante = {
    key: "action:4",
    stamp: 4,
    by: 0,
    byWords: "Your deck",
    source: "Contract from Below",
    said: "Ante isn't played, so every copy of Contract from Below was taken out of your deck.",
    cards: [
      {
        id: "action:4:0",
        seat: 1,
        owner: 1,
        faceDown: false,
        known: true,
        name: "Contract from Below",
        printing: "LEA/96",
        kind: "other",
        types: "Sorcery",
        manaCost: "{B}",
        to: "out",
      },
    ],
  };

  it("one window: the shield medallion, 'Your deck · Contract from Below', the sentence, the card", () => {
    const c = open();
    // The board before it, then the one it came with (the pair a replay would play).
    send(state({ turn: 1, phase: "UPKEEP" }));
    send(state({ turn: 1, phase: "UPKEEP", action: ante }));
    const tray = c.querySelector<HTMLElement>(".gs-reveal")!;
    expect(tray).not.toBeNull();
    expect(tray.querySelector("[data-medallion='game']")).not.toBeNull();
    expect(tray.querySelector(".gs-reveal-by")!.textContent).toBe(
      "Your deck · Contract from Below",
    );
    expect(tray.textContent).toContain(ante.said);
    expect(tray.textContent).toContain("→ out of the game");
    expect(tray.textContent).not.toContain("A player");
    // No player moved anything: no replay on its medallion.
    expect(tray.querySelector(".gs-reveal-replay")).toBeNull();
    // Nothing at the top right.
    expect([...c.querySelectorAll(".pa-note")]).toHaveLength(0);
  });
});
