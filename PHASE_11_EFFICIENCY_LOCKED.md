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
  **Amendment, owner 2026-11-25 (by prompt: "Add it"):** the hidden
  checks this gate requires also include `check-hidden-information.py`
  (P11-B4's board-shape check, already run over the rebuilt boards since
  P11-D4). The list above is kept as first written.
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
| P11-A10 | **A mill can jump on the other player's screen** (owner, 2026-11-22, from the test sweep e1af4ede): when Thought Scour (mill two) resolves in the same turn as Screeching Skaab's mill, before Pat's first draw, Pat's Library tile goes 69 to 67 at once with no card streaming. `match-small-fixes` now casts Thought Scour on a later turn (as every earlier run did); reproduce with them in one turn, find the cause in the board's tile-run/stream code, fix with a test that fails first, jump check over the mill scenarios. | S | clip | 17 (with A6, A7) |

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

**Owner answers, 2026-11-22 (after P11-E2):** while an avatar is unknown the **default face stays** (no empty circle; no look change). The last swap — a freshly opened room's other seat — is fixed by **adding the avatar to the room data, done with E5** (the start-up chain), not separately.

**Owner answers, 2026-11-25 (after P11-D4, E7 and E8), by prompt:**
- **Admin's outcome line waits for the re-read list** (E7): "Keep new order".
  After an admin action the outcome line and the updated list appear
  together, about one read later than before, so the list is never stale
  beside it.
- **P11-R4 names `check-hidden-information.py`**: "Add it" (amendment
  under P11-R4).
- **WebKit allowance for two first visits** (E7/E8 targets, slow 4G):
  "Accept the exception". Measured quietly on a3aa4020, 3 runs, WebKit:
  Admin in-app first 368 ms (was 832), Hall in-app first 382 ms (was 639),
  against the 300 ms target; Chromium meets it (235, 243). Every other
  E7/E8 number met its target in that run (tab clicks 107-114 ms, revisits
  127-145 ms, cold by address 1,701-1,797 ms).

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

## As built: P11-E2 (2026-11-22)

