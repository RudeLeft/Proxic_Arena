# 0124 — Phase 11 P11-A4 and P11-A5: "Nothing to play" that stays true, and the last words on the table

**Status:** **Approved by the owner 2026-11-27 (by prompt: "Every step", "Bob's move", "Report window", "Remove both", "Keep all 31")**; building (drafted and built 2026-11-27). Phase 11, items P11-A4 and P11-A5 (order 16, together).
**Owner decisions:** made 2026-11-27 by prompt, after the canvas `Proxic canvases/a4-a5-pills-and-nothing-to-play.html`. Recorded as the owner chose them:

1. **A4, Q1 — "Every step"** (the canvas's Option A, recommended): "Nothing to play" is re-checked at every priority point of your own turn. It goes the moment you have something playable (a priority question is asked: it is cleared), and it may come back later that turn, at any step, not only Main 1, with a freshly worked out, true reason. The words are unchanged.
2. **A4, Q2 — "Bob's move"** (Option A, recommended): while the other player acts during your passing turn (the stack is not empty, or they are being asked), your button shows "Bob's move", the normal waiting line. "Passing" returns when the stack is empty.
3. **A5, Q3 — "Report window"** (Option A, recommended): the ante notice moves into the standard report window, to the deck's owner only, after the opening hand is kept, with the card's picture and the game's standard medallion.
4. **A5, Q4 — "Remove both"** (Option A, recommended): once the ante notice has moved, the grey "GAME" notice is removed from the game screen, and so is the dead return-tag pill, with their tests and dead code.
5. **A5, Q5 — "Keep all 31"** (Option A, recommended): rows 5-35 of the canvas's list stay as they are. The list and the reasons are below, so the audit is closed.

## Why (researched)

Researched 2026-11-27 at origin/main 6b4df553 (the canvas). SOURCE = read in code, RUN = a game played through the worker.

- **A4, the stale reason (SOURCE).** The worker decided "Passing" once, at your first Main 1 (`PriorityStops#passedTurn`: own turn, Main 1, empty stack, nothing offered), saved the turn and the reason once, and cleared them only at the next upkeep or draw (`PriorityStops#pausing`). `PriorityStops#passingFor` checked only the turn number and whose turn it was. `MatchController#chooseSpellAbilityToPlay` called `passedTurn` only for a priority question **not** asked, and nothing cleared it when one **was** asked. `GameHost#publishSnapshots` put it on every board of that turn. On the page, `GameScreen.tsx` `passingOf` checked only the turn and the active seat, and "Passing" gave way only to an open question of your own, so it beat "Bob's move".
- **A4, Q2's moment (RUN, a saved trace).** The "stops before attack" Lab game (`check-stops.py` `before-attack`): Bob casts Lightning Bolt at Alice's Bears at the start of her combat while her turn is passing. Every board Alice was sent meanwhile kept `passing` (the lead's scratch trace `labfull/stops-before-attack.jsonl`, lines 196-235).
- **A4, the core stale case (RUN, new).** No saved trace had a draw in the middle of a passed turn, so this spec adds one (`check-thrown-away.py` `drew`, F-0124-B). On origin/main it fails: Alice is asked at Main 2 to play the Island her Scroll Thief drew, and the board sent with that question still says `{"turn": 9, "why": "Three lands; no land in hand"}`; that reason then stays all turn.
- **A5 (SOURCE).** The ante notice was the only grey "GAME" notice left (`MatchController#revealAnte` -> `GameHost#note`, words `MatchController#anteWords`), shown by the game screen's `useGameMessages`. The return tag (`Board.tsx` `ReturnMark` kind `"tag"`, class `bf-return-tag`) had been drawn by nothing since spec 0075.

## What the player sees

1. **Alice's turn, Scroll Thief.** Alice has three Islands and a Scroll Thief; her hand is Air Elementals. At Main 1 her button says **Passing · Nothing to play: Three lands; no land in hand**, as today. Scroll Thief hits Bob and she draws an Island. At Main 2 she is asked, and the button is her normal Next button; "Passing" is gone. She plays the Island. Nothing else can be played, so the button says **Passing · Nothing to play: Four lands; no land in hand**: the reason as it is now. Before this spec, the first reason stayed all turn.
2. **She draws an instant instead** (at combat damage, where she is not stopped): "Passing" goes, and the rest of the turn moves at full speed, as any turn with something to play.
3. **Bob casts Lightning Bolt during Alice's passing turn.** While he chooses and pays, and while the Bolt waits on the stack, Alice's button says **Bob's move** with what he is doing, the line it shows on any other turn. When the Bolt has resolved and the stack is empty, "Passing" is back.
4. **Alice's deck holds Contract from Below.** Ante isn't played, so the game takes every copy out before the opening hand, as before. Alice is no longer told in a grey notice at the top right, on top of the opening-hand window. Once the opening hands are kept and the first turn begins, the standard report window opens for her: the game's shield as the medallion, **YOUR DECK · CONTRACT FROM BELOW**, "Ante isn't played, so every copy of Contract from Below was taken out of your deck.", and the card's picture marked "→ out of the game". Bob is told nothing.
5. **Nothing at the top right of the table** speaks for the game any more: only your own connection ("Reconnecting to the game…") and the site (invitations, updates).

## Scope

In:

- **Worker, A4.** `PriorityStops#passedTurn` re-checks at every not-asked priority point of the seat's own turn from Main 1 on, with an empty stack: nothing to play sets "passing" with the reason as it is now; something to play clears it. `PriorityStops#asked` clears it when a priority question is asked (`MatchController#chooseSpellAbilityToPlay`). The boards are sent whenever it changed (on, a new reason, or gone). The rule itself is plain state (`PriorityStops#recheck`, `PriorityStops#passingFor(int, int, boolean)`), so it is unit-tested. While the stack is not empty it is left as it was; the active player gets priority again once the stack empties, and it is re-checked then.
- **Page, A4.** `GameScreen.tsx` `othersMove`: while the stack is not empty or the other player is being asked (`MATCH_ASKING`), "Passing" gives way to the waiting line.
- **Worker, A5.** `ActionReports` kind `ANTE`: `anteRemoved` keeps the cards (`MatchController#revealAnte`), and `releaseAnte` makes the report for the deck's owner alone (`ReportBook` onlyFor) once the game's first turn has begun (`GameHost#publishSnapshots`). The report is the game's own: `by` 0, `byWords` "Your deck", its cards drawn from their printings (`ActionReports#anteCard`, face up, `to` "out"); the server gives them their pictures from the owner's deck as for any report card (`MatchArt`).
- **Page, A5.** `RevealTray.tsx` `GameMedallion` and `reportWho`: a report with `byWords` shows the game's shield and "Your deck · Contract from Below"; no replay is offered for it (nothing moved). `wentWords` "out": "→ out of the game".
- **Removed (Q4).** The game screen's grey "GAME" notices (`useGameMessages`), `notices.ts` `GAME_MESSAGE_MS`, `noticeParts`, `newNotices` and the `quiet` notice flag; the worker's `GameHost#note` and its per-seat list and count; the board's `noticesTotal`; the return tag (`ReturnMark` kind `"tag"`, `.bf-return-tag`) and the tests that only asserted its absence.

Out (and why):

- **The board's `notices` field** stays on the wire, always empty: it is one of the board's history lists (P11-D3, `protocol/README.md`), in the server's `BoardHistory`, the page's `history.ts` and the delta fixtures. Removing it is a protocol change with no player effect. **Trigger** (PHASE-004): the next change to the board's history lists, or Phase 11's documentation audit, whichever comes first.
- **The keep list (rows 5-35)**: kept by the owner (Q5); below.

## The keep list (Q5, "Keep all 31")

None of these explains a card's doing in words; each stays as it is.

| # | What the player sees | Why it stays |
|---|---|---|
| 5 | The game's reason an attack or block was refused, on the combat button | It answers your own click, where you clicked (0097) |
| 6 | The game's reason a choice wasn't taken, inside the question window | Inside the window that asks again |
| 7 | "Island can't be named here. Try another card." (red, in the naming window) | It answers your own pick (0097) |
| 8 | "Not now. Needs 7 loyalty" in a card's menu | You asked, by opening the card |
| 9 | "Nothing to do with this card right now" beside a clicked card | It answers your click (0058, kept in 0097) |
| 10 | "Playing for Alice" inside the question window (Mindslaver) | It says whose answer it is |
| 11 | CHANGE SPLIT by a blocked trampler | A button, not a notice |
| 12 | "Start in play?" on a Leyline-style card in the opening hand | Part of a question |
| 13 | BOB'S MOVE · Making a choice for their Lightning Bolt (act button) | Whose move it is |
| 14 | ONE MOMENT · Putting triggers on the stack / Resolving… | The game's own progress |
| 15 | YOUR ANSWER · Your choice is above the board | Points at your open question |
| 16 | CATCHING UP… · Tap to skip | Your screen replaying what it missed (0119) |
| 17 | Paused (button, window, the word on the waiting stack card) | The connection, not a card (0120) |
| 18 | TAPPED · ATTACKING · BLOCKING · TARGET on cards | The card's state; the owner chose the words (0075) |
| 19 | Face down | The card's state |
| 20 | Still to pay {1}{U} on a spell being paid | Its state; the owner chose it |
| 21 | Stack number, caster's face, ×3 on stack cards | The order on the stack and copies |
| 22 | "Next: Bob's Lightning Bolt. Two on the stack." under the stack | What resolves next (one line, the owner's choice) |
| 23 | Aura and Equipment tabs; "holding … in exile" tabs | What is attached or held |
| 24 | Flying, Trample, Protection from red, Lost all its abilities… | What the card has now |
| 25 | Kicked, Overloaded, Evoked… on a spell's close-up | How it was cast |
| 26 | Counter badges (+1/+1 ×2, shield…) | Counters on it; pictures are Phase 12's |
| 27 | Cards you know on top of your library | Your own knowledge (0103) |
| 28 | This turn: Spells cast 2 · Life gained 3 (player panel) | This turn's counts |
| 29 | "2 watching" | Spectators |
| 30 | Rising numbers: −3, +2, +1/+1 | Numbers with pictures, not words |
| 31 | +1 / −1 pills on energy, poison and other player counters | A player counter changing |
| 32 | CONNECTION · Reconnecting to the game… / You're no longer connected | Your own connection |
| 33 | Invitations, join requests, "session ended", "Proxic Arena has been updated", deck and room problems | The rest of the site |
| 34 | You won / You lost, Leave; "While you were away"; the other player away window | Already windows |
| 35 | Chat "blocked" line; menu confirm and failure lines; loading words | You used them |

Rows 1-4 were decided above: row 1 (the ante notice) moved (Q3), row 2 ("Passing") fixed (Q1, Q2), rows 3 (the return tag) and 4 (the grey "GAME" notice) removed (Q4).

## Rules and boundaries

- **Which questions are asked is unchanged.** Only `PriorityStops#shouldAsk` decides that, and it is not touched; the change is to the `passing` flag and its reason and to when boards are sent. Proven by the Lab with Forge's shuffle seeded: the question record of every Lab game identical before and after (As built).
- **Hidden information (HID-001, HID-003, HID-004).** The passing reason reads only the seat's own lands and hand (`PriorityStops#reasonOf`), and only that seat's board carries it. The ante report is made for its deck's owner alone (`ReportBook` onlyFor) and rendered for nobody else (`ActionReports` render's ANTE branch); asserted from both seats in the Lab (F-0124-D), and its guard bitten (TEST-004 below).
- **No "Forge" in player text**; the words are the game's (W1-218's sentence, unchanged).
- **Nothing jumps.** No animation changes; the report window is the standard one.
- **FORGE-RULE / ARCH-002.** Nothing here decides what is legal: "something to play" is Forge's own offer list, as before.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0124-A | Page: Bob's Bolt on the stack, Bob choosing: "Bob's move", not "Passing"; the Bolt waiting with nobody asked: not "Passing"; the stack empty again: "Passing" with its reason; Bob asked with an empty stack: "Bob's move" | Vitest, the real game screen (`fixes0124screen.test.tsx`) |
| F-0124-B | Lab: Alice's turn passes from Main 1; Scroll Thief draws an Island; asked at Main 2 her boards no longer say `passing`; once it is played, `passing` comes back that turn with "Four lands; no land in hand"; Bob's boards never say it. Fails on origin/main | `check-thrown-away.py` `drew` (CI's Lab list already has `thrown-away`) |
| F-0124-C | Page: the ante report: the game's medallion, "Your deck · Contract from Below", the sentence, "→ out of the game", no replay, nothing top right | Vitest (`fixes0124screen.test.tsx`) |
| F-0124-D | Lab: a deck with Contract from Below starts; its owner's boards carry the ANTE report only from the first turn (never over the opening hand), one picture face up by its printing; Bob's boards never name it (HID-003); no grey notice to anybody | `check-unreachable.py` `ante` |
| F-0124-E | Page: the game's own words are never a grey notice on the game screen | Vitest (`fixes0097.test.tsx`) |
| F-0124-F | Worker: set at Main 1, gone when asked, back with a fresh reason; gone when something is offered outside a stop; a changed reason re-sent; on later in the turn when Main 1 had something; never with a full stack, before Main 1 or on the other turn; never another seat's | JUnit `PassingEveryStepTest`; `ActionReportsTest` (ANTE told to the owner only) |
| F-0124-G | Real-click game on the local stack: the Bolt case (Bob's move, then Passing) and the draw case, stills looked at; the ante window by eye | TEST-011, TEST-012 (`match-passing.spec.ts`) |

## Decisions for the owner

None open: all five were answered (above).

## Amendments

None.

## As built (2026-11-27)

Commits 37ea3792 (worker, Lab) and 452cf289 (page, tests, the passing-deck fixture), on branch `p11-a4-build` from origin/main 6b4df553. RUN unless marked.

**What a player notices.** Items 1-5 of "What the player sees", as written. Also (built to Q1's letter, and a point for the owner, below): once you have passed your Main 2 holding cards you chose not to play, the End step can say "Passing · Nothing to play: …" (true there: nothing can be played at the End step) and pauses 0.4 s, where 1.76.0 showed the normal line.

**Which questions are asked: unchanged (RUN).** The full Mechanics Lab (every script in CI's Lab list, 79) was played with Forge's shuffle seeded (Forge's `MyRandom.setRandom` from a launcher kept outside the repository; the same seed twice on one build gave identical games first), once on origin/main's worker and once on this one: 439 traces, **43,996 questions, the question record identical** (each question's seat, kind, prompt, options and the answer given). The boards: 105,430 before and 105,446 after (16 more, sent when "passing" changed); boards carrying `passing` 427 and 429, distinct (game, seat, turn, reason) 85 and 90; the one key gone is `noticesTotal`. On origin/main two scripts failed, as they should: `check-thrown-away.py` `drew` and `check-unreachable.py` `ante`. On this build all 79 passed.

**Gates over the after traces** (and over check-deltas' rebuilt boards, as CI runs them): check-deltas OK (439 traces, 105,446 boards, 57,443 sent as deltas, every rebuilt board equal to the worker's), check-snapshot-first, check-hidden-hands, check-hidden-log, check-kinds, check-hidden-tops, check-hidden-mulligans, check-hidden-information (105,446 boards, 337 cards the viewer may not see, none named), check-wording (0 hits) and check-questions-asked: all OK.

**New Lab scenarios, three times each (TEST-013):** `check-thrown-away.py` (all five, `drew` included) 3 of 3 OK; `drew` on origin/main WRONG: "asked at Main 2 (an Island to play), her board still says passing: {'turn': 9, 'why': 'Three lands; no land in hand'}". `check-unreachable.py ante` OK; on origin/main WRONG (a grey notice, no report).

**Unit tests:** JUnit `PassingEveryStepTest` (6), `ActionReportsTest` (+1); Vitest `fixes0124screen.test.tsx` (5), `fixes0097.test.tsx` F-0124-E.

**Bites (TEST-004), each made a test fail, then restored:**

| Mutation | Caught by |
|---|---|
| `recheck`: something to play no longer clears | `PassingEveryStepTest.somethingToPlayOutsideAStopTakesItAwayToo` |
| `asked` clears nothing | `PassingEveryStepTest.setAtMain1ThenGoneWhenAskedThenBackWithAFreshReason` |
| once set this turn, never re-read (the old rule) | `PassingEveryStepTest.aChangedReasonIsSentEvenWithoutAQuestion` |
| the empty-stack guard removed | `PassingEveryStepTest.neverWithAFullStackBeforeMain1OrOnTheOtherTurn` |
| the "from Main 1 on" guard removed | the same |
| ANTE told to every reader | `ActionReportsTest.anteCardsTakenOutAreToldToTheDecksOwnerOnly` |
| `MatchController` no longer calls `asked` | Lab `drew`: "her board still says passing" |
| **HID guard** (HID-004): the ANTE report made for everyone and rendered for every reader | Lab `ante`: "seat 2 was told about seat 1's deck (HID-001)" |
| the ante report released before the first turn | Lab `ante`: "the report showed before the first turn, over the opening hand" |
| `othersMove` removed | F-0124-A (4 tests) |
| `othersMove`: the stack only / the asking only | F-0124-A (1 test each) |
| `reportWho` ignores `byWords` | F-0124-C |
| "→ out of the game" removed | F-0124-C |
| `byWords` not read from the board | F-0124-C |
| replay offered for the game's own report | F-0124-C |
| the game's notices put back at the top right | F-0124-E |

**Real-click game (TEST-011, TEST-012), stack B at 452cf289:** `match-passing.spec.ts` "spec 0124" passed. Its record: both pages' ante windows "Your deck · Contract from Below" with the game's shield and nothing at the top right; while the guest's Bolt was cast and waited, the host's button said "Pat's move · Making a choice", and in 58 looks with the Bolt on the stack it never said "Passing"; after it resolved, "Passing · Nothing to play: Three lands; no land in hand"; the host's Scroll Thief attacked on turn 7 and after its draw the reason became "Three lands; no land you can play" (an Island now in hand, at the combat step). Stills looked at: `0124-host-ante-window.png` (the window as on the canvas, the placeholder picture of the CI deck), `0124-host-bobs-move.png`, `0124-host-passing-again.png`, `0124-host-after-the-draw.png` ("PASSING · Nothing to play: Three lands; no land you can play" beside the Thief's trigger card).

One look in an earlier run of that game read a `[data-passing]` element whose words were "Pat's move…" (the element was gone at the next look; not seen again, and the page tests find no such element). The test now reads the element and its words in one look and fails on any such element (`odd`), so a real one cannot pass unnoticed.

