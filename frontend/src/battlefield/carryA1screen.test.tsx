// @vitest-environment jsdom

// P11-A1 (spec 0119, F-0119-E) -- moves lost while a spell is held up to be
// shown. Bob's spell is held on Alice's table (THEIR_SPELL_HOLD_MS); boards
// that arrive meanwhile are never drawn, and the board drawn after the hold
// now carries their moves (carry.ts movesCarried): a creature that died
// leaves with its death, a discarded card streams into its graveyard tile,
// and the tile's number waits for the card to land. The real game screen,
// its socket replaced, handed the boards the worker sends (fixes0102screen's
// harness).

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState, type Snapshot } from "../match";
import { endLifeSteps } from "./lifeTicks";
import { carryMoments } from "./carry";

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

// Spec 0105: the other player's hold is derived from the flight it covers.
const { GameScreen, THEIR_SPELL_HOLD_MS } = await import("./GameScreen");

type Recorded = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
};
let animations: Recorded[] = [];
let reduce = false;
beforeEach(() => {
  animations = [];
  socket.closed = [];
  reduce = false;
  endLifeSteps();
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduce && q.includes("reduce"),
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
    animations.push({
      element: this,
      frames,
      options: (typeof options === "number" ? { duration: options } : options) as never,
    });
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
  matchId: "m-a1",
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
    turn: 12,
    phase: "MAIN1",
    activeSeat: 2,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 11, handCount: 1, libraryCount: 43, graveyardCount: 2 },
      { seat: 2, name: "Bob", life: 16, handCount: 2, libraryCount: 44, graveyardCount: 0 },
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
const card = (id: string, seat: number, name: string, over: Record<string, unknown> = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  kind: "creature",
  types: "Creature",
  power: 2,
  toughness: 2,
  tapped: false,
  faceDown: false,
  known: true,
  ...over,
});

const murder = {
  id: "stack:9",
  kind: "spell",
  source: "card:80",
  controller: 2,
  name: "Murder",
  description: "",
  targets: [{ object: "card:70" }],
};
const agent = card("card:70", 1, "Wingshield Agent");
const opt = card("card:21", 1, "Opt", { kind: "instant", types: "Instant" });
const murderCard = card("card:80", 2, "Murder", { kind: "instant", types: "Instant" });
const died = {
  card: "card:70",
  from: { zone: "battlefield", seat: 1 },
  to: { zone: "graveyard", seat: 1 },
  why: "died",
};
const resolved = {
  card: "card:80",
  from: { zone: "stack", seat: 2 },
  to: { zone: "graveyard", seat: 2 },
};
const discarded = {
  card: "card:21",
  from: { zone: "hand", seat: 1 },
  to: { zone: "graveyard", seat: 1 },
  why: "discarded",
};

