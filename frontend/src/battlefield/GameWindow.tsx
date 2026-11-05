// One look for every game window — PHASE_09 W-00 (owner 2026-10-30).
//
// Quick questions are a BUBBLE beside the card asking (on the stack, on the
// board, in the hand), pointing at it; big ones with many cards are a TRAY
// rising from the bottom of the table, over the hand. Both keep the seven
// rules: the card asking is shown; plain words; cards as cards; one button
// style (the main answer gold, on the right); never over the stack or the
// answer button; hold Space to peek at the table; Esc backs out where the
// rules allow (the question's own business) and clicking away answers
// nothing.

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { Box, Geometry } from "./layout";
import { ManaText } from "./ManaCost";

// Rule 6 (Amendment 18): holding Space, or holding any window's Peek
// button, fades EVERY open window at once to show the table; letting go
// brings them back. One switch for the whole page, so a Peek pressed in
// one window and Space behave the same.
let peeking = false;
const peekWatchers = new Set<() => void>();
export function setPeeking(on: boolean) {
  if (on === peeking) return;
  peeking = on;
  for (const watcher of peekWatchers) watcher();
}
const watchPeek = (watcher: () => void) => {
  peekWatchers.add(watcher);
  return () => peekWatchers.delete(watcher);
};

/** Whether the windows are faded right now; `active` adds Space while this window is open. */
export function usePeek(active: boolean): boolean {
  const peek = useSyncExternalStore(
    watchPeek,
    () => peeking,
    () => false,
  );
  useEffect(() => {
    if (!active) return undefined;
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]");
    const down = (event: KeyboardEvent) => {
      // Spec 0035's countdown takes Space first ("resolve now"); the Peek
      // button still works then.
      if (event.code !== "Space" || event.defaultPrevented || typing(event.target)) return;
      event.preventDefault();
      setPeeking(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setPeeking(false);
    };
    const away = () => setPeeking(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", away);
      // A window closing while held must not leave the next one faded.
      setPeeking(false);
    };
  }, [active]);
  return active && peek;
}

/**
 * The Peek button (Amendment 18): press and hold to fade every window and
 * see the table, let go and they're back. Holding, not a click, so no
 * question is ever left hidden.
 */
export function PeekButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      className={`gs-win-btn gs-peek-btn ${className}`.trim()}
      aria-label="Peek: hold to see the table (or hold Space)"
      title="Hold to see the table (or hold Space)"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setPeeking(true);
      }}
      onPointerUp={() => setPeeking(false)}
      onPointerCancel={() => setPeeking(false)}
      onLostPointerCapture={() => setPeeking(false)}
      onClick={(event) => event.preventDefault()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="gs-peek-eye">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Peek
    </button>
  );
}

const BUBBLE_W = 380;
const GAP = 18;

/**
 * A quick question, beside the card asking: to the left of `anchor` (the
 * stack's top card, or where it will be), its pointer at the card's top,
 * kept on the table.
 */
export function Bubble({
  anchor,
  geometry,
  label,
  from,
  title,
  titleClass,
  kind,
  picture,
  children,
  actions,
}: {
  anchor: Box;
  geometry: Geometry;
  /** What a screen reader calls the window. */
  label: string;
  /** The small gold line: the card asking, and which copy it is. */
  from: string;
  title: string;
  /** An extra class on the title (the scripted games read it). */
  titleClass?: string;
  /** The question's kind, as `data-kind` (the scripted games read it). */
  kind?: string;
  picture?: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
}) {
  const peek = usePeek(true);
  const width = Math.min(BUBBLE_W, geometry.play.w * 0.34);
  const left = Math.max(geometry.inset, anchor.x - GAP - width);
  const top = Math.min(Math.max(anchor.y - 8, geometry.inset), geometry.height * 0.6);
  return (
    <div
      className={`gs-win gs-bubble${peek ? " gs-win-peek" : ""}`}
      role="dialog"
      data-kind={kind}
      aria-label={label}
      style={{ left, top, width }}
    >
      <span className="gs-bubble-pointer" aria-hidden="true" />
      <div className="gs-win-head">
        {picture && <div className="gs-win-picture">{picture}</div>}
        <div className="gs-win-words">
          <span className="gs-win-from">{from}</span>
          <h2 className={`gs-win-title${titleClass ? ` ${titleClass}` : ""}`}>
            <ManaText text={title} />
          </h2>
        </div>
      </div>
      {children}
      <div className="gs-win-actions">
        <span className="gs-win-peek-hint">
          <PeekButton />
          <span className="gs-peek-or">or hold Space</span>
        </span>
        {actions}
      </div>
    </div>
  );
}

/** A big question, many cards: a tray from the bottom of the table. */
export function Tray({
  geometry,
  label,
  from,
  title,
  titleClass,
  kind,
  prompt,
  children,
  actions,
}: {
  geometry: Geometry;
  label: string;
  from: string;
  title: string;
  titleClass?: string;
  kind?: string;
  prompt?: string | null;
  children: ReactNode;
  actions: ReactNode;
}) {
  const peek = usePeek(true);
  // As wide as its cards need (owner 2026-10-30: no dead space), centred
  // on the table, never wider than the room left of the stack.
  const centre = geometry.play.x + geometry.play.w * 0.45;
  const maxWidth = geometry.play.w * 0.82;
  return (
    <div
      className={`gs-win gs-tray${peek ? " gs-win-peek" : ""}`}
      role="dialog"
      data-kind={kind}
      aria-label={label}
      style={{ left: centre, maxWidth }}
    >
      <div className="gs-win-words gs-tray-body">
        <span className="gs-win-from">{from}</span>
        <h2 className={`gs-win-title${titleClass ? ` ${titleClass}` : ""}`}>
          <ManaText text={title} />
        </h2>
        {prompt && (
          <p className="gs-win-prompt gs-question-prompt decision-prompt">
            <ManaText text={prompt} />
          </p>
        )}
        {children}
      </div>
      <div className="gs-win-actions gs-tray-actions">
        <span className="gs-win-peek-hint">
          <PeekButton />
          <span className="gs-peek-or">or hold Space</span>
        </span>
        {actions}
      </div>
    </div>
  );
}
