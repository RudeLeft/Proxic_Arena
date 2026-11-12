// Spec 0076 (owner 2026-11-12, option A on the canvas counters-1112) --
// counters and the Ring-bearer as pictures. A round badge with a picture
// and a number is something you count (one per kind of counter, the number
// always shown, "1" too); a gold-rimmed square is something the card is
// (the Ring-bearer: a gold ring, no number). They stack upward from the
// card's lower-left corner, the strip a crowded row still shows. Four or
// more kinds: the first three, then a grey "··· N" for the rest. Pointing
// says spec 0045's words; the close-up keeps them too. The pictures and
// colours are the canvas's, exactly; colour always comes with a picture.

import type { ReactNode } from "react";
import { counterWords } from "./Board";

const W = "#fff";

/** The canvas's pictures (G), on a 20x20 box (the ring on 24x24). */
const GLYPH: Record<string, ReactNode> = {
  up: (
    <path
      d="M4 13.5 L10 6.5 L16 13.5"
      fill="none"
      stroke={W}
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  down: (
    <path
      d="M4 6.5 L10 13.5 L16 6.5"
      fill="none"
      stroke={W}
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  bolt: <path d="M11.5 1.5 L4 11 H9 L8 18.5 L16 8.5 H11 Z" fill={W} />,
  shield: <path d="M10 2 L17 4.8 V10 C17 14 14 16.8 10 18 C6 16.8 3 14 3 10 V4.8 Z" fill={W} />,
  stun: (
    <path
      d="M10 1.5 L11.9 8.1 L18.5 10 L11.9 11.9 L10 18.5 L8.1 11.9 L1.5 10 L8.1 8.1 Z"
      fill="#1a1206"
    />
  ),
  oil: (
    <path
      d="M10 2 C10 2 4.2 9.2 4.2 13 A5.8 5.8 0 0 0 15.8 13 C15.8 9.2 10 2 10 2 Z"
      fill="#e7d9ff"
    />
  ),
  lore: (
    <path
      d="M2.5 4.5 H8.5 C9.6 4.5 10 5.3 10 5.3 C10 5.3 10.4 4.5 11.5 4.5 H17.5 V15.5 H11.5 C10.4 15.5 10 16.3 10 16.3 C10 16.3 9.6 15.5 8.5 15.5 H2.5 Z M10 5.3 V16.3"
      fill={W}
      stroke="#6b5130"
      strokeWidth="1"
    />
  ),
  time: (
    <path
      d="M5 2.5 H15 M5 17.5 H15 M6.2 2.5 C6.2 7.5 13.8 12.5 13.8 17.5 M13.8 2.5 C13.8 7.5 6.2 12.5 6.2 17.5"
      fill="none"
      stroke={W}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  ),
  more: (
    <>
      <circle cx="4.5" cy="10" r="2.2" fill={W} />
      <circle cx="10" cy="10" r="2.2" fill={W} />
      <circle cx="15.5" cy="10" r="2.2" fill={W} />
    </>
  ),
};

/** The kinds drawn (the canvas's KIND): colour, picture, and whether it
 * changes power/toughness (those come first). */
export const COUNTER_KIND: Record<string, { colour: string; glyph: string; pt?: boolean }> = {
  P1P1: { colour: "#3c9a4c", glyph: "up", pt: true },
  M1M1: { colour: "#c0443a", glyph: "down", pt: true },
  CHARGE: { colour: "#3b7fd0", glyph: "bolt" },
  SHIELD: { colour: "#8b9aab", glyph: "shield" },
  STUN: { colour: "#e3b23c", glyph: "stun" },
  OIL: { colour: "#6a4791", glyph: "oil" },
  LORE: { colour: "#a7814a", glyph: "lore" },
  TIME: { colour: "#2c9a99", glyph: "time" },
};
/** Any other kind: grey, with its first letters. */
export const OTHER_COLOUR = "#5d6863";
/** Past this many kinds, the rest fold into "··· N" (spec 0076 item 2). */
export const SHOWN_KINDS = 3;

function Glyph({ name }: { name: string }) {
  const kind = COUNTER_KIND[name];
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {kind ? (
        GLYPH[kind.glyph]
      ) : (
        <text
          x="10"
          y="14"
          textAnchor="middle"
          fontFamily="Inter,sans-serif"
          fontWeight="800"
          fontSize="9.5"
          fill={W}
        >
          {name.slice(0, 2)}
        </text>
      )}
    </svg>
  );
}

const RING = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="12" cy="13.5" rx="7.6" ry="6.6" fill="none" stroke="#f2d48a" strokeWidth="3" />
    <ellipse
      cx="12"
      cy="13.5"
      rx="7.6"
      ry="6.6"
      fill="none"
      stroke="#fff6d8"
      strokeWidth="1"
      opacity=".55"
      transform="translate(-0.6 -0.8)"
    />
    <path d="M12 3.2 L14.4 6 L12 8.4 L9.6 6 Z" fill="#fff1c6" stroke="#b07a1c" strokeWidth=".8" />
  </svg>
);

