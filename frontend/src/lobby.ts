// The lobby, as DATA — PHASE_05 §5.66–§5.70, AMENDMENTS 1–4.
//
// UI-free on purpose, like status.ts and decks.ts. Everything that
// could be WRONG about a lobby lives here — which message changes
// what, what a client is allowed to believe, when a stale view must
// be dropped — and none of it should need a browser to test.
//
// One rule runs through the whole file and is worth stating before
// any of the types: THE SERVER IS THE ROOM. This module never
// computes a room, never edits one locally and never predicts what
// a click will do (§5.132). It sends a request, and it renders the
// ROOM message that comes back. Optimistic local updates are how a
// lobby ends up showing two different truths to two players.

import { apiFetch } from "./auth";
import { REACTIONS } from "./chatEmoji";
import { onPageBack, pageIsLeaving } from "./pageLife";

export const MAX_CHAT_LINES = 200;
export const MAX_CHAT_LENGTH = 500;

export interface PresenceUser {
  userId: string;
  username: string;
  displayName: string;
  /** Spec 0006 — "avatar-07", or absent for the default picture. */
  avatar?: string | null;
  /** Spec 0009 — since when they have been away; absent while active. */
  awaySince?: string;
  /** Spec 0009 — their last activity, for "last seen" while offline. */
  lastSeenAt?: string;
}

export interface ChatLine {
  /** The envelope's messageId: already unique, already server-made. */
  id: string;
  fromUserId: string;
  displayName: string;
  text: string;
  sentAt: string;
  /**
   * Spec 0007 — reactions: emoji to the user ids who put it there.
   * Live only, like the line; absent until somebody reacts.
   */
  reactions?: Record<string, string[]>;
}

export interface RoomMemberView {
  userId: string;
  username: string;
  displayName: string;
  seatNumber: number;
  ready: boolean;
  isHost: boolean;
  /**
   * §5.46 — what the table knows: that this seat has chosen.
   *
   * The two below are present only on YOUR OWN seat (§5.47). An
   * opponent's deck name is not the lobby's to show, and the
   * server does not send it.
   */
  deckSelected: boolean;
  selectedDeckId: string | null;
  selectedDeckName: string | null;
}

export interface RoomView {
  roomId: string;
  /** PHASE_07 Amendment 9 — the host's name for it, or "<host>'s room". */
  name: string;
  hostUserId: string;
  presetId: string;
  desiredPlayerCount: number;
  status: string;
  revision: number;
  everyoneReady: boolean;
  members: RoomMemberView[];
}

export interface Invitation {
  roomId: string;
  /** PHASE_07 Amendment 9 — which room, by the name the list shows. */
  roomName: string;
  from: PresenceUser;
}

/** One seat on the room list — PHASE_07 §7.64: who and ready, never a deck. */
export interface DirectorySeat {
  seatNumber: number;
  userId: string;
  displayName: string;
  ready: boolean;
  isHost: boolean;
}

/** One room on the list everybody sees — PHASE_07 §7.64. */
export interface DirectoryRoom {
  roomId: string;
  name: string;
  hostUserId: string;
  /** OPEN, READY_FOR_MATCH (starting) or IN_MATCH. */
  status: string;
  desiredPlayerCount: number;
  seats: DirectorySeat[];
  /** When it clears if nobody does anything; null during a match. */
  clearsAt: string | null;
  /** Spec 0016 R2 — who the open seat is held for; null when nobody. */
  held: RoomHold | null;
}

/** Spec 0016 R2 — an open seat held for somebody: invited, or asking to join. */
export interface RoomHold {
  userId: string;
  displayName: string;
  /** They asked to join (the host answers); false when the host invited them. */
  asked: boolean;
}

/** Spec 0016 R3 — your request to join somebody's room, waiting on the host. */
export interface JoinAsk {
  roomId: string;
  roomName: string;
  host: { userId: string; displayName: string };
}

/** Spec 0016 R3 — somebody asks to join your room; you answer. */
export interface JoinAsked {
  roomId: string;
  from: { userId: string; displayName: string };
}

/** The invitation this host has out — PHASE_07 Amendment 11. */
export interface OutgoingInvitation {
  roomId: string;
  to: PresenceUser;
}

/**
 * Why an invitation to YOU stopped, when that needs saying: the host
 * withdrew it, the room closed or filled, the host went away, or you
 * accepted a moment too late. Your own accept or decline needs no
 * telling and does not set this.
 */
export interface InvitationGone {
  fromDisplayName: string | null;
  reason: string;
}

/** §5.100 — about YOUR deck. Never about anybody else's. */
export interface SetupProblem {
  roomId: string;
  errorCode: string;
  detail: string;
}

export interface Notice {
  kind: "error" | "info";
  errorCode: string;
  detail: string;
  /**
   * Why the room came back: a match ended or failed. Such a notice
   * survives the ROOM message that follows it -- that room is the
   * consequence it explains, not news that makes it stale.
   */
  aboutMatch?: true;
}

/**
 * The match this socket says you are in — PHASE_06 §6.17.
 *
 * Carried on the lobby state rather than fetched, because the
 * status changes behind a JVM spawn: LAUNCHING is the answer to the
 * launch request, and RUNNING arrives some seconds later with
 * nobody asking. A page that only learned this from HTTP would need
 * a refresh to find out the game had started, which is the exact
 * class of bug this sweep is clearing.
 */
export interface MatchSeatView {
  userId: string;
  seatNumber: number;
  /** §5.47 again: your own deck by name, nobody else's. */
  deckName: string | null;
}