/** Alice's table: the Agent out, Opt in hand; Bob casts Murder at the Agent (held), then two boards inside the hold. */
function play(c: HTMLElement) {
  const two = [card("card:40", 1, "Shock"), card("card:41", 1, "Opt")];
  send(state({ battlefield: [agent], hand: [opt], graveyard: two }));
  send(state({ battlefield: [agent], hand: [opt], graveyard: two, stack: [murder] }));
  // Murder resolves: the Agent dies; a "discard a card" makes Alice discard Opt (never drawn: inside the hold).
  send(
    state({
      hand: [],
      moves: [resolved, died, discarded],
      players: [
        { seat: 1, name: "Alice", life: 11, handCount: 0, libraryCount: 43, graveyardCount: 4 },
        { seat: 2, name: "Bob", life: 16, handCount: 2, libraryCount: 44, graveyardCount: 1 },
      ],
      ...piles(),
    }),
  );
  // Bob moves on to combat, also inside the hold: the board drawn after it.
  send(
    state({
      phase: "COMBAT_DECLARE_ATTACKERS",
      hand: [],
      players: [
        { seat: 1, name: "Alice", life: 11, handCount: 0, libraryCount: 43, graveyardCount: 4 },
        { seat: 2, name: "Bob", life: 16, handCount: 2, libraryCount: 44, graveyardCount: 1 },
      ],
      ...piles(),
    }),
  );
  const before = animations.length;
  act(() => {
    vi.advanceTimersByTime(THEIR_SPELL_HOLD_MS + 50);
  });
  return { after: animations.slice(before), c };
}
function piles() {
  return {
    graveyard: [card("card:40", 1, "Shock"), card("card:41", 1, "Opt"), agent, opt, murderCard],
  };
}
const ghost = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-ghost-of="${id}"]`);

describe("F-0119-E · P11-A1: moves skipped during the spell hold are carried onto the board drawn", () => {
  it("the Agent that died inside the hold leaves with its own death (a ghost to the graveyard), no pop", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const { c } = play(view.container);
    const g = ghost(c, "card:70");
    expect(g).not.toBeNull();
    expect(g!.dataset.fate).toBe("defeated");
  });

  it("the Opt discarded inside the hold streams into the graveyard tile (never fades away), and the tile's number waits for it to land", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const { c, after } = play(view.container);
    const opt = ghost(c, "card:21");
    expect(opt).not.toBeNull();
    const stream = after.filter((a) => a.element === opt);
    expect(stream.length).toBeGreaterThan(0);
    // A stream keeps the card whole until it lands; the old pop faded it out where it was.
    for (const run of stream)
      expect(Number(run.frames[Math.floor(run.frames.length / 2)]?.opacity ?? 1)).toBeGreaterThan(
        0.9,
      );
    const lands = Math.max(
      ...stream.map((a) => Number(a.options.delay ?? 0) + Number(a.options.duration ?? 0)),
    );
    // The number: the old one held, the new one shown as the last card lands.
    const n = c.querySelector('[data-zone-tile="viewer:graveyard"] .gs-zone-n:not(.gs-zone-was)');
    const tick = after.filter((a) => a.element === n).at(-1);
    expect(tick).toBeDefined();
    expect(Number(tick!.options.duration)).toBe(lands);
  });

  it("carryMoments: a skipped board's moves, the last per card, never one the drawn board contradicts or moves again", () => {
    const parse = (s: Record<string, unknown>) =>
      reduceMatch({ board: null } as MatchState, { type: "MATCH_SNAPSHOT", state: s })
        .board as Snapshot;
    const skipped = parse(state({ graveyard: [agent], moves: [died, discarded] }));
    const exiled = {
      card: "card:70",
      from: { zone: "graveyard", seat: 1 },
      to: { zone: "exile", seat: 1 },
    };
    // Drawn: the Agent in the graveyard, Opt too: both moves carried, in order.
    const drawn = parse(state({ graveyard: [agent, opt] }));
    const carried = carryMoments(drawn, [skipped]);
    expect(carried.moves?.map((m) => m.card)).toEqual(["card:70", "card:21"]);
    // The drawn board has the Agent in exile (it moved again, untold): not carried.
    const contradicted = carryMoments(parse(state({ exile: [agent], graveyard: [opt] })), [
      skipped,
    ]);
    expect(contradicted.moves?.map((m) => m.card)).toEqual(["card:21"]);
    // A later skipped board moved it again: only its last move.
    const later = parse(state({ exile: [agent], moves: [exiled] }));
    const drawn2 = parse(state({ exile: [agent], graveyard: [opt] }));
    expect(carryMoments(drawn2, [skipped, later]).moves).toEqual([
      expect.objectContaining({ card: "card:21" }),
      expect.objectContaining({ card: "card:70", to: { zone: "exile", seat: 1 } }),
    ]);
    // Exiled, back, exiled again, all inside the hold: one leave, the last.
    const out = {
      card: "card:70",
      from: { zone: "battlefield", seat: 1 },
      to: { zone: "exile", seat: 1 },
    };
    const back = {
      card: "card:70",
      from: { zone: "exile", seat: 1 },
      to: { zone: "battlefield", seat: 1 },
    };
    const round = [
      parse(state({ exile: [agent], moves: [out] })),
      parse(state({ battlefield: [agent], moves: [back] })),
      parse(state({ exile: [agent], moves: [out] })),
    ];
    const twice = carryMoments(parse(state({ exile: [agent] })), round);
    expect(twice.moves).toHaveLength(1);
    // The drawn board moves it itself: its own move only, nothing twice.
    const own = parse(state({ exile: [agent], graveyard: [opt], moves: [exiled] }));
    expect(carryMoments(own, [skipped]).moves?.filter((m) => m.card === "card:70")).toHaveLength(1);
    // A board drawn already (an older or the same revision) carries nothing.
    expect(carryMoments(skipped, [drawn])).toBe(skipped);
  });
});
