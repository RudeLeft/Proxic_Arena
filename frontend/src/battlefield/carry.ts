// Fixed while building spec 0102 (coordinator 2026-11-18, from 0101's CI run
// 44363909395): the other player's spell is held on the table HOLD_MS (owner
// 2026-10-22), and after it the page draws only the newest board. A board
// that arrived meanwhile and was never drawn took its one-time moments with
// it: Murder resolved on Wingshield Agent, the caster moved straight on to
// combat inside the hold, and the "a shield counter saved it" board was never
// drawn -- the defender's page played no silver shield.
//
// Departures were already carried across such a gap (fromSnapshot infers
// them from the board drawn before). The one-time moments a single board
// carries are now carried too, onto the board that IS drawn, for the cards
// still there: survivors (a shield counter, indestructible, a regeneration
// shield, an umbra), phase changes, flickers, and the round's damage wave and
// life changes when the board drawn has none of its own. Each skipped board
// is one this seat was sent (nothing new is shown, HID-001); only boards
// never drawn are carried, so nothing plays twice.

import type { Snapshot } from "../match";

/** The skipped boards' one-time moments, carried onto [board] (the same object when there are none). */
export function carryMoments(board: Snapshot, skipped: readonly Snapshot[]): Snapshot {
  const gap = skipped.filter(
    (s) =>
      s !== board &&
      s.seat === board.seat &&
      s.gameEpoch === board.gameEpoch &&
      s.stateRevision < board.stateRevision,
  );
  if (gap.length === 0) return board;
  const onBoard = new Set(board.battlefield.map((c) => c.id));
  const survivedNow = new Set((board.survived ?? []).map((s) => s.card));
  const survived = [
    ...gap.flatMap((s) =>
      (s.survived ?? []).filter((x) => onBoard.has(x.card) && !survivedNow.has(x.card)),
    ),
    ...(board.survived ?? []),
  ];
  const phasedNow = new Set((board.phased ?? []).map((p) => p.card));
  const phased = [
    ...gap.flatMap((s) =>
      (s.phased ?? []).filter((p) => onBoard.has(p.card) && !phasedNow.has(p.card)),
    ),
    ...(board.phased ?? []),
  ];
  const flickeredNow = new Set(
    (board.moves ?? []).flatMap((m) => (m.card && m.why === "flickered" ? [m.card] : [])),
  );
  const flickers = gap.flatMap((s) =>
    (s.moves ?? []).filter(
      (m) => m.card && m.why === "flickered" && onBoard.has(m.card) && !flickeredNow.has(m.card),
    ),
  );
  // P11-A1 -- and the skipped boards' other moves (a death, a discard, a card
  // exiled, returned or put into a library, a token gone): each card's last
  // one, where the board drawn does not contradict it and moves it no
  // further itself. The table's leave and the pile's stream then play from
  // them, and the pile number waits for the card to land, as for any move.
  const moved = movesCarried(board, gap);
  const damage = board.damage ?? [...gap].reverse().find((s) => s.damage)?.damage ?? null;
  const lives = gap.flatMap((s) => (s.life ? [s.life] : []));
  const life =
    board.life ??
    (lives.length > 0
      ? { key: lives[lives.length - 1]!.key, changes: lives.flatMap((l) => l.changes) }
      : null);
  const changed =
    survived.length !== (board.survived ?? []).length ||
    phased.length !== (board.phased ?? []).length ||
    flickers.length > 0 ||
    moved.length > 0 ||
    damage !== (board.damage ?? null) ||
    life !== (board.life ?? null);
  if (!changed) return board;
  return {
    ...board,
    survived,
    phased,
    moves: [...flickers, ...moved, ...(board.moves ?? [])],
    damage,
    life,
  };
}

/** Where [board] has a card now, by zone; null where this seat cannot see it (a library, a hidden hand). */
function zoneOf(board: Snapshot, card: string): string | null {
  const has = (cards: readonly { id: string }[]) => cards.some((c) => c.id === card);
  if (has(board.battlefield)) return "battlefield";
  if (has(board.hand) || has(board.otherHands)) return "hand";
  if (has(board.graveyard)) return "graveyard";
  if (has(board.exile)) return "exile";
  if (board.stack.some((e) => e.source === card) || has(board.casting)) return "stack";
  return null;
}

/**
 * P11-A1 -- the moves of boards never drawn ([gap], oldest first) that the
 * board drawn still needs: for a named card, its LAST move in the gap, unless
 * the drawn board moves it itself or has it somewhere else than that move
 * put it (it moved again in a round this seat was not told of). A card the
 * drawn board cannot see (a library, the other player's hand, a token gone)
 * keeps its move: the board drawn before is where the page pairs it, as it
 * pairs an unnamed card's (fromSnapshot's withLeavers), so unnamed moves
 * into a hand or a library are kept too. Flickers are carried above.
 * Only moves this seat was sent (HID-001); nothing is shown that the boards
 * did not say.
 */
function movesCarried(board: Snapshot, gap: readonly Snapshot[]): NonNullable<Snapshot["moves"]> {
  const all = gap.flatMap((s) => s.moves ?? []);
  if (all.length === 0) return [];
  const movedNow = new Set((board.moves ?? []).flatMap((m) => (m.card ? [m.card] : [])));
  const last = new Map<string, number>();
  all.forEach((m, i) => {
    if (m.card) last.set(m.card, i);
  });
  return all.filter((m, i) => {
    if (m.why === "flickered") return false;
    if (!m.card) return m.to.zone === "hand" || m.to.zone === "library";
    if (last.get(m.card) !== i || movedNow.has(m.card)) return false;
    const now = zoneOf(board, m.card);
    return now === null || now === m.to.zone;
  });
}
