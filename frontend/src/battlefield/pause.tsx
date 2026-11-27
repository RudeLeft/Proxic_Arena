// Spec 0120 (P11, the hard pause; owner 2026-11-26, Amendment 1 2026-11-27)
// -- what a page shows while a player's game connection is down.
//
// One standard look for every drop (owner answer 7), whichever seat drops
// and whatever the game was doing (canvas pause-1119.html "Q1" option B):
//   - the table dims a little (not the rail);
//   - the act button: a pause sign, "Connection dropped", "<name> · game
//     paused · 0:04" (the clock counting up);
//   - the plate: a sign on the picture, the picture greyed, a pill: "Dropped"
//     for the first minute, then "Away · N min" (answer 4);
//   - a window beside the plate: "<name>'s connection dropped", "The game is
//     paused until <name> is back. ..." (answer 1), Peek and OK; shown for
//     every drop, replaced by the away window at 10 minutes (answer 2).
// The look shows 1.5 s after the pause (a quick refresh shows nothing), or
// at once when a move is tried meanwhile. When the seat has a connection
// again: "<name> is back / Catching up · paused" and a green "Catching up";
// then, as the game goes on, "<name> is back / The game goes on" for 1 s, a
// green glow and "Back" (Q4 B); a click on the act button then only ends the
// look (answer 3). A new drop within 10 s of the last shows at once, with no
// "is back" flash meanwhile. Spectators get the act button's words and the
// plate sign only (answer 6).
//
// The server decides (G1: it refuses every answer while paused); this is the
// look. Nothing here names a card or a zone (HID-005): the dim is one layer
// over the whole table, the same for every board.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SeatPaused } from "../match";
import { PeekButton, usePeek } from "./GameWindow";

/** The look shows this long after the pause began on this page (a refresh never shows it). */
export const PAUSE_SETTLE_MS = 1_500; // not paced: a wait
/** Q4 B -- "<name> is back / The game goes on" lasts this long. */
export const BACK_LOOK_MS = 1_000; // not paced: a wait
/** A drop this soon after the last one ended shows at once, with no "is back" flash. */
export const FLAP_MS = 10_000; // not paced: a limit
/** Answer 4 -- "Dropped" for this long, then "Away · N min". */
export const DROPPED_WORD_MS = 60_000; // not paced: a limit

/** "0:04", "1:30", "12:05": the act button's clock. */
export function pauseClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Answer 4 -- the pill under the dropped player's name. */
export function droppedWord(ms: number): string {
  return ms < DROPPED_WORD_MS ? "Dropped" : `Away · ${Math.floor(ms / 60_000)} min`;
}

/** The plate's part (answer 4): its pill, green when back, the picture greyed, the glow. */
export interface PlateLink {
  word: string;
  ok: boolean;
  grey: boolean;
  glow: boolean;
}

/** What the pause shows on this page now. */
export interface PauseLook {
  /** The dropped seat shown, its name and its pause; null: nobody is dropped. */
  dropped: { seat: number; name: string; at: SeatPaused } | null;
  /** The look is showing (past its settle, or a move was tried). */
  shown: boolean;
  /** "<name> is back / The game goes on", for 1 s after the game went on. */
  goesOn: { seat: number; name: string } | null;
  /** Now, this page's clock (it ticks while anything here counts). */
  now: number;
  /** A refused move: the look shows at once, the act button nudges ([poked] counts them). */
  poke: () => void;
  poked: number;
  /** A click on the act button during "is back": the look ends (answer 3). */
  endLook: () => void;
}

/**
 * The pause, as this page shows it. [mySeat] is never shown as dropped to
 * itself (a page that is down hears nothing); a spectator ([mySeat] null)
 * sees any seat.
 */
