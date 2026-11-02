// The Pass button's words — PHASE_07 §7.53, spec 0034, spec 0035.
//
// The game server passes priority for a player wherever one rule says
// nothing can matter (spec 0035: no settings; only priority is ever
// passed -- targets, payments and blocks are always asked). This module
// says what the Pass button will do.

import type { MatchOutcome } from "../lobby";
import type { Snapshot } from "../match";

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
export function passWords(board: Snapshot, mySeat: number): { word: string; sub: string } {
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
      // Spec 0035: Main 2 is always a stop when you have something to do.
      return { word: "Next", sub: "Nothing can attack · to Main 2" };
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

/** The canvas's eight steps; Forge's phase names fold into them. */
export const STEPS: { label: string; phases: string[] }[] = [
  { label: "Untap", phases: ["UNTAP"] },
  { label: "Upkeep", phases: ["UPKEEP"] },
  { label: "Draw", phases: ["DRAW"] },
  { label: "Main 1", phases: ["MAIN1"] },
  {
    label: "Combat",
    phases: [
      "COMBAT_BEGIN",
      "COMBAT_DECLARE_ATTACKERS",
      "COMBAT_DECLARE_BLOCKERS",
      "COMBAT_FIRST_STRIKE_DAMAGE",
      "COMBAT_DAMAGE",
      "COMBAT_END",
    ],
  },
  { label: "Main 2", phases: ["MAIN2"] },
  { label: "End", phases: ["END_OF_TURN"] },
  { label: "Cleanup", phases: ["CLEANUP"] },
];

/**
 * Spec 0002, Phase 9 W-25 — the rail's line when nothing is asked of you:
 * whose move it is ("Pat’s move", never in capitals), what the screen
 * shows them doing under it, and the seat, so their corner can glow.
 *
 * `asking` is who the server says is being asked (`seat: null`: nobody,
 * the rules engine is working), or null when it has not said; `lastAsked`
 * the last seat it named; `resolving` true once nobody has been asked for
 * long enough to say so. Owner report 2026-10-23: while Krenko made
 * Goblins, each player's screen said it was waiting for the other.
 * A spectator passes a seat nobody has (-1): every seat is "theirs".
 */
export function waitingLine(
  board: Snapshot,
  mySeat: number,
  asking: { seat: number | null } | null,
  lastAsked: number | null,
  resolving: boolean,
): { word: string; sub: string; seat: number | null } {
  const top = board.stack[0];
  const moment = { word: "One moment", sub: "", seat: null };
  if (asking === null) {
    // Never told (an older server): guessed from priority, as before. Their
    // spell on the stack and you not asked: it is theirs that is going on.
    const theirSpell = top && top.controller !== null && top.controller !== mySeat ? top : null;
    if (board.prioritySeat === mySeat && !theirSpell) return moment;
    return movesLine(board, mySeat, theirSpell ? theirSpell.controller! : board.prioritySeat);
  }
  if (asking.seat === null && resolving) {
    return { word: "Resolving…", sub: top ? top.name : "", seat: null };
  }
  // Nobody, but only for a moment: questions follow each other in
  // milliseconds, so the line stays on whoever was last asked.
  const seat = asking.seat ?? lastAsked;
  if (seat === null || seat === mySeat) return moment;
  return movesLine(board, mySeat, seat);
}

function movesLine(
  board: Snapshot,
  mySeat: number,
  seat: number | null,
): { word: string; sub: string; seat: number | null } {
  const name = board.players.find((p) => p.seat === seat)?.name;
  return {
    word: name ? `${name}’s move` : "The other player’s move",
    sub: seat === null ? "" : (whatTheyDo(board, mySeat, seat) ?? stepLine(board, mySeat)),
    seat,
  };
}

/** W-25 — the step, and whose turn it is: "Main 1 · their turn". */
function stepLine(board: Snapshot, mySeat: number): string {
  const step = STEPS.find((s) => s.phases.includes(board.phase))?.label;
  if (!step) return "";
  return `${step} · ${board.activeSeat === mySeat ? "your" : "their"} turn`;
}

/**
 * Spec 0034 — what the other player is doing, from what is on screen
 * only (the step and the stack), never from their question; null when
 * the screen cannot tell.
 */
function whatTheyDo(board: Snapshot, mySeat: number, seat: number): string | null {
  const top = board.stack[0];
  if (top && top.controller === mySeat) return `May respond to your ${top.name}`;
  if (top) return null;
  // Once some are declared, the step's priority follows: not choosing.
  const theirs = board.battlefield.filter((c) => c.seat === seat);
  if (
    board.phase === "COMBAT_DECLARE_ATTACKERS" &&
    seat === board.activeSeat &&
    !theirs.some((c) => c.attacking)
  ) {
    return "Choosing attackers";
  }
  if (
    board.phase === "COMBAT_DECLARE_BLOCKERS" &&
    seat !== board.activeSeat &&
    !theirs.some((c) => c.blocking)
  ) {
    return "Choosing blockers";
  }
  return null;
}

/** Spec 0045 -- Forge's reasons for a loss, in a player's words. */
const LOSS_WORDS: Record<string, string> = {
  Milled: "had to draw from an empty library",
  LifeReachedZero: "life reached 0",
  Poisoned: "10 poison counters",
  CommanderDamage: "21 damage from one commander",
  SpellEffect: "a card's effect",
  OpponentWon: "an opponent won by a card's effect",
};

/**
 * Spec 0034, Phase 9 W-24 — game over, said once: who won (`word`), why
 * (`sub`: Forge's reason for the loss, a concession, a life total at 0
 * on the board, or Forge's own sentence for an alternate win, word for
 * word, P6-AP), and the turn it ended on. `stopped`: the game failed
 * before it finished. A spectator passes a seat nobody has (-1).
 */
export function gameOverWords(
  board: Snapshot,
  mySeat: number,
  outcome: MatchOutcome | null,
  stopped = false,
): { word: string; sub: string; turn: string } {
  const turn = outcome && outcome.endedOnTurn > 0 ? `Turn ${outcome.endedOnTurn}` : "";
  const nameOf = (seat: number) =>
    seat === mySeat ? "Your" : `${board.players.find((p) => p.seat === seat)?.name ?? "Their"}’s`;
  if (stopped || outcome?.kind === "FAILED") {
    return { word: "Game over", sub: "The game stopped before it finished. Nobody won it.", turn };
  }
  if (!outcome || outcome.kind !== "WINNER" || outcome.winningSeat === null) {
    return outcome?.kind === "DRAW"
      ? { word: "A draw", sub: "", turn }
      : { word: "Game over", sub: "Nobody won it", turn };
  }
  const won = outcome.winningSeat === mySeat;
  const winner = board.players.find((p) => p.seat === outcome.winningSeat)?.name ?? "Your opponent";
  const loser = board.players.find((p) => p.seat !== outcome.winningSeat);
  // Spec 0045 -- why the loser lost, from Forge's own reason.
  const why = outcome.lossReason ? LOSS_WORDS[outcome.lossReason] : undefined;
  const sub =
    why && loser
      ? `${loser.seat === mySeat ? "You" : loser.name} lost: ${why}`
      : outcome.concededSeat !== null
        ? outcome.concededSeat === mySeat
          ? "You conceded"
          : `${board.players.find((p) => p.seat === outcome.concededSeat)?.name ?? "Your opponent"} conceded`
        : outcome.reason
          ? `The winner ${outcome.reason}`
          : loser && loser.life <= 0
            ? `${nameOf(loser.seat)} life reached 0`
            : "";
  return { word: won ? "You won" : `${winner} won`, sub, turn };
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
