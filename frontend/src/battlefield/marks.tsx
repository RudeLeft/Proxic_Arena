// Spec 0085 (owner 2026-11-13, canvas gaps-marks-1113, 2 B; Amendment 1) --
// protection and gained-ability marks.
//
// Each is a gold-rimmed square (0076: "something the card is") at the
// card's lower left, with CardBadges' other squares. Which marks a card
// wears is read from what the game sent (ARCH-002, UI-005): its keywords
// now, the ones it gained (`gained`, worker Marks.java), a given "can't be
// blocked" and lost abilities -- never its printed text or its name.
//
//   - Hexproof, shroud, protection (in its colour or colours) and ward are
//     marked whether printed or gained: they decide what can be targeted.
//     They never fold (owner: "protection never folds first").
//   - A creature that has lost all its abilities wears a grey square.
//   - Keywords it GAINED (trample, haste, lifelink, first strike, double
//     strike, deathtouch, vigilance, menace, flying, reach) and a given
//     "can't be blocked" are marked; printed ones are in the close-up. These
//     fold into "··· N" first when the card has no room.
//   - Indestructible keeps 0080's hexagon (CardBadges' `indestructible`).
//
// The pictures are the canvas's (hexproof, shroud, protection, ward,
// trample, haste, lifelink, first strike, flying); the canvas has none for
// double strike, deathtouch, vigilance, menace, reach, "can't be blocked"
// or lost abilities (Amendment 1: approved looks only), so those are drawn
// in the same style here.

import type { ReactNode } from "react";

/** One mark on a card: its key (stable across boards), whether it may fold, and its words. */
export interface CardMark {
  key: string;
  /** Gained keywords and "can't be blocked" fold first; protection and lost abilities never. */
  folds: boolean;
  /** What pointing says (the badges' title). */
  words: string;
  /** The picture's kind, for MarkIcon. */
  icon: MarkIconKind;
  /** Protection's colours (W U B R G), or none for "from creatures" and the like. */
  colours?: readonly string[];
  /** Ward's mana number, when it is a plain {N}. */
  ward?: number | null;
}

export type MarkIconKind =
  | "hexproof"
  | "shroud"
  | "protection"
  | "ward"
  | "lost"
  | "indestructible"
  | "flying"
  | "firststrike"
  | "doublestrike"
  | "deathtouch"
  | "haste"
  | "lifelink"
  | "menace"
  | "reach"
  | "trample"
  | "vigilance"
  | "unblockable";

/** The gained keywords marked, in the order they stand (Forge's titles, lower case). */
const GAINED: readonly { title: string; icon: MarkIconKind; words: string; starts?: boolean }[] = [
  { title: "flying", icon: "flying", words: "Flying" },
  { title: "first strike", icon: "firststrike", words: "First strike" },
  { title: "double strike", icon: "doublestrike", words: "Double strike" },
  { title: "deathtouch", icon: "deathtouch", words: "Deathtouch" },
  { title: "trample", icon: "trample", words: "Trample", starts: true },
  { title: "menace", icon: "menace", words: "Menace" },
  { title: "haste", icon: "haste", words: "Haste" },
  { title: "lifelink", icon: "lifelink", words: "Lifelink" },
  { title: "vigilance", icon: "vigilance", words: "Vigilance" },
  { title: "reach", icon: "reach", words: "Reach" },
];

const COLOUR_WORDS: Record<string, string> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

/** "Protection from red", "Protection from white and from blue": the colours named, in WUBRG order. */
export function protectionColours(title: string): string[] {
  const words = title.toLowerCase().replace(/^protection from /, "");
  const found = new Set<string>();
  for (const [word, c] of Object.entries(COLOUR_WORDS))
    if (new RegExp(`\\b${word}\\b`).test(words)) found.add(c);
  return ["W", "U", "B", "R", "G"].filter((c) => found.has(c));
}

/** "Ward {2}": 2; any other ward cost (life, a discard): null. */
export function wardNumber(title: string): number | null {
  const m = /^ward\s*\{(\d+)\}\.?$/i.exec(title.trim());
  return m ? Number(m[1]) : null;
}

/** The facts the marks are read from (a battlefield card, as the game sent it). */
export interface Marked {
  keywords?: readonly string[];
  gained?: readonly string[] | undefined;
  unblockable?: boolean | undefined;
  lostAbilities?: boolean | undefined;
  faceDown?: boolean;
  known?: boolean;
}

