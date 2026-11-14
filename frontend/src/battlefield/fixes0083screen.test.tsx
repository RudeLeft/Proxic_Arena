// @vitest-environment jsdom

// Spec 0083 (F-0083-E, F-0083-G) -- the parts that are the game screen's:
// the Chancellor's opening-hand reveal in the report window (no grey
// notice), and L3, your own cast from your graveyard or exile rising out of
// that pile (checked live first: a cast chosen from the question's list rose
// from nowhere). The real game screen, its socket replaced, handed the boards
// the worker sends.

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

type Recorded = { element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions };
let animations: Recorded[] = [];
beforeEach(() => {
  animations = [];
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
  Element.prototype.animate = function (this: Element, frames: Keyframe[], options: unknown) {
    const record: Recorded = {
      element: this,
      frames,
      options: (typeof options === "number" ? { duration: options } : options) as never,
    };
    animations.push(record);
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
    ...over,
  };
}
const firebolt = {
  id: "card:54",
  seat: 1,
  owner: 1,
  name: "Firebolt",
  kind: "other",
  types: "Sorcery",
  tapped: false,
  faceDown: false,
  known: true,
  manaCost: "{R}",
};
const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;
const riseOf = (c: HTMLElement) => {
  const cast = c.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)")!;
  return animations.find(
    (a) => a.element === cast && String(a.frames[0]?.transform).includes("translate"),
  );
};

describe("F-0083-G · L3: your own cast from a pile rises out of it", () => {
  it("flashback from your graveyard: from the graveyard tile to the middle, as your own cast (pips kept)", () => {
    const c = open();
    send(state({ graveyard: [firebolt] }));
    animations = [];
    send(
      state({
        casting: [firebolt],
        moves: [
          { card: "card:54", from: { zone: "graveyard", seat: 1 }, to: { zone: "stack", seat: 1 } },
        ],
      }),
    );
    const rise = riseOf(c)!;
    expect(rise).toBeTruthy();
    const [dx, dy] = (String(rise.frames[0]!.transform).match(/-?[\d.]+/g) ?? []).map(Number);
    // The viewer's graveyard tile is on the rail at the right, low down.
    expect(dx).toBeGreaterThan(300);
    expect(dy).toBeGreaterThan(100);
    expect(rise.frames[0]!.opacity).toBe(0.6);
    // Your own: its cost pips, not the other player's face-down look.
    expect(c.querySelector(".gs-cast")!.getAttribute("data-from")).toBeNull();
  });

  it("an adventure's creature from your exile: from the exile tile", () => {
    const c = open();
    const giant = { ...firebolt, id: "card:58", name: "Bonecrusher Giant", types: "Creature" };
    send(state({ exile: [giant] }));
    animations = [];
    send(state({ casting: [giant] }));
    expect(riseOf(c)).toBeTruthy();
  });

  it("a cast from your hand chosen from the list is unchanged: no pile to rise from", () => {
    const c = open();
    send(state({ hand: [firebolt] }));
    animations = [];
    send(state({ casting: [firebolt] }));
    expect(riseOf(c)).toBeUndefined();
  });
});

describe("F-0083-E · the Chancellor's opening-hand reveal is a report window", () => {
  it("Alice is shown Bob's medallion, his card, one sentence -- no grey notice", () => {
    const c = open();
    send(
      state({
        turn: 1,
        reveal: {
          key: "reveal:1",
          stamp: 1,
          title: "Bob revealed Chancellor of the Annex from their opening hand",
          by: 2,
          source: "Chancellor of the Annex",
          said: "Bob revealed Chancellor of the Annex from their opening hand",
          cards: [
            { ...firebolt, id: "revealed:1:0", seat: 2, owner: 2, name: "Chancellor of the Annex" },
          ],
        },
      }),
    );
    const report = c.querySelector<HTMLElement>(".gs-reveal")!;
    expect(report).toBeTruthy();
    expect(report.textContent).toContain("Bob · Chancellor of the Annex");
    expect(report.textContent).toContain("from their opening hand");
    expect(c.textContent).not.toContain("Looking at");
  });
});
