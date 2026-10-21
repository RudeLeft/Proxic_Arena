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

import type { DirectoryRoom, LobbyState, PresenceUser } from "./lobby";

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
export function playerRows(lobby: LobbyState, me: string): PlayerRow[] {
  const online = new Set(lobby.presence.map((p) => p.userId));
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
    const seatedIn = roomOf(lobby.rooms, user.userId);
    const inMyRoom = mine !== null && seatedIn?.roomId === mine.roomId;
    const invited = lobby.outgoing?.to.userId === user.userId;
    const declined = !invited && lobby.declinedBy === user.userId;

    let where: string;
    if (!isOnline) where = "Offline";
    else if (invited) where = `Invited to ${mine?.name ?? "your room"}`;
    else if (declined) where = "Declined your invitation";
    else if (inMyRoom) where = "In your room";
    else if (seatedIn?.status === "IN_MATCH") where = "In a match";
    else if (seatedIn) where = `In ${seatedIn.name}`;
    else where = "In the lobby";

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

/** The word on a room's state chip. */
export function roomStateLabel(room: DirectoryRoom): string {
  switch (room.status) {
    case "IN_MATCH":
      return "In a match";
    case "READY_FOR_MATCH":
      return "Starting";
    default:
      return room.seats.length < room.desiredPlayerCount ? "Open seat" : "Setting up";
  }
}

/** "23h", "45m", "now" — how long until an idle room clears (D4). */
export function clearsIn(clearsAt: string | null, now: number): string | null {
  if (!clearsAt) return null;
  const ms = Date.parse(clearsAt) - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 60_000) return "now";
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours}h` : `${Math.ceil(ms / 60_000)}m`;
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