/** The marks [card] wears, in the order they stand: protection, lost, then gained. */
export function cardMarks(card: Marked): CardMark[] {
  const out: CardMark[] = [];
  const seen = new Set<string>();
  const add = (m: CardMark) => {
    if (seen.has(m.key)) return;
    seen.add(m.key);
    out.push(m);
  };
  for (const title of card.keywords ?? []) {
    const t = title.toLowerCase();
    if (t === "hexproof" || t.startsWith("hexproof from"))
      add({ key: `kw:${t}`, folds: false, words: title, icon: "hexproof" });
    else if (t === "shroud") add({ key: "kw:shroud", folds: false, words: title, icon: "shroud" });
    else if (t.startsWith("protection from"))
      add({
        key: `kw:${t}`,
        folds: false,
        words: title,
        icon: "protection",
        colours: protectionColours(title),
      });
    else if (
      t === "ward" ||
      t.startsWith("ward ") ||
      t.startsWith("ward—") ||
      t.startsWith("ward:")
    )
      add({ key: `kw:${t}`, folds: false, words: title, icon: "ward", ward: wardNumber(title) });
  }
  if (card.lostAbilities)
    add({ key: "lost", folds: false, words: "Lost all its abilities", icon: "lost" });
  const gained = (card.gained ?? []).map((g) => g.toLowerCase());
  for (const k of GAINED) {
    if (gained.some((g) => g === k.title || (k.starts === true && g.startsWith(`${k.title} `))))
      add({ key: `kw:${k.title}`, folds: true, words: `${k.words} (gained)`, icon: k.icon });
  }
  if (card.unblockable)
    add({ key: "unblockable", folds: true, words: "Can't be blocked", icon: "unblockable" });
  return out;
}

// --- the pictures ---------------------------------------------------------------

const SHIELD = "M12 2.5 L19.5 5.2 V11 C19.5 16 16.3 19.6 12 21.3 C7.7 19.6 4.5 16 4.5 11 V5.2 Z";
const MANA_FILL: Record<string, string> = {
  W: "#e8dfb0",
  U: "#3a78c8",
  B: "#4a3f52",
  R: "#d0452a",
  G: "#3f8a44",
};

/** The colour's sign inside a one-colour protection shield (red: the canvas's flame). */
function colourSign(c: string): ReactNode {
  switch (c) {
    case "R":
      return (
        <path
          d="M12 6.8 C14.8 9.4 15.6 11.6 14.8 13.7 C14.2 15.3 13 16.1 12 16.1 C10.3 16.1 9 14.7 9 13 C9 11.6 9.8 10.7 10.5 10.1 C10.5 11.3 11.1 12.1 11.8 12.2 C11.5 10.5 11.3 8.6 12 6.8 Z"
          fill="#fff3e0"
        />
      );
    case "U":
      return (
        <path
          d="M12 6.6 C13.9 9.4 15.2 11.2 15.2 13 A3.2 3.2 0 0 1 8.8 13 C8.8 11.2 10.1 9.4 12 6.6 Z"
          fill="#eaf4ff"
        />
      );
    case "W":
      return (
        <>
          <circle cx="12" cy="11.6" r="2.6" fill="#7a5a1a" />
          <path
            d="M12 6.8 V8 M12 15.2 V16.4 M7.2 11.6 H8.4 M15.6 11.6 H16.8 M8.6 8.2 L9.4 9 M14.6 14.2 L15.4 15 M15.4 8.2 L14.6 9 M9.4 14.2 L8.6 15"
            stroke="#7a5a1a"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </>
      );
    case "B":
      return (
        <>
          <path
            d="M12 7.2 C14.6 7.2 16 8.9 16 11 C16 12.5 15.2 13.4 14.4 13.8 V15.6 H9.6 V13.8 C8.8 13.4 8 12.5 8 11 C8 8.9 9.4 7.2 12 7.2 Z"
            fill="#efe6f5"
          />
          <circle cx="10.5" cy="11.2" r="1.1" fill="#4a3f52" />
          <circle cx="13.5" cy="11.2" r="1.1" fill="#4a3f52" />
        </>
      );
    case "G":
      return (
        <path
          d="M8.4 15.6 C8.4 10.6 11.2 7.6 15.8 7.2 C15.8 12 13 15 8.4 15.6 Z M8.4 15.6 L12.6 11.2"
          fill="#e6f7dc"
          stroke="#2a5e2e"
          strokeWidth="0.9"
        />
      );
    default:
      return null;
  }
}

