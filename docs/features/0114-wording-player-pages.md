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

## Amendments

None yet.
