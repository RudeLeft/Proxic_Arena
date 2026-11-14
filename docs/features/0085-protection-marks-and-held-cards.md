# 0085 — Protection and gained-ability marks; what a card is holding

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "gaps-marks-1113", https://claude.ai/artifact/7HeVgwnuurE3PhCFiqvdxa)
**Owner decisions:** 2 **B · rise, then settle as a square**; fold order **protection never folds first**; 4 **A · picture tab on the holder**. (Item 3, cards playable from piles, is being redrawn on the real plate look and is not part of this spec.)

Phase 10 A-22, from the deep dive "Phase 10 graphical gaps.md" (2026-11-13), items 2 and 4.

## Why

- `CardBadges.tsx` marks only the Ring, copy, phased, regeneration shield and indestructible (~441-490). Keywords are used only for flying (hover) and haste (`Board.tsx` ~751-766), though the worker sends them all (`ViewerSnapshot.java` ~871-887).
- "Exiled by" exists only in the exile tray and the close-up (`zoneTray.ts` ~12-35, `GameScreen.tsx` ~4150); the holding card shows nothing.

## Built

1. **Gained-ability marks (2 B).**
   - When a permanent gains an ability it did not have, the ability's icon rises off the card like a +N, holds above it, then drops into a gold-rimmed square mark (0076 placement: up from the lower left, two columns, under the name, above P/T, stepping over ATTACKING).
   - Covered: hexproof, shroud, protection (in its colour or colours), ward, and keywords gained until end of turn (trample, haste, lifelink, first strike, deathtouch, vigilance, menace, flying beside its hover).
   - The mark shrinks away when the ability ends.
   - Abilities printed on the card are not marked; they are in the close-up. The exception is hexproof, shroud, protection and ward, which are marked whether printed or gained, because they decide what can be targeted. Indestructible keeps 0080's hexagon.
   - Heroic Intervention on three creatures plays on all three at once.
