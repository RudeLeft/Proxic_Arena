# Phase 10 Exit Gate

**Status: PASSED — Phase 10 is COMPLETE.** The owner accepted it on
2026-11-19 ("accept", P10-O), after playing 1.73.0. Every item is
decided and built, and the jump check passes on every Mechanics Lab
game; shipped as version 1.73.0. This document is history from here on.

Phase 10 (`PHASE_10_ANIMATION_LOCKED.md`, locked 2026-11-06): animation
polish and graphical improvements under one rule, P10-R1 -- **nothing on
the battlefield jumps**. Whatever a player can see on the table that
changes place, side or form gets there by a movement you can follow; one
animation at a time, each with an animated canvas the owner approved
before it was built.

```text
23 items (A-00 to A-22)          every one decided and built; none dropped
                                 (A-03, drawing, accepted as it was, 2026-11-13)
18 amendments, 2 notes           each a decision or an as-built record, with its evidence
23 feature specs                 0072-0074, 0077-0091, 0099-0103: the later items, the
                                 three deep dives (A-22) and the jump check's last gaps;
                                 every one Done
28 releases                      1.46.0 to 1.73.0
384 Lab traces, both seats       jump check at the 1.73.0 release: no jumps; the only
                                 flags are the checker's known blind spots (below)
CI run 44501267637               green on main at 5ee8072 (tag v1.73.0)
```

---

## The items

| # | Animation | Decided and built | Release |
|---|---|---|---|
| A-00 | One motion language (A · Glide, all together, a click hurries) and the game's move record | Amendments 3, 4 | 1.46.0 |
| A-01 | The jump audit; kept as the jump check (`frontend/tools/jumps/jumps.spec.ts`, `scripts/check-jumps.py`) | Amendment 1; the check built in Amendment 4 | 1.46.0 |
| A-02 | Hand to battlefield | smooth already (Amendment 1); joining a ×N pile: spec 0073 | 1.58.0 |
| A-03 | Drawing | smooth already (Amendment 1); accepted as it is by the owner 2026-11-13 (spec 0081); the opening hand dealt from the library: spec 0089 | 1.70.0 |
| A-04, A-05 | Destroyed / died (Shatter); exiled (Banished) | Amendments 5, 6; one card of a pile: spec 0073 | 1.46.0, 1.58.0 |
| A-06 | Sacrificed, discarded, milled, a spell countered | sacrifice: Amendments 5, 6; the rest: spec 0074 | 1.46.0, 1.59.0 |
| A-07 | Board wipes (a pale flash first, then all together) | Amendments 5, 6 | 1.46.0 |
| A-08 | Changing sides (Pulled across) | Amendments 7, 8 | 1.46.0 |
| A-09 | Transform, day/night, turning face up (Lift, flip, settle) | Amendments 11, 12; the day/night wash: spec 0083 | 1.46.0, 1.68.0 |
| A-10 | Merge: meld, mutate (Fusion burst) | Amendments 13, 14 | 1.47.0 |
| A-11, A-12, A-13 | Attacking, blocking, combat damage (one fight at a time, Claw slash) | Amendments 15, 16; the note on spec 0059; printed combat abilities: spec 0101 | 1.48.0, 1.49.0, 1.73.0 |
| A-14 | Back to a hand, onto or into a library, shuffled in (Lift and glide) | Amendments 17, 18; out of a graveyard or exile: spec 0074; shuffles riffle: spec 0084 | 1.49.0, 1.59.0, 1.68.0 |
| A-15 | Tokens and copies made | specs 0073 (tokens), 0079 (copies), 0082 (copies versus cast copies) | 1.58.0, 1.64.0, 1.67.0 |
| A-16 | Flicker, phasing | spec 0080 | 1.65.0 |
| A-17 | Attaching and falling off (Chained on, side tabs, fanning past 4) | Amendments 9, 10 | 1.46.0 |
| A-18 | Counters and power/toughness changing | spec 0078 | 1.63.0 |
| A-19 | Life, poison and damage to players | spec 0077 | 1.62.0 |
| A-20 | Survived: regenerated, indestructible, prevented | specs 0080, 0101 | 1.65.0, 1.73.0 |
| A-21 | The stack: cast, copied, countered, fizzled | specs 0072 (their spells rise from the hand), 0079, 0081, 0082; the grey crumble: spec 0101 | 1.57.0 to 1.67.0, 1.73.0 |
| A-22 | Graphical improvements | deep dive 1: specs 0083-0087; deep dive 2: 0088-0091; deep dive 3: 0100-0103 | 1.68.0 to 1.70.0, 1.73.0 |

**The feature specs built under Phase 10**, each with its own canvas,
approval, As built and evidence:

