// Spec 0114 (F-0114-D) -- the player pages' words, row by row
// (docs/features/wording/0114-wording-table.md). The words built in plain
// functions are asserted here; the words drawn by a page are asserted by
// rendering it, in wording0114pages.test.tsx.

import { describe, expect, it } from "vitest";
import { login } from "./auth";
import { ICON_SHEETS } from "./deckIcons";
import { displayNameMissing, MAX_DISPLAY_NAME, passwordMissing, passwordRule } from "./fieldChecks";
import {
  badgeName,
  badgeTip,
  defendText,
  everyDays,
  formWords,
  heldFor,
  latestText,
  moveWords,
  shortDate,
  timeLeft,
  winsTo,
  wonText,
} from "./hall";
import {
  EMPTY_LOBBY,
  idleWords,
  reduceLobby,
  REQUEST_TAKEN_BACK,
  type DirectoryRoom,
  type LobbyState,
  type RoomView,
} from "./lobby";
import { agoText, closesSoon, playerRows, roomLine, statusOf } from "./lobbyView";
import { lobbyNoticeOf, newsOf, setupProblemLine } from "./notices";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

const apply = (messages: Record<string, unknown>[], from: LobbyState = EMPTY_LOBBY) =>
  messages.reduce(reduceLobby, from);

const respond = (status: number, body: unknown) => () =>
  Promise.resolve(
    new Response(body === null ? "<html>Bad gateway</html>" : JSON.stringify(body), {
      status,
      headers: { "Content-Type": body === null ? "text/html" : "application/json" },
    }),
  );

const listed = (over: Partial<DirectoryRoom> = {}): DirectoryRoom => ({
  roomId: "r-1",
  name: "Pat's room",
  hostUserId: "u-pat",
  status: "OPEN",
  desiredPlayerCount: 2,
  seats: [{ seatNumber: 1, userId: "u-pat", displayName: "Pat", ready: false, isHost: true }],
  clearsAt: null,
  held: null,
  ...over,
});

describe("W2-002..W2-007: the password and display-name checks", () => {
  it("W2-002, W2-003, W2-004: the password's rule line", () => {
    expect(passwordRule("")).toBe("At least 12 characters");
    expect(passwordRule("abcdefghi")).toBe("At least 12 characters: three more to go");
    expect(passwordRule("abcdefghijk")).toBe("At least 12 characters: one more to go");
    expect(passwordRule(" ".repeat(12))).toBe("It can't be only spaces");
  });

  it("W2-005, W2-006: what a password still needs", () => {
    expect(passwordMissing("", "x")[0]).toBe("a password of at least 12 characters");
    expect(passwordMissing("abcdefghijk", "x")[0]).toBe("one more password character");
    expect(passwordMissing("abcdefghi", "x")[0]).toBe("three more password characters");
  });

  it("W2-007: a display name one or more characters too long", () => {
    expect(displayNameMissing("x".repeat(MAX_DISPLAY_NAME + 1))).toEqual([
      "a shorter display name (one character too many)",
    ]);
    expect(displayNameMissing("x".repeat(MAX_DISPLAY_NAME + 4))).toEqual([
      "a shorter display name (four characters too many)",
    ]);
  });
});

describe("W2-018: signing in without the server's own sentence", () => {
  it("is a wrong password only when the server said 401", async () => {
    const refused = await login("pat", "nope", respond(401, {}));
    expect(!refused.ok && refused.failure.detail).toBe("That username and password do not match.");
  });

  it("is our fault, said plainly, for a 500 or a proxy's error page", async () => {
    for (const reply of [respond(500, {}), respond(502, null)]) {
      const failed = await login("pat", "a fine password!", reply);
      expect(!failed.ok && failed.failure.detail).toBe(
        "Signing in didn't work just now. Try again in a moment.",
      );
      expect(!failed.ok && failed.failure.errorCode).not.toBe("INVALID_CREDENTIALS");
    }
  });
});

