// Spec 0050 — the notice stack's rules and words (F-0050-C, F-0050-D).

import { describe, expect, it } from "vitest";
import {
  arrange,
  asTitle,
  goneOf,
  inArrival,
  lobbyNoticeOf,
  newsOf,
  questionArrived,
  questionKey,
  splitSentence,
  versionWaits,
  type Notice,
} from "./notices";

const note = (key: string): Notice => ({ key, tone: "gold", label: "L", title: key, actions: [] });

describe("the stack", () => {
  it("shows the newest three on top, and counts the rest", () => {
    expect(arrange(["a", "b"])).toEqual({ shown: ["b", "a"], more: 0 });
    expect(arrange(["a", "b", "c", "d", "e"])).toEqual({ shown: ["e", "d", "c"], more: 2 });
  });

  it("closing one brings the next up", () => {
    const list = ["a", "b", "c", "d"];
    expect(arrange(list).shown).toEqual(["d", "c", "b"]);
    expect(arrange(list.filter((k) => k !== "c")).shown).toEqual(["d", "b", "a"]);
  });

  it("a notice that stays keeps its place; a new one goes on top", () => {
    const seen = new Map<string, number>();
    expect(inArrival([note("invite")], seen).map((n) => n.key)).toEqual(["invite"]);
    // Built in a different order next time: arrival still decides.
    expect(inArrival([note("news"), note("invite")], seen).map((n) => n.key)).toEqual([
      "invite",
      "news",
    ]);
    // Gone, then back: it is new again.
    inArrival([note("news")], seen);
    expect(inArrival([note("invite"), note("news")], seen).map((n) => n.key)).toEqual([
      "news",
      "invite",
    ]);
  });
});

describe("the words", () => {
  it("titles have no full stop; a two-sentence message splits", () => {
    expect(asTitle("The host left, so the room closed.")).toBe("The host left, so the room closed");
    expect(
      splitSentence("The match was abandoned. Nobody won it, and the room is open again."),
    ).toEqual({
      title: "The match was abandoned",
      line: "Nobody won it, and the room is open again.",
    });
  });

  it("each piece of news says what to do next", () => {
    expect(newsOf("Pat declined your invitation")).toEqual({
      label: "Invitation",
      title: "Pat declined your invitation",
      line: "Your room is still open. Invite someone else from Players.",
    });
    expect(newsOf("RudeLeft declined your request to join").line).toBe(
      "You can ask again, or open your own room.",
    );
    // Spec 0041 Amendment 3 — a rename is its own news, in one sentence.
    expect(newsOf("An administrator changed your display name to Patty.")).toEqual({
      label: "Account",
      title: "An administrator changed your display name to Patty.",
    });
    expect(goneOf({ reason: "WITHDRAWN", fromDisplayName: "RudeLeft" })).toEqual({
      label: "Invitation",
      title: "RudeLeft withdrew the invitation",
      line: "The seat is no longer held for you.",
    });
  });

  it("a closed room and an abandoned match are news; refusals and failed starts are problems", () => {
    expect(
      lobbyNoticeOf({
        kind: "info",
        errorCode: "ROOM_REMOVED",
        detail: "The host removed you from the room.",
      }),
    ).toEqual({
      label: "Room",
      title: "The host removed you from the room",
      line: "You can open your own room or ask to join another.",
      problem: false,
    });
    expect(
      lobbyNoticeOf({
        kind: "error",
        errorCode: "DECK_UNAVAILABLE",
        detail: "A deck could not be read, so the match did not start. The room is open again.",
        aboutMatch: true,
      }),
    ).toMatchObject({ title: "The match did not start", problem: true });
    expect(
      lobbyNoticeOf({
        kind: "error",
        errorCode: "STALE",
        detail: "The room changed while you were deciding.",
      }),
    ).toMatchObject({
      title: "That couldn't be done",
      line: "The room changed while you were deciding.",
      problem: true,
    });
  });
});

describe("a new version, and the chime", () => {
  it("a new version waits while a game is being played, and shows once it is over (F-0050-H)", () => {
    expect(versionWaits("/game", "RUNNING")).toBe(true);
    expect(versionWaits("/game", "LAUNCHING")).toBe(true);
    expect(versionWaits("/game", "ENDED")).toBe(false);
    expect(versionWaits("/game", "TERMINATED")).toBe(false);
    expect(versionWaits("/play", "RUNNING")).toBe(false);
    expect(versionWaits("/game", null)).toBe(false);
  });

  it("chimes when a question arrives, not when one goes or stays (F-0050-I)", () => {
    const none = questionKey(null, null);
    const invited = questionKey("room-1", null);
    expect(questionArrived(none, invited)).toBe(true);
    expect(questionArrived(invited, invited)).toBe(false);
    expect(questionArrived(invited, none)).toBe(false);
    expect(questionArrived(invited, questionKey("room-1", "pat"))).toBe(true);
    expect(questionArrived(invited, questionKey("room-2", null))).toBe(true);
  });
});
