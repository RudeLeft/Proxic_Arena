// @vitest-environment jsdom

// Spec 0120 (F-0120-H) -- the hard pause on the real game screen, its socket
// replaced and handed the server's messages as connectMatch hands them
// (`arrive`): the look 1.5 s after MATCH_PAUSED, at once on a move tried (and
// nothing sent); the response window's countdown stopped and started again at
// 5; PAUSED refused quietly; "Bob is back" while catching up and for 1 s
// after; a click then only ends the look; no flash on a flap within 10 s; the
// away window at once when its time has come (the budget); the plate's
// "Dropped" then "Away · N min"; spectators the words and the sign only; this
// page's own line down. (Harness as catchUpScreen's.)

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { arrive, type Arrival, type MatchState } from "../match";
import { endLifeSteps } from "./lifeTicks";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  closed: [] as number[],
  caughtUp: 0,
  answers: [] as (string | null)[],
}));
vi.mock("../match", async (original) => ({
  ...(await original<typeof import("../match")>()),
  connectMatch: (_url: string, onState: (apply: (previous: MatchState) => MatchState) => void) => {
    socket.onState = onState;
    return {
      answer: (_id: number, actionId: string | null) => socket.answers.push(actionId),
      search: () => {},
      concede: () => {},
      endForAway: () => {},
      reportsClosed: (upTo: number) => socket.closed.push(upTo),
      caughtUp: () => {
        socket.caughtUp += 1;
      },
      close: () => {},
    };
  },
}));
vi.mock("../shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: EMPTY_LOBBY, setLobby: () => {}, send: () => {} }),
}));

// Spec 0105: the other player's hold is derived from the flight it covers.
const { GameScreen } = await import("./GameScreen");

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
  socket.caughtUp = 0;
  socket.answers = [];
  reduce = false;
  endLifeSteps();
  window.sessionStorage.clear();
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
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
  matchId: "m-pause",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { seatNumber: 1, userId: "u-1", displayName: "Alice" },
    { seatNumber: 2, userId: "u-2", displayName: "Bob" },
  ],
  outcome: null,
} as unknown as MatchView;

