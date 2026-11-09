# 0067 — Spectate, life that ticks per hit and can go negative

**Status:** Approved 2026-11-09 (owner, on the canvas "batch-1109", sent as a file)
**Owner decisions:** item 1 A · Step per hit (a pile of identical tokens hits once for its total); items 2-6, 8, 9, 10 all as recommended on the canvas, including the 9 "Yes" lines of the spectating checklist (spectators do not read chat; no spectator limit). Items 7 (big casting card) and 11 (pointer) go to their own canvas.

## Why (researched)

- Life: the plate showed the new total the moment the damage board arrived (GameScreen gs-life-n), before any attacker had reached the player; the worker already sends each hit with its source and amount, and the page plans each lunge with its impact time (fights.ts). Phase 10 left this open for A-19.
- Negative life: nothing clamps it, but the game ends at 0 or less, so it only shows on the final board; the result said "life reached 0" and the shield is narrow.
- Spectating (spec 0047): spectators were never told the result (board froze, ~5 s later "The game is over."); one failed poll ended it for good; a quick rematch stranded them; their connections were never closed at the end (a red "no longer connected" could follow); no play log; always seat 1's side; two loading screens; the Watch button showed while the game was still loading (the click bounced back silently); a "Let people watch" checkbox; a "You are watching" pill; plain "Watch" / "Stop watching" / "Back to the lobby" controls.

## Built

