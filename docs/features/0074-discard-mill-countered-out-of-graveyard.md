# 0074 — Discards, mills, countered spells, and cards leaving a graveyard or exile

**Status:** Approved 2026-11-12 (owner, by prompt, on the canvas "grave-1112", https://claude.ai/artifact/CG9TUMfS1yG8PTnj4DiYCE)
**Owner decisions:** discard **A · Lift and drop**; mill **C · Stream**; countered **F · Struck by the beam**; out of a graveyard or exile **H · Rise and show** (a whole graveyard exiled: **swept as one**).

Phase 10 items A-06 (discarded, milled, a spell countered; sacrifice was done in Amendment 6) and the graveyard/exile part of A-14; the jump audit's row 10 (Amendment 1: about 130 not shown).

## Why (researched)

- Your discard already slides to the graveyard with its "Discarded" tag (`Board.tsx` ~2997, ~3281). The other player's discard is the last back of their fan sliding off as a back: never face up, no tag (hidden-hand backs, ~2406).
- Mill: nothing moves, only the tile numbers change (`GameScreen.tsx` ~2675, ~2690), though the move names the card.
- Countered: the spell glows as if it resolved and its spark still runs to its target (`Board.tsx` ~3196), then it slides to the graveyard with "Countered by …" (~3235, ~3257).
- Graveyard to battlefield: a faint glide from the tile (`fromSnapshot.ts` ~275). Graveyard to hand: only table/stack returns are tracked (~256), so the card fades in from the stack spot. A graveyard exiled, or cards put into a library from it: nothing moves.
- Every such move is named (a graveyard is public; `Moves.java` ~236-281); a card going into a hidden hand or a library loses its id (`HiddenIds.java` ~61), so the page matches it by comparing graveyards and never carries the id on.

## Built

1. **Discard (A):** the card lifts out of the hand and drops into its owner's graveyard tile, face up, with the "Discarded" tag as today. The other player's discards leave the middle of their fan (no hidden id; as spec 0072) and turn face up on the way. Several discards go one after another.
2. **Mill (C):** cards slide off the library tile one after another, turn face up and drop into the graveyard; after 10, the rest go together as one ×N bundle. The tile numbers tick as each lands.
3. **Countered (F):** the countering spell's gold beam (spec 0069) flares onto the countered spell, which crumbles to grey ash on the stack and goes to its graveyard with "Countered by …". A countered spell never shows its own resolve glow or spark. A spell countered with no beam (no visible source) crumbles the same way.
4. **Out of a graveyard or exile (H):** the card rises out of its tile and pauses, enlarged, for a moment so it can be read, then glides where it goes: the table, a hand (into the other player's hidden hand it turns face down near their fan), a library (face down). A whole graveyard exiled at once (Bojuka Bog) is swept to the exile tile as one.
5. A click hurries all of it (100 ms, A-00); reduce motion: no movement, the numbers change. The other player's hidden cards never gain an id.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0074-A | Mind Rot on Bob: two backs leave his fan, turn face up, drop into his graveyard; your discard unchanged except the lift | page test; Lab; clip |
| F-0074-B | Glimpse the Unthinkable (10): a stream, tile numbers tick; more than 10: a bundle after 10 | page test; Lab; clip |
| F-0074-C | Counterspell on Giant Growth: beam, ash, graveyard; no spark to the Bears | page test; Lab; clip |
| F-0074-D | Raise Dead (to Bob's hand: face down near his fan, no id), Unearth (to the table), Bojuka Bog (swept as one) | page test; Lab; hidden check; clip |
| F-0074-E | The jump check no longer flags row 10 on the Lab games | jump check run |
| F-0074-F | Hurry and reduce motion | page test |

## Amendments

### As built (2026-11-12)

Page only; the worker is untouched. The game's moves already say, for each of these cards, where from, where to and why (`fromSnapshot.ts` `tileMoves`, `countered`); the looks are `graves.ts` (the canvas's numbers), played by `Board`.

- **Discard (A):** your card (or one of theirs shown to you) lifts out of the hand (A-14's lift, 12/134 of a card, to 1.05) and drops face up into its owner's graveyard tile, the "Discarded" tag riding with it; several 120 ms apart, after the spell that did it has glowed (380 ms). Their hidden cards leave the middle of the fan (spec 0072's rule, by place only: no id), a back that lifts toward the table, turns face up at 10-40% of the drop (one picture at a time, both a sliver while edge-on) and its tag rides from then. The fan closes on the gap as they lift, not before; a back held in the fan until it lifts.
- **Mill (C):** each card slides off the library tile (90 ms apart), turns face up beside the plate (0.78 of a card) and drops into the graveyard (720 ms each). Past 10 the rest go as one bundle: every card of it drawn on one path, the top one with "×N" and the bundle's one shadow. No "Milled N" tag (not in Built).
- **The tile numbers** (library, graveyard, exile, both plates) change as each card leaves or lands, popping (the canvas's 0.35 over 220 ms), held over the tile as the page's own copies, on the board's animation clock. A tile that ticks also counts the other cards landing in it that update (the spell that did it), so it never runs ahead.
- **Countered (F):** the countering spell's spec 0069 beam (recomputed from the stack as drawn) flares, a pulse runs down it, the ripple bursts (560 ms); the countered spell shows no resolve glow and no spark, drains to grey ash where it is (ash motes) and leaves at 1020 ms, "Countered by …" riding from then; drawn under the countering spell, as on the stack. No beam (no visible source): the same crumble.
- **Out of a graveyard or exile (H):** rises out of its tile with the gold glow (300 ms) to beside the plate at 1.2 of a card, held 600 ms, then glides (520 ms): onto the table or into your hand as that card (the same element, landing exactly; "Back to your hand"); into their hidden hand turning face down near the fan while his newest back takes over on the same path ("Back to Bob's hand"; the card is the one gone from the graveyard the page drew, never an id in his hand); into a library face down, sinking (A-14's riffle and tag); a single card into exile with the pale light. Two or more from one graveyard to exile in one update are **swept as one** (fanned, glowing, held 250 ms, into exile together). The hand makes room as it sets off.
- Hurry: all of it is Web Animations under the board (100 ms on a click). Reduce motion: none of it; the numbers simply change.
- **Kept check changed** (`scripts/check-jumps.py`): a hidden-hand back stepping across two places in one frame when the backs at both ends are handed over in that same frame (several leaving the middle of the fan) is not a jump, as spec 0072's `handed_over` already reads a pop.

Tests: `fixes0074.test.tsx`, 12 (F-0074-A, B, C, D, F); 10 of the first 11 fail with the Board change removed (the 11th is the reduce-motion guard). Hidden checks over the six Lab traces: `check-hidden-hands.py` OK (2,251 hand-card sightings), `check-hidden-log.py` OK (292 lines).

Jump check (F-0074-E), rebuilt local stack, both seats, six scratch Lab games (Mind Rot both ways; Glimpse the Unthinkable then Traumatize, 19; Counterspell on Giant Growth targeting Grizzly Bears; Lightning Bolt then Raise Dead to Bob's hand; Lightning Bolt then Unearth; Glimpse then Bojuka Bog). Row 10, "not shown at all": **93 before, 40 after.** All 40 are boards right after the other player's spell, where the replay sends the next board before the page's 1.5 s spotlight hold on that spell ends (the page then plays it under the next board's mark); a copy of the tool that waits 1.6 s per board finds **no finding of any kind** on the same games. Two kinds the first after-run found and fixed: the fan's backs "jumping" two places (the anonymous swap, above) and a back blinking out before its discard lifted.

Clips at 1920x1080, normal and quarter speed, in `Arrow videos/0074/`: Bob discards two (Mind Rot), Glimpse mills 10, Traumatize mills 19 (10 then a ×9 bundle), Counterspell on Giant Growth, Raise Dead to Bob's hand, Unearth to the table, Bojuka Bog. Found filming and fixed: the countered spell drawn over the countering one; a bundle's nine shadows; the graveyard number showing the spell's card early.

## Amendment 1 — explained in the report window, not pills or notices (owner, 2026-11-12)

On reviewing the clips the owner asked: **no yellow word pills on the table** ("Discarded", "Countered by …") and **no top-of-table notices** ("GAME · Discarded: …") for these actions. What happened is explained only in the **report window** (as Mind Rot's: the acting player's medallion, "WHO · CARD", one plain sentence, the cards as pictures with where each went), standardized across discard, mill, countered, and cards leaving a graveyard or exile, e.g. "BOB · COUNTERSPELL — Bob countered your Giant Growth", "YOU · GLIMPSE THE UNTHINKABLE — Bob milled 10 cards", "BOB · RAISE DEAD — Bob returned Grizzly Bears to his hand". A window opens only for what the **other player** does or what happens to them; your own routine self-only events (discarding to hand size, milling yourself) get none. The animations are unchanged. Owner's standing rule: explanations are window-based, standardized and carry a graphic -- no scattered elements that end up looking noisy. Follow-up (not this spec): audit every other word pill and top notice tied to a card action and propose moving it into windows.

### As built, Amendment 1 (2026-11-12)

- **No word pills, no top notices** for these actions. Page: `fromSnapshot` gives no tag for a move whose why is "discarded" or "countered" (a cycled card keeps "Cycled"); the A-14 tags "Back to ... hand" / "... library" are not drawn for a card out of a graveyard or exile (the shuffle's riffle still plays). Worker (`Moves.toldByOwner`): a discard or a counter is no longer told as a notice ("GAME · Discarded: ..." / "Countered by ...: ...").
- **The report window** (`snapshot.action`, ActionReports; RevealTray unchanged) now covers: a spell **countered** ("Bob countered your Giant Growth.", the countered card shown, "→ graveyard"); cards **out of a graveyard or exile** ("Bob returned Grizzly Bears to their hand.", "You exiled Plains ×4 and Savannah Lions ×6 from Bob's graveyard.") -- a card into a hidden hand is shown as it was in the graveyard (public), always under the report's own id, never its own; a **mill** says "Bob milled 10 cards." with the cards as pictures. Discards keep "Bob discarded ...".
- **Who sees it:** a mill, a counter or a return goes to both players unless the reader did it to themselves alone (your Glimpse on Bob: both; milling yourself or your own Raise Dead: only the other player). Discard, search and the rest keep Amendment 13 item 7 (not the one who chose): your hand-size discard opens nothing.
- Worker tests: `ActionReportsTest` (who is told), `ThrownAwayTest` (no line for a discard or a counter); `mvn -q -o test` and `package` pass. Lab: `check-who-did-it.py` (scour now "Bob milled 2 cards." / "You milled 2 cards.", told to both) and `check-thrown-away.py` (no notice for the hand-size discard or the counter) pass; `check-hidden-hands.py` and `check-hidden-log.py` OK over the new Lab traces. `protocol/README.md` updated.
- Clips in `Arrow videos/0074/amended/` (normal and quarter speed): Mind Rot on Bob, Glimpse milling Bob's library, Bob's Counterspell on your Giant Growth (your view), Bob's Raise Dead to his hand. Animations unchanged.
