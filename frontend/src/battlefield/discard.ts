// Spec 0061, item 3 (owner's way "a") -- the end-of-turn discard is on
// purpose: a click on a hand card only PICKS it (red outline); the act
// button then names it -- "Discard Elvish Warrior" -- and discards on a
// click. Discarding several, the player picks them all, then "Discard 2
// cards". A wrong click costs nothing: click another card to change it.
//
// The game asks one card at a time (MatchController
// chooseCardsToDiscardToMaximumHandSize); the page answers the first pick
// on the button, and the rest as the game asks for them. Which cards may be
// discarded, and how many, is the game's: the options and `arrange.discard`.
// Pure, so it is tested without a board.

import type { Decision } from "../match";
import { capitalNumber, countWords, numberWord } from "../words";

/** Forge's question: discard down to the maximum hand size. */
export const DISCARD_KIND = "chooseCardsToDiscardToMaximumHandSize";

/** How many cards the player still has to discard (the game says; 1 from an older worker). */
export function discardCount(decision: Decision): number {
  const n = decision.arrange?.discard;
  return typeof n === "number" && n > 0 ? n : 1;
}

/**
 * A click on a hand card: picks it, or unpicks it if picked. With one to
 * discard the new pick replaces the old one; with several, a pick past the
 * count replaces the earliest.
 */
export function togglePick(picked: readonly string[], id: string, count: number): string[] {
  if (picked.includes(id)) return picked.filter((one) => one !== id);
  if (count <= 1) return [id];
  return picked.length < count ? [...picked, id] : [...picked.slice(1), id];
}

/**
 * What the act button says: idle until the picks are made, then what it
 * discards. Spec 0113 (W1-049..W1-051): counts as words ("Discard two cards").
 */
export function discardWords(
  pickedNames: readonly string[],
  count: number,
): { word: string; sub: string; ready: boolean } {
  const k = pickedNames.length;
  if (k >= count && k > 0) {
    return {
      word: count === 1 ? `Discard ${pickedNames[0]}` : `Discard ${countWords(count, "card")}`,
      sub: "Or click another card",
      ready: true,
    };
  }
  if (k === 0) {
    return {
      word: `Discard ${numberWord(count)}`,
      sub:
        count === 1 ? "Click a card to pick it" : `Click ${countWords(count, "card")} to pick them`,
      ready: false,
    };
  }
  return {
    word: `Discard ${numberWord(count)}`,
    sub: `${capitalNumber(k)} picked. Click ${numberWord(count - k)} more.`,
    ready: false,
  };
}