**The cause, in Chromium (RUN, local stack):** a person's avatar name reached
a page only with the lobby socket's PLAYERS list (`lobbyView.ts` `avatarOf`),
so a page that drew people from its own data first drew the default face and
swapped it when the list landed. Measured before this change (the loading
measure's new avatar probe, below): the Hall's 11 portraits swapped on every
reload in both engines (and cold in WebKit), your own on Account on every
load, and the other seat in a room. The live socket's slow open in Chromium
(378-474 ms, 2026-11-19) makes that wait longer there. **Why Firefox looked
instant is not confirmed** (Firefox does not start on this PC). The
inference: Firefox opens the socket over the page's own HTTP/2 connection
(RFC 8441, F3's table), so PLAYERS lands within a request's time and the
swap is too quick to see. Owed to CI's `engines` job (see "What CI must
confirm" below).

**What changed.**

- The data that names a person carries their avatar's name, for an
  **active** account only (as PLAYERS lists them, so a disabled player keeps
  the default face the page always gave them):
  - `/api/auth/me` and signing in: `UserView.avatar` (`Accounts.avatarOf`);
  - `/api/hall`: `HallView.avatars`, for every player it names
    (`HallView.named`), looked up by `AccountNames.avatarsOf`;
  - `/api/admin/accounts` (`AdminAccountView.avatar`) and a deck's shares
    (`ShareRecipient.avatar`).
- The page keeps every name it learns for the tab (`knownAvatars.ts`,
  sessionStorage; the socket's own list too, from `LobbyConnectionProvider`),
  so a reload or the next page draws the right face at once. `avatarOf` asks
  the socket's lists first and, once they have arrived, treats them as the
  truth (somebody not on them is the default face, as before). Storage is a
  hint: empty, full, refused or malformed, the page waits for the socket as
  before. Cleared at sign-out and on an expired session.
- Account, Admin and the computers list read the avatar through `avatarOf`
  (they read `lobby.players` directly before).
- The Account page's set of 132 is drawn once it is first opened, not with
  the page (Chromium fetched 129 on every reload, WebKit 127-129 on every
  visit, folded).
- The kit: the loading measure follows every portrait from the moment it is
  drawn (`loading.spec.ts` `AVATAR_PROBE`): `avatarSwaps` (the default face,
  then the player's own, on the same element or on the one React draws in its
  place in the same commit), `avatarLateMs`, `avatarAfterUsableMs`,
  `avatarFetches`. `ci/measure.mjs --pw-output DIR` keeps Playwright's own
  results out of the repo.
- Tests: `knownAvatars.test.tsx` (4: the socket's list wins, kept for the
  tab, learned from me/Hall/admin/shares, the Hall drawn with the lobby empty
  shows Pat's own face); `AdminApiTest` "an active account's avatar comes
  with the accounts list and the Hall's lookup, a disabled one's never"
  (with `/api/auth/me` and sign-in); `HallTest` "every player the Hall names
  is named once". Removing `avatarOf`'s fallback fails 2 page tests;
  removing the Hall's learning fails 2 (TEST-004).

**Before and after (RUN, 2026-11-22; the owner's PC, 13th Gen i5-13600KF,
32 GB; the first local stack, built from 6ded276e, then from e1138da6;
Playwright's bundled Chromium and WebKit; `node ci/measure.mjs loading
--engines chromium,webkit --links local,slow4g`, 3 runs each; medians).**

```text
avatar swaps (portraits drawn with the default face, then their own)
                         Chromium local   Chromium slow 4G   WebKit local   WebKit slow 4G
Hall cold                    0 -> 0           0 -> 0          11 -> 0         0 -> 0
Hall reload                  0 -> 0          11 -> 0          11 -> 0        11 -> 0
Account cold                 1 -> 0           1 -> 0           1 -> 0         1 -> 0
Account reload               1 -> 0           1 -> 0           1 -> 0         1 -> 0
room reload                  2 -> 2           2 -> 0           2 -> 0         2 -> 0
room cold                    2 -> 3           0 -> 0           2 -> 1         0 -> 0
Admin, Deck Depot, lobby, game, spectate, in-app visits: 0 before and after

from a portrait drawn to its own picture loaded (avatarLateMs, the latest on the page)
Hall reload                  0 -> 0         171 -> 0          35 -> 0       148 -> 0
Account reload              39 -> 2         357 -> 1          76 -> 3       374 -> 3
Account cold                52 -> 45        403 -> 415       118 -> 24      121 -> 216
Hall cold                   22 -> 23       1134 -> 1131       92 -> 46      488 -> 501
Hall in-app first           19 -> 23       1277 -> 1134       17 -> 44      490 -> 490

Account: portrait pictures fetched (avatarFetches)
reload                     129 -> 1         129 -> 1         129 -> 1       129 -> 1
cold                         1 -> 1           1 -> 2         129 -> 1       129 -> 1
in-app first                 0 -> 0           0 -> 0         127 -> 0       127 -> 0

usable (ms), where it moved
Account cold / reload, WebKit local             439 / 785 -> 324 / 235
Account reload, WebKit slow 4G                  1,032 -> 600
lobby, Hall, Deck Depot cold, Chromium local    106 / 123 / 118 -> 123 / 145 / 135
Hall, Deck Depot reload, Chromium local         45 / 43 -> 67 / 54
every slow-4G usable time, both engines: within the runs' spread (-6% to +2%)
```

- **Targets.**
  - 0 swaps for a player with an avatar: **met** on every page the row
    names (Hall, Admin, shares, Account), cold and reloaded, both engines.
    **Not met on a cold room** (2-3 in Chromium, 1 in WebKit, local only):
    the other seat is drawn from `/api/rooms/current` before PLAYERS lands,
    and a new tab has nothing kept. The room's data is the lobby protocol's
    `RoomMemberView`, not one of the row's sources: left for E5 (the socket
    beside `/api/auth/me`), or a small protocol field (the owner's call).
  - Real avatar ≤ 100 ms after its row is drawn (reload, in-app): met
    locally; on slow 4G met on reloads (0-3 ms), **not on a first in-app
    Hall visit** (1.1 s Chromium, 0.5 s WebKit). That wait is the pictures'
    own download: the Hall's two portrait files share the 1.6 Mbit/s link
    with its other pictures (the belt art, the trophies; 215 KB in all) and
    land with them (`slowest`: the belt 1.27 s, the portraits 1.10-1.14 s).
    The same holds cold (≤ 300 ms after usable: met locally; 1.1 s on slow
    4G in Chromium, 0.5 s in WebKit). Fetching portraits ahead of the rest
    belongs to E5/E8's start-up work, or lighter Hall art (E11).
  - Account: on-screen avatars ≤ 500 ms and ≤ 40 fetched up front: **met**
    (1 fetched; your own portrait 2-415 ms).
- **Slower (P11-R7):** Chromium's local loads of lobby, Hall and Deck Depot
  came out 10-22 ms slower, and the Hall's API time went from 12-13 to
  14-21 ms in the measure. Timed directly afterwards, 40 reads each on the
  same stack: `/api/hall` 10.5 ms median, `/api/auth/me` 3.8 ms against
  `/api/version`'s 3.4 (the one extra row read). So the extra work is about
  half a millisecond on "who am I" and a few on the Hall. The rest of the
  local gap is within these local runs' spread (167 of the after run's
  numbers were outside ±10%, mostly local times of a few tens of ms). Slow-4G
  usable times are unchanged in both engines.
- **Not changed, an owner choice (P11-R1):** the row's "an empty circle, not
  the default face, while unknown". Today's default face still shows for
  anybody not known yet (a cold game or spectate page's opponent, a cold
  room's other seat). An empty circle is a new look and needs a canvas.
- **What CI must confirm** (Firefox does not start here): the `engines` job's
  Firefox loading rows now carry the avatar numbers, and the after numbers
  must show 0 swaps on the Hall and Account there, as here. Whether Firefox
  also swapped at 6ded276e's code is no longer measurable on main once this
  lands; if the owner wants the cause confirmed, one `engines` run of the kit
  commit alone (f34eaa9f, the probe without the fix) gives Firefox's before.
  It would be the first Firefox measurement of avatars anywhere.

## As built: P11-E13 (2026-11-22)

**The cause (RUN):** the lobby's liveness check (`lobby.ts` `connectLobby`)
ran on its 20 s `setInterval` and dropped the connection when nothing had
been heard for 45 s. A hidden tab's timers are slowed (Chromium: once a
minute after 5 minutes hidden) or stopped (a frozen tab), while its
connection stays open and the browser answers the server's own pings. So the
beat came a minute after the last PONG, read that as silence, and dropped a
healthy connection: `hidden-tab.spec.ts` against 6ded276e's `lobby.ts`
failed at its first slowed minute ("no PONG; the lobby sockets: open 1,
closed 1"). A long-hidden tab reconnected about once a minute, and each
reconnect is a moment offline for the other players.

**What changed** (`lobby.ts`, client only):

- A beat on time (a visible tab) judges as before: a PING unanswered for
  `REPLY_MS` (25 s), with nothing heard for 45 s. A visible page drops a dead
  connection at the same moment as before.
- A beat more than `LATE_BEAT_MS` (30 s) after the last means the page was
  slowed or asleep, with an answer perhaps unread behind it: it judges
  nothing, sends a fresh PING and checks that one `WAKE_REPLY_MS` (5 s) on.
  A dead connection is still found: in a slowed tab at its next wake-up
  (about a minute), and 5 s after waking from a freeze.
- That check judges nothing when it fires more than `ASLEEP_MS` (90 s) after
  its PING (frozen again); the next beat asks again.
- **The server needed nothing.** It keeps a connection while Ktor's own
  pings are answered (`Limits.WS_PING_SECONDS` 15, `WS_TIMEOUT_SECONDS` 30),
  and the browser answers those while the page's thread is held (RUN,
  below). That is the owner's rule: a hidden or frozen tab counts as
  connected while its connection is open. The game socket has no timer of
  its own (`match.ts` reconnects only on the browser's close), so it already
  follows the rule.
- Rejected: only raising `QUIET_MS` (a once-a-minute timer, or a freeze of
  any length, still beats a fixed quiet time); treating late beats as asleep
  with no check after (a dead network in a long-hidden tab would never be
  found, so an invitation could wait unseen until the tab is shown again).

**For the hard pause (owner decision 6, Q7: 2 s heartbeat, 5 s of silence is
a drop):** build its heartbeat on what a frozen tab still does: the
connection's own pings, answered by the browser. Do not build it on a page
timer or a page reply. A page-timer heartbeat would pause a game for every
tab that is merely hidden (Chromium's once-a-minute timers) and for every
frozen one. That is decision 7's option (b), which the owner did not choose.
Concretely: the server pings each match socket every 2 s (Ktor's
`pingPeriod` for that route) and counts 5 s with no pong as dropped; the page
sends nothing for it.

**Tests.**

- `reconnect.test.ts`, three new tests (a fake clock jumped between timers,
  as a slowed tab's run): ten slowed minutes keep the one socket; a frozen
  tab wakes and asks again, and a check that fires ten minutes late judges
  nothing; a dead connection is still dropped in a slowed tab, and 5 s after
  waking. With 6ded276e's `lobby.ts` all three fail (TEST-004).
- `hidden-tab.spec.ts` (new; a real browser and the real server):
  1. ten minutes of slowed timers, then a ten-minute freeze, keep one lobby
     socket, never closed, "Connected" throughout (Playwright's clock:
     `fastForward` fires each due timer once);
  2. the page's thread held for 40 s, past the server's 30 s ping timeout,
     as a frozen tab's is: the other player's screen still shows the held
     player online, and the socket is the same one when the page wakes.

  A real freeze can't be had headless: Chromium's CDP lifecycle "frozen"
  state did nothing to the page (RUN: its timers kept running), and a
  headless page is always visible.
- RUN locally: both tests pass in Edge (Chromium) and in WebKit (1.7 min).
  Test 1 fails against 6ded276e's `lobby.ts` (above). At CI speed (`node
  ci/ci-speed.mjs hidden-tab lobby`: CPU 4x, after foundation, its CI
  neighbour): 27 passed (1.6 min). The touched specs (auth, lobby, admin,
  sharing, hidden-tab, match-away, match-session): 47 passed (3.8 min).
- CI: the `engines` job runs `hidden-tab.spec.ts` in Firefox and WebKit
  (`PROXIC_E2E_ENGINES` names the engine projects in `playwright.config.ts`;
  a plain local run never starts Firefox), and CI's "other" project runs it
  in Chromium. "A tab hidden 10 minutes keeps its socket, in all three
  engines": Chromium and WebKit RUN here; **Firefox is owed to CI's first
  `engines` run**.
- Each brand's own savers (Edge's sleeping tabs, Chrome's Memory and Energy
  Saver, Brave, Opera, Vivaldi, Safari) remain F2's hand check: a tab hidden
  10 minutes, then back, shows no "Reconnecting".

**One thing a player could notice:** before, a laptop that woke from sleep
onto a dead network said "Reconnecting…" at the first beat after waking. Now
it says so at most 5 s later (the fresh PING's check). Most wakes onto a dead
network are found sooner by the browser itself (the connection's close), as
before.

## As built: P11-C3 and P11-C4 (2026-11-22)

Moved up beside step 3 (owner 2026-11-22, from D0: React's commit and the
frame after it are the biggest slice of the system's own time in a tap, a
cast and a combat). Branch `p11-c3`, built in its own worktree against the
second local stack (port 8081). Nothing a player sees changes (P11-R1): the
jump check and a clip below.

**What changed (C4, `GameScreen.tsx`).** A board update now draws again only
the parts whose data changed:

- **The plates** are kept (`memo` with `sameProps`) and no longer take the
  whole board. The rail works out what each plate shows, once per board
  (`plateFacts`: whose turn, priority, the stack's focus on it, the exile
  count, the tiles' glows, the library's top card, the Curses, the control
  chain, the monarch's and the initiative's triggers), and the question's
  part as plain answers (`plateChoice`). The plate's turn-light reads only
  the turn (`usePlateLight`, `turnBeganFor`).
- **The step ladder** takes its own slice (`ladderOf`) and is kept; **the act
  button's coin** is kept (the button itself is plain page elements, drawn
  by the rail).
- **The chat and play log, the gear menu, the question bar and the table's
  notices** are kept, with callbacks that are the same on every board
  (`pickLatest`, `inspectFromLog`, `toggleList`, `concede`).
- **The question** stays the same object across boards that show the same
  things (`visible` kept by its ids, `keptSet`), so the bar, the table's
  choosable set and everything else worked out from it are not remade.
- **The overlay's parts**: the dice only once a roll has been made since the
  page opened, kept by what they show; the turn's sweep by whose turn it is
  (`turnOf`); the flights and the mana balls by identity, so they still draw
  on every new board (each compares the board with the last, and the balls
  note where each pool's mana chip is after every board, which a spent
  pool's ball needs), but not for the board's own ghosts and marks. The
  board hands the overlay one "where is it" function while what it reads is
  unchanged (`Board.tsx` `overlayAt`).

**C3 (`Board.tsx`): measured; no change kept.** The glide pass was built
first to ask only the cards that may glide for their animations, instead of
listing the whole table's (`getAnimations({ subtree: true })`, dd565e27).
CPU profiles of the replayed land tap at 4x showed no gain, and the trace
showed why: the time inside that query is the style the browser works out for
the cards React has just changed (one forced style recalculation per update,
about 19 elements, about 1.5 ms at 4x), which the frame would work out anyway;
the list is not the cost. So 93ddc009 put the original query back (the same
behaviour, less code). The query cannot simply go: it is what finds a slot's
CSS settle (`battlefield.css`, the `.bf-slot` transform transition) so the
card's Glide can cancel it; without it a card could be drawn part by its
settle and part by its Glide.

**Before and after (RUN, 2026-11-22: `node ci/measure.mjs redraw`, 3 runs
each, the owner's PC as C1 with other programs closed, Playwright's bundled
Chromium; the second local stack built from the worktree: before at
6ded276e, after at 93ddc009).** Medians of 3; "!" a number whose runs are
not all within ±10%. Per update ("upd": every match message, as C1).

```text
moment            renders     GameScreen  plate       app ms        style ms       frames p95/worst
                  before>after before>after before>after before>after before>after   before      after
the replayed table (C6's yardstick, owner 2026-11-21)
1x tap-one-land    63 > 18     1 > 1       1 > 0       3.09 > 2.41   3.53! > 3.23   16.7/16.8   16.8/16.8
1x bench-40        60.7 > 20.2 1 > 1       1 > 0.1     2.80 > 2.29   5.44 > 4.44    16.7/16.8   16.7/16.8
4x tap-one-land    63 > 20     1 > 1       1 > 0      17.2! > 14.5  16.9! > 14.0!   16.7/50!    16.7/50!
4x bench-40        60.7 > 20.3 1 > 1       1 > 0.1    17.5! > 12.7  26.8! > 19.6    16.8/66.7!  16.7/66.7!
the real game (only to show nothing got worse, owner 2026-11-21)
1x cast            71.1! > 24.8! 1.35 > 1.21 1.49 > 0.39 1.79! > 1.16 1.23! > 0.73  16.7/16.8   16.7/16.8
1x combat          50.7 > 20.6 1.07 > 1.05 1.19 > 0.36  1.30 > 0.91  0.66 > 0.61   33.3/50.1   16.8!/50!
1x end             76.5 > 30.4 1.48 > 1.48 1.76 > 0.70  1.91 > 1.52  2.41 > 2.07   33.3!/50!   16.8!/50.1
4x cast            40.0! > 26.2! 0.80 > 0.93 0.86 > 0.41 6.59! > 6.21! 3.78! > 3.44! 16.8/83.3   16.8/66.7
4x combat          35.0 > 18.0 0.70 > 0.76 0.79 > 0.33  5.79! > 4.88 3.31! > 2.99   33.3!/100!  33.3!/83.3!
4x end             58.8 > 26.3 1.04 > 1.15 1.30 > 0.59 10.71! > 7.40 12.57! > 11.86 16.8!/117!  33.3!/100!
```

- **Renders fell by about two thirds everywhere:** tapping one land 63 to
  18 (18-20 at 4x, by the deal), the busy table 61 to 20, a real cast 71 to
  25, a combat 51 to 21 (4x 35 to 18). **The plates draw 0 times** on the
  replayed table (the busy table's 0.1 is its own life drop) and 0.33-0.70
  in the real game, where priority, life and counts really change.
- **The page's own JavaScript fell 16-27% on the replayed table** (tap 3.09
  to 2.41 ms at 1x, 17.2 to 14.5 at 4x; busy table 17.5 to 12.7 at 4x), and
  style time 8-27% with it. In the real game it fell too (4x combat 5.79 to
  4.88 ms, 4x end 10.7 to 7.4), within that game's run-to-run spread for the
  cast. Frames: no p95 worse on the replayed table; the real game's p95 and
  worst move between 16.8 and 33.3 ms run to run, as before.
- What is left per update is mostly the board itself (`Board`'s render with
  `items` and `layout`), the glide pass (below) and the board's data
  (`boardFromSnapshot`, `keepCards`): work that follows the table's size,
  which is C2's (after D4).
- **Hover** is counted per moment: per pointing at a hand card it fell from
  12.5 renders to 7.8-9.1 at 1x; the moment's totals swing with how many cards
  that game's hand held (4 to 13 pointings).
- The real game's GameScreen 0.76-1.21 per message includes renders from the
  page's own state (a hold ending, a flight landing), not a second render per
  board.

**The targets.**

- **C4: GameScreen ≤ 1 render per update: met on the replayed table (1)**;
  the real game's figure is per message (above). **Plates 0 when unchanged:
  met.** The step ladder draws on a step only; the act button's coin only when
  it changes. **Tapping one land ≤ 10 renders: not met, 18.** What the 18 are
  (each commit's components read through React's DevTools hook, RUN):
  GameScreen 1, the board 1, the rail 1; the two slots that really changed, 4
  each as the kit counts them (the land that tapped leaves its pile of Forests
  for a slot of its own and the pile's number changes: slot, card face, and the
  face's kept part, which the kit counts twice, as a memo and its function);
  the flights 2 and the mana balls 1, which still draw on every new board
  (above); then the board's own second and third commits: the ghost of the
  land joining or leaving its pile (an animation P10-R1 needs: board 1, ghost
  1, its bar 1) and the ghost's end (board 1). Below 10 needs the ghosts kept
  outside the board's own state and the flights and balls fed only what they
  read: a bigger change, with the look at stake, left for C2/C5.
- **C3: nothing when no card moved: met for the animations** (no card is asked
  when none moved: the pass's own loops are 0.2-0.5 ms per update at 4x then,
  RUN, CPU profile). **The glide pass ≤ 2 ms per update at 4x when one card
  moves: not met.** CPU profiles of the replayed tap at 4x (RUN, the movement
  effect, inclusive): before 3.5 and 4.2 ms per update (1.8-1.9 ms of it in
  `getAnimations`); after, 4.3-4.6 ms over three runs (2.4-2.7 ms in it). That
  query's time is the style recalculation the frame needs anyway (above); with
  fewer components drawn, more of the update's style work now happens there
  rather than earlier, while the update's style in total fell (the table
  above). The rest of the pass is the WAAPI calls (0.5 ms) and its loops (0.5
  ms). Under 2 ms needs the slot's CSS settle handled without a style query
  (for example, never letting the slot's transition start when a Glide will
  run): a change to how cards move, so it needs the jump check over all Lab
  games at least; not done here.

**Looks identical.** The jump check (RUN, 2026-11-22, bundled Chromium,
the second stack) over the 30 Lab traces these items touch, chosen for what
the rail, the overlay and the glide pass draw: combat (`board-data-combat`,
`combat-choices-double-block`, `combat-choices-first-strike`, `blocks-menace`,
`game-flow-relentless`), moves and piles (`moves-bounce`, `moves-destroy`,
`moves-sacrifice`, `attachments`, `piles-unearth`, `card-actions-mill`,
`wipes-wrath`, `pay-picks-delve`), copies, forms and sides (`copies-clone`,
`shapes-meld`, `shapes-mutate`, `shapes-daybound`, `survivors-ephemerate`,
`cost-kinds-gain-control`, `quiet-reports-act-of-treason`, `spent-mutavault`,
`cost-kinds-crew`, `soulbond-pair`), tokens (`board-data-tokens`,
`game-flow-krenko`), the plates (`life-changes-bolt`, `players-monarch`,
`mindslaver`, `stack-rests-three-triggers`) and Karn's restart (`karn`), from
the 1.75.0 release run's traces, both seats, 41.5 minutes each way. **Before
(6ded276e) and after (dd565e27): the same report, kind by kind and flag by
flag** (7 flagged examples each, all the known ones: the restart's cards "not
shown at all" and in-place flips "changed form, no animation", the checker's
blind spots listed since Phase 10). The glide pass's final code is 6ded276e's
own (93ddc009).

**The clip** (RUN): `board-data-combat`, seat 1, boards 50-61 (two
attackers declared, a block, first-strike and regular damage, a death), replayed
at normal speed into a real game page and filmed with Chrome's screencast
(every painted frame, about 1,200 each), before and after. Side by side at the
same moments after each board (0.1-1.5 s) they are the same picture: at most
0.42% of pixels differ, from a few milliseconds' difference in when a board
landed; each board's settled frame differs in 0-102 pixels of 518,400, all of
them the drifting motes around the stack card (a looping, random effect),
seen by eye. Files: the session's scratchpad, `c3-clip-before/`,
`c3-clip-after/`, `c3-clip-sheet.jpg`.

**Checks.** Gates in the worktree: `tsc -b`, `tsc -p tsconfig.e2e.json`,
eslint, prettier, vitest (1840/1840), `check-doc-refs.py`. A new page test,
`redrawParts.test.tsx`: a land tapping leaves both plates as they were (each
plate's drawing counted), and Bob's life dropping draws only Bob's plate,
with 17 on it; both fail on 6ded276e's `GameScreen.tsx` (8 drawings instead of
4; 6 instead of 5). `fixes0064`'s chat test now delivers a lobby change the
way the app's context does (a subscription), not by drawing the whole screen
again: the kept chat updates through its own hook. Browser specs on the second stack, bundled Chromium (RUN): `match`,
`match-board-motion`, `match-lands-stay-put`, `match-big-combat`, `match-state`,
`match-status-list`, `match-play-log`, `match-dice`, `match-passing`,
`match-numbers`, `match-watching`, `match-mindslaver`, `match-concede`,
`match-interaction`, `match-stack-rests`, `notices` passed. `match-speed`: its
1x test passed; its 4x test failed once on "4x combat: JavaScript 115.1 ms/s >
88", the open flake in ROADMAP (C6's per-second figure, enforced off CI only).
An A/B on the same
stack (RUN): 6ded276e's build passed it (4x combat 72.7 ms/s), and the final
build (93ddc009) passed it twice (4x combat 47.6 and 74.2 ms/s, cast 25.6 and
60.3): the same per-second swing as before, not this change (the kit's per-update
real game above shows the page's JavaScript level or lower). These specs ran on
dd565e27 (the final code but for the glide pass's query, which 93ddc009 put
back as it was); the clip, the before/after measure and match-speed's A/B ran
on 93ddc009. `node ci/ci-speed.mjs` (CPU 4x, each with its CI neighbour):
`match-board-motion`, `match-lands-stay-put`, `match-state`, `match-play-log`,
`match-dice`, `match-passing` and their neighbours, 11 passed, 0 failed.

**Kit fix.** `ci/measure.mjs` gives Playwright an `--output` beside each run's
numbers, so its files never land in the checkout (two builders' runs at once).
The kit already honoured `PROXIC_E2E_URL` and `PROXIC_E2E_CONTAINER`.

## As built: P11-E5 (2026-11-22)

The start-up chain, started together, plus the owner's addition of
2026-11-22: the room data carries each seat's avatar. Branch `p11-e5`, built
in its own worktree against the second local stack (port 8081). Nothing a
player sees changes but pages being usable sooner and a room's other seat no
longer starting on the default face.

**What changed.**

- **The session hint** is the readable CSRF cookie (AUTHENTICATION.md
  "Cookies"): set with the session, cleared at sign-out. With it,
  `frontend/src/early.ts` `startEarly` (called by `main.tsx` before the first
  draw) starts, beside "who am I":
  - the page's data: each GET it reads on opening (`earlyPages.ts`
    `EARLY_PAGES`: the lobby's room, match and decks; the Hall; the Deck
    Depot; the game's match; spectate's room), handed once to the first
    reader (`primedFetch`, now the default `fetchFn` of those readers),
    within `FRESH_MS` (10 s) and only before the player's first click or
    key; an administrator's lists (Admin, Status) once "who am I" says
    administrator (`whoAnswered`), never on the hint alone;
  - the lobby connection, buffered until the shell takes it as its first
    (`takeEarlySocket`; `lobby.ts` `connectLobby` option `first`), its
    messages replayed in order, then passed on; let go after 30 s untaken;
  - the shell's and the route's code: each script as
    `<link rel="modulepreload">`, each style as `<link rel="preload"
    as="style">` once "who am I" says signed in. The build names each page's
    files in index.html (`vite.config.ts` `earlyFiles`: a JSON data block,
    `#pa-early`, the same for everybody; `earlyPages.ts` `earlyFilesOf`).
    The entry already names every one of them.
- "Who am I" itself is asked first, for everybody (every page asks it
  anyway), so on a link of six connections it does not queue behind the
  files.
- Signing in starts the lobby's code, data and connection at once
  (`AuthContext` `signIn`), the session then being certain.
- Without the hint nothing more is asked than before. With a wrong hint (a
  session ended elsewhere) everything is dropped when "who am I" says nobody
  (`endEarly`).
- **The room's avatars.** `RoomMemberView.avatar` (`room/RoomView.kt`): the
  seat's avatar, or null for the default face, always sent; an **active**
  account's only (P11-E2's rule, `AccountNames.avatarsOf`). Every room answer
  and `ROOM` message is made by `RoomService.views` (`RoomViews.of`);
  `roomMessage` now takes the view. The page reads it (`lobby.ts`
  `asMember`); `lobbyView.ts` `avatarOf` uses a seat's own avatar before
  PLAYERS lands (PLAYERS still wins after); the shell keeps it for the tab
  (`learnAvatars`). Documented in LOBBY_PROTOCOL.md, "`avatar`".

**How the code is fetched: measured, not guessed (RUN, 2026-11-22, the second
stack, bundled Chromium and WebKit).** The first build fetched each file with
`fetch()` into the browser's cache. Chromium did well; WebKit got slower on
slow 4G (lobby reload 966 -> 1,836 ms, game reload 1,276 -> 5,673): it
downloaded each file twice (once for the `fetch`, once for the module) and
fetched them again on every reload (lobby reload 52 -> 197 KB). A probe in
both engines, on a signed-in file, then measured each way:

```text
                                         Chromium           WebKit
fetch(), then import                     1 download         2 downloads
modulepreload, then import               1                  1
a refused modulepreload; sign in; import import works       import works
a refused preload as=script; ...; import import FAILS       import works
a refused preload as=style; sign in;     stylesheet loads   stylesheet FAILS
  a stylesheet
```

So scripts go as modulepreloads from the hint, and styles as style preloads
only once the session is certain. The auth spec's stale-hint test proves the
page is whole after signing in (header styled, lobby connected).

**Before and after (RUN, 2026-11-22; the owner's PC, 13th Gen i5-13600KF,
32 GB; the second local stack built from f83e2155, then from this branch;
Playwright's bundled Chromium and WebKit; `node ci/measure.mjs loading
--engines chromium,webkit --links local,slow4g`, 3 runs each; the before's
room, game and spectate rows from a second 3-run measure with the test deck
in place; medians, ms to usable).**

```text
slow 4G                Chromium cold      Chromium reload    WebKit cold        WebKit reload
lobby                  2209 -> 1978       741 -> 543         2141 -> 1882       966 -> 609
Hall                   2288 -> 1942       578 -> 396         2289 -> 1777       825 -> 600
Deck Depot             2268 -> 1919       572 -> 399         2320 -> 1767       828 -> 594
Account                2047 -> 1766       379 -> 384         2070 -> 1718       612 -> 565
Admin                  2095 -> 1774       390 -> 391         2135 -> 1720       595 -> 575
Admin, a tab by address 2081-2114 ->      -                  2126-2330 ->       -
                         1773-1819                             1683-1748
Status                 2984 -> 2758       418 -> 412         2950 -> 1270       636 -> 592
room                   2221 -> 1983       572 -> 403         2486 -> 2138       812 -> 600
game                   4546 -> 3971      1103 -> 909         5008 -> 4207      1276 -> 1070
spectate               4526 -> 4029      1115 -> 910         5077 -> 4241      1260 -> 1051
sign-in click          1446 -> 1440        -                 1845 -> 1684        -
sign-in (stranger)     1083 -> 1082       201 -> 203         1108 -> 1123       250 -> 236

local                  Chromium cold      Chromium reload    WebKit cold        WebKit reload
lobby/Hall/Decks       124/123/116 ->     37/51/47 ->        396/378/363 ->     307/304/291 ->
                         119/109/97         39/36/28           344/327/311        262/257/260
Account/Admin          111/116 -> 101/94  30/39 -> 28/33     364/318 -> 325/287 254/238 -> 221/220
Status/room            67/138 -> 64/119   49/58 -> 50/43     416/367 -> 231/352 249/304 -> 177/258
game/spectate          167/179 -> 155/158 75/72 -> 50/64     624/579 -> 536/541 377/712 -> 385/647
In-app visits (header clicks): unchanged within the spread in both engines (they start nothing early).
Bytes and requests per load: the same in both engines (lobby cold 213 -> 214 KB, game cold 717 -> 716).
The Deck Depot's fell (415 -> 264 KB, 30 -> 24 requests) only because the stack's own decks changed
between the runs (the browser specs run in between import, share and delete decks).
```

- **Targets.**
  - Every signed-in page usable ≤ 900 ms on a slow-4G reload: **met for the
    lobby, Hall, Deck Depot, Account, Admin, Status and the room in both
    engines (384-609 ms)**; **not for the game and spectate** (909-910 in
    Chromium, 1,051-1,070 in WebKit; were 1,103-1,276).
  - ≤ 2.0 s cold: **met for the lobby, Hall, Deck Depot, Account and Admin
    (and its tabs by address) in both engines, Status in WebKit and the room
    in Chromium**; **not for the game and spectate** (3.97-4.24 s; were
    4.5-5.1), **Status in Chromium** (2,758) and **the room in WebKit**
    (2,138).
  - What is left on the game and spectate pages is their code's size, not
    the chain: 717 KB on a cold load at 1.6 Mbit/s is about 3.6 s by itself
    (the board's chunk, with its 145 KB of inlined mana pictures), and
    WebKit's reload still fetches 165 KB. That is E6's (the game's code
    before the game, mana pictures as files) and E11's.
  - Status in Chromium waits for its poll's rhythm (E1's note, unchanged);
    WebKit's cold room is the slower engine on the same chain (local 352 ms
    against Chromium's 119).
- **Slower (P11-R7):** nothing beyond the runs' spread. Within it: Chromium
  local lobby reload 37 -> 39, Account reload 379 -> 384 on slow 4G, Admin
  in-app first 292 -> 316 on slow 4G; WebKit local game reload 377 -> 385,
  sign-in cold on slow 4G 1,108 -> 1,123.

**The room's avatar (RUN, the same measures).** The loading measure's avatar
probe (`avatarSwaps`: a portrait drawn with the default face, then the
player's own) saw a freshly opened room swap the other seat **once in every
run** before (Chromium local cold and reload, WebKit local cold; the only
swaps left anywhere in the measure), and **0 in every run of every row**
after, in both engines. By eye (RUN, Chromium, the second stack): a new
profile opening /play while its player sits in a room with Pat, the room's
first frame drawn already shows Pat's own portrait on seat 2 (RudeLeft, who
wears none, the default face).

**A stranger gets only the sign-in files (proof, RUN, `auth.spec.ts`).**
- "P11-E5: a stranger asks for the sign-in files and who am I, and nothing
  else": a new profile opens /play, /hall, /admin and /game; its only API
  call is `/api/auth/me`; no lobby connection; none of the `#pa-early` files.
- "P11-E5: a session that ended elsewhere: each early start is refused,
  costs nothing, and signing in still draws the page": a stale CSRF cookie,
  no session. The shell's and the lobby's scripts are refused 404 with
  `no-store` (kept by nobody), the three data reads 401, the lobby
  connection is closed by the server; 16 refusals, 1,696 bytes of body in
  all (about 106 each, the refusal's sentence) plus 13.9 KB of headers (the
  security headers every answer carries). No style is asked (it waits for
  "who am I"). Signing in then draws the lobby whole (styled header,
  "Connected", the players list): nothing refused was remembered.
- The server's gate (`SignedInGate.kt`) is unchanged; it always refused these.

**No wrong page before "who am I" (proof, RUN).** "P11-E5: the page waits for
who am I before drawing, while its code, data and connection start beside
it": "who am I" held 1.5 s on /play and on /hall. Meanwhile the page shows
only "Checking your session…" (no header, no sign-in form), while the lobby
connection is open and the page's data is asked; released, the page draws
and says "Connected" over that one connection (the early one, taken by the
shell).

**Tests.**
- `early.test.ts` (15): a stranger asks only "who am I"; a wrong hint drops
  everything; data, socket and scripts start with the hint, styles after
  "who am I"; a primed answer is handed over once, never stale, never after
  a click or key, GET only; an administrator's lists only for an
  administrator; the shell takes the early connection with its past replayed
  in order; the build's list names each page's chunks and styles once,
  never the entry's; every lazy page in `routes.tsx` is listed; a seat's own
  avatar before PLAYERS, PLAYERS after; the room data's avatar read as a
  name, the default (null) or not said. Each of seven mutations (no hint
  check, no replay, admin lists for anybody, stale answers handed over, the
  seat's avatar ignored, the room's avatar not read, the entry's files
  listed) fails a test (TEST-004).
- Server: `RoomRoutesTest` "each seat carries its avatar, an active account's
  only" (the current room and a room by id; a disabled player is null), and
  `LobbySocketTest`'s invitation test now checks that both `ROOM` messages
  carry both seats' faces. With the lookup replaced by an empty map, both
  fail.
- Browser specs on the second stack (bundled Chromium): auth, foundation,
  security-headers, lobby, match-setup, belt-records (the Hall), decks,
  admin, hidden-tab and sharing, 75 passed (on the `fetch()` build); after
  the switch to preload links, auth, security-headers and foundation, 27
  passed.
- Gates in the worktree on the final commit: listed in the commit's report.

**What a player could notice.** Pages are usable sooner, and a room's other
seat shows its own face at once. Not visible on the page: a browser whose
session ended elsewhere logs a few refused requests (404, 401) in its console
while the sign-in page opens.

**Not done here, left open:** the game and spectate targets (E6, E11); Status
in Chromium (its poll); Firefox (it does not start on this PC; CI's `engines`
job runs the loading measure there); the live site.

## As built: P11-D3 (2026-11-22)

**What changed.** A board's history lists are sent once. The worker still
builds `payments` (the last 24), `rolls` (the last six) and `notices` (the
last six) whole on every board, per seat, with the hidden ids stripped
(`HiddenIds`), and the server still stores the whole board. But each
connection now remembers the lists its page holds (`BoardHistory.kt`
`BoardStream`, one per connection, under one lock with the send), and a board
sent on it carries only the entries the page lacks, plus `kept`:
`{"payments": 23}` = "keep the last 23 of the payments you hold, then add
this board's" (`protocol/README.md`, `kept`). The page rebuilds the whole
board in `match.ts` before anything reads it (`history.ts` `withHistory`), so
every part of the page reads the board the worker made. Nothing a player
sees changes (P11-R1).

- **Done in the server, not the worker** (rejected: the worker sending only
  new entries). The Lab traces are the worker's output and stay whole, so the
  Lab, the hidden checks, `match-dice`, the jump tool and the ledger read
  whole lists as before; only the server-to-page leg changes.
- **By place, not by `n`** (rejected: merging entries by their `n`).
  `notices` are plain strings, with no number; one rule covers all three.
- **A page that missed an entry never shows a wrong or missing history:**
  - `kept` names m only when the last m entries the page holds ARE the first
    m of the new list, so the rebuild is the worker's list, entry for entry;
    otherwise the list goes whole: an entry whose id the worker stripped after
    it was sent (its card went into a hand), or a list that started again
    (Karn's restart);
  - it is per connection, so a connection's first board carries every list
    whole: a join, a reconnect, a reload, a second tab, a spectator (the
    public view, the same way);
  - a board older than one already sent on the connection (the stored board
    a joining connection reads, overtaken by a live one) goes whole and is
    not remembered: the page drops it (`match.ts`, the revision check);
  - board and memory move together under the connection's lock, so the
    joining connection's stored board and a live board cannot cross.
- **Hidden information:** what is sent is always a run of the seat's own
  whole list as the worker stripped it; nothing decides visibility here
  (`MATCH_STATE_VISIBILITY.md`).
- **The play log is not here:** the worker already sends each line once
  (this round's lines) and the server adds the whole log to a joining
  connection's first board (`LiveMatch.snapshotFor`), as since spec 0064.
  `shuffles` is this round's only. The research note's "the play log, the
  last N" did not hold (SOURCE, and RUN over the Lab: repeated play log lines
  are 0.0% of the bytes, repeated payments 11.8%, rolls and notices 0.1%
  each).
- **Tools and tests:** browser specs that clone the last board and send it
  again keep it whole with `WholeBoards` (`match-dice`, `notices`,
  `match-modes-doing`, the redraw measure's bench); the jump tool can replay
  boards as the server now sends them (`JUMPS_HISTORY_ONCE=1`, `trimHistory`);
  `scripts/measure-wire.py` has "once" columns and rebuilds every Lab board as
  the page does (`historyMismatches`).

**Numbers (RUN, 2026-11-22, the owner's PC as C1, bundled Chromium, the first
local stack; before = f83e2155, after = f1a37487, each built from its own
worktree; the redraw measure's real game at 1x, 3 runs each).**

```text
Lab, scripts/measure-wire.py over the 1.75.0 run's traces (players' boards)
               board median / p95    as sent now (once)   all bytes   streamed (deflated as sent): median, share
fixed 16       5,674 / 10,166        4,088 / 7,701        -23.4%      85 -> 70, 1.7% -> 1.5%
all 432        3,384 / 7,560         3,111 / 5,582        -13.5%      64 -> 59, 2.1% -> 2.1%
rebuilt as the page does: 0 mismatches over every board of the 432 games, both seats and the spectators

real game, per seat (seat 1 / seat 2), medians of 3     before             after              change
  bytes per board read, whole game, median              12,426 / 11,180    9,346 / 9,677      -25% / -13%
  the same, p95                                         15,912 / 15,630    13,528 / 14,338    -15% / -8%
  combat (9 s), median                                  15,227 / 14,746    12,919 / 13,399    -15% / -9%
  cast (6 s), median                                    13,899 / 14,023    12,130 / 12,854    -13% / -8%
  on the wire (compressed, D2), the combat              21.3 / 20.5 KB     19.1 / 19.3 KB     -10% / -6%
  on the wire, the cast                                 11.0 / 10.7 KB     10.3 / 9.6 KB      -6% / -10%
  Arena Server CPU per board, whole game                4.17 ms (2.7-5.2)  3.37 ms (2.6-5.1)  within the spread
```

- **Target: bytes per board about -16% before deltas. Met:** -13% to -25% on
  the real game's median board, -23% of all the fixed Lab set's bytes (-28% on
  its median board). Over the whole Lab set it is -13.5%: nearly all of what
  payments were there (14.5% of the bytes; a list is sent again only when an
  entry in it changed).
- **On the wire the saving is smaller:** compression (D2) had already
  squeezed most of a repeated list away, so the compressed combat is 6-10%
  smaller, and a whole game's compressed bytes move with how long the game ran
  (within ±3%; boards per game differ run to run, as D1 found). The page
  parses the smaller messages either way.
- **Server CPU per board:** not worse; the three runs spread 2.6-5.2 ms before
  and after alike (the trimming compares at most 24 short entries per list).
- Steady (±10% over 3 runs): seat 1's whole-game medians and the host's cast;
  the others vary with the deal, as D1 found for whole games.

**Proof.**

- **The hidden checks** (RUN) over the 432 traces as the worker made them and
  over the same traces rewritten as the server now sends each board (per seat,
  `measure-wire.py` `trim`): `check-snapshot-first`, `check-hidden-hands`,
  `check-hidden-log`, `check-kinds`, `check-hidden-tops`,
  `check-hidden-mulligans`, `check-wording.py --res`: every one passes on
  both, with the same counts (11,818 hand-card sightings, 22,806 play log
  lines, 45,659 questions; the wording check reads 369,892 strings as sent
  against 369,905, the notices not sent again).
- **The jump check** (RUN, headed Edge) over the 15 traces whose history moves
  (dice: `dice-swap`, `dice-reroll`, `dice-nudge`, `card-actions-die`;
  payments: the six `mana-balls-*`, `costs-convoke`, `pay-picks-delve`; the
  play log: `play-log`; Karn's restart: `karn`; notices: `unreachable-ante`),
  both seats: before (f83e2155, whole boards) and after (f1a37487, boards
  trimmed as sent, `JUMPS_HISTORY_ONCE=1`): `check-jumps.py`'s reports are
  identical, line for line.
- **A real game** (`match-history`, new, RUN): spells paid for, then the host
  reloads, the guest's connection is cut (it reconnects on its own), a
  spectator arrives and later reloads, and the host opens a second tab. Each
  new connection's first board is whole, and its lists equal the ones the
  page had rebuilt from the trimmed boards before; trimmed boards were seen on
  every kind of connection (HID-004: the trimming ran). With the server's trim
  broken by one entry (`drop(keep + 1)`, a mutant image) it fails at the first
  reload.
- **Bites (TEST-004):** `BoardHistoryTest` (server, 9 tests, among them 200
  random histories rebuilt exactly with nothing sent outside the full board)
  fails with the overlap check removed (5 fail), the stale-board rule removed
  (1), or the hub sending boards whole (2). `history.test.ts` (page) fails
  with the rebuild taken out of `match.ts` (1) or keeping the first m instead
  of the last (2).
- **Browser specs** (RUN, the first local stack at 220a62ee, bundled
  Chromium): `match-history`, `match-dice`, `match-modes-doing`,
  `match-play-log`, `match-report`, `match-session`, `match-watching` (2) and
  `notices` (2): 10 passed. `node ci/ci-speed.mjs` (CPU 4x, each with its CI
  neighbour) on `match-history`, `match-dice`, `match-modes-doing`,
  `match-play-log`, `match-session`, `match-watching`: 13 passed, 0 failed.
  The redraw measure's bench (which now keeps its base board whole) ran once
  at 1x: passed, tap-one-land 18 renders, plates 0 per update.
- **Not measured:** 4x (the change is server-side bytes and one shallow copy
  per board on the page); Firefox and WebKit (the page code is the same in
  every engine); a live link (INFERENCE: on slow 4G the combat's compressed
  bytes, about 2 KB less a seat, are about 10 ms less transfer).

## As built: P11-B4 (2026-11-22)

**What changed.** The four Lab scripts that never ran in CI are each in CI
or retired, and every hidden check can read the Lab's traces as a page
receives them. Nothing a player sees changes, and no production code is
touched (scripts and `ci.yml` only).

| Script | Decision | Why |
| --- | --- | --- |
| `check-hidden-information.py` | **Added**, rewritten as a trace check (`<trace.jsonl>...`, like `check-hidden-hands.py`), run over every Lab game and over the same games as sent | It played its own game (400 decisions, the first option every time, burn or green) and looked only at the battlefield and the hand. Over the Lab's traces it holds, for every board to both seats and the public view: the hand is the viewer's own (`seat` and `owner`); the public view has no hand, otherHands or knownTop; no library or hand lists, only counts; a card the viewer may not see (`known` false), in ANY list, is "Face-down" and carries only the keys `UNKNOWN_KEYS` lists, so a new key on such a card fails until someone decides it is public; typed ids (`card:`, `stack:`, `known:`, `copying:`); no revision backwards per seat. These rules need no other seat's board, which is why no other hidden check had them. It is the board-shape half of P11-R4's gate. |
| `check-card-owner.py` | **Added** to the Lab list | It already took the trace argument and is dealt (`--lab-deal`, 4 s a game). Nothing else checks `owner` (spec 0049): other scenarios read `seat`. Its rule is now a function (`board_problems`) with a `--self-test`, and gained one rule: a card that came in under one seat and is now another's must name the first as owner (before, a worker naming the thief made nothing "stolen" and the script ended inconclusive, not wrong). |
| `check-semantic-choices.py` | **Added**, rewritten as one dealt scenario | It played up to six shuffled games and only reported whether each question was ever asked; three of its four questions are held in CI by dealt scenarios that check what follows the answer (a colour: `check-text-effects.py` Mind Bend, `check-you-choose.py` brave; a coin call and the flip told: `check-coin-flip.py`, `check-card-actions.py` coin; a creature type for a cost: `check-cost-kinds.py` Caller of the Hunt). The fourth, Adaptive Automaton, is a required corpus card whose ledger evidence was this script alone. Now: Alice alone is asked, from Forge's 356 types, picks Goblin (not the first), and on both seats' boards the Automaton is a Goblin and her Raging Goblin a 2/2. |
| `check-x-announcement.py` | **Retired** (deleted) | A duplicate: `check-numbers.py` x (in CI) already holds the cost half (each option's cost with X filled in, the X answered is the X owed, can't-pay from what can be made), and `check-you-choose.py` blaze holds "X = 2, not the first offered, deals exactly 2". The one thing only it did, Fireball's damage, moved into `check-numbers.py` x: Fireball now resolves and Bob loses exactly the X announced, on both seats' boards. Shuffled and undealt, it was also the slowest way to prove it. |

- **As sent (P11-R4, and how D4 joins).** `scripts/as-sent-traces.py
  <traces> <out>` writes a trace folder again with every board as the
  server sends it, per seat's stream (P11-D3's history-once rule,
  `measure-wire.py` `trim`, the Python mirror of `BoardHistory.kt`; the
  spectator's stream too); `--rebuilt` writes each board as the page
  rebuilds it (`rebuild`, `history.ts`) and exits 1 at the first rebuilt
  board that is not the worker's. Every hidden check then reads the out
  folder as it reads the Lab's. D4 adds its step in the same two functions,
  `sent_board` (make the delta from what the seat holds) and `page_board`
  (apply it), so the gate's "rebuilt equals full" and "the hidden checks pass
  over what was sent" are both already in CI when the format changes.
- **CI.** The `checks` job runs the four new self-tests. The Lab list gains
  `card-owner` and `semantic-choices`. Each Lab machine then runs
  `check-hidden-information.py` over its games, rebuilds every board with
  `as-sent-traces.py --rebuilt`, and runs `check-snapshot-first`,
  `check-hidden-hands`, `check-hidden-log`, `check-hidden-tops`,
  `check-hidden-mulligans` and `check-hidden-information` again over the
  boards as sent. The "four older scenario scripts" note is gone.
- **Ledger.** `mechanics-lab-status.json` for Adaptive Automaton and
  Fireball now names the CI evidence; `MECHANICS_LAB_COVERAGE.md`
  regenerated (`--check` current).
- **Not done here:** P11-B8 (0109's reveal guard has no failing Lab
  game) is its own item. P11-R4's text still lists five hidden checks; D4's
  spec should name `check-hidden-information.py` among them (a change to a
  locked rule, so it is D4's to propose, not this item's).

**Proof (RUN, 2026-11-22, the owner's PC; the 1.75.0 release worker,
whose game code is main's: only P11-D0's timing marks were added since, 554875dc).**

- **Over the 1.75.0 release run's 432 traces** (109,275 boards, 1,317,227
  cards, 342 of them ones the viewer may not see, so the identity rule
  fired: HID-004): `check-hidden-information` OK, 5 s. Rewritten as sent
  and as rebuilt (8 s each): every one of the 109,275 rebuilt boards equals
  the worker's, and all six hidden checks pass on both, with the same counts
  as the whole traces (11,818 hand-card sightings, 22,806 play log lines,
  45,659 questions, 6,078 opening moves). Time over all 432, as sent:
  snapshot-first 4 s, hidden-hands 5, hidden-log 7, hidden-tops 19,
  hidden-mulligans 4, hidden-information 7; so about 20 s more per Lab
  machine (a third each).
- **The scenarios, three times each:** `card-owner` 3/3 OK (4 s; a stolen
  Goblin seen by both seats), `semantic-choices` 3/3 OK (4 s), `numbers x`
  3/3 OK ("X = 3 at {3}{R}, 3 dealt to Bob, can make 4", 4 s). All six
  hidden checks and `check-wording` pass over their traces (hidden-tops 2:
  nothing of its to check); `check-question-record` and the ledger
  `--check` pass.
- **Bites (TEST-004, HID-004).** Self-tests: `check-hidden-information` 17
  cases (15 planted faults fail, the clean boards pass), `check-card-owner`
  6, `check-semantic-choices` 7, `as-sent-traces` 5 (a page that forgets
  what it held is caught). Planted in REAL traces, each fails with exit 1
  and passes unplanted: a face-down card's name (`face-down`), a printing
  on a foretold card in exile (`piles-foretell`), the other seat's card in
  seat 1's hand, a hand list in a player entry, a hand in the public view
  (`spectator-public`), an untyped stack id. `check-card-owner`'s rule over
  its own real trace passes; with the stolen Goblin naming its thief it
  fails ("card:106 is now seat 1's, came in under seat 2, but names owner
  1"). Live mutants, the game answered differently from what the script
  recorded: `numbers x` given X = 1 while it recorded 3 fails on the cost,
  the stack entry and Bob's life on both seats ("20 -> 19");
  `semantic-choices` given the first type (Pilot) while it recorded Goblin
  fails on both seats ("the Automaton is not a Goblin ... the Raging Goblin
  is 1/1").

## As built: P11-D4 (2026-11-25)

Spec 0117, its As built in full (`docs/features/0117-p11-d4-only-what-changed.md`). Built on branch `p11-d4`; not yet released.

**What changed.** A page that asks (`?deltas=1`: the game page and the spectate page) is sent each board as a `MATCH_DELTA`: what changed since the board that connection was last sent. That is top-level keys set and unset, plus id- or seat-keyed lists patched by item; P11-D3's history fields ride along. A whole board still goes:
- on a connection's first board;
- for a new game;
- at every new turn (owner decision 1's checkpoint);
- on `MATCH_RESYNC`;
- when the delta would not be shorter;
- whenever deltas are off.

The page rebuilds the whole board from its own base before anything reads it (`delta.ts`, `match.ts`), keeping every unchanged item as the same object, which is for P11-C2. Switches: `PROXIC_MATCH_DELTAS` (on), `PROXIC_SPECTATOR_DELTAS` (off until decision 2), and test-only `PROXIC_TEST_DELTA_CHECK`. Nothing a player sees changes (P11-R1).

**P11-R4's gate, in CI.**
- **Lab:** `scripts/check-deltas.py` replays every seat's stream and the public one as the server sends them (the Python model in `measure-wire.py`, held to the Kotlin and the page by `protocol/fixtures/delta/`). It requires 0 boards rebuilt wrong, the id rule, and checkpoints whole. Then every hidden check runs over the rebuilt boards and must print what it printed over the worker's traces. This replaces B4's as-sent pass.
- **Browser:** every game: a delta's test-only `whole` against the page's rebuild (`DELTA_MISMATCH`), and no unasked `MATCH_RESYNC`.

Over the 1.75.0 run's 432 traces it passed with the same counts (11,818 hand-card sightings, 22,806 play log lines, 109,275 boards).

**Numbers** (RUN, the owner's PC, before 247212b9 against after, 3 runs of the redraw measure's real game at 1x):

| Measure | Before | After |
|---|---|---|
| Median bytes per update per seat, real game | 8.6-9.1 KB | 256 bytes (2.1% of D1's board) |
| Median bytes per update, Lab (all 432) | 3,384 | 143 |
| Median bytes per update, Lab (fixed 16) | 5,674 | 152 |
| On the wire, whole game | 121-125 KB | 90-96 KB (-23% to -25%) |
| On the wire, combat | | -25% |
| Messages | | unchanged |
| Server CPU per board | 3.38 ms (2.23-5.22) | 3.88 ms (2.50-4.38): within the spread |

The jump check over 17 traces with deltas and with whole boards: identical reports.

**Left for the owner.**
- Spectator deltas switch on in a later release (decision 2).
- Proposed for P11-R4's text, not made (a locked rule): name `check-hidden-information.py` among its hidden checks.

## As built: P11-E7 and P11-E8 (2026-11-25)

Admin opens at once, and pages keep their data. Branch `p11-e7`, built in
its own worktree against the second local stack (port 8081), from f72c9c76.
Nothing a player sees changes but pages being ready sooner (and two
timings, below).

**What changed.**

- **Kept data** (`frontend/src/kept.ts`, new). The last answer a page read
  is kept for the tab, in memory, and drawn at once on the next visit; the
  page still reads again on every visit, and the fresh answer replaces the
  kept one when it lands (`useKept`). The rules:
  - filed under the user id that read it; another person's is never handed
    out (`keptFor`);
  - forgotten at sign-out, on an expired session and at every sign-in
    (`forgetKept`, called from `AuthContext`), and a read still under way
    then is dropped when it lands (the latest-read numbers are forgotten
    too);
  - memory only: a reload, another tab or a closed browser keeps nothing
    (sessionStorage was not used, so nothing signed-in outlives the page);
  - the latest read wins; an admin action supersedes reads already under
    way (`supersede`), so a list read before the action can never land
    after the action's own re-read;
  - a failed read keeps what is shown; with nothing kept the page says it
    failed, as before.
- **Admin** (`AdminPage.tsx`):
  - reads the open tab's lists and one small overview
    (`GET /api/admin/overview?since=<the viewer's midnight>`, server
    `AdminOverview.kt`: the five tiles' numbers, the tab counts, the
    server's state and how long records are kept, counted from the same
    lists by the same rules the page used, `overview` and
    `signInsByPerson`), not all seven lists; each panel draws as its own
    list lands (no `Promise.all`);
  - once the open tab is in, the other tabs' lists are read ahead
    (`readAhead`), so a tab click draws its list at once and reads it again
    behind;
  - re-reads the open tab and the overview every 30 s only while its
    browser tab is seen; none while hidden, once on coming back if one was
    missed. Update waiting's own poll (`AdminUpdate.tsx`) and the shell's
    version check (`PageNotices.tsx`) also skip a hidden tab and read on
    coming back;
  - after an admin action, the open tab's list and the overview are read
    again **before** the outcome is said, and every other tab's kept list
    is forgotten (closing a room ends its game; any action may change any
    list), so those wait for a fresh read when opened;
  - the tab panel says `aria-busy` while its own list is first being read
    (nothing kept) -- not visible; it is what the loading measure now waits
    for;
  - start-up (E5) primes the open tab's lists and the overview by address
    (`earlyPages.ts` `adminOpening`), not all seven.
- **A header link starts its page's data with the click**
  (`early.ts` `startVisit`, from `Shell.tsx`), beside the page's code, not
  after it; the page takes it as it opens (`primedFetch`, P11-E5's rule: an
  answer never older than the player's last act).
- **Hall, Deck Depot and the lobby's deck list** keep theirs (`HallPage`,
  `DecksPage`, `LobbyPage`; the Deck Depot and the lobby share one kept
  `/api/decks`).
- The measuring kit (`loading.spec.ts` `READY`): Admin's "usable" waited
  for any list item in the panel, and "Loading accounts…" is one, so it
  timed the page's code, not its data. It now waits for the accounts
  themselves, the tab counts and the panel not busy; a tab, for its own
  list. The before was measured with the corrected check, on f72c9c76.
- **The header pages' code is fetched ahead** (`early.ts` `preloadPages`,
  from `Shell.tsx`): a second after a signed-in page's load event, the
  lobby's, Hall's, Deck Depot's, Account's (and for an administrator
  Admin's) built files go as `modulepreload` / style preload, the E5 links,
  one download each, kept like any built file. So a first click on a header
  page waits only for its data (which the click starts).

**Which pages keep data, and which wait.**

| Page | Kept and drawn at once, read again behind | Waits for a fresh read | Why |
|---|---|---|---|
| Hall | the Hall | -- | Changes only when a game ends; STANDINGS already re-reads it then (E16's rule kept). |
| Deck Depot | the library | an open deck (as before) | The kept list is your own; every change made on the page re-reads it, as before. A deck sent or shared from elsewhere shows one read later. The server checks every use (`canUseDeck`), so a stale line can't be used wrongly. |
| Lobby | the deck list (the Deck Depot's) | the room and the match you are in (`/api/rooms/current`, `/api/matches/current`) | Where you land must never be stale; those are read afresh on every visit and merged only when newer, as before. The rooms list and the players come from the lobby connection, which the shell keeps up to date across pages. |
| Account | -- | the email address and the linked computers (as before) | Your own settings; the page is already drawn at once from "who am I" (in-app again 39-48 ms). |
| Admin | each tab's list, the overview | after an admin action: every tab but the open one | The open tab and the numbers are re-read before the action's outcome is said; any action may change another tab's list, so those are read fresh when opened. |
| Status, room, game, spectate | -- | everything (as before) | Live state; not in E8's row. |

None of this shows kept data with a "refreshing" sign: a kept list is drawn
as the page always drew a list, and the fresh one replaces it (E8's row).

**Before and after (RUN, 2026-11-25; the owner's PC, 13th Gen i5-13600KF,
32 GB; the second local stack built from f72c9c76, then from this branch;
Playwright's bundled Chromium and WebKit; `node ci/measure.mjs loading
--engines chromium,webkit --links local,slow4g --grep "every page"`, 3 runs
each; medians, ms to usable; the corrected Admin check on both sides).**

```text
slow 4G                     Chromium            WebKit              target
Admin, header first          685 -> 235          832 -> 415          <= 300
Admin, header again          453 -> 42           560 -> 190          <= 100 (WebKit <= 300)
Admin cold by address       2109 -> 1889        1824 -> 1802         <= 2.0 s
Admin tabs cold by address  2102-2122 ->        1818-1850 ->         <= 2.0 s
                            1825-1890           1770-1819
Admin reload                 757 -> 599          818 -> 666          <= 900
Admin tab click            12-19 -> 17-26      107-111 -> 137-184    <= 50 (WebKit <= 150, no worse)
Hall, header first           458 -> 243          639 -> 378          <= 300
Hall, header again           222 -> 48           361 -> 211          <= 100 (WebKit <= 300)
Deck Depot, header first     449 -> 54           624 -> 191          <= 300
Deck Depot, header again     227 -> 51           356 -> 172          <= 100 (WebKit <= 300)
Account, header first        249 -> 75           394 -> 257          <= 300
Account, header again         39 -> 44           128 -> 175          <= 100 (WebKit <= 300)
lobby, header first / again  51/46 -> 46/42     127/126 -> 186/176   <= 300 / <= 100

local                       Chromium            WebKit
Admin first / again          89/87 -> 56/42     255/206 -> 232/162
Admin tab click            16-25 -> 16-30      106-113 -> 125-153
Hall again, Deck Depot again 48/53 -> 46/46     187/187 -> 206/156
Admin cold / reload          126/65 -> 114/55   326/275 -> 334/290

requests and bytes          Admin again: 8 API reads, 9.0 KB -> 3 reads, 3.3 KB (accounts, invitations,
                            overview); Admin first: 26 KB -> 9.8 KB (the code was fetched ahead);
                            a tab click: 0 -> 1 read (its list again, behind); a cold signed-in page:
                            +7 to +10 requests and +1 to +46 KB once per update (the header pages'
                            code ahead, after the page is usable)
```

- **Targets, Chromium: all met.** Admin first click 235 ms (<= 300),
  revisit 42 ms (<= 100), cold by address 1,825-1,890 ms (<= 2.0 s), tab click
  17-26 ms (<= 50); Hall, Deck Depot, Account and lobby revisits 42-51 ms
  (<= 100 on slow 4G); every first in-app visit 46-243 ms (<= 300).
- **WebKit: revisits within its allowance (<= 300), first visits not.**
  Admin first 415 ms and Hall first 378 ms on slow 4G are over the 300 that
  stands in every engine (were 832 and 639). WebKit's tab click
  (107-111 -> 137-184 slow 4G, 106-113 -> 125-153 local) and its lobby and
  Account revisits (126-128 -> 175-176) came out slower; Account's and the
  lobby's code didn't change. **These WebKit runs overlapped the other
  builder's measures on the same PC** (`p11-d4`'s `ci/measure.mjs redraw`,
  real games, seen running from 08:03): each WebKit number in them is
  bimodal (one run at the before's value, the others 20-80 ms later), and a
  single WebKit run of the same build while that machine was quiet
  (`exp2`, below) gave the before's values: tab clicks 107-113 (one 129),
  Account and lobby revisits 127-130, Admin first 359, Hall first 372. So
  the WebKit in-app numbers here are not clean; they are owed one quiet
  3-run WebKit measure. Chromium's (2.5-8x lighter here) were steady.
- **Found on the way: preload links left in the page may slow WebKit.**
  With the header pages' code fetched ahead and the `<link>`s left in the
  head, a 3-run WebKit measure gave tab clicks 117-209 and revisits
  126-204; with each link taken out once its file is in (`preloadPages`),
  one run gave 107-130. The 3-run may have overlapped the other builder's
  load too, so how much was the links is not separated (INFERENCE); taking
  them out costs nothing (the file stays in the browser's module map and
  cache). E5's start-up links stay in the head for the page's life; if the
  links are the cause, the same cost is in WebKit's in-app numbers since E5.
- **Slower (P11-R7).** A tab click now reads its list again behind: 1
  request, 0.6-3.3 KB, where it read none (the list is drawn first, so the
  click itself is not slower in Chromium). A cold signed-in page fetches the
  header pages' code ahead after it is usable: +7 to +10 requests, +1 to
  +46 KB, once per update (then kept by the browser for a year); the cold
  load's usable time is unchanged within the spread. Chromium local Deck
  Depot reload 32 -> 72 ms (median; runs 33/72/101, the other builder's load
  again; slow 4G reload 388 -> 384).
- **What a player (an administrator) could notice.** After an admin action
  the outcome line now appears together with the list that shows it (one
  read later than before, when it came first and the list caught up after
  re-reading all eight). Nothing else changes but timing.
- **Not built, with reasons.** Paging Sign-ins and Games (E7's row): Games
  is already the newest 50 (`AdminMatches.RECENT`) behind "Show all", and
  the Sign-ins list is 1.1-1.5 KB gzipped since E4; paging a list grouped by
  name would need a pager, a new look (P11-R1), for a saving of about 1 KB.
  An ETag on the admin lists (E17's note): the reads are now one list of
  0.6-3.3 KB at a time; not worth a validator.

**Two people in one tab, and signing out (proof, RUN).**
- `kept-data.spec.ts` "a revisit draws the kept lists at once; signing out
  forgets them, so the next person in the tab waits for their own":
  RudeLeft visits the Deck Depot, Hall and Admin; revisits them with every
  read held at the server's door and sees his lists at once (Admin's Games
  tab drawn, not busy; each page did ask again). He signs out; Pat signs in
  on the same page (no reload, so the tab's memory is the same) with her
  own reads held: the Deck Depot shows no deck at all and none of
  RudeLeft's names, the Hall says "Loading…"; released, Pat's own Hall
  draws. Pat asks no `/api/admin/` address on /admin.
  **Bite:** against a build with both safeguards removed (`keptFor`
  ignoring the person, sign-out not forgetting), Pat's Deck Depot drew
  RudeLeft's library ("Expected: 0, Received: 1"); restored, it passes.
- `kept.test.tsx` (7): each safeguard alone bites -- `keptFor` ignoring the
  person fails "one person's kept data is never handed to another";
  sign-out not dropping reads under way fails "signing out forgets
  everything, and a read still under way is not kept after it"; no
  latest-read check fails 4 (with E16's Hall tests).
- E17's server rule is unchanged: every `/api` answer, the overview
  included, is `private, no-store`; kept data is the page's memory only,
  never storage, never a shared cache.

**Admin asks nothing while hidden (proof, RUN).** `kept-data.spec.ts`
"Admin asks nothing while its browser tab is hidden, and reads again on
coming back": the page hidden, its clock run ten minutes a minute at a time:
0 requests (it re-read 8 lists every 30 s before, about 9 MB an hour live);
shown again: the accounts and the overview at once. `adminKept.test.tsx`
proves the same with fake timers; without the hidden check it fails.

**Tests.** `adminKept.test.tsx` (6): opening reads only the open tab and
the overview, then the rest ahead; a tab click draws the read-ahead list;
a revisit draws the kept accounts and numbers before any answer; hidden;
after an action the list is re-read before the outcome is said and the
other tabs are forgotten; a player reads no admin list. Bites: reading all
seven at once fails 5, saying the outcome before the re-read fails 1,
not forgetting the other tabs fails 1, the hidden check removed fails 1.
`early.test.ts`: the Admin address primes its tab and the overview (all
seven primed fails 3), a header link primes its page's data, the header
pages' code goes as preloads that leave once in. `AdminOverviewTest`
(server): the overview counts what the lists hold from the viewer's day,
and refuses a missing or bad `since`; `AdminApiTest`'s every-route test
covers it for a player (403) and nobody (401). Browser specs on the second
stack: admin, auth, lobby, belt-records, decks, sharing, notices,
kept-data, hidden-tab, foundation and device-link, 76 passed (3.9 min); at CI
speed (`node ci/ci-speed.mjs`, CPU 4x, the "other" machine's run), 82
passed (6.4 min).

**The loading measure itself (TEST-013).** One after-run of the measure
stalled with no output for over ten minutes in its local pass and was
stopped; the next three-run measure of the same build, and every run since,
finished. Its cause was not found (the stall left no Playwright result; the
server's log shows nothing for it); recorded here, not in the Flakes table,
as it is the kit's and did not recur.

**Left open.** WebKit's first-visit target (300 ms on slow 4G) for Admin
and the Hall, and one quiet WebKit measure (above); Firefox (does not start
on this PC; CI's `engines` job); E5's preload links in WebKit (above).

## As built: P11-E6 (2026-11-25)

The game's code before the game, and the mana pictures as files. Branch
`p11-e6`, built in its own worktree against the second local stack (port
8081), from d2dd5754. Nothing a player sees changes (the compare below) but
the game's page opening sooner after Start match on a slow link.

**What changed.**

- **Mana pictures are files.** `vite.config.ts` `assetsInlineLimit` never
  inlines a mana symbol (`earlyPages.ts` `isManaPicture`); everything else
  keeps Vite's 4 KB rule. The 30 symbols under 4 KB were base64 text inside
  the board's chunk: that chunk is 460.8 -> 312.5 KB (gzip 217.9 -> 107.5
  KB), and the game page's code 488.8 -> 382 KB transferred. The glob moved
  to its own module, `battlefield/manaPictures.ts` (`symbolUrl`,
  `COMMON_SYMBOLS`, `commonPictures`); `ManaCost.tsx` re-exports `symbolUrl`.
  The files are built files under hashed names, so the server serves them
  as it serves every signed-in built file (`SignedInGate.kt`
  `keepOnlySuccesses`: `private, max-age=31536000, immutable`; spec 0060 and
  E3's rule). They are not made `public`: a stranger gets the sign-in files
  only (owner 2026-10-24), and no mana symbol is on the sign-in page. No
  server change.
- **The game's code ahead, while sitting in a room.** `shell/Shell.tsx`
  `GameAhead` / `useGameAhead`: on any signed-in page but the game's own
  (`isGameRoute`), while the player's room is set, 3 s after the page's load
  (`GAME_AHEAD_AFTER_MS`) it calls `early.ts` `preloadGame`: the game page's
  built files (the build's `#pa-early` list, `aheadOf("/game")`), then the
  15 common mana pictures (`COMMON_SYMBOLS`: the five colours, colourless,
  1-7, X, tap; 55.6 KB), as E5/E7's preload links (modulepreload, style
  preload, image preload without crossorigin, as the `<img>` asks), **one
  file at a time** (`inTurn`), each link taken out once in, no file asked
  twice in the page (`askedAhead`, which now also covers E7's
  `preloadPages`). A failed file lets the rest go on.
- **Start match pressed stops it** (`LobbyPage` `startMatch` ->
  `early.ts` `gameStarting`): nothing more is fetched ahead; what is not in
  by then comes with the game's page, as before.
- **Measuring kit** (`tools/measure/loading.spec.ts`): a new test, "start
  match: from the room to the game table". The host's room is readied on
  setup pages, then the host's own new profile opens the lobby over the link
  and either sits until its page has fetched all it fetches on its own
  (`quiet`) or presses Start match as soon as the room is drawn. Rows:
  `room sat` (what sitting fetched after the room was usable: the bytes a
  player who never starts pays; Chromium's long tasks over it), `start sat`
  and `start at-once` (usable = the press to the table drawn from its first
  board, the life totals: right after Start match the hands are not dealt;
  `screenMs` the press to the game's own page drawn, its code in; `boardMs`
  the press to the first board on the match socket; `afterBoardMs`).

**How it was built: three versions measured (RUN, 2026-11-25).**

1. Fetched 1 s after load, all at once, and the code and pictures again on
   the press. A slow-4G **room reload** got slower (Chromium 384 -> 751 ms,
   WebKit 609 -> 1,451): the measure reloads about 2 s after arriving, the
   aborted downloads still filled the link. And **Start match pressed at
   once** got slower on slow 4G (first board 5,152 -> 6,255 ms in
   Chromium).
2. 3 s after load and one file at a time fixed the reload (WebKit slow 4G
   632 -> 611). The press still fetched the code: at once on slow 4G, the
   first board came 1.0-1.9 s later (Chromium 4,964 -> 6,634, WebKit 5,192
   -> 6,933). Those downloads share the link with the start's own requests
   (prepare, set-up, launch), so the game starts later.
3. **Built:** the press stops the prefetch and fetches nothing.

**Before and after (RUN, 2026-11-25; the owner's PC, 13th Gen i5-13600KF,
32 GB; the second local stack built from d2dd5754, then from this branch;
Playwright's bundled Chromium and WebKit; `node ci/measure.mjs loading
--engines chromium,webkit --links local,slow4g,live --grep
"[rs][ot][oa][mr][,t]"` (the room/game/spectate test and the new one), 3
runs each, the before taken again on the same stack an hour before the
after (an earlier before, 6 hours earlier, drifted: WebKit's local
spectate reload was 743 then, 1,136 later on the same base build); medians,
ms).**

```text
Start match -> the table      Chromium                         WebKit                           target
(sat in the room: code ahead) local      slow 4G    live       local      slow 4G    live
  table usable                4517->4567 5023->5294 4938->5182 4800->4884 5372->5532 5147->5481  <= 1000 (live)
  game page drawn (screen)    2146->2152 4638->2732 3064->2670 2390->2447 4898->3036 3401->2991
  first board                 4472->4541 4972->5270 4896->5156 4687->4823 5280->5472 5072->5400
  board -> table                34->26     44->29     45->25     88->61     91->71     76->61
  fetched after the press     524->151 KB, 19->9 requests (code: 320 -> 0 KB); WebKit 484->112 KB live
(pressed at once: no code ahead)
  table usable                4409->4643 4990->5117 4985->5160 4771->4959 5285->5414 5164->5613
  game page drawn             2071->2230 4615->4133 3049->3086 2404->2508 4804->4366 3337->3535

The game, by address        Chromium                         WebKit                           target
  cold                        174->171   3985->3608 2044->2108  496->501   4227->3667 2241->2167  <= 2000 (live)
  reload                       71->56     926->893   863->863   384->407   1105->1082 1020->1008
  cold KB (live)              765.9 -> 647.0 (JS 488.8 -> 382.0), 50 -> 54 requests; WebKit 765.3 -> 665.4
Spectate cold                 174->158   4028->3645 2060->2113  536->534   4313->3693 2279->2214
Spectate reload                64->68     909->912   884->865  1136->717   1039->1036 1020->990

The room                      Chromium                         WebKit
  cold                        120->124   2086->1988 1458->1458  363->373   2162->2206 1627->1603
  reload                       42->42     394->396   378->374   268->257    632->603   619->578
  sitting, after usable:      36 -> 346 KB, 7 -> 29 requests (local); 36-69 -> 346-377 KB on the links
  what it fetched             (+212 KB scripts, +33 KB styles, +64 KB pictures, +22 requests); Chromium long tasks 0 -> 0 ms
  time to fetch it all        local 5.1 s, live-like 9.2 s, slow 4G 10.4 s (3 s wait, then one at a time;
                              the measure's 2 s of quiet included)
```

- **Targets.**
  - **Table usable <= 1.0 s after Start match, code ahead, live-like: not
    met, and not reachable by the page (5,182 ms Chromium, 5,481 WebKit).**
    The page learns there is a game only when the server has prepared,
    set up and launched it: the game's page is drawn 2.1 s after the press
    locally, with nothing to download (`screenMs`, local). The first board
    comes when Forge has started: 4.5-5.4 s after the press on every link,
    locally too. The page draws the table 25-71 ms after the board (was 34-91). What
    E6 moves is the game's page itself: drawn 0.4 s sooner on the
    live-like link (3,064 -> 2,670 Chromium, 3,401 -> 2,991 WebKit) and 1.9
    s sooner on slow 4G (4,638 -> 2,732, 4,898 -> 3,036), with no code left
    to fetch after the press (320 KB -> 0). The 1.0 s target needs the
    server's start (prepare + launch, about 2.1 s) and Forge's start (about
    2.4 s more) shortened: not E6's.
  - **Cold <= 2.0 s (the game by address, live-like): not met** (Chromium
    2,108, WebKit 2,167; were 2,044 and 2,241). On slow 4G both are 9-13%
    faster (3,985 -> 3,608, 4,227 -> 3,667). What is left on the live-like
    link is the code's download over the shared link (382 KB) and its
    run (local cold 171 ms Chromium, 501 WebKit).
  - "Mana pictures become files (cached, in parallel)": met; 0 of 68
    inlined; the common 15 ahead.
- **Slower (P11-R7).**
  - **The first board after Start match, code ahead: 70-330 ms later** in
    both engines on every link (above), while the game's page comes sooner.
    Not the network: with the game page's swirl stilled (reduced motion),
    the same measure (Chromium, 2 runs) gave first boards of 4,948 and 4,821
    on slow 4G and 4,886 and 4,729 live-like, against 4,972 and 4,896
    before: no later. The swirl (spec 0065's canvas, 60 frames a second) now
    runs about 2 s longer, while the Forge worker starts on the same PC
    (INFERENCE: CPU shared on one machine; live, the server is another box,
    the Unraid server, and this cost would not be there; not measured
    there).
  - **Pressed at once: 50-450 ms later** (Chromium live 4,985 -> 5,160,
    WebKit live 5,164 -> 5,613); the game's page comes at about the same
    time (the code is not ahead), the same swirl cost after it.
  - Chromium's cold game on the live-like link 2,044 -> 2,108 (+3%): the
    mana pictures are now their own requests on a six-connection link
    (50 -> 54 requests); WebKit's is 3% faster. Spectate cold likewise
    (+2.6% Chromium live, -3% WebKit).
  - A player who never starts a game pays +309 KB and 22 requests, once per
    update, starting 3 s after sitting down (the item's risk). A page
    reloaded or left while that runs shares the link with at most one file.
- **WebKit's local spectate reload** 1,136 -> 717: not this change's. The
  base build gave 1,109-1,188 at the time of the before, and 673-762 six
  hours earlier, on the same stack (RUN, 2 probes); it is the stack's or
  the machine's state, so it is left out of both directions.

**Nothing a player sees changed (RUN).**
- The 30 inlined pictures are the source files byte for byte (sha256 of
  each base64 body taken from the served board chunk before, against
  `src/assets/mana`: 30 of 30), and all 68 built files are the source files
  byte for byte. The same bytes decode to the same pixels.
- Screenshots: a real game on the second stack (green deck, a dealt hand
  of Grizzly Bears, Centaur Courser, Thornhide Wolves, Colossal Dreadmaw,
  Steel Leaf Champion, Llanowar Elves, Giant Growth), 1920x1080, before and
  after, in **Chromium and WebKit** (WebKit at its device scale 2, so the
  symbols at twice the pixels): every hand card's cost (7) and every cost
  while the card is hovered and raised (7), 14 element shots per engine:
  **identical, pixel for pixel, in both engines**; the 14 symbols drawn at
  the same sizes (11.8-13.2 px), 4 of them inlined before, 0 after. The
  reading view (the close-up) draws a cost only when Forge says it changed
  (spec 0058), and its symbol is the same `ManaCost` with the same files. Not
  compared: Firefox (does not start on this PC); the loading swirl (random
  sparks; its five pictures are the same files).
- **One visible timing difference, owed to the owner's eye:** in a game
  opened without sitting in a room first (a reload, the first game after
  an update pressed at once), a symbol that is not one of the common 15,
  or not yet in, now arrives as its own file with the card pictures, as
  W, B, R and G (over 4 KB, so files already) always have. The 30 small ones
  used to come inside the code.

**Tests.**
- `early.test.ts` (5 new): sitting fetches the game's code then the common
  pictures one at a time, each once, pictures without crossorigin, links
  taken out; once Start match is pressed nothing more (mid-way or later);
  pressed before the wait, nothing at all; a failed file does not stop the
  rest; every common symbol has a file. `tools/bundle/manaFiles.test.ts`
  (2): the build's own config never inlines a mana picture and keeps Vite's
  rule for the rest; `isManaPicture` on either slash.
- `e2e/match-game-ahead.spec.ts` (new, real clicks): a player in no room
  fetches none of the game's own code and no mana picture; open a room,
  invite, accept: both seats fetch the game's code (5 files) and the 15
  pictures, each once, and the links are gone; choose decks, Ready, Start
  match: the table is drawn and no game code is asked again. It is the
  item's real-click game (TEST-012). At CI speed (`node ci/ci-speed.mjs`,
  CPU 4x, after match-casting-dock, which skipped here: no deck): passed,
  18.9 s. With the specs whose code was touched (lobby, match-setup, auth,
  foundation, kept-data, hidden-tab) on the second stack, in Edge (the
  config's default channel): 48 passed (2.2 min).
- **Bites (TEST-004).** Each of these fails a test, restored after:
  prefetch removed (`useGameAhead(false)`, the stack rebuilt): the spec
  ("code 0, pictures 0"), and the measure (`room sat` 36 KB, `start sat`
  fetches 212 KB of code again, the game's page drawn 3,067 not ~2,670 ms
  live-like); mana inlining restored (stack rebuilt): `manaFiles.test.ts`
  and the spec ("pictures 4": only W, B, R and G were files); pictures asked
  with crossorigin: 1; all at once instead of one at a time: 3; no "never
  twice": 1; no pictures ahead: 2; the press not stopping it: 2; a failed
  file stopping the chain: 1.

**Not done, left open.** The 1.0 s target (the server's and Forge's start,
above); the cold 2.0 s (the code's size, E11/D-items' territory); Firefox
(does not start on this PC; CI's `engines` job); the live site; the swirl's
CPU while Forge starts, measured only on one machine.

**Owner, 2026-11-25 (by prompt: "Ship it, accept as is"):** E6 ships with
these numbers as its result. The 1.0 s and 2.0 s targets are recorded as
missed, the later first board (70-330 ms) and the slower at-once and
Chromium cold rows are accepted, and no follow-up item is added for the
server's ~5 s game start.

## As built: P11-C2 (2026-11-25)

Branch `p11-c2`, built in its own worktree against the first local stack
(port 8080), from d2dd5754. Goal work: nothing a player sees changes
(P11-R1), no protocol change.

**What changed.** A card nothing happened to is the same object from the
socket onward, so it is read once, drawn once and never compared again:

- **The delta step** (`delta.ts`): P11-D4's rebuild already kept every row a
  delta does not name. Now the common patch -- items put back in their own
  places, none new, none dropped, the order kept -- is applied in time with
  what changed (`patchedInPlace`): a list this page rebuilt remembers each
  item's key and place (`listKeys`), so the next delta to it reads only the
  items it puts. Anything else (a drop, a new item, a new order, a list never
  rebuilt here, a delta that does not fit) takes the full rule as before,
  with the same checks and the same `DeltaError`.
- **Reading the board** (`match.ts`): the table, the hands, the graveyards and
  exile are read card by card through `keptCards`: a row is read once
  (`readRows`, by the row object), so an unchanged card is the very
  `SnapshotCard` it was. The small lists (`casting`, the library's top, the
  reports' cards) are read afresh as before: GameScreen's `lastCasting`
  effect keys on the casting card's object, and reading it afresh keeps that
  effect running on every board as it did.
- **Drawing it** (`fromSnapshot.ts`): `tableCards` derives each table card
  once and keeps its drawing by card object while the other things it reads
  are the same objects too (its prepared spell and held cards in exile,
  whether it is in combat); a "prevent the next N" used up on this board is
  drawn afresh and never kept. The outcome fields are added once
  (`withOutcomes`, no second copy of every card). Hand cards and the other
  hand's shown cards are drawn once each (`keptHandCard`); a soulbond
  partner's words are kept while its partner's name is (`withPartners`).
- **Comparing** (`keepCards`): an unchanged list is the same objects in the
  same order, so it is the list before with nothing compared; within a list
  only a card drawn afresh is compared by contents (`sameContent` starts with
  identity). `sizeTicks.ts` `sizeChanges` skips the very same card at a
  glance. `tileMovesOf` reads nothing when there are no moves.
- **What reads two boards is unchanged:** the departures, arrivals, merges,
  returns and tile moves still read the board before and this one, and
  `carryMoments` still carries a skipped board's one-time moments; they just
  meet shared card objects now.
- **The kit:** the redraw measure's bench now sends its boards as the server
  does since D4 (a whole board, then `MATCH_DELTA`s, `DeltaStream`), so the
  page meets kept rows as in a game (`PROXIC_MEASURE_WHOLE=1` sends every
  board whole, as before), and it also times the land tap on tables of 10 and
  100 permanents a side (`tap-one-land-10`, `tap-one-land-100`). Before and
  after below both ran this bench.

**The page's read of one update (BENCHMARK, the owner's PC, Node 24, 2026-11-25).**
From the socket's parsed message to the board's data (`reduceMatch`:
`applyDelta`, `withHistory`, `asSnapshot`; then `carryMoments`,
`boardFromSnapshot`, `keepCards`), one Forest tapping per update, the same
`MATCH_DELTA`s to both, median of 7 rounds of 400 updates (a scratch tool
bundling d2dd5754's page code beside this branch's):

```text
permanents a side   cards   before us/update   after us/update   after/before
       10             20          64-68             21               0.31
       40             80         184-218            29               0.16
      100            200         433-497            47               0.11
      200            400         913-936            85               0.09
```

Before, the read grew by about 2.3 us per card on the table; after, about
0.17 us (one weak-map look-up, a few set and identity checks per card): what
is left per card is a pointer walk, the rest follows what changed.

**In the browser (RUN, `node ci/measure.mjs redraw`, 3 runs each, the owner's
PC as C1, Playwright's bundled Chromium; the first local stack built from the
worktree, before at d2dd5754, after at this branch; stack B was in use by
another builder throughout, so the CPU was shared).** Medians of 3; "!" a
number whose runs are not all within ±10%. Per update.

```text
moment               table  renders      app ms           all JS ms        frames p95/worst
                            before>after before > after   before > after   before      after
the replayed table (boards sent as deltas)
1x tap-one-land        87   18 > 18      2.95 > 2.93      3.76 > 3.94!     16.7/16.8   16.8/16.8
1x bench-40            87   20.2 > 21.4  2.67 > 2.94!     3.67 > 4.35!     16.7/16.8   16.7/16.8
1x tap-one-land-10     27   14 > 14      2.09 > 2.57!     2.69 > 3.25!     16.8/16.8   16.8/33.3!
1x tap-one-land-100   207   44.3 > 44.3  4.40! > 4.77     5.48! > 5.59!    16.8/83.3   16.7/100!
4x tap-one-land        87   18 > 18      16.9 > 15.0!     18.4! > 19.1!    16.8/83.3!  16.8/83.3!
4x bench-40            87   20.2 > 21.4  14.9! > 15.2!    20.3! > 19.5!    16.7/50!    16.7/66.7!
4x tap-one-land-10     27   14 > 14      10.2! > 11.6!    12.0 > 13.2!     16.8/83.3!  16.8/83.3!
4x tap-one-land-100   207   27.4! > 27!  24.7! > 23.1     26.0! > 26.2     16.8/133!   16.8/83.3!
the real game (a cross-check)
1x cast                30   31.1! > 31.2 1.59 > 1.69      1.94! > 2.00     16.7/16.8!  16.7/16.8!
1x combat              34   20.5! > 21.8 1.42 > 1.34      1.84 > 1.55      33.4!/50!   33.3/50!
4x cast                30   29.3! > 22.4! 10.8! > 10.2!   11.3! > 10.0!    33.4!/83.4! 16.8!/100!
4x combat              34   18.2! > 17.9! 7.71! > 8.06    7.54! > 7.87     33.4!/200!  33.4/117!
```

- **No change the browser measure can see.** Every per-update number moved
  within its own runs' spread, both ways (run by run, 4x tap-one-land's app
  ms 16.2-18.0 before, 14.5-22.4 after; 1x tap-one-land 2.84-3.06 before,
  2.88-3.40 after). The bench was steadier in C1's and C3's runs than today's
  (the CPU was shared with the other stack today). Renders per update are
  the same, as they should be: C2 changes what the board's data is made of,
  not what React draws.
- **Why:** the read above is 0.2 ms of a land tap at 1x on the 40-a-side
  table before (about 0.8 ms at 4x, by the 4x slowdown: INFERENCE) and 0.03
  ms after; the page's own JavaScript per update is about 3 ms at 1x and 15 ms
  at 4x, nearly all of it React drawing the board and its layout and the
  glide pass (C3, C4, C5). So C2 removes its own slice (by its own measure,
  above) without moving the total beyond the spread.
- **How the work scales with the table, in the browser:** the land tap costs
  about 2.1 ms (10 a side), 2.9 (40) and 4.4-4.8 (100) at 1x, before and
  after alike: what still grows with the table is the drawing (renders 14,
  18 and 44 per update), not the read.
- **Slower (P11-R7):** none beyond the spread. Bytes on the wire are not
  touched (the protocol is the same).

**The target.** "Work grows with what changed, not the table's size": **met
for the read** (the socket to the board's data: 0.17 us a card left, against
2.3, above). "A card nothing happened to is the same object from the socket
onward, so nothing re-derives or re-compares it": **met** -- tested end to end
(below), and over the Lab: 164,574 boards drawn from the 1.75.0 release run's
432 traces, every seat and the public view, an average table of 5.9 cards of
which 0.52 a board (8.9%) were drawn afresh, the rest the same objects; hand
cards 5.8 a board, 0.55 read afresh. "Each card derived once per update":
**met** (one drawing per changed card, none for the rest; before, every card
was copied twice, by `toBoardCard` and the old `withOutcomes`).

**Proof.**

- **Equivalence over the Lab (RUN, a scratch tool):** for every board of the
  432 traces, both seats and the public view, the board's data made by
  d2dd5754's code from whole boards and by this branch's from the same boards
  sent as `DeltaStream` sends them are the same, value for value (every Map
  and Set too), and so are the parsed boards; kept-or-not is the same for
  every list and every card; twice over, once drawing every board and once
  skipping every other board (its moments carried, `carry.ts`): 0 mismatches,
  no resync.
- **Page tests:** `keptCards.test.ts`, 15 tests: one land tapping leaves every
  other card the same object from the parsed board to the drawing and the
  hand the very list; an unchanged card's drawing is reused before any
  compare; a whole board is read afresh and still kept by contents; the
  delta and whole paths draw alike; departures and arrivals; a skipped
  board's survivor carried onto a kept card; a size change still ticks; a
  drawing made again when combat, a prepared spell, a held card, a used-up
  count or a partner's name changes; a changed row read again; the in-place
  patch over 300 random changes rebuilds exactly what was sent, keeping every
  untouched row; a delta that puts one card twice still asks for the whole
  board.
- **Bites (TEST-004), each mutant with the page tests of `src/battlefield`,
  `match.test.ts` and `delta.test.ts`, all caught (16 of 16):** the drawing
  kept although combat (3 failing), the prepared spell (1) or the held cards
  (1) changed; a used-up count kept (1); rows read once per id instead of per
  row (46); a list kept by its length (14); sizes skipped by id (10); a
  partner kept whatever its name (1); no tile moves at all (3); never soaked
  (1); blocker candidates not in combat (2); a hand drawing kept by the first
  card (16); the in-place patch taking a repeated key (1, after its test was
  added: it was not caught at first), patching a list with drops (3),
  ignoring the order (1), or putting at the first place (3).

**Looks identical.** The jump check (RUN, 2026-11-25, headed Edge -- the
bundled Chromium's headed browser no longer starts on this PC: "side-by-side
configuration is incorrect", as Firefox's -- the first local stack) over the
30 Lab traces C3 chose (combat, moves and piles, copies, forms and sides,
tokens, the plates, Karn's restart; the 1.75.0 run's), both seats, with
`JUMPS_DELTAS=1` so the page builds each board on the one it holds and meets
kept rows: before (d2dd5754) and after, 41.8 and 41.5 minutes:
`check-jumps.py`'s reports are identical, line for line (the known flags
only: the restart's cards "not shown at all", in-place flips "changed form,
no animation").

**The clip** (RUN): `board-data-combat`, seat 1, boards 50-61 (two attackers,
a block, first-strike and regular damage, a death), sent as deltas at normal
speed into a real game page and filmed with Chrome's screencast (1,126 and
1,197 frames), before and after. Side by side at the same moments after each
board they are the same picture, seen by eye: the stack card with its motes,
the attack, the blocks, the hits, the death's fade, the card leaving; each
board's settled frame differs in 0-171 of 518,400 pixels (at most 0.033%), the
drifting motes and a few milliseconds' timing. Files: the session's
scratchpad, `c2-clip-before/`, `c2-clip-after/`, `c2-clip-sheet.jpg`.

**Checks.** Browser specs on the first stack built from this branch, bundled
Chromium (RUN): `match` (the real-click game: two players reach a real game
and the asked one acts), `match-board-motion`, `match-lands-stay-put`,
`match-big-combat`, `match-state`, `match-history`, `match-watching` (2),
`match-stack-rests`, `notices` (2): 11 passed, 1 skipped (`match`'s abandon
test, skipped in the spec). `node ci/ci-speed.mjs` (CPU 4x, each with its CI
neighbour): `match-board-motion`, `match-lands-stay-put`: 3 passed, 2
skipped. No browser spec was added or changed (the measure is the kit's).
Gates in the worktree: `npm ci`, `tsc -b`, `tsc -p tsconfig.e2e.json`,
eslint, prettier, vitest (1913/1913, 136 files), `vite build`,
`check-doc-refs.py`.

**Left open.** The rest of each update's JavaScript is the drawing (React,
the layout, the glide pass): C3, C4 and C5's. The browser measure could not
show C2's saving through today's spread; a quieter PC (no second stack
running) would show whether the replayed table's 4x land tap moves at all.

## As built: P11-C5 (and B2) (2026-11-25)

Branch `p11-c5`, built in its own worktree against the first local stack
(port 8080), from f08b0e66. One change a player could see is possible in
principle (a layer), so it was checked frame by frame: nothing looks
different (below, P11-R1).

**The repaint measure (new, in the kit).** `node ci/measure.mjs repaint`
runs `frontend/tools/measure/repaint.spec.ts` with `repaint.ts`: Chrome's
`Paint` event says only that a layer painted (its clip is the layer's, C1),
so the measure reads where the compositor really drew again. With the
trace categories `disabled-by-default-devtools.timeline.layers` and
`disabled-by-default-blink.invalidation`, every frame carries the
compositor's layer tree (`LayerTreeHostImpl:snapshot`), and each layer
Blink invalidated in that frame's commit names the rectangles, the object
that asked and why (`annotated_invalidation_rects`). Per commit the
rectangles are placed on screen through each layer's quad and unioned on a
2 px grid (`measureSnapshots`); then, per update: the painted area; the
part outside the moment's target (`targetsOf`: the cards the board changed,
before and after, the piles holding them, the stack while a spell is on it,
the plates when a life total changed); the same with each card's own lift
shadow counted in (`SHADOW`: a gliding card is lifted, Phase 10 A-00, and
its layer is cut about 0.35 of its height round it); the layers the
compositor holds and their tiles' memory (most at once); and the area by
the object that asked (`repaint-causes.json`, read by a person). The other
page of the game is frozen while a stretch is measured
(`Page.setWebLifecycleState`). The first commits after the categories come
on carry the whole page (Blink starts tracking), so each stretch starts at a
mark after a 400 ms lead-in. The bench is the redraw measure's, moved into
`bench.ts` (its boards and rhythm unchanged), with the moments as boards:
`tapLand` (10 boards, 0.7 s apart), `casts` (a hand Grizzly Bears onto the
stack, two Forests paying, then onto the table; three times), `combatStep`
(two attack, one is blocked, damage kills both fighters and costs 2 life,
the end; twice), at 10, 40 and 100 permanents a side, and the busy board
(below). A second test, "busy board", is P11-B2's (below).

**Causes found (RUN, the measure's causes and the layer trees).**

1. **The big one: a whole window drawn again, two or three times, for each
   cast and each combat step.** Whenever a card starts a Glide or a cast card
   flies, the browser lifts everything painted after it that overlaps it into
   new layers: the effects overlay (`.bf-effects`), the stack's words
   (`.bf-stack-caption`), the flights (`.gs-flights`) and the chat tab, each
   a layer the size of the window ("Overlaps other composited content"), and
   each new layer is drawn in full ("full layer"); when the move ends they
   are dropped, and the next move makes them again. 2.2-3.3 million px per
   update in a cast (a 1920 x 1080 window is 2.07 million), 1.1-1.6 million
   in a combat. Most of those tiles are empty (the compositor finds them
   transparent and keeps no memory for them), so the work is cheaper than
   the area, but it is the area Chrome's paint flashing shows.
2. **What is left is the moving cards' own drawing.** Each card that glides
   (the land that taps, its ghost leaving the pile, a cast card, a fighter)
   is drawn once in full as it starts and as it lands: its box plus its lift
   shadow (`.bf-moving .bf-card`'s `box-shadow`, which comes and goes with
   the move, so the card must be drawn again whatever layer it is in), its
   pile number, its state tab and its mana sign. That is the approved Glide
   look (Phase 10 A-00), not waste.
3. **On a crowded table more cards move.** At 100 a side a land leaving its
   pile re-spaces its row, and the neighbours glide too (P10-R1): 28 thousand
   px per tap outside the land's own box and shadow.
4. **Idle is 0** on every table (no commit invalidates anything), with or
   without 32 flyers: the looping animations (flyers' bob, the z's, the
   breath) are drawn by the compositor. They do restyle every frame (C1's
   finding): with flyers 29-34 ms per 5 s at 1x, 136-162 at 4x (busy board
   below). That is style time, not painting, and not this item's.
5. **Looping animations that would repaint every frame** (they animate a
   painted property): the arrows' flowing beam and the swords' glint
   (`stroke-dashoffset` in an SVG, and SVG parts cannot be composited, so
   their haze, embers and ripples repaint their SVG too), a phased card's
   shimmer (`background-position`), the split-second ring and the tile
   breath (`box-shadow`), the chat tab's flash (`background`,
   `box-shadow`), and the targeted life banner and the holder glow
   (`filter`). None runs on the bench's boards; they repaint only while
   their moment shows. Not changed: making them compositor-only means
   drawing them differently (a look change, P11-R1).

**The fix (built): the effects overlay keeps a layer of its own.**
`battlefield.css` `.bf-effects` has `will-change: transform`. With it always
composited, the content painted after it is always in the layers above it,
so a card starting to move no longer changes how the page is split into
layers, and nothing is made or drawn in full again. It changes nothing seen:
the overlay already stacks on its own (positioned, z-index `Z_EFFECTS`), so
no new stacking order; it is already the containing block for its absolute
parts and holds nothing fixed (the sparks, numbers and fight marks), so
nothing moves; and the text after it was already in see-through layers
(grayscale text) at rest before (the layer trees' `lcd_text_disallowed_reason`,
RUN), as after. Tried and dropped: the same on `.gs-flights` alone (a third to
a half of the saving), on the four layers together (no more than `.bf-effects` alone),
`contain: paint` on the art window (no change: the moving card's layer is
its lift shadow, not the art), and every card slot on a layer of its own
(no change to what a move draws, for the reason in cause 2).

**Before and after (RUN, 2026-11-25, `node ci/measure.mjs repaint`, 3 runs
each, the owner's PC (13th Gen Intel Core i5-13600KF x20 / 32 GB),
Playwright's bundled Chromium (headless shell), 1920x1080; the first local
stack built from the worktree: before at f08b0e66, after with the fix; the
second stack was up throughout, idle).** Medians of 3, per update; "!" a
number whose runs are not all within ±10%. Areas in thousands of px
squared; layer memory is the tiles' (a software raster's shared memory in
headless Chromium, a GPU's elsewhere), the most at once.

```text
moment            painted       outside      outside, with   commits   layers      layer KB
                                the box      the shadow      /update   (most)      (most)
10 idle           0 > 0         0 > 0        0 > 0           0 > 0     42! > 0!    18912! > 0!
10 tap-one-land   45.3 > 45.3   24.8 > 24.8  1.9 > 1.9       1 > 1     46 > 48     19184! > 20928
10 cast           3309! > 483   2934! > 328  2221! > 61.4    2 > 1.5   52 > 53     22800 > 24752
10 combat         1336! > 102!  1195! > 48!  1139! > 20.7!   1 > 1     90 > 90     21392! > 23568
40 idle           0 > 0         0 > 0        0 > 0           0 > 0     48! > 0!    20704! > 0!
40 tap-one-land   58.3 > 58.3   38 > 38      3.7 > 3.7!      1 > 1     54 > 56!    20240! > 21984
40 cast           3309! > 495   2945! > 339  2203! > 63.8    2 > 1.5   60 > 61     23584 > 25552
40 combat         1355! > 107   1212! > 60.6 1148! > 29.8    1 > 0.9   98 > 98     22240! > 24336
100 idle          0 > 0         0 > 0        0 > 0           0 > 0     62! > 0!    22624! > 0!
100 tap-one-land  97.3 > 97.3   71.5 > 71.5  28.1 > 28.1     1 > 1     74 > 76!    21872! > 23616
100 cast          3309! > 517   2947! > 367  2206! > 78.5    2 > 1.5   83 > 84!    25568 > 27536
100 combat        1129! > 141   991! > 90.9  929! > 59.2     0.9 > 0.8 112 > 113   24384! > 26016
b2 idle           0 > 0         0 > 0        0 > 0           0 > 0     52 > 54!    20400! > 21536
b2 busy           36 > 36!      20.8 > 20.7! 9.5 > 9.4!      0.4 > 0.4 68 > 70     21072! > 22448
```

- **Cast: 85% less painted (3,309 to 495 thousand px per update at 40 a
  side), and 97% less outside the cards' own drawing (2,203 to 64).
  Combat: 92% less (1,355 to 107), outside 1,148 to 30.** Before, the cast
  rows were not steady (2,272-3,309: how many window-sized layers were made
  depended on timing); after, the three runs agree to 0.1.
- **The land tap is unchanged, and already met the target** (below).
- "Idle layers 0!" is a run where the compositor drew no frame at all in the
  5 s (nothing moved), so there was no layer tree to read; the tap's row
  holds the table's layers.
- **Layers and memory.** The layer count is the same (+0-2, run to run).
  The tiles' memory, most at once, has medians 1.6-2.0 MB (6-9%) higher
  after, inside the runs' spread on most rows (40 a side, tap: before
  20.1-22.9 MB, after 20.5-22.2). An A/B in one session on the after build
  (the fix switched off by an injected `will-change: auto`, then on; RUN,
  the 40-a-side table): at rest 22.2 MB without, 21.2 MB with; the tap 23.1
  and 22.0; the cast 26.4 and 25.3. The overlay's own layer holds no tiles
  (it is empty where nothing is drawn). INFERENCE: the medians' rise is the
  sessions', not the layer's; reported as slower below all the same.

**The target, per moment.**

- **Tapping one land repaints only that land's area, plus the count that
  changed: met at 10 and 40 a side, before and after** (it was already so).
  Per tap one commit draws the land (its box and its lift shadow, as it
  glides to its own place and back), its ghost leaving or joining the pile,
  the pile's number, its "tapped" tab and its mana sign: 45-58 thousand px.
  Outside the land's box and shadow: 1.9 (10 a side) and 3.7 (40): the lift
  shadow's corners past the 0.35 allowance. The plate is not drawn at all (a
  bench tap changes no mana or count on it; C4 keeps the plates).
  **At 100 a side: not met, 28 thousand px outside**, the neighbours gliding
  as the row re-spaces (cause 3): an approved move, not a repaint to cut.
- **Idle stays at 0 paints: met** on every table, with flyers too.
- **Cast and combat** (no target of their own; measured as the item asks):
  all but 61-79 (cast) and 21-59 (combat) thousand px per update is now
  inside the cards that changed, their shadows, the stack and the plates;
  what is outside is the hand's cards closing up and fighters' marks and
  numbers drawn just past the fighters.

**P11-B2: the busy board (RUN, the same runs).** The table of 40 a side
with 16 of each side's creatures flying (32 flyers, past spec 0090's
`FLY_SYNC_AT` 12, so they bob in step), beside the same table without
flyers: 5 s idle and redraw.spec's busy table (20 boards, a second apart),
timed with the redraw probes (`probes.ts`), long tasks from the page's own
`PerformanceObserver` (over 50 ms).

```text
moment                   frames p95      frames worst    long tasks  app ms/upd   style ms/upd   paints/upd
1x b2 idle (flyers)      16.7 > 16.7     83.3 > 66.7!    0 > 0       0 > 0        28.9! > 34.1   0 > 0
1x b2 busy               16.7 > 16.7     16.8 > 16.8     0 > 0       3.3 > 3.1    7.5 > 8.6!     12.9 > 12.9
1x no flyers idle        16.7 > 16.8     16.8 > 16.8     0 > 0       0 > 0        0 > 9.7!       0 > 0
1x no flyers busy        16.7 > 16.7     16.8 > 16.8     0 > 0       2.5 > 2.3    3.9 > 5!       12.8 > 12.8
4x b2 idle (flyers)      16.8 > 16.7     416.7 > 416.7   0 > 0       0.1 > 0.2    159.6! > 154.4 0 > 0
4x b2 busy               16.7 > 16.8     50! > 66.7!     0 > 0       15.9 > 16.3  41.3! > 40.6   12.9 > 12.9
4x no flyers idle        16.8 > 16.7     66.7 > 66.6!    0 > 0       0 > 0        47.3! > 51.6!  0 > 0
4x no flyers busy        16.7 > 16.7     66.7 > 66.7!    0 > 0       11.9 > 12.7! 23.1! > 24.1!  12.8 > 12.8
```

(idle rows: the 5 s total, not per update.)

- **The busy board does not stutter:** frames p95 16.7-16.8 ms at 1x and at
  4x, with and without flyers, no long task in any run, and the repaint
  measure's busy board paints the same area as the table without flyers.
  The worst frame at 4x idle (417 ms) is the moment the CPU profiler starts
  (C1 saw the same on its bench-idle). **So B2 needs no calming** (its row:
  "calmed on a canvas only if it stutters"); nothing was built for it.
- What flyers do cost is style, not painting: 29-34 ms per 5 s idle at 1x
  (6 ms a second), 136-162 at 4x (about 30 ms a second), against 0 and
  32-58 without flyers: the bobbing animations are restyled every frame on
  the main thread although the compositor draws them. A C1-type finding,
  for C6's style work if it wants it; not a repaint.

**The redraw measure, before and after (RUN, `node ci/measure.mjs redraw`,
3 runs each, the same PC, stack and builds; P11-R7).** Per update, medians.

```text
moment               renders      app ms        all JS ms     style ms       paints       frames p95/worst
                                                                                          before      after
1x tap-one-land      18 > 18!     2.7 > 2.8     3.6 > 3.6     4.4! > 4.0     11 > 11      16.8/16.8   16.7/16.8
1x bench-40          21.4 > 21.4  2.7 > 2.4     3.8 > 3.6     6.2! > 5.8     12.8 > 12.8  16.8/16.8   16.7/16.8
1x tap-one-land-10   14 > 14      2.0 > 2.0     2.7 > 2.6     3.7 > 3.5      8 > 8        16.7/16.8   16.8/16.8
1x tap-one-land-100  44.2 > 44.2! 4.0 > 3.9     4.8 > 4.8     5.1! > 4.8     19.1 > 19.1! 16.8/50.1!  16.7/83.3!
4x tap-one-land      18 > 18      14.0 > 14.2   15.0 > 14.8   15.5 > 15.7    11 > 11      16.7/66.7   16.7/66.6!
4x bench-40          20.1 > 20.1  13.5 > 12.7   16.6 > 15.7   23.2 > 24.2    12.8 > 12.8  16.8/50!    16.7/66.6
4x tap-one-land-10   14 > 14      10.2 > 10.0   11.5 > 11.1   13.8 > 14.2    8 > 8        16.8/83.3!  16.7/83.3
4x tap-one-land-100  44.2! > 44.2 19.9 > 19.8   20.5 > 21.0   19.2 > 20.0    19.2 > 19.2  16.8/83.4!  16.7/100
1x cast (game)       24.6! > 32.2! 1.2 > 1.7    1.4 > 1.9!    0.8 > 1.0!     8.6 > 9.4!   16.7/16.8   16.7/16.8
1x combat (game)     22.4 > 20.5  1.1 > 1.1     1.3 > 1.3     0.7 > 0.7      6.4! > 7.3!  33.3!/50    16.8!/50
4x cast (game)       19.5! > 27.5 5.4! > 7.4!   5.4! > 7.1!   4.5! > 4.5!    10.0 > 9.7   16.8/83.3!  16.8/66.8!
4x combat (game)     17.6 > 18.5  5.2 > 5.7!    5.2 > 5.5!    3.0 > 3.3      7.6 > 7.7!   33.3/83.4!  33.3!/116.6!
```

- The replayed table (C6's yardstick) is the same within its runs' spread,
  as it should be: the fix changes what the compositor draws, not what the
  page's code does (renders and paints per update are identical).
- **Slower (P11-R7), every row, both numbers:** 4x bench-40 style 23.2 >
  24.2 ms (+4%), 4x tap-one-land-10 style 13.8 > 14.2 (+3%), 4x
  tap-one-land-100 style 19.2 > 20.0 (+4%) and all JS 20.5 > 21.0 (+2%),
  1x tap-one-land app 2.7 > 2.8 (+4%), 4x tap-one-land app 14.0 > 14.2
  (+1%) and style 15.5 > 15.7 (+1%): all within the runs' spread. Worst
  frames: 4x tap-one-land-100 83.4 > 100, 1x tap-one-land-100 50.1 > 83.3,
  4x bench-40 50 > 66.6 (single frames, not steady before or after). The
  real game: 1x cast renders 24.6 > 32.2, app 1.2 > 1.7, all JS 1.4 > 1.9;
  4x cast renders 19.5 > 27.5, app 5.4 > 7.4; 4x combat app 5.2 > 5.7, all
  JS 5.2 > 5.5, style 3.0 > 3.3, worst frame 83.4 > 116.6; real-game paints
  per update 8.6 > 9.4 (1x cast), 6.4 > 7.3 (1x combat). The real game's
  renders cannot be changed by a CSS rule; they follow each game's deal (C1:
  the cast moment catches 33-89 updates), so these rows are the deal's, not
  the fix's (INFERENCE). Tile memory, most at once: medians +1.6-2.0 MB (6-9%)
  on every repaint row (above), against -1.0 MB in the same-session A/B.
- Faster, beside them: 1x combat frames p95 33.3 > 16.8 (game), real-game
  hover 71 > 31 renders (the hand that game was dealt).

**Looks identical (RUN).**

- **Settled frames, before and after:** three Lab games from C3's 30
  (`board-data-combat` seat 1 boards 50-61, `life-changes-bolt` 0-5,
  `game-flow-krenko` 20-32: combat, a spell's damage on a plate, a table of
  tokens) replayed into a real game page (the bench's taken-over socket,
  the page reloaded so no question of the real game is left on screen),
  each board left to settle, then a screenshot with the animations
  stopped, in Playwright's bundled Chromium (headless) and in headed Edge
  (GPU, as the jump check), before (f08b0e66) and after. 31 boards x 2
  browsers: every board is the same picture but for at most 111 pixels that
  differ by 1/255 in one colour channel (Chromium: 22-37 px on the gear and
  report buttons' edges; Edge: 7-58 px along the rail's text), and four
  boards with a spell on the stack (combat 51 and 52, bolt 3, krenko 20),
  whose drifting motes are random: they differ as much between two runs of
  the unchanged build (6,300-12,200 px) as before to after (9,400-17,600),
  all of it the motes, seen by eye. One krenko board showed "YOUR TURN"
  white in one shot and gold in the other; filmed again, it differed by the
  22 px only. Files: the session's scratchpad, `c5/clip-before/`,
  `c5/clip-before2/`, `c5/clip-after/`.
- **The jump check** (RUN, headed Edge, the first stack, after the fix) over
  C3's 30 traces with `JUMPS_DELTAS=1`, 41.6 minutes: `check-jumps.py`'s report is identical, line
  for line, to C2's after-run of f08b0e66 on this PC (the known flags only:
  the restart's cards "not shown at all", in-place flips "changed form, no
  animation"). The fix moves nothing, but the overlay holds the fights' and
  sparks' effects, so it was run (targeted, owner 2026-11-21).

**Checks.** Page test `repaintLayers.test.ts`: `.bf-effects` asks for its
layer, and adds no stacking (positioned, its z-index on the board). The
probe's arithmetic, `tools/measure/repaint.test.ts` (9 tests): a commit
counted once however many frames show it; a layer's rectangle placed by its
quad and split inside and outside; one commit's rectangles unioned and
commits added; clipped to the window; layers and memory as the most at
once; a card's lift shadow counted in, a plate's not; short client names;
the targets (changed, gone and new cards, the pile holding a card, the
stack, the plates on a life change only). **Bites (TEST-004), 14 of 14
caught:** no `will-change` on the overlay (1 failing), `will-change:
opacity` instead (1), the overlay without its z-index (1); in the probe, a
commit counted per frame (1), the quad misread (1), no union (5),
inside/outside swapped (1, after its test was made asymmetric: not caught
at first), plates grown like cards (1), memory read as the last not the
most (1), no float give on the grid (1), gone cards left out (1), no
plate on a life change (1), the pile left out (1), client names unshortened
(2). Browser specs on the first stack, after the fix, bundled Chromium:
`match` (the real-click game), `match-board-motion`, `match-lands-stay-put`,
`match-big-combat`: 4 passed, 1 skipped (`match`'s abandon test, skipped in
the spec). No e2e spec was added or changed (the measures are the kit's own
config); `node ci/ci-speed.mjs` for `match-board-motion` and
`match-lands-stay-put` with their CI neighbours: 4 passed (with `match-always-choose` and `match-game-ahead`), 0 failed. Gates in the worktree: `npm ci`,
`tsc -b`, `tsc -p tsconfig.e2e.json`, eslint, prettier, vitest (1931/1931,
139 files), `vite build`, `check-doc-refs.py`.

**Left open.**

- The looping animations that repaint every frame while shown (cause 5):
  the arrows' beam and glints, the phased shimmer, the split-second ring,
  the tile breath, the chat tab's flash and the two `filter` glows. Making
  them compositor-only means drawing them another way (for example a
  gradient moved by `transform` instead of a dash offset): a look change, a
  canvas and the owner's word (P11-R1). Not measured on the bench (none
  shows there); a real-game repaint row for the attack arrows would size
  them first.
- A gliding card is drawn in full as it lifts and as it lands, because its
  lift shadow comes and goes with the move. Drawing the shadow as its own
  layer that fades in (opacity) would let the card's drawing be reused: the
  same look in principle, but a rebuild of the approved Glide (Phase 10
  A-00), so it needs the clip check and the owner; the saving is the 45-58
  thousand px of a tap, about 2% of a window.
- The flyers' restyle every frame (B2 above): style time, C6's if anyone's.
- The repaint measure runs in Chromium only (CDP's layer trees); WebKit and
  Firefox have no such account (P11-R7's "every browser" rests on the
  change being a compositing hint that both honour or ignore).

## As built: P11-C6 (2026-11-25)

Branch `p11-c6`, built in its own worktree against the first local stack
(port 8080), from dd945ab9 (after C2-C5). Stack B was stopped throughout. No
look changes (P11-R1); no protocol change. **The target is not met; the
budgets are left where they pass (cast 100, combat 88), raised for the owner
below, not loosened.**

**Before and after: `match-speed.spec.ts`, 3 runs each (RUN, 2026-11-25, the
owner's PC (13th Gen Intel Core i5-13600KF x20 / 32 GB), headless Edge (the
spec's default channel, as 0095 and 0096 set its budgets), 1920x1080; before
at dd945ab9, after with this change; nothing else measuring).** JS is the host
page's ScriptDuration per second of the moment (it includes the test's own
work in that page); "JS/upd" is the same total per game update; frames in ms.
Each cell lists runs 1, 2, 3.

```text
4x              JS ms/s              JS ms per update   frames p95          frames worst        updates
cast   before   101.8  96.1  85.6    9.5  8.3  7.3      16.8 16.8 16.9      66.8 50.0 51.0      71  75  75
(80)   after     86.7  45.3  80.1    7.9  9.1  6.8      16.8 16.8 16.8      33.7 33.5 50.2      71  33  75
combat before    97.6  92.7  80.8    5.9  5.5  4.7      16.8 16.8 16.8      84.1 50.1 83.5     163 162 167
(70)   after     84.4  88.0  88.5    5.1  5.6  4.8      16.8 16.9 16.8      50.0 33.5 83.6     158 150 183

1x              JS ms/s              frames p95          frames worst
cast   before    26.3  12.6  24.4    17.3 17.1 18.1      59.2 34.5 50.0
       after     24.5  25.1  28.3    17.4 17.7 17.3      39.7 53.2 49.9
combat before    33.6  30.3  28.3    24.0 19.8 18.0      62.9 66.7 71.1
       after     30.0  32.9  32.0    18.2 26.5 22.4      66.7 66.8 99.8
```

GameScreen per update at 4x: cast 0.9-1.0 before, 1.0-1.3 after; combat 0.8
before, 0.7-0.8 after. Plates 0.3-0.5 per update in both (life, priority and
counts really change in a game).

- **The target, per scene (after, 3 runs):** cast 80 ms/s: **not met** (86.7,
  45.3, 80.1; the 45.3 run's cast moment caught only 33 updates). Combat 70:
  **not met** (84.4, 88.0, 88.5). Frames at 4x p95 ≤ 16.8: **cast met** (3 of
  3; before, 16.9 once), **combat met in 2 of 3** (16.9 once). Worst ≤ 50:
  **not met** for either (cast 50.2 once, combat 83.6 once).
- **No change the measure can see.** Per update the 4x combat is 4.7-5.9 ms
  before and 4.8-5.6 after, the cast 7.3-9.5 and 6.8-9.1: inside the runs'
  spread. The per-second figure follows how many updates a moment catches,
  as C1 found (the cast caught 33-75).
- **The pace matters as much as the page:** a first try that let the bot ask
  for combat once instead of waiting 200 ms for it (reverted) made the game
  move faster: 196-264 updates in the cast moment instead of 71-75, and 4x
  JavaScript 146-168 ms/s, with nothing changed in the page's work per update.
  The per-second budget measures the bot's rhythm as much as the page.
- **The whole spec did not pass 3 in a row, before or after, on budgets that
  have nothing to do with C6:** the game end's slowest frame went over its
  200 ms budget in 5 of the 6 runs (199.9-235.3 ms, at 1x or 4x; 0096's
  finding: the other page's raster flush in the shared GPU process), and
  once after "4x combat: JavaScript 88.5 ms/s > 88" (the open flake, ROADMAP).

**Where the time goes (RUN, CPU profiles of the 4x cast and combat, 250 us
samples, before; mapped to the source through a local build with hidden
source maps whose file names matched the served build's).** Combat, 9.9 s:
the page's own code 871 ms, the test's 255 ms, GC 113 ms (cast: 477, 112, 43).

- **The test's own JavaScript is about a fifth of the measured page's**
  (CSS locator queries 126 ms in the combat; the recorder's frame clock 23
  ms). **50 ms of it, and the combat's longest stretch (a 123 ms task), was
  Playwright working out the whole page's accessibility tree**
  (`ariaSnapshotForExpectFailure`), which an `expect` does each time it asks
  and the answer is not there yet: `speed-kit.ts` `attackWithAll` and
  `attackLeavingThemAlive` waited for "Attack with" that way.
- **The page's own time is spread thin, no slice above a fifth of it**
  (inclusive, combat): React's work in all about 750 ms, of which the Board's
  render 153 (its items 53, layout 40, the kept-drawing compares `same` 41 and
  `sameContent` 22), GameScreen's render 116 (the board's data 30), the
  movement `useLayoutEffect` (the glide pass) 104 with its `getAnimations`
  53 (C3: the style the frame needs anyway), the glow layers' follow
  (`breathMotion.ts` `followStarted`) 36, reading the socket (`match.ts`
  `reduceMatch`, `parse`, `delta.ts`) about 45, and `matchMedia` 9 (a new
  query list on every `reducedMotion()` call, several per card and update).
  The stretches over 50 ms are mostly the browser's own style, layout and
  paint ("(program)", 65-74 ms of a 120 ms stretch), not JavaScript.
- **The flyers' restyle (C5's note) is not in this scene:** the mono-green
  deck has no flyers, so it costs match-speed nothing. On C5's busy board it
  is style time (about 30 ms a second at 4x); calming it means animating the
  bob another way, a look question (P11-R1), so it was not touched.

**Built (nothing a player sees changes):**

1. **The bot waits without an `expect`** (`speed-kit.ts` `present`, used by
   `attackWithAll` and `attackLeavingThemAlive`): one plain query every 100
   ms until the element is there, the same 5 s and 30 s limits, then an
   error naming what was awaited. The measured page no longer works out its
   accessibility tree while an attack is declared. The bot's rhythm is
   otherwise unchanged (the 200 ms combat wait in `step` is kept, above).
2. **One live query list for "less motion"** (`reducedMotion.ts`, used by
   `Board.tsx`): the browser's own `MediaQueryList` is kept and its
   `matches` read each time (it follows the setting live); a stand-in that
   is not one (the page tests') is asked each time, as before; a replaced
   `matchMedia` is asked again.

**The replayed table (the owner's yardstick, 2026-11-21; RUN, `node
ci/measure.mjs redraw --grep bench`, 3 runs each, bundled Chromium, the same
PC and stack, before at dd945ab9, after with change 2; change 1 does not run
there).** Medians per update; "!" a number whose runs are not all within ±10%.

```text
moment               renders      app ms          all JS ms        style ms         frames p95/worst
                     before>after before > after  before > after   before > after   before      after
1x tap-one-land      18 > 18      2.55 > 2.56     3.52 > 3.39      3.48! > 3.16     16.8/16.8   16.7/16.8
1x bench-40          20.2 > 20.2  2.40 > 2.31     3.63 > 3.43      5.22! > 4.61     16.7/16.8   16.8/16.8
1x tap-one-land-10   14 > 14      1.90 > 1.79     2.60 > 2.48      3.20! > 2.80     16.7/16.8   16.8/16.8
1x tap-one-land-100  44.3 > 44.3  4.04 > 3.59     4.66 > 4.54      4.65! > 4.18     16.7/83.3!  16.8/83.3
4x tap-one-land      18! > 18     14.73 > 13.79   16.18 > 14.91    16.59 > 15.69!   16.7/66.5!  16.8/50!
4x bench-40          20.3 > 21.4  12.74 > 12.50   15.40 > 15.12    25.76 > 23.04!   16.8/66.7   16.7/66.7
4x tap-one-land-10   14 > 14      10.47 > 9.89    11.41! > 11.59   14.50 > 13.39!   16.8/83.4   16.8/83.3!
4x tap-one-land-100  44.3! > 44.3 20.86 > 19.41   22.10 > 20.36    20.32 > 19.92!   16.8/100!   16.7/100!
```

- The page's own JavaScript per update is 2-11% lower on most rows, within
  their runs' spread (4x tap-one-land app ms before 14.0-15.4, after
  13.3-14.3). INFERENCE: change 2's share; the profile put `matchMedia` at
  about 1% of the combat.
- **Slower (P11-R7), both numbers:** 1x tap-one-land app 2.55 > 2.56; 4x
  tap-one-land-10 all JS 11.41 > 11.59 (+1.6%; before 11.0-12.7); 4x bench-40
  renders 20.25 > 21.35 (every run reads 20.15, 20.25 or 21.35, before and
  after: the busy table's life drop lands in one commit or two); 4x
  bench-idle (4 s, no update; totals) all JS 7.4 > 14.2 ms (before 7.4-12.3)
  and app 0.05 > 0.19. In match-speed: 4x combat JS ms/s runs 80.8-97.6 >
  84.4-88.5 (medians 92.7 > 88.0), 1x combat 28.3-33.6 > 30.0-32.9, 1x cast
  12.6-26.3 > 24.5-28.3; 4x combat p95 16.8 > 16.9 once; 1x combat worst
  71.1 > 99.8 once. All inside the run-to-run spread. Bytes and messages are
  not touched.
- Chromium only (CDP). The fix asks the browser for a query list less often,
  which each engine answers the same way (P11-R7 rests on that, INFERENCE).

**Looks identical.** Change 1 is the test's; change 2 gives the same answer as
before on every call (the browser's list is live; the tests below). It draws
and moves nothing itself, so no clip, pixel compare or jump check was run
(the owner's targeted-check rule, 2026-11-21).

**Checks.** `reducedMotion.test.ts` (4 tests): the browser is asked once and
its live list then read (a change of setting seen at once); a replaced
`matchMedia` is asked again; a stand-in is asked every time; true with no
`matchMedia`. **Bites (TEST-004), 4 of 4 caught** with the page tests of
`src/battlefield` (1278 tests): nothing kept (1 failing), a stand-in kept (3),
no check that `matchMedia` is the same (1), the first answer kept instead of
the live list (1). Browser specs on the first stack built from this branch,
bundled Chromium: `match-deltas`, `match-history` (the speed kit's other
users), `match` (the real-click game), `match-board-motion`,
`match-lands-stay-put`; `node ci/ci-speed.mjs match-deltas match-history`.
Gates in the worktree: `npm ci`, `tsc -b`, `tsc -p tsconfig.e2e.json`,
eslint, prettier, vitest (1935/1935, 140 files), `vite build`,
`check-doc-refs.py`.

**For the owner (raised 2026-11-25, not decided).**

1. **80/70 is not met, and C2-C5 did not move it.** What is left is spread
   over React's drawing of the parts that change, the glide pass and reading
   each update, none over a fifth. The named next steps are bigger and touch
   how cards move: the board's ghosts kept outside its own state and the
   flights and mana balls fed only what they read (C4's), and the slot's
   settle handled without a style query (C3's); each needs the jump check
   over all Lab games. Or the budget is judged as the owner set C6's
   yardstick on 2026-11-21: per update on the replayed table (numbers above),
   which has no number of its own yet.
2. **The per-second figure measures the bot's pace too** (above: a faster bot,
   double the JavaScript per second, the same page). If it stays the gate, it
   could be per update (as the kit's), with the test's own work taken out (the
   kit's profile split).
3. **The game end's frame budget (200 ms) fails most runs on this PC** (5 of
   6 today), so no run of the whole spec passes 3 in a row whatever C6 does.

**Owner, 2026-11-25 (by prompt):** (1) "Work per update": the 4x speed
budget becomes the page's own JavaScript per board update, with the test's own
work taken out, its limit set from today's numbers to catch a future slowdown;
the per-second cast 80 / combat 70 is retired, and the bigger card-motion
changes are not built for it. (2) "Measure one page": the game end's slowest
frame is measured with the other player's page paused, as a player sees it;
the 200 ms limit stays. Both are built as a follow-up to C6.

## As built: P11-C6 follow-up (2026-11-25)

The owner's two answers above, built in `frontend/e2e/match-speed.spec.ts`
with `frontend/e2e/page-share.ts` (test only; nothing a player sees, no page
code). Branch `p11-c6`, first local stack, stack B stopped.

**"Work per update."** The per-second budgets (0096's cast 80 / combat 70,
loosened to 100 / 88) are retired. The 4x cast and combat are held to the
page's own JavaScript per game update, `SPEED_BUDGETS.pageMsPerUpdate4x`:
**cast 12 ms, combat 8.5 ms**. Enforced off CI only, as every other timing
(`TIMINGS_ENFORCED` unchanged). ScriptDuration per second is still printed.

- **How the test's own work is taken out (`pageShare`).** The host page is
  CPU-profiled (250 us samples) through the moment. Each sample goes to
  whoever's script was running at its top: walking from the sample's leaf
  toward the root, the first frame that belongs to a script decides. The
  browser's own functions (querySelectorAll, getAnimations...) belong to no
  script, so they count for their caller. A frame of the app's bundle
  (`/assets/`) is the page's; any other script is the test's: Playwright's
  injected scripts and evaluates, and the speed kit's recorder (its frame
  clock, and its React-commit walk, which runs inside React's DevTools hook
  above the page's frames). An app handler started by the test's click is
  the page's (its frames are on top).
- **Why it is honest.** Only samples known to be the test's are removed.
  Garbage collection and the browser's work under no script at all
  ("other", 3-35 ms a moment) are charged to the page. So the split can make
  the page look slower, never hide its work. The kit's redraw measure
  (`probes.ts` `attribute`) is unchanged; it counts the recorder's walk as
  the page's, so its "app ms" reads a little higher.
- **The profiler's own stall is kept out.** Starting a profiler stalls the
  page's next frame, 183-367 ms at 4x the first time in a page (RUN: the
  first runs' cast worst 183-667 ms at 200-380 ms into the moment). The
  profiler is now started once and stopped as the game begins
  (`warmProfiler`), each moment's is started before its frames are marked,
  with 300 ms to settle, and it is stopped after they are read.

**"Measure one page."** The end is timed with the other player's page
paused (`guestPaused`) and woken only while the bot acts on it; the 200 ms
limit stays.

- **Paused by the debugger (`Debugger.pause`).** `Page.setWebLifecycleState`
  "frozen" does nothing to a visible page, and a headless page is always
  visible (RUN, a scratch page in Edge and bundled Chromium: animation
  frames and timers ran on through 1 s "frozen"; minimising its window did
  not hide it). The debugger stops its script, timers and frames (RUN: 2
  frames in 1 s). The trace confirms it: the paused page's main thread went
  from about 1,700 events per half second to about 90. **INFERENCE: P11-C5's
  repaint measure froze the other page the same way, so that freeze probably
  did nothing.** Its numbers are of the measured page's own layers, so they
  stand.
- **What the slow end frame is.** With the other page paused, a 1x trace
  still showed the GPU process spending 250 ms in
  `SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass` as **this** page's end
  banner came: headless drawing in software. In headed Edge with the PC's
  GPU, the end's slowest frame was 66.7 ms (RUN, one 1x run).
- **Result.** Before pausing, the end's frame went over 200 in 5 of 6 runs;
  with the other page paused, in 3 of 9 on the quiet PC (always 4x,
  216.6-216.9 ms), and in 2 of 3 while a PC game was running.

**Runs (RUN, 2026-11-25, `match-speed.spec.ts`, headless Edge, the owner's
PC, the first stack built from 74fbe36d's page; the PC game that ran during
an earlier set was closed).** Page JS is ms per update at 4x, with the test's
own in brackets. Per-second figures are as printed.

```text
run          cast page JS   (test) updates  JS/s    combat page JS (test) updates  JS/s    end worst 1x/4x   spec
final 1      7.37  (1.43)   93      90.9    6.85  (1.05)   174      101.9   200.0 / 100.0     passed
final 2      6.63  (1.69)   75      64.8    6.19  (1.64)    72       42.4   166.6 /  76.8     passed
final 3      6.45  (1.39)   71      67.6    7.45  (1.31)   169      108.9    99.9 / 216.9     4x end 216.9 > 200
earlier 1    7.16  (1.90)   71      64.9    5.01  (1.66)    86       42.5   134.3 / 216.9     4x end > 200
earlier 2    8.66  (1.84)   52      59.9    5.91  (1.20)   163       80.7   100.0 / 216.6     4x end > 200
earlier 3   10.49  (4.72)   33      46.9    6.42  (1.85)   141       78.8   125.9 /  83.3     passed
bite 5 ms   13.19  (1.91)   71     146.1   10.39  (1.54)   154      158.3   (4x only)         both page JS over
bite 1.5 ms  8.09  (1.48)   85     101.8    8.07  (1.46)   163      116.2   (4x only)         not caught
```

- **The new yardstick passes 3 runs in a row** ("final", and the 3 before
  them, with no limit over). The page's own JavaScript per update: cast
  6.5-10.5 ms (higher when the moment catches fewer updates: 33 updates,
  10.5), combat 5.0-7.5. Another 3 runs (before the profiler warm-up, budget
  checked by hand against the same limits) read cast 6.5-6.9, combat 5.5-6.6.
  The limits sit above the slowest by about the runs' spread. The test's
  own is 1.0-4.7 ms per update.
- **The whole spec did not pass 3 in a row:** the 4x end's frame went over
  200 ms in 1 of the last 3 runs (and 2 of the 3 before). That is the frame
  above, this page's own drawing in headless software. **For the owner:** the
  pause does not remove it; it would need the end's frames timed in a
  headed browser with a GPU, or a different limit for headless (not
  changed: the owner kept 200).
- **Bite (TEST-004).** The page's own code (`match.ts`, the match socket's
  `onmessage`) was built busy 5 ms longer on every message: the 4x test
  failed on "4x cast: the page's JavaScript 13.19 ms per update > 12" and
  "4x combat ... 10.39 > 8.5". A 1.5 ms busy loop (8.09 and 8.07) was
  **not** caught; the limits catch a page about a third slower per update,
  not less. The busy loop runs by the wall clock, so the 4x slowdown does
  not multiply it. Reverted; the stack rebuilt from the clean tree.
- `pageShare`'s page tests (`tools/measure/page-share.test.ts`, 6 tests): the
  page's own code and the browser functions it calls; Playwright's scripts
  and theirs; the recorder's walk inside React's commit; an app handler the
  test's click started; garbage collection and work under no script charged
  to the page, idle not; an empty profile. **Bites, 6 of 6 caught:** native
  frames deciding (2 failing), the kit's "any app frame" rule (1), garbage
  collection left out (1), the no-script work left out (1), it given to the
  test (1), a sample's span read from the wait before it (5).
- Also fixed: with `PROXIC_SPEED_TRACE_CATEGORIES`, the idle moment's trace
  overflowed `Math.min(...)` (RangeError); it is now a loop.

**Checks.** Gates in the worktree: `npm ci`, `tsc -b`, `tsc -p
tsconfig.e2e.json`, eslint, prettier, vitest (1941/1941, 141 files), `vite
build`, `check-doc-refs.py`. `node ci/ci-speed.mjs match-speed` (every
page slowed 4x, with its CI neighbour `match-ring`): 2 passed, 1 skipped (the
neighbour's spec skipped itself); 4x cast 7.43 and combat 5.57 ms per update.

**Owner, 2026-11-26 (by prompt: "Time it in a window"):** the game end's
slowest frame is timed in a headed browser window using the PC's graphics
chip, as a player sees it; the 200 ms limit stays. It runs on the fixed
machine only (CI's machines have no screen). Built as a second C6 follow-up.

## As built: P11-C6 second follow-up (2026-11-26)

The owner's "Time it in a window", built in `frontend/e2e/match-speed.spec.ts`
(test only). **The game end's slowest frame (200 ms at 1x and 4x) is judged
only when the spec runs headed**: `npx playwright test
e2e/match-speed.spec.ts --headed`, Edge in a window on the fixed machine.
`misses` takes whether the run is headed (Playwright's `headless` option,
which `--headed` sets). Headless runs, CI's among them, still print the
number ("judged only in a window (--headed), not here") but do not fail on
it. Nothing else changed: every other budget is judged as before, headed or
headless, and timings stay off on CI (`TIMINGS_ENFORCED`).

**Correction to the first follow-up.** It said headless draws the end
banner "in software". WebGL names the same renderer headless and headed
(ANGLE on the PC's NVIDIA GeForce RTX 3060 Ti, D3D11; RUN, a scratch page in
Edge). So both use the graphics chip. Headless still took 250 ms in the GPU
process to finish that frame; why is not known. The spec's comments say so.

**Runs (RUN, 2026-11-26, stack A from 5b4e9e75's page, stack B stopped).** A
PC game (`relink-game`) was started during headed run 2 and ran from then on
(about 0.3 of a core when sampled, and the graphics chip).

```text
run              end worst 1x / 4x   4x cast / combat page JS ms/upd   result
headed 1         50.2 / 116.7        5.71 / 5.53                       passed
headed 2         150.0 / 133.4       11.95 / 7.62                      passed
headed 3         50.1 / 150.0        7.28 / 7.21                       1x combat frames (p95 49.9 > 40, worst 249.9 > 120)
headless         133.4 / 133.3       15.49 / 10.41                     4x page JS over (cast > 12, combat > 8.5)
ci-speed         (end within 200)    7.85 / 7.94                       2 passed (with match-ring, 1 skipped)
bite, headed     283.3 / 300.0       (not read)                        1x and 4x end over 200
```

- **The end's limit passes in 3 headed runs in a row**, at 1x (50.1-150.0)
  and 4x (116.7-150.0). The whole spec passed headed in runs 1 and 2. Run 3
  failed on the 1x combat's frames with the PC game running; that is not the
  end.
- **The headless run failed on the per-update budget** (cast 15.49, combat
  10.41) with the PC game running. The first follow-up's quiet runs read cast
  6.5-10.5 and combat 5.0-7.5. `node ci/ci-speed.mjs match-speed` (headless,
  every page slowed 4x, timings enforced, the game still running) passed both
  tests: cast 7.85, combat 7.94. INFERENCE: the headless failure is the PC
  game's load, not this change, which touches only the end's frame check. A
  quiet re-run is owed.
- **Bite (TEST-004).** The page's own `GameScreen.tsx` `ResultBanner` was
  built with a 300 ms busy loop when it mounts (the end banner). Headed, both
  tests failed only on "1x end: slowest frame 283.3 > 200" and "4x end:
  slowest frame 300 > 200". Reverted; the stack rebuilt from the clean tree.
- The headed windows open on the owner's screen while the spec runs (the jump
  check's precedent).

**Checks.** Gates in the worktree: `npm ci`, `tsc -b`, `tsc -p
tsconfig.e2e.json`, eslint, prettier, vitest (1941/1941, 141 files), `vite
build`, `check-doc-refs.py`; `ci-speed` above.

**Owner, 2026-11-26 (by prompt, spec 0119):** P11-D5 is **closed as measured**
("Close it": no page work or time to gain, about 15% of small-message bytes,
real risk; reopen only if a measure shows bundling would cut more than 10% of
a combat's time or bytes). 0119's per-connection queue is approved alone and
built first ("Build it now"): a stuck connection froze both players' boards
for 28.7 s in a RUN; the rest of 0119 and all of 0120 wait for the owner's
answers to their questions.

## As built: P11-D6, the per-connection queue (2026-11-26)

Spec 0119's first part, approved alone by the owner ("Build it now"): each
match connection (players' and spectators') has its own send queue on the
server (SendQueue.kt), so the worker's pump and every other page never wait
on one socket; a connection whose oldest message has waited more than 10 s
(or with 1,000 waiting) is closed (4002 "behind", or ended outright) and the
page reconnects to the whole board as today. Nothing a player sees changed.
Evidence, the rule's numbers, bites and the browser test
(match-slow-link.spec.ts, the poor link and a stuck tab) are in spec 0119's
"As built: the per-connection queue". The rest of 0119 and spec 0120 wait for
the owner.

## As built: P11-E10 (2026-11-26)

The Hall and the lobby's standings are kept in memory. Branch `p11-e10`,
built in its own worktree from aae55cce. Nothing a player sees changes; the
messages are the same.

**Where the time went (RUN, measured first).** The server test
`hall/HallMeasure.kt` (new, run on purpose only:
`./gradlew :server:test --tests '*HallMeasure*' -PmeasureHall=0,500,2000,10000`)
seeds a fresh **test** database per size (`HallSeed`: 8 players, 16 decks, the
games spread over a year, the same seeded games every run; never a real
database), then times the Hall's database read (`HallGameSource.hall`), the
Hall page's view (`Hall.view`), the lobby's places (`StandingsSource.standings`,
uncached), `GET /api/hall` through the real server, and a lobby join: a real
socket (`/ws/user`) from connecting to its `ROOMS` and to its `STANDINGS`
(the join's last list). Medians of 11 after 5 warm-ups, in ms; each table cell
is the median of 3 runs (the owner's PC, 13th Gen i5-13600KF, 32 GB; the
server in-process, Postgres 16 in Testcontainers).

```text
finished games                      0        500       2,000     10,000
the Hall's database read            0.7      4.2       7.2       29.7      (unchanged code; paid once per change now)
Hall.view (the page's numbers)      0.05     4.2       6.3       23.4      (unchanged; still worked out per visit)
the lobby's places, uncached        0.8      4.1       7.9       34.0
                       before       after (3 runs each, medians; the runs in brackets)
GET /api/hall          0            4.6  ->  3.9
                       500         10.4  ->  7.8
                       2,000       16.1  -> 12.3
                       10,000      60.3  -> 26.1      (60.2-62.4 -> 25.8-26.7)
join, to STANDINGS     0            5.9  ->  5.5
                       500          8.0  ->  5.5
                       2,000       11.4  ->  4.8
                       10,000      37.4  ->  3.8      (36.6-38.1 -> 3.8-4.0)
join, to ROOMS         10,000      11.5  ->  3.8      (the join's lists before STANDINGS)
STANDINGS message      103 bytes with no games; 507-518 with any
```

- **Before, every lobby join paid the whole Hall**: at 10,000 games 26 of its
  37 ms were reading every finished game and working out the places; the same
  again for every account change and game end (once, then broadcast), and the
  Hall page read every game per visit. A join is now 3.8-5.5 ms at any number
  of games (the database read happens once after each change).
- **What is left in `GET /api/hall`** is the page's own numbers worked out for
  this moment (`Hall.view`, 23 ms at 10,000 games, 4 ms at 500). Kept as it
  is: the view moves with the clock (the "since a day ago" arrows, the Belt's
  date, the season), so keeping it would need its own rules for when it goes
  stale, for a page read once per visit. How many finished games the live site
  has is not known here (INFERENCE: hundreds, not thousands, at 2026-11's
  pace); at 500 the page's server time is 8 ms.
- Why the join's `ROOMS` also came sooner at 10,000 games (11.5 -> 3.8 ms) is
  not known: the joins run back to back, and the measure does not separate
  the server still finishing the previous join's places (INFERENCE) from
  anything else.
- **No row is slower** (P11-R7). The first read after a change costs what
  every read cost before.

**What changed** (server only):

- `hall/HallCache.kt` `HallCache` (new) keeps the Hall (`HallGameSource.hall`:
  the finished games, the Belt resets, who is active) until `invalidate`. A
  read that a change overtook (an invalidation while it was reading) is handed
  to its caller, as before, but never kept. The lobby owns it
  (`LobbyService.hall`); the Hall page (`hallRoutes`), the lobby's places
  (`StandingsSource`) and the Admin Belt tab (`AdminRecordsDesk.hall`) read it.
- **What is kept is the Hall, never an answer for a moment:** every view,
  place and Belt is still worked out for "now". `StandingsSource.standings`
  reuses its last places only while nothing was invalidated and the moment
  they hold to has not come (`Hall.steadyUntil`: the season's end, or the Belt
  holder's defend-by date when that is still ahead); so a season rolling over
  or a Belt falling due needs no trigger.
- **The triggers** (each calls `invalidate` after the write it follows):
  - a game end: `LobbyService.matchChanged` (ENDED), after `MatchRecords`
    wrote the result (`MatchEndings.finish`);
  - an account change: the `AccountChanges` listener, which a rename, an
    avatar, an administrator creating, disabling or enabling an account, the
    Belt reset and the record purge all already call;
  - a deck the Hall shows (not one of the three, but the Hall page shows a
    player's favourite deck's icon and colours): `DeckAccessListener.deckShown`
    after an icon change (`iconRoute`) and a deletion (`deckRoutes`), and
    `DeckCategoryFill`'s `filledSome` when it gives decks their colours.
  - Renames and avatars never touched the standings (they carry ids; names and
    pictures come from `PLAYERS` and the Hall's avatar lookup, which is read
    per visit as before); they invalidate anyway, as account changes.
- `LOBBY_PROTOCOL.md` says so. `ci/expected-skips.txt` lets `HallMeasure`
  skip (a measure, not a check).

**A stale standing is never served (proof, RUN).**
`hall/HallTriggersTest.kt` (new, the real server and a real database): the
kept copy is put in place (a join's `STANDINGS` and a Hall page read), the
trigger is pulled through its real route, then the `STANDINGS` broadcast, a
new connection's `STANDINGS` and `GET /api/hall` must each equal a fresh
reading of the database, and the fresh reading must have moved (so the test
cannot pass on a change that changed nothing):

1. a Belt reset (`POST /api/admin/belt/reset`; the Belt tab's answer too);
2. an account disabled (`PUT /api/admin/accounts/{id}/status`, the season's
   leader);
3. a deck's icon (`PUT /api/decks/{id}/icon`) and its deletion;
4. a game end: ten games written as `MatchRecords` leaves them, then
   `LobbyService.matchChanged` (ENDED) on the lobby built with the server's
   own pieces (no game can be played without a worker in the server tests;
   tests 1-2 prove the server wires the same kept Hall).

`hall/HallCacheTest.kt` (new): kept until invalidated; an overtaken read
never kept; the places worked out again at the season's end and at the Belt's
defend-by date with nothing else changed.

**Bites (TEST-004), each run against both test classes** (the four on lines
that moved in the last tidy-up were run again on the final code):

```text
mutation                                                   caught by
matchChanged forgets the Hall                              the game end test
the account listener forgets the Hall                      Belt reset, account disabled
the icon route doesn't tell                                the deck test
the delete route doesn't tell                              the deck test
the server gives the deck listener no hallChanged          the deck test
the server gives the lobby no kept Hall                    Belt reset, account disabled, the deck test
                                                           (a first form, the lobby given no invalidation
                                                           only: Belt reset, account disabled)
invalidate does nothing                                    all 4 trigger tests + 2 cache tests
places kept past steadyUntil                               season end, Belt falls due
places kept across an invalidation                         game end, Belt reset, account disabled
steadyUntil ignores the Belt's date                        Belt falls due
an overtaken read kept                                     NOT CAUGHT: equivalent (a kept copy carries
                                                           the generation it was read under, so it is
                                                           never handed out; the check only saves a
                                                           write)
```

**PLAYERS and ROOMS as changes: not worth it (RUN, counts).**
What the host's page read over one session (RUN, 2026-11-26, the second
stack built from this branch; P11-E15's session measure,
`frontend/tools/measure/session.spec.ts`, which counts every lobby-socket
message by type the way D1 counts the game's; 2 minutes in the lobby, then
three games of about 90 s each, conceded, 12.5 minutes in all; 6 accounts;
text sizes, before the socket's compression, P11-D2):

```text
                                messages      bytes     share of the session
lobby socket, every type            194      76,739          0.5%
  ROOMS (the room list)              53      27,727          0.18%   about 520 bytes each
  ROOM (your own room)               30      23,598          (already per member)
  PLAYERS (every account)             8       6,664          0.04%   one per connection opened, about 830 bytes
  STANDINGS                          11       3,905
the game sockets                  5,006  15,210,662         99.5%
```

ROOMS and PLAYERS together are 34 KB of 15.3 MB: sending them as changes
would save at most about 0.2% of what a player's page reads in a session of
games, and nothing a player waits for (each is one small message, after the
change it reports). PLAYERS grows with accounts, about 140 bytes each, and is
sent once per connection: at 50 accounts about 7 KB a join. **So no protocol
change, and no spec is needed.** The trigger to look again (PHASE-004): if
the account count passes a few hundred, or a measure shows a lobby list
message over 20 KB.

**Checks.** `./gradlew :server:ktlintCheck :server:detekt :server:test`: 831
tests, 0 failures, 61 skipped (the declared ones, and five classes that skip
on this PC and run on CI: ForgeWorkerTest, DeckBuilderApiTest,
MechanicsLabCorpusTest, MatchRuntimeTest, MatchPreflightTest: they need the
built worker and Forge's resource checkout, which this worktree doesn't have,
and `ci/check-skips.sh` names exactly those five as the only undeclared
skips); `check-doc-refs.py`; the browser specs that read the Hall and the
standings (lobby, belt-records, kept-data) on the second stack built from
this branch: 22 passed. `node ci/ci-speed.mjs` not needed: no browser spec
changed. No page changed in this item (the frontend gates ran for P11-E15).

## As built: P11-E15 (2026-11-26)

Long sessions: the heap measured, and the page's clocks rest in a hidden tab.
Branch `p11-e10`, after P11-E10, against the second local stack (port 8081).
Nothing a player sees changes.

**The measure** (`frontend/tools/measure/session.spec.ts`, new; `node
ci/measure.mjs session`, one run by default: heap and timers are counts, not
timings). RudeLeft sits in the lobby for 30 minutes (Pat beside him, saying
something in the lobby chat every two minutes), then they play three games in
a row (each driven for 90 s by the kit's `drive`, then conceded, both back in
the room). The host's page:

- **heap through CDP** after two full collections (`HeapProfiler.collectGarbage`,
  `Runtime.getHeapUsage` usedSize: exact, where `performance.memory` rounds to
  10 MB), with `Memory.getDOMCounters` (nodes, listeners, documents), at the
  start, every 5 minutes, in the first game, and back in the lobby after each
  game;
- **every timer**: an init script wraps `setInterval` and each `setTimeout`
  of a second or more, so each reading lists what is running (delay, the
  built file and position that set it, times fired);
- **hidden**: a headless page is never hidden by the browser, so the page is
  told it is (`document.hidden`, `visibilityState`, `visibilitychange`), as a
  hidden tab's code sees it, for 2 minutes in the lobby before and after the
  games, 30 s mid-game while Pat plays on, and a minute each on Status,
  Admin and the Hall. It counts the timers that fired, the requests made and
  the page changes (a MutationObserver) while hidden. The browser's own
  slowing of hidden tabs is not in it (E13 covers that): this lists what our
  code does.
- the lobby connection's messages by type over the session (P11-E10's
  question).

**Heap (RUN, 2026-11-26, the owner's PC; Playwright's bundled Chromium,
headless; KB after a full collection).** "Before" is this branch with
P11-E10 and none of the changes below: its 30-minute lobby from the first run
(which stopped after game 1 on the measure's own fault: the next game's room
was not cleared; fixed, `clearEverything` between games), and its three games
from a second run with a 2-minute lobby. "After" is one full run of the final
measure on the code below except the version check's change (the last one,
re-checked by a short run, beneath).

```text
                         before                       after
                         heap KB  nodes  listeners    heap KB  nodes  listeners
lobby 0 min                3,122    153     197         3,135    154     199
lobby 10 min               3,617    193     211         3,626    194     213
lobby 20 min               3,665    218     221         3,674    219     223
lobby 30 min               3,712    243     231         3,720    244     233
in game 1                 10,955    570     319        11,476    607     328
after game 1              10,692    343     222        10,406    344     224
after game 2              10,572    343     222        10,554    344     224
after game 3              10,711    343     222        10,629    344     224
end (2 min more, hidden)  10,753    343     222        10,640    344     224
DOM documents: 1 in the lobby, 6 from the first game on, the same 6 after every game, in both.
```

- **The margin, set here: after the first game, the heap stays within 5% of
  its size after game 1, and the DOM's nodes and listeners come back to the
  same counts after every game.** Met before and after: game 1 to game 3
  +0.2% before, +2.1% after (10,406 -> 10,629: which cards a game deals
  differ, so a few hundred KB either way is the game, not the code; INFERENCE
  from two runs); nodes and listeners identical after every game; documents
  the same 6 after every game.
- **The first game adds about 7 MB that stays:** the game's own code and its
  pictures in memory (loaded once, as E6 intends), not a leak: it does not
  grow with the second and third games.
- **The lobby grows about 20 KB a minute for the first five minutes, then
  under 10 KB a minute** (3,122 -> 3,712 KB over 30 minutes), and its nodes
  by about 6 per chat line (15 lines from Pat): the lobby chat, which keeps
  its last 200 lines (`lobby.ts` `MAX_CHAT_LINES`), so it is bounded.

**Timers (RUN, the same runs).** What our code still did while the tab was
told it is hidden:

```text
                                   before                              after
lobby, 2 min hidden (x2)           5 timers, 32 calls, 0 requests      2 timers, 8 calls, 0 requests
                                   (the 15 s clock x2, the away look,  (the lobby's liveness beat; the version
                                   the liveness beat, the version      check, which did nothing hidden; the
                                   check)                              short run below: the beat alone)
a game, 30 s hidden (Pat playing)  3 timers, 5 calls                   2 timers, 3 calls (beat, version check)
Status page, 1 min hidden          1 timer, 12 calls, 24 requests      0 timers, 0 calls, 0 requests
Admin page, 1 min hidden           4 timers, 10 calls, 0 requests      3 timers, 6 calls, 0 requests
Hall page, 1 min hidden            3 timers, 8 calls                   2 timers, 4 calls
page changes while hidden          0 in the lobby and on the pages; the game's board is drawn as Pat's
                                   moves arrive (157 changes in 30 s in the first before run, 0 in the
                                   others, where Pat had nothing to do meanwhile): that is the game, not
                                   a timer, and stays (a hidden player's board is current when shown)
```

**The final code, re-checked (RUN, a short run: 2 minutes in the lobby, one
game).** Hidden lobby, before and after the game: **one timer, the lobby's
liveness beat** (6 calls in 2 minutes, 0 requests). Hidden in a game: the
beat alone (and one picture fetched as Pat played a card: the board, not a
timer). Status: nothing. Hall: the beat alone. Admin: the beat and Admin's own
30 s refresh, which reads nothing while hidden. Heap after the game 10,664 KB,
end 10,675; nodes 344, listeners 224, as in the full run.

**What changed** (page only; nothing a player sees but timing in a hidden
tab):

- `frontend/src/shownTimer.ts` `everyWhileShown` (new): an interval that
  stops when the tab is hidden and, shown again, runs once at once and starts
  again. Used by the lobby's 15 s clock ("Away 7 min", "last seen", the room
  closing warning: `LobbyPage.tsx` `useMinute`), the Status page's 5 s poll
  (`App.tsx`: it asked the server twice every 5 s while hidden), the game's
  "gone N min" clock (`GameScreen.tsx`), a spectator's look for the players'
  next game (`WatchPage.tsx`), the popped-out game chat's check
  (`GameChat.tsx`) and the version check (`PageNotices.tsx`, which did nothing
  hidden already but kept firing).
- `activity.ts` `watchActivity`: a hidden tab gets no moves, so instead of
  looking every 15 s it sets one timer for the moment it would go away (none
  once away); shown again is a move, and the 15 s look comes back. A hidden
  tab now goes away exactly 5 minutes after the last move; before, at the
  first 15 s look after that (up to 15 s later). The other players see
  "Away" up to 15 s sooner for a hidden tab; the rule (spec 0009: 5 minutes)
  is the same. A game asking you still holds you active while hidden.
- **Kept running, with the reason:** the lobby's liveness beat (`lobby.ts`,
  P11-E13 settled it: it must ask while hidden, and the browser slows it);
  a question's answer window (`GameScreen.tsx`, 100 ms while counting: it
  answers for you when the time is up, and the browser slows it to once a
  second while hidden); the Admin page's 30 s refresh and Update waiting's
  poll (`AdminPage.tsx`, `AdminUpdate.tsx`, P11-E7): they fire but read
  nothing while hidden, and moving them to `everyWhileShown` would add a read
  on every return (their own rule reads on return only when one was missed).
- So the exit gate's "no timer runs in a hidden tab except the socket's"
  (6a) holds for every page but Admin, where two timers fire and do nothing;
  making those two rest as well is a small follow-up if wanted.

**Tests.** `shownTimer.test.ts` (5): runs on its beat; nothing at all while
hidden, the interval itself stopped; once at once when shown; a page opened
hidden waits; stopped, nothing. Bites: no stop when hidden fails 2, no run
on shown fails 3, starting while hidden fails 2. `presence.test.ts`, two new:
a hidden tab sets one timer for the moment it goes away (and none once
away), goes away exactly at 5 minutes, looks every 15 s again when shown;
a game asking holds a hidden tab active. Against the old `activity.ts` the
first fails (the second guards that the change keeps the old rule). The
session measure is the real-app proof that production calls them (TEST-010):
the lobby's and Status's timers stop firing hidden in the real page.

**Checks.** Frontend gates in the worktree: `npm ci`, `tsc -b`, `tsc -p
tsconfig.e2e.json`, `eslint . --max-warnings=0`, `prettier --check src e2e
tools`, vitest (1948/1948, 142 files), `vite build`; `check-doc-refs.py`.
Browser specs on the second stack built from this branch (the pages whose
timers changed): lobby, foundation (Status), hidden-tab (E13's two tests),
notices (the version check), match-away (the "gone" clock), match-watching
(spectate): 31 passed, 1 skipped (match-watching's goblin game: no goblin deck
in this worktree). No browser spec changed, so no `ci-speed` run; the session
measure is a measure, not part of the suite.
- **Slower (P11-R7):** none measured. The heap in game 1 and the lobby's
  first minutes read a few hundred KB more in the after run in places and
  less in others (the table): the games dealt differ. Measured in Chromium
  only: CDP's heap and the hidden-page count need Chrome's DevTools protocol;
  the change is the page's own code, the same in every engine. The browser's
  own hidden-tab slowing in Firefox and WebKit is E13's (CI's engines job).

## As built: P11-D6 catch-up and P11-A1 (2026-11-26)

The rest of spec 0119 (owner, "Approve both", with the answers to its
questions): each seat's last 40 boards kept as sent (SeatReplay.kt), a page
coming back resumes from the board it holds (`resume`, MATCH_CATCHUP), a quiet
line beats (MATCH_BEAT), boards carry `sentAt`; the page replays late or
missed boards at 3x with "Catching up… / Tap to skip" in the act button, and
past 20 updates or 6 s goes straight to now with "While you were away"
(catchUp.ts, MissedWindow.tsx); the silence check (5 s marks, ~6.5 s shows
the notice, 10 s gives up and resumes; a late check judges nothing, E13).
P11-A1: a board skipped during a hold gives its moves to the board drawn
(carry.ts). Evidence, bites, the gate's resume pass and the browser run are in
spec 0119's "As built: catch-up after a stall, and A1". Spec 0120 is next.

**Owner, 2026-11-27 (by prompt: "Count it as a drop"; spec 0120 Amendment 1):** decision 7
is corrected. A hidden tab stays connected and never pauses a game (RUN: 10.5
minutes). A tab the browser really freezes has its connections closed by the
browser itself (RUN: Edge, 3 of 3), so it counts as a drop: the standard pause,
then resume and catch-up when the player returns. P11-E13's "the browser answers
pings while frozen" was measured on a busy script thread, not a real freeze; a
frozen lobby tab shows offline until it wakes.

## As built: P11 hard pause, spec 0120 (2026-11-27)

The game pauses while a player's game connection is down (owner decisions 6
and 7, Amendment 1): a player's match connection is pinged every 2 s and
closed 5 s after an unanswered ping; a seat with no player connection left
pauses the game at once (`SeatLinks.kt`, `MatchPauses.kt`): every answer
refused `PAUSED` first, the worker sent `HOLD` (its own waits stop and run
again in full after `GO`), every page told `MATCH_PAUSED`; it goes on 2 s
after the returning page's catch-up (8 s at most), `MATCH_RESUMED`. The page
shows one standard look (`battlefield/pause.tsx`): the dim, "Connection
dropped / <name> · game paused · 0:04", the plate's "Dropped" then "Away · N
min", the window, "<name> is back"; the away window from the game
connection's drop or the 10-minute budget. Found building it (RUN, Edge): a
frozen tab's connection stays open, its pings answered, until Edge lets it go
(15 s to over 3 minutes), so it counts as a drop only then. Evidence, bites
and the browser runs are in spec 0120's "As built".

**Owner, 2026-11-27 (by prompt: "Keep it this way"; spec 0120 Amendment 2):** the
note above ("Count it as a drop") is withdrawn: its finding was wrong. A re-run
with a logging proxy showed a frozen Edge tab's connection answering every ping
for the whole 153 s freeze (RUN); Edge fails only the page's own socket objects.
Decision 7 stands as first written: a hidden or frozen tab counts as connected
while its connection is open; only a real drop pauses a game. P11-E13's "the
browser answers pings while frozen" is right after all (the network process
answers), though it was first measured on a busy script thread; a frozen lobby
tab stays online to the server.

**Owner answers, 2026-11-27 (P11-E11, by prompt; canvas `Proxic canvases/webp-e11.html`):**
WebP quality 80 for the table pictures, the art crops **and** the close-ups ("I honestly
cannot tell at 80"; table copy 67 -> 43 KB, crop 38 -> 29 KB, close-up 223 -> 128 KB
on 275 real cards; SSIM and a 3x look in the research, scratch `e11/`). The Deck Builder
sending WebP close-ups itself is roadmapped for later. E11 gets a short spec (it reverses
spec 0051's "the JPEG is the close-up, no second encode" and adds a server dependency).

**P11-E11 built, 2026-11-27 (spec 0121):** card pictures are WebP at quality 80,
the table copy, the art crop and the close-up, made at import and once for the
pictures already stored, from the originals (libwebp's `cwebp` in the image). On
stack A the two real decks' pictures went from 3.14 to 2.02 MB and 2.78 to 1.89 MB;
the one-time pass took 43 ms of CPU a picture on the owner's PC. Owed (P11-R5): the
same CPU measurement on the Unraid box. Evidence in spec 0121's "As built".
