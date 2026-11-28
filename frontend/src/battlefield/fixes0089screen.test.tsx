// @vitest-environment jsdom

// Spec 0089 -- the parts that are the game screen's: the end of the game
// (F-0089-A: the banner held until the last hit has landed, the loser's
// shield breaking or the poison ring closing, the winner's plate flaring),
// the opening-hand window lasting the whole opening (F-0089-B), the turn
// ladder gliding back for an extra combat and its report (F-0089-C). The
// real game screen, its socket replaced, handed the boards the worker sends.
// (Harness as fixes0088screen's.)

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { EMPTY_MATCH, reduceMatch, type MatchState } from "../match";
import { BANNER_AT, BREAK_AT, FLARE_AT, endReady, endingOf } from "./gameEnd";
import { KEEP_MS, REDEAL_AT, dealAt } from "./opening";
import { endLifeSteps } from "./lifeTicks";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  closed: [] as number[],
  answered: [] as string[],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (_id: number, actionId: string) => socket.answered.push(actionId),
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

type Recorded = {
  element: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: { onfinish: null | (() => void) };
};
let animations: Recorded[] = [];
beforeEach(() => {
  animations = [];
  socket.closed = [];
  socket.answered = [];
  endLifeSteps();
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
  matchId: "m-89",
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
function message(m: Record<string, unknown>) {
  act(() => socket.onState!((previous) => reduceMatch(previous, m)));
}
const ended = (over: Record<string, unknown>) =>
  ({
    ...match,
    status: "ENDED",
    outcome: {
      kind: "WINNER",
      winningSeat: 1,
      endedOnTurn: 8,
      reason: null,
      concededSeat: null,
      ...over,
    },
  }) as unknown as MatchView;
const plate = (c: HTMLElement, seat: number) =>
  c.querySelector<HTMLElement>(`.gs-seat[data-seat="${seat}"]`)!;
const runsOn = (el: Element | null) => animations.filter((a) => a.element === el);
const bob = (over: Record<string, unknown> = {}) => ({
  seat: 2,
  name: "Bob",
  life: 3,
  handCount: 5,
  libraryCount: 44,
  ...over,
});
const alice = { seat: 1, name: "Alice", life: 20, handCount: 3, libraryCount: 41 };

// --- F-0089-A: the end of the game ---------------------------------------------------------------

describe("F-0089-A · the game ends: banner after the last hit; the shield breaks; the winner flares", () => {
  it("the result is read from the game's outcome, never from life totals", () => {
    const board = reduceMatch(EMPTY_MATCH, {
      type: "MATCH_SNAPSHOT",
      state: state({ players: [alice, bob({ life: 5 })] }),
    }).board!;
    const outcome = (over: Record<string, unknown>) =>
      ({
        kind: "WINNER",
        winningSeat: 1,
        endedOnTurn: 8,
        reason: null,
        concededSeat: null,
        ...over,
      }) as never;
    expect(endingOf(outcome({ lossReason: "LifeReachedZero" }), board)).toEqual({
      loser: 2,
      winner: 1,
      how: "life",
    });
    expect(endingOf(outcome({ lossReason: "Poisoned" }), board)?.how).toBe("poison");
    expect(endingOf(outcome({ concededSeat: 2, lossReason: "LifeReachedZero" }), board)?.how).toBe(
      "conceded",
    );
    expect(endingOf(outcome({ lossReason: "Milled" }), board)?.how).toBe("other");
    expect(endingOf({ kind: "DRAW", winningSeat: null } as never, board)).toBeNull();
    // The count must read what killed him: a board still at 5 is not the end yet.
    expect(endReady({ loser: 2, winner: 1, how: "life" }, board, true)).toBe(false);
    expect(endReady({ loser: 2, winner: 1, how: "conceded" }, board, true)).toBe(true);
    expect(endReady({ loser: 2, winner: 1, how: "conceded" }, board, false)).toBe(false);
  });

  it("lethal Bolt: no banner while the hit is still to land; then the shield breaks, the winner flares, the banner fades in", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    const bolt = {
      id: "stack:4",
      kind: "spell",
      source: "card:9",
      card: "card:9",
      controller: 1,
      name: "Lightning Bolt",
      description: "",
      targets: [{ player: 2 }],
    };
    send(state({ phase: "MAIN1", players: [alice, bob()], stack: [bolt] }));
    send(
      state({
        phase: "MAIN1",
        players: [alice, bob({ life: -1 })],
        life: {
          key: "life:9",
          changes: [{ player: 2, kind: "damage", amount: 3, source: "card:9" }],
        },
        moves: [
          { card: "card:9", from: { zone: "stack", seat: 1 }, to: { zone: "graveyard", seat: 1 } },
        ],
        graveyard: [
          {
            id: "card:9",
            seat: 1,
            owner: 1,
            name: "Lightning Bolt",
            kind: "instant",
            types: "Instant",
            tapped: false,
            faceDown: false,
            known: true,
          },
        ],
      }),
    );
    view.rerender(
      <GameScreen match={ended({ lossReason: "LifeReachedZero" })} me="u-1" onLeave={() => {}} />,
    );
    // Held: the life clock is still running (the Bolt's 3 has not landed).
    expect(c.querySelector(".gs-over")).toBeNull();
    expect(plate(c, 2).classList.contains("gs-seat-lost")).toBe(false);
    // The last hit lands (the clock ends): the end plays.
    const clock = animations.find((a) => a.options.id === "life-clock")!;
    expect(clock).toBeTruthy();
    const before = performance.now();
    act(() => clock.animation.onfinish?.());
    expect(plate(c, 2).classList.contains("gs-seat-lost")).toBe(true);
    expect(plate(c, 2).dataset.end).toBe("lost:life");
    const shards = [...plate(c, 2).querySelectorAll(".gs-life-shard")];
    expect(shards).toHaveLength(3);
    // Each delay is counted from the end's start, so it is its moment less the
    // time that has passed since. That time is measured, not guessed: a fixed
    // 30 ms allowance failed under a loaded full run (776.8 > 783, 2026-11-22).
    const passed = performance.now() - before + 1;
    for (const shard of shards) {
      const delay = Number(runsOn(shard)[0]?.options.delay);
      expect(delay).toBeGreaterThan(BREAK_AT - passed);
      expect(delay).toBeLessThanOrEqual(BREAK_AT);
    }
    expect(plate(c, 1).classList.contains("gs-seat-won")).toBe(true);
    const flare = Number(runsOn(plate(c, 1).querySelector(".gs-seat-flare"))[0]?.options.delay);
    expect(flare).toBeGreaterThan(FLARE_AT - (performance.now() - before + 1));
    expect(flare).toBeLessThanOrEqual(FLARE_AT);
    // The banner: there, faded in at BANNER_AT, not clickable until it is in.
    const enter = c.querySelector<HTMLElement>(".gs-over-enter")!;
    expect(enter.querySelector(".gs-over")).toBeTruthy();
    expect(enter.dataset.entering).toBe("true");
    const fade = runsOn(enter)[0]!;
    // Measured too: a fixed 50 ms allowance has the same flaw under load.
    expect(Number(fade.options.delay)).toBeGreaterThan(
      BANNER_AT - (performance.now() - before + 1),
    );
    expect(Number(fade.options.delay)).toBeLessThanOrEqual(BANNER_AT);
    act(() => fade.animation.onfinish?.());
    expect(enter.dataset.entering).toBeUndefined();
  });

  it("a tenth poison counter: the ring closes and glows; the shield only dims (no break)", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({ players: [alice, bob({ life: 20, counters: [{ name: "POISON", count: 10 }] })] }));
    const before = performance.now();
    view.rerender(
      <GameScreen match={ended({ lossReason: "Poisoned" })} me="u-1" onLeave={() => {}} />,
    );
    expect(plate(c, 2).dataset.end).toBe("lost:poison");
    expect(plate(c, 2).querySelector(".gs-poison")!.classList.contains("gs-poison-closed")).toBe(
      true,
    );
    expect(plate(c, 2).querySelectorAll(".gs-life-shard")).toHaveLength(0);
    // The ring's delay is its moment less the time passed since the end began
    // (measured: a fixed 30 ms failed under load, "392.52 > 408", 2026-11-20).
    const ring = Number(runsOn(plate(c, 2).querySelector(".gs-poison"))[0]?.options.delay);
    expect(ring).toBeGreaterThan(BREAK_AT - (performance.now() - before + 1));
    expect(ring).toBeLessThanOrEqual(BREAK_AT);
    expect(c.querySelector(".gs-over")).toBeTruthy();
  });

  it("a concession: the plate dims at once; no hit, nothing breaks", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({ players: [alice, bob({ life: 20 })] }));
    view.rerender(<GameScreen match={ended({ concededSeat: 2 })} me="u-1" onLeave={() => {}} />);
    expect(plate(c, 2).dataset.end).toBe("lost:conceded");
    expect(plate(c, 2).querySelectorAll(".gs-life-shard")).toHaveLength(0);
    const dims = runsOn(plate(c, 2)).filter((a) =>
      String(a.frames.at(-1)!.filter).includes("brightness(0.58)"),
    );
    expect(Number(dims[0]?.options.delay)).toBeLessThan(30);
  });

  it("a game already over when the page opens: the end state and the banner at once, nothing plays", () => {
    // The page opened as the game ended: the result came before its first board.
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    view.rerender(
      <GameScreen match={ended({ lossReason: "LifeReachedZero" })} me="u-1" onLeave={() => {}} />,
    );
    const c = view.container;
    send(state({ players: [alice, bob({ life: -2 })] }));
    expect(c.querySelector(".gs-over")).toBeTruthy();
    expect(c.querySelector<HTMLElement>(".gs-over-enter")!.dataset.entering).toBeUndefined();
    expect(plate(c, 2).classList.contains("gs-seat-lost")).toBe(true);
    expect(runsOn(plate(c, 2).querySelector(".gs-life-shard"))).toHaveLength(0);
  });

  it("reduce motion: the end states and the banner, no movement", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({ players: [alice, bob({ life: 0 })] }));
    view.rerender(
      <GameScreen match={ended({ lossReason: "LifeReachedZero" })} me="u-1" onLeave={() => {}} />,
    );
    expect(c.querySelector(".gs-over")).toBeTruthy();
    expect(plate(c, 2).classList.contains("gs-seat-lost")).toBe(true);
    expect(plate(c, 1).classList.contains("gs-seat-won")).toBe(true);
    expect(runsOn(plate(c, 1).querySelector(".gs-seat-flare"))).toHaveLength(0);
  });
});

