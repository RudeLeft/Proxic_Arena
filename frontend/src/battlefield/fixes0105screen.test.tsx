// @vitest-environment jsdom

// Spec 0105 -- the stack always shows. The real game screen, its socket
// replaced, handed the boards the worker sends (check-stack-rests.py's
// shapes: a stack entry's `rest` {ms, arriveMs}).
//
// F-0105-E: the ring appears once the stack card has landed on this screen,
// its animation lasting `ms` minus this seat's arrival; the stack card stays
// until the next board, whatever the clock does.
// F-0105-G: Alice's own Grizzly Bears, resting, flies to the stack (never
// straight onto the battlefield) and then glides out of the stack card.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { RESTING_WORDS } from "./stops";

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
      reportsClosed: () => {},
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

const { GameScreen } = await import("./GameScreen");
const { STACK_IN_MS } = await import("./Board");

type Recorded = { element: Element; frames: Keyframe[]; animation: Animation };
let animations: Recorded[] = [];
let clock = 0;
beforeEach(() => {
  animations = [];
  clock = 1000;
  (window as unknown as { __proxicStackRests?: unknown[] }).__proxicStackRests = [];
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
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
  Element.prototype.animate = function (this: Element, frames: Keyframe[]) {
    const animation = {
      cancel() {},
      finish() {},
      commitStyles() {},
      onfinish: null as null | (() => void),
      oncancel: null,
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0, iterations: 1 }), updateTiming() {} },
      updatePlaybackRate: () => {},
    } as unknown as Animation;
    animations.push({ element: this, frames, animation });
    return animation;
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
  matchId: "m-105",
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
function state(seat: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 5,
    phase: "MAIN1",
    activeSeat: 1,
    prioritySeat: 1,
    seat,
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
const open = (me: string) =>
  render(<GameScreen match={match} me={me} onLeave={() => {}} />).container;
const advance = (ms: number) => {
  clock += ms;
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const card = (id: string, seat: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  seat,
  owner: seat,
  name,
  kind: "creature",
  types: `Creature — ${name}`,
  tapped: false,
  faceDown: false,
  known: true,
  power: 2,
  toughness: 2,
  manaCost: "{1}{G}",
  art: null,
  ...extra,
});
const ring = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-rest-ring]");
const record = () =>
  (
    window as unknown as {
      __proxicStackRests: { landed: number; seen: number; left: number | null }[];
    }
  ).__proxicStackRests;

// --- F-0105-E ---------------------------------------------------------------------------------

describe("F-0105-E · the ring runs from landing; the stack card leaves with the next board", () => {
  const victim = {
    id: "stack:6",
    kind: "spell",
    source: "card:30",
    controller: 1,
    name: "Victim of Night",
    description: "Victim of Night - Destroy target non-Vampire, non-Werewolf, non-Zombie creature.",
    manaCost: "{B}{B}",
    targets: [{ object: "card:41" }],
    rest: { ms: 5900, arriveMs: 3400 },
  };
  const bears = card("card:41", 2, "Grizzly Bears");

  it("Bob's screen: no ring while the card is arriving; then one lasting the rest less the arrival", () => {
    const c = open("u-2");
    send(state(2, { battlefield: [bears] }));
    clock = 2000;
    send(state(2, { battlefield: [bears], stack: [victim] }));
    expect(c.querySelector('[data-object-id="stack:6"]')).toBeTruthy();
    expect(ring(c)).toBeNull();
    // It slides in (STACK_IN_MS, paced by spec 0106) and has landed this long after the board came.
    const landing = STACK_IN_MS + 40;
    advance(landing);
    const r = ring(c);
    expect(r).toBeTruthy();
    expect(r!.dataset["restMs"]).toBe(`${5900 - landing}`);
    expect(r!.querySelector<SVGCircleElement>(".gs-coin-ring")!.style.animationDuration).toBe(
      `${5900 - landing}ms`,
    );
    // No words, nothing to click, no pause sign.
    expect(r!.getAttribute("aria-hidden")).toBe("true");
    expect(r!.textContent).toBe("");
    expect(r!.closest("button")).toBeNull();
    expect(r!.querySelector(".gs-coin-pause")).toBeNull();
    // The act line says it, in the canvas's words.
    advance(500);
    expect(c.textContent).toContain(RESTING_WORDS);
    // Long past the rest, no board: the game has not resolved it, so neither has the screen.
    advance(20000);
    expect(c.querySelector('[data-object-id="stack:6"]')).toBeTruthy();
    expect(ring(c)).toBeTruthy();
    // The page's own record (the real-click game reads it).
    expect(record()).toHaveLength(1);
    expect(record()[0]!.landed - record()[0]!.seen).toBe(landing);
    expect(record()[0]!.left).toBeNull();
    // The resolution's board: gone.
    send(state(2, { graveyard: [card("card:30", 1, "Victim of Night", { kind: "other" })] }));
    advance(2000);
    expect(c.querySelector('[data-object-id="stack:6"]')).toBeNull();
    expect(ring(c)).toBeNull();
    expect(record()[0]!.left).not.toBeNull();
    expect(c.textContent).not.toContain(RESTING_WORDS);
  });

  it("no rest, no ring: an entry without `rest` never wears one", () => {
    const c = open("u-2");
    send(state(2, { battlefield: [bears] }));
    const plain = { ...victim, rest: undefined };
    send(state(2, { battlefield: [bears], stack: [plain] }));
    advance(1000);
    expect(c.querySelector('[data-object-id="stack:6"]')).toBeTruthy();
    expect(ring(c)).toBeNull();
    expect(c.textContent).not.toContain(RESTING_WORDS);
  });

  it("only the top of the stack wears the ring", () => {
    const c = open("u-2");
    send(state(2, { battlefield: [bears] }));
    // (The worker marks the top alone; the page draws the top's ring alone either way.)
    const under = { ...victim, id: "stack:5", name: "Lightning Bolt" };
    send(state(2, { battlefield: [bears], stack: [victim, under] }));
    advance(1000);
    expect(c.querySelectorAll("[data-rest-ring]")).toHaveLength(1);
    expect(ring(c)!.dataset["restRing"]).toBe("stack:6");
  });
});