/**
 * How a game finished — PHASE_06 §6.149.
 *
 * FORGE's result, by SEAT. The page turns a seat into a name
 * using the participant list it already holds; the server never
 * sends "Pat won", because a display name is not an identity and
 * two players may share one.
 */
export interface MatchOutcome {
  kind: string;
  winningSeat: number | null;
  endedOnTurn: number;
  /**
   * P6-AP — why the winner won, in Forge's words ("has won due to
   * effect of 'Laboratory Maniac'"). Shown, never composed.
   */
  reason: string | null;
  /** PHASE_07 §7.55 — the seat that conceded, as Forge recorded it; null when nobody did. */
  concededSeat: number | null;
}

export interface MatchView {
  matchId: string;
  status: string;
  failureCode: string | null;
  participants: MatchSeatView[];
  outcome: MatchOutcome | null;
}

/**
 * The live connection. "reconnecting" is a dropped connection being
 * retried on its own (a server update, a Wi-Fi blip); "ended" is a
 * session that is over, which no retry can fix -- sign in again.
 */
export type ConnectionState = "connecting" | "open" | "reconnecting" | "ended";

/** A room this page has left, and how it stood then (late news about it is ignored). */
export interface LeftRoom {
  roomId: string;
  revision: number;
}

/** Spec 0011 — one player's place in the Hall of Champions. */
export interface Standing {
  userId: string;
  wins: number;
  /** Finished games: a result from the rules engine, win, loss or draw. */
  games: number;
}

/** Spec 0011 — the top three by wins (in order) and dead last, if anybody qualifies. */
export interface Standings {
  podium: Standing[];
  last: Standing | null;
}

export interface LobbyState {
  connection: ConnectionState;
  presence: PresenceUser[];
  chat: ChatLine[];
  /** Spec 0013 — the game's own chat, apart from the lobby's; emptied on leaving the game. */
  gameChat: ChatLine[];
  room: RoomView | null;
  /** At most one: a player holds one invitation at a time (Amendment 11). */
  invitation: Invitation | null;
  /** PHASE_07 §7.64 — every open room, for everybody. */
  rooms: DirectoryRoom[];
  /** PHASE_07 Amendment 11 — every active account, online or not. */
  players: PresenceUser[];
  /** The one invitation this player has out, as host. */
  outgoing: OutgoingInvitation | null;
  /**
   * Who last declined this host's invitation. It stays on their row
   * until the host invites somebody, rather than flashing past.
   */
  declinedBy: string | null;
  /** An invitation to you that ended without your say. */
  invitationGone: InvitationGone | null;
  /** Spec 0016 R3 — your request to join a room, until the host answers. */
  asking: JoinAsk | null;
  /** Spec 0016 R3 — a request to join your room, until you answer. */
  askedBy: JoinAsked | null;
  /**
   * Spec 0016 — one line of news to acknowledge: "Pat declined your
   * invitation", "RudeLeft declined your request to join". A pop-up in
   * the Lobby, the top bar on other pages.
   */
  news: string | null;
  setupProblem: SetupProblem | null;
  /**
   * Owner report 2026-10-21: a ROOM message sent just before you left
   * could arrive just after, and put the room you had left back on
   * screen -- one you could no longer leave. Remembered so it cannot.
   */
  left: LeftRoom | null;
  notice: Notice | null;
  /** Null until a match exists, and null again once one cannot. */
  match: MatchView | null;
  /** Spec 0011 — null until the server has sent them. */
  standings: Standings | null;
}

export const EMPTY_LOBBY: LobbyState = {
  connection: "connecting",
  presence: [],
  chat: [],
  gameChat: [],
  room: null,
  invitation: null,
  rooms: [],
  players: [],
  outgoing: null,
  declinedBy: null,
  invitationGone: null,
  asking: null,
  askedBy: null,
  news: null,
  setupProblem: null,
  left: null,
  notice: null,
  match: null,
  standings: null,
};

/**
 * Apply one server message.
 *
 * Pure, and exhaustive by design: an UNKNOWN type returns the state
 * unchanged rather than throwing. A newer server that invents a
 * message must not blank an older client's page — the same reason
 * the HTTP clients ignore unknown fields.
 */
