# 0010 — Admin redesign: overview and tabs

**Status:** Approved 2026-10-24 — built
**Owner decisions:** R1 option A of three on the lobby canvas, "overview
+ tabs" (owner, 2026-10-24, after asking for a premium look: "things in
there look really stretched out", and the server version showing a long
string)

## What the administrator sees

The page sits in one centred column (about 1160 px wide; full width on a
phone), headed **Admin** with a health pill on the right:
**● Healthy · v1.2.0 · 512116e** — green when the database and the rules
engine are fine, amber or red with a word when not. The long build id is
gone; the short one is there for when you report a problem, and pointing
at it shows the whole thing.

**Five tiles** across the top, each a number and a line under it:

| Tile | Number | Line |
|---|---|---|
| Online now | players here | "1 away" |
| Accounts | active accounts | "6 disabled" |
| Rooms in use | open rooms | "1 game running" |
| Games today | games started today | "1 didn't start" |
| Sign-ins today | sign-ins | "3 failed" (red when any failed) |

**Tabs** under them, one list at a time, the open one remembered in the
address (`/admin?tab=games`) so a reload or a link lands there:

- **Accounts** — a table: avatar with its online/away/offline badge,
  name (and @username when different, "(you)"), role chip, status, last
  seen, sessions, and one **Manage ▾** button per row holding Set
  password, Sign out everywhere, Make admin / Make player, Disable /
  Enable (the last administrator still cannot be demoted or disabled).
  Disabled accounts fold under **Disabled · 6**. **+ New account** opens
  the same form as today, in a dialog.
- **Rooms** — each room in use: name, who is in it, status, idle time,
  Force close (still asks first).
- **Games** — the recent games: when, who, how it ended in plain words
  ("Finished · RudeLeft won", "Didn't start · couldn't reach the rules
  engine", "Stopped · the server restarted"), and Download record with
  its size. Ten, then Show all.
- **Sign-ins** — grouped by person: "rudeleft · 14 sign-ins · last
  21:42 · 172.19.0.1"; failures in red ("admin · 3 failed · no such
  account"). A name that never got in is labelled Failed and listed
  first; a real account's occasional typo shows as "2 failed" in red in
  its line, not as its label. Clicking a person shows their attempts.
- **Server** — version (with the full build id), database, rules engine,
  uptime, and how long game records are kept.

On a phone: two tiles a row, the tabs scroll sideways, and each table
row becomes a small card.

## Scope

In: the Admin page's layout and wording; the version text.

Out (and why):
- **New admin powers** — the same actions as today, only arranged.
- **Charts and history** — counts for today only; no stored statistics.

## Rules and boundaries

- **Admin only:** unchanged — the server refuses every admin route to
  anybody else; the page says so to a player.
- **Hidden information:** a game record still holds both players' hidden
  cards and is offered only here.
- **No "Forge" rule:** admin text may name the engine, but plain words
  are used anyway ("the rules engine").
- **No layout change outside Admin.**

## How it works (for the build)

- Frontend only, except the version: the page splits "1.2.0 (sha)" into
  the number and a 7-character id. Counts come from what the page
  already reads (accounts, rooms, matches, sign-ins) plus the lobby
  connection's presence for "Online now".
- Failure reasons mapped to words in one table (`admin.ts`), with the
  raw code kept in a tooltip.

## Tests

- Unit: version split; the tile counts; sign-ins grouped by person;
  failure reasons in words; the tab from the address.
- Browser: the existing admin tests (accounts, force close, sign-in
  activity, records) pass through the new tabs; Manage menu actions;
  a reload keeps the tab.
- Screenshots at 1280, 1600 and on a phone before it ships.
