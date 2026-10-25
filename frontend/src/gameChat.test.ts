import { describe, expect, it } from "vitest";
import { EMPTY_LOBBY, reduceLobby } from "./lobby";

/** Spec 0013, F-0013-B — the game's chat and the lobby's never mix. */

const from = { userId: "u-pat", username: "pat", displayName: "Pat" };
const line = (id: string, text: string, scope?: string) => ({
  type: "CHAT",
  messageId: id,
  from,
  text,
  sentAt: "2026-10-25T20:15:00Z",
  ...(scope ? { scope } : {}),
});

describe("game chat", () => {
  it("a game line goes to the game's chat, a lobby line to the lobby's", () => {
    let state = reduceLobby(EMPTY_LOBBY, line("g1", "gg", "game"));
    state = reduceLobby(state, line("l1", "anyone up?"));
    expect(state.gameChat.map((l) => l.text)).toEqual(["gg"]);
    expect(state.chat.map((l) => l.text)).toEqual(["anyone up?"]);
  });

  it("a reaction lands on the list the server names", () => {
    let state = reduceLobby(EMPTY_LOBBY, line("g1", "gg", "game"));
    state = reduceLobby(state, line("l1", "hi"));
    state = reduceLobby(state, {
      type: "REACTION",
      lineId: "g1",
      emoji: "😂",
      on: true,
      from,
      scope: "game",
    });
    expect(state.gameChat[0]?.reactions).toEqual({ "😂": ["u-pat"] });
    expect(state.chat[0]?.reactions).toBeUndefined();
    // A lobby reaction on a game line's id finds nothing in the lobby's list.
    const unchanged = reduceLobby(state, {
      type: "REACTION",
      lineId: "g1",
      emoji: "👍",
      on: true,
      from,
    });
    expect(unchanged).toBe(state);
  });
});
