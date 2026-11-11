# 0070 — Click-to-pay ribbons: every card you pick is marked at once

**Status:** Approved 2026-11-09 (owner, by prompt, on the canvas "tap-to-pay" in the Deck Builder chat, handed to this project's chat)
**Owner decisions:** every card-by-card cost marks the card the moment you pick it with a **Ribbon** (colour + word); cards picked to tap lean **5 degrees** (never turned sideways before the cost is paid); **clicking a picked card again un-picks it**; **the other player sees nothing** until the cost is paid.

## Why (researched)

Costs paid by picking cards one at a time (tapping creatures for Voice of the Woods, crew, convoke, untapping, sacrificing, exiling, returning to hand, putting into a library, revealing) are asked by the worker one card at a time (`MatchCostDecision` pickCards / pickOne / pickOrDone) and never send "picked so far"; Forge pays everything at the end. So nothing on the table shows what you've already picked, and a picked card can't be taken back.

## Built

1. Each pick question carries the cards picked so far; the page marks each with a Ribbon in the cost's colour and word: TAP, UNTAP, SACRIFICE, EXILE, TO HAND, TO LIBRARY, REVEAL, DISCARD (and the cost's own word where Forge names another).
2. A card picked to tap leans 5 degrees; it turns sideways only when the cost is actually paid.
3. Clicking a picked card un-picks it: the ribbon and lean go and the card can be picked again. (Worker change: the pick loop accepts an "un-pick".)
4. The other player sees no ribbons or leans; they see the result once paid.
5. Reduce motion: no lean animation; the ribbon still shows.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0070-A | Voice of the Woods: five Elves picked one by one each show TAP and lean; paid sideways at the end | Lab + browser; clip |
| F-0070-B | Un-pick: clicking a picked card removes the mark and frees it | worker test + browser |
| F-0070-C | Every card-by-card cost kind shows its word | worker test; page test |
| F-0070-D | The other player sees nothing until paid (no picked ids in their frames) | worker test; Lab hidden check |
| F-0070-E | Reduce motion | page test |

## Amendments
