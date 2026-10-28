# 0026 — Password reset by email

**Status:** Approved 2026-10-28
**Owner decisions:** 2026-10-28 — a one-time link, never a temporary
password; the Admin page's "Change password" is removed; resets are
started by an administrator only (no "Forgot your password?"); an
email address can be added by the administrator or by the player;
the two emails as drafted.

## What the player sees

Pat forgot their password. They tell RudeLeft, who opens the Admin
page, finds Pat's row and clicks **Send password reset**. The page says
"Reset email sent to p•••@gmail.com". Pat gets "Reset your Proxic Arena
password" with their username and a **Choose a new password** button.
It opens a Proxic Arena page that shows the username and asks for a new
password twice. Pat saves it, is signed in, every other browser is
signed out, and "Your Proxic Arena password was changed" arrives. At no
point does RudeLeft see, type or know a password or the link.

Sam's account is older than invitations, so the Admin page shows "No
email" on Sam's row and Send password reset says why it can't send. Sam
adds an address on the Account page (it needs Sam's current password),
or RudeLeft adds it on the Admin page.

## Scope

In:
- An email address on each account. Accounts made from an invitation
  get the invitation's address, now and when joining. Others start
  with none.
- Admin page: the player's email address, with Add/Change; **Send
  password reset**; "Change password" removed.
- Account page: the player's email address, changed with their current
  password. The old address is told it was changed.
- The reset link and page (`/reset#<code>`), and the two emails in the
  invitation's style. "Password was changed" goes out after every
  password change, the Account page's own included.

Out (and why):
- "Forgot your password?" on the sign-in page (owner decision:
  administrator only).
- Emailed temporary passwords (they sit in the inbox and get kept).
- The server's command-line `set-password` stays as the break-glass
  for whoever runs the server, for an administrator with no working
  email. It is not on any page.

## Rules and boundaries

- Supersedes "the administrator resets passwords" (§3.115, and
  AUTHENTICATION.md "no password reset by email").
- The code is a session-strength random token. Only its SHA-256 is
  stored, as for sessions and invitations. It rides after `#`, so no
  server or proxy log sees it.
- One use, one hour. A new reset cancels the earlier link. A link
  dies if the password changes some other way first.
- At most one reset email per account every 5 minutes, and 5 a day.
- The reset page has the join page's origin check and throttle, and
  every bad or used link gets the same answer.
- A new password ends every session and unlinks every Deck Builder
  computer, as a password change on the Account page always has
  (§3.36, spec 0021). The plan shown to the owner said computers would
  stay linked; the code already unlinked them, and that is kept as the
  safer of the two.
- No email account set up: the button says so. The link is never
  shown on the Admin page.
- The Admin log records "reset sent" and "email changed", never a
  password or a link.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0026-A | Invited accounts get their invitation's email address, at migration and on joining | server test |
| F-0026-B | A reset link works once, for one hour; a newer reset or a password change kills it; only a hash is stored | server test |
| F-0026-C | Resets are limited per account; an account with no email, or no email set up, is refused with the reason | server test |
| F-0026-D | Using the link sets the password, ends every session, signs the player in and sends "password was changed" | server test |
| F-0026-E | The Admin page has no way to set a password; the old route is gone | server test + browser |
| F-0026-F | The player changes their email only with their current password; the old address is told | server test |
| F-0026-G | The emails carry the username, never a password; the logo is inside the email | server test |
| F-0026-H | Admin sends a reset, the player follows the link, sets a password, signs in with it | server test (HTTP) + browser check on the local server; CI has no mail server, so e2e covers the pages, not the email |
| F-0026-I | The pages and emails look right | owner |

## Decisions for the owner

All taken 2026-10-28 (see the top).

## Amendments

None.
