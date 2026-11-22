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
| P11-D0 | **Where the time goes, end to end** (owner, 2026-11-21). Step 1 measures each side alone (server 1.9 ms CPU per board, 12 KB per board, the page's redraw per update), never one moment from click to both screens. | For four moments (tap one land, cast a spell with a target, a big combat, Karn's restart), each step timed on one timeline: the engine deciding, the worker building each seat's board (hidden cards removed, HID-001), the server sending, the browser receiving and parsing, React's commit, layout and paint, on both seats; 3 runs, at 1x and 4x. A one-page chart per moment says which slice is biggest; the plan's order is re-checked against it. Hiding cards stays on the server whatever it shows. | S | none (measuring) | step 1b |
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
1b. **D0**, where the time goes (owner 2026-11-21): one end-to-end timeline per moment, from step 1's kit plus the server's own steps; its chart may reorder steps 2-9.
2. **D2**, compression on the game socket: the quickest big saving, small
   risk. Beside it, the quick loading wins: **E3** (cache rules), **E4**
   (HTTP compression), **E9** (sign-in's 1.2 s, cause first), **E14**
   (fonts), **E16** (duplicate fetches), **E17** (API cache rules).
3a. **C3 and C4** beside step 3 (owner 2026-11-22, from D0's finding).
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
- **Before and after are measured with the kit** (step 1): `node ci/measure.mjs
  redraw|loading` (three runs, compared) and `scripts/measure-wire.py` over the
  fixed Lab traces; `node ci/measure.mjs compare <after> --against <before>`
  puts the two side by side. See "The measuring kit" below.
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

    **Corrected 2026-11-21 (owner):** it isn't the Visual C++ runtime.
    The owner installed it: both the x64 and x86 runtimes, v14.51, are
    on the PC. A forced re-download of `firefox-1555` still fails the
    same way ("spawn UNKNOWN"). Windows's event log says side-by-side
    activation failed because the dependent assembly "mozglue" could not
    be found, although `mozglue.dll` is there. So Firefox is **CI-only**
    for now (CI's Linux runner, option (b)): the kit and CI carry the
    Firefox path (As built: P11-F1, CI part), and no local Firefox run
    is attempted. Chromium and WebKit run here.

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

**Owner answer, 2026-11-21 (C6's yardstick):** C6 is judged on the measuring kit's replayed table (40 a side, tap one land, the busy scene), per update, which is steady to a few per cent; real games still run, only to show nothing got worse. The real-game 4x figure swings 96-116 ms/s between deals and no longer decides C6.

**Owner answers, 2026-11-22 (after P11-D0):** the deliberate pauses (0061's 400 ms per passed step, 0105's stack rest) stay as they are; Phase 11 works on real slowness only. **C3 and C4 move up to run beside step 3** (the browser's React commit and next frame are the biggest slice of the system's own time in a tap, a cast and a combat); C2 stays after D4.

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

## The measuring kit (step 1, 2026-11-21)

One kit measures all three goals, the same way before and after every
change (P11-R5, P11-R6). It changes nothing a player sees.

| Measure | Item | Where | Engines |
|---|---|---|---|
| Redraw | P11-C1 | `frontend/tools/measure/redraw.spec.ts`, `probes.ts` | Chromium (CDP) |
| Wire, browser side | P11-D1 | `redraw.spec.ts`'s real game, `wire.ts`, `results.ts` `serverCpuMs` | Chromium |
| Wire, Lab traces | P11-D1 | `scripts/measure-wire.py` (`FIXED`) | (the worker's output) |
| Loading | P11-E1 | `frontend/tools/measure/loading.spec.ts`, `link.ts` | Chromium, Firefox, WebKit |
| End to end, click to both screens | P11-D0 | `frontend/tools/measure/timeline.spec.ts`, `timeline.ts`, `timeline-probe.ts`; marks in the worker (`game/Timing.java`) and server (`match/MatchTiming.kt`); chart `ci/timeline-chart.mjs` | Chromium (CDP) |
| Run three times, compare | all | `ci/measure.mjs` | - |

**How to run it** (against the local stack on :8080, one Playwright run at a
time, nothing else using the shared test accounts: the measures play real
games with RudeLeft, Pat and the first of `match-accounts.json`; and with other
programs closed, since every number is the PC's):

```text
node ci/measure.mjs redraw                     redraw + wire: 3 runs at 1x and 4x  (~30 min)
node ci/measure.mjs loading                    every page, 4 links, Chromium + WebKit, 3 runs (~70 min)
node ci/measure.mjs loading --engines firefox  Firefox (CI's Linux only, for now)
node ci/measure.mjs loading --links local,slow4g --grep "every page"
node ci/measure.mjs timeline                   P11-D0: 4 moments, 3 runs at 1x and 4x (~25 min); the stack must be
                                               up with PROXIC_TEST_TIMING=true; writes timeline-chart.html
node ci/measure.mjs compare <after dir> --against <before dir>
python -I scripts/measure-wire.py <Lab traces folder> [--set fixed|all] [--out wire-lab.json]
```

- Each run writes `run-<k>/*.json` into the folder (default
  `frontend/test-results/measure/<measure>-<time>`): one file per measure,
  `{ kind, when, machine, engine, commit, rows }`, a row per moment or page
  (`"4x combat"`, `"slow4g Admin cold"`), every other field a number.
- `compare` writes `summary.md` and `summary.json` beside them: each number's
  three values, their median, and "steady" when every run is within 10% of the
  median, or within a small absolute step (half a render or millisecond, 256
  bytes) where 10% of a small number is less than one step. With `--against`,
  each median sits beside the before folder's, with the change in per cent.
- `playwright.measure.config.ts` is the kit's own config (as the jumps
  check's), so the browser suite never runs it: projects `chromium`,
  `firefox`, `webkit`, Playwright's bundled engines, headless (P11-R6).
- Timings print and are compared; nothing in the kit enforces a budget yet.
  The targets are enforced by the items that meet them (C6's budgets stay in
  `match-speed.spec.ts`).

**What it records, and how.**

- **Redraw** (`probes.ts` `timer`, per measured page). Everything per game
  update, not per second (B7: the per-second figure swings with how long a
  combat lasts): React components rendered, GameScreen and plate renders,
  commits (the speed kit's `RECORDER`, moved with the speed test's bot into
  `e2e/speed-kit.ts`, which `match-speed.spec.ts` now imports); the page's
  own JavaScript from a CPU profile sampled every 200 us, split by stack: a
  stack with a frame of the app's bundle (`/assets/*.js`) is the page's
  ("app"), garbage collection is its own line, any other JavaScript is the
  test's ("test": Playwright's locators, `evaluate`) (`attribute`); the
  whole ScriptDuration beside it, as match-speed read it; style and layout
  time from Chrome's trace for the page's frame, with the part forced by the
  test's JavaScript apart; paints, their time, and the area of their clips
  inside the window; frames p95 and worst.
  - Chrome's `Paint` clip is the paint layer's, not the damaged rectangle
    (a composited layer's is unbounded and counts as the whole window), so
    `paintKpx` is coarse: comparable before and after on the same scene,
    not "the area that changed". C5 adds the trace's invalidation tracking
    for that.
  - Two parts. **"bench"**: a real game page whose match socket is taken over
    once the game runs (the jumps check's method), so no polling and no
    clicks fall in a measured stretch and the same boards come in the same
    rhythm every run: a table of 40 permanents a side (16 Forests, 24 Grizzly
    Bears each, made from the deck's own cards); `bench-idle` (4 s, nothing
    sent), `tap-one-land` (20 boards, each tapping or untapping one Forest,
    0.7 s apart), `bench-40` (20 boards of a busy table: a land taps, a
    creature enters, one attacks, life drops, one dies; 1 s apart).
    **"game"**: match-speed's real game and fixed moments (idle, hover,
    cast, combat, end) with the speed kit's bot, timed on the host's page.
  - At 1x and with the measured page's CPU slowed 4x (`PROXIC_MEASURE_CPU`).
- **Wire, browser side** (`wire.ts` `countBytes`, on both players' pages in
  the real game): every socket message each page reads or sends, as text
  after decompression (so the bytes the page handles; on-the-wire bytes once
  D2 compresses come from the same counter plus the frame sizes D2 adds).
  Per seat: boards and their bytes (median, p95, largest), all match
  messages by type, messages a second in the cast and in the combat, the
  whole game's bytes. Server time per board: the Arena Server's own CPU
  (its container's process 1, `/proc/1/stat`; the Forge workers are
  processes of their own and not in it) over the game, divided by the
  boards sent to both seats. CPU, not wall time: the browser can't see the
  server's wall time, and CPU is what a busier box would feel.
- **Wire, Lab traces** (`scripts/measure-wire.py`): the 2026-11-19 baseline's
  method (`netbase.py`) made a script, over a fixed set of 16 traces (big
  boards, combat, payments, wipes, tokens, a spectator, copies, long games:
  `FIXED`), or every trace (`--set all`). The worker's side, before the
  server adds pictures.
- **Loading** (`loading.spec.ts`): the deep dive's scratch kit made one spec,
  with one method in every engine: Playwright's request events and
  `request.sizes()` (bodies plus headers; no CDP anywhere), and the links
  made by a relay in front of the server (`link.ts` `relay`: a new
  connection waits one round trip; every chunk takes half a round trip each
  way after its turn on a shared link at the link's speed; plain HTTP, so
  no TLS round trips). The relay replaces Chrome's network emulation so a
  number in WebKit or Firefox means what it means in Chromium. Per load:
  usable (to the page's heading and list, and "Connected"; the deep dive's
  definition, checked in the page on every frame: `READY`, `usableAt`), first paint, every picture done, requests, KB, script, style
  and picture KB, chunks, API calls and the slowest one's server time,
  socket messages and KB, the three slowest requests. Pages: sign-in (cold,
  reload, the sign-in click to a usable lobby), lobby, Hall, Deck Depot,
  Account, Admin, Status (cold, reload), the five header pages in the app
  (first and again), every Admin tab (a click, and cold by its address);
  then a room, the game and spectate (cold, reload). Links: local, slow 4G
  (150 ms, 1.6 Mbit/s down, 750 kbit/s up), live-like (150 ms, 10/5 Mbit/s),
  poor (300 ms, 1 Mbit/s / 500 kbit/s). "Poor with compression on, as the
  live site has it" (P11-R6) can't be made by a relay: our server
  compresses nothing until E4, so poor is measured as our server sends today.

## As built: P11-C1 (2026-11-21)

The redraw measure is in the kit (above): `frontend/tools/measure/redraw.spec.ts`
with `probes.ts`, run by `node ci/measure.mjs redraw`. The speed test's
recorder and bot moved unchanged into `e2e/speed-kit.ts`
(`match-speed.spec.ts` imports them; its budgets, `measure`, the glow check
and `playAndTime` stay in it).

**Today's numbers (RUN, 2026-11-21: 3 runs, the owner's PC, 13th Gen Intel
Core i5-13600KF x20 / 32 GB, Playwright's bundled Chromium (headless shell, build 1248), 1920x1080, local stack
at app build fd804f4c's code (image built 2026-11-21 16:16 UTC from the
working tree), main fd804f4c plus this kit).** The PC was not idle: a game client the
owner had open ran in the background through every run today (about a quarter of
one of the 20 threads, sampled once at the end). An "after" should run on the
same PC with other programs closed, and say so. Medians of 3; "!" marks a
number whose three runs are not all within ±10% of the median (or half a
unit). "upd" is a game update: every message the host page's match socket
brought (as match-speed counts them). "app ms" is the page's own JavaScript
(the profile's app-bundle stacks); "all JS" is ScriptDuration, which also
holds the test's own.

```text
moment            renders GameScreen plate  app ms  all JS  style ms layout ms paints  frames     updates  JS ms/s
                    /upd    /upd     /upd    /upd    /upd     /upd     /upd     /upd   p95/worst
bench (replayed, a table of 40 permanents a side; nothing polls)
1x bench-idle        0      0        0       0      3.2*     8.3*      0        0     16.7/83.3    0        0.8
1x tap-one-land     63      1        1      3.17    4.08     3.63     0.56     11     16.7/16.8   20        5.8
1x bench-40         60.7    1        1      3.02    4.24     5.25     0.47     12.75  16.7/16.8   20        4.2
4x bench-idle        0      0        0      0.19   9.6*!   46.1*!     0        0     16.8/417    0        2.2!
4x tap-one-land     63      1        1     18.3    20.1    16.7!     2.54     11     16.8/66.7!  20       28.1
4x bench-40         60.7    1        1     16.0    18.5    25.1!     2.10     12.75  16.7/83.4!  20       18.1
the real game (match-speed's moments, the speed kit's bot)
1x idle              0      0        0       0      5.3*!   38.5*!     0        0     16.7/99.9!   0        0.9
1x hover           103!     0        0      6.0*!  16.5*!  24.0*!    0.29*    60*!   16.7/16.8    0        4.6!
1x cast             49.6    1.07     1.14   1.26    1.53     0.72     0.10     8.81  16.7/16.8  107       25.7
1x combat           45.9    0.96     1.06   1.39    1.52     0.73     0.13     7.18  33.3/50    176       28.0
1x end              67.8    1.33     1.59   1.91    2.40     2.41!    0.30     9.64  33.3!/50    33        7.5!
4x idle              0      0        0      0.79   30.2*!  191*!       0        0     16.8/467     0        4.6!
4x hover           103!     0        0     47.5*!  87.7*! 158*!      1.18*    62*!   16.8/83.2!   0       20.6
4x cast             56.6!   0.98     1.04   9.44!   9.20!    6.25!    1.06     9.37! 16.8/83.4   53!      74.4!
4x combat           34.3    0.64     0.73   7.05!   6.82     3.89     0.75     7.97! 33.4!/100  158!      99.7!
4x end              53.6    1.00     1.23  10.0!   11.0!    13.0!     1.63     9.64! 33.3/117!   33!      31.3
* a moment with no update: the moment's total, not per update
```

Next to the paper's 2026-11-19 baseline (1.73.0, headless Edge, no profiler
or trace running; its per-update renders were derived):

```text
                 renders/upd       GameScreen/upd    plate/upd       JS ms/s            frames p95/worst
               11-19   today      11-19  today     11-19  today    11-19   today      11-19       today
1x cast         ~59    49.6        1.2   1.07       1.2   1.14     18.0    25.7       16.7/16.8   16.7/16.8
1x combat       ~43    45.9        0.9   0.96       1.0   1.06     21.7    28.0       16.8/50.0   33.3/50
4x cast         ~39    56.6!       0.8   0.98       0.8   1.04     41.6    74.4!      16.7/33.4   16.8/83.4
4x combat       ~34    34.3        0.7   0.64       0.8   0.73     61.7    99.7!      33.3/66.6   33.4/100
```

- **The target is met where a change can be judged: per update, the
  replayed table is steady to ±10% over 3 runs, at 1x and 4x,** on every
  count (renders, GameScreen, plates, paints: identical in all three runs),
  the page's own JavaScript (4x tap-one-land 17.7-18.5 ms, bench-40
  15.1-16.9), all JavaScript, layout, and frames p95. Not steady at 4x:
  style time (tap-one-land 15.6-20.5 ms, bench-40 24.4-30.3) and the
  slowest frame (50-83 ms). The 1x real game is steady too for the cast and
  the combat (renders 45-51, app 1.25-1.49 ms, all JS 1.43-1.68 per update).
- **The 4x real game is not steady, by nature:** the cast moment's 6 s
  caught 33, 53 and 89 updates in the three games (the slowed page falls
  behind, so how much of the game lands in the window differs), and the
  combat's app time per update is 6.2-7.2 ms (±13%). The per-second figure
  still swings most (combat 96-116 ms/s). So C2-C5 judge their change on the
  bench (and the 1x game), with the 4x game as a cross-check (an owner
  question below, because C6's 80/70 budget is per second on this game).
- **Tapping one land today:** 63 component renders per update (target ≤ 10),
  GameScreen 1, each plate 1 (target 0), 11 paints, 3.2 ms of the page's
  JavaScript at 1x and 18 ms at 4x, 3.6 / 16.7 ms of style. On a 40-a-side
  table the busy updates cost about the same (61 renders): the work follows
  the table's size, not what changed, as the paper read in the code.
- **A still table does no React work** (0 renders, 0 paints, 0 app ms), but
  it does recalculate style: 8 ms over 4 s on the replayed table at 1x, 46 ms
  at 4x; 24-47 ms over 6 s in the real game at 1x, 178-254 ms at 4x. That is
  the looping CSS animations (24 of them, the paper's Repaints note) being
  restyled every frame without a paint. New today; for C5.
- **The 0096 numbers are higher than the paper's** (JS ms/s 1x cast 25.7
  against 18.0, 4x combat 99.7 against 61.7): this measure runs a CPU
  profiler (200 us samples) and Chrome's trace throughout, and in bundled
  Chromium, not Edge. The test's own JavaScript, which the paper could only
  estimate (17-20 ms/s at 4x), is now measured apart: 1.95 ms per update in
  the 4x combat (about 19 ms/s), 0.27 at 1x.
- Frames: the 4x real game drops frames as the paper says (combat p95 33.4,
  worst 100); the replayed table at 4x keeps p95 16.8 with worst 50-83.
- The hover row's renders (47-181) depend on how many cards the hand holds
  in that game; it is counted per moment, not per update.
- The replayed table's own counter reads 87 card elements on the table for
  the 80 permanents (the probe's `boardCards`, which also counts what a seat
  draws beside its permanents).
- **Caveat (INFERENCE):** the paint area (`paintKpx`) is in the files but not
  in the tables: Chrome's paint clips are whole layers (see the kit), so it
  waits for C5's invalidation tracking.

**For the owner (raised 2026-11-21, not decided):** C6's target is "the
page's JavaScript per second, at 4x, in the real game": cast 80, combat 70.
That number swings by itself (combat 96-116 ms/s over today's three games),
because each game is dealt differently and a slowed page catches a
different share of it. The replayed table above is steady to a few per
cent. Should C6 be judged on the replayed table's per-update numbers (with
the real game kept as a check that nothing got worse), or stay on the real
game's per-second number, run more times? Recommended: the replayed table.

## As built: P11-D1 (2026-11-21)

The wire measure is in the kit: the browser side rides on the redraw
measure's real game (`wire.ts` `countBytes` on both players' pages;
`results.ts` `serverCpuMs`), the Lab side is `scripts/measure-wire.py`.

**Browser side (RUN, 2026-11-21, the same 3 real games per CPU as C1, the
mono-green deck at 28-40 permanents).** Bytes are the message text the page
reads (nothing is compressed today, so these are also the bytes on the
wire).

```text
                        boards  board bytes median / p95 / largest   match messages  messages/s   match KB in
1x cast (6 s), seat 1      24        13,485 / 13,763 / 14,204              107          16.4!        328!
1x combat (9 s), seat 1    39        14,796 / 15,509 / 16,290              176          17.8         602
1x combat, seat 2          39        15,373 / 16,236 / 17,108              166          17.0         613
1x whole game, seat 1     298        11,825 / 15,968! / 19,036            1,270           7.2!      3,467!
1x whole game, seat 2     298        12,146 / 16,237 / 19,358             1,246           7.0!      3,583
4x combat, seat 1          35!       15,323 / 16,196 / 17,269              158!         15.1         563
4x whole game, seat 1     312!       11,988 / 15,932 / 19,543             1,313!          6.8!      3,613!
server: Arena Server CPU per board sent (both seats), whole game: 1x 1.74-2.07 ms (median 1.86), 4x 1.83-2.44 (1.96)
a whole game's match messages, seat 1 (1x, median): MATCH_SNAPSHOT 298 (3,236 KB), DECISION_REQUEST 108 (120 KB),
  MATCH_STEP 283 (49 KB), MATCH_ASKING 395 (42 KB), DECISION_ACCEPTED 109 (12 KB), DECISION_CLEARED 93 (9 KB)
```

- **A real board is about 3.5 times the Lab's:** 11.8-12.2 KB median per
  seat over a whole game (13.5-15.4 KB in the cast and the combat), against
  the Lab's 3.4 KB. What it is made of (RUN, one more 1x game the same day,
  the largest board each seat read, 17.8 KB; `wire.ts` `boardMakeup`, now in
  every run's file as `largest board seatN`): the battlefield 51%, payments
  16-17%, the play log 12%, the hand 9-10%, damage 5%, players 2%. The
  picture fields the server adds (`MatchArt` `annotate`: `art`, `crop`) are
  16-17% of the board, inside those zones. So the size is mostly the big
  table (28-40 permanents against the Lab's mostly small games), plus the
  history lists D3 is about (payments and the play log: 29% here, against
  15% in the Lab's whole set); pictures are a sixth (one run: INFERENCE that
  it holds for every game).
- **Boards are a quarter of the messages but 93% of the bytes:** a whole game
  brings each seat about 1,250 match messages, of which 298 boards; the rest
  are questions and their acks and steps (MATCH_ASKING 395, MATCH_STEP 283,
  DECISION_* 310), small but many. Messages per second in a combat: 15-18 a
  seat (the paper's "about 9 boards per combat" is boards only; the 9 s
  combat moment here holds 35-41 boards, as it runs past the combat into the
  next turn's start).
- **Steady:** bytes per board and messages per second in the combat are
  within ±10% over 3 runs; a whole game's totals vary with the game (290-325
  boards: the decks are shuffled), so before/after of a game's total reads
  the Lab's fixed set, where the games are the same.
- **Server time per board:** about 1.9 ms of the Arena Server's CPU per board
  sent, over a whole game (reading the worker's board, adding pictures,
  writing it to each seat, plus everything else the server did meanwhile:
  its sockets, questions, the lobby). Small next to the network; it is the
  number D2 (compression), D4 (deltas) and D7 must not make worse.

**Lab side (RUN, `scripts/measure-wire.py` over the 1.75.0 release run's 432
traces, 2026-11-21).** The fixed set is 16 traces (`FIXED`).

```text
                       board bytes median/p95/largest  deflated median/p95 (share)  delta median/p95 (share)  boards/game median/p95  boards/combat  payments same
all 432 (1.75.0)          3,384 / 7,560 / 17,660           717 / 1,081 (19.1%)          46 / 890 (6.8%)          232 / 519            9 / 10         86.6%
fixed 16                  5,674 / 10,166 / 17,660          868 / 1,239 (15.1%)          47 / 3,320 (8.9%)        747 / 1,746          9 / 21         80.7%
paper 11-19 (384, 1.73.0) 3,346-3,430 / 7,565-7,815 / 17,604  717 / 1,083 (19%)          46 / 926 (7%)            242 / 518            9 / 10         87%
```

The whole set today agrees with the paper's 2026-11-19 baseline to within
1-4% everywhere (48 more games since 1.73.0). The fixed set's boards are
bigger (it picks the big games on purpose). A fixed trace set made again after a change measures the change; making
it is a Lab run of the 16 scenarios. How far a Lab game differs between two
runs of the same build is not measured yet (each scenario's deck is
stacked; its shuffles are not checked here): the first "after" should run
the 16 twice on the before build to see.

## As built: P11-E1 (2026-11-21)

The loading measure is in the kit: `frontend/tools/measure/loading.spec.ts`
with `link.ts`, run by `node ci/measure.mjs loading`.

**Today's numbers (RUN, 2026-11-21: 3 runs per engine, the same PC and stack
as C1, Playwright's bundled Chromium (headless shell 1248) and WebKit
(2370), 1920x1080, the relay's links).** Milliseconds to usable, medians of
3; "!" as in C1 (here a frame, 17 ms, is the small step). 363 of the 376
usable times are steady to ±10% over the 3 runs; every byte and request
count is (all 376). Room, game and spectate: the host's or the spectator's
own new profile while the game runs.

```text
Chromium         local                    slow 4G                   live-like                 poor                   local requests / KB
                 cold reload 1st again    cold  reload 1st again    cold  reload 1st again    cold  reload 1st again   (cold)
sign-in            40   26     -    -     1679  1504    -    -       701   526    -    -      2801  2491    -    -       6 / 302
sign-in click    1430    -     -    -     4578     -    -    -      2959     -    -    -      6841     -    -    -      29 / 561
lobby             103!  43    47   43     3317  2148   55   43      1702  1037   46   44      5584  3602   42   48      27 / 502
Hall              130   65    87   41     3662  1891  530  252!     1950   919  410  207      6214  3206  860  421      33 / 699
Deck Depot        120   54    58   54     3476  1889  531  241      1764   939  397  214      5911  3194  908  415      33 / 723
Account           109   60    58   50     3182  1707  300   43      1610   736  223   54      5335  2851  508   47      24 / 471
Admin              98   36    45   48     3426  1677  526   48      1655   724  265   44      5733  2830  868   61!     35 / 622
Admin, a tab       76-92 cold; a click 12-24 local, 13-24 on every link        slow 4G cold 3395-3418, live 1624-1635, poor 5720-5748
Status             85!  52     -    -     6794  1706    -    -      1970   734    -    -     11131  2853    -    -      13 / 1127
room              135   51     -    -     3343  1876    -    -      1745   933    -    -      5636  3161    -    -      30 / 521
game              168   67     -    -     8596  2413    -    -      2907  1386    -    -     14136  4195    -    -      48 / 1556
spectate          182   77     -    -     8554  2462    -    -      2916  1386    -    -     14100  4205    -    -      41 / 1563

WebKit
sign-in            95   77     -    -     2221  1546    -    -       724   573    -    -      3694  2539    -    -       6 / 302
sign-in click    1666    -     -    -     4914     -    -    -      3288     -    -    -      7218     -    -    -      29 / 560
lobby             413  309   128  141     3417! 2272! 153  140      1799  1244  129  128      5521  3710  136  127!     27 / 501
Hall              377  297   265  187     3595  2254  685  378      2041  1132  589  342      5871  3508 1037  536      33 / 698
Deck Depot        354  309   248  187     3579  2254  693  360      1906  1097  580  329      5866  3630 1076  529      33 / 722
Account           436  700   319  174!    3426  2305  538  159      1732  1329  445! 160      5425  3344  725  158     152 / 1241
Admin             319  236   189  127     3517  1956  647  128      1719   903  382  129      5887  3029  984  141      35 / 621
Admin, a tab      278-319 cold; a click 107-126 (one 214 on live)               slow 4G cold 3457-3506, live 1703-1734, poor 5729-5919
Status            440  215     -    -     7917   644    -    -      2264   557    -    -     12859  1006    -    -      14 / 1331
room              381! 311     -    -     3528  2211    -    -      1999  1150    -    -      5805  3584    -    -      30 / 520
game              582  396     -    -     8877  2535    -    -      3270  1495    -    -     14466  4020    -    -      44 / 1550
spectate          596  448     -    -     8961  2646    -    -      3457  1567    -    -     14558  4121    -    -      41 / 1561
"1st" / "again": the page opened from the header, first time in the session / once more.
```

Next to the paper's 2026-11-19 baseline (Chromium, CDP link emulation, one
run; game, room and spectate on the live-like link):

```text
                      11-19 local      today local        11-19 slow 4G              today slow 4G
                      cold  reload     cold  reload       cold  reload  1st/again    cold  reload  1st/again
sign-in                 50    31         40    26         1,445 1,424     -          1,679 1,504     -
sign-in click        1,453     -      1,430     -         4,650     -     -          4,578     -     -
lobby                  125    49        103    43         3,268 1,839   66/67        3,317 2,148   55/43
Hall                   140   122        130    65         3,278 2,240  865/330       3,662 1,891  530/252
Deck Depot             121    50        120    54         3,274 1,839  536/253       3,476 1,889  531/241
Account                121    90        109    60         3,256 1,608  344/42        3,182 1,707  300/43
Admin                  118    49         98    36         3,782 1,617  863/63        3,426 1,677  526/48
Admin, a tab cold  100-134     -      76-92     -         3,312-3,351  -    -        3,395-3,418  -    -
Status                  62    42         85    52         2,254 1,630     -          6,794 1,706     -
game (live-like)       237    80        168    67         2,889 1,374     -          2,907 1,386     -
spectate (live-like)   234    88        182    77         2,916 1,357     -          2,916 1,386     -
room (live-like)       131   141        135    51         1,872 1,361     -          1,745   933     -
WebKit local, 11-19 -> today: lobby 377/325 -> 413/309, Admin 966/249 -> 319/236, Account 864/895 -> 436/700,
  in-app Hall 351/220 -> 265/187, Admin tab click 114-148 -> 107-126
```

- **The relay matches Chrome's own emulation** where the method is the same:
  game and spectate on the live-like link 2,907 / 2,916 against 2,889 /
  2,916; Admin by address on slow 4G 3,395-3,418 against 3,312-3,351. So the
  links mean the same in every engine now. On slow 4G, WebKit's cold loads of
  the signed-in pages land within 1-8% of Chromium's (distance dominates, as
  6c expected); sign-in is 32% slower (2,221 against 1,679) and Status 17%.
- **The 2026-11-19 in-app numbers were late by Playwright's own retries.**
  A first kit run today with the deep dive's `expect`-based "usable" gave the
  paper's numbers again (Hall first 843, Admin first 861 on slow 4G), but
  `expect` re-checks at 0, 20, 50, 100, then every 500 ms, so a page that
  became usable between checks was timed at the next one. The kit now checks
  in the page on every frame (`READY`): Hall first visit 530 (not 865), Admin
  526 (not 863), Hall again 252 (330). The targets in the exit gate (6a) are
  unchanged; its bracketed "today" figures are the 11-19 ones, so read them
  with this correction (Admin's first click is 526 today, not 863).
- **Status's "Ready" waits for the page's own status poll:** cold on slow 4G
  it took 6,794 ms today (2,254 on 11-19; 2,547 in the first run), reload
  1,706 (4,986 in the first run). It flips between runs of the kit while
  staying steady within one, so it lands on the poll's rhythm, not the
  network (INFERENCE: `status.ts` polls on a timer; to read in E5/E8).
- **The game page on slow 4G is the slowest load anywhere:** 8.6 s cold
  (1.56 MB, 48 requests, nothing compressed), 2.4 s reloaded. E4 and E6's
  targets are on the live-like link, where it is 2.9 s; on slow 4G it is
  three times that.
- **Account's avatars** (E2): every reload fetches all of them (152 requests,
  1,041 KB in Chromium); cold, Chromium fetches 24 requests and WebKit 152.
  The second in-app visit in Chromium fetched 126 again (749 KB).
- WebKit (Windows build) locally is 2.5-4x Chromium's time as on 11-19
  (Admin cold 319 against 98; tab click about 110 against 12-24), and its
  Account and Admin cold loads are much nearer Chromium's than on 11-19 (436
  and 319, against 864 and 966). Its slow-link in-app visits are slower than
  Chromium's (Hall first 685 against 530, again 378 against 252), so the
  engine allowance (6c) matters on slow links too until E8.
- Not measured yet: Firefox (CI's `engines` job is its first run); "poor"
  with compression on (P11-R6), which waits for E4; the live site.

## As built: P11-D0 (2026-11-21)

The end-to-end measure is in the kit (above): `node ci/measure.mjs timeline`,
`frontend/tools/measure/timeline.spec.ts`. It changes nothing a player sees
or is sent: the worker and server marks go to their logs (never into a
message), behind a test-only switch, `PROXIC_TEST_TIMING`, off unless the
local stack is brought up with it (`docker-compose.local.yml`;
`scripts/check-test-switch.py` keeps it out of production, as
`PROXIC_TEST_DEALS`).

**How it joins up.** Each page's probe (put in before the page's scripts)
records the click, the answer sent, each match message's handler with its
JSON.parse apart, each React commit and the next frame after it; Chrome's
trace gives that frame's style, layout and paint, and CDP each message's
arrival. The server marks an answer read and written to the worker, each
worker frame read and done with, the pictures added, and every message put
on a socket (with the envelope's `messageId`, which the page sees). The
worker marks the answer read, the gate, Forge's thread waking, each board
round and each seat's board in it (Forge's view, the history added, the
hidden ids removed, written), each question built, each frame written, and
(added after the first trial run) each deliberate wait. A step is one answer
a player sends; its result on each page is the board or question it brought
(else a step or "who is asked" line), followed back through the server's
`out`, the frame it came from (type and ordinal: the pipe keeps the order),
to the worker. The container's clock is joined to the PC's from the answer's
round trip (offset -1.3 to +0.5 ms, round trip 1.0-3.7 ms over the run);
each step's total is the page's own clock, click to paint, whatever the
offset. Every step of every moment joined up in all 6 runs (0 missing), and
every trace synced.

**The moments.** One game of the mono-green deck, dealt (spec 0098) so the
host has Giant Growth and creatures early: **tap one land** (the first Forest
clicked paying for a creature: 1 round trip); **cast a spell with a target**
(Giant Growth: the card, its target, a land, to the spell on the stack on both
boards: 3 round trips); **a big combat** (at least 5 attackers that leave the
guest alive, no blocks, to the damage on both boards: 5 round trips, 8 boards
a seat). One game of the Karn deck, the host dealt Karn: **Karn's restart**
(the -14 to game 2's first board on both screens: 1 round trip, the guest's
board held under its report window, spec 0102). The bot waits for both pages
to be quiet, with someone asked, before each click; the time between steps is
in no slice.

**Today's numbers (RUN, 2026-11-21: 3 runs at 1x and at 4x, both pages slowed
at 4x; the owner's PC as C1, Playwright's bundled Chromium; local stack at
1e180970 plus this measure's marks, built 2026-11-21 with
PROXIC_TEST_TIMING=true).** Folder: `Phase 11 kit baseline
2026-11-21/timeline/` (`summary.md`, `timeline-chart.html`, one page per
moment; each run's `raw/` holds the records every step was joined from).
Milliseconds, medians of 3, summed over the moment's round trips; "own" is
the total less the deliberate waits; the parts add up to "own" (each is a
median, so within a few per cent).

```text
moment          cpu page   total   own | waits  Forge  boards worker pipe server network browser | of browser: React  frame  | hide  bytes in
tap one land    1x host     20.5  20.5 |     0    1.1    0.8    1.8   0.1   0.2     2.8    11.9   |   3.1   8.7 | 0.20   4.5 KB
                1x guest    20.4  20.4 |     0    1.1    0.8    1.5   0.1   0.3     1.4    14.0   |   2.7  11.2 |        5.2 KB
                4x host     55.2  55.2 |     0    1.3    0.8    1.6   0.0   0.2    18.9    34.2   |  20.2  13.4 | 0.15
                4x guest    30.6  30.6 |     0    1.3    0.8    1.4   0.1   0.3     3.3    24.1   |  13.3  10.0 |
cast w/ target  1x host     54.2! 54.2 |     0    7.0    2.1    4.9   0.2   0.9     9.0    32.1   |  10.3  21.3 | 0.38  16.5 KB
  (3 trips)     1x guest    53.3! 53.3 |     0    6.6    2.5    5.2   0.2   0.8     8.2    30.7   |   7.5  22.6 |       19.4 KB
                4x host    172!  172   |    0*    5.6    1.9    3.9   0.2   0.9    39.8   115.3   |  64.1  48.8 | 0.39
                4x guest   113!  113   |    0*    5.2    2.3    4.2   0.2   0.9     9.1    85.3   |  39.6  42.8 |
big combat      1x host   2494    93.5 |  2401   32.3    4.2    8.8   0.6   1.6    11.7    34.1   |  10.9  22.1 | 0.96  72.9 KB
  (5 trips)     1x guest  2517   116!  |  2401   30.7    5.5   11.1   0.2   3.9    11.2    51.6   |  11.1  40.1 | 1.19  86.0 KB
                4x host   2612   212   |  2401   32.2    3.9    7.5   0.3   1.7    40.4   121.7   |  61.0  56.3 | 0.94
                4x guest  2585   185   |  2401   30.7    5.0    9.6   0.2   1.4    29.1   107.3   |  55.8  47.9 |
Karn's restart  1x host   3268    68.8 |  3199   35.8    3.3    5.8   0.1   0.7    10.8    11.3   |   1.6   9.4 | 1.94  28.7 KB
                1x guest  3264    64.4!|  3199   35.8    3.3    5.6   0.1   0.6     2.2    13.9   |   1.5  12.1 |       26.4 KB
                4x host   3333   133   |  3199   34.9    3.5    5.8   0.1   0.5     5.1    82.6   |  14.5  67.5 | 2.01
                4x guest  3268    68.3 |  3199   34.9    3.5    5.6   0.1   0.4     3.4    21.2   |   8.0  11.5 |
"!" a total whose 3 runs are not all within 10% of the median. * one of the three 4x games (6,093 ms)
rested the spell on the stack (5.9 s, spec 0105); the other two did not, so the median has no wait.
waits: the stack's rest (spec 0105) and a passed step's pause (spec 0061, 400 ms each), on the worker's
game thread. Forge: everything else that thread does between the answer and the frame. boards: each
seat's view, history and hiding (HID-001). worker: reading the answer, the gate, a round's shared work,
writing frames, building questions. browser: input, parse, handler, React, the frame (waiting for it,
style, layout, paint). frame = waiting for the next frame + style + layout + paint + the rest of it.
```

- **The deliberate waits are nearly all of what a player waits for** where
  they happen: 2.4 s of a 2.5-2.6 s combat (six passed-step pauses of 400 ms,
  92-96%), 3.2 s of Karn's 3.3 s restart (the stack's rest, 96-98%), and 5.9 s
  when a cast spell rests on the stack (one game in three here). They are
  owner-approved pacing (specs 0061, 0105), not work, and P11-R1 covers any
  change to them; no efficiency item touches them.