// --- F-0089-C: an extra combat ---------------------------------------------------------------------

describe("F-0089-C · an extra combat: the report window, the ladder's light gliding back", () => {
  it("Relentless Assault: Main 2 back to Combat glides (not placed); the window says so with the card", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    // Amendment 1: the window is the other player's -- Alice watching Bob's extra combat.
    send(state({ turn: 8, phase: "MAIN2", activeSeat: 2 }));
    expect(c.querySelector(".gs-steps")!.getAttribute("data-step")).toBe("Main 2");
    send(
      state({
        turn: 8,
        phase: "COMBAT_BEGIN",
        activeSeat: 2,
        action: {
          key: "action:12",
          stamp: 12,
          by: 2,
          source: "Relentless Assault",
          said: "Extra combat: Bob attacks again.",
          cards: [
            {
              id: "action:12:0",
              seat: 2,
              name: "Relentless Assault",
              kind: "other",
              types: "Sorcery",
              known: true,
              faceDown: false,
              to: "graveyard",
            },
          ],
        },
      }),
    );
    expect(c.querySelector(".gs-steps")!.getAttribute("data-step")).toBe("Combat");
    expect(c.querySelector(".gs-steps-rail")!.classList.contains("gs-steps-still")).toBe(false);
    const window_ = c.querySelector(".gs-reveal")!;
    expect(window_.textContent).toContain("Extra combat: Bob attacks again.");
    expect(window_.textContent).toContain("Relentless Assault");
  });
});

