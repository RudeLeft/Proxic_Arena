# 0037 — Big combats: blocked pairs ride together, and block many at once

**Status:** Built in 1.19.0
**Owner decisions:** 2026-10-29 — from the canvas
(https://claude.ai/artifact/6j3VMyzcqUuWWYGHdYd6s3): P1 "a blocker rides
on its attacker", identical pairs stack; fire lines stay one per
attacking card or stack (L not taken); B "block many at once" with the
how-many chooser.

## Why

The owner's screenshot (2026-10-29): a Goblin swarm, 91 attackers
against 46 creatures, became a wall of single cards and crossing lines,
and blocking it was "a pain". Measured with layout() on that board:

| | Their cards | Your cards | Lines |
|---|---|---|---|
| Before blocks | 11 | 8 | 7 |
| Today, after 30 blocks | 41 | 38 | 67 |
| With 0036 stacking | 43 | 38 | 70 |
| Blocked pairs as one unit (this spec) | 15 | 8 | 10 |

Stacking already tidies the board before blocks. Each block pulls a
blocker and an attacker out of their stacks and draws two lines (a blue
block line, and the attacker's orange line, which it keeps though it is
blocked). Thirty blocks are also sixty clicks: Forge asks "block with
which?", then "block what?", once per blocker.

## What the player sees

**A blocker rides on its attacker (P1, Amendment 1).** Once a creature
blocks, it is drawn sitting on the attacker it blocks, in the
attacker's row: a little toward the board's middle and to the right,
over the attacker, with a blue edge and "BLOCKING" — no blue line. The
attacker's name still shows above it. Two blockers on one attacker both
sit on it, fanned. A blocked attacker has no fire line; only unblocked
attackers do (one per card or stack, as today).

**Identical pairs stack.** Pairs whose attackers are identical and whose
blockers are identical (0036's rule, applied to both) stack as one pair
with "×N pairs", at most 15. A click on a pair stack acts on one pair.

**Block many at once (B).** In the declare-blockers question:

1. Click a stack of your creatures that can block: it glows as one
   choice, and the button reads "Block with 20 · click what to block".
2. Click a stack of their attackers. A small chooser asks "Block how
   many of these 60?", starting at the most possible (the smaller of
   the two stacks), with − and +.
3. "Block 20": one of your creatures on each of 20 attackers.

Clicking a single card still blocks one at a time, as today. Undoing:
click a pair to take that block back (Forge's "stop blocking"), as now.

## Scope

In: drawing blocks (layout and lines); pair stacking; the block-many
chooser.

Out: attacking (already "All attack" and one per click); damage
assignment order; fire lines (unchanged, owner 2026-10-29); anything
outside combat.

## Rules and boundaries

- Who blocks what stays the player's and Forge's (§6.94). Block-many is
  only a way to give many answers at once, and needs no worker change:
  the page answers Forge's own two questions ("block with which?",
  "block what?") once per pair, each offered and checked by Forge as
  today (`CombatUtil.canBlock`). It stops at the first pair Forge does
  not offer, or the first answer refused; the blocks made so far stand
  and show. Nothing is chosen that the player did not ask for: N of
  your creatures, each on one of N attackers, all identical.
- Which member of a stack blocks, or is blocked, does not matter: 0036
  stacks only cards identical in every way the game shows.
- A creature that can block several attackers (or must block) still
  goes through Forge's own questions; block-many offers only one
  blocker per attacker.
- Hidden information: unchanged; only public combat facts are drawn.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0037-A | The owner's swarm board: after 30 blocks, at most 16 drawn cards a side and no block lines | unit (layout, the measured scene) |
| F-0037-B | A blocker is drawn on its attacker; two blockers on one attacker both are | unit (layout) |
| F-0037-C | Identical pairs stack ×N (≤15); a different blocker or attacker splits | unit (layout) |
| F-0037-D | A blocked attacker has no fire line; unblocked ones keep theirs | unit (Board) |
| F-0037-E | Block-many answers Forge's own questions, one pair at a time; it stops when Forge does not offer the next pair | e2e (the same game as F) |
| F-0037-F | Two clicks and the chooser block a stack with a stack in a real game (the swarm deck) | e2e `match-big-combat.spec.ts` |
| F-0037-G | The swarm in a real game, at laptop and computer sizes | browser screenshots |
| F-0037-H | It looks and plays right | owner |

## Decisions for the owner

All taken 2026-10-29 (see the top).

## Amendments

**Amendment 1 (owner, 2026-10-29, during the build).** The canvas drew
the blocker tucked UNDER its attacker, hanging toward the middle. On the
real board the two front rows touch in the middle, so a hanging blocker
covered the names of the defender's own front-row creatures. The
blocker now sits ON its attacker, shifted 14% of a card toward the
middle and to the right, drawn over the rows; every name stays readable.
Seen on the dev board's combat and in a real swarm game, approved from
the screenshots.