type Counter = { name: string; count: number };

/** The badges' order (the canvas's): +1/+1 and -1/-1 first, then the most. */
export function badgeOrder(counters: readonly Counter[]): Counter[] {
  const pt = (c: Counter) => (COUNTER_KIND[c.name]?.pt ? 1 : 0);
  return counters
    .filter((c) => c.name !== "LOYALTY")
    .slice()
    .sort((a, b) => pt(b) - pt(a) || b.count - a.count);
}

/**
 * Where badges may stand, in fractions of the card's height measured up
 * from its bottom edge. Spec 0076 item 5: a badge never sits under (or
 * over) anything else on the card -- the bars, the x N, a land's mana
 * symbols, the state word (TAPPED, ATTACKING, BLOCKING, TARGET), the zZz,
 * a sector word. Each band below is that mark's box (battlefield.css),
 * padded for its 1px borders at the smallest card.
 */
export const BADGE_H = 0.15;
export const MARK_H = 0.17;
export const BADGE_GAP = 0.018;
/** Above the bottom bar (0.132). */
export const BADGE_FLOOR = 0.15;
/** Above a land's mana pill (bottom 18%, 0.17 tall + its border). */
export const BADGE_FLOOR_MANA = 0.39;
/** Below the name bar (0.132). */
export const BADGE_ROOF = 0.86;
/** Below a pile's x N (top 0.155, about 0.12 tall at the smallest card). */
export const BADGE_ROOF_PILE = 0.72;
/** The state word, centred (0.1 tall + borders). */
export const STATE_BAND: readonly [number, number] = [0.435, 0.565];
/** The zZz's box (top 0.37, 0.3 tall). */
export const ZZZ_BAND: readonly [number, number] = [0.33, 0.63];
/** A sector or sprocket word (top 38%, 0.1 tall + borders). */
export const ZONE_BAND: readonly [number, number] = [0.5, 0.635];
/** Columns, left to right: two always fit inside the card's width. */
export const BADGE_COLUMNS = 2;

export interface BadgeRoom {
  pile: boolean;
  mana: boolean;
  state: boolean;
  zzz: boolean;
  zone: boolean;
}

/**
 * Each item's column and height off the bottom: up each column from the
 * floor, stepping over every band, then the next column to the right.
 * Null when they do not fit in BADGE_COLUMNS columns.
 */
export function placeBadges(
  heights: readonly number[],
  room: BadgeRoom,
): { column: number; y: number }[] | null {
  const floor = room.mana ? BADGE_FLOOR_MANA : BADGE_FLOOR;
  const roof = room.pile ? BADGE_ROOF_PILE : BADGE_ROOF;
  const bands = [
    ...(room.state ? [STATE_BAND] : []),
    ...(room.zzz ? [ZZZ_BAND] : []),
    ...(room.zone ? [ZONE_BAND] : []),
  ];
  const out: { column: number; y: number }[] = [];
  let column = 0;
  let next = floor;
  for (const h of heights) {
    for (;;) {
      let y = next;
      for (let moved = true; moved; ) {
        moved = false;
        for (const [a, b] of bands)
          if (y < b && y + h > a) {
            y = b;
            moved = true;
          }
      }
      if (y + h <= roof + 1e-9) {
        out.push({ column, y });
        next = y + h + BADGE_GAP;
        break;
      }
      if (next === floor) return null; // not even one fits in a column
      column += 1;
      if (column >= BADGE_COLUMNS) return null;
      next = floor;
    }
  }
  return out;
}