// --- F-0089-B: one opening-hand window for the whole opening ---------------------------------------

describe("F-0089-B · the opening-hand window deals, sweeps back, deals again and lasts the whole opening", () => {
  let asked = 100;
  const hand = (from: number) =>
    Array.from({ length: 7 }, (_, i) => ({
      id: `card:${from + i}`,
      seat: 1,
      owner: 1,
      name: `Island ${i}`,
      kind: "land",
      types: "Basic Land — Island",
      tapped: false,
      faceDown: false,
      known: true,
    }));
  const decide = (
    kind: string,
    options: { actionId: string; label: string; objectId?: string }[],
  ) =>
    message({
      type: "DECISION_REQUEST",
      decisionId: ++asked,
      actedForSeat: 1,
      stateVersion: revision,
      kind,
      options: options.map((o) => ({ objectId: null, ...o })),
      prompt: kind === "tuckCardsViaMulligan" ? "Choose a card to put back (1 to go)." : "Keep?",
      mandatory: true,
    });
  const opening = (over: Record<string, unknown>) =>
    state({ turn: 0, phase: "", players: [alice, { ...bob(), life: 20 }], ...over });

  it("dealt from the tile; Mulligan keeps the window, sweeps the seven back and deals seven again; Keep closes it", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    const first = hand(10);
    send(opening({ hand: [] }));
    send(
      opening({
        hand: first,
        moves: first.map((x) => ({
          card: x.id,
          from: { zone: "library", seat: 1 },
          to: { zone: "hand", seat: 1 },
        })),
      }),
    );
    decide("mulliganKeepHand", [
      { actionId: "mulligan:keep", label: "Keep" },
      { actionId: "mulligan:again", label: "Mulligan" },
    ]);
    const win = c.querySelector<HTMLElement>(".gs-opening")!;
    expect(win).toBeTruthy();
    // Your hand is in the window: the table's hand is veiled.
    expect(c.querySelector(".bf-board")!.classList.contains("bf-veil-hand")).toBe(true);
    // Dealt from the Library tile, a card at a time, each turning face up.
    const dealt = [...win.querySelectorAll(".gs-opening-card")].map((el) => runsOn(el)[0]!);
    expect(dealt.map((r) => Number(r.options.delay))).toEqual(
      first.map((_, i) => dealAt(i, false)),
    );
    // Mulligan: the window stays (waiting) through the answer's receipt.
    fireEvent.click(
      [...win.querySelectorAll("button")].find((b) => /Mulligan/.test(b.textContent ?? ""))!,
    );
    expect(socket.answered).toEqual(["mulligan:again"]);
    message({ type: "DECISION_ACCEPTED", decisionId: asked });
    expect(c.querySelector(".gs-opening")).toBe(win);
    expect(win.dataset.waiting).toBe("true");
    // The new seven: the old swept back as ghosts, the new dealt after the riffle.
    const second = hand(30);
    send(
      opening({
        hand: second,
        moves: [
          ...first.map(() => ({
            from: { zone: "hand", seat: 1 },
            to: { zone: "library", seat: 1 },
            where: "shuffled",
          })),
          ...second.map((x) => ({
            card: x.id,
            from: { zone: "library", seat: 1 },
            to: { zone: "hand", seat: 1 },
          })),
        ],
        shuffles: [1],
      }),
    );
    expect(win.querySelectorAll(".gs-opening-leaving")).toHaveLength(7);
    const redealt = [...win.querySelectorAll(".gs-opening-hand .gs-opening-card")].map(
      (el) => runsOn(el).at(-1)!,
    );
    expect(redealt.map((r) => Number(r.options.delay))).toEqual(
      second.map((_, i) => REDEAL_AT + dealAt(i, false)),
    );
    // The put-back question: still the same window.
    decide(
      "tuckCardsViaMulligan",
      second.map((x) => ({ actionId: `tuck:${x.id}`, label: x.name, objectId: x.id })),
    );
    expect(c.querySelector(".gs-opening")).toBe(win);
    // Keep at the end: the window closes, the hand gliding down; then it is gone.
    decide("mulliganKeepHand", [{ actionId: "mulligan:keep", label: "Keep" }]);
    fireEvent.click(
      [...win.querySelectorAll("button")].find((b) => /^Keep/.test(b.textContent ?? ""))!,
    );
    message({ type: "DECISION_ACCEPTED", decisionId: asked });
    expect(c.querySelector(".gs-opening")!.classList.contains("gs-opening-closing")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(KEEP_MS + 10);
    });
    expect(c.querySelector(".gs-opening")).toBeNull();
    expect(c.querySelector(".bf-board")!.classList.contains("bf-veil-hand")).toBe(false);
  });
});
