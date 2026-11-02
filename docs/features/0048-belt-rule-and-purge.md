# 0048 — The belt's 7-day rule, Reset the Belt, and the Admin purge

**Status:** Built in 1.27.0 (approved 2026-11-01)
**Owner decisions:** 2026-11-01, from the canvas
https://claude.ai/artifact/GXixi5Eb5b43KELUTGjn81 (item 1) and the questions
that followed:

- *Belt rule:* option A — **7 days, shown.** The holder must finish a game
  within 7 days of taking the belt or of their last game, or it passes to
  the top-rated active player (today's rule, which was 14 days and shown
  nowhere).
- *Reset:* an Admin **Reset the Belt** button: from that moment nobody holds
  it, and the winner of the next game takes it. Ratings and the Hall keep
  every game.
- *Purge* (instead of a "test account" switch): an Admin section that can
  delete **one player's games**, **games before a date**, or make a **fresh
  start** for production — accounts kept; games, recordings, Hall, ratings,
  belt, **decks**, **rooms and chat**, **reports** and **sign-in history**
  all cleared.
- *Safety:* every purge shows exactly what it will delete and works only
  after the admin **types a word to confirm**.

## What the player sees

- **Hall of Champions:** under the belt holder, "Defend by Sat 8 Nov · 4
  days left", a bar that empties, and one plain line: "Finish a game every
  7 days or the belt passes to the top-rated active player." (Shortened
  from "The holder must finish…" so it stays one line and the band keeps
  its height at 1920x1080.) After a reset: "Nobody holds the belt — the next game's winner
  takes it."
- **The holder, in the lobby,** two days or less before it is due: "Defend
  your belt by Sat 8 Nov: finish a game, or it passes on."
- Nothing else changes for players.

## What the admin sees

A **Belt and records** tab in Admin:

- **The belt:** who holds it, since when, defences, defend-by date, and
  **Reset the Belt** (type RESET to confirm).
- **Purge:** three choices, each showing its counts before anything
  happens, and a field where the admin types **PURGE**:
  - *One player's games* — pick a player: "Delete 37 games (Pat played
    them all; 31 were against RudeLeft, 6 against Ash) and their
    recordings." Those games leave the Hall, ratings, belt and history for
    both players in each game.
  - *Games before a date* — pick a date: "Delete 112 games that ended
    before 1 Nov and their recordings."
  - *Fresh start* — "Delete 412 games and their recordings, 38 decks and
    their pictures, 5 rooms, 9 reports, 640 sign-ins, and every chat
    message. 7 accounts stay." Refused while a game is being played.
- Every purge and reset is in the admin record, like every admin action.

## Rules and boundaries

- Only finished games are ever deleted by the player and date purges; a
  game being played is never touched. A fresh start is refused while any
  game is running ("A game is being played: wait for it to end").
- Accounts, passwords, avatars, linked computers, invitations, mail
  settings, priority stops and the admin record are never deleted.
- The belt, ratings and Hall are worked out from the games that remain;
  nothing else needs rewriting. A reset is kept as a dated record so the
  belt's history replays the same way every time.
- Pictures a deleted deck alone used are removed from disk; pictures
  another deck still uses stay.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0048-A | A holder idle 7 days hands the belt to the top-rated active player; 6 days does not | server test |
| F-0048-B | After a reset nobody holds it; the next game's winner takes it; earlier games still rate | server test |
| F-0048-C | The Hall shows defend-by and the rule; the holder is reminded within 2 days | browser |
| F-0048-D | Each purge's preview counts match what it then deletes; nothing happens without the typed word | server test |
| F-0048-E | A player purge removes exactly that player's finished games (both sides) and recordings; others stay | server test |
| F-0048-F | A fresh start keeps accounts and removes games, recordings, decks and pictures, rooms, chat, reports, sign-ins; refused while a game runs | server test |
| F-0048-G | The Admin tab: preview, type PURGE, done; Reset the Belt likewise | browser |
