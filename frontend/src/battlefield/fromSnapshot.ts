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

import type { LifeChanges, Snapshot, SnapshotCard } from "../match";
import { sizeChanges, type SizeChanges } from "./sizeTicks";
import type {
  BoardCard,
  BoardHandCard,
  CombatView,
  DamageWave,
  Merge,
  OpponentHandCard,
  Return,
  StackView,
} from "./Board";
import type { AnchorId } from "./motion";
import { sameTrigger, stackWords } from "./triggers";

export interface BoardData {
  battlefield: BoardCard[];
  hand: BoardHandCard[];
  /** Spec 0031 — the opponent's hand: a back per hidden card (its count is
   * the snapshot's), then the cards the server showed this viewer. */
  opponentHand: OpponentHandCard[];
  combat: CombatView | null;
  stack: StackView[];
  damage: DamageWave | null;
  /** Spec 0077 -- the round's life and poison changes. */
  life: LifeChanges | null;
  /** Spec 0078 -- each permanent's size and counters that changed this round. */
  sizes: SizeChanges | null;
  arrivals: Map<string, AnchorId>;
  departures: Map<string, AnchorId>;
  /** Phase 10 A-10 -- each permanent that cards merged into this update, and those cards. */
  merges: Map<string, Merge>;
  /** Phase 10 A-14 -- each card that went back to a hand or onto/into a library, from the table or the stack. */
  returns: Map<string, Return>;
  /** Spec 0061, item 4 -- each card gone to a graveyard with a reason: the game's tag ("Cycled"). */
  graves: Map<string, string>;
  /** Spec 0074 -- the cards discarded, milled, or moved out of a graveyard or exile this update. */
  tileMoves: TileMove[];
  /** Spec 0074 -- the spells countered this update (each spell's own card). */
  countered: Set<string>;
}

/** Spec 0074 -- a pile on the plate a card is drawn leaving or reaching. */
export type TileZone = "library" | "graveyard" | "exile";

/** Spec 0074 -- what a card looked like where this viewer could see it. */
export interface TileFace {
  name: string;
  kind: string;
  types: string;
  power: number | null;
  toughness: number | null;
  art: string | null;
  crop: string | null;
  faceDown: boolean;
  known: boolean;
}

/**
 * Spec 0074 -- one card discarded (a hand to a graveyard), milled (a library
 * to a graveyard), or moved out of a graveyard or exile, as the game moved
 * it. `card` is its id where this viewer saw it (the graveyard or exile it
 * went to or came from, the hand it left): a card that went into a place
 * hidden from the viewer (the other player's hand, a library) has no id
 * there, so it is the one gone from the graveyard the page drew (compared,
 * never sent on), and the page draws that public card leaving -- never an
 * id for where it is now.
 */
export interface TileMove {
  card: string;
  from: { zone: TileZone | "hand"; side: "viewer" | "opponent" };
  to: { zone: TileZone | "hand" | "battlefield"; side: "viewer" | "opponent" };
  face: TileFace;
  /** It went where this viewer cannot see it (a library, the other player's hidden hand). */
  hidden: boolean;
  /** Into a library: where, when the game says (A-14). */
  where: "top" | "bottom" | "shuffled" | null;
}

function faceOf(card: SnapshotCard): TileFace {
  return {
    name: card.name,
    kind: card.kind,
    types: card.types,
    power: card.power,
    toughness: card.toughness,
    art: card.art,
    crop: card.crop ?? null,
    faceDown: card.faceDown,
    known: card.known,
  };
}

const TILE_ZONES: readonly string[] = ["library", "graveyard", "exile"];

/**
 * Spec 0074 -- the round's discards, mills, and cards out of a graveyard or
 * exile, in the order the game made them. Each has the face this viewer saw
 * (graveyards are public; face-up exile too). A move into a place this
 * viewer cannot see carries no card: it is paired with the card gone from
 * that graveyard or exile on the board drawn before (the same seat's, the
 * game's order against the board's order), animation only.
 */
