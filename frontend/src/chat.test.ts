// Spec 0007 — the chat's rules, tested without a browser: reactions,
// runs of lines and the unread count.

import { describe, expect, it } from "vitest";
import { EMPTY_LOBBY, reduceLobby, type ChatLine, type LobbyState } from "./lobby";
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

describe("the log (C1, C6, C7)", () => {
  const line = (id: string, who = pat): ChatLine => ({
    id,
    fromUserId: who.userId,
    displayName: who.displayName,
    text: id,
    sentAt: "",
  });

  it("puts a run of lines from one person in one bubble", () => {
    const items = chatItems(
      [line("a"), line("b"), line("c", sam), line("d", sam), line("e")],
      null,
    );
    expect(
      items.map((i) => (i.kind === "run" ? i.lines.map((l) => l.id).join("") : i.kind)),
    ).toEqual(["ab", "cd", "e"]);
  });

  it("puts New before the first unread line", () => {
    const items = chatItems([line("a"), line("b", sam)], "b");
    expect(items.map((i) => i.kind)).toEqual(["run", "new", "run"]);
  });

  it("counts only other people's lines after the last one seen", () => {
    const chat = [line("a"), line("b", sam), line("c"), line("d", sam)];
    expect(unreadAfter(chat, "b", "u-sam").map((l) => l.id)).toEqual(["c"]);
    expect(unreadAfter(chat, "d", "u-sam")).toEqual([]);
    expect(unreadAfter(chat, null, "u-pat").map((l) => l.id)).toEqual(["b", "d"]);
  });
});
