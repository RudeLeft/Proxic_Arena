// Spec 0045 (owner 2026-10-31, report 3) -- the cards a player was shown.
//
// Goblin Ringleader reveals the top four: today that was a line of text
// that faded ("Looking at your library: …"). Now the cards themselves,
// face up, in a tray along the bottom -- "Goblin Ringleader revealed:" --
// each marked where it went once the effect has finished ("→ hand",
// "→ bottom"). It stays until closed, or until the next turn (the worker
// stops sending it then). Only what Forge revealed, to whom it revealed
// it: the worker fills this from the reveal Forge makes to each player.

import type { ReactNode } from "react";
import type { SnapshotReveal } from "../match";
import type { Geometry } from "./layout";
import { BigCard } from "./QuestionWindows";
import { ManaText } from "./ManaCost";
import { PeekFoot, usePeek } from "./GameWindow";

/** Where a revealed card went, as the tray says it. */
export function wentWords(to: string | null | undefined): string | null {
  switch (to) {
    case "hand":
      return "→ hand";
    case "bottom":
      return "→ bottom of library";
    case "top":
      return "→ top of library";
    case "library":
      return "→ library";
    case "graveyard":
      return "→ graveyard";
    case "battlefield":
      return "→ battlefield";
    case "exile":
      return "→ exile";
    case "stack":
      return "→ stack";
    default:
      return null;
  }
}

export function RevealTray({
  reveal,
  geometry,
  atTop,
  artUrl,
  onClose,
  who,
}: {
  /** Phase 9 Amendment 12 -- a report's acting player: their picture and name. */
  who?: { name: string; face: ReactNode } | null;
  reveal: SnapshotReveal;
  geometry: Geometry;
  /** A question's window holds the bottom: the tray waits at the top. */
  atTop: boolean;
  artUrl: (art: string) => string;
  onClose: () => void;
}) {
  // Amendment 18 -- Space or Peek fades this window too.
  const peek = usePeek(true);
  return (
    <div
      className={`gs-reveal${atTop ? " gs-reveal-top" : ""}${peek ? " gs-win-peek" : ""}`}
      role="region"
      aria-label={reveal.said ?? reveal.title.replace(/:$/, "")}
      data-by={reveal.by || undefined}
      style={{ left: geometry.play.x + geometry.play.w * 0.45, maxWidth: geometry.play.w * 0.82 }}
    >
      <div className="gs-reveal-head">
        {reveal.said ? (
          // Amendment 12 -- who did it, with which card, and the whole action.
          <div className="gs-reveal-who">
            {who?.face}
            <div>
              <span className="gs-reveal-by">
                {who?.name ?? "A player"} · {reveal.source}
              </span>
              <h2 className="gs-reveal-title gs-reveal-said">{reveal.said}</h2>
              {/* Spec 0057, item 7 -- why: a reveal paid as a cost. */}
              {reveal.why && (
                <p className="gs-reveal-why">
                  <ManaText text={reveal.why} />
                </p>
              )}
            </div>
          </div>
        ) : (
          <h2 className="gs-reveal-title">{reveal.title}</h2>
        )}
      </div>
      <ul className="gs-reveal-cards">
        {reveal.cards.map((card) => (
          <li
            key={card.id}
            className="gs-reveal-card"
            data-revealed-id={card.id}
            data-to={card.to ?? undefined}
          >
            <BigCard card={card} artUrl={artUrl} small />
            <span className="gs-reveal-name">
              {card.faceDown && !card.known ? "Face-down card" : card.name}
            </span>
            {wentWords(card.to) && <span className="gs-reveal-to">{wentWords(card.to)}</span>}
          </li>
        ))}
      </ul>
      {/* Spec 0057, item 2 -- the question windows' footer: Peek and "or hold
        Space" on the left, Close on the right. */}
      <PeekFoot className="gs-reveal-foot">
        <button
          type="button"
          className="pa-button pa-button-quiet gs-reveal-close"
          onClick={onClose}
        >
          Close
        </button>
      </PeekFoot>
    </div>
  );
}
