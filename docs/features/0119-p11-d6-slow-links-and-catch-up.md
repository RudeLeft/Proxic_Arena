# 0119 — Phase 11 P11-D6 and P11-A1: slow and patchy links, and catch-up after a stall

**Status:** Draft for the owner (2026-11-26). **Owner, 2026-11-26 (by prompt: "Build it now"):** the per-connection queue alone (each connection its own queue; one that stops reading is closed and reconnects; nothing visible changes) is approved and built first, as its own change. **Owner, 2026-11-26 (by prompt: "Close it"):** P11-D5 is closed as measured, with the trigger below. **Owner, 2026-11-26 (by prompt: "Approve both"): the whole spec is approved**, with the answers below; built after the queue, as its own change. Phase 11 items **P11-D6** (slow and patchy links) and **P11-A1** (moves lost while a spell is held up to be shown), step 7 of the recommended order. A protocol change and a change a player sees, so it gets a full spec, the owner's approval of its questions, and the canvas it follows (P11-R1). **P11-D5** (bursts sent as one message) is **not** in it: this spec recommends closing D5 as measured ("P11-D5" below). Spec 0120 (the hard pause) builds on this one.
**Owner decisions:** already made, in `PHASE_11_EFFICIENCY_LOCKED.md`, "Owner decisions on the draft (2026-11-19)":

