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
import type { ReportMark, SnapshotReveal } from "../match";
import type { Geometry } from "./layout";
import { BigCard } from "./QuestionWindows";
import { ManaText, symbolUrl } from "./ManaCost";
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
    // Spec 0075 -- bounced into a library that was then shuffled (Chaos Warp).
    case "shuffled":
      return "→ shuffled into library";
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

/**
 * Spec 0071, item 1 -- how far above the resting hand's top a report's
 * bottom edge stays: clear of the cards, so the hand (and the eye on a card
 * just seen) is never under it.
 */
export const REPORT_HAND_GAP = 10;

/**
 * Spec 0071, item 1 -- the report's distance from the board's bottom: its
 * bottom edge above the top of your resting hand (layout's handTop, the
 * highest point of the fan), at every board size.
 */
export function reportBottom(geometry: Geometry): number {
  return geometry.height - geometry.handTop + REPORT_HAND_GAP;
}

const COLOUR_WORDS = {
  white: ["W", "White"],
  blue: ["U", "Blue"],
  black: ["B", "Black"],
  red: ["R", "Red"],
  green: ["G", "Green"],
} as const;

/**
 * Spec 0075 -- a picture that is not a card, the size of the cards beside
 * it: the colour chosen (its mana symbol), a coin flipped (won: bright gold
 * with a tick; lost: dull bronze with a cross).
 */
export function ReportMarkPicture({ mark }: { mark: ReportMark }) {
  if (mark.kind === "color") {
    const [symbol, word] = COLOUR_WORDS[mark.color];
    const url = symbolUrl(symbol);
    return (
      <span
        className={`gs-reveal-mark gs-reveal-mark-color gs-reveal-mark-${mark.color}`}
        role="img"
        aria-label={`${word}, the colour chosen`}
      >
        {url ? <img src={url} alt="" draggable={false} /> : <b>{symbol}</b>}
      </span>
    );
  }
  const won = mark.won;
  return (
    <span
      className={`gs-reveal-mark gs-reveal-mark-coin${won ? " gs-reveal-mark-won" : " gs-reveal-mark-lost"}`}
      role="img"
      aria-label={won ? "A coin flip, won" : "A coin flip, lost"}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id={won ? "gs-coin-won" : "gs-coin-lost"} cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor={won ? "#fff2b8" : "#d9b99a"} />
            <stop offset="0.55" stopColor={won ? "#e2b04a" : "#9c7656"} />
            <stop offset="1" stopColor={won ? "#9a6a18" : "#5b4232"} />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill={`url(#${won ? "gs-coin-won" : "gs-coin-lost"})`} />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={won ? "#7a5210" : "#3f2e22"}
          strokeWidth="3"
        />
        <circle
          cx="50"
          cy="50"
          r="37"
          fill="none"
          stroke={won ? "#fbe3a0" : "#c4a385"}
          strokeWidth="2"
          strokeDasharray="3 4"
          opacity="0.8"
        />
        {won ? (
          <path
            d="M31 52 L45 66 L71 37"
            fill="none"
            stroke="#5a3a08"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M35 35 L65 65 M65 35 L35 65"
            fill="none"
            stroke="#2e2119"
            strokeWidth="9"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}

/** Spec 0075 -- the words under a picture that is not a card. */
function markWords(mark: ReportMark): [string, string] {
  if (mark.kind === "color") return [COLOUR_WORDS[mark.color][1], "Chosen"];
  return ["Coin flip", mark.won ? "Won" : "Lost"];
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
      style={{
        left: geometry.play.x + geometry.play.w * 0.45,
        maxWidth: geometry.play.w * 0.82,
        // Spec 0071, item 1 -- above your hand, not on it; at the top while
        // a question's window holds the bottom (.gs-reveal-top).
        ...(atTop ? {} : { bottom: reportBottom(geometry) }),
      }}
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
            {/* Spec 0079 -- a fizzle's card that left: where it is now ("in Bob's hand"). */}
            {(card.toSaid ?? wentWords(card.to)) && (
              <span className="gs-reveal-to">{card.toSaid ?? wentWords(card.to)}</span>
            )}
          </li>
        ))}
        {/* Spec 0075 -- the colour chosen, the coin flipped: pictures too. */}
        {(reveal.marks ?? []).map((mark, i) => (
          <li key={`mark:${i}`} className="gs-reveal-card" data-mark={mark.kind}>
            <ReportMarkPicture mark={mark} />
            <span className="gs-reveal-name">{markWords(mark)[0]}</span>
            <span className="gs-reveal-to">{markWords(mark)[1]}</span>
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