- **Of the system's own time, the browser is the biggest part for the tap,
  the cast and the combat**, on both pages at 1x and 4x: 58-69% of the tap
  and the cast at 1x, 36-45% of the combat at 1x (Forge, 31-32 ms, is next),
  57-79% of all three at 4x. Inside it, React's render and commit (3-64 ms a
  moment) and the frame after it (9-67 ms: waiting for it, then paint, 1-17
  ms) are the two biggest slices; parse and the handler are under 1 ms.
  **Karn's restart is Forge's**: building game 2 is 35-36 ms, 52-56% of the
  own time at 1x and of the guest's at 4x; only the host's 4x page (65
  commits, the frame 67.5 ms) puts the browser ahead. The "network" column at
  4x is mostly the page too: Chrome stamps a frame's arrival as the page's
  main thread takes it (INFERENCE from RUN: arrival to handler is 0 ± 0.2 ms
  in every step, and the slice grows up to 8x only when nothing but the
  page's CPU is slowed, host tap 2.2 to 17.1 ms), so the page's own queue is
  in it.
- **The server, the pipe and the worker are a few milliseconds:** server
  0.2-3.9 ms and pipe 0.0-0.6 ms per moment, worker (not Forge) 1.4-11 ms,
  each seat's board 0.8-5.5 ms of which **hiding is 0.15-2.0 ms**. Hiding
  stays on the server (HID-001); it is the smallest slice that matters.
- **Forge itself:** 1.1-1.3 ms for a land tap, 5-7 ms for the cast's three
  answers, 31-36 ms for the combat and for building game 2.
- **Bytes, on a real link (INFERENCE: arithmetic on the RUN bytes, the
  network not measured here, everything is on one PC):** a combat brings each
  seat 73-86 KB over 8 boards. At slow 4G's 1.6 Mbit/s that is about 0.43 s of
  transfer a seat, at live-like 10 Mbit/s about 69 ms: more than all the
  system's own time measured here. Locally the network is the loopback.
- Steady: the combat and Karn's totals and "own" time, and the 4x tap, are
  within ±10% over 3 runs; the 1x tap (14-21 ms) and the cast (49-67 ms at 1x,
  154-194 at 4x without the rest) are not: small numbers, and the cast's game
  differs run to run. 174 of the file's numbers are outside ±10%, nearly all
  sub-millisecond slices.

**Does the plan's order (steps 2-9) still fit? Mostly; one change
recommended.**

1. **Step 2, D2 (compression), stays first.** Locally the wire is free, but
   on the links players use, a combat's 73-86 KB a seat costs about 70-430 ms
   (arithmetic above), more than everything else measured here except the
   deliberate waits. D2 is the cheapest cut of that, and its server cost is
   measured in D1 (1.9 ms CPU per board).
2. **Pull C3 and C4 forward, to beside step 3 (recommended reorder).** React
   and the frame are the largest slices of the system's own time in the tap,
   the cast and the combat, at 1x and 4x, on both seats (Karn's restart is
   Forge's). C3 (the glide pass only for cards that
   moved) and C4 (GameScreen and plates only when their data changed) do not
   need D4's shared unchanged cards; only C2 does. Doing them earlier turns
   the biggest measured slice down before the delta work, and C6's budgets
   follow them. C2 stays after D4, as the plan says.
3. **D3 and D4 (steps 4-5) stay where they are,** for bytes (the real-link
   cost above), not for local time: parse is under 1 ms a moment and the
   server's part 0.2-3.9 ms, so deltas save little on the page except through
   C2.
4. **D7 can be closed as measured:** worker to server is 0.0-0.6 ms of pipe
   and 0.2-3.9 ms of server a moment (pictures 0-0.1 ms); the plan said to
   close it unless D1 showed server time mattered, and this shows it does
   not.
5. **D5 (bundles) stays at step 7:** each board is its own commit and frame
   (a combat: 8 boards a seat, 33-41 commits), so it may cut frame waits, but
   C3/C4 first make each commit cheaper.
6. **For the owner, not this phase's efficiency work:** the waits are what a
   player feels. Six 400 ms passed-step pauses make a no-block combat take 2.4 s
   before the damage; Karn's restart rests 3.2 s; a resting spell 5.9 s. If
   they feel long, that is a look decision (P11-R1), not an efficiency item.

Not measured: Firefox and WebKit (the probes need Chrome's DevTools
protocol), a real network link, spectators (no spectator in these games), and
the time from the network to the page's main thread (inside "network", see
above).

