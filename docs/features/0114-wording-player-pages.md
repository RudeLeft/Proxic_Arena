# 0114 — Plain-English wording, step 2: player pages, error messages and emails (deck import first); the two "Forge" leaks; /status admin-only

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase.
**Owner decisions** (owner feedback batch 2026-11-19b, `Owner feedback 2026-11-19b decisions.md`; canvas `frontend/zz-canvas/feedback-1119b.html` section "3"):

- Item 3 follow-up, scope step **"2. Player pages, error messages and emails, deck import first."**
- The same rules as step 1 (spec 0113): "color"; the type-line dash only, no dashes anywhere else; printed game terms keep their digits; ordinary sentences use words (counts of one to ten); no code words.
- **"Also found:** "Forge" reaches players in two places: the deck-import error "Forge does not know a card named ..." and "Forge Runtime" on /status. This breaks the no-engine-name rule. **Fix it in step 2 (make /status admin-only).**"

- **Approved 2026-11-20** (owner, by prompt: "Approve all."). Build 0108 → 0115 in that order, one at a time, then release them together as 1.75.0.

## The fix list

**`docs/features/wording/0114-wording-table.md`**: 158 lines, ids `W2-001` to `W2-158`, generated 2026-11-20 from `Window wording list 2026-11-19 - second sweep.md` (List 2) sections 2c (player pages, 80 lines), 2d (/status, 4), 2e (server sentences players read and the one email line, 67), its 2b row for the deck-import "Forge" line, and `... - third pass.md` (List 3) rows 47-52, with the owner's rules applied (List 3 §5's corrections: "canceled", "three wins to one"; counts above ten back to digits). Edited by hand from here.

**Deck import first** (owner): `W2-001` (the "Forge does not know" line), `W2-086` to `W2-107` and `W2-121` to `W2-137` (`deck/DeckImporter.kt`, `deck/ArtStore.kt`, `deck/DeckList.kt`, `deck/CardResolver.kt`, `deck/OpenFormat.kt`, `room/MatchPreflight.kt`, `deck/PackageInspector.kt`, `deck/DeckRoutes.kt`, `deck/DeckRenameRoutes.kt`, under `server/src/main/kotlin/net/barnflix/proxic/`).

A few lines, as a player will read them:

| Where | Today | After |
|---|---|---|
| Deck import (`W2-001`) | Line 12, Foo: Forge does not know a card named "Foo". | Line 12, Foo: Arena doesn't know this card yet. |
| Deck import (`W2-086`) | NOT_A_PICTURE: "art/Foo.png" is not a PNG or a JPEG. | The picture for Foo is not a PNG or JPEG file. |
| Deck import (`W2-091`) | Line 0: the decklist contains no cards | The deck list has no cards in it. |
| Deck import (`W2-092`) | line is not '<quantity> <card name> [SET:NUMBER]' | This line should be a number of copies and then a card name, for example "4 Lightning Bolt". |
| Lobby (`W2-105`) | Open Format allows at most 4 copies of "X"; this deck has 5. | Open Format allows at most four copies of "X". This deck has five. |
| Sign-in throttle (List 2 2e) | Too many sign-in attempts. Try again in 900 seconds. | Too many sign-in attempts. Try again in about 15 minutes. |
| Email (List 2 2e) | This link works once and expires in 1 hour, on … | This link works once and runs out in one hour, on … |
| Hall (List 3 row 48) | Favourite deck | Favorite deck |
| /status (`W2-082`) | Forge Runtime / Forge 2.0.16 · 1a2b3c4d5e · Java 21 | (admin only; see below) |

## Why (researched)

`Window wording list 2026-11-19 - second sweep.md` §1 and §4 (SOURCE) and the third pass's window table (SOURCE). Re-read at main 1f813795.

- **The server's sentences are player text** (SOURCE, List 2 2e): the pages show the server's `detail` word for word almost everywhere (`lobby.ts`, the socket `ERROR` and `SETUP_PROBLEM`, `LoginPage.tsx`, `AccountPage.tsx`, `decks.ts`, the Deck Builder import). So these are fixed in the Kotlin, not on the page. No error code reaches a player bare, except the deck import's picture problems (`DeckImporter.storeArtwork` glues `"${stored.code}: "` to the front).
- **The "Forge" leaks** (SOURCE). `forge-worker/src/main/java/net/barnflix/proxic/worker/ForgeRuntime.java` `Resolution` "NOT_FOUND": "Forge does not know a card named \"…\".", passed to the player by the server's `DeckImporter.notPlayable` (and `CardResolver.resolve`'s `detail`, List 2 2e). `/status`: `frontend/src/App.tsx` `App` shows "Forge Runtime" and "Forge {forgeRelease} · {forgeCommit} · Java {javaVersion}" (`frontend/src/status.ts`), and `frontend/src/routes.tsx` guards `/status` with `RequireAuth` only, so every signed-in player can open it.
- **What a player meets first** (List 2 §4): the join page ("3 to 32 letters or digits", also wrong about what is allowed) and the first deck-import error ("NOT_A_PICTURE: …"): deck import goes first, as the owner said.

## What the player sees

1. **A Deck Builder import with a problem.** Pat sends a deck with a card Arena can't play and a picture that isn't a PNG. The Deck Depot (and the Deck Builder) say "Line 12, Foo: Arena doesn't know this card yet." and "The picture for Foo is not a PNG or JPEG file." No codes, no file paths, no byte counts, no "Forge".
2. **The lobby.** A deck with five copies: "Open Format allows at most four copies of "Lightning Bolt". This deck has five." One sentence per problem, not a semicolon chain.
3. **Signing in too often**: "Try again in about 15 minutes." (never "900 seconds" or "1 seconds").
4. **/status**: a player who opens /status sees the same "not for you" notice the admin page gives a non-admin; the admin sees it as today, with "Rules engine" in place of "Forge Runtime" (W2-082).
5. Everywhere on player pages: "color", "Favorite", "Sat, Nov 8", "canceled", "two" not "2" in sentences.

## Changes

