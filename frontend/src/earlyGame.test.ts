// @vitest-environment jsdom

// Spec 0122 (P11-E12, F-0122-C) -- the game's connection, started early.
// On /game and /watch/<room>, with the session hint, the page opens its game
// connection beside "who am I" at an address the server resolves; the game
// screen takes it for its first connection (connectMatch's `first`). These
// check: what is kept is replayed in order, then live; each kept message is
// judged at the time it really arrived (lateness), and the silence check
// starts at the hand-over; nothing is applied before a hello naming the
// page's game; a hello naming another game opens the page's own connection
// FIRST, and the early one is closed only once that has opened; a 4003 (or
// any close before a hello) falls back to the page's own connection, at
// once; and one nobody takes is closed when the page leaves, or after
// TAKE_WITHIN_MS.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EARLY_GAME_MARK,
  TAKE_WITHIN_MS,
  endEarly,
  endEarlyGame,
  startEarly,
  takeEarlyGame,
} from "./early";
import { EMPTY_MATCH, LATE_MS, SILENCE_MS, connectMatch, type MatchState } from "./match";

/** A socket that tells both its listeners and its `on*` handlers, as a browser's does. */
class FakeSocket extends EventTarget {
  static made: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  closed = false;
  sent: string[] = [];
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
  close() {
    this.closed = true;
    this.dropped(1000);
  }
  private tell(event: Event) {
    this.dispatchEvent(event);
    const handler = this[`on${event.type}` as "onopen"];
    handler?.(event);
  }
  opened() {
    this.readyState = 1;
    this.tell(new Event("open"));
  }
  says(message: Record<string, unknown>) {
    this.tell(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
  dropped(code = 1006) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.tell(new CloseEvent("close", { code }));
  }
}

const hint = (on: boolean) => {
  document.cookie = on
    ? "proxicarena_csrf=token; path=/"
    : "proxicarena_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};

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

const PAGE_URL = "ws://x/ws/matches/m-1?deltas=1";

/** The game screen's connection, as GameScreen opens it: the early one first, if any. */
function game(matchId = "m-1", watching = false) {
  let state: MatchState = EMPTY_MATCH;
  const socket = connectMatch(
    PAGE_URL,
    (apply) => {
      state = apply(state);
    },
    (url) => new FakeSocket(url) as unknown as WebSocket,
    [100],
    { first: (_url, own) => takeEarlyGame({ matchId, watching, own }) },
  );
  return { socket, state: () => state };
}

const flush = () => Promise.resolve();

beforeEach(() => {
  FakeSocket.made = [];
  rev = 0;
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(1_000_000);
  performance.clearMarks?.();
});
afterEach(() => {
  endEarly();
  hint(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("F-0122-C · opened beside who am I", () => {
  it("on /game the player's address, on /watch/<room> the room's; nothing elsewhere or without the hint", () => {
    hint(true);
    startEarly("/game");
    // The game's first: a browser opens one socket to a host at a time (RFC 6455 4.1).
    expect(FakeSocket.made.map((s) => s.url)).toEqual([
      `ws://${location.host}/ws/matches/current?deltas=1`,
      `ws://${location.host}/ws/user`,
    ]);
    endEarly();
    FakeSocket.made = [];
    startEarly("/watch/r-9");
    expect(FakeSocket.made.map((s) => s.url)).toContain(
      `ws://${location.host}/ws/matches/watch/r-9?deltas=1`,
    );
    endEarly();
    FakeSocket.made = [];
    for (const path of ["/play", "/hall", "/watch/", "/watch/a/b"]) startEarly(path);
    expect(FakeSocket.made.filter((s) => s.url.includes("/ws/matches/"))).toEqual([]);
    endEarly();
    FakeSocket.made = [];
    hint(false);
    startEarly("/game");
    expect(FakeSocket.made).toEqual([]);
  });
});

describe("F-0122-C · taken by the game screen", () => {
  const early = () => FakeSocket.made.find((s) => s.url.includes("/ws/matches/"))!;

  it("replays what was kept, in order, then passes the rest on: one connection, the early one", async () => {
    hint(true);
    startEarly("/game");
    early().opened();
    early().says({ type: "WATCHING", count: 1, names: ["Carol"] });
    early().says({ type: "MATCH_HELLO", matchId: "m-1", seat: 1 });
    early().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 40, state: board() });

    const g = game();
    await flush();
    expect(FakeSocket.made.filter((s) => s.url.includes("/ws/matches/"))).toHaveLength(1);
    expect(g.state().seat).toBe(1);
    expect(g.state().connection).toBe("open");
    expect(g.state().board?.stateRevision).toBe(1);
    // Live from here on.
    early().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 40, state: board() });
    expect(g.state().board?.stateRevision).toBe(2);
    // Its table is live: CAUGHT_UP goes on the early connection.
    expect(early().sent).toContain(JSON.stringify({ type: "CAUGHT_UP" }));
    expect(performance.getEntriesByName(EARLY_GAME_MARK)).toHaveLength(1);
    g.socket.close();
    expect(early().closed).toBe(true);
  });

  it("a board kept 1.5 s while the page's code came is not late, and the silence check starts at the hand-over", async () => {
    hint(true);
    startEarly("/game");
    early().opened();
    early().says({ type: "MATCH_HELLO", matchId: "m-1", seat: 1 });
    early().says({ type: "MATCH_BEAT" });
    early().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 40, state: board() });
    vi.advanceTimersByTime(LATE_MS + 500);
    const g = game();
    await flush();
    // The kept beat came 2 s before the hand-over: still not silent 4 s after it.
    vi.advanceTimersByTime(SILENCE_MS - 1_000);
    expect(g.state().stalled).toBe(false);
    early().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 40, state: board() });
    expect(g.state().catchUp ?? null).toBeNull();
    expect(g.state().board?.stateRevision).toBe(2);
  });

  it("a board that really came late on the wire while kept is still caught up: judged at its kept arrival time", async () => {
    hint(true);
    startEarly("/game");
    early().opened();
    early().says({ type: "MATCH_HELLO", matchId: "m-1", seat: 1 });
    // The line's usual: 40 ms.
    early().says({ type: "MATCH_SNAPSHOT", sentAt: Date.now() - 40, state: board() });
    // Then a stall: this board left the server 100 ms later, and came 3 s after that.
    const sent = Date.now() + 100;
    vi.advanceTimersByTime(3_100);
    early().says({ type: "MATCH_SNAPSHOT", sentAt: sent, state: board() });
    // Taken at once: at replay time both boards would look the same age.
    const g = game();
    await flush();
    expect(g.state().catchUp?.boards.map((b) => b.stateRevision)).toEqual([2]);
  });

  it("applies nothing before a hello naming the page's game", async () => {
    hint(true);
    startEarly("/game");
    early().opened();
    early().says({ type: "WATCHING", count: 1, names: ["Carol"] });
    const g = game();
    await flush();
    expect(g.state().connection).not.toBe("open");
    expect(g.state().seat ?? null).toBeNull();
    expect(g.state().watching, "WATCHING held until the hello").toBe(0);
    early().says({ type: "MATCH_HELLO", matchId: "m-1", seat: 2 });
    expect(g.state().seat).toBe(2);
    expect(g.state().watching, "then applied, in order").toBe(1);
    expect(g.state().connection).toBe("open");
  });

  it("a hello naming another game opens the page's own connection first, and closes the early one only once it is open", async () => {
    hint(true);
    startEarly("/game");
    early().opened();
    early().says({ type: "MATCH_HELLO", matchId: "m-OLD", seat: 1 });
    early().says({ type: "MATCH_SNAPSHOT", state: board({ turn: 99 }) });
    const g = game();
    await flush();
    const own = FakeSocket.made.at(-1)!;
    expect(own.url).toBe(PAGE_URL);
    // The seat is never left with no connection: the early one stays until then.
    expect(early().closed).toBe(false);
    expect(g.state().board ?? null).toBeNull();
    own.opened();
    expect(early().closed).toBe(true);
    own.says({ type: "MATCH_HELLO", matchId: "m-1", seat: 1 });
    own.says({ type: "MATCH_SNAPSHOT", state: board() });
    expect(g.state().board?.turn).toBe(3);
    expect(g.state().connection).toBe("open");
    // The other game's messages are never applied.
    early().says({ type: "MATCH_SNAPSHOT", state: board({ turn: 99 }) });
    expect(g.state().board?.turn).toBe(3);
    expect(performance.getEntriesByName(EARLY_GAME_MARK)).toHaveLength(0);
  });

  it("4003 before the hand-over: the page's own connection, as today", async () => {
    hint(true);
    startEarly("/game");
    early().dropped(4003);
    const g = game();
    await flush();
    expect(FakeSocket.made.at(-1)!.url).toBe(PAGE_URL);
    expect(g.state().connection).not.toBe("reconnecting");
  });

  it("4003 after the hand-over, before a hello: the page's own connection at once, never a lost one", async () => {
    hint(true);
    startEarly("/game");
    early().opened();
    const g = game();
    await flush();
    const before = FakeSocket.made.length;
    early().dropped(4003);
    expect(FakeSocket.made).toHaveLength(before + 1);
    expect(FakeSocket.made.at(-1)!.url).toBe(PAGE_URL);
    expect(g.state().connection).not.toBe("reconnecting");
    FakeSocket.made.at(-1)!.opened();
    FakeSocket.made.at(-1)!.says({ type: "MATCH_HELLO", matchId: "m-1", seat: 1 });
    expect(g.state().connection).toBe("open");
  });

  it("4003 says the game may have ended while the page loaded: the page is told to ask again; another close is not", async () => {
    hint(true);
    startEarly("/game");
    const asked: string[] = [];
    const take = (code: number) => {
      FakeSocket.made.find((s) => s.url.includes("/ws/matches/"))!.dropped(code);
      return takeEarlyGame({
        matchId: "m-1",
        watching: false,
        own: () => new FakeSocket(PAGE_URL) as unknown as WebSocket,
        noGame: () => asked.push(String(code)),
      });
    };
    take(4003);
    await flush();
    expect(asked).toEqual(["4003"]);
    endEarly();
    FakeSocket.made = [];
    startEarly("/game");
    take(1006);
    await flush();
    expect(asked).toEqual(["4003"]);
  });

  it("the game's end naming the page's game is taken as its hello (a spectator's game just over)", async () => {
    hint(true);
    startEarly("/watch/r-1");
    early().opened();
    early().says({ type: "MATCH_ENDED", matchId: "m-1", status: "COMPLETED", outcome: "WIN" });
    early().dropped(1000);
    const g = game("m-1", true);
    await flush();
    expect(FakeSocket.made.filter((s) => s.url.includes("/ws/matches/"))).toHaveLength(1);
    expect(g.state().connection).toBe("closed");
  });

  it("a spectator's early connection is never a player's page's, nor the other way round", async () => {
    hint(true);
    startEarly("/watch/r-1");
    const watched = early();
    game("m-1", false);
    await flush();
    expect(watched.closed).toBe(true);
    expect(FakeSocket.made.at(-1)!.url).toBe(PAGE_URL);
  });
});

describe("F-0122-C · nobody takes it", () => {
  const early = () => FakeSocket.made.find((s) => s.url.includes("/ws/matches/"))!;

  it("is closed at once when the page leaves the game (endEarlyGame), and is then nobody's", () => {
    hint(true);
    startEarly("/game");
    endEarlyGame();
    expect(early().closed).toBe(true);
    expect(takeEarlyGame({ matchId: "m-1", watching: false, own: () => null! })).toBeNull();
  });

  it("is let go after TAKE_WITHIN_MS", () => {
    hint(true);
    startEarly("/game");
    vi.advanceTimersByTime(TAKE_WITHIN_MS - 1);
    expect(early().closed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(early().closed).toBe(true);
  });
});
