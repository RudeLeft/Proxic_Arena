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

## Amendments

None yet.

## Notes carried from building 0109 (2026-11-20)

- The target window's title and chosen line still use digits ("Choose up to 1 more target", "1 chosen: …"). They follow this spec's number rule: "Choose up to one more target", "One chosen: …".
- Act of Treason's play log has the cast line naming the target, but no line for the control change itself. Add one ("Bob gains control of your Grizzly Bears until the end of the turn.") in the play-log wording.
