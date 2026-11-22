# 0115 — Plain-English wording, step 3: admin pages and owner-only text, with a lighter touch

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase.
**Built:** 2026-11-21 (commit 3e804248). **Released:** in 1.75.0, 2026-11-21.
**Owner decisions** (owner feedback batch 2026-11-19b, `Owner feedback 2026-11-19b decisions.md`):

- Item 3 follow-up, scope step **"3. Admin pages, with a lighter touch."**
- The rules of steps 1 and 2 (specs 0113, 0114) apply, lightened as below. The no-"Forge" rule does not bind admin pages or logs (owner rule: players don't know what Forge is; admin and logs exempt).

- **Short forms** (asked 2026-11-20, by prompt): **"Keep short forms"** ("3h ago", "2d 5h", "Pat vs Sam").
- **Approved 2026-11-20** (owner, by prompt: "Approve all."). Build 0108 → 0115 in that order, one at a time, then release them together as 1.75.0.

## The fix list

**`docs/features/wording/0115-wording-table.md`**: 35 lines, ids `W3-001` to `W3-035`, generated 2026-11-20 from `Window wording list 2026-11-19 - second sweep.md` (List 2) section 2f and `... - third pass.md` (List 3) row 53, with the owner's rules applied (List 3 §5: "Seat 2 won" becomes "Someone won on turn N", `W3-023`). One List 2 row was dropped because today's line is right ("Their decks already on Arena stay.": Arena is the product's name; List 2's rewrite added "the").

**The lighter touch** (this spec's reading of the owner's words, from List 2 §4's recommendation): fixed are raw enum and code words (`DISABLED`, `FAILED_RUNTIME`, `sessionsRevoked=3`, `PROXIC_SESSION_SECRET` as the whole message), Java class names, "(s)", broken or wrong sentences ("They has no finished games", "closes in now", a server `detail` glued into a sentence), and stale wording. **Kept** (owner 2026-11-20, "Keep short forms"): compact time and count abbreviations in admin tables and chips ("3h ago", "2d 5h", "in 2 h", "Pat vs Sam"): rows `W3-006`, `W3-007`, `W3-008`, `W3-015`, `W3-016` are marked "kept" and are not changed.

A few lines:

| Where | Today | After |
|---|---|---|
| Admin, purge (`W3-001`) | They has no finished games to delete. | This player has no finished games to delete. |
| Admin, accounts (`W3-011`) | Last Administrator: Cannot Remove | The last administrator can't be made a player or switched off |
| Admin, game records (`W3-023`) | Seat 2 won on turn 9 | Someone won on turn 9 |
| Admin, email tab (`W3-024`) | The email server refused the message (SMTPSendFailedException). | The email server refused the message. Check the settings and try again. |
| Command line (`W3-031`) | pat is now DISABLED and their sessions were revoked. | pat is now disabled and signed out everywhere. |
| Admin, rooms (`W3-035`) | · closes in now | · closes now |

## Why (researched)

`Window wording list 2026-11-19 - second sweep.md` §2f and §4 (SOURCE) and the third pass's admin table (SOURCE: 13 admin sections, "clean beyond List 2" except row 53). Re-read at main 1f813795. Only the owner sees these; they were listed so the scope decision could be made with them in view.

- **Where** (SOURCE): `frontend/src/admin.ts` (`purgeText`, `workerText`, `outcomeText`, `idleText`, `lastUsedText`, `uptimeText`), `frontend/src/AdminPage.tsx` (`RoomsPanel`, `AccountRow`, `RecordsPanel`, `KIND_WORDS`, `SignInsPanel`), `frontend/src/AdminInvites.tsx` (`untilText`), and under `server/src/main/kotlin/net/barnflix/proxic/`: `admin/AdminRoutes.kt`, `admin/AdminInviteRoutes.kt`, `admin/AdminMatches.kt` (`endingOf`, `finishedWords`), `auth/Mailer.kt` (`reasonFor`), `auth/PasswordResets.kt`, `auth/MailSettings.kt` (`problemWith`), `admin/AdminRenameRoutes.kt`, `admin/AdminPurgeRoutes.kt`, `auth/AdminTool.kt` (the command-line tool), `report/ReportReadme.kt`.
- **One that is more than words** (SOURCE, `W3-022`): `AdminMatches.endingOf` can send the worker's raw failure detail (a class name) to the admin page, and `admin.ts`'s `REASON_WORDS` falls back to raw text for any code not in its list. The fix sends the code only and gives every code the server can store its words; the detail stays in the log.

## What the owner sees

The admin pages read as plain as the player pages, minus the space-saving short forms in tables: no enum names, no exception class names, no "(s)", no "They has". Example: force-closing a room shows "Pat's room is closed. Both players were told an administrator closed it." instead of "Pat's room: closed; the match ended with no winner.."

## Changes

- Every `W3` row not marked "kept", in the files above. Codes and API shapes unchanged (the admin page reads codes); only words change. `W3-018` (`AdminRoutes.answer`'s `detail`): the page composes its own line today, so the server's `detail` becomes a sentence or empty, as the row says.
- `W3-022`: `AdminMatches.endingOf` sends the stored code; `admin.ts` `REASON_WORDS` gains words for every code the server stores (the worker's start codes included), with "Problem (code)" in the tooltip as the last resort.

## Rules and boundaries

- **PROTO-006:** no admin page behaviour hangs on the changed words; the e2e admin specs are grepped for old words used as locators.
- **AUTHENTICATION / AUTHORIZATION:** words only; no access changes.
- **Logs:** a message moved out of a sentence (an exception class, a driver error) goes to the server log, never lost.

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0115-A | Every changed `W3` row has an exact-string test (vitest for `admin.ts` / `AdminPage.tsx` / `AdminInvites.tsx`; server unit for the Kotlin rows; the `AdminTool` command-line output) | vitest; server unit tests |
| F-0115-B | `W3-022`: a stored `FAILED_RUNTIME` with a worker detail reaches the admin page as words, the detail absent from the reply and present in the log | server route test; vitest |
| F-0115-C | Real-click flow (TEST-012), below | the admin e2e spec (extended) |

**TEST-004 (bites):** `purgeText`'s "They" default restored; the raw detail sent again (B fails); one `AdminTool` line reverted. About four page and three server mutations.

**Real-click flow (TEST-012).** On the local stack, signed in as the admin: **really click** Force close on a room and read the new sentence; really open the game records with a finished game and read "won on turn"; really open the email tab with a bad server set and read the refusal without a class name.

## Out of scope

- Player pages and the game screen (0113, 0114).
- Admin layout or new admin features.

## Open questions

None. Short forms were answered 2026-11-20: kept (Owner decisions).

## Build order notes

Last of the batch, after 0114. One commit.

## As built (2026-11-21)

Built on main at bc685f23 (after specs 0113 and 0114), not committed. Labels: SOURCE (read in the code), RUN (run here, this build). One builder, no helpers: the page rows reuse `admin.ts`'s own functions, the server rows `PlayerWords` (`number`, `count`); the source sweep (`scripts/check-wording.py --source`) still leaves the admin pages, `admin/` and `AdminTool.kt` out, as 0114 set it.

### What changed, in one line each

- **The page composes its own sentences** after an action (W3-009, W3-010): the server's `detail` is never pasted in. Force close: `admin.ts` `forceClosedText`; the password reset: `AdminPage.tsx` `AccountRow`.
- **The server's `detail` is a sentence** (W3-017..W3-021): `AdminRoutes.answer` now takes the reply's words (`said`) apart from the audit log's text (`detail`, still "sessions=3" in `admin_action`), so the enum name (`DISABLE_ACCOUNT`) and the audit text never reach the reply. Codes unchanged.
- **A stopped game sends its code** (W3-022): `AdminMatches.endingOf` no longer reads `failure_detail`; the reply is "Stopped: WORKER_STOPPED" and the page words it (`admin.ts` `REASON_WORDS`, now every code the server can store, the worker's start codes included). The worker's detail stays where it was written when the game stopped: the server log (`MatchEndings.finish`, "match ...: FAILED_RUNTIME on turn N -- detail") and the `failure_detail` column; it is never sent.
- **`arena-admin`** (W3-031..W3-033) says words, not the enum or "session(s)", and its database failure is one plain line, the driver's text going to the log.

### The ledger: each row, its words and what proves it

"Proved by": page tests in `frontend/src/` (`w` = `wording0115.test.ts`, `p` = `wording0115pages.test.tsx`, `admin.test.ts`); server tests in `server/src/test/kotlin/net/barnflix/proxic/` (`R` = `admin/Words0115RoutesTest`, `U` = `Words0115Test`, `T` = `auth/AdminToolTest`, `auth/AdminToolDatabaseDownTest`, `auth/PasswordResetTest`, `auth/MailSettingsTest`, `admin/AdminMatchesTest`); "e2e" = `frontend/e2e/admin.spec.ts` (F-0115-C); "code" = checked in the source only.

| Id | Status | The words (exact, or chosen for an instruction row) | Proved by |
|---|---|---|---|
| W3-001 | done | "This player has no finished games to delete." (default `who` "This player" in `purgeText` and in `AdminRecords.tsx` `PurgeBox`); a named player: "Pat has no finished games to delete." | w "W3-001" |
| W3-002 | done | "Unreachable" / "Version mismatch" / "Data files missing" (with " · 2 games" when running), "Problem" as the last resort; also in the health pill ("Rules engine: Unreachable") | w "W3-002" |
| W3-003 | done | "Unknown state" (the status in the tooltip) | w "W3-003" |
| W3-004 | done | "Didn't start (reason not known)" / "Stopped (reason not known)"; tooltip "Problem (CODE)" | w "W3-004"; `admin.test.ts` |
| W3-005 | done (checked: no codes) | "Finished · Pat won on turn 9 · RudeLeft conceded" (server `finishedWords`; the only other text is a card's name from Forge's alternate-win reason, admin exempt) | w "W3-005"; `AdminMatchesTest`; e2e |
| W3-006 | kept | "3h ago" (owner, "Keep short forms") | — |
| W3-007 | kept | "2d 05h" | — |
| W3-008 | kept | "· closes in 2h" | w "W3-035" (the short form asserted unchanged) |
| W3-009 | done (one sentence added, Decided 1) | "Pat's room is closed. Both players were told an administrator closed it."; a room in a game: "Pat's room is closed. The game in it ended with no winner. Both players were told an administrator closed it." | w "W3-009 and W3-017"; p "W3-009, W3-035"; e2e (force close, both tests) |
| W3-010 | done | "A reset link was sent to Pat. Pat chooses a new password from the link." | p "W3-010" |
| W3-011 | done | menu item (disabled) "The last administrator can't be made a player or switched off"; its accessible name is the same words (the old aria-label "Cannot remove the last administrator" removed) | p "W3-011, W3-012"; e2e "the last administrator ..." |
| W3-012 | done | aria-label "Sign Pat out everywhere" | p "W3-011, W3-012" |
| W3-013 | done | "Nobody" | p "W3-013, W3-022" |
| W3-014 | done | chip "Made to wait"; detail "2 made to wait (too many tries)" | p "W3-014" |
| W3-015 | kept | "Pat vs Sam" | — |
| W3-016 | kept | "in 2 h" / "in 40 min" | — |
| W3-017 | done | "Closed." / "Closed. The game in it ended with no winner." (the page shows its own sentence, W3-009) | R "W3-017 to W3-021 and W3-030 ..." |
| W3-018 | done | "Pat is now disabled." / "Pat is now active." / "Pat is now an administrator." / "Pat is now a player." / "Signed Pat out of three devices." / "Pat was not signed in anywhere." (Decided 2) | R; U "W3-018 and W3-032"; `AdminApiTest` "sign out everywhere ..." |
| W3-019 | done | "Account created." | code (no Admin page calls `POST /api/admin/accounts` since spec 0014; the route stays) |
| W3-020 | done | "Choose Active or Disabled." / "Choose Admin or Player." / "Choose on or off." | R |
| W3-021 | done | "Enter an email address and choose Player or Admin." | R |
| W3-022 | done | reply "Stopped: WORKER_STOPPED" (code only); page "Stopped · the rules engine stopped", tooltip "WORKER_STOPPED"; words for all 19 codes the server can store (Decided 4) | **F-0115-B**: R "F-0115-B a stopped game's worker detail stays out of the reply and is in the log" (real `MatchEndings.finish` with a detail, the log captured, then `GET /api/admin/matches`); w "F-0115-B W3-022 every code ..."; p "W3-013, W3-022"; `AdminMatchesTest` |
| W3-023 | done | "Someone won on turn 9"; a conceding player with no name: "Someone conceded" | `AdminMatchesTest` "W3-023 ..." |
| W3-024 | done | "The email server refused the message. Check the settings and try again." (the class name was already in the log line, `SmtpMailer.send`) | U "W3-024"; e2e (the email tab's refusal holds no class name) |
| W3-025 | done | "A reset was sent to Pat in the last five minutes. Wait a few minutes before sending another." | `PasswordResetTest` F-0026-C |
| W3-026 | done | "Pat has been sent five resets today. Try again tomorrow." | `PasswordResetTest` F-0026-C |
| W3-027 | done | "Enter the email server's address, for example smtp.gmail.com." / "Enter who the email comes from, for example Proxic Arena <you@gmail.com>." / ""From" must be an email address, for example Proxic Arena <you@gmail.com>." | `MailSettingsTest`; still `email-blank-host.png` |
| W3-028 | done | "This server isn't set up to keep passwords safely yet, so the email password can't be saved. (Set PROXIC_SESSION_SECRET.)" | `MailSettingsTest` |
| W3-029 | done (Decided 3) | `NO_DATABASE` "Renaming isn't available on this server." / "Password resets aren't available on this server." (was `EMAIL_NOT_SET_UP`) / "Email addresses aren't available on this server."; `EMAIL_NOT_SET_UP` now only "No email account is set up. Add one on the Email tab." | code (unreachable: the Admin routes exist only on a server with a database, which always has both desks; see mismatches) |
| W3-030 | done | "A game is being played. Wait for it to end." (one constant, `AdminPurge.GAME_RUNNING`, for the preview's refusal and both route refusals; the preview's was "...: wait for it to end.") | R (a real fresh-start purge with a game running) |
| W3-031 | done | "pat is now disabled and signed out everywhere." / "pat is now active." | T "disabling a player is never blocked" |
| W3-032 | done | "Signed pat out of three devices." / "Password changed for pat, and they are signed out everywhere." | T (two tests); U |
| W3-033 | done | "The database could not be reached. Check that it is running." (the driver's line logged: "arena-admin: database unreachable: ...") | `AdminToolDatabaseDownTest` |
| W3-034 | done | "Status: new." ("seen", "fixed", "planned", "won't fix") | U "W3-034" |
| W3-035 | done | "· closes now" (`admin.ts` `closesText`) | w "W3-035"; p "W3-009, W3-035" |

### Spec mismatches (built to what the code allows)

- **W3-029 cannot be seen:** a server without a database has no accounts and no Admin page, and a server with one always has the rename and reset desks (`AdminWiring`), so the three `NO_DATABASE` refusals are unreachable today. The words and codes are fixed in the source (code); no test can reach them without building a fake server, which was not done.
- **W3-019:** `POST /api/admin/accounts` has had no caller on the page since spec 0014 (accounts are by invitation); its word changed all the same.
- **The real-click email check (F-0115-C):** an SMTP server that refuses a message (W3-024's branch) cannot be made on the local stack; the click reaches "Couldn't reach the email server" (127.0.0.1:1) and the test asserts no class name in it. W3-024's own branch is proved by `Words0115Test`.
- **W3-009** gained a middle sentence for a room in a game (Decided 1): without it the line lost the fact the server's old detail carried.

### Found here, outside the table

- **Not fixed, for the owner:** "none" as a value in two more admin cells: the Invitations tab's expiry for a used or cancelled invitation (`AdminInvites.tsx`) and the Reports tab's empty cell (`AdminReports.tsx`); "Nobody" does not fit either. The force-close confirm still says "The match ends with no winner." ("match", not "game"; lighter touch). Left as they were.

### Decided while owner away, to review (2026-11-21)

Each with what was chosen, why, and how to reverse it.

1. **W3-009, a room in a game:** the page's sentence gains "The game in it ended with no winner." between the table's two sentences, when the room was in a game (the server's old detail said so, and the mid-game e2e test checks it). Reverse: `forceClosedText` in `admin.ts`, drop the `inGame` part.
2. **W3-018 / W3-032, "devices":** the table's own example words ("Signed out of three devices.", "Signed {username} out of three devices."), with the name on the Admin reply too, for one sentence on both. A session is a signed-in browser, so two browsers on one computer count as two "devices"; the player's own Account page says "sessions" (W2-014). Zero reads "Pat was not signed in anywhere." Reverse: `signedOutWords` in `auth/AdminTool.kt`.
3. **W3-029's codes:** the no-database password-reset refusal's code is now `NO_DATABASE` (was `EMAIL_NOT_SET_UP`), as the row asks; all three no-database refusals say "... isn't available on this server." / "... aren't available ...". The only code changed by this spec; no page or test read it. Reverse: `AdminResetRoutes.kt`.
4. **W3-022's words for the worker's codes** (`DECK_UNRESOLVED` "a deck's cards could not be found", `BUILD_FAILED` "a deck could not be built", `RESOLVE_FAILED` "the cards could not be checked", `CARD_POOL_FAILED` "the rules engine's cards could not be loaded", `LAB_DEAL_REFUSED` "the test deal was refused", `MALFORMED_MESSAGE` and `UNKNOWN_TYPE` "the rules engine couldn't read the server's message", `NO_GAME` "the rules engine had no game running", `SEARCH_REFUSED` "the rules engine refused a search", `GAME_RESULT_FAILED` "the game's result could not be read"). The owner loses the worker's detail on the page (owner 2026-10-22 had wanted to see why a game stopped, e.g. the Eldrazi Monument trigger): it is in the server log and the `failure_detail` column. Reverse: `REASON_WORDS` in `admin.ts`; to show the detail again, `AdminMatches.endingOf` (against the row).
5. **W3-011's accessible name** is the visible words (the separate aria-label dropped), so a screen reader and the e2e test read what is shown. Reverse: `AccountRow` in `AdminPage.tsx`.
6. **W3-023's concession half:** "Someone conceded" when the conceding seat has no name, as for the winner. Reverse: `finishedWords`.
7. **W3-030** also makes the purge preview's refusal the same two sentences (was "A game is being played: wait for it to end."). Reverse: `AdminPurge.GAME_RUNNING`.
8. **W3-034** "won't fix" for `WONT_FIX`. Reverse: `ReportReadme.statusWords`.

### Greps done (the 0113 and 0114 lesson; PROTO-006)

For every changed sentence, `frontend/e2e`, `frontend/src/**/*.test.*`, `server/src/test`, `forge-worker/src/test`, `scripts/` and the live docs were grepped for the old words and fragments, case-insensitive, digit patterns and negative checks included ("They has", "has no finished", "Throttled", "throttled", "Last Administrator", "Cannot remove", "Revoke", "revoked", "session(s)", "sessions=", "sessionsRevoked", "\"created\"", "closed;", ": closed", "Done.", "chooses their own", "Reset email sent", "closes in", "none", "Seat [0-9$]", "Seat \\d", "won on turn", "Stopped ·", "Stopped: ", "Did not start", "no reason recorded", "Didn't start", "refused the message", "Exception", "Expected ", "need(s) the database", "e.g.", "PROXIC_SESSION_SECRET", "in the last", "resets today", "being played", "wait for it to end", "is now DISABLED", "all sessions revoked", "could not be reached", "Status: ", "Unknown state", "unreachable", "Not configured"). Fixed:

- `frontend/e2e/admin.spec.ts`: the last-admin locator `getByRole("menuitem", { name: "Cannot remove the last administrator" })` (a locator on the old words, PROTO-006); the mid-game force close's `filter({ hasText: "the match ended with no winner" })` (old server detail); the force close's `hasText: "an administrator closed it"` (now the exact sentence, with a negative check for "Done.").
- `frontend/src/admin.test.ts`: the raw-fallback assertion "Stopped · something new".
- Server: `AdminApiTest` ("sessions=1", which would have kept passing on the audit text), `AdminMatchesTest` (the worker's detail in the reply), `AdminToolTest` ("sessions revoked"; `contains("3")`, which "three" would fail and any digit would pass), `AdminToolDatabaseDownTest` (the driver's line), `MailSettingsTest` (`contains("PROXIC_SESSION_SECRET")`, which the new words still pass: made exact).
- Docs: `docs/operations/troubleshooting/AUTHENTICATION.md` quoted the old `arena-admin` database line; `docs/architecture/PLAYER_WORDS.md` gains the admin section.
- Every other hit read and found to be a comment, a code field, a player sentence or the unchanged words: `belt-records.spec` "Done. Deleted 37 games" (a date purge, unchanged); `foundation.spec` "Not configured" (the /status page); the `match-*` specs' "won on turn" (player banners); `PasswordResetTest`'s fake mailer's "The email server refused the message." (a test double). No worker test or Lab script matched.

### Tests and runs

- **F-0115-A (RUN).** Page: `frontend/src/wording0115.test.ts` (9 tests) and `frontend/src/wording0115pages.test.tsx` (5 tests, the Admin page rendered from the Admin API's answers: Manage menu, reset, rooms and Force close, games, sign-ins); `admin.test.ts` updated. Server: `admin/Words0115RoutesTest` (2 tests, a real server and database), `Words0115Test` (3), and exact words added to `AdminApiTest`, `AdminMatchesTest`, `AdminToolTest`, `AdminToolDatabaseDownTest`, `MailSettingsTest`, `PasswordResetTest`.
- **F-0115-B (RUN).** `Words0115RoutesTest` "F-0115-B ...": a seeded running match ended through the real `MatchEndings.finish` with the worker detail "UnsupportedOperationException: choosePermanentsToSacrifice"; the captured log has the line with the match id and the detail; `GET /api/admin/matches` answers `"ending":"Stopped: WORKER_STOPPED"` and holds neither the class name nor the method. Page half: `wording0115.test.ts` "F-0115-B W3-022 every code the server can store has words" (19 codes, each worded, none shown raw).
- **F-0115-C, the real-click flow (TEST-012; RUN).** `frontend/e2e/admin.spec.ts` on the local stack rebuilt from this tree, signed in as the administrator: (1) "force close asks first ...": really clicks Force close, Keep, Force close, Close it, and reads "Admin Closes This is closed. Both players were told an administrator closed it." (no "Done."); the player is told. (2) "force closing a room mid-game ...": a real game, Force close, and "... is closed. The game in it ended with no winner. Both players were told an administrator closed it." (3) New: "spec 0115: a finished game reads who won on which turn on the Games tab": a real game, the host really concedes, the Games tab really opened; the game's row (found by its record's address) reads "Finished · Pat won on turn 1 · RudeLeft conceded" and holds no "Seat N" or code word. (4) "the Email account tab ...": a bad server (127.0.0.1, port 1) saved, Send test really clicked; the refusal "Couldn't reach the email server. Check the address, the port and the security choice." holds no class name (see mismatches for W3-024's own branch).
- **Browser specs (RUN, headless bundled Chromium, `--workers=1`, one run at a time).** `admin.spec.ts`: first run 9 passed, 2 failed, both on this build's own new assertions (`getByRole("status")` also matched the page's "Connected" and notice cards: a strict-mode locator error, the words on screen were right); locator narrowed to the admin message, then **11 of 11 passed**. `belt-records.spec.ts` (the purge box, `AdminRecords.tsx` touched): **3 of 3 passed**. No other spec matched a changed sentence (greps below).
- **Mutations (TEST-004; RUN): 7 of 7 caught**, each after an unmutated control run passed. Page 4/4 (`wording0115*.test`): `purgeText`'s "They" default restored (W3-001 fails); an unmapped reason shown raw again (W3-004 fails); "closes in now" restored (W3-035 and the page test fail); "Throttled" restored (W3-014 fails). Server 3/3: the worker's raw detail sent again (`COALESCE(failure_detail, failure_code)` in `AdminMatches.list`; F-0115-B fails); one `arena-admin` line reverted ("Revoked $revoked session(s) ..."; `AdminToolTest` fails); the mail class name restored in `reasonFor` (`Words0115Test` fails). No Python was mutated.
- **Gates (RUN), on the final tree:** frontend `npx tsc -b`, `npx eslint . --max-warnings=0`, `npx prettier --check src e2e tools`, `npx vitest run` (126 files, 1,821 tests); server `./gradlew -q :server:ktlintCheck :server:detekt :server:test` (763 tests, 0 failed, 0 skipped, the local stack running); `python -I scripts/check-doc-refs.py`; `python -I scripts/check-wording.py --self-test` and `--source` (1,580 player strings, 0 hits). Worker not touched. All green.
- **Stills (RUN, 1920x1080, each read here),** in the build's scratch folder `b0115/stills/`: `accounts-last-admin-menu.png` (the Manage menu: "Sign out everywhere", then the disabled "The last administrator can't be made a player or switched off", which wraps to three lines inside the menu, nothing cut: measured scrollWidth 216 = clientWidth 216); `sign-ins.png` ("10 failed · 2 made to wait (too many tries)" on one line in the Details column; the chip shows "Failed" for those names, as before, since a name with failures is labelled by them); `rooms.png` ("now · closes in 29m", the short form kept); `rooms-force-closed.png` ("Stills Room is closed. Both players were told an administrator closed it." in the notice, one line); `game-records.png` ("Finished · Pat won on turn 1 · RudeLeft conceded", one line in the Result column); `purge-tab.png` ("Pat has no finished games to delete."); `email-blank-host.png` ("Enter the email server's address, for example smtp.gmail.com."); `email-refused.png` (the refusal in two lines under Send test, no class name). Not seen on a still: "closes now" (a room has to reach its closing time) and the in-game force-close sentence (the e2e test reads it); both are in `wording0115pages.test.tsx`.

### Files

New: `frontend/src/wording0115.test.ts`, `frontend/src/wording0115pages.test.tsx`, `server/src/test/kotlin/net/barnflix/proxic/Words0115Test.kt`, `server/src/test/kotlin/net/barnflix/proxic/admin/Words0115RoutesTest.kt`.

Modified: `docs/architecture/PLAYER_WORDS.md`, `docs/features/0115-wording-admin.md`, `docs/operations/troubleshooting/AUTHENTICATION.md`, `frontend/e2e/admin.spec.ts`, `frontend/src/AdminPage.tsx`, `frontend/src/AdminRecords.tsx`, `frontend/src/admin.test.ts`, `frontend/src/admin.ts`, `server/src/main/kotlin/net/barnflix/proxic/admin/AdminInviteRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/admin/AdminMatches.kt`, `server/src/main/kotlin/net/barnflix/proxic/admin/AdminPurge.kt`, `server/src/main/kotlin/net/barnflix/proxic/admin/AdminPurgeRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/admin/AdminRenameRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/admin/AdminResetRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/admin/AdminRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/admin/AdminUpdateRoutes.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/AdminTool.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/MailSettings.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/Mailer.kt`, `server/src/main/kotlin/net/barnflix/proxic/auth/PasswordResets.kt`, `server/src/main/kotlin/net/barnflix/proxic/report/ReportReadme.kt`, `server/src/test/kotlin/net/barnflix/proxic/admin/AdminApiTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/admin/AdminMatchesTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/auth/AdminToolDatabaseDownTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/auth/AdminToolTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/auth/MailSettingsTest.kt`, `server/src/test/kotlin/net/barnflix/proxic/auth/PasswordResetTest.kt`.

## Amendments

None yet.
