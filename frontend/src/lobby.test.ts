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
        deckSelected: false,
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
          deckSelected: false,
          selectedDeckId: null,
          selectedDeckName: null,
        },
        {
          ...pat,
          seatNumber: 1,
          ready: true,
          isHost: true,
          deckSelected: true,
          selectedDeckId: "d1",
          selectedDeckName: "Burn",
        },
      ],
    });
    const state = apply([{ type: "ROOM", room: unsorted }]);
    expect(state.room?.members.map((m) => m.seatNumber)).toEqual([1, 2]);
  });

  /**
   * §5.47 — an opponent's deck NAME is not sent, so the page
   * cannot render it even by accident. The reducer keeps whatever
   * the server said and nothing more.
   */
  it("carries deck identity only where the server sent it", () => {
    const state = apply([
      {
        type: "ROOM",
        room: room({
          members: [
            {
              ...pat,
              seatNumber: 1,
              ready: true,
              isHost: true,
              deckSelected: true,
              selectedDeckId: "d1",
              selectedDeckName: "Burn",
            },
            {
              ...sam,
              seatNumber: 2,
              ready: true,
              isHost: false,
              deckSelected: true,
            },
          ] as never,
        }),
      },
    ]);
    const [mine, theirs] = state.room!.members;
    expect(mine?.selectedDeckName).toBe("Burn");
    expect(theirs?.deckSelected).toBe(true);
    expect(theirs?.selectedDeckName).toBeNull();
    expect(theirs?.selectedDeckId).toBeNull();
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

// The match — PHASE_06 §6.17, §6.114.
//
// Every test here exists because of a REFRESH. The launch, and then
// RUNNING some seconds later, change state behind an asynchronous
// JVM spawn; before this the page learned about neither and the
// owner had to reload to find out a game had started. The reducer
// is where "learned about" is decided, so it is where this is
// provable without a browser.
describe("the match", () => {
  const seats = [
    { userId: "u-pat", seatNumber: 1, deckName: "Mono Red" },
    { userId: "u-sam", seatNumber: 2, deckName: null },
  ];

  it("takes a launching match", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "LAUNCHING", participants: seats },
    ]);
    expect(state.match?.matchId).toBe("m-1");
    expect(state.match?.status).toBe("LAUNCHING");
    expect(state.match?.participants).toHaveLength(2);
  });

  it("moves to running without anything being asked for", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "LAUNCHING", participants: seats },
      { type: "MATCH", matchId: "m-1", status: "RUNNING", participants: seats },
    ]);
    expect(state.match?.status).toBe("RUNNING");
  });

  it("keeps only your own deck name, because the server sends only that", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "RUNNING", participants: seats },
    ]);
    expect(state.match?.participants.map((s) => s.deckName)).toEqual(["Mono Red", null]);
  });

  // The one that matters most, and the reason the server now gives
  // the room back: a failed start used to leave the room IN_MATCH
  // forever. Here it must at least stop the page insisting a match
  // is on its way.
  it("a failed start leaves no match, and says why", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "LAUNCHING", participants: seats },
      {
        type: "MATCH",
        matchId: "m-1",
        status: "FAILED_STARTUP",
        failureCode: "DECK_UNAVAILABLE",
        participants: seats,
      },
    ]);
    expect(state.match).toBeNull();
    expect(state.notice?.kind).toBe("error");
    expect(state.notice?.detail).toContain("deck could not be read");
  });

  it("explains a failure it has never heard of without printing the code", () => {
    const state = apply([
      {
        type: "MATCH",
        matchId: "m-1",
        status: "FAILED_STARTUP",
        failureCode: "SOMETHING_NEW",
        participants: seats,
      },
    ]);
    expect(state.notice?.detail).toBe("The match did not start. The room is open again.");
  });

  it("a closed room takes the match with it", () => {
    const state = apply([
      { type: "ROOM", room: room() },
      { type: "MATCH", matchId: "m-1", status: "RUNNING", participants: seats },
      { type: "ROOM_CLOSED", roomId: "r-1", reason: "CLOSED_BY_HOST" },
    ]);
    expect(state.match).toBeNull();
    expect(state.room).toBeNull();
  });

  it("ignores a frame with no status rather than blanking the match", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "RUNNING", participants: seats },
      { type: "MATCH", matchId: "m-1" },
    ]);
    expect(state.match?.status).toBe("RUNNING");
  });
});

