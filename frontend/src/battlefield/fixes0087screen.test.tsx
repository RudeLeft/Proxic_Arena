// @vitest-environment jsdom

// Spec 0087 -- the parts that are the game screen's: the Graveyard and Exile
// tiles glow while they hold a card someone may still use from there, and a
// card cast from a fan beside a plate rises from where it stood in the fan
// (your own, the other player's, and a suspended card cast for free a board
// after it left the fan), as a card cast from the hand does. The real game
// screen, its socket replaced, handed the boards the worker sends.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  answers: [] as (string | null)[],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (_decisionId: number, actionId: string | null) => socket.answers.push(actionId),
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
  socket.answers = [];
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

const ALICE = { uses: [{ seat: 1, how: "cast" }] };
const giant = {
  ...firebolt,
  id: "card:58",
  name: "Bonecrusher Giant",
  kind: "creature",
  types: "Creature — Giant",
  power: 4,
  toughness: 3,
  manaCost: "{2}{R}",
};
/** The cast card's first frame: the centre it set off from (the screen is 1920 x 947). */
const startOf = (c: HTMLElement) => {
  const rise = riseOf(c);
  if (!rise) return null;
  // CastingCard draws it in the middle and starts it moved by (dx, dy).
  const [dx, dy] = (String(rise.frames[0]!.transform).match(/-?[\d.]+/g) ?? []).map(Number);
  return { x: 1920 / 2 + dx!, y: 947 / 2 + dy! };
};
// The column starts at x 1672 at this size; the fan stands just left of it.
const RAIL_X = 1920 - 0.1471 * (16 / 9) * 947;

describe("F-0087-A · the tiles glow while they hold a card someone may play from there", () => {
  it("Alice's Exile tile glows with Light Up the Stage's card in it; her Graveyard tile does not", () => {
    const c = open();
    send(state({ exile: [{ ...firebolt, ...ALICE }] }));
    const exile = c.querySelector<HTMLElement>('[data-zone-tile="viewer:exile"]')!;
    const grave = c.querySelector<HTMLElement>('[data-zone-tile="viewer:graveyard"]')!;
    expect(exile.classList.contains("gs-zone-playable")).toBe(true);
    expect(exile.getAttribute("aria-label")).toContain("may be played from it");
    expect(grave.classList.contains("gs-zone-playable")).toBe(false);
    // The fan stands on the table with it.
    expect(c.querySelector('[data-fan-card="card:54"]')).toBeTruthy();
    // The window ends: no glow, no fan.
    send(state({ exile: [firebolt] }));
    expect(exile.classList.contains("gs-zone-playable")).toBe(false);
    expect(c.querySelector('[data-fan-card="card:54"]')).toBeNull();
  });

  it("the other player's tiles glow in your view too (the fan is public)", () => {
    const c = open();
    send(
      state({ graveyard: [{ ...firebolt, seat: 2, owner: 2, uses: [{ seat: 2, how: "cast" }] }] }),
    );
    expect(
      c
        .querySelector('[data-zone-tile="opponent:graveyard"]')!
        .classList.contains("gs-zone-playable"),
    ).toBe(true);
  });

  it("a suspended card does not light its tile", () => {
    const c = open();
    send(state({ exile: [{ ...firebolt, uses: [{ seat: 1, how: "suspended" }] }] }));
    expect(
      c.querySelector('[data-zone-tile="viewer:exile"]')!.classList.contains("gs-zone-playable"),
    ).toBe(false);
  });
});

describe("F-0087-B · cast from the fan rises from where it stood there", () => {
  it("your own cast from the fan (the replay: nothing clicked) sets off from the fan, not the tile", () => {
    const c = open();
    send(state({ exile: [{ ...giant, ...ALICE }] }));
    animations = [];
    send(
      state({
        casting: [giant],
        moves: [
          { card: "card:58", from: { zone: "exile", seat: 1 }, to: { zone: "stack", seat: 1 } },
        ],
      }),
    );
    const at = startOf(c)!;
    expect(at).toBeTruthy();
    expect(at.x).toBeLessThan(RAIL_X);
    expect(at.x).toBeGreaterThan(RAIL_X - 200);
    expect(at.y).toBeGreaterThan(820);
  });

  it("the other player's, from their fan by their plate at the top", () => {
    const c = open();
    const theirs = { ...giant, seat: 2, owner: 2 };
    send(state({ exile: [{ ...theirs, uses: [{ seat: 2, how: "cast" }] }] }));
    animations = [];
    send(
      state({
        casting: [theirs],
        moves: [
          { card: "card:58", from: { zone: "exile", seat: 2 }, to: { zone: "stack", seat: 2 } },
        ],
      }),
    );
    const at = startOf(c)!;
    expect(at).toBeTruthy();
    expect(at.x).toBeLessThan(RAIL_X);
    expect(at.y).toBeLessThan(120);
  });
});