## As built: P11-D2 (2026-11-22)

**What changed.** The sockets compress (permessage-deflate, RFC 7692) when
the browser offers it, which every browser does: `SocketCompression.kt`,
installed in `Application.kt`'s `WebSockets` block (one line). Each
connection keeps its own compressor's window between messages, so a board
that is mostly the board before costs a few hundred bytes. Messages under
64 bytes go as they are. Nothing a player sees changes; the messages are the
same, only their bytes on the wire.

- **Not Ktor's `WebSocketDeflateExtension`, for two reasons found while
  building it** (RUN: the 2.3.13 jar's bytecode, and the wire tests):
  - its inflate has **no output limit**: the 1 MB frame ceiling is checked
    before inflating, so a client's 1 MB frame could become about a gigabyte
    (what §1.100 forbids). Ours stops at 1 MB and ends the session
    (`SocketCompressionTest`, `SocketCompressionWireTest`: a 2 MB bomb in a
    2 KB frame is closed, not answered; with the limit mutated away both
    tests fail);
  - Ktor 2.3 writes a reply's parameters after a **comma**
    (`permessage-deflate , client_no_context_takeover`), which a browser
    reads as a second, unknown extension and fails the connection. Ours
    writes the reply whole with semicolons.
- **It is on every socket, not only the game's:** Ktor 2.3 negotiates
  extensions for the whole `WebSockets` plugin, not per route. The lobby and
  system sockets carry no secrets and gain the same way.
- **HID-001 still holds:** one compressor per connection, fed only what that
  connection is sent. A seat's stream is that seat's own view, with hidden
  cards already removed by the worker (`HiddenIds`), and a spectator's is the
  public view, so no stream holds another viewer's secret whose size could be
  guessed at. Chat (the only text another player chooses) is on the lobby
  socket, which carries nothing secret.
- **It degrades safely** (RUN): a client that offers nothing, or an offer we
  can't honour (a smaller server window), gets no reply header and plain
  frames (wire test, a real Netty server read byte by byte; Ktor's test
  engine can't negotiate extensions, so a test through it would pass with
  compression off). In a real browser game, the measure's relay dropping the
  browser's offer (`PROXIC_MEASURE_NO_DEFLATE=1`, as a proxy that strips the
  header would) played every moment, 100.1% of the bytes on the wire (frame
  headers).
