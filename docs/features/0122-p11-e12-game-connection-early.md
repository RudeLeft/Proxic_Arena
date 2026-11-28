# 0122 — Phase 11 P11-E12: the game's connection starts early

**Status:** **Approved by the owner 2026-11-27 (by prompt: "Approve it").** Built 2026-11-27 (As built, at the end; one point for the owner to confirm there: the order of the two early connections) (drafted 2026-11-27). Phase 11, item P11-E12 (step 9 of the recommended order). It changes the protocol (two new socket addresses), so it is its own spec, like D4 (`PHASE_11_EFFICIENCY_LOCKED.md`, the E12 row: "protocol change → its own spec").
**Owner answers, 2026-11-27** (by prompt, after the E12 research):

- **A: start the game's connection early,** beside "who am I", as the lobby's connection already does (P11-E5). The game **keeps its own separate connection**. One connection shared by the lobby and the game was explained and set aside: it gives no extra speed, a lobby blip would pause a game, and it risks sending hidden information down the wrong stream. The owner agreed.
- **Spectators too:** the watch page gets the same early start.
- The owner asked for what makes the app best; effort and time don't matter.

What is left for the owner is to approve this spec. One build choice (how the early connection learns which game) is decided below, with its reasons; it changes nothing a player sees.

## Why (researched)

Researched 2026-11-27 at origin/main d452a56a. RUN = measured, SOURCE = read in code or published docs, INFERENCE = reasoned from those. The research note and its probe live in the lead's scratch folder (`e12/`); the numbers below are copied from it.

