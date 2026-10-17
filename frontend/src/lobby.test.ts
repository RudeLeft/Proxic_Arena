// PHASE_05 §5.66–§5.70, AMENDMENTS 1–4.
//
// The lobby's rules, tested without a browser. What is worth
// proving here is what a client is allowed to BELIEVE: which
// message changes what, which must be ignored, and which must not
// be allowed to overwrite something newer.

import { describe, expect, it } from "vitest";
import { EMPTY_LOBBY, MAX_CHAT_LINES, reduceLobby, type LobbyState, type RoomView } from "./lobby";

const pat = { userId: "u-pat", username: "Pat", displayName: "Pat" };
const sam = { userId: "u-sam", username: "Sam", displayName: "Sam" };

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    roomId: "r-1",
    hostUserId: "u-pat",
    presetId: "OPEN_FORMAT_1V1",
    desiredPlayerCount: 2,
    status: "OPEN",
    revision: 5,
    everyoneReady: false,
    members: [
      {
        ...pat,
        seatNumber: 1,
        ready: false,
        isHost: true,
        selectedDeckId: null,
        selectedDeckName: null,
      },
    ],
    ...overrides,
  };
}

function apply(messages: Record<string, unknown>[], from: LobbyState = EMPTY_LOBBY): LobbyState {
  return messages.reduce(reduceLobby, from);
}

describe("presence", () => {
  it("takes the full list, sorted by display name", () => {
    const state = apply([{ type: "PRESENCE", users: [sam, pat] }]);
    expect(state.presence.map((p) => p.displayName)).toEqual(["Pat", "Sam"]);
  });

  it("adds an arrival and removes a departure", () => {
    const state = apply([
      { type: "PRESENCE", users: [pat] },
      { type: "PRESENCE_JOINED", ...sam },
    ]);
    expect(state.presence).toHaveLength(2);

    const after = reduceLobby(state, { type: "PRESENCE_LEFT", userId: "u-pat" });
    expect(after.presence.map((p) => p.userId)).toEqual(["u-sam"]);
  });

  /**
   * §5.6 — several sessions are one player.
   *
   * The server only announces a first connection, but a reconnect
   * race can still deliver two. A name listed twice in a list people
   * click on to invite is worse than a missed animation.
   */
  it("never lists the same person twice", () => {
    const state = apply([
      { type: "PRESENCE", users: [pat] },
      { type: "PRESENCE_JOINED", ...pat },
    ]);
    expect(state.presence).toHaveLength(1);
  });
});

describe("chat", () => {
  const line = (text: string, id: string) => ({
    type: "CHAT",
    messageId: id,
    from: pat,
    text,
    sentAt: "2026-10-17T12:00:00Z",
  });

  it("appends lines in order", () => {
    const state = apply([line("first", "m1"), line("second", "m2")]);
    expect(state.chat.map((c) => c.text)).toEqual(["first", "second"]);
  });

  /**
   * AMENDMENT 3 — ephemeral, and bounded in the page too.
   *
   * "No scrollback beyond the session" is not a licence to grow a
   * list forever in a tab left open all week.
   */
  it("keeps only the most recent lines", () => {
    const many = Array.from({ length: MAX_CHAT_LINES + 50 }, (_, i) => line(`line ${i}`, `m${i}`));
    const state = apply(many);
    expect(state.chat).toHaveLength(MAX_CHAT_LINES);
    expect(state.chat[state.chat.length - 1]?.text).toBe(`line ${MAX_CHAT_LINES + 49}`);
  });

  it("drops a malformed line rather than rendering a blank one", () => {
    const state = apply([{ type: "CHAT", messageId: "m1", text: "no sender" }]);
    expect(state.chat).toHaveLength(0);
  });
});