- **The measure:** `tools/measure/wire.ts` `tap`, a pass-through relay in
  front of each player's page in the redraw measure's real game, counts the
  match socket's bytes as they cross (`matchWireBytesIn`, and `wireShare`
  against what the page read). `scripts/measure-wire.py` has a "streamed"
  column: the Lab boards deflated as the server now does.

**Numbers (RUN, 2026-11-22, the owner's PC as C1, bundled Chromium, local
stack built from 5586c120 plus this change only; the redraw measure's real
game at 1x, 3 runs on, 3 runs with the offer dropped, on the same build).**

```text
per seat                      bytes the page read       bytes on the wire, on       share   wire, offer dropped (share)
1x combat (9 s)               535-716 KB                18.8-22.3 KB                3.1-3.5%   565-681 KB (100.1%)
1x cast (6 s)                 241-343 KB                 8.1-11.4 KB                3.0-3.5%
1x whole game                 2.9-4.8 MB                 116-173 KB                 3.6-4.0%   3.2-3.9 MB (100.1%)
Arena Server CPU per board (whole game, both seats): on 2.15-2.27 ms (median 2.21), offer dropped 2.05-2.41 (2.14)

Lab, scripts/measure-wire.py over the 1.75.0 run's traces (boards only)
                 board median / p95     deflated alone (before: no shared window)   streamed (as sent now)
fixed 16          5,674 / 10,166          868 / 1,239 (15.1%)                         85 / 195 (1.7%)
all 432           3,384 / 7,560           717 / 1,081 (19.1%)                         64 / 184 (2.1%)
```

