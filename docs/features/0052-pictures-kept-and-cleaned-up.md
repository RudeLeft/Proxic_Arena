# 0052 — Pictures kept between games, and cleaned up when unused

**Status:** Built in 1.30.0 (approved 2026-11-02)
**Owner decisions** (2026-11-01, from the Deck Builder chat's review of how
deck pictures are sent and used; parts 1 and 2 were specs 0049 and 0051):

- **D1** **Any signed-in player may load a picture** by its address. Each
  picture gets **one address** (its content hash), the same in every game
  and on every deck page, so a browser keeps it between games instead of
  downloading it again for each match.
- **D2** **Cloudflare keeps no copies.** Every picture still comes from the
  server and is checked for a signed-in player (`private` caching only), so
  nobody who is not signed in can load one.
- **D3** **Close-ups keep being fetched ahead** for the cards in view. With
  one address per picture, each close-up is downloaded once per browser
  instead of once per game.
- **D4** **A weekly clean-up** deletes pictures that no deck and no running
  game has used for 30 days, including pictures left behind by a failed
  send. Nothing a deck still uses is ever touched.
- **D5** "Already on Arena" still counts only the sender's own decks (spec
  0022 unchanged).
- **D6** (owner, 2026-11-02, asked during the build) When a deck stops
  being shared, the other player loses the deck -- its list, its page,
  playing it, and its pictures through the deck's address -- but a picture
  they were already shown keeps loading at its own address. Amends PHASE 4
  §4.35 for card pictures only.

## What the player sees

- **Games load faster after the first.** Play Alex with your Goblins on
  Monday and again on Tuesday: on Tuesday Alex's browser already has every
  Goblins picture, from the board copy to the close-up, so the board fills
  at once. Today each game downloads every picture again (tens of MB a
  player a game, from the home server through Cloudflare).
- **The Deck Depot shares the same pictures.** A card seen in a game is
  already there when you open a deck that has it, and the other way round.
- **Nothing else changes** on screen. Hidden cards stay hidden: a game
  still names a picture only for a card the viewer may see.

## Rules and boundaries

- **What is still private.** A player learns a picture's address only by
  being shown that card (in a game, a deck they may see, or a deck of their
  own); a hidden card's picture is never named to them (§6.124, spec 0049).
  What changes (D1): once known, an address keeps working for any signed-in
  player, not only inside that one game. Card pictures are Scryfall's
  public card images, so this exposes no secret art; it does let a player
  who once saw your card load its picture again later.
- **Signed in, always.** The picture address answers 401 without a session
  (Arena's sign-in gate, as every address not exempted), and `Cache-Control: private,
  max-age=31536000, immutable`, so Cloudflare stores nothing (D2) and a
  browser keeps it for a year (the address is a hash: its bytes never
  change).
- **The old addresses** (`/api/matches/{id}/assets/{sha}`,
  `/api/decks/{id}/assets/{sha}`) keep working, with today's checks, for a
  page already open during the update; the pages stop using them.
- **The clean-up** never deletes a picture any deck uses (cards, back
  faces, tokens, art crops), nor one a running game uses, whoever owns the
  deck. A picture that stops being used is remembered as unused from that
  day; after 30 unused days it is deleted (original and copies). Files no
  picture row knows (a failed send) are deleted when they are 30 days old.
  Each run is written to the server log with what it deleted and how much
  space came back. A fresh start (spec 0048) still deletes everything at
  once.

## Build

### Arena

1. `GET /api/pictures/{sha}` (and `?size=full` for the close-up): a signed-in
   session (the Deck Builder never loads pictures, so no device token); a hash that is not a stored picture is
   404. Serves the table copy or the close-up exactly as the match and
   deck routes do today, with the caching above.
2. The game page builds every picture address as `/api/pictures/{sha}`:
   the board, hand, stack, windows, close-ups and the fetch-ahead (D3);
   the spectator page too.
3. The Deck Depot's deck page gets the same addresses from the server
   (`artUrl` on cards, back faces and tokens).
4. `art_asset` gains `unused_since` (migration V035; V034 was held for the notices work, which needed no
   migration, so V034 does not exist).
5. A weekly job (the same kind of scheduled runner as session upkeep):
   mark pictures no deck uses as unused since now; clear the mark of any
   that are used again; delete those unused for 30 days that no running
   game uses; delete orphan files 30 days old; log what it did. It runs a
   few minutes after start and then every 7 days.

### Deck Builder

Nothing: it does not load pictures from Arena.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0052-A | A signed-in player loads a picture by its address; nobody signed in gets 401; an unknown hash 404; the caching header is `private`, a year, immutable | server test |
| F-0052-B | Two games in a row with the same decks: the second downloads no picture again | e2e (network requests counted) |
| F-0052-C | The game, spectator and Deck Depot pages use only `/api/pictures/` addresses; a hidden card still names none | e2e + MatchArtTest |
| F-0052-D | The clean-up keeps every picture a deck or a running game uses; marks the rest unused; deletes them only after 30 days; deletes 30-day-old orphan files | server tests with a clock |
| F-0052-E | The job is wired: it runs after start and weekly, and logs | server test (TEST-010) |

## Built (2026-11-02)

- `GET /api/pictures/{sha}` (`deck/PictureRoutes.kt`, registered with the
  deck routes): behind the sign-in gate like every address not exempted;
  `private, max-age=31536000, immutable`; a hash of the wrong shape or not
  stored is 404. The deck page's `artUrl`/`backArtUrl` and every game page
  address (`pictureUrl` in `closeUp.tsx`: board, hand, stack, windows,
  close-ups, the fetch-ahead, the spectator's view) use it; `artUrl` is now
  one stable function, so the board no longer rebuilds its cards on every
  render. The per-match and per-deck routes keep their checks.
- `PictureCleanup` + `PictureCleanupSchedule` (`deck/PictureCleanup.kt`),
  started with the server (`startPictureCleanup`, 10 minutes after start,
  then every 7 days), stopped with it; V035 `art_asset.unused_since`; a
  running game's pictures from `MatchRuntime.picturesInPlay`. A picture
  stored again renews its original's file time, so a send in flight is
  never cleaned away.
- **Evidence:**
  - `PictureCleanupTest` (database, fixed clocks): a deck's card picture
    and art crop kept; an unused one marked, still there at 29 days, gone
    (row and files) at 31; used again loses the mark; a running game's and
    a re-stored one kept; 40-day-old orphan files deleted, a 2-day-old one
    kept; the schedule's run marks.
  - `DeckBuilderApiTest`: a deck page's address is `/api/pictures/{sha}`;
    another signed-in player loads it and its close-up; the caching
    header; nobody signed in 401; unknown and malformed hashes 404.
  - `match-picture-reuse.spec.ts`: two games in a row in the same browsers;
    the first downloads the pictures (a close-up included); in the second,
    the browser's network log shows no picture request reaching the
    server, and no page used a per-match or per-deck address. Against the
    server without 0052 it failed (no `/api/pictures/` request at all).
  - `sharing.spec.ts` updated for D6; `match-art-crop`, `match-stolen-picture`,
    `match-own-printing`, `decks`, `match-watching` pass on the local stack.
  - The local server's first clean-up ran 10 minutes after start: 381
    pictures of deleted test decks marked unused, none deleted.

## Release

Arena only (1.30.0). Plain-English notes.

## Amendments

None.
