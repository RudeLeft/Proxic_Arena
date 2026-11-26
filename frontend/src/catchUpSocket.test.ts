// @vitest-environment jsdom

// P11-D6 (spec 0119, F-0119-D's socket half) -- what connectMatch and the
// reducer do for catch-up: a board well behind the line's usual is late
// (`sentAt` against its arrival, less the connection's smallest gap, reset on
// each new connection); MATCH_CATCHUP marks the next updates as missed; a
// page coming back names the board it holds (`resume`), a fresh page never
// does (owner answer 5: a refresh starts fresh); CAUGHT_UP at once when a
// return needs nothing; and the silence check: 5 s marks the connection
// stalled (the notice, owner answer 4), 10 s closes it to come back, and a
// check that runs late judges nothing (decision 7, P11-E13).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_MATCH,
  LATE_MS,
  SILENCE_CLOSE_MS,
  SILENCE_MS,
  arrive,
  connectMatch,
  resumeUrl,
  settleCatchUp,
  type MatchState,
} from "./match";

class FakeSocket extends EventTarget {
  static made: FakeSocket[] = [];
  sent: string[] = [];
  closedWith: number | null = null;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  constructor(readonly url: string) {
    super();
    FakeSocket.made.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000) {
    this.closedWith = code;
    this.dropped(code);
  }
  opened() {
    this.readyState = 1;
    const event = new Event("open");
    this.dispatchEvent(event);
    this.onopen?.(event);
  }
  dropped(code = 1006) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    const event = Object.assign(new Event("close"), { code }) as CloseEvent;
    this.dispatchEvent(event);
    this.onclose?.(event);
  }
  says(message: Record<string, unknown>) {
    const event = Object.assign(new Event("message"), {
      data: JSON.stringify(message),
    }) as MessageEvent;
    this.onmessage?.(event);
  }
}

let rev = 0;
function board(over: Record<string, unknown> = {}) {
  rev += 1;
  return {
    stateRevision: rev,
    gameEpoch: 1,
    turn: 3,
    phase: "MAIN1",
    activeSeat: 2,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 0, libraryCount: 40, graveyardCount: 0 },
      { seat: 2, name: "Bob", life: 20, handCount: 0, libraryCount: 40, graveyardCount: 0 },
    ],
    battlefield: [],
    hand: [],
    otherHands: [],
    graveyard: [],
    exile: [],
    stack: [],
    casting: [],
    ...over,
  };
}

function game() {
  let state: MatchState = EMPTY_MATCH;
  const socket = connectMatch(
    "ws://x/ws/matches/m?deltas=1",
    (apply) => {
      state = apply(state);
    },
    (url) => new FakeSocket(url) as unknown as WebSocket,
    [100],
  );
  const now = () => FakeSocket.made[FakeSocket.made.length - 1]!;
  return { socket, state: () => state, now };
}

beforeEach(() => {
  FakeSocket.made = [];
  rev = 0;
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("F-0119-D · late, missed, resume, CAUGHT_UP", () => {
  it("a board later than the line's usual by more than LATE_MS is queued; one on time is not", () => {
    const g = game();
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    // The line's usual: 40 ms (sentAt 40 ms ago).
    g.now().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 40, state: board() });
    g.now().says({
      type: "MATCH_SNAPSHOT",
      sentAt: Date.now() - 40 - LATE_MS + 10,
      state: board(),
    });
    expect(g.state().catchUp ?? null).toBeNull();
    // A stall: this one left the server 3 s ago.
    g.now().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 3_000, state: board() });
    expect(g.state().catchUp?.boards.map((b) => b.stateRevision)).toEqual([3]);
    expect(g.state().board?.stateRevision).toBe(3);
  });

  it("the gap is measured per connection: reset on a new one (a server clock that jumped cannot make every board late)", () => {
    const g = game();
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 40, state: board() });
    g.now().dropped();
    vi.advanceTimersByTime(100);
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    // Back holding the newest board (nothing re-sent), then live boards.
    g.now().says({ type: "MATCH_ASKING", seat: 2 });
    // The server's clock is now 9 s behind: every board's gap is 9 s, none late.
    g.now().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 9_000, state: board() });
    g.now().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 9_000, state: board() });
    expect(g.state().catchUp?.boards ?? []).toHaveLength(0);
  });

  it("a fresh page asks for nothing; a page coming back names the board it holds", () => {
    const g = game();
    expect(g.now().url).toBe("ws://x/ws/matches/m?deltas=1");
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_SNAPSHOT", state: board() });
    g.now().dropped();
    vi.advanceTimersByTime(100);
    expect(g.now().url).toBe("ws://x/ws/matches/m?deltas=1&resume=1.1");
    expect(resumeUrl("ws://x/y", null)).toBe("ws://x/y");
    expect(resumeUrl("ws://x/y", { gameEpoch: 2, stateRevision: 40 })).toBe("ws://x/y?resume=2.40");
  });

  it("MATCH_CATCHUP: the next updates are missed (boards and steps), whatever their time", () => {
    const g = game();
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now(), state: board() });
    g.now().dropped();
    vi.advanceTimersByTime(100);
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_CATCHUP", from: { gameEpoch: 1, stateRevision: 1 }, count: 3 });
    expect(g.state().catchUp?.missed).toBe(3);
    g.now().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 5_000, state: board() });
    g.now().says({
      type: "MATCH_STEP",
      sentAt: Date.now() - 4_000,
      state: { gameEpoch: 1, turn: 3, phase: "COMBAT" },
    });
    g.now().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 3_000, state: board() });
    const c = g.state().catchUp!;
    expect([c.missed, c.updates, c.boards.map((b) => b.stateRevision)]).toEqual([0, 3, [2, 3]]);
    // Nothing is said yet: the screen says CAUGHT_UP when its table is live.
    expect(g.now().sent.filter((s) => s.includes("CAUGHT_UP"))).toHaveLength(0);
    g.socket.caughtUp();
    expect(g.now().sent).toContain(JSON.stringify({ type: "CAUGHT_UP" }));
  });

  it("back, holding the newest board: CAUGHT_UP at once; sent today's whole board instead: straight to now", () => {
    const g = game();
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_SNAPSHOT", state: board() });
    g.now().dropped();
    vi.advanceTimersByTime(100);
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_ASKING", seat: 2 });
    expect(g.now().sent).toEqual([JSON.stringify({ type: "CAUGHT_UP" })]);
    g.now().dropped();
    vi.advanceTimersByTime(100);
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_SNAPSHOT", state: board({ turn: 4 }) });
    expect(g.state().catchUp?.jump).toBe(true);
    expect(g.now().sent).toEqual([JSON.stringify({ type: "CAUGHT_UP" })]);
  });

  it("a beat naming a board newer than the page holds asks for the whole board; the same or an older one is nothing", () => {
    const g = game();
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_SNAPSHOT", state: board() });
    g.now().says({ type: "MATCH_BEAT", gameEpoch: 1, stateRevision: 1 });
    g.now().says({ type: "MATCH_BEAT", gameEpoch: 1, stateRevision: 0 });
    expect(g.now().sent).toHaveLength(0);
    g.now().says({ type: "MATCH_BEAT", gameEpoch: 1, stateRevision: 2 });
    expect(g.now().sent.map((s) => (JSON.parse(s) as { type: string }).type)).toEqual([
      "MATCH_RESYNC",
    ]);
  });
});

