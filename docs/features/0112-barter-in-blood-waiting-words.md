# 0112 — Barter in Blood: the waiting line says what is being chosen and that you choose next; your window opens with what the first player sacrificed

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase.
**Built:** 2026-11-20 (commit 5d9d48e1). **Released:** in 1.75.0, 2026-11-21.
**Owner decisions** (owner feedback batch 2026-11-19b, `Owner feedback 2026-11-19b decisions.md`; canvas `frontend/zz-canvas/feedback-1119b.html`):

- Item 10, canvas section "10", option **A** ("Say what they are doing, and what they sacrificed"): **"the line reads "Choosing what to sacrifice · you choose next", and the waiting player's window opens with what the caster sacrificed."** Option B (their picks light up as they choose) was not taken.

- **Approved 2026-11-20** (owner, by prompt: "Approve all."). Build 0108 → 0115 in that order, one at a time, then release them together as 1.75.0. The default below was in the spec the owner approved and stands.

Research: `Owner feedback 2026-11-19b research A.md` item 10 (in the working folder; the owner's A is research A's option C).

## Why (researched)

Read at main 1f813795 (1.74.0).

- **The card and Forge's order** (SOURCE). Barter in Blood is `SP$ Sacrifice | Amount$ 2 | SacValid$ Creature | Defined$ Player`. Forge's `SacrificeEffect` goes through the players in turn order from the active player (`getTargetPlayers`); for each it asks `choosePermanentsToSacrifice`, **sacrifices that choice at once**, then asks the next. The caster's two creatures are in the graveyard before the other player is asked.
- **The rules** (UPSTREAM-DOC CR 101.4, APNAP): the active player chooses first, then the other player, knowing the first player's choices. Showing the waiting player what was sacrificed, and that they choose next, is what the rule intends. Forge sacrificing each choice before the next is asked (the rules have the sacrifices happen together, which can change the order of "dies" triggers) is Forge's rules handling: noted, not ours to change (ARCH-002, VEND-001).
- **The worker** (SOURCE). `MatchController.choosePermanentsToSacrifice` → `choosePermanents("choosePermanentsToSacrifice", "Sacrifice", …)`; the question goes to the chooser only. `ActionReports` has no sacrifice kind.
- **The server** (SOURCE). `AskingWords.doingWord` gives everyone else a fixed word per question; for this one the catch-all "Choosing" (`MatchHub` `askingMessage`, sent as `doing`). It already takes a `readerSeat` (spec 0104: "Choosing from your hand").
- **The page** (SOURCE). `stops.ts` `waitingLine` → `movesLine` → `doingLine`: with `doing == "Choosing"` and Barter still on top of the stack (`MagicStack.resolveStack` keeps it there until it finishes), the line reads "RudeLeft's move · Making a choice for their Barter in Blood", under the act button (`GameScreen.tsx` `gs-waiting`). It doesn't say "sacrifice" or that you are next. Then the caster's creatures shatter (Phase 10 A-04, `why: "sacrificed"`), and your sacrifice window opens without saying what they gave up.

## What the player sees

Bob is you, watching; RudeLeft (the active player) casts Barter in Blood (canvas "10", option A).

1. **While RudeLeft chooses**, your waiting line reads "RudeLeft's move" and under it "Choosing what to sacrifice · you choose next".
2. RudeLeft's Abattoir Ghoul and Makeshift Mauler shatter (A-04, as today).
3. **Your window opens** with a first line in the standard report style: RudeLeft's medallion, "RudeLeft sacrificed Abattoir Ghoul and Makeshift Mauler.", their two pictures; then your own question as today ("Choose what to sacrifice", two of your creatures to click).
4. You click two; they shatter. RudeLeft's waiting line during your choice: "Bob's move · Choosing what to sacrifice" (nobody chooses after you, so no "you choose next").
5. **Other cases.** Innocent Blood (one creature each): the same, "RudeLeft sacrificed Abattoir Ghoul.". You have no creatures: Forge asks you nothing, so RudeLeft's line never said "you choose next". RudeLeft had no creatures: he is not asked, your window opens with no first line (the approved default). Diabolic Edict on you alone: only you choose; RudeLeft's line is "Bob's move · Choosing what to sacrifice". A spectator sees "Choosing what to sacrifice" with no "you choose next".

