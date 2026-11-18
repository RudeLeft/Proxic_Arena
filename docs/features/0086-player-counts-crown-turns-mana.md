# 0086 — Energy and other player counts, monarch and initiative, dungeons, emblems, turn start, mana into the pool

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "gaps-players-1113", https://claude.ai/artifact/LrCTwwbm4KPBsHN4qemdTJ)
**Owner decisions:** 7 **B · badges in the tray** · 8 **the recommended set** (monarch and initiative on the face, flying face to face; dungeon map card with a stepping marker; emblem grows out of its ability into the tray as a picture tile) · 10 **C + B** (plate lights every turn, sweep only when it becomes your turn; extra turn told in the report window at its start) · 11 **A · a ball per mana**.

Phase 10 A-22, from the deep dive "Phase 10 graphical gaps.md" (2026-11-13), items 7, 8, 10 and 11.

## Why

- Energy, experience, rad, tickets, monarch, initiative, dungeon and emblems are word chips in the player's tray with no animation (`StatusTray.tsx` ~142-200; `game.css` ~2741-2780).
- The active plate is a colour switch (`game.css` ~131-134, 237-239; `GameScreen.tsx` ~2407-2445).
- Mana balls exist only for spending (`manaBalls.tsx` ~340-380).

## Built

1. **Player counts (7 B).**
   - Energy, experience, rad and tickets become round picture badges in the player's tray, with rising +N/−N in the badge's colours. Paying energy sends sparks to what it paid for.
   - Poison keeps its place by the life shield (0077).
2. **Monarch and initiative (8).**
   - The crown sits on the monarch's face picture. When it changes hands (combat damage, a card), it lifts off one face and flies to the other, and it glows when its owner draws for it.
   - The initiative token sits on the face's lower corner and flies the same way.
3. **Dungeons (8).** The dungeon is a small map card in the tray. When a player ventures, it lifts, its gold marker steps to the next room, and it settles. Completing a dungeon is told in the report window to the other player.
4. **Emblems (8).** An emblem grows out of the ability that made it on the stack, flies into its owner's tray and stays as a small square tile with its planeswalker's picture. The close-up shows its words.
5. **Turn start (10).**
   - Every turn, the new active player's plate lights up: a light runs along its top edge, the shield glows, and the turn number and "whose turn" words roll over.
   - Only when the turn becomes yours, a soft band of light also sweeps across the table toward you.
   - On an extra turn (Time Warp), the plate lights again for the same player, and at the start of that turn the report window says "Extra turn: this is Alice's turn again." The turn number rolls over (owner-approved exception to rising numbers, shown on the canvas).
6. **Mana in (11 A).** Each mana added to a pool flies as one ball from its source (a land, Dark Ritual, a creature) into the pool chip; the count steps up with a rising +N. Spending keeps today's balls (0070) with a rising −N.
7. Fast and never in the way: nothing here blocks a click. A click hurries everything (A-00). Reduce motion: no movement; badges, crown, tiles and counts still change. Hidden-info rules apply.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0086-A | Aether Hub +1, Harnessed Lightning +3 then −3: energy badge with rising numbers, sparks to the spell; two kinds at once | page test; Lab; clip |
| F-0086-B | Monarch stolen by combat damage: crown flies face to face; glows at the draw; initiative the same | page test; Lab; clip |
| F-0086-C | Venture: map card, marker steps; completing told to the other player | page test; Lab; clip |
| F-0086-D | A planeswalker emblem: grows from the ability, flies to the tray tile | page test; Lab; clip |
| F-0086-E | Turn start both seats; sweep only on your turn; Time Warp's extra turn window | page test; Lab; clip |
| F-0086-F | Swamp and Dark Ritual: balls in, count steps, +3; spending −N | page test; clip |

## Amendments

### Amendment 1 — widened before building (owner, 2026-11-13, from "Phase 10 deep dive 2.md")

