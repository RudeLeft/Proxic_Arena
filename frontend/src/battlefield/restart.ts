// Spec 0102, item 1 (owner 2026-11-17: missed Q6 + round 2 Q6 B; canvases
// deep3-missed-1117 "Q6" A and deep3-round2-1117 "Q6" B) -- Karn Liberated
// restarts the game.
//
//   - The other player's report window opens first ("Bob restarted the
//     game. This is game 2."), a bar along its foot draining over 4 s.
//     Nothing on the table moves while it is open: the page keeps drawing
//     the last board of game 1. When it is closed, or the 4 s run out, the
//     sweep plays (after 4 s the window stays open until closed, Decided 3).
//   - The sweep: every card on the table and in both hands glides into its
//     OWNER's library tile, one after another, turning face down; each
//     graveyard and exile pile empties into its library; the library counts
//     rise as they land; both lives go back to 20 (rising numbers).
//   - Both libraries riffle; then 0089's deal plays for game 2.
//   - Whoever restarted it gets no window: their table sweeps at once.
//
// The page plays nothing across an epoch change on its own (fromSnapshot):
// the card ids are kept across the restart, so game 2's cards would glide
// from where game 1 had them. So the restart is drawn in two steps: the
// sweep, to the empty table of the moment between the two games (the
// worker's own board of it when one was sent, else game 2's board with its
// hands and piles back in the libraries), then game 2's board on that empty
// table, with its deal. This module holds what both GameScreen and Board
// need: the predicate, the empty table and the timings. Presentation only:
// every number is the game's, and nothing is guessed across the epoch but
// where cards go home (their owners', public).

import type { Snapshot } from "../match";
import { RETURN_MS, RIFFLE_BEAT_MS, RIFFLE_CARDS, RIFFLE_MS } from "./motion";

/** The window holds the sweep this long at most (round 2 Q6 B). */
export const RESTART_HOLD_MS = 4000;
/** Each card sets off this long after the one before (the canvas's 0.05 s)... */
export const SWEEP_BEAT_MS = 50;
/** ...unless there are many: the whole sweep lands within this (spec "Speed"). */
export const SWEEP_SPAN_MS = 1500;
/** Waiting for game 2's board after the moment between the games: at most this. */
export const RESTART_WAIT_MS = 30_000;

/** The beat between cards for a sweep of [n] cards. */
export function sweepBeat(n: number): number {
  return n <= 1 ? 0 : Math.min(SWEEP_BEAT_MS, Math.max(0, SWEEP_SPAN_MS - RETURN_MS) / (n - 1));
}

/** When the last of [n] cards has landed. */
export function sweepLanded(n: number): number {
  return n <= 0 ? 0 : (n - 1) * sweepBeat(n) + RETURN_MS;
}

/** The sweep and the riffle after it: when the deal may begin. */
export function sweepDone(n: number): number {
  return sweepLanded(n) + RIFFLE_MS + (RIFFLE_CARDS - 1) * RIFFLE_BEAT_MS;
}

/**
 * Is [next] the start of a restart after [before]? A new game (the epoch
 * rose), or the moment between the two games the worker may send first (the
 * same epoch, the turn count back to 0 from a game under way: only a restart
 * does that).
 */
export function isRestart(before: Snapshot | null, next: Snapshot | null): boolean {
  if (!before || !next || before.seat !== next.seat) return false;
  // Game 2's board after the empty table between the games is the second
  // step of the same restart (its deal), not another one.
  if (isBetweenGames(before)) return false;
  if (next.gameEpoch > before.gameEpoch) return true;
  return next.gameEpoch === before.gameEpoch && next.turn === 0 && before.turn > 0;
}

/** Whether [board] is an empty table between two games (the sweep's end). */
export function isBetweenGames(board: Snapshot): boolean {
  return (
    board.turn === 0 &&
    board.battlefield.length === 0 &&
    board.hand.length === 0 &&
    board.stack.length === 0 &&
    board.players.every((p) => p.handCount === 0)
  );
}

/**
 * The empty table the sweep ends on, built from game 2's first board: no
 * hands (their cards back in the libraries, the counts with them), no
 * graveyards, the turn 0, the same epoch. Cards the game put on the table
 * from exile (Karn's) stay in that exile until game 2's board brings them
 * out. Only what game 2's board says is used: nothing is added.
 */
export function betweenGames(game2: Snapshot): Snapshot {
  const risen = new Map<string, number>();
  for (const move of game2.moves ?? []) {
    if (
      move.card &&
      move.from.zone === "exile" &&
      move.to.zone === "battlefield" &&
      move.from.seat !== null
    )
      risen.set(move.card, move.from.seat);
  }
  return {
    ...game2,
    battlefield: game2.battlefield.filter((card) => !risen.has(card.id)),
    exile: [
      ...game2.exile,
      ...game2.battlefield
        .filter((card) => risen.has(card.id))
        .map((card) => ({ ...card, seat: risen.get(card.id)!, tapped: false })),
    ],
    hand: [],
    otherHands: [],
    graveyard: [],
    stack: [],
    casting: [],
    moves: [],
    players: game2.players.map((p) => ({
      ...p,
      handCount: 0,
      libraryCount: p.libraryCount + p.handCount,
      graveyardCount: 0,
    })),
  };
}

/**
 * Game 2's first board follows the sweep's empty table: that table is game
 * 2's own start (nothing on it but what game 2 brings), so it is compared as
 * game 2's -- the deal (0089) and Karn's cards rising out of exile play as
 * they would at any game's start. Any other board is compared as it was.
 */
export function afterSweep(previous: Snapshot | null, next: Snapshot): Snapshot | null {
  if (
    previous &&
    previous.seat === next.seat &&
    next.gameEpoch === previous.gameEpoch + 1 &&
    next.turn === 0 &&
    isBetweenGames(previous)
  )
    return { ...previous, gameEpoch: next.gameEpoch };
  return previous;
}

/** Game 1's last board as the window holds it: the ability that restarted it has resolved. */
export function heldBoard(last: Snapshot): Snapshot {
  return last.stack.length === 0 && (last.casting ?? []).length === 0
    ? last
    : { ...last, stack: [], casting: [] };
}

/**
 * Who restarted it, as game 1's last board shows: the controller of the
 * ability on top of the stack (Karn's −14); null when the board does not say.
 */
export function restartedBy(last: Snapshot): number | null {
  return last.stack[0]?.controller ?? null;
}
