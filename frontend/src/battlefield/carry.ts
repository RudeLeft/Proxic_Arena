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
    damage !== (board.damage ?? null) ||
    life !== (board.life ?? null);
  if (!changed) return board;
  return {
    ...board,
    survived,
    phased,
    moves: [...flickers, ...(board.moves ?? [])],
    damage,
    life,
  };
}
