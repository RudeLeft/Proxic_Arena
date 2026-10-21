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
    return { word: "Pass", sub: `Back to ${active?.name ?? other}` };
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
