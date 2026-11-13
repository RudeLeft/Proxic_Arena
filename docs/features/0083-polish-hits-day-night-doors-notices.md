# 0083 — Polish: one hit look, day and night, Room doors, poison removed, the last grey notices, split second, jump leftovers

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "gaps-polish-1113", https://claude.ai/artifact/9K9rkfjBBsawfVTpu3esgy)
**Owner decisions:** 13 **B** · 14 **C** · 15 **A** · 16 **A** · 17 **drop the first notice, report window for the second** · 18 **B** · leftovers **fix all three** (L3 only after a live check confirms it).

Phase 10 A-22 (graphical improvements), from the deep dive "Phase 10 graphical gaps.md" (2026-11-13), items 13-18 and the jump-check leftovers.

## Built

1. **One hit look (13 B).** A creature hitting something slashes it (A-13's claw slashes, unchanged). A spell or ability hitting anything cracks it: on a creature, the life shield's 0077 crack, with the same red flash, shake and timing. Today's orange starburst (`Board.tsx` bf-burst) goes. The rising number is unchanged.
2. **Day and night (14 C).**
   - When day becomes night, a short, light blue dusk wash crosses the table; night to day is a gold dawn wash.
   - A sun/moon medallion by the turn bar turns over and stays, showing which it is.
   - Daybound cards keep their flip (A-09).
3. **Room doors (15 A).**
   - A locked door's half wears a gold-rimmed keyhole square (0076's "something it is").
   - On unlocking, the square goes, that half's door swings open on its hinge and light spills out. The other half does not move, and the whole-card flip is not used.
4. **Poison removed (16 A).** The same dark pill as poison gained, now "−N", rises off the poison badge. The notches go dark, and at zero the badge shrinks away. Closes 0077's note.
5. **The last grey notices (17).**
   - Drop "X ×N: they do the same thing here, so the order doesn't matter. You weren't asked." (`MatchController.java` ~1753). The cards' own movement shows what happened; their sources pulse gold.
   - Move "Looking at …" (`MatchController.java` ~5893, the opening-hand reveal such as Chancellor of the Annex) into the standard report window (0071/0075): medallion, WHO · CARD, one sentence, card pictures.
   - No grey notice of card actions remains.
6. **Split second and can't be countered (18 B).**
   - A split-second spell wears a gold-rimmed stopwatch square on its stack card. While it is on the stack, a gold ring closes round the stack card and the other player's hand dims; both lift when it resolves.
   - A can't-be-countered spell (Abrupt Decay) wears a gold seal square only, since the other player may still answer.
7. **Leftovers.**
   - L1: mutating onto a creature that already mutated fades and merges like any mutate (no blink-out of the merge picture or the spell).
   - L2: a daybound creature's beginning-of-combat trigger (Storm-Charged Slasher) rises from the creature on its controller's screen too.
   - L3: your own cast from the graveyard or exile (Uro's escape, an adventure, aftermath) rises from the pile you clicked. Check live first; build only if it is real, and record what was found.
8. A click hurries everything (A-00). Reduce motion: no movement; marks, medallion and numbers still show. No new words on the table.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0083-A | Lightning Bolt on a creature and on a player: the crack, no starburst; combat still slashes | page test; jump check; clip |
| F-0083-B | Day → night → day: wash and medallion, both seats | page test; Lab; clip |
| F-0083-C | Unlocking a Room's second door: only that half opens | page test; Lab; clip |
| F-0083-D | Leeches: rising −N, badge shrinks at zero | page test; Lab; clip |
| F-0083-E | Leylines: no grey notice; opening-hand reveal: report window to the other player | worker test; page test; Lab; clip |
| F-0083-F | Sudden Shock: stopwatch, ring, other hand dims, lifts; Abrupt Decay: seal only | worker test (the flags); page test; Lab; clip |
| F-0083-G | L1, L2 gone from the jump check; L3 live-checked and fixed or recorded | jump check; clip |

## Amendments