- **The shortcut browsers have can't be used here.** A browser can open a WebSocket inside the page's own connection (WebSocket over HTTP/2, RFC 8441; over HTTP/3, RFC 9220), but only when the server offers it.
  - Cloudflare's edge does not offer it (RUN: `SETTINGS_ENABLE_CONNECT_PROTOCOL` absent on www.cloudflare.com, blog.cloudflare.com and discord.com, present on the non-Cloudflare controls nghttp2.org, h2o and facebook.com). Cloudflare's docs name no setting for it on any plan (SOURCE: developers.cloudflare.com, "WebSockets").
  - Chromium uses RFC 8441 only on an HTTP/2 connection it already has (on by default since 91), and has no HTTP/3 WebSockets ("No active development", chromestatus 5080537855688704). Firefox has RFC 8441 on by default and no RFC 9220 (Mozilla bug 1876271, open). Safari 26.0 has both (SOURCE: WebKit's "WebKit Features in Safari 26.0").
  - Ktor 2.3.13 refuses the upgrade on HTTP/2 (READ: the jar, `NettyHttp2ApplicationResponse.respondUpgrade` throws "HTTP/2 doesn't support upgrade"), and so does Ktor's main branch today (SOURCE). The live origin sits behind a `cloudflared` tunnel on plain HTTP/1.1 anyway.
  - So every engine opens the socket on a connection of its own: one round trip for TCP, one for TLS, one for the upgrade. Live, 378-474 ms against 148-187 ms for a request (RUN, the deep dive, 2026-11-19).
- **Where that costs a player** (RUN, 2026-11-27, stack A at d452a56a, a probe built from the loading measure's parts: `frontend/tools/measure/link.ts`'s relay and the e2e helpers; Playwright's bundled Chromium 1248 and WebKit 2370, 3 runs each, medians; the relay models TCP but not TLS):

  ```text
  The game page by address (a player)      Chromium                     WebKit
                                           live-like  slow 4G           live-like  slow 4G
  reload  usable                              866       913               967      1206
          game socket made (after its code)   368       390               569       752
            its open takes                    470       500               338       370
          first board                         852       902               906      1144
  cold    usable                             2134      3742              2173      3788
          game socket made                   1769      3281              1761      3305
            its open takes                    323       396               337       372
          first board                        2094      3692              2110      3710

  Start match (from the press)
          game socket made                   2960      3419              3587      4074
            its open takes                    318       347               375       372
          first board (the game set up)      5720      5775              6160      6234
  ```

  - On a reload or a game opened by its address, the page makes the game's socket only after its own code and `/api/matches/current` are in (`battlefield/GameScreen.tsx`, the effect that calls `connectMatch`). Its open is then 35-54% of the reload.
  - At Start match the socket is open about 2 s before the first board exists (the game is being set up on the server). Starting it earlier there gains nothing; this spec doesn't touch Start match.
- **What this spec should save** (INFERENCE from the timelines; to be measured, EVID-005): about 300-350 ms on a reload and on a cold load, for players and spectators. On the live site, with TLS's extra round trip, a little more.

## What the player sees

Nothing new on screen. Only faster:

1. **Bob presses refresh during Alice's turn.** Today his table is back in about 0.87 s on a home link like the live one (0.97 s in Safari's engine). After this spec, about 0.55-0.65 s. His browser starts the game's connection at the same moment as the sign-in check, instead of after the page has loaded.
2. **Bob opens the game in a new tab** (or comes back to it from a bookmark). About 0.3 s sooner, the same way.
3. **Carol is watching Alice and Bob and presses refresh.** Her view comes back about 0.3 s sooner too (owner answer, 2026-11-27).
4. **Alice presses Start match.** The same as today. There, the wait is the game being set up, not the connection.
5. **Bob's game ended while his page was loading.** He sees what he sees today: the game's end, or the lobby. No error, no flash.

## The change

### Which game: the server decides (decided)

The early connection opens before the page knows which game it is in. Two ways were weighed.

- **(a) Chosen: an address the server resolves.** `/ws/matches/current?deltas=1` for a player: the game the signed-in user is seated in. `/ws/matches/watch/{roomId}?deltas=1` for a spectator: the game that room is playing.
- **(b) Not chosen: the match id kept for the tab** (sessionStorage) from the last load, plus the primed `/api/matches/current` answer on a cold tab.

Why (a):

1. **The earliest start on every kind of load.** (a) opens at "who am I" time on a reload, a cold load and a new tab alike (Chromium reload: at 179 ms, against the 368 ms of today). Under (b), a load with nothing kept, such as a new tab or a profile whose storage was cleared, waits for the primed answer. On a reload that is about today's time, so nothing is saved there (RUN: the answer lands 12 ms before today's socket).
2. **Nothing the page holds can be stale.** Under (b), a kept id can name a game that has ended. The id route would then open a player's connection to an ended match, a path that has never been needed and isn't tested. Under (a), the server asks the same question `/api/matches/current` asks (`MatchStore.activeMatchOf`: `LAUNCHING` or `RUNNING`), at the moment of the connection.
3. **One source of truth.** Who is in which game is the server's to say (§6.108, §6.114). The page doesn't carry an id between loads, and browser storage is a hint at best (Safari deletes it after 7 days unused; P11-F3).
4. **It is the same shape as the lobby's early connection** (P11-E5): opened on the session hint alone, refused without a session.

The cost of (a): two socket addresses, each a thin front on the existing handler, documented in `docs/architecture/AUTHORIZATION.md`, `docs/architecture/MATCH_PROTOCOL.md` and `protocol/README.md`.

### Server (`match/MatchSocket.kt`)

