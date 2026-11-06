// Spec 0056 — an update waits for games to finish: the lobby's reason
// (F-0056-A), the notice in a game (F-0056-B), the admin's "safe to update"
// (F-0056-C) and a game the server stopped under, said as the update and
// never as a result (F-0056-D).

import { describe, expect, it } from "vitest";
import {
  EMPTY_LOBBY,
  UPDATE_WAITING_ROOM,
  reduceLobby,
  updateReason,
  type MatchView,
  type RoomView,
} from "./lobby";
import { EMPTY_MATCH, reduceMatch, type Snapshot } from "./match";
import { SERVER_UPDATE_WORDS, resultText, serverWasUpdated } from "./matchText";
import { updateNoticeFor, updateWaitingNotice, versionWaits } from "./notices";
import { SAFE_TO_UPDATE, runningGameText } from "./admin";
import { endingWords } from "./battlefield/GameScreen";

const room = (status: string) => ({ roomId: "r1", status }) as unknown as RoomView;

const match = (more: Partial<MatchView> = {}): MatchView => ({
  matchId: "m1",
  status: "RUNNING",
  failureCode: null,
  participants: [
    { userId: "u1", seatNumber: 1, deckName: "Mono Red" },
    { userId: "u2", seatNumber: 2, deckName: null },
  ],
  outcome: null,
  ...more,
});

const board = {
  seat: 1,
  spectator: false,
  players: [
    { seat: 1, name: "RudeLeft", life: 20 },
    { seat: 2, name: "Pat", life: 0 },
  ],
} as unknown as Snapshot;

describe("the lobby while an update waits (F-0056-A)", () => {
  it("hears it switched on and off, and ignores a garbled message", () => {
    const on = reduceLobby(EMPTY_LOBBY, { type: "UPDATE_WAITING", on: true });
    expect(on.updateWaiting).toBe(true);
    expect(reduceLobby(on, { type: "UPDATE_WAITING", on: false }).updateWaiting).toBe(false);
    expect(reduceLobby(on, { type: "UPDATE_WAITING" })).toBe(on);
    expect(EMPTY_LOBBY.updateWaiting).toBe(false);
  });

  it("a room waiting in the lobby says why it cannot start, in the owner's words", () => {
    const on = reduceLobby(EMPTY_LOBBY, { type: "UPDATE_WAITING", on: true });
    expect(updateReason(on, room("OPEN"))).toBe(
      "An update is coming. New games can start again once it's done (usually a few minutes).",
    );
    expect(updateReason(on, room("READY_FOR_MATCH"))).toBe(UPDATE_WAITING_ROOM);
    // A game already being played is not stopped, and its room says nothing.
    expect(updateReason(on, room("IN_MATCH"))).toBeNull();
    expect(updateReason(EMPTY_LOBBY, room("OPEN"))).toBeNull();
  });
});

describe("the notice in a game (F-0056-B)", () => {
  it("says it plainly and stays: no close, no fade, nothing to click", () => {
    const notice = updateWaitingNotice();
    expect(`${notice.title} — ${notice.line}`).toBe(
      "An update is waiting — Finish your game as usual; no new games will start until the update is done.",
    );
    expect(notice.close).toBeUndefined();
    expect(notice.fadeMs).toBeUndefined();
    expect(notice.actions).toEqual([]);
  });
});

describe("who sees the notice (F-0056-B)", () => {
  it("a player in a game, while it waits; nobody once it is off or the game is over", () => {
    const playing = versionWaits("/game", "RUNNING");
    expect(updateNoticeFor(true, playing)?.key).toBe("update-waiting");
    expect(updateNoticeFor(false, playing)).toBeNull();
    expect(updateNoticeFor(true, versionWaits("/play", null))).toBeNull();
    expect(updateNoticeFor(true, versionWaits("/game", "ENDED"))).toBeNull();
  });
});

describe("the Admin page's running games (F-0056-C)", () => {
  it("names who is playing and the turn, and says when it is safe", () => {
    expect(runningGameText({ matchId: "m", players: "RudeLeft vs Pat", turn: 9 })).toBe(
      "RudeLeft vs Pat · turn 9",
    );
    expect(runningGameText({ matchId: "m", players: "RudeLeft vs Pat", turn: null })).toBe(
      "RudeLeft vs Pat",
    );
    expect(SAFE_TO_UPDATE).toBe("No games running: safe to update now.");
  });
});

describe("a game the server stopped under (F-0056-D)", () => {
  const words =
    "The server is being updated. This game couldn't be finished before the update. " +
    "It isn't counted as a win or a loss. Your room is still here.";

  it("the server's word on the game socket ends the game and clears any question", () => {
    const asked = { ...EMPTY_MATCH, awaiting: 3 };
    const stopped = reduceMatch(asked, { type: "SERVER_STOPPING" });
    expect(stopped.serverStopping).toBe(true);
    expect(stopped.decision).toBeNull();
    expect(stopped.awaiting).toBeNull();
  });

  it("is said as the update, at the stop and after the restart's recovery", () => {
    expect(SERVER_UPDATE_WORDS).toBe(words);
    const recovered = match({ status: "FAILED_RUNTIME", failureCode: "SERVER_RESTARTED" });
    expect(serverWasUpdated(recovered)).toBe(true);
    expect(resultText(recovered, 1)).toBe(words);
    // Told on the socket before the match itself has ended.
    expect(serverWasUpdated(match(), true)).toBe(true);
  });

  it("the banner never shows a result or a plain game over", () => {
    const stopped = match({ status: "FAILED_RUNTIME", failureCode: "SERVER_RESTARTED" });
    for (const shown of [board, null]) {
      const ending = endingWords(stopped, shown, true, resultText(stopped, 1));
      expect(ending).toEqual({
        word: "The server is being updated",
        sub: "This game couldn't be finished before the update. It isn't counted as a win or a loss. Your room is still here.",
        turn: "",
      });
      expect(JSON.stringify(ending)).not.toMatch(/won|lost|Game over/);
    }
  });

  it("any other stop keeps its own words", () => {
    const fault = match({ status: "FAILED_RUNTIME", failureCode: "WORKER_STOPPED" });
    expect(serverWasUpdated(fault)).toBe(false);
    expect(resultText(fault, 1)).toBe("The game stopped before it finished. Nobody won it.");
    expect(endingWords(fault, board, false, "").word).toBe("Game over");
  });
});