1. **Life steps down per hit.** The plate holds the life from before the damage and drops by each hit's amount when that attacker strikes, with a red flash on the shield (lifelink adds when it lands); it settles to the real total when the fight ends or a click hurries it. A pile of identical tokens hits once for its total. Same for the other player's plate and for spectators.
2. **No "You are watching" pill.**
3. **Spectating, the checklist (all "Yes"):**
   1. Spectators are told the result: the board stays and the game-over card says who won and why.
   2. A network hiccup shows a short "Reconnecting..." and the game carries on; "game over" only when the game really ended.
   3. When the players rematch, the spectator follows them into the new game.
   4. Spectators' connections are closed cleanly at the end (no red "no longer connected").
   5. Spectators read the public play log, read-only (no chat box; players' chat stays private).
   6. A "Switch sides" button turns the table round smoothly; spectators still only ever get public cards.
   7. One loading screen.
   8. Spectate only once the board is up (see 5 below).
   9. Players can see who is watching: pointing at "2 watching" lists the names.
4. **"Watch" becomes "Spectate"**, the canvas's B · Live badge look (pulsing red dot).
5. **Spectate only when there is a game to see:** a greyed "Starting..." until the match is running (after mulligans); then Spectate.
6. **No "Let people watch" checkbox:** every game can be spectated (rooms opened with it off become spectatable).
8. **Negative life:** the shield fits "-12" (the number shrinks for 3 characters); the result reads "Bob's life fell to -3".
9. **Game over for spectators:** the canvas's B · slim spectator card ("Alice won · Bob's life fell to -3", brass "Back to the lobby", "Spectate another game" when one is running).
10. **"Stop spectating"**: the canvas's B · chip "Spectating Alice vs Bob · Stop" (replaces the pill of item 2).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0067-A | Plate life steps per hit at impact, settles to the board's value; hurry settles at once; token pile one step | page test; slow-motion clip |
| F-0067-B | A negative life shows on the shield and in the result words | page test; screenshot |
| F-0067-C | Spectator gets the result and the slim game-over card | server test + browser |
| F-0067-D | A dropped spectator connection reconnects without "game over"; rematch is followed; sockets closed at end | server test + browser |
| F-0067-E | Spectator play log is public-only (no hidden names or ids) | worker/server test; Lab check-spectator |
| F-0067-F | Switch sides turns the table; no hidden card reaches a spectator | page test + browser |
| F-0067-G | Lobby: "Starting..." while loading, Spectate when running; no watchable checkbox | page test + browser |
| F-0067-H | Players can list who is watching | server test + browser |

## Amendments

**Amendment 1 -- As built (2026-11-09).** Built to the canvas's approved
looks; where the build had to choose, it says so here.

- **Life per hit (item 1, A).** The board's life is the game's; while a
  damage step's fights play, the plate shows it LESS what has not landed
  yet, on the fight clock (`battlefield/lifeTicks.ts`, started by the
  Board's `playFights`): a hit drops it at its impact with a short red
  shake of the shield, lifelink adds at its blow, a first-strike step's
  pending steps carry into the regular step's clock, and the clock's end
  -- or a click hurrying it -- settles on the board's number. A pile of
  identical tokens is one step for its total (it fights as one drawn
  card). The Board's own "−N" on the plate is kept as the floating
  number. Reduced motion: no fights, so no steps.
- **Negative life (item 8, A).** The shield shrinks the number for three
  characters to the type scale's 18px (the canvas drew 19px; spec 0017
  allows only the scale's steps). The words: "Bob's life fell to -3" for
  Forge's LifeReachedZero, and from the final board when no reason came.
- **Spectators are told the result (checklist 1, item 9 B).** The server
  sends spectators `MATCH_ENDED` on the match socket (status and Forge's
  result by seat, as the lobby's `MATCH` carries it), then closes the
  socket normally (1000, "game over"; checklist 4); the page does not
  reconnect after it. It keeps the last 64 endings, so a spectator whose
  connection dropped at the very end is told too. The slim card says who
  won and why; "Spectate another game" shows when another room's game
  can be spectated.
- **Hiccups (checklist 2).** The page's room check (every 3 s) no longer
  ends anything: an unanswered check is retried; the socket reconnects as
  a player's does, with "Reconnecting to the game… The game carries on."
- **Rematch (checklist 3).** The same room check follows the players: when
  the room is playing a different game, the page moves into it (the game
  over card, then the one loading screen, then the new table).
- **Play log (checklist 5).** The worker writes a public log (seat 0):
  only cards every player may identify, nothing shown to one seat; kept
  while nobody watches and handed to the first public view, so the log
  starts at line 1. Read-only, in the chat drawer's place ("Play log"),
  no chat.
- **Switch sides (checklist 7).** The table fades to its felt, turns round
  under it and fades back (0.7 s) while the plates glide to their new
  ends; nothing flies from the old side. Bottom left: "From Bob's side ·
  Switch sides".
- **One loading screen (checklist 8).** The page's swirl ("Finding the
  game…") carries straight on into the table's (no gap between them).
- **Spectate only when there is a game to see (item 5, A).** The lobby's
  room list says `spectatable` (running here, past the opening hands);
  until then the card shows a greyed "Starting…".
- **No checkbox (item 6).** The room's `watchable` column is dropped
  (V039); the server's spectator check no longer reads it.
- **Who is watching (checklist 9).** `WATCHING` carries the watchers'
  display names; pointing at (or focusing) "2 watching" lists them beside
  it.
- **A spectator is nobody's "you".** Every player-relative word on the
  spectator's screen names the players and follows Switch sides: the
  fights' captions ("Damage · Alice's Grizzly Bears hit Bob"), the stack's
  line, the move pill's step ("Main 1 · Bob's turn"), the trays, the card
  and plate labels, the result sentence (`spectatorWords.test.tsx`, which
  fails when a caption or the step goes back to "your"/"their").
- **Who is watching** opens as a popover in the game's look (dark panel,
  gold line, "WATCHING" header, a pointer), left of the column over the
  table's edge, so the turn ladder is not covered.
- **Evidence.** Server `SpectatingTest`, `PlayLogKeptTest`; worker
  `PlayLogTest`; Lab `check-spectator.py` (public log, a mutation naming
  every card for the public seat caught); page `fixes0067.test.tsx`,
  `stops.test.ts`, `reconnect.test.ts`, `spectatorWords.test.tsx`; e2e `match-watching.spec.ts`.
