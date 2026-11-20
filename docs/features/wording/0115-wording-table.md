# 0115 wording table: admin

Generated 2026-11-20 for spec `docs/features/0115-wording-admin.md` from the three
window-wording lists in the working folder (outside the repo):
`Window wording list 2026-11-19.md` (List 1), `... - second sweep.md`
(List 2) and `... - third pass.md` (List 3). The owner's rules (decisions
2026-11-19b) are applied to the "After" column: "color"; the
type-line dash only; printed game terms and game values (damage, life,
power, a die roll) keep their digits; counts of one to ten in sentences
as words, bigger counts as digits; no code words. Where a list's rewrite broke a
rule, the correction from List 3 §5 or List 2 §3 replaces it (named in
"Why").

An "After" cell in quotes is the exact line. A cell that describes the
change ("build our own from ...", "one clean-up on every prompt") is
the builder's instruction for a family of lines; the builder records the
exact words chosen in the spec's As built. Ids (`W3-NNN`) are for
tests and the As built; they are stable once the spec is approved.

35 lines.

| Id | From | Where (file, symbol) | Today | After | Why |
|---|---|---|---|---|---|
| W3-001 | List 2 §2f | `frontend/src/admin.ts` purgeText (player) | ${who} has no finished games to delete. | ${who} has no finished games to delete. (default who = "This player") | ADMIN. Default who is "They" (AdminRecords PurgeBox), giving "They has no finished games to delete." |
| W3-002 | List 2 §2f | `frontend/src/admin.ts` workerText (default) | ${state.forgeWorker}${games} | Use words: Unreachable / Version mismatch / Data files missing (the DETAIL_LABEL list in App.tsx), with "Problem" as the last resort | ADMIN. Raw status code shown for any unlisted state (e.g. "unreachable · 2 games") |
| W3-003 | List 2 §2f | `frontend/src/admin.ts` outcomeText (default) | {match.status} | Unknown state | ADMIN. Raw enum shown for an unknown match status |
| W3-004 | List 2 §2f | `frontend/src/admin.ts` outcomeText (REASON_WORDS fallback) | Didn't start · ${raw} / Stopped · ${raw} | Didn't start (reason not known); keep the code only in the tooltip | ADMIN. Unmapped reason code shown raw (e.g. "Stopped · FAILED_RUNTIME"); code also in the title tooltip |
| W3-005 | List 2 §2f | `frontend/src/admin.ts` outcomeText (ENDED) | Finished · ${match.ending} | Check server ending strings for codes; otherwise fine | ADMIN. Server text shown verbatim |
| W3-006 | List 2 §2f | `frontend/src/admin.ts` idleText / lastUsedText | ${hours}h / ${minutes}m / ${idle} ago | three hours ago / 20 minutes ago | ADMIN. Abbreviations ("3h ago"); lighter touch: kept (owner 2026-11-20, "Keep short forms") |
| W3-007 | List 2 §2f | `frontend/src/admin.ts` uptimeText | ${days}d ${hh}h / ${hours}h ${mm}m / ${minutes}m | 2 days 5 hours / 3 hours 12 minutes | ADMIN. Abbreviations; lighter touch: kept (owner 2026-11-20, "Keep short forms") |
| W3-008 | List 2 §2f | `frontend/src/AdminPage.tsx` RoomsPanel (idle) | · closes in ${idleText(...)} | · closes in two hours | ADMIN. Abbreviation ("closes in 2h"); lighter touch: kept (owner 2026-11-20, "Keep short forms") |
| W3-009 | List 2 §2f | `frontend/src/AdminPage.tsx` RoomsPanel (force close done) | ${room.name}: ${detail}. Both players were told an administrator closed it. | ${room.name} is closed. Both players were told an administrator closed it. | ADMIN. Server detail pasted mid-sentence; a detail ending in "." gives ".."; default detail is "Done." |
| W3-010 | List 2 §2f | `frontend/src/AdminPage.tsx` AccountRow (reset done) | ${detail} ${name} chooses their own password from the link. | A reset link was sent to Pat. Pat chooses a new password from the link. | ADMIN. Server detail glued in front ("Done. Pat chooses...") |
| W3-011 | List 2 §2f | `frontend/src/AdminPage.tsx` AccountRow (menu, last admin) | Last Administrator: Cannot Remove | The last administrator can't be made a player or switched off | ADMIN. Title Case fragment |
| W3-012 | List 2 §2f | `frontend/src/AdminPage.tsx` AccountRow (aria-label) | Revoke every session for ${name} | Sign ${name} out everywhere | ADMIN. Jargon "revoke" |
| W3-013 | List 2 §2f | `frontend/src/AdminPage.tsx` RecordsPanel (players) | {m.players \|\| "none"} | Nobody | ADMIN. Lower-case "none" as a value |
| W3-014 | List 2 §2f | `frontend/src/AdminPage.tsx` KIND_WORDS / SignInsPanel | Throttled / ${n} throttled | Made to wait / ${n} made to wait (too many tries) | ADMIN. Jargon |
| W3-015 | List 2 §2f | `frontend/src/AdminPage.tsx` RoomsPanel (players) | {seats.join(" vs ")} | Pat and Sam | ADMIN. Abbreviation "vs"; lighter touch: kept (owner 2026-11-20, "Keep short forms") |
| W3-016 | List 2 §2f | `frontend/src/AdminInvites.tsx` untilText | in ${h} h / in ${m} min | in two hours / in 40 minutes | ADMIN. Abbreviations; lighter touch: kept (owner 2026-11-20, "Keep short forms") |
| W3-017 | List 2 §2f | `admin/AdminRoutes.kt` forceClose (DoneResponse detail) | closed; the match ended with no winner  /  closed | "Closed. The game in it ended with no winner."  /  "Closed." | ADMIN: lower-case fragment with semicolon |
| W3-018 | List 2 §2f | `admin/AdminRoutes.kt` answer (DoneResponse detail ?: action.name) | sessionsRevoked=3  /  DISABLE_ACCOUNT (enum name) | Return a sentence, e.g. "Signed out of three devices." or leave detail empty | ADMIN: audit-log text and enum names used as the success detail (frontend composes its own line, but the field carries code words) |
| W3-019 | List 2 §2f | `admin/AdminRoutes.kt` createAccount (DoneResponse) | created | "Account created." | ADMIN: lower-case code word |
| W3-020 | List 2 §2f | `admin/AdminRoutes.kt` status / role changes (INVALID_REQUEST) | Expected ACTIVE or DISABLED.  /  Expected ADMIN or PLAYER.  /  Expected on: true or false. | "Choose Active or Disabled."  /  "Choose Admin or Player."  /  "Choose on or off." | ADMIN: enum names and JSON shape |
| W3-021 | List 2 §2f | `admin/AdminInviteRoutes.kt` invite (INVALID_REQUEST) | Expected an email address and PLAYER or ADMIN. | "Enter an email address and choose Player or Admin." | ADMIN: enum names |
| W3-022 | List 2 §2f | `admin/AdminMatches.kt` endingOf (FAILED_RUNTIME / FAILED_STARTUP) | Stopped: {worker detail or code}  /  Did not start: {code} | Send only the code and let the page map it; add words for every code the server can store (incl. the worker's own start codes); never send the worker detail | ADMIN: raw failure code, or the worker's raw detail (a class name), reaches the Admin page; frontend REASON_WORDS falls back to the raw text for anything not in its list |
| W3-023 | List 2 §2f | `admin/AdminMatches.kt` finishedWords (fallback) | Seat $winner won on turn $turn | Someone won on turn {turn} | ADMIN: "Seat 2" when a name is missing; List 3 §5: a seat number is a code word |
| W3-024 | List 2 §2f | `auth/Mailer.kt` reasonFor (else branch) | The email server refused the message (${e.javaClass.simpleName}). | "The email server refused the message. Check the settings and try again." | ADMIN: Java exception class name shown on the Admin Email tab and in reset refusals |
| W3-025 | List 2 §2f | `auth/PasswordResets.kt` send (sent too recently) | A reset was sent to $username in the last 5 minutes. Wait a few minutes before sending another. | "A reset was sent to {username} in the last five minutes. Wait a few minutes before sending another." | ADMIN: small number as digit |
| W3-026 | List 2 §2f | `auth/PasswordResets.kt` send (daily cap) | $username has been sent ${PER_DAY} resets today. Try again tomorrow. | "{username} has been sent five resets today. Try again tomorrow." | ADMIN: small number as digit (5) |
| W3-027 | List 2 §2f | `auth/MailSettings.kt` problemWith | Enter the email server's address, e.g. smtp.gmail.com.  /  ... e.g. Proxic Arena <you@gmail.com>. | "... for example smtp.gmail.com." | ADMIN: "e.g." abbreviation |
| W3-028 | List 2 §2f | `auth/MailSettings.kt` NO_SECRET | This server has no PROXIC_SESSION_SECRET, so it cannot store a password safely. | "This server isn't set up to keep passwords safely yet, so the email password can't be saved. (Set PROXIC_SESSION_SECRET.)" | ADMIN: environment-variable name |
| W3-029 | List 2 §2f | `admin/AdminRenameRoutes.kt` (NO_DATABASE)  /  AdminResetRoutes (NO_DATABASE, EMAIL_NOT_SET_UP) | Renaming needs the database.  /  Email addresses need the database.  /  Password resets need the database. | "Renaming isn't available on this server."  /  keep code EMAIL_NOT_SET_UP only for the email case | ADMIN: EMAIL_NOT_SET_UP code paired with a database sentence (code and words disagree) |
| W3-030 | List 2 §2f | `admin/AdminPurgeRoutes.kt` purge (GAME_RUNNING) | A game is being played. | "A game is being played. Wait for it to end." | ADMIN: doesn't say what to do (AdminPurge has the better sentence) |
| W3-031 | List 2 §2f | `auth/AdminTool.kt` setStatus | ${username} is now $status$note.  →  "pat is now DISABLED and their sessions were revoked." | "pat is now disabled and signed out everywhere." | ADMIN (command line): enum name; "sessions were revoked" jargon |
| W3-032 | List 2 §2f | `auth/AdminTool.kt` revokeSessions / resetPassword | Revoked $revoked session(s) for $username.  /  Password changed for $username; all sessions revoked. | "Signed {username} out of three devices."  /  "Password changed for {username}, and they are signed out everywhere." | ADMIN (command line): "session(s)", "revoked" |
| W3-033 | List 2 §2f | `auth/AdminTool.kt` database failure | The database could not be reached: ${e.message first line} | "The database could not be reached. Check that it is running." (exception to the log) | ADMIN (command line): raw driver exception text |
| W3-034 | List 2 §2f | `report/ReportReadme.kt` of (Status line) | Status: ${report.status}. | "Status: new." (lower-case words) | OWNER-ONLY: raw enum (NEW, SEEN...) |
| W3-035 | List 3 row 53 | AdminPage.tsx `RoomsPanel` (admin only) | "· closes in now" | "· closes now" | Broken phrase |
