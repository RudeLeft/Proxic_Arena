# 0039 — Bug reports and ideas, with the logs to go with them

**Status:** Built 2026-10-30 (owner: "build 0039"); unreleased
**Owner decisions:** 2026-10-30 — from the canvas
(https://claude.ai/artifact/Wmfu4cPwY6yH3Qr73buB8D): the button, the two
forms, the Admin tab and the zip as drawn; a picture of the screen taken
automatically, ticked by default; a count on the Admin tab, no email;
players do not see their own reports' status (not now).

## Why

The owner wants players to report a problem or suggest an idea from any
page, and to get each report as a zip with everything needed to find the
cause, to hand to Claude.

Found (2026-10-30):

- The server already records every game (PHASE_07 §7.56, GameRecord):
  every question, answer and refusal, every board each seat was sent,
  the engine's game log; kept 30 days, downloadable in Admin › Games.
  The engine's stderr is kept per match beside it.
- Nothing records the browser: no clicks, page errors, reconnects or
  what was on the screen (only ErrorBoundary writes to the console).
- The server's own log lines (with match and player in their context)
  go to the container's output, not to the match.

## What the player sees

**A Report button**: a gold bug beside the gear on the game screen;
"Report" beside Sign out in the title bar of every other page. The game
carries on behind the form; the other player is never told.

**Report a problem** (tab 1):

| Field | Kind | Choices |
|---|---|---|
| Where were you? | dropdown, filled from the page | In a game · Lobby and rooms · Deck Depot · Hall of Champions · Account and sign-in · Admin · Somewhere else |
| What part of the game? (in a game) | dropdown | A card did the wrong thing · Playing a card or ability · Attacking or blocking · Targets and choices · Mana and paying costs · The stack and responding · Turn steps and passing · Something looks wrong on screen · The game froze or stopped · I got disconnected · Something else |
| Which cards? | chips, picked from this game or typed | optional |
| What happened? | text | needed |
| What did you expect? | text | optional |
| How much did it get in the way? | one of | Game stopped · Couldn’t do what I meant · Looks wrong · Small thing |
| Has it happened before? | one of | First time · Sometimes · Every time |
| When? | dropdown | Just now · Earlier in this game · In an earlier game (their last five) |
| A picture | ticked by default: the screen as it is now; or drop / paste one | |
| Sent with it | shown; the game record can be unticked | this game's record (admins only), the page's log for the last 15 minutes, the version, browser and screen size |

Filled in automatically and shown: the game, turn, whose turn, the step,
Proxic's version, the browser and the screen size.

**Suggest an idea** (tab 2): what it is about (the game screen ·
playing a game · lobby and rooms · Deck Depot · Hall of Champions ·
account · something new); the idea in a few words (needed); what you
would like; what it would help with; how much it would matter (Nice to
have · I’d use it every game · I’d play more with it); an optional
picture. Ideas send only what is written, the picture, the page and the
version.

**Sent**: "Thanks — report sent", its number, "your game carried on".

## What the owner sees (Admin)

**A Reports tab**, with a red count of new ones: kind (Problem / Idea),
status, the first line, who sent it, where, when, what is attached;
filters Everything · Problems · Ideas · New · Not fixed yet.

**One report**: every answer, who and when, version, browser and screen;
status (New · Seen · Fixed · Won’t fix · Planned); a private note; the
picture; the game at that moment; a log viewer with three tabs (their
screen · the game record · the server); **Download (.zip)**; Delete.

**The zip** (`proxic-report-<n>.zip`): `README.md` (the report in plain
words, written to be handed to Claude, pointing at the moment in the
logs), `report.json`, `screen.png`, `browser-log.jsonl`,
`game-record.jsonl.gz`, `server-log.txt`, `engine-errors.txt`.

## How

- **The page's log**: a ring of the last 15 minutes (bounded in size) on
  every page: clicks (what was clicked), every frame from the match
  socket summarised (question, answer, refusal, board: turn, step,
  stack), reconnects, page changes, errors and unhandled rejections.
- **The picture**: taken from the page itself when Report is pressed
  (a library that draws the page's DOM to an image, added to the
  frontend; nothing leaves the browser until Send).
- **The server's lines**: a bounded in-memory appender keeps recent log
  lines per match and per player (from the log context already set).
- **Saving**: a report row (new table) and a folder under the data root
  holding the picture, the page's log and copies of the game record,
  the server's lines and the engine's stderr at that moment — so a
  report outlives the 30-day record sweep. Kept until deleted.
- **Hidden information**: the game record holds both players' hidden
  cards, so reports, their files and the zip are for administrators
  only, exactly as game records are today (§7.56). The reporter's own
  page log shows only what they saw.
- Size limits on the text, the picture and the upload; a report too
  large is refused with a reason, never half-saved.

## Scope

In: the button, the forms, the page's log, the picture, saving, the
Admin tab, the zip.

Out: players seeing their own reports (owner: not now); email
notification (owner: the tab's count only); anything the game does.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0039-A | The button is beside the gear in a game and beside Sign out on every page | e2e, screenshots |
| F-0039-B | A report from a real game carries the right game, turn and step, the page's log, the picture and the game record | e2e |
| F-0039-C | An idea sends only its words, picture, page and version | unit, e2e |
| F-0039-D | Admin lists reports with the new count; status and note save; Delete asks first | e2e |
| F-0039-E | The zip holds every file, README.md reads right, the game record matches the match's | e2e (unzipped and read) |
| F-0039-F | A non-administrator cannot list, read or download a report | server test, e2e |
| F-0039-G | The page's log stays bounded over a long game | unit |
| F-0039-H | It looks and works right | owner |

## Decisions for the owner

All taken 2026-10-30 (see the top).

## Amendments

**Amendment 1 (2026-10-30, at build).** "When? → In an earlier game" is
an answer only: the form does not list the player's last five games to
pick from. The report still says which page and which game it was sent
from; a game played earlier is found by its time and player in
Admin › Games. A picker can come later if reports show it is needed.
The version in a report is the one the server says it is running.