export function reduceLobby(state: LobbyState, message: Record<string, unknown>): LobbyState {
  const type = typeof message["type"] === "string" ? message["type"] : "";

  switch (type) {
    case "PRESENCE":
      return { ...state, presence: asPresenceList(message["users"]) };

    case "PRESENCE_JOINED": {
      const user = asPresenceUser(message);
      if (!user) return state;
      // Replace rather than append: the server sends this only on a
      // user's FIRST connection (§5.6), but a reconnect race can
      // still deliver two, and a duplicated name in a list people
      // click on is worse than a missed animation.
      const without = state.presence.filter((p) => p.userId !== user.userId);
      return { ...state, presence: sortPresence([...without, user]) };
    }

    case "PRESENCE_LEFT": {
      const userId = asString(message["userId"]);
      if (!userId) return state;
      // Spec 0009 — "last seen" starts from the moment they left.
      const lastSeenAt = asTime(message["lastSeenAt"]);
      const players = lastSeenAt
        ? state.players.map((p) => (p.userId === userId ? { ...p, lastSeenAt } : p))
        : state.players;
      return { ...state, players, presence: state.presence.filter((p) => p.userId !== userId) };
    }

    // Spec 0009 — a player went idle, or came back.
    case "PRESENCE_AWAY": {
      const userId = asString(message["userId"]);
      if (!userId) return state;
      const awaySince = asTime(message["awaySince"]);
      const presence = state.presence.map((p) => {
        if (p.userId !== userId) return p;
        const next = { ...p };
        if (awaySince) next.awaySince = awaySince;
        else delete next.awaySince;
        return next;
      });
      return { ...state, presence };
    }

    case "CHAT": {
      const line = asChatLine(message);
      if (!line) return state;
      // AMENDMENT 3 — ephemeral, and bounded in the page too. "No
      // scrollback beyond the session" is not a licence to grow a
      // list forever in a tab somebody leaves open all week.
      // Spec 0013 — a game line goes to the game's chat, never the lobby's.
      if (message["scope"] === "game") {
        return { ...state, gameChat: [...state.gameChat, line].slice(-MAX_CHAT_LINES) };
      }
      const chat = [...state.chat, line].slice(-MAX_CHAT_LINES);
      return { ...state, chat };
    }

    case "REACTION":
      return react(state, message);

    case "ROOM": {
      const room = asRoom(message["room"]);
      if (!room) return state;
      // A stale ROOM must not overwrite a newer one. Frames arrive
      // in order on one socket, but a refresh fetches over HTTP at
      // the same time, and those two can land either way round.
      if (state.room && state.room.roomId === room.roomId && room.revision < state.room.revision) {
        return state;
      }
      // News about a room you have since left, from before you left.
      if (state.left && state.left.roomId === room.roomId && room.revision <= state.left.revision) {
        return state;
      }
      // The notice goes too. Every notice here is about something
      // that was ABOUT to change the room — "Invited Pat", a
      // refusal — so once the room itself arrives, the notice is
      // describing the past. Seen on screen: "Invited Pat." sat
      // above a room Pat had already joined.
      // Except why a match ended or failed: the room arrives BECAUSE
      // of it, right after, and wiping it left both players looking
      // at their room with no word of what happened to the game.
      return {
        ...state,
        room,
        invitation: null,
        // Spec 0016 — seated: whatever you asked for is settled.
        asking: null,
        notice: state.notice?.aboutMatch ? state.notice : null,
      };
    }

    case "ROOM_CLOSED":
    case "ROOM_REMOVED": {
      const roomId = asString(message["roomId"]);
      // Only if it is the room we are actually in. A message about
      // some other room is not a reason to empty this page.
      if (!roomId || state.room?.roomId !== roomId) return state;
      return {
        ...state,
        room: null,
        left: { roomId, revision: state.room.revision },
        setupProblem: null,
        match: null,
        notice: {
          kind: "info",
          errorCode: type,
          detail: closedBecause(asString(message["reason"])),
        },
      };
    }

    case "INVITED": {
      const roomId = asString(message["roomId"]);
      const from = asPresenceUser(message["from"]);
      if (!roomId || !from) return state;
      // Ignored while you are already in a room: §5.5 means you
      // would have to leave to accept, and a dialog you cannot say
      // yes to is a dialog that should not appear.
      if (state.room) return state;
      const roomName = asString(message["roomName"]) ?? `${from.displayName}'s room`;
      return { ...state, invitation: { roomId, roomName, from }, invitationGone: null };
    }

    case "INVITATION_SENT": {
      // Amendment 11 — the Players list shows it on the row ("Invited"),
      // so there is no notice; and a new invitation clears the last
      // decline, which is what that note was waiting for.
      const to = asPresenceUser(message["to"]);
      const roomId = asString(message["roomId"]);
      if (!to || !roomId) return state;
      return { ...state, outgoing: { roomId, to }, declinedBy: null };
    }

    case "JOIN_ASKED": {
      const roomId = asString(message["roomId"]);
      const from = asNamed(message["from"]);
      if (!roomId || !from) return state;
      return { ...state, askedBy: { roomId, from } };
    }

    case "JOIN_ASK_SENT": {
      const roomId = asString(message["roomId"]);
      const host = asNamed(message["host"]);
      if (!roomId || !host) return state;
      const roomName = asString(message["roomName"]) ?? `${host.displayName}'s room`;
      return { ...state, asking: { roomId, roomName, host } };
    }

    case "INVITATION_ENDED": {
      const reason = asString(message["reason"]);
      const direction = asString(message["direction"]);
      const other = message["other"] as Record<string, unknown> | undefined;
      if (!reason || !direction) return state;
      const otherName = asString(other?.["displayName"]);
      // Spec 0016 R3 — a request to join, from either side.
      if (message["asked"] === true) {
        if (direction === "FROM_YOU") {
          return { ...state, asking: null, news: requestEnded(reason, otherName) ?? state.news };
        }
        return { ...state, askedBy: null };
      }
      if (direction === "FROM_YOU") {
        return {
          ...state,
          outgoing: null,
          declinedBy: reason === "DECLINED" ? asString(other?.["userId"]) : state.declinedBy,
          // Spec 0016 (16) — the host hears a decline, not just a note on the row.
          news:
            reason === "DECLINED" ? `${otherName ?? "They"} declined your invitation` : state.news,
        };
      }
      // TO_YOU. Your own accept or decline needs no telling.
      const quiet = reason === "ACCEPTED" || reason === "DECLINED";
      return {
        ...state,
        invitation: null,
        invitationGone: quiet
          ? state.invitationGone
          : { fromDisplayName: asString(other?.["displayName"]), reason },
      };
    }

    case "ROOMS":
      return { ...state, rooms: asDirectory(message["rooms"]) };

    case "PLAYERS":
      return { ...state, players: asPresenceList(message["players"]) };

    case "STANDINGS":
      return {
        ...state,
        standings: {
          podium: (Array.isArray(message["podium"]) ? message["podium"] : [])
            .map(asStanding)
            .filter((s): s is Standing => s !== null)
            .slice(0, 3),
          last: asStanding(message["last"]),
        },
      };

    case "SETUP_PROBLEM": {
      const roomId = asString(message["roomId"]);
      const errorCode = asString(message["errorCode"]);
      const detail = asString(message["detail"]);
      if (!roomId || !errorCode || !detail) return state;
      return { ...state, setupProblem: { roomId, errorCode, detail } };
    }

    case "MATCH": {
      const matchId = asString(message["matchId"]);
      const status = asString(message["status"]);
      if (!matchId || !status) return state;
      const participants = asMatchSeats(message["participants"]);
      const failureCode = asString(message["failureCode"]);

      if (status === "ENDED" || status === "FAILED_RUNTIME") {
        // §6.151 — the game is over. The match STAYS on screen,
        // because the result is the thing the players most want
        // to see and a panel that vanished at the final turn
        // would be the worst possible moment to disappear. The
        // room comes back on its own ROOM message.
        return {
          ...state,
          match: {
            matchId,
            status,
            failureCode,
            participants,
            outcome: asOutcome(message),
          },
          notice: null,
        };
      }

      if (status === "TERMINATED") {
        // §6.162 — somebody ended it on purpose. Not a failure
        // and not a result: nobody won, and the wording has to
        // say that rather than implying something went wrong.
        return {
          ...state,
          match: null,
          notice: {
            kind: "info",
            errorCode: status,
            detail: "The match was abandoned. Nobody won it, and the room is open again.",
            aboutMatch: true,
          },
        };
      }

      if (status === "FAILED_STARTUP") {
        // No match to be in. The room comes back on its own ROOM
        // message; all this has to do is stop claiming a game is
        // starting and say why it is not.
        return {
          ...state,
          match: null,
          notice: {
            kind: "error",
            errorCode: failureCode ?? status,
            detail: matchFailed(failureCode),
            aboutMatch: true,
          },
        };
      }
      return {
        ...state,
        match: { matchId, status, failureCode, participants, outcome: null },
        notice: null,
      };
    }

    case "SESSION_ENDED":
      // Phase 3 §3.81 -- the session was ended (signed out elsewhere,
      // or by an administrator). Said, rather than going quietly dead.
      return { ...state, connection: "ended" };

    case "ERROR": {
      const errorCode = asString(message["errorCode"]);
      const detail = asString(message["detail"]);
      if (!errorCode || !detail) return state;
      // Spec 0016 — answering a request that has just ended.
      if (errorCode === "INVITATION_GONE" && state.askedBy && !state.invitation) {
        return { ...state, askedBy: null, news: detail };
      }
      // Accepting a moment too late: said the way a withdrawal is,
      // because to the player it is one (canvas note on WITHDRAWN).
      if (errorCode === "INVITATION_GONE") {
        return {
          ...state,
          invitation: null,
          invitationGone: {
            fromDisplayName: state.invitation?.from.displayName ?? null,
            reason: "GONE",
          },
        };
      }
      return { ...state, notice: { kind: "error", errorCode, detail } };
    }

    default:
      return state;
  }
}

