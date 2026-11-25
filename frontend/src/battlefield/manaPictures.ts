// The mana symbols' pictures -- the Proxic Deck Builder's (assets/mana),
// copied, not drawn here.
//
// PHASE_11 P11-E6: each is its own built file (vite.config.ts
// `assetsInlineLimit`), named by its hash and kept by the browser for a year
// like every built file, never written into the game's code. Thirty of them
// were small enough for the build to inline as text inside the board's chunk
// (145 KB of it, which hardly compresses), so every update re-sent them all
// with the code, one after another; as files they come once, in parallel,
// and only those a game draws. The same bytes, so the same picture.
//
// A module of its own, so a page that is not the game (the lobby, while a
// player sits in a room) can ask for the common ones ahead (early.ts
// `preloadGame`) without the board's code.

const PICTURES = import.meta.glob<string>("../assets/mana/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

/** One mana symbol's picture ("W", "2G"); undefined when there is none. */
export function symbolUrl(symbol: string): string | undefined {
  return PICTURES[`../assets/mana/sym_${symbol}.png`];
}

/**
 * The symbols nearly every game draws, asked ahead while a player sits in a
 * room: the five colours and colourless (the loading ring orbits the five),
 * generic one to seven, X, and tap (the abilities' "{T}:"). The rest -- the
 * hybrids, Phyrexian, snow, eight and up -- come when a card names one.
 */
export const COMMON_SYMBOLS = [
  "W",
  "U",
  "B",
  "R",
  "G",
  "C",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "X",
  "T",
] as const;

/** The common symbols' picture addresses. */
export function commonPictures(): string[] {
  return COMMON_SYMBOLS.map(symbolUrl).filter((url): url is string => !!url);
}