| Spec | What | Release |
|---|---|---|
| 0072 | The other player's spells rise from his hand (A-21) | 1.57.0 |
| 0073 | Cards and tokens join and leave a ×N pile (A-02, A-15, A-04/A-05 piles) | 1.58.0 |
| 0074 | Discards, mills, countered spells, cards leaving a graveyard or exile (A-06, A-14 piles) | 1.59.0 |
| 0077 | Damage, life and poison on a player's life shield (A-19) | 1.62.0 |
| 0078 | Creatures getting bigger or smaller (A-18) | 1.63.0 |
| 0079 | Creature copies, copied spells, fizzles (A-15, A-21) | 1.64.0 |
| 0080 | Flicker, phasing, regeneration, indestructible, prevented damage (A-16, A-20) | 1.65.0 |
| 0081 | Free spells rise from the hand; cards exiled from a hand or library (the jump check's gaps) | 1.66.0 |
| 0082 | Copies versus cast copies; prepared spells (A-15, A-21) | 1.67.0 |
| 0083 | Polish: hits, day/night, Room doors, split second; three jump-check leftovers (A-22) | 1.68.0 |
| 0084 | Spent not killed, shuffles, vehicles and lands come alive, fights (A-22) | 1.68.0 |
| 0085 | Protection marks and held cards (A-22) | 1.69.0 |
| 0086 | Player counts, crown, turns, mana (A-22) | 1.69.0 |
| 0087 | Cards playable from graveyard or exile; suspend (A-22) | 1.70.0 |
| 0088 | Triggers rise from their card; report windows; library top; sight corners (A-22, deep dive 2) | 1.70.0 |
| 0089 | Game end, opening hand, extra combat, umbra, token waves, stack names (A-22, deep dive 2) | 1.70.0 |
| 0090 | Speed checks for the animations (A-22, deep dive 2) | 1.70.0 |
| 0091 | The casting card steps aside for spent cards (A-22, the 0084 review) | 1.70.0 |
| 0099 | The last two jumps (the final jump check) | 1.72.0 |
| 0100 | Spells: what they chose and what they aim at (deep dive 3) | 1.73.0 |
| 0101 | Survive, didn't happen, printed combat abilities (deep dive 3) | 1.73.0 |
| 0102 | Karn's restart, a turn played by the other player, a turn ended or skipped (deep dive 3) | 1.73.0 |
| 0103 | Reports and comfort (deep dive 3) | 1.73.0 |

The other specs released in the same weeks (0055-0071, 0075, 0076,
0092-0098) were the owner's features alongside the phase, not Phase 10
items; some of them change what Phase 10 built (below).

## The exit-gate conditions

The paper's "Exit gate": every item decided and built with its
recording; the jump check passing on every Lab game; the owner plays and
accepts (P10-O).

- **Every item decided and built.** The table above: 23 items, each
  decided on its canvas and built, in an amendment or a feature spec,
  with its recording; none dropped.
- **The jump check on every Lab game.** At the 1.73.0 release the jump
  check (`frontend/tools/jumps/jumps.spec.ts`, then
  `scripts/check-jumps.py`) ran over all 384 Lab traces, both seats: no
  jumps. The only flags were the checker's known blind spots, each
  checked by eye: a card flipping in place (A-09: same place, new face),
  an emblem's fade, and the boards of a restart shown behind its window
  (spec 0102: the window holds the table by design). Main's CI run
  44501267637 is green on 5ee8072, the commit tagged v1.73.0.
- **The owner's play-through.** The owner played 1.73.0 and accepted
  Phase 10 on 2026-11-19 ("accept").

## Not brought up to date in the locked paper

The locked paper is frozen as it stands (PHASE-002); these are known and
deliberately not fixed there:

- It has no amendments after 2026-11-07: later work lives in feature
  specs 0058-0103, which are the authority for what they changed.
- Amendment 16's note that the plate's life total still changes when the
  board arrives was done by spec 0077 (A-19).
- Amendment 18's return tag ("Back to your hand", "On top of Bob's
  library"...) was removed by spec 0075: those words now go in the
  report window.
- The note on spec 0059's attack badges: the badges were removed by
  spec 0063 (attack arrows ride the middle).

## Still to do

1. ~~Every item decided and built~~ -- done: the last, A-22's deep dive 3
   (specs 0100-0103), in 1.73.0.
2. ~~The full jump check at release~~ -- done 2026-11-19: 384 Lab traces,
   both seats, no jumps.
3. ~~A release (1.73.0)~~ -- released 2026-11-19 at `5ee8072`, CI run
   44501267637 green.
4. ~~**P10-O:** the owner plays and accepts~~ -- accepted 2026-11-19
   ("accept").
5. ~~Leftovers~~ -- carried to the owner's list.

On acceptance: this paper and `PHASE_10_ANIMATION_LOCKED.md` move to
`docs/history/phases/phase-10/` unedited, and Phase 10 is marked
complete in `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md` and `README.md`.