- **Target: bytes per board about a fifth. Met many times over:** about
  1/27 on the wire in real games (3.1-4.0% of today's, all match messages and
  frame headers counted), 1/50-1/60 in the Lab's boards alone. The row's
  "a fifth" was deflate of one board alone; keeping the window between boards
  is what does the rest.
- **Server CPU per board: +0.07 ms (+3%) on the same build,** within the
  runs' own spread (2.05-2.41 off). Against D1's 11-21 baseline (1.74-2.07,
  median 1.86) today's build is higher with compression off too, so that gap
  is the build and the day, not D2. zlib itself is about 10 microseconds per
  Lab board at level 6 (RUN, Python's zlib, the same library; level 1 is
  2.6 us but twice the bytes).
- Messages per second and boards per game are unchanged (the game varies run
  to run, as D1 found).
- **On a real link (INFERENCE: arithmetic on the RUN bytes):** a combat's
  73-86 KB a seat (D0) becomes about 3 KB; at slow 4G's 1.6 Mbit/s that is
  about 15 ms of transfer instead of about 430 ms, at 10 Mbit/s about 2 ms
  instead of 69.
- Memory: zlib's own formula gives about 256 KB for the compressor and 32 KB
  for the inflater per open socket (INFERENCE, not measured), freed with the
  connection.
