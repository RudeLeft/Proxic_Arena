// Priority stops and the Pass button's words — PHASE_07 §7.53, AMENDMENT 13.
//
// The game server passes priority for a player wherever they do not stop
// (and only priority: targets, payments and blocks are always asked).
// This module is the page's half: the player's settings, and what the
// Pass button says it will do.

import { apiFetch } from "../auth";
import type { Snapshot } from "../match";

export interface StopSettings {
  own: string[];
  opponent: string[];
}

/** The steps a player can choose to stop at, in turn order, by Forge's names. */
export const STOP_STEPS: { key: string; label: string }[] = [
  { key: "UPKEEP", label: "Upkeep" },
  { key: "DRAW", label: "Draw" },
  { key: "MAIN1", label: "Main 1" },
  { key: "COMBAT_BEGIN", label: "Beginning of combat" },
  { key: "COMBAT_DECLARE_ATTACKERS", label: "Attackers declared" },
  { key: "COMBAT_DECLARE_BLOCKERS", label: "Blockers declared" },
  { key: "COMBAT_DAMAGE", label: "Combat damage" },
  { key: "COMBAT_END", label: "End of combat" },
  { key: "MAIN2", label: "Main 2" },
  { key: "END_OF_TURN", label: "End step" },
];

export async function fetchStops(fetchFn: typeof fetch = fetch): Promise<StopSettings | null> {
  try {
    const response = await apiFetch("/api/matches/stops", {}, fetchFn);
    if (!response.ok) return null;
    return asStops(await response.json());
  } catch {
    return null;
  }
}

export async function saveStops(
  settings: StopSettings,
  fetchFn: typeof fetch = fetch,
): Promise<StopSettings | null> {
  try {
    const response = await apiFetch(
      "/api/matches/stops",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      },
      fetchFn,
    );
    if (!response.ok) return null;
    return asStops(await response.json());
  } catch {
    return null;
  }
}

function asStops(value: unknown): StopSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const names = (list: unknown) =>
    Array.isArray(list) ? list.filter((n): n is string => typeof n === "string") : null;
  const own = names(record["own"]);
  const opponent = names(record["opponent"]);
  return own && opponent ? { own, opponent } : null;
}

/**
 * What passing does, in the player's words (§7.53 extra) — the way MTG
 * Arena's button says "Next", "Resolve" or "End turn". Words only: the
 * pass itself is the same answer whatever the button says.
 */
export function passWords(board: Snapshot, mySeat: number): { word: string; sub: string } {
  const top = board.stack[0];
  if (top) return { word: "Resolve", sub: `Lets ${top.name} resolve` };
  const other = board.players.find((p) => p.seat !== mySeat)?.name ?? "your opponent";
  const active = board.players.find((p) => p.seat === board.activeSeat);
  if (board.activeSeat !== mySeat) {
    // Owner 2026-10-22: "Pass" while they attack read as giving up the
    // block. Say what comes next, so it is plain that blocks are still yours.
    const them = active?.name ?? other;
    const attackers =
      board.battlefield?.filter((c) => c.attacking && c.seat === board.activeSeat).length ?? 0;
    if (board.phase === "COMBAT_DECLARE_ATTACKERS" && attackers > 0) {
      return {
        word: "To blocks",
        sub: `${them} attacks with ${attackers} — you choose blockers next`,
      };
    }
    if (board.phase === "COMBAT_DECLARE_BLOCKERS" && attackers > 0) {
      return { word: "To damage", sub: "Combat damage is dealt next" };
    }
    return { word: "Pass", sub: `Back to ${them}` };
  }
  switch (board.phase) {
    case "UPKEEP":
    case "DRAW":
      return { word: "Next", sub: "To your main phase" };
    case "MAIN1":
      return { word: "Next", sub: "To combat" };
    case "MAIN2":
    case "END_OF_TURN":
    case "CLEANUP":
      return { word: "End turn", sub: `Over to ${other}` };
    default:
      return { word: "Next", sub: "On through combat" };
  }
}

/**
 * Spec 0002 — the rail's line when nothing is asked of you.
 *
 * `asking` is who the server says is being asked (`seat: null`: nobody,
 * the rules engine is working), or null when it has not said; `lastAsked`
 * the last seat it named; `resolving` true once nobody has been asked for
 * long enough to say so. Owner report 2026-10-23: while Krenko made
 * Goblins, each player's screen said it was waiting for the other.
 */
export function waitingLine(
  board: Snapshot,
  mySeat: number,
  asking: { seat: number | null } | null,
  lastAsked: number | null,
  resolving: boolean,
): string {
  const nameOf = (seat: number | null) =>
    board.players.find((p) => p.seat === seat)?.name ?? "the other player";
  const top = board.stack[0];
  if (asking === null) {
    // Never told (an older server): guessed from priority, as before. Their
    // spell on the stack and you not asked: it is theirs that is going on.
    const theirSpell = top && top.controller !== null && top.controller !== mySeat ? top : null;
    if (board.prioritySeat === mySeat && !theirSpell) return "One moment";
    return `Waiting for ${nameOf(theirSpell ? theirSpell.controller : board.prioritySeat)}`;
  }
  if (asking.seat === null && resolving) return top ? `Resolving ${top.name}…` : "Resolving…";
  // Nobody, but only for a moment: questions follow each other in
  // milliseconds, so the line stays on whoever was last asked.
  const seat = asking.seat ?? lastAsked;
  if (seat === null || seat === mySeat) return "One moment";
  return `Waiting for ${nameOf(seat)}`;
}
