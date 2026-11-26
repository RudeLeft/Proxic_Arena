// P11-D6 (spec 0119, owner decision 5 Q4 A; owner answers 1 and 2, 2026-11-26)
// -- "While you were away". Your connection was gone longer than the replay's
// limit: the table went straight to now, and this window, in the report
// window's place above your hand (spec 0071) and in its look (spec 0075),
// lists what you missed: the play log's own lines (nothing made up by the
// page), each one move, numbered, oldest first, each with its first card's
// picture; a turn's line in gold. A longer list scrolls inside the window.
// Canvas: catchup-1119.html "Q4" option A; questions-0119-0120.html 0119 Q1 A.
//
// Only this seat's own play log lines, and only up to the board on the table
// (HID-005; catchUp.ts awayLines).

import type { PlayLogCard, PlayLogLine } from "../match";
import type { Geometry } from "./layout";
import { reportBottom } from "./RevealTray";

/** The canvas's window, 640 wide at 1080 high. */
const MISSED_W = 640;

/** One line's words, as the play log says them (names for players, a card's label or name). */
export function missedWords(
  line: PlayLogLine,
  nameOf: (seat: number) => string,
  mySeat: number,
): string {
  if (line.kind === "turn" && line.parts.length === 0) {
    // The play log's own turn line (GameChat's heading): "Turn 8, Alice (your turn)".
    return `Turn ${line.turn}, ${nameOf(line.active)}${line.active === mySeat ? " (your turn)" : ""}`;
  }
  return line.parts
    .map((part) =>
      typeof part === "string"
        ? part
        : "player" in part
          ? nameOf(part.player)
          : (part.label ?? part.name),
    )
    .join("");
}

function firstCard(line: PlayLogLine): PlayLogCard | null {
  for (const part of line.parts) if (typeof part === "object" && !("player" in part)) return part;
  return null;
}

export function MissedWindow({
  lines,
  geometry,
  nameOf,
  mySeat,
  artUrl,
  onClose,
}: {
  lines: readonly PlayLogLine[];
  geometry: Geometry;
  nameOf: (seat: number) => string;
  mySeat: number;
  artUrl: (art: string) => string;
  onClose: () => void;
}) {
  const n = lines.length;
  return (
    <div
      className="gs-reveal gs-missed"
      role="region"
      aria-label="While you were away"
      data-missed={n}
      style={{
        left: geometry.play.x + geometry.play.w * 0.45,
        width: Math.min(MISSED_W * (geometry.height / 1080), geometry.play.w * 0.82),
        bottom: reportBottom(geometry),
      }}
    >
      <div className="gs-missed-head">
        <span className="gs-missed-med" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.2V12l3.4 2.2" />
          </svg>
        </span>
        <div className="gs-missed-tx">
          <span className="gs-reveal-by">While you were away</span>
          <h2 className="gs-reveal-title gs-reveal-said">
            You missed {n} {n === 1 ? "move" : "moves"}. Your table is up to date.
          </h2>
        </div>
        <span className="gs-missed-order">in order</span>
      </div>
      <ol className="gs-missed-list">
        {lines.map((line, i) => {
          const card = firstCard(line);
          const turn = line.kind === "turn";
          return (
            <li
              key={line.n}
              className={`gs-missed-row${turn ? " gs-missed-turn" : ""}`}
              data-kind={line.kind}
            >
              <span className="gs-missed-num" aria-hidden="true">
                {i + 1}
              </span>
              <p>
                {missedWords(line, nameOf, mySeat)}
                {line.life?.map((t) => (
                  <small key={t.seat}>
                    {nameOf(t.seat)} {t.total}
                  </small>
                ))}
              </p>
              {card?.art && !card.faceDown && (
                <img className="gs-missed-pic" src={artUrl(card.art)} alt="" draggable={false} />
              )}
            </li>
          );
        })}
      </ol>
      <div className="gs-missed-foot">
        <span className="gs-missed-hold">The play log has them too.</span>
        <button
          type="button"
          className="pa-button pa-button-quiet gs-reveal-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