function protectionShield(colours: readonly string[]): ReactNode {
  if (colours.length === 1)
    return (
      <>
        <path d={SHIELD} fill={MANA_FILL[colours[0]!]} stroke="#fff" strokeWidth="1.6" />
        {colourSign(colours[0]!)}
      </>
    );
  if (colours.length > 1) {
    // Two or more colours: the shield split into upright bands, one each.
    // (Each band's clip has an id made of the colours: the same colours, the same picture.)
    const w = 15 / colours.length;
    const id = (i: number) => `bf-pro-${colours.join("")}-${i}`;
    return (
      <>
        <defs>
          {colours.map((c, i) => (
            <clipPath key={c} id={id(i)}>
              <rect x={4.5 + i * w} y="0" width={w} height="24" />
            </clipPath>
          ))}
        </defs>
        {colours.map((c, i) => (
          <path key={c} d={SHIELD} fill={MANA_FILL[c]} clipPath={`url(#${id(i)})`} />
        ))}
        <path d={SHIELD} fill="none" stroke="#fff" strokeWidth="1.6" />
      </>
    );
  }
  // From creatures, from everything: a steel shield.
  return (
    <>
      <path d={SHIELD} fill="#6d7a82" stroke="#fff" strokeWidth="1.6" />
      <path d="M12 6.8 V17 M8 10.4 H16" stroke="#e6edf0" strokeWidth="1.5" strokeLinecap="round" />
    </>
  );
}

/**
 * Indestructible is 0080's hexagon square (CardBadges draws it from
 * `indestructible`); this is it as a mark, for its icon rising (Heroic
 * Intervention: two icons rise off each creature) and for it shrinking away.
 */
export const HEX_MARK: CardMark = {
  key: "indestructible",
  folds: false,
  words: "Indestructible",
  icon: "indestructible",
};