/** Spec 0016 R3 — why your request to join ended, when that needs saying; null when it does not. */
function requestEnded(reason: string, host: string | null): string | null {
  const who = host ?? "The host";
  switch (reason) {
    case "DECLINED":
      return `${who} declined your request to join`;
    case "ROOM_CLOSED":
      return `${who}'s room closed, so your request ended`;
    case "SEAT_FILLED":
      return "The seat was taken, so your request ended";
    case "OFFLINE":
      return `${who} left, so your request ended`;
    default:
      // Accepted (you are seated) or taken back by you: nothing to say.
      return null;
  }
}

/** `{ userId, displayName }`, or null when either is missing. */
function asNamed(value: unknown): { userId: string; displayName: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const userId = asString(v["userId"]);
  const displayName = asString(v["displayName"]);
  return userId && displayName ? { userId, displayName } : null;
}

/** §6.99 — what went wrong, in words, without Forge's internals. */
function matchFailed(code: string | null): string {
  switch (code) {
    case "DECK_UNAVAILABLE":
      return "A deck could not be read, so the match did not start. The room is open again.";
    case "WORKER_INCOMPATIBLE":
    case "WORKER_UNCONFIGURED":
    case "WORKER_MISSING":
      return "This server cannot run matches right now. The room is open again.";
    case "GAME_START_TIMEOUT":
      return "The game took too long to start. The room is open again — try once more.";
    default:
      return "The match did not start. The room is open again.";
  }
}

function asOutcome(message: Record<string, unknown>): MatchOutcome | null {
  const kind = asString(message["outcome"]);
  if (!kind) return null;
  const seat = message["winningSeat"];
  const turn = message["endedOnTurn"];
  return {
    kind,
    // Absent for a draw and for a failure. Absent is not seat zero.
    winningSeat: typeof seat === "number" ? seat : null,
    endedOnTurn: typeof turn === "number" ? turn : 0,
    reason: asString(message["reason"]),
    concededSeat: typeof message["concededSeat"] === "number" ? message["concededSeat"] : null,
  };
}

function asMatchSeats(value: unknown): MatchSeatView[] {
  if (!Array.isArray(value)) return [];
  const seats: MatchSeatView[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const userId = asString(row["userId"]);
    const seatNumber = row["seatNumber"];
    if (!userId || typeof seatNumber !== "number") continue;
    seats.push({ userId, seatNumber, deckName: asString(row["deckName"]) });
  }
  return seats;
}

