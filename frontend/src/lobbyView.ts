// What the Lobby page decides — PHASE_07 §7.64, Amendments 9 and 11.
//
// UI-free, like lobby.ts: the rules about who may be invited, how a
// room's state reads and which room comes first are where a lobby is
// wrong, and none of them needs a browser to check. The page only
// draws what these say.
//
// Everything here is a courtesy. The server refuses an invitation it
// would not honour whatever the button looked like; these make the
// button say so before anybody presses it.

import type { ChatLine, DirectoryRoom, LobbyState, PresenceUser } from "./lobby";

/** What the Invite control on one player's row is. */
export type InviteControl =
  /** No button: offline, or already sitting at your table. */
  | { kind: "none" }
  /** Live: sends an invitation, or offers to open a room first. */
  | { kind: "invite"; needsRoom: boolean }
  /** Your one invitation is out to this player. */
  | { kind: "invited" }
  /** Dim, with the reason for anybody who asks. */
  | { kind: "blocked"; why: string };

export interface PlayerRow {
  user: PresenceUser;
  online: boolean;
  /** Where they are, in words: "In the lobby", "In a match", "Offline"… */
  where: string;
  /** How [where] should read: an invitation, a decline, or ordinary. */
  tone: "plain" | "invited" | "declined" | "offline";
  control: InviteControl;
}

/** The room a player is seated in, if any. */
export function roomOf(rooms: DirectoryRoom[], userId: string): DirectoryRoom | null {
  return rooms.find((room) => room.seats.some((seat) => seat.userId === userId)) ?? null;
}

/**
 * Everybody but you, online first, then by name (Amendment 11: offline
 * people are listed, greyed).
 */
export function playerRows(lobby: LobbyState, me: string, now: number = Date.now()): PlayerRow[] {
  const online = new Map(lobby.presence.map((p) => [p.userId, p]));
  // The account list, with anybody online who is not on it yet (an
  // account created since this page connected still arrives).
  const everyone = new Map(lobby.players.map((p) => [p.userId, p]));
  for (const p of lobby.presence) if (!everyone.has(p.userId)) everyone.set(p.userId, p);

  const mine = lobby.room;
  const iHost = mine !== null && mine.hostUserId === me;
  const openSeat = mine !== null && mine.members.length < mine.desiredPlayerCount;
  const roomOpen = mine?.status === "OPEN";

  const rows: PlayerRow[] = [];
  for (const user of everyone.values()) {
    if (user.userId === me) continue;
    const isOnline = online.has(user.userId);
    const status = statusOf(lobby, user.userId, now);
    const seatedIn = roomOf(lobby.rooms, user.userId);
    const inMyRoom = mine !== null && seatedIn?.roomId === mine.roomId;
    const invited = lobby.outgoing?.to.userId === user.userId;
    const declined = !invited && lobby.declinedBy === user.userId;

    let where: string;
    if (!isOnline) where = status.label;
    else if (invited) where = `Invited to ${mine?.name ?? "your room"}`;
    else if (declined) where = "Declined your invitation";
    else if (inMyRoom) where = "In your room";
    else if (seatedIn?.status === "IN_MATCH") where = "In a match";
    else if (seatedIn) where = `In ${seatedIn.name}`;
    else where = "In the lobby";
    // Spec 0009 — away, and where: "Away 7 min · in the lobby".
    if (status.kind === "away")
      where = `${status.label} · ${where.charAt(0).toLowerCase()}${where.slice(1)}`;

    let control: InviteControl;
    if (!isOnline || inMyRoom) control = { kind: "none" };
    else if (invited) control = { kind: "invited" };
    else if (seatedIn)
      control = { kind: "blocked", why: `${user.displayName} is already in a room` };
    else if (mine === null) control = { kind: "invite", needsRoom: true };
    else if (!iHost) control = { kind: "blocked", why: "Only the host of a room invites" };
    else if (!roomOpen || !openSeat)
      control = { kind: "blocked", why: "Your room has no free seat" };
    else if (lobby.outgoing) control = { kind: "blocked", why: "One invitation at a time" };
    else control = { kind: "invite", needsRoom: false };

    rows.push({
      user,
      online: isOnline,
      where,
      tone: !isOnline ? "offline" : invited ? "invited" : declined ? "declined" : "plain",
      control,
    });
  }
  return rows.sort(
    (a, b) =>
      Number(b.online) - Number(a.online) || a.user.displayName.localeCompare(b.user.displayName),
  );
}

/** Spec 0006 — a room's one status, in plain words. */
export function roomStatus(room: DirectoryRoom): string {
  switch (room.status) {
    case "IN_MATCH":
      return "In a game";
    case "READY_FOR_MATCH":
      return "Starting…";
    default:
      if (room.seats.length < room.desiredPlayerCount) return "Waiting for a player";
      return room.seats.every((seat) => seat.ready) ? "Ready to start" : "Choosing decks";
  }
}

