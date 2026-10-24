// Spec 0007 — the chat's rules, tested without a browser: reactions,
// lobby events from the room list, runs of lines and the unread count.

import { describe, expect, it } from "vitest";
import {
  EMPTY_LOBBY,
  lobbyEvents,
  reduceLobby,
  type ChatLine,
  type DirectoryRoom,
  type LobbyState,
} from "./lobby";
import { chatItems, unreadAfter } from "./lobbyView";

const pat = { userId: "u-pat", username: "Pat", displayName: "Pat" };
const sam = { userId: "u-sam", username: "Sam", displayName: "Sam" };

const apply = (messages: Record<string, unknown>[], from: LobbyState = EMPTY_LOBBY) =>
  messages.reduce(reduceLobby, from);

const say = (id: string, who = pat, text = "hi") => ({
  type: "CHAT",
  messageId: id,
  from: who,
  text,
  sentAt: "2026-10-24T20:14:00Z",
});
const react = (lineId: string, emoji: string, who = sam, on = true) => ({
  type: "REACTION",
  lineId,
  emoji,
  on,
  from: who,
});

function directory(overrides: Partial<DirectoryRoom> = {}): DirectoryRoom {
  return {
    roomId: "r-1",
    name: "Pat's room",
    hostUserId: "u-pat",
    status: "OPEN",
    desiredPlayerCount: 2,
    seats: [{ seatNumber: 1, userId: "u-pat", displayName: "Pat", ready: false, isHost: true }],
    clearsAt: null,
    ...overrides,
  };
}
const samSeat = { seatNumber: 2, userId: "u-sam", displayName: "Sam", ready: false, isHost: false };

describe("reactions (C4)", () => {
  it("puts a reaction on the line, by who, and takes it back", () => {
    let state = apply([say("m1"), react("m1", "😂"), react("m1", "😂", pat)]);
    expect(state.chat[0]?.reactions).toEqual({ "😂": ["u-sam", "u-pat"] });
    state = apply([react("m1", "😂", sam, false)], state);
    expect(state.chat[0]?.reactions).toEqual({ "😂": ["u-pat"] });
    state = apply([react("m1", "😂", pat, false)], state);
    expect(state.chat[0]?.reactions).toEqual({});
  });

  it("counts one of each per person, however often it arrives", () => {
    const state = apply([say("m1"), react("m1", "👍"), react("m1", "👍")]);
    expect(state.chat[0]?.reactions?.["👍"]).toEqual(["u-sam"]);
  });

  it("ignores a line it never saw, and anything outside the six", () => {
    const before = apply([say("m1")]);
    expect(apply([react("m-gone", "👍")], before)).toBe(before);
    expect(apply([react("m1", "🍕")], before)).toBe(before);
  });
});

describe("lobby events (C5)", () => {
  it("the first room list on a connection is where things stand, not news", () => {
    const state = apply([{ type: "ROOMS", messageId: "a", rooms: [directory()] }]);
    expect(state.events).toEqual([]);
    expect(state.roomsKnown).toBe(true);
  });

  it("posts what changed after it, after the line it followed", () => {
    const state = apply([
      { type: "ROOMS", messageId: "a", rooms: [] },
      say("m1"),
      { type: "ROOMS", messageId: "b", rooms: [directory()] },
    ]);
    expect(state.events).toEqual([{ id: "b-0", text: "Pat opened a room", afterLineId: "m1" }]);
  });

  it("says each change in plain words", () => {
    const open = directory({ name: "Friday night" });
    const full = { ...open, seats: [...open.seats, samSeat] };
    const playing = { ...full, status: "IN_MATCH" };
    expect(lobbyEvents([], [open])).toEqual(["Pat opened Friday night"]);
    expect(lobbyEvents([], [directory()])).toEqual(["Pat opened a room"]);
    expect(lobbyEvents([open], [full])).toEqual(["Sam joined Friday night"]);
    expect(lobbyEvents([full], [open])).toEqual(["Sam left Friday night"]);
    expect(lobbyEvents([full], [playing])).toEqual(["Pat and Sam started a game"]);
    expect(lobbyEvents([playing], [full])).toEqual(["Pat and Sam's game ended"]);
    expect(lobbyEvents([playing], [])).toEqual(["Pat and Sam's game ended"]);
    expect(lobbyEvents([open], [])).toEqual(["Friday night closed"]);
  });

  it("says nothing about what the list does not show: readiness, decks, invitations", () => {
    const open = directory();
    const ready = { ...open, seats: [{ ...open.seats[0]!, ready: true }] };
    const starting = { ...open, status: "READY_FOR_MATCH" };
    expect(lobbyEvents([open], [ready])).toEqual([]);
    expect(lobbyEvents([open], [starting])).toEqual([]);
    expect(lobbyEvents([open], [open])).toEqual([]);
  });
});

describe("the log (C1, C6, C7)", () => {
  const line = (id: string, who = pat): ChatLine => ({
    id,
    fromUserId: who.userId,
    displayName: who.displayName,
    text: id,
    sentAt: "",
  });

  it("puts a run of lines from one person in one bubble; an event breaks it", () => {
    const items = chatItems(
      [line("a"), line("b"), line("c", sam), line("d", sam)],
      [{ id: "e1", text: "Sam joined Friday night", afterLineId: "c" }],
      null,
    );
    expect(
      items.map((i) => (i.kind === "run" ? i.lines.map((l) => l.id).join("") : i.kind)),
    ).toEqual(["ab", "c", "event", "d"]);
  });

  it("puts New before the first unread line, and early events first", () => {
    const items = chatItems(
      [line("a"), line("b", sam)],
      [{ id: "e0", text: "Pat opened a room", afterLineId: null }],
      "b",
    );
    expect(items.map((i) => i.kind)).toEqual(["event", "run", "new", "run"]);
  });

  it("counts only other people's lines after the last one seen", () => {
    const chat = [line("a"), line("b", sam), line("c"), line("d", sam)];
    expect(unreadAfter(chat, "b", "u-sam").map((l) => l.id)).toEqual(["c"]);
    expect(unreadAfter(chat, "d", "u-sam")).toEqual([]);
    expect(unreadAfter(chat, null, "u-pat").map((l) => l.id)).toEqual(["b", "d"]);
  });
});