// --- F-0105-G ---------------------------------------------------------------------------------

describe("F-0105-G · a permanent spell with a rest flies to the stack, then glides out of it", () => {
  const bears = card("card:5", 1, "Grizzly Bears");
  const onStack = {
    id: "stack:4",
    kind: "spell",
    source: "card:5",
    controller: 1,
    name: "Grizzly Bears",
    description: "Grizzly Bears",
    manaCost: "{1}{G}",
    targets: [],
    rest: { ms: 5900, arriveMs: 3400 },
  };

  it("Alice's Bears: to the stack (not the battlefield), ring, then from the stack card's box", () => {
    const c = open("u-1");
    send(state(1, { hand: [bears] }));
    send(state(1, { casting: [bears] }));
    send(
      state(1, {
        stack: [onStack],
        moves: [
          { card: "card:5", from: { zone: "hand", seat: 1 }, to: { zone: "stack", seat: 1 } },
        ],
      }),
    );
    const leaving = c.querySelector<HTMLElement>(".gs-cast-leaving");
    expect(leaving).toBeTruthy();
    // Not flown onto the battlefield (owner 2026-11-01 item 2's straight landing).
    expect(leaving!.dataset["landing"]).toBeUndefined();
    advance(200); // DECIDE_MS: it sets off
    const flight = animations.filter((a) => a.element === leaving).at(-1);
    expect(flight).toBeTruthy();
    // On the stack it fades into the small card there (0.35); on the battlefield it would land solid (1).
    expect(flight!.frames.at(-1)!["opacity"]).toBe(0.35);
    expect(ring(c)).toBeNull();
    act(() => {
      flight!.animation.onfinish?.call(
        flight!.animation,
        new Event("finish") as AnimationPlaybackEvent,
      );
    });
    advance(400);
    expect(ring(c)).toBeTruthy();
    const slot = c
      .querySelector<HTMLElement>('[data-object-id="stack:4"]')!
      .closest<HTMLElement>(".bf-stack-slot")!;
    const scale = /scale\(([^)]+)\)/.exec(slot.style.transform)![1]!;
    const before = animations.length;
    // Resolved: on the battlefield.
    send(
      state(1, {
        battlefield: [bears],
        moves: [
          {
            card: "card:5",
            from: { zone: "stack", seat: 1 },
            to: { zone: "battlefield", seat: 1 },
          },
        ],
      }),
    );
    advance(50);
    const glides = animations
      .slice(before)
      .filter(
        (a) =>
          a.element.querySelector?.('[data-object-id="card:5"]') ||
          (a.element as HTMLElement).dataset?.["objectId"] === "card:5",
      );
    expect(glides.length).toBeGreaterThan(0);
    const first = String(glides[0]!.frames[0]!["transform"]);
    // It starts at the stack card's size: out of the stack card, not faded in where it lands.
    expect(first).toContain(`scale(${scale})`);
    expect(c.querySelector('.gs-cast-leaving[data-landing="true"]')).toBeNull();
  });
});