function tileMovesOf(
  snapshot: Snapshot,
  previous: Snapshot | null,
  moves: NonNullable<Snapshot["moves"]>,
): TileMove[] {
  if (!previous || previous.gameEpoch !== snapshot.gameEpoch) return [];
  const viewer = snapshot.seat;
  const side = (seat: number) => (seat === viewer ? "viewer" : "opponent");
  const seenNow = new Set(
    [
      ...snapshot.battlefield,
      ...snapshot.hand,
      ...snapshot.otherHands,
      ...snapshot.graveyard,
      ...snapshot.exile,
      ...snapshot.casting,
    ].map((c) => c.id),
  );
  for (const e of snapshot.stack) if (e.source) seenNow.add(e.source);
  const claimed = new Set(moves.flatMap((m) => (m.card ? [m.card] : [])));
  const pile = (s: Snapshot, zone: string) =>
    zone === "graveyard" ? s.graveyard : zone === "exile" ? s.exile : [];
  const out: TileMove[] = [];
  for (const move of moves) {
    const from = move.from;
    const to = move.to;
    if (from.seat === null || to.seat === null) continue;
    const fromTile = TILE_ZONES.includes(from.zone);
    // Discarded (a hand to a graveyard) or milled (a library to a graveyard).
    if ((from.zone === "hand" || from.zone === "library") && to.zone === "graveyard") {
      const now = move.card ? snapshot.graveyard.find((c) => c.id === move.card) : undefined;
      if (!now) continue;
      out.push({
        card: now.id,
        from: { zone: from.zone, side: side(from.seat) },
        to: { zone: "graveyard", side: side(to.seat) },
        face: faceOf(now),
        hidden: false,
        where: null,
      });
      continue;
    }
    if (!fromTile || from.zone === "library") continue;
    if (!["hand", "battlefield", ...TILE_ZONES].includes(to.zone) || to.zone === from.zone)
      continue;
    let card = move.card;
    let was = card ? pile(previous, from.zone).find((c) => c.id === card) : undefined;
    if (!card) {
      // Gone from that graveyard (or exile), seen nowhere now, not named by another move.
      was = pile(previous, from.zone).find(
        (c) => c.seat === from.seat && !seenNow.has(c.id) && !claimed.has(c.id),
      );
      if (!was) continue;
      card = was.id;
      claimed.add(card);
    }
    const there =
      was ??
      [...snapshot.battlefield, ...snapshot.hand, ...snapshot.exile, ...snapshot.graveyard].find(
        (c) => c.id === card,
      );
    if (!there) continue;
    const hidden =
      to.zone === "library" ||
      (to.zone === "hand" && to.seat !== viewer && !snapshot.otherHands.some((c) => c.id === card));
    out.push({
      card,
      from: { zone: from.zone as TileZone, side: side(from.seat) },
      to: { zone: to.zone as TileMove["to"]["zone"], side: side(to.seat) },
      face: faceOf(there),
      hidden,
      where: to.zone === "library" ? (move.where ?? null) : null,
    });
  }
  return out;
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
    ...(card.basePower !== undefined ? { basePower: card.basePower } : {}),
    ...(card.baseToughness !== undefined ? { baseToughness: card.baseToughness } : {}),
    ...(card.damage > 0 ? { damage: card.damage } : {}),
    keywords: card.keywords,
    counters: card.counters,
    attachedTo: card.attachedTo,
    ...(card.enteredAt !== null ? { enteredAt: card.enteredAt } : {}),
    token: card.token,
    ringBearer: card.ringBearer,
    ...(card.sector ? { sector: card.sector } : {}),
    ...(card.sprocket ? { sprocket: card.sprocket } : {}),
    ...(card.counterFrom ? { counterFrom: card.counterFrom } : {}),
    ...(card.makes?.length ? { makes: card.makes } : {}),
    art: card.art,
    crop: card.crop ?? null,
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
    crop: card.crop ?? null,
    manaCost: card.manaCost,
    ...(card.seen ? { seen: true } : {}),
  };
}

