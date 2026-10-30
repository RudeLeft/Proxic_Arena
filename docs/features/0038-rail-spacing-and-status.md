# 0038 — The rail evenly spaced, with a status tray for each player

**Status:** Approved 2026-10-29
**Owner decisions:** 2026-10-29 — from the canvas
(https://claude.ai/artifact/DPXDJm6hRV7aoCDnyiwMuJ): R1 "even spacing,
a tray held for each player"; the mana pool as M1 "a symbol and a
count", with the real mana symbols; counters as chips, held markers in
gold, the command zone in purple and opening a list, day or night in
the turn line (already there).

## Why

Measured from game.css, in the rail's 900-pixel units: 96 empty above
the opponent's plate, then gaps of 13, 18, 10 and 26 between the plate,
the turn steps, "All attack", the action button and your plate, and 45
empty below. Counters, markers and floating mana were a line of small
text inside each plate, which grew the plate: the opponent's ran over
the turn steps, and yours ran off the bottom of the screen with
something in the command zone too.

## What the player sees

Everything keeps its look and size; only the spacing changes. In the
rail's units, top to bottom:

| Piece | Top | Height |
|---|---|---|
| The opponent's plate | 26 | 199 |
| The opponent's status tray | 233 | 34 |
| The turn steps | 288 | 198 |
| "All attack" (combat only) | 506 | 38 |
| The action button | 554 | 58 |
| Your status tray | 633 | 34 |
| Your plate | 675 | 199 |

Plates never grow: Library, Graveyard and Exile, with their pictures,
are as before.

**The status tray** (empty: nothing shows, the space stays held):

- **Floating mana** first, as the real mana symbols each with its count
  — five Mountains and an Island read red ×5, blue ×1. Shown only while
  mana floats.
- **Counters** as chips with their number: poison, energy, experience,
  rad, tickets, speed...
- **Markers held**, in gold: Monarch, the initiative, the city's
  blessing, and how many times the Ring has tempted the player.
- **The command zone**, in purple — an emblem, the Ring, a dungeon:
  clicking it lists what is there.
- More than fits in one row: the rest behind a "+N" chip that lists
  everything.

Day or night stays in the turn line ("Turn 7 · Day").

## Scope

In: the rail's positions (game.css, and motion.ts's plate positions,
which cards fly to and from); the trays; removing the text line from
the plates.

Out: the plates' own look; the board; what Forge reports.

## Rules and boundaries

- Only what the snapshot already carries (§6.96: counters, designations,
  command zone, Ring temptations, the mana pool, public to both
  players). Nothing new from the worker.
- A screen reader still hears the full line for each player (the old
  wording, kept in the tray).

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0038-A | The tray shows mana as symbols with counts, counters, gold markers, the purple command zone and "+N" | unit |
| F-0038-B | A card flies to and from the moved plates' tiles | unit (motion), browser |
| F-0038-C | Poison, energy, the monarch and the Ring read from the trays in real games | e2e (match-state, match-ring) |
| F-0038-D | The rail at 1280x720, 1366x768 and 1920x1080, quiet and busy, nothing overlapping | browser screenshots |
| F-0038-E | It looks right | owner |

## Decisions for the owner

All taken 2026-10-29 (see the top).

## Amendments

None.