function closedBecause(reason: string | null): string {
  switch (reason) {
    case "HOST_LEFT":
      return "The host left, so the room closed.";
    case "CLOSED_BY_ADMIN":
      // PHASE_07 §7.67 — said plainly (owner wording 2026-10-25). Sent
      // only to the room's members: the host and whoever had the other
      // seat; anyone merely invited hears that the invitation ended.
      return "An administrator closed this room.";
    case "CLOSED_BY_HOST":
      return "The host closed the room.";
    case "EXPIRED":
      return "That room expired after a day of inactivity.";
    case "REMOVED_BY_HOST":
      return "The host removed you from the room.";
    default:
      // A reason this client has never heard of is still a real
      // departure. Saying something true and vague beats saying
      // the code.
      return "You are no longer in that room.";
  }
}

// --- reading what the server sent ----------------------------------------
//
// Defensively, and without throwing. A frame that does not look the
// way this client expects is dropped, never half-applied: a page
// showing a member with no name is harder to diagnose than a page
// showing no member.

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asPresenceUser(value: unknown): PresenceUser | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const userId = asString(v["userId"]);
  const displayName = asString(v["displayName"]);
  if (!userId || !displayName) return null;
  const avatar = asString(v["avatar"]);
  const awaySince = asTime(v["awaySince"]);
  const lastSeenAt = asTime(v["lastSeenAt"]);
  return {
    userId,
    username: asString(v["username"]) ?? displayName,
    displayName,
    // Only a name of the owner's set; anything else is the default picture.
    ...(avatar && /^avatar-\d\d$/.test(avatar) ? { avatar } : {}),
    ...(awaySince ? { awaySince } : {}),
    ...(lastSeenAt ? { lastSeenAt } : {}),
  };
}

/** A moment the server named, or null when it is not one. */
function asTime(value: unknown): string | null {
  const text = asString(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : null;
}

function asStanding(value: unknown): Standing | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const userId = asString(row["userId"]);
  const wins = row["wins"];
  const games = row["games"];
  if (!userId || typeof wins !== "number" || typeof games !== "number") return null;
  return { userId, wins, games };
}

function asPresenceList(value: unknown): PresenceUser[] {
  if (!Array.isArray(value)) return [];
  return sortPresence(value.map(asPresenceUser).filter((u): u is PresenceUser => u !== null));
}

function sortPresence(users: PresenceUser[]): PresenceUser[] {
  return [...users].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function asChatLine(message: Record<string, unknown>): ChatLine | null {
  const from = asPresenceUser(message["from"]);
  const text = asString(message["text"]);
  const id = asString(message["messageId"]);
  if (!from || !text || !id) return null;
  return {
    id,
    fromUserId: from.userId,
    displayName: from.displayName,
    text,
    sentAt: asString(message["sentAt"]) ?? "",
  };
}

/** Spec 0007 — put a reaction on a line, or take it back. */
function react(state: LobbyState, message: Record<string, unknown>): LobbyState {
  const lineId = asString(message["lineId"]);
  const emoji = asString(message["emoji"]);
  const from = asPresenceUser(message["from"]);
  if (!lineId || !emoji || !from || !REACTIONS.includes(emoji)) return state;
  const on = message["on"] !== false;
  // Spec 0013 — the game's chat or the lobby's, as the server says.
  const key = message["scope"] === "game" ? "gameChat" : "chat";
  const lines = state[key];
  const index = lines.findIndex((line) => line.id === lineId);
  const line = lines[index];
  // A line this page never saw: nothing to put it on (spec 0007).
  if (!line) return state;
  const who = (line.reactions?.[emoji] ?? []).filter((id) => id !== from.userId);
  if (on) who.push(from.userId);
  const reactions = { ...line.reactions, [emoji]: who };
  if (who.length === 0) delete reactions[emoji];
  const next = lines.slice();
  next[index] = { ...line, reactions };
  return { ...state, [key]: next };
}

function asDirectory(value: unknown): DirectoryRoom[] {
  if (!Array.isArray(value)) return [];
  const rooms: DirectoryRoom[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const v = entry as Record<string, unknown>;
    const roomId = asString(v["roomId"]);
    const hostUserId = asString(v["hostUserId"]);
    if (!roomId || !hostUserId) continue;
    const seats: DirectorySeat[] = [];
    for (const seat of Array.isArray(v["seats"]) ? (v["seats"] as unknown[]) : []) {
      if (typeof seat !== "object" || seat === null) continue;
      const s = seat as Record<string, unknown>;
      const userId = asString(s["userId"]);
      const displayName = asString(s["displayName"]);
      if (!userId || !displayName) continue;
      seats.push({
        seatNumber: typeof s["seatNumber"] === "number" ? s["seatNumber"] : 0,
        userId,
        displayName,
        ready: s["ready"] === true,
        isHost: s["isHost"] === true,
      });
    }
    rooms.push({
      roomId,
      name: asString(v["name"]) ?? "A room",
      hostUserId,
      status: asString(v["status"]) ?? "OPEN",
      desiredPlayerCount: typeof v["desiredPlayerCount"] === "number" ? v["desiredPlayerCount"] : 2,
      seats: seats.sort((a, b) => a.seatNumber - b.seatNumber),
      clearsAt: asString(v["clearsAt"]),
      held: asHold(v["held"]),
    });
  }
  return rooms;
}

function asHold(value: unknown): RoomHold | null {
  const named = asNamed(value);
  if (!named) return null;
  return { ...named, asked: (value as Record<string, unknown>)["asked"] === true };
}

function asRoom(value: unknown): RoomView | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const roomId = asString(v["roomId"]);
  const hostUserId = asString(v["hostUserId"]);
  if (!roomId || !hostUserId) return null;
  const members = Array.isArray(v["members"])
    ? (v["members"] as unknown[]).map(asMember).filter((m): m is RoomMemberView => m !== null)
    : [];
  return {
    roomId,
    name: asString(v["name"]) ?? "Your room",
    hostUserId,
    presetId: asString(v["presetId"]) ?? "",
    desiredPlayerCount: typeof v["desiredPlayerCount"] === "number" ? v["desiredPlayerCount"] : 0,
    status: asString(v["status"]) ?? "OPEN",
    revision: typeof v["revision"] === "number" ? v["revision"] : 0,
    everyoneReady: v["everyoneReady"] === true,
    members: members.sort((a, b) => a.seatNumber - b.seatNumber),
  };
}