## Changes

### Worker

- **Who still chooses.** For a `choosePermanentsToSacrifice` question asked while a `Sacrifice` effect resolves, the request carries `nextSeats`: the seats after the asked one in Forge's own player list for this effect (`SacrificeEffect`'s `getTargetPlayers` order, read from the resolving ability, never from its text) that have at least one card Forge would offer (Forge's own valid-card filter, `CardLists.getValidCards` with the effect's `SacValid`, as spec 0104's `ActionReports.handHasChoice` uses `AbilityUtils.filterListByType`). Not sent to the page; read by the server only.
- **What was sacrificed before you.** The same question carries `earlier`: for each seat that already chose for this resolution, its seat and the cards it sacrificed (the board's card ids and names, from Forge's record of this resolution: the cards moved battlefield → graveyard with `why: "sacrificed"` by this resolving ability, as A-04 already reads). Public: the cards were on the battlefield and are now in a graveyard. Empty when they sacrificed nothing.

### Server

- `AskingWords.doingWord(request, readerSeat)`: `request.kind == "choosePermanentsToSacrifice"` → "Choosing what to sacrifice"; when `readerSeat` is in `nextSeats`, " · you choose next" is added for that reader only (from the seat list, never from English, PROTO-006; ARCH-005: the server knows seats, not why). Spectators get "Choosing what to sacrifice". The reconnect path (`askingFor`, no reader seat) gives "Choosing what to sacrifice".
- `nextSeats` is not forwarded to any page.

### Protocol

- `protocol/README.md`: `decision.nextSeats` (worker → server only), `decision.earlier` (to the asked seat, in its question). `match.ts`: `Decision.earlier`, read by its parser.

### Page

- `stops.ts` `doingLine`: shows the server's `doing` as the line's second part when it is a sentence the server wrote ("Choosing what to sacrifice · you choose next"), instead of "Making a choice for their {card}" (the "for their {card}" wording stays for the catch-all "Choosing").
- The sacrifice window (`QuestionWindows.tsx` / `CardTrays.tsx`, whichever draws `choosePermanentsToSacrifice` today): when `earlier` is not empty, its first line is a report row in the standard report style (`RevealTray.tsx`'s medallion and pictures, `PlainWords`-style words): "{player} sacrificed {A and B}." One row per earlier seat.

## Rules and boundaries

- **HID-001/005:** the waiting player learns only the choice made (public on the board) and that their own choice is coming (which follows from their own creatures, which they can see); never the caster's options. "you choose next" is the same words whether the reader has two creatures or ten. A spectator gets no "you choose next".
- **PROTO-006 / ARCH-005:** the server's words come from the question kind and a seat list the worker computed; the server knows no Magic.
- **FORGE-RULE:** Forge's order and Forge's sacrifices; nothing reordered.
- **House rules:** no pill, no top notice: the line is the existing waiting line; the "what they sacrificed" line sits inside the window you are about to use (windows, not pills, 2026-11-15).

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0112-A | Worker: Barter in Blood with two creatures each: the active player's question has `nextSeats` = [the other seat], the other's has none; the other's question has `earlier` naming the active player and their two cards; the other player with no creatures: the first question has no `nextSeats`; the active player with no creatures: the second question's `earlier` is empty | `check-sacrifice.py` (extended), scenarios `barter`, `barter-none-second`, `barter-none-first`; Innocent Blood as `innocent` |
| F-0112-B | Server: `doingWord` for the reader in `nextSeats` → "Choosing what to sacrifice · you choose next"; another reader and a spectator → "Choosing what to sacrifice"; `nextSeats` absent from every frame a page receives | `AskingWordsTest`; the server's frame test |
| F-0112-C | Hidden information: `earlier` names only cards that are in a graveyard in the reader's own snapshot of that moment; no frame to the waiting seat carries the active player's options; both seats' frames read (HID-003) | `check-sacrifice.py` + `check-hidden-tops.py` over its traces; bite: `earlier` filled from the active player's offered cards instead of the sacrificed ones, and the check fails |
| F-0112-D | Page: the waiting line from a real board and `doing`; the sacrifice window with `earlier` shows the medallion, the sentence and the pictures above the question; without `earlier`, the window as today | `fixes0112screen.test.tsx` (the real game screen, TEST-003) |
| F-0112-E | Real-click game (TEST-012), below | `match-sacrifice.spec.ts` (extended) |

**TEST-004 (bites):** `doingWord` adding "you choose next" for every reader (B fails); `nextSeats` leaking to a page (B fails); the earlier line dropped by `match.ts`'s parser (D fails); the HID-004 bite above (C). About four page, two server and three worker mutations.

**Real-click game (TEST-012).** Spec 0098's exact deal, two creatures each. The host casts Barter in Blood. On the guest's page the waiting line reads "Choosing what to sacrifice · you choose next" while the host's sacrifice window is open; the host **really clicks** two creatures and Done; the guest's window opens with "{host} sacrificed {A} and {B}." and the two pictures; the guest **really clicks** two creatures; both graveyards gain two. During the guest's choice, the host's line has no "you choose next". Waits on states (the question present, the line's text, the graveyard counts). Clip: one normal-speed clip from the guest (what changes is the waiting player's view).

## Out of scope

- Option B (their picks light up as they choose).
- The same "you choose next" for other "each player" choices (each player discards, each player chooses a creature to keep). **Trigger (PHASE-004):** the owner reports the same confusion for a discard or a keep-one effect, or a Lab scenario shows such a wait; then a spec extends `nextSeats` and `earlier` to those question kinds.
- The order of "dies" triggers (Forge's).

## Open questions

None. The default the owner approved with the spec stands: when the first player sacrificed nothing, the second player's window has no first line (rather than "RudeLeft had nothing to sacrifice.").

## Build order notes

After 0111. Worker fields and the Lab scenarios first, then the server word, then the page line and the window's first line, then the real-click game.

## As built (2026-11-20)

Built on main at 4c5b0786 (Spec 0111), not committed. Labels: SOURCE (read in the code), RUN (run here, this build).

### Worker

- **`SacrificeTurns.java`** (new). Extends Forge's `SpellAbilityEffect` only to call its protected `getTargetPlayers` (VEND-003: a subclass, no copy, no reflection), so the order is Forge's own list for the resolving Sacrifice ability (APNAP from the active player). `order(sa)`: that list, only for `ApiType.Sacrifice` with a `SacValid` other than `Self`. `hasChoice(sa, player)`: will Forge ask them, read as `SacrificeEffect.resolve` decides it (SOURCE): not for `Random`; `StrictAmount` short of the amount, no; else Forge's own filter, `AbilityUtils.filterListByType` with `SacValid` then `CardPredicates.canBeSacrificedBy` (not for `Destroy`), and each part of a `SacEachValid` list. (The spec named `CardLists.getValidCards`; Forge's effect uses `filterListByType`, so that is what is read.)
- **`facts(...)`**: `nextSeats` = the players after the asked one in that list who have a choice, each as the seat **authorised to answer** for them (their controller's `MatchController` seat; their own seat otherwise); `earlier` = each player before the asked one, with the cards **they chose** (recorded by `chose(...)` when their `choosePermanents` returned) that are **now in a graveyard** (`game.getCardsIn(Graveyard)`, by id), named as the asker may know them (`ViewerSnapshot.nameFor`). A player with none has no row. The record is keyed by the resolving stack entry (Forge's object, weakly held), then by the ability, so a second cast of the same card starts empty.
- **Where it is sent.** `MatchController.choosePermanents`, for `choosePermanentsToSacrifice` only: `GameHost.offerSacrificeTurns` before the picks, cleared in a `finally` after them (like `looking`, not per question, because Forge's "sacrifice two" is two questions, one pick each). `WorkerMain` adds the two fields to every question frame while set.

### Server

- `MatchProtocol.kt` `DecisionRequest.nextSeats` / `earlier`, read by `WorkerFrames.kt` `readDecisionFrame` (seat numbers only; an empty `earlier` is none).
- `AskingWords.kt` `doingWord`: `choosePermanentsToSacrifice` → `SACRIFICING` ("Choosing what to sacrifice"); for a `readerSeat` in `nextSeats`, "Choosing what to sacrifice · you choose next" (a no-break space before the dot, see the decisions). Spectators (`doingWord(request)`) and the reconnect path (`askingFor`, no reader) get the plain words. From the seat list only (PROTO-006, ARCH-005).
- `DecisionLayout.kt` `putLayout`: `earlier` goes to the asked seat with its question; `nextSeats` is never put in any page frame.

### Protocol

- `protocol/README.md`: `MATCH_ASKING.doing` (the new words), `decision.nextSeats` (worker → server only), `decision.earlier` (to the asked seat). `frontend/src/match.ts`: `Decision.earlier` (`DecisionEarlier`), parsed by `asEarlier`.

### Page

- **The waiting line: no change needed** (SOURCE). `stops.ts` `doingLine` already shows any `doing` other than the catch-all "Choosing" as it is, so the server's sentence reads as the line's second part and "Making a choice for their {card}" stays for "Choosing". F-0112-D tests it from a real board.
- **The window's first line.** `QuestionWindows.tsx` `EarlierLines`, passed to `GameWindow.tsx` `Bubble` as its new `lead` (drawn above the window's heading) by `TableQuestionWindow`, which draws every sacrifice from the table. One row per earlier seat: the player's medallion (`GameScreen.tsx` `actingAs`, the report windows' own, passed as `Common.whoOf`), "RudeLeft · Barter in Blood" (`gs-reveal-by`), the sentence `earlierWords` ("RudeLeft sacrificed Typhoid Rats and Walking Corpse.", `andList`), and each card's picture (`BigCard small`, the board's own card by id, in the graveyard) with its name. Then the question as today. `game.css` `.gs-earlier*`: 100 px pictures, a gold rule under the line, so the window stays beside the stack and off the creatures to click.

