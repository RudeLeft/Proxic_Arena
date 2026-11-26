// P11-D6 (spec 0119, owner 2026-11-26 "Approve both") -- catch-up after a stall.
//
// The page's connection stalls (or drops and comes back) while the game goes
// on: Bob plays a Mountain, casts Lightning Bolt at your Grizzly Bears, the
// Bears die, his Serra Angel attacks. The boards for those moments arrive late
// (a stall on an open connection: `late` in match.ts) or are sent again from
// the server's kept boards (a resume: MATCH_CATCHUP). match.ts reduces every
// one of them in order as it comes, so `game.board` is always the newest and
// everything that answers the server reads it; this file only decides what is
// DRAWN meanwhile (ARCH-003: the replay delays what is drawn, nothing else).
//
//  - Under the limit (owner decision 5, Q1 B, Q2 B): each missed board is
//    drawn in turn, from where the table stopped, each held max(its moment,
//    MOMENT_FLOOR_MS) / CATCH_UP_RATE, every animation meanwhile at
//    CATCH_UP_RATE (the screen quickens them). The act button shows
//    "Catching up… / Tap to skip" with a gold bar (Q3 A); a click anywhere
//    skips to now (the Board already hurries what is moving on a click).
//  - Past the limit (more than CATCH_UP_LIMIT_BOARDS updates, or a replay
//    estimated or running over CATCH_UP_LIMIT_MS), with motion turned down,
//    or for a page sent today's whole board on its return: no replay -- the
//    table goes straight to now in one glide (carry.ts carries the skipped
//    boards' moments, A1's moves included), then the "While you were away"
//    window lists the play log's own lines since the table stopped (Q4 A;
//    owner answers 1 and 2: the play log's lines, one move per line).
//  - The question for this player is set aside until the table is live
//    (GameScreen), and any countdown starts when it is shown.
//
// Nothing here is shown that the page was not sent for this seat (HID-001):
// the boards are this seat's own, and the away lines are its own play log,
// never ahead of the board on the table (HID-005: they are listed once the
// table is at the newest board).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatchUp, PlayLogLine, Snapshot } from "../match";
import { FLIP_MS, FLY_MS, HOLD_MS as REVEAL_HOLD_MS } from "./CastingCard";
import { MOVE_MS, SETTLE_MS } from "./motion";

/** Owner decision 5, Q1 B -- the missed moments play at three times their speed. */
export const CATCH_UP_RATE = 3;
/** Owner decision 5, Q2 B -- more updates than this are not replayed: straight to now. */
export const CATCH_UP_LIMIT_BOARDS = 20;
/** Owner decision 5, Q2 B -- nor a replay longer than this (estimated, or as it really runs). */
export const CATCH_UP_LIMIT_MS = 6_000; // not paced: a limit (spec 0119)
/** Spec 0119 -- the least a replayed board is held (at 1x; divided by the rate). */
export const MOMENT_FLOOR_MS = 120; // not paced: a wait (spec 0119)

/** GameScreen's LANDING_BEAT_MS: a spell's landing, before the next board. */
const LANDING_MS = 250; // not paced: a wait (spec 0106)
/** The other player's spell as the page shows it (GameScreen's THEIR_SPELL_HOLD_MS; its landing beat). */
const SPELL_MS = FLIP_MS + REVEAL_HOLD_MS + FLY_MS + LANDING_MS;
/** A board whose cards move: a glide and its settle, a little more for each further card. */
const MOVES_MS = MOVE_MS + SETTLE_MS;
const MORE_MOVE_MS = 60; // not paced: an estimate (spec 0119)
const DAMAGE_MS = 1_200; // not paced: an estimate (spec 0119)
const LIFE_MS = 900; // not paced: an estimate (spec 0119)
const TURN_MS = 600; // not paced: an estimate (spec 0119)

/**
 * About how long [board]'s moments take on the table at 1x, drawn after
 * [before]: the longest of them (they play together), at least
 * MOMENT_FLOOR_MS. An estimate for the limit and the replay's pace; the
 * replay's real running time is checked against the limit too.
 */
export function momentOf(before: Snapshot | null, board: Snapshot): number {
  let ms = MOMENT_FLOOR_MS;
  const was = new Set((before?.stack ?? []).map((e) => e.id));
  const fresh = board.stack.filter((e) => !was.has(e.id));
  if (fresh.some((e) => e.controller !== null && e.controller !== board.seat))
    ms = Math.max(ms, SPELL_MS);
  else if (fresh.length > 0) ms = Math.max(ms, FLY_MS);
  const moves = (board.moves ?? []).length;
  if (moves > 0) ms = Math.max(ms, MOVES_MS + Math.min(moves - 1, 10) * MORE_MOVE_MS);
  if (board.damage && board.damage.key !== before?.damage?.key) ms = Math.max(ms, DAMAGE_MS);
  if (board.life && board.life.key !== before?.life?.key) ms = Math.max(ms, LIFE_MS);
  if (before && before.turn !== board.turn) ms = Math.max(ms, TURN_MS);
  return ms;
}

/** How long one replayed board is held, in ms (its moment at CATCH_UP_RATE). */
export function holdOf(before: Snapshot | null, board: Snapshot): number {
  return Math.round(Math.max(momentOf(before, board), MOMENT_FLOOR_MS) / CATCH_UP_RATE);
}

/** The whole replay's estimate, in ms, from [from] (the board on the table) through [boards]. */
export function replayEstimate(from: Snapshot | null, boards: readonly Snapshot[]): number {
  let before = from;
  let total = 0;
  for (const board of boards) {
    total += holdOf(before, board);
    before = board;
  }
  return total;
}