describe("W2-019..W2-029: the lobby's lists", () => {
  it("W2-019: how soon a room closes", () => {
    expect(closesSoon(inMinutes(150), NOW)).toBe("Closes in two hours");
    expect(closesSoon(inMinutes(70), NOW)).toBe("Closes in an hour");
    expect(closesSoon(inMinutes(45), NOW)).toBe("Closes in 45 minutes");
    expect(closesSoon(inMinutes(1.5), NOW)).toBe("Closes in two minutes");
  });

  it("W2-020, W2-021, W2-022: how long ago", () => {
    expect(agoText(minutesAgo(5), NOW)).toBe("five minutes ago");
    expect(agoText(minutesAgo(1), NOW)).toBe("one minute ago");
    expect(agoText(minutesAgo(45), NOW)).toBe("45 minutes ago");
    expect(agoText(minutesAgo(130), NOW)).toBe("two hours ago");
    expect(agoText(minutesAgo(61), NOW)).toBe("an hour ago");
    expect(agoText(minutesAgo(72 * 60), NOW)).toBe("three days ago");
    expect(agoText(minutesAgo(14 * 24 * 60), NOW)).toBe("14 days ago");
  });

  it("W2-023, W2-024, W2-025: away and offline", () => {
    const lobby = apply([
      {
        type: "PRESENCE",
        users: [
          { userId: "u-a", username: "a", displayName: "A", awaySince: minutesAgo(5) },
          { userId: "u-b", username: "b", displayName: "B", awaySince: minutesAgo(130) },
          { userId: "u-c", username: "c", displayName: "C", awaySince: minutesAgo(65) },
        ],
      },
      {
        type: "PLAYERS",
        players: [{ userId: "u-d", displayName: "D", lastSeenAt: minutesAgo(125) }],
      },
    ]);
    expect(statusOf(lobby, "u-a", NOW).label).toBe("Away for five minutes");
    expect(statusOf(lobby, "u-b", NOW).label).toBe("Away for two hours");
    expect(statusOf(lobby, "u-c", NOW).label).toBe("Away for an hour");
    expect(statusOf(lobby, "u-d", NOW).label).toBe("Offline · last seen two hours ago");
  });

  it("W2-026: seats open", () => {
    expect(roomLine(listed()).text).toBe("One seat open");
    expect(roomLine(listed({ desiredPlayerCount: 4, seats: listed().seats })).text).toBe(
      "Three seats open",
    );
  });

  it("W2-027, W2-028, W2-029: why somebody can't be invited, and where they are", () => {
    const pat = { userId: "u-pat", username: "pat", displayName: "Pat" };
    const sam = { userId: "u-sam", username: "sam", displayName: "Sam" };
    const me = { userId: "u-me", username: "me", displayName: "Me" };
    const room = (hostUserId: string): RoomView => ({
      roomId: "r-me",
      name: "Me's room",
      hostUserId,
      presetId: "open",
      desiredPlayerCount: 2,
      status: "OPEN",
      revision: 1,
      everyoneReady: false,
      members: [
        {
          ...me,
          seatNumber: 1,
          ready: false,
          isHost: hostUserId === me.userId,
          deckSelected: false,
          selectedDeckId: null,
          selectedDeckName: null,
        },
      ],
    });
    const base: LobbyState = { ...EMPTY_LOBBY, presence: [me, pat, sam] };
    const row = (state: LobbyState, userId: string) =>
      playerRows(state, me.userId, NOW).find((r) => r.user.userId === userId)!;

    expect(row({ ...base, room: room("u-other") }, sam.userId).control).toEqual({
      kind: "blocked",
      why: "Only the room's host can invite players",
    });
    expect(
      row({ ...base, room: room(me.userId), outgoing: { roomId: "r-me", to: pat } }, sam.userId)
        .control,
    ).toEqual({ kind: "blocked", why: "You can send one invitation at a time" });
    const playing = listed({
      roomId: "r-pat",
      status: "IN_MATCH",
      seats: [{ seatNumber: 1, userId: pat.userId, displayName: "Pat", ready: true, isHost: true }],
    });
    expect(row({ ...base, rooms: [playing] }, pat.userId).where).toBe("In a game");
  });
});