### Lab

- `scripts/check-sacrifice.py`, four new scenarios: `barter`, `barter-none-second`, `barter-none-first`, `innocent` (Innocent Blood, Alice offered two and keeping one). Every sacrifice question records its `nextSeats`, `earlier` and the graveyard cards the asker's own latest snapshot shows (`Asked.answer`); `earlier_problems` (F-0112-C) fails any `earlier` card not in a graveyard in that snapshot, named otherwise, or offered to the earlier player and kept. Already in ci.yml's Lab list (`sacrifice`), so CI runs the new scenarios.

### Tests and runs

- **F-0112-A (RUN):** `check-sacrifice.py`, all nine scenarios (five old, four new) OK, three runs in a row on the final worker. `barter`: Alice is asked twice (one pick each), both with `nextSeats [2]` and no `earlier`; Bob twice, no `nextSeats`, `earlier` = Alice's two picks in her order, named, in Bob's graveyard view. `barter-none-second`: no `nextSeats`, Bob never asked. `barter-none-first`: Alice never asked; Bob's questions carry no `earlier`. `innocent`: Bob's `earlier` is Alice's one pick, not the creature she kept.
- **F-0112-B (RUN):** `AskingWordsTest` ("an each-player sacrifice tells the next chooser, and only them"); `WorkerFramesTest` ("... next seats stay on the server, its earlier choices go to the asker": every question and asking frame a page gets, for the asked seat, the next seat and a spectator, without `nextSeats`; `earlier` in the asker's question).
- **F-0112-C (RUN):** `earlier_problems` in every scenario, three runs; over the 27 traces: `check-hidden-tops.py` no problems (exit 2: none of its own kinds in these games, as CI allows), `check-hidden-hands.py` OK (2153 hand-card sightings, both seats compared round by round), `check-snapshot-first.py` OK (2904 questions, each after its state), `check-hidden-log.py` OK.
- **F-0112-D (RUN):** new `fixes0112screen.test.tsx`, the real game screen fed the frames each seat was sent in the `barter` and `barter-none-first` Lab games (cut into `fixes0112.round.json`, the questions shaped as the server sends them): Bob's line "Alice's move" / "Choosing what to sacrifice · you choose next", the plain words, and "Making a choice for their Barter in Blood" for the catch-all; Bob's window with the medallion, "Alice · Barter in Blood", "Alice sacrificed Walking Corpse and Walking Corpse.", both pictures (Alice's two, her order), before the heading, and a click on his own creature on the board answering it; his second pick keeps the line; Alice's window and Bob's in `barter-none-first` have no first line.
- **F-0112-E, the real-click game (TEST-012; RUN):** second test in `e2e/match-sacrifice.spec.ts`, deck `protocol/fixtures/barter-deck` (48 Swamp, 4 each of Barter in Blood, Typhoid Rats, Walking Corpse; built in CI, ci.yml), dealt (spec 0098). Both players really click their Swamps, Typhoid Rats and Walking Corpse into play (paying with real clicks), and the host casts Barter in Blood. While the host's sacrifice window is open, the guest's line is "RudeLeft's move" / "Choosing what to sacrifice · you choose next". The host really clicks its two creatures. The guest's window then opens with the host's medallion, "RudeLeft · Barter in Blood", "RudeLeft sacrificed Typhoid Rats and Walking Corpse." (the host's own click order), both pictures (the cards' ids), all above the heading. Meanwhile the host's line is "Pat's move" / "Choosing what to sacrifice". The guest really clicks its two. Graveyards, read on both pages: host 3 (two creatures and Barter in Blood), guest 2. Waits on states (the question there, the line's words, the graveyard counts once no number is held back for a card on its way). `match-sacrifice.spec.ts` (both tests) ran three times in a row, green each time (2.1-2.3 min), on the stack rebuilt with this code; the third run was filmed.
- **Existing browser specs that read the waiting line (RUN, headless bundled Chromium):** `match-always-choose`, `match-modes-doing`, `match-stack-rests`, `match-opening-hand`, `match.spec.ts`, `match-many-triggers`: 6 passed, 1 skipped (`match.spec.ts`'s existing `test.fixme`). Of the sacrifice windows, only `match-sacrifice.spec.ts`'s first test (Innocent Blood, unchanged) covers one; it passed in all three runs.
- **Jump check (RUN, headless bundled Chromium, nothing else running):** `frontend/tools/jumps` over the four new scenarios' traces from the third Lab run (`barter`, `barter-none-second`, `barter-none-first`, `innocent`; both seats). The replay covered among others 20 battlefield→graveyard sacrifices and 32 cast→stack moves. `scripts/check-jumps.py` found no jump, pop-in, blink or unseen move (exit 0).
- **Mutations (TEST-004; RUN): 9 of 9 caught** (one more, equivalent, recorded): see `mutations.txt` in the handover.
- **Gates (RUN):** frontend `tsc -b`, `eslint . --max-warnings=0`, `prettier --check src e2e tools`, vitest (119 files, 1652 tests); worker `mvn -q -o test`; server `ktlintCheck detekt test`; `python -I scripts/check-doc-refs.py`.

### Spec mismatches (built to Forge)

- **No Done.** The spec's game has the host click two creatures "and Done". Forge's "sacrifice two creatures" is two questions, one pick each ("(2 more needed)", "(1 more needed)"), with no Done; the second click ends it. The first line stays on both of the second player's questions.
- **The window's heading** is "Sacrifice" with Forge's own line "Barter in Blood: sacrifice two creatures (2 more needed)", as today, not "Choose what to sacrifice".
- **Forge's filter** is `AbilityUtils.filterListByType` + `canBeSacrificedBy`, not `CardLists.getValidCards` (above).

### Decided while owner away, to review (2026-11-20)

- **A no-break space before the dot** in "Choosing what to sacrifice · you choose next". The line does not fit the act button on one line at 1920×1080; without it the second line began with "·" ("Choosing what to sacrifice" / "· you choose next"). Now the dot stays with "sacrifice" ("Choosing what to" / "sacrifice · you choose next", seen in the real-click game). To reverse: `AskingWords.kt` `doingWord` (a plain space).
- **Who "next" is:** the seat authorised to answer for the next player (their controller under Mindslaver), not the player's own seat, so the words go to whoever will actually click. To reverse: `MatchController.choosePermanents`'s `authorisedSeat` lambda.
- **Only cards now in a graveyard are named.** A sacrificed card that went elsewhere (exiled by a replacement such as Rest in Peace) is left out of the sentence, because the spec's guarantee is "in a graveyard in the reader's snapshot". To reverse: `SacrificeTurns.facts` (look the card up in any zone).
- **Duplicate names stay as Forge names them:** "Alice sacrificed Walking Corpse and Walking Corpse." (not "two Walking Corpses"); the pictures show both. To reverse: `QuestionWindows.tsx` `earlierWords`.

## Amendments

None yet.
