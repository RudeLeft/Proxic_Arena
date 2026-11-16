# 0097 — Pop-ups clean-up: no stuck boxes, grey notices become proper windows, fewer windows for the player who acted

**Status:** Built 2026-11-16, unreleased. Approved 2026-11-16 (owner, by prompt, on the canvas "Pop-ups audit 2026-11-16", https://claude.ai/artifact/WUjW4sAmGEDFVUqTBmQPyr, sections 1-4).
**Owner decisions:** section 1 **A · on the act button**; sections 2-3 **approve all four**; section 4 **all three changes** (no window for your own counter/mill/bounce/phase; your own reveal to the other player only; drop "Bob is casting a spell…").

The pop-ups audit owed since 2026-11-12 (memory "explain card actions in windows, not pills"), redone on 2026-11-16 against current main.

## Why (researched)

- **Stuck "Nothing you can play this turn".** It is a grey `NoticeStack` card (worker `host.note`, `PriorityStops.java` ~185-237, `MatchController.java` ~730-735; page `useGameMessages`, `GameScreen.tsx` ~5126-5158; `NoticeStack.tsx`; `notices.ts`). Two bugs: (A) `NoticeStack` pauses fades while `pointed`; when a clickable page notice (invitation, "declined", "Reconnecting") is removed under the pointer, no `mouseleave` arrives, `pointed` stays true, and every later grey card mounts paused forever (no ×, click-through) — reproduced in jsdom; (B) on a fresh mount of the game screen `seenTotal` is null, so all kept notices (up to 6 for the whole match) replay as new.
- Other grey notices that belong elsewhere: N2 "{Card}: you can't pay {cost}, so it was skipped." (`MatchController.java` ~916); N10 "The game restarted. This is game {n} of the match." (`GameHost.java` ~1442-1449); N8/N9 refused attacks and blocks (`CombatChoices.java` ~185-199); N3 "{Name} cannot be named here." (`MatchController.java` ~4571).
- Dead or fallback-only paths: N5/N6/N7 `host.note` fallbacks (`MatchController.java` ~5879, ~5920, ~6052-6058) and the grave word pill (`Board.tsx` ~7311-7333; `Moves.java` ~107-139 `said`), never shown.
- Windows to the player who acted: `ActionReports` `toBoth` (~161-163, `tells` ~1406) gives the actor a window for MILL, COUNTER, RETURN and PHASE when the subject is the other player; the plain reveal tray (0045) shows a revealer their own reveal; "{Bob} is casting a spell…" under the rising back (`CastingCard.tsx` ~358-369).

## Built

1. **No stuck notices.** `NoticeStack` resets its hover pause when the hovered card goes or the stack empties; on the first board after mount the kept notices count as already seen (no replay).
2. **"Nothing you can play" on the act button (A).** The worker no longer sends the grey line; the snapshot carries the auto-pass state and the act button reads "Passing" with "Nothing to play · {N lands, …}" while the turn auto-passes, gone at the turn line. If attacks are possible the button still offers them.
3. **Unpayable trigger → FIZZLE report** to both (0079's precedent): "Bob's Lightning Rift did nothing: he couldn't pay {1}." / "Your Lightning Rift did nothing: you couldn't pay {1}." Grey line removed.
4. **Game restart → report window** to the other player only: "Bob restarted the game. This is game 2." with the card's picture (Karn Liberated). Grey line removed.
5. **Refused attack / block** words move to the combat button's note (where "can't go there" already shows), attackers or blockers still selected. Grey line removed.
6. **A refused name** shows in red inside the naming window that is asking again. Grey line removed.
7. **Fewer windows for the actor** (the 0086 A4 / 0089 A1 rule): MILL, COUNTER, RETURN and PHASE no longer give a window to the player who did it when the subject is the other player; FIZZLE still tells both (0079). A plain reveal (0045 tray) goes to the other player only, not the revealer.
8. **No "Bob is casting a spell…" caption** under the rising back.
9. **Dead paths removed**: the N5/N6/N7 fallbacks (logged only) and the grave word pill (page and worker `said`).
10. Kept as system messages: connection, away, errors, result, loading, "watching", report dialog, ante; the 0058 "Nothing to do with this card right now" note; state words (TAPPED, Still to pay, the stack caption).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0097-A | Close an invitation under the pointer, then a notice arrives: it fades; reload mid-game: no old notice replays | page test |
| F-0097-B | Auto-passed turn: the act button says why; nothing at the top right; gone at the next turn | page test; real-game test (TEST-012) |
| F-0097-C | Unpayable trigger and Karn restart give the windows above, to the right players | worker test; Lab |
| F-0097-D | Refused attack and refused name show where the player acted | page test; real-game test |
| F-0097-E | Counterspell, mill, bounce, phase: no window for the actor; reveal: other player only; no casting caption | worker test; page test; Lab hidden checks |

## Amendments

### As built (2026-11-16)

- **1. No stuck notices.** `NoticeStack` remembers which card is under the pointer (`data-notice`, or "*" for the stack itself) instead of a plain flag; a pause holds only while that card is still shown, and an empty stack forgets it. `useGameMessages` counts the kept notices of the first board after mount as seen (turn 0, the opening hand, excepted: an ante card taken out is still told).
- **2. On the act button.** Worker: `PriorityStops.passedTurn` records the turn and why (`nothingToPlay` now returns only "2 lands, no land in hand"); `passingFor` puts `passing` {turn, why} on that seat's own boards during that turn only; no `host.note`. Page: `passingOf` (only while `board.turn` is that turn and the viewer is active, so a step into the next turn takes it away before any board) and a "Passing" / "Nothing to play · {why}" button (`.gs-passing`, gold edge, the why wraps -- the first real-game screenshot showed it cut to "1 land, …"); it is not held over the turn line by 0058's steady button. A combat question still wins.
- **3. Unpayable trigger.** `ActionReports.unpaid`: a FIZZLE with `unpaid` cost, to both; the card shown where it is only when the reader may see it.
- **4. Restart.** New kind `RESTART`, told to the other player only, with the card that did it shown as it was (the last ability seen on top of the stack, since Forge empties the stack before it says the game restarted), under the report's own id.
- **5-6. Refusals.** A new decision field `refused` (worker `GameHost.offerRefused`/`takeRefused` per seat, server `DecisionRequest.refused` passed through to that seat only): the combat button's note shows it; the naming window shows it in red (`.gs-name-refused`, role alert).
- **7. Audiences.** `tells`: MILL, COUNTER, RETURN and PHASE go to everyone but the actor; FIZZLE still both. Own reveal: `Causes.revealFor` leaves out a seat's plain reveal of its own cards when another seat was shown the same cards, unless a card went back into the library (the other player would then know a top card the revealer was not shown).
- **8.** The caption is gone; the back keeps its aria-label "Bob is casting a spell".
- **9.** N5/N6/N7 log to the worker's stderr. The grave word pill is gone from the page (`graves`, `graveTagFrames`, `GRAVE_TAG_HOLD_MS`, the `grave` mark) and the worker (`Move.said`, `withSaid` → `withWhy`, `graveReason` returns the why only).
- **Deviations.** (1) The unpayable sentence says "they couldn't pay {1}", not the canvas's "he": the game does not know a player's pronoun, and the other reports already say "their". (2) Karn's restart is checked in `check-karn.py` (updated: seat 2 told, seat 1 not, no grey line) rather than a new card-actions scenario: it needs 14 loyalty. (3) No real-game refused attack: neither test deck makes one simply; it is covered by the page test. (4) No card was found where Forge shows the revealer their own plain reveal today (Goblin Ringleader's is already the chooser's own, Amendment 13 item 7; Armored Kincaller's reveal from hand is not sent to its owner by Forge), so the reveal guard has no test that fails without it; the Lab's `reveal` scenario proves the audience.
- **Tests.** Page: `fixes0097.test.tsx` (13, the real game screen and the notice stack); `fixes0072`/`fixes0081` now assert no caption; `fixes0061`'s tag tests replaced by one (no tag read); `fixes0074`/`0066`/`0075` follow. Bite: with each change undone -- the hover reset, the first-board priming, `passingOf` (twice: none, and not turn-bound), the combat note, the naming line -- a 0097 test fails; with the caption back, `fixes0072` and `fixes0081` fail. Worker: `ActionReportsTest` (audiences, restart, unpaid words), `SurvivorsTest` (phase), `ThrownAwayTest`, `MovesTest`; with the old audiences restored, 4 `ActionReportsTest` tests fail. Server: `WorkerFramesTest` "a refusal is carried to the asked player".
- **Lab.** `check-card-actions.py` gains counter, mill, unpaid, reveal: 3 full runs, all 12 scenarios OK each time; `check-hidden-hands`, `-log`, `-tops`, `-mulligans` OK over the 36 traces. Re-run once each: `check-game-flow`, `check-anywhere`, `check-players`, `check-who-did-it` (scour: Bob only), `check-thrown-away` (passed reads `passing`; no word tags), `check-karn` -- all OK; hidden checks OK over their traces.
- **Browser specs.** `match-what-happened`, `match-interaction`, `match-state` and `battlefield.spec`: 8 of 8 passed on the rebuilt local stack.
- **Real game (TEST-012).** New `e2e/match-passing.spec.ts` on the local stack: both players with the Karn deck; after the Plains, the turn passes and the act button reads "Passing / Nothing to play · 1 land, you've already played a land this turn"; no top-right notice on either page; the other seat's button never says it; gone when turn 2 begins. `match-karn.spec.ts` updated (report window to one seat, no grey line) but not run here (about 20 minutes).
- **Flake found.** Server `DeckBuilderApiTest` "each printing of a card wears its own picture" failed once in the full `:server:test` (1 of 692, with a Docker build and Lab games running alongside), passed alone; recorded in ROADMAP's flake list. ktlint and detekt passed.
- **Clips.** `Arrow videos/0097/1-passing-act-button-normal.webm` (the passing seat: Passing through Main 1 and Combat, gone at the turn line), `2-other-seat-never-told-normal.webm`.
