# 0034 — The action button says more, and the turn's steps move smoothly

**Status:** Built in 1.18.0
**Owner decisions:** 2026-10-29 — from the canvas
(https://claude.ai/artifact/4DmFqMhu2sg7HT4HunQ6Ch): every proposed
word on the action button; button look B2 "Seal"; step look S1 "Gems on
a rail"; smoothing M2 "One sweep" with M4 "Turn hand-off"; the turn
line reads "Your turn" / "Opponent's turn".

## What the player sees

**The action button's words.** The button already says what pressing
it does; now it says more:

| When | Word · line under it |
|---|---|
| Your Main 1, a creature could attack | Next · To attacks |
| Your Main 1, nothing could attack | Next · Nothing can attack · to Main 2 (or End turn · Nothing can attack · over to Pat when Main 2 is not one of your stops) |
| Your combat | Next · To attacks / To damage / To Main 2, by the step |
| Your Main 2 or end step | End turn · Over to Pat (unchanged) |
| Their turn, nothing on the stack | Pass · Pat goes on to combat (their next step) |
| They attack | To blocks · 3 attackers · 7 power coming |
| Blocks are set | To damage · 4 power gets through |
| A spell or ability on the stack | Resolve · Pat's Lightning Bolt → you |
| Your own spell counting down | Resolves in 3 · Your Lightning Bolt · click to wait |
| Choosing attackers | Attack with 2 · 5 power · click creatures to change |
| Choosing blockers | Block with 1 · 3 power still gets through |
| Waiting | Pat is choosing attackers / blockers, Pat may respond to Lightning Bolt, or Waiting for Pat |
| The game is over | You won / Pat won · Pat's life reached 0 / Pat conceded / On turn 7 |
| Cancel | unchanged |

"Power", not "damage": lifelink, prevention and first strike can change
what is really dealt, and the button never guesses at those.

**The button's look (B2, Seal).** A dark rounded button with a gold
edge and a round coin emblem at its left, the words beside it. The coin
shows what pressing does: an arrow (next, pass), a double arrow (end
turn), an arrow down (resolve), a sword (attack, to damage), a shield
(blocks), an X (cancel), the seconds left in a filling ring (the
countdown). Combat is red, cancel is silver; waiting and game over are
the same shape, dimmed, with an hourglass or a flag.

**The turn's steps (S1, Gems on a rail).** A gem for each step on a
thin rail; passed gems filled, the step the game is in a bright glowing
gem with its name in the card-title font. Combat's part still shows
beside it. The line above reads "Turn 7 · Your turn" or "Turn 8 ·
Opponent's turn".

**Smoothing (M2 and M4).** The glowing gem slides to the new step in
one smooth sweep, under half a second however many steps were passed,
the passed gems filling as it goes. At a new turn it does not run off
the bottom: the list dims, the line above changes to whose turn it is,
and the gem starts again from the top and sweeps to the step.

## Scope

In: the act button's words and look, the waiting box, the game-over box,
the step list and its motion, the turn line.

Out: what any pass does (the same pass whatever the button says), the
stops themselves, "Skip to end of turn", the question box above the
board, Untap and Cleanup staying in the list (on hold, owner
2026-10-29).

## Rules and boundaries

- Words only from what the screen already shows: the step, the board,
  the stack and your own stop settings. Nothing hidden from you is
  used ("Pat is choosing blockers" comes from the step on screen, not
  from Pat's question).
- "Could attack" is a creature of yours, untapped, not summoning sick
  (or with haste), without defender. When it is wrong the game still
  asks or skips exactly as before; only the words were off.
- This replaces the walk through each passed step (owner 2026-10-22):
  the sweep still passes over every step, smoothly.
- Reduced motion (the system setting) turns the slide and fades off.
- The button keeps its place and size, and its screen-reader name
  still begins "Pass:" for a pass.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0034-A | Each row of the words table, from a board | unit (stops.test) |
| F-0034-B | The seal button, the gems and the turn line in real games, at laptop and computer sizes | browser screenshots |
| F-0034-C | The sweep and hand-off play in a real game | browser (frames over a turn change) |
| F-0034-D | The existing game tests still pass with the new words | browser (e2e) |
| F-0034-E | It reads and moves right in real games | owner |

## Decisions for the owner

All taken 2026-10-29 (see the top).

## Amendments

None.
