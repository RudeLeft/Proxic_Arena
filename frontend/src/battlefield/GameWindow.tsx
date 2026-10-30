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

import { useEffect, useState, type ReactNode } from "react";
import type { Box, Geometry } from "./layout";

/** Hold Space to fade the window and see the table (rule 6). */
export function usePeek(active: boolean): boolean {
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!active) {
      setPeek(false);
      return undefined;
    }
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]");
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || typing(event.target)) return;
      event.preventDefault();
      setPeek(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setPeek(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => setPeek(false));
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [active]);
  return peek;
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
      aria-label={label}
      style={{ left, top, width }}
    >
      <span className="gs-bubble-pointer" aria-hidden="true" />
      <div className="gs-win-head">
        {picture && <div className="gs-win-picture">{picture}</div>}
        <div className="gs-win-words">
          <span className="gs-win-from">{from}</span>
          <h2 className="gs-win-title">{title}</h2>
        </div>
      </div>
      {children}
      <div className="gs-win-actions">
        <span className="gs-win-peek-hint">Hold Space to see the table</span>
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
  prompt,
  children,
  actions,
}: {
  geometry: Geometry;
  label: string;
  from: string;
  title: string;
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
      aria-label={label}
      style={{ left: centre, maxWidth }}
    >
      <div className="gs-win-words gs-tray-body">
        <span className="gs-win-from">{from}</span>
        <h2 className="gs-win-title">{title}</h2>
        {prompt && <p className="gs-win-prompt">{prompt}</p>}
        {children}
      </div>
      <div className="gs-win-actions gs-tray-actions">
        <span className="gs-win-peek-hint">Hold Space to see the table</span>
        {actions}
      </div>
    </div>
  );
}
