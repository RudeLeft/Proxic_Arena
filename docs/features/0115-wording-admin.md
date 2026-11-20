# 0115 — Plain-English wording, step 3: admin pages and owner-only text, with a lighter touch

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase.
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

## Amendments

None yet.