export function usePauseLook(
  paused: Readonly<Record<number, SeatPaused>> | undefined,
  resumed: { seat: number; at: number } | null | undefined,
  mySeat: number | null,
  nameOf: (seat: number) => string,
): PauseLook {
  const seats = Object.keys(paused ?? {})
    .map(Number)
    .filter((seat) => seat !== mySeat)
    .sort((a, b) => a - b);
  const first = seats[0];
  const at = first !== undefined ? paused![first]! : null;
  const [now, setNow] = useState(() => Date.now());
  const [poked, setPoked] = useState(0);
  // When this page first heard of the pause under way (its settle counts from it).
  const heard = useRef<{ key: number; at: number } | null>(null);
  const lookShown = useRef(false);
  const lastEnded = useRef<number | null>(null);
  const [ended, setEnded] = useState<number | null>(null);
  if (at && heard.current?.key !== at.key) {
    const flap = lastEnded.current !== null && Date.now() - lastEnded.current < FLAP_MS;
    heard.current = { key: at.key, at: flap ? Date.now() - PAUSE_SETTLE_MS : Date.now() };
  }
  if (!at && heard.current) {
    lastEnded.current = Date.now();
    heard.current = null;
  }
  // Back before its look ever showed (a quick refresh): it never shows, nor "is back" after.
  const quickReturn = at !== null && at.back && !lookShown.current && poked === 0;
  const shown =
    at !== null && !quickReturn && (now - heard.current!.at >= PAUSE_SETTLE_MS || poked > 0);
  if (shown) lookShown.current = true;
  const backFor =
    !at &&
    resumed &&
    resumed.seat !== mySeat &&
    lookShown.current &&
    ended !== resumed.at &&
    now - resumed.at < BACK_LOOK_MS
      ? resumed
      : null;
  if (!at && !backFor && now - (resumed?.at ?? 0) >= BACK_LOOK_MS) lookShown.current = false;
  const ticking = at !== null || backFor !== null;
  useEffect(() => {
    if (!ticking) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [ticking]);
  useEffect(() => {
    if (!at) setPoked(0);
  }, [at]);
  return {
    dropped: first !== undefined && at ? { seat: first, name: nameOf(first), at } : null,
    shown,
    goesOn: backFor ? { seat: backFor.seat, name: nameOf(backFor.seat) } : null,
    now,
    poke: () => {
      setPoked((n) => n + 1);
      setNow(Date.now());
    },
    poked,
    endLook: () => {
      if (resumed) setEnded(resumed.at);
    },
  };
}

const PAUSE_ICON = "M9 5v14M15 5v14";
const FF_ICON = "M4 6.5l7 5.5-7 5.5zM12 6.5l7 5.5-7 5.5z";
const CHECK_ICON = "M5 12.5l4.5 4.5L19 7.5";
const GLASS_ICON = "M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8s8 3 8 8";

function PauseCoin({ path, fill = false }: { path: string; fill?: boolean }) {
  return (
    <span className="gs-coin" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" className={fill ? "gs-coin-fill" : undefined}>
        <path d={path} />
      </svg>
    </span>
  );
}

/**
 * The act button while the game is paused (canvas "Q1" B, "Bob's return",
 * "Q4" B). [onEnd] (the "is back" look only): a click there ends the look
 * and shows the player's own button, without acting (answer 3).
 */
export function PauseAct({
  look,
  onEnd,
  onPoke,
  mine = false,
}: {
  look: PauseLook;
  onEnd?: () => void;
  /** A click on "Connection dropped" (a player's): a move tried, refused (it nudges). */
  onPoke?: (() => void) | undefined;
  /** This page's own connection is down (Bob's screen while his line is out). */
  mine?: boolean;
}): ReactNode {
  if (mine) {
    return (
      <div className="gs-waiting gs-paused gs-paused-mine" role="status" data-paused="mine">
        <PauseCoin path={GLASS_ICON} />
        <span className="gs-act-text">
          <span className="gs-waiting-name">Reconnecting…</span>
          <span className="gs-waiting-sub">The game is paused</span>
        </span>
      </div>
    );
  }
  if (look.goesOn) {
    return (
      <button
        type="button"
        className="gs-waiting gs-paused gs-paused-back"
        data-paused="goes-on"
        onClick={onEnd}
      >
        <PauseCoin path={CHECK_ICON} />
        <span className="gs-act-text">
          <span className="gs-waiting-name">{look.goesOn.name} is back</span>
          <span className="gs-waiting-sub">The game goes on</span>
        </span>
      </button>
    );
  }
  const d = look.dropped;
  if (!d) return null;
  if (d.at.back) {
    return (
      <div className="gs-waiting gs-paused gs-paused-catching" role="status" data-paused="back">
        <PauseCoin path={FF_ICON} fill />
        <span className="gs-act-text">
          <span className="gs-waiting-name">{d.name} is back</span>
          <span className="gs-waiting-sub">Catching up · paused</span>
        </span>
      </div>
    );
  }
  return (
    <div
      key={look.poked}
      className={`gs-waiting gs-paused${look.poked > 0 ? " gs-paused-nudge" : ""}`}
      role="status"
      data-paused="dropped"
      onClick={onPoke}
    >
      <PauseCoin path={PAUSE_ICON} />
      <span className="gs-act-text">
        <span className="gs-waiting-name">Connection dropped</span>
        <span className="gs-waiting-sub">
          {d.name} · game paused · {pauseClock(look.now - d.at.since)}
        </span>
      </span>
    </div>
  );
}

/**
 * The pause window beside the dropped player's plate (canvas "Q1" B; the
 * away window's look and place). OK closes it; the dim and the act button
 * stay. Shown once per drop (answer 2).
 */
export function PauseWindow({
  name,
  face,
  onOk,
}: {
  name: string;
  face: ReactNode;
  onOk: () => void;
}) {
  const peek = usePeek(true);
  const title = `${name}'s connection dropped`;
  return (
    <div
      className={`gs-win gs-bubble gs-away-win gs-pause-win${peek ? " gs-win-peek" : ""}`}
      role="alertdialog"
      aria-label={title}
    >
      <span className="gs-bubble-pointer gs-away-pointer" aria-hidden="true" />
      <div className="gs-win-head">
        <div className="gs-win-picture gs-away-face">{face}</div>
        <div className="gs-win-words">
          <span className="gs-win-from">{name} · connection</span>
          <h2 className="gs-win-title">{title}</h2>
        </div>
      </div>
      <p className="gs-win-prompt">
        The game is paused until {name} is back. You can look at cards, chat or concede.
      </p>
      <div className="gs-win-actions">
        <span className="gs-win-peek-hint">
          <PeekButton />
          <span className="gs-peek-or">or hold Space</span>
        </span>
        <button type="button" className="gs-win-btn gs-win-btn-main" onClick={onOk}>
          OK
        </button>
      </div>
    </div>
  );
}