/**
 * A permanent's badges, or nothing. Loyalty is not one: it is the
 * planeswalker's number in the bottom bar (`figure`), unchanged.
 */
export function CardBadges({
  card,
  pile,
  room,
}: {
  card: {
    counters?: readonly Counter[];
    counterFrom?: readonly { counter: string; added: number; from: string }[] | undefined;
    ringBearer?: boolean | undefined;
  };
  /** A pile: its cards are identical, counters included -- "on each". */
  pile: boolean;
  /** What else is on the card, which the badges keep clear of. */
  room: BadgeRoom;
}) {
  const kinds = badgeOrder(card.counters ?? []);
  if (kinds.length === 0 && !card.ringBearer) return null;
  // Spec item 2: past three kinds, "··· N". With less room (a tapped pile
  // that came in this turn), fold sooner, so every badge still shows whole.
  const ring = card.ringBearer ? [MARK_H] : [];
  let shownN = Math.min(kinds.length, SHOWN_KINDS);
  let placed: { column: number; y: number }[] | null = null;
  for (; shownN >= 0; shownN--) {
    const more = kinds.length > shownN ? 1 : 0;
    placed = placeBadges([...Array<number>(shownN + more).fill(BADGE_H), ...ring], room);
    if (placed) break;
  }
  if (!placed) {
    shownN = 0;
    placed = placeBadges(kinds.length > 0 ? [BADGE_H] : ring, room) ?? [
      { column: 0, y: BADGE_FLOOR },
    ];
  }
  const shown = kinds.slice(0, Math.max(0, shownN));
  const folded = kinds.length - shown.length;
  const words = [
    ...counterWords({ counters: kinds, counterFrom: card.counterFrom }, pile),
    card.ringBearer ? "Ring-bearer" : "",
  ].filter(Boolean);
  const items: { key: string; h: number; node: ReactNode }[] = [
    ...shown.map((c) => ({
      key: c.name,
      h: BADGE_H,
      node: (
        <span
          className="bf-badge"
          data-counter={c.name}
          style={{ ["--k" as string]: COUNTER_KIND[c.name]?.colour ?? OTHER_COLOUR }}
        >
          <span className="bf-badge-g">
            <Glyph name={c.name} />
          </span>
          <span className="bf-badge-n">{c.count}</span>
        </span>
      ),
    })),
    ...(folded > 0
      ? [
          {
            key: "more",
            h: BADGE_H,
            node: (
              <span className="bf-badge bf-badge-more" data-counter="more">
                <span className="bf-badge-g">
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    {GLYPH.more}
                  </svg>
                </span>
                <span className="bf-badge-n">{folded}</span>
              </span>
            ),
          },
        ]
      : []),
    ...(card.ringBearer
      ? [{ key: "ring", h: MARK_H, node: <span className="bf-mark bf-mark-ring">{RING}</span> }]
      : []),
  ];
  // A column is a flex column from the bottom; each item's margin below
  // puts it at its height (column-reverse: the first item is the lowest).
  const columns: { key: string; h: number; node: ReactNode; below: number }[][] = [];
  items.forEach((item, n) => {
    const at = placed[n] ?? { column: 0, y: BADGE_FLOOR };
    const col = (columns[at.column] ??= []);
    col.push({ ...item, below: at.y - lastTop(col) });
  });
  return (
    <span
      className="bf-badges"
      title={words.join("\n")}
      data-badges={kinds.length + (card.ringBearer ? 1 : 0)}
    >
      {columns.map((col, c) => (
        <span key={c} className="bf-badge-col">
          {col.map((item) => (
            <span
              key={item.key}
              className="bf-badge-at"
              style={{ marginBottom: `calc(var(--card-h) * ${item.below.toFixed(4)})` }}
            >
              {item.node}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function lastTop(col: readonly { h: number; below: number }[]): number {
  return col.reduce((top, item) => top + item.below + item.h, 0);
}
