# 0043 — Calmer trigger storms

**Status:** Built in 1.24.0 (approved 2026-10-31)
**Owner decisions:** 2026-10-31, from the canvas
https://claude.ai/artifact/4XkzvF18C4GEFPer27zzuN — all four
recommendations: 1A, 2A, 3A, 4A.

## What the player sees

The Duel Decks Goblins mirror: several Boggart Shenanigans and Skirk Drill
Sergeants on both sides, a Mudbutton Torchrunner, and many Goblins dying at
once.

1. **"You may pay" triggers ask first.** Each Skirk Drill Sergeant trigger
   asks "Pay {2}{R}?" (the cost as mana symbols) with **Pay**, **Skip** and
   **Skip all N** for the rest of that card's triggers in the storm. Pay
   then asks what to tap, as today. **When the cost can't be paid, it isn't
   asked**: the trigger does nothing and the game log says so ("Skirk
   Drill Sergeant: not enough mana for {2}{R}"). Today it went straight to
   "Tap something for mana", once per trigger, with only Cancel to say no,
   even when nothing could pay (24 clicks in one storm).
2. **The stack groups identical triggers.** Triggers from one player that
   are the same card, the same effect and the same target are one place on
   the stack with "×9", whose they are shown by colour and the caster's
   picture, and what they do ("may pay {2}{R}", "1 to Pat"). Pointing at
   the group still shows each one.
3. **The order tray opens already numbered** — damage first, then the
   rest, payments last — and **Done works at once**. Clicking a tile starts
   the player's own order, as today.
4. **"Let it all resolve".** With the stack holding things and the player
   asked whether to respond, a second button beside the act button passes
   every time until the stack is empty — **unless something new is added
   to it**, when the player is asked again. Like MTG Arena's resolve-all.

## Measured (2026-10-30/31)

40 games against the worker (20 of the deck as listed, 20 of a "storm"
version with four each of the trigger cards and Pyroclasm) and 3 storm
games in the browser. Worst engine storm: 40 questions, 26 triggers. In the
browser, group 1's conveniences turned a 21-trigger storm into 12 clicks;
the worst burst was Drill Sergeant payments (24 clicks); one storm switched
the player to act 9 times.

## Scope

In: a trigger's own cost (Cost$ on a triggered ability: Skirk Drill
Sergeant and the like) asked as confirmPayment before it is paid, skipped
when Forge's mana check says it can't be paid; Pay / Skip / Skip all on
the page; the stack's grouping; the order tray's default order; the
resolve-all button.

Out (and why): "unless" costs paid by another player (a different
question, payCostToPreventEffect); remembering an order across storms
(option 3B, not chosen); deciding whether a player's instant-speed cards
are worth stopping for (option 4B, not chosen: the page does not judge the
rules).

## Rules and boundaries

Forge stays the rules engine. Not paying a "you may pay" cost is always
legal; skipping one that cannot be paid uses the same mana check that
marks cards unpayable today (§6.189's note). Resolve-all only passes
priority, which the player could do by hand; anything new on the stack
asks again. Hidden information: nothing new is shown.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0043-A | A Drill Sergeant trigger with mana: asked Pay/Skip first; Skip does nothing; Pay asks what to tap | Lab game + browser |
| F-0043-B | A Drill Sergeant trigger without enough mana is not asked and does nothing | Lab game |
| F-0043-C | Skip all N answers the rest of that card's payments in the storm | unit + browser |
| F-0043-D | Identical triggers show as one stack place "×N"; different ones stay apart | unit + screenshot |
| F-0043-E | The order tray's Done works at once with damage first; a click starts the player's own order | unit + browser |
| F-0043-F | Let it all resolve passes until the stack is empty, and asks again when something new is added | unit + browser |

## Decisions for the owner

All taken 2026-10-31 (above).

## Amendments

None.
