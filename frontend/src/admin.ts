// The Admin page's client — PHASE_07 §7.67, Amendment 9.
//
// UI-free, like decks.ts and lobby.ts. The server decides who may do
// any of this, every time (§3.19); these functions only ask, and turn
// each answer into words a person can act on.

import { apiFetch } from "./auth";
import type { DirectoryRoom } from "./lobby";

export interface AdminAccount {
  userId: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "PLAYER";
  status: "ACTIVE" | "DISABLED";
  sessions: number;
  lastSignInAt: string | null;
  /** The only active administrator: the page offers no Disable and no Make player. */
  lastAdmin: boolean;
}

export interface AdminRoom {
  room: DirectoryRoom;
  lastActivityAt: string;
}

export interface ServerState {
  version: string;
  database: string;
  forgeWorker: string;
  gamesRunning: number;
  uptimeSeconds: number;
}

/** PHASE_07 §7.56 — a recent match, and its game record if one is kept. */
export interface AdminMatch {
  matchId: string;
  status: string;
  createdAt: string;
  endedAt: string | null;
  players: string;
  recordBytes: number | null;
  /** How it ended: Forge's result, or why it stopped (owner 2026-10-22). */
  ending: string | null;
}

export interface AdminMatches {
  matches: AdminMatch[];
  keepDays: number;
}

export interface SignInEvent {
  at: string;
  kind: "SIGNED_IN" | "FAILED" | "THROTTLED";
  username: string;
  known: boolean;
  address: string | null;
}

/** Several attempts in a row, read as one line ("3 attempts"). */
export interface SignInLine extends SignInEvent {
  count: number;
}

export type AdminOutcome = { ok: true; detail: string } | { ok: false; message: string };

