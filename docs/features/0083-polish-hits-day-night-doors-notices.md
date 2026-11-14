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

### As built (2026-11-13)

Built as approved (13 B, 14 C, 15 A, 16 A, 17 split, 18 B, L1-L3 fixed); unreleased.

**Worker.**
- Stack entries carry `splitSecond` (Forge's own keyword check, the one `MagicStack#isSplitSecondOnStack` reads) and `cantBeCountered` (Forge's `Spell#isCounterableBy`, asked with no countering spell), for a spell the viewer may identify (`Polish.java`).
- A Room on the battlefield carries `locked`, its locked doors by name (`Card#getLockedRoomNames`).
- The "X ×N: they do the same thing here..." notice is gone. Identical replacement effects applied without a question record their permanents; every viewer is sent `pulse` {key, cards} (only cards face up on the battlefield).
- Chancellor of the Annex, checked first in a Lab game (`check-polish.py chancellor`, RUN): today Alice saw **nothing at all**, neither a notice nor a window. The reveal reached her report store before turn 1 began, and the turn's start cleared it before any board was sent. (The canvas expected a grey "Looking at" line; that line was only the fallback.) A reveal made before the game began now lasts through turn 1. An opening-hand reveal to the other player gets the report's who/card/sentence: `by` Bob, `source` the card, "Bob revealed Chancellor of the Annex from their opening hand".
- Protocol docs: `protocol/README.md`, `MATCH_PROTOCOL.md`.

