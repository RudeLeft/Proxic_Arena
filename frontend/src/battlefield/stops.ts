// Priority stops and the Pass button's words — PHASE_07 §7.53, AMENDMENT 13.
//
// The game server passes priority for a player wherever they do not stop
// (and only priority: targets, payments and blocks are always asked).
// This module is the page's half: the player's settings, and what the
// Pass button says it will do.

import { apiFetch } from "../auth";
import type { MatchOutcome } from "../lobby";
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

/** The server's StopSettings.DEFAULT: what a player stops at until they change it. */
export const DEFAULT_STOPS: StopSettings = {
  own: ["MAIN1", "COMBAT_DECLARE_BLOCKERS", "MAIN2"],
  opponent: ["COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS"],
};

type BoardCard = Snapshot["battlefield"][number];

const hasKeyword = (card: BoardCard, word: string) =>
  (card.keywords ?? []).some((k) => k.toLowerCase() === word);

/**
 * Spec 0034 — a creature of yours that could attack now, as far as the
 * board shows: untapped, not summoning sick (or hasty), not a defender.
 * Only words hang on it; the game asks for attackers exactly as before.
 */
export function couldAttack(board: Snapshot, mySeat: number): boolean {
  return board.battlefield.some(
    (c) =>
      c.seat === mySeat &&
      c.kind === "creature" &&
      !c.tapped &&
      (!c.sick || hasKeyword(c, "haste")) &&
      !hasKeyword(c, "defender"),
  );
}

/** Spec 0034 — power, never damage: lifelink or prevention may change what is dealt. */
export function totalPower(cards: readonly BoardCard[]): number {
  return cards.reduce((sum, c) => sum + Math.max(0, c.power ?? 0), 0);
}

