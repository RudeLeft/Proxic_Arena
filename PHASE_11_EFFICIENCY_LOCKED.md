# Phase 11 — Efficiency: net code, loading and redraw

**Status: LOCKED and ACTIVE, 2026-11-19.** The owner locked this paper on
2026-11-19 (third draft, after the owner's directions of 2026-11-19: every
page, avatars, every major browser). Its work starts once 1.74.0 (specs
0104-0107, the owner's feedback of 2026-11-19) is released. Any change
from here is a dated amendment (PHASE-002). The measurements behind goal 3
and group F are in `Phase 11 loading and net deep dive.md` (beside the
project folder).

## In plain English

Phase 11 makes the whole app lighter: every page, not only the game. It
has three main goals, and it checks them in every major browser.

**1. The screen redraws only what changed.** When Bob taps one land,
only that land (and anything it really changes, such as his mana) should
be redrawn. Today the page goes through the whole table on every update:
every card, both plates, the hand. It then works out that most of it is
the same. A still table already does no work. A busy moment does several
times more than it needs to.

**2. The game sends only what changed.** Today, every time anything
happens, the server sends each player the **whole game** again. In our
test games that is about 3.4 KB per update on a quiet board, and up to
17 KB on a big one. Combat sends about 9 of those updates in a row, and a
real game has a few hundred. In those test games, only about 7% of what
is sent is new. Nothing is compressed. The plan:
- send only the changes;
- compress what is sent;
- stop re-sending the same history every time;
- make a slow or patchy connection catch up cleanly.

What one player may not see must stay hidden from them, exactly as
today.

**3. Every page opens as fast as it can, and pictures show at once.** On
the owner's PC every page is already quick: 50-140 ms with an empty
cache. Admin, for example, opens in about 120 ms. What players feel is the
distance to the Unraid box, about 150 ms a step from here. Today a page
takes 5 or 6 of those steps one after another before it shows. On a
"slow 4G" link (150 ms, 1.6 Mbit/s), that is 3.3-3.8 s for a first visit
and 1.6-2.2 s even with everything already in the browser. Admin is the
slowest: 3.8 s cold, because it waits for eight lists before it shows
anything. Avatars wait for the lobby connection's list of players, so the
default face shows first and swaps 0.9-2.2 s later. In Chrome the
connection is extra slow to open (about 400 ms live, against 150 ms for a
normal request). Signing in takes 1.2 s on the server. The plan:
- shorten the chain;
- keep each page's data so coming back is instant;
- send avatar names with the page;
- compress and cache properly;
- have the game's code ready before the game starts.

**And in every major browser.** Chrome, Edge, Brave, Opera and Vivaldi
share one engine (Chromium). Firefox and Safari each have their own. The
phase measures all three engines. It also checks the things that differ
by brand: background tabs that are slowed or frozen, privacy shields, and
how pictures are fetched.

All three goals are measured before and after, on the same computer and
the same game or page. Nothing is guessed.

The smaller fixes from the first draft (cards that pop on the other
player's screen, early counts and glows, "Nothing to play" staying up,
the word-pill audit, two 0101 leftovers) stay in the phase, after the two
goals or alongside them. So does the test-reliability work (random
failures, test helpers, checks CI never runs, moments no test game has
dealt yet). The combat speed target from 0096 is now part of goal 1.

The phase ends when:
- the redraw and network targets below are met;
- every page meets its loading targets, and avatars show without a swap,
  in Chromium, Firefox and WebKit;
- a game plays correctly over a slowed, patchy connection;
- a dropped connection catches up to exactly the right table;
- the online tests pass 5 times in a row with no re-run;
- you play a game and accept it.

Card statuses are **Phase 12** (owner, 2026-11-19).

## The owner's brief (2026-11-19)

The phase's two main goals, as the owner confirmed them:

1. **Efficient redraw.** The page redraws only what actually changed. When
   Bob taps one land, only that land, and anything it truly affects, is
   re-rendered and repainted, not the whole table, hand and plates. A
   still table does no work at all. Nothing is recalculated more than once
   per update.
2. **Better net code.** Today the server sends each seat a full game
   snapshot on every update. Instead it sends only what changed (deltas)
   and uses fewer, smaller messages: bursts bundled, data nobody uses
   dropped. It is faster and steadier on slow or patchy links: in order,
   with a clean catch-up after a reconnect. The hidden-information rules
   (HID) still hold: sending less must never send something a seat
   shouldn't see. This covers server to browser. Worker to server is
   looked at too, if it matters.

Added by the owner later on 2026-11-19:

3. **Every page, not just the game.** "Make sure Phase 11 includes all of
   the pages in the efficiency check. For example, when you click on the
   admin page it loads as instantly as possible." It covers net code and
   loading everywhere: sign-in, lobby, room, Deck Depot, Hall, Account,
   Admin (every tab), Status, the game and spectate. The owner asked for
   a true deep dive, widened beyond what he listed.
4. **Avatars load properly.** "I've noticed avatar icons take a few
   seconds to load on Chrome but load instantly on Firefox."
5. **All major browsers.** "Make sure we cover all major browsers. A lot
   of browsers use the same engine, but we need to cover them."

All of these are measured before and after. The old group A (small look fixes)
and group B (reliability: test helpers, flakes, the four Lab scripts, the
e2e type check, Lab coverage) stay in the phase, after or alongside these
two goals. The 0096 combat target folds into goal 1. Already settled and
not in the phase: the Lab `shapes` hang, the Bolt jump flag, the speed
test on the owner's machine, and the glow on an exiled Bolt.

## The rules for the phase

- **P11-R1: nothing a player sees changes without a canvas and
  approval.** A new look, new words, or a look moved somewhere else gets a
  canvas and the owner's decision before it is built. A fix that only
  makes the game show a look that is **already approved** (a card that
  should glide and pops instead) needs a before-and-after clip instead,
  which the owner sees when the item is approved. Redraw and net-code work
  must look **identical**: the jump check and the item's clips prove it.
- **P11-R2: speed changes are measured before and after.** Never
  estimated (EVID-005). The numbers go in the item's As built.
- **P11-R3: a random failure is fixed at its cause, never re-run away.**
  TEST-013.4. Each failure is recorded in ROADMAP's Flakes table with its
  failing line from the CI run, and its cause is found. A raised budget, an
  added wait or a quarantine is allowed only with the cause written down.
- **P11-R4: every change to the update format keeps the HID rules, with a
  gate.** A delta for a seat is made only from what that seat was sent
  before and what it is allowed to see now (its own view, after the
  worker's `HiddenIds` stripping). It is never made from the whole game or
  another seat's view. **Gate, in CI:** for every Lab game and every
  browser game, each seat's and the spectators' views are rebuilt from the
  messages actually sent. The rebuilt view must equal the full view the
  server would have sent, and the existing hidden checks
  (`check-hidden-hands.py`, `check-hidden-log.py`, `check-hidden-tops.py`,
  `check-hidden-mulligans.py`, `check-snapshot-first.py`) must pass over
  it. A delta may name a card id only if the seat's previous view or its
  new view names it. A format change without this gate passing doesn't
  ship.
- **P11-R5: every efficiency change is measured before and after, on the
  same machine and the same scenario.** This covers redraw and network
  alike: renders, layout time, repaints, frame times, JavaScript time,
  bytes and messages. The scenarios are fixed: the match-speed moments
  (idle, hover, cast, combat, end), the bench scenes, and a set list of
  Lab traces for bytes. The machine is named, and each "after" runs at
  least 3 times. A change that makes another measure worse says so and by
  how much. P11-R2 is this rule applied to speed.
- **P11-R6: loading is measured on every page, on fixed links, in every
  engine.** The pages are fixed: sign-in, lobby, room, Deck Depot, Hall,
  Account, Admin and each of its tabs, Status, game and spectate. So are
  the links:
  - **local** (no throttling);
  - **slow 4G** (150 ms round trip, 1.6 Mbit/s);
  - **live-like** (150 ms, 10 Mbit/s);
  - **poor** (300 ms, 1 Mbit/s), with compression on as the live site has
    it.

  Each page gets a cold load (empty cache), a reload (cache full) and an
  in-app visit, first and again. The engines are Playwright's bundled
  Chromium, Firefox and WebKit (never an installed browser, never
  headed). A target holds only when it holds in all three. Times print on
  CI and are enforced off CI, as the speed test's are.
- **P11-R7: nothing slower in any browser.** A change that helps one
  engine and costs another says so, with both numbers. The behaviours a
  brand can change on its own engine (background-tab freezing, privacy
  shields) are on the F3 checklist, checked by hand on each brand before
  acceptance.

Everything in `AGENTS.md` still binds. That includes TEST-011, TEST-012,
TEST-013, HID-001, P10-R1 (nothing jumps), explanations in report windows,
and no window for the player who acted.

## The baseline today (2026-11-19, 1.73.0)

### Redraw (RUN: the 1.73.0 release run's match-speed rows)

The run was the once-per-release local run at 1.73.0 on the owner's PC:
headless Edge, 1920x1080, a table of 31-40 cards. "Renders" counts React
component renders. "Messages" counts every message the match socket
brought, not only game boards. The per-update figures marked * are
derived: the rate times the moment's length (frames ÷ 60), divided by its
messages (INFERENCE).

```text
moment   CPU  frames p95/worst  JS ms/s  renders/s  messages  renders per msg*  GameScreen/msg  plate/msg
idle     1x   16.7 / 16.8          0.7        0        0          -                 -             -
cast     1x   16.7 / 16.8         18.0      691       79         ~59               1.2           1.2
combat   1x   16.8 / 50.0         21.7      740      151         ~43               0.9           1.0
end      1x   33.2 / 49.9          6.6      208       33          -                1.2           1.5
idle     4x   16.8 / 16.8          3.5        0        0          -                 -             -
hover    4x   16.7 / 16.8         16.1     29.5        0          -                 -             -
cast     4x   16.7 / 33.4         41.6      298       85         ~39               0.8           0.8
combat   4x   33.3 / 66.6         61.7      425      168         ~34               0.7           0.8
end      4x   33.3 / 50.0         28.1      187       33          -                1.1           1.3
```

- A still table already does no work: 0 renders and 0 repaints a second
  on both pages. The JS left at idle is the test's own polling.
- The JavaScript numbers swing a lot between runs. This run's combat at 4x
  was 61.7 ms/s. 0096's three runs were 78-84, and its cast runs 65-87,
  against 41.6 here. Part of each figure is the test's own polling (about
  17-20 ms/s at 4x, 0096). So the first job is a measurement steady enough
  to judge a change by.
- Combat at 4x drops frames: p95 33.3 ms (one frame in twenty takes two
  frames' time), worst 66.6.
- Each game message makes React render roughly 34-59 components. Most
  messages change one or two cards.

Where the work goes, read in the code (SOURCE) and from 0096's CPU
profiles:

1. **Every message is read in full, more than once.** `match.ts`
   `asSnapshot` checks the whole snapshot. `GameScreen.tsx`'s `data` memo
   runs `carryMoments`, then `fromSnapshot.ts` `boardFromSnapshot` over
   **every** card, then `keepCards`, which compares **every** card by
   contents (`sameProps.ts` `sameContent`, 6 levels deep) to find the ones
   that didn't change. The work grows with the size of the table, not
   with what changed.
2. **The glide pass after each board.** It is `Board.tsx`'s movement
   `useLayoutEffect`, with `animationsOf` reading the whole table's
   `getAnimations({ subtree: true })`. It took 52-114 ms per moment at 4x,
   a third of it `getAnimations` (0096). It runs on every board, whether a
   card moved or not.
3. **The game screen and plates re-render on most messages.** That's
   0.7-1.2 GameScreen renders and 0.8-1.5 plate renders per message.
   `GameScreen.tsx` is one 6,195-line component, with 60 `useState`, 55
   `useEffect` and 20 `useMemo`. Most of its parts re-render when the
   board changes, whatever changed.
4. **The cards themselves are already kept** (0096: `tableCard` /
   `handCard` drawings by key, memoised `SlotView`, `layout.ts`
   `previousLayout`). That is why only 34-59 components render, not
   hundreds.
5. **Repaints.** 24 looping CSS animations (15 in `battlefield.css`, 9 in
   `game.css`): flyers' bob, the choosable breath, glows. Idle is 0 paints,
   so the loops at rest are cheap. How much of the table is painted per
   update has never been measured: Paint events are counted only at idle.

### Network (RUN: the 1.73.0 Lab traces, 384 games, both seats)

Read from `scratchpad\rel173\traces\*.jsonl` with a read-only script.
These are the **worker's** messages to the server. The server then adds
picture addresses to each card (`MatchArt.kt` `annotate`) before sending
it to the browser. The Lab decks have few or no pictures, so a real game's
messages are somewhat bigger: measuring that is item D1.

```text
snapshot to a player (bytes, compact JSON)   median 3,346-3,430   p95 7,565-7,815   largest 17,604
the same, compressed (deflate)                median 717           p95 1,083          (19% of the bytes)
only what changed (a simple delta)            median 46            p95 926            (7% of the bytes)
snapshots per game (both players)             median 242           p95 518            largest 1,746
boards per combat (one player)                median 9             p95 10             largest 45
boards between two questions (one player)     median 1             p95 4              largest 6
spectator (public) snapshot                   median 1,179         (111 seen; only games with a spectator)
where the bytes are                           hand 35%  battlefield 34%  payments 16%  players 9%  the rest under 2% each
```

- **Each seat gets the whole game on every update.**
  `MatchDecisions.kt` on `WorkerEvent.Snapshot` annotates it, stores it
  (`LiveMatch.snapshotTaken`) and sends it (`MatchHub.snapshot`,
  `snapshotMessage`). Spectators get the public view (`publicView`).
- **The same history is sent over and over.** `payments` carries the last
  24 payment steps on every board. Of the boards that carry any, 87% carry
  exactly the list the board before had (7,237 of 8,299 boards in 120
  games). That is 16% of everything sent. `rolls`, `shuffles`, `notices`
  and the play log are built the same way, as "the last N".
- **No compression.** `Application.kt` installs `WebSockets` with ping,
  timeout and frame-size limits, but no `WebSocketDeflateExtension`
  (permessage-deflate is off).
- **Order.** One socket per page. The server sends in order: `tell` in
  `MatchDecisions.kt` sends each message with `runBlocking` on the worker's
  reading thread, so messages leave in the order the worker made them. The
  page drops a board older than the one it has (`match.ts`, the
  `MATCH_SNAPSHOT` case: `stateRevision` within a `gameEpoch`).
- **Reconnect.** The page retries after 0.5, 1, 2, 4, then every 8 s
  (`match.ts` `MATCH_RECONNECT_DELAYS`), showing "Reconnecting to the
  game…". The server then sends hello, the stored latest board with the
  whole play log, and the open question (`MatchSocket.kt`;
  `LiveMatch.snapshotFor`). Boards missed while away are not sent: only
  the latest. That is fine for full boards, but their one-time moments
  (a shield used, a card dying) are lost. A delta design must keep the
  same "full board on join" step.
- **A slow player may slow the game for both** (INFERENCE, to verify
  first in D6). Because `tell` blocks the worker's reading thread until a
  message is handed to the socket, a connection that stops taking
  messages can hold up the reading of the worker's output. Ktor's outgoing
  queue is small.
- **Worker to server.** These are lines of JSON on a local pipe
  (`MatchWorker.kt` `startPump`), about 506 messages per game (median):
  boards for each seat (and the public view when watched), questions, log
  lines. The server reads each board, adds pictures and writes it out
  again. It is local, so bytes don't matter there. Server CPU might: D1
  measures it before anything changes.

### Loading, every page (RUN: 2026-11-19, bundled Chromium 156, local stack at 1.73.0)

From `Phase 11 loading and net deep dive.md`, which has the full tables,
the method and the raw files. The times are milliseconds to usable: the
page's heading and list on screen, and "Connected" up. For the game, they
are to the life totals and the hand. One run each, in Chromium.

**Per engine (RUN, later on 2026-11-19).** WebKit 27.2 (bundled) is
measured locally (no link emulation; CDP is Chromium-only). Firefox
(`firefox-1555`) is installed but **won't start on this PC**: Windows
reports a side-by-side error, the missing Visual C++ runtime that
`playwright.config.ts` already notes. So Firefox is unmeasured (F1,
decision 11). WebKit-on-Windows is 2.5-8x slower than Chromium on every
page, with the same requests, the same chain and the same 1.2 s sign-in.
It's Playwright's Windows build, not Safari, so its absolute times aren't
a Safari prediction.

```text
local, ms     cold   reload  in-app 1st/again    | WebKit: cold   reload  in-app 1st/again
sign-in         50      31        -              |          123      95        -
lobby          125      49     69 / 75           |          377     325    209 / 152
Hall           140     122    109 / 95           |          394     387    351 / 220
Deck Depot     121      50     53 / 64           |          396     310    253 / 191
Account        121      90     54 / 47           |          864     895    320 / 213
Admin          118      49     42 / 72           |          966     249    218 / 162
Admin tab click   13-52                          |             114-148
Status          62      42        -              |          439     262        -
```

```text
page            cold local  reload local  in-app 1st/again local  cold slow4G  reload slow4G  in-app 1st/again slow4G
sign-in               50          31              -                  1,445        1,424            -
sign-in click       1,453          -              -                  4,650          -              -
lobby                125          49          69 / 75                3,268        1,839          66 / 67
room                 131         141              -                  1,872*       1,361*           -
Hall                 140         122         109 / 95                3,278        2,240         865 / 330
Deck Depot           121          50          53 / 64                3,274        1,839         536 / 253
Account              121          90          54 / 47                3,256        1,608         344 / 42
Admin                118          49          42 / 72                3,782        1,617         863 / 63
Admin, a tab     100-134           -     tab click 13-52         3,312-3,351        -       tab click 13-27
Status                62          42              -                  2,254        1,630            -
game                 237          80              -                  2,889*       1,374*           -
spectate             234          88              -                  2,916*       1,357*           -
* live-like link (150 ms, 10 Mbit/s)
```

- **The distance, not the server.** Server times are 4-69 ms for every
  API call except sign-in: `/api/auth/login` **1,178-1,232 ms**, where
  `PasswordHasher` was benchmarked at 99 ms. Live, a request from the
  owner's PC takes 147-249 ms (`/api/auth/me`, live site, Chromium).
- **The chain.** A page shows only after 5-6 steps in a row: index.html,
  the entry code, `/api/auth/me` (`AuthContext`), the shell's code
  (`routes.tsx` `Shell`), the page's code, then the page's data. The
  lobby socket comes last (`LobbyConnection.tsx`
  `LobbyConnectionProvider`). First paint is at 1.4 s on slow 4G; usable
  at 1.6-2.2 s even from cache.
- **Admin** reads 8 lists with one `Promise.all` (`AdminPage.tsx`
  `refresh`), shows nothing until all 8 are in, re-reads all 8 on every
  visit and every `REFRESH_MS` (30 s), hidden or not: about 76 KB each
  time. Every tab opened by address loads all 8.
- **Avatars** get their name only from the user socket's `PLAYERS`
  (`lobbyView.ts` `avatarOf`). Where a page draws a person from its own
  data first (Hall, Admin, shares), `default.svg` shows, then swaps.
  Real avatars appear:
  - 0.9 s after a reload and 1.4-2.2 s cold on a 150 ms link;
  - 3-7 s on a poor link.

  Live, the socket takes about 3 requests' time to open in **both**
  engines:
  - Chromium 378-441 ms;
  - WebKit 423-474 ms;
  - against 148-187 ms per request.

  It never shares the page's connection. HTTP/3 isn't the cause: WebKit
  stayed on HTTP/2 and paid the same. On Account, Chromium and WebKit
  both fetch all 132 lazy avatars (773-794 KB); on slow 4G the last
  arrives at 5.2-5.6 s. Spec 0060's retry never fired: 0 image errors in
  32 loads across both engines.
- **Bytes.**
  - Our server compresses nothing (`Application.kt`: no `Compression`).
  - The sign-in files carry no Cache-Control and no validator
    (`SignedInGate.kt` `keepOnlySuccesses` sets it only for signed-in
    files), so locally they are re-fetched on every reload. Live,
    Cloudflare adds `max-age` and compresses (zstd).
  - Every signed-in file is `private`, so each player's first visit after
    an update pulls it all up the home connection uncompressed: the game
    page is 1.05 MB JS + 243 KB CSS, about 360 KB compressed. 145 KB of
    the board's JS is inlined PNGs.
  - Card pictures average 57 KB (JPEG, 384 px). WebP would be 41 KB, AVIF
    28 KB (RUN, 60 pictures).
- **Repeat fetches.** 50 page changes made 151 API calls: nothing is kept
  between visits. `/api/hall` and `/api/matches/watch` are each fetched
  twice per load.
- **Sockets outside the game.** At rest, one 15-byte PING every 20 s
  (`lobby.ts` `PING_MS`) and `/api/version` once a minute. Joining sends
  6-7 messages, about 2.7-3.4 KB. Full PLAYERS, ROOMS and STANDINGS lists
  go to everybody on each change. STANDINGS is recomputed from every game
  ever finished (`StandingsSource.standings` → `HallGameSource.hall`) on
  each connection and each game end.
- **Hidden tabs.** The lobby's liveness check runs on a JS timer
  (`connectLobby`, `QUIET_MS` 45 s). Chromium slows a hidden tab's timers
  to once a minute after 5 minutes. Chrome, Edge, Brave, Opera, Vivaldi
  and Safari can freeze background tabs outright. That affects the lobby
  socket and the hard pause's 2 s / 5 s heartbeat (INFERENCE, to test in
  E13/F3).

## Items

**Size:** S = small; M = a normal spec; L = several builds, or research
before the fix is known. **Risk:** what could go wrong, and how it is
guarded. **Canvas:** goals 1 and 2 change nothing a player sees ("no"),
and are proven identical by the jump check and clips. The order column is
the recommended order across all groups.

### Goal 1 — efficient redraw (C)

| # | Today (measured or read) | Target | Size | Risk | Order |
|---|---|---|---|---|---|
| P11-C1 | **A steady measure of redraw.** match-speed gives renders and JS per moment, but JS swings 62-84 ms/s for combat at 4x between runs, the test's polling is mixed in, and there's no layout or paint time per update. | Per update, and stable to ±10% over 3 runs: component renders, GameScreen and plate renders, time in our code (minus the test's polling), style + layout time, paint count and painted area, frames p95/worst. Run at 1x and 4x over the fixed moments, plus a "tap one land" moment and a 40-a-side bench scene. Numbers in a file each run can be compared with. | M | none for players (test only); keep CI's "print, don't enforce" for times | 1 |
| P11-C2 | **Each update is read in full.** `asSnapshot`, `carryMoments`, `boardFromSnapshot` over every card, then `keepCards` compares every card to find the unchanged ones. | Work grows with what changed, not the table's size. A card nothing happened to is the **same object** from the socket onward (shared by the delta step, D4), so nothing re-derives or re-compares it. Each card derived once per update. | L | the moves and one-time moments read from two boards (`fromSnapshot.ts` departures, `carry.ts`); 0096's kept-card tests and the jump check guard it | 6 |
| P11-C3 | **The glide pass runs on every board** (`Board.tsx` movement `useLayoutEffect`): 52-114 ms per moment at 4x, a third `getAnimations` over the whole table. | Runs only for cards whose place, side or form changed. Nothing when no card moved. Glide pass ≤ 2 ms per update at 4x when one card moves. | M | a missed glide means a jump: the jump check over all Lab games | 7 |
| P11-C4 | **The game screen re-renders on most updates:** GameScreen 0.7-1.2 and each plate 0.8-1.5 per message; one 6,195-line component. | A board update renders only the parts whose data changed: a plate only when its player's entry changed, the step ladder only on a step, the act button only when its question or state changed. GameScreen ≤ 1 render per update, plates 0 when unchanged. **Tapping one land:** ≤ 10 component renders (today about 34-59 per update). | L | a part that stops updating when it should: page tests per part; TEST-012 games | 8 |
| P11-C5 | **Repaints per update unmeasured.** 24 looping CSS animations. Idle is 0 paints (good). How much is repainted when one card changes is unknown. | Tapping one land repaints only that land's area, plus the mana or count that changed (painted area within the land's box, plus the plate). Idle stays at 0 paints. Busy boards (B2) are measured here too. | M | a fix may need layers (`will-change`) that cost GPU memory; measure both | 9 |
| P11-C6 | **The 0096 target** (was B1). Combat at 4x 61.7-84 ms/s against 70; cast 41.6-87 against 80. The speed test's 4x limits are loosened to cast 100, combat 88 and enforced only off CI (`match-speed.spec.ts` `SPEED_BUDGETS`, `TIMINGS_ENFORCED`). | `scriptMsPerSecond4x` back to **cast 80, combat 70**, passing 3 runs in a row on the fixed machine. Frames at 4x: cast and combat p95 ≤ 16.8 ms, worst ≤ 50. | (the result of C2-C5) | none beyond C2-C5 | 10 |

### Goal 2 — better net code (D)

| # | Today (measured or read) | Target | Size | Risk | Order |
|---|---|---|---|---|---|
| P11-D1 | **A measure of what goes over the wire.** Only the worker's side is measured (Lab traces). Picture addresses added by the server aren't counted, nor messages per second in a real game, nor server time per board. | Per seat, from the browser's side in real games (match-speed, plus a byte counter): bytes per update (median, p95), bytes per game, messages per second in a combat, server time per board. A fixed set of Lab traces for bytes before and after each change. | S | none (measuring) | 2 |
| P11-D2 | **No compression.** Median board 3.4 KB, 0.7 KB compressed (19%). | permessage-deflate on (Ktor `WebSocketDeflateExtension`), checked through the Unraid proxy. Bytes on the wire per board about a fifth of today. Server CPU per board measured (P11-R5). | S | the proxy dropping the extension (then nothing changes, safely); CPU cost; nothing secret shares a seat's stream, because hidden cards are removed before sending (HID-001) | 3 |
| P11-D3 | **History re-sent on every board.** `payments` (16% of bytes) is the same as the board before on 87% of boards that carry it; `rolls`, `shuffles`, `notices`, play log likewise "the last N". | Each history entry is sent **once**, when it is new; the page keeps the list. A page joining or reconnecting gets the whole list once. Bytes per board about -16% before deltas. | M | a page that missed an entry (reconnect): the full board on join carries the lists; tests that read the lists off full snapshots (`match-dice`, the hidden checks) | 4 |
| P11-D4 | **The whole board every time.** Median 3.4 KB; a simple delta would be 46 bytes (p95 926), 7% of today. | `MATCH_DELTA`: {game, from revision, to revision, the changes}, made on the server for each seat from the board **that seat** was last sent (after pictures), per P11-R4. The page applies it in `match.ts` to rebuild the full board, keeping the same object for every unchanged card (this feeds C2). A full board on join, reconnect, a new game (restart) and resync. If the page's revision isn't the delta's "from", it asks for a full board. Spectators the same, on the public view (owner decision 2). Median bytes per update ≤ 10% of today's full board. | L | **hidden information** (P11-R4's gate); **desync** (the rebuilt board must equal the full one, checked in CI; a test-only switch can send both and compare); browser tests that read `MATCH_SNAPSHOT` frames or route the socket (`match-dice`, `match-modes-doing`, `match-ability-menu`, `match-status-list`, `match-session`, `match-record`, `notices`, `production`) and the jump tool, which replays full boards; page tests that feed full snapshots (they keep working if the page still takes full boards) | 5 |
| P11-D5 | **Bursts.** A combat is about 9 boards in a row for each player (p95 10, up to 45). A question comes with 1-4 boards. Each is its own message. | Messages the worker makes in one go (boards plus the question they lead to) leave as **one** message. Messages per combat about halved (measured in D1 first). Each board is still drawn, so no one-time moment is lost (the `carry.ts` lesson). | M | bundling must never merge away a board whose moments matter: carry them, as `carryMoments` does | 11 |
| P11-D6 | **Slow and patchy links.** Never tested. A slow player may hold up the worker's reading thread (`MatchDecisions.kt` `tell` blocks on the send; INFERENCE, verify first). Reconnect sends only the latest board. | A slow connection never slows the other player or the game. Each connection gets its own queue. A seat that falls far behind is sent one full board to catch up, not every delta. Proven in browser tests with a throttled link (Chrome's network emulation: for example 1 Mbit/s, 300 ms delay, and two drops in one game). Both pages end on the server's board exactly. | M | catching up skips one-time moments: the same carry as a held board (A1); the owner decides what a lagging player sees (decision 3) | 12 |
| P11-D7 | **Worker to server.** A local pipe, about 506 messages per game; each board parsed, annotated and written again by the server. | Looked at only if D1 shows server time per board matters (for example a token-heavy game). Otherwise recorded as measured and closed. | S | none | 13 |

### Goal 3 — loading and net efficiency across the app (E)

Times are on slow 4G (150 ms, 1.6 Mbit/s) unless marked. "Today" is the
2026-11-19 Chromium measurement. Each item is re-measured in Firefox and
WebKit before it starts (F1) and after it lands (P11-R6). The order is the
step in "Recommended order".

| # | Today (measured or read) | Target | Size | Risk | Order |
|---|---|---|---|---|---|
| P11-E1 | **A steady measure of loading.** None in the repo. The 2026-11-19 scratch kit (pages, avatars, room/game/spectate) uses CDP, so it is Chromium-only. | A browser spec over every page × cold, reload, in-app first and again × the fixed links, in Chromium, Firefox and WebKit (`request.sizes()` where CDP is missing). It records usable time, first paint, images done, requests, bytes, the slowest requests, chunks, API server time and socket frames. Numbers go to a file each run can be compared with. Steady to ±10% over 3 runs. | M | none for players; must not use the shared test accounts while a game spec runs | step 1 |
| P11-E2 | **Avatars wait for the socket** (`avatarOf` ← `PLAYERS`); a page that draws a person from its own data first shows the default face, then swaps. Real avatar at 0.9 s (reload) / 1.4-2.2 s (cold) on 150 ms, 3-7 s on poor (Chromium). Live socket open 378-474 ms in Chromium and WebKit vs 148-187 per request. Account fetches all 132 in Chromium and WebKit (773-794 KB, last at 5.2-5.6 s on slow 4G). Firefox unmeasured (it won't start here). | Avatar names come with the data that names the person (`/api/auth/me`, `/api/hall`, admin and share lists), plus a kept player list for the tab. An empty circle, not the default face, while unknown. The Account picker loads what's on screen first. **0 swaps for a player with an avatar; real avatar ≤ 100 ms after its row is drawn (reload, in-app), ≤ 300 ms after usable (cold); Account: on-screen avatars ≤ 500 ms, ≤ 40 fetched up front.** All three engines. | M | a stale kept list showing an old avatar: the socket's list still wins when it lands; an empty circle is a look change → canvas (P11-R1) | step 3 |
| P11-E3 | **Sign-in files and index.html have no cache rules:** hashed sign-in files carry no Cache-Control or validator; index.html is `no-cache` with no ETag. Locally 297 KB is re-fetched per reload; live leans on Cloudflare adding `max-age`. | Hashed sign-in files `public, max-age=31536000, immutable`; index.html `no-cache` with an ETag (304 when unchanged). Reload of sign-in: 0 bytes of code fetched. | S | a stale index.html after an update: keep `no-cache`; `updateReload` already reloads an open page once | step 2 |
| P11-E4 | **Nothing compressed by our server** (no Ktor `Compression`). First visit after an update: game page 1.5 MB, lobby 0.5 MB, uncompressed up the home connection. | gzip/br for JS, CSS, JSON, SVG and HTML (not WebP/JPEG/woff2). Game page's first visit ≤ 500 KB transferred, lobby ≤ 200 KB. Server CPU per request measured (P11-R5). | S | CPU on the Unraid box; a secret next to attacker-chosen text in one compressed body (BREACH): no response mixes the two today; checked per route | step 2 |
| P11-E5 | **The start-up chain:** 5-6 steps in a row before usable. Reload usable 1.6-2.2 s on slow 4G, first paint 1.4 s; cold 3.3-3.8 s. | With a session hint, the shell's and the route's code and the lobby socket start beside `/api/auth/me`. The page's data starts beside its code, not after it. **Every signed-in page usable ≤ 900 ms on a slow-4G reload, ≤ 2.0 s cold.** | M | a stranger must still get only the sign-in files (owner 2026-10-24): the extra fetches are refused without a session and cost nothing; a wrong page flashing before sign-in → none, the page still waits for "who am I" before drawing | step 4 |
| P11-E6 | **The game's code arrives with the game:** 1.05 MB JS + 243 KB CSS (≈360 KB compressed), 30 base64 PNGs (145 KB) inside the board chunk. Game cold 2.9 s at 150 ms/10 Mbit. | The game's code is prefetched while a player sits in a room. Mana pictures become files (cached, in parallel). **The game table is usable ≤ 1.0 s after "Start match" on the live-like link with the code prefetched, ≤ 2.0 s cold.** | M | prefetch wasted on a player who never starts a game (bytes only, once per update) | step 6 |
| P11-E7 | **Admin:** 3.8 s cold, 863 ms first header click, waits for all 8 lists (`Promise.all`), re-reads 8 lists (~76 KB) per visit and every 30 s, hidden or not (~9 MB an hour). Sign-ins list 22.5 KB in one go. | Each panel draws as its list lands. Only the open tab's list, plus a small counts call. Lists kept between visits and refreshed behind. No refresh while the tab is hidden; Sign-ins and Games paged. **Admin first click ≤ 300 ms, revisit ≤ 100 ms (data on screen), cold ≤ 2.0 s, tab click ≤ 50 ms, 0 requests while hidden.** | M | a count shown stale for a moment: the refresh behind it corrects it; admin actions still re-read after acting | step 5 |
| P11-E8 | **Pages forget their data:** Hall, Deck Depot, Account, lobby re-fetch on every visit (151 API calls in 50 page changes); Hall revisit 330 ms, Decks 253 ms. | Each page's data kept for the tab and drawn at once on a revisit, then refreshed behind. **In-app revisit of any page ≤ 100 ms usable on any link.** | M | showing stale data: refresh on every visit and on the socket's change messages | step 5 |
| P11-E9 | **Sign-in takes 1.2 s on the server** (`/api/auth/login` 1,178-1,232 ms; Argon2id 64 MB, t=3 benchmarked at 99 ms). | Cause found first (CPU limit? rehash? JIT? the timing dummy?), then **≤ 300 ms server time on the Unraid box** without weakening the hash below OWASP's floor. Sign-in click → lobby usable ≤ 600 ms local. | S-M | weakening the password hash: not allowed; the fix is the cause, not fewer passes (owner decides if the cause is the cost itself) | step 2 |
| P11-E10 | **Lobby lists on the server:** STANDINGS recomputed from every finished game per connection and per game end; PLAYERS and ROOMS sent whole to everyone on each change. Tiny today (2.7 KB on join), grows with every game. | Hall and standings kept in memory, invalidated on a game end, belt reset or account change. Socket join time measured; lists sent as changes only if D1-style counts show it matters. | S-M | a stale standing: invalidation tested on each of the three triggers | step 7 |
| P11-E11 | **Card pictures:** display JPEG 384 px, avg 57 KB; WebP q80 41 KB (-28%), AVIF 28 KB (-52%) on 60 stored pictures. `private`, so every first view crosses the home uplink. | A lighter format (owner decision 8), made once at import; the close-up likewise. Bytes per picture measured on a real deck. The look is identical by eye at the table and in the close-up. | M | a re-encode pass over stored pictures; Deck Builder sends JPEG/PNG and keeps doing so; old addresses keep working (0052) | step 8 |
| P11-E12 | **The socket's separate connection, in Chromium and WebKit:** live socket open 378-441 ms (Chromium) and 423-474 ms (WebKit, HTTP/2 only) vs 148-187 ms per request. The page's connection is never shared. The game page opens two sockets (user + match). | Researched first: whether Cloudflare can offer WebSocket over HTTP/2 (RFC 8441) for Chromium, whether Firefox already uses it (F1), and one socket for lobby and game. Target set from the research. | L (research) | protocol change → its own spec (like D4) | step 9 |
| P11-E13 | **Hidden tabs:** lobby liveness on a JS timer (`PING_MS` 20 s, `QUIET_MS` 45 s) that Chromium slows to once a minute after 5 min hidden; tab freezing (Edge sleeping tabs, Chrome Memory/Energy Saver, Brave, Opera, Vivaldi, Safari) untested. | **A tab hidden 10 minutes keeps its lobby socket with no reconnect, in all three engines.** Liveness comes from what a hidden tab can still do. The hard pause's heartbeat is designed for it (owner decision 7). Each brand checked by hand (F3). | M | a frozen tab treated as present could stall a game; as absent, it pauses one: decision 7 | step 3 |
| P11-E14 | **Fonts declared twice:** the project's Barlow Condensed (`styles.css`) plus `@fontsource/barlow-condensed` (`shell/base.css`, `Board.tsx`): 18 extra font files built, duplicate `@font-face`. | One set. The two fonts every page uses preloaded. No change to how text looks (screenshot compare). | S | a weight falling back: screenshot compare of every page | step 2 |
| P11-E15 | **Long sessions:** heap not measurable with `performance.memory` (rounded to 10 MB); 8 page timers, none paused when hidden except the flyers. | A 30-minute lobby session and 3 games in a row, heap measured through CDP: no growth after the first game beyond a set margin; every timer paused or slowed in a hidden tab. | M | none (measuring first) | step 7 |
| P11-E16 | **Repeat and duplicate fetches:** `/api/hall` twice per Hall load, `/api/matches/watch` twice per spectate load, `/api/version` on every page plus every minute. | Each fetched once per load. Version check only on the minute and on focus. | S | none | step 2 |
| P11-E17 | **API answers carry no cache rule** (no Cache-Control on any `/api` JSON). | `/api` JSON says `private, no-store` (nothing personal kept by a shared cache), or an ETag where a list is big and revisited (admin lists). | S | none | step 2 |

### Group F — every major browser

| # | Today | Target | Size | Order |
|---|---|---|---|---|
| P11-F1 | **Only Chromium is tested in CI;** locally Edge. Playwright's Firefox and WebKit were installed 2026-11-19 (owner's yes). WebKit runs and is measured. Firefox **won't start on this PC**: a side-by-side error from the missing Visual C++ runtime (decision 11). The Chrome-vs-Firefox avatar gap is unmeasured on Firefox. | Firefox running locally (decision 11) and on CI's Linux runner; WebKit on CI. The avatar comparison is run in all three first, and its cause is confirmed per engine. CI runs a smoke set (sign-in, every page loads, one short game, spectate) plus the E1 loading subset on Firefox and WebKit, next to the full Chromium suite. | M | step 1 |
| P11-F2 | **Branded browsers are never checked.** Brave, Opera and Vivaldi share Chromium but have their own shields, savers and settings. Edge has sleeping tabs and tracking prevention. Firefox has ETP. Safari has ITP and 7-day storage. | A one-page hand checklist per brand, before acceptance: sign in, lobby avatars, every page, a short game, a tab hidden 10 minutes then back, spectate. The brands are Chrome, Edge, Brave (Shields on), Opera, Vivaldi, Firefox (ETP strict) and Safari on a Mac or iPhone if the owner has one. Results recorded with versions. | S | before the play-through |
| P11-F3 | **What a brand changes on its engine is unlisted.** | One table in the phase evidence: hidden-tab timers and freezing, WebSocket over HTTP/2 or HTTP/3, lazy-loading distance, image cache across reloads, cache heuristics, tracking protection, storage limits, AVIF/WebP, fonts, `fetchpriority`/`modulepreload`. Each row says how Proxic is affected and which test proves it (start: the deep dive's table). | S | step 1 |
| P11-F4 | **No support list for browsers.** UI-006 sets screens only. | The owner's choice (decision 9) written into AGENTS beside UI-006. Supported browsers are tested in CI; best-effort ones are checked by hand. | S | step 1 |

### Group A — small things that still look wrong (from the first draft)

| # | What's wrong today | Size | Canvas | Order |
|---|---|---|---|---|
| P11-A1 | **The other player's screen misses moves while a spell is held up to be shown** (`GameScreen.tsx` `HOLD_MS`, 1.5 s). Boards arriving meanwhile are never drawn. `carry.ts` `carryMoments` carries their shields, phasing, flickers, damage and life, but not their other moves. So a death or discard then can pop, and its pile number isn't held. Pairs naturally with D5/D6, which need the same carry. | M | clip | 14 |
| P11-A2 | **The Library number drops on a draw before the card reaches the hand** (spec 0099 "Left open"). | S | yes (small) | 15 (with A3) |
| P11-A3 | **A Graveyard or Exile tile's "you can play this" glow comes on early,** as the board arrives (0099 "Risks"). | S | clip | 15 |
| P11-A4 | **"Nothing to play" can stay after it stops being true.** The worker decides it once, at your first main phase (`PriorityStops.java` `passedTurn`), and keeps it all turn (`passingFor`; page `passingOf`). Find the clip first. | S | yes if words change | 16 (with A5) |
| P11-A5 | **Audit of leftover word pills and top notices** (owner, 2026-11-12). 0075 and 0097 moved many; one list of what's left, each with a canvas into the report window or kept with a reason. | M | yes | 16 |
| P11-A6 | **0101's leftovers:** menace's pop on a refused single blocker (the refusal never reaches the combat result); a "prevent the next N" badge on a player (sent, never drawn). | S | yes | 17 |
| P11-A7 | **A countered copy of a trigger vanishes in one frame** (owner, 2026-11-21, from the 1.75.0 jump check: `no-target-slayer`, board 47, both seats). Bob's Stifle counters the copy of Slayer of the Wicked's trigger that Strionic Resonator made; the copy's stack card is gone the next frame while a countered spell leaves with its animation. Give it the same leave. Contact sheet: the 1.75.0 release run's `slayer-sheet.jpg`. | S | clip | 17 (with A6) |
| P11-A8 | **A spell cast from the graveyard or exile with nothing to target gives no reason** (straggler 32, found building 0108). It is no longer offered, but there's no "Not now" line for it; reasons exist only for hand cards and abilities of permanents. | S | yes (small) | 17 |
| P11-A9 | **A counterspell with nothing to counter is still offered and rolls back silently** (straggler 33): Forge's hasCandidates says yes for stack targets. Check it against spec 0116 (a stack spell offered once) before building. | S | yes (small) | 17 |

### Group B — reliability (from the first draft; B1 is now C6)

| # | What's wrong today | Size | Order |
|---|---|---|---|
| P11-B2 | **Calmer very busy boards** (deep dive 3 B11): only flyers past 12 go into step (0090 `FLY_SYNC_AT`). A 40-a-side board has never been measured. Measured in C1/C5; calmed on a canvas only if it stutters. | M | with C5 |
| P11-B3 | **The open flakes:** six Open rows in ROADMAP's table. They are the admin page tests, the speed test's game-end frame, Lab `unreachable` (ante), the 0089 poison screen test, the server's `DeckBuilderApiTest` picture test, and `match-outcomes`' shield. There is also the 1.72.0 Leyline one-off, which isn't in the table yet. | M | alongside C1-D3 |
| P11-B4 | **Four Lab scripts never run in CI:** check-card-owner, check-hidden-information, check-semantic-choices, check-x-announcement. Only the first takes CI's trace argument. Add each or retire it with a reason. check-hidden-information matters more now: it's a candidate for P11-R4's gate. | S | before D4 |
| P11-B5 | **Browser-test type errors not gated:** `tsc -p tsconfig.e2e.json` gives 7 errors today (RUN at 3370c75): `admin.spec.ts` 3, `device-link.spec.ts` 2, and two page files lacking Vite's types. Fix them and add the check to CI. | S | first |
| P11-B6 | **Moments never seen live.** Partly covered already (fetch lands, crew, energy, becoming monarch, suspend, Banishing Light, Uro). Nothing deals a Class or a Treasure token, or passes the monarch. Own casts from a graveyard or exile have never been clicked. Count the traces, add Lab games, one real-click game. | M | last, before the play-through |
| P11-B7 | **Browser tests robust by default:** `hitPoint` is copied in two specs, `settle` lives only in `match-speed`, and 10 specs click by raw position; 6 fix commits for CI-only timing since 2026-11-15. One shared `hitPoint`/clamp and `settle` in `e2e/match-helpers.ts`, and a CI-speed local run (CPU slowed, in shard order) before a new spec is committed. D6's throttled-link tests build on it. | M | second |
| P11-B8 | **0109's reveal guard has no failing Lab scenario** (straggler 34): `ActionReports.quiet` (test 3, `Causes.revealedNow`) is unproven by any game, since no corpus card bounces, returns or counters while revealing. Name a card and add a Lab game (HID-004). | S | with B4 |
| P11-B9 | **Documentation tidy-up** (stragglers 27, 29): stale code comments (TestDeals.kt, WorkerMain `--lab-deal`, the Dockerfile/pom "two checks", Application.kt `/ws/system`, stepAside "is casting", the notifyOfValue Javadoc, QuestionWindows "seat 2", PackageInspector `isUnsafePath`, DeckRoutes); troubleshooting: DECK_IMPORT lacks five refusal codes, MATCH_RUNTIME's "No game yet" entry is dead, FOUNDATION's database health log shows only the error's class name. Then, as the phase's last item, the **documentation audit** (paused after pass 10) runs again until a pass finds nothing (owner 2026-11-21). | S | last |

### Recommended order

(Third draft: goal 3 and group F folded in as "steps". The E and F
tables' Order column names these steps. The C and D order numbers above
keep their relative order.)

1. **B5, then B7** (quick, and they steady every later test), with **C1 +
   D1 + E1**, the measuring kit for all three goals, and **F1, F3, F4**:
   three engines installed, the brand table, the support list. Nothing
   changes until today is measured in all three engines (P11-R5, P11-R6).
2. **D2**, compression on the game socket: the quickest big saving, small
   risk. Beside it, the quick loading wins: **E3** (cache rules), **E4**
   (HTTP compression), **E9** (sign-in's 1.2 s, cause first), **E14**
   (fonts), **E16** (duplicate fetches), **E17** (API cache rules).
3. **E2**, avatars without the socket (the owner's report), with **E13**,
   hidden tabs. E13 must be settled before the hard pause is built.
4. **D3**, history sent once: smaller boards before deltas, and it
   simplifies D4. Beside it, **E5**, the start-up chain.
5. **B4** (the hidden-information script into CI), then **D4**, deltas,
   with P11-R4's gate built first. Beside it, **E7** (Admin at once) and
   **E8** (pages keep their data).
6. **C2, C3, C4**: redraw, using D4's shared unchanged cards. Then **C5**
   (repaints, with B2's busy board) and **C6** (the 80/70 budgets).
   Beside them, **E6**: the game's code before the game.
7. **D5, D6**: bundles, slow links and reconnect, with **A1** (the same
   "don't lose a skipped board's moments" problem). Beside them, **E10**
   (standings cached) and **E15** (long sessions).
8. **D7** only if D1 says so. **E11**, lighter pictures, once the owner
   chooses the format.
9. **E12**, research into one socket, last of the goal work.
10. **A2+A3, A5 with A4, A6**: the small look fixes. Their canvases can be
    drawn while goal work is building.
11. **B3** alongside, as flakes turn up. **F2** (the hand checklist on
    each brand) and **B6** last, right before the play-through.

## How work runs

- **Design canvases** live outside the code folder since 2026-11-21 (owner): `Claude Working Folder/Proxic canvases/`. Older specs that name `frontend/zz-canvas/<file>` mean the same file there.
- **The lean build brief** (owner, 2026-11-15; TEST-012/013). Per item:
  - the touched Lab scripts three times, and the hidden checks over their
    traces;
  - the touched browser specs, and one real-click game when a player
    clicks something new;
  - tsc, eslint, prettier and vitest, plus the worker or server gates if
    touched.

  Full suites run on CI on every push, and locally once per release. Use
  fresh agents per build and per verify. Don't push while a main CI run
  is going.
- **A new or changed browser spec runs at CI speed before it is
  committed** (P11-B7): `node ci/ci-speed.mjs <spec>` -- CPU slowed 4x,
  after its CI machine neighbour (docs/operations/UPDATING.md).
- **One item at a time.** Visible items become feature specs (from 0104;
  fetch first, the checkout is shared). Goal items that change no look are
  maintenance under "Current work" with a dated As built amendment here.
  The exception is D4 (a protocol change: `protocol/README.md`), which
  gets a full spec and the owner's approval of its decisions.
- **Every goal item states its before-and-after** (P11-R5): which
  scenario, which machine, 3 runs after. Its As built shows the numbers
  next to the target.
- **Looks identical:** every C and D item runs the jump check over the
  traces it touches and one normal-speed clip of a busy moment, compared
  by eye with the same moment before.
- **Questions for the owner** go as prompts (ESC-001), in plain English
  with a game example.

## Exit gate

Phase 11 passes when all of these hold:

1. **Every item decided and built,** each with its As built and evidence.
   Only the owner drops an item, with the reason recorded.
2. **Redraw targets** (C1's harness, fixed machine, 3 runs in a row, 1x
   and 4x):
   - tapping one land: ≤ 10 component renders and a repaint within that
     land and its plate;
   - GameScreen ≤ 1 render per update;
   - plates 0 renders when their player didn't change;
   - the glide pass ≤ 2 ms when one card moves at 4x;
   - idle 0 renders and 0 paints;
   - cast and combat frames p95 ≤ 16.8 ms and worst ≤ 50 ms at 4x;
   - `scriptMsPerSecond4x` **cast 80, combat 70**, enforced and passing.
3. **Network targets** (D1's measure, same Lab traces and real games):
   - median bytes per update per seat ≤ 10% of today's full board (3.4 KB
     before compression);
   - permessage-deflate on through the production proxy;
   - history sent once;
   - messages per combat measured and reduced (D5's target);
   - server time per board not worse than today.
4. **Hidden information holds (P11-R4):** the rebuild-and-compare gate and
   the hidden checks pass in CI over every Lab game and browser game, for
   both seats and spectators.
5. **Slow and patchy links proven:** a browser game over a throttled link
   (about 1 Mbit/s, 300 ms delay) with two dropped connections finishes.
   After each drop, both pages are back on exactly the server's board
   (catch-up proven). A forced resync (a delta that doesn't fit) recovers
   the same way. The other player's game never slows because one link is
   slow.
6. **Looks identical:** the jump check passes on every Lab game at the
   release.
6a. **Loading targets, every page** (E1's harness, P11-R6). Each target
    holds in Chromium, Firefox and WebKit, as the median of 3 runs.
    "Slow 4G" is 150 ms and 1.6 Mbit/s with compression on. Today's
    Chromium numbers are in brackets.
    - **In-app visit, page seen before this session:** every page usable
      ≤ 100 ms on any link (Hall 330, Decks 253, Admin 63-863 on slow
      4G).
    - **In-app visit, first time:** ≤ 1 round trip plus server time,
      ≤ 300 ms on slow 4G (Hall 865, Admin 863, Decks 536, Account 344).
    - **Reload with the cache full:** every page usable ≤ 900 ms on slow
      4G (1,608-2,240), ≤ 100 ms local (31-141).
    - **Cold, empty cache:** sign-in ≤ 800 ms on slow 4G (1,445); every
      signed-in page ≤ 2.0 s on slow 4G (3,256-3,782); game and spectate
      ≤ 2.0 s on the live-like link (2,889-2,916).
    - **Sign-in click to a usable lobby:** ≤ 600 ms local (1,453). Login
      server time ≤ 300 ms on the Unraid box (1,178-1,232 here).
    - **Admin:** first click from the header ≤ 300 ms on slow 4G (863);
      a revisit shows its lists ≤ 100 ms; a tab click ≤ 50 ms (13-52;
      WebKit-on-Windows 114-148, see the engine allowance below);
      cold by address, any tab, ≤ 2.0 s on slow 4G (3,312-3,782); 0
      requests while the tab is hidden (8 lists every 30 s today).
    - **Avatars:** no swap from the default face for a player who has an
      avatar (always today). A real avatar on screen ≤ 100 ms after its
      row is drawn on a reload or visit, and ≤ 300 ms after usable cold
      (0.9-2.2 s after the page started, on 150 ms). On Account, the
      on-screen avatars show ≤ 500 ms on slow 4G and ≤ 40 are fetched
      up front (132, last at 5.2-5.6 s).
    - **Bytes:** every text answer compressed by our server (none today).
      A first visit to the game page after an update ≤ 500 KB
      transferred (1,507 KB). Lobby ≤ 200 KB (492).
    - **Hidden tab:** a tab hidden 10 minutes keeps its lobby socket
      without a reconnect, in all three engines (untested today). It
      does whatever decision 7 says during a game.
    - **Long session:** 30 minutes in the lobby and 3 games in a row:
      heap back within the margin E15 sets after each game; no timer
      runs in a hidden tab except the socket's.
6b. **Every major browser:** the CI smoke set and E1's loading subset are
    green on Firefox and WebKit as well as Chromium (F1). The F2 checklist
    is done on Chrome, Edge, Brave, Opera, Vivaldi and Firefox (and Safari
    if the owner has a Mac or iPhone), with versions recorded. The
    support list is written into AGENTS (F4).
6c. **Engine allowance** (RUN 2026-11-19, WebKit 27.2 on Windows). The
    local targets don't fit WebKit's Windows build, which is 2.5-8x slower
    than Chromium on every page here: lobby cold 377 ms, Admin cold 966,
    in-app revisits 152-220, Admin tab click 114-148. So the local-only
    targets in 6a apply to Chromium and Firefox:
    - in-app revisit ≤ 100 ms;
    - reload ≤ 100 ms;
    - tab click ≤ 50 ms.

    For WebKit on Windows they are 3x those (≤ 300, ≤ 300, ≤ 150 ms) and
    are checked as no worse than today. The slow-link targets (300 ms, 900
    ms, 2.0 s) stand in every engine. Distance dominates there, and
    WebKit's extra 250-850 ms locally fits inside them only once E5 has
    shortened the chain, so they are re-checked after E5 (INFERENCE). A
    real Safari on a Mac, if the owner has one, is the judge for Safari
    (F2). A target that still can't be met in an engine after E2-E8 is
    raised for the owner, never quietly loosened (P11-R7).
7. **CI green 5 times in a row with no re-run:** five consecutive full CI
   runs on main, each a different pushed commit, green on the first
   attempt. No job re-run, and Playwright `retries` stays 0. The Lab's
   own second game for a scenario that "never reached its moment" is
   allowed, but each use is listed.
8. **Flakes table: no Open row.** Each is fixed, or quarantined with its
   cause and a trigger (PHASE-004).
9. **Gates in CI:** `tsc -p tsconfig.e2e.json` (B5). The four Lab scripts
   each run in CI or are retired with a reason (B4).
10. **The owner's play-through (P11-O):** the owner plays the release, at
    least once on a poor connection (a phone hotspot or similar), and
    accepts. He also clicks through every page on the live site in
    Chrome and in Firefox, and says they open at once.

On acceptance: this paper and its exit gate move to
`docs/history/phases/phase-11/` unedited, and Phase 11 is marked complete
in `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md` and `README.md`.

## Decisions only the owner can make

1. **Keep a full-board fallback?** Recommended: yes. A full board is sent
   on join, reconnect, a new game and any mismatch, plus a server switch
   to turn deltas off if something goes wrong in a live game. Without it,
   a single bad delta could leave a player's table wrong until they
   reload.
2. **Spectators get deltas too?** Recommended: yes, but after the players
   (same code, on the public view). They could stay on full boards, which
   is simpler, since they are few.
3. **A player on a slow connection: what do they see?** For example, Bob's
   connection stalls for 5 seconds during a big combat. Option (a): when
   it recovers, he jumps straight to the table as it is now, and misses
   the animations of what happened. Option (b): he plays the missed moments
   quickly, sped up the way a click hurries things, and then catches up.
   Either way Alice's game never waits for him. Recommended: (b), within a
   limit (beyond it, (a)).
4. **Which "poor connection" to support?** Proposed: about 1 Mbit/s with
   300 ms delay and short drops (a weak hotspot) must play correctly;
   worse is best effort. That is the network equivalent of UI-006's
   "1920x1080 and above".
5. **The order of the two goals.** Recommended: measure both first, then
   compression and history (quick, network), then deltas, then redraw
   (which builds on deltas). The alternative is redraw first, if the
   owner feels the slowness on his own machine more than on the network.
6. **Install Firefox and WebKit for testing?** Playwright's own copies,
   about 200 MB, downloaded once here and on CI
   (`npx playwright install firefox webkit`). Nothing in goal 3 or
   group F can be measured in those engines without them. Recommended:
   yes.
7. **A hidden tab during a game.** For example, Bob switches to another
   tab for 6 minutes during Alice's long turn. Chrome slows his page;
   Edge, Brave, Opera, Vivaldi or Safari may freeze it, so it can't
   answer the server's "are you there?".
   - Option (a): the server counts him as connected as long as his
     connection is open (the browser still answers the connection's own
     pings when the page is frozen). The game pauses only when the
     connection really drops.
   - Option (b): his page must answer in 5 s, so a frozen tab pauses the
     game.

   Recommended: (a). Bob's page catches up the moment he looks again.
8. **Card pictures in a lighter format.** Today a picture is a 57 KB
   JPEG; measured on 60 stored pictures, WebP would be 41 KB and AVIF
   28 KB. Every browser on the support list shows both. Option (a) WebP
   (safe everywhere, about 28% smaller). Option (b) AVIF (about half the
   size, slower to make on the server). Option (c) keep JPEG.
   Recommended: (a), with a side-by-side canvas of the same cards first,
   so you can judge the look.
9. **Which browsers are "supported".** Proposed:
   - **Supported** (tested; a problem is a defect): Chrome, Edge,
     Firefox and Safari on a Mac, the current and previous version, on
     a desktop or laptop at 1920x1080 and above.
   - **Best effort** (same engine tested, the brand's own settings
     checked by hand before acceptance): Brave, Opera, Vivaldi.
   - **Best effort, untested** (as UI-006 says today): phones and
     tablets, including Safari on iPhone and iPad.

   It goes into AGENTS beside UI-006.
10. **Keep the signed-in code private from Cloudflare?** Today every file
    a signed-in page needs is marked `private` (owner 2026-10-24: a
    stranger sees only the sign-in screen), so Cloudflare can't keep a
    copy. Each player's first visit after an update pulls all of it from
    the Unraid box. Option (a) keep it private, and make it smaller and
    compressed (E4, E6). Option (b) let Cloudflare keep the code files
    only. A stranger who guessed a file's name could then read the page
    code, though never anyone's data. Recommended: (a).

(Decisions 6-9 were answered by the owner later on 2026-11-19. The
answers are recorded at the end of this paper.)

11. **Firefox on this PC.** Playwright's Firefox is installed but won't
    start here. Windows says its "side-by-side configuration is
    incorrect": Microsoft's Visual C++ runtime is missing, the same gap
    `playwright.config.ts` notes for this machine.
    - Option (a): the owner installs Microsoft's free "Visual C++
      2015-2022 Redistributable (x64)" from microsoft.com. It's a normal
      Windows component many programs need. Firefox then runs here, and
      the Chrome-vs-Firefox avatar question can be answered locally.
    - Option (b): Firefox runs only on CI's Linux runner, which needs
      nothing extra. Local Firefox checks wait for CI.

    Recommended: (a). An agent doesn't install system components itself.

## Not in Phase 11

- **Card statuses** and the gold-square key: **Phase 12**.
- **The repeated documentation audit:** only when the owner says.
- **Housekeeping** (stale comments, the missing v1.43.0 tag,
  troubleshooting gaps, `frontend/zz-canvas/`): maintenance, any time.
- Ideas dropped by the owner on 2026-11-19 stay dropped. One of them was
  "a card into a hidden zone comes back as a new card". D4 must not bring
  it back by the side door: deltas keep today's ids.

## Research notes (for builders)

Read 2026-11-19 at 3370c75. SOURCE = read in the code; RUN = run today;
INFERENCE = reasoned.

- **Redraw numbers** (RUN): the 1.73.0 release run's match-speed rows
  (`[speed 1x]` / `[speed 4x]` lines), headless Edge, the owner's PC. The
  per-update renders are INFERENCE (rate × frames/60 ÷ messages). The
  recorder counts component fibers with work done per commit
  (`match-speed.spec.ts` `RECORDER`, `walk`). Messages are every frame on
  the match socket (`countUpdates`).
- **Snapshot path in the page** (SOURCE): `match.ts`, the
  `MATCH_SNAPSHOT` case of the reducer (`asSnapshot`, revision check,
  `spotlight`, `recent`). `GameScreen.tsx`, the `data` memo
  (`carryMoments`, `boardFromSnapshot`, `keepCards`), plus `pileCards`,
  `piled` and `aimedInPiles`, each over the whole board.
  `fromSnapshot.ts` `boardFromSnapshot`, `keepCards`. `sameProps.ts`
  `sameContent`. `Board.tsx`: the movement `useLayoutEffect`
  (`animationsOf`), `tableCard`/`handCard`/`theirHandCard`, `SlotView`.
  `layout.ts` `previousLayout`. 0096's As built has the 4x CPU profiles.
- **Network numbers** (RUN): the scratch script `netbase.py` in the
  session's scratchpad, over the 384 traces' `MATCH_SNAPSHOT` frames.
  Bytes are compact JSON of `state`. "Deflate" is zlib level 6 per board,
  roughly what permessage-deflate does with no shared window; with one it
  does better. The simple delta is changed top-level keys plus changed or
  added list members by id, plus removed ids. The `payments` repeat count
  is over 120 traces.
- **Server path** (SOURCE): `MatchWorker.kt` `startPump`, `readSnapshot`.
  `MatchDecisions.kt`, the `WorkerEvent.Snapshot` branch, `publicView`,
  `tell` (`runBlocking`). `MatchArt.kt` `annotate`.
  `LiveMatch.snapshotTaken`, `snapshotFor`, `publicSnapshotWithLog`.
  `MatchHub.snapshot`, `sendTo` (a new `Frame.Text` per connection),
  `spectate`. `MatchSocket.kt`: hello, then the stored board, then the
  open question. `Application.kt`: `install(WebSockets)` with
  `pingPeriod`, `timeout`, `maxFrameSize` and no deflate extension.
- **Page socket** (SOURCE): `match.ts` `MATCH_RECONNECT_DELAYS` and the
  socket's `onclose` retry; "reconnecting" in `GameScreen.tsx`.
- **Hidden ids** (SOURCE): the worker strips, per seat, every id of a card
  now hidden from that seat, under any key (`HiddenIds`;
  `protocol/README.md`, "(every key)"). A per-seat delta made from two
  stripped views can only name ids one of them names. That is P11-R4's
  rule, and the gate checks it.
- **Tests that read full boards** (SOURCE): browser specs that route the
  match socket or read its frames are listed under D4.
  `tools/jumps/jumps.spec.ts` replays full boards. About 30 page tests
  (`fixes00NN*.test.tsx`) feed `MATCH_SNAPSHOT`. The Lab traces are the
  worker's output and don't change if deltas are made in the server.
- **First-draft items A1-A6, B2-B7:** their research notes stand as in the
  first draft: spec 0099 "Left open", 0087 As built, `PriorityStops.java`,
  0097, 0101 "Not built", `.github/workflows/ci.yml` (the Lab list), the
  `tsc` run, and the e2e helper search.
- **Goal 3 and group F** (RUN and SOURCE, 2026-11-19 at 3370c75):
  `Phase 11 loading and net deep dive.md`, beside the project folder. It
  holds the per-page tables, the avatar diagnosis, the brand table, the
  ranked list and the appendix. The scratch kit is `pages.spec.ts`,
  `avatar.spec.ts`, `game.spec.ts`, `live.mjs` and `livews.mjs` in that
  session's scratchpad, and is the starting point for E1.
  - Code read: `routes.tsx` (`lazy` pages), `avatars.tsx` (`Avatar`,
    `useRecoveringSrc`, `AVATAR_RETRY_MS`), `lobbyView.ts` `avatarOf`,
    `lobby.ts` `connectLobby` (`PING_MS`, `QUIET_MS`),
    `shell/LobbyConnection.tsx`, and `AdminPage.tsx` (`refresh`,
    `REFRESH_MS`).
  - On the server: `SignedInGate.kt` (`signInFiles`,
    `keepOnlySuccesses`), the static fallback in `Application.kt`
    `installRoutes`, `PictureRoutes.kt`, `ArtStore.kt` `displayWidth`,
    `PasswordHasher.kt`, `LobbySocketHandler.kt` `open`,
    `StandingsSource.standings` and `HallGameSource.games`.
  - The live site was read signed out only: headers, the sign-in page's
    timing, and a socket handshake closed 1008 by the server.

## Owner decisions on the draft (2026-11-19)

1. **Full-picture fallback: yes.** Every update is numbered and names the update it builds on; a page that receives one that does not follow asks for a full picture. Full pictures go on join, reconnect, a new game (Karn's restart included), on request, and once at the start of every turn as a checkpoint. A server switch turns "only what changed" off. CI proves the rebuilt view equals the full view for every seat and spectator.
2. **Spectators: yes, the same mechanism,** switched on after the players' version is proven.
3. **After a stall: the missed moments play sped up (within a limit), then catch up.** Needs its own plan and a canvas demo before it is built.
4. **Order: net code first** (compression, payment history once, then deltas), redraw after.
5. **Catch-up after a stall (canvas "catchup-1119"; plan "Phase 11 catch-up plan.md"):** Q1 replay at 3x; Q2 limit 20 updates (and 6 s of replay), past it straight to now with a "While you were away" window; Q3 the "Catching up… / Tap to skip" sign in the act button; Q4 that window lists every missed move, numbered.
6. **Hard pause when a player's connection drops (canvas "pause-1119"; plan "Phase 11 disconnect pause plan.md"):** catch-up is still needed (detection is never instant; usually 1-5 moves slip and are replayed at 3x). Q1 B: a quiet dim, the act button "Connection dropped · Bob · game paused", a sign on Bob's plate, PLUS a window explaining the pause. Q2 A: while paused the connected player may look, chat and concede; every game move is refused. Q3 A: play resumes after the returning player's catch-up and 2 s steady (8 s at most). Q4 B: "Bob is back" as a 1 s look only. Q5 A: "End the game · you win" after 10 minutes (spec 0054) -- its window must be wide enough that "Peek · or hold Space" never wraps to two lines. Q6 B: a 10-minute pause budget per player per game. Q7 B: 5 s of silence counts as dropped (2 s heartbeat). Also from the plan: "away" counts from the game connection, not the lobby; no per-click confirm mode; response window and stack rest restart after a pause; spectators see the pause sign.
7. **Every page is in the phase (later on 2026-11-19):** "Make sure Phase 11 includes all of the pages in the efficiency check. For example, when you click on the admin page it loads as instantly as possible." Net code and loading on every page (sign-in, lobby, room, Deck Depot, Hall, Account, Admin and every tab, Status, game, spectate), widened by a deep dive: goal 3, items E1-E17, measured in `Phase 11 loading and net deep dive.md`.
8. **Avatars load properly (later on 2026-11-19):** "I've noticed avatar icons take a few seconds to load on Chrome but load instantly on Firefox." Item E2, with its cause measured in Chrome (the avatar waits for the lobby connection, and Chrome's connection to Cloudflare is slow to open) and to be confirmed in Firefox (F1).
9. **All major browsers (later on 2026-11-19):** "Make sure we cover all major browsers. A lot of browsers use the same engine, but we need to cover them." Group F: Chromium, Firefox and WebKit measured and in CI, a hand checklist for the brands, and a support list for the owner to choose (decision 9 above).

**Owner answers, 2026-11-19 (later):** Firefox and WebKit installed for testing (yes; here, and in CI as part of F1). Supported browsers: Chrome, Edge, Firefox and Safari on a Mac (current and previous version) at 1920x1080 and above; Brave, Opera and Vivaldi best effort, checked by hand; phones best effort, untested (UI-006). Card pictures: WebP, with a side-by-side canvas before switching. A hidden or frozen tab counts as connected while its connection is open; the game pauses only if the connection actually drops.

## As built: P11-B5 (2026-11-21)

`tsc -p tsconfig.e2e.json` had 11 errors (not 7; `match-small-fixes` had gained four since the count): `admin.spec.ts` (the evaluate tuple, an unchecked first title), `device-link.spec.ts` (baseURL possibly undefined; the config always sets it), `match-small-fixes.spec.ts` (two `Row` types under `exactOptionalPropertyTypes`, one missing `mine`; the counts typed as pairs), and two page files lacking Vite's types (`tsconfig.e2e.json` now has `vite/client`). All fixed; `ci.yml`'s checks job runs `npx tsc -p tsconfig.e2e.json --noEmit` after the page check. tsc, eslint, prettier clean.

## As built: P11-B7 (2026-11-21)

Gated: tsc -b, tsc e2e, eslint, prettier and vitest (1822/1822) pass. The code is in bc719a2e on `phase-11`, which is not pushed.

**Runs (RUN, 2026-11-21, local stack at app build f20bc2b2, bundled Chromium, bc719a2e):**
- **Touched specs, one run:** 11 of 12 passed (19.1 min). They are cast-aside, cast-step-aside, casting-dock, last-jumps, numbers, quiet-windows, reading-card, reports-comfort, soulbond, state, and match-speed at 1x.
- **The one failure was match-speed's 4x test:** "4x combat: JavaScript 99 ms/s > 88". This budget is checked off CI only. P11-B7 did not cause it:
  - P11-B7 adds no page work during combat. Idle still waits by React commits, and no observer runs then.
  - An A/B on the same stack: the pre-B7 spec (de564326's `match-speed.spec.ts` and `match-helpers.ts`) passed both tests, with 4x combat at 56.9 ms/s.
  - Both combats had 163 updates. The failing one played in about 540 frames, the passing one in about 820. So the total JavaScript was close (~0.9 s against ~0.8 s), and the per-second number swings with how long the combat lasts.
  - It is recorded in ROADMAP's flake list. It belongs to the open 80/70 budget work (C6). CI does not check this budget: on 64ea8373, CI's 4x combat was 177 ms/s.
- **CI-speed run:** `node ci/ci-speed.mjs match-soulbond match-casting-dock match-reading-card`. It ran three Playwright runs at CPU 4x, each pairing the spec with the spec before it on its CI machine:
  - match-passing + match-soulbond: 2 passed (1.4 min).
  - match-card-trays + match-casting-dock: 2 passed (4.8 min).
  - match-modes-doing + match-reading-card: 2 passed (49.6 s).
- **The slowdown reaches the pages:** each run printed `[ci-speed] CPU slowed 4x on every page`. casting-dock took 2.5 min slowed against 39.3 s normally, which is an inference from the timings; nothing read the rate from a page.

- **One copy of the real mouse, in `e2e/match-helpers.ts`.** `hitPoint` now clamps to the window AND to every ancestor that clips (scrolled lists, trays), falling back to the window-clipped box when an ancestor clips in style only; `pointAt` (point, no click), `realClick` (now with `button: "right"` and `steps`), and `clickAt` (a click at a chosen point, made only if the element is still what the mouse hits there). The copies in `match-reports-comfort` (`hitPoint`, `realClick`, `pointAt`) and `match-last-jumps` (`realClick`, which clicked a box's middle unchecked) are gone.
- **`settle` moved from `match-speed` to `match-helpers`:** stack empty, no finite animation running, nothing changed for 2 s (default: DOM mutations, observed only while waiting; `clock: "commits"` reads match-speed's React commit probe, so its idle row is unchanged). Returns whether it settled.
- **Raw clicks replaced:** `cast-aside`, `cast-step-aside`, `casting-dock`, `reading-card` (2) now `clickAt` the measured point (the point is their subject; the click is refused if the board moved); `soulbond`'s right-click is `realClick(..., { button: "right" })`, its pointing and `quiet-windows`' pointing use `pointAt`.
- **Still raw, on purpose (commented):** `match-lands-stay-put` (the subject is the same spot clicked each time; what is under it is asserted just before), `match-quiet-windows` and `match-status-list` (an empty spot on the table, which no element stands for). The two raw clicks inside `realClick`/`clickAt` are the helpers themselves.
- **Today's lessons as helpers:** `clickUnless(target, unplanned)` -- a catch-all's click that skips windows it does not plan for, the check and the click one page step (`clickUnlessCombat` is now `clickUnless(target, ".gs-combat")`); `chosenTargets(page)` -- what the page marks as chosen, not a bot's count (now used by `match-numbers`); `shownTexts(locator)` and `said(word)` -- whole text including the hidden sentence, and a word that may be glued to a count ("the monarch1") (now used by `match-state`). Other specs' bot logic is unchanged.
- **CI-speed local run:** `node ci/ci-speed.mjs <spec> ...`. `PROXIC_E2E_CPU=N` (set by the script, default 4) makes `e2e/cpu-slowdown.ts`, imported by `playwright.config.ts`, wrap `chromium.launch` in each worker so every page of every context gets `Emulation.setCPUThrottlingRate`. The script runs each spec after its CI machine neighbour (deal from `ci/browser-shard.mjs`, name order as Playwright runs them), one Playwright run per machine; `--whole`, `--alone`, `--cpu N`, `--dry`. When to use it: in "How work runs" above and in `docs/operations/UPDATING.md`.
- **Touched specs (run above, except the two with a comment only, which CI runs):** match-cast-aside, match-cast-step-aside, match-casting-dock, match-lands-stay-put (comment only), match-last-jumps, match-numbers, match-quiet-windows, match-reading-card, match-reports-comfort, match-soulbond, match-speed, match-state, match-status-list (comment only); every spec using `clickUnlessCombat` or `hitPoint` goes through the changed helpers.
