# 0030 — The turn's steps as a ladder between the plates

**Status:** Built in 1.16.0
**Owner decisions:** 2026-10-28 — option A, the Ladder, from the canvas
(https://claude.ai/artifact/8Bgc6Q6e4HvcWDfBfH59pq); the top of the
board is left to the cards.

## What the player sees

The bar of steps across the top of the board is gone. In the right-hand
column, in the space between the opponent's plate and the act button, the
turn reads top to bottom: "Turn 3" and whose turn it is ("Your turn" in
gold, or "Pat's turn"), then the eight steps — Untap, Upkeep, Draw,
Main 1, Combat, Main 2, End, Cleanup — one per row. The step the game is
in is a gold row; the steps already passed are dimmed; the ones to come
are plain. In combat the gold row also says which part: Attackers,
Blockers or Damage. The highlight still walks through the steps nobody
stopped at, a beat on each, as the bar did. Day or Night, and "Game 2"
after a restart, sit on the "Turn" line.

## Scope

In: the ladder in the column; removing the top bar; the one-line
question and notices that sat under the bar move up to where it was.

Out: the board's layout (the cards were already drawn under the bar);
stops (the gear menu keeps them).

## Rules and boundaries

- The step shown is the snapshot's phase, as before; nothing new is read
  from the game.
- The ladder stays above the combat extras ("All attack" and the red
  "can't attack" note) so neither covers it.
- Sizes are in the column's 900-pixel units and scaled with it, like the
  plates.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0030-A | The ladder shows the turn, whose turn, and the current step; the top bar is gone | browser (existing match tests read the step) |
| F-0030-B | It sits between the opponent's plate and the act button without touching either, at computer and laptop sizes | browser (measured) + screenshots |
| F-0030-C | In combat the row names the part of combat | unit |
| F-0030-D | It looks right in real games | owner |

## Decisions for the owner

All taken 2026-10-28 (see the top).

## Amendments

None. Note (2026-10-28, as built): the red "can't attack" note shows just
left of the column, on the board's edge, so it never covers the ladder.
