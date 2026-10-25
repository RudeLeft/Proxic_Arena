// Owner report 2026-10-21: after a server update players had to reload,
// sometimes several times, before they saw each other online, and
// leaving a room sometimes did not take. These are the client's halves
// of those fixes: a connection that comes back on its own, a session
// that says it has ended, and a room you have left that stays left.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_LOBBY,
  PING_MS,
  QUIET_MS,
  adoptCurrentRoom,
  connectLobby,
  reduceLobby,
  type LobbyState,
  type RoomView,
} from "./lobby";
import { EMPTY_MATCH, connectMatch, type MatchState } from "./match";

class FakeSocket extends EventTarget {
  static made: FakeSocket[] = [];
  sent: string[] = [];
  static readonly OPEN = 1;
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
  close() {}
  opened() {
    this.readyState = 1;
    const event = new Event("open");
    this.dispatchEvent(event);
    this.onopen?.(event);
  }
  dropped(code = 1006) {
    this.readyState = 3;
    const event = Object.assign(new Event("close"), { code }) as CloseEvent;
    this.dispatchEvent(event);
    this.onclose?.(event);
  }
  says(message: Record<string, unknown>) {
    const event = Object.assign(new Event("message"), {
      data: JSON.stringify(message),
    }) as MessageEvent;
    this.dispatchEvent(event);
    this.onmessage?.(event);
  }
}

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    roomId: "r-1",
    name: "Pat's room",
    hostUserId: "u-pat",
    presetId: "OPEN_FORMAT_1V1",
    desiredPlayerCount: 2,
    status: "OPEN",
    revision: 5,
    everyoneReady: false,
    members: [],
    ...overrides,
  };
}

/** A lobby wired to a fake socket; returns the state as it stands. */
function lobby(onReopen = () => {}) {
  let state: LobbyState = EMPTY_LOBBY;
  const socket = connectLobby(
    "ws://x/ws/user",
    (next) => {
      state = next(state);
    },
    FakeSocket as unknown as typeof WebSocket,
    { onReopen, delays: [100, 200] },
  );
  return { socket, now: () => state };
}