/** Why an invitation to you ended, as a title: "RudeLeft withdrew the invitation". */
export function goneTitle(reason: string, from: string | null): string {
  const who = from ?? "The host";
  switch (reason) {
    case "WITHDRAWN":
      return `${who} withdrew the invitation`;
    case "ROOM_CLOSED":
      return `${who}'s room closed, so the invitation ended`;
    case "SEAT_FILLED":
      return "The seat was taken, so the invitation ended";
    case "OFFLINE":
      return `${who} left, so the invitation ended`;
    default:
      return "That invitation is no longer open";
  }
}

// --- the room list (spec 0016, owner R1-R4) -------------------------------------

/** How a room's status line reads: its words and its colour. */
export interface RoomLine {
  text: string;
  tone: "open" | "held" | "busy" | "playing";
}

/**
 * Spec 0016 R1/R2 — where somebody else's room stands, for everyone:
 * "1 seat open", "Waiting on Pat's answer" (a held seat), "Choosing
 * decks", "Ready to start", "Starting…", "In a game".
 */
export function roomLine(room: DirectoryRoom): RoomLine {
  if (room.status === "IN_MATCH") return { text: "In a game", tone: "playing" };
  if (room.status === "READY_FOR_MATCH") return { text: "Starting…", tone: "busy" };
  const open = room.desiredPlayerCount - room.seats.length;
  if (open <= 0) {
    const ready = room.seats.every((seat) => seat.ready);
    return { text: ready ? "Ready to start" : "Choosing decks", tone: "busy" };
  }
  if (room.held) {
    // An invitation waits on the player; a request waits on the host.
    const host = room.seats.find((seat) => seat.isHost)?.displayName ?? "the host";
    const who = room.held.asked ? host : room.held.displayName;
    return { text: `Waiting on ${who}'s answer`, tone: "held" };
  }
  return { text: `${open} ${open === 1 ? "seat" : "seats"} open`, tone: "open" };
}

/** What the viewer can do about somebody else's room. */
export type RoomAction =
  /** You are invited: Accept or Decline. */
  | { kind: "invited" }
  /** You asked to join: Cancel. */
  | { kind: "asked" }
  /** An open seat nobody holds, and you are free: Ask to join. */
  | { kind: "ask" }
  | { kind: "none" };

/** Spec 0016 R3 — Ask to join only into an open seat nobody holds, by somebody in no room and holding nothing. */
export function roomAction(room: DirectoryRoom, lobby: LobbyState, me: string): RoomAction {
  if (lobby.invitation?.roomId === room.roomId) return { kind: "invited" };
  if (lobby.asking?.roomId === room.roomId) return { kind: "asked" };
  const seatFree =
    room.status === "OPEN" && room.seats.length < room.desiredPlayerCount && room.held === null;
  const iAmFree = !lobby.room && !lobby.invitation && !lobby.asking && room.hostUserId !== me;
  return seatFree && iAmFree ? { kind: "ask" } : { kind: "none" };
}

/**
 * Spec 0016 R4 — most useful first: a room you are invited to or asked
 * into, then rooms with an open seat, then full rooms getting ready,
 * then rooms in a game; within each, the one closing soonest first.
 */
export function sortRooms(rooms: DirectoryRoom[], lobby: LobbyState): DirectoryRoom[] {
  const group = (room: DirectoryRoom) => {
    if (lobby.invitation?.roomId === room.roomId || lobby.asking?.roomId === room.roomId) return 0;
    if (room.status === "IN_MATCH") return 3;
    if (room.status === "OPEN" && room.seats.length < room.desiredPlayerCount) return 1;
    return 2;
  };
  const clears = (room: DirectoryRoom) => (room.clearsAt ? Date.parse(room.clearsAt) : Infinity);
  return [...rooms].sort((a, b) => group(a) - group(b) || clears(a) - clears(b));
}

/** Spec 0006 D3 — how soon a room closes, but only in its last 3 hours. */
const CLOSES_SOON_MS = 3 * 3_600_000;

/** "Closes in 2h", "Closes in 45m", "Closes now" — or null while it is not soon (D3). */
export function closesSoon(clearsAt: string | null, now: number): string | null {
  if (!clearsAt) return null;
  const ms = Date.parse(clearsAt) - now;
  if (Number.isNaN(ms) || ms > CLOSES_SOON_MS) return null;
  if (ms <= 60_000) return "Closes now";
  const hours = Math.floor(ms / 3_600_000);
  return `Closes in ${hours >= 1 ? `${hours}h` : `${Math.ceil(ms / 60_000)}m`}`;
}

// --- online, away, offline (spec 0009) -----------------------------------------

export type PresenceKind = "online" | "away" | "offline";

