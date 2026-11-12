// Spec 0072 (owner 2026-11-11, A · Rise from his hand) -- where the other
// player's spell is cast from, as this viewer may know it.
//
// Pure, like fromSnapshot: the board where the card first appears being
// cast, and the one before it, in; where it rose from out. Only what the
// snapshot already says publicly: the card being cast (the stack zone is
// public, CR 601.2a), the round's moves ("a card went from Bob's hand to
// the stack"), his hand count, and the piles every viewer sees. Which of
// his hidden cards it was is never known, never asked: all backs look
// alike, so it leaves from the middle of his fan.

import type { Snapshot, SnapshotCard } from "../match";
import type { Side } from "./layout";

export type CastZone = "hand" | "graveyard" | "exile" | "library";

export interface CastOrigin {
  zone: CastZone;
  /** Whose side of the table the place is on, as this viewer sees it. */
  side: Side;
  /** Shown the whole way (a card this viewer already saw face up there). */
  faceUp: boolean;
  /** A card in their hand this viewer was shown: that card, not a back. */
  shown: string | null;
  /** From a hidden hand: the back that left (the middle of the fan as it was). */
  back: number | null;
}

const ZONES: readonly string[] = ["hand", "graveyard", "exile", "library"];

/** Their hidden cards in hand: the hand count less the cards shown to this viewer. */
export function hiddenInHand(snapshot: Snapshot, seat: number): number {
  const count = snapshot.players.find((p) => p.seat === seat)?.handCount ?? 0;
  const shown = snapshot.otherHands.filter((card) => card.seat === seat).length;
  return Math.max(0, count - shown);
}

/** Where `card`, first being cast on `now`, came from. */
export function castOrigin(
  card: SnapshotCard,
  now: Snapshot,
  previous: Snapshot | null,
): CastOrigin {
  const side: Side = card.seat === now.seat ? "viewer" : "opponent";
  const move = (now.moves ?? []).find((m) => m.card === card.id && m.to.zone === "stack");
  const was = (list: readonly SnapshotCard[] | undefined) =>
    list?.find((other) => other.id === card.id) ?? null;
  let zone: CastZone;
  if (move && ZONES.includes(move.from.zone)) zone = move.from.zone as CastZone;
  else if (was(previous?.graveyard)) zone = "graveyard";
  else if (was(previous?.exile)) zone = "exile";
  else zone = "hand";
  const seenNow = card.known && !card.faceDown;
  if (zone === "hand") {
    const shown = was(previous?.otherHands) ? card.id : null;
    const hidden = previous ? hiddenInHand(previous, card.seat) : 0;
    return {
      zone,
      side,
      faceUp: shown !== null && seenNow,
      shown,
      back: shown === null && hidden > 0 ? Math.floor((hidden - 1) / 2) : null,
    };
  }
  let faceUp = false;
  if (zone === "graveyard") faceUp = true;
  else if (zone === "exile") {
    const there = was(previous?.exile);
    faceUp = !!there && !there.faceDown && there.known !== false;
  } else {
    // The top of a library, only when this viewer was shown it.
    faceUp = !!was(previous?.reveal?.cards) || !!was(now.reveal?.cards);
  }
  return { zone, side, faceUp: faceUp && seenNow, shown: null, back: null };
}

/**
 * Whether their spell, being cast on `before` and gone from it on `now`
 * (not on the stack), was cancelled: back where it came from, and no move
 * of it off the stack this round (a spell that resolved moved from the
 * stack to where it went).
 */
export function castCancelled(
  card: SnapshotCard,
  origin: CastOrigin,
  before: { handCount: number; libraryCount: number },
  now: Snapshot,
): boolean {
  if (now.stack.some((entry) => entry.source === card.id)) return false;
  if ((now.moves ?? []).some((m) => m.card === card.id && m.from.zone === "stack")) return false;
  const player = now.players.find((p) => p.seat === card.seat);
  switch (origin.zone) {
    case "hand":
      return (player?.handCount ?? 0) > before.handCount;
    case "library":
      return (player?.libraryCount ?? 0) > before.libraryCount;
    case "graveyard":
      return now.graveyard.some((other) => other.id === card.id);
    case "exile":
      return now.exile.some((other) => other.id === card.id);
  }
}
