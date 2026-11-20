// Spec 0089 (Q1 A -- owner 2026-11-13, canvas deep2-gameflow-1113) -- the end
// of the game: hold the banner, break the loser's shield, flare the winner.
//
// The result banner waits until the last hit has landed and the count reads
// what the game says (lifeTicks: nothing still to come on any plate). Then
// the loser's life shield cracks apart into pieces and dims, the loser's
// plate dims, and the winner's plate flares gold along its top edge (0086's
// plate light) as its shield glows. Only then does the banner fade in.
// Poison: the badge's ring closes and glows, and the shield only dims (poison
// never looks like a hit). A concession: the plate dims, no hit, nothing
// breaks. Both seats alike; the banner's words are unchanged.
//
// Pure, like fights.ts: who lost and how (from the game's own result: the
// winner, the seat that conceded, Forge's loss reason), when the end may
// begin, and the moments, in ms from when it began. Each part is a Web
// Animation (A-00: a click hurries it); with reduce motion nothing moves and
// the end states simply show, then the banner.

import type { MatchOutcome } from "../lobby";
import type { Snapshot } from "../match";
import { poisonOf } from "./PoisonBadge";
import { paced } from "./motion";

/** How the loser lost, as the plates show it. */
export type EndHow = "life" | "poison" | "conceded" | "other";

export interface Ending {
  loser: number;
  winner: number;
  how: EndHow;
}

/**
 * The game's result as the plates play it, or null (a draw, a game that
 * stopped, nobody won): read from the result the game sent, never from life
 * totals (P6-AP). A concession wins over the loss reason.
 */
export function endingOf(outcome: MatchOutcome | null, board: Snapshot | null): Ending | null {
  if (!outcome || outcome.kind !== "WINNER" || outcome.winningSeat === null || !board) return null;
  const loser = board.players.find((p) => p.seat !== outcome.winningSeat);
  if (!loser) return null;
  const how: EndHow =
    outcome.concededSeat !== null
      ? "conceded"
      : outcome.lossReason === "LifeReachedZero"
        ? "life"
        : outcome.lossReason === "Poisoned"
          ? "poison"
          : "other";
  return { loser: loser.seat, winner: outcome.winningSeat, how };
}

/**
 * Whether the end may begin: the last hit has landed (`landed`: nothing still
 * to come on a plate) and the count reads what killed the loser -- a life at
 * 0 or less, the tenth poison counter -- on the board (which can come a
 * moment after the result).
 */
export function endReady(ending: Ending, board: Snapshot, landed: boolean): boolean {
  if (!landed) return false;
  const loser = board.players.find((p) => p.seat === ending.loser);
  if (!loser) return true;
  if (ending.how === "life") return loser.life <= 0;
  if (ending.how === "poison") return poisonOf(loser) >= 10;
  return true;
}

/** Never held longer than this for a board that does not come: the banner shows anyway. */
export const END_WAIT_MAX_MS = 3000; // not paced: a limit (spec 0106)

// The moments, in ms from the end's start (the canvas's, from the count's 0).

/** The loser's shield cracks apart (the canvas's BREAK: 0.35 s after the 0), over 0.45 s. */
export const BREAK_AT = paced(350);
export const BREAK_MS = paced(450);
/** The crack's lines show on it just before (0.15 s in). */
export const CRACK_IN_MS = paced(150);
/** The shield dims from the break (a concession: from the start), over 0.6 s; the plate 0.1 s later. */
export const DIM_MS = paced(600);
export const PLATE_DIM_AFTER = paced(100);
/** The winner's plate flares (0.3 s after the break): a light along its top edge (0.85 s), the glow (0.45 s). */
export const FLARE_AT = paced(650);
export const FLARE_MS = paced(850);
export const GLOW_MS = paced(450);
/** The banner fades in 0.6 s after the flare begins, over 0.45 s. */
export const BANNER_AT = paced(1250);
export const BANNER_MS = paced(450);

/** When the loser's shield and plate start to dim. */
export function dimAt(how: EndHow): { shield: number; plate: number } {
  return how === "conceded"
    ? { shield: 0, plate: 0 }
    : { shield: BREAK_AT, plate: BREAK_AT + PLATE_DIM_AFTER };
}

/** The pieces the shield breaks into (the canvas's three), and where each goes, in px and degrees. */
export const SHARD_CLIPS = [
  "polygon(0 0, 52% 0, 47% 44%, 0 58%)",
  "polygon(52% 0, 100% 0, 100% 50%, 47% 44%)",
  "polygon(0 58%, 47% 44%, 100% 50%, 100% 100%, 0 100%)",
] as const;
export const SHARD_GO: readonly (readonly [number, number, number])[] = [
  [-7, -5, -10],
  [7, -4, 9],
  [1, 8, 4],
];

/** A shard's frames: from whole to apart, dimming (the canvas's seatFX). */
export function shardFrames(i: number): Keyframe[] {
  const [dx, dy, r] = SHARD_GO[i]!;
  return [0, 0.25, 0.5, 0.75, 1].map((q) => {
    const e = 1 - Math.pow(1 - q, 3);
    return {
      offset: q,
      transform: `translate(${(dx * e).toFixed(2)}px, ${(dy * e).toFixed(2)}px) rotate(${(r * e).toFixed(2)}deg)`,
    };
  });
}

/** The light running along the winner's plate (a 150 px band, as the canvas's flare). */
export function flareFrames(width: number): Keyframe[] {
  return [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return {
      offset: t,
      transform: `translateX(${(6 + e * Math.max(0, width - 12 - 150)).toFixed(1)}px)`,
      opacity: t === 0 || t === 1 ? 0 : Math.min(1, Math.sin(Math.PI * t) * 1.8),
    };
  });
}