1. **`/ws/matches/current`.** Authenticated as today (`socketPrincipal`). It resolves `matches.activeMatchOf(userId)`, then runs **exactly** the `{matchId}` handler for that match as a player connection: the seat, the 2 s / 5 s pings (`Limits.MATCH_PING_MS`, `MATCH_PONG_WAIT_MS`), the per-connection queue (0119), the delta history (0117), the hello first, then the board, then the waiting question, and `SeatLinks` (0120). The resolved game is named in `MATCH_HELLO.matchId`, as today. With no game, it closes with **4003 "no game"**: a new code, private to Proxic, listed in `protocol/README.md` beside 4000-4002.
2. **`/ws/matches/watch/{roomId}`.** It resolves the room's game as `MatchRoutes.kt`'s `watchRoute` does (the room, its host's active match in that room, `mayWatch`), then runs the spectator path (`spectate`) for it: the public view only. A caller **seated** in that game is never given their seat here: it closes 4003, as `/api/matches/watch/{roomId}` answers 409 "This is your own game". No watchable game also closes 4003. A game that just ended is told its end, as today (`toldTheEnd`).
3. Both are constant path segments, so Ktor matches them ahead of `/ws/matches/{matchId}`; no id route changes. A `resume` is not read on either: a fresh page asks for nothing (0119, owner answer 5). Reconnects keep using `/ws/matches/{matchId}`.

### Page

1. **`early.ts`.**
   - On `/game` (`EARLY_PAGES`, path `/game`) with the session hint, beside the lobby's connection, it opens `/ws/matches/current?deltas=1`. On `/watch/<room>` it opens `/ws/matches/watch/<room>?deltas=1`.
   - The events are buffered as `openEarlySocket` does, each **with the time it arrived** (`performance.now()` and `Date.now()` taken at the event).
   - The connection is handed over once (`takeEarlyGame`, next to `takeEarlySocket`), or closed: after `TAKE_WITHIN_MS`, or as soon as the page knows it won't take it (below).
   - A stranger opens nothing: no session hint, no socket (owner 2026-10-24, as E5).
2. **`match.ts` `connectMatch`.** For the **first open only**, its `factory` takes the early connection if there is one; reconnects are untouched. The page applies **nothing** from the early connection until its `MATCH_HELLO` names the page's game (`match.matchId` on the game page; the room's game on the watch page). Anything before the hello is held, then applied in order.
3. **Ordered replay, at the original times.**
   - What arrived before the hand-over is replayed in order, then the live events follow (as `Taken` does today).
   - The lateness rule (`sentAt` against arrival, `skew`, `LATE_MS`) and the silence check use each event's **kept arrival time**, not the replay's. Otherwise a board that waited 1.5 s in the buffer would count as late.
   - The silence check starts at the hand-over, like any fresh connection.
