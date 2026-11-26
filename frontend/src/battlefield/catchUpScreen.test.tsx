// @vitest-environment jsdom

// P11-D6 (spec 0119, F-0119-D's screen half; F-0119-H's click, unit level)
// -- catch-up after a stall on the real game screen, its socket replaced and
// handed the boards as connectMatch hands them (`arrive`): late boards replay
// in order at 3x from where the table stopped, with "Catching up… / Tap to
// skip" in the act button; past the limit the table goes straight to now and
// "While you were away" lists the play log's own lines; a click skips; the
// question waits until the table is live; reports open once it is live;
// motion turned down always jumps; CAUGHT_UP once live. (Harness as
// fixes0102screen's.)

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOBBY, type MatchView } from "../lobby";
import { arrive, type Arrival, type MatchState } from "../match";
import { endLifeSteps } from "./lifeTicks";
import { holdOf } from "./catchUp";

const socket = vi.hoisted(() => ({
  onState: null as null | ((apply: (previous: MatchState) => MatchState) => void),
  closed: [] as number[],
  caughtUp: 0,
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
  reduce = false;
  endLifeSteps();
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
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
  matchId: "m-catchup",
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

/** The board drawn holds Bob's n-th Forest (each of his boards adds one: its revision tells). */
const drawnRev = (c: HTMLElement) =>
  Number(c.querySelector<HTMLElement>(".gs-screen")?.dataset["drawn"]?.split(".")[1] ?? -1);
const forestAt = new Map<string, number>();
const onTable = (c: HTMLElement, id: string) => drawnRev(c) >= (forestAt.get(id) ?? Infinity);
const sign = (c: HTMLElement) => c.querySelector<HTMLElement>(".gs-catchup");
const missed = (c: HTMLElement) => c.querySelector<HTMLElement>(".gs-missed");
const forest = (n: number) =>
  card(`card:${100 + n}`, 2, "Forest", { kind: "land", types: "Basic Land — Forest" });
const played = (n: number) => ({
  card: `card:${100 + n}`,
  from: { zone: "hand", seat: 2 },
  to: { zone: "battlefield", seat: 2 },
});
let lineN = 0;
const line = (rev: number, words: string, kind = "play", turn = 12) => ({
  n: ++lineN,
  rev,
  turn,
  active: 2,
  step: "Main 1",
  kind,
  parts: [{ player: 2 }, ` ${words}`],
});
/** Bob plays his n-th Forest: one card more on his side, its move, its play log line. */
function bobPlays(n: number, upTo: number, how: Arrival = { late: true }) {
  const lands = Array.from({ length: n }, (_, i) => forest(i + 1));
  const s = state({ battlefield: lands, moves: [played(n)] });
  forestAt.set(`card:${100 + n}`, s["stateRevision"] as number);
  s["playLog"] = [line(s["stateRevision"] as number, `played Forest ${n}.`)];
  void upTo;
  send(s, how);
  return s;
}
/** Time passes as on a real page: each timer's effects (the next board's timer) run before the next. */
function tick(ms: number) {
  for (let t = 0; t < ms; t += 5)
    act(() => {
      vi.advanceTimersByTime(Math.min(5, ms - t));
    });
}
/** A question with its own window (choose a card): asked while the table catches up. */
const choose = () =>
  message({
    type: "DECISION_REQUEST",
    decisionId: 7,
    actedForSeat: 1,
    stateVersion: revision,
    kind: "chooseSingleEntityForEffect",
    prompt: "Choose a card",
    mandatory: true,
    options: ["Island", "Forest"].map((label, i) => ({
      actionId: `o:${i}`,
      label,
      objectId: null,
    })),
  });
const asked = (c: HTMLElement) =>
  c.querySelector(".gs-screen")?.textContent?.includes("Choose a card") === true;

describe("F-0119-D · catch-up after a stall, on the game screen", () => {
  beforeEach(() => {
    revision = 0;
    lineN = 0;
  });

  it("a late burst replays in order at 3x, the sign showing and filling, then the table is live (CAUGHT_UP)", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({}));
    expect(sign(c)).toBeNull();
    bobPlays(1, 0);
    bobPlays(2, 0);
    bobPlays(3, 0);
    // The table steps from where it stopped: the first missed board, the sign in the act button.
    expect(onTable(c, "card:101")).toBe(true);
    expect(onTable(c, "card:102")).toBe(false);
    expect(sign(c)?.textContent).toContain("Catching up…");
    expect(sign(c)?.textContent).toContain("Tap to skip");
    // Each held its moment at 3x: a land's glide and settle, a third of it.
    const hold = holdOf(null, { moves: [played(1)], stack: [], seat: 1 } as never);
    expect(hold).toBeLessThan(400);
    tick(hold - 5);
    expect(onTable(c, "card:102")).toBe(false);
    tick(10);
    expect(onTable(c, "card:102")).toBe(true);
    const bar = sign(c)!.querySelector<HTMLElement>(".gs-catchup-bar i")!;
    expect(parseInt(bar.style.width)).toBeGreaterThan(0);
    tick(hold * 3);
    expect(onTable(c, "card:103")).toBe(true);
    expect(sign(c)).toBeNull();
    expect(socket.caughtUp).toBe(1);
    // Under the limit: no window.
    expect(missed(c)).toBeNull();
  });

  it("a MATCH_CATCHUP's updates replay too, the question waiting until the table is live", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({}));
    message({ type: "MATCH_CATCHUP", from: { gameEpoch: 1, stateRevision: revision }, count: 2 });
    bobPlays(1, 0, {});
    choose();
    // Asked during the replay: not shown yet.
    expect(sign(c)).not.toBeNull();
    expect(asked(c)).toBe(false);
    bobPlays(2, 0, {});
    tick(2_000);
    expect(onTable(c, "card:102")).toBe(true);
    expect(sign(c)).toBeNull();
    expect(asked(c)).toBe(true);
  });

  it("a click skips: straight to now, live, no window", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({}));
    bobPlays(1, 0);
    bobPlays(2, 0);
    bobPlays(3, 0);
    expect(onTable(c, "card:103")).toBe(false);
    fireEvent.pointerDown(c.querySelector(".gs-screen")!);
    expect(sign(c)).toBeNull();
    expect(onTable(c, "card:103")).toBe(true);
    expect(missed(c)).toBeNull();
    expect(socket.caughtUp).toBe(1);
  });

  it("the act button itself skips", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({}));
    bobPlays(1, 0);
    bobPlays(2, 0);
    fireEvent.click(sign(c)!);
    expect(sign(c)).toBeNull();
    expect(onTable(c, "card:102")).toBe(true);
  });

  it("past the limit (21 updates): no replay, straight to now, and the window lists the play log's lines, numbered", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    const first = state({});
    first["playLog"] = [line(first["stateRevision"] as number, "said hello.")];
    send(first);
    message({ type: "MATCH_CATCHUP", from: { gameEpoch: 1, stateRevision: revision }, count: 21 });
    for (let n = 1; n <= 20; n++) bobPlays(n, 0, {});
    // Still coming: the table stays where it stopped (one glide later, not twenty).
    expect(onTable(c, "card:101")).toBe(false);
    expect(sign(c)).toBeNull();
    bobPlays(21, 0, {});
    expect(onTable(c, "card:121")).toBe(true);
    const w = missed(c)!;
    expect(w).not.toBeNull();
    expect(w.textContent).toContain("While you were away");
    expect(w.textContent).toContain("You missed 21 moves. Your table is up to date.");
    const rows = [...w.querySelectorAll(".gs-missed-row")];
    expect(rows).toHaveLength(21);
    expect(rows[0]!.textContent).toBe("1Bob played Forest 1.");
    expect(rows[20]!.textContent).toBe("21Bob played Forest 21.");
    expect(socket.caughtUp).toBe(1);
    fireEvent.click(w.querySelector(".gs-reveal-close")!);
    expect(missed(c)).toBeNull();
  });

  it("past 6 s of replay (estimated), even under 20 boards: the jump and the window", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({}));
    // Bob's spells: each held for the other player's spell hold, a third of it: ten are over 6 s.
    for (let n = 1; n <= 10; n++) {
      const s = state({
        stack: [
          {
            id: `stack:${n}`,
            kind: "spell",
            source: `card:${200 + n}`,
            controller: 2,
            name: "Giant Growth",
            description: "",
            targets: [],
          },
        ],
      });
      s["playLog"] = [line(s["stateRevision"] as number, `cast Giant Growth ${n}.`)];
      send(s, { late: true });
    }
    expect(sign(c)).toBeNull();
    expect(missed(c)?.querySelectorAll(".gs-missed-row")).toHaveLength(10);
  });

  it("motion turned down: always the jump, never a replay; no window under the limit", () => {
    reduce = true;
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({}));
    bobPlays(1, 0);
    bobPlays(2, 0);
    expect(sign(c)).toBeNull();
    expect(onTable(c, "card:102")).toBe(true);
    expect(missed(c)).toBeNull();
  });

  it("a returning page sent today's whole board (its own not kept): straight to now and the window", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({}));
    const back = state({ battlefield: [forest(1), forest(2)] });
    forestAt.set("card:102", back["stateRevision"] as number);
    back["playLog"] = [line(revision - 1, "played Forest 1."), line(revision, "played Forest 2.")];
    send(back, { jump: true });
    expect(sign(c)).toBeNull();
    expect(onTable(c, "card:102")).toBe(true);
    expect(missed(c)?.querySelectorAll(".gs-missed-row")).toHaveLength(2);
  });

  it("boards that arrive on time draw as they always did: no sign, no CAUGHT_UP", () => {
    const view = render(<GameScreen match={match} me="u-1" onLeave={() => {}} />);
    const c = view.container;
    send(state({}));
    bobPlays(1, 0, {});
    expect(sign(c)).toBeNull();
    expect(onTable(c, "card:101")).toBe(true);
    expect(socket.caughtUp).toBe(0);
  });
});