function asMember(value: unknown): RoomMemberView | null {
  const user = asPresenceUser(value);
  if (!user) return null;
  const v = value as Record<string, unknown>;
  return {
    ...user,
    seatNumber: typeof v["seatNumber"] === "number" ? v["seatNumber"] : 0,
    ready: v["ready"] === true,
    isHost: v["isHost"] === true,
    deckSelected: v["deckSelected"] === true,
    selectedDeckId: asString(v["selectedDeckId"]),
    selectedDeckName: asString(v["selectedDeckName"]),
  };
}

// --- the socket ------------------------------------------------------------

export interface LobbySocket {
  send: (message: Record<string, unknown>) => void;
  close: () => void;
}

/** Waits before each try to reconnect, in milliseconds; the last one repeats. */
export const RECONNECT_DELAYS: readonly number[] = [500, 1000, 2000, 4000, 8000, 15000];

/**
 * How often an open connection says PING, and how long it may hear
 * nothing at all before it counts as lost (2026-10-24). A network that
 * vanishes without closing the connection -- Wi-Fi off, a laptop asleep
 * -- gives the browser no "close" for minutes; the header said
 * "Connected" all that time. The server answers PING with PONG.
 */
export const PING_MS = 20_000;
export const QUIET_MS = 45_000;

/** The server's close for "not signed in" (§3.80): reconnecting cannot fix it. */
const POLICY_CLOSE = 1008;

/**
 * Open /ws/user and reduce it into lobby state -- and keep it open.
 *
 * The same socket the server authenticates and revalidates
 * (carry-forward C3). There is no second connection and no token in
 * the URL: the session cookie authenticates the upgrade (§3.78),
 * which is also why this takes no credentials.
 *
 * A dropped connection is retried on its own (owner report
 * 2026-10-21: after a server update every page went quietly deaf
 * until each player reloaded, so players saw each other offline).
 * The server re-sends who is online, the players, the rooms and
 * your room on every connection; [onReopen] catches up on what a
 * socket cannot re-send -- a room you were removed from, a match
 * that ended -- while this one was away.
 */
export function connectLobby(
  url: string,
  onState: (next: (previous: LobbyState) => LobbyState) => void,
  WebSocketImpl: typeof WebSocket = WebSocket,
  options: { onReopen?: () => void; delays?: readonly number[] } = {},
): LobbySocket {
  const delays = options.delays ?? RECONNECT_DELAYS;
  let closedByUs = false;
  let ended = false;
  let everOpened = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ws: WebSocket | null = null;

  const open = () => {
    const socket = new WebSocketImpl(url);
    ws = socket;
    let dropped = false;
    let heard = Date.now();
    let beat: ReturnType<typeof setInterval> | null = null;

    // Lost: by the browser's "close", or by silence.
    const lost = (code: number) => {
      if (dropped || closedByUs) return;
      dropped = true;
      if (beat !== null) clearInterval(beat);
      if (ended || code === POLICY_CLOSE) {
        ended = true;
        onState((previous) => ({ ...previous, connection: "ended" }));
        return;
      }
      // §5.133 — a page that is not being told must say so; it also
      // says it is putting that right.
      onState((previous) => ({ ...previous, connection: "reconnecting" }));
      const wait = delays[Math.min(attempt, delays.length - 1)] ?? 0;
      attempt += 1;
      timer = setTimeout(() => {
        timer = null;
        if (!closedByUs) open();
      }, wait);
    };

    socket.addEventListener("open", () => {
      attempt = 0;
      const again = everOpened;
      everOpened = true;
      heard = Date.now();
      onState((previous) => ({ ...previous, connection: "open" }));
      if (again) options.onReopen?.();
      beat = setInterval(() => {
        if (closedByUs) {
          if (beat !== null) clearInterval(beat);
          return;
        }
        if (Date.now() - heard > QUIET_MS) {
          lost(1006);
          try {
            socket.close();
          } catch {
            /* already gone */
          }
          return;
        }
        try {
          socket.send(JSON.stringify({ type: "PING" }));
        } catch {
          // The silence check above catches a socket that cannot send.
        }
      }, PING_MS);
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      heard = Date.now();
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        // §1.34 — a malformed frame is dropped, never interpreted.
        return;
      }
      if (typeof parsed !== "object" || parsed === null) return;
      const message = parsed as Record<string, unknown>;
      if (message["type"] === "SESSION_ENDED") ended = true;
      onState((previous) => reduceLobby(previous, message));
    });

    // A browser fires "close" after every failed or lost connection,
    // "error" or not, and only "close" carries the server's reason.
    socket.addEventListener("close", (event: CloseEvent) => {
      if (beat !== null) clearInterval(beat);
      // A refresh closes it on the way out: that is not a lost
      // connection, and the page says nothing (owner 2026-10-24).
      if (pageIsLeaving()) {
        dropped = true;
        return;
      }
      lost(event.code);
    });
  };

  open();
  // Back from the browser's back/forward cache with the connection gone.
  const stopBack = onPageBack(() => {
    if (!closedByUs && !ended && (ws === null || ws.readyState >= 2)) open();
  });

  return {
    send: (message) => {
      try {
        ws?.send(JSON.stringify(message));
      } catch {
        // A send on a dying socket is not worth an exception in a
        // click handler; the close event is about to arrive.
      }
    },
    close: () => {
      closedByUs = true;
      stopBack();
      if (timer !== null) clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    },
  };
}

