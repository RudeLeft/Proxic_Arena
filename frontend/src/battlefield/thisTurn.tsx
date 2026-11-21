// Spec 0103, item 5 (owner 2026-11-17, Q5 B; canvas "deep3-reports-comfort-
// 1117", section Q5, option B) -- small "this turn" counts always on each
// plate, under the name: spells cast this turn, life gained this turn, and
// whether a permanent of theirs left the table (revolt). Mana spent is
// dropped (Decided 3: Forge keeps none per player). Pointing at them shows
// the list in words, beside the plate. Both plates, both players: public.
// Forge's own numbers (players[i].thisTurn); nothing is counted here.

import { useState } from "react";
import type { ThisTurn } from "../match";
import { countWords } from "../words";

/** The canvas's three pictures (TI.spell, TI.life, TI.left). */
function SpellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M13.5 2 L5 13.5 H11 L9.5 22 L19 9.5 H12.8 Z"
        fill="#f2c46a"
        stroke="#1a1206"
        strokeWidth=".8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LifeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5 C5.5 16 3 12.5 3 9.2 C3 6.6 5 4.5 7.5 4.5 C9.5 4.5 11 5.7 12 7.4 C13 5.7 14.5 4.5 16.5 4.5 C19 4.5 21 6.6 21 9.2 C21 12.5 18.5 16 12 20.5 Z"
        fill="#3c9a4c"
      />
      <path d="M12 9.2 V15.4 M8.9 12.3 H15.1" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3.5"
        y="5"
        width="9"
        height="13"
        rx="1.6"
        fill="none"
        stroke="#c6d4c3"
        strokeWidth="1.8"
        strokeDasharray="2.6 2"
      />
      <path
        d="M11 11.5 H21 M17.5 7.8 L21.2 11.5 L17.5 15.2"
        fill="none"
        stroke="#e9eee8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The rows of the list, in words: [key, picture, words, value, zero]. */
export function thisTurnRows(
  counts: ThisTurn,
  mine: boolean,
): { key: string; words: string; value: string; none: boolean }[] {
  return [
    {
      key: "spells",
      words: "Spells cast",
      value: String(counts.spells),
      none: counts.spells === 0,
    },
    {
      key: "life",
      words: "Life gained",
      value: counts.lifeGained > 0 ? `+${counts.lifeGained}` : "0",
      none: counts.lifeGained === 0,
    },
    {
      key: "left",
      words: `A permanent of ${mine ? "yours" : "theirs"} left the table`,
      value: counts.leftBattlefield ? "Yes" : "No",
      none: !counts.leftBattlefield,
    },
  ];
}

/**
 * Spec 0113 (W1-305) -- the counts, said: "Bob this turn: two spells cast,
 * 3 life gained, and none of their permanents left the battlefield." Life is
 * a game value: its digits stay.
 */
export function thisTurnWords(counts: ThisTurn, name: string, mine: boolean): string {
  const whose = mine ? "your" : "their";
  const left = counts.leftBattlefield
    ? `a permanent of ${mine ? "yours" : "theirs"} left the battlefield`
    : `none of ${whose} permanents left the battlefield`;
  return `${name} this turn: ${countWords(counts.spells, "spell")} cast, ${counts.lifeGained} life gained, and ${left}.`;
}

const ICONS: Record<string, () => JSX.Element> = {
  spells: SpellIcon,
  life: LifeIcon,
  left: LeftIcon,
};

/**
 * The three counts under a plate's name, and their list on pointing. [side]:
 * which plate (the list opens beside it, level with it).
 */
export function ThisTurnCounts({
  counts,
  name,
  mine,
  side,
}: {
  counts: ThisTurn | undefined;
  name: string;
  /** The viewer's own plate ("yours"); a spectator's plates are "theirs". */
  mine: boolean;
  side: "viewer" | "opponent";
}) {
  const [open, setOpen] = useState(false);
  if (!counts) return null;
  const rows = thisTurnRows(counts, mine);
  const said = thisTurnWords(counts, name, mine);
  return (
    <span
      className="gs-thisturn"
      role="group"
      tabIndex={0}
      aria-label={said}
      data-spells={counts.spells}
      data-life-gained={counts.lifeGained}
      data-left={counts.leftBattlefield ? "true" : "false"}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {rows.map((r) => {
        const Icon = ICONS[r.key]!;
        return (
          <span
            key={r.key}
            className={`gs-thisturn-n${r.none ? " gs-thisturn-zero" : ""}`}
            data-count={r.key}
          >
            <Icon />
            {r.key === "left" ? (r.none ? "" : "✓") : r.value}
          </span>
        );
      })}
      {open && (
        <span
          className={`gs-thisturn-list gs-thisturn-list-${side}`}
          role="tooltip"
          aria-hidden="true"
        >
          <span className="gs-reveal-by gs-thisturn-by">{`${name}, this turn`}</span>
          {rows.map((r) => {
            const Icon = ICONS[r.key]!;
            return (
              <span key={r.key} className="gs-thisturn-row">
                <i>
                  <Icon />
                </i>
                <span>{r.words}</span>
                <b className={r.none ? "gs-thisturn-no" : undefined}>{r.value}</b>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}
