// Spec 0019 — the deck check both players see, the Belt holder, and what
// each Hall of Champions badge means.

import { describe, expect, it } from "vitest";
import { badgeTip } from "./hall";
import { EMPTY_LOBBY, reduceLobby, type LobbyState, type RoomView } from "./lobby";
import { holdsBelt } from "./lobbyView";

const inRoom = { ...EMPTY_LOBBY, room: { roomId: "r-1", revision: 3 } as RoomView } as LobbyState;

describe("the deck check (F-0019-A)", () => {
  it("shows for the room it is about, and stops when the room moves on", () => {
    let state = reduceLobby(inRoom, { type: "ROOM_CHECKING", roomId: "r-1", checking: true });
    expect(state.checking).toBe("r-1");
    state = reduceLobby(state, { type: "ROOM_CHECKING", roomId: "r-1", checking: false });
    expect(state.checking).toBeNull();
    // Another room's check is not ours.
    expect(
      reduceLobby(inRoom, { type: "ROOM_CHECKING", roomId: "r-9", checking: true }).checking,
    ).toBeNull();
  });
});

describe("the Belt holder (F1)", () => {
  it("comes with the standings", () => {
    const state = reduceLobby(EMPTY_LOBBY, { type: "STANDINGS", podium: [], belt: "u-pat" });
    expect(holdsBelt(state, "u-pat")).toBe(true);
    expect(holdsBelt(state, "u-ash")).toBe(false);
    expect(holdsBelt(EMPTY_LOBBY, "u-pat")).toBe(false);
  });
});

describe("badge tooltips (9)", () => {
  it("say how each badge was earned", () => {
    expect(badgeTip({ key: "on-fire", label: "On Fire · 4" })).toBe(
      "4 wins in a row (a loss or a draw ends the run).",
    );
    expect(badgeTip({ key: "giant-slayer", label: "Giant Slayer" })).toBe(
      "Beat the player leading the season, this season.",
    );
    for (const key of ["belt", "speed-demon", "never-conceded", "deck-master"]) {
      expect(badgeTip({ key, label: "x" })).not.toBe("x");
    }
  });
});
