# 0031 — Belt mark, zone pictures, and the opponent's hand on the board

**Status:** Built in 1.16.0
**Owner decisions:** 2026-10-28 — from the canvas
(https://claude.ai/artifact/HqWgE8zUfntQmGjTRoSSXc): belt B3 "Filled",
zone tiles Z3 "Behind the count"; then, the same day, the opponent's hand
drawn at the top of the board, H1 "Mirror of your hand", and Library across
the top of both plates with Graveyard and Exile under it.

## What the player sees

The small Champion's Belt beside the holder's name — in the Players list,
rooms, chat and the game — is the owner's own belt drawing: its gold
outline, thickened so it reads at that size, with its plates filled in a
darker gold. The big belt on the Hall of Champions page is unchanged.

In the game's player plates, Library runs across the top and Graveyard
and Exile sit side by side under it, on both plates. Each tile shows the
owner's picture — the card backs, the tombstone, the portal — faded
behind the right of the tile, with the count large on the left and the
word under it. Pointing at a tile you can open brightens its picture.

Pat's hand is no longer a tile: it is drawn at the top of the board as
card backs fanned down from the top edge, the mirror of your own hand at
the bottom, in the space above Pat's first row of cards. A card Pat's
hand shows you (a reveal, Mindslaver) is face up there, edged gold, and
clicking the hand then opens what you may see of it, as the Hand tile
did.

## Scope

In: the belt mark (one picture, everywhere the mark shows); the three
zone pictures and the tile layout; the opponent's hand on the board.

Out: the Hall page's belt; the tiles' sizes; the zone viewer.

## Rules and boundaries

- The pictures are decoration: each tile's words for screen readers and
  its title are unchanged.
- Hidden information: a hidden card is a back; only cards the snapshot
  already shows this viewer (`otherHands`) are drawn face up. The hand's
  count is the snapshot's `handCount`.
- Tile sizes stay as spec 0029 set them; the points cards fly to and from
  (motion.ts) follow the new tile order, and the opponent's hand point is
  the fan's middle.
- layout() places the opponent's hand, as it places everything: the
  viewer's fan mirrored top to bottom, clear of the opponent's back row.
- The hand's count stays on the plate for screen readers.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0031-A | The belt mark is the new picture wherever it shows, and reads at its size | browser screenshots (lobby, game) |
| F-0031-B | Each tile shows its picture behind the count; counts and words stay readable, two digits included | browser screenshots at laptop and computer sizes |
| F-0031-C | Graveyard, exile and the opponent's hand still open (the hand from the board) | browser (existing match tests; Mindslaver) |
| F-0031-E | The opponent's hand mirrors yours from the top edge and never covers their cards | unit (layout) + screenshots |
| F-0031-D | It looks right in real games | owner |

## Decisions for the owner

All taken 2026-10-28 (see the top).

## Amendments

None.
