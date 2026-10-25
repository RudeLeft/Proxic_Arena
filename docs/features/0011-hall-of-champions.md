# 0011 — Hall of Champions

**Status:** Approved 2026-10-25 — built; look approved from screenshots ("ship both", 2026-10-25)
**Owner decisions:** C1 the title is "Reigning Proxic Champion"; C2
ranked by all-time wins; C3 dead last only after 5 finished games; C4
the rings show everywhere in the lobby (owner, 2026-10-25, from the demo
at https://claude.ai/artifact/Pe1LxxyV6jnyYwas1CgCW7)

## What the player sees

A new panel in the lobby, **Hall of Champions**, between "Play a game"
and "Open rooms" (on a phone, in the same order):

- **The Reigning Proxic Champion (C1)**: the player with the most wins.
  The gold trophy, their picture in a gold ring with a "1" medal, their
  name, and "14 wins from 19 games".
- **2nd and 3rd**: the silver and bronze trophies, each picture in a
  silver or bronze ring with its medal, and the number of wins.
- **Dead last**: the trophy with the pile on it, for the player with the
  fewest wins, in a muddy-green ring with a 💩 medal.

The same ring and medal follow those four players through the lobby
(C4): the Players list, the seats in a room and the pictures beside
their chat lines.

Example: Pat has 14 wins, RudeLeft 11, Ash 7, Bree 4, and Dana 1 from 9
games. Pat is the Reigning Proxic Champion; RudeLeft and Ash get silver
and bronze; Dana gets dead last. Pat finishes a game against RudeLeft
and wins: everybody's Hall shows 15 wins for Pat as soon as the game
ends, with no reload.

Before anybody has won a finished game, the panel shows the gold trophy
dimmed and "No champion yet. Win a game to take the crown."

## How it is counted

- **A finished game** is one the rules engine ended with a result: a
  win, a concession (the other player won), or a draw. A game that was
  abandoned, closed by an administrator, or stopped by a fault is not
  counted at all, for either player.
- **Wins (C2)**: every finished game the player won, since the server
  began. A draw is a game played, not a win.
- **Order**: most wins first. On equal wins, fewer games played ranks
  higher (more wins per game); then whoever reached that number of wins
  first.
- **Podium**: the top three with at least one win. With fewer such
  players, fewer places are shown.
- **Dead last (C3)**: among players with at least 5 finished games, the
  fewest wins; on equal wins, more games played is further down; then
  whoever has been on that number longer. Nobody already on the podium
  is dead last. Until somebody qualifies, the strip is not shown.
- Disabled accounts are left out. A deleted player's games still count
  for the person they played.

## Scope

In: the lobby (Hall panel, Players list, room seats, chat).

Out (and why):
- **Seasons or monthly resets** — C2 chose all-time.
- **The game screen, Deck Depot, Account, Admin** — C4 is the lobby,
  where the players are.
- **Full standings for everyone** — the ask is the top three and dead
  last.

## Rules and boundaries

- **Forge decides who won** (FORGE rules): the count reads the result the
  server already records from the rules engine (`match.result_summary`,
  "winner:seat N"); Arena declares no winner of its own.
- **What others learn**: a player's number of wins and finished games.
  The lobby already shows names and pictures to every signed-in player;
  a stranger sees nothing (the 2026-10-24 lockdown).
- **Live**: the server tells everybody the new standings when a game
  finishes with a result or an account is disabled or enabled, and each
  connection when it opens.
- **Layout**: the new panel is the owner-approved layout of the demo; no
  other panel moves or changes size.
- **The art** is the owner's (four trophies), shipped like the avatars
  and served only to signed-in players.

## How it works (for the build)

- Server: one query over `match` (status ENDED) and `match_participant`;
  a `STANDINGS` lobby message `{ podium: [{userId, place, wins, games}],
  last: {userId, wins, games} | null }` sent on connect and broadcast on
  a result or an account change. `LOBBY_PROTOCOL.md` updated.
- Frontend: the lobby keeps the standings; an avatar takes an optional
  `rank` (1, 2, 3, last) and draws the ring and medal; the Hall panel.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0011-A | Wins and games counted from finished games only; a concession is a win for the other seat; abandoned, failed and admin-closed games count for nobody | server test |
| F-0011-B | Order, ties, podium of fewer than three, dead last only at 5+ games and never also on the podium; disabled accounts left out | server test |
| F-0011-C | A finished game sends new standings to everybody | server test |
| F-0011-D | Rings and medals in the Hall, Players, seats and chat; empty state | unit + browser |
| F-0011-E | Desktop and phone screenshots approved | owner |

## Amendments

None.