beforeEach(() => {
  FakeSocket.made = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the lobby connection", () => {
  it("reconnects on its own after a drop, and catches up once back", () => {
    const onReopen = vi.fn();
    const { now } = lobby(onReopen);
    FakeSocket.made[0]!.opened();
    expect(now().connection).toBe("open");

    FakeSocket.made[0]!.dropped();
    expect(now().connection).toBe("reconnecting");
    vi.advanceTimersByTime(100);
    expect(FakeSocket.made).toHaveLength(2);

    // The server is still down: the next wait is longer.
    FakeSocket.made[1]!.dropped();
    vi.advanceTimersByTime(150);
    expect(FakeSocket.made).toHaveLength(2);
    vi.advanceTimersByTime(50);
    expect(FakeSocket.made).toHaveLength(3);

    FakeSocket.made[2]!.opened();
    expect(now().connection).toBe("open");
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  /**
   * 2026-10-24: a network that vanishes without closing the connection
   * left the header saying "Connected" for minutes. It pings; silence
   * past QUIET_MS is a drop like any other, and it reconnects.
   */
  it("pings while open, and counts a long silence as a drop", () => {
    const onReopen = vi.fn();
    const { now } = lobby(onReopen);
    const first = FakeSocket.made[0]!;
    first.opened();

    vi.advanceTimersByTime(PING_MS);
    expect(first.sent).toContain(JSON.stringify({ type: "PING" }));
    first.says({ type: "PONG" }); // the server answered: still here
    vi.advanceTimersByTime(PING_MS * 2);
    expect(now().connection).toBe("open");

    // Nothing heard since the PONG: lost, said so, and back again.
    vi.advanceTimersByTime(QUIET_MS);
    expect(now().connection).toBe("reconnecting");
    vi.advanceTimersByTime(100);
    expect(FakeSocket.made).toHaveLength(2);
    FakeSocket.made[1]!.opened();
    expect(now().connection).toBe("open");
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it("does not catch up on the first connection", () => {
    const onReopen = vi.fn();
    lobby(onReopen);
    FakeSocket.made[0]!.opened();
    expect(onReopen).not.toHaveBeenCalled();
  });

  it("stops when the session has ended, and says so", () => {
    const { now } = lobby();
    FakeSocket.made[0]!.opened();
    FakeSocket.made[0]!.says({ type: "SESSION_ENDED", reason: "revoked" });
    FakeSocket.made[0]!.dropped(1008);
    expect(now().connection).toBe("ended");
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.made).toHaveLength(1);
  });

  it("does not reconnect when refused for not being signed in", () => {
    const { now } = lobby();
    FakeSocket.made[0]!.dropped(1008);
    expect(now().connection).toBe("ended");
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.made).toHaveLength(1);
  });

  it("does not reconnect after the page closes it", () => {
    const { socket } = lobby();
    FakeSocket.made[0]!.opened();
    socket.close();
    FakeSocket.made[0]!.dropped();
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.made).toHaveLength(1);
  });
});

describe("a room you have left", () => {
  it("is not brought back by a late message from before you left", () => {
    const left: LobbyState = { ...EMPTY_LOBBY, left: { roomId: "r-1", revision: 6 } };
    const late = reduceLobby(left, { type: "ROOM", room: room({ revision: 6 }) });
    expect(late.room).toBeNull();
  });

  it("can still be joined again", () => {
    const left: LobbyState = { ...EMPTY_LOBBY, left: { roomId: "r-1", revision: 6 } };
    const back = reduceLobby(left, { type: "ROOM", room: room({ revision: 7 }) });
    expect(back.room?.revision).toBe(7);
  });

  it("is remembered when the room closes", () => {
    const inRoom: LobbyState = { ...EMPTY_LOBBY, room: room() };
    const closed = reduceLobby(inRoom, { type: "ROOM_CLOSED", roomId: "r-1", reason: "HOST_LEFT" });
    expect(closed.left).toEqual({ roomId: "r-1", revision: 5 });
  });
});

describe("catching up after a reconnect", () => {
  it("drops a room the server no longer has you in", () => {
    const after = adoptCurrentRoom({ ...EMPTY_LOBBY, room: room() }, null);
    expect(after.room).toBeNull();
    expect(after.left).toEqual({ roomId: "r-1", revision: 5 });
  });

  it("takes a newer room and keeps a newer one it already has", () => {
    const shown: LobbyState = { ...EMPTY_LOBBY, room: room({ revision: 5 }) };
    expect(adoptCurrentRoom(shown, room({ revision: 8 })).room?.revision).toBe(8);
    expect(adoptCurrentRoom(shown, room({ revision: 3 })).room?.revision).toBe(5);
  });
});

describe("the game connection", () => {
  function game() {
    let state: MatchState = { ...EMPTY_MATCH };
    connectMatch(
      "ws://x/ws/matches/m",
      (apply) => {
        state = apply(state);
      },
      (url) => new FakeSocket(url) as unknown as WebSocket,
      [100],
    );
    return () => state;
  }

  it("reconnects on its own and sets the question aside meanwhile", () => {
    const now = game();
    FakeSocket.made[0]!.opened();
    FakeSocket.made[0]!.says({ type: "MATCH_HELLO", seat: 1 });
    FakeSocket.made[0]!.dropped();
    expect(now().connection).toBe("reconnecting");
    expect(now().decision).toBeNull();
    vi.advanceTimersByTime(100);
    expect(FakeSocket.made).toHaveLength(2);
    FakeSocket.made[1]!.says({ type: "MATCH_HELLO", seat: 1 });
    expect(now().connection).toBe("open");
  });

  it("does not retry when it is not your match", () => {
    const now = game();
    FakeSocket.made[0]!.dropped(1008);
    expect(now().connection).toBe("closed");
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.made).toHaveLength(1);
  });
});
