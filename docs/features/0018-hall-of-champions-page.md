# 0018 — The Hall of Champions page: seasons, a fair rating, the Belt

**Status:** Approved 2026-10-27 — built in 1.8.0
**Owner decisions** (2026-10-26/27, draft: https://claude.ai/artifact/D7vFqDmS9gg2foJ16Vb6WY):
H1 the trophies move to their own page, "Hall of Champions", in the
top navigation; the lobby keeps nothing of them. H2 ranked by a
rating, so playing more never beats playing well. H3 monthly seasons:
trophies are awarded when a month ends and kept for good. H4 extras:
the Champion's Belt (the owner's picture), badges, records and
rivalries. H5 the last-place trophy keeps the owner's picture and is
called "Last place". H6 no scroll bars on a desktop; a phone stacks and
scrolls. H7 the Belt starts with today's champion; a holder who plays
no game for 14 days loses it to the season leader. H8 (a rule change)
a player's deck name and icon may be seen by others; its cards still
only by whoever it is shared with.

## What the player sees

A new page, Hall of Champions (`/hall`), between Lobby and Deck Depot:

- **The season band**: "Season 3 · November", the days left, and the
  season's 1st, 2nd, 3rd and Last place with their trophies, rating and
  record ("1,184 · won 9 of 12"). Beside it, the Champion's Belt and who
  holds it ("Held 4 days · defended 3 times").
- **The leaderboard**: this season or all time. Rank (with ▲/▼ since a
  day ago), rating (and the last game's change), won · lost · drawn,
  win %, the last five results, badges, and the deck played most.
  Below: who is still playing their way in ("3 of 5 games").
- **A tabbed panel**: Records (fastest win, longest win streak, longest
  game, most decks won with), Rivalries (the most-played pairings and
  their scores), Latest (the last results, rating changes, the Belt
  changing hands) and Past seasons (each month's four places). Under
  it, "Your rival": the player you have played most, and the score.
- **The lobby** no longer shows the trophies. The rings on players'
  pictures now mark this season's places.

## The rules

- **Rating** (H2): everyone starts each season at 1000. A finished game
  moves the winner up and the loser down by 32 × how unexpected the
  result was (Elo): beating a stronger player is worth more, beating a
  weaker one less. A draw changes nothing. Abandoned, failed and
  administrator-closed games count for nobody, as before.
- **Ranked**: 5 finished games in the season. The places and the
  leaderboard are ranked players only, highest rating first (ties: more
  wins, then whoever got there first). Last place is the lowest-rated
  ranked player who is not in the top three.
- **Seasons** (H3): calendar months, by the server's clock; numbered
  from the first month with a finished game. The trophies of a month
  are its standings when it ends. All time is the same rating, never
  reset.
- **The Belt** (H4, H7): from 27 October 2026 it belongs to the player
  with the most wins before then (spec 0011's champion). Whoever beats
  the holder in a finished game takes it; a win by the holder is a
  defence. If the holder plays no finished game for 14 days, it passes
  to the season leader at that moment (Latest says so).
- **Badges**: On fire (3+ wins in a row), Giant slayer (beat the
  season leader this season), Speed demon (won by turn 5 this season),
  Never conceded (10+ games, never conceded), Deck master (won with 5
  different decks), Belt holder.

## Scope

In: the page, its server read (`GET /api/hall`), STANDINGS from the
season, removing the lobby's Hall strip, the Belt picture.
Out: player pages (later); badges that need data the games do not
record yet (life totals); showing the opponent's deck inside a room
(H8 allows it; a separate change).

## Rules and boundaries

- Everything is worked out from the finished-games record already kept
  (`match`, `match_participant`): no new tables, and the first season
  counts the games already played.
- H8 changes DECK_DEPOT.md's "never to the other player" for a deck's
  name and icon; contents stay private (sharing unchanged).
- Disabled accounts are left off the boards; their games still count
  for the players they played.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0018-A | Rating, ranking, seasons, Last place, badges, records, rivalries and the Belt (taking, defending, idle hand-over) from a fixed game list | server unit test |
| F-0018-B | `/api/hall` from real finished games; signed-in only | server test |
| F-0018-C | The page: band, board, tabs; no Hall in the lobby | unit + browser |
| F-0018-D | No scroll at 1280×720, 1280×800, 1920×1080; a phone stacks | browser + screenshots |
| F-0018-O | The owner approves the look ("finish it and push when green", 2026-10-27) | owner |