describe("F-0087-D · at zero the suspended card is cast for free from the fan", () => {
  it("it leaves the fan as its last counter goes, and is cast a board later, still from there", () => {
    const c = open();
    const vision = {
      ...firebolt,
      id: "card:44",
      name: "Ancestral Vision",
      manaCost: null,
      uses: [{ seat: 1, how: "suspended" }],
      counters: [{ name: "TIME", count: 0 }],
    };
    send(state({ exile: [vision] }));
    // Between: the card is on its way (in no list; the game tells its move
    // now), its trigger resolving: it keeps its place in the fan.
    send(
      state({
        exile: [],
        // Its own "cast it" trigger is still on the stack, sourced from it.
        stack: [
          {
            id: "stack:2",
            kind: "trigger",
            source: "card:44",
            controller: 1,
            name: "Ancestral Vision",
            description: "When the last time counter is removed, cast it",
            targets: [],
          },
        ],
        moves: [
          { card: "card:44", from: { zone: "exile", seat: 1 }, to: { zone: "stack", seat: 1 } },
        ],
      }),
    );
    expect(c.querySelector('[data-fan-card="card:44"]')).toBeTruthy();
    animations = [];
    // Then the spell is on the stack (no move this time): it rises from the fan.
    send(
      state({
        stack: [
          {
            id: "stack:3",
            kind: "spell",
            source: "card:44",
            controller: 1,
            name: "Ancestral Vision",
            description: "Ancestral Vision",
            targets: [],
          },
        ],
      }),
    );
    expect(c.querySelector('[data-fan-card="card:44"]')).toBeNull();
    // Face up the whole way (it was face up in the fan), not a back turning over.
    expect(c.querySelector(".gs-cast")!.getAttribute("aria-label")).toBe(
      "Being cast: Ancestral Vision",
    );
    const at = startOf(c)!;
    expect(at).toBeTruthy();
    expect(at.x).toBeLessThan(RAIL_X);
    expect(at.x).toBeGreaterThan(RAIL_X - 200); // the fan, not the hand
    expect(at.y).toBeGreaterThan(820);
  });
});

// Amendment 3 (owner 2026-11-15, option A: "no window, the glowing card is
// the cue") -- on your move, a card you may cast from a pile is not asked
// about in a window: its fan card breathes like a hand card and a click on
// it casts it. An option the board draws nothing for still opens the window.
describe("Amendment 3 · your move opens no window for a fan card; the click casts it", () => {
  const thinkTwice = {
    ...firebolt,
    id: "card:55",
    name: "Think Twice",
    types: "Instant",
    manaCost: "{1}{U}",
    ...ALICE,
  };
  const forest = {
    ...firebolt,
    id: "card:60",
    name: "Forest",
    kind: "land",
    types: "Basic Land — Forest",
    manaCost: null,
  };
  const yourMove = (options: Record<string, unknown>[]) =>
    act(() =>
      socket.onState!((previous) =>
        reduceMatch(previous, {
          type: "DECISION_REQUEST",
          decisionId: 21,
          actedForSeat: 1,
          authorisedSeat: 1,
          kind: "chooseSpellAbilityToPlay",
          stateVersion: revision,
          options,
        }),
      ),
    );
  const flashback = {
    actionId: "card:55/flashback",
    label: "Think Twice — Flashback {2}{U}",
    objectId: "card:55",
  };
  const land = { actionId: "card:60/play", label: "Play Forest", objectId: "card:60" };
  // The window's heading; the bar's own (words for a screen reader only) is not a window.
  const asked = () =>
    screen
      .queryAllByRole("heading", { name: /Your move/ })
      .filter((h) => !h.classList.contains("pa-visually-hidden"))[0] ?? null;

  it("no window; the fan card breathes; a real click on it sends its flashback", () => {
    const c = open();
    send(state({ graveyard: [thinkTwice], hand: [forest] }));
    yourMove([flashback, land]);
    expect(asked()).toBeNull();
    const card = c.querySelector<HTMLElement>('[data-fan-card="card:55"] [data-object-id]')!;
    expect(card.dataset["choosable"]).toBe("true");
    expect(card.classList.contains("bf-breathes")).toBe(true);
    expect(card.parentElement!.querySelector(".bf-breath")).toBeTruthy();
    fireEvent.click(card);
    expect(socket.answers).toEqual(["card:55/flashback"]);
  });

  it("one it cannot pay for now is dimmed, not breathing, as a hand card is", () => {
    const c = open();
    send(state({ graveyard: [thinkTwice], hand: [forest] }));
    yourMove([{ ...flashback, payable: false }, land]);
    expect(asked()).toBeNull();
    const card = c.querySelector<HTMLElement>('[data-fan-card="card:55"] [data-object-id]')!;
    expect(card.dataset["unpayable"]).toBe("true");
    expect(card.classList.contains("bf-breathes")).toBe(false);
  });

  it("an option the board draws nothing for (an emblem's) still opens the window", () => {
    open();
    send(state({ graveyard: [thinkTwice], hand: [forest] }));
    yourMove([
      flashback,
      land,
      { actionId: "emblem:3/a1", label: "Emblem — draw a card", objectId: "emblem:3" },
    ]);
    expect(asked()).toBeTruthy();
  });
});
