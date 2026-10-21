// From what the server sent to what the board draws — PHASE_07 §7.60.
//
// Pure, like layout(): a snapshot (and the one before it, for where
// things came from) in, the Board's props out. Every value is copied
// from the snapshot; nothing here decides a rule, reads a card's text
// or guesses an identity (§7.24, §6.80). What the server did not send
// to this viewer is not here to draw (§7.45).
//
// The one thing that is inferred is ANIMATION: where a card that just
// arrived came from, and where one that left went. That is presentation
// only (§7.34, §7.35) -- a wrong guess costs a glide in the wrong
// direction, never a wrong board, because the board is the snapshot.

import type { Snapshot, SnapshotCard } from "../match";
import type { BoardCard, BoardHandCard, CombatView, DamageWave, StackView } from "./Board";
import type { AnchorId } from "./motion";

export interface BoardData {
  battlefield: BoardCard[];
  hand: BoardHandCard[];
  combat: CombatView | null;
  stack: StackView[];
  damage: DamageWave | null;
  arrivals: Map<string, AnchorId>;
  departures: Map<string, AnchorId>;
}

function toBoardCard(card: SnapshotCard): BoardCard {
  return {
    id: card.id,
    seat: card.seat,
    name: card.name,
    kind: card.kind,
    types: card.types,
    tapped: card.tapped,
    attacking: card.attacking,
    blocking: card.blocking,
    sick: card.sick,
    faceDown: card.faceDown,
    known: card.known,
    power: card.power,
    toughness: card.toughness,
    keywords: card.keywords,
    counters: card.counters,
    attachedTo: card.attachedTo,
    ...(card.enteredAt !== null ? { enteredAt: card.enteredAt } : {}),
    token: card.token,
    ringBearer: card.ringBearer,
    art: card.art,
  };
}

function toHandCard(card: SnapshotCard): BoardHandCard {
  return {
    id: card.id,
    name: card.name,
    kind: card.kind,
    types: card.types,
    power: card.power,
    toughness: card.toughness,
    art: card.art,
  };
}

/**
 * The board for this snapshot. [previous] is the snapshot drawn before
 * it, or null on the first one (nothing animates in from anywhere).
 */
export function boardFromSnapshot(snapshot: Snapshot, previous: Snapshot | null): BoardData {
  const viewer = snapshot.seat;
  const side = (seat: number) => (seat === viewer ? "viewer" : "opponent");
  const onBoard = new Set(snapshot.battlefield.map((c) => c.id));

  // A stack object's line starts at its source only when that source is
  // a permanent on the board (an activated ability); a spell's starts at
  // the stack itself.
  const stack: StackView[] = snapshot.stack.map((entry) => ({
    id: entry.id,
    name: entry.name,
    source: entry.source && onBoard.has(entry.source) ? entry.source : null,
    targets: entry.targets,
  }));

  const arrivals = new Map<string, AnchorId>();
  const departures = new Map<string, AnchorId>();
  if (previous && previous.gameEpoch === snapshot.gameEpoch) {
    const wasOnBoard = new Set(previous.battlefield.map((c) => c.id));
    const wasInHand = new Set([...previous.hand, ...previous.otherHands].map((c) => c.id));
    const wasInGraveyard = new Set(previous.graveyard.map((c) => c.id));
    for (const card of snapshot.battlefield) {
      if (wasOnBoard.has(card.id)) continue;
      // A land played comes from the hand; reanimation from the
      // graveyard; anything else through the stack (the default).
      if (wasInHand.has(card.id)) arrivals.set(card.id, `${side(card.seat)}:hand`);
      else if (wasInGraveyard.has(card.id)) arrivals.set(card.id, `${side(card.seat)}:graveyard`);
    }
    const inGraveyard = new Set(snapshot.graveyard.map((c) => c.id));
    const inHands = new Set([...snapshot.hand, ...snapshot.otherHands].map((c) => c.id));
    const handGrew = new Map(
      snapshot.players.map((p) => [
        p.seat,
        p.handCount > (previous.players.find((q) => q.seat === p.seat)?.handCount ?? p.handCount),
      ]),
    );
    for (const card of previous.battlefield) {
      if (onBoard.has(card.id)) continue;
      // Into a hand the board can see: it is drawn there and simply moves.
      if (inHands.has(card.id)) continue;
      if (inGraveyard.has(card.id)) continue; // the default
      // Into a hand the board cannot see (bounced to the opponent): the
      // hand count grew. Otherwise exile is the likeliest place.
      departures.set(
        card.id,
        handGrew.get(card.seat) ? `${side(card.seat)}:hand` : `${side(card.seat)}:exile`,
      );
    }
  }

  return {
    battlefield: snapshot.battlefield.map(toBoardCard),
    hand: snapshot.hand.map(toHandCard),
    combat: snapshot.combat,
    stack,
    damage: snapshot.damage,
    arrivals,
    departures,
  };
}
