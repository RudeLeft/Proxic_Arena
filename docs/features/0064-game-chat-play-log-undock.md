# 0064 — Game chat: a play log tab, and undocking

**Status:** Approved 2026-11-07 (owner, on the canvas "chat-1107", sent as a file)
**Owner decisions:** tabs; floating window plus its own browser window

## Why

Players asked to undock the game chat and to see everything that was
played. The owner: the log is not in the chat; it is its own section of
the chat window. The lobby chat is unchanged.

## Built

- The game chat window has two tabs, "Chat" and "Play log", each with an
  unread count.
- The play log: what happened, in plain English, grouped by turn
  ("Turn 5 · Alice"; "Alice cast Lightning Bolt targeting Bob's Grizzly
  Bears"; "Grizzly Bears died"; "Bob attacked with ..."; "Alice gained 3
  life"), card names you can point at to see the card; filters
  (Everything / Spells and combat); it scrolls with the game, with "Jump
  to latest" when you have scrolled up. Written for each player from only
  what that player is allowed to see (never the game's own record, which
  can name hidden cards); a line never appears before the table shows the
  event; it survives a page refresh for the game's length.
- Undock: the window floats on the battlefield; drag and resize it; it
  remembers where you put it and slides clear of your hand and the action
  button. Pop-out: a button opens it in its own browser window (for a
  second screen); the browser asks once to allow pop-ups; refreshing the
  game closes it.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0064-A | Chat and Play log tabs with unread counts | page test; screenshot |
| F-0064-B | The log names nothing the player may not see; never ahead of the table | Lab hidden-info check; server/worker test |
| F-0064-C | Floating window: drag, resize, remembered, never over the hand or action button | e2e; screenshot |
| F-0064-D | Pop-out window shows chat and log and stays in step | e2e |

## Amendments

### Amendment 1 -- As built (2026-11-08, not committed)

**Where the log is written: the worker, per seat (`PlayLog`).** It
listens to Forge's events (turn began, mulligan, land played, spell or
ability cast with its targets, attackers and blockers declared, damage,
life gained and lost, poison, scry, surveil, sacrificed, every zone
change) and writes one line per thing that happened FOR EACH SEAT. A card
is named for a seat only if Forge says that seat may identify it at that
moment -- both questions, `canBeShownTo` and `canFaceDownBeShownTo`
(HID-002) -- or if it was public in the zone it just left (a creature
bounced to a hand, a card milled). Otherwise the words say "a card", "a
face-down spell", "a face-down creature". A card Forge reveals to one
seat is named in that seat's line alone. Never from Forge's game log
(`GAME_LOG` still goes to the admin record only). Runs are one line
("Bob drew 7 cards"; "Alice created 12 Goblin tokens"; a Pyroclasm's
damage); a round is capped at 300 lines ("And N more things happened").
A damage line carries the life total after it ("Bob 17"); a line naming
more than the other seat's is marked private (the gold ring).

**Never ahead of the table (HID-005).** Lines wait in the worker and go
out IN the next snapshot round (`playLog`, each line with that round's
revision). The page shows a line only once the board drawn on the table
is at least that revision -- so while a spell of the other player's is
held on screen (the 1.5 s spotlight) the next board's lines wait too.

**Where it is kept: the server (`SeatPlayLogs`, in `LiveMatch`).** Each
seat's lines, the last 2,000, for the match's life; the board a
connection gets on (re)connect carries that seat's whole log, so a
refresh brings it back. Never sent to another seat; spectators get no log
(their snapshot never carries one). The server adds pictures to the
named cards (`MatchArt`), which authorises that seat to fetch them, as a
snapshot does. A server restart loses the log, as it loses the match.
Chat is still live-only (spec 0013 G2: the canvas's question on keeping
chat was left as it was).

**The page (`battlefield/GameChat.tsx`, `chatPlace.ts`).** Tabs Chat and
Play log with unread counts (chat gold, plays grey; the log a refresh
brings back is not counted). Opens on Chat; the closed edge tab keeps
today's dot for chat only (both left open on the canvas; the defaults).
The log: "Turn 5 · Alice" headers that stick while you scroll that turn
("your turn" on yours; "Before the game" for the opening hands), the step
written small when it changes (Combat, Main 2, End), coloured dots by
kind, card names you point at to see the card (its picture beside the
name) and click to open the board's close-up when it is still on the
table, filters Everything / Spells and combat, follows the game unless
you scrolled up ("Jump to latest"). Floating: the ⇱ button; dragged by
its top bar, resized from its corner (300x260 to 900x1400), remembered
per user in this browser (`proxic.gameChat.v1.<user>`, try/catch); while
dragging, the hand and the column with the action button light up; let
go over either and it slides the least distance clear (shorter only if it
must); it moves clear again when the window or the hand grows; ⇲ docks
it. Pop-out (⧉, hidden on phones and tablets): `window.open` of a blank
same-origin window that this page draws into (a React portal, with the
page's styles copied), so it shares the page's game state and sockets and
stays in step; a blocked pop-up says "Your browser blocked the chat's own
window. Allow pop-ups for this site, then try again."; the table keeps a
tab that brings it back; closing it puts the chat back; refreshing or
leaving the game closes it. The lobby chat is unchanged.

**Proof.** `PlayLogTest` (worker: a hidden card never reaches a seat's
line by name or id, from both seats); `PlayLogKeptTest` (server: each
seat gets back only its own whole log; bounded; pictures for that seat
only); `scripts/check-play-log.py` (a real game, both seats: own draws
named, the other's "drew a card"; Willbender cast face down named to
Alice only until it died; Bolt targeting Bob's Grizzly Bears; attack and
damage lines with life totals; every line in its own revision's
snapshot); `scripts/check-hidden-log.py` over traces (every card a line
names is one that seat's own snapshots named; no id from another seat's
hand; no line ahead of its board; no line to a spectator) -- both added
to CI. With the visibility check removed from `PlayLog`, both scripts
fail (49 problems); with the page's revision filter removed, the
held-board page test fails. Page tests `fixes0064.test.tsx`; e2e
`match-play-log.spec.ts`.

**Fix after commit 802a9d1 (2026-11-08): an id left on a card gone hidden.**
CI's check-hidden-hands caught seat 2's snapshot (Krark, the Thumbless
game) carrying `card:7` -- Alice's Lightning Bolt, by then back in her
hand -- in a play log part's `id`: the Bolt left the stack for her hand
when Krark lost his flip, and the line (named, since the Bolt was public
on the stack) kept the card's id. The name is history; the id is a live
handle. Now a line's card keeps its `id` only while the board it travels
with carries that card id (`PlayLog.keepShownIds` in the worker for each
round's lines; `SeatPlayLogs.shownOnly` in the server for the whole log
resent on a reconnect -- a reference check, no visibility decided there).
That move also said "was countered"; a spell leaving the stack for a hand
or a library now says where it went ("Lightning Bolt returned to Alice's
hand"). `check-hidden-log.py` now also fails any line whose `id` the
board of the same snapshot does not carry (it reported the CI trace).
