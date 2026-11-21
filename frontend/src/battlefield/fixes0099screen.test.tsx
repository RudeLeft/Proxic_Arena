// @vitest-environment jsdom

// Spec 0099 (Q1, F-0099-B) -- your own spell cast out of your library when it
// was not the shown top card (Panglacial Wurm, found by a search) rises from
// your Library tile, never from nowhere; a shown top card still rises from
// the small card on the tile (spec 0088). The real game screen, its socket
// replaced, handed the boards the worker sends.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { libraryTopBox } from "./LibraryTop";
import { geometry } from "./layout";
import { anchors, boxAt } from "./motion";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  closed: [] as number[],
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
      reportsClosed: (upTo: number) => socket.closed.push(upTo),
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
  socket.closed = [];
  window.sessionStorage.clear();
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
  matchId: "m-99",
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
    turn: 7,
    phase: "END_OF_TURN",
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
const open = () => render(<GameScreen match={match} me="u-1" onLeave={() => {}} />).container;

const g = geometry({ width: 1920, height: 947 });
const card = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  seat: 1,
  owner: 1,
  name,
  kind: "creature",
  types: "Creature — Wurm",
  tapped: false,
  faceDown: false,
  known: true,
  manaCost: "{5}{G}{G}",
  power: 9,
  toughness: 5,
  ...extra,
});
const fromLibrary = (id: string) => [
  { card: id, from: { zone: "library", seat: 1 }, to: { zone: "stack", seat: 1 } },
];
/** Where the casting card's rise set off (its centre on the page), or null: no rise at all. */
function riseStart(c: HTMLElement): { x: number; y: number } | null {
  const cast = c.querySelector<HTMLElement>(".gs-cast:not(.gs-cast-leaving)");
  expect(cast).toBeTruthy();
  const rise = animations.find(
    (a) => a.element === cast && String(a.frames[0]?.transform).includes("translate"),
  );
  if (!rise) return null;
  const [dx, dy] = (String(rise.frames[0]!.transform).match(/-?[\d.]+/g) ?? []).map(Number);
  // From its place (spec 0110: the stack's next slot), moved by (dx, dy).
  return {
    x: parseFloat(cast!.style.left) + parseFloat(cast!.style.width) / 2 + dx!,
    y: parseFloat(cast!.style.top) + parseFloat(cast!.style.height) / 2 + dy!,
  };
}
const near = (at: { x: number; y: number }, box: { x: number; y: number; w: number; h: number }) =>
  Math.abs(at.x - (box.x + box.w / 2)) < box.w && Math.abs(at.y - (box.y + box.h / 2)) < box.h;

describe("F-0099-B · your card cast out of your library rises from your Library tile", () => {
  it("found by a search (Panglacial Wurm): from the Library tile, not the middle of the table", () => {
    const c = open();
    send(state({ phase: "MAIN1" }));
    animations = [];
    const wurm = card("card:62", "Panglacial Wurm");
    send(state({ phase: "MAIN1", casting: [wurm], moves: fromLibrary("card:62") }));
    const at = riseStart(c);
    expect(at).not.toBeNull();
    expect(near(at!, boxAt(anchors(g)["viewer:library"], g))).toBe(true);
    expect(Math.hypot(at!.x - 1920 / 2, at!.y - 947 / 2)).toBeGreaterThan(300);
  });

  it("the shown top card (Bolas's Citadel) still rises from the small card on the tile (0088)", () => {
    const c = open();
    const bolt = card("card:75", "Lightning Bolt", {
      kind: "other",
      types: "Instant",
      manaCost: "{R}",
      power: null,
      toughness: null,
      uses: [{ seat: 1, how: "cast" }],
    });
    send(state({ phase: "MAIN1", libraryTop: [bolt] }));
    animations = [];
    send(state({ phase: "MAIN1", casting: [bolt], moves: fromLibrary("card:75") }));
    const at = riseStart(c);
    expect(at).not.toBeNull();
    expect(near(at!, libraryTopBox(g, "viewer"))).toBe(true);
  });
});