let revision = 0;
function send(state: Record<string, unknown>, how: Arrival = {}) {
  act(() =>
    socket.onState!((previous) => arrive(previous, { type: "MATCH_SNAPSHOT", state }, how)),
  );
}
function message(m: Record<string, unknown>) {
  act(() => socket.onState!((previous) => arrive(previous, m)));
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

const pausedAt = (seat: number, over: Record<string, unknown> = {}) =>
  message({
    type: "MATCH_PAUSED",
    seat,
    since: Date.now(),
    awayAt: Date.now() + 10 * 60_000,
    now: Date.now(),
    ...over,
  });
const backAt = (seat: number, droppedMsAgo: number) =>
  message({
    type: "MATCH_PAUSED",
    seat,
    since: Date.now() - droppedMsAgo,
    awayAt: Date.now() + 1e6,
    now: Date.now(),
    back: true,
  });
const resumed = (seat: number) => message({ type: "MATCH_RESUMED", seat });
/** Time passes as on a real page. */
function tick(ms: number) {
  for (let t = 0; t < ms; t += 50)
    act(() => {
      vi.advanceTimersByTime(Math.min(50, ms - t));
    });
}
const act0 = (c: HTMLElement) => c.querySelector<HTMLElement>(".gs-paused");
const actText = (c: HTMLElement) => act0(c)?.textContent ?? "";
const dim = (c: HTMLElement) => c.querySelector(".gs-pause-dim");
const pauseWin = (c: HTMLElement) => c.querySelector<HTMLElement>(".gs-pause-win");
const pill = (c: HTMLElement, seat: number) =>
  c.querySelector<HTMLElement>(`.gs-seat[data-seat="${seat}"] .gs-seat-away`)?.textContent ?? null;
const priority = (window = false) =>
  message({
    type: "DECISION_REQUEST",
    decisionId: 7,
    actedForSeat: 1,
    stateVersion: revision,
    kind: "chooseSpellAbilityToPlay",
    mandatory: false,
    ...(window ? { window: true } : {}),
    options: [],
  });

function open(watching = false) {
  const view = render(
    <GameScreen
      match={match}
      me={watching ? "u-9" : "u-1"}
      onLeave={() => {}}
      watching={watching}
    />,
  );
  message({ type: "MATCH_HELLO", seat: watching ? 0 : 1 });
  send(state(watching ? { seat: 0, spectator: true } : {}));
  return view.container;
}

describe("F-0120-H · the pause on the game screen", () => {
  beforeEach(() => {
    revision = 0;
  });

  it("shows the standard look 1.5 s after MATCH_PAUSED: dim, act button with its clock, plate, window", () => {
    const c = open();
    pausedAt(2);
    tick(1_400);
    expect(act0(c)).toBeNull();
    expect(dim(c)).toBeNull();
    tick(100);
    expect(actText(c)).toContain("Connection dropped");
    expect(actText(c)).toContain("Bob · game paused · 0:01");
    expect(dim(c)).not.toBeNull();
    expect(pill(c, 2)).toBe("Dropped");
    expect(c.querySelector('.gs-seat[data-seat="2"] .gs-seat-dropsign')).not.toBeNull();
    const w = pauseWin(c)!;
    expect(w.querySelector(".gs-win-from")?.textContent).toBe("Bob · connection");
    expect(w.querySelector(".gs-win-title")?.textContent).toBe("Bob's connection dropped");
    expect(w.querySelector(".gs-win-prompt")?.textContent).toBe(
      "The game is paused until Bob is back. You can look at cards, chat or concede.",
    );
    tick(3_000);
    expect(actText(c)).toContain("0:04");
    // OK closes the window; the dim and the act button stay.
    fireEvent.click(w.querySelector(".gs-win-btn-main")!);
    expect(pauseWin(c)).toBeNull();
    expect(dim(c)).not.toBeNull();
    expect(act0(c)).not.toBeNull();
  });

  it("a move tried meanwhile shows the look at once and sends nothing", () => {
    const c = open();
    priority();
    pausedAt(2);
    tick(200);
    expect(act0(c)).toBeNull();
    fireEvent.click(c.querySelector<HTMLElement>("button.gs-act")!);
    expect(socket.answers).toEqual([]);
    expect(actText(c)).toContain("Connection dropped");
    expect(act0(c)!.className).toContain("gs-paused-nudge");
  });

  it("PAUSED is refused quietly: no words, the question stays", () => {
    const c = open();
    priority();
    message({ type: "DECISION_REFUSED", decisionId: 7, reason: "PAUSED" });
    expect(c.textContent).not.toContain("not accepted");
    expect(c.textContent).not.toContain("paused until everyone");
    expect(c.querySelector("button.gs-act")).not.toBeNull();
  });

  it("the response window's countdown stops while paused and starts again at 5", () => {
    const c = open();
    priority(true);
    tick(2_000);
    expect(c.textContent).toContain("Resolves in 3");
    pausedAt(2);
    tick(20_000);
    expect(socket.answers).toEqual([]);
    backAt(2, 20_000);
    resumed(2);
    tick(1_100);
    expect(c.textContent).toContain("Resolves in 4");
    expect(socket.answers).toEqual([]);
    tick(4_000);
    expect(socket.answers).toEqual([null]);
  });

  it("Bob is back: catching up, then 'The game goes on' for 1 s; a click there only ends the look", () => {
    const c = open();
    priority();
    pausedAt(2);
    tick(2_000);
    backAt(2, 2_000);
    expect(actText(c)).toContain("Bob is back");
    expect(actText(c)).toContain("Catching up · paused");
    expect(pill(c, 2)).toBe("Catching up");
    resumed(2);
    expect(actText(c)).toContain("The game goes on");
    expect(pill(c, 2)).toBe("Back");
    expect(dim(c)).toBeNull();
    fireEvent.click(act0(c)!);
    expect(socket.answers).toEqual([]);
    expect(act0(c)).toBeNull();
    expect(c.querySelector("button.gs-act")).not.toBeNull();
  });

  it("the 'is back' look lasts 1 s, and a drop too short to show its look shows nothing", () => {
    const c = open();
    pausedAt(2);
    tick(2_000);
    resumed(2);
    tick(900);
    expect(actText(c)).toContain("The game goes on");
    tick(200);
    expect(act0(c)).toBeNull();
    // A drop over before its look showed (a refresh): nothing, before or after.
    tick(11_000);
    pausedAt(2);
    tick(1_000);
    resumed(2);
    expect(act0(c)).toBeNull();
    expect(pill(c, 2)).toBeNull();
  });

  it("a refresh: back before the look showed, then the game goes on: nothing shows at all", () => {
    const c = open();
    pausedAt(2);
    tick(1_000);
    backAt(2, 1_000);
    tick(3_000);
    expect(act0(c)).toBeNull();
    expect(dim(c)).toBeNull();
    expect(pill(c, 2)).toBeNull();
    resumed(2);
    tick(100);
    expect(act0(c)).toBeNull();
  });

  it("OK closes the window for the whole drop: not again when the player is back and catching up", () => {
    const c = open();
    pausedAt(2);
    tick(2_000);
    fireEvent.click(pauseWin(c)!.querySelector(".gs-win-btn-main")!);
    expect(pauseWin(c)).toBeNull();
    // The server's MATCH_PAUSED again, "back", its `now` a little later (the page's offset moves).
    message({
      type: "MATCH_PAUSED",
      seat: 2,
      since: Date.now() - 2_000,
      awayAt: Date.now() + 1e6,
      now: Date.now() - 40,
      back: true,
    });
    expect(pauseWin(c)).toBeNull();
    expect(actText(c)).toContain("Catching up · paused");
  });

  it("a new drop within 10 s of the last shows at once", () => {
    const c = open();
    pausedAt(2);
    tick(2_000);
    resumed(2);
    tick(3_000);
    pausedAt(2);
    expect(actText(c)).toContain("Connection dropped");
  });

  it("the plate says Dropped for a minute, then Away · N min; the away window replaces the pause window at its time", () => {
    const c = open();
    pausedAt(2);
    tick(59_000);
    expect(pill(c, 2)).toBe("Dropped");
    tick(2_000);
    expect(pill(c, 2)).toBe("Away · 1 min");
    expect(pauseWin(c)).not.toBeNull();
    tick(9 * 60_000);
    expect(pauseWin(c)).toBeNull();
    expect(c.querySelector(".gs-away-win:not(.gs-pause-win)")).not.toBeNull();
  });

  it("with the budget spent (endNow) the away window opens at once", () => {
    const c = open();
    pausedAt(2, { awayAt: Date.now(), endNow: true });
    tick(1_500);
    expect(c.querySelector(".gs-away-win:not(.gs-pause-win)")).not.toBeNull();
    expect(pauseWin(c)).toBeNull();
  });

  it("a spectator gets the act button's words and the plate sign only", () => {
    const c = open(true);
    pausedAt(2);
    tick(1_500);
    expect(actText(c)).toContain("Connection dropped");
    expect(pill(c, 2)).toBe("Dropped");
    expect(dim(c)).toBeNull();
    expect(pauseWin(c)).toBeNull();
  });

  it("this page's own line down: 'Reconnecting… / The game is paused', and the notice says so", () => {
    const c = open();
    act(() => socket.onState!((previous) => ({ ...previous, connection: "reconnecting" })));
    tick(1_600);
    expect(c.querySelector('[data-paused="mine"]')?.textContent).toContain("The game is paused");
    expect(c.textContent).toContain("The game is paused until you're back.");
  });
});