/**
 * After a reconnect: what the socket cannot re-send.
 *
 * The server re-sends your room when you are in one, but says nothing
 * when you are not -- so a room you were removed from while away, or
 * one that closed, would stay on screen. And a match that ended while
 * the page was away would still look like it was running.
 */
export async function catchUp(
  apply: (next: (previous: LobbyState) => LobbyState) => void,
  current: () => LobbyState,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const room = await currentRoomAnswer(fetchFn);
  if (room.ok) apply((previous) => adoptCurrentRoom(previous, room.room));

  const match = await matchAnswer("/api/matches/current", fetchFn);
  if (match) {
    apply((previous) => reduceLobby(previous, { ...match, type: "MATCH" }));
    return;
  }
  const shown = current().match;
  if (!shown || shown.status === "ENDED" || shown.status === "FAILED_RUNTIME") return;
  const ended = await matchAnswer(`/api/matches/${encodeURIComponent(shown.matchId)}`, fetchFn);
  if (ended) apply((previous) => reduceLobby(previous, { ...ended, type: "MATCH" }));
}

/** The room the server says you are in now; null when none. */
export function adoptCurrentRoom(state: LobbyState, room: RoomView | null): LobbyState {
  if (room) {
    if (state.room && state.room.roomId === room.roomId && state.room.revision >= room.revision) {
      return state;
    }
    return { ...state, room };
  }
  if (!state.room) return state;
  return {
    ...state,
    room: null,
    left: { roomId: state.room.roomId, revision: state.room.revision },
    setupProblem: null,
  };
}

async function currentRoomAnswer(
  fetchFn: typeof fetch,
): Promise<{ ok: true; room: RoomView | null } | { ok: false }> {
  try {
    const response = await apiFetch("/api/rooms/current", {}, fetchFn);
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as Record<string, unknown>;
    return { ok: true, room: asRoom(body["room"]) };
  } catch {
    return { ok: false };
  }
}

async function matchAnswer(
  path: string,
  fetchFn: typeof fetch,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await apiFetch(path, {}, fetchFn);
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    const match = body["match"];
    return typeof match === "object" && match !== null ? (match as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// --- the room API ------------------------------------------------------------
//
// Every mutation carries `expectedRoomRevision` where the server
// accepts one (§5.136). That is the point of the field: a second
// click on a view that has moved is refused with 409 instead of
// overwriting a change this page never saw.

export interface RoomFailure {
  errorCode: string;
  detail: string;
  /** §5.101 — present on SETUP_NOT_READY. Who, never why. */
  seats?: { userId: string; needsAttention: boolean }[];
}

export type RoomResult = { ok: true; room: RoomView } | { ok: false; failure: RoomFailure };

async function roomCall(
  path: string,
  init: RequestInit,
  fetchFn: typeof fetch = fetch,
): Promise<RoomResult> {
  let response: Response;
  try {
    response = await apiFetch(path, init, fetchFn);
  } catch {
    return {
      ok: false,
      failure: { errorCode: "NETWORK", detail: "The server could not be reached." },
    };
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        errorCode: asString(body["errorCode"]) ?? "REQUEST_FAILED",
        detail: asString(body["detail"]) ?? "That did not work.",
        ...(Array.isArray(body["seats"])
          ? { seats: body["seats"] as { userId: string; needsAttention: boolean }[] }
          : {}),
      },
    };
  }

  const room = asRoom(body["room"]);
  if (!room) {
    return {
      ok: false,
      failure: { errorCode: "MALFORMED_RESPONSE", detail: "The server's answer made no sense." },
    };
  }
  return { ok: true, room };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** PHASE_07 Amendment 9 — open a room, optionally named; blank is "<you>'s room". */
export function createRoom(fetchFn: typeof fetch = fetch, name?: string): Promise<RoomResult> {
  const trimmed = name?.trim();
  return roomCall(
    "/api/rooms",
    trimmed
      ? { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name: trimmed }) }
      : { method: "POST" },
    fetchFn,
  );
}

export function leaveRoom(roomId: string, fetchFn: typeof fetch = fetch): Promise<RoomResult> {
  return roomCall(`/api/rooms/${roomId}/leave`, { method: "POST" }, fetchFn);
}

export function closeRoom(roomId: string, fetchFn: typeof fetch = fetch): Promise<RoomResult> {
  return roomCall(`/api/rooms/${roomId}/close`, { method: "POST" }, fetchFn);
}

export function removeMember(
  roomId: string,
  userId: string,
  revision: number,
  fetchFn: typeof fetch = fetch,
): Promise<RoomResult> {
  return roomCall(
    `/api/rooms/${roomId}/members/${userId}?expectedRoomRevision=${revision}`,
    { method: "DELETE" },
    fetchFn,
  );
}

export function selectDeck(
  roomId: string,
  deckId: string | null,
  revision: number,
  fetchFn: typeof fetch = fetch,
): Promise<RoomResult> {
  return roomCall(
    `/api/rooms/${roomId}/my-deck`,
    {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ deckId, expectedRoomRevision: revision }),
    },
    fetchFn,
  );
}

