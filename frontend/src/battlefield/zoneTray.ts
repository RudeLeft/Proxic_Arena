// Phase 9 W-18 and W-19 -- the graveyard and exile tray, and the close-up's
// "what has changed": the words and the grouping, apart from the drawing.

import type { SnapshotCard } from "../match";

export type ZoneName = "graveyard" | "exile" | "hand";

/** Phase 9 W-18 -- identical cards (same name and picture, nothing on them) as one. */
export function groupCopies(cards: SnapshotCard[]): { card: SnapshotCard; copies: number }[] {
  const out: { card: SnapshotCard; copies: number }[] = [];
  for (const card of cards) {
    const plain = card.counters.length === 0 && !card.exiledBy && !card.playable;
    const twin = plain
      ? out.find(
          (o) =>
            o.card.name === card.name &&
            o.card.art === card.art &&
            o.card.counters.length === 0 &&
            !o.card.exiledBy &&
            !o.card.playable,
        )
      : undefined;
    if (twin) twin.copies += 1;
    else out.push({ card, copies: 1 });
  }
  return out;
}

/** Phase 9 W-18 -- why a card is where it is, in a few words. */
export function zoneNotes(card: SnapshotCard, zone: ZoneName): string[] {
  const notes: string[] = [];
  if (zone === "exile" && card.playable) notes.push("You may play it");
  if (zone === "exile" && card.exiledBy) notes.push(`Exiled by ${card.exiledBy}`);
  // A suspended card's time counters say when it comes back.
  for (const c of card.counters) {
    notes.push(`${c.count} ${c.name.toLowerCase()} counter${c.count === 1 ? "" : "s"}`);
  }
  return notes;
}

/** Phase 9 W-19 -- "2/3" when counters or effects have changed it, else null. */
export function printedPt(card: SnapshotCard): string | null {
  if (card.basePower === undefined || card.baseToughness === undefined) return null;
  if (card.basePower === card.power && card.baseToughness === card.toughness) return null;
  return `${card.basePower}/${card.baseToughness}`;
}