- **Server (Kotlin) sentences**: every `W2` row whose source is under `server/src/main/kotlin/`, deck import first. Error **codes** stay as they are (they are the protocol; pages and the Deck Builder read codes, not words, PROTO-006); only the `detail` sentences change. The Deck Builder is a separate project (ISO-002): it shows Arena's `detail` words and reads Arena's codes; the builder confirms from its source (read-only) that no Deck Builder behaviour depends on the English of a `detail` (a grep of `Proxic_Deck_Builder` for the old words), and records the result.
- **The worker's deck-check words** (`ForgeRuntime.Resolution` details): "Arena doesn't know this card yet." and the other resolver reasons as `W2` rows say, keyed on the resolution's code; the server maps worker reasons to fixed words (`CardResolver.resolve`, List 2 2e) so no worker text reaches a player unmapped.
- **/status admin-only**: `frontend/src/routes.tsx` puts `/status` behind the admin check the admin page uses (a non-admin sees the admin page's not-an-admin notice); the server endpoint behind `status.ts` answers a non-admin without the engine fields (`forgeRelease`, `forgeCommit`, `javaVersion`) **unless** the builder finds another player page needs them (the update check), in which case the fields stay in the reply and are never shown. Spec 0021's `/api/deck-rules` (`deck/DeckRules.kt`, the Deck Builder's contract) keeps its `forgeRelease`: it is read by the Deck Builder, never shown to a player.
- **Player pages (TypeScript)**: every `W2` row under `frontend/src/` (lobby, rooms, Deck Depot, account, join and reset, Hall, the report dialog, notices).
- **Email**: `auth/AccountEmails.kt` `AccountEmails.passwordReset`, text and HTML.

## Rules and boundaries

- **No "Forge" in player text** (owner rule): after this step no player page or server sentence a player reads contains it; admin pages and logs are exempt (0115 and the logs keep it where it is useful).
- **PROTO-006:** codes unchanged; words change. The e2e and vitest suites are grepped for any old sentence used as a locator or a condition.
- **ISO-002:** nothing is written in `Proxic_Deck_Builder`.
- **AUTHORIZATION:** making /status admin-only is an access change: `docs/architecture/AUTHORIZATION.md` gains its line, and the server check is the source (the page's guard is presentation).

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0114-A | Server: every `W2` server row has an exact-string test of its new `detail` (deck import first: each of `W2-086` to `W2-107` and `W2-121` to `W2-137` from a real package or decklist fixture); codes unchanged | server unit tests (`DeckImporterTest`, `PackageInspectorTest`, `DeckListTest`, `OpenFormatTest`, `MatchPreflightTest` or the builder's names) |
| F-0114-B | Worker: an unknown card's resolution reads "Arena doesn't know this card yet."; no resolver reason contains "Forge" | worker unit; a grep gate over `forge-worker/src/main` for player-facing "Forge" strings in `Resolution` details |
| F-0114-C | /status: a player's request to the status endpoint gets no engine fields (or the page shows none, per the builder's finding); the page route shows the not-an-admin notice to a player and the page to an admin | server route test; `routes.test.tsx` or the builder's vitest |
| F-0114-D | Pages: every `W2` page row has a vitest assertion of its new words (aria text included) | vitest |
| F-0114-E | A "no Forge, no dashes, no colour, no (s)" sweep of the built frontend bundle's player-page strings and the server's `detail` strings (a script over the source, the same rules as `check-wording.py` with its exemptions), zero hits outside admin and logs | `check-wording.py --source` (an added mode) or a new small script, in CI |
| F-0114-F | Real-click game (TEST-012), below | `match-wording-pages.spec.ts` (or extending `decks.spec.ts`-style e2e) |

**TEST-004 (bites):** the old "Forge does not know" detail restored (B fails); the code prefix restored on picture problems (A fails); /status back to `RequireAuth` (C fails); the source sweep's "Forge" rule disabled (its self-test fails). About six server and six page mutations.

**Real-click flow (TEST-012).** On the local stack: a player **really uploads** a deck package with one unknown card and one bad picture through the Deck Depot's own upload control, and the page shows the two new sentences; the player **really clicks** into a room with a five-copy deck and reads the one-sentence refusal; the player opens /status and gets the not-an-admin notice; the admin opens it and sees "Rules engine". Locators by role, never by the old words.

## Out of scope

- The game screen (0113) and admin pages (0115).
- The Deck Builder's own words (a separate project, ISO-002).
- New error codes or changed codes.

## Open questions

None.

## Build order notes

After 0113. Inside: deck import (worker resolver words, then the server's import and package sentences), then /status, then the other server sentences and the email, then the player pages, then the source sweep in CI and the real-click flow.

## As built (2026-11-21)

Built on main at a97e3137 (after spec 0113), not committed. Labels: SOURCE (read in the code), RUN (run here, this build). Built by a lead and two builders in one tree: server (every Kotlin sentence, the `/api/version` change), pages (every `frontend/src` row, the `/status` guard); the lead built the worker words, the source sweep and its CI step, the real-click test and its deck, and integrated.

### (1) Deck import first

- **The worker** (SOURCE, RUN). `ForgeRuntime.Resolution.notFound` now says `Resolution.NOT_FOUND_WORDS`, "Arena doesn't know this card yet."; `printingMismatch` says "Arena doesn't have this printing of this card (asked for ..., found SET NUM)." Neither names the engine. The server never passes either on: `CardResolution.wordsFor` (server `deck/CardResolver.kt`) gives fixed words by the resolution's status (W2-101), so a player reads "Line 2, Mistyped Goblin: Arena doesn't know this card yet." whatever the worker sends.
- **The server's import and package sentences** (W2-086..W2-107, W2-121..W2-137): codes unchanged, words per the ledger. A picture problem no longer starts with its code ("NOT_A_PICTURE: ...") or names the zip path; the code goes to the log. One helper for counts, waits and sizes: `PlayerWords` (`server/.../proxic/PlayerWords.kt`: `number`, `count`, `waitWords`, `megabytes`).
- **The Deck Builder** (SOURCE, read only, ISO-002): `mtgdb/arena/connection.py` reads Arena's replies by `errorCode`; its one use of a `detail`'s English is `_quoted`, pulling the deck name out of the duplicate-deck sentence ("You already have this deck: ..."), which this spec does not change. A grep of the Deck Builder's Python for every old sentence found none.

### (2) /status admin-only

- **The page** (`frontend/src/routes.tsx`): `/status` is behind `RequireAdmin` (`frontend/src/AdminOnly.tsx`, shared with the Admin page, whose words are unchanged): a player sees the Admin page's own notice, "This page is for administrators.", under the title "Server check". The administrator sees the page with "Rules engine" for "Forge Runtime" (W2-082), "Administrator" / "Player" (W2-083), "Version 1.74.0 · protocol v1 · build ..." (W2-084). The engine's version line ("Forge forge-2.0.15 · 4ec5f1a2c3 · Java 17.0.20.1") stays for the administrator: admin pages are exempt.
- **The server is the source** (`Application.kt` `/version`): a player's `GET /api/version` carries `proxicVersion`, `protocolVersion` and `buildId` only (the update check needs `buildId`, the report dialog `proxicVersion`); an administrator's carries all six. `docs/architecture/AUTHORIZATION.md` has the line. `/api/deck-rules` keeps `forgeRelease` (read by the Deck Builder, never shown). `/api/system/status` is unchanged (three health words, no names).

### (3) The other server sentences and the email; (4) the player pages

Every row, with its exact words, is in the ledger below.

### (5) Safety net 3: the source sweep (F-0114-E)

`scripts/check-wording.py --source` (and `scripts/page-strings.mjs`, which reads the pages with the frontend's own TypeScript, so comments are never read and JSX text, string and template literals are each one string). It reads every player page's strings (`frontend/src`, less admin pages, `App.tsx` now admin-only, the development pages and their fixtures, tests), every server string (`server/src/main/kotlin`, less `admin/` and `AdminTool.kt`), and the strings of the worker's `ForgeRuntime.Resolution`; it leaves out what no player reads: log and exception calls, a worker's failed-start detail (`WorkerStart.Failed`, logged by `MatchRuntime.start`; the room gets the code, which the page words itself) and the worker probe's reason (`Result.Incompatible`, log and admin), class names and other code attributes, imports, CSS values and SQL. Rules: a dash (the type line's excepted), "(s)", "colour", "Forge". In ci.yml's checks job after `npm ci`. `--self-test` gained two cases (every source rule and exemption on a small tree).

- **RUN:** on this build, 1,578 player strings read, **0 hits**.
- **The bite (RUN):** the same sweep over main before this spec (`git archive HEAD` of `frontend/src`, `server/src/main`, `ForgeRuntime.java`) finds 4 hits: `AccountPage.tsx` "Signed out of ${...} session(s) everywhere." (maybe), `RevealTray.tsx` "${...}, the colour chosen" (colour), `ForgeRuntime.java` "Forge does not know a card named ..." and ", Forge returned " (forge). Exit 1.
- Two lines it found on this build were fixed: `battlefield/RevealTray.tsx`'s screen-reader "White, the colour chosen" (spec 0075; now "color"), and nothing else outside the table (the rest were the development fixtures' type lines and CSS, now left out by rule).

### PROTO-006

- No page behaviour reads a server `detail`'s English. The page maps known codes to its own words where the table asked (W2-018 `SIGN_IN_FAILED` for a non-401; W2-081 `DECK_REQUIRED`, `NOT_READY`, `NOT_CONNECTED`, `ACCESS_REVOKED`); `hall.ts` `runOf` reads the On Fire run from its label in digits or words (the badge has no number field).
- **e2e locators moved off words:** `lobby.spec` reads a room's seats from `data-taken="1/2"` (the hidden text is now "One of two seats taken"); `match-helpers.ts` `inviteIn` likewise; the rest assert the new words read from a role.

### Tests and runs

- **F-0114-A (RUN).** Server: `Words0114DeckTest` (13 tests: DeckList, OpenFormat, CardResolution words, ArtStore, PackageInspector, DeckNames), `Words0114ImportTest` (11: real packages through `DeckImporter`), `Words0114RoutesTest` (3: the version reply, the ids, the real sign-in throttle), `Words0114Test` (9: helpers, account rules, email, launch refusals); `CardResolverTest`, `DeckImportTest`, `MatchPreflightTest`, `HallTest`, `LimitsTest`, `AdminApiTest`, `RoomRoutesTest` updated to the exact new words. Codes asserted unchanged.
- **F-0114-B (RUN).** Worker: `CardPoolTest#resolverWordsNeverSayForge` (a real unknown card's resolution reads "Arena doesn't know this card yet."; neither resolver reason contains "Forge"); the source sweep reads `ForgeRuntime.Resolution`'s strings in CI.
- **F-0114-C (RUN).** `Words0114RoutesTest` "F-0114-C a player's version has no engine fields, an administrator's has them"; `frontend/src/routes.test.tsx` "shows a player at /status the administrators-only notice" and "shows an administrator /status with Rules engine".
- **F-0114-D (RUN).** `frontend/src/wording0114.test.ts` and `frontend/src/wording0114pages.test.tsx` (every page row, aria text included), `routes.test.tsx`; 19 existing assertions updated in 11 files. vitest: 124 files, 1,808 tests, green (one W2-151 test added by the lead).
- **F-0114-E (RUN).** As (5).
- **F-0114-F, the real-click test (TEST-012; RUN).** `frontend/e2e/match-wording-pages.spec.ts`, deck `protocol/fixtures/pages-deck` (56 Mountain, 4 Lightning Bolt; built twice in CI, ci.yml, once with Lightning Bolt's picture made text by `make-ci-deck.mjs --not-a-picture=`). Four tests, all green on the final build: (1) the import route, with the player's own session, refuses a 60-card list with "Mistyped Goblin" with `CARDS_NOT_RESOLVED` and the one problem "Line 2, Mistyped Goblin: Arena doesn't know this card yet.", and the bad-picture package with `INVALID_ARTWORK`, "Some pictures in this deck can't be used:" and "The picture for Lightning Bolt is not a PNG or JPEG file."; neither reply holds "Forge", a code or a zip path. (2) The host's deck is given a fifth Lightning Bolt in the database (with `PROXIC_E2E_CONTAINER`, as CI sets it); both players really click Ready and the host really clicks Start match; the host's "Your deck" notice reads "Open Format allows at most four copies of "Lightning Bolt". This deck has five." (3) Ten real clicks of Sign in for a made-up username, then "Too many sign-in attempts. Try again in about 15 minutes." (4) Pat at /status: the notice, no "Rules engine", nothing with "Forge" or "Java", and a version reply with no engine fields; RudeLeft: "Rules engine", no "Forge Runtime".
- **Existing browser specs (RUN, headless bundled Chromium, `--workers=1`, one run at a time).** First run (13 specs the builders touched or whose words changed: `auth`, `belt-records`, `decks`, `foundation`, `lobby`, `match-concede`, `sharing`, `notices`, `match-report`, `match-setup`, `device-link`, `admin`, `production`): 68 passed, 1 skipped (production, by its own rule), 5 failed: four on old words the builders' greps missed (fixed, see the greps below) and the away line (below, open). Final run on the final build (`match-wording-pages`, `auth`, `belt-records`, `decks`, `lobby`, `match-setup`, `foundation`): **57 passed, 1 failed**, the one being `lobby.spec` "spec 0060: a 12-letter name and its away line fit the players column" ("1920x1080: the away line needs 196 of 188"), since decided while owner away (A, below), and the test re-run green.
- **Stills (RUN, 1920x1080)**, read here: the host's lobby with the five-copy notice (the sentence wraps inside the notice card after "Lightning", nothing cut), the notice alone, the sign-in page with the throttle (two lines, then the grey line, inside the card), /status as Pat (the notice under "Server check") and as RudeLeft ("Rules engine" row, "Administrator", the version line). Deck import errors have no still: no Arena page shows them (see mismatches).
- **Mutations (TEST-004; RUN): 20 of 20 caught**, each after an unmutated control run passed. Server 6/6: the "CODE: " prefix back on picture problems (`Words0114ImportTest` fails); the worker's own detail passed through unmapped (`CardResolverTest`, two); engine fields sent to every signed-in user (`Words0114RoutesTest`); the throttle saying "$seconds seconds" (`Words0114RoutesTest`); the preflight joining with "; " (`MatchPreflightTest`); copy counts as digits (`Words0114DeckTest`). Page 8/8: /status back to `RequireAuth` (`routes.test.tsx`); `agoText` back to digits; W2-018's fallback always the wrong-password words; the hidden seat count back to "1/2"; `shortDate` back to en-GB; W2-156 back to the server's sentence; the reaction's aria-label back to the count; W2-081's code mapping skipped (each fails `wording0114*.test`). Worker 1/1: the old "Forge does not know" words back in `NOT_FOUND_WORDS` (`CardPoolTest#resolverWordsNeverSayForge` fails). Source sweep 5/5 (`-X pycache_prefix=<tmp>` per run): its "Forge" rule off, its dash rule off, admin pages no longer exempt, log calls read, Kotlin strings not read (each fails `--self-test`).
- **Gates (RUN), on the final tree:** frontend `npx tsc -b`, `npx eslint . --max-warnings=0`, `npx prettier --check src e2e tools`, `npx vitest run` (124 files, 1,808 tests); worker `mvn -q -o test`; server `./gradlew -q :server:ktlintCheck :server:detekt :server:test` (757 tests, 0 failed, with the local stack running: no port clash); `python -I scripts/check-doc-refs.py` (and `--self-test`); `check-wording.py --self-test` (20 cases) and `--source` (0 hits). All green. The browser suite's one failure is the open owner question.

### The ledger: each row, its words and what proves it

Built by: server / pages (the builders), lead. "Proved by": server tests in `server/src/test/kotlin/net/barnflix/proxic/` (`D` = `deck/Words0114DeckTest`, `I` = `deck/Words0114ImportTest`, `R` = `Words0114RoutesTest`, `W` = `Words0114Test`); page tests in `frontend/src/` (`w` = `wording0114.test.ts`, `p` = `wording0114pages.test.tsx`, `r` = `routes.test.tsx`); "e2e" = `match-wording-pages.spec.ts`; "code" = checked in the source only.

| Id | Built by | Status | The words (exact, or chosen for an instruction row) | Proved by |
|---|---|---|---|---|
| W2-001 | lead + server | done | "Line 2, Mistyped Goblin: Arena doesn't know this card yet." (worker `NOT_FOUND_WORDS`; server `CardResolution.wordsFor`) | worker `CardPoolTest#resolverWordsNeverSayForge`; I "W2-001 a card Arena does not know"; D "W2-001 and W2-101 ..."; e2e (1) |
| W2-002 | pages | done (already 12) | "At least 12 characters" | w "W2-002, W2-003, W2-004" |
| W2-003 | pages | done | "At least 12 characters: three more to go" / "...: one more to go" | same |
| W2-004 | pages | done | "It can't be only spaces" | same |
| W2-005 | pages | done (already right) | "a password of at least 12 characters" | w "W2-005, W2-006" |
| W2-006 | pages | done | "one more password character" / "three more password characters" | same |
| W2-007 | pages | done | "a shorter display name (one character too many)" / "(four characters too many)" | w "W2-007" |
| W2-008 | pages | done | "Needed, up to 12 characters" | p "W2-008, W2-014, W2-015, W2-016" |
| W2-009 | pages | done (already 12) | "What other players see, up to 12 characters. You can change it later." | p "W2-009, W2-010, W2-011" |
| W2-010 | pages | done | "a username (three to 32 letters, digits, dots, underscores or hyphens)" | same |
| W2-011 | pages | done | "What you sign in with: three to 32 letters, digits, dots, underscores or hyphens" | same |
| W2-012 | pages | done (second sentence kept, Decided 1) | "It may have been used already or canceled, or it may have expired. Ask whoever invited you for a new one." | p "W2-012" |
| W2-013 | pages | done (second sentence kept, Decided 1) | "It may have been used already or replaced by a newer one, or it may have expired (links last an hour). Ask the person who runs your Proxic Arena for a new one." | p "W2-013" |
| W2-014 | pages | done | "Signed out of one session. You'll be taken to sign in." / "Signed out of three sessions. You'll be taken to sign in." | p "W2-014: one session"; auth.spec |
| W2-015 | pages | done | button "Sign out everywhere" | p "W2-008..."; auth.spec |
| W2-016 | pages | done | "Choose an avatar" | p "W2-008..."; auth.spec |
| W2-017 | pages | done | "This is only a short wait, not a lock. Nothing has been switched off, and no one can lock you out by guessing." | p "W2-017"; e2e (3) |
| W2-018 | pages | done | 401: "That username and password do not match."; anything else: "Signing in didn't work just now. Try again in a moment." (`SIGN_IN_FAILED`) | w "W2-018" (two tests) |
| W2-019 | pages | done | "Closes in two hours" / "Closes in an hour" / "Closes in 45 minutes" / "Closes now" | w "W2-019" |
| W2-020 | pages | done | "five minutes ago" / "one minute ago" | w "W2-020, W2-021, W2-022" |
| W2-021 | pages | done | "two hours ago" / "an hour ago" | same |
| W2-022 | pages | done | "three days ago" / "14 days ago" / "yesterday" | same |
| W2-023 | pages | done | "Away for five minutes"; row "Away for seven minutes · in the lobby"; screen reader "Dana, away for seven minutes" | w "W2-023, W2-024, W2-025"; `presence.test.ts`; lobby.spec |
| W2-024 | pages | done | "Away for two hours" / "Away for an hour" | same |
| W2-025 | pages | done | "Offline · last seen two hours ago" | same |
| W2-026 | pages | done | "One seat open" / "Three seats open" | w "W2-026"; lobby.spec |
| W2-027 | pages | done | "Only the room's host can invite players" | w "W2-027, W2-028, W2-029" |
| W2-028 | pages | done | "You can send one invitation at a time" | same |
| W2-029 | pages | done | "In a game" | same |
| W2-030 | pages | done | "You were away for ten minutes, so you left the room." | w "W2-030, W2-031" |
| W2-031 | pages | done | "one hour", "two hours", "one minute", "five minutes", "30 minutes" | same |
| W2-032 | pages | done ("game", Decided 5) | "The game did not start. The room is open again." / "The game was abandoned. Nobody won it, and the room is open again."; label "Game", title "The game did not start" | w "W2-032"; match-concede.spec |
| W2-033 | pages | done | "This room closes in five minutes because nothing has happened." | p "W2-033...W2-039" |
| W2-034 | pages | done | "Invited, waiting for an answer" | same |
| W2-035 | pages | done | "Burn (60 cards)" | p "W2-035" |
| W2-036 | pages | done | link "Go to the Deck Depot to add a deck" | p "W2-033..." |
| W2-037 | pages | done | hidden text "One of two seats taken"; `data-taken="1/2"` for tests | same; lobby.spec |
| W2-038 | pages | done | "One online" / "Nobody else online" | p "W2-038" |
| W2-039 | pages | done | "Offline (one player)" / "Offline (four players)" | p "W2-033..." |
| W2-040 | pages | done | close button aria-label "Close" | p "W2-040" |
| W2-041 | pages | done (Decided 3) | "Three new" / "One new" | p chat test |
| W2-042 | pages | done | "👍 from Pat and Sam" | same; lobby.spec |
| W2-043 | pages | done | "React with 👍" | same; lobby.spec |
| W2-044 | pages | done | title "That didn't work" | w "W2-044" |
| W2-045 | pages | done | "60 cards · shared with two players" / "... one player" | p Deck Depot test |
| W2-046 | pages | done | "Two decks" | same |
| W2-047 | pages | done | "Creatures, one card" / "Lands, 24 cards" | same; decks.spec |
| W2-048 | pages | done | "Four copies" / "One copy" | same |
| W2-049 | pages | done | "Tokens, three pictures" / "Tokens, one picture" | same; decks.spec |
| W2-050 | pages | done | "Different cards" | same |
| W2-051 | pages | done | button "Stop sharing", aria-label "Stop sharing with Pat" | same; sharing.spec |
| W2-052 | pages | done | "Sharing could not be stopped. Try again." | same |
| W2-053 | pages | done | "The deck could not be shared. Try again." | p "W2-053" |
| W2-054 | pages | done | tab "More families" | w "W2-054, W2-153" |
| W2-055 | pages | done | "First place" / "Second place" / "Third place" | p Hall test |
| W2-056 | pages | done | "Second place" / "Third place" | p "W2-056"; `champions.test.tsx` |
| W2-057 | pages | done | "· defended three times" / "· defended once" | p Hall tests |
| W2-058 | pages | done | "Finish a game every seven days, or the belt passes to the top-rated active player." | p Hall test; w "W2-058"; belt-records.spec |
| W2-059 | pages | done | "You need five games in a season to be ranked." | p Hall test |
| W2-060 | pages | done | "Nobody is ranked yet: five finished games put a player on the board." | p "W2-057, W2-060" |
| W2-061 | pages | done | "Playing their way in · five games to be ranked" | p Hall test |
| W2-062 | pages | done | "two of five" | same |
| W2-063 | pages | done | "Up two places" / "Down one place" | p Hall test; w "W2-063" |
| W2-064 | pages | done | header "Won · Lost · Drawn" | p Hall test |
| W2-065 | pages | done | header "Rank" | same |
| W2-066 | pages | done | "Last five: won, lost, drawn, won, won" | p; w "W2-066" |
| W2-067 | pages | done differently (Decided 4) | shown "3 to 1"; read aloud "three wins to one" | p; w "W2-067" |
| W2-068 | pages | done | "three days", "two hours", "one hour", "12 days" | w "W2-068, W2-069" |
| W2-069 | pages | done | "Held for three days" / "Held for one day" | same |
| W2-070 | pages | done | "Three wins in a row (a loss or a draw ends the run)." | w "W2-070..W2-073" |
| W2-071 | pages | done | "Won a game by turn five this season." | same |
| W2-072 | pages | done | "Played ten or more games and never conceded one." | same |
| W2-073 | pages | done | "Won with five or more different decks." | same |
| W2-074 | pages | done | "won three of five" / "won nine of 12" | w "W2-074" |
| W2-075 | pages | done (Decided 6) | "Pat beat Sam on turn seven and took the Belt (+12)" / "Pat beat Sam on turn 12 (+12)" | w "W2-075, W2-076" |
| W2-076 | pages | done | "Pat took over the Belt: Sam hadn't played for seven days" | same |
| W2-077 | pages | done | "or choose or paste a picture" | p report test |
| W2-078 | pages | done | "Also: what your screen did in the last 15 minutes (clicks, messages and errors), the Proxic version, and your browser and screen size." | same |
| W2-079 | pages | done | "It went to the admins.... It is report #42, if you want to mention it." | p "W2-079"; match-report.spec |
| W2-080 | pages | done | "Turn 3 · Sam's turn" (the step only when known, never the raw phase); "Your turn"; "the other player's turn" (`ReportDialog.tsx` `whoseTurnWords`, used by `GameScreen`) | p report test |
| W2-081 | pages | done | `DECK_REQUIRED` "Choose a deck."; `NOT_READY` "Mark yourself ready."; `NOT_CONNECTED` "You are not connected. Reload the lobby."; `ACCESS_REVOKED` "That deck is no longer available to you. Choose another."; a deck's own rule problems (`INVALID_FOR_PRESET`, `FORGE_RESOLUTION_ERROR`) keep the server's sentence (it names the card or the count); an unknown code shows the server's sentence, or "Your deck can't be used for this game. Choose another." when it is empty | w "W2-081"; match-setup.spec; e2e (2) |
| W2-082 | pages + server | done | row "Rules engine"; /status admin-only (page `RequireAdmin`; server: no engine fields for a player) | r (two tests); R "F-0114-C ..."; e2e (4) |
| W2-083 | pages | done | "Administrator" / "Player" | r admin test |
| W2-084 | pages | done (admin-only chosen) | "Version 1.74.0 · protocol v1 · build ..." (was "Foundation Build ...") | r admin test; foundation.spec |
| W2-085 | pages | done (now unreachable: /status needs an administrator) | "Accounts are by invitation. Sign in to see your decks." | r "W2-085" |
| W2-086 | server | done | the code no longer starts the line; it goes to the log ("picture {member} refused: CODE") | I "W2-086 and W2-136 ..."; e2e (1) |
| W2-087 | server | done | "The picture for Foo is not a PNG or JPEG file." / "... is too big (9000 by 9000 pixels)." / "... is too small (10 by 10 pixels)." / "... has no size we can read." / "... could not be opened." / "... is too big (17 MB; the most is 16 MB)." | D (three tests); e2e (1) |
| W2-088 | server | done | "Lightning Bolt: its picture was not sent, and none of your decks has it. Send the deck again with its pictures." | I "W2-088 ..." |
| W2-089 | server | done | "The list of pictures in this deck file could not be read. Send the deck again." | I "W2-089 ..." |
| W2-090 | server | done | "This deck has 501 pictures, and the most a deck can have is 500." | I "W2-090 ..." |
| W2-091 | server | done | an empty list: "The deck list has no cards in it." (no "Line 0:"); else "Line 3: {Reason}" | I "W2-091 ..." (two tests); D |
| W2-092 | server | done | "This line should be a number of copies and then a card name, for example "4 Lightning Bolt"." | D; I |
| W2-093 | server | done | "The number of copies is missing or is not a number." | D |
| W2-094 | server | done | "A card needs at least one copy." | D |
| W2-095 | server | done | "5,000 copies is too many; a line can have at most 1,000." | D |
| W2-096 | server | done | "This line has no card name." | code (the parser's pattern makes it unreachable) |
| W2-097 | server | done | "The deck list has no cards in it." | D "W2-091 and W2-097 ..." |
| W2-098 | server | done | "The deck list is too long to import. Remove some lines and send it again." | I "W2-098 ..." |
| W2-099 | server | done | import: "The cards could not be checked just now. Try sending the deck again in a minute.", with no list; preflight: "The deck could not be checked right now. Try again in a moment." | I "W2-099 and W2-100 ..."; `MatchPreflightTest` |
| W2-100 | server | done | said once, never per card; the reason is logged | same |
| W2-101 | server | done | by status: "Arena doesn't know this card yet." / "Arena doesn't have this printing of this card." / "The cards could not be checked just now." | D; `CardResolverTest` (two tests) |
| W2-102 | server | done | "This card works differently in each printing, and Arena doesn't have this one." | `DeckImportTest` |
| W2-103 | server | done | "A Contraption deck needs at least 15 Contraptions, or none. This deck has three." / "An Attraction deck needs at least ten Attractions, or none. This deck has one." | D |
| W2-104 | server | done | "A Contraption deck can have only one copy of each card. This deck has two copies of "Auto-Key"." | D |
| W2-105 | server | done | "Open Format allows at most four copies of "Lightning Bolt". This deck has five." (also "Open Format requires at least 60 cards. This deck has 52.") | D; `MatchPreflightTest`; e2e (2) |
| W2-106 | server | done | one sentence per problem, joined with a space | `MatchPreflightTest` (an exact two-problem line); e2e (2) |
| W2-107 | server | done | "These cards are not supported yet: A, B, C and two more." / "This card is not supported yet: X." (the worker's " (NOT_FOUND)" after each name, which players read until now, removed) | `MatchPreflightTest` (real worker) |
| W2-108 | server | done | "This room needs two players and has one." | code |
| W2-109 | server | done | "A username must be at least three characters long." (and "A username can be at most 32 characters.") | W "W2-109 to W2-113 ..." |
| W2-110 | server | done | "A username can use only letters, numbers, dots (.), underscores (_) and hyphens (-)." | same |
| W2-111 | server | done | "A display name can be at most 12 characters." | same |
| W2-112 | server | done | "A password must be at least 12 characters long." | same |
| W2-113 | server | done | "A password can't be only spaces." | same |
| W2-114 | server | done | "Too many sign-in attempts. Try again in about 15 minutes." | R "W2-114 ..." (the real throttle); e2e (3) |
| W2-115 | server | done | "Too many tries. Try again in {about N minutes / a minute / a few seconds}." | W "W2-114 to W2-116 ..." |
| W2-116 | server | done | same | same |
| W2-117 | server | done | "You can't invite yourself." | code |
| W2-118 | server | done | "A room" when there is no host | W "W2-118 ..." |
| W2-119 | server | done | "Someone is sitting in a seat this change would remove." | code |
| W2-120 | server | done differently (Decided 7) | "That match is no longer being set up. Press Start match again." | W "W2-120 and W2-158 ..." |
| W2-121 | server | done | "This deck file is too big (170 MB). The most Arena takes is 150 MB." | D |
| W2-122 | server | done | "This deck file is too big. The most Arena takes is 150 MB." | code |
| W2-123 | server | done | "This deck file has too many files inside it (601; the most is 600)." | D |
| W2-124 | server | done | "One of the files inside this deck file is too big (17 MB; the most is 16 MB)." | D |
| W2-125 | server | done | "This deck file is too big once unpacked (more than 200 MB)." | D |
| W2-126 | server | done | "This deck file unpacks to far more than its size, so Arena won't open it. Export the deck again." | D |
| W2-127 | server | done | "That file isn't a deck file Arena can open. Export the deck again from the Deck Builder." | D; decks.spec (code) |
| W2-128 | server | done | "This deck file has two files with the same name ("a" and "b"). Export the deck again." | D |
| W2-129 | server | done | "This deck file has a file Arena doesn't expect: "x". Export the deck again." | D |
| W2-130 | server | done | "This deck file has no deck list in it." | D |
| W2-131 | server | done | "This deck file has two deck lists in it. It should have one." | D |
| W2-132 | server | done | "This deck file can't be opened safely. Export the deck again from the Deck Builder." | D (unsafe path; the compression case shares the words: code) |
| W2-133 | server | done | "This deck file has 501 pictures; the most a deck can have is 500." | D |
| W2-134 | server | done | "No deck file arrived. Try sending it again." | D |
| W2-135 | server | done | "The deck could not be added. Try sending it again." | code |
| W2-136 | server | done | "Some pictures in this deck can't be used:" | I; e2e (1) |
| W2-137 | server | done | "A deck name can be up to 80 characters, on one line." | D |
| W2-138 | server | done | "That was too much to send at once." (the limit logged) | `LimitsTest`; `AdminApiTest` |
| W2-139 | server | done | "That page doesn't exist." / "That picture is no longer available." | R "W2-139 to W2-145 ..." (page half; the picture half: code) |
| W2-140 | server | done | "That picture is no longer available." | R |
| W2-141 | server | done | "That picture is no longer available." / "That game doesn't exist." | R |
| W2-142 | server | done | "That deck doesn't exist." | R |
| W2-143 | server | done | "That player doesn't exist." | code |
| W2-144 | server | done | "That room doesn't exist." | R |
| W2-145 | server | done differently (Decided 7) | "That match could not be started. Press Start match again." / "That game doesn't exist." | R |
| W2-146 | server | done | "Choose how many players." / "Choose a deck." / "That couldn't be changed. Try again." | code |
| W2-147 | server | done | "Too many pictures to check at once." | code |
| W2-148 | server | done | "That message is gone." / "That reaction isn't available." | code |
| W2-149 | server | done | "There is no player with the username "{username}"." | code |
| W2-150 | server | done | "Your report could not be sent. Try again." | code |
| W2-151 | server + lead | done (Decided 8) | label "On Fire: six wins in a row"; the Hall's chip shows "On Fire", its tooltip "Six wins in a row (a loss or a draw ends the run)." | `HallTest` (exact); w "W2-151 ..." |
| W2-152 | server | done | "This link works once and runs out in one hour, on {until}." (text and HTML) | W "W2-152 ..." |
| W2-153 | pages | done | tab "Colors" | w "W2-054, W2-153"; `deckIcons.test.tsx` |
| W2-154 | pages | done | "Favorite deck" | p Hall test |
| W2-155 | pages | done | "Sun, Nov 8"; "Defend by Sun, Nov 8 · four days left"; the lobby's "Defend your belt by Sun, Nov 22: ..." | w "W2-155"; belt-records.spec |
| W2-156 | pages | done (Decided 9) | the host's notice "The player took back their request to join" (no "ask again" line) | w "W2-156" |
| W2-157 | pages | done | "Type a message…" | p chat test; `fixes0064.test.tsx` |
| W2-158 | server | done | "Something changed. Press Start match again." / "That game type is no longer offered." | W (one refusal); the rest code |

### Spec mismatches (built to what the code allows)

- **The Deck Depot has no upload control** (spec 0022 removed it; `decks.spec` checks there is no file input). So F-0114-F's "really uploads ... through the Deck Depot's own upload control, and the page shows the two new sentences" cannot be done: a deck arrives from the Deck Builder, which shows Arena's words in its own window. The test sends the packages through the import route with the player's own session (as `decks.spec` does) and reads the reply's words; there is no still of them, as no Arena page shows them.
- **The unknown card and the bad picture are two packages:** the import checks cards before pictures and stops at the first refusal, so one package never carries both sentences.
- **A five-copy deck cannot reach a room by import** (the import refuses it with W2-105's words). The real-click test gives the stored deck a fifth copy in the database (`PROXIC_E2E_CONTAINER`, set in CI as for `match-concurrency`), as a deck kept from before a rule change would hold.
- **W2-120 / W2-145 vs W2-158:** "Prepare it again" names a button that does not exist (W2-158 says so); every such line says "Press Start match again."
- **W2-087** gained "too small": the picture check also refuses pictures under 50 pixels.
- **W2-096** looks unreachable (the parser's line pattern needs a name).
- **W2-002, W2-005, W2-009** already said 12 (the page writes the constant); **W2-080**'s step fallback was in `GameScreen.tsx`, not the dialog; **W2-085** can no longer be seen (an administrator is signed in).
- **W2-107:** players had been reading "Not supported yet: Foo (NOT_FOUND)" (the worker's status after each name); the server now drops it.

### Found here, outside the table

- **Fixed** (same rules, one line each): `RevealTray.tsx` "the colour chosen" (found by the source sweep); the room refusal the host reads when a seat needs attention, `MatchSetupRoutes.kt` "Not everyone is ready yet." (shown under "That didn't work" with both seats ready when the problem was a deck; seen in the five-copy still), now "A seat needs attention before the game can start." (`RoomRoutesTest` "the host is told which seats need attention, never why"); the empty deck file ("This deck file is empty. Export the deck again."), the too-few and too-many cards lines (two sentences each) and the oversized picture (in MB); `decks.ts` shareDeck's other fallback ("The deck could not be shared.").
- **Not fixed, for a later step:** the Deck Depot's card close-up reads "4 copies · 2 of 2" (`CardZoom.tsx`); not in the table, and "2 of 2" is a position, so left for the owner.

### The away line no longer fits a row with an Invite button (decided while owner away: A, to review 2026-11-21)

W2-023's approved words make the lobby's away line longer than the room spec 0060 gives it (F-0060-C, `lobby.spec` "spec 0060: a 12-letter name and its away line fit the players column"): measured at 1920x1080 in the real lobby, "Away for seven minutes · in the lobby" is 214 px, "Away for 59 minutes · in your room" 201 px, "Away for two hours · in a game" 178 px, and a row with an Invite button has 188 px for it (the old "Away 59 min · in the lobby" fitted). In a row with an Invite button the line now wraps to two lines; offline rows and rows without a button have room (still `lobby-away-line-1920.png`). No wording that follows the rules fits ("Away seven minutes ..." and "... · lobby" are still over, or not English). That is a look change, so it is left for the owner, the words built as approved and the 0060 test failing on them:

- A. Keep the words; the away line may take two lines in a row with an Invite button (change F-0060-C's gate to allow it).
- B. Keep the words; give the text a little more room at 1920 (about 26 px: the column, or the button's width), a look change.
- C. Keep the old short form on the row only ("Away 7 min · in the lobby"), the words everywhere else (screen reader, the seat, the chat); W2-023 would be done only for the screen reader.

Recommendation: A (the row grows by one line only while that player is away, and the words are the owner's rule). **Decided while owner away, to review (2026-11-21): A.** The words stay as approved; F-0060-C's gate in `lobby.spec` now checks the away line is never cut and fits in two lines of the text's width, instead of one. Reverse: restore the one-line check and pick B or C.

### Decided while owner away, to review (2026-11-20)

Each with what was chosen, why, and how to reverse it.

1. **W2-012 / W2-013 keep their second sentence** ("Ask whoever invited you for a new one.", "Ask the person who runs your Proxic Arena for a new one."): the table's After left it out, but without it the page says what went wrong and not what to do. Reverse: drop it in `JoinPage.tsx` / `ResetPage.tsx`.
2. **W2-014** says "You'll be taken to sign in." after the one-session line too. Reverse: `AccountPage.tsx` `everywhere`.
3. **W2-041** is always "{N} new" ("One new", "Three new"), not "One new message". Reverse: `LobbyChat.tsx`.
4. **W2-067** shows "3 to 1" and reads aloud "three wins to one": the score sits in a large one-line display face between two names, and the whole phrase would squeeze the names (a look change). The en dash is gone. Reverse: render `winsTo(a, b)` in `HallPage.tsx`.
5. **W2-032: "game" everywhere,** the notice label too ("Match" to "Game") and the other failed-start sentences. Reverse: `notices.ts` `lobbyNoticeOf`, `lobby.ts` `matchFailed`.
6. **W2-075:** the turn in words ("on turn seven"), and the draw line likewise. Reverse: `hall.ts` `latestText`.
7. **"Press Start match again."** for every "Prepare ... again" (W2-120, W2-145, W2-158). Reverse: the strings in `MatchLaunch.kt`, `MatchLauncher.kt`, `MatchRoutes.kt`.
8. **W2-151, the On Fire badge:** the server's label carries the run in words ("On Fire: six wins in a row", the row's own example), and the Hall's chip shows the badge's name only, "On Fire" (`hall.ts` `badgeName`), with the run in its tooltip: the whole label on the chip would have made it about three times as wide in a row that already hides badges at laptop widths. The chip loses its digit ("On Fire · 6" before). Reverse: render `badge.label` in `HallPage.tsx` again.
9. **W2-156** uses the table's words, "The player took back their request to join.", though the notice knows the name. Reverse: `lobby.ts` `REQUEST_TAKEN_BACK`.
10. **"an hour"** in "Closes in an hour", "an hour ago" (W2-019, W2-021); "one hour" in idle closings (W2-031's words). Reverse: `lobbyView.ts` `hoursWords`.
11. **Wait words** (W2-114..W2-116): up to 30 seconds "a few seconds", up to 90 "a minute", then "about N minutes", then "about an hour" / "about N hours". Sizes in whole MB, rounded up (one byte over 150 MB reads "151 MB"). Reverse: `PlayerWords.waitWords`, `PlayerWords.megabytes`.
12. **The card checker down at import** keeps its code (`CARDS_NOT_RESOLVED`) with its own sentence and an empty problem list. Reverse: `cardsRefused` in `DeckImporter.kt`.
13. **A printing Arena does not have** reads "Arena doesn't have this printing of this card." (shown only where the printing matters, and there W2-102's sentence is used). Reverse: `CardResolution.wordsFor`.
14. **/status for a player** shows the Admin page's notice under the title "Server check", with no page header (the page was never inside the app's shell). The administrator's engine line ("Forge ... · Java ...") stays (admin pages exempt). `/api/system/status` still answers any signed-in user (three health words). A server with no database (the Phase 1 foundation server, no sign-in) still sends every version field. Reverse: `routes.tsx` back to `RequireAuth`; the `/version` route in `Application.kt`.
15. **The source sweep's exemptions** (F-0114-E): admin pages, `App.tsx` (admin-only now), development pages and their fixtures, `arena-admin`, logs, exceptions, a worker's failed-start detail and probe reason (log only), code attributes, CSS and SQL. Reverse or narrow: `PAGE_EXEMPT`, `PAGE_CODE_HOLDERS`, `SERVER_EXEMPT`, `SERVER_CODE_HOLDERS`, `NOT_WORDS` in `scripts/check-wording.py`.

### e2e: the old-words greps (the 0113 lesson)

For every sentence changed, the builders and the lead grepped `frontend/e2e`, `frontend/src/**/*.test.*`, `server/src/test`, `forge-worker/src/test` and `scripts/` for the old words and their case variants, negative checks included:

- **Pages builder:** about 70 old fragments (case-insensitive). Fixed: `auth.spec` "Sign out all"; `lobby.spec` "1 seat open" (twice), "React 😂", the reaction `/^😂 1/` (three times), `.pa-room-taken` "1/2"/"2/2" text (seven times, now `data-taken`), the away-width string; `match-helpers.ts` `.pa-room-taken` "2/2"; `match-concede` "The match was abandoned"; `sharing.spec` "revoke"; `belt-records.spec` the Defend regex and "every 7 days"; `foundation.spec` "Forge Runtime". Negative checks that would have passed for nothing: `foundation.spec` `getByText(/...Foundation Build/).toHaveCount(0)` and `routes.test.tsx` `queryByText(/Foundation Build/)` (twice), which now also look for "Rules engine". 19 vitest assertions in 11 files.
- **Server builder:** about 60 fragments. Fixed: `LimitsTest`, `AdminApiTest` ("5242880"), `CardResolverTest` (two), `DeckImportTest` ("plays differently"), `MatchPreflightTest` (made exact); `docs/operations/troubleshooting/DECK_IMPORT.md` and `LOBBY.md` quoted old words. No e2e spec matched a changed server sentence; `auth.spec`'s and `auth.test.ts`'s "does not exist" negative check is about the sign-in error, which did not change.
- **The lead, after the first e2e run** (which found four the builders missed, all patterns with digits rather than words): `auth.spec` the avatar button `/Choose an avatar \(132\)/` (W2-016) and `/Signed out of \d+ session/` (W2-014); `belt-records.spec` the lobby reminder's British date `\w{3} \d{1,2} \w{3}` (W2-155); `decks.spec` "Tokens, 1 picture" (W2-049) and `/^Lands, \d+ cards$/` (W2-047, made to take words); `lobby.spec` `/away \d+ min/` and `/Away \d+ min · in your room/` (W2-023). Then every regex with a digit class in the non-game e2e specs was read one by one (`grep -nE "/[^/]*\\d[^/]*/"`), and a word grep over all e2e specs for the table's Today fragments ("seats open", "min ago", "h ago", "days ago", "Closes in", "copies", "defended", "place", "Held", "wins in a row", "won N", "shared with N", "Tokens,", "Distinct", "Revoke", "Families", "Colours", "Favourite", "W · L", "Last five", "Number #", "Invited:", "Import a Deck", "Offline ·", "N new", "React ", "couldn't be done", "session(s)", "Sign out all", "throttle", "do not match", "letters or digits", "cancelled", "expired", "Foundation Build", "Accounts are created", "did not start", "abandoned", "took too long", "10 minutes", "with nothing", "no longer open", "Type a message", "Put this aside", "host of a room", "invitation at a time", "In a match", "Not everyone is ready", "colour chosen", "Forge does not know", "Forge returned", "Forge Runtime", "On Fire"): every remaining hit read and found to be a comment, a code field, an admin page (0115), a game-screen sentence or an unchanged sentence.
- **Lab scripts and worker tests:** no hit for any changed sentence.

### Files

New: `frontend/e2e/match-wording-pages.spec.ts`, `frontend/src/AdminOnly.tsx`, `frontend/src/wording0114.test.ts`, `frontend/src/wording0114pages.test.tsx`, `protocol/fixtures/pages-deck/` (`Pages Test Deck.txt`, `README.md`), `scripts/page-strings.mjs`, `server/src/main/kotlin/net/barnflix/proxic/PlayerWords.kt`, `server/src/test/kotlin/net/barnflix/proxic/Words0114RoutesTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/Words0114Test.kt`, `server/src/test/kotlin/net/barnflix/proxic/deck/Words0114DeckTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/deck/Words0114ImportTest.kt`.

Modified: `.github/workflows/ci.yml`, `docs/architecture/AUTHORIZATION.md`, `docs/architecture/PLAYER_WORDS.md`, `docs/features/0114-wording-player-pages.md`, `docs/operations/troubleshooting/DECK_IMPORT.md`, `docs/operations/troubleshooting/LOBBY.md`, `forge-worker/src/main/java/net/barnflix/proxic/worker/ForgeRuntime.java`, `forge-worker/src/test/java/net/barnflix/proxic/worker/CardPoolTest.java`, `frontend/e2e/auth.spec.ts`, `frontend/e2e/belt-records.spec.ts`, `frontend/e2e/decks.spec.ts`, `frontend/e2e/foundation.spec.ts`, `frontend/e2e/lobby.spec.ts`, `frontend/e2e/match-concede.spec.ts`, `frontend/e2e/match-helpers.ts`, `frontend/e2e/sharing.spec.ts`, `frontend/src/AccountPage.tsx`, `frontend/src/AdminPage.tsx`, `frontend/src/App.tsx`, `frontend/src/DecksPage.tsx`, `frontend/src/HallPage.tsx`, `frontend/src/JoinPage.tsx`, `frontend/src/LobbyChat.tsx`, `frontend/src/LobbyPage.tsx`, `frontend/src/LoginPage.tsx`, `frontend/src/ReportDialog.tsx`, `frontend/src/ResetPage.tsx`, `frontend/src/askToJoin.test.ts`, `frontend/src/auth.ts`, `frontend/src/avatars.tsx`, `frontend/src/battlefield/GameScreen.tsx`, `frontend/src/battlefield/RevealTray.tsx`, `frontend/src/battlefield/fixes0064.test.tsx`, `frontend/src/battlefield/fixes0075.test.tsx`, `frontend/src/champions.test.tsx`, `frontend/src/deckIcons.test.tsx`, `frontend/src/deckIcons.tsx`, `frontend/src/decks.ts`, `frontend/src/fieldChecks.test.ts`, `frontend/src/fieldChecks.tsx`, `frontend/src/fixes0019.test.ts`, `frontend/src/hall.test.ts`, `frontend/src/hall.ts`, `frontend/src/lobby.test.ts`, `frontend/src/lobby.ts`, `frontend/src/lobbyView.test.ts`, `frontend/src/lobbyView.ts`, `frontend/src/notices.test.ts`, `frontend/src/notices.ts`, `frontend/src/presence.test.ts`, `frontend/src/routes.test.tsx`, `frontend/src/routes.tsx`, `frontend/src/shell/PageNotices.tsx`, `frontend/src/status.ts`, `scripts/check-wording.py`, `scripts/make-ci-deck.mjs`, `server/src/main/kotlin/net/barnflix/proxic/Application.kt`, `server/src/main/kotlin/net/barnflix/proxic/Limits.kt`, `server/src/main/kotlin/net/barnflix/proxic/Protocol.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/AccountEmails.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/Accounts.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/AuthRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/DeviceRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/InviteRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/PasswordHasher.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/SignedInGate.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/ArtStore.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/CardResolver.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/DeckBuilderRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/DeckIconRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/DeckImporter.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/DeckList.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/DeckNames.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/DeckRenameRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/DeckRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/DeckShareRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/DeckSharing.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/OpenFormat.kt`, `server/src/main/kotlin/net/barnflix/proxic/deck/PackageInspector.kt`, `server/src/main/kotlin/net/barnflix/proxic/hall/Highlights.kt`, `server/src/main/kotlin/net/barnflix/proxic/lobby/InvitationDesk.kt`, `server/src/main/kotlin/net/barnflix/proxic/lobby/LobbySocketHandler.kt`, `server/src/main/kotlin/net/barnflix/proxic/match/MatchLaunch.kt`, `server/src/main/kotlin/net/barnflix/proxic/match/MatchLauncher.kt`, `server/src/main/kotlin/net/barnflix/proxic/match/MatchRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/report/ReportRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/room/MatchPreflight.kt`, `server/src/main/kotlin/net/barnflix/proxic/room/MatchSetupRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/room/MatchSetupService.kt`, `server/src/main/kotlin/net/barnflix/proxic/room/RoomRouteSupport.kt`, `server/src/main/kotlin/net/barnflix/proxic/room/RoomRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/room/RoomService.kt`, `server/src/main/kotlin/net/barnflix/proxic/room/Rooms.kt`, `server/src/test/kotlin/net/barnflix/proxic/LimitsTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/admin/AdminApiTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/deck/CardResolverTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/deck/DeckImportTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/hall/HallTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/room/MatchPreflightTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/room/RoomRoutesTest.kt`.

## Amendments

None yet.

### Follow-up 2026-11-21 (decided while owner away, to review)

- **CI run 44898320006** failed three ways, each root-caused (c8d9345b): `check-wording.py --self-test` ran before `npm ci` (its source-sweep cases need TypeScript); `Words0114ImportTest` needs the real Deck Builder export and is now in `ci/expected-skips.txt`; `match-small-fixes` `canAttack` still excluded the old label "summoning sick" (0113 made it "came in this turn"), so it clicked a sick Raven for 120 s.
- **CI run 44901395734:** once a game had finished on CI (0115's concede), Pat held the belt when the Hall test ran; W2-058's rule wraps to two lines in CI's wider system font and the band grew past the trophies (place 186 px, trophy 148). On screens 1700 px and wider the trophies now set the band's height and the Belt picture gives up the room (`app.css`, `.pa-hp-belt` in the min-width 1700px block). Measured: with a wide font the place is 156.5 px, trophy 148.5, nothing clipped; smaller screens unchanged.
- **W2-064 "Won · Lost · Drawn"** ran into "Win %" at 1920 (157 px of title in a 148 px column; the still showed "DRAWNWIN %"). The record column is 13% on big screens (192 px at 1920) and its title may take two lines below that (`.pa-hp-th-rec`). `lobby.spec`'s Hall test now fails any column title that is cut (`.pa-hp-table th`); before the fix it reads 148/157 at 1920.