/** Past the limit (owner decision 5, Q2 B): more than 20 updates, or more than 6 s of replay. */
export function pastLimit(catchUp: CatchUp): boolean {
  return (
    catchUp.updates + catchUp.missed > CATCH_UP_LIMIT_BOARDS ||
    replayEstimate(catchUp.from, catchUp.boards) > CATCH_UP_LIMIT_MS
  );
}

/**
 * The "While you were away" lines (owner answers 1 and 2): the play log's
 * own lines that came after the table stopped, oldest first, each one move.
 * Only lines of boards up to [upTo] (the board now on the table: HID-005).
 */
export function awayLines(
  log: readonly PlayLogLine[],
  logFrom: number,
  upTo: number,
): PlayLogLine[] {
  return log.filter((line) => line.n > logFrom && line.rev <= upTo);
}

export interface CatchUpView {
  /** The board to draw instead of the newest one while replaying; null: draw the newest. */
  shown: Snapshot | null;
  /** Replaying: the act button's sign; the question waits. */
  catching: boolean;
  /** How far the replay is, 0..1 (the sign's gold bar). */
  progress: number;
  /** A click: straight to now (no window). */
  skip: () => void;
  /** The away window's lines after a jump past the limit, or null. */
  away: PlayLogLine[] | null;
  closeAway: () => void;
}

/**
 * Spec 0119 -- what the table draws while the page catches up. [catchUp] is
 * `game.catchUp`; [log] the seat's play log; [board] the newest board.
 * [settled] is told how many queued boards were drawn or passed (the
 * reducer drops them); [live] when the table is live again (CAUGHT_UP).
 */
export function useCatchUp(
  catchUp: CatchUp | null | undefined,
  log: readonly PlayLogLine[] | undefined,
  board: Snapshot | null,
  options: {
    motionOff: () => boolean;
    settled: (count: number, jumped: boolean) => void;
    live: () => void;
    now?: () => number;
  },
): CatchUpView {
  const now = options.now ?? Date.now;
  const [step, setStep] = useState(0);
  const [away, setAway] = useState<PlayLogLine[] | null>(null);
  const started = useRef<number | null>(null);
  const opts = useRef(options);
  opts.current = options;
  const boards = useMemo(() => catchUp?.boards ?? [], [catchUp]);
  const waiting = catchUp !== null && catchUp !== undefined && boards.length + catchUp.missed > 0;

  /** The catch-up is over: the queue is passed, the table goes to now. */
  const finish = useCallback(
    (jumped: boolean) => {
      if (!catchUp) return;
      started.current = null;
      setStep(0);
      if (jumped && board) {
        const lines = awayLines(log ?? [], catchUp.logFrom, board.stateRevision);
        if (lines.length > 0) setAway(lines);
      }
      opts.current.settled(boards.length, jumped);
      opts.current.live();
    },
    [catchUp, boards.length, board, log],
  );

  // Decide, each time the queue changes: jump, wait, step on, or done.
  // Past the limit (or a whole board on return): the window after the jump.
  // Motion turned down: the jump always, the window only past the limit.
  const over =
    waiting &&
    (catchUp.jump === true ||
      pastLimit(catchUp) ||
      (started.current !== null && now() - started.current > CATCH_UP_LIMIT_MS));
  const jump = waiting && (over || opts.current.motionOff());
  useEffect(() => {
    if (!waiting) return;
    if (jump) {
      // Straight to now in one glide, once every missed board is here.
      if (catchUp.missed === 0) finish(over);
      return;
    }
    if (started.current === null) started.current = now();
    if (step >= boards.length) {
      // Every board drawn: done once nothing more is to come.
      if (catchUp.missed === 0) finish(false);
      return;
    }
    const before = step === 0 ? catchUp.from : boards[step - 1]!;
    const timer = window.setTimeout(() => setStep((n) => n + 1), holdOf(before, boards[step]!));
    return () => window.clearTimeout(timer);
  }, [waiting, jump, over, step, boards, catchUp, finish, now]);

  const skip = useCallback(() => {
    if (waiting) finish(false);
  }, [waiting, finish]);

  const catching = waiting && !jump;
  // Replaying: the board reached; jumping with boards still to come: the
  // table stays as it stopped until they are all here (one glide, not many).
  const shown = catching
    ? (boards[Math.min(step, boards.length - 1)] ?? catchUp.from)
    : waiting && catchUp.missed > 0
      ? catchUp.from
      : null;
  const total = boards.length + (catchUp?.missed ?? 0);
  return {
    shown,
    catching,
    progress: catching && total > 0 ? Math.min(1, step / total) : 0,
    skip,
    away,
    closeAway: useCallback(() => setAway(null), []),
  };
}

/**
 * P11-D6 (spec 0119) -- every script-made animation running in [root] that
 * [seen] has not met plays CATCH_UP_RATE times faster (the tool `hurry` uses: its rate,
 * once). Endless ones (a breathing glow) are left alone.
 */
export function quicken(root: Element, seen: WeakSet<Animation>) {
  if (typeof root.getAnimations !== "function") return;
  for (const animation of root.getAnimations({ subtree: true })) {
    if (seen.has(animation)) continue;
    seen.add(animation);
    // The style sheets' own movements are already a third as long (`--pa-pace`).
    if (
      (typeof CSSAnimation !== "undefined" && animation instanceof CSSAnimation) ||
      (typeof CSSTransition !== "undefined" && animation instanceof CSSTransition)
    )
      continue;
    const timing = animation.effect?.getComputedTiming();
    if (!timing || timing.iterations === Infinity || animation.playState === "finished") continue;
    animation.updatePlaybackRate(animation.playbackRate * CATCH_UP_RATE);
  }
}