/** Spec 0034 — the power of the attackers nobody blocks, from Forge's record of combat. */
export function unblockedPower(board: Snapshot): number | null {
  if (!board.combat) return null;
  const blocked = new Set(board.combat.blocks.map((b) => b.attacker));
  const attackers = board.combat.attackers
    .filter((a) => !blocked.has(a.id))
    .map((a) => board.battlefield.find((c) => c.id === a.id))
    .filter((c): c is BoardCard => c !== undefined);
  return totalPower(attackers);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Spec 0034 — "Pat's Lightning Bolt → you": whose it is, and its first target. */
function stackLine(board: Snapshot, mySeat: number): string {
  const top = board.stack[0]!;
  const whose =
    top.controller === mySeat
      ? "Your "
      : top.controller
        ? `${board.players.find((p) => p.seat === top.controller)?.name ?? "Their"}’s `
        : "";
  const targets = top.targets ?? [];
  const first = targets[0];
  if (!first) return `${whose}${top.name}`;
  const at =
    "player" in first
      ? first.player === mySeat
        ? "you"
        : (board.players.find((p) => p.seat === first.player)?.name ?? "a player")
      : (board.battlefield.find((c) => c.id === first.object)?.name ??
        board.stack.find((s) => s.id === first.object)?.name ??
        "a card");
  return `${whose}${top.name} → ${at}${targets.length > 1 ? ` +${targets.length - 1}` : ""}`;
}

/** Spec 0034 — where the active player goes after this step, for "Pat goes on to …". */
const NEXT_STEP: Record<string, string> = {
  UNTAP: "their upkeep",
  UPKEEP: "their draw",
  DRAW: "their main phase",
  MAIN1: "combat",
  COMBAT_BEGIN: "attacks",
  COMBAT_DECLARE_ATTACKERS: "damage",
  COMBAT_DECLARE_BLOCKERS: "damage",
  COMBAT_FIRST_STRIKE_DAMAGE: "damage",
  COMBAT_DAMAGE: "Main 2",
  COMBAT_END: "Main 2",
  MAIN2: "their end step",
};

/**
 * What passing does, in the player's words (§7.53 extra) — the way MTG
 * Arena's button says "Next", "Resolve" or "End turn". Words only: the
 * pass itself is the same answer whatever the button says. Spec 0034:
 * where it really lands, whose spell it is, and the power in combat.
 */
export function passWords(
  board: Snapshot,
  mySeat: number,
  stops: StopSettings | null = null,
): { word: string; sub: string } {
  if (board.stack[0]) return { word: "Resolve", sub: stackLine(board, mySeat) };
  const other = board.players.find((p) => p.seat !== mySeat)?.name ?? "your opponent";
  const active = board.players.find((p) => p.seat === board.activeSeat);
  if (board.activeSeat !== mySeat) {
    // Owner 2026-10-22: "Pass" while they attack read as giving up the
    // block. Say what comes next, so it is plain that blocks are still yours.
    const them = active?.name ?? other;
    const attacking =
      board.battlefield?.filter((c) => c.attacking && c.seat === board.activeSeat) ?? [];
    if (board.phase === "COMBAT_DECLARE_ATTACKERS" && attacking.length > 0) {
      return {
        word: "To blocks",
        sub: `${plural(attacking.length, "attacker", "attackers")} · ${totalPower(attacking)} power coming`,
      };
    }
    if (board.phase === "COMBAT_DECLARE_BLOCKERS" && attacking.length > 0) {
      const through = unblockedPower(board);
      return {
        word: "To damage",
        sub: through === null ? "Combat damage is dealt next" : `${through} power gets through`,
      };
    }
    // Nobody attacking: combat is over, whatever its step.
    const next =
      board.phase.startsWith("COMBAT_") && board.phase !== "COMBAT_BEGIN" && attacking.length === 0
        ? "Main 2"
        : NEXT_STEP[board.phase];
    return { word: "Pass", sub: next ? `${them} goes on to ${next}` : "Your turn next" };
  }
  switch (board.phase) {
    case "UPKEEP":
    case "DRAW":
      return { word: "Next", sub: "To your main phase" };
    case "MAIN1": {
      if (couldAttack(board, mySeat)) return { word: "Next", sub: "To attacks" };
      const own = (stops ?? DEFAULT_STOPS).own;
      if (own.includes("MAIN2")) return { word: "Next", sub: "Nothing can attack · to Main 2" };
      if (own.includes("END_OF_TURN")) {
        return { word: "Next", sub: "Nothing can attack · to the end step" };
      }
      return { word: "End turn", sub: `Nothing can attack · over to ${other}` };
    }
    case "COMBAT_BEGIN":
      return { word: "Next", sub: "To attacks" };
    case "COMBAT_DECLARE_ATTACKERS":
    case "COMBAT_DECLARE_BLOCKERS":
    case "COMBAT_FIRST_STRIKE_DAMAGE":
      // Nobody attacking: combat is over.
      return board.battlefield.some((c) => c.attacking && c.seat === mySeat)
        ? { word: "Next", sub: "To damage" }
        : { word: "Next", sub: "To Main 2" };
    case "MAIN2":
    case "END_OF_TURN":
    case "CLEANUP":
      return { word: "End turn", sub: `Over to ${other}` };
    default:
      return { word: "Next", sub: "To Main 2" };
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
  return whatTheyDo(board, mySeat, seat) ?? `Waiting for ${nameOf(seat)}`;
}

/**
 * Spec 0034 — what the other player is doing, from what is on screen
 * only (the step and the stack), never from their question; null when
 * the screen cannot tell.
 */
function whatTheyDo(board: Snapshot, mySeat: number, seat: number): string | null {
  const name = board.players.find((p) => p.seat === seat)?.name ?? "The other player";
  const top = board.stack[0];
  if (top && top.controller === mySeat) return `${name} may respond to ${top.name}`;
  if (top) return null;
  // Once some are declared, the step's priority follows: not choosing.
  const theirs = board.battlefield.filter((c) => c.seat === seat);
  if (
    board.phase === "COMBAT_DECLARE_ATTACKERS" &&
    seat === board.activeSeat &&
    !theirs.some((c) => c.attacking)
  ) {
    return `${name} is choosing attackers`;
  }
  if (
    board.phase === "COMBAT_DECLARE_BLOCKERS" &&
    seat !== board.activeSeat &&
    !theirs.some((c) => c.blocking)
  ) {
    return `${name} is choosing blockers`;
  }
  return null;
}

/**
 * Spec 0034 — the game-over box: who won, and why when the board shows
 * it (a life total at 0, a concession); else the turn it ended on.
 */
export function gameOverWords(
  board: Snapshot,
  mySeat: number,
  outcome: MatchOutcome | null,
): { word: string; sub: string } {
  const nameOf = (seat: number) =>
    seat === mySeat ? "Your" : `${board.players.find((p) => p.seat === seat)?.name ?? "Their"}’s`;
  if (!outcome || outcome.kind !== "WINNER" || outcome.winningSeat === null) {
    return {
      word: outcome?.kind === "DRAW" ? "A draw" : "Game over",
      sub: "Nobody holds priority now",
    };
  }
  const won = outcome.winningSeat === mySeat;
  const winner = board.players.find((p) => p.seat === outcome.winningSeat)?.name ?? "Your opponent";
  const loser = board.players.find((p) => p.seat !== outcome.winningSeat);
  const sub =
    outcome.concededSeat !== null
      ? outcome.concededSeat === mySeat
        ? "You conceded"
        : `${board.players.find((p) => p.seat === outcome.concededSeat)?.name ?? "Your opponent"} conceded`
      : loser && loser.life <= 0
        ? `${nameOf(loser.seat)} life reached 0`
        : outcome.endedOnTurn > 0
          ? `On turn ${outcome.endedOnTurn}`
          : "";
  return { word: won ? "You won" : `${winner} won`, sub };
}

/** Spec 0030 — which part of combat a phase is, for the turn ladder; null outside those parts. */
export function combatPart(phase: string): string | null {
  switch (phase) {
    case "COMBAT_DECLARE_ATTACKERS":
      return "Attackers";
    case "COMBAT_DECLARE_BLOCKERS":
      return "Blockers";
    case "COMBAT_FIRST_STRIKE_DAMAGE":
    case "COMBAT_DAMAGE":
      return "Damage";
    default:
      return null;
  }
}