- **Not measured:** 4x (nothing here runs on the page's main thread:
  Chrome inflates in its network process, INFERENCE); D0's timeline (locally
  the network is the loopback, so it can't show the saving; and the server's
  `out` mark is taken before the socket compresses); Firefox and WebKit (both
  offer the extension; untested here).
- **Owed, for the owner: the Unraid check.** On the live site, open a game,
  then the browser's DevTools, Network, the `/ws/matches/…` row, Headers: the
  response should say `Sec-WebSocket-Extensions: permessage-deflate;
  client_no_context_takeover`. If it is missing, Cloudflare's tunnel dropped
  the offer and the game runs exactly as before, uncompressed (the case
  proved above). The Size column of the Messages tab doesn't show the
  compressed size; the header is the check.

## As built: P11-E9 (2026-11-22)

**The cause was ours, and it was not the password hash** (RUN, 2026-11-22,
local stack). Timed directly, `/api/auth/login` took 1,117-1,324 ms for the
first two sign-ins of each burst and 97-124 ms after; a wrong password and an
unknown name took 93-129 ms every time. So not the hash's cost, not a CPU
limit (the container has none), not a re-hash, not a cold JIT and not the
timing dummy. Two thread dumps taken during a slow sign-in found the request
thread (a Netty event-loop thread) in
`Inet6AddressImpl.getHostByAddr` under `NettyConnectionPoint.getRemoteHost`
under `clientSource` (`AuthRoutes.kt`): **a reverse DNS lookup of the peer's
address**, which in Docker is the bridge's and takes about 1.1 s to fail
(the resolver remembers the answer briefly, hence fast repeats).

**The fix:** `clientSource` uses the peer's address as written
(`request.local.remoteAddress`, no lookup). The throttle and the sign-in log
see the same value as before in practice: the lookup never found a name in
Docker, so it always gave back the address. Every route that calls
`clientSource` (sign-in, the Account page's current password, device links,
invitations, resets, Deck Builder sends) stops paying it. AUTHENTICATION.md
says so.

```text
RUN, the loading measure, Chromium, local link, 3 runs (before: the 2026-11-21 kit baseline)
                                   before                after
sign-in click to a usable lobby    1,427-1,431 ms        277-293 ms        target <= 600 ms local: met
/api/auth/login, server time       1,133-1,142 ms        108-124 ms
direct, 8 sign-ins in a row        1,117-1,324 then 97-124    111-151 (271 the first after a restart: JIT)
every other page, local            unchanged (lobby cold 107-108, one first-after-restart run 220)
```

- **Live, this was never paid** (INFERENCE from the code): behind Cloudflare
  every request carries `CF-Connecting-IP`, which `clientSource` reads first,
  so the lookup only ran for requests without it: the local stack, or anyone
  reaching the Unraid box's LAN port directly.
- **What's left is the hash itself:** Argon2id at 64 MB, 3 passes (OWASP's
  floor), about 100-120 ms here. Unchanged, and not to be lowered without the
  owner.
- **Owed, for the owner: the Unraid figure.** The target is ≤ 300 ms server
  time on the Unraid box. On the live site, DevTools, Network, the
  `/api/auth/login` row, Timing, "Waiting for server response", less a normal
  request's (about 150-250 ms round trip, Loading section above). If the
  difference is well over 300 ms, the Unraid CPU makes the hash slower than
  here, and the only lever left is the hash's strength: an owner choice, not
  an efficiency fix.
- Measured in Chromium only (the cause is on the server, the same for every
  engine).

## As built: P11-F1, CI part (step 1, 2026-11-21)

