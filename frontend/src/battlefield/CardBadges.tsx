// Spec 0076 (owner 2026-11-12, option A on the canvas counters-1112) --
// counters and the Ring-bearer as pictures. A round badge with a picture
// and a number is something you count (one per kind of counter, the number
// always shown, "1" too); a gold-rimmed square is something the card is
// (the Ring-bearer: a gold ring, no number). They stack upward from the
// card's lower-left corner, the strip a crowded row still shows. Four or
// more kinds: the first three, then a grey "··· N" for the rest. Pointing
// says spec 0045's words; the close-up keeps them too. The pictures and
// colours are the canvas's, exactly; colour always comes with a picture.

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { counterWords } from "./Board";
import { cardMarks, MarkIcon, type CardMark, type Marked } from "./marks";
import {
  BADGE_GROW_MS,
  BADGE_OUT_MS,
  BADGE_POP_MS,
  useBadgeChanges,
  type Playing,
} from "./sizeTicks";

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

/**
 * Spec 0079 -- the copy mark's picture: two overlapping cards, gold (the
 * canvas copies-1112's). A gold-rimmed square, as the Ring-bearer's: a copy
 * is something the card is.
 */
export const TWIN = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <rect
      x="2.5"
      y="5"
      width="9"
      height="12"
      rx="1.5"
      fill="none"
      stroke="#f2c95c"
      strokeWidth="1.8"
    />
    <rect
      x="8.5"
      y="2.5"
      width="9"
      height="12"
      rx="1.5"
      fill="#0b0f0d"
      stroke="#f2c95c"
      strokeWidth="1.8"
    />
  </svg>
);

/**
 * Spec 0083 (owner 2026-11-13, canvas gaps-polish-1113, 18 B) -- two more
 * "something the card is" squares, on a spell's stack card: split second (a
 * stopwatch) and can't be countered (a seal with a tick). The canvas's.
 */
export const STOPWATCH = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="11" r="6.5" fill="none" stroke="#f2c95c" strokeWidth="1.8" />
    <path
      d="M10 11 V7.5 M8 2.5 H12 M10 2.5 V4.5"
      stroke="#f2c95c"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);
export const SEAL = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M10 2 L12 4.2 L15 3.8 L15.4 6.8 L18 8.4 L16.6 11 L17.6 13.8 L14.8 14.8 L13.6 17.6 L10.8 16.6 L10 16.8 L7.2 17.6 L6 14.8 L3.2 13.8 L4.2 11 L2.8 8.4 L5.4 6.8 L5.8 3.8 L8.8 4.2 Z"
      fill="none"
      stroke="#f2c95c"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M6.8 10.2 L9 12.4 L13.4 7.8"
      fill="none"
      stroke="#f2c95c"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Spec 0080 (owner 2026-11-12, canvas survive-1112) -- three more "something
 * the card is" squares, the canvas's pictures exactly: phased out (two cards,
 * one dashed, pale blue: Q2 A), a regeneration shield (a green shield with a
 * tick: Q3 B), indestructible (a gold hexagon in a hexagon: Q4b F1's mark at
 * rest).
 */
export const PHASED = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect
      x="3"
      y="6"
      width="11"
      height="14"
      rx="2"
      fill="none"
      stroke="#9fd0ff"
      strokeWidth="1.8"
      strokeDasharray="2.6 2"
    />
    <rect
      x="9"
      y="3"
      width="11"
      height="14"
      rx="2"
      fill="#9fd0ff44"
      stroke="#dff0ff"
      strokeWidth="1.6"
    />
  </svg>
);
export const REGEN_SHIELD = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 2 L20 5 V11 C20 16.5 16.5 20.5 12 22 C7.5 20.5 4 16.5 4 11 V5 Z"
      fill="#2c5e37"
      stroke="#fff"
      strokeWidth="1.6"
    />
    <path d="M8 12 L11 15 L16 9" fill="none" stroke="#bff0c0" strokeWidth="2" />
  </svg>
);
export const HEXAGON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 2.5 L20.5 7.25 V16.75 L12 21.5 L3.5 16.75 V7.25 Z"
      fill="#e9c46a33"
      stroke="#f2c46a"
      strokeWidth="1.8"
    />
    <path
      d="M12 7 L16.3 9.5 V14.5 L12 17 L7.7 14.5 V9.5 Z"
      fill="none"
      stroke="#fff3c4"
      strokeWidth="1.2"
    />
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

