# 0066 — Arrows that arrive with their card and arc softly; crossed swords; no "Died"

**Status:** Approved 2026-11-08 (owner, on the canvas "arrows-1108", sent as a file; items 5 and 6 in chat)
**Owner decisions:** spell and ability arrows A · Soft arc; attack arrows A · Soft arc; blocks 2 · Crossed swords; remove the "Died", "Destroyed" and "Sacrificed" pills and their message; the payment box fixed as proposed

The owner's list of 2026-11-08 after 1.52/1.53.

## Why (researched)

1. A target arrow drew on the first board with the spell on the stack, while the card was still flying there (your own: hidden during its cast flight; Bob's: turning over and held in the middle ~1.6 s) or popping in (a trigger) -- an arrow from nothing.
2. The front stack card's arrow left its left edge at the table's middle height, a card further back dropped ~250 px past its number and face badges, and an arrow at a player left the bottom edge straight through "Next: ..."; lines were layered above the words.
3. The middle gap is ~13 px at 1920x1080, so spec 0063's "ride the middle" made two tight knuckles and a ruler-straight run.
4. The "gold" arrow to blockers was the attack arrow (orange with a pale core): a short dash along the gap with a hook onto the attacker; two blockers made a "T".
5. "Still to pay": the stack is drawn at 1.5x while a question is asked and 3x otherwise; after the payment question ended the box was held a moment (the last mana ball), the stack went to 3x and the box doubled -- alone in an empty stack slot if its card had left.
6. Spec 0061's graveyard tags put "Died", "Destroyed" or "Sacrificed" on a dying creature and a "Died: Grizzly Bears (Bob's)" message; the shatter (Phase 10 A-04) already shows it.

## Built

1. A target arrow (and the source line) waits until its stack card has landed -- after your cast flight, after Bob's card turns over, flies and lands, after a trigger rises from its card -- then draws from the card.
2. Every arrow from a stack card starts at a small gold stud on the card's left edge, at the picture, and is drawn under the stack's words and badges (never through "Next: ..." or the numbers); an arrow at a player leaves from the same stud.
3. A · Soft arc for spell, ability and attack arrows: one smooth curve that rises off the table and comes down onto its target, with a soft shadow on the felt; every arrow bends the same way, higher the further it travels; no strip-riding, no corners (replaces spec 0063's ride-the-middle curve). Pointing, piles, blocked attackers and the R2 rest look from 0063 stay.
4. Blocks: no arrow between an attacker and its blockers; a crossed-swords mark sits between each fighting pair (one per blocker), in the canvas's look.
5. "Still to pay" never grows: the stack keeps its asking size while the box is held, and the box is not drawn alone once its card has left (it goes with its card).
6. No "Died", "Destroyed" or "Sacrificed" pill and no matching message; the move keeps its why for the shatter. "Cycled", "Discarded: too many cards", "Countered by ..." stay.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0066-A | No target line before its stack card has landed (own cast, opponent's cast, trigger) | page test; slow-motion clip |
| F-0066-B | Lines start at the stud, under the words; never cross the caption or badges | geometry test; screenshot |
| F-0066-C | Soft arcs: one bend direction, no corners, no card faces crossed in standard layouts | geometry test; screenshot |
| F-0066-D | Crossed swords between fighting pairs; no attack arrow to blockers | page test; screenshot |
| F-0066-E | "Still to pay" keeps its size until it goes | page test; clip |
| F-0066-F | No Died/Destroyed/Sacrificed pill or message; why kept | worker test; Lab check-moves |

## Amendments
