# 0014 — Accounts by invitation

**Status:** Approved 2026-10-25 — built in 1.5.0
**Owner decisions:** I1 invitations are emailed from the start (with the
link always shown to the administrator too, as a backup); I2 a link
works for 48 hours; I3 the username is suggested from the email (the part
before the @) and the person may change it; I4 the rule "no
self-registration" becomes "by invitation only"; I5 the server may use
Jakarta Mail (Angus Mail 2.0.3) to send email (owner, 2026-10-25, from
the demo at https://claude.ai/artifact/MCzkPFDyENnnBf9EQSLiqY)

## What the player sees

- **Admin page:** "+ New account" becomes "+ Invite". You enter an email
  address and choose player or administrator. With an email account set
  up, "Send invitation" emails the link; without one, "Make the link"
  shows it to copy. Either way the link is shown once, with Copy, so a
  link that did not arrive can be sent by hand.
- **Invitations**, a panel under Accounts: who has not answered yet (sent
  when, expires when), with **Send again** (a fresh link; the old one
  dies) and **Cancel**; and who joined, as whom.
- **The email:** "RudeLeft invited you to Proxic Arena", one button, when
  it expires, and "if you weren't expecting this, ignore it".
- **The link** opens "Create your account": who invited you and the
  address; a username (suggested from the email, changeable), a display
  name, a password twice, with live checks. Create account signs them in
  and lands them in the Lobby.
- **A dead or wrong link** always reads "This invitation is no longer
  valid", whatever the reason.

Example: you invite sam@example.com as a player. Sam gets the email,
clicks it, keeps "sam" as the username, sets a password and is in the
Lobby. The same link opened again says it is no longer valid.

## Scope

In: the Admin page's Invite and Invitations; the /join page; the email.

Out (and why): email password reset (§3.115 stays: an administrator
resets passwords); open sign-up (still none); changing an account's email
(no email is kept on the account).

## Rules and boundaries

- **I4 amends AUTHENTICATION.md**: accounts exist because an
  administrator created them *or invited them*. §3.112 (no open
  registration endpoint) still holds: joining needs a live invitation.
- **Codes**: 256 random bits per link; only the SHA-256 is stored
  (§3.21's rule for session tokens). A link works once, for 48 hours, and
  dies when used, cancelled or replaced. Claiming it is one statement, so
  two tabs cannot both use it.
- **Nothing to learn by guessing**: every dead or wrong link gets the same
  answer (410); both public questions are throttled like sign-in.
- **The gate**: a stranger may load /join and POST the two sign-up
  questions; everything else still says "Sign in to continue".
- **The code never reaches a log**: it is after "#" in the link, which a
  browser does not send; the page posts it in the body.
- **The email account's password** lives only in the server's
  environment on Unraid (`PROXIC_SMTP_*`), typed by the owner, never
  logged and never in the repository or in chat.
- **On record**: inviting, sending again and cancelling are Admin
  actions; joining shows in Invitations ("Joined as …") and as a sign-in.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0014-A | One account per link, signed in; the link is then dead; 48 h, cancel and resend each end a link; a fixable refusal keeps it alive; only the hash is stored | server test |
| F-0014-B | Only an administrator invites; a stranger reaches only the two sign-up questions; guessing is throttled | server test |
| F-0014-C | The email settings never print the password; the email escapes names | server test |
| F-0014-D | Invite, open the link as a stranger, create the account, land in the Lobby; the link is dead after | browser |
| F-0014-E | Screenshots approved | owner |

## Amendments

**Amendment 1 (owner, 2026-10-25): the Email account tab.** The email
account is filled in on a new Admin tab, "Email account", so a change of
provider is a form rather than an edit on Unraid: server, port, STARTTLS
or SSL, username, password, From, a "Use Gmail's" shortcut, Save, Remove,
and "Send a test email to" with the result in plain words (a refused
password, a server that cannot be found or reached, a failed secure
connection). The password goes one way: sealed with AES-256-GCM under a
key derived from `PROXIC_SESSION_SECRET` (V023 `mail_settings`), never
returned to a page (the tab shows only "a password is saved"), never
logged, and the Admin action record says only "password changed/kept".
Changing the session secret means typing the email password again. The
settings file's `PROXIC_SMTP_*` stay as a fallback; the tab's settings
win. Tests: MailSettingsTest (sealed, kept, removed, wrong key, tamper,
fallback), InviteApiTest (admin only, never echoed, a failed test says
why), and a browser test of the tab.