async function read<T>(
  path: string,
  pick: (body: Record<string, unknown>) => T,
  fetchFn: typeof fetch,
): Promise<T | null> {
  try {
    const response = await fetchFn(path, { credentials: "same-origin" });
    if (!response.ok) return null;
    return pick((await response.json()) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export const fetchAccounts = (fetchFn: typeof fetch = fetch) =>
  read("/api/admin/accounts", (b) => (b["accounts"] as AdminAccount[]) ?? [], fetchFn);

export const fetchAdminRooms = (fetchFn: typeof fetch = fetch) =>
  read("/api/admin/rooms", (b) => (b["rooms"] as AdminRoom[]) ?? [], fetchFn);

export const fetchServerState = (fetchFn: typeof fetch = fetch) =>
  read("/api/admin/server", (b) => b as unknown as ServerState, fetchFn);

export const fetchAdminMatches = (fetchFn: typeof fetch = fetch) =>
  read(
    "/api/admin/matches",
    (b) => ({
      matches: (b["matches"] as AdminMatch[]) ?? [],
      keepDays: typeof b["keepDays"] === "number" ? b["keepDays"] : 0,
    }),
    fetchFn,
  );

/** Where a match's game record downloads from (an administrator's session only). */
export const recordUrl = (matchId: string) =>
  `/api/admin/matches/${encodeURIComponent(matchId)}/record`;

/** "1.4 MB", "820 KB". */
export function sizeText(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export const fetchSignIns = (fetchFn: typeof fetch = fetch) =>
  read("/api/admin/sign-ins", (b) => (b["events"] as SignInEvent[]) ?? [], fetchFn);

async function act(
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  fetchFn: typeof fetch,
): Promise<AdminOutcome> {
  let response: Response;
  try {
    response = await apiFetch(
      path,
      {
        method,
        ...(body === undefined
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      },
      fetchFn,
    );
  } catch {
    return { ok: false, message: "The server could not be reached." };
  }
  const answer = (await response.json().catch(() => null)) as {
    detail?: string;
  } | null;
  if (response.ok) return { ok: true, detail: answer?.detail ?? "Done." };
  // The server's own words: it knows whether this was the last
  // administrator, a taken username or a weak password.
  return { ok: false, message: answer?.detail ?? "That did not work." };
}

// --- invitations (spec 0014) -------------------------------------------------------

export interface Invite {
  inviteId: string;
  email: string;
  role: "ADMIN" | "PLAYER";
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  state: "WAITING" | "JOINED" | "CANCELLED" | "EXPIRED";
  joinedAs?: string | null;
}

/** An invitation just made: its link this once, and whether it was emailed. */
export interface InviteSent {
  email: string;
  link: string;
  emailed: boolean;
  expiresAt: string;
  /** Why the email did not go, when it was tried and failed. */
  emailProblem?: string | null;
}

export type InviteOutcome = { ok: true; sent: InviteSent } | { ok: false; message: string };

export const fetchInvites = (fetchFn: typeof fetch = fetch) =>
  read(
    "/api/admin/invites",
    (b) => ({ invites: (b["invites"] as Invite[]) ?? [], emailReady: b["emailReady"] === true }),
    fetchFn,
  );

async function inviteCall(
  path: string,
  body: unknown,
  fetchFn: typeof fetch,
): Promise<InviteOutcome> {
  let response: Response;
  try {
    response = await apiFetch(
      path,
      {
        method: "POST",
        ...(body === undefined
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      },
      fetchFn,
    );
  } catch {
    return { ok: false, message: "The server could not be reached." };
  }
  const answer = (await response.json().catch(() => null)) as
    | (InviteSent & { detail?: string })
    | null;
  if (response.ok && answer?.link) return { ok: true, sent: answer };
  return { ok: false, message: answer?.detail ?? "That did not work." };
}

export const sendInvite = (
  email: string,
  role: "ADMIN" | "PLAYER",
  fetchFn: typeof fetch = fetch,
) => inviteCall("/api/admin/invites", { email, role }, fetchFn);

export const resendInvite = (inviteId: string, fetchFn: typeof fetch = fetch) =>
  inviteCall(`/api/admin/invites/${encodeURIComponent(inviteId)}/resend`, undefined, fetchFn);

export const cancelInvite = (inviteId: string, fetchFn: typeof fetch = fetch) =>
  act(`/api/admin/invites/${encodeURIComponent(inviteId)}/cancel`, "POST", undefined, fetchFn);

export const setStatus = (
  userId: string,
  status: "ACTIVE" | "DISABLED",
  fetchFn: typeof fetch = fetch,
) => act(`/api/admin/accounts/${userId}/status`, "PUT", { status }, fetchFn);

export const setRole = (userId: string, role: "ADMIN" | "PLAYER", fetchFn: typeof fetch = fetch) =>
  act(`/api/admin/accounts/${userId}/role`, "PUT", { role }, fetchFn);

export const resetPassword = (userId: string, password: string, fetchFn: typeof fetch = fetch) =>
  act(`/api/admin/accounts/${userId}/password`, "POST", { password }, fetchFn);

export const signOutEverywhere = (userId: string, fetchFn: typeof fetch = fetch) =>
  act(`/api/admin/accounts/${userId}/sign-out`, "POST", undefined, fetchFn);

export const forceClose = (roomId: string, fetchFn: typeof fetch = fetch) =>
  act(`/api/admin/rooms/${roomId}/close`, "POST", undefined, fetchFn);

/**
 * Consecutive attempts of the same kind, on the same name, from the
 * same address read as one line with a count — a brute-force run is
 * one fact, not forty rows. Newest first, as the server sends them.
 */
export function groupSignIns(events: SignInEvent[]): SignInLine[] {
  const lines: SignInLine[] = [];
  for (const event of events) {
    const last = lines[lines.length - 1];
    if (
      last &&
      last.kind === event.kind &&
      last.username === event.username &&
      last.address === event.address
    ) {
      last.count += 1;
    } else {
      lines.push({ ...event, count: 1 });
    }
  }
  return lines;
}

/** "6d 02h", "3h 12m", "45m" — how long the server has been up. */
export function uptimeText(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

/** "3h", "15m", "now" — how long since anybody did anything in a room. */
export function idleText(lastActivityAt: string, now: number): string {
  const ms = now - Date.parse(lastActivityAt);
  if (Number.isNaN(ms) || ms < 60_000) return "now";
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours}h` : `${Math.floor(ms / 60_000)}m`;
}

/** The worker's state, in words. */
export function workerText(state: ServerState): string {
  const running = state.gamesRunning;
  const games = running === 0 ? "" : running === 1 ? " · 1 game" : ` · ${running} games`;
  switch (state.forgeWorker) {
    case "ok":
      return `Ready${games}`;
    case "unconfigured":
      return "Not configured";
    case "missing":
      return "Missing";
    case "unprobed":
      return `Not checked${games}`;
    default:
      return `${state.forgeWorker}${games}`;
  }
}

// --- spec 0010: the overview, and plain words ---------------------------------

/** "1.2.0 (512116e5405f…)" -> { number: "1.2.0", build: "512116e" }; "(dev)" stays "dev". */
export function versionParts(version: string): {
  number: string;
  build: string | null;
  full: string;
} {
  const match = /^(\S+)\s*\(([^)]+)\)\s*$/.exec(version.trim());
  if (!match) return { number: version.trim(), build: null, full: version };
  const build = match[2]!;
  return {
    number: match[1]!,
    build: /^[0-9a-f]{8,}$/i.test(build) ? build.slice(0, 7) : build,
    full: version,
  };
}

/** Why a game stopped or never started, in words; the code itself stays in the tooltip. */
const REASON_WORDS: Record<string, string> = {
  WORKER_UNREACHABLE: "couldn't reach the rules engine",
  WORKER_STOPPED: "the rules engine stopped",
  WORKER_INCOMPATIBLE: "the rules engine is the wrong version",
  WORKER_UNCONFIGURED: "the rules engine isn't set up",
  WORKER_MISSING: "the rules engine isn't installed",
  GAME_START_FAILED: "the game could not be set up",
  GAME_START_TIMEOUT: "the game took too long to start",
  DECK_UNAVAILABLE: "a deck was no longer available",
  SERVER_RESTARTED: "the server restarted",
};

/**
 * How a game ended, in a few words: "Finished · RudeLeft won", "Didn't
 * start · couldn't reach the rules engine", "Stopped · the server
 * restarted", "Abandoned". [code] is the raw reason, when there was one.
 */
export function outcomeText(match: AdminMatch): {
  text: string;
  tone: "ok" | "warn" | "bad" | "plain";
  code: string | null;
} {
  const reason = (prefix: string) => {
    const raw = match.ending?.startsWith(prefix) ? match.ending.slice(prefix.length).trim() : null;
    return { raw, words: raw ? (REASON_WORDS[raw] ?? raw) : null };
  };
  switch (match.status) {
    case "ENDED":
      return {
        text: match.ending ? `Finished · ${match.ending}` : "Finished",
        tone: "ok",
        code: null,
      };
    case "FAILED_STARTUP": {
      const { raw, words } = reason("Did not start:");
      return { text: words ? `Didn't start · ${words}` : "Didn't start", tone: "warn", code: raw };
    }
    case "FAILED_RUNTIME": {
      const { raw, words } = reason("Stopped:");
      return { text: words ? `Stopped · ${words}` : "Stopped by a fault", tone: "bad", code: raw };
    }
    case "TERMINATED":
      return { text: "Abandoned", tone: "plain", code: null };
    case "RUNNING":
      return { text: "Being played", tone: "ok", code: null };
    case "LAUNCHING":
      return { text: "Starting", tone: "plain", code: null };
    default:
      return { text: match.status, tone: "plain", code: null };
  }
}

/** One person's sign-ins in the last day, newest first. */
export interface SignInPerson {
  username: string;
  known: boolean;
  signedIn: number;
  failed: number;
  throttled: number;
  last: string;
  addresses: string[];
  lines: SignInLine[];
}

/** Sign-ins grouped by the name tried (spec 0010): a person, not forty rows. */
export function signInsByPerson(events: SignInEvent[]): SignInPerson[] {
  const people = new Map<string, SignInPerson>();
  for (const event of events) {
    const key = event.username.toLowerCase();
    let person = people.get(key);
    if (!person) {
      person = {
        username: event.username,
        known: event.known,
        signedIn: 0,
        failed: 0,
        throttled: 0,
        last: event.at,
        addresses: [],
        lines: [],
      };
      people.set(key, person);
    }
    if (event.kind === "SIGNED_IN") person.signedIn += 1;
    else if (event.kind === "FAILED") person.failed += 1;
    else person.throttled += 1;
    if (Date.parse(event.at) > Date.parse(person.last)) person.last = event.at;
    if (event.address && !person.addresses.includes(event.address))
      person.addresses.push(event.address);
  }
  for (const person of people.values()) {
    person.lines = groupSignIns(
      events.filter((e) => e.username.toLowerCase() === person.username.toLowerCase()),
    );
  }
  // Names that never got in first (someone guessing), then the most recent.
  return [...people.values()].sort(
    (a, b) =>
      Number(b.signedIn === 0) - Number(a.signedIn === 0) ||
      Date.parse(b.last) - Date.parse(a.last),
  );
}

/** The five tiles' numbers (spec 0010). [today] is the start of the viewer's day. */
export function overview(input: {
  online: number;
  away: number;
  accounts: AdminAccount[];
  rooms: AdminRoom[];
  matches: AdminMatch[];
  signIns: SignInEvent[];
  today: number;
}) {
  const sinceToday = (at: string) => Date.parse(at) >= input.today;
  const gamesToday = input.matches.filter((m) => sinceToday(m.createdAt));
  const signInsToday = input.signIns.filter((e) => sinceToday(e.at));
  return {
    online: input.online,
    away: input.away,
    active: input.accounts.filter((a) => a.status === "ACTIVE").length,
    disabled: input.accounts.filter((a) => a.status === "DISABLED").length,
    rooms: input.rooms.length,
    playing: input.rooms.filter((r) => r.room.status === "IN_MATCH").length,
    gamesToday: gamesToday.length,
    didNotStart: gamesToday.filter((m) => m.status === "FAILED_STARTUP").length,
    signedIn: signInsToday.filter((e) => e.kind === "SIGNED_IN").length,
    failed: signInsToday.filter((e) => e.kind !== "SIGNED_IN").length,
  };
}

// --- the Email account tab (spec 0014 amendment 1) ---------------------------------

/** Everything but the password, which is only "saved" or not. */
export interface MailSettingsView {
  host: string;
  port: number;
  security: "starttls" | "ssl";
  username: string;
  from: string;
  passwordSaved: boolean;
  /** ADMIN (this tab), SERVER (the settings file on Unraid) or NONE. */
  source: "ADMIN" | "SERVER" | "NONE";
  updatedAt?: string | null;
}

/** A null password keeps the saved one; "" removes it. */
export interface MailSettingsInput {
  host: string;
  port: number;
  security: "starttls" | "ssl";
  username: string;
  from: string;
  password: string | null;
}

export type MailOutcome = { ok: true; view: MailSettingsView } | { ok: false; message: string };

export const fetchMailSettings = (fetchFn: typeof fetch = fetch) =>
  read("/api/admin/email", (b) => b as unknown as MailSettingsView, fetchFn);

async function mailCall(
  method: "PUT" | "DELETE",
  body: unknown,
  fetchFn: typeof fetch,
): Promise<MailOutcome> {
  let response: Response;
  try {
    response = await apiFetch(
      "/api/admin/email",
      {
        method,
        ...(body === undefined
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      },
      fetchFn,
    );
  } catch {
    return { ok: false, message: "The server could not be reached." };
  }
  const answer = (await response.json().catch(() => null)) as
    | (MailSettingsView & { detail?: string })
    | null;
  if (response.ok && answer) return { ok: true, view: answer };
  return { ok: false, message: answer?.detail ?? "That did not work." };
}

export const saveMailSettings = (input: MailSettingsInput, fetchFn: typeof fetch = fetch) =>
  mailCall("PUT", input, fetchFn);

export const removeMailSettings = (fetchFn: typeof fetch = fetch) =>
  mailCall("DELETE", undefined, fetchFn);

/** Sends a test email; says whether it went and, if not, why. */
export async function testMail(
  to: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ sent: boolean; detail: string }> {
  try {
    const response = await apiFetch(
      "/api/admin/email/test",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      },
      fetchFn,
    );
    const answer = (await response.json().catch(() => null)) as {
      sent?: boolean;
      detail?: string;
    } | null;
    return { sent: answer?.sent === true, detail: answer?.detail ?? "That did not work." };
  } catch {
    return { sent: false, detail: "The server could not be reached." };
  }
}