describe("W2-030..W2-032, W2-044, W2-156: the lobby's notices", () => {
  const myRoom = {
    roomId: "r-1",
    name: "Me's room",
    hostUserId: "u-me",
    presetId: "open",
    desiredPlayerCount: 2,
    status: "OPEN",
    revision: 1,
    everyoneReady: false,
    members: [],
  };
  const closed = (reason: string) =>
    apply([
      { type: "ROOM", room: myRoom },
      { type: "ROOM_CLOSED", roomId: "r-1", reason },
    ]).notice?.detail;

  it("W2-030, W2-031: why a room closed", () => {
    expect(closed("AWAY")).toBe("You were away for ten minutes, so you left the room.");
    expect(closed("IDLE_120")).toBe("This room closed after two hours with nothing happening.");
    expect(closed("IDLE_60")).toBe("This room closed after one hour with nothing happening.");
    expect(closed("IDLE_30")).toBe("This room closed after 30 minutes with nothing happening.");
    expect(idleWords(1)).toBe("one minute");
    expect(idleWords(5)).toBe("five minutes");
  });

  it("W2-032: one word for it, 'game'", () => {
    const failed = (failureCode: string) =>
      apply([
        {
          type: "MATCH",
          matchId: "m-1",
          status: "FAILED_STARTUP",
          failureCode,
          participants: [],
        },
      ]).notice?.detail;
    expect(failed("SOMETHING_NEW")).toBe("The game did not start. The room is open again.");
    expect(failed("DECK_UNAVAILABLE")).toBe(
      "A deck could not be read, so the game did not start. The room is open again.",
    );
    expect(failed("WORKER_MISSING")).toBe(
      "This server cannot run games right now. The room is open again.",
    );
    const ended = apply([
      { type: "MATCH", matchId: "m-1", status: "TERMINATED", participants: [] },
    ]);
    expect(ended.notice?.detail).toBe(
      "The game was abandoned. Nobody won it, and the room is open again.",
    );
    expect(lobbyNoticeOf(ended.notice!)).toMatchObject({
      label: "Game",
      title: "The game was abandoned",
    });
    expect(
      lobbyNoticeOf({ kind: "error", errorCode: "X", detail: "Y.", aboutMatch: true }),
    ).toMatchObject({ label: "Game", title: "The game did not start" });
  });

  it("W2-044: a refusal's title", () => {
    expect(
      lobbyNoticeOf({ kind: "error", errorCode: "STALE", detail: "The room changed." }),
    ).toEqual({
      label: "Room",
      title: "That didn't work",
      line: "The room changed.",
      problem: true,
    });
  });

  it("W2-156: the host is told the player took back their request, not to ask again", () => {
    const asked = {
      ...EMPTY_LOBBY,
      askedBy: {
        roomId: "r-1",
        from: { userId: "u-pat", username: "pat", displayName: "Pat" },
      },
    };
    const state = reduceLobby(asked, {
      type: "ERROR",
      errorCode: "INVITATION_GONE",
      detail: "That request is no longer open.",
    });
    expect(state.news).toEqual([REQUEST_TAKEN_BACK]);
    expect(newsOf(state.news[0]!)).toEqual({
      label: "Request to join",
      title: "The player took back their request to join",
    });
    // The asker's own ending still says they can ask again.
    expect(newsOf("Pat declined your request to join").line).toBe(
      "You can ask again, or open your own room.",
    );
  });
});

describe("W2-081: the deck problem's line, from its code", () => {
  it("says the known codes in our words, and keeps the server's only for the deck's own rules", () => {
    expect(setupProblemLine({ errorCode: "DECK_REQUIRED", detail: "x" })).toBe("Choose a deck.");
    expect(setupProblemLine({ errorCode: "NOT_READY", detail: "x" })).toBe("Mark yourself ready.");
    expect(setupProblemLine({ errorCode: "NOT_CONNECTED", detail: "x" })).toBe(
      "You are not connected. Reload the lobby.",
    );
    expect(setupProblemLine({ errorCode: "ACCESS_REVOKED", detail: "x" })).toBe(
      "That deck is no longer available to you. Choose another.",
    );
    const copies =
      'Open Format allows at most four copies of "Lightning Bolt". This deck has five.';
    expect(setupProblemLine({ errorCode: "INVALID_FOR_PRESET", detail: copies })).toBe(copies);
    expect(setupProblemLine({ errorCode: "SOMETHING_NEW", detail: "" })).toBe(
      "Your deck can't be used for this game. Choose another.",
    );
  });
});