Approved looks only; no new canvas needed.
- **Triggers rise from their new pictures.** The monarch's end-step draw rises from the crown; the initiative's upkeep venture from the initiative token; a dungeon room's trigger from its room on the map card; an emblem's trigger from its tile. All use the trigger rise (A-00/0066).
- **City's blessing** becomes a badge in the tray, in 0086's family, with a gold pulse when gained.
- **The Ring.** The Ring's count becomes a tray badge that ticks with +1 on each temptation. When the Ring-bearer changes, the gold ring (0076's mark) flies from the old bearer to the new one instead of popping.
- **Where mana came from.** The worker sends each mana's source with the pool (from the game's own record), so the balls fly from the right land or spell. Past about 6 mana from one source (Cabal Coffers for 12), one larger ball flies with "×N" and the count steps.
- **The pool empties:** when floating mana is lost at the end of a step, its balls fade out of the chip with a grey rising −N.

### Amendment 2 — the problem report's picture (owner, 2026-11-14, by prompt: "Both")

Found while building 0086: a problem report's picture of the screen (a PNG of the board) was 1.03-1.04 MB with a real deck's card art, against the server's 1 MB request limit, so a report from a busy board could be refused. The owner chose both fixes:
- The page sends the screen picture as a JPEG at a quality that looks the same (0.92), not a PNG. It is kept as `screen.jpg` (a pasted PNG stays `screen.png`).
- The server's body limit for the report route alone (`POST /api/reports`) is 5 MB, as a safety margin; every other route keeps 1 MB. *As of 2026-11-17 (a documentation check): the deck routes (`/api/decks/import`, `/api/deck-builder/decks`) keep their 150 MB; every other route is 1 MB (`Limits.kt` `ROUTE_LIMITS`).*

### Amendment 3 — the stack's line waits for its card (owner, 2026-11-14: "Approve, fix the line")

Seen in the 03 clip: while the monarch's trigger was held for the fights, the line under the stack already said "Next: your trigger · 2 on the stack" with no card there. The line now tells only the stack cards that have landed: a card held for the fights, still rising out of its card or sliding in, is left out of it (what it names and how many it counts) until it lands. A click hurries the card's arrival and so its words. It covers every held arrival, not only the monarch's.

**As built:** `Board.tsx` builds the line from the stack cards the board already treats as arrived (the same test its arrows wait on: not held for the fights, not rising or sliding in, not the card still being cast); the line is not drawn while none has landed. Tests (`fixes0086.test.tsx`): with a two-Bears combat wave the monarch trigger's line is absent through the fights and appears only as the card lands; with Lightning Bolt already on the stack, the line keeps "Next: your Lightning Bolt" while the trigger rises on top and becomes "Next: Bob's trigger · 2 on the stack" when it lands. Both fail when the line reads the whole stack. `spectatorWords.test.tsx` now lets the trigger land before reading its line. Refilmed 03-monarch-stolen, both seats.

### Amendment 4 — extra turn told only to the other player (owner, 2026-11-15)

Decided with spec 0089's extra combat (owner): "The player who played the card doesn't need the window because they played it, they know they get another turn. But the other player should get the window so they understand." The extra-turn report goes only to the player(s) other than whoever played the card that gave the extra turn: Bob sees "Extra turn: this is Alice's turn again." with Time Warp; Alice, who cast it, gets no window. This replaces "to both" in the As built below.

