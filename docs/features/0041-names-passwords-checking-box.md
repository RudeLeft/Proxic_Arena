# 0041 — Short names, clear password checks, the checking box

**Status:** Built in 1.24.0 (approved 2026-10-30)
**Owner decisions:** 2026-10-30, from the canvas
https://claude.ai/artifact/MPpmTYK2EE5zT8oxdWitrm: the checking box as
shown; display names at most **12 characters** and **required**, and every
place a name shows fixed so 12 fit; the password checks as shown.

## What the player sees

- **The lobby.** RudeLeft presses Start; while both decks are checked,
  step 3 shows "Checking both decks…" with its spinner in a box exactly
  the size of the "Waiting for you to be ready" box it replaces. Today the
  box shrinks to fit its words, at the left of the step. When the host can
  still cancel, Cancel sits on the line under it.
- **A new player makes an account.** Every box says whether it's right: a
  green check inside it and its rule line turning green ("At least 12
  characters" counts down: "· 5 more"). Under the greyed-out Create
  account button a short list says what is still missing ("a display
  name", "5 more password characters", "the password again"), and goes
  when nothing is. The Display name box starts empty: it is required, at
  most 12 characters.
- **Choosing a new password** (the reset link) gets the same checks. The
  **Account page** gets them too, and a "New password again" box; Change
  password stays off until both are right.
- **A 12-character name shows in full everywhere** — the game's name
  plates, the Hall of Champions podium and lists, the lobby, chat, the
  Deck Depot, Admin. Where a place is too narrow for the name at its
  normal size, the name gets smaller to fit on one line, never "…" and
  never split over two lines mid-word.

## Measured (2026-10-30, 1920×1080, the real app)

Names of 4–40 characters, with and without spaces, through the lobby, a
room, chat, Deck Depot, Admin, the Hall and a real game. Longest name
shown in full today: game name plates 8, Hall podium 9–10 (then two lines,
split mid-word), Hall Records/Latest/Rival 13, the game's "Waiting for"
button 15, lobby Players list 20, Deck Depot "shared by" 20, chat 24, the
room's "Waiting for NAME to be ready" 28; the room title, seats, Admin
accounts, Hall table and Belt holder held at 40. The app accepted 40
characters at sign-up and 64 on the Account page.

## Scope

In:
- `.pa-start-row` lets the checking box fill the step.
- Display names: 1–12 characters after trimming, required, at sign-up
  (invitation), on the Account page and in Admin's create/rename; the
  server refuses anything else in words. The command-line break-glass
  account tool keeps its username fallback.
- A name that does not fit at its normal size shrinks to fit on one line
  (down to 60 %); the game plates and the Hall podium use it, and any
  other place the 12-character check finds too narrow.
- Password checks on Create your account, Choose a new password and the
  Account page; the Account page's "New password again".

Out (and why):
- **Names already longer than 12 stay as they are** until their owner or
  an administrator changes them: renaming people silently is worse than a
  name that is cut short. The places that can't show them shrink them,
  and past the smallest size they still end in "…".
- **Names of all the widest letters** ("MMMMMMMMMMMM", "WWWWWWWWWWWW"):
  at 60 % they still end in "…" on the game's name plates (hovering shows
  the whole name) and run a little past the "Waiting for" button. Owner
  2026-10-30: leave it — real 12-character names ("Penelope Mar",
  "Bartholomewx") fit everywhere, measured.
- Sign in, Current password and the Admin email account's password check
  a password that already exists: no rules to show there.
- The password rule itself (at least 12 characters, not only spaces) is
  unchanged.

## Rules and boundaries

UI-006 (1920×1080 and up). §3.15–3.16 password rules unchanged: the page
shows the server's rule, the server still decides. No hidden information
involved.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0041-A | "Checking both decks…" is the waiting box's width and height | browser + screenshot |
| F-0041-B | The server refuses a display name that is empty or over 12 characters at sign-up, on the Account page and in Admin | server tests |
| F-0041-C | Create account stays off and says what's missing until username, display name, password and password again are all right; each turns green with a check | unit + browser |
| F-0041-D | The Account page needs "New password again" to match; the reset page has the same checks | unit + browser |
| F-0041-E | 12-character names (spaced, solid, and all-W) show in full on one line in every place a name shows | browser measurement + screenshots |

## Decisions for the owner

All taken 2026-10-30 (above).

## Amendments

1. **As built (2026-11-04, a documentation check).** F-0041-E's "all-W
   names in full in every place" was not met to the letter: the owner
   accepted (2026-10-30, above) that names of all the widest letters end
   in "…" on the game's name plates. Real 12-character names fit
   everywhere.

2. **2026-11-04 (owner, from a documentation check).** Admin rename was
   never built: the admin routes create, disable or enable, change a
   role, set an email, send a reset, sign out and handle invitations --
   none renames -- and only the player renames themselves (Account
   page). "Admin's create/rename" and F-0041-B's "in Admin" hold for
   create only. The owner decided to build it; it goes through research,
   a canvas and approval like any feature, and this note is updated when
   it ships.

3. **2026-11-04 (owner, canvas
   https://claude.ai/artifact/4TM43ktBoJdqvsVZEzEWNV, choices A and A) --
   admin rename BUILT.** Admin page › Accounts › Manage › "Change display
   name…" opens the same small form as an email address: the current
   name, the sign-up rule checked as you type (required, up to 12
   characters), Save and Cancel, and "Shown to everyone in the lobby,
   games and the Hall. Pat still signs in as @pat." Only the display name
   changes, never the username. `PUT /api/admin/accounts/{userId}/display-name`
   (admin + CSRF; 422 `INVALID_DISPLAY_NAME`, 404 `ACCOUNT_NOT_FOUND`),
   recorded as admin action `DISPLAY_NAME_CHANGED` and auth event
   `DISPLAY_NAME_CHANGED by=<admin>` (a player's own rename now says
   `by=self`). Everybody's Players list changes at once. The player is
   told once -- "An administrator changed your display name to Patty." --
   as a top-right notice: at once when online, otherwise on their next
   connect (V038 `app_user.renamed_notice`, lobby message `RENAMED`); an
   administrator renaming themselves is not told. F-0041-B now holds for
   Admin's rename too (`AdminRenameTest`, `admin.spec.ts`).