export function setReady(
  roomId: string,
  ready: boolean,
  revision: number,
  fetchFn: typeof fetch = fetch,
): Promise<RoomResult> {
  return roomCall(
    `/api/rooms/${roomId}/ready`,
    {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ ready, expectedRoomRevision: revision }),
    },
    fetchFn,
  );
}

export function cancelPreparation(
  roomId: string,
  fetchFn: typeof fetch = fetch,
): Promise<RoomResult> {
  return roomCall(`/api/rooms/${roomId}/cancel-preparation`, { method: "POST" }, fetchFn);
}

/**
 * §5.91 — prepare the match.
 *
 * Answers with the ROOM on success, because the room's status
 * changes to READY_FOR_MATCH and that is what the page renders. The
 * setup itself is Phase 6's to launch; a lobby does not need its
 * contents.
 */
export async function prepareMatch(
  roomId: string,
  revision: number,
  fetchFn: typeof fetch = fetch,
): Promise<RoomResult> {
  let response: Response;
  try {
    response = await apiFetch(
      `/api/rooms/${roomId}/prepare-match?expectedRoomRevision=${revision}`,
      { method: "POST" },
      fetchFn,
    );
  } catch {
    return {
      ok: false,
      failure: { errorCode: "NETWORK", detail: "The server could not be reached." },
    };
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        errorCode: asString(body["errorCode"]) ?? "REQUEST_FAILED",
        detail: asString(body["detail"]) ?? "The match could not be prepared.",
        ...(Array.isArray(body["seats"])
          ? { seats: body["seats"] as { userId: string; needsAttention: boolean }[] }
          : {}),
      },
    };
  }

  const room = asRoom(body["room"]);
  if (!room) {
    return {
      ok: false,
      failure: { errorCode: "MALFORMED_RESPONSE", detail: "The server's answer made no sense." },
    };
  }
  return { ok: true, room };
}

/**
 * PHASE_06 §6.10 — the setup id the launch needs.
 *
 * Fetched rather than remembered. The host may have prepared the
 * match in a previous page load, or on another device, and a
 * "Start match" button that only works when THIS tab did the
 * preparing is a button that mysteriously does nothing.
 */
export async function fetchMatchSetupId(
  roomId: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await apiFetch(`/api/rooms/${roomId}/match-setup`, {}, fetchFn);
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    const setup = body["setup"];
    if (typeof setup !== "object" || setup === null) return null;
    return asString((setup as Record<string, unknown>)["setupId"]);
  } catch {
    return null;
  }
}

export type MatchResult = { ok: true; match: MatchView } | { ok: false; failure: RoomFailure };

/**
 * §6.10, §6.17 — start it. The answer is LAUNCHING, not RUNNING.
 *
 * The body carries ONLY the setup id: not seats, not decks, not
 * the preset. §6.10 is explicit about it, and the reason is that a
 * client which can name its own seat can name somebody else's.
 */
export async function launchMatch(
  setupId: string,
  fetchFn: typeof fetch = fetch,
): Promise<MatchResult> {
  let response: Response;
  try {
    response = await apiFetch(
      "/api/matches",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupId }),
      },
      fetchFn,
    );
  } catch {
    return {
      ok: false,
      failure: { errorCode: "NETWORK", detail: "The server could not be reached." },
    };
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        errorCode: asString(body["errorCode"]) ?? "REQUEST_FAILED",
        detail: asString(body["detail"]) ?? "The match could not be started.",
      },
    };
  }
  const match = asMatch(body["match"]);
  if (!match) {
    return {
      ok: false,
      failure: { errorCode: "MALFORMED_RESPONSE", detail: "The server's answer made no sense." },
    };
  }
  return { ok: true, match };
}

/** §6.114 — asked on load, so a refresh lands you back in the match. */
/**
 * §6.162 — end a match that has stopped responding.
 *
 * The browser names a MATCH it is in, and nothing else: §6.164
 * forbids it controlling a worker, so there is no pid, path or
 * handle here and the server decides what ending it means.
 */
export async function abandonMatch(
  matchId: string,
  fetchFn: typeof fetch = fetch,
): Promise<MatchResult> {
  let response: Response;
  try {
    response = await apiFetch(`/api/matches/${matchId}/abandon`, { method: "POST" }, fetchFn);
  } catch {
    return {
      ok: false,
      failure: { errorCode: "NETWORK", detail: "The server could not be reached." },
    };
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        errorCode: asString(body["errorCode"]) ?? "REQUEST_FAILED",
        detail: asString(body["detail"]) ?? "The match could not be abandoned.",
      },
    };
  }
  const match = asMatch(body["match"]);
  return match
    ? { ok: true, match }
    : {
        ok: false,
        failure: { errorCode: "MALFORMED_RESPONSE", detail: "The server's answer made no sense." },
      };
}

export async function fetchCurrentMatch(fetchFn: typeof fetch = fetch): Promise<MatchView | null> {
  try {
    const response = await apiFetch("/api/matches/current", {}, fetchFn);
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    return asMatch(body["match"]);
  } catch {
    return null;
  }
}

function asMatch(value: unknown): MatchView | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const matchId = asString(row["matchId"]);
  const status = asString(row["status"]);
  if (!matchId || !status) return null;
  return {
    matchId,
    status,
    failureCode: asString(row["failureCode"]),
    participants: asMatchSeats(row["participants"]),
    outcome: asOutcome(row),
  };
}

/** §5.139 — asked on load, so a refresh lands you back in the room. */
export async function fetchCurrentRoom(fetchFn: typeof fetch = fetch): Promise<RoomView | null> {
  try {
    const response = await apiFetch("/api/rooms/current", {}, fetchFn);
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    return asRoom(body["room"]);
  } catch {
    return null;
  }
}