**As built (2026-11-15):** `ActionReports.java` keeps each card that gives an extra turn with who played it -- Forge's own record of who activated the spell or ability that resolved (`SpellAbility#getActivatingPlayer`), never a name -- as the report's `chooser`; EXTRA_TURN is told to every reader but that player. The rule is "whoever played the card doesn't get it": a card that gives an opponent a turn tells that opponent ("Extra turn: this is your turn again.") and not the caster. With no card known, the player whose turn it is is left out. Tests: `PlayerMarksTest` (the caster not told, the other told; a turn given to the opponent told to them, not the giver); `check-players` extra-turn reads both seats: seat 1 none anywhere (newest or gathered), seat 2 once. TEST-004, both caught: the caster told (`check-players` extra-turn WRONG; `PlayerMarksTest`), nobody told (WRONG). `check-players` 9 of 9 OK; the 0086 clips are not refilmed (the owner asked for 0089's 03a and 03b only), so Alice's seat in clip 07b (Time Warp's extra turn) still shows her window as first built.

### As built (2026-11-14)

Built as approved (7 B, 8 the recommended set, 10 C + B, 11 A) with Amendment 1; unreleased.

**Worker** (`PlayerMarks.java`, `ViewerSnapshot.java`, `ActionReports.java`). All public, read from Forge's state, never a card name or rules text; every id is stripped per seat by HiddenIds when its card is somewhere that seat cannot see.
- `player.manaFrom`: the floating mana by colour and the card that made it, in the pool's order (Forge's `Mana#getSourceCard`): a Swamp's black is a run of 1, Dark Ritual's three a run of 3.
- `player.commandIds`: one id per `command` entry, so a dungeon room's trigger and an emblem's trigger (whose stack `source` is that id) rise from the map card or tile.
- `emblems`: each emblem with the card that made it (`Card#getEffectSource`), with that card's name, owner and printing; the server (`MatchArt`, one line) puts that card's picture and art crop on it, as on any card.
- `stack[].from`: "monarch" or "initiative" on a trigger that is that designation's own. Forge has no public getter for those effect cards; the worker asks the way Forge made them (the effect card's image key is `StaticData#getOtherImageKey(MONARCH_IMAGE / INITIATIVE_IMAGE, its set)`), a Forge constant, not a name.
- Two `action` reports: an extra turn at its start, to the other player only since Amendment 4 ("Extra turn: this is Alice's turn again."; as first built Alice too, "... your turn again."), with the card that gave it (the card whose AddTurn effect resolved for that player, newest first; Forge's `Player#isExtraTurn` says the turn is one); a completed dungeon, to the other player only ("Alice completed Tomb of Annihilation."), with a `dungeon` mark (its map is the picture). Forge sends no event for a completed dungeon; `Player#getCompletedDungeons` is watched as events arrive.

**Page.**
- **7 B, badges** (`playerMarks.tsx`, `StatusTray.tsx`). Energy, experience, rad, tickets (any other player counter: a grey badge) are round badges in the tray, the canvas's pictures and colours; the number steps point by point (0077's 90 ms a point, at most 0.9 s) while the badge swells, and a pill in the badge's colours with its picture rises off it (+N, −N; down off the opponent's tray, as the canvas). Poison keeps its badge by the shield. Amendment 1: the city's blessing is a badge (a gold city) that grows in with a gold glow; the Ring's count is a badge (a gold ring) that ticks +1; the Ring's chip is gone. Each badge still opens the tray's list.
- **Sparks** (`flights.tsx`). Energy that goes down sends up to six sparks (yellow, 0.55 s, 70 ms apart) from the energy badge to the spell being cast, else the player's spell or ability on the stack as it was (Harnessed Lightning pays as it resolves).
- **8, the crown and the initiative** sit on the face picture (top; lower right corner). When either changes hands it lifts off one face and flies to the other (0.75 s, an arc out over the table, up to ×1.7, glowing), the new face's mark held hidden until it lands, then pulsing; held for the first time it grows in. Each glows while its own trigger waits on the stack (the monarch's end-step draw, the initiative's venture).
- **8, the dungeon** is a small map card in the tray drawn from the game's own rooms and paths (levels left to right). When its room changes it lifts toward the table (×2.6), the gold marker steps along to the new room (0.4 s in, 0.45 s), the map glows and settles (1.6 s in all). A completed dungeon's map card shrinks away; the other player's report window shows the dungeon's map with "Completed".
- **8, emblems** are 24 × 24 tiles with their planeswalker's art crop and a star; pointing says the emblem's words. A new emblem flies out of its ability's stack card (or its maker on the table) into its tile (0.8 s, growing out of the card, glowing violet); the tile pulses as it lands.
- **Amendment 1, the Ring**: the gold ring flies from the old Ring-bearer's mark to the new one's (0.65 s), the new mark held until it lands.
- **Amendment 1, triggers rise from their pictures** (`Board.tsx`, `fromSnapshot.ts`): a trigger from the monarch, the initiative, a dungeon or an emblem rises (0066's rise) from the crown, the token, the map card or the tile -- also when that picture came with the same board (taking the initiative and its venture at once).
- **10 C + B, turn start** (`turnStart.tsx`): every turn the new active player's plate lights (a light runs along its top edge, 0.45 s; the shield glows, 0.25-0.75 s; the gold edge fades across), and the turn number and "whose turn" words roll over (0.3 s). Only when the turn becomes yours a soft band of light sweeps down the table toward you (0.55 s): not on the other player's turn, not on your own extra turn, never to a spectator. An extra turn lights the same plate again, and its report window says so at its start.
- **11 A, mana in**: each mana added to a pool flies as one ball (0062's look, a short trail) from its source -- the land on the table, Dark Ritual's card on the stack as it was -- into the pool's chip; the chip's count waits for each ball and steps up as it lands, with a rising +N (`poolHeld.ts`). More than 6 from one source: one larger ball "×N". Mana spent from the pool keeps 0062's balls, with a rising −N; mana gone at the end of a step with no payment is lost: a grey −N rises and grey balls fade out of the chip.
- Nothing here can be clicked except the badges, map and tiles (which open the list as before). Every movement is a Web Animation (the flights in a page layer like 0062's balls), so a click hurries all of it (A-00). Reduce motion: nothing flies, rises, rolls or sweeps; the badges, crown, tiles and counts simply change.

**Deviations.**
- A dungeon room's trigger rises from the map card, not from the room's own dot on it (the card is 53 px wide; a rise out of a 3 px dot looked the same).
- The sweep is skipped on your own extra turn (the turn does not "become" yours; the plate lighting again and the report window tell it). The canvas has no sweep in its extra-turn scene.
- A dungeon completed: the report is the latest report, so a report made by the last room's own effect a moment before (Oubliette's discard) is replaced by it (0088 gathers reports).
- The canvas has no pictures for tickets, the Ring's count or the city's blessing: drawn in its style (a ticket, a gold ring, a gold city).
- While a dungeon's map lifts over the table, the rail is raised above the board's cards (1.6 s), so the map is never under a stack card (found filming F-0086-C: it lifted behind Fates' Reversal on the stack).

**Evidence.**
- Worker: `PlayerMarksTest` (3) and the suite: `mvn -o test` green (164 run, 0 failed); `mvn -o package -DskipTests` built. Server: `MatchArtTest` gains the emblem picture; ktlint, detekt and the server suite green (687 tests).
- New Lab script `scripts/check-players.py`, added to CI's Lab list: energy, two-kinds, monarch, initiative, dungeon, emblem, extra-turn, mana, pool-lost, each read from both seats' snapshots. All OK.
- Every Lab script in CI's list (62, with players), run locally with the new worker: all exit 0, none needing a second game. Over their traces `check-snapshot-first` (35,588 questions), `check-hidden-hands` (9,762 sightings), `check-hidden-log` (17,254 lines, 14,849 cards named) and `check-kinds` (198 permanents) OK.
- Page: `fixes0086.test.tsx` (31 tests), `StatusTray.test.tsx` updated for badges, tiles and the map; the whole frontend suite green (83 files, 1,272 tests); tsc, eslint (the whole frontend), prettier clean. TEST-004: 33 page mutations each fail a test (the pill, stepping, badge not chip, blessing and Ring badges, growing in, the holder's glow, the crown's flight, held until it lands, first-time grow, the Ring's flight, the emblem's flight, sparks, the pool held back, the big ball, the grey lost pill, "lost" only at a step's end, the ball from its source, the +N, the map's lift, the marker's step, the map leaving, the plate lighting only for the active player, no sweep on an extra turn or to a spectator, the roll, the rise from the rail and from a picture new on the same board, `riseFrom`, the dungeon picture, `manaFrom` read, reduce motion, a click hurrying); 6 worker mutations against the Lab (no mana source, no monarch designation, wrong command ids, wrong emblem maker, no extra-turn report, no dungeon report) each make its scenario WRONG.
- e2e on the rebuilt stack: battlefield, match-status-list (updated for badges and tiles), match-ring, match-state, match-board-motion, match, match-stops, match-watching, match-what-happened and match-report pass. Before Amendment 2, match-report failed twice on one build: its report picture (the board with the real Mono Red deck's art) was a PNG of 1,031,054-1,044,671 characters as sent (HEAD and 0086 alike, about 775 KB of picture) against the 1 MB request limit. After Amendment 2 the same picture is a 246,008-byte JPEG (`screen.jpg`), and match-report passes with the real-art deck (it now checks the JPEG signature and that the picture is under 1 MB).
- Amendment 2's tests: the page takes the screen with html-to-image's toJpeg at quality 0.92, never toPng (`reportPicture.test.tsx`); the server keeps a 3 MB report with a JPEG screen as `screen.jpg`, served as image/jpeg, and refuses one over 5 MB with 413 (`AdminApiTest`); the 5 MB limit is the report route's alone (`LimitsTest`). Server suite 689 tests green.
- **Triggers wait for the hit** (found by the coordinator in the 03 clip): the monarch's "combat damage takes it" trigger rose from Bob's crown and sat on the stack before Alice's Bears lunged and Bob's −4 landed. Not new in 0086: the board started a stack card's rise before it started the combat damage step's fights (its stack effect was declared before the damage effect), so any trigger caused by combat damage (a monarch's, a "whenever this deals combat damage" trigger) rose before the hit. Fixed at the root: the damage effect now runs first, and every card arriving on the stack waits for the fights still to play (`holdLeft()`: its rise or slide-in is delayed, hidden until then, its arrows wait too). Page test: a monarch trigger arriving with a two-Bears combat wave rises only after the fights' clock (fails if the stack's arrivals ignore the fights).
- Jump check (local stack, both seats, the 9 players traces): before (HEAD's page) 24 findings, all triggers from the monarch, the initiative and a dungeon fading in at the stack spot; after, 0 (the late-picture fix measured on the initiative and dungeon traces after the first after-run left 8); after the triggers-wait-for-the-hit fix, all 9 traces again: 0.
- Clips at 1920x1080, normal and quarter speed with stills (every 100 ms of game time), in `Arrow videos/0086/` (26 moments, both seats): 01 Aether Hub's energy, 01b Harnessed Lightning (+3, -3, sparks), 02 two kinds at once, 03 the monarch stolen, 03b its end-step draw, 04 the initiative and its venture, 05 a venture (map lifts, marker steps), 05b the dungeon completed (Bob's report), 06 Sorin's emblem, 07 a turn starting, 07b Time Warp's extra turn, 08 mana in (Swamp, Dark Ritual, Hypnotic Specter), 08b mana lost. Lab boards replayed on the rebuilt stack; the Lab deck has no card pictures (emblem tiles plain). I read frames at 10 per second of game time around each moment. Fixed and refilmed: a badge new to the tray had no +N (Aether Hub's first energy); the map lifted under the stack card; the emblem tile simply appeared (its growing-in collapsed it to nothing, so its flight had no target). Checked: the energy count steps 1-2-3-4 with +3 and three sparks fly into Harnessed Lightning; the crown arcs from Bob's face over the table onto Alice's and glows while her draw waits; the trigger rises from the crown; the initiative and the Undercity's room trigger rise from the token and map; the marker steps to the next room above the stack card; Bob's window reads "Alice completed Tomb of Annihilation." with the map and "Completed"; the emblem grows out of Sorin's ability and lands in its tile; Alice's plate edge lights and the number rolls; Time Warp's window reads "Extra turn: this is your turn again." (Alice) at the extra turn's start; three black balls fly from Dark Ritual and the chip steps 1-2-3 with +3, then -1s as the Specter is paid; a lost black fades grey with -1. Nothing was under the casting card or a report window. After the triggers-wait fix and 0085's report wait being dropped (owner), 03, 03b, 05b and 07b were refilmed on the rebuilt stack, both seats: the Bears lunge and Bob's −4 lands, then the monarch's trigger rises from Bob's crown, then the crown arcs to Alice; the dungeon-completed and extra-turn windows come up at once above the hand and cover neither the map card leaving nor the plate lighting.
