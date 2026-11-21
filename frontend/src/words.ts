/**
 * Spec 0113 -- the game's words as a player reads them: the one
 * number-word helper and the one mana-words helper every window, label
 * and screen-reader line uses (docs/architecture/PLAYER_WORDS.md).
 *
 * The owner's rules: counts of one to ten in a sentence are words ("two
 * cards"), bigger counts are digits ("12 cards"); printed game terms and
 * game values keep their digits ("Scry 2", "Main 1", "deals 3 damage",
 * "20 life") and never come through here. Words only: nothing here
 * decides anything about the game.
 */

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

/** A count in a sentence: "zero" to "ten" as words, else digits ("11", "-3"). */
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 10 ? NUMBER_WORDS[n]! : String(n);
}

/** First letter up: "Two cards", to begin a sentence or a title. */
export function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** {@link numberWord} with its first letter up ("Seven"). */
export function capitalNumber(n: number): string {
  return capital(numberWord(n));
}

const ORDINALS = [
  "zeroth",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
] as const;

/** "first" to "tenth" as words, then "11th", "12th", "21st"... */
export function ordinalWord(n: number): string {
  if (Number.isInteger(n) && n >= 0 && n <= 10) return ORDINALS[n]!;
  const tens = Math.abs(n) % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

/** "once", "twice", then "three times" ... "12 times". */
export function timesWord(n: number): string {
  if (n === 1) return "once";
  if (n === 2) return "twice";
  return `${numberWord(n)} times`;
}

const IRREGULAR: Record<string, string> = {
  Elf: "Elves",
  elf: "elves",
  Wolf: "Wolves",
  wolf: "wolves",
  Dwarf: "Dwarves",
  dwarf: "dwarves",
  Mouse: "Mice",
  mouse: "mice",
  Sheep: "Sheep",
  Fish: "Fish",
  energy: "energy",
  experience: "experience",
  mana: "mana",
  copy: "copies",
};

/** The plural of a noun: "card" "cards", "copy" "copies", "Elf" "Elves". */
export function plural(noun: string): string {
  for (const [one, many] of Object.entries(IRREGULAR)) {
    if (noun.endsWith(one)) return noun.slice(0, noun.length - one.length) + many;
  }
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

/** "two cards", "one card", "12 cards", "no cards" (zero reads "no"). */
export function countWords(n: number, noun: string, many: string = plural(noun)): string {
  if (n === 0) return `no ${many}`;
  return `${numberWord(n)} ${n === 1 ? noun : many}`;
}

/** "a" or "an" before [word], by its sound where the letter misleads ("a one-shot", "an 8/8"). */
export function article(word: string): "a" | "an" {
  const w = word.trim().toLowerCase();
  if (w === "") return "a";
  if (/^(one|uni|use|eu|ur)/.test(w)) return "a";
  if (/^\d/.test(w)) return /^(8|11|18)/.test(w) ? "an" : "a";
  return /^[aeiou]/.test(w) ? "an" : "a";
}

/** "an Island", "a Forest". */
export function withArticle(word: string): string {
  return `${article(word)} ${word}`;
}

/** "a card", "an Island", "two cards": one is "a" / "an", else {@link countWords}. */
export function someWords(n: number, noun: string, many: string = plural(noun)): string {
  return n === 1 ? withArticle(noun) : countWords(n, noun, many);
}

/** "A", "A and B", "A, B and C" ("" for none). */
export function andList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "A", "A or B", "A, B or C". */
export function orList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

// --- Mana, said in words (screen readers, alt text, tooltips) -------------------

const COLOR_WORDS: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
  C: "colorless",
  S: "snow",
};

/**
 * One mana symbol's words, without its braces: "R" "red", "2" "two generic",
 * "W/U" "white or blue", "G/P" "green Phyrexian", "2/W" "two generic or
 * white", "X" "X", "T" "tap", "Q" "untap", "E" "energy". Unknown ones are
 * said as they are.
 */
export function symbolWords(symbol: string): string {
  const s = symbol.replace(/[{}]/g, "").toUpperCase();
  if (/^\d+$/.test(s)) return `${numberWord(Number(s))} generic`;
  if (s === "T") return "tap";
  if (s === "Q") return "untap";
  if (s === "E") return "energy";
  if (s === "X" || s === "Y" || s === "Z") return s;
  if (s === "CHAOS") return "chaos";
  if (COLOR_WORDS[s]) return COLOR_WORDS[s];
  const parts = s.split("/");
  if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    if (b === "P") return `${symbolWords(a)} Phyrexian`;
    return `${symbolWords(a)} or ${symbolWords(b)}`;
  }
  if (parts.length === 3 && parts[2] === "P") {
    return `${symbolWords(parts[0]!)} or ${symbolWords(parts[1]!)} Phyrexian`;
  }
  return s;
}

/** The symbols of a mana cost, in order: "{1}{R}{R}" ["1", "R", "R"]. */
export function manaSymbols(cost: string): string[] {
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
}

