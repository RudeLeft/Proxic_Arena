// @vitest-environment jsdom

// Spec 0125, item 2 (F-0125-C) -- "prevent the next N" on a player, on the
// plate (owner 2026-11-27, "On the life shield"): the pale badge touching the
// life shield at its lower right, growing in; on a hit it stopped, its count
// ticks down on the creature square's clock and it shrinks away at 0; a part
// of a hit stopped (Lava Axe's 5 into 3) ticks the same; when the turn ends
// it just goes. The real game screen, its socket replaced, handed the boards
// the worker sends (harness as fixes0089screen's), from both seats.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { reduceMatch, type MatchState } from "../match";
import { endLifeSteps } from "./lifeTicks";
import { PREVENT_STEP_MS, PREVENT_TICK_AT_MS } from "./CardBadges";
import { PREVENT_GROW_MS } from "./PreventBadge";

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

type Recorded = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: { onfinish: null | (() => void) };
};
let animations: Recorded[] = [];
let still = false;
beforeEach(() => {
  animations = [];
  still = false;
  endLifeSteps();
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? still : false,
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
    const animation = {
      cancel() {},
      finish() {},
      onfinish: null,
      oncancel: null,
      playState: "running",
      currentTime: 0,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 0, iterations: 1 }) },
      updatePlaybackRate: () => {},
    } as unknown as Animation & { onfinish: null | (() => void) };
    animations.push({
      element: this,
      frames,
      options: (typeof options === "number" ? { duration: options } : options) as never,
      animation,
    });
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
  matchId: "m-125",
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
const alice = { seat: 1, name: "Alice", life: 20, handCount: 3, libraryCount: 41 };
const bob = (over: Record<string, unknown> = {}) => ({
  seat: 2,
  name: "Bob",
  life: 20,
  handCount: 5,
  libraryCount: 44,
  ...over,
});
function state(seat: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  revision += 1;
  return {
    stateRevision: revision,
    gameEpoch: 1,
    turn: 4,
    phase: "MAIN1",
    activeSeat: 1,
    seat,
    players: [alice, bob()],
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
/** The Salve's "prevent the next 3" on Bob (his player entry, as the worker sends it). */
const shielded = (seat: number) => state(seat, { players: [alice, bob({ preventNext: 3 })] });
/** The Bolt resolves at Bob: all 3 stopped (amount 0, prevented 3, by "prevent-next"). */
const bolted = (seat: number) =>
  state(seat, {
    players: [alice, bob()],
    damage: {
      key: `damage:${revision + 1}`,
      hits: [
        {
          source: "card:90",
          target: { player: 2 },
          amount: 0,
          prevented: 3,
          by: "prevent-next",
        },
      ],
    },
  });
const plate = (c: HTMLElement, seat: number) =>
  c.querySelector<HTMLElement>(`.gs-seat[data-seat="${seat}"]`)!;
const badgeOf = (c: HTMLElement, seat: number) =>
  plate(c, seat).querySelector<HTMLElement>(".gs-prevent");
const runsOn = (el: Element | null) => animations.filter((a) => a.element === el);

function open(seat: number) {
  const view = render(
    <GameScreen match={match} me={seat === 1 ? "u-1" : "u-2"} onLeave={() => {}} />,
  );
  send(state(seat));
  return view;
}

describe("F-0125-C · a player's prevent-the-next-N badge on the life shield", () => {
  it("appears: grows in on Bob's plate with his count and words, from Alice's seat", () => {
    const c = open(1).container;
    expect(badgeOf(c, 2)).toBeNull();
    send(shielded(1));
    const badge = badgeOf(c, 2)!;
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("3");
    expect(badge.title).toBe("Prevent the next 3 damage to Bob this turn");
    // Beside the life shield of HIS plate, after it (the poison badge's place in the plate).
    expect(badge.parentElement).toBe(plate(c, 2));
    const grow = runsOn(badge);
    expect(grow.map((a) => a.options.duration)).toEqual([PREVENT_GROW_MS]);
    expect(grow[0]!.frames[0]).toMatchObject({ transform: "scale(0)" });
    // Never on Alice's plate.
    expect(badgeOf(c, 1)).toBeNull();
  });

  it("on Bob's own screen: the same badge on his plate, in his words (you)", () => {
    const c = open(2).container;
    send(shielded(2));
    const badge = badgeOf(c, 2)!;
    expect(badge.textContent).toBe("3");
    expect(badge.title).toBe("Prevent the next 3 damage to you this turn");
  });

  it("ticks on a hit it stopped, 3, 2, 1, 0 on the creature square's clock, then shrinks away", () => {
    const c = open(1).container;
    send(shielded(1));
    animations = [];
    send(bolted(1));
    const badge = badgeOf(c, 2)!;
    expect(badge.dataset["used"]).toBe("3-0");
    // All of it stopped: the pale shield over his life shield, as before (0101).
    expect(c.querySelector('[data-fight="ward"][data-of="player:2"]')).not.toBeNull();
    const steps = [...badge.querySelectorAll<HTMLElement>("[data-prevent-step]")];
    expect(steps.map((s) => s.textContent)).toEqual(["3", "2", "1", "0"]);
    expect(steps.map((s) => Number(runsOn(s)[0]!.options.delay))).toEqual([
      0,
      PREVENT_TICK_AT_MS,
      PREVENT_TICK_AT_MS + PREVENT_STEP_MS,
      PREVENT_TICK_AT_MS + 2 * PREVENT_STEP_MS,
    ]);
    // The last (0) stays until the badge has gone.
    expect(runsOn(steps[3]!)[0]!.options.fill).toBe("forwards");
    const shrink = runsOn(badge).find((a) =>
      a.frames.some((f) => f.transform === "scale(0)" && f.offset === 1),
    )!;
    expect(Number(shrink.options.delay)).toBe(PREVENT_TICK_AT_MS + 3 * PREVENT_STEP_MS);
    act(() => shrink.animation.onfinish?.());
    expect(badgeOf(c, 2)).toBeNull();
  });

  it("part of a hit (Lava Axe's 5 into 3): the same tick and the red −2 as any hit; no pale shield", () => {
    const c = open(2).container;
    send(shielded(2));
    animations = [];
    revision += 1;
    send({
      ...state(2, { players: [alice, bob({ life: 18 })] }),
      damage: {
        key: "damage:axe",
        hits: [
          { source: "card:91", target: { player: 2 }, amount: 0, prevented: 3, by: "prevent-next" },
          { source: "card:91", target: { player: 2 }, amount: 2 },
        ],
      },
      life: {
        key: "life:axe",
        changes: [{ player: 2, amount: 2, kind: "damage", source: "card:91" }],
      },
    });
    const badge = badgeOf(c, 2)!;
    expect(badge.dataset["used"]).toBe("3-0");
    expect([...badge.querySelectorAll("[data-prevent-step]")].map((s) => s.textContent)).toEqual([
      "3",
      "2",
      "1",
      "0",
    ]);
    // No pale shield over the life shield for the part stopped.
    expect(c.querySelector('[data-fight="ward"][data-of="player:2"]')).toBeNull();
  });

  it("the turn ends with it unused: no tick, it just shrinks away", () => {
    const c = open(1).container;
    send(shielded(1));
    animations = [];
    send(state(1, { turn: 5, activeSeat: 2 }));
    const badge = badgeOf(c, 2)!;
    expect(badge.dataset["used"]).toBeUndefined();
    expect(badge.dataset["gone"]).toBe("true");
    expect(badge.querySelectorAll("[data-prevent-step]").length).toBe(0);
    const shrink = runsOn(badge).find((a) => a.frames.some((f) => f.transform === "scale(0)"))!;
    expect(Number(shrink.options.delay ?? 0)).toBe(0);
    act(() => shrink.animation.onfinish?.());
    expect(badgeOf(c, 2)).toBeNull();
  });

  it("reduce motion: it shows and goes with no growing, ticking or shrinking", () => {
    still = true;
    const c = open(1).container;
    send(shielded(1));
    expect(badgeOf(c, 2)!.textContent).toBe("3");
    expect(runsOn(badgeOf(c, 2))).toEqual([]);
    send(bolted(1));
    expect(badgeOf(c, 2)).toBeNull();
  });
});
