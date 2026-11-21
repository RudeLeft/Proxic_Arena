# 0113 — Plain-English wording, step 1: the game screen (every window, the play log and screen-reader text), plus the two safety nets

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase.
**Owner decisions** (owner feedback batch 2026-11-19b, `Owner feedback 2026-11-19b decisions.md`; canvas `frontend/zz-canvas/feedback-1119b.html` section "3" and its "Ten more, before and after" table):

- Item 3: **"Yes, all of it."** Follow-up after the second sweep: **"Scope: all pages, in three steps: 1. The game screen: both lists, including screen-reader text. 2. Player pages, error messages and emails, deck import first. 3. Admin pages, with a lighter touch."** This spec is step 1; 0114 is step 2, 0115 step 3.
- **Spelling:** "color" (American, as on the cards).
- **Dashes:** "the type-line dash stays, as printed ("Creature — Human Knight"); there are no dashes anywhere else." (Quoted card text keeps its printed dashes: the 2026-11-20 answer below.)
- **Numbers:** "printed game terms keep their digits ("Scry 2", "Crew 3", "Ward 2", "Main 1"); ordinary sentences use words." Read with the canvas's rule line, which the owner approved with the item: "counts of one to ten as words ("two cards"), game numbers as digits ("deals 3 damage")".
- Third pass: "The fix list is all three lists merged, with the owner's rules applied."
- **Safety nets (owner: "Both"):** "1. A CI check reads every player-visible string in the Lab traces. It fails on dashes (except the type line), " (N)" card numbers, "(s)", double spaces, "colour" and "Forge". 2. A worker cleanup step tidies the engine's pass-through wording before it is sent: strip "(N)", fix "(s)", trim spaces." Both go in this step.

- **Card-text dashes** (asked 2026-11-20, by prompt): **"Keep as printed."** Quoted card text keeps its printed dashes ("Landfall —", "Choose one —", "Ward—{2}"); our own sentences never use dashes. The CI check allows dashes only inside quoted card text and the type line.
- **Approved 2026-11-20** (owner, by prompt: "Approve all."). Build 0108 → 0115 in that order, one at a time, then release them together as 1.75.0.

## The fix list

