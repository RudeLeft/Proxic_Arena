// The Pass button's words — PHASE_07 §7.53, spec 0034, spec 0035.
//
// The game server passes priority for a player wherever one rule says
// nothing can matter (spec 0035: no settings; only priority is ever
// passed -- targets, payments and blocks are always asked). This module
// says what the Pass button will do.

import type { MatchOutcome } from "../lobby";
import type { Snapshot } from "../match";
import { capital, capitalNumber, numberWord, timesWord } from "../words";
import { winWords } from "../matchText";

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

/**
 * Spec 0034 — "Pat's Lightning Bolt at you": whose it is, and its first
 * target; spec 0113 (W1-034) "(and one more)" for the rest, never "+1".
 */
function stackLine(board: Snapshot, mySeat: number): string {
  const top = board.stack[0]!;
  const whose =
    top.controller === mySeat
      ? "Your "
      : top.controller
        ? nameWhose(board.players.find((p) => p.seat === top.controller)?.name)
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
  return `${whose}${top.name} at ${at}${targets.length > 1 ? ` (and ${numberWord(targets.length - 1)} more)` : ""}`;
}

/** Spec 0034 — where the active player goes after this step, for "Pat goes on to …". */
const NEXT_STEP: Record<string, string> = {
  UNTAP: "their upkeep",
  UPKEEP: "their draw",
  DRAW: "their main phase",
  MAIN1: "combat",
  COMBAT_BEGIN: "attack",
  COMBAT_DECLARE_ATTACKERS: "combat damage",
  COMBAT_DECLARE_BLOCKERS: "combat damage",
  COMBAT_FIRST_STRIKE_DAMAGE: "combat damage",
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
        sub: `${capitalNumber(attacking.length)} ${attacking.length === 1 ? "attacker" : "attackers"} with ${totalPower(attacking)} power coming`,
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
      return { word: "Next", sub: "Nothing can attack. On to Main 2." };
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

/** Spec 0105 -- the act line while the top of the stack rests (canvas feedback-1119 "Q2"). */
export const RESTING_WORDS = "Resolving. Nobody can respond.";

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
 *
 * Spec 0105 -- `resting`: the top of the stack rests before it resolves,
 * nobody able to answer it, its card landed on this screen: "One moment /
 * Resolving. Nobody can respond." (spec 0113, W1-037), whoever's it is.
 */
export function waitingLine(
  board: Snapshot,
  mySeat: number,
  asking: { seat: number | null; doing?: string | null } | null,
  lastAsked: number | null,
  resolving: boolean,
  resting = false,
): { word: string; sub: string; seat: number | null } {
  const top = board.stack[0];
  const moment = { word: "One moment", sub: "", seat: null };
  if (resting && top?.rest) return { ...moment, sub: RESTING_WORDS };
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
  return movesLine(board, mySeat, seat, asking.seat === seat ? (asking.doing ?? null) : null);
}

function movesLine(
  board: Snapshot,
  mySeat: number,
  seat: number | null,
  doing: string | null = null,
): { word: string; sub: string; seat: number | null } {
  const player = board.players.find((p) => p.seat === seat);
  const name = player?.name;
  // Phase 9 W-15: before the first turn, they are choosing their hand;
  // how many times they mulliganed is public (owner 2026-11-03).
  const mulligans = player?.mulligans ?? 0;
  const pregame =
    board.turn === 0
      ? mulligans > 0
        ? `Mulliganed ${timesWord(mulligans)}`
        : "Choosing their opening hand"
      : null;
  return {
    word: name ? `${name}’s move` : "The other player’s move",
    sub:
      seat === null
        ? ""
        : (pregame ??
          doingLine(board, mySeat, doing) ??
          whatTheyDo(board, mySeat, seat) ??
          stepLine(board, mySeat)),
    seat,
  };
}

/**
 * Phase 9 Amendment 21 -- the server's word for what they are doing: its
 * own words for a choice everyone can see ("Splitting the cards"); for any
 * other choice, the spell it is for -- never "May respond", which is for
 * when they are being given the chance to.
 */
function doingLine(board: Snapshot, mySeat: number, doing: string | null): string | null {
  if (!doing) return null;
  if (doing !== "Choosing") return doing;
  const top = board.stack[0];
  if (!top) return "Making a choice";
  if (top.controller === mySeat) return `Making a choice for your ${top.name}`;
  // Spec 0067 -- a spectator (mySeat -1) reads whose by name.
  const owner = board.players.find((p) => p.seat === top.controller)?.name;
  return `Making a choice for ${mySeat < 0 && owner ? `${owner}’s` : "their"} ${top.name}`;
}

/** W-25 — the step, and whose turn it is: "Main 1, their turn" (spec 0113, W1-039). */
function stepLine(board: Snapshot, mySeat: number): string {
  const step = STEPS.find((s) => s.phases.includes(board.phase))?.label;
  if (!step) return "";
  if (board.activeSeat === mySeat) return `${step}, your turn`;
  // Spec 0067 -- a spectator (mySeat -1) reads whose turn by name.
  const active = board.players.find((p) => p.seat === board.activeSeat)?.name;
  return `${step}, ${mySeat < 0 && active ? `${active}’s` : "their"} turn`;
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

/** "Bob" / "you" as the loser, for {@link LOSS_WORDS}. */
interface Loser {
  you: boolean;
  name: string;
}

/**
 * Spec 0045 -- Forge's reasons for a loss, in a player's words; spec 0113
 * (W1-125..W1-130) as whole sentences: "Bob's life reached zero".
 */
const LOSS_WORDS: Record<string, (who: Loser) => string> = {
  Milled: (w) => `${w.you ? "You" : w.name} had to draw from an empty library`,
  LifeReachedZero: (w) => `${w.you ? "Your" : `${w.name}’s`} life reached zero`,
  Poisoned: (w) => `${w.you ? "You" : w.name} got ten poison counters`,
  CommanderDamage: (w) => `${w.you ? "You" : w.name} took 21 damage from one commander`,
  SpellEffect: (w) => `${w.you ? "You" : w.name} lost because of a card`,
  OpponentWon: (w) =>
    `${w.you ? "You" : w.name} lost because a card made ${w.you ? "your" : "their"} opponent win`,
};

/** "Pat’s " for a name, "Their " without one (spec 0113, W1-290: never "Their’s"). */
function nameWhose(name: string | undefined): string {
  return name ? `${name}’s ` : "Their ";
}

/**
 * Spec 0034, Phase 9 W-24 — game over, said once: who won (`word`), why
 * (`sub`: Forge's reason for the loss, a concession, where a life at 0 or
 * below fell to on the board (spec 0067), or Forge's own sentence for an alternate win, word for
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
    seat === mySeat ? "Your " : nameWhose(board.players.find((p) => p.seat === seat)?.name);
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
  // Spec 0067, item 8 -- a life at 0 or below says where it fell to, from
  // the final board: "Bob's life fell to -3".
  const fell = loser && loser.life <= 0 ? `${nameOf(loser.seat)}life fell to ${loser.life}` : null;
  const conceded =
    outcome.concededSeat === null
      ? null
      : outcome.concededSeat === mySeat
        ? "You conceded"
        : `${board.players.find((p) => p.seat === outcome.concededSeat)?.name ?? "Your opponent"} conceded`;
  const sub =
    outcome.lossReason === "LifeReachedZero" && fell
      ? fell
      : why && loser
        ? why({ you: loser.seat === mySeat, name: loser.name })
        : (conceded ??
          (outcome.reason
            ? capital(winWords(won ? "You" : winner, outcome.reason))
            : (fell ?? "")));
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