/**
 * A run of mana symbols in words, like symbols grouped and counted:
 * "{1}{R}{R}" "one generic and two red", "{X}{G}" "X and one green",
 * "{W/U}{W/U}" "two white or blue". Generic numbers are added up. Empty
 * for no symbols.
 */
export function manaWords(cost: string | readonly string[]): string {
  const symbols = typeof cost === "string" ? manaSymbols(cost) : [...cost];
  let generic = 0;
  let anyGeneric = false;
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const raw of symbols) {
    const s = raw.replace(/[{}]/g, "").toUpperCase();
    if (/^\d+$/.test(s)) {
      generic += Number(s);
      anyGeneric = true;
      continue;
    }
    if (!counts.has(s)) order.push(s);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const s of ["X", "Y", "Z"]) {
    const n = counts.get(s);
    if (n) {
      parts.push(n === 1 ? s : `${numberWord(n)} ${s}s`);
      counts.delete(s);
    }
  }
  if (anyGeneric) parts.push(`${numberWord(generic)} generic`);
  for (const s of order) {
    const n = counts.get(s);
    if (!n) continue;
    if (s === "T" || s === "Q" || s === "E") {
      parts.push(n === 1 ? symbolWords(s) : `${symbolWords(s)} ${timesWord(n)}`);
      continue;
    }
    parts.push(`${numberWord(n)} ${symbolWords(s)}`);
  }
  return andList(parts);
}

/**
 * Card text with its mana symbols said in words, for a screen reader:
 * "{T}: Add {R}." "Tap: add one red mana."; "{2}{G}, {T}: Draw a card."
 * "Two generic and one green, tap: Draw a card." Each run of symbols is
 * said once; a run straight after "Add" is mana made ("add one red
 * mana"); {T} and {Q} alone are "Tap" and "Untap".
 */
export function manaTextWords(text: string): string {
  const out = text.replace(/((?:\{[^}]+\})+)/g, (run, _m, at: number) => {
    const before = text.slice(0, at);
    const symbols = manaSymbols(run);
    const onlyTaps = symbols.every((s) => /^[TQ]$/i.test(s));
    let words = onlyTaps ? andList(symbols.map((s) => symbolWords(s))) : manaWords(symbols);
    if (/\badd\s*$/i.test(before) && !onlyTaps) words = `${words} mana`;
    // A capital only where a sentence begins: the text's start (when words
    // follow), or after a full stop; never after a colon ("Costs three generic").
    const startsSentence =
      (before === "" && at + run.length < text.length) || /[.!?]\s*$/.test(before);
    return startsSentence ? capital(words) : words;
  });
  // "Tap: Add one red mana." reads on as one sentence: "Tap: add ...".
  return out.replace(/^(Tap|Untap): Add\b/, (_m, verb: string) => `${verb}: add`);
}

/**
 * Spec 0113 (page2) -- {@link manaTextWords} piece by piece, for a line
 * drawn with mana pictures: each piece's shown text and what a screen
 * reader says for it. The said pieces joined are exactly
 * `manaTextWords(text)`.
 */
export function manaTextParts(text: string): { shown: string; said: string; mana: boolean }[] {
  const pieces: { shown: string; said: string; mana: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(/((?:\{[^}]+\})+)/g)) {
    const start = m.index;
    if (start > at) {
      const plain = text.slice(at, start);
      pieces.push({ shown: plain, said: plain, mana: false });
    }
    const run = m[0];
    const before = text.slice(0, start);
    const symbols = manaSymbols(run);
    const onlyTaps = symbols.every((s) => /^[TQ]$/i.test(s));
    let words = onlyTaps ? andList(symbols.map((s) => symbolWords(s))) : manaWords(symbols);
    if (/\badd\s*$/i.test(before) && !onlyTaps) words = `${words} mana`;
    const startsSentence =
      (before === "" && start + run.length < text.length) || /[.!?]\s*$/.test(before);
    pieces.push({ shown: run, said: startsSentence ? capital(words) : words, mana: true });
    at = start + run.length;
  }
  if (at < text.length) {
    const plain = text.slice(at);
    pieces.push({ shown: plain, said: plain, mana: false });
  }
  const first = pieces[0];
  const second = pieces[1];
  if (first?.mana && /^(Tap|Untap)$/.test(first.said) && second && /^: Add\b/.test(second.said)) {
    second.said = second.said.replace(/^: Add/, ": add");
  }
  return pieces;
}

/**
 * Spec 0113 (page2) -- a symbol as the pictures name it ("WU", "2W", "RP",
 * "WUP", "R", "1") back in the game's notation, without braces ("W/U",
 * "2/W", "R/P", "W/U/P"), for {@link symbolWords} and {@link manaWords}.
 */
export function pictureSymbol(symbol: string): string {
  const s = symbol.replace(/[{}]/g, "").toUpperCase();
  if (s.includes("/") || /^\d+$/.test(s) || s.length < 2 || s === "CHAOS") return s;
  return s.split("").join("/");
}
