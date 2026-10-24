# Phase 8 — acceptance audit

**2026-10-23.** Phase 8 is LOCKED (2026-10-22) and active. This audits
what is built against the ten acceptance tests, P8-A through P8-O, in
`PHASE_08_EVERY_FORGE_QUESTION_LOCKED.md`.

This is **not the exit gate** (`PHASE_08_EXIT_GATE.md`). It is the
row-by-row evidence the gate points to.

## How each row was decided

The same rules as the Phase 6 and Phase 7 audits.

| Status | Means |
|---|---|
| **MET** | Implemented, and evidence of the kind the test asks for exists and has been run. |
| **PARTIAL** | Implemented, but the required evidence is missing, weaker than asked for, or covers only part of the test. |
| **NOT MET** | Not implemented, or no evidence at all. |
| **OWNER** | Only the owner can decide it. |

For anything a player does, `RUN` means a real game (a Mechanics Lab
scenario: Forge running a real game through the worker) or a real
browser, not a unit test alone (AGENTS TEST-011).

## Where it stands

| Status | Count |
|---|---|
| MET | 10 |
| PARTIAL | 0 |
| NOT MET | 0 |
| OWNER | 0 |
| **Total** | **10** |

**Updated 2026-10-23, night** -- after a second, full rules review: trample
now requires lethal damage on every blocker first (`check-combat-choices
trample`); a player's own spell or trigger is a response window (spec 0005,
Amendment 4; `check-stops window`, `window-none`, `window-skipped`,
`match-window.spec.ts`). The statuses below are unchanged; every rule's
owner and proof is in `docs/architecture/RULES_COVERAGE.md`.

The record, 2026-10-23 (`forge-worker/src/test/resources/forge-questions.tsv`,
170 rows, generated from the compiled worker and Forge at the pin):

| Status | Rows | Of which cost kinds |
|---|---|---|
| ASKS | 110 | 32 |
| ENGINE | 19 | 6 |
| NOT-A-QUESTION | 19 | |
| UNREACHABLE | 13 | 2 |
| ROUTES-TO | 5 | |
| TELLS | 4 | |
| UNBUILT | **0** | |
| PENDING (proof still to come) | **0** | |

At the start of the phase (2026-10-22) it was 66 built, 61 unbuilt,
34 pending; 2,231 of Forge's 33,978 cards reached a question Proxic
could not answer. Now none does.

## The ten

| ID | Test | Status | Evidence |
|---|---|---|---|
| P8-A | A row for every question and cost kind at the pin; the gate fails on a missing row | MET | `ForgeQuestionRecordTest.everyForgeQuestionHasARow` (worker build, every CI run) reads the entries from the compiled `PlayerController` and `ICostVisitor` by reflection and fails on a missing or extra row. Proven by deleting a row (commit `4893242`) |
| P8-B | The gate fails when a status disagrees with the code, both ways | MET | `ForgeQuestionRecordTest.everyStatusIsWhatTheCodeDoes`: a row saying answered for a method Proxic leaves to the loud stub fails, and the reverse. Proven by flipping a status both ways (`4893242`) |
| P8-C | Every built row names a scenario that exists and runs in CI | MET | `scripts/check-question-record.py` (static checks job): evidence exists, and a Lab scenario named is in CI's Lab list; `scripts/check-questions-asked.py` (job "Every answered question was asked"): every ASKS row's question was actually asked in that run's Lab games. Promotion needs both. Each proven by breaking it (`4893242`) |
| P8-D | Every UNREACHABLE row's condition is asserted by a test | MET | `UnreachableQuestionsTest`, 9 tests: ante not played, blockers not ordered for damage, one game per match (no sideboarding), no AI-only path, `orderSimultaneousSa` and the card-face filter never called at the pin (bytecode search, with a control proving the search finds a call that exists), no card pays the choose-a-colour cost (card-script search, with its own control). Three rows are proven by a real game instead, in CI: `check-unreachable.py` (a deck holding Backup Plan, the only card that asks for a starting hand, is refused before the game while the same deck without it plays; a deck naming a card Forge does not have is refused, so Forge never says "unsupported"; no card file pays a shards cost, while the same search finds a cost that exists) and `check-dice.py planar` (the planar die cannot be rolled outside Planechase). Each of the 13 rows names its proof |
| P8-E | Each already-built question has a real-game scenario checking the five points | MET | Every ASKS row names a Mechanics Lab scenario; all 37 scenarios run in CI on every build, with `check-hidden-hands` (point 4) and the "asked" join (P8-C) over all of them. The record's evidence column, by scenario: `check-you-choose.py` 27 rows, `check-cost-kinds.py` 26, `check-modes`, `check-dice`, `check-costs`, `check-combat-choices` 5 each, and 24 more |
| P8-F | Each newly built question or cost: the same, in its slice | MET | Built 2026-10-22/23 in slices by card count (D3): sacrifice/destroy and surveil/scry (spec 0001, owner approved the look from a real game); cost kinds (crew and tap-type, cards for an "unless", keyword-cost counts, return, mana combination, reveal, draw, exert, behold, collect evidence, blight, damage, {Q}); targets, votes, piles, splice, Room doors, keyword pump, discard-unless-type; exert, enlist, assist; dice; Un-set. Each with a Lab game that answers a NON-first option and checks the board afterwards, and a mutant (the answer broken) the Lab was shown to catch |
| P8-G | An unbuilt question still stops the game, names the card, never guesses | MET | Real game, 2026-10-23: a worker built with Space Beleren's sector answer removed, playing `check-unset.py sector`. The match ended FAILED on turn 8 (no winner, no guess) with "Forge asked for chooseSector, **about Savannah Lions**, which this adapter does not implement -- turn 8, Alice's MAIN1". **Found on the way:** before commit `2c872cc` the same game said only "chooseSector -- turn 8": the question came as the Lions entered, after their spell had left the stack, and the stop named only the stack. Every stub now names the card among its own arguments (a card the other player could not see is "a hidden card"); the text goes to the server log and the admin's match record only. `LoudFailureTest` (CI) holds the announce-before-throw and first-reason-wins rules |
| P8-H | `check-hidden-hands` and `check-snapshot-first` hold over every new scenario | MET | Both run in CI over the traces of every Lab game, dice and Un-set included (`.github/workflows/ci.yml`, Mechanics Lab job), with `check-kinds` |
| P8-I | Every Un-set question works with its cards in an Open Format game, with D5's deck support | MET | D5 decided as Amendments 1 and 3. `check-unset.py` (sector: Lions assigned to Gamma and Alpha, Space Beleren's -1 on Gamma counters only the Gamma Lions; crank-yes/crank-no: a Goblin Slingshot assembled from the contraption deck onto sprocket 3, offered and cranked, or not) and `check-dice.py` (reroll, nudge, swap, ignore); both boards show the sector and sprocket. Contraption and Attraction decks by card type in the server's Open Format tests. **From the Deck Builder (2026-10-23):** its Arena export refused a 60 + 15 Contraption deck (its own 65-card cap) and chose printings Forge lacks; the owner is fixing both there (no Arena change). Arena's side is met; a player's end-to-end path waits on that export |
| P8-O | The owner plays games with cards from each slice and accepts the phase | MET | The owner played the Phase 8 test decks on the live site and accepted the phase, 2026-10-24 ("I accept phase 8") |
