// Phase 9 W-26 (Amendment 20, owner 2026-11-05) -- the other player has
// been gone the away time (spec 0054): a game window like every other,
// beside their plate and pointing at it, with their picture, Keep waiting
// and End the game, and Peek. (It used to be a centred card of its own
// look, never reviewed in Phase 9 -- found by the Phase 9 audit.)

import type { ReactNode } from "react";
import { PeekButton, usePeek } from "./GameWindow";

export function AwayWindow({
  name,
  face,
  minutes,
  note,
  sent,
  onWait,
  onEnd,
}: {
  name: string;
  /** Their picture. */
  face: ReactNode;
  /** The away time they have been gone (the game's setting). */
  minutes: number;
  /** The server's answer to End the game, when it refused. */
  note: string | null;
  /** End the game was sent; waiting for the server. */
  sent: boolean;
  onWait: () => void;
  onEnd: () => void;
}) {
  const peek = usePeek(true);
  const title = `${name} has been gone ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return (
    <div
      className={`gs-win gs-bubble gs-away-win${peek ? " gs-win-peek" : ""}`}
      role="alertdialog"
      aria-label={title}
    >
      <span className="gs-bubble-pointer gs-away-pointer" aria-hidden="true" />
      <div className="gs-win-head">
        <div className="gs-win-picture gs-away-face">{face}</div>
        <div className="gs-win-words">
          <span className="gs-win-from">{name} · away</span>
          <h2 className="gs-win-title">{title}</h2>
        </div>
      </div>
      <p className="gs-win-prompt">Ending the game counts as {name} conceding: you win.</p>
      {note && (
        <p className="gs-win-prompt gs-win-notice" role="alert">
          {note}
        </p>
      )}
      <div className="gs-win-actions">
        <span className="gs-win-peek-hint">
          <PeekButton />
          <span className="gs-peek-or">or hold Space</span>
        </span>
        <button type="button" className="gs-win-btn gs-win-btn-quiet" onClick={onWait}>
          Keep waiting
        </button>
        <button
          type="button"
          className="gs-win-btn gs-win-btn-main"
          disabled={sent}
          onClick={onEnd}
        >
          End the game · you win
        </button>
      </div>
    </div>
  );
}
