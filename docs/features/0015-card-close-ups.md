# 0015 — Card close-ups without the paint-in

**Status:** Approved 2026-10-26 — built in 1.6.0
**Owner decisions:** "All three": a lighter close-up copy, no
half-painted card, and close-ups fetched ahead during a game; full
screen stays the browser's own (F11), nothing built for it (owner,
2026-10-26)

## The problem

Zooming into a card during a game drew it from the top down. The zoom
fetched the original scan, a picture of about 1.5 MB that arrives in
pieces, and the browser painted each piece as it came.

## What the player sees

1. **Never a half-painted card.** A zoom (the game's close-up and the
   Deck Depot's) shows the table's picture at once, and swaps in the
   sharp one in a single step when it has arrived whole.
2. **Usually sharp at once.** During a game the close-ups of the cards
   in your hand, on the battlefield, on the stack and in any hand you
   may see are fetched quietly in the background, two at a time, each
   once. In the Deck Depot the cards either side of the open one are
   fetched, so stepping with ← / → is sharp at once.
3. **Lighter pictures.** The close-up is the same picture at the same
   size as a JPEG, about seven times lighter (Fiery Temper: 1.5 MB to
   216 KB). A JPEG has no see-through corners, so they are filled with
   the card's own border colour; both zoom views round the corners.

## For whoever runs the server

- The close-up copy is made when a deck is imported
  (`art/zoom/xx/<sha>.jpg`, beside `art/original` and `art/display`).
- Pictures imported before this get their copy once, in the background,
  on the first start: nothing to do, and the server starts as before.
- If a close-up copy is missing, the original is served as before.

## Not changed

The table's pictures, the layout, and how the original scans are kept.

## Proof

- `ZoomCopyTest`: the copy is the same size, under half the bytes, with
  border-coloured corners and no half-written file; a close-up is served
  the copy, and the original when there is none.
- `closeUp.test.tsx`: the table copy until the close-up is whole; the
  table copy stays when it will not load; a fetched-ahead close-up is
  sharp from the first frame; each picture fetched once, two at a time.
