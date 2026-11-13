# 0084 — Spent not killed, library shuffles, coming alive, fights

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "gaps-moves-1113", https://claude.ai/artifact/Q5L7y6jZse3fMRmmJjNGZn)
**Owner decisions:** 1 **A · fold and go** · 5 **A · the existing riffle** · 6 **B · power flows in** · 9 **A · the combat fight**.

Phase 10 A-22, from the deep dive "Phase 10 graphical gaps.md" (2026-11-13), items 1, 5, 6 and 9.

## Why

- Any table card going to a graveyard gets the "defeated" look (`Board.tsx` ~4705, 4717-4724, 4824-4829), whatever the move's `why`. Three at once set off the board-wipe flash (`WIPE_AT` = 3, `Board.tsx` ~4834, `motion.ts` ~449). The worker already sends "sacrificed" (`Moves.java` ~126-131). An ability whose card was sacrificed to pay for it fades in at the stack spot (Sinister Concoction, Agent of Kotis).
- The riffle plays only for a card shuffled *into* a library (`Board.tsx` ~3358-3386, Amendment 18); a library shuffled on its own shows nothing.
- A vehicle crewed or a land animated: P/T appears with no change shown, since the old P/T was null (`sizeTicks.ts` ~86-87, 129).
- Fight and bite spells: an older burst and number at the target only (`Board.tsx` ~2636-2660).

## Built

1. **Spent, not killed (A).**
   - A permanent sacrificed or used up as a cost or by its own ability dims, folds flat and slips to its owner's graveyard. This covers Treasure, Clue, Food, Blood, fetch lands, Evolving Wilds, a finished Saga and a sacrifice outlet's fodder paid as a cost.
   - A token vanishes at the graveyard, so the number stays; a card ticks the number.
   - A Treasure gives a small coin spark as its mana flies.
   - Never the defeated look, never the board-wipe flash. Several spent at once never count toward a wipe.
   - An ability whose source was sacrificed to pay for it lifts off the card as it goes, never fading in at the stack spot.
   - A creature destroyed or dying still gets the defeated look. Where the game's record cannot tell spent from killed, keep the defeated look and record the case.
2. **Library shuffles (A).**
   - Whenever a library is shuffled (fetch land, tutor, Rampant Growth), the existing six-back riffle plays on that player's library pile, for both seats.
   - On a pile at the top of the screen it fans downward so it stays on screen.
   - Shuffling a card in keeps today's look.
3. **Comes alive (B).**
   - When a vehicle is crewed or a land or other permanent becomes a creature, gold motes run from what made it alive into the card: the crewing creatures, which tap, or the permanent's own ability.
   - A gold ring breathes, it slides to the creature line, and its P/T rises in as a green number (0078).
   - At end of turn a grey ring closes in, a grey P/T rises off, and it slides back.
4. **Fights (A).**
   - Fight spells (Prey Upon) use the combat fight: dim, rear back, lunge to meet edge to edge, claw slashes, red numbers, knocked back, step back, then any loser breaks.
   - Bite spells (Ram Through) use the same with only the biter lunging and striking.
5. A click hurries everything (A-00). Reduce motion: no movement; numbers and counts still change.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0084-A | Three Treasures pay for a spell: coin sparks, fold and go, ×3 ticks down, no wipe flash, no defeated look; a creature killed in the same game still gets the defeated look | worker test if needed; page test; Lab; jump check; clip |
| F-0084-B | Evolving Wilds and a fetch land: fold and go, land comes out tapped, library riffles | page test; Lab; clip |
| F-0084-C | Sinister Concoction / Agent of Kotis: the ability lifts off the sacrificed card | page test; jump check; clip |
| F-0084-D | Rampant Growth and a tutor: riffle on the right library, both seats | page test; Lab; clip |
| F-0084-E | Smuggler's Copter crewed, Mutavault animated: motes from the cause, rising P/T, grey reverse at end of turn | page test; Lab; clip |
| F-0084-F | Prey Upon and Ram Through: combat fight look | page test; Lab; clip |

## Amendments