- **CI job `engines`** (`.github/workflows/ci.yml`, "Other engines
  (firefox|webkit)"): on its own candidate stack, the test accounts and the
  green deck, Playwright's bundled Firefox and WebKit (`npx playwright
  install --with-deps <engine>`, cached per engine) run the loading measure
  on the local and slow-4G links: sign-in, every page and every Admin tab,
  the five header pages in the app, a room, a game started and loaded, and
  spectate. Its numbers are printed and uploaded (`engines-<engine>`
  artifact), not enforced (P11-R6). Firefox runs only there (the decision 11
  correction above).
- **Not yet in the release gate:** the job is `continue-on-error` and
  `publish` doesn't need it, because Firefox has never run this suite
  anywhere: the first CI run is its first run. RUN locally: WebKit passed
  the same spec (the local link, both tests, 1.4 min) and the full kit (four
  links, 3 runs, below). Firefox: not run (it can't start here).
- **Owed to finish F1** (next): a short game played to its end in Firefox and
  WebKit (the smoke set's "one short game"; today's job starts a game and
  loads it, it doesn't play it), then the job joins `publish`'s needs once
  it has been green on main. And the avatar comparison in all three engines
  (E2's first step) on CI's Firefox.

## As built: P11-F3 (2026-11-21)

**What a brand can change on its engine, and how Proxic is affected.** Read
from each browser's documented behaviour (SOURCE: the brands' own help pages
and the engines' release notes, as gathered in `Phase 11 loading and net deep
dive.md`, "Cross-browser"); what it means for Proxic is INFERENCE until the
named check has run. "Proof" is the test that settles the row: an automated
one where an engine can show it, P11-F2's hand checklist where only the brand
can.

| Behaviour | Where it differs | How Proxic is affected | Proof |
|---|---|---|---|
| Hidden-tab timers | Chromium brands (Chrome, Edge, Brave, Opera, Vivaldi): timers at most once a second when hidden, once a minute after 5 minutes hidden ("intensive throttling"). Firefox: a per-tab budget. Safari: stricter still. | The lobby's liveness check runs on JS timers (`lobby.ts` `connectLobby`: `PING_MS` 20 s, `QUIET_MS` 45 s): a once-a-minute timer can see "nothing heard for 45 s" and drop a healthy socket. The hard pause's 2 s / 5 s heartbeat (owner decision 6, Q7) is exposed the same way. | P11-E13's browser test (a tab hidden 10 minutes keeps its socket, all three engines); F2 per brand |
| Tab freezing and sleeping | Chrome Memory Saver and Energy Saver, Edge sleeping tabs (on by default), Brave's and Opera's memory savers, Vivaldi's hibernation, Safari | A frozen page runs no JavaScript and can't answer the server; its socket stays open. Owner's answer (2026-11-19): connected while the connection is open; the game pauses only if it really drops. | E13 (designed to it); F2: a tab hidden 10 minutes, then back, on each brand |
| WebSocket over HTTP/2 or HTTP/3 | Firefox uses WebSocket over HTTP/2 (RFC 8441) when the server offers it; Chromium and WebKit opened a connection of their own, live (378-474 ms against 148-187 ms per request, 2026-11-19) | The avatar wait (E2) and the game socket's first message (E12) | E1's socket timings per engine (local: `loading-*.json` `socketMessages`; live: `livews.mjs` in the deep dive's kit); E12's research |
| Lazy-loading distance | Chromium loads `loading="lazy"` images 1,250-2,500 px ahead; WebKit (Windows build) fetched all 132 avatars on Account; Firefox nearer (unmeasured) | Account's avatar picker, the Deck Depot and the Hall: how many pictures a page fetches up front | E1 per engine (`images`, `imageKb` on Account); E2's "≤ 40 fetched up front" in all three |
| Image cache across reloads | Firefox keeps one decoded-image cache per browser; Chromium per page, then the disk cache | How soon a reload shows pictures (avatars, card art) | E1 `reload` rows per engine (`images`) |
| HTTP cache heuristics | With no Cache-Control or validator, each engine guesses how long to keep a file; ours sends neither on the sign-in files (E3) | Locally, re-fetched on reload (live, Cloudflare adds `max-age`) | E1 `sign-in reload` bytes per engine; E3 makes them 0 |
| `immutable` | Firefox and Safari honour it; Chrome revalidates nothing on a normal reload anyway | None (E3's header is right in all three) | E3's header test |
| Tracking protection | Brave Shields, Edge Tracking Prevention, Firefox ETP (strict), Safari ITP | Unlikely: one origin, no third-party calls or storage. Shields "strict" must not block the sockets | F2: sign-in, lobby, a game with Shields strict (Brave), ETP strict (Firefox), Prevention strict (Edge) |
| Storage limits and eviction | Safari deletes script-written storage after 7 days unused; every brand partitions third-party storage | Only if E2/E8 keep data in browser storage: it is a hint, never the truth (the server's answer wins) | E2/E8's tests with storage empty; F2 on Safari |
| Picture formats | WebP everywhere on the support list; AVIF in Chrome 85+, Firefox 93+, Safari 16+ | E11's choice (owner: WebP) is safe on every supported browser | E11's picture test in all three engines |
| Fonts | woff2 everywhere on the support list | None (the .woff copies are never fetched) | E14's screenshot compare |
| `fetchpriority`, `modulepreload` | Chromium and Safari in full; Firefox `modulepreload` from 115, `fetchpriority` from 132 | E5/E6 use them; harmless where ignored, but the gain may differ by engine | E5/E6 measured per engine with E1 |
| Network emulation in tests | Chrome's DevTools emulation (CDP) exists in Chromium only | The 2026-11-19 slow-link numbers were Chromium-only | E1's relay (`tools/measure/link.ts`) makes the links the same in every engine |

## As built: P11-F4 (2026-11-21)

The owner's support list (2026-11-19) is **AGENTS.md UI-007**, beside UI-006:
supported (tested; a problem is a defect) Chrome, Edge, Firefox and Safari on
a Mac, current and previous version, at 1920x1080 and above; best effort,
checked by hand before a phase is accepted, Brave, Opera and Vivaldi; best
effort, untested, phones and tablets (UI-006). Its gate is CI's engine smoke
set from F1, written in the rule as **owed until F1 lands** (today the
`engines` job runs, outside the gate, as above).

## As built: step 2 part B -- P11-E3, E4, E14, E16, E17 (2026-11-22)

Five small loading items, built together because they touch the same answers.
Nothing a player sees changed (E14's compare below). Not committed.

**How it was measured (RUN, 2026-11-22).** The second local stack
(`http://127.0.0.1:8081`, project `proxic-arena-b`), the owner's PC as C1
(13th Gen i5-13600KF, 32 GB), Playwright's bundled Chromium and WebKit,
`node ci/measure.mjs loading --engines chromium,webkit --links local,slow4g`,
3 runs before and 3 after, on the pages these items touch (every page: the
cache rules and compression cover every answer). The before was taken on the
same stack, rebuilt from main (5586c120) just before, rather than the
2026-11-21 baseline folder, so both sides ran on the same stack and the same
day (the baseline was on the first stack); its numbers agree with the
baseline's within the run-to-run spread. The after was built from main plus
only these items (the other builder's socket compression, D2, and sign-in
work, E9, were left out of that build). Of 156 after "usable" times, 143 are
steady to ±10%; every byte and request count is.

**What changed.**

- `server/.../HttpEfficiency.kt` (new), installed from `Application.kt`
  (`installHttpEfficiency()`, one line, and the two index.html answers now
  `call.respondPage`): Ktor `Compression` (new dependency
  `ktor-server-compression-jvm`, pinned by `ktorVersion`, lockfile updated);
  the `/api` cache rule; the page's ETag and build tag; `Vary:
  Accept-Encoding` on everything compressible.
- `auth/SignedInGate.kt` `keepOnlySuccesses`: one branch more, for the
  sign-in files (a cache rule; nothing in the gate's decisions changed).
- Frontend: fonts declared once (`styles.css`; the `@fontsource` imports gone
  from `shell/base.css` and `Board.tsx`, the package removed); the 700
  preloaded (`index.html`); `HallPage.tsx` reads the Hall once per load;
  `shell/PageNotices.tsx` and `status.ts` `buildTagOf` (the version check).
- Tests: `HttpEfficiencyTest` (5 tests, two signed-in users), the gate's
  sign-in file assertion in `AuthApiTest` (one assertion: was "no header"),
  `fetchOnce.test.tsx` (4), `status.test.ts` (`buildTagOf`). Each bites:
  removing the `/api` rule, compressing POSTs, compressing `/api/auth`,
  dropping the public sign-in rule, dropping the 304, compressing fonts, or
  dropping the Hall's skip each fails a test (TEST-004).
- The measuring kit: `tools/measure/link.ts`, a relay bug found by this
  item, below.

**Before and after (medians of 3; usable ms / KB).**

```text
Chromium                  local usable   slow4G usable    KB (cold or reload)     API calls
sign-in cold                 39 ->   41    1679 -> 1079    301.8 -> 154.1           1 -> 1
sign-in reload               32 ->   21    1503 ->  203    301.8 ->   1.1           1 -> 1
sign-in click              1432 -> 1422    4546 -> 2552    556.3 -> 119.1           6 -> 5
lobby cold / reload       106/48 -> 113/36  3323/2133 -> 2204/728   497/269 -> 213/3.7   5 -> 4
Hall cold / reload        134/59 -> 117/49  3632/1873 -> 2282/577   651/269 -> 384/2.4   4 -> 2
Deck Depot cold / reload  113/54 -> 121/43  3486/1872 -> 2289/559   514/268 -> 263/2.5   3 -> 2
Account cold / reload     118/55 -> 109/48  3165/1704 -> 2056/387   465/1047 -> 197/785  4 -> 3
Admin cold / reload        94/39 ->  93/28  3414/1692 -> 2125/406   536/284 -> 226/10.8 10 -> 9
Status cold / reload       83/52 ->  70/46  6775/1708 -> 2982/393   1127/223 -> 361/2.6  3 -> 3
room cold / reload        138/54 -> 117/58  3348/1874 -> 2225/578   504/269 -> 220/4.3   5 -> 4
game cold / reload        162/68 -> 171/73  8592/2415 -> 4573/1111  1526/302 -> 697/2.2  3 -> 2
spectate cold / reload    176/75 -> 187/73  8636/2470 -> 4523/1111  1557/323 -> 725/2.2  3 -> 2

WebKit                    local usable      slow4G usable           KB (cold / reload)
sign-in cold / reload      95/70 ->  98/48  2227/1551 -> 1109/246   302/302 -> 154/84
lobby cold / reload      396/322 -> 411/295  3403/2255 -> 2249/953   497/497 -> 212/53
Hall cold / reload       363/307 -> 340/272  3539/2216 -> 2389/805   651/651 -> 383/233
Admin cold / reload      310/239 -> 320/220  3502/1877 -> 2191/584   536/537 -> 225/65
Status cold / reload     415/232 -> 404/215  7920/649 -> 2898/621    1331/1331 -> 360/32
game cold / reload       567/386 -> 515/348  8915/2579 -> 5027/1243  1545/1546 -> 714/164
spectate cold / reload   580/433 -> 551/370  8952/2658 -> 5133/1256  1555/1555 -> 723/173
In-app visits (header clicks) are unchanged in both engines within the spread, except the version
check and the Hall's second read gone (Hall again on slow 4G: 6 -> 1 request).
```

- **On slow 4G every page is faster, in both engines:** cold loads -34% to
  -56% (game 8.6 s -> 4.6 s, Status 6.8 s -> 3.0 s), reloads -60% to -88%
  (sign-in 1.5 s -> 0.2 s). WebKit's reloads gain less than Chromium's
  (lobby 2255 -> 953 against 2133 -> 728): WebKit still fetches some
  pictures and the page's own chunks on a reload (53 KB lobby, 164 KB game).
- **Locally (no link) a few cold loads are slower by a frame or less**
  (P11-R7): Chromium game cold 162 -> 171 ms, spectate 176 -> 187, Deck
  Depot 113 -> 121, lobby 106 -> 113; WebKit lobby 396 -> 411, Admin 310 ->
  320. That is the gzip work with nothing to save on a loopback. Others are
  faster locally (Hall 134 -> 117, Status 83 -> 70, room 138 -> 117).

**P11-E3 -- cache rules for the sign-in files and the page. Target met.**
Hashed sign-in files say `public, max-age=31536000, immutable` (they are
the same for everyone; the signed-in ones stay `private`, as spec 0060 has
them). index.html stays `no-cache` and now has an ETag: an unchanged page is
a 304 with no body. **Reload of sign-in: code fetched 204 KB -> 0** in both
engines (Chromium's whole reload is 1.1 KB: the 304 and `/api/auth/me`;
WebKit's 84 KB is the sign-in picture, which it fetches again on a reload).
`updateReload` still covers a page open across an update; the page itself is
still asked for every time.

**P11-E4 -- gzip. Partly met: every first visit is about half; the two byte
targets are not reached.** gzip (level 6, Ktor's default) on GET answers of
HTML, CSS, JavaScript, JSON and SVG of 1 KB or more; never pictures or fonts
(`matchContentType`); `Vary: Accept-Encoding` on each. Brotli: Ktor 2 has no
encoder; not added.

- Lobby first visit 497 -> 213 KB (target 200): the rest is the two fonts
  (44 KB woff2, already compressed) and pictures (13 KB).
- Game page first visit 1,526 -> 697 KB (target 500): its code is 1,075 ->
  438 KB, but the board's chunk holds 145 KB of base64 PNGs, which hardly
  compress (that chunk: 460 -> 219 KB), and the card pictures are 122 KB.
  **E6** (mana pictures as files) is the item that takes it under 500.
- **Server CPU per request (P11-R5),** the Arena Server's own CPU
  (`/proc/1/stat`), 60-100 reads each, 3 rounds, local stack:

  ```text
                         bytes     gzip   CPU ms/request plain   gzip
  board chunk          460,459  218,464   6.2-23.3             17.0-24.8   (+9-11 ms)
  entry JS             208,380   68,340   3.0-7.3              8.0-10.0    (+3-5 ms)
  entry CSS             14,417    3,423   1.8-3.0              1.8-2.2
  /api/admin/sign-ins   14,194    1,291   1.4-9.0              2.2-8.9     (within the noise)
  ```

  A first visit to the game page after an update costs the server about 30
  ms of CPU once (each file is then kept by the browser for a year); JSON
  lists cost nothing measurable. The Unraid box is slower than this PC
  (INFERENCE: not measured there).
- **BREACH, checked per route (SOURCE, 2026-11-22).** BREACH needs one
  compressed body that holds both a secret and text an attacker chooses.

  | Answers | Secret in the body? | Attacker's text in it? | Compressed? |
  |---|---|---|---|
  | Built files, `/assets/*` | no (the same build for everyone) | no | yes |
  | The page (index.html) | no (the build tag is a hash, public in effect) | no | yes when 1 KB or more (today 871 B: no) |
  | `/api/auth/**`: sign-in, me, join, reset, device codes, device link | the device link answers a device token; device codes a one-time code | the names typed | **never** (excluded by path) |
  | `POST`/`PUT` answers anywhere: invitations (the link, once), a reset sent, an account made | the invitation link | the email typed | **never** (only GET is compressed) |
  | `/api/admin/email` | SMTP settings (the password is never sent back, but excluded anyway) | the admin's own | **never** |
  | `/api/deck-builder/**` | none in the body (the token is a request header) | deck names | **never** (excluded; small) |
  | GET lists: lobby, decks, Hall, rooms, matches, admin lists, reports, account | none: the session and CSRF tokens are cookies, never a body; invitation tokens are never listed (`InvitesResponse`) | yes (names, deck names, chat, reports) | yes |
  | Card pictures, avatars, fonts | no | no | never (type) |
  | Sockets `/ws/**` | not this item (D2) | | **never** by this plugin (excluded by path) |

  So no compressed body mixes a secret with attacker-chosen text. Live,
  Cloudflare already compresses what reaches the browser (zstd), so the
  browser-side exposure is Cloudflare's either way; this compresses the hop
  from the Unraid box to Cloudflare. Guard: `HttpEfficiencyTest` "text is
  gzipped, pictures fonts and secrets are not" and "only reads outside the
  secret-bearing routes are compressible"; a new route that hands out a
  secret on a GET outside `/api/auth` must be added to `NEVER_COMPRESSED`.

**P11-E17 -- API answers carry a cache rule. Target met.** Every `/api`
answer that does not set its own now says `private, no-store` (refusals and
errors too). The routes that set their own keep them: pictures (`private`,
a year), deck rules (`private, no-cache`). No ETag on the admin lists: E7
reworks them (each list kept and refreshed behind), so a validator waits
for E7.

**Cache safety, proven with two people (E3 + E17).** `HttpEfficiencyTest`
"no signed-in answer may be kept by a shared cache, for either of two
people" signs in as an administrator and a player and reads `/api/auth/me`,
`/api/version`, `/api/decks`, `/api/hall`, `/api/rooms`,
`/api/system/status`, a missing `/api` address, an administrator's list and a
stranger's refusal: each says `private, no-store`; a signed-in built file
says `private`; the two people's `/api/auth/me` differ. "What a shared cache
may keep is the same for everyone" reads each `public` file as a stranger
and as both people (one body, byte for byte), and the page at three
addresses as all three: one ETag, one body, `no-cache`, and a 304 for each
with the tag.

**P11-E14 -- fonts declared once, the bold preloaded. Target met; no look
changed.**

- Before: the project's four Barlow Condensed files (`styles.css`) plus
  `@fontsource/barlow-condensed` 500/600/700 (`shell/base.css` and again in
  `Board.tsx`): 23 font files built (9 woff2 + 9 woff from fontsource), the
  faces declared twice on most pages and three times on the game page. Now
  11: the same four, the card-title face, and fontsource's Latin Extended
  and Vietnamese files for 500-700 as project files, declared once in
  `styles.css` with their `unicode-range` (so a name with, say, "ő" still
  gets Barlow, as before). The Latin files were the same font: Barlow
  Condensed 1.408 in both, the same outlines, advances and kerning for every
  shared character (fontTools, every glyph and every kerning pair compared);
  the project's adds combining marks, fontsource's adds "⁴".
- Preloaded: the **700** only (`index.html`), the one face every page draws
  (sign-in, every signed-in page and the table; seen in the page's loaded
  fonts). The 600 is on every signed-in page but not on sign-in or the
  table, where a preload would fetch it for nothing, so it is left to the
  styles. The row asked for two; this is one, for that reason.
- **Screenshot compare (RUN):** sign-in, lobby, Hall, Deck Depot, Account,
  Admin, Status, `/dev/board` (the table, 167 runs of display-face text) and
  `/dev/bench`, before and after, 1920x1080, Chromium, animations paused:
  every display-face text run sits at the same place with the same size to
  1/1000 px on every page. Pixels: sign-in, Account, Status, bench and the
  in-app pages identical; the rest differ only where two "after" runs
  differ from each other (the pulsing Connected dot, the Admin sign-in
  count, a deck tile), except `/dev/board`, where a few dozen single pixels
  on the edges of turned cards and the art differ (anti-aliasing of rotated
  layers; no text pixel). Not compared: Firefox (it does not start here),
  and a real game's table (the dev board is its stand-in).

**P11-E16 -- each fetched once per load. Target met.**

- `/api/hall`: read twice on every cold Hall load (on opening, and again when
  the lobby socket's first STANDINGS arrived, the list as it stood on
  joining). Now once (`HallPage.tsx`: the first STANDINGS after opening
  doesn't re-read; a later one, a finished game, still does; the latest read
  wins). Hall cold: 4 -> 2 API calls.
- `/api/version`: read on every page load (the update check's starting
  point). The server now writes which build served the page into it,
  `<meta name="proxic-build">`, the first 16 hex of SHA-256 of the build id
  (`HttpEfficiency.kt` `buildTag`), and the check compares `/api/version`'s
  id hashed the same way (`status.ts` `buildTagOf`), so it reads only on the
  minute and on focus. Without the meta (Vite, a build with no id) it reads
  on opening, as before. The hash names no commit; a stranger learns only
  that the page changed with a build, which its ETag says anyway. One API
  call fewer on every page load.
- `/api/matches/watch`: **read once per spectate load** in the before
  measure too (spectate cold: me, version, watch); the second read the
  paper saw on 11-19 is `WatchPage`'s own 3-second poll (`ROOM_LOOK_MS`)
  landing inside a slow load. Unchanged.

**Found on the way: the measuring relay reordered bytes** (ROADMAP Flakes).
The first after-run's game page on slow 4G never became usable: a module
"does not provide an export named 'B'", and `net::ERR_INVALID_HTTP_RESPONSE`
in a later try. The server's bytes, captured at the relay, framed correctly
every time; the relay (`link.ts`) gave each chunk its own timer, and an
instrumented run caught one writing a body's 5-byte chunked terminator
before its last 5.9 KB. gzip makes many small chunked writes, so it showed
now. Fixed: one queue and one timer per connection, the end through the same
queue. The before-run used the old relay without a failure; the link model
(delays and pacing) is unchanged.

**Not done here, left open:** "poor with compression on" (P11-R6) can be
measured now (not run: targeted measuring); Firefox (does not start on this
PC); the live site through Cloudflare (it compresses already; the origin hop
is what changed); brotli.