const PICTURE: Record<Exclude<MarkIconKind, "protection" | "ward">, ReactNode> = {
  indestructible: (
    <>
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
    </>
  ),
  hexproof: (
    <>
      <path d={SHIELD} fill="#2a4a6a" stroke="#cfe6ff" strokeWidth="1.6" />
      <circle cx="12" cy="11.3" r="3.8" fill="none" stroke="#fff" strokeWidth="1.6" />
      <path d="M7.6 15.8 L16.4 6.8" stroke="#ff8a7a" strokeWidth="2.1" strokeLinecap="round" />
    </>
  ),
  shroud: (
    <>
      <path
        d="M4.5 21 C4.5 11 7.5 3.5 12 3.5 C16.5 3.5 19.5 11 19.5 21 Z"
        fill="#4a3d6e"
        stroke="#e2d8ff"
        strokeWidth="1.6"
      />
      <ellipse cx="12" cy="13" rx="3.6" ry="4.6" fill="#0d0a16" />
      <path d="M6.5 18.5 L17.5 7.5" stroke="#ff8a7a" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  lost: (
    <>
      <path
        d="M12 3.5 L14 10 L20.5 12 L14 14 L12 20.5 L10 14 L3.5 12 L10 10 Z"
        fill="none"
        stroke="#b9c2bd"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray="2.4 1.6"
      />
      <path d="M5.5 18.5 L18.5 5.5" stroke="#d6dcd8" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  trample: (
    <>
      <path d="M10 3.5 V20.5" stroke="#9aa59f" strokeWidth="2.2" strokeDasharray="3 2" />
      <path
        d="M3 12 H19.5 M14 6.5 L20 12 L14 17.5"
        fill="none"
        stroke="#ffd27a"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  haste: (
    <>
      <path
        d="M3 8 H10 M2 12 H9 M3 16 H10"
        stroke="#ffb35a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 5 L20 12 L12 19"
        fill="none"
        stroke="#ffd27a"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  lifelink: (
    <>
      <path
        d="M12 20 C5 15 3 11.5 3 8.6 C3 6 5 4 7.4 4 C9.4 4 11 5.3 12 7 C13 5.3 14.6 4 16.6 4 C19 4 21 6 21 8.6 C21 11.5 19 15 12 20 Z"
        fill="#c8455a"
        stroke="#ffd0d8"
        strokeWidth="1.4"
      />
      <path d="M12 9 V15 M9 12 H15" stroke="#fff" strokeWidth="1.8" />
    </>
  ),
  firststrike: (
    <>
      <path
        d="M5.2 18.8 L17.6 6.4 L20 4 L19.4 6.9 L6.9 20.4 Z"
        fill="#e8ecef"
        stroke="#e8ecef"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M3.8 14.6 L9.4 20.2 M6.6 17.4 L3.4 20.6"
        stroke="#ffd27a"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </>
  ),
  doublestrike: (
    <>
      <path
        d="M3.6 16.4 L13.8 6.2 L16 4 L15.4 6.6 L5.1 17.9 Z M8.2 20.6 L18.4 10.4 L20.6 8.2 L20 10.8 L9.7 22.1 Z"
        fill="#e8ecef"
        stroke="#e8ecef"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M2.4 12.6 L7.2 17.4 M7 16.8 L11.8 21.6"
        stroke="#ffd27a"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  deathtouch: (
    <>
      <path
        d="M12 3.5 C16.4 3.5 19 6.6 19 10.2 C19 12.8 17.6 14.4 16.2 15.1 V18.5 H7.8 V15.1 C6.4 14.4 5 12.8 5 10.2 C5 6.6 7.6 3.5 12 3.5 Z"
        fill="#d9ffd0"
        stroke="#2f8f3a"
        strokeWidth="1.3"
      />
      <circle cx="9.4" cy="10.6" r="1.9" fill="#173d1c" />
      <circle cx="14.6" cy="10.6" r="1.9" fill="#173d1c" />
      <path
        d="M10 18.5 V20.5 M12 18.5 V20.5 M14 18.5 V20.5"
        stroke="#d9ffd0"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </>
  ),
  menace: (
    <>
      <path
        d="M4 19 C4 12 6.5 7 11 4.5 C8.5 8 8 11 9 14 Z M20 19 C20 12 17.5 7 13 4.5 C15.5 8 16 11 15 14 Z"
        fill="#e05a4a"
        stroke="#ffd0c8"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 18 L12 15.5 L15.5 18"
        fill="none"
        stroke="#ffd0c8"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
  reach: (
    <>
      <path
        d="M4.5 20 C4.5 12 8 6.5 15 5"
        fill="none"
        stroke="#9fe08a"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M11.5 3 L17.5 4.6 L14 9.6"
        fill="none"
        stroke="#9fe08a"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17 13 C18.5 12 20 12.5 20.5 14" stroke="#dfe8f0" strokeWidth="1.4" fill="none" />
    </>
  ),
  vigilance: (
    <>
      <path
        d="M2.5 12 C5.5 7 8.6 5.5 12 5.5 C15.4 5.5 18.5 7 21.5 12 C18.5 17 15.4 18.5 12 18.5 C8.6 18.5 5.5 17 2.5 12 Z"
        fill="#f4ecd0"
        stroke="#fff"
        strokeWidth="1.2"
      />
      <circle cx="12" cy="12" r="3.6" fill="#3a6ea8" />
      <circle cx="12" cy="12" r="1.5" fill="#0d1620" />
    </>
  ),
  unblockable: (
    <>
      <path d="M11 3 V9.2 M11 14.8 V21" stroke="#9aa59f" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M2.5 12 H20 M15 7 L20.5 12 L15 17"
        fill="none"
        stroke="#9fd0ff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  flying: (
    <path
      d="M3 15 C7 6 14 4 21 5 C17 7 15 9 14 11 C16.5 10.5 18 10.8 19 11.4 C16 12.5 14 14 12.5 16.5 C9 15.5 6 15.5 3 15 Z"
      fill="#dfe8f0"
      stroke="#fff"
      strokeWidth="1"
    />
  ),
};

/** A mark's picture, on a 24x24 box. */
export function MarkIcon({ mark }: { mark: Pick<CardMark, "icon" | "colours" | "ward"> }) {
  let body: ReactNode;
  if (mark.icon === "protection") body = protectionShield(mark.colours ?? []);
  else if (mark.icon === "ward")
    body = (
      <>
        <circle cx="12" cy="12" r="8.3" fill="#1d2f52" stroke="#9fc4ff" strokeWidth="1.6" />
        <path
          d="M12 1.8 V5 M12 19 V22.2 M1.8 12 H5 M19 12 H22.2"
          stroke="#9fc4ff"
          strokeWidth="1.6"
        />
        {mark.ward !== null && mark.ward !== undefined && (
          <text
            x="12"
            y="16"
            textAnchor="middle"
            fontFamily="Inter,sans-serif"
            fontWeight="800"
            fontSize="11"
            fill="#fff"
          >
            {mark.ward}
          </text>
        )}
      </>
    );
  else body = PICTURE[mark.icon];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {body}
    </svg>
  );
}