2. **Fold order (owner).** When marks don't fit (a small attacking card fits a counter plus three), gained keywords fold into the "··· N" badge first. Hexproof, shroud, protection, ward and indestructible never fold before them.
3. **What a card is holding (4 A).**
   - A permanent that holds an exiled card "until it leaves" (Banishing Light, Oblivion Ring, Fiend Hunter, and the like, as the game links them) carries a picture tab on its edge, in the Aura/Equipment side-tab style, with the held card's picture and name. Neighbours glide aside to make room.
   - When the holder leaves, the tab flies to the exile pile, the pile glows, and the held card rises out of it (0074's rise and show) and goes home.
   - Hidden-info rules apply: a face-down held card shows a back and no name.
4. A click hurries everything (A-00). Reduce motion: no movement; marks and tabs still show.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0085-A | Heroic Intervention on three creatures: hexproof squares rise and settle on all three; indestructible hexagon; marks go at end of turn | page test; Lab; clip |
| F-0085-B | Mother of Runes: protection from red square in red; Bolt at it does nothing (0080's pale shield) | page test; Lab; clip |
| F-0085-C | Run Amok: trample rises and settles, goes at end of turn | page test; Lab; clip |
| F-0085-D | Crowded small attacking card: protection stays, keywords fold first; nothing covers name or P/T | page test; e2e sweep |
| F-0085-E | Banishing Light and Fiend Hunter: picture tab; Disenchant / killing the Hunter: the card comes back out of exile; both seats | worker test (the link); page test; Lab; hidden check; clip |

## Amendments

### Amendment 1 — widened before building (owner, 2026-11-13, from "Phase 10 deep dive 2.md")

Approved looks only; no new canvas needed.
- **More abilities marked:** double strike, "can't be blocked" and reach join the gained-ability squares (rise, then settle). They fold like the other gained keywords.
- **Lost abilities:** under Humility, Turn to Frog or Kenrith's Transformation, a creature that has lost all its abilities wears a grey square ("lost its abilities"), using the same rise-and-settle. While it lasts, its printed marks (hexproof, protection, flying's hover) drop, and they come back when it ends.
- **Held cards that stay in exile:** the tab plays only the move the game makes. Imprint (Chrome Mox, Isochron Scepter) and Hideaway hold a card that stays in exile when the holder leaves; that tab sinks with the card into the exile pile, and the card never comes back out. Banishing Light-style holders return the card as before. A face-down held card (Hideaway) is a back with no name to the other player.

### As built (2026-11-13)

Built as approved (2 B, protection never folds first, 4 A) with Amendment 1; unreleased.

**Worker** (`Marks.java`, `ViewerSnapshot.java`, `PlayLog.java`). All public, on a battlefield permanent the viewer may identify; read from Forge's state, never a card name or rules text.
- `gained`: the keywords it has now that its face does not print (Forge's titles, as `keywords`; the face's intrinsic keywords are the printed ones). Run Amok's "Trample", Heroic Intervention's "Hexproof" and "Indestructible", Mother of Runes' "Protection from red", Assault Strobe's "Double Strike" (Lab).
- `unblockable`: a "can't be blocked" it was given: a CantBlockBy static that applies to it, names no blocker, and is not its own printed ability (Distortion Strike, Rogue's Passage). Known limit (STUB-005): "can't be blocked except by..." and "by more than one" are not marked (they name blockers).
- `lostAbilities`: on a creature, Forge's own "remove all" keyword change (Humility, Turn to Frog, Kenrith's Transformation). Its printed keywords are already gone from `keywords` while it lasts.
- `holds`: the exiled cards it holds, ids only (each is in `exile`, named there as the viewer may know it): exiled "until it leaves" (Banishing Light), imprinted (Chrome Mox), or moved there by its own ability from anywhere but a graveyard (Oblivion Ring, Fiend Hunter, Hideaway, Karn). Bojuka Bog's eaten graveyard, Scavenging Ooze's and a creature spell's delve are not held. Protocol: `protocol/README.md`, `MATCH_PROTOCOL.md`.
- **Hidden information fix (found by the new hideaway scenario).** The play log named Hideaway's card to the other player ("Forest was exiled from Alice's library"): Forge exiles it, then turns it face down, and the line was written at the move. At the round's end every card named in the log that Forge has since turned face down is asked again, both questions, per reader, and unnamed for a reader who may not identify it (`PlayLog.hideTurnedDown`). Before: `check-hidden-log` WRONG on the hideaway trace (2 problems); after: OK.

**Page.**
- **2 B, rise then settle** (`marks.tsx`, `markMotion.ts`, `CardBadges.tsx`, `Board.tsx`). A mark a permanent did not have rises off it as a gold-rimmed icon like a +N (0.5 s, up 0.42 of its height plus a little, growing a touch), holds above it (to 0.85 s), then drops into its square at the lower left (0.45 s), which pops as it lands (x1.3, 0.3 s); the canvas's numbers. Several of one card's marks rise side by side; several cards a beat (0.1 s) apart, the canvas's Heroic Intervention. It starts with the round's number changes (0078's clock: as the resolving spell's beam lands, after any fights), so the trample icon rises with Run Amok's +3/+3. 0080's hexagon rises the same way when a card becomes indestructible (the canvas's "two icons rise off each creature"). A mark that ends shrinks away (0.35 s) as the turn's −3/−3 rises. A card new to the table simply wears its marks.
- **Which marks.** Hexproof (and "hexproof from"), shroud, protection (the shield in its colour, split for two or more colours, steel for "from creatures") and ward (its {N} inside) are marked printed or gained. Gained trample, haste, lifelink, first strike, double strike, deathtouch, vigilance, menace, flying (beside its hover) and reach are marked; printed ones are in the close-up. A given "can't be blocked" is marked. A creature that lost all its abilities wears a grey square; its printed marks drop with the keywords and come back when it ends (Turn to Frog, Lab). Indestructible keeps 0080's hexagon. Pointing at the badges says each mark's words; there are no words on the table.
- **Fold order (owner).** Gained keywords and "can't be blocked" fold into the "··· N" first; hexproof, shroud, protection, ward, lost abilities and indestructible never fold before them. Then, if still no room, 0076's counter fold.
- **When a spell aimed at it does nothing** (the Bolt at Mother of Runes' Bears), its protection squares swell once (x1.35, 0.5 s) as 0080's pale shield flares: the canvas's "that is why".
- **4 A, a picture tab on the holder.** Each held card is a tab after the holder's Aura and Equipment tabs (A-17's look and room: the slot is wider by a tab, so neighbours glide aside, and a holder never piles), with the held card's art crop in a small gold-rimmed square and its name; a face-down card the viewer may not identify is a card back with no name (Hideaway, to the other player). The tab grows in with a glow once the held card has gone into exile (after its Banish and Glide), and the holder glows.
- **The holder leaves.** Its tabs fly from its edge to each held card's exile pile as the holder's fate starts (0.6 s, a little arc, half size, gone at the pile); held on the edge until then, so a tab never vanishes early. A card that comes out of exile in the same board (Banishing Light, "until it leaves") rises out of its pile 0.6 s after its holder set off, once the tab has got there: the pile glows and the card glows gold as it rises and is shown (0074's Rise and show), then goes home. A card that comes out in a later board (Oblivion Ring's and Fiend Hunter's trigger) glows, and its pile glows, as it rises then. A card that stays in exile (Chrome Mox's imprint, a Hideaway card) is sunk with its tab (to 0.3 size) and never rises.
- **The report window waits for the board** (`reportWait.ts`, found filming F-0085-B). The window came up with the board: over Alice's Bears, hiding the pale shield and the red square's pulse it was there to explain. Now it comes up once what the board was showing when the report came has played (a click hurries it, A-00), at most 4 s; anything that starts after it never holds it back (a busy game would otherwise keep it down). Reduce motion, or a board at rest: at once. The canvas raises it the same way, after the move.
- Everything is a Web Animation on the board, so a click hurries it (A-00). Reduce motion: nothing rises, flies or glows; the squares and tabs are simply there and simply go.

**Deviations.**
- A small attacking card with a counter and three protection squares has no room left for the "··· N" too: after the gained keywords fold, the counter folds into it (0076's fold), so the "··· 2" holds the counter and trample. The canvas's "B" crowded card folded the hexagon and trample instead; the owner's rule since says protection (and indestructible) never folds first.
- The canvas has no pictures for double strike, deathtouch, vigilance, menace, reach, "can't be blocked" or lost abilities (Amendment 1: approved looks only). They are drawn in the canvas's style: two swords, a skull, an eye, horns, a rising arrow, an arrow through a gap in a wall, a dashed sparkle struck through on a grey square.
- Neighbours make room for a held tab as the board arrives (while the held card is banished), not as the tab grows in.
- Heroic Intervention also gives the lands hexproof; they get the square too (above their mana symbols), as the game says.
- For a holder whose card comes back by its own trigger (Fiend Hunter), the card is still in exile when the holder leaves, so its tab sinks into the pile (the "stays" look); the card rises out, glowing, when the trigger resolves.
- The held tab is not a button (it is not a permanent): pointing says "Holding Serra Angel in exile"; the exile tray and close-up still say "Exiled by".

**Evidence.**
- Worker: `MarksTest` (3) and the suite: `mvn -o test` green (161 run, 0 failed); `mvn -o package -DskipTests` built.
- New Lab script `scripts/check-marks.py`, added to CI's Lab list: heroic, mom, run-amok, strobe, distortion, frog, humility, banishing, fiend, mox, hideaway, each read from both seats' snapshots. All OK.
- Every Lab script in CI's list (61, with marks), run locally with the new worker: all exit 0, none needing a second game. Over their traces `check-snapshot-first` (34,668 questions), `check-hidden-hands` (10,478 sightings) and `check-kinds` (193 permanents) OK; `check-hidden-log` found the Hideaway leak above (2 problems, marks-hideaway only). After the fix, marks, play-log, face-down and what-happened were run again: `check-hidden-log` OK (803 lines, 702 cards named), hidden-hands and snapshot-first OK.
- Page: `fixes0085.test.tsx` (24 tests); the whole frontend suite green (82 files, 1,241 tests); tsc, eslint (the whole frontend), prettier clean. TEST-004: each piece taken out in turn fails a test -- 29 page mutations (risers, the square waiting for its icon, ended marks kept and shrinking, keywords folding first and before any counter, protection never folding, printed keywords unmarked, protection colour, ward cost, the "why" pulse, held tabs drawn, the tab room, the tab growing in, the tab flight, sink or fly, the freed card's wait, its glow, the pile's glow, the hidden held card, the lost square, the hexagon rising, reduce motion, both parsers, a new card not rising, the riser landing on its square, the report waiting, and waiting only for what was moving) and 5 worker mutations run against the Lab (lost abilities, given "can't be blocked", gained keywords, held by its own ability: each scenario WRONG or never reached; the play log's turned-down card: `check-hidden-log` WRONG).
- e2e: the battlefield sweep (`battlefield.spec.ts`) now has protection, gained and lost squares and held tabs on its synthetic boards and asserts it measured them; passes on the rebuilt stack. Taking the state word out of the marks' placement made it fail ("a badge covers bf-state"). `match-report` and `match-what-happened` pass with the report wait (a first version that waited for anything moving held the reports back in a busy game: what-happened failed twice; fixed as above).
- Jump check (rebuilt local stack, both seats, the 11 marks traces): before (HEAD's page) 1 finding, after 1 finding -- the same one, Distortion Strike's rebound cast from exile fading in at the stack spot (a card used from a pile, 0084's known limit). The check follows cards, not marks or tabs; those were checked by eye.
- Clips at 1920x1080, normal and quarter speed with stills, in `Arrow videos/0085/` (26 moments): 01 Heroic Intervention (Alice, Bob), 01c its end of turn; 02 Mother of Runes (Alice, Bob); 03 Run Amok (Alice, Bob), 03c its end of turn; 04 Assault Strobe; 05 Distortion Strike; 06 Turn to Frog, 06b its end, 06c Humility; 07 Banishing Light (Alice, Bob), 07c/d Disenchant (Alice, Bob); 08 Fiend Hunter (Alice, Bob), 08c/d the Bolt (Alice, Bob); 09 Chrome Mox, 09b/c Shatter (Alice, Bob); 10 Hideaway (Alice, Bob). Lab boards replayed on the rebuilt stack; the Lab deck has no card pictures. I read frames at 10 per second of game time around each moment. Fixed and refilmed: the report window came up over Mother of Runes' Bears as the Bolt fizzled, hiding the pale shield and the square's pulse. Checked: the trample icon rises with Run Amok's +3/+3 in the same frames; Heroic Intervention's six icons rise together and land as their squares pop; the red square stays readable under the pale shield and swells; the held tab reads "Grizzly Bears" and is a back with no name for Bob's Hideaway; no mark was under the casting card or the report window while it played. Once up, the report window still sits over Alice's creature line (0071's place, above the hand); Peek or Space shows under it.
