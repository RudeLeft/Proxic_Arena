# 0044 — The card being cast: out of the way, and revealed when committed

**Status:** Approved 2026-10-31
**Owner decisions:** 2026-10-31, from the canvas
https://claude.ai/artifact/9zAJGg3MBjLo59aG2KjsZ5 (report 4): option A
(dock beside the stack) and, for the opponent, a face-down card while it
is paid for, then R1 (flip) when committed. Amends spec 0042.

## What the player sees

- **The caster.** The card floats in the middle while it is paid for, as
  in 0042. As soon as a question about it needs the table — a target, a
  sacrifice, a card to discard — it glides to beside the stack at about
  1.5× a card's size, still readable, and the table is clear to click.
  The question's bubble sits beside it there.
- **The opponent.** While the spell is being paid for, a face-down card
  (the Proxic back) floats in the middle with "RudeLeft is casting a
  spell…". When it is committed (on the stack), the back **flips** round
  to the face with a flash, holds a moment, and flies to its place.
- **Optional costs** (Bargain, kicker) asked before the card leaves the
  hand show the card in the middle too, so every casting question has it.

## Found (2026-10-31)

The 0042 card ignores clicks itself but covers the creatures under it, and
the bubble beside it does take clicks. Optional-cost questions come while
the card is still in the hand, so no floating card showed for them.

## Rules and boundaries

Hiding the card from the opponent while it is paid for shows them less
than the rules allow (CR 601.2a makes it public from the first step); they
cannot respond until it is on the stack, so they lose nothing. The snapshot
keeps sending what each viewer may know; the page decides how to draw it.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0044-A | A target question moves the card beside the stack; the creatures under the middle can be clicked | browser |
| F-0044-B | The opponent sees a face-down card while it is paid for, and the face only once it is on the stack | browser + screenshots |
| F-0044-C | An optional-cost question shows the card being cast | browser |

## Built (2026-10-31)

- Docks for any question with something on the table to click other than
  the spell itself (a target, a sacrifice); paying brings it back to the
  middle (the lands are under the hand, not the middle).
- The opponent's card is "cast" unless the caster's hand grew by one
  (cancelled: it goes back still face down). A spell that resolved before
  the opponent's screen caught it on the stack still turns over, then
  fades where it is.
- Found while building: the board could not say where a stack object is
  drawn, so a spell going to the stack had nowhere to fly and simply
  vanished (since 0042). The board now answers with its stack spot.
- Evidence: `frontend/e2e/match-casting-dock.spec.ts` (F-0044-A, B, C;
  deck `protocol/fixtures/casting-deck`), unit tests in
  `CastingCard.test.ts`, screenshots from both seats shown to the owner.

## Amendments

None.
