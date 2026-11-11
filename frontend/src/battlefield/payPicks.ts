// Spec 0070 (owner 2026-11-09) -- click-to-pay Ribbons. A cost paid by
// picking cards one at a time (tap five Elves, sacrifice two Mountains,
// return an Island...) marks each card the moment it is picked: a Ribbon in
// the cost's colour with its word, and a card picked to tap leans 5 degrees
// (TAPPED_TILT) -- never sideways before the cost is paid. Clicking a picked
// card again takes it back.
//
// What is picked, and what the cost does, is the game's
// (`decision.picking`); the page only draws it. The other player is never
// sent it, so their table shows nothing until the cost is paid. Pure, so it
// is tested without a board.

import type { Decision } from "../match";

/** One card picked to pay: its Ribbon, whether it leans, and the answer that takes it back. */
export interface PayMark {
  word: string;
  tone: PayTone;
  lean: boolean;
  /** The answer that un-picks it ("unpick:card:12"). */
  actionId: string;
}

/** The Ribbon's colours (battlefield.css `bf-pay-<tone>`), by what the cost does. */
export const PAY_TONES = [
  "tap",
  "untap",
  "sacrifice",
  "exile",
  "hand",
  "library",
  "reveal",
  "discard",
  "other",
] as const;
export type PayTone = (typeof PAY_TONES)[number];

function toneOf(tone: string): PayTone {
  return (PAY_TONES as readonly string[]).includes(tone) ? (tone as PayTone) : "other";
}

const NO_MARKS: ReadonlyMap<string, PayMark> = new Map();

/** Each card picked so far for the cost being paid, by object id ("card:12"). */
export function payMarks(decision: Decision | null | undefined): ReadonlyMap<string, PayMark> {
  const picking = decision?.picking;
  if (!picking || picking.picked.length === 0) return NO_MARKS;
  const tone = toneOf(picking.tone);
  return new Map(
    picking.picked.map((p) => [
      p.objectId,
      { word: picking.word, tone, lean: picking.lean, actionId: p.actionId },
    ]),
  );
}

/** What a screen reader hears on a picked card. */
export function payWords(mark: PayMark): string {
  return `picked: ${mark.word.toLowerCase()} -- click again to take it back`;
}

/**
 * Between a pick and the game's next question the page holds the marks,
 * with the card just clicked added (or the one taken back gone) -- so no
 * Ribbon flickers off and no leaning card tips back and forth while the
 * answer travels. Dropped this long after the last question if no new
 * one comes (the next question normally replaces them at once).
 */
export const PAY_HOLD_MS = 1500;

/** The marks with [objectId] picked for the cost [picking] describes. */
export function withPick(
  marks: ReadonlyMap<string, PayMark>,
  picking: NonNullable<Decision["picking"]>,
  objectId: string,
): ReadonlyMap<string, PayMark> {
  const out = new Map(marks);
  out.set(objectId, {
    word: picking.word,
    tone: toneOf(picking.tone),
    lean: picking.lean,
    actionId: `unpick:${objectId}`,
  });
  return out;
}

/** The marks without [objectId]. */
export function withoutPick(
  marks: ReadonlyMap<string, PayMark>,
  objectId: string,
): ReadonlyMap<string, PayMark> {
  const out = new Map(marks);
  out.delete(objectId);
  return out;
}
