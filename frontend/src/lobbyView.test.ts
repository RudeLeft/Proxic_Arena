// PHASE_07 §7.64, Amendments 9 and 11 — what the Lobby decides,
// tested without a browser.

import { describe, expect, it } from "vitest";
import {
  EMPTY_LOBBY,
  reduceLobby,
  type DirectoryRoom,
  type LobbyState,
  type RoomView,
} from "./lobby";
import { clearsIn, orderRooms, playerRows, roomStateLabel } from "./lobbyView";

const me = { userId: "u-me", username: "me", displayName: "Me" };
const pat = { userId: "u-pat", username: "pat", displayName: "Pat" };
const sam = { userId: "u-sam", username: "sam", displayName: "Sam" };
const kim = { userId: "u-kim", username: "kim", displayName: "Kim" };

function listed(overrides: Partial<DirectoryRoom> = {}): DirectoryRoom {
  return {
    roomId: "r-me",
    name: "Me's room",
    hostUserId: me.userId,
    status: "OPEN",
    desiredPlayerCount: 2,
    seats: [{ seatNumber: 1, userId: me.userId, displayName: "Me", ready: false, isHost: true }],
    clearsAt: "2026-10-22T12:00:00Z",
    ...overrides,
  };
}

function myRoom(overrides: Partial<RoomView> = {}): RoomView {
  return {
    roomId: "r-me",
    name: "Me's room",
    hostUserId: me.userId,
    presetId: "OPEN_FORMAT_1V1",
    desiredPlayerCount: 2,
    status: "OPEN",
    revision: 3,
    everyoneReady: false,
    members: [
      {
        ...me,
        seatNumber: 1,
        ready: false,
        isHost: true,
        deckSelected: false,
        selectedDeckId: null,
        selectedDeckName: null,
      },
    ],
    ...overrides,
  };
}

function lobby(overrides: Partial<LobbyState> = {}): LobbyState {
  return {
    ...EMPTY_LOBBY,
    players: [me, pat, sam, kim],
    presence: [me, pat, sam],
    ...overrides,
  };
}

const row = (state: LobbyState, who: string) =>
  playerRows(state, me.userId).find((r) => r.user.userId === who)!;

describe("the players list (Amendment 11)", () => {
  it("lists everybody but you, online first, offline greyed with no button", () => {
    const rows = playerRows(lobby(), me.userId);
    expect(rows.map((r) => r.user.displayName)).toEqual(["Pat", "Sam", "Kim"]);
    expect(row(lobby(), kim.userId)).toMatchObject({
      online: false,
      where: "Offline",
      control: { kind: "none" },
    });
  });

  it("with no room, Invite is live and offers to open one", () => {
    expect(row(lobby(), pat.userId).control).toEqual({ kind: "invite", needsRoom: true });
  });

  it("a host with a free seat and nothing out may invite", () => {
    const state = lobby({ room: myRoom(), rooms: [listed()] });
    expect(row(state, pat.userId).control).toEqual({ kind: "invite", needsRoom: false });
  });

  it("one invitation at a time: the invited row says so, the others are dim", () => {
    const state = lobby({
      room: myRoom(),
      rooms: [listed()],
      outgoing: { roomId: "r-me", to: pat },
    });
    expect(row(state, pat.userId)).toMatchObject({
      control: { kind: "invited" },
      where: "Invited to Me's room",
      tone: "invited",
    });
    expect(row(state, sam.userId).control).toEqual({
      kind: "blocked",
      why: "One invitation at a time",
    });
  });

  it("a decline stays on the row until the next invitation", () => {
    const state = lobby({ room: myRoom(), rooms: [listed()], declinedBy: pat.userId });
    expect(row(state, pat.userId)).toMatchObject({
      where: "Declined your invitation",
      tone: "declined",
    });
  });

  it("somebody in another room cannot be invited, and somebody in a match says so", () => {
    const theirs = listed({
      roomId: "r-sam",
      name: "Late night",
      hostUserId: sam.userId,
      seats: [{ seatNumber: 1, userId: sam.userId, displayName: "Sam", ready: true, isHost: true }],
    });
    const playing = listed({
      roomId: "r-pat",
      status: "IN_MATCH",
      hostUserId: pat.userId,
      seats: [{ seatNumber: 1, userId: pat.userId, displayName: "Pat", ready: true, isHost: true }],
    });
    const state = lobby({ rooms: [theirs, playing] });
    expect(row(state, sam.userId)).toMatchObject({
      where: "In Late night",
      control: { kind: "blocked", why: "Sam is already in a room" },
    });
    expect(row(state, pat.userId).where).toBe("In a match");
  });

  it("a guest does not invite, and a full room has no seat to offer", () => {
    const asGuest = lobby({
      room: myRoom({ hostUserId: pat.userId }),
      rooms: [listed({ hostUserId: pat.userId })],
    });
    expect(row(asGuest, sam.userId).control).toMatchObject({ kind: "blocked" });

    const full = myRoom({
      members: [
        ...myRoom().members,
        {
          ...pat,
          seatNumber: 2,
          ready: false,
          isHost: false,
          deckSelected: false,
          selectedDeckId: null,
          selectedDeckName: null,
        },
      ],
    });
    const state = lobby({ room: full, rooms: [] });
    expect(row(state, sam.userId).control).toEqual({
      kind: "blocked",
      why: "Your room has no free seat",
    });
  });
});