/** "just now", "5 min ago", "2h ago", "yesterday", "3 days ago". */
export function agoText(at: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (Number.isNaN(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * Online, away or offline, and how to say it: "Away 7 min", "Offline ·
 * last seen 2h ago", or just "Offline" when no session remains.
 */
export function statusOf(
  lobby: LobbyState,
  userId: string,
  now: number,
): { kind: PresenceKind; label: string } {
  const here = lobby.presence.find((p) => p.userId === userId);
  if (here?.awaySince) {
    const minutes = Math.max(1, Math.round((now - Date.parse(here.awaySince)) / 60_000));
    return {
      kind: "away",
      label: minutes < 60 ? `Away ${minutes} min` : `Away ${Math.floor(minutes / 60)}h`,
    };
  }
  if (here) return { kind: "online", label: "Online" };
  const seen = lobby.players.find((p) => p.userId === userId)?.lastSeenAt;
  return { kind: "offline", label: seen ? `Offline · last seen ${agoText(seen, now)}` : "Offline" };
}

/** The badge an avatar wears, and its words for a screen reader: "Dana, away 7 min". */
export function presenceOf(
  lobby: LobbyState,
  userId: string,
  name: string,
  now: number,
): { status: PresenceKind; statusLabel: string } {
  const { kind, label } = statusOf(lobby, userId, now);
  return {
    status: kind,
    statusLabel: `${name}, ${label.charAt(0).toLowerCase()}${label.slice(1)}`,
  };
}

/** Spec 0019 F2 — the one size for pictures in lists and chat, and deck icons in rooms. */
export const ICON = 40;

/** Spec 0020 — the one size for featured pictures: lobby seats, the Hall's places and belt. */
export const SEAT_AVATAR = 56;

/** Spec 0011 — a place in the Hall of Champions: 1st, 2nd, 3rd or dead last. */
export type Rank = 1 | 2 | 3 | "last";

/** The ring a player's picture wears in the lobby, if any (spec 0011, C4). */
export function rankOf(lobby: LobbyState, userId: string): Rank | undefined {
  const standings = lobby.standings;
  if (!standings) return undefined;
  const place = standings.podium.findIndex((s) => s.userId === userId);
  if (place >= 0) return (place + 1) as Rank;
  return standings.last?.userId === userId ? "last" : undefined;
}

/** Spec 0019 F1 — whether [userId] holds the Champion's Belt. */
export function holdsBelt(lobby: LobbyState, userId: string | null | undefined): boolean {
  return !!userId && lobby.standings?.belt === userId;
}

/** Spec 0006 — a player's avatar, from the account list; null is the default. */
export function avatarOf(lobby: LobbyState, userId: string): string | null {
  return (
    lobby.players.find((p) => p.userId === userId)?.avatar ??
    lobby.presence.find((p) => p.userId === userId)?.avatar ??
    null
  );
}

/**
 * Yours pinned first; then the rest soonest-to-clear first, as the
 * canvas orders them; rooms in a match (which do not clear) last.
 */
export function orderRooms(rooms: DirectoryRoom[], mineId: string | null): DirectoryRoom[] {
  const key = (room: DirectoryRoom) =>
    room.roomId === mineId ? -Infinity : room.clearsAt ? Date.parse(room.clearsAt) : Infinity;
  return [...rooms].sort((a, b) => key(a) - key(b));
}

// --- chat (spec 0007) ---------------------------------------------------------

/** One thing in the chat log: the "New" divider, or a run of lines. */
export type ChatItem =
  | { kind: "new"; id: string }
  | {
      kind: "run";
      id: string;
      fromUserId: string;
      displayName: string;
      sentAt: string;
      lines: ChatLine[];
    };

/**
 * The chat as it is drawn: lines from one person in a row share one
 * bubble (name, time and avatar once); "New" goes before [newBefore].
 */
export function chatItems(chat: ChatLine[], newBefore: string | null): ChatItem[] {
  const items: ChatItem[] = [];
  for (const line of chat) {
    if (line.id === newBefore) items.push({ kind: "new", id: `new-${line.id}` });
    const last = items[items.length - 1];
    if (last?.kind === "run" && last.fromUserId === line.fromUserId) {
      last.lines.push(line);
    } else {
      items.push({
        kind: "run",
        id: line.id,
        fromUserId: line.fromUserId,
        displayName: line.displayName,
        sentAt: line.sentAt,
        lines: [line],
      });
    }
  }
  return items;
}

/** Spec 0007 — the lines from others after [seenId]: unread. All of them when it is gone. */
export function unreadAfter(
  chat: ChatLine[],
  seenId: string | null,
  me: string | null,
): ChatLine[] {
  const at = seenId === null ? -1 : chat.findIndex((line) => line.id === seenId);
  return chat.slice(at + 1).filter((line) => line.fromUserId !== me);
}