/** Spec 0082 -- a prepared spell with no picture: a sprout, as the canvas drew it. */
export const SPROUT = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M10 18 V9 M10 11 C6 11 4 8 4 5 C8 5 10 7 10 11 M10 9 C10 6 12 3 16 3 C16 7 13 9 10 9"
      fill="none"
      stroke="#f4ffe8"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);
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
 * Spec 0085 -- a mark that has just ended (the turn's end took the trample
 * away): drawn where it stood until it has shrunk away (0078's leaving
 * look), then gone. `key` is this leaving's own (one per round).
 */
export interface GoneMark {
  key: string;
  mark: CardMark;
  /** ms from now until it starts to shrink (with the round's other changes). */
  delay: number;
}

/** Spec 0085 -- a mark shrinks away over this long (the canvas's 0.35 s). */
export const MARK_OUT_MS = 350;

/**
 * A permanent's badges, or nothing. Loyalty is not one: it is the
 * planeswalker's number in the bottom bar (`figure`), unchanged.
 */
export function CardBadges({
  card,
  pile,
  room,
  artUrl,
  gone,
  onGone,
}: {
  card: {
    /** Spec 0078 -- its id: a change to its counters plays on its badges. */
    id?: string;
    counters?: readonly Counter[];
    counterFrom?: readonly { counter: string; added: number; from: string }[] | undefined;
    ringBearer?: boolean | undefined;
    /** Spec 0079 -- a copy (a Clone, a token copy): the gold copy mark. */
    copy?: boolean | undefined;
    /** Spec 0080 -- phased out, regeneration shields, indestructible: a square each. */
    phasedOut?: boolean | undefined;
    shields?: number | undefined;
    indestructible?: boolean | undefined;
    /** Spec 0082 -- prepared: a gold-rimmed square with the spell's picture. */
    prepared?: { id: string; name: string; art: string | null; crop: string | null } | undefined;
  } & Marked;
  /** Spec 0082 -- a picture's address (the prepared spell's). */
  artUrl?: ((art: string) => string) | undefined;
  /** A pile: its cards are identical, counters included -- "on each". */
  pile: boolean;
  /** What else is on the card, which the badges keep clear of. */
  room: BadgeRoom;
  /** Spec 0085 -- its marks that have just ended, shrinking away. */
  gone?: readonly GoneMark[] | undefined;
  /** Spec 0085 -- one of them has gone. */
  onGone?: ((key: string) => void) | undefined;
}) {
  // Spec 0078 (2 A, 8 B) -- a counter taken off for good: its badge stays,
  // with the number it had, until it has shrunk away.
  const changes = useBadgeChanges(card.id ?? "");
  const leaving: Counter[] = [];
  for (const p of card.id ? changes : [])
    for (const b of p.change.badges)
      if (b.to === 0 && p.wait + BADGE_OUT_MS > 0 && !card.counters?.some((c) => c.name === b.name))
        leaving.push({ name: b.name, count: b.from });
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    playBadges(ref.current, card.id ? changes : []);
    playGone(ref.current, gone ?? [], onGone);
  });
  const kinds = badgeOrder([...(card.counters ?? []), ...leaving]);
  // Spec 0085 -- its protection and gained-ability marks, and those just ended.
  const now = cardMarks(card);
  const ending = (gone ?? []).filter((g) => !now.some((m) => m.key === g.mark.key));
  const marks = [...now, ...ending.map((g) => g.mark)];
  const keep = marks.filter((m) => !m.folds);
  const foldable = marks.filter((m) => m.folds);
  const squares = [
    card.ringBearer,
    card.prepared,
    card.copy,
    card.phasedOut,
    (card.shields ?? 0) > 0,
    card.indestructible,
  ].filter(Boolean).length;
  if (kinds.length === 0 && squares === 0 && marks.length === 0) return null;
  // Spec item 2: past three kinds, "··· N". With less room (a tapped pile
  // that came in this turn), fold sooner, so every badge still shows whole.
  // Spec 0085 (owner): gained keywords fold into the "··· N" first; the
  // protection marks never fold before them.
  const ring = Array<number>(squares + keep.length).fill(MARK_H);
  let shownN = Math.min(kinds.length, SHOWN_KINDS);
  let shownKw = foldable.length;
  let placed: { column: number; y: number }[] | null = null;
  const tryPlace = (n: number, kw: number) => {
    const counterMore = kinds.length > n ? 1 : 0;
    const more = counterMore || foldable.length > kw ? 1 : 0;
    // The "··· N" stands after the counters when a counter folded, else last.
    return placeBadges(
      [
        ...Array<number>(n + counterMore).fill(BADGE_H),
        ...ring,
        ...Array<number>(kw).fill(MARK_H),
        ...(more && !counterMore ? [BADGE_H] : []),
      ],
      room,
    );
  };
  for (; shownKw >= 0; shownKw--) {
    placed = tryPlace(shownN, shownKw);
    if (placed) break;
  }
  if (!placed) {
    shownKw = 0;
    for (; shownN >= 0; shownN--) {
      placed = tryPlace(shownN, 0);
      if (placed) break;
    }
  }
  if (!placed) {
    shownN = 0;
    shownKw = 0;
    placed = placeBadges(kinds.length > 0 || foldable.length > 0 ? [BADGE_H] : ring, room) ?? [
      { column: 0, y: BADGE_FLOOR },
    ];
  }
  const shown = kinds.slice(0, Math.max(0, shownN));
  const shownMarks = foldable.slice(0, Math.max(0, shownKw));
  const counterFolded = kinds.length > shown.length;
  const folded = kinds.length - shown.length + (foldable.length - shownMarks.length);
  const words = [
    ...counterWords(
      { counters: kinds.filter((k) => !leaving.includes(k)), counterFrom: card.counterFrom },
      pile,
    ),
    card.ringBearer ? "Ring-bearer" : "",
    card.prepared ? `Prepared: ${card.prepared.name}` : "",
    card.copy ? "A copy" : "",
    card.phasedOut
      ? "Phased out: treated as though it doesn't exist until its controller's next turn"
      : "",
    (card.shields ?? 0) > 0
      ? `Regeneration shield${(card.shields ?? 0) > 1 ? ` ×${card.shields}` : ""}: the next time it would be destroyed, it taps instead`
      : "",
    card.indestructible ? "Indestructible" : "",
    ...now.map((m) => m.words),
  ].filter(Boolean);
  const moreItem = {
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
  };
  const markItem = (m: CardMark) => ({
    key: m.key,
    h: MARK_H,
    node: (
      <span
        className={`bf-mark bf-mark-kw${m.icon === "lost" ? " bf-mark-lost" : ""}`}
        data-mark={m.key}
        data-folds={m.folds ? "true" : undefined}
        data-leaving={ending.some((g) => g.mark.key === m.key) ? "true" : undefined}
      >
        <MarkIcon mark={m} />
      </span>
    ),
  });
  const items: { key: string; h: number; node: ReactNode }[] = [
    ...shown.map((c) => ({
      key: c.name,
      h: BADGE_H,
      node: (
        <span
          className="bf-badge"
          data-counter={c.name}
          data-leaving={leaving.some((l) => l.name === c.name) ? "true" : undefined}
          style={{ ["--k" as string]: COUNTER_KIND[c.name]?.colour ?? OTHER_COLOUR }}
        >
          <span className="bf-badge-g">
            <Glyph name={c.name} />
          </span>
          <span className="bf-badge-n">{c.count}</span>
        </span>
      ),
    })),
    ...(folded > 0 && counterFolded ? [moreItem] : []),
    ...(card.ringBearer
      ? [{ key: "ring", h: MARK_H, node: <span className="bf-mark bf-mark-ring">{RING}</span> }]
      : []),
    // Spec 0082 -- the prepared spell, on its creature: its picture in a
    // gold-rimmed square (the art crop, else the card; the sprout without one).
    ...(card.prepared
      ? [
          {
            key: "prepared",
            h: MARK_H,
            node: (
              <span
                className="bf-mark bf-mark-prepared"
                data-mark="prepared"
                data-mark-of={card.prepared.id}
              >
                {(card.prepared.crop ?? card.prepared.art) && artUrl ? (
                  <img src={artUrl((card.prepared.crop ?? card.prepared.art)!)} alt="" />
                ) : (
                  SPROUT
                )}
              </span>
            ),
          },
        ]
      : []),
    ...(card.copy
      ? [
          {
            key: "copy",
            h: MARK_H,
            node: (
              <span className="bf-mark bf-mark-copy" data-copy-mark="true">
                {TWIN}
              </span>
            ),
          },
        ]
      : []),
    ...(card.phasedOut
      ? [
          {
            key: "phased",
            h: MARK_H,
            node: (
              <span className="bf-mark bf-mark-phased" data-mark="phased">
                {PHASED}
              </span>
            ),
          },
        ]
      : []),
    ...((card.shields ?? 0) > 0
      ? [
          {
            key: "shield",
            h: MARK_H,
            node: (
              <span className="bf-mark bf-mark-shield" data-mark="shield">
                {REGEN_SHIELD}
              </span>
            ),
          },
        ]
      : []),
    ...(card.indestructible
      ? [
          {
            key: "hex",
            h: MARK_H,
            node: (
              <span className="bf-mark bf-mark-hex" data-mark="indestructible">
                {HEXAGON}
              </span>
            ),
          },
        ]
      : []),
    // Spec 0085 -- protection and lost abilities (never folded), then the
    // gained keywords that fit; the rest are in the "··· N".
    ...keep.map(markItem),
    ...shownMarks.map(markItem),
    ...(folded > 0 && !counterFolded ? [moreItem] : []),
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
      ref={ref}
      className="bf-badges"
      title={words.join("\n")}
      data-badges={kinds.length + squares + now.length}
      data-folded={folded > 0 ? folded : undefined}
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

/** Spec 0085 -- each mark's leaving plays once (its key is the round's). */
const goneStarted = new Set<string>();

/** Spec 0085 -- a mark just ended shrinks away (0078's leaving look), then it is gone. */
function playGone(
  root: HTMLElement,
  gone: readonly GoneMark[],
  onGone: ((key: string) => void) | undefined,
) {
  for (const g of gone) {
    if (goneStarted.has(g.key)) continue;
    const mark = root.querySelector<HTMLElement>(
      `.bf-mark[data-mark="${g.mark.key}"][data-leaving]`,
    );
    if (!mark) continue;
    goneStarted.add(g.key);
    if (goneStarted.size > 400) {
      const oldest = goneStarted.values().next();
      if (!oldest.done) goneStarted.delete(oldest.value);
    }
    if (typeof mark.animate !== "function") {
      onGone?.(g.key);
      continue;
    }
    const shrink = mark.animate(
      [
        { offset: 0, transform: "scale(1)", opacity: 1 },
        { offset: 1, transform: "scale(0)", opacity: 0 },
      ],
      { duration: MARK_OUT_MS, delay: Math.max(0, g.delay), easing: "ease-in", fill: "forwards" },
    );
    const done = () => onGone?.(g.key);
    shrink.onfinish = done;
    shrink.oncancel = done;
  }
}

function lastTop(col: readonly { h: number; below: number }[]): number {
  return col.reduce((top, item) => top + item.below + item.h, 0);
}

/** Each badge change's look runs once. */
const played = new Set<string>();

/** The canvas's backOut: grows a little past its size, then settles. */
function backOut(p: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

/**
 * Spec 0078 -- a counter arriving (2 A): its badge grows in with a ring in
 * its colour, or its number pops; one taken off (8): its number pops down,
 * the last one's badge shrinks away. On the board's clock (A-00).
 */
function playBadges(root: HTMLElement, changes: readonly Playing[]) {
  for (const p of changes) {
    for (const b of p.change.badges) {
      const key = `${p.key}:${b.name}`;
      if (played.has(key)) continue;
      const badge = root.querySelector<HTMLElement>(`.bf-badge[data-counter="${b.name}"]`);
      if (!badge || typeof badge.animate !== "function") continue;
      played.add(key);
      if (played.size > 400) {
        const oldest = played.values().next();
        if (!oldest.done) played.delete(oldest.value);
      }
      const colour = COUNTER_KIND[b.name]?.colour ?? OTHER_COLOUR;
      if (b.from === 0) {
        const frames: Keyframe[] = [];
        for (let i = 0; i <= 10; i++) {
          const q = i / 10;
          frames.push({
            offset: q,
            transform: `scale(${Math.max(0.01, i === 0 ? 0.01 : backOut(q)).toFixed(3)})`,
            boxShadow: `0 0 0 ${(3 * (1 - q)).toFixed(2)}px ${colour}, 0 1px 3px #000a`,
          });
        }
        badge.animate(frames, {
          duration: BADGE_GROW_MS,
          delay: p.wait,
          easing: "linear",
          fill: "backwards",
        });
      } else if (b.to === 0) {
        badge.animate(
          [
            { offset: 0, transform: "scale(1)", opacity: 1 },
            { offset: 1, transform: "scale(0)", opacity: 0 },
          ],
          { duration: BADGE_OUT_MS, delay: p.wait, easing: "ease-in-out", fill: "forwards" },
        );
      } else {
        const n = badge.querySelector<HTMLElement>(".bf-badge-n");
        n?.animate(
          [
            { offset: 0, transform: "scale(1)" },
            { offset: 0.5, transform: "scale(1.5)" },
            { offset: 1, transform: "scale(1)" },
          ],
          { duration: BADGE_POP_MS, delay: p.wait, easing: "ease-in-out" },
        );
        // More of them: a green ring with the pop (the canvas's "grow").
        if (b.to > b.from)
          badge.animate(
            [
              { offset: 0, boxShadow: `0 0 0 0px ${colour}, 0 1px 3px #000a` },
              { offset: 0.5, boxShadow: `0 0 0 3px ${colour}, 0 1px 3px #000a` },
              { offset: 1, boxShadow: `0 0 0 0px ${colour}, 0 1px 3px #000a` },
            ],
            { duration: 500, delay: p.wait, easing: "linear" },
          );
      }
    }
  }
}