describe("rooms", () => {
  it("reads its state in words", () => {
    expect(roomStateLabel(listed())).toBe("Open seat");
    expect(
      roomStateLabel(
        listed({
          seats: [
            ...listed().seats,
            { seatNumber: 2, userId: "x", displayName: "X", ready: false, isHost: false },
          ],
        }),
      ),
    ).toBe("Setting up");
    expect(roomStateLabel(listed({ status: "READY_FOR_MATCH" }))).toBe("Starting");
    expect(roomStateLabel(listed({ status: "IN_MATCH" }))).toBe("In a match");
  });

  it("says how long until an idle room clears", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    expect(clearsIn("2026-10-22T11:30:00Z", now)).toBe("23h");
    expect(clearsIn("2026-10-21T12:45:00Z", now)).toBe("45m");
    expect(clearsIn("2026-10-21T12:00:30Z", now)).toBe("now");
    expect(clearsIn(null, now)).toBeNull();
  });

  it("pins yours first, then soonest to clear, rooms in a match last", () => {
    const a = listed({ roomId: "a", clearsAt: "2026-10-22T09:00:00Z" });
    const b = listed({ roomId: "b", clearsAt: "2026-10-22T08:00:00Z" });
    const c = listed({ roomId: "c", status: "IN_MATCH", clearsAt: null });
    const mine = listed({ roomId: "mine", clearsAt: "2026-10-22T23:00:00Z" });
    expect(orderRooms([c, a, mine, b], "mine").map((r) => r.roomId)).toEqual([
      "mine",
      "b",
      "a",
      "c",
    ]);
  });
});

describe("the lobby's new messages (§7.64, Amendment 11)", () => {
  it("takes the room list and the players as sent", () => {
    let state = reduceLobby(EMPTY_LOBBY, {
      type: "ROOMS",
      rooms: [{ ...listed(), seats: [{ ...listed().seats[0], deckId: "never" }] }],
    });
    expect(state.rooms[0]?.name).toBe("Me's room");
    // Whatever arrives, the page keeps seats, never decks.
    expect(JSON.stringify(state.rooms)).not.toContain("deck");
    state = reduceLobby(state, { type: "PLAYERS", players: [pat, kim] });
    expect(state.players.map((p) => p.displayName)).toEqual(["Kim", "Pat"]);
  });

  it("tracks the invitation a host has out, and a decline ends it with a note", () => {
    let state = reduceLobby(lobby({ declinedBy: sam.userId }), {
      type: "INVITATION_SENT",
      roomId: "r-me",
      to: pat,
    });
    expect(state.outgoing).toEqual({ roomId: "r-me", to: pat });
    expect(state.declinedBy).toBeNull();
    state = reduceLobby(state, {
      type: "INVITATION_ENDED",
      direction: "FROM_YOU",
      reason: "DECLINED",
      roomId: "r-me",
      other: { userId: pat.userId, displayName: "Pat" },
    });
    expect(state.outgoing).toBeNull();
    expect(state.declinedBy).toBe(pat.userId);
  });

  it("an invitation withdrawn from you says so; your own decline does not", () => {
    const invited = reduceLobby(EMPTY_LOBBY, {
      type: "INVITED",
      roomId: "r-pat",
      roomName: "Kitchen Table",
      from: pat,
    });
    expect(invited.invitation?.roomName).toBe("Kitchen Table");

    const withdrawn = reduceLobby(invited, {
      type: "INVITATION_ENDED",
      direction: "TO_YOU",
      reason: "WITHDRAWN",
      roomId: "r-pat",
      other: { userId: pat.userId, displayName: "Pat" },
    });
    expect(withdrawn.invitation).toBeNull();
    expect(withdrawn.invitationGone).toEqual({ fromDisplayName: "Pat", reason: "WITHDRAWN" });

    const declined = reduceLobby(invited, {
      type: "INVITATION_ENDED",
      direction: "TO_YOU",
      reason: "DECLINED",
      roomId: "r-pat",
      other: { userId: pat.userId, displayName: "Pat" },
    });
    expect(declined.invitation).toBeNull();
    expect(declined.invitationGone).toBeNull();
  });

  it("accepting a moment too late reads as the invitation having gone", () => {
    const invited = reduceLobby(EMPTY_LOBBY, {
      type: "INVITED",
      roomId: "r-pat",
      roomName: "Kitchen Table",
      from: pat,
    });
    const late = reduceLobby(invited, {
      type: "ERROR",
      errorCode: "INVITATION_GONE",
      detail: "That invitation is no longer open.",
    });
    expect(late.invitation).toBeNull();
    expect(late.invitationGone).toEqual({ fromDisplayName: "Pat", reason: "GONE" });
    expect(late.notice).toBeNull();
  });
});