// How a game finishes — PHASE_06 §6.149, §6.151, §6.154.
//
// §6.149 is the rule every test here is really about: FORGE owns
// the result. The page never derives one from life totals, a
// dropped connection or a worker exiting, and the winner arrives
// as a SEAT because a display name is not an identity.
describe("a finished match", () => {
  const seats = [
    { userId: "u-pat", seatNumber: 1, deckName: "Mono Red" },
    { userId: "u-sam", seatNumber: 2, deckName: null },
  ];

  it("keeps the match on screen and records who won", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "RUNNING", participants: seats },
      {
        type: "MATCH",
        matchId: "m-1",
        status: "ENDED",
        outcome: "WINNER",
        winningSeat: 2,
        endedOnTurn: 11,
        participants: seats,
      },
    ]);

    // Not cleared: the result is the thing the players most want
    // to see, and the final turn is the worst moment to vanish.
    expect(state.match?.status).toBe("ENDED");
    expect(state.match?.outcome?.kind).toBe("WINNER");
    expect(state.match?.outcome?.winningSeat).toBe(2);
    expect(state.match?.outcome?.endedOnTurn).toBe(11);
    // No reason sent, none invented.
    expect(state.match?.outcome?.reason).toBeNull();
  });

  it("keeps Forge's reason for an alternate win", () => {
    const state = apply([
      {
        type: "MATCH",
        matchId: "m-1",
        status: "ENDED",
        outcome: "WINNER",
        winningSeat: 1,
        endedOnTurn: 8,
        reason: "has won due to effect of 'Laboratory Maniac'",
        participants: seats,
      },
    ]);
    expect(state.match?.outcome?.reason).toBe("has won due to effect of 'Laboratory Maniac'");
  });

  it("takes a draw with no winning seat", () => {
    const state = apply([
      {
        type: "MATCH",
        matchId: "m-1",
        status: "ENDED",
        outcome: "DRAW",
        endedOnTurn: 7,
        participants: seats,
      },
    ]);
    expect(state.match?.outcome?.kind).toBe("DRAW");
    // Absent is not seat zero.
    expect(state.match?.outcome?.winningSeat).toBeNull();
  });

  /**
   * §6.154 — a match that stopped is a fault, not a win.
   *
   * The dangerous version records the connected player as the
   * winner. There is no code path here that can produce a winner
   * from a failure: the server sends none and the page invents
   * none.
   */
  it("a runtime failure names no winner", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "RUNNING", participants: seats },
      {
        type: "MATCH",
        matchId: "m-1",
        status: "FAILED_RUNTIME",
        failureCode: "WORKER_STOPPED",
        participants: seats,
      },
    ]);
    expect(state.match?.status).toBe("FAILED_RUNTIME");
    expect(state.match?.outcome).toBeNull();
  });

  it("a running match carries no outcome", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "RUNNING", participants: seats },
    ]);
    expect(state.match?.outcome).toBeNull();
  });
});

// Abandoning — PHASE_06 §6.153, §6.162.
//
// The escape hatch for a match that has stopped responding.
// §6.152 means no lobby action can end a running match, so
// without this a wedged game left its room locked until the
// 24-hour sweep.
describe("an abandoned match", () => {
  const seats = [
    { userId: "u-pat", seatNumber: 1, deckName: "Mono Red" },
    { userId: "u-sam", seatNumber: 2, deckName: null },
  ];

  it("clears the match and says nobody won", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "RUNNING", participants: seats },
      { type: "MATCH", matchId: "m-1", status: "TERMINATED", participants: seats },
    ]);

    expect(state.match).toBeNull();
    // §6.153 — Arena must not declare the opponent the winner
    // without Forge's result, and there is none.
    expect(state.notice?.detail).toContain("Nobody won it");
  });

  /**
   * Not phrased as a failure. Somebody meant to do this, and
   * wording that implied a crash would send people looking for
   * a fault that is not there.
   */
  it("reads as deliberate, not as a fault", () => {
    const state = apply([
      { type: "MATCH", matchId: "m-1", status: "TERMINATED", participants: seats },
    ]);
    expect(state.notice?.kind).toBe("info");
  });

  it("is distinct from a match that never started", () => {
    const state = apply([
      {
        type: "MATCH",
        matchId: "m-1",
        status: "FAILED_STARTUP",
        failureCode: "DECK_UNAVAILABLE",
        participants: seats,
      },
    ]);
    expect(state.notice?.kind).toBe("error");
    expect(state.notice?.detail).toContain("deck could not be read");
  });
});