/** Spec 0031 — what the viewer may see of the opponent's hand. */
function opponentHandOf(snapshot: Snapshot): OpponentHandCard[] {
  const them = snapshot.players.find((p) => p.seat !== snapshot.seat);
  if (!them) return [];
  const shown = snapshot.otherHands.filter((card) => card.seat === them.seat);
  const hidden = Math.max(0, them.handCount - shown.length);
  return [
    ...Array.from({ length: hidden }, (_, i) => ({
      id: `hidden-hand:${them.seat}:${i}`,
      shown: null,
    })),
    ...shown.map((card) => ({ id: card.id, shown: toHandCard(card) })),
  ];
}

/**
 * The round's moves, each one that left the table, the stack or the
 * viewer's own hand for a place this viewer cannot see (the other player's
 * hand, any library) given the card it was on the board drawn before.
 *
 * The game sends no id for a card now in a zone hidden from the viewer
 * (2026-11-08, Krark, the Thumbless returning a Lightning Bolt to its
 * owner's hand: an id is a live handle on a card wherever it goes), only
 * "a card went from Alice's battlefield to her hand". The page still holds
 * the board it drew, so it knows which card is gone from there: animation
 * only (header), never an identity sent on. Known limit: when two cards
 * leave the same place for two different hidden places in one round, they
 * are paired in the order the game moved them and the board listed them,
 * which can swap the two glides.
 */
