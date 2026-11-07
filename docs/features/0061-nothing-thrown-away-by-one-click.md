# 0061 — Nothing thrown away by one click; say why a card left

**Status:** Approved 2026-11-07 (owner, on the canvas "cast-1107", sent as a file)
**Owner decisions:** all five; the end-of-turn discard way (a)

## Why (the owner's game record, 2026-11-07)

Forgotten Cave (a land with cycling): with the land drop used, cycling
was the card's only choice, and a click with exactly one choice answers
at once (frontend/src/battlefield/interaction.ts clickOn) -- spec 0057's
menu (play in gold, cycling red: "You won't have it as a land") never
opened; the card was cycled and a "Pay the mana" window titled
"Forgotten Cave ability" took {R}. Elvish Warrior: with one Forest and no
land in hand nothing could be paid for, so the whole turn was passed for
the player in about 0.1 s with no question (PriorityStops); at end of turn,
with 8 cards, each hand card was one click from the discard, and the new
Elvish Warrior was clicked and discarded. No rules bug in either.

## Built

1. A card whose only choice right now throws it away (cycling,
   landcycling, channel) never goes with one click: its menu opens, with
   the play shown greyed and why ("Play it as your land -- You've already
   played a land this turn"; the worker sends the reason per option).
2. A turn passed for you says so: "Nothing you can play this turn -- 1
   land, no land in hand. Passing your turn." and the turn's steps move
   visibly.
3. The end-of-turn discard is deliberate (way a): click a card to pick it,
   then "Discard Elvish Warrior".
4. Every card going to a graveyard says why, on its way there and in what
   the game tells the player: "Cycled", "Discarded: too many cards",
   "Countered by <card>", "Died" (the move record carries the reason).
5. The payment window for an ability says what it is for: "Pay {R} to
   cycle Forgotten Cave".

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0061-A | A cycling card with only cycling offered opens its menu, the play greyed with its reason | page test; Lab |
| F-0061-B | A turn passed for want of anything playable shows the notice | Lab; screenshot |
| F-0061-C | The hand-size discard needs pick + Discard | page test; e2e |
| F-0061-D | Moves to a graveyard carry and show why | Lab check-moves; screenshot |
| F-0061-E | The ability payment title names the ability | worker test; screenshot |

## Amendments