describe("the room", () => {
  it("is taken from the server, whole", () => {
    const state = apply([{ type: "ROOM", room: room() }]);
    expect(state.room?.roomId).toBe("r-1");
    expect(state.room?.members).toHaveLength(1);
  });

  /**
   * The race this exists for: a page loading asks GET
   * /api/rooms/current while the socket delivers a ROOM. Those two
   * can land either way round, and the older one must not win.
   */
  it("refuses to go backwards", () => {
    const state = apply([
      { type: "ROOM", room: room({ revision: 9 }) },
      { type: "ROOM", room: room({ revision: 7 }) },
    ]);
    expect(state.room?.revision).toBe(9);
  });

  it("accepts a newer revision", () => {
    const state = apply([
      { type: "ROOM", room: room({ revision: 7 }) },
      { type: "ROOM", room: room({ revision: 8 }) },
    ]);
    expect(state.room?.revision).toBe(8);
  });

  it("sorts members by seat", () => {
    const unsorted = room({
      members: [
        {
          ...sam,
          seatNumber: 2,
          ready: false,
          isHost: false,
          selectedDeckId: null,
          selectedDeckName: null,
        },
        {
          ...pat,
          seatNumber: 1,
          ready: true,
          isHost: true,
          selectedDeckId: "d1",
          selectedDeckName: "Burn",
        },
      ],
    });
    const state = apply([{ type: "ROOM", room: unsorted }]);
    expect(state.room?.members.map((m) => m.seatNumber)).toEqual([1, 2]);
  });

  it("clears on close, and says why in English", () => {
    const state = apply([
      { type: "ROOM", room: room() },
      { type: "ROOM_CLOSED", roomId: "r-1", reason: "HOST_LEFT" },
    ]);
    expect(state.room).toBeNull();
    expect(state.notice?.detail).toContain("host left");
  });

  it("explains a reason it has never heard of without showing the code", () => {
    const state = apply([
      { type: "ROOM", room: room() },
      { type: "ROOM_CLOSED", roomId: "r-1", reason: "SOMETHING_PHASE_SIX_INVENTED" },
    ]);
    expect(state.room).toBeNull();
    expect(state.notice?.detail).not.toContain("SOMETHING");
  });

  /** A message about somebody else's room is not a reason to empty
   *  this page. */
  it("ignores a close for a different room", () => {
    const state = apply([
      { type: "ROOM", room: room() },
      { type: "ROOM_CLOSED", roomId: "r-other", reason: "EXPIRED" },
    ]);
    expect(state.room?.roomId).toBe("r-1");
  });

  /** §5.81 — removed is not the same as closed. */
  it("clears on removal too", () => {
    const state = apply([
      { type: "ROOM", room: room() },
      { type: "ROOM_REMOVED", roomId: "r-1", reason: "REMOVED_BY_HOST" },
    ]);
    expect(state.room).toBeNull();
    expect(state.notice?.detail).toContain("removed you");
  });
});

describe("invitations", () => {
  it("holds the most recent one", () => {
    const state = apply([
      { type: "INVITED", roomId: "r-1", from: pat },
      { type: "INVITED", roomId: "r-2", from: sam },
    ]);
    expect(state.invitation?.roomId).toBe("r-2");
    expect(state.invitation?.from.displayName).toBe("Sam");
  });

  /**
   * §5.5 — one room at a time.
   *
   * You would have to leave to accept, so a prompt you cannot say
   * yes to is a prompt that should not appear.
   */
  it("is ignored while you are already in a room", () => {
    const state = apply([
      { type: "ROOM", room: room() },
      { type: "INVITED", roomId: "r-2", from: sam },
    ]);
    expect(state.invitation).toBeNull();
  });

  /**
   * Seen on screen before this was fixed: "Invited Pat." sat above
   * a room Pat had already joined. Every notice is about something
   * that was ABOUT to change the room, so the room arriving makes
   * it history.
   */
  it("clears a stale notice when the room arrives", () => {
    const state = apply([
      { type: "INVITATION_SENT", to: sam },
      { type: "ROOM", room: room() },
    ]);
    expect(state.notice).toBeNull();
  });

  it("is cleared once a room arrives", () => {
    const state = apply([
      { type: "INVITED", roomId: "r-1", from: pat },
      { type: "ROOM", room: room() },
    ]);
    expect(state.invitation).toBeNull();
  });
});

describe("problems", () => {
  /** §5.100 — this message is about YOUR deck, and only yours. */
  it("keeps a setup problem for display", () => {
    const state = apply([
      {
        type: "SETUP_PROBLEM",
        roomId: "r-1",
        errorCode: "INVALID_FOR_PRESET",
        detail: "A deck must be 60 to 65 cards.",
      },
    ]);
    expect(state.setupProblem?.detail).toContain("60 to 65");
  });

  it("surfaces a refusal as a notice", () => {
    const state = apply([
      { type: "ERROR", errorCode: "USER_NOT_ONLINE", detail: "That player is not signed in." },
    ]);
    expect(state.notice).toEqual({
      kind: "error",
      errorCode: "USER_NOT_ONLINE",
      detail: "That player is not signed in.",
    });
  });
});

describe("robustness", () => {
  /**
   * A newer server must not blank an older client's page. Same
   * reason the HTTP clients ignore unknown fields.
   */
  it("ignores a message type it has never heard of", () => {
    const before = apply([{ type: "ROOM", room: room() }]);
    const after = reduceLobby(before, { type: "PHASE_SIX_THING", stuff: 1 });
    expect(after).toBe(before);
  });

  it("ignores a room payload that is missing its identity", () => {
    const state = apply([{ type: "ROOM", room: { members: [] } }]);
    expect(state.room).toBeNull();
  });

  it("drops members that make no sense rather than rendering blanks", () => {
    const state = apply([{ type: "ROOM", room: room({ members: [{ seatNumber: 1 }] as never }) }]);
    expect(state.room?.members).toHaveLength(0);
  });
});