function withLeavers(
  snapshot: Snapshot,
  previous: Snapshot | null,
): NonNullable<Snapshot["moves"]> {
  const moves = snapshot.moves ?? [];
  if (!previous || previous.gameEpoch !== snapshot.gameEpoch) return moves;
  if (moves.every((m) => m.card)) return moves;
  const here = new Set<string>([
    ...[
      ...snapshot.battlefield,
      ...snapshot.hand,
      ...snapshot.otherHands,
      ...snapshot.graveyard,
      ...snapshot.exile,
      ...snapshot.casting,
    ].map((c) => c.id),
    ...snapshot.stack.flatMap((e) => (e.source ? [e.source] : [])),
  ]);
  const claimed = new Set(moves.flatMap((m) => (m.card ? [m.card] : [])));
  const gone = (id: string) => !here.has(id) && !claimed.has(id);
  const leftFrom = (place: { zone: string; seat: number | null }): string[] => {
    if (place.zone === "battlefield") {
      // The battlefield's seat is its controller's, as the card's is.
      return previous.battlefield
        .filter((c) => gone(c.id) && (place.seat === null || c.seat === place.seat))
        .map((c) => c.id);
    }
    if (place.zone === "stack") {
      return previous.stack
        .filter((e) => e.kind === "spell" && e.source && gone(e.source))
        .filter((e) => place.seat === null || e.controller === place.seat)
        .map((e) => e.source!);
    }
    if (place.zone === "hand" && place.seat === snapshot.seat) {
      return previous.hand.filter((c) => gone(c.id)).map((c) => c.id);
    }
    return [];
  };
  return moves.map((move) => {
    if (move.card || (move.to.zone !== "hand" && move.to.zone !== "library")) return move;
    const card = leftFrom(move.from)[0];
    if (!card) return move;
    claimed.add(card);
    return { ...move, card };
  });
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
  // Spec 0043 (owner 2026-10-31): the same trigger many times over (nine
  // Skirk Drill Sergeants' "may pay {2}{R}") is one card, "×9" -- the
  // object that resolves next leads, and the order stays Forge's.
  const groups: { entry: (typeof snapshot.stack)[number]; ids: string[] }[] = [];
  for (const entry of snapshot.stack) {
    const last = groups[groups.length - 1];
    if (last && sameTrigger(last.entry, entry)) last.ids.push(entry.id);
    else groups.push({ entry, ids: [entry.id] });
  }
  const stack: StackView[] = groups.map(({ entry, ids }) => ({
    ...(ids.length > 1 ? { count: ids.length } : {}),
    id: entry.id,
    name: entry.name,
    art: entry.art,
    crop: entry.crop ?? null,
    manaCost: entry.manaCost,
    kind: entry.kind,
    by: snapshot.players.find((p) => p.seat === entry.controller)?.name ?? null,
    source: entry.source && onBoard.has(entry.source) ? entry.source : null,
    targets: entry.targets,
    // Spec 0045 — what it does, for the label when pointed at.
    ...(entry.kind !== "spell" ? { does: stackWords(entry.description, entry.name) } : {}),
    // Spec 0028 — whose it is, and the card it is (a permanent spell
    // flies onto the table from its place in the stack).
    ...(entry.controller ? { seat: entry.controller } : {}),
    card: entry.kind === "spell" ? (entry.source ?? null) : null,
  }));

  const arrivals = new Map<string, AnchorId>();
  const departures = new Map<string, AnchorId>();
  // Phase 10 A-00 -- where each card came from and went, as the game moved
  // it. The comparisons below stay only for an older worker, or a move the
  // game did not report: they guessed, and a card put into a library was
  // drawn going to exile.
  const anchorOf = (place: { zone: string; seat: number | null }): AnchorId | null => {
    if (place.zone === "stack") return "stack";
    if (place.seat === null) return null;
    return ["hand", "library", "graveyard", "exile"].includes(place.zone)
      ? (`${side(place.seat)}:${place.zone}` as AnchorId)
      : null;
  };
  const cameFrom = new Map<string, AnchorId>();
  const wentTo = new Map<string, AnchorId>();
  const moves = withLeavers(snapshot, previous);
  for (const move of moves) {
    if (!move.card) continue;
    if (move.to.zone === "battlefield" && !cameFrom.has(move.card)) {
      const from = anchorOf(move.from);
      if (from) cameFrom.set(move.card, from);
    }
    if (move.from.zone === "battlefield") {
      const to = anchorOf(move.to);
      if (to) wentTo.set(move.card, to);
    }
  }
  // Phase 10 A-10 -- what merged into what, as the game says (a meld
  // partner exiled `into` the melded card, a mutating spell `into` its
  // creature): never guessed from a rename and a card gone to exile.
  const merges = new Map<string, Merge>();
  for (const move of moves) {
    if (!move.card || !move.into || !onBoard.has(move.into)) continue;
    const kind = move.to.zone === "merged" ? "mutate" : "meld";
    const merge = merges.get(move.into) ?? { kind, partners: [] };
    if (!merge.partners.includes(move.card)) merge.partners.push(move.card);
    merges.set(move.into, merge);
  }
  // Phase 10 A-14 -- back to a hand, onto or into a library, as the game
  // says: whose, where in the library (top, bottom, shuffled in), and
  // whether this viewer can see it there. Only from the table or the stack,
  // whose cards the board draws; a named card only (the record names a card
  // the viewer saw at one end).
  const returns = new Map<string, Return>();
  const seenInHands = new Set([...snapshot.hand, ...snapshot.otherHands].map((c) => c.id));
  for (const move of moves) {
    if (!move.card || move.to.seat === null) continue;
    if (move.from.zone !== "battlefield" && move.from.zone !== "stack") continue;
    if (move.to.zone !== "hand" && move.to.zone !== "library") continue;
    returns.set(move.card, {
      zone: move.to.zone,
      side: side(move.to.seat),
      where: move.to.zone === "library" ? (move.where ?? null) : null,
      hidden: move.to.zone === "library" || !seenInHands.has(move.card),
    });
  }
  // Spec 0061, item 4 -- why a card went to a graveyard, as the game says.
  const graves = new Map<string, string>();
  for (const move of moves) {
    // Spec 0074, Amendment 1 (owner 2026-11-12): no word pill for a discard
    // or a counter -- the report window explains what the other player did.
    // Spec 0075: nor for a card cycled ("Cycled").
    if (move.why === "discarded" || move.why === "countered" || move.why === "cycled") continue;
    if (move.card && move.said && move.to.zone === "graveyard") graves.set(move.card, move.said);
  }
  // Spec 0074 -- discards, mills, out of a graveyard or exile; spells countered.
  const tileMoves = tileMovesOf(snapshot, previous, moves);
  const countered = new Set(
    moves.flatMap((m) =>
      m.card && m.why === "countered" && m.from.zone === "stack" ? [m.card] : [],
    ),
  );
  if (previous && previous.gameEpoch === snapshot.gameEpoch) {
    const wasOnBoard = new Set(previous.battlefield.map((c) => c.id));
    const wasInHand = new Set([...previous.hand, ...previous.otherHands].map((c) => c.id));
    const wasInGraveyard = new Set(previous.graveyard.map((c) => c.id));
    const wasInExile = new Set(previous.exile.map((c) => c.id));
    for (const card of snapshot.battlefield) {
      if (wasOnBoard.has(card.id)) continue;
      const from = cameFrom.get(card.id);
      if (from) {
        // From the stack is the board's own default (it flies from its
        // place there).
        if (from !== "stack") arrivals.set(card.id, from);
        continue;
      }
      // A land played comes from the hand; reanimation from the
      // graveyard; anything else through the stack (the default).
      if (wasInHand.has(card.id)) arrivals.set(card.id, `${side(card.seat)}:hand`);
      else if (wasInGraveyard.has(card.id)) arrivals.set(card.id, `${side(card.seat)}:graveyard`);
      else if (wasInExile.has(card.id)) arrivals.set(card.id, `${side(card.seat)}:exile`);
    }
    const inGraveyard = new Set(snapshot.graveyard.map((c) => c.id));
    const inExile = new Set(snapshot.exile.map((c) => c.id));
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
      const to = wentTo.get(card.id);
      if (to) {
        departures.set(card.id, to);
        continue;
      }
      if (inGraveyard.has(card.id)) continue; // the default
      if (inExile.has(card.id)) {
        departures.set(card.id, `${side(card.seat)}:exile`);
        continue;
      }
      // Into a hand the board cannot see (bounced to the opponent): the
      // hand count grew. Otherwise exile (face-down, or a new id) is
      // the likeliest place.
      departures.set(
        card.id,
        handGrew.get(card.seat) ? `${side(card.seat)}:hand` : `${side(card.seat)}:exile`,
      );
    }
  }

  return {
    battlefield: snapshot.battlefield.map(toBoardCard),
    hand: snapshot.hand.map(toHandCard),
    opponentHand: opponentHandOf(snapshot),
    combat: snapshot.combat,
    stack,
    damage: snapshot.damage,
    life: snapshot.life ?? null,
    sizes: sizesOf(snapshot, previous),
    arrivals,
    departures,
    merges,
    returns,
    graves,
    tileMoves,
    countered,
  };
}

/**
 * Spec 0078 -- what changed in each permanent's size and counters between
 * the board drawn and this one (sizeTicks.ts), and the last size of each
 * creature that left the battlefield, as its move says. Public facts only:
 * the battlefield, which every seat sees, and the moves this seat is told.
 */
function sizesOf(snapshot: Snapshot, previous: Snapshot | null): SizeChanges | null {
  const last = new Map<string, { power: number; toughness: number }>();
  for (const move of snapshot.moves ?? [])
    if (move.card && move.from.zone === "battlefield" && move.last) last.set(move.card, move.last);
  if (!previous || previous.gameEpoch !== snapshot.gameEpoch) return null;
  const fresh = snapshot.damage && snapshot.damage.key !== previous.damage?.key;
  const struck = new Set(
    fresh
      ? snapshot.damage!.hits.flatMap((h) => ("object" in h.target ? [h.target.object] : []))
      : [],
  );
  const changes = sizeChanges(previous.battlefield, snapshot.battlefield, {
    wornOff: previous.turn !== snapshot.turn || snapshot.phase === "CLEANUP",
    struck,
  });
  if (changes.length === 0 && last.size === 0) return null;
  return { key: `${snapshot.gameEpoch}:${snapshot.stateRevision}`, changes, last };
}
