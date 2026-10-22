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

export const createAccount = (
  account: { username: string; displayName: string; password: string; role: "ADMIN" | "PLAYER" },
  fetchFn: typeof fetch = fetch,
) => act("/api/admin/accounts", "POST", account, fetchFn);

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