**`docs/features/wording/0113-wording-table.md`**: 368 lines, ids `W1-001` to `W1-368`, generated 2026-11-20 from the three lists (outside the repo, in the working folder): `Window wording list 2026-11-19.md` (List 1: every flagged row of Parts 1 and 2, its extra findings, and Part 2 section 10's Forge pass-throughs marked rewritable), `... - second sweep.md` sections 2a and 2b (List 2; its deck-import "Forge" row moves to 0114 as the owner placed it), and `... - third pass.md` rows 1-46 and 54-59 (List 3). The owner's rules are applied to every "After": "color"; the type-line dash only; corrections from List 3 §5 and List 2 §3 replace the rewrites they overrule (named in each row's "Why"); counts above ten turned back to digits. The table is now the source: it is edited by hand from here, and the generator is not kept.

Each row is either an exact line (in quotes) or, for a family of lines (a Forge pass-through, "one clean-up on every prompt"), the builder's instruction; the builder records the exact words chosen for every instruction row in As built. Two rows are done by spec 0108 and are only checked here: `W1-002` (the "(Targeting: …)" clause) and the copy count it touched.

A few lines from the table, as the player will read them (canvas "3", "Ten more, before and after"):

| Where | Today | After |
|---|---|---|
| Report window (`W1-141`, the owner's example) | RudeLeft looked at the top 2 cards of their library, put Island into their graveyard and a card into their hand. | RudeLeft looked at the top two cards of their library, putting an Island into their graveyard and the other card into their hand. |
| Report window (`W1-142`) | Bob revealed the top 4 cards of their library: Goblin Matron into their hand and 3 on the bottom. | Bob revealed the top four cards of their library, putting Goblin Matron into their hand and the other three on the bottom. |
| Paying a cost (`W1-223`) | Put 2 Charge counter on Pentad Prism? | Put two charge counters on Pentad Prism? |
| Paying a cost (`W1-229`) | Exile 2 from your Hand. | Exile two cards from your hand. |
| Act button (`W1-036`) | Next / Nothing can attack · to Main 2 | Next / Nothing can attack. On to Main 2. |
| Crewing (`W1-240`) | Crew 3: tap creatures with total power 3 or more (2 so far) -- or Done. | Crew 3: tap creatures with total power 3 or more (2 so far), or choose Done. |
| Report window (`W1-316`, List 3 row 1) | Karplusan Minotaur effect's value for Alice is win. | Alice won the flip. |
| Stack close-up "Why" (`W1-321`, List 3 row 6) | Damage Source: Grizzly Bears, Damaged: Bob, Amount: 2 | Grizzly Bears dealt combat damage to Bob |
| Ability menu (`W1-331`, List 3 row 16) | Forest · no cost · Play land by Courser of Kruphix (50) | Play this land from the top of your library (Courser of Kruphix) |
| Screen reader (`W1-271`, List 2 2a) | "left brace T right brace colon Add left brace R right brace" | "Tap: add one red mana." |

## Why (researched)

`Owner feedback 2026-11-19b research B.md` item 3 and the three lists (SOURCE for templates; RUN for List 3's 1,832 distinct strings from 2,226 current traces, worker 1.72.0 / 1.73.0). Re-read at main 1f813795 for the files below; 1.74.0 added words (spec 0104's "Choosing from your hand", the hand-exile report, spec 0107's trample window) that the builder checks against the same rules.

- **Where the words come from** (SOURCE, research B). Worker: `ActionReports.sentence`, `destinations`, `rest`, `bounced`, `cardWords`, `fizzleSentence` (report windows); `Causes` (reveal titles and "why"); `PlayLog` (the play log); `MatchController` (`targetPrompt`, `describe`, `confirmTrigger`, `chooseNewTargetsFor`, `choicePrompt`, `toldValue`, `alternativeCostLine`, `selectTargets`); `CombatChoices` (`blockRefused`), `ManaPayment`, `MatchCostDecision`, `NumberCosts`; `PlainWords` (`humanise`, `payFor`); `WhyNot`. Server: `AskingWords.doingWord`. Page: `matchText.tsx` (`headingFor`, `hintFor`, `targetWords`, `resultText`), `battlefield/stops.ts` (`passWords`, `waitingLine`, `gameOverWords`, `LOSS_WORDS`), the windows and trays (`QuestionWindows.tsx`, `TriggerWindows.tsx`, `CardTrays.tsx`, `cardPlans.ts`, `DiceWindows.tsx`, `OpeningHand.tsx`, `RevealTray.tsx`), `GameScreen.tsx`, `abilities.ts`, `zoneTray.ts`, `StatusTray.tsx`, `GameChat.tsx`, `fights.ts`, and the screen-reader text in `ManaCost.tsx`, `Board.tsx`, `StatusTray.tsx`, `CardBadges.tsx`, `PoisonBadge.tsx`, `thisTurn.tsx`.
- **Why it drifted** (SOURCE, research B "Root causes"): no shared number-word helper (Forge's `forge.util.Lang` has `getNumeral`, `nounWithNumeral`, `startsWithVowel`, used in few places; the page has only `DiceWindows.tsx`'s private `NUMBER_WORDS`); card names joined bare (`and(...)` with no article; a hidden card "a card" beside a named one); Forge's own words passing through (counter names "Charge", zone names "Hand", type shorthand, `TargetChoices.toString()` and `Card.toString()` with card numbers, `OptionalCostValue.toString()`'s en dash); " · " used as a joiner inside sentences.
- **What only real games show** (RUN, List 3 §3a): Forge's raw value words in report windows (`MatchController.toldValue`'s fallback to Forge's `MessageUtil.formatNotificationMessage`), Forge's debug labels in the stack close-up's "Why" (`Causes.why`'s fallback to `Trigger.getImportantStackObjects`), card numbers on play buttons (`MatchController.describe(SpellAbility)`), an empty card name in the pay title (`ManaPayment.offerPurpose` / `PlainWords.payFor`), Forge's broken English in cost text ("Elfs", "creaturess", "a this creature", "a other").
- **The pass-through text** (SOURCE, List 2 2b and List 3 §4): Forge's English file (`build/forge/res/languages/en-US.properties`) has 48 templates with "(s)", 15 with " - " and about 450 with a digit placeholder; the worker fixes "card(s)" in one place only (`MatchController.chooseCardsForCost`). Cards outside the 275-card corpus can bring new ones: hence the two safety nets.
- **The type line** (SOURCE): `GameHost` turns Forge's " - " into " — " for the type line on purpose. The owner keeps it.

## What the player sees

Every window, the play log, the act button, the close-ups, the status tray and the screen-reader text read like a person wrote them: numbers one to ten in words in sentences ("two cards", "three time counters"), printed terms and game values in digits ("Scry 2", "Crew 3", "Main 1", "deals 3 damage", "20 life"); "an Island", "the other card"; no " · " inside a sentence; no dashes but the type line ("Creature — Goblin"); no card numbers, "(s)", braces, Forge's labels or the word "Forge"; "color". Example: after RudeLeft's Impulse-style spell, Alice's report window says "RudeLeft looked at the top two cards of their library, putting an Island into their graveyard and the other card into their hand." and her play log says the same thing in its own short form.

## Changes

### The rules, written down

- `docs/architecture/` gains a short `PLAYER_WORDS.md` (or a section in an existing page: the builder picks, one place): the owner's rules above, with the examples, and the exceptions: the type-line dash; printed card text quoted in a label or window keeps its own dashes (ability words, "Choose one —", keyword costs such as "Ward—{2}"; owner 2026-11-20, "Keep as printed"), while our own sentences never use one; " · " only between separate facts on a button or label ("Lightning Bolt · {R}"), never inside a sentence. AGENTS.md is not changed by this spec (it lists no wording rule today); the gate below enforces the rules.

### Helpers

- **Worker:** one number-and-article helper on Forge's `forge.util.Lang` (`getNumeral` for one to ten, digits above; `nounWithNumeral`; `startsWithVowel` for "a" / "an"), used by every sentence builder named above.
- **Page:** one `numberWord()` (taking over `DiceWindows.tsx`'s `NUMBER_WORDS`) and one mana-words helper for hidden and aria text ("one generic and two red"), used by `ManaCost.tsx`, `Board.tsx`'s pay pills and alt text, `CastingCard.tsx`'s pips and `StatusTray.tsx`.

### Safety net 2: the worker cleanup

- One function (say `PlainWords.tidy`) run on **every** player-visible string the worker sends that holds Forge pass-through text (question titles, prompts, option labels, report sentences built from Forge's words, stack descriptions, reasons, play-log pieces), at the point each frame is built: strip " (N)" card numbers (digits only: a card's own name with parentheses, "Hazmat Suit (Used)", is untouched), fix "(s)" by the count beside it (else the plural), " - " joining two parts to ": " (never inside a card name, never the type line), collapse double spaces, trim. It runs after the per-method rewrites in the table, so it catches what they miss. Card names in the string are read from Forge's cards, not guessed.

### Safety net 1: the CI check

- New `scripts/check-wording.py`, run in `ci.yml` over every Lab trace beside `check-kinds` and `check-hidden-tops`: reads every player-visible text field of `DECISION_REQUEST`, `MATCH_SNAPSHOT` (`action`, `reveal`, `stack`, `playLog`, `notices`, `passing`, `payments`, `players`, the card fields), `GAME_ENDED` and `ERROR` frames (Forge's own `GAME_LOG`, which goes only to the admin's game record, is not read), replaces card and player names with placeholders first (as List 3's method did), and fails on: an em or en dash or " -- " anywhere except the type line and quoted card text (owner 2026-11-20: card text Forge prints for the card, such as an ability's own text, a mode's text or a keyword's title, read from the fields that carry it and matched against the card's own text; never a sentence the worker or the page writes), " (N)" card numbers, "(s)", a double space, "colour" / "Colour", and "Forge". It prints each hit with its trace and field. A `--self-test` with one case per rule. Built first, in report-only mode; switched to failing when this spec's lines are done (build order).

### The lines

- Every row of `docs/features/wording/0113-wording-table.md`, in the build order below. Exact-string tests that assert today's words are updated to the new ones; any test that matched English to decide behaviour is a PROTO-006 defect and is changed to read the field it should.

## Rules and boundaries

- **PROTO-006:** no page behaviour may hang on the changed words; the builder greps the page and the e2e helpers for every changed string used as a locator or a condition (e2e `getByText` on window words especially) and moves them to roles or data attributes.
- **HID:** words only. The rewrites that name a hidden card ("the other card", List 3 row 22's face-down exile) must name nothing more than today's frames carry; `check-hidden-tops.py` and `check-hidden-log.py` over the step's Lab traces stay clean.
- **No "Forge" in player text** (owner rule; admin and logs exempt): the CI check enforces it in the game frames.
- **VEND-001:** Forge's English file is never edited; every rewording is in the worker, keyed on the method, kind or ApiType (List 1 Part 2 §10).

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0113-A | The CI check: `check-wording.py --self-test` (one case per rule; the allowed type line; an allowed "Landfall —" in quoted card text; a failing dash in a sentence of our own); then over the full ci.yml Lab list's traces on this spec's final code: zero hits | `scripts/check-wording.py`; CI's run of the commit (TEST-013) |
| F-0113-B | The cleanup: worker unit cases for " (68)" stripped, "Hazmat Suit (Used)" untouched, "card(s)" by count ("1 more card(s)" → "one more card"), "Elfs"-style text left to its own table row, " - " to ": ", double and trailing spaces | worker unit `PlainWordsTest` (or the builder's name) |
| F-0113-C | Worker sentences: every worker row of the table (List 1 Part 2, List 2 2b, List 3 §3a and §4) has an exact-string unit test or a Lab assertion of its new words; the As built's ledger names the test per row id | worker unit tests; the Lab scripts that already read report text (`check-what-happened.py`, `check-play-log.py`, `check-surveil.py`, `check-modes.py`, `check-game-flow.py`) updated |
| F-0113-D | Page words: every page row (List 1 Part 1, List 2 2a, List 3 §3b) has a vitest assertion of its new words, screen-reader text included (read from `aria-label`, alt and visually hidden text) | vitest, per file (`stops.test.ts`, and new ones such as `matchText.test.ts`) |
| F-0113-E | Re-read the real strings: List 3's method rerun over the step's fresh traces (every distinct player-visible string, names as placeholders) and checked against the rules: zero hits, and every List 3 row's "Today" shape gone | the builder's run, recorded in As built (TEST-013) |
| F-0113-F | Hidden information: `check-hidden-tops.py`, `check-hidden-log.py` and `check-hidden-hands.py` clean over the traces; both seats read (HID-003) | the CI checks |
| F-0113-G | Real-click game (TEST-012), below | `match-wording.spec.ts` |

**TEST-004 (bites):** the cleanup removed (B fails, and `check-wording.py` over the traces fails on " (N)" and "(s)"); each rule of the check disabled in turn (its self-test case fails); the article helper returning "a" before a vowel (C fails on `W1-141`); `numberWord` returning digits (D fails). About a dozen page and half a dozen worker mutations in all (TEST-004 scope), not one per line.

**Real-click game (TEST-012).** Spec 0098's exact deal. The host **really clicks** an Impulse-style look-at-the-top spell (the owner's example) and the guest's report window reads `W1-141`'s words; the host really clicks a card with a counter cost (`W1-223`'s Pentad Prism style) and the cost window reads "Put two charge counters on …?"; the act button reads "Nothing can attack. On to Main 2." at the right moment; the guest reads a play-log line with "an" before a vowel card name. The test reads the words from the windows' roles, never locates by them. Clip: one normal-speed clip per seat; stills of each window read.

## Out of scope

- Player pages, server error sentences, emails and /status (0114); admin (0115).
- New windows, new layouts, or any change to what a window shows beyond its words.
- Forge's English file itself (VEND-001).

## Open questions

None. Card-text dashes were answered 2026-11-20: kept as printed (Owner decisions).

## Build order notes

First of the three wording steps, after 0112. Inside: (1) the CI check in report-only mode and the cleanup; (2) the helpers; (3) report windows and the play log (List 1 Part 2 §1-4, List 3 rows 1-15 and 22): the owner's example first; (4) questions, costs, buttons and reasons (List 1 Part 2 §5-8 and §10, Part 1 §1-10, List 3 rows 16-21, 23-35, 54-59); (5) the rest of the game screen and the screen-reader text (List 1 Part 1 §11-24, List 2 2a and 2b, List 3 §3b); (6) the CI check switched to failing; the real-click game. Each part is one reviewable commit.

## As built (2026-11-20)

Built on main at 5d9d48e1 (Spec 0112), not committed. Labels: SOURCE (read in the code), RUN (run here, this build). Built by a lead and four builders working in one tree (worker words; page windows; page board and screen-reader text; the real-click game); the ledger below says which built each row.

### (1) The two safety nets

- **Safety net 2, the worker cleanup** (SOURCE). `PlainWords.tidy(text, names)`: strips a card number " (68)" after a word with a capital (digits only, so "Hazmat Suit (Used)" and a value such as "power (5)" stay); fixes "(s)" by the count a word or two before it ("Up to 1 more card(s)" → "Up to one more card"), else the plural; turns a joining " - " into ": ", a type line's into the printed "—" ("Creature - Goblin" → "Creature — Goblin"); collapses runs of spaces, drops a space before punctuation, trims. A card name holding a bracket or a spaced hyphen is masked first, read from Forge's cards (`GameHost.namesToKeep`, cached per game and card count), so it is never touched. It runs after every rewrite of ours: `WorkerMain` on each question's `prompt`, option `label`, `refused`, `notNow` label and why, `unavailable` reasons and `about` (`GameHost.tidyAbout`: effect, then, pay, act, from); `GameHost.tidyTexts` on every board, each seat's and the public one (report window `said` / `title` / `why` and gathered ones, card `toSaid`, reveal tray, stack and copies `description` / `why`, moves' and left stack's `why`, hand `costWhy`, `passing.why`, notices, players' `command`, the play log's text pieces with their edge spaces kept). Card fields (name, types, printed text) are never walked. Forge's own question templates are reworded before it in `PlainWords.forgeWords` / `PlainWords.brokenEnglish` (Decided 4).
- **Safety net 1, the CI check** (SOURCE). `scripts/check-wording.py`: every string in `DECISION_REQUEST`, `MATCH_SNAPSHOT`, `GAME_ENDED` and `ERROR` frames (never `GAME_LOG`), card and player names collected from the traces (`name`, `source`, `exiledBy`, `faces`, START_GAME's decks, play-log name and player pieces) and replaced by a placeholder; play-log lines checked joined, as the page joins them. Rules: `dash` (em or en dash, " -- ", or a spaced hyphen, Decided 22) except a type line (the words before it are card types, "Emblem" included) and printed card text (the one or two words before the dash found in the card's Forge script, read with `--res`, or in a printed field the frames carry: `keywords`, `gained`, `says`, a mode's `text`); `number` (" (N)" after a placeholder or a word with a capital); `maybe` ("(s)"); `spaces`; `colour`; `forge`. Each hit prints trace, line, frame field, rule and text. `--self-test`: 18 cases, one per rule and each exception (the type line; "Landfall —" quoted from a card; "Ward—{2}"; a failing dash in a sentence of ours; a card's own brackets; a value in brackets; GAME_LOG not read; a play-log line joined; a player piece). Built report-only first (`--report-only`, exit 0 with hits), then switched to failing: ci.yml runs `--self-test` in the checks job and `check-wording.py --res "$res"` over every Mechanics Lab shard's traces beside `check-kinds`.

### (2) The helpers

- **Worker** (`PlainWords`, on Forge's `forge.util.Lang`): `number` (one to ten as words via `Lang.getNumeral`, zero "zero", else digits), `capitalNumber`, `count` ("two cards"), `some` ("a card", "an Island", "two cards"), `article` / `withArticle` (`Lang.startsWithVowel`, with "a one-shot", "a unicorn", "an 8/8"), `plural` (`Lang.getPlural` plus Elves, Wolves, Dwarves...), `and`, `or`. The sentence builders' private number tables and joiners now call them (`ActionReports`, `PlayLog`, `Causes`, `MatchController`, `MatchCostDecision`, `CombatChoices`, `ManaPayment`, `PriorityStops`, `Skips`).
- **Page** (`frontend/src/words.ts`): `numberWord`, `capitalNumber`, `capital`, `ordinalWord` (took over `GameScreen.tsx`'s private one), `timesWord`, `plural`, `countWords` ("no cards" for zero), `someWords`, `article`, `withArticle`, `andList`, `orList`, and for mana `symbolWords`, `manaSymbols`, `manaWords` ("one generic and two red"), `manaTextWords` / `manaTextParts` (a line's symbols in words: "Tap: add one red mana."), `pictureSymbol`. `DiceWindows.tsx`'s private `NUMBER_WORDS` is gone. Used by `ManaCost.tsx` (`ManaText`'s hidden text, `ManaCost`'s aria-label), `Board.tsx` (pay and owe pills, pip alt text, "Makes green or blue mana"), `CastingCard.tsx` pips, `StatusTray.tsx` (`poolWords`), and every window and tray file below.

### (3)-(5) The lines

Every row of `docs/features/wording/0113-wording-table.md`; the exact words of every row, and the words chosen for every instruction row, are in the ledger below. Worker (parts 3 and 4): `ActionReports` (report sentences: "putting ...", counts as words, "an Island", "the other card", "three Goblin Pikers"), `PlayLog` (counts, "another card" / "two other cards", the control line for Act of Treason, "An Island" for one basic land), `Causes` (`whyWords`: Forge's debug labels said as sentences, W1-321..W1-327; `revealTitle`), `MatchController` (`valueWords` for Forge's raw values W1-316..W1-320, `onStackWords`, `yesLabel` input, `targetPrompt`, `describe`, the mulligan, divide, mana, dice, scry, surveil, vote and pile questions), `MatchCostDecision` (every cost prompt: "Put two charge counters on Pentad Prism?", "Crew 3: tap creatures with total power 3 or more (2 so far), or choose Done."), `CombatChoices` (`blockRefused`, trample note), `ManaPayment` / `PlainWords.payFor` (pay titles), `PriorityStops.nothingToPlay`, `PlainWords.stackDescription` (Forge's source marks and a dungeon room's "[Room: X]" dropped). Page (part 4's windows, part 5): `matchText.tsx`, `QuestionWindows.tsx`, `TriggerWindows.tsx`, `CardTrays.tsx`, `cardPlans.ts`, `DiceWindows.tsx`, `Die3D.tsx`, `OpeningHand.tsx`, `RevealTray.tsx`, `discard.ts`, `stops.ts`, `AwayWindow.tsx`, `GameChat.tsx`, `ReportDialog.tsx`, `match.ts` (`awayEndText`); `GameScreen.tsx`, `Board.tsx`, `StatusTray.tsx`, `playerMarks.tsx`, `PoisonBadge.tsx`, `CardBadges.tsx`, `FanCards.tsx`, `SpellMarks.tsx`, `ManaCost.tsx`, `CastingCard.tsx`, `abilities.ts`, `zoneTray.ts`, `thisTurn.tsx`, `fights.ts`, `manaBalls.tsx`, `payPicks.ts`. No window, pill or layout added; data attributes added for tests, never shown: `.gs-seat` `data-library` and `data-priority`, the ladder's `data-game`, the status list's `data-whose`.

### PROTO-006

- **Page code reading the worker's words** (SOURCE): `triggers.ts` `confirmTitle` makes a yes/no window's title from the yes label; `StatusTray.tsx` `shortName` / `fullName` read "(room: X)" and "Emblem —" out of the command text; `matchText.tsx` `winWords` reads Forge's "has won due to effect of 'X'"; `cardPlans.ts` `plainPrompt` strips "You are looking at" (now with or without its colon); `abilities.ts` `abilityParts` splits a label on " · ". None of them decides game behaviour (they shape words), and the rows that would have broken them were left (W1-216, W1-202's button, W1-247, W1-269: Spec mismatches).
- **e2e locators and conditions moved off words**: `match-mindslaver` finds the dialog by role and asserts its accessible name; `match-status-list` finds each player's list by its new `data-whose` and asserts its name; `match-away` the alertdialog likewise; `match-alternate-win` reads the plate's `data-library="0"`; `match-mana-colours` counts plates with `data-priority="true"`; `match-karn` waits on the ladder's `data-game="2"`; `match-many-triggers` reads "Yes to all seven" with a count helper and answers a lone trigger's target window by its `data-kind`; `match-opening-hand` branches on the window's `data-kind`, then asserts the title. The others only had their asserted words updated: `match-always-choose`, `match-big-combat`, `match-board-motion`, `match-dice`, `match-loyalty`, `match-many-triggers` (its "from" line parse now strips ": N copies on the stack"), `match-modes-doing`, `match-numbers`, `match-passing`, `match-sacrifice`, `match-stack-rests`, `match-watching`, `match-what-happened`, `match-window`; and, found by the lead's grep and runs, `match-play-log` ("drew two cards"), `match.spec.ts` ("Card three of seven in Pat's hand"), `match-status-list` ("Undercity: in Secret Entrance") and `match-always-choose`, whose reveal filter now reads "Revealed by Appetite for Brains" (W1-160; still a filter by the window's words: no field says whose reveal a window is, left as it was).
- **Lab scripts** that located or asserted the changed words were updated (listed under the files); `check-spell-choices.py`, `check-always-choose.py` and `check-no-target.py` find a stack target by its `target:stack:` id, not "on the stack:"; `check-surveil.py` tells its pick question from its order question by " any cards " (both are `arrangeForSurveil` / `arrangeForScry` with the same `arrange`, so no field tells them apart); `check-unreachable.py` reads the ante notice without case.

### Tests and runs

- **F-0113-A (RUN).** `check-wording.py --self-test`: 18 cases, PASSED. Over the full ci.yml Lab list's traces on this spec's final worker: **0 hits** in 362,439 player strings read from 432 traces (the full list run once, `lab2`; the 15 scenarios touched after it and `piles` run again on the final jar and put in place of theirs: `cost-kinds`, `pay-picks`, `mana-balls`, `players`, `always-choose`, `modes`, `dice`, `who-did-it`, `surveil`, `unreachable`, `spell-choices`, `costs`, `agent-of-kotis`, `play-log`, `what-happened`; 0 hits in those alone too). The bite: the same check over the 1.74.0 release run's 406 traces (the worker before this spec, `--report-only`) finds 11,662 hits, 1,050 distinct (dash 5,041, card number 5,899, "(s)" 19, double space 699, "colour" 4).
- **F-0113-B (RUN).** `TidyTest` (8 tests): " (68)" stripped and "Hazmat Suit (Used)" kept, "power (5)" kept; "1 more card(s)" → "one more card", "Up to 1 more card(s)" → "Up to one more card", plural with no count; "Elfs" left to `forgeWords` (W1-338); " - " → ": ", the type line → " — ", a hyphen inside a name kept; double, trailing and pre-punctuation spaces; the number and article helpers; a dungeon room's stack words. `mvn -q -o test` green.
- **F-0113-C (RUN).** `Words0113Test` (48 tests) holds the exact new words of most worker rows; `ActionReportsTest`, `PlayLogTest`, `PlainWordsTest`, `ThrownAwayTest` updated to the new words. Rows whose words are built inline in a cost or question method (MatchCostDecision's prompts, several MatchController questions) are proved by the Lab instead: the Lab scripts that assert them were updated and pass on the final worker (`check-you-choose` all 33 scenarios, `check-cost-kinds`, `check-costs`, `check-blocks`, `check-surveil`, `check-turn-ends`, `check-card-actions`, `check-quiet-reports`, `check-thrown-away`, `check-tracked-state`, `check-shapes`, `check-results`, `check-panglacial-wurm`, `check-what-happened`, `check-who-did-it`, `check-unreachable`, `check-spell-choices`, `check-always-choose`, `check-no-target`), and the rest were found word for word in the fresh traces (ledger). Rows left with no test and not met in a trace are marked so in the ledger.
- **F-0113-D (RUN).** `frontend/src/battlefield/wording0113a.test.tsx` (55 tests: windows, trays, buttons, stops, game over, opening hand, dice, away), `wording0113b.test.tsx` (47 tests: the game screen, the board, close-ups, status tray and screen-reader text read from `aria-label`, alt and visually hidden text), `frontend/src/words.test.ts` (5 tests); about 35 existing exact-string tests updated to the new words. vitest: 122 files, 1,759 tests, green.
- **F-0113-E (RUN), List 3's method rerun.** `wording3`'s extraction and checks (every distinct player-visible string of the four frame types, names as placeholders) over the same 432 fresh traces: 1,920 distinct shapes. Every List 3 row's "Today" shape (W1-309..W1-313, W1-316..W1-349, W1-362..W1-367) is gone: probed one by one, none is left in a field the page shows. The heuristic flags left (254 shapes) are, on reading them: printed card text (modes, keyword titles, "Landfall —", "Cumulative upkeep —", rules text digits such as "mana value 3"); game values and positions ("X = 3", "Roll: 4", "Needs 6 loyalty (it has 3)", "Assign damage 2 of 5", "Crew 1", "Scry 2"); Forge's "[Zone Changer: X]"-style bracket at the end of a stack description or order-tray label, which the page drops (`triggers.ts` `stackWords` / `abilityWords`); Forge's own "Increase or decrease result 2 by 1" (dice nudge, die values); `GAME_ENDED.reason` (W1-269, not built); and an `ERROR` frame's unresolved-card list (deck import, spec 0114). Two shapes found here were fixed in this build: "Choose 1 untapped Island ... (or: Sacrifices Lotus Atoll)" → "Choose one untapped Island ... (or sacrifice Lotus Atoll)", "tap 2 creature" / "tap 5 Elf" → "tap two creatures" / "tap five Elves", Forge's "Creature 1 / 2" → "1/2 creature" in labels, "(1 left)" → "(one left)" on a floating-mana button, untidied `notNow` labels ("creaturess"), a dungeon room's stack words; all checked again on the final jar.
- **F-0113-F (RUN).** Over the 432 final traces: `check-hidden-tops.py` no problems (153 library tops, 282 known tops, 1,096 gathered reports, 5,778 report cards), `check-hidden-log.py` OK (22,575 play-log lines, 19,174 cards named, each named in that seat's own snapshots), `check-hidden-hands.py` OK (10,525 hand-card sightings, both seats compared round by round), `check-snapshot-first.py` OK, `check-hidden-mulligans.py` and `check-kinds.py` OK on the full run. "The other card" names nothing (W1-141's hidden card is a back in the guest's report, seen in the real-click game).
- **F-0113-G, the real-click game (TEST-012; RUN).** `frontend/e2e/match-wording.spec.ts`, deck `protocol/fixtures/wording-deck` (28 Island, 24 Swamp, 4 Nagging Thoughts, 4 Weaponcraft Enthusiast; built in CI, ci.yml), dealt (spec 0098; the host's library alternates Swamp and Island so Nagging Thoughts sees one of each whoever goes first). The host's act button in its first Main 1 with nothing to attack reads "Next" / "Nothing can attack. On to Main 2." (and its name "Pass: Next. Nothing can attack. On to Main 2."); the host really clicks Nagging Thoughts, pays with real land clicks, and really clicks the Swamp in its tray, so the guest's report window reads "RudeLeft looked at the top two cards of their library, putting an Island into their graveyard and the other card into their hand." (title and region name; its cards a back "→ hand" and the Island "→ graveyard"); the host really clicks Weaponcraft Enthusiast and its cost window reads "Put two +1/+1 counters on Weaponcraft Enthusiast?" with "Fabricate: Create two 1/1 colorless Servo artifact creature tokens." and "Put" (Decided 21); the guest's play log reads "An Island went from RudeLeft's library to their graveyard". Words read from roles, classes and data attributes, never located by them. **Three runs in a row green on the final build** (58 s, 204 s, 90 s; three earlier in a row, 43 s, 160 s, 48 s, before the last page fixes). Before them, the test itself was made to wait for what it reads (TEST-013, a flake is a defect; all three were the test's own races, none the product's): the guest's report window came in between the test's look and its "put away any report" branch, which closed it unread (found in run 6's trace: the report was in the page's DOM at the close, tens of milliseconds after the look), now looked at again before closing and also opened from the window's earlier rows; Fabricate's window could come in between the test's look and its catch-all answer, now never answered below; a cast that did not go through let a draw shift the deal so Nagging Thoughts saw two Islands, now kept either (one Island still goes to the graveyard, the sentence the same); and the test now fails at once, with what it saw, instead of playing a hundred turns.
- **Existing browser specs whose asserted words changed (RUN, headless bundled Chromium):** 25 specs, every one green on the final build: `match-alternate-win`, `match-always-choose`, `match-away`, `match-big-combat`, `match-board-motion`, `match-dice`, `match-karn`, `match-loyalty`, `match-mana-colours`, `match-many-triggers`, `match-mindslaver`, `match-modes-doing`, `match-numbers`, `match-opening-hand`, `match-passing`, `match-play-log`, `match-sacrifice` (2 tests), `match-stack-rests`, `match-state`, `match-status-list`, `match-stolen-picture`, `match-watching` (2 tests), `match-what-happened`, `match-window`, `match.spec.ts` (its existing `test.fixme` skipped). Getting there found eleven more places the words moved under a test, each fixed in the test (or, twice, in this build's page): the bots that cast by "Name · {cost}" read a list button's text, which the builders had changed in two ways (the hidden "Name: " prefix and mana said in the text), so the Laboratory Maniac game decked out without casting a spell (Decided 25, 26); "Revealed by Appetite for Brains" (`match-always-choose`); "Yes to all seven" and "Same target for all seven" counted in words, and a lone Goblin Arsonist's own target window now answered (`match-many-triggers`); "You can make three mana.", "You have three energy." (`match-loyalty`, `match-numbers`); counter kinds "first strike counter" (`match-loyalty`); "three poison counters", "the monarch" (`match-state`); "Undercity: in Secret Entrance", a graveyard "empty" or "three cards", and the status lists found by a new `data-whose` instead of their names (`match-status-list`); a graveyard "one card" (`match-stolen-picture`); "drew two cards" (`match-play-log`); "Card three of seven in Pat's hand" (`match.spec.ts`); "Keep these seven" (`match-passing`).
- **Jump check (RUN, headless bundled Chromium, nothing else running):** `frontend/tools/jumps` (headless bundled Chromium) over seven fresh traces from the final worker, both seats (`cost-kinds-crew`, `pay-picks-voice`, `surveil-fame-away`, `what-happened-counters`, `what-happened-decking`, `what-happened-ringleader`, `who-did-it-ponder`): 1 passed (5.7 min), the replay covering among others 139 draws, 44 plays to the battlefield, 40 casts to the stack, 36 resolutions and 4 spells to the graveyard. `scripts/check-jumps.py` found no jump, pop-in, blink or unseen move (exit 0). Words only, as expected.
- **Clips and stills (RUN):** run 9 of the real-click game, one normal-speed clip per seat and a still of each window read (act button, the host's dig tray, the guest's report window, the host's cost window, the guest's play log). Read here: every line fits its window, nothing is cut or overflows; the act button's sub wraps "Nothing can attack. On to" / "Main 2." inside the button; the report window's sentence takes two lines; the cost window's title three.
- **Mutations (TEST-004; RUN): 29 of 29 caught** (`mutations.txt` in the handover): page 13 of 13 (the number and article helpers, the mana words, W1-036's joiner, W1-024, W1-131, W1-052, W1-082, W1-271, W1-275, W1-277, W1-304, W1-280), worker 7 of 7 (the cleanup removed, the board's cleanup pass removed, the article always "a", `number` returning digits, the hidden card not "the other card", `forgeWords` doing nothing, `valueWords` giving Forge's raw value), and check-wording.py 9 of 9 (each rule off in turn, the quoted-card-text exception allowing any dash, the type-line exception gone, GAME_LOG read). Each with an unmutated control run first.
- **Gates (RUN):** frontend `npx tsc -b`, `npx eslint . --max-warnings=0`, `npx prettier --check src e2e tools`, `npx vitest run` (122 files, 1,759 tests); worker `mvn -q -o test`; `python -I scripts/check-doc-refs.py`; `check-wording.py --self-test`. Server `./gradlew -q :server:ktlintCheck :server:detekt :server:test` green with the local stack stopped (no server file changed).

### The ledger: each row, its words and what proves it

Built by: worker / page1 / page2 (the builders), lead (integration). "Proved by" names the test (worker tests in `forge-worker/src/test/java/net/barnflix/proxic/worker/game/`, page tests in `frontend/src/battlefield/` unless a path is given); "code" means checked in the source only. Rows whose new words were also found word for word in this build's Lab traces (RUN): W1-173: 'a face-down creature' in `face-down.jsonl`; W1-187: 'Multikicker' in `cost-kinds-chalice.jsonl`; W1-190: '(two more needed)' in `anywhere-unearth.jsonl`; '(up to one more, or pass)' in `combat-choices-exert-last.jsonl`; W1-191: " Or pass and don't pay." in `cost-kinds-gain-control.jsonl`; W1-207: 'Scry 2: choose any cards to put on the bottom of your library.' in `card-trays-scry.jsonl`; W1-208: 'Surveil 1: keep Island on top of your library, or put it into your graveyard?' in `card-trays-surveil.jsonl`; W1-209: 'Surveil 2: choose any cards to put into your graveyard.' in `surveil-fame-away.jsonl`; W1-210: '(Three left.)' in `card-trays-impulse.jsonl`; W1-211: 'Discard two cards from your hand.' in `anywhere-unearth.jsonl`; W1-213: 'Delve: exile cards from your graveyard, each paying {1}.' in `costs-delve.jsonl`; W1-221: '(trample)' in `combat-choices-trample-elf-plan.jsonl`; W1-233: '... (3 so far), or choose Done.' in `cost-kinds-evidence.jsonl`; W1-242: 'to pay its cost' in `agent-of-kotis.jsonl`; W1-247: 'Undercity (room: Lost Well)' in `tracked-state-initiative.jsonl`; W1-257: 'Choose ...' in `agent-of-kotis.jsonl`; W1-315: 'Creature — Goblin' in `anywhere-cycling.jsonl`; W1-349: 'Creature — Goblin' in `anywhere-cycling.jsonl`.

| Id | Built by | Status | The words (exact, or chosen for an instruction row) | Proved by | Note |
|---|---|---|---|---|---|
| W1-001 | page1 | done (already true after 0109; verified) | "Click a creature that isn't a Vampire, Werewolf or Zombie." | w0113a "W1-001: the non-Vampire hint names the creature" | `readNoun` from 0109 already did it; `articleFor`/`orWords` replaced by `words.ts` `article`/`orList` |
| W1-002 | worker | done (by 0108, checked) | the "(Targeting: ...)" clause is stripped by PlainWords.stackText (spec 0108) | PlainWordsTest#theTargetingNoteLeavesTheStackWords; Lab check-no-target.py slayer (run green) | no change here |
| W1-003 | worker | done | "Lightning Bolt on the stack" (a spell) / "Slayer of the Wicked's ability" (an ability); two alike get "(first)", "(second)" | Words0113Test.java#w1_003_183_250_onTheStack | see Decided 2 |
| W1-004 | page1 | done | "Choose a new target" | w0113a "W1-004..W1-008, W1-368: the headings" |  |
| W1-005 | page1 | done | "Splice a card onto it?" | same |  |
| W1-006 | page1 | done | "Choose a card to discard" | same |  |
| W1-007 | page1 | done | "Choose what to sacrifice" / "Choose what to destroy" | same; also fixes0112screen "Alice had no creature..." |  |
| W1-008 | page1 | done | "Choose how the coin lands" | same |  |
| W1-009 | page1 | done | "Choose up to one more target" / "Choose up to two more targets" | w0113a "W1-009 (and the 0109 note)..."; QuestionWindows.test, fixes0109screen updated |  |
| W1-010 | page1 | done | "There is nothing you can do right now. Pass to go on." | w0113a "W1-010..W1-022: the hints" |  |
| W1-011 | page1 | done | "Tap a land or another mana source, or use mana you already made. Cancel (or Esc) takes back the whole spell." | same |  |
| W1-012 | page1 | done | "Assign the damage one point at a time. The game assigns none of it for you." | same |  |
| W1-013 | page1 | done | "Each kind of counter does something different. You have to choose one." | same |  |
| W1-014 | page1 | done | "The card does the mode you pick. If you can pass, passing means no more modes." | same |  |
| W1-015 | page1 | done | "Only these can be chosen. The line above says why." | same |  |
| W1-016 | page1 | done | "A mulligan draws a new hand of seven. Each time, you put one more card back." | same |  |
| W1-017 | page1 | done | "Choose one of these. None of them is a card on the board." | same |  |
| W1-018 | page1 | done | "Pick them one by one, in order. You have to put them all in order." | same |  |
| W1-019 | page1 | done | "You pay for the number you choose. Bigger numbers appear when you have the mana for them." | same |  |
| W1-020 | page1 | done | "Each target gets at least one. What is left goes to the targets after this one." | same |  |
| W1-021 | page1 | done | "Choose one of these numbers. You have to choose." | same |  |
| W1-022 | page1 | done | "Each extra time costs more and does more. You can also choose None." | same |  |
| W1-023 | page1 | done | digit counts in the card's words as words: "Click two creatures." ("up to 2" -> "up to two") | w0113a "W1-023: a digit count..." | `matchText.tsx` `countWord` |
| W1-024 | page1 | done | "Chosen so far: RudeLeft and Hill Giant" (one: "Chosen so far: Gryff Vanguard") | w0113a "W1-024, W1-026..."; fixes0109screen updated | reconciles the 0109 note's "One chosen: ..." (see 4) |
| W1-025 | page1 | done | "Done with two targets" / "Done with one target" / "Done with no target" | w0113a "W1-025: Done with two targets" (rendered ChoiceWindow) |  |
| W1-026 | page1 | done | missing player name: "the other player" | w0113a "W1-024, W1-026: chosen so far; never 'Seat 3'" |  |
| W1-027 | page1 | done | hidden prefix read aloud "Forgotten Cave: " (was "Forgotten Cave · ") | w0113a "W1-027, W1-028..." (rendered ListTray) |  |
| W1-027 | lead | changed back (lead) | hidden prefix "Forgotten Cave · " (two facts on one button) | wording0113a "W1-027, W1-028: the list's hidden card prefix and its line" | Decided 26 |
| W1-028 | page1 | partly (my file done) | QuestionWindows ListTray: "Dimmed ones can't be paid for right now." | same | GameScreen QuestionBar part is page2's |
| W1-028 | page2 | no longer exists (GameScreen part) | none | none | `GameScreen.tsx QuestionBar` has no "Dimmed" line; the only one is `QuestionWindows.tsx` (page1's) |
| W1-029 | page1 | done, kept | "Cast Fireball with X = 3" (unchanged) | w0113a "W1-029 (kept), W1-030, W1-296, W1-297" | row allows keep: "X = 3" is a game value on a dial (owner rule) |
| W1-029 | page2 | no longer exists (GameScreen part) | none | none | "with X =" only in `QuestionWindows.tsx` (page1's) |
| W1-030 | page1 | partly (my file done) | "Kick it once" / "Kick it twice" / "Pay it three times" (`timesWord`) | same; QuestionWindows.test updated | GameScreen QuestionBar part page2's |
| W1-030 | page2 | no longer exists (GameScreen part) | none | none | "Kick it / Pay it N times" only in `QuestionWindows.tsx` (page1's) |
| W1-031 | page1 | partly (my file done) | "Costs {cost}, which is more than you can pay now"; with no cost: "More than you can pay now" | w0113a "W1-031..." (rendered NumberWindow) | ManaText (page2's ManaCost.tsx) reads "{3}" alone as "Three generic" with a capital mid-sentence; needs ManaCost.tsx change: no capital when the run is not at a sentence start |
| W1-031 | page2 | no longer exists (GameScreen part) | none | none | "more than you can pay now" only in `QuestionWindows.tsx` (page1's) |
| W1-031 | lead | done (lead, ManaCost half) | screen-reader "Costs three generic" (a cost alone is not a sentence start) | words.test.ts "reads card text aloud without braces" | `words.ts` `manaTextWords` / `manaTextParts` |
| W1-032 | page1 | partly (my files done) | "No card has that name." (matchText NameSearch and QuestionWindows NameWindow) | w0113a "W1-032, W1-299: the name search" and "W1-032: the name window" | GameScreen part page2's |
| W1-032 | page2 | no longer exists (GameScreen part) | none | none | "No card is called that." only in `QuestionWindows.tsx` (page1's) |
| W1-033 | page1 | not mine | -- | -- | "CHOSEN" lives only in GameScreen.tsx (4786): needs GameScreen.tsx change: "Chosen" |
| W1-033 | page2 | done | look-window tag "Chosen" (was "CHOSEN") | none (QuestionBar's look branch needs a full decision; source-checked) | `GameScreen.tsx` QuestionBar |
| W1-034 | page1 | done | "Bob’s Lightning Bolt at you (and one more)" | w0113a "W1-034..."; stops.test updated | arrow became "at" |
| W1-035 | page1 | done | "Two attackers with 5 power coming" ("One attacker with 2 power coming") | w0113a "W1-035..."; stops.test |  |
| W1-036 | page1 | done | "Next" / "Nothing can attack. On to Main 2." | w0113a "W1-036..."; stops.test | exact row |
| W1-037 | page1 | done | "One moment" / "Resolving. Nobody can respond." (`RESTING_WORDS`) | w0113a "W1-037..."; e2e match-stack-rests updated | exact row |
| W1-038 | page1 | done | "Mulliganed three times" (`timesWord`) | w0113a "W1-038..."; stops.test |  |
| W1-039 | page1 | done | "Main 1, your turn" / "Main 1, their turn" / "Main 1, Bob’s turn" | w0113a "W1-039..."; stops.test, spectatorWords.test |  |
| W1-040 | page2 | done | word "Resolves in 3" (keeps the ring's digit); sub "Your Lightning Bolt. Click to resolve it now." / "Yours. Click to resolve it now." | T: "W1-040 and W1-292: your own spell's countdown" (`resolveWords`) | new exported `resolveWords` in GameScreen.tsx |
| W1-041 | page1 | not mine | -- | -- | string only in GameScreen.tsx 4480 "Nothing to play · {why}": needs GameScreen.tsx change: "Nothing to play: {why}" |
| W1-041 | lead | done (lead) | "Nothing to play: {why}" | fixes0097.test.tsx "Passing / Nothing to play: 2 lands, no land in hand; nothing top right" | GameScreen.tsx act area |
| W1-042 | page1 | not mine | -- | -- | only in GameScreen/Board ("{n} selected", "Click what they attack · Esc unselects"): needs GameScreen.tsx change: "Two selected" / "Click what they attack, or press Esc to unselect them" |
| W1-042 | page2 | done | "Two selected" / sub "Click what they attack, or press Esc to unselect them" (or "block") / aria "Two selected. Click what they attack, or press Escape to unselect them." | T: "W1-042: some selected, not yet pointed" (`markedWords`) |  |
| W1-043 | page2 | done | "Attack with two" / "5 power. Select more, or click one to take it back." | T: "W1-043, W1-044: attacking and blocking with some" (`combatWords`, now exported) |  |
| W1-044 | page2 | done | "Block with two" ("{n} power still gets through" kept: game value) | same test |  |
| W1-045 | page1 | not mine | -- | -- | "All attack" only in GameScreen.tsx 4339: needs GameScreen.tsx change: "Attack with everything" |
| W1-045 | page2 | done | "Attack with everything" | T: "W1-045: the all-attack button" (`ATTACK_ALL_WORDS`) | e2e locators use `button.gs-act-all`, not the words |
| W1-046 | page1 | partly (my file done) | sub "It goes back to your hand. Nothing is spent." (zone from the game) | w0113a "W1-046..W1-048: Cancel"; match.test updated | GameScreen's act adds " · Esc": needs GameScreen.tsx change: " (Esc)" |
| W1-046 | lead | done (lead, GameScreen half) | act sub "{cancel words} (Esc)" | source only | GameScreen.tsx cancel act |
| W1-047 | page1 | done | "The ability is not used. Nothing is spent." | same |  |
| W1-048 | page1 | done | "The trigger does nothing" | same |  |
| W1-049 | page1 | done | "Discard two" / "Click two cards to pick them" ("Discard one" / "Click a card to pick it") | w0113a "W1-049..W1-051"; fixes0061 updated |  |
| W1-050 | page1 | done | "One picked. Click one more." | same |  |
| W1-051 | page1 | done | "Discard two cards" | same |  |
| W1-052 | page1 | done | "Goblin Arsonist: seven copies on the stack" | w0113a "W1-052, W1-054, W1-057..." (rendered ConfirmWindow) |  |
| W1-053 | page1 | done | "Skip all seven" | w0113a "W1-053: Skip all seven" |  |
| W1-054 | page1 | done | "Yes to all seven" | w0113a "W1-052, W1-054, W1-057..." |  |
| W1-055 | page1 | done | "Goblin Arsonist: trigger one of seven" | w0113a "W1-055, W1-056, W1-301, W1-358..." (rendered CopyTargetWindow) |  |
| W1-056 | page1 | done | "Same target for all seven" | same |  |
| W1-057 | page1 | done | "At the other player" (fallback "the other player") | w0113a "W1-052, W1-054, W1-057..." |  |
| W1-058 | page1 | done | "Three triggers at once" | w0113a "W1-058, W1-059: the order tray" |  |
| W1-059 | page1 | done | "They are numbered in a sensible order: damage first, payments last. Click Done, or click them in your own order. The first one you click resolves first." | same |  |
| W1-060 | page1 | done | "Choose the order they go to your graveyard" | w0113a "W1-060, W1-063..." (rendered OrderCardsTray) |  |
| W1-061 | page1 | done | "Click them in order: 1 goes to the very bottom. Or click Any order. Click a numbered card to take it back." | w0113a "W1-061, W1-062: the bottom prompts" |  |
| W1-062 | page1 | done | "Click them in order: 1 ends up nearest the top. Or click Any order. Click a numbered card to take it back." | same |  |
| W1-063 | page1 | done | "{card}: only you can see these" / "Only you can see these" (order, scry, search trays) | w0113a "W1-060, W1-063..."; fixes0104screen updated |  |
| W1-064 | page1 | done | "Top card" / "Second from the top" / "Very bottom" / "Second from the bottom" / "Nearest the top" / "Second down" / "Second" (`ordinalWord`, "11th" above ten) | w0113a "W1-064..."; cardPlans.test updated |  |
| W1-065 | page1 | done | "Click a card to move it to the other row. In the top row, card 1 is drawn first. Click Sooner to move a card up." | w0113a "W1-065, W1-066: the scry tray" |  |
| W1-066 | page1 | done | "Top of library, in draw order" | same |  |
| W1-067 | page1 | done | "Look at Bob’s hand" | w0113a "W1-067..."; fixes0104screen, e2e match-always-choose updated |  |
| W1-068 | page1 | partly (my file done) | split tray pile label "Pile 1: three cards" | w0113a "W1-068: a split pile's label" | the zone tray group "{n} cards · newest first" is GameScreen.tsx 5793 (page2's) |
| W1-069 | page1 | done | "Pile 1: three cards, one face down" | w0113a "W1-069, W1-361: a pile to choose" |  |
| W1-070 | page1 | done | "Already filled in: enough to destroy each blocker, the rest to the player (trample). Use + and − to change it." | w0113a "W1-070..W1-072: the damage tray" |  |
| W1-071 | page1 | done | "Already filled in: enough to destroy each blocker in order, the rest to the last one. Use + and − to change it." | same |  |
| W1-072 | page1 | done | "after each blocker has enough to die" | not asserted separately (tile caption of a non-trample player tile); code `CardTrays.tsx` DamageTray | the rest of the row's words unchanged |
| W1-073 | page1 | done | "Each target gets at least one. Use + and − to change it." | w0113a "W1-073: the divide tray" |  |
| W1-074 | page1 | done | "Reroll for {1}" | w0113a "W1-074"; DiceWindows.test updated |  |
| W1-075 | page1 | done | "your roll of 4" | w0113a "W1-075, W1-306, W1-360..." (rendered DiceWindow) | the "{dieWord} {n}" caption unchanged (it is already a word and the roll) |
| W1-076 | page1 | done | "cranks in two turns" | w0113a "W1-076, W1-077"; DiceWindows.test, e2e match-dice updated |  |
| W1-077 | page1 | done | "On each of your turns, one sprocket cranks: 1, then 2, then 3, then 1 again." | same |  |
| W1-078 | page1 | done | "When cranked, it does what it says right away." | w0113a "W1-078, W1-079: the crank window" |  |
| W1-079 | page1 | done | "Click each one you want to crank, then click Don't crank for the rest." | same |  |
| W1-080 | page1 | done | "Four rooms, four deep: Yawning Portal (gain 1 life) to Throne of the Dead Three (...)" (no arrows) | w0113a "W1-080"; DiceWindows.test updated |  |
| W1-081 | page1 | done | "Choose modes: 3 of 5 paw prints used" | w0113a "W1-081..W1-084"; DiceWindows.test |  |
| W1-082 | page1 | done | "Choose two (one chosen)"; nothing in brackets before the first | same | see 3 |
| W1-083 | page1 | done | "Choose one to three (two chosen)" | same; e2e match-modes-doing updated |  |
| W1-084 | page1 | done | "Pick one more" | same (rendered ModesWindow) |  |
| W1-085 | page1 | done | " (2 paw prints)" | w0113a "W1-085" | paw-print count kept as digits, as the row says |
| W1-086 | page1 | done | "Bob mulliganed three times." (`timesWord`) | w0113a "W1-086: times in words" and "W1-086..W1-089" | `OpeningHand.times` now calls `timesWord`; OpeningHand.test updated |
| W1-087 | page1 | done | "Seven cards, three lands" (", mulliganed once" when you did), then "Bob mulliganed three times." | w0113a "W1-086..W1-089: keep or mulligan" (rendered OpeningHand) | see 3 |
| W1-088 | page1 | done | "Keep these seven" | same |  |
| W1-089 | page1 | done | "Draw seven again and put one back" | same |  |
| W1-090 | page1 | done | "Put two cards back" | w0113a "W1-090, W1-091" | e2e match-opening-hand condition updated |
| W1-091 | page1 | done | "Click the cards that go to the bottom of your library. Two more to go." | same |  |
| W1-092 | page1 | done | "Keep these five" | w0113a "W1-092, W1-093" |  |
| W1-093 | page1 | done | "The two you picked go to the bottom" / "The one you picked goes to the bottom" | same |  |
| W1-094 | page1 | done | "Begin with two in play" | w0113a "W1-094" | e2e match-opening-hand updated |
| W1-095 | page1 | done | "{player}, with {source card}" (RevealTray report and its rows; also QuestionWindows' sacrificed-before row) | fixes0075 "Bob's Unsummon..." ("Bob, with Unsummon"), fixes0088/0088screen, fixes0083screen, fixes0112screen updated | e2e match-sacrifice updated |
| W1-096 | page1 | done | foot: "or hold Space. Press R to replay" | fixes0103screen (toContain "Press R to replay") |  |
| W1-097 | page2 | done | further segments joined with ". " ("Draw a card. Then discard a card."), never " — " | T: "W1-097 and W1-098: ability lines without dashes or ' · '" | `abilities.ts joined()` |
| W1-098 | page2 | done | "Cycling: discard this card to draw a card." | same test; `abilities.test.ts` updated |  |
| W1-099 | page2 | done | "Target", "Blocking", "Attacking", "Tapped" (Board tags), "Target" (player plate tag) | T: "W1-099: the state tags are words, not code-like capitals" | source was upper case and no `text-transform` CSS existed: the tags now show mixed case (see Decided) |
| W1-100 | page2 | done | "Next: Pat's trigger. Three on the stack, one not shown." | T: "W1-100: the line under the stack" | `Board.tsx stackCaption` |
| W1-101 | page2 | done | "..., first to resolve" / "second to resolve" | T: "W1-101 and W1-293: ..." | Board's private `ordinal` removed, uses `words.ts ordinalWord` |
| W1-102 | page2 | done | "came in this turn: can attack next turn" | T: "W1-102, W1-294, W1-355: a card's aria ..." |  |
| W1-103 | page2 | done | "picked to tap. Click again to take it back." | T: "W1-103: a card picked to pay" (`payWords`) |  |
| W1-104 | page2 | done | "Kicked three times" / "Kicked twice" | T: "W1-104 and W1-107: the extra costs" | `SpellMarks.tsx extraWords` via `timesWord` |
| W1-105 | page2 | done | "Three more cards you may play: open the pile" | T: "W1-105: the +N fan card" |  |
| W1-106 | page2 | done | "3/3, with 2 damage" | T: "W1-106: the P/T line with damage" (`Inspect`) |  |
| W1-107 | page2 | done | Cast: "Kicked three times" | T: "W1-107, W1-108, W1-109: the stack close-up's facts" |  |
| W1-108 | page2 | done | "Resolves second" | same | GameScreen's private `ordinalWord` removed (words.ts's used) |
| W1-109 | page2 | done | "Three copies, resolving one after another" | same |  |
| W1-110 | page2 | done | "Bob's hand: the cards you can see" | T: "W1-110, W1-111, W1-288: the zone tray's title and count" |  |
| W1-111 | page2 | done | "Three cards, newest first" / "Empty" | same |  |
| W1-112 | page2 | done | "A +1/+1 counter", "Three time counters" (counterName, in words) | T: "W1-112: counter notes ..."; `zoneTray.test.ts` updated |  |
| W1-113 | page2 | done | "Empty: you lose if you have to draw" / "Empty: Bob loses if they have to draw" | T: "W1-113, W1-114: the library warning"; `SeeingWhatHappened.test.ts` updated |  |
| W1-114 | page2 | done | "Three cards left. Drawing from an empty library loses the game." | same |  |
| W1-115 | page2 | done | "the other player" (was "Seat {n}") | none (fallback only reached with a player id missing from the board) | `GameScreen.tsx nameOf` |
| W1-116 | page2 | done | " (Game 2)" after the turn | T: "W1-307, W1-287, W1-351, W1-116: ..." (real GameScreen) |  |
| W1-117 | page2 | done | "Bob, this turn" | T: "W1-117, W1-305: this turn, said and titled" |  |
| W1-118 | page2 | done | "The monarch draws a card at the end of their turn. Dealing combat damage to them takes it." / "The player with the initiative ventures into the Undercity each upkeep. Dealing combat damage to them takes it." | T: "W1-118: the monarch's rule in a sentence" | `playerMarks.tsx HOLDER_WORDS` |
| W1-119 | page2 | done | badge words in number words; an unknown counter "two acorn stash counters" (underscore to space) | T: "W1-119: a counter with no picture of its own" | `StatusTray.tsx countWords` |
| W1-120 | page2 | done | "The Ring has tempted Alice three times" (once/twice) | T: "W1-120, W1-122, W1-359: ..." |  |
| W1-121 | page2 | done | "The Ring: tempted three times" | T: "W1-121, W1-123: ..." |  |
| W1-122 | page2 | done | "...Command zone: The Ring; the Ring has tempted them three times" | T: "W1-120, W1-122, W1-359" |  |
| W1-123 | page2 | done | "Alice: in play for you" (aria and visible) | T: "W1-121, W1-123" |  |
| W1-124 | page2 | done | "Lost Mine of Phandelver: in Cave Entrance" (map title; list "Undercity: in Secret Entrance") | T: "W1-124: a dungeon's map ..."; `StatusTray.test.tsx` updated | `shortName`'s "Undercity · Lost Well" tile label kept (two facts on a label) |
| W1-125 | page1 | done | "Bob had to draw from an empty library" / "You had to draw ..." | w0113a "W1-125..W1-130"; stops.test |  |
| W1-126 | page1 | done | "Bob’s life reached zero" / "Your life reached zero" | same | only when the board has no life at or below 0 (else "life fell to -3", spec 0067) |
| W1-127 | page1 | done | "Bob got ten poison counters" | same |  |
| W1-128 | page1 | done | "Bob took 21 damage from one commander" | same |  |
| W1-129 | page1 | done | "Bob lost because of a card" | same |  |
| W1-130 | page1 | done | "Bob lost because a card made their opponent win" / "You lost because a card made your opponent win" | same |  |
| W1-131 | page1 | done | resultText: "You won on turn 5 because of Laboratory Maniac."; game over sub: "Alice won because of Laboratory Maniac" | w0113a "W1-131, W1-132" and "W1-131: game over..."; stops.test, e2e match-alternate-win updated | `matchText.winWords`; see 3 |
| W1-132 | page1 | done | "A player won..." / "A player conceded..." (spectator, name unknown); "Another player won..." (more than two seats) | w0113a "W1-131, W1-132" | see 3 |
| W1-133 | page1 | done | "Pat is back, or hasn't been gone ten minutes yet." | w0113a "W1-133..W1-135"; match.test updated |  |
| W1-134 | page1 | done | "Pat has been gone ten minutes" | same (rendered AwayWindow); e2e match-away updated |  |
| W1-135 | page1 | done | "End the game. You win." | same |  |
| W1-136 | page1 | done | "Play log (read only)" | no new assertion (GameChat logOnly header; rendering it needs the whole chat window) | e2e match-watching does not assert it |
| W1-137 | page1 | done | "Game chat, Proxic Arena" | fixes0064 "draws the same window..." updated |  |
| W1-138 | page1 | done | "Turn 3, RudeLeft (your turn)" | w0113a "W1-138" (rendered PlayLogView); fixes0064 updated | "(your turn)" sits in the existing `.gs-log-you` span |
| W1-139 | page1 | done | "Proxic 1.74.0, Chrome 131 on Windows · 1920×1080" (no " · " after the version) | not asserted (ReportDialog renders with screenshots and the account) | see 3 |
| W1-140 | worker | done | "Pat searched their library, putting a Forest onto the battlefield and a Forest into their hand, then shuffled." | Words0113Test.java#w1_140_searched | article only before basic-land names (Decided 1) |
| W1-141 | worker | done | "RudeLeft looked at the top two cards of their library, putting an Island into their graveyard and the other card into their hand." | Words0113Test.java#w1_141_theOwnersExample | exact |
| W1-142 | worker | done | "Bob revealed the top four cards of their library, putting Goblin Matron into their hand and the other three on the bottom." | Words0113Test.java#w1_142_revealedTheTop | exact; one card: "the top card" |
| W1-143 | worker | done | "Bob looked at the top three cards of their library and put them back in the order they chose." / "... the top card of their library and put it back." | Words0113Test.java#w1_143_reordered | - |
| W1-144 | worker | done | "Bob scried 2 and kept both on top." (one: "it", three or more: "them all") | Words0113Test.java#w1_144_145_scry | - |
| W1-145 | worker | done | "Bob scried 3, keeping one on top and putting two on the bottom." | Words0113Test.java#w1_144_145_scry | - |
| W1-146 | worker | done | "Bob surveilled 2, putting an Island into their graveyard and keeping the other card on top." | Words0113Test.java#w1_146_surveil | "an Island" (Decided 1), the row's example had no article |
| W1-147 | worker | done | "Bob drew three cards, then put two cards from their hand on top of their library." | Words0113Test.java#w1_147_148_153_counts | - |
| W1-148 | worker | done | "Bob milled three cards." (one: "a card") | Words0113Test.java#w1_147_148_153_counts; Lab check-card-actions.py mill ("You milled two cards.") | - |
| W1-149 | worker | done | "Alice countered a spell of yours." (hidden card; "of theirs" / "of Bob's") | Words0113Test.java#w1_149_aHiddenCounteredSpell | - |
| W1-150 | worker | done | "You exiled ten cards from Bob's graveyard."; out of exile: "You exiled Grizzly Bears." | Words0113Test.java#w1_150_151_returned | - |
| W1-151 | worker | done | "Bob returned Grizzly Bears to their hand and exiled Lightning Bolt."; no place known: "Bob returned Grizzly Bears."; counts "two cards" | Words0113Test.java#w1_150_151_returned | "somewhere" gone |
| W1-152 | worker | done | "Bob moved your Grizzly Bears." (no place known); "Bob put two cards on top of your library." | Words0113Test.java#w1_152_bounced; Lab check-quiet-reports.py (regex updated) | "moved ... somewhere" gone |
| W1-153 | worker | done | "Bob cycled Forgotten Cave and drew two cards." | Words0113Test.java#w1_147_148_153_counts | - |
| W1-154 | worker | done | "... phased out your Grizzly Bears and two other cards until your next turn." | Words0113Test.java#w1_154_157_cardWords | - |
| W1-155 | worker | done | zones via ActionReports.zoneWords: "hand", "library", "graveyard", "exile", "battlefield", "command zone", "sideboard" | Words0113Test.java#w1_155_zoneWords | used for EMPTY_LOOK, reveal titles, cost-reveal words |
| W1-156 | worker | done | "Bob's Fatespinner: you skip your next combat.", "Bob's Meditate: Bob skips their next turn.", "... your next two turns."; face-down: "Bob's face-down card: ..."; Forge's phase names mapped ("declare attackers step") | Words0113Test.java#w1_156_skip; ActionReportsTest#aSkipIsToldAsItsEffectResolvesInTheSpecsWords; Lab check-turn-ends.py (updated, green) | - |
| W1-157 | worker | done | "three Goblin Pikers", "two Grizzly Bears", "two copies of Light Up the Stage"; hidden beside named "the other card" / "the other two cards" (destinations) or "another card" / "two other cards" (lists) | Words0113Test.java#w1_154_157_cardWords | no "×" in sentences (Decided 3) |
| W1-158 | worker | done | "Bob chose white and blue." | MatchController.toldValue (no unit seam); Lab check-card-actions.py color (one color) | partly proven: multi-color only by code reading |
| W1-159 | worker | done | unknown value: "{name} chose {value}." (never "X effect's value for Y is Z") | Words0113Test.java#w1_158_159_316_320_values (null case) | - |
| W1-160 | worker | done | "Revealed by Goblin Ringleader" | Words0113Test.java#w1_160_revealedBy; Lab check-what-happened.py ringleader (updated, green) | - |
| W1-161 | worker | done | "Looking at Alice's hand" with our zone words | Words0113Test.java#w1_161_328_330_366_367_revealTitles | - |
| W1-162 | worker | done | "Pat revealed Llanowar Elves from their hand." (full stop) | Words0113Test.java#w1_162_revealSaid; PlainWordsTest#aCostRevealSaysWhoWhatAndWhy (updated) | "their" for the reader's own: still never shown to them |
| W1-163 | worker | done | "Goblin Token moved" (Zone Changer) | Words0113Test.java#w1_163_265_321_327_why | - |
| W1-164 | worker | done | "Bob drew seven cards", "You drew an Island and two other cards" (lead: one basic land takes "an", Decided 1) | Words0113Test.java#w1_164_165_playLogLists; PlayLogTest (updated) | - |
| W1-164 | lead | changed (lead) | "You drew an Island and two other cards" | Words0113Test#w1_164_165_playLogLists; e2e match-wording ("An Island went from RudeLeft's library to their graveyard") | one basic land takes "an" (Decided 1) |
| W1-165 | worker | done | "Bob put two cards into their hand from their library" | Words0113Test.java#w1_164_165_playLogLists | - |
| W1-166 | worker | done | "And two more things happened" / "And one more thing happened" / "And 12 more things happened" | code (PlayLog.flush); no unit seam | not unit-tested (needs >ROUND_LIMIT facts) |
| W1-167 | worker | done | " rolled 4 on a six-sided die", " rolled 4, 5 and 6 on six-sided dice" | Words0113Test.java#w1_167_rolled | - |
| W1-168 | worker | done | "Bob got two poison counters" | Words0113Test.java#w1_168_175_poisonAndCounts | - |
| W1-169 | worker | done | " scried 3, keeping one on top and putting two on the bottom" (zero halves dropped) | Words0113Test.java#w1_169_170_looked | - |
| W1-170 | worker | done | " surveilled 2 and kept both on top", " surveilled 1 and put it into their graveyard" | Words0113Test.java#w1_169_170_looked | - |
| W1-171 | worker | done (checked) | no change: the page names a player part by name (GameChat.tsx part/nameOf), never "You", so "You's" cannot happen | GameChat.tsx nameOf (read) | - |
| W1-172 | worker | done | "... did nothing: its targets were gone" / "its target could no longer be chosen" (ActionReports.fizzleWhy, shared with the report) | Words0113Test.java#w1_172_fizzleWhy | - |
| W1-173 | worker | done | no source: "something dealt 2 damage to ..."; a face-down source stays "a face-down creature" | code (PlayLog.damage) | capital comes from PlayLog.capital |
| W1-174 | worker | done | "A and B were destroyed" | code (PlayLog.moved) | - |
| W1-175 | worker | done | "Bob put two cards from their hand into their library" | Words0113Test.java#w1_168_175_poisonAndCounts (cards helper) | - |
| W1-176 | worker | done | "Grizzly Bears went from Bob's library to their graveyard" | code (PlayLog.moved) | - |
| W1-177 | worker | done | "created an Elf Warrior token", "created two Goblin tokens", "created 12 Goblin tokens", "created a face-down token" | Words0113Test.java#w1_177_tokens | - |
| W1-178 | worker | done | "Keep this hand of seven cards, or mulligan?" | Words0113Test.java#w1_178_179_180_mulligan | - |
| W1-179 | worker | done | "Choose a card to put on the bottom (two to go)." | Words0113Test.java#w1_178_179_180_mulligan | - |
| W1-180 | worker | done | "Any more? One chosen so far." | code + Words0113Test.java#w1_178_179_180_mulligan (capitalNumber) | - |
| W1-181 | worker | done | "Pay {1} for this trigger?" | code (no host card is rare) | - |
| W1-182 | worker | done | "New target for the copy of Lightning Bolt (now targeting Bob). Or pass to keep its targets." | Words0113Test.java#w1_182_270_newTarget | targets by name (nameFor), "you" for the reader |
| W1-183 | worker | done | stack labels: see W1-003; card labels keep "(first)"/"(second)" | Words0113Test.java#w1_003_183_250_onTheStack | - |
| W1-184 | worker | done | "How much damage goes to Bob? (Five left to divide.)"; prevention "How much damage do you prevent for X?"; counters "How many counters go on X?" | Words0113Test.java#w1_184_divide | - |
| W1-185 | worker | done | "Leyline of the Void: If a card would ..." | code (chooseReplacement) + TidyTest dash rule | - |
| W1-186 | worker | done | labels "+1/+1 counter", "charge counter", "blood token counter" | Words0113Test.java#w1_223_243_costs (counterName) | Lab check-you-choose.py elspeth now reads the kind by id (PROTO-006) |
| W1-187 | worker | done (checked) | no change: AnnounceTitle is the card script's own word ("Multikicker"); "X = 3" on a dial | - | - |
| W1-188 | worker | done | "Name a nonland card" (ValidDescription humanised, a/an by sound) | code (nameLayout) | - |
| W1-189 | worker | done | "You are looking at Island, Island and Impulse.", "..., Forest and 44 more." | Words0113Test.java#w1_189_253_310_lookingAt | see PROTO-006 cardPlans.ts |
| W1-190 | worker | done | "(two more needed)", "(up to three, or pass)", "(up to one more, or pass)" | code (pickSeveral); seen in Lab traces | - |
| W1-191 | worker | done | " Or pass and don't pay." | code (chooseCardsForCost) | - |
| W1-192 | worker | done (checked) | no change: Keyword.toString is its display name ("Multikicker") | Forge Keyword.java | - |
| W1-193 | worker | done | "First of two mana: which color?", "Second of three mana from Manamorphose, each a different color: which color?" | Words0113Test.java#w1_193_manaCombo | - |
| W1-194 | worker | done | labels "Savannah Lions (targeted by Arc Lightning)"; prompt "Spellskite: which target will you change?" | Lab check-you-choose.py spellskite (green) | - |
| W1-195 | worker | done | "Council's Judgment: vote for one." | Lab check-you-choose.py vote (updated, green) | - |
| W1-196 | worker | done | labels "{card name} · {static text without card numbers}" | code (chooseSingleStaticAbility) | - |
| W1-197 | worker | done | "Lost Well: Scry 2." (room name, colon) | Lab check-tracked-state.py initiative (updated, green) | - |
| W1-198 | worker | done | no host: "Choose a pile." (also pump and card-state questions) | Words0113Test.java#w1_198_noHost | - |
| W1-199 | worker | done | "Gift of the Gargantuan: choose up to one creature card." (filter humanised, card types lower-case) | Lab check-you-choose.py gargantuan (green) | - |
| W1-200 | worker | done | "Discard two cards, or one artifact card." / "(one more, or one artifact)." | Lab check-you-choose.py thirst-* (updated, green) | - |
| W1-201 | worker | done | "Assist: pay {2} toward Bob's Gang Up." | code (helpPayForAssistSpell) | - |
| W1-202 | worker | done | question "Top the bid? Bob's bid is 5 life." ("Your bid" to the bidder); yes label stays "Yes: Top the bid? ..." | Lab check-you-choose.py contest (updated, green) | button "Yes, top it" not built: the page makes the window title from the yes label (PROTO-006, needs triggers.ts) |
| W1-203 | worker | done | "You rolled 4 and 5. Choose dice to reroll, or pass." | Words0113Test.java#w1_203_204_rolls | - |
| W1-204 | worker | done | "You rolled 3 and 5. Choose a roll to ignore." | Words0113Test.java#w1_203_204_rolls | - |
| W1-205 | worker | done | "Sprocket 2 (two Contraptions on it), cranks next turn" | code (chooseSprocket) | - |
| W1-206 | worker | done | "Harm's Way prevents 2 damage. How much goes to Savannah Lions? (2 left; it would take 2.)" | Lab check-you-choose.py shield (updated, green) | digits kept: damage values |
| W1-207 | worker | done | "Scry 2: choose any cards to put on the bottom of your library." | code (arrangeForScry) | - |
| W1-208 | worker | done | "Surveil 1: keep Island on top of your library, or put it into your graveyard?" | code (arrangeForSurveil) | - |
| W1-209 | worker | done | "Surveil 2: choose any cards to put into your graveyard." | code | - |
| W1-210 | worker | done | "(Three left.)" | code (orderPrompt) | - |
| W1-211 | worker | done | "Discard two cards from your hand." / "Discard up to one card from Bob's hand." | code (chooseCardsToDiscardFrom) | - |
| W1-212 | worker | done | labels "Kicker {2}{R}"; prompt "(Two chosen; pass when done.)" | Words0113Test.java#w1_212_260_optionalCosts | - |
| W1-213 | worker | done | "Delve: exile cards from your graveyard, each paying {1}." | code | - |
| W1-214 | worker | done | "Which color does Llanowar Elves pay for convoke?" | code | - |
| W1-215 | worker | done | "Use Llanowar Elves's triggered ability?" | Words0113Test.java#w1_216_yesLabel | possessive by apostrophe-s on every name (no "Elves'" rule) |
| W1-216 | worker | partly | yes label unchanged in form ("Yes, use ..." / "Yes: ...") | Words0113Test.java#w1_216_yesLabel | plain "Yes" not built: triggers.ts confirmTitle builds the window title from the yes label (PROTO-006) |
| W1-217 | worker | done | "Colorless"; "(two more needed)" / "(up to one more, or pass)" | Lab check-you-choose.py converge (updated, green) | - |
| W1-218 | worker | done | "Ante isn't played, so every copy of A and B was taken out of your deck." | Words0113Test.java#w1_218_ante | - |
| W1-219 | worker | done | "Hellspark Elemental · {1}{R} · 3/1 creature" | Words0113Test.java#w1_219_262_331_332_350_actionWords | - |
| W1-219 | lead | extended (lead) | "Giant Killer · {0} · 1/2 creature (without paying its mana cost)" | Words0113Test#w1_309_313_343_348_362_365_forgeWords | Forge's "Creature 1 / 2" anywhere in a label |
| W1-220 | worker | done | "Costs {1} less (Goblin Electromancer and Baral)" | Words0113Test.java#w1_220_costWhy | - |
| W1-221 | worker | done | "(trample)" only when trample (not for divide-as-you-choose) | code (CombatChoices.assignByPoint) | - |
| W1-222 | worker | done | "Gempalm Incinerator goes to your graveyard, then: Gempalm Incinerator deals 2 damage." | Words0113Test.java#w1_222_333_334_335_payFor | - |
| W1-223 | worker | done | "Put two charge counters on Pentad Prism?" | Words0113Test.java#w1_223_243_costs | - |
| W1-224 | worker | done | "Put a +1/+1 counter on which creature?" | Words0113Test.java#w1_223_243_costs | - |
| W1-225 | worker | done | "Remove all charge counters from Pentad Prism?" | code | - |
| W1-226 | worker | done | "Remove two charge counters from Pentad Prism?" | Words0113Test.java#w1_223_243_costs (counters) | "to pay the cost" dropped |
| W1-227 | worker | done | "Remove two +1/+1 counters: from which permanent?" | code | - |
| W1-228 | worker | done | "Exile all five cards from your graveyard?" | Words0113Test.java#w1_223_243_costs (yourZone) | - |
| W1-229 | worker | done | "Exile two cards from your hand." / "Exile two permanents you control." | code | - |
| W1-230 | worker | done | "Sacrifice two creatures." | Words0113Test.java#w1_223_243_costs (counted) | - |
| W1-231 | worker | done | "Reveal two cards that share a color (1 of 2)." | code | - |
| W1-232 | worker | done | "Reveal two red cards." (PlainWords.counted: humanise + head-noun plural) | Words0113Test.java#w1_223_243_costs | - |
| W1-233 | worker | done | "... (3 so far), or choose Done." | code | - |
| W1-234 | worker | done | "Untap two tapped creatures you control." | Words0113Test.java#w1_223_243_costs | - |
| W1-235 | worker | done | "How many charge counters do you remove?", "Which kind of counter do you remove from X?", "Remove a charge counter (two more): from which permanent?" | code | - |
| W1-236 | worker | done | "Put two creature cards from exile into their owners' graveyards." | code (counted) | - |
| W1-237 | worker | done | "Exile a spell from the stack (two more): which one?" | code | labels already the spell's name (unchanged) |
| W1-238 | worker | done | "Roll a six-sided die for Clay Golem?", "Roll two six-sided dice ...", "Flip a coin for X?" | Words0113Test.java#w1_223_243_costs (diceWords) | - |
| W1-239 | worker | done | "Return two Elves to their owners' hands." | code | - |
| W1-240 | worker | done | "Crew 3: tap creatures with total power 3 or more (2 so far), or choose Done."; not crew: "Tap creatures with total power ..." | code | - |
| W1-241 | worker | done | "Tap two creatures that share a creature type (1 of 2).", "Tap any number of untapped creatures you control (0 so far), or choose Done." | code | - |
| W1-241 | lead | extended (lead) | "Tap two creatures.", "Tap five Elves." (pickCards: "Voice of the Woods: tap five Elves to pay its cost.") | Words0113Test (counted); Lab check-pay-picks voice, check-cost-kinds tap-two (final jar) | MatchCostDecision CostTapType plain count |
| W1-242 | worker | done | pickCards adds "to pay its cost" once; no K-prompt says "to pay the cost" any more | code (grep: none left) | - |
| W1-243 | worker | done | "Goblin Lore: discard two cards to pay its cost.", "Discard your hand (three cards)?" | code | - |
| W1-244 | worker | done | "Discard X. Then {effect}" (no colon) | Words0113Test.java#w1_244_discardLine | - |
| W1-245 | worker | done (checked) | no change: NotChosen fragments are joined by the page | - | minor; page wording |
| W1-246 | worker | done | "Two lands; no land in hand", "Three lands; a land already played this turn", "No lands; no land you can play" | Words0113Test.java#w1_246_nothingToPlay; ThrownAwayTest (updated); Lab check-thrown-away.py passed (updated, green) | e2e match-passing.spec.ts regex updated |
| W1-247 | worker | not done | command list text kept as "Undercity (room: Lost Well)" | - | StatusTray.tsx shortName parses "(room: X)" (PROTO-006); the player sees "Undercity · Lost Well" already; needs StatusTray.tsx to read commandWords[].rooms before the worker can change it |
| W1-248 | worker | not done | kept: "GIVE" ribbon | - | row marked ok (UI caps); left for the owner |
| W1-249 | worker | done | stack words without "Name (115)->" or "Name (101) - "; a creature spell "2/1 creature" | Words0113Test.java#w1_249_stackDescription; Lab check-no-target.py, check-shapes.py, check-results.py, check-panglacial-wurm.py (updated, green) | - |
| W1-250 | worker | done | see W1-003 | Words0113Test.java#w1_003_183_250_onTheStack | - |
| W1-251 | worker | done (checked) | targetPrompt already ours (spec 0055/0058); now also tidied | - | - |
| W1-252 | worker | partly | Forge's "Select ..." titles become "Choose ..."; "Choose up to 2 cards" -> "Choose up to two cards"; ApiType-keyed titles left as 0104 made them | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | keyed on Forge's English template, not per ApiType (Decided 4) |
| W1-253 | worker | done | see W1-189 | Words0113Test.java#w1_189_253_310_lookingAt | - |
| W1-254 | worker | partly | confirm questions run through PlainWords.forgeWords + tidy before the yes label (W1-343..346) | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | other confirm templates only tidied |
| W1-255 | worker | done | see W1-185 | - | - |
| W1-256 | worker | done | see W1-186 / W1-313 | - | - |
| W1-257 | worker | partly | "Select ..." -> "Choose ..."; the rest tidied (safety net 2) | - | - |
| W1-258 | worker | done (checked) | chooseCardsForCost: %d filled, card(s) fixed (existing), now tidied | - | - |
| W1-258 | lead | extended (lead) | "Choose one untapped Island to return to hand. (or sacrifice Lotus Atoll)" | Words0113Test#w1_309_313_343_348_362_365_forgeWords | Forge's "(or: Sacrifices X)" |
| W1-259 | worker | done (checked) | see W1-192 | - | - |
| W1-260 | worker | done | see W1-212 | Words0113Test.java#w1_212_260_optionalCosts | - |
| W1-261 | worker | done | see W1-196 | - | - |
| W1-262 | worker | done | see W1-219 | Words0113Test.java#w1_219_262_331_332_350_actionWords | - |
| W1-263 | worker | partly | W1-312's case dropped; other payment prompts tidied | - | - |
| W1-264 | worker | done | see W1-336 | Words0113Test.java#w1_264_336_blockRefused | - |
| W1-265 | worker | done | see W1-163 / W1-321..327 | Words0113Test.java#w1_163_265_321_327_why | - |
| W1-266 | worker | done | see W1-316..320 | Words0113Test.java#w1_158_159_316_320_values | - |
| W1-267 | worker | done | see W1-161 / W1-328..330 | Words0113Test.java#w1_161_328_330_366_367_revealTitles | - |
| W1-268 | worker | partly | ValidDescription humanised (W1-188); RoomName with a colon (W1-197); AnnounceTitle/PrecostDesc unchanged | - | - |
| W1-269 | worker | not done | kept: Forge's PlayerOutcome text in GAME_ENDED.reason | - | frontend/src/matchText.tsx winWords parses "has won due to effect of '...'" (PROTO-006): changing it here breaks the end screen |
| W1-270 | worker | done | see W1-182 | Words0113Test.java#w1_182_270_newTarget | - |
| W1-271 | page2 | done | hidden text "Tap: add one red mana." | T: "W1-271: ManaText's hidden text ..."; `ManaCost.test.tsx` updated | ManaText keeps the drawn line; each symbol run's hidden text is said in words; a plain piece that reads differently (": Add" after a leading Tap) is aria-hidden with its said form hidden beside it |
| W1-271 | lead | changed (lead) | each run of symbols is an image named in words ("Tap", "one red mana"); the line reads "Tap: Add one red mana." aloud; the letters stay in the text, out of sight and out of the reading | wording0113b "W1-271: ManaText is read aloud in words, never the braces"; ManaCost.test "draws the symbols, keeps the letters in the text, and names each run in words" | Decided 25 |
| W1-272 | page2 | done | "Costs one generic and two red, less than printed" | T: "W1-272"; `ManaCost.test.tsx`, `fixes0058.test.tsx` |  |
| W1-273 | page2 | done | "Still to pay: two generic, one red and one green" | T: "W1-273 and W1-275" | `manaBalls.tsx owingWords` now returns words |
| W1-274 | page2 | done | "Still to pay: one generic and one red" | T: "W1-274" |  |
| W1-275 | page2 | done | "red, paid" / "green" | T: "W1-273 and W1-275" | `manaBalls.tsx pipWords` |
| W1-276 | page2 | done | "one generic mana, paid" / "one generic mana" / "red mana, paid" | T: "W1-276" (`pipWords(pip, true)`, used by CastingCard) |  |
| W1-277 | page2 | done | "Makes green or blue mana" | T: "W1-277, W1-278, W1-279" | `Board.tsx makesWords` |
| W1-278 | page2 | done | "makes green or blue mana" | same |  |
| W1-279 | page2 | done | alt "green" | same |  |
| W1-280 | page2 | done | "Floating mana: two red and one green"; mana img alts "red", "blue" in the tray and its list | T: "W1-280: floating mana"; `StatusTray.test.tsx` | `StatusTray.tsx poolWords` |
| W1-281 | page2 | done | "Two more. Show everything" | T: "W1-281: the +N button" |  |
| W1-282 | page2 | done | "first strike", "charge" (all lower case, underscores to spaces) | T: "W1-282, W1-283"; `SeeingWhatHappened.test.ts` |  |
| W1-283 | page2 | done | "a +1/+1 counter", "three lore counters" | same; `fixes0076.test.tsx` updated |  |
| W1-284 | page2 | done | "suspended, with three time counters" ("no time counters" for 0) | T: "W1-284" |  |
| W1-285 | page2 | done | "three poison counters" | T: "W1-285" |  |
| W1-286 | page2 | done | "Two regeneration shields: the next time ..." (one: "Regeneration shield: ...") | T: "W1-286"; `fixes0080.test.tsx` |  |
| W1-287 | page2 | done | "Bob's library, one card", "...graveyard, empty", "...hand, seven cards" | T: "W1-287, W1-307" (`pileWords`) and the real-GameScreen test |  |
| W1-288 | page2 | done | "Their graveyard" | T: "W1-110, W1-111, W1-288" |  |
| W1-289 | page2 | done | "Their turn" | T: "W1-353, W1-289: ..." (real GameScreen, spectator) |  |
| W1-290 | page1 | done | "Their Lightning Bolt" / "Their life fell to -3" | w0113a "W1-290: no 'Their’s'" |  |
| W1-291 | page2 | done | "Two watching" / aria "Two watching: Ann and Cal" | T: "W1-291: who is watching, in words" (real GameScreen + WATCHING frame) |  |
| W1-292 | page2 | done | aria "Pass: Resolve Lightning Bolt now, or in three seconds." | T: "W1-040 and W1-292" | the visible word keeps "Resolves in 3" per W1-040 (see Spec mismatches) |
| W1-293 | page2 | done | "seven copies of Boggart Shenanigans' trigger, on the stack, ..." | T: "W1-101 and W1-293" |  |
| W1-294 | page2 | partly | "Island, two of them" (count in words); damage kept "2 damage" | T: "W1-294: identical cards in one pile ..." and "W1-102, W1-294, W1-355" | damage is a game value: digits kept (see Spec mismatches) |
| W1-295 | page2 | done | "Card three of seven in Bob's hand" | T: "W1-295, W1-354" |  |
| W1-296 | page1 | done | "You can make three mana." | w0113a "W1-029 (kept), W1-030, W1-296, W1-297" | "Each time costs {2} more." kept (a cost) |
| W1-297 | page1 | done | "You have three energy." / "Pay two energy" | same |  |
| W1-298 | page1 | done | missing label: "This choice" (`NO_LABEL`) on buttons, chips, tiles and aria-labels | w0113a "W1-298" |  |
| W1-299 | page1 | done | missing name: "This name" (NameSearch, NameWindow results) | w0113a "W1-032, W1-299: the name search" |  |
| W1-300 | page2 | done | "This choice, not enough mana right now" (aria; the option's own label now said through `manaTextWords`, no braces) | T: "W1-300: an option with no label is 'This choice'" | also QuestionBar's `ManaText` fallback is "This choice" |
| W1-301 | page1 | done | TargetTrigger chip fallback "This choice"; seat fallback "the other player" | w0113a "W1-055, W1-056, W1-301, W1-358" |  |
| W1-302 | page2 | not done (not my file) | none | none | needs `CardTrays.tsx` change: HiddenZoneTray tile aria `${g.card.name} ×${g.ids.length}` to `${g.card.name}, ${numberWord(n)} copies` ("Island, three copies, ..."). Its twin in `GameScreen.tsx ZoneViewer` tile aria is done ("Island, three copies, ...", tested in T: "W1-110, W1-111, W1-288") |
| W1-302 | lead | done (lead) | tile name "Island, three copies, {why}" | wording0113a "W1-302: a hidden zone tile's spoken name (lead)" | CardTrays.tsx `tileLabel` |
| W1-303 | page2 | done | "Damage: Bob's three Goblin tokens hit you" | T: "W1-303"; `fights.test.ts`, `Board.test.tsx`, `spectatorWords.test.tsx` updated |  |
| W1-304 | page2 | done | "two Goblin tokens" / "two copies of Hill Giant" / "four copies of Hill Giant" | T: "W1-304" (`manyOf`) |  |
| W1-305 | page2 | done | "Bob this turn: two spells cast, 3 life gained, and none of their permanents left the battlefield." | T: "W1-117, W1-305" (`thisTurnWords`) | life kept as digits (game value); "their" not "his" |
| W1-306 | page1 | done | "a six-sided die showing 4" ("a 20-sided die" above ten) | w0113a "W1-075, W1-306, W1-360" |  |
| W1-307 | page2 | done | "Bob, your opponent. It's their turn and they can act. 20 life, three poison counters, seven cards in hand, 40 cards in library, no cards in graveyard and no cards in exile." ("Alice, you. It's your turn and you can act. ..."; spectator "Alice. It's Alice's turn and they can act. ...") | T: "W1-307, W1-287, W1-351, W1-116" (real GameScreen) and `plateWords` | `fixes0092.test.tsx` now asserts "can act" |
| W1-308 | page2 | done | "First in the order" / "Second in the order" | T: "W1-308" (`handNumberWords`) |  |
| W1-309 | worker | done | "Goblin Bangchuckers: call the coin flip." / "Call the coin flip." | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | - |
| W1-310 | worker | done | "Choose a card to put into your hand. You are looking at Island, Island, Impulse and Impulse." | Words0113Test.java#w1_189_253_310_lookingAt | exact |
| W1-311 | worker | done | "Choose which mana to make" | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | - |
| W1-312 | worker | done | Forge's prompt that is only the card's name is dropped ("Monitor Monitor (38)\n") | code (applyManaToCost) | - |
| W1-313 | worker | done | "Choose a kind of counter to put on Savannah Lions." | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | e2e match-loyalty.spec.ts updated |
| W1-314 | worker | done | safety net 2 (PlainWords.tidy) on every prompt and label, plus forgeWords' counts | TidyTest; Words0113Test.java#theBoardsSentencesAreTidied | - |
| W1-315 | worker | done (kept) | "Creature — Goblin" kept | - | owner exception |
| W1-316 | worker | done | "Alice won the flip." | Words0113Test.java#w1_158_159_316_320_values | exact |
| W1-317 | worker | done | "Alice revealed the opponent they chose for Stalking Leonin: Bob." | Words0113Test.java#w1_158_159_316_320_values | "they" (gender unknown) for the row's "she" |
| W1-318 | worker | done | "Alice took the second pile." | Words0113Test.java#w1_158_159_316_320_values | exact |
| W1-319 | worker | done | "Bob raised the bid to 3 life." | Words0113Test.java#w1_158_159_316_320_values | exact |
| W1-320 | worker | done | "Bob voted for Grizzly Bears. Votes so far: Grizzly Bears, two (Alice and Bob)." | Words0113Test.java#w1_158_159_316_320_values | exact; several choices joined by "; " |
| W1-321 | worker | done | "Grizzly Bears dealt combat damage to Bob" (non-combat: "... dealt 2 damage to Bob") | Words0113Test.java#w1_163_265_321_327_why | - |
| W1-322 | worker | done | "A counter was removed from Invasion of Zendikar" (Ancestral Vision the same) | Words0113Test.java#w1_163_265_321_327_why | "The last time counter" variant not built |
| W1-323 | worker | done | "Alice unlocked a door of Grand Entryway" / "Bob took the initiative" | Words0113Test.java#w1_163_265_321_327_why | - |
| W1-324 | worker | done | "It is Alice's upkeep"; tooltip becomes "Braid of Fire's trigger: It is Alice's upkeep" (page joins it) | Words0113Test.java#w1_163_265_321_327_why | tooltip wording is the page's |
| W1-325 | worker | done | "Trumpeting Gnarr mutated" | Words0113Test.java#w1_163_265_321_327_why | - |
| W1-326 | worker | done | "Alice entered Trapped Entry" | Words0113Test.java#w1_163_265_321_327_why | - |
| W1-327 | worker | done | "Lightning Bolt targeted The Serpent Society" | Words0113Test.java#w1_163_265_321_327_why | - |
| W1-328 | worker | done | "Alice's transformed cards" | Words0113Test.java#w1_161_328_330_366_367_revealTitles | exact |
| W1-329 | worker | done | "A face-down card left Alice's battlefield for their graveyard" | Words0113Test.java#w1_161_328_330_366_367_revealTitles | - |
| W1-330 | worker | done | "Ancestral Vision is suspended in Alice's exile with four time counters" | Words0113Test.java#w1_161_328_330_366_367_revealTitles | exact |
| W1-331 | worker | done | "Play this land from the top of your library (Courser of Kruphix)" | Words0113Test.java#w1_219_262_331_332_350_actionWords | lab.py play_land accepts it (PROTO-006) |
| W1-332 | worker | done | "Cast it from exile (after Stomp)"; "Cast it by paying 1 life (Bolas's Citadel)" | Words0113Test.java#w1_219_262_331_332_350_actionWords; Lab check-shapes.py adventure (updated, green) | "Cast it" for "Cast Bonecrusher Giant": the name is the label's first part |
| W1-333 | worker | done | "... for the face-down creature's ability" | Words0113Test.java#w1_222_333_334_335_payFor | - |
| W1-334 | worker | done | "to use Mindslaver" (the pay title "Pay {4} to use Mindslaver") | Words0113Test.java#w1_222_333_334_335_payFor | - |
| W1-335 | worker | done | "to regenerate River Boa" | Words0113Test.java#w1_222_333_334_335_payFor | - |
| W1-336 | worker | done | "Boggart Brute has menace: block it with two or more creatures." | Words0113Test.java#w1_264_336_blockRefused; Lab check-blocks.py menace (updated, green) | exact |
| W1-337 | worker | done | "Alice looked at the top four cards of their library, exiling one face down and putting the other three cards on the bottom of their library." | Words0113Test.java#w1_337_aFaceDownExile | not the row's exact words: see Spec mismatches 1 |
| W1-338 | worker | done | "Tap five untapped Elves you control" | Words0113Test.java#w1_338_342_347_brokenEnglish | labels and prompts via forgeWords |
| W1-339 | worker | done | "Untap two tapped creatures you control" | Words0113Test.java#w1_338_342_347_brokenEnglish | - |
| W1-340 | worker | done | "Remove a counter from this creature" | Words0113Test.java#w1_338_342_347_brokenEnglish | - |
| W1-341 | worker | done | "exile another blue card" | Words0113Test.java#w1_338_342_347_brokenEnglish | - |
| W1-342 | worker | partly | "Exile an instant or sorcery spell from the stack" | Words0113Test.java#w1_338_342_347_brokenEnglish | "you control" not added (Forge's text does not say it) |
| W1-343 | worker | done | "Change the target of Lightning Bolt?" (the yes label "Yes, change the target of Lightning Bolt" gives that title) | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | - |
| W1-344 | worker | partly | "Spend three energy?" | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | still asked at zero (behaviour, not words) |
| W1-345 | worker | done | "Stop searching? You can still choose one more card." | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | exact |
| W1-346 | worker | done | "Make Ebony Fly a 3/3 Insect artifact creature with flying until end of turn?" | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | exact (one Forge shape) |
| W1-347 | worker | done | "You choose an instant or sorcery card from it." | Words0113Test.java#w1_338_342_347_brokenEnglish | - |
| W1-348 | worker | partly | "Choose a card.", "Choose a source." (trimmed, full stop) | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | "Choose a creature to copy." for Clone not built (Forge asks "Choose a card") |
| W1-349 | worker | done | "Creature — Goblin" | code (usesFor) | - |
| W1-350 | worker | done | "Grizzly Bears, a 2/2 creature (Gonti, Lord of Luxury)" | Words0113Test.java#w1_219_262_331_332_350_actionWords | - |
| W1-351 | page2 | done | "Your opponent’s turn" | real-GameScreen test |  |
| W1-352 | page2 | done | "Another player is playing this turn." | T: "W1-352" (real GameScreen) |  |
| W1-353 | page2 | done | "From this side" (name missing) | T: "W1-353, W1-289" |  |
| W1-354 | page2 | done | default `opponentName` "your opponent" ("Card one of seven in your opponent's hand", "attacking your opponent") | T: "W1-295, W1-354" |  |
| W1-355 | page2 | done | "your opponent's" | T: "W1-102, W1-294, W1-355" | both places in Board.tsx |
| W1-356 | page1 | done | "Bob goes on to attack"; "combat damage" in NEXT_STEP | w0113a "W1-356" | see 4 (the "combat damage" entries are unreachable) |
| W1-357 | page1 | done | "Copy a spell" (VERBS list gains copy, choose, reveal, discard, mill, shuffle, regenerate, prevent, transform, goad, double, cast, block, attack; "-ies" to "-y") | w0113a "W1-357" |  |
| W1-358 | page1 | done | "You" when the label is missing (a real label stays "Alice (you)") | w0113a "W1-055, W1-056, W1-301, W1-358" | e2e match-many-triggers chip filter updated |
| W1-359 | page2 | done | "the monarch", "the Ring has tempted them twice" | T: "W1-120, W1-122, W1-359" | the old line joined with a double space; now ", " and ". " |
| W1-360 | page1 | done | "Toughness" / "Power" when the value is unknown; "Power (3)" when known | w0113a "W1-075, W1-306, W1-360" |  |
| W1-361 | page1 | done | "Pile 1: three cards" | w0113a "W1-069, W1-361" | W1-069's colon chosen over this row's " · " (see 4) |
| W1-362 | worker | done | "Choose a card to meld with." | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | exact |
| W1-363 | worker | done | "Which creature goes on top?" | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | exact |
| W1-364 | worker | done | "Choose a card to change the roll of 4." | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | exact |
| W1-365 | worker | done | "Choose a creature to swap its power or toughness with the roll of 5." | Words0113Test.java#w1_309_313_343_348_362_365_forgeWords | exact |
| W1-366 | worker | done | "Goblin Ringleader revealed cards from your library:" (the play log adds the colon) | Words0113Test.java#w1_161_328_330_366_367_revealTitles | - |
| W1-367 | worker | done | "Alice picked cards from Bob's library:" | Words0113Test.java#w1_161_328_330_366_367_revealTitles | - |
| W1-368 | page1 | done | "Choose a type" / "Choose a color" / "Choose the mana's colors" / "Choose protection" / "Name a card" / "Call it" | w0113a "W1-004..W1-008, W1-368" |  |

### Spec mismatches (built to what the code and Forge allow)

- **Rows not built because page code reads the worker's words** (PROTO-006 kept: changing the words alone would break the page): W1-216 (a plain "Yes" button) and W1-202's "Yes, top it": `triggers.ts` `confirmTitle` makes the yes/no window's title from the yes label; the questions themselves are reworded (W1-215 "Use Llanowar Elves's triggered ability?", W1-202 "Top the bid? Bob's bid is 5 life."). W1-247 ("{name}, now in {room}"): `StatusTray.tsx` `shortName` reads "(room: X)" from the command text; the player already sees "Undercity · Lost Well". W1-269 (the alternate-win reason): `matchText.tsx` `winWords` reads Forge's "has won due to effect of 'X'" (W1-131's words are built on it). Each needs the worker to send a field the page reads first; left for a later spec.
- **W1-248** ("GIVE" ribbon) left: the row is marked ok (UI caps) and only offers an option.
- **W1-337** is quoted as exact ("... of her library, exiled one face down and put three on the bottom.") but the worker cannot know a pronoun and the row contradicts W1-141's participle style: built "Alice looked at the top four cards of their library, exiling one face down and putting the other three cards on the bottom of their library." (Decided 5, 6). W1-317 likewise says "they".
- **W1-344**'s "don't ask when it is zero" is behaviour, not words: not built (spec: words only).
- **W1-348**'s "Choose a creature to copy." for Clone: Forge asks the generic "Choose a card"; built "Choose a card." (the full stop and trim only).
- **W1-342**'s "you control": Forge's cost text does not say it; built "from the stack" only.
- **W1-322**'s "The last time counter was removed from Ancestral Vision" variant: built the general "A counter was removed from ...".
- **W1-294, W1-305, W1-206**: game values kept as digits (Decided 12).
- **W1-028..W1-032, W1-041, W1-042, W1-045** name `GameScreen.tsx` QuestionBar or `stops.ts` / `discard.ts`; their strings live in `QuestionWindows.tsx` and `GameScreen.tsx` respectively; built where they live.
- **W1-356**: the combat entries of `NEXT_STEP` cannot show (no attackers: the button says "Main 2"; attackers: "To blocks" / "To damage"); changed anyway.
- **W1-361 vs W1-069**, **W1-024 vs the 0109 note**: conflicting rows; one built (Decided 19, 20).
- **W1-223's game card**: no card asks for two charge counters as a cost, so the real-click game uses Fabricate's +1/+1 counters (Decided 21); "Put two charge counters on Pentad Prism?" is a unit test.
- **W1-164**: "You drew an Island and two other cards" (one basic land takes "an", Decided 1), not the row's "You drew Island and two other cards".
- **W1-040**: the button keeps "Resolves in 3" on screen; its screen-reader name says "three seconds" (Decided 11).
- **W1-099**: the tags now show in mixed case (Decided 10).
- **W1-113**'s "Today" no longer matched the code; built the row's After.
- **The cleanup's card number** is " (N)" after a word with a capital only (Decided 23): the spec's "digits only" would have stripped Forge's values from Dice's swap question ("power (5) or toughness (3)"), which `check-dice.py` caught.
- **Forge's bracketed causes in stack text** ("... [Zone Changer: Goblin Token]") are still sent in `stack[].description` and order-tray labels; the page drops them (`triggers.ts` `stackWords`, `abilityWords`), so no player reads them, and `Causes.why`'s own words (W1-321..W1-327) are rewritten. The worker could drop them too; not done here.
- **No test of the act button's " (Esc)"** (W1-046's GameScreen half): checked in the source only.

### Decided while owner away, to review (2026-11-20)

Each with what was chosen, why, and how to reverse it.

1. **"a" / "an" before a card's name only for basic lands.** W1-141 wants "an Island", W1-142 "putting Goblin Matron" (no article), W1-140 "a Forest": a basic land is a kind of card, any other name a proper name. The play log does the same for a single basic land ("An Island went from RudeLeft's library to their graveyard."); a run of them stays a list of names ("Island, Island and Forest"). Reverse: `ActionReports.named` / `ActionReports.BASICS`, `PlayLog.list`.
2. **Several cards of one name.** The report windows say "three Goblin Pikers", "two Grizzly Bears" (a name already ending in "s" kept), and "two copies of Light Up the Stage" where a plural would read wrong; the fight captions say "two copies of Hill Giant" for non-tokens and "three Goblin tokens" for tokens (W1-304's own example). Reverse: `ActionReports.pluralName`, `fights.ts` `manyOf`.
3. **A spell or ability as a target button** (W1-003 / W1-183): "Lightning Bolt on the stack" for a spell, "Prodigal Pyromancer's ability" for an ability, "(first)", "(second)" for two alike. Reverse: `MatchController.onStackWords`.
4. **Forge's own question templates** (W1-252, W1-309..W1-313, W1-343..W1-348, W1-362..W1-365) are reworded in one place, `PlainWords.forgeWords` (plus `PlainWords.brokenEnglish` for "Elfs", "creaturess", "a this", "a other", "a instant"), matched on Forge's English template words rather than per method or ApiType, because one template reaches several methods. Forge's file is untouched (VEND-001). Reverse: drop the `forgeWords(...)` calls in `WorkerMain` and `MatchController.askYesNo`.
5. **"putting ..." for every look-at-the-top report**, the owner's example's style, also for Hideaway (W1-337): "Alice looked at the top four cards of their library, exiling one face down and putting the other three cards on the bottom of their library.", not the row's "exiled one face down and put three on the bottom". Reverse: `ActionReports.putting`.
6. **"their" / "they" for every player**, never "her" / "she" (W1-317, W1-337): the worker cannot know a player's pronoun, and the app says "their" everywhere. Reverse: none needed unless pronouns are added to accounts.
7. **Act of Treason's control line** (0109 note): "Bob gains control of your Grizzly Bears until the end of the turn." when Forge's GainControl lasts until end of turn; any other duration gets the line without "until ..." (never guessed). Reverse: `PlayLog.controlGained`.
8. **The act button's passing reason** (W1-246): "Two lands; no land in hand" / "One land; a land already played this turn" / "No lands; no land you can play" (one voice, no "you've"), shown as "Nothing to play: {reason}". Reverse: `PriorityStops.nothingToPlay`.
9. **A block refusal that is not menace** (W1-336's family): "Not allowed: X can't be blocked by just one creature." Reverse: `CombatChoices.blockRefused`.
10. **The state tags show in mixed case** (W1-099): the words were typed in capitals ("TARGET", "ATTACKING") and no `text-transform` existed, so they now read "Target", "Attacking", "Tapped", "Blocking", "Chosen" on screen, a small change of look. Reverse: `text-transform: uppercase` on `.bf-state` and `.gs-life-target` (the words stay).
11. **The countdown** (W1-040 / W1-292): the button still shows "Resolves in 3" beside its ring; its screen-reader name says "in three seconds". Reverse: `GameScreen.tsx` `resolveWords`.
12. **Game values stay digits** (W1-294, W1-305, W1-206): "2 damage", "3 life gained", "Harm's Way prevents 2 damage", against the rows' "two damage" / "three life gained", because the owner keeps game values (damage, life) in digits; the counts beside them are words. Reverse: the same builders (`Board.tsx` card label, `thisTurn.tsx`, `MatchController.divideShield`).
13. **"X = 3" kept on the X dial** (W1-029, W1-187): the row allows it as Magic shorthand, a game value. Reverse: `QuestionWindows.tsx` `dialWords`.
14. **The win line** (W1-131): Forge's reason is "has won due to effect of 'X'", so the row's "{player} won: {reason}" would read "won: has won". Built one sentence: "You won on turn 5 because of Laboratory Maniac." The end screen still reads Forge's reason from `GAME_ENDED.reason` (W1-269, below). Reverse: `matchText.tsx` `winWords`.
15. **An unknown player's name** (W1-026, W1-057, W1-115, W1-132): "the other player" to a player; "A player" to a spectator (who has no "other player"); "Another player" in a game of more than two seats. Reverse: `resultText`, `targetName`.
16. **Modes window brackets** (W1-082 / W1-083): nothing in brackets until the first mode is chosen ("Choose two", then "Choose two (one chosen)"), never "(zero chosen)". Reverse: `DiceWindows.tsx` `modesTitle`.
17. **Opening hand facts** (W1-087): one sentence, then the other player's mulligans as their own: "Seven cards, three lands. Bob mulliganed three times." Reverse: `OpeningHand.tsx`.
18. **The report dialog's footer** (W1-139): the version stays in the browser's fact chip ("Proxic 1.74.0, Chrome 131 on Windows · 1920×1080"), because a chip of its own would be a new pill. Reverse: `ReportDialog.tsx`.
19. **W1-069 over W1-361**: "Pile 1: three cards, one face down" (W1-069's words; W1-361 asked "Pile 1 · three cards"). Reverse: `CardTrays.tsx` `PilesTray`.
20. **W1-024 over the 0109 note**: the target window's chosen line reads "Chosen so far: RudeLeft and Hill Giant" (W1-024), not the note's "One chosen: …"; the title reads "Choose up to one more target" (W1-009, as the note asked). Reverse: `QuestionWindows.tsx` `chosenWords`.
21. **The real-click game's counter cost is Fabricate's** (F-0113-G, W1-223): no card in Forge's scripts asks a player to put two charge counters as a cost (the only `AddCounter<2/...>` costs are planeswalker loyalty, never asked), so the game reads "Put two +1/+1 counters on Weaponcraft Enthusiast?" from the same code path (`MatchCostDecision` `visit(CostPutCounter)`); "Put two charge counters on Pentad Prism?" is proved by a unit test. Reverse: a different card in `protocol/fixtures/wording-deck/`.
22. **The CI check also fails a spaced hyphen " - "** in our sentences, besides the em and en dash and " -- " the spec lists, with the same two exceptions (type line, quoted card text): Forge's " - " joiner is the commonest dash in pass-through text ("Fabricate - Create two ..."), and the owner's rule is "no dashes". Reverse: `scripts/check-wording.py` `DASH`.
23. **A card number is " (N)" after a word with a capital** (the cleanup and the check): "Grizzly Bears (68)" goes, "power (5) or toughness (3)" (a value Forge writes into Dice's swap question) stays; found by `check-dice.py` `swap` on this build, whose question had lost its values. Reverse: `PlainWords.CARD_NUMBER`, `check-wording.py` `CARD_NUMBER`.
24. **A cost said alone reads on in its sentence** (W1-031): the hidden words of "{3}" are "three generic" ("Costs three generic"), capitalised only where a sentence begins (the text's start with words after it, or after a full stop), so "Cycle it instead: one red". Reverse: `words.ts` `manaTextWords` / `manaTextParts`.
25. **How mana is read aloud** (W1-271): each run of symbols in a line is an image named in words (`role="img"`, "one red mana"), and the letters stay in the text, out of sight and out of the reading, for copying. The builders first put the words in the text itself; that changed what every scripted browser game reads from a label ("Karn Liberated · seven generic · ..." for "Karn Liberated · {7} · ..."), and the scripted games that cast by a label's cost (Karn, Laboratory Maniac, Mindslaver and others) would have stopped finding their spells. The line now reads "Tap: Add one red mana." aloud (the printed capital kept), not the row's "Tap: add one red mana."; `manaTextWords` still gives the row's exact words where a whole label is built as words. Reverse: `ManaCost.tsx` `ManaText`.
26. **" · " kept between a card and its option in the list window** (W1-027): the hidden card prefix reads "Forgotten Cave · Cycling", not the builders' "Forgotten Cave: Cycling", because the card and its option are two separate facts on one button (the owner's rule allows " · " there), and every scripted browser game finds a spell to cast as "Name · {cost} · ..." (the Laboratory Maniac game decked out without casting one spell when it was ": "). Reverse: `QuestionWindows.tsx` `OptionButton`.
27. **A comma, full stop or "'s" straight after a card name stays on the name's line in the play log.** Found in the play-log still at review: the new joined list wrapped as "..., Swamp" / ", Swamp and Swamp", a line starting with a comma, because a card name is a button and a line may break after one. The punctuation now goes in one no-wrap span with the name (`GameChat.tsx` `gluePunctuation`, `.gs-log-glue`); proved by `wording0113a.test.tsx`. Reverse: render `l.parts.map(part)` again.
28. **No "your" before a name that starts with "The".** Found in CI run 44910790927's trace: the monarch's end-of-turn draw is a stack item named "The Monarch", and the waiting line, the Pass button's line and the countdown read "May respond to your The Monarch", "Pass: Resolve. Your The Monarch". `stops.ts` `owned` drops the whose before a name starting with "The " ("May respond to The Monarch"), used by the stack line, the waiting line, "Making a choice for ..." and `GameScreen.tsx` `resolveWords`; proved by `stops.test.ts` (bites: without it the test reads "your The Monarch"). Reverse: return `${whose}${name}` from `owned`.

### Files

New: `docs/architecture/PLAYER_WORDS.md`, `forge-worker/src/test/java/net/barnflix/proxic/worker/game/TidyTest.java`, `forge-worker/src/test/java/net/barnflix/proxic/worker/game/Words0113Test.java`, `frontend/e2e/match-wording.spec.ts`, `frontend/src/battlefield/wording0113a.test.tsx`, `frontend/src/battlefield/wording0113b.test.tsx`, `frontend/src/words.test.ts`, `frontend/src/words.ts`, `protocol/fixtures/wording-deck/`, `scripts/check-wording.py`.

Modified: `.github/workflows/ci.yml`, `docs/features/0113-wording-game-screen.md`, `forge-worker/src/main/java/net/barnflix/proxic/worker/WorkerMain.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/ActionReports.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/Causes.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/CombatChoices.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/GameHost.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/ManaPayment.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/MatchController.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/MatchCostDecision.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/PlainWords.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/PlayLog.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/PriorityStops.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/Skips.java`, `forge-worker/src/main/java/net/barnflix/proxic/worker/game/ViewerSnapshot.java`, `forge-worker/src/test/java/net/barnflix/proxic/worker/game/ActionReportsTest.java`, `forge-worker/src/test/java/net/barnflix/proxic/worker/game/PlainWordsTest.java`, `forge-worker/src/test/java/net/barnflix/proxic/worker/game/PlayLogTest.java`, `forge-worker/src/test/java/net/barnflix/proxic/worker/game/ThrownAwayTest.java`, `frontend/e2e/match-alternate-win.spec.ts`, `frontend/e2e/match-always-choose.spec.ts`, `frontend/e2e/match-away.spec.ts`, `frontend/e2e/match-big-combat.spec.ts`, `frontend/e2e/match-board-motion.spec.ts`, `frontend/e2e/match-dice.spec.ts`, `frontend/e2e/match-karn.spec.ts`, `frontend/e2e/match-loyalty.spec.ts`, `frontend/e2e/match-mana-colours.spec.ts`, `frontend/e2e/match-many-triggers.spec.ts`, `frontend/e2e/match-mindslaver.spec.ts`, `frontend/e2e/match-modes-doing.spec.ts`, `frontend/e2e/match-numbers.spec.ts`, `frontend/e2e/match-opening-hand.spec.ts`, `frontend/e2e/match-passing.spec.ts`, `frontend/e2e/match-play-log.spec.ts`, `frontend/e2e/match-sacrifice.spec.ts`, `frontend/e2e/match-stack-rests.spec.ts`, `frontend/e2e/match-state.spec.ts`, `frontend/e2e/match-status-list.spec.ts`, `frontend/e2e/match-stolen-picture.spec.ts`, `frontend/e2e/match-watching.spec.ts`, `frontend/e2e/match-what-happened.spec.ts`, `frontend/e2e/match-window.spec.ts`, `frontend/e2e/match.spec.ts`, `frontend/src/ReportDialog.tsx`, `frontend/src/battlefield/AwayWindow.tsx`, `frontend/src/battlefield/Board.test.tsx`, `frontend/src/battlefield/Board.tsx`, `frontend/src/battlefield/CardBadges.tsx`, `frontend/src/battlefield/CardTrays.tsx`, `frontend/src/battlefield/CastingCard.tsx`, `frontend/src/battlefield/DiceWindows.test.tsx`, `frontend/src/battlefield/DiceWindows.tsx`, `frontend/src/battlefield/Die3D.tsx`, `frontend/src/battlefield/FanCards.tsx`, `frontend/src/battlefield/GameChat.tsx`, `frontend/src/battlefield/GameScreen.tsx`, `frontend/src/battlefield/GameWindow.tsx`, `frontend/src/battlefield/ManaCost.test.tsx`, `frontend/src/battlefield/ManaCost.tsx`, `frontend/src/battlefield/OpeningHand.test.ts`, `frontend/src/battlefield/OpeningHand.tsx`, `frontend/src/battlefield/PoisonBadge.tsx`, `frontend/src/battlefield/QuestionWindows.test.ts`, `frontend/src/battlefield/QuestionWindows.tsx`, `frontend/src/battlefield/RevealTray.tsx`, `frontend/src/battlefield/SeeingWhatHappened.test.ts`, `frontend/src/battlefield/SpellMarks.tsx`, `frontend/src/battlefield/StatusTray.test.tsx`, `frontend/src/battlefield/StatusTray.tsx`, `frontend/src/battlefield/TriggerWindows.tsx`, `frontend/src/battlefield/abilities.test.ts`, `frontend/src/battlefield/abilities.ts`, `frontend/src/battlefield/cardPlans.test.ts`, `frontend/src/battlefield/cardPlans.ts`, `frontend/src/battlefield/discard.ts`, `frontend/src/battlefield/fights.test.ts`, `frontend/src/battlefield/fights.ts`, `frontend/src/battlefield/fixes0057.test.tsx`, `frontend/src/battlefield/fixes0058.test.tsx`, `frontend/src/battlefield/fixes0061.test.tsx`, `frontend/src/battlefield/fixes0062.test.tsx`, `frontend/src/battlefield/fixes0064.test.tsx`, `frontend/src/battlefield/fixes0070.test.tsx`, `frontend/src/battlefield/fixes0071.test.tsx`, `frontend/src/battlefield/fixes0075.test.tsx`, `frontend/src/battlefield/fixes0076.test.tsx`, `frontend/src/battlefield/fixes0080.test.tsx`, `frontend/src/battlefield/fixes0083screen.test.tsx`, `frontend/src/battlefield/fixes0086.test.tsx`, `frontend/src/battlefield/fixes0088.test.tsx`, `frontend/src/battlefield/fixes0088screen.test.tsx`, `frontend/src/battlefield/fixes0092.test.tsx`, `frontend/src/battlefield/fixes0097.test.tsx`, `frontend/src/battlefield/fixes0103screen.test.tsx`, `frontend/src/battlefield/fixes0104screen.test.tsx`, `frontend/src/battlefield/fixes0106.test.tsx`, `frontend/src/battlefield/fixes0106screen.test.tsx`, `frontend/src/battlefield/fixes0109screen.test.tsx`, `frontend/src/battlefield/fixes0112screen.test.tsx`, `frontend/src/battlefield/manaBalls.tsx`, `frontend/src/battlefield/payPicks.ts`, `frontend/src/battlefield/playerMarks.tsx`, `frontend/src/battlefield/spectatorWords.test.tsx`, `frontend/src/battlefield/stops.test.ts`, `frontend/src/battlefield/stops.ts`, `frontend/src/battlefield/thisTurn.tsx`, `frontend/src/battlefield/zoneTray.test.ts`, `frontend/src/battlefield/zoneTray.ts`, `frontend/src/match.test.ts`, `frontend/src/match.ts`, `frontend/src/matchText.tsx`, `scripts/check-always-choose.py`, `scripts/check-blocks.py`, `scripts/check-card-actions.py`, `scripts/check-cost-kinds.py`, `scripts/check-costs.py`, `scripts/check-no-target.py`, `scripts/check-panglacial-wurm.py`, `scripts/check-quiet-reports.py`, `scripts/check-results.py`, `scripts/check-shapes.py`, `scripts/check-spell-choices.py`, `scripts/check-surveil.py`, `scripts/check-thrown-away.py`, `scripts/check-tracked-state.py`, `scripts/check-turn-ends.py`, `scripts/check-unreachable.py`, `scripts/check-what-happened.py`, `scripts/check-who-did-it.py`, `scripts/check-you-choose.py`, `scripts/lab.py`.


## Amendments

None yet.

## Notes carried from building 0109 (2026-11-20)

- The target window's title and chosen line still use digits ("Choose up to 1 more target", "1 chosen: …"). They follow this spec's number rule: "Choose up to one more target", "One chosen: …".
- Act of Treason's play log has the cast line naming the target, but no line for the control change itself. Add one ("Bob gains control of your Grizzly Bears until the end of the turn.") in the play-log wording.
