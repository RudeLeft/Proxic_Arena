// Spec 0016 — the room list as everybody reads it (R1-R4), and the
// messages of Ask to join (R3) and of a declined invitation (16).

import { describe, expect, it } from "vitest";
import { EMPTY_LOBBY, reduceLobby, type DirectoryRoom, type LobbyState } from "./lobby";
import { roomAction, roomLine, sortRooms } from "./lobbyView";

const host = {
  seatNumber: 1,
  userId: "u-rude",
  displayName: "RudeLeft",
  ready: true,
  isHost: true,
};
const sam = { seatNumber: 2, userId: "u-sam", displayName: "Sam", ready: false, isHost: false };

function room(overrides: Partial<DirectoryRoom> = {}): DirectoryRoom {
  return {
    roomId: "r-1",
    name: "RudeLeft's room",
    hostUserId: host.userId,
    status: "OPEN",
    desiredPlayerCount: 2,
    seats: [host],
    clearsAt: "2026-10-27T12:00:00Z",
    held: null,
    ...overrides,
  };
}

const lobby = (overrides: Partial<LobbyState> = {}): LobbyState => ({
  ...EMPTY_LOBBY,
  ...overrides,
});

describe("roomLine (R1, R2)", () => {
  it("says where a room stands, held seats included", () => {
    expect(roomLine(room())).toEqual({ text: "1 seat open", tone: "open" });
    expect(roomLine(room({ held: { userId: "u-pat", displayName: "Pat", asked: false } }))).toEqual(
      { text: "Waiting on Pat's answer", tone: "held" },
    );
    // A request waits on the host, not on the asker.
    expect(
      roomLine(room({ held: { userId: "u-pat", displayName: "Pat", asked: true } })).text,
    ).toBe("Waiting on RudeLeft's answer");
    expect(roomLine(room({ seats: [host, sam] })).text).toBe("Choosing decks");
    expect(roomLine(room({ seats: [host, { ...sam, ready: true }] })).text).toBe("Ready to start");
    expect(roomLine(room({ status: "READY_FOR_MATCH", seats: [host, sam] })).text).toBe(
      "Starting…",
    );
    expect(roomLine(room({ status: "IN_MATCH", seats: [host, sam] }))).toEqual({
      text: "In a game",
      tone: "playing",
    });
  });
});

describe("roomAction (R3)", () => {
  it("offers Ask to join only for a free seat, to somebody free", () => {
    expect(roomAction(room(), lobby(), "u-pat").kind).toBe("ask");
    // Not your own room, nor a held seat, a full room or a room in a game.
    expect(roomAction(room(), lobby(), host.userId).kind).toBe("none");
    expect(
      roomAction(
        room({ held: { userId: "u-sam", displayName: "Sam", asked: true } }),
        lobby(),
        "u-pat",
      ).kind,
    ).toBe("none");
    expect(roomAction(room({ seats: [host, sam] }), lobby(), "u-pat").kind).toBe("none");
    expect(roomAction(room({ status: "IN_MATCH" }), lobby(), "u-pat").kind).toBe("none");
  });

  it("says what you hold: an invitation to accept, a request to cancel", () => {
    const invited = lobby({
      invitation: {
        roomId: "r-1",
        roomName: "RudeLeft's room",
        from: { userId: host.userId, username: "rudeleft", displayName: "RudeLeft" },
      },
    });
    expect(roomAction(room(), invited, "u-pat").kind).toBe("invited");
    // ...and holding one, you cannot ask anywhere else.
    expect(roomAction(room({ roomId: "r-2" }), invited, "u-pat").kind).toBe("none");
    const asking = lobby({
      asking: {
        roomId: "r-1",
        roomName: "RudeLeft's room",
        host: { userId: host.userId, displayName: "RudeLeft" },
      },
    });
    expect(roomAction(room(), asking, "u-pat").kind).toBe("asked");
  });
});

describe("sortRooms (R4)", () => {
  it("puts your invitation first, then open seats, then full rooms, then games", () => {
    const playing = room({
      roomId: "playing",
      status: "IN_MATCH",
      seats: [host, sam],
      clearsAt: null,
    });
    const full = room({ roomId: "full", seats: [host, sam] });
    const open = room({ roomId: "open" });
    const mine = room({ roomId: "mine" });
    const invited = lobby({
      invitation: {
        roomId: "mine",
        roomName: "x",
        from: { userId: host.userId, username: "rudeleft", displayName: "RudeLeft" },
      },
    });
    expect(sortRooms([playing, full, open, mine], invited).map((r) => r.roomId)).toEqual([
      "mine",
      "open",
      "full",
      "playing",
    ]);
  });
});

describe("Ask to join messages", () => {
  it("tracks your request, and tells you when the host declines it", () => {
    let state = reduceLobby(EMPTY_LOBBY, {
      type: "JOIN_ASK_SENT",
      roomId: "r-1",
      roomName: "RudeLeft's room",
      host: { userId: host.userId, displayName: "RudeLeft" },
    });
    expect(state.asking?.roomId).toBe("r-1");
    state = reduceLobby(state, {
      type: "INVITATION_ENDED",
      roomId: "r-1",
      reason: "DECLINED",
      direction: "FROM_YOU",
      asked: true,
      other: { userId: host.userId, displayName: "RudeLeft" },
    });
    expect(state.asking).toBeNull();
    expect(state.news).toBe("RudeLeft declined your request to join");
  });

  it("taking your own request back says nothing", () => {
    const state = reduceLobby(
      {
        ...EMPTY_LOBBY,
        asking: { roomId: "r-1", roomName: "x", host: { userId: "h", displayName: "H" } },
      },
      {
        type: "INVITATION_ENDED",
        roomId: "r-1",
        reason: "WITHDRAWN",
        direction: "FROM_YOU",
        asked: true,
        other: {},
      },
    );
    expect(state.asking).toBeNull();
    expect(state.news).toBeNull();
  });

  it("gives the host the request, and takes it away when it ends", () => {
    let state = reduceLobby(EMPTY_LOBBY, {
      type: "JOIN_ASKED",
      roomId: "r-1",
      from: { userId: "u-pat", displayName: "Pat" },
    });
    expect(state.askedBy).toEqual({ roomId: "r-1", from: { userId: "u-pat", displayName: "Pat" } });
    state = reduceLobby(state, {
      type: "INVITATION_ENDED",
      roomId: "r-1",
      reason: "WITHDRAWN",
      direction: "TO_YOU",
      asked: true,
      other: { userId: "u-pat", displayName: "Pat" },
    });
    expect(state.askedBy).toBeNull();
  });

  it("tells the host when the invited player declines (16)", () => {
    const state = reduceLobby(EMPTY_LOBBY, {
      type: "INVITATION_ENDED",
      roomId: "r-1",
      reason: "DECLINED",
      direction: "FROM_YOU",
      other: { userId: "u-pat", displayName: "Pat" },
    });
    expect(state.news).toBe("Pat declined your invitation");
    expect(state.declinedBy).toBe("u-pat");
  });

  it("reads who a seat is held for from the room list", () => {
    const state = reduceLobby(EMPTY_LOBBY, {
      type: "ROOMS",
      rooms: [
        {
          roomId: "r-1",
          name: "RudeLeft's room",
          hostUserId: host.userId,
          status: "OPEN",
          desiredPlayerCount: 2,
          seats: [host],
          clearsAt: null,
          held: { userId: "u-pat", displayName: "Pat", asked: true },
        },
      ],
    });
    expect(state.rooms[0]?.held).toEqual({ userId: "u-pat", displayName: "Pat", asked: true });
  });
});