- **Decision 3:** after a stall, the missed moments play sped up (within a limit), then catch up. Alice's game never waits for Bob.
- **Decision 4** (proposed in the draft and used as D6's target): about 1 Mbit/s with 300 ms delay and short drops must play correctly; worse is best effort.
- **Decision 5** (canvas `Proxic canvases/catchup-1119.html`, plan `Phase 11 catch-up plan.md`): **Q1** replay at **3×**; **Q2** the limit is **20 updates (and 6 s of replay)**; past it, straight to now with a "While you were away" window; **Q3** the **"Catching up… / Tap to skip"** sign in the act button; **Q4** that window lists **every missed move, numbered**.
- **Decision 2** (spectators get the same mechanism, switched on after the players' version is proven) and **decision 7** (a hidden or frozen tab counts as connected while its connection is open).

The questions still open are under "Decisions only the owner can make" (asked as prompts, ESC-001).

## Why (researched)

Read at origin/main aae55cce (2026-11-26), which has P11-D3 (history once), D4 (deltas and once-a-turn checkpoints), C2 (kept cards) and E13 (hidden-tab liveness). SOURCE = read in the code; READ = read in a dependency's bytecode; RUN = run on the first local stack (port 8080) built from this worktree on 2026-11-26; INFERENCE = reasoned. The scratch spikes and their outputs are in the session's scratchpad (`d6/`), not in the repository.

### The INFERENCEs in the plans, checked

1. **"A slow player may hold up the worker's reading thread" (`MatchDecisions.kt` `tell`).** SOURCE: the path exists. Everything the worker says is handled on the pump thread (`MatchWorker.kt` `startPump`, "proxic-match-pump-…"); `MatchDecisions.tell` wraps each send in `runBlocking`; `MatchHub.sendTo` delivers to the user's connections **one after another** (`connections.forEach { connection.deliver(...) }`); a board goes through `BoardStream.send`, which calls `outgoing.send(Frame.Text(...))` **under the connection's lock**, and anything else is `outgoing.send(...)` directly (`BoardStream.kt` `Connection.deliver`). `outgoing` is Ktor's channel of **8** frames (READ: Ktor 2.3.13's `UtilsJvmKt.getOUTGOING_CHANNEL_CAPACITY`, system property `io.ktor.websocket.outgoingChannelCapacity`, default 8). So once a connection's channel, the raw writer and the socket buffers behind it are full, `send` suspends, `runBlocking` blocks the pump, the worker's stdout stops being read, and every other connection (the other player's too) waits behind it. **RUN: it happens** — one connection that stopped reading froze the game for both players for 28.7 s ("The spike's numbers" below).
2. **A connection that stops reading is closed after 30-45 s** (RUN, twice). A connection opened by hand and never read again was closed by the server with `java.io.IOException: Ping timeout` **45.0 s after it opened** (`101 Switching Protocols ... in 45007ms`): Ktor's pinger, 15 s to the first ping plus 30 s for the pong (`Limits.WS_PING_SECONDS`, `WS_TIMEOUT_SECONDS`). In the first run the game was idle and the server answered 43 whole boards (about 3 KB each) on it without blocking; in the second (a game in play) the freeze ended the moment it was closed. So 45 s is the longest one stuck connection can hold the pump today: when the session closes, `outgoing` closes and the blocked `send` fails (`runCatching` in `tell` swallows it).
3. **"Reconnect sends only the latest board"** (SOURCE, still true after D3/D4). A new connection (`MatchSocket.kt`) gets: `WATCHING` if anyone watches, `MATCH_HELLO`, `runtime.snapshotFor` (the stored latest board with the seat's **whole play log**, `LiveMatch.snapshotFor`), `pendingFor`, `askingFor`. It goes **whole** (a new connection's `BoardStream` has no base: `first`), with D3's history lists whole. The server keeps only the latest board per seat (`LiveMatch.snapshots`). The page throws away its delta base on a new connection's first board.
4. **What deltas and checkpoints change in the plan** (SOURCE). (a) A board on the wire is now usually a `MATCH_DELTA` from **that connection's** base (`BoardStream`), so the plan's "kept list of messages as sent" can't be replayed on a **new** connection as they were sent: their bases belong to the old one. The kept list here holds each seat's **whole boards** (what `snapshotTaken` stores, after pictures), and the new connection's `BoardStream` sends them (the first whole, then deltas): one rule, D4's, so P11-R4's gate covers it unchanged. (b) Every new turn's board goes whole (decision 1's checkpoint, `turn`), and a new game's too (`epoch`): the plan's "each turn's first update is a full table, so the replay can't drift by more than a turn" holds. (c) `MATCH_RESYNC` (D4) is the existing "give me the whole board" request, so a page that loses its way mid-catch-up already has a way back. (d) A board is now 256 bytes median per update a seat and a whole game about 90-96 KB a seat on the wire (D4 As built): the plan's "40 full tables are about 140 KB per seat" is server memory, not bytes sent.
5. **"The page can't tell silence from a quiet game"** (SOURCE, still true). `match.ts` `connectMatch` has no timer: only `onclose` notices a drop, then retries after `MATCH_RECONNECT_DELAYS` 500, 1000, 2000, 4000, then 8000 ms. Ktor's pings are answered by the browser, not page code. **And a page timer must follow E13's rule** (P11-E13 As built): a hidden tab's timers run once a minute and a frozen tab's not at all, while its messages still queue; a silence check that fires late must judge nothing (decision 7), or a hidden tab would drop a healthy game connection every minute.
6. **`carry.ts` `carryMoments` and A1** (SOURCE). The page keeps the last 30 boards it was sent (`match.ts` `RECENT_KEPT`, "a hold is never longer"). When `GameScreen` draws a board after a hold (`THEIR_SPELL_HOLD_MS`, the swing hold, Karn's restart hold), `carryMoments(board, skipped)` carries the skipped boards' survivors, phasing, flickers, damage and life onto the drawn board, for boards of the same seat and game with a lower revision. It does **not** carry the other `moves` (a death's or a discard's reason and destination, a card moving between zones), so such a card's departure is inferred from the drawn board pair (`fromSnapshot`) without its own leave, and the pile number it would have held jumps: A1's defect, unchanged since the paper. Catch-up's "past the limit, straight to now in one glide" is the same skip, so it needs A1's carry; under the limit, each missed board is drawn in turn and nothing is skipped.
7. **The board holds are wall-clock waits** (SOURCE). `GameScreen.tsx`: `THEIR_SPELL_HOLD_MS` (`FLIP_MS + REVEAL_HOLD_MS + FLY_MS + LANDING_BEAT_MS`), `SWING_HOLD_MS` 1500 ("not paced: a limit"), `RESTART_HOLD_MS`, `PAY_HOLD_MS`, `PILL_HOLD_MS`. Animation lengths go through `motion.ts` `paced(ms)` (a constant `PACE` 1.25, spec 0106) and `hurry(root)` already speeds every running animation to end in `HURRY_MS` 100 via `updatePlaybackRate`. A catch-up rate is a run-time factor on both, which nothing has today.
8. **"While you were away" needs no new message** (SOURCE). Every play log line carries its board's `rev` and its cards with pictures (`match.ts` `PlayLogLine`, `PlayLogCard.art`), and a reconnect's first board brings the seat's whole log, merged by number (`mergePlayLog`). So the page can list exactly the lines newer than the board it last drew, in the play log's own words (Q4 A), from what it is sent today. The plan's `MATCH_MISSED` is not needed.
9. **Can the test tools reach a WebSocket?** (RUN, spike `net-tools`, Edge, 2026-11-26.) **Chrome's network emulation does not throttle WebSocket frames:** with `Network.emulateNetworkConditions` at 300 ms latency and 125,000 bytes/s, a `PING`→`PONG` round trip on an open socket took 26-44 ms (5-39 ms without it), while a `fetch` under the same setting took 327 ms. So D6's row ("Chrome's network emulation: for example 1 Mbit/s, 300 ms") **cannot be the slow link** for the game socket; the tests below use a relay instead. **`context.setOffline(true)` is a silent drop:** the open socket stayed open (`readyState` 1, no close in 8 s) and a `PING` got no `PONG` in 5 s: frames vanish both ways without a close. That is exactly the drop the hard pause must notice (spec 0120).

### The spike's numbers (RUN, 2026-11-26)

`slow-reader` (a scratch Playwright spec, not committed): a real game of the green deck between the two committed local accounts, both pages played by the redraw measure's bot (`speed-kit.ts` `drive`), the first local stack built from this worktree. After 45 s of play, a third connection for the guest is opened by hand (raw TCP from the test: no compression offered, no `?deltas=1`, so every board goes whole, about 10 KB each) and never read again; it asks for the whole board about once a second.

```text
                                     host's page                     guest's page
largest gap between two messages
  before the stuck connection        0.67 s                          0.67 s
  with it                            28.7 s (from 32.7 s after it    28.7 s (the same moment)
                                     opened to 61.4 s)
boards a page received per 15 s      54-59 before and after; 7, then 0, in the 30-60 s after it opened
the host's answer -> its next message  median 1 ms, p95 3-8 ms in every stretch (when the game moves at all)
the stuck connection                 158 whole boards sent to it, then closed by the server's ping timeout
                                     45 s after it opened ("boards sent: off 158")
```

- **The inference holds:** once one connection's buffers were full (after about 158 whole boards, roughly 1.5 MB: INFERENCE from the board size), **the whole game stopped for both players for 28.7 s**, until Ktor's ping timeout closed the stuck connection; then it carried on by itself. The pump was blocked in `tell` behind that one connection.
- **How likely in real play** (INFERENCE from the RUN sizes): a real page takes compressed deltas, about 90-96 KB a seat for a **whole game** on the wire (D4 As built), so filling about 1.5 MB of buffers inside the 45 s before the ping timeout would take far more than a game's traffic. A page behind a proxy that strips compression, or a spectator on whole boards (spectator deltas are off), carries about 3 MB a game: still about 110 KB in 45 s. So today it takes a page that keeps its connection open and stops reading **and** a lot of traffic. Rare, but the cost when it happens is the whole table for everyone, and D6's target is "a slow connection never slows the other player": the queue below removes the path, so it is specified anyway, as a small first step.

## What the player sees

Alice is you (seat 1, bottom), Bob the other player. Bob's turn 7. Every look is the catch-up canvas's, section named.

1. **A short stall** (canvas "Your choice: a short stall"; Q1 B, Q3 A). Your connection stops for about 3 seconds. Meanwhile Bob plays a Mountain, casts Lightning Bolt at your Grizzly Bears, it resolves, the Bears die, and his Serra Angel attacks you for 4. Bob's game never waits for you. After 5 seconds of silence, or as soon as the connection closes, today's blue **"Reconnecting to the game…"** notice shows (unchanged). When the connection is back, **the five moves play at 3× from where your table stopped**: the Mountain lands, the Bolt flies and resolves, the Bears die and go to your graveyard, the Angel attacks, 20 → 16 rises. Meanwhile the act button, where "Bob's move" normally is, shows a fast-forward sign, **"Catching up…"** and under it **"Tap to skip"**, with a thin gold bar filling. Then the table is live, the same as Bob's, about 2.2 seconds after you came back.
2. **A click skips** (canvas "Q3", option A). A click on the table or on the act button hurries the rest to its end in a tenth of a second (as a click hurries the table today), and the table is live.
3. **A long stall** (canvas "Q4", option A; Q2 B). Your connection is gone longer: Bob finishes his turn and your turn 8 starts, about 26 updates. That is past the limit, so there is no replay: **the table goes straight to now in one short glide** (cards slide to their places, new ones fade in, your life falls with a −4), nothing jumping. Then **the report window above your hand**: a clock medallion, **"While you were away"**, **"You missed 9 moves. Your table is up to date."**, "in order" on the right, then each move numbered with its card's picture (Bob played Island. / Bob cast Lightning Bolt at your Grizzly Bears. / Your Grizzly Bears died. → your graveyard / … / You drew Giant Growth.), a turn line in gold, and the footer **"The play log has them too."** with CLOSE. Your turn's question ("To combat") is in the act button as soon as the table is up to date.
4. **A question waits for the catch-up.** If the game is asking you something when you come back, the question appears only once your table is live (after the replay, or at once if you skip). Its countdown, if it has one (the response window's "Resolves in 5"), starts when it is shown. Nothing is answered for you meanwhile (as today).
5. **Bob's screen never changes** because of your link. His questions come at the same moments as they would if your connection were perfect. A slow page never holds up the game.
6. **The spell hold** (P11-A1). Bob casts Murder on your Wingshield Agent while you can't answer; your screen holds the Murder on the stack for a moment so you see it. Bob's next moves arrive meanwhile. Today, a creature of yours that died in a board drawn during the hold pops off the table and your graveyard number jumps. After this spec it leaves with its own death and its card streams into the graveyard tile, the number held until it lands, as every other death does. (P11-R1: an already approved look, shown in a before-and-after clip.)
7. **Motion turned down:** no replay. The table goes straight to now, and the window lists what was missed if it was past the limit.
8. **A spectator** (decision 2): the same on the public view, switched on in a later release, once the players' version is proven. Spectators are never asked anything, so nothing waits on them. "Switch sides" still works during a replay.

## Scope

In:
- D6: each connection's own outgoing queue; the pump never waits on a socket; a connection far behind is closed and comes back through the resume path.
- Catch-up: numbered and stamped updates, the server's quiet-line beat, the kept boards per seat, resuming from the page's last board, the page's replay at 3×, the limit, the sign, the "While you were away" window, a click to skip, the question held until live, `CAUGHT_UP` (for spec 0120).
- A1: skipped boards' moves carried.
- Spectators: built behind a switch, off.

Out (and why):
- **The hard pause:** spec 0120 (its detection, the server's 2 s pings, is there).
- **P11-D5, bundling:** recommended closed as measured (below). **Trigger (PHASE-004):** a measured page or wire cost per message that bundling would cut by more than 10% of a combat's time or bytes.
- **A refresh or a new tab:** not a stall; a fresh page gets the full table and the play log, as today (canvas "The awkward moments", "A refresh"; see question 5).
- **Field-level diffs inside a card, and the lobby socket:** unchanged from 0117.

## The change

### The protocol

```text
server -> page   MATCH_SNAPSHOT, MATCH_DELTA, MATCH_STEP   + sentAt   the server's time (ms) when it was first sent to this seat
server -> page   MATCH_BEAT     gameEpoch, stateRevision       after 2 s with nothing else sent on a player connection
page   -> server (socket address) ?deltas=1&resume=<gameEpoch>.<stateRevision>   on a reconnect: the last whole board this page took
server -> page   MATCH_CATCHUP  from {gameEpoch, stateRevision}, count   then `count` board and step messages, oldest first, each with its own sentAt
page   -> server CAUGHT_UP      (nothing)                      the page's table is live again (spec 0120 reads it)
server -> page   (close 4002 "behind")                         this connection's queue is full; the page reconnects with resume
```

- **`sentAt`** is stamped once, when the server first sends the board or step to the seat, and kept with it, so a resent board carries the time it really happened. The page keeps `skew = min(arrival − sentAt)` over the connection (reset on each reconnect: a server clock that jumps can't make every update look late). An update whose `(arrival − sentAt) − skew` is over **1,500 ms** is **late**. It is a time, no card and no seat (HID).
- **`MATCH_BEAT`** gives the page something to hear on a quiet line. The page does not answer it (decision 7: the server's liveness check is the connection's own pings, spec 0120). Its numbers let the page see it is behind (a beat ahead of the board it holds asks for the whole board, `MATCH_RESYNC`).
- **The resume point is in the socket address** (like `?deltas=1`), so the server knows it before it sends the first board. It carries two numbers and no personal data. It is read only to choose **which of this seat's own kept boards** to start from (§6.100: the client supplies no fact the server relies on; a wrong number can only cost the page a whole board).
- **`MATCH_CATCHUP`** says how many updates follow. They are this seat's own boards (the first whole, the rest through the connection's `BoardStream`, D4's rule) and the steps between them, in order, each with its `sentAt`. After them come `pendingFor` and `askingFor`, as on every new connection (PROTO-002: state first).
- **No `protocolVersion` bump:** a page that doesn't send `resume` gets today's reconnect; the new fields are ignored by an older page.

### Server (`server/.../match/`)

- **Each connection's own queue (D6).** `Connection` gets a bounded `Channel` (256 messages; a test measures how many a stalled link at the supported speed needs, and the number is set from it) and one coroutine that takes each message in order, runs it through the connection's `BoardStream` (D3/D4, unchanged, now on the drain side) and sends it on Ktor's `outgoing`. `MatchHub.sendTo` and `spectate` **`trySend`** into it, so `tell` never suspends on a socket and the pump never waits on a page. `MatchSocket`'s own sends (hello, the stored board, the pending question, resync answers) go through the same queue, so their order is kept (PROTO-002, §6.110).
- **A connection that falls behind** (its queue full) is closed with **4002 "behind"** and logged (`match <id>: connection <c> fell behind: closed`). Its page reconnects with `resume` and is caught up from the kept boards, or, if it is further behind than they reach, sent the whole board. One slow page can no longer slow anyone else; it only ever costs itself.
- **Kept boards per seat** (`SeatReplay`, beside `SeatPlayLogs` in `LiveMatch`): the last **N = 40 boards** each seat was sent (and the public view's), each as stored by `snapshotTaken` (after the worker's `HiddenIds` and `MatchArt.annotate`, with that round's play log lines only), with its `sentAt`, plus the `MATCH_STEP`s between them. Kept across Karn's restart (each entry has its `gameEpoch`); dropped when the match ends.
- **Resume** (`MatchSocket.kt`). A player connection whose address names `resume=e.r`:
  - **(e, r) is a kept board of this seat and newer ones follow it:** hello, `MATCH_CATCHUP {from, count}`, the kept updates after it (the first board whole, then deltas: a new connection has no base), then `pendingFor`, `askingFor`;
  - **(e, r) is this seat's newest board:** hello, then `pendingFor`, `askingFor`; no board at all (the page has it). Bytes saved on every quick reconnect;
  - **otherwise** (older than the kept boards, another game the list no longer holds, a number the seat was never sent, a malformed one): today's reconnect, the stored board whole with the whole play log.
- **The beat.** A player connection on which nothing was sent for 2 s gets `MATCH_BEAT` (from the connection's own coroutine, never the pump). The same 2 s is spec 0120's ping period; the beat is a data message the page can see, the ping is the server's own liveness check.
- **`CAUGHT_UP`** is read on the connection (its only effect: spec 0120's resume rule). Nothing in it is trusted beyond "this connection says its table is live".
- **Spectators:** the same queue now (the pump must never wait on a spectator either); resume and catch-up on the public view behind `PROXIC_SPECTATOR_CATCHUP` (default off, decision 2).

### Page (`frontend/src/`)

- **`match.ts`:** `sentAt` kept on each board; `skew` per connection; the socket address gets `resume` from the base (the last whole board taken) on every reconnect; `MATCH_CATCHUP` marks the next `count` updates as missed; `MATCH_BEAT` ahead of the base asks for the whole board (`MATCH_RESYNC`, D4's path). Every message is still reduced in order, so `game.board` is always the newest board: everything that answers the server (questions, `STALE_STATE`) reads it as today.
- **Silence** (`connectMatch`): with no message for **5 s** the page marks the connection stalled (today's "Reconnecting to the game…" notice, after its usual 1.5 s settle); at **10 s** it closes the socket and reconnects with `resume`. **A check that runs more than 2 s late judges nothing** and starts again (E13's rule, decision 7): a hidden or frozen tab is never dropped by its own timer.
- **`catchUp.ts` (new), the replay.** GameScreen draws a `shown` board: normally the newest. When missed or late updates arrive (a `MATCH_CATCHUP`, or late boards after a silence), they queue after the board on screen, and `shown` steps through them, each held for `max(its moment, 120 ms) / 3`. The moments run at 3×: one catch-up rate read by `paced()` and by every hold (`THEIR_SPELL_HOLD_MS`, `SWING_HOLD_MS`, `RESTART_HOLD_MS`, `PAY_HOLD_MS`, `PILL_HOLD_MS`), plus `updatePlaybackRate(3)` on each animation started meanwhile (the tool `hurry` uses).
- **The limit** (Q2 B): more than **20 boards** queued, or an estimated replay over **6 s** at 3×, means no replay: `shown` jumps to the newest board, with `carryMoments` over the whole queue (A1's carry included), in one glide; then the "While you were away" window.
- **A click** on the table or the act button during the replay calls `hurry` and jumps `shown` to the newest (canvas "Q3" A: "The button itself skips").
- **The question** (`decision`) is set aside until `shown` is the newest board; then it shows, and any countdown starts then.
- **Reports** (spec 0088) from the replayed boards gather in the one report window, opened once the table is live.
- **The sign** (Q3 A): the act button's catch-up state, as the canvas draws it (fast-forward coin, "Catching up…", "Tap to skip", the gold bar showing how far the replay is).
- **The window** (Q4 A): the report window's look (spec 0071/0075) as the canvas draws it, listing the play log lines whose `rev` is newer than the board last drawn, numbered, oldest first, each with its first card's picture; a longer list scrolls inside the window.
- **`CAUGHT_UP`** is sent when `shown` is the newest board after a catch-up, or at once when a reconnect needed none.
- **Motion turned down:** always the jump, never a replay.

### A1 (`battlefield/carry.ts`)

`carryMoments` also carries a skipped board's **moves** (`moves`: a death, a discard, a card going to a graveyard, exile, hand or library, a token leaving) for each card whose move the drawn board does not contradict (the card is where the move put it, or gone from the table in the drawn board) and does not move again itself. The Board's existing tile stream then plays its leave and holds the pile number until it lands. Only boards this seat was sent are read (HID-001: nothing new is shown), only boards never drawn, so nothing plays twice. Spec 0106 Amendment 1's rule (a step re-sending the drawn board plays no move again) stays.

### Documents changed with the build

`protocol/README.md` (the envelope's `sentAt`, `MATCH_BEAT`, `MATCH_CATCHUP`, `CAUGHT_UP`, `resume`, close 4002); `docs/architecture/MATCH_PROTOCOL.md` ("Reconnect", both tables); `docs/architecture/MATCH_STATE_VISIBILITY.md` (one paragraph: kept boards are the seat's own); the paper's As built for D6 and A1; `ROADMAP.md`.

## Rules and boundaries

- **ARCH-003: one source of truth.** The worker's board stays the truth; kept boards are copies of what was sent; the page's `game.board` is always the newest board, and the replay only delays what is **drawn**.
- **PROTO-002 and §6.110: state first.** A catch-up's boards come before the pending question, through the same queue.
- **PROTO-005:** an answer clicked while the table is catching up can't be sent (the question is not shown until it is live); one sent against an old board still meets `STALE_STATE`.
- **PROTO-007:** the snapshot is authoritative and events are hints. A skipped replay costs moments, never correctness: the newest board is drawn whole.
- **§6.111:** a stall never answers, passes or concedes for anyone.
- **P11-R1:** every look is on the approved canvas; A1 is an approved look shown where it was missing (a clip).
- **P11-R5 / R7:** measured before and after (below); nothing slower for a page on a good link.
- **Decision 7 / E13:** no page timer judges a hidden tab's silence when it runs late.
- **FMT-005:** kept boards and queues are per seat and per connection; four seats need nothing new.
- **TEST-012:** the catch-up's click (skip) is a new click: a real-click test owes it (F-0119-H).

## Hidden information (P11-R4)

- **The kept boards are the seat's own boards**, as the server already stored and sent them (after the worker's `HiddenIds` and the pictures). They are never built from the whole game or from another seat's view, and a seat's resume reads only its own list (`seatOf(userId)`, as `snapshotFor` does). Spectators' kept boards are the public view.
- **A catch-up sends a seat only boards it was sent before** (or was being sent when its line died), and through the connection's own `BoardStream`, so every delta is made from two of this seat's own boards (0117's rule, unchanged). The page learns exactly what it would have learned if the line had never stalled, only later.
- **The resume point** picks among the seat's own boards; a number for a board the seat was never sent finds nothing and gets today's whole board.
- **`sentAt` and `MATCH_BEAT`** carry times and the revision the seat already has; no card, no question, no seat. Times were already visible as arrival times.
- **The "While you were away" list** is the seat's own play log lines (already per seat, already sent, `SeatPlayLogs.shownOnly`), drawn only up to the board on the table (HID-005: no line ahead of its board, as the play log rule already says).
- **The A1 carry** reads only boards this seat was sent and never drawn.
- **The gate (in CI; the format change doesn't ship without it):**
  1. **Lab:** `check-deltas.py` gains a resume pass: for every seat's stream and the public one, at every 7th board it cuts the stream, resumes from the kept boards exactly as the server would (ring of 40, the first board whole), rebuilds the page's boards and requires them equal to the worker's; every id named in a catch-up is in its base or its board; then the hidden checks run over the rebuilt traces with the same counts as over the worker's (0117's list, with `check-hidden-information.py`).
  2. **Browser:** every CI game keeps 0117's send-both check (`whole`) on catch-up deltas too; the resume test (F-0119-F) forces each resume path: in the kept boards, the newest, too old, another game, a number never sent.
  3. **HID-004:** the gate prints how many resumes and catch-up boards it made per stream and fails on a stream with none.
  - **Bites:** a resume reading the other seat's kept boards; a spectator resumed from seat 1's list; a resume number for another seat's board accepted. Each must fail the gate.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0119-A | Server: `SeatReplay` (40 kept per seat and public, across Karn's restart, steps kept in order, dropped at the end); each resume path; the first catch-up board whole; a seat never given another's list | unit |
| F-0119-B | Server: **the other player never waits** — one connection that never reads (a raw socket, as the spike) while the game plays: the other page's next question arrives on time and the pump never blocks (`tell` time under 5 ms each); the stuck connection is closed 4002 when its queue fills, and its page comes back through resume | unit + browser |
| F-0119-C | Server: `MATCH_BEAT` after 2 s of quiet and never while boards flow; `CAUGHT_UP` read and nothing else | unit |
| F-0119-D | Page (Vitest, fake timers): a late burst replays in order at 3×; `MATCH_CATCHUP` replays; the limit (21 boards, or a 7 s estimate) jumps with one glide and opens the window with the right lines and count; a click skips; the question appears only when live and its countdown starts then; reports gather and open once; motion down always jumps; `skew` reset on reconnect; the silence check: 5 s marks, 10 s reconnects, a check run late judges nothing | unit |
| F-0119-E | Page: A1's carry — a death, a discard and a move to exile in a board skipped during the spell hold leave with their own moves on the drawn board, and the pile number is held; nothing plays twice; `carryMoments`' existing tests still pass | unit + clip |
| F-0119-F | **Browser, real game, slow and patchy link** (`e2e/match-helpers.ts`: `slowLink` — a relay in front of the guest's match socket, built on D2's `wire.ts` tap, holding each frame 300 ms and pacing bytes to 125,000 a second each way, on the compressed bytes; `stallLink(ms)`; `dropLink()` — `routeWebSocket` close; `silentLink()` — `context.setOffline(true)`): a game on the slow link with **two drops** (one clean, one silent) and one 3 s stall. Both pages end on the server's board exactly (0117's send-both check over every delta, and the last board compared whole); the host's question times are within ±10% of the same game on a plain link (Alice never waits); the "Catching up…" sign shows and clears; a click skips; a long stall (25 boards) gives the window with the right count; P11-R4's browser gate passes | browser |
| F-0119-G | Browser: Karn's restart during a stall (`match-karn`'s deal): game 1's last boards, the sweep and game 2's first board replay in order, or the jump and the window when past the limit | browser |
| F-0119-H | TEST-012: the skip clicked for real (a pointer click on the table during a replay) | browser |
| F-0119-I | Hidden tab (decision 7): `hidden-tab.spec.ts`'s slowed and frozen timers on the **game** page for 10 minutes: no reconnect, the same socket | browser |
| F-0119-J | Looks (P11-R1): the jump check unchanged on the plain path; screenshots of the sign and the window on the real app, matched against the canvas by eye, for the owner (TEST-011); the A1 clip before and after | owner |
| F-0119-K | Spectators: `match-watching` with `PROXIC_SPECTATOR_CATCHUP` on and off | browser |
| F-0119-L | Measures (P11-R5, P11-R7): bytes per reconnect (before: the whole board and the whole log; after: the catch-up or nothing), the host's question times on a plain link (not worse), server memory for the kept boards per seat, server CPU per board (not worse) | measure |

**TEST-004 (bites):** the queue sent on with `send` instead of `trySend` (F-0119-B fails); a catch-up whose first board is a delta (F-0119-A, and the browser gate); the replay at 1× (F-0119-D); the question shown during the replay (F-0119-D); the late check judging a late timer (F-0119-I); A1's carry dropped (F-0119-E).

## Risks

- **A stall past the queue** closes the connection (4002): the page reconnects and catches up, so the cost is a reconnect, never a wrong board. The queue size is set from F-0119-B's measure.
- **The replay drifts from the board.** It can't by more than a turn: each turn's board is whole, and `game.board` is always the newest.
- **A hold not paced** at 3× would make a replay slower than estimated; the 6 s limit is checked on the real replay too (F-0119-D), not only the estimate.
- **The tests' slow link is a relay**, not Chrome's emulation (which does not reach WebSocket frames: RUN). A relay that paces the compressed bytes is closer to a real link than per-message delays.
- **Every browser test that routes the match socket** (`match-away`, `match-dice`, `match-modes-doing`, `notices`, `match-status-list`, `match-deltas`, `match-history`, `production`) keeps working: a page that never reconnects never sends `resume`; one that does is tested in F-0119-F.

## P11-D5: recommended closed as measured

The row: messages the worker makes in one go (boards plus the question they lead to) leave as one message; messages per combat about halved; each board still drawn.

- **The page's work would not change.** D0 (RUN) put parse and the handler under 1 ms a moment; the cost is React's commit and the frame after it, per **board drawn** (a combat: 8 boards a seat, 33-41 commits). The row keeps every board drawn (the `carry.ts` lesson), so bundling saves no commit and no frame. C3/C4/C2 have since made each commit cheaper (C2's As built: the read is 0.17 µs a card).
- **Time:** none. The messages of one burst already leave back to back on one socket and arrive in the same round trip; a bundle arrives no sooner.
- **Bytes:** a model (RUN, `d6/d5model.py` in the scratchpad: 300 bursts of five typical small match messages through one deflate window with sync flushes, as P11-D2 sends them): bundling five into one saves **15%** of those messages' bytes on the wire, because each inner message still carries its own `messageId`. The same messages **without** their `messageId`s cost a quarter as much (18.6 KB against 71.8 KB): the random UUID, not the envelope count, is most of a small message's compressed size. INFERENCE from that model and D1's counts (about 1,250 match messages a seat per game): `messageId`s may be a third to a half of a whole game's 90-96 KB on the wire.
- **Risk:** every board must still be drawn and every test that reads frames (0117's list) must learn the bundle.
- **Recommendation: close D5 as measured** (no time or page work to gain, 15% of small-message bytes at most, real risk). The byte finding is a separate, smaller question for the owner (question 6): whether to measure a shorter message id. No change is made to `messageId` here (it is the identity the decision gate's duplicate and stale checks rest on: `protocol/README.md`, "Envelope").

## Decisions only the owner can make

Asked as prompts (ESC-001), each with a game example and the canvas section that would show it.

1. **The "While you were away" rows are the play log's own lines, which differ a little from the canvas.** The canvas lists "Bob's turn 7 ended." and "Your turn 8 began."; the play log has a line when a turn begins, not when one ends (SOURCE, `PlayLog.java`: a "turn" fact at each beginning). Example: Bob's turn ends and yours begins while you're away; the window shows "Your turn 8" (the play log's turn line) but no "Bob's turn 7 ended". Recommended: the play log's lines exactly, as Q4 A says ("in the same words as the play log"); the count says how many lines are listed. Canvas: "Q4", option A.
2. **What counts as one "move" in "You missed 9 moves"?** Example: the Bolt's cast and its resolving are two play log lines; the damage and the life change may be one. Recommended: one move = one play log line listed (the number always equals the rows). Canvas: "Q4", option A.
3. **A short stall while you are being asked something.** Example: the game is asking you to block; your connection stalls 3 s; nothing happened meanwhile. Recommended: no sign at all (nothing to replay, the question stays), only today's notice if it lasted 5 s. Canvas: "The awkward moments", "While the game is asking you" (it says nothing replays; it doesn't say whether the sign flashes).
4. **The silence notice: 5 s or today's 1.5 s?** Today the blue "Reconnecting to the game…" shows 1.5 s after the browser closes the socket. A silent stall never closes it, so the page can only notice the silence itself. Example: your hotel wifi freezes; after how long does the notice show? Recommended: 5 s of silence (the plan's number), then the notice with its usual 1.5 s settle, so a short freeze never shows it. Canvas: "Your choice: a short stall" (the notice at 1.5 s after the stall in the scene, which is shortened).
5. **After a refresh, a "While you were away" window?** A refresh starts fresh (both plans agree it is not a replay). But the tab could remember the last board it drew, so the fresh page could list the moves made while it reloaded. Example: you press F5 while Bob plays a land; the land is on your table when the page comes back, and nothing says it was just played. Recommended: no window after a refresh (the land is in the play log; a refresh takes 1-3 s). Canvas: "The awkward moments", "A refresh". Spec 0120's question 5 is the same choice from the other side.
6. **Measure a shorter message id?** Every match message carries a 36-character random id, and a model says these ids may be a third to a half of a game's bytes on the wire. Example: Bob taps a Forest; the "tapped" change is about 20 bytes, its id about 35. Option A: leave it (recommended for now: D5 closed, nothing changed). Option B: a follow-up spec that measures it on a real game and, if it holds, proposes a short per-connection number, keeping the duplicate and stale checks. Nothing on screen changes either way.

## Owner answers, 2026-11-26 (by prompt, canvas `Proxic canvases/questions-0119-0120.html`)

1. **The away window lists the play log's own lines** ("Play log lines"), nothing made up by the page.
2. **One move per line listed** ("Every line"): "You missed 8 moves" counts every line shown.
3. **A short stall while being asked shows no sign** ("No sign"): the question stays put; nothing under 5 s.
4. **"Reconnecting to the game…" after about 6.5 s** of silence on an open connection (5 s plus the usual 1.5 s settle).
5. **No away window after a refresh** ("No window"): the page starts fresh; the moves are in the play log.
6. **Message ids stay as they are** ("Leave it", after an explanation): no follow-up spec.

## Where the plan and the owner's answers differ (the answer wins)

- None of decision 5's answers differ from the plan's recommendations (3×, 20 updates and 6 s, the act button, every move numbered).
- **The plan's kept list "as sent"** can't be replayed on a new connection since D4 (each delta's base is per connection): kept as whole boards and resent through the new connection's stream (above). A design change, not an owner answer.
- **The plan's `MATCH_MISSED`** is dropped: the page already has the lines (above).
- **The plan's test tool** for a slow link (Chrome's network emulation) does not reach WebSocket frames (RUN): a relay instead.
- **Decision 7** (later than the plan): the page's silence timer judges nothing when it runs late; the plan had a plain 5 s / 10 s timer.

## Rough size and order

M on the server (the queue, `SeatReplay`, resume, the beat), L on the page (the replay player and the pace rate through every hold, the sign, the window, the silence check), S for A1 (the carry), M for the gate and the browser tests (the relay link). Build order: (1) the queue (D6's core, with F-0119-B), alone and shippable: nothing a player sees; (2) `sentAt`, the beat, kept boards and resume, with the gate; (3) the page's replay, the sign and the window, with A1's carry; (4) spectators behind the switch. Then spec 0120.

## Amendments

None.

## As built: the per-connection queue (2026-11-26)

Approved alone by the owner on 2026-11-26 ("Build it now"); the rest of this
spec is still a draft and none of it is built. Nothing a player sees changes:
no new message, no new word, no `protocolVersion` bump.

**What was built** (server only; SOURCE):

- `server/.../match/SendQueue.kt` (new): `SendQueue`, one per connection. `offer`
  puts a message at the back and returns at once (never suspends, never
  blocks); one coroutine per connection takes them in order and writes each
  on Ktor's `outgoing`. `Outgoing` is what goes in it: a hub message (a board
  goes through the connection's `BoardStream` as it leaves), a resync's whole
  board, a close.
- `MatchHub.kt` `Connection` owns the queue; `MatchHub.sendTo` and `spectate`
  queue (`Connection.offer`) instead of sending in turn, so neither the
  worker's pump thread (`MatchDecisions.tell`) nor the next connection ever
  waits on one socket. `MatchWatchers.open` starts the queue in the socket's
  own session (`scope`) and says who is told it fell behind (`behind`).
- `MatchSocket.kt`: everything the socket sends itself (`WATCHING`, the hello,
  the stored board, the waiting question, `MATCH_ASKING`, the receipts, a
  resync's answer) goes through the same queue, so their order with live
  messages is the queue's. A resync's board is read when it is queued
  (`Outgoing.Resend`), so every live board queued after it is the same or
  newer. `fellBehind` closes a connection that fell behind with **4002
  "behind"** if that close can be written within 2 s, and ends the session
  either way (a page that stopped reading cannot take the close). Players and
  spectators alike. Every connection's close line now says how its queue went
  (`queue: most waiting <n>, longest wait <ms> ms`).
- `Spectating.kt` `SpectatorEndings`: the ending and the normal close go
  through the queue, after the boards before them.
- `BoardStream.kt`: unchanged in rule; `DiffMemo.diff` is synchronized (two
  connections of one send can now reach it at once).
- The page is unchanged: it already treats any close but 1008 as a lost
  connection and reconnects (`match.ts` `connectMatch`), and a new
  connection's first board is whole.
- Exact memory (P11-D3/D4): a board moves a connection's `BoardStream` only as
  it leaves the queue. A connection found behind drops what it had queued and
  writes nothing more; the board being written when it was cut is the last
  its stream moved for, and the connection is closed, so the page's next board
  is a new connection's whole one. No connection's delta base can be left
  wrong by a dropped message.

**The "far behind" rule (`QueueLimits`) and why.** A connection is behind
when, as a message is queued for it, **its oldest unsent message has waited
more than 10 s**, or **1,000 messages are waiting**. A message waits in the
queue only once the socket's own buffers are full (Ktor's 8 frames, the
kernel's, Docker's), so time is the measure that means "this page is not
keeping up", whatever the messages' sizes:

- the poor link (decision 4: 1 Mbit/s, 300 ms each way, a 3 s stall) never
  came near it: on the browser test's poor link (RUN, below) the server's
  queue held at most 5 messages and the longest any waited was **6 ms**
  (1,371 messages, 153 KB compressed on the wire for the whole stretch,
  against the link's 125 KB a second);
- a whole game is 90-96 KB a seat on the wire (P11-D4 As built), so a healthy
  link that is slow falls behind by seconds only if it stops for seconds;
  10 s is longer than D6's "short drops" and the silence after which the
  rest of this spec has the page give up on its own connection (10 s);
- it is well inside Ktor's ping timeout (45 s after a connection stops
  answering), which is what closed a stuck connection before;
- 1,000 messages is a memory backstop, never the usual cut: the most a
  player's connection was sent in any 10 s of the spike's bot-driven game was
  193 messages (RUN, both seats); 1,000 is five times that. The queue holds
  references to messages the hub already made, not copies.

**Evidence** (local, the owner's PC, stack A on :8080; RUN 2026-11-26):

```text
server StuckSocketWireTest (real Netty server, two raw sockets; Alice's never reads, 4 KB
receive buffer; the pump sends each 400 messages, Alice 64 KB each)
  at 7a802a7a (the file run in a checkout of it)   FAILED: one round waited 10,004 ms
                                                   on Alice's socket (400 rounds 10,073 ms)
  with the queue                                   passed: 400 rounds in 47 ms, slowest 5 ms;
                                                   Bob got all 400, in order
server FellBehindWireTest (the same, wired as MatchSocket: session scope, fellBehind; limit 1 s)
                                                   passed: Alice cut off and her session ended
                                                   3,638 ms after the sending began (most 32
                                                   waiting); her client then read the end of
                                                   the connection; Bob never cut, got all 52
server SendQueueTest (8)                           order across 500; the 10 s cut (told once,
                                                   nothing queued after); the 1,000 backstop;
                                                   a slow socket never cut; nothing after a
                                                   close; the pump (MatchDecisions) with a
                                                   stuck player AND a stuck spectator: 300
                                                   steps, slowest well under 50 ms, Bob all
                                                   300 in order; a cut connection's stream
                                                   moved only for what left; a resync whole,
                                                   in its place
```

The browser test `frontend/e2e/match-slow-link.spec.ts` (new; relay
`frontend/e2e/slow-link.ts`, new): a real game (green deck, the bot
`drive`); the guest's page on the poor link (a relay in front of its match
socket, pacing the compressed bytes at 125,000 a second, 300 ms each way, a
64 KB link buffer, one 3 s stall); a second guest tab on a plain link that
reads nothing for 50 s while asking for the whole board once a second.

```text
with the queue, run 1        passed (2.4 min). Longest gap in 50 s: host 1,253 ms, guest
                             (poor link) 1,256 ms; 663 host messages meanwhile. The stuck
                             tab's queue: most 119 waiting, longest wait 7,945 ms (its
                             socket did fill, late); closed by Ktor's ping timeout at 50.6 s;
                             the tab reconnected and, with the host's and the guest's pages,
                             ended on the server's board exactly (revision and board, a
                             fresh connection's). The poor link: one connection all game,
                             never cut, its server queue's longest wait 6 ms.
ci-speed (4x CPU, with its   run 1 failed on the first freeze measure (the longest gap
CI neighbour)                between two messages, 5.7 s, while every queue waited at most
                             4 ms: the bot's own pace at 4x, a question waiting on a page).
                             The freeze is now measured as the spike measured it: the game's
                             reply to each of the host's answers. Run 2 failed only on the
                             stuck tab's close code (1011, Ktor's ping timeout: now allowed);
                             run 3 passed (2.6 min, both specs): 32 host answers, the slowest
                             reply 18 ms; the poor link 1,108 messages, 118 KB compressed,
                             held at most 316 ms in the link, its server queue's longest wait
                             3 ms; never cut; every board exact.
at 7a802a7a (3 runs)         the test did NOT reliably fail: twice the stuck tab's socket
                             never filled in 40 s (155 and 157 whole boards: Docker
                             Desktop's port forwarding holds megabytes), so nothing froze
                             (longest gaps 1.25 s); once the longest gap was 5.9 s, which
                             the ci-speed run shows is the bot's pace, not a freeze.
```

So the before/after proof of the freeze is the server wire test, on a real
socket whose buffer is small; the browser test proves the real game, the
poor link (never cut off, exact boards), the stuck tab's close and the
page's reconnect to the exact board, and that nothing waits. How large a
socket's buffers are is the machine's: on Linux (CI, the live server) they
fill far sooner than on this PC (INFERENCE from the spike, which froze on
the same stack after ~1.5 MB). The 4002 close itself is seen only where the
close can still be written (a slow page); a page that stopped reading gets
the session ended (FellBehindWireTest reads the end), which the page treats
the same.

**Bites (TEST-004)**, each restored after:

```text
the hub sends directly again (7a802a7a's MatchHub.sendTo)  SendQueueTest's pump test fails; StuckSocketWireTest fails
spectators sent directly again (MatchHub.spectate)         SendQueueTest's pump test fails (the stuck spectator)
no 10 s rule                                               the 10 s cut test and the exact-memory test fail
no 1,000 backstop                                          the 1,000 test fails
the queue taken from the back                              5 tests fail (order, pump, slow socket, close, memory)
a cut connection keeps writing what it had queued          the exact-memory and 10 s tests fail
fellBehind does not end the session (no `cancel`)          SURVIVED: FellBehindWireTest still passed (the close
                                                           got out and Ktor ended the session itself); the
                                                           cancel is kept for a close that cannot be written
```

**Hidden information (P11-R4):** nothing a seat is sent changes; the queue
only changes WHEN. Each connection's deltas are still made by its own
`BoardStream` from its own last board. The Lab gate is unchanged and was run
(RUN, three scenarios with Arena's worker jar: spectator, karn, numbers, all
OK): `check-deltas.py` rebuilt 2,702 boards (2,539 sent as deltas) equal to
the worker's, and `check-snapshot-first`, `check-hidden-hands`,
`check-hidden-log`, `check-hidden-tops`, `check-hidden-mulligans` and
`check-hidden-information` each said the same over the worker's traces and
the rebuilt ones (2,702 boards, 31,195 cards, 8 the viewer may not see).

**Measures (P11-R5):** a healthy connection's messages leave as soon as its
socket takes them: the queues of every connection in the browser run waited
at most 6 ms (players) and the pump's rounds in the wire test took 0.1 ms
each on average. `MatchTiming.out` (test only) now marks a message queued,
not written; the time to the wire is in the page's arrival.

**Not built (draft, waiting for the owner):** catch-up, `sentAt`, the beat,
kept boards and resume, the sign, the window, A1, spectators' catch-up, and
all of spec 0120.