describe("W2-054, W2-153: the icon picker's tabs", () => {
  it("are 'Colors' and 'More families'", () => {
    const names = ICON_SHEETS.map((sheet) => sheet.name);
    expect(names).toContain("Colors");
    expect(names).toContain("More families");
    expect(names.join(" ")).not.toMatch(/Colours|Families 2/);
  });
});

describe("W2-058, W2-063, W2-066..W2-076, W2-155: the Hall's words", () => {
  it("W2-058: the belt's rule days", () => {
    expect(everyDays(7)).toBe("seven days");
    expect(everyDays(1)).toBe("day");
  });

  it("W2-063: a rank's move, read aloud", () => {
    expect(moveWords(2)).toBe("Up two places");
    expect(moveWords(-1)).toBe("Down one place");
  });

  it("W2-066: the last five, read aloud", () => {
    expect(formWords("WLDWW")).toBe("won, lost, drawn, won, won");
  });

  it("W2-067: a rivalry, read aloud", () => {
    expect(winsTo(3, 1)).toBe("three wins to one");
    expect(winsTo(1, 2)).toBe("one win to two");
  });

  it("W2-068, W2-069: how long", () => {
    expect(timeLeft(inMinutes(3 * 24 * 60 + 5), NOW)).toBe("three days");
    expect(timeLeft(inMinutes(100), NOW)).toBe("two hours");
    expect(timeLeft(inMinutes(30), NOW)).toBe("one hour");
    expect(heldFor(minutesAgo(3 * 24 * 60 + 5), NOW)).toBe("Held for three days");
    expect(heldFor(minutesAgo(24 * 60 + 5), NOW)).toBe("Held for one day");
  });

  it("W2-151: the On Fire chip says its name; the run is in its tooltip, in words", () => {
    const badge = { key: "on-fire", label: "On Fire: six wins in a row" };
    expect(badgeName(badge)).toBe("On Fire");
    expect(badgeName({ label: "On Fire · 6" })).toBe("On Fire");
    expect(badgeName({ label: "Giant Slayer" })).toBe("Giant Slayer");
    expect(badgeTip(badge)).toBe("Six wins in a row (a loss or a draw ends the run).");
  });

  it("W2-070..W2-073: the badges' tooltips", () => {
    expect(badgeTip({ key: "on-fire", label: "On Fire · 3" })).toBe(
      "Three wins in a row (a loss or a draw ends the run).",
    );
    // Read the same when the server writes the run in words (W2-151).
    expect(badgeTip({ key: "on-fire", label: "On Fire: five wins in a row" })).toBe(
      "Five wins in a row (a loss or a draw ends the run).",
    );
    expect(badgeTip({ key: "speed-demon", label: "" })).toBe(
      "Won a game by turn five this season.",
    );
    expect(badgeTip({ key: "never-conceded", label: "" })).toBe(
      "Played ten or more games and never conceded one.",
    );
    expect(badgeTip({ key: "deck-master", label: "" })).toBe(
      "Won with five or more different decks.",
    );
  });

  it("W2-074: won so many", () => {
    expect(wonText(3, 5)).toBe("won three of five");
    expect(wonText(9, 12)).toBe("won nine of 12");
  });

  it("W2-075, W2-076: the latest results", () => {
    const name = (id: string) => ({ a: "Pat", b: "Sam" })[id] ?? "A player";
    const base = { at: "", turn: 7, change: 12, beltTaken: true, players: ["a", "b"] };
    expect(latestText({ ...base, kind: "win" }, name)).toBe(
      "Pat beat Sam on turn seven and took the Belt (+12)",
    );
    expect(latestText({ ...base, kind: "win", beltTaken: false, turn: 12 }, name)).toBe(
      "Pat beat Sam on turn 12 (+12)",
    );
    expect(latestText({ ...base, kind: "belt", turn: null }, name, 7)).toBe(
      "Pat took over the Belt: Sam hadn't played for seven days",
    );
  });

  it("W2-155: the American date order", () => {
    expect(shortDate("2026-11-08T12:00:00Z")).toBe("Sun, Nov 8");
    expect(defendText("2026-11-08T13:00:00Z", Date.parse("2026-11-04T12:00:00Z"))).toBe(
      "Defend by Sun, Nov 8 · four days left",
    );
  });
});