describe("F-0119-D · the silence check (owner answer 4; decision 7)", () => {
  it("5 s of silence marks the connection stalled; a message clears it; 10 s closes it and comes back with resume", () => {
    const g = game();
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_SNAPSHOT", state: board() });
    g.now().says({ type: "MATCH_BEAT", gameEpoch: 1, stateRevision: 1 });
    vi.advanceTimersByTime(SILENCE_MS - 1_000);
    expect(g.state().stalled ?? false).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(g.state().stalled).toBe(true);
    g.now().says({ type: "MATCH_BEAT" });
    expect(g.state().stalled).toBe(false);
    const first = g.now();
    // A frozen line: the browser never says the close is done (its close event can wait a long time).
    first.close = (code = 1000) => {
      first.closedWith = code;
    };
    vi.advanceTimersByTime(SILENCE_CLOSE_MS);
    expect(first.closedWith).toBe(4001);
    vi.advanceTimersByTime(100);
    expect(g.now()).not.toBe(first);
    expect(g.now().url).toContain("resume=1.1");
  });

  it("a connection never heard beating (a spectator's, an older server's) is never judged silent", () => {
    const g = game();
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 0, spectator: true });
    g.now().says({ type: "MATCH_SNAPSHOT", state: board() });
    vi.advanceTimersByTime(SILENCE_CLOSE_MS * 3);
    expect(g.state().stalled ?? false).toBe(false);
    expect(FakeSocket.made).toHaveLength(1);
  });

  it("a beat every 2 s keeps a quiet game from ever being called silent", () => {
    const g = game();
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(2_000);
      g.now().says({ type: "MATCH_BEAT" });
    }
    expect(g.state().stalled ?? false).toBe(false);
    expect(FakeSocket.made).toHaveLength(1);
  });

  it("a check that runs late (a hidden or frozen tab's timer) judges nothing", () => {
    const g = game();
    g.now().opened();
    g.now().says({ type: "MATCH_HELLO", seat: 1 });
    g.now().says({ type: "MATCH_BEAT" });
    // A hidden tab: the timer runs once a minute, while nothing arrives (and nothing is wrong).
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(Date.now() + 60_000);
      vi.advanceTimersByTime(1_000);
    }
    expect(g.state().stalled ?? false).toBe(false);
    expect(g.now().closedWith).toBeNull();
    expect(FakeSocket.made).toHaveLength(1);
  });
});

describe("F-0119-D · the queue in the reducer", () => {
  const parse = (s: Record<string, unknown>, state: MatchState, late = false) =>
    arrive(state, { type: "MATCH_SNAPSHOT", state: s }, { late });

  it("once a catch-up is under way, every board joins it; settled, it is over", () => {
    let s = parse(board(), EMPTY_MATCH);
    s = parse(board(), s, true);
    s = parse(board(), s); // on time, but a catch-up is under way
    expect(s.catchUp?.boards.map((b) => b.stateRevision)).toEqual([2, 3]);
    expect(s.catchUp?.from?.stateRevision).toBe(1);
    s = settleCatchUp(s, 1);
    expect(s.catchUp?.boards.map((b) => b.stateRevision)).toEqual([3]);
    s = settleCatchUp(s, 1);
    expect(s.catchUp).toBeNull();
  });

  it("after a jump, the same stall's late boards follow it straight to now, then the tail ends", () => {
    let s = parse(board(), EMPTY_MATCH);
    s = parse(board(), s, true);
    s = settleCatchUp(s, 1, true);
    s = parse(board(), s, true);
    expect(s.catchUp?.jump).toBe(true);
    s = settleCatchUp(s, 1, true);
    s = parse(board(), s);
    expect(s.catchUp).toBeNull();
  });
});