4. **When the page doesn't take it,** it closes it at once and does today's thing:
   - closed 4003 before the hand-over: the page opens its own connection, as today, or follows `/api/matches/current` to the lobby;
   - the hello names another game (a race at a game's end, or the watch page following the players into their next game): the page opens its own connection for its game **first**, then closes the early one. That way the seat is never left without a connection (`SeatLinks`: a seat drops only when its last game connection closes);
   - `GamePage` finds no game, or the player leaves the page before the table is drawn: closed at once. That is the same meaning as closing the game page today; no new kind of drop.

## An early connection is never a new kind of drop (0120)

- **Opening early changes nothing about who counts as there.** While the early connection is open, the seat has a game connection, exactly as while today's page loads after its socket opens. The server's resume rule after a pause is unchanged (0120: at least 2 s steady, the page's `CAUGHT_UP` or the 8 s cap). The page sends `CAUGHT_UP` only once its table is live, as today.
- **Closing an untaken one** happens only when the page leaves the game, or after it has its own connection open (above). It never pauses a game the page is still showing.
- **No false pause on a slow cold load.** The server pings the early connection every 2 s from the moment it opens, while the page is still downloading its code (3.3 s after the open on slow 4G, longer on "poor"). The browser answers those pings itself, without the page's script (RUN in P11-E13 and spec 0120's Amendment 2), so a buffered connection is never silent to the server. This is checked, not assumed (F-0122-F).
- **A reload's gap gets shorter, not longer.** Today a reload closes the old page's connection, then opens the new one after the code: a gap of 0.4-0.9 s, which 0120 rides out (the pause look waits 1.5 s). The early connection shortens that gap.

## Rules and boundaries

- **Hidden information (HID-001, HID-002, P11-R4).** No new view and no new field.
  - `/ws/matches/current` gives a seat's view only to the user seated there, decided by the server from the session, as the id route does.
  - `/ws/matches/watch/{roomId}` gives the public view only, and never a seat's view, even to that game's own player.
  - Deltas are made per connection from that connection's own history (0117), so an early connection starts with a whole board, as any connection does.
  - The P11-R4 gate is re-run in CI on this build (F-0122-D), including games whose pages arrived by the early connection (HID-004: the run must show the early path was used).
- **PROTO-002:** state first, unchanged: hello, then the board, then the question.
- **PROTO-007:** a dropped early connection costs time, never correctness. The page falls back to today's path.
- **The stranger rule** (owner 2026-10-24): no session hint, no early connection. Without a session, the server closes it, as every socket does (`socketPrincipal`).
- **Start match:** untouched. The early connection exists only on a page load of `/game` or `/watch/<room>`, never on the in-app move from the room to the game.

## Targets (measured, EVID-005; P11-R5: 3 runs, both engines, the machine named)

| Page, link | Today (RUN 2026-11-27, Chromium / WebKit) | Target | Against |
|---|---|---|---|
| Game, slow-4G reload | 913 / 1,206 ms | **≤ 900 ms in both engines** | E5's "every signed-in page usable ≤ 900 ms on a slow-4G reload" (the game and spectate missed it, E5's As built) |
| Game, live-like cold | 2,134 / 2,173 ms | **≤ 2.0 s in both engines** | E6's "≤ 2.0 s cold" (missed: 2,108 / 2,167 in E6's As built) |
| Game, live-like reload | 866 / 967 ms | ≤ 700 ms in both engines | E12's own |
| Spectate, slow-4G reload and live-like cold | 912 / 1,036 and 2,113 / 2,214 ms (E6's As built) | the same targets as the game | E5, E6 |
| Start match, every link | as today | no slower (within the measure's ±10%) | P11-R1 |
| The lobby's player list on the game page (E2's avatars) | as today | no later (the two early connections share the link) | P11-E2 |

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0122-A | `/ws/matches/current`: a seated player gets hello (naming the game), board, question, the 2 s / 5 s pings and a `SeatLinks` link, exactly as on the id route; no game closes 4003; no session closes as today; `resume` is ignored | server tests (`MatchSocket`, real sockets) |
| F-0122-B | `/ws/matches/watch/{roomId}`: a spectator gets the public view only; the game's own player is closed 4003 and is never sent a seat view; an unknown or unwatchable room closes 4003; a just-ended game is told its end | server tests; the seat-view half is a HID test, asserted from both seats (HID-003) |
| F-0122-C | Page: buffered events replayed in order, then live; lateness and silence use the kept arrival times (a board buffered 1.5 s is not late); nothing applied before a hello naming the page's game; a hello naming another game opens the page's own connection first, then closes the early one; 4003 falls back to today's path; untaken, closed at once on leaving and after `TAKE_WITHIN_MS` | Vitest (`early.test.ts`, `match.ts` tests, fake timers) |
| F-0122-D | **P11-R4 gate re-run in CI** (F-0117-D and F-0117-E) on this build, plus browser games where both seats and a spectator reload into the game by the early connection with the send-both switch on: 0 `DELTA_MISMATCH`, deltas applied counted, and each page records that its first connection was the early one (HID-004) | CI |
| F-0122-E | Browser, a real game: reload `/game` and `/watch/<room>` in Chromium, Firefox and WebKit, and the table draws from the early connection; the game ends while the page loads, and the page shows the end or the lobby with no error notice; Start match unchanged | e2e spec, in `ENGINE_SPEC` (CI's engines job) and Chromium's suite |
| F-0122-F | **No false pause:** the guest reloads the game cold over the relay's slow-4G and poor links (the code arriving seconds after the early open) while the host plays on: the host is never sent `MATCH_PAUSED`; then the guest leaves the page before its table draws, and the host sees today's drop | e2e over `link.ts`'s relay (0119's helpers) |
| F-0122-G | **The loading measure gains open-time columns:** `frontend/tools/measure/loading.spec.ts` records, per socket, when it was made, opened and first heard (an init-script wrapper on `WebSocket`, as the research's probe did), and whether the game's first connection was the early one; rows for game and spectate, cold and reload, and Start match | the kit; `ci/measure.mjs compare` shows the columns |
| F-0122-H | The targets above, before and after on the same stack, 3 runs, Chromium and WebKit, local, slow 4G and live-like, plus the live site once by hand | measurement, in the As built |
| F-0122-I | A real-click game on the local stack: reload mid-game, open the game in a second tab, watch and reload; screenshots | TEST-011 |

**TEST-004 (bites).** Each must make a test fail:

- the early connection never handed over (F-0122-G's "early" flag is false, and the targets return to today's);
- the replay using `Date.now()` at replay time (F-0122-C's 1.5 s-buffered board counts as late);
- the 4003 fallback removed (F-0122-E's ended-game check fails);
- the watch address serving a participant their seat view (F-0122-B fails);
- closing the early connection before the page's own one opens (F-0122-C's order check fails, and F-0122-F sees a pause).

## Not in this spec

- **One connection for lobby and game.** Set aside by the owner, 2026-11-27, for the reasons at the top.
- **Start match's own wait** (2.3-4.1 s before the page makes its socket, then about 2 s to the first board, while the server sets up the game). It is measured above, but it is not a connection cost. If it is to be shortened, that is its own item.
- **RFC 8441 / 9220.** Nothing at Cloudflare can be turned on (above). Revisit only if Cloudflare starts offering it; the research's 25-line check settles that in a second.

## Decisions for the owner

None open: A and "spectators too" were answered on 2026-11-27. Approving this spec is the decision. The match-id choice above changes nothing the owner sees.

## Amendments

None yet.

## As built (2026-11-27)

Branch `p11-e12-build`, from main 85a79303. Labels as EVID-001: RUN = measured
here, SOURCE = read in the code. The machine: the owner's PC (13th Gen Intel
Core i5-13600KF x20, 32 GB), stack A, Playwright's bundled Chromium 1248 and
WebKit 2370, headless, 1920x1080.

**What was built** (SOURCE):

- Server, `match/EarlyMatchSockets.kt` (new): `/ws/matches/current` and
  `/ws/matches/watch/{roomId}`, mounted by `matchSocket` ahead of the id route.
  `/current` asks `MatchStore.activeMatchOf` (off the event loop, as the session
  check) and runs `player` with no resume; the watch address finds the room's
  game as `watchRoute` does and runs `spectate`. `NO_GAME_CODE` 4003 "no game" for
  no game, an unknown room, a game not yet watchable, and the caller's own game on
  the watch address (nothing is sent before the close). A room whose game just
  ended is told the end: `SpectatorEndings.lastIn(roomId)` and `toldTheEnd(matchId)`.
- `match/PlayerOpen.kt` (new): the id route's player connection, lifted out of
  `matchSocket` unchanged as `player(PlayerOpen, ...)` with `listen` and `resync`,
  so both routes run the same code (detekt's file-size rule split it out).
- Page, `early.ts`: `openEarlyGame` beside "who am I" for a page whose
  `EARLY_PAGES` entry has `game` (`/game`, `/watch/<room>`), with the session
  hint only; every event kept with `Date.now()` and `performance.now()` at its
  arrival; `takeEarlyGame` hands it over once (`EarlyGameSocket`), `endEarlyGame`
  closes it (GamePage and WatchPage on "no game" and on leaving, `endEarly`,
  `TAKE_WITHIN_MS`). `EarlyGameSocket` passes nothing on until a `MATCH_HELLO` or
  `MATCH_ENDED` names the page's game, then replays everything kept in order with
  its kept arrival (`arrivedAt`); another game, or any close before one: the
  page's own connection (`own`, connectMatch's factory) at once, the early one
  closed once that has opened or failed. On a 4003 it also calls `noGame`.
  A page that took it marks `EARLY_GAME_MARK` ("pa-game-early").
- `match.ts` `connectMatch`: `options.first` for the first open only; each
  message's lateness is judged at `arrivedAt(event) ?? Date.now()`; the silence
  check starts at the hand-over (`heard` never moves back).
- `GameScreen.tsx`: takes the early connection; `noGame` (players only) asks
  `/api/matches/current` afresh (`lobby.ts` `stillInGame`, never a primed
  answer) and, in no game now, leaves for the lobby.
- **Order (decided while building; owner to confirm, below):** on these two pages
  the game's early connection is opened FIRST, then the lobby's (`startEarly`).
- Measure (`frontend/tools/measure/loading.spec.ts`, F-0122-G): `SOCKET_PROBE`
  and `socketTimes`; game, spectate and Start match rows gain `gameEarly`,
  `gameSocketMadeMs`, `gameSocketOpenMs`, `gameSocketOpenTakesMs`,
  `gameFirstBoardMs`, `lobbySocketMadeMs`, `lobbySocketOpenMs`, `lobbyPlayersMs`.

**Found while building** (RUN):

1. **A browser opens one WebSocket to a host at a time.** RFC 6455 4.1: a second
   connection to the same host waits until the first has opened or failed.
   Chromium does this; Playwright's WebKit on Windows did not. Built as the
   research assumed (the lobby's early connection first, the game's beside it),
   Chromium's reload gained nothing: the game's connection was made at 180-190 ms
   instead of 370, but opened at 850, after the lobby's (live-like reload 857 ->
   859 ms; slow 4G 916 -> 902). WebKit gained the full amount (1,013 -> 681 ms).
   Opened game-first, Chromium's reload is 528 ms and WebKit's unchanged. The
   cost, in Chromium only: the lobby's player list on the game and watch pages
   comes about 330 ms later (live-like reload 515 -> 843 ms, cold 1,058 ->
   1,399), after the table. The players' pictures on the table are not later
   (the last one in: 856 -> 846 ms; no swaps). Firefox follows the RFC too
   (INFERENCE; it does not start on this PC).
2. **A board merely waiting in the buffer is never "late" under the min-gap
   rule**, even judged at replay time: every kept message is judged at the same
   instant, earliest-sent first, so the smallest gap only shrinks. What the kept
   arrival time changes is that a board which really came late on the wire while
   kept is still caught up. That is the test the replay-time mutation fails (not
   the spec's "a 1.5 s-buffered board counts as late", which cannot fail).
3. **A player whose game ends while the page loads** (the first
   `/api/matches/current` answer from just before the end) fell back, as designed,
   to the id route, where the server has a hello and nothing more for a player of
   an ended game: the page sat on "Shuffling up and dealing..." for good. Today's
   path has the same hole, with a narrower window. Fixed with `noGame` (above).

**The targets (F-0122-H)**, RUN 2026-11-27, `node ci/measure.mjs loading --runs 3
--engines chromium,webkit --links local,slow4g,live --grep game`, before = main
85a79303, after = this branch (game-first), the same stack and machine; medians
of 3 runs, Chromium / WebKit, ms. Raw: scratch `e12b/before`, `e12b/after`
(lobby-first) and `e12b/after-b` (as built).

| Page, link | Before | After | Target | Met |
|---|---|---|---|---|
| Game, slow-4G reload | 916 / 1,070 | **555 / 694** | ≤ 900 both | yes |
| Game, live-like cold | 2,077 / 2,272 | **1,819 / 1,888** | ≤ 2,000 both | yes |
| Game, live-like reload | 857 / 1,013 | **528 / 654** | ≤ 700 both | yes (WebKit: one run of three 1,366) |
| Spectate, slow-4G reload | 907 / 1,070 | **548 / 693** | ≤ 900 | yes |
| Spectate, live-like cold | 2,042 / 2,241 | **1,840 / 1,892** | ≤ 2,000 | yes |
| Spectate, live-like reload | 854 / 1,036 | **522 / 670** | ≤ 700 | yes |
| Game, slow-4G cold | 3,750 / 3,776 | 3,304 / 3,383 | (none) | |
| Start match, every link (sat, at once) | 5,371-5,673 / 5,828-6,379 | 5,405-6,079 / 5,693-6,287 | no slower (±10%) | yes: largest +7% (Chromium slow 4G sat, runs 6,123/5,548/6,079); `gameEarly` 0 in every Start row |
| Lobby player list on the game page, live-like reload | 515 / 562 | **843** / 571 | no later | **no in Chromium** (+330 ms, finding 1); the pictures it was there for are not later |
| Its first connection was the early one (`gameEarly`) | 0 | 1 in every game and spectate row | | |

The live site by hand (F-0122-H's last part) is not done: out of reach from here.

**Tests and bites** (RUN):

- Server, `EarlyMatchSocketsTest` (6 tests: a real Netty port, a real database,
  the real runtime with an impostor worker sending a board per seat, the public
  board and a question; sockets opened by hand, so pings and close codes are
  read): F-0122-A and F-0122-B, both seats (HID-003). Bites, each failing:
  the watch address giving a player their seat (1 test), no 4003 (3), `/current`
  reading `resume` (1), the just-ended game not told (1).
  `./gradlew :server:ktlintCheck :server:detekt :server:test`: 887 tests, 0
  failures (62 skipped, as before).
- Page, `earlyGame.test.ts` (13, F-0122-C). Bites, each failing: never handed
  over (8), replay judged at `Date.now()` (1), the 4003 fallback removed (2), the
  early one closed before the own one opens (1), events applied before the hello
  (3), the silence check from the kept time (1).
- Browser, `match-early-connection.spec.ts` (F-0122-D/E/F, TEST-012; in
  `ENGINE_SPEC`): passes in Edge and in WebKit. Logged: a cold page over slow 4G
  and the poor link with its code held 8 s and 12 s drew its table 9.5 s and 13.5 s
  after the early connection became the seat's only one, and the host was never
  told MATCH_PAUSED; leaving such a page before its table: MATCH_PAUSED 14-128 ms
  later; the game ended while loading: the page's own connection 4-258 ms after
  the 4003 (a reconnect would wait 500 ms), then the lobby. Bite: the 4003
  fallback removed fails it (no own connection at all). Deltas gate: 0
  mismatches, 0 resyncs, deltas counted on every page.

- Browser specs, at CI speed (`node ci/ci-speed.mjs`, 4x CPU, Edge), on this
  build: CI machine 5/6 whole (`--whole match-early-connection`: the new spec,
  1.6 min, and match-slow-link among 15 tests) and machine 4/6 whole (`--whole
  match-pause`: match-pause, match-catchup and match.spec among 14), all passed;
  match-deltas and match-watching with their CI neighbours, all passed.
- Lab (worker jar and resources from the stack A image): spectator, concede and
  play-log, each OK; `check-hidden-information.py` over their 7 traces (1,392
  boards) OK; `check-deltas.py` OK (765 sent as deltas, 194 resumes, every board
  rebuilt equal); `as-sent-traces.py` and the hidden check over the as-sent and
  rebuilt boards OK. Self-tests of all three, `check-doc-refs.py`,
  `check-test-switch.py`: OK.
- Frontend: `tsc -b`, `tsc -p tsconfig.e2e.json`, `eslint --max-warnings=0`,
  `prettier --check src e2e tools`, `vitest run`, `vite build`: OK.
- By eye (TEST-011, real app, stack A): the host's table after a reload (own
  hand, both portraits, the step bar, no notice), the guest's second tab, and the
  spectator after a reload (public view, "Spectating RudeLeft vs Pat", no hands);
  each page marked `pa-game-early`. Screenshots in scratch `e12b/shots/`.

**Not done here / owed:** the live site by hand (F-0122-H); Firefox (CI's
engines job runs the new spec); CI's run of the P11-R4 gate on this build
(F-0122-D's CI half).

**For the owner:** the order of the two early connections (finding 1). Example:
Bob presses refresh in Chrome during Alice's turn. With the game's connection
first (as built), his table is back in about 0.53 s instead of 0.86 s, and what comes over
the lobby's connection (who is online, the game chat, invitations) arrives
about a third of a second later than today, after the table; the players'
pictures on the table arrive when they always did. With the lobby's first, Chrome gains
nothing on a refresh (Safari's engine gains either way). Reverting commit
ebfd1fdc gives the lobby-first order.