**Page.**
- **13 B:** a spell's or ability's hit draws 0077's crack across the card's box (stretched), with its red flash (`hitflash`, 1.6 of the card), on 0077's clock (`LIFE_CRACK_MS`). It lands, with its number, when the resolving spell's spark reaches the card (`RESOLVE_MS`, as the shield's crack does); the first film showed it cracking while the Shock was still glowing on the stack, so this was changed. The card's number (0078) now changes at that same moment; it used to wait about a second, for the old number to finish rising. The rising number is the canvas's red "−N", off the card's right, on the board's clock like 0077's. The old gold number ran on a page timer, so in a slowed (quarter-speed) film it was removed before it showed: the coordinator's frame review found no "−N" in the quarter clip. With reduce motion the number shows still, as before. The card shakes (`shakeFrames`, `SHAKE_MS`, composite add). The old `bf-burst` and its CSS are removed. The crack keeps `data-impact`, so the browser suite's count still reads it. A player's hit is still the shield's own crack (0077), and combat still slashes.
- **14 C:** a change between day and night washes the board: blue dusk (with a little dark) or gold dawn, at 0.6 of A's strength, up 0.45 s, held 0.25 s, down 0.55 s (`WASH_MS` 1250). The first day a daybound card makes does not wash. The sun/moon medallion (`DayMedallion`) sits beside the turn ladder's first steps, top right. It turns edge-on at 0.25 s, swelling and glowing gold over 0.9 s, and stays on the new face. A click hurries it.
- **15 A:** a Room on the table is drawn as its two doors, each half with its own name bar (the canvas's). The first door is on top, and each half shows its half of the printed card. A locked half is a closed wooden door with the gold keyhole square. Unlocking it: the square shrinks (0.2 s), the door swings open on its left hinge (0.6 s from 0.15 s), light spills out (0.9 s), and the card glows gold a moment. The other half does not move. Board skips A-09's whole-card flip when a Room is renamed.
- **16 A:** when poison counters go down, the badge keeps showing. 0077's dark poison pill, now "−N", rises off it (1 s). The notches go dark one by one, highest first, 90 ms a point, as the badge swells to 1.15. At zero the badge shrinks away (from 0.67 s, over 0.3 s).
- **17:** the sources in a `pulse` glow gold once per key (0082's `glowFrames`, 0.7 s); a pile of them glows once. The opening-hand reveal is the standard report window. No grey notice of a card action remains from this list.
- **18 B:** a gold-rimmed stopwatch or seal square sits low left on the stack card (above a copy's mark) and pops in. A split-second spell also gets a gold ring that closes from 14 px out to 4 px in 0.3 s and breathes while the spell is there. The hand of the player who did not cast it dims (`data-split-second` on the board). The ring lifts in 0.25 s as the spell leaves the stack, and the hand brightens with it. Can't be countered gets the seal only.
- **L1** (cause, RUN, `shapes-mutate-two` and the finish-line `shapes-mutate`/`-under`: the same three findings on **every** merge, the first mutate too). At the slam, A-10's merging spell and the old face went from full strength to nothing in 1 ms. They now fade where they slammed, over 0.35 s from 0.05 s after the slam (`MERGE_FADE_AT`, `MERGE_FADE_MS`, the canvas's). The jump check now reads a `merge:` ghost as its own card's old face (it was taken for a new card popping in).
- **L2** (cause, RUN, `shapes-daybound`: 98 findings, both seats). The pop was not the trigger rising: it was identical triggers drawn as one "×N" card (0043). When the lead resolved, the next one became the lead, its React key changed, and a new card popped in at full strength. The stack keeps each entry's element across leads (`drawnOn`), so the card that is left is the same element, and the card names every trigger it stands for (`data-members`, as 0082's copies do). The checker also needs that: it followed the card by its lead's id alone.
- **L3** (checked LIVE first, as the spec asked: a real game on the local stack, two players, real clicks on the question's options, the casting card's first frames recorded). In the second game, 4 flashback casts from the graveyard (Faithless Looting ×3, Firebolt), and in both games 10 casts from the hand chosen from the list, all **faded in at the screen's middle (960, 540), opacity 0 to 1, no movement**. Real. A cast from a pile is always chosen from the list: no pile is clickable. Your own spell cast from your graveyard or exile now rises from that pile's tile, the same way your own hand casts do (pips kept). A cast from the hand chosen from the list is unchanged. No exile cast came up in the two live games; it takes the same path (the adventure Lab replay confirms the rise).
- Reduce motion: no wash, medallion turn, door swing, pill, crack, ring or pulse; the marks, medallion, doors, counts and numbers still show.

**Deviations.**
- The canvas's Room art is a stand-in. On the table each half shows its half of the printed card, and Room cards are printed sideways (first door on the bottom of the scan), so a half's art is the sideways scan. The door names on the halves' bars read the right way.
- The medallion is beside the ladder's steps, not in the "Turn 7 · Night" line: placed there in the first film, it cut "Your turn" to "Your ...".
- Item 13 says "the rising number is unchanged". It now matches the canvas's B instead: red, rising off the card's right, landing with the crack. Before, it was gold, at the card's centre, and could be cut short.
- Leeches: the game removes the poison and deals the damage in one board, so the "−N" pill and the shield's crack and "−N" play together. The canvas staggers them by about a second.
- The spell's square shows on its stack card only. It does not ride the card's flight to the graveyard after it resolves (the canvas keeps it to the pile).
- Pulse: only identical replacement effects that Forge applies without asking get a `pulse`. One Leyline alone was never told and is not pulsed.
- The wash plays on a change of `dayTime` between two boards. In the Lab replay the board where it changes is often merged with the next board that changes something else (the replay skips boards that change nothing on the table), so it plays one board later there. In a live game every board is drawn.
- The day/night trace (`shapes-daybound`) never turns back to day (its "OK" does not check that). The dawn clip replays the night board with only `dayTime` set to "day", so it shows the wash and the medallion, but the Slasher does not turn back.
- The daybound card's own day-to-night flip is still reported as "changed form, no animation" (2 findings, both seats): A-09's flip turns the card in place, and the checker counts only movement. This was there before 0083 and is not one of the leftovers.

**Evidence.**
- Tests: `fixes0083.test.tsx` (25) and `fixes0083screen.test.tsx` (4, the game screen: L3 and the Chancellor window); `motion.test.ts` updated for L1. Each piece taken out in turn fails a test (TEST-004; 17 mutations: crack, shake, wash, medallion, Room flip, doors, unpoison, pulse, spell mark, ring, hand dim, ring lift, L1 fade, L2 key, L3 rise, both parsers).
- Worker: `mvn -o test` green. The new Lab script `check-polish.py` (hit, leeches, chancellor, split-second, uncounterable) is added to CI's list. `check-leyline.py` now asserts no notice plus a pulse for both seats; `check-shapes.py rooms` asserts `locked` for both seats. Against the worker before 0083: chancellor, split-second, uncounterable, leyline and rooms are WRONG.
- Every Lab script in CI's list, run locally with the new worker, exits 0. Over their traces: `check-snapshot-first`, `check-hidden-hands` (9,727 sightings), `check-hidden-log` (15,769 lines) and `check-kinds` are OK.
- Jump check (rebuilt local stack, both seats, 11 traces: `shapes-mutate-two`, `shapes-daybound`, `shapes-adventure`, `shapes-aftermath`, `shapes-rooms`, `leyline` and the five `polish-*` games). The checker learnt two things: a `merge:` ghost is its card's old face, and a Room's opening door (`data-door-open`) is that card changing form. Before: 109 findings by the new checker; the old checker also flagged mutate-two's "merge:card:1" ghost popping in, 12 in all for that trace. After: 2. The 98 daybound trigger pops, mutate-two's 4 blink-outs, the adventure's and aftermath's own pile casts fading in (1 each) and the Rooms' 3 whole-card changes are gone. The polish games have none, before or after. The 2 left are the daybound card's own day-to-night flip (see Deviations).
- Clips at 1920x1080, normal and quarter speed with stills, in `Arrow videos/0083/`. They are Lab boards replayed on the rebuilt stack; the Lab deck has no card pictures. 22 moments, both seats where it matters: 01 hit crack (Alice, Bob), 01c combat still slashes; 02 dusk (Alice, Bob), 02c dawn (a modified board, see Deviations); 03 Room door (Alice, Bob); 04 Leeches (Alice, Bob); 05 Leylines' pulse (Bob, Alice), 05c Chancellor report (Alice); 06 split second (Alice, Bob), 06c Abrupt Decay seal (Bob); 07 L1 second mutate (Alice, Bob); 08 L2 trigger card (Alice, Bob); 09 L3 Giant from exile, 09b Memory from the graveyard. I checked the stills against the canvas. Two things were fixed and refilmed: the crack's timing and the medallion's place.
- L3 live check: 2 real games (scratch spec, not committed), 14 casts recorded frame by frame.
