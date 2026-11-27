# 0120 — Phase 11: the game pauses while a player's connection is down

**Status:** Draft for the owner (2026-11-26). Nothing is built. Phase 11, step 7 of the recommended order, beside P11-D6. **Depends on spec 0119** (catch-up after a stall): the returning player's catch-up, the resume point and the "caught up" signal are 0119's. Built after 0119, never before it. **Owner, 2026-11-26 (by prompt: "Approve both"): approved**, with the answers below; built after 0119, as its own change.
**Owner decisions:** already made, in `PHASE_11_EFFICIENCY_LOCKED.md`, "Owner decisions on the draft (2026-11-19)":

- **Decision 6** (canvas `Proxic canvases/pause-1119.html`, plan `Phase 11 disconnect pause plan.md`): catch-up is still needed. **Q1 B**: a quiet dim, the act button "Connection dropped · Bob · game paused", a sign on Bob's plate, **plus a window** explaining the pause. **Q2 A**: look, chat and concede; every game move refused. **Q3 A**: the game starts again after the returning player's catch-up and 2 s steady (8 s at most). **Q4 B**: "Bob is back" as a 1 s look only. **Q5 A**: "End the game · you win" after 10 minutes (spec 0054); its window wide enough that "Peek · or hold Space" never wraps. **Q6 B**: a 10-minute pause budget per player per game. **Q7 B**: 5 s of silence is a drop (2 s heartbeat). Also: "away" counts from the game connection, not the lobby (D8); no per-click confirm mode (D9); the response window and the stack's rest start again after a pause (D10); spectators see the pause sign (D11).
- **Decision 7** (later the same day): a hidden or frozen tab counts as connected while its connection is open; the game pauses only if the connection actually drops.

The open questions are under "Decisions only the owner can make" (asked as prompts, ESC-001).

## Why (researched)

Read at origin/main aae55cce (2026-11-26). SOURCE = read in the code; RUN = run on the first local stack built from this worktree; INFERENCE = reasoned. Spec 0119's "Why" holds the slow-link facts this spec shares.

- **Nothing pauses today** (SOURCE). `LiveMatch.answer` refuses an answer only for reasons about the question itself (`NOT_PENDING`, `STALE_DECISION`, `NOT_YOURS`, `PASS_NOT_ALLOWED`, `DUPLICATE`, `UNREACHABLE`). A match connection closing only removes it from `MatchHub.watchers` (`MatchSocket.kt`, the `finally`). The worker moves on its own between questions: the not-asked pass in `MatchController.java` (`host.stops().shouldAsk`), the passed step's `Thread.sleep(PriorityStops.STEP_PAUSE_MS)` (400 ms, in `MatchController.java` where a passed step waits) and the stack's rest (`StackRests.REST_MS` 2,500 ms, `REST_NEXT_MS` for the next in a run; spec 0105, built in 1.74.0 — the plan said "not built yet"; it is now, so G2 below must hold it).
- **When the server learns a player is gone** (READ, the Ktor 2.3.13 jar in the Gradle cache, by `javap`). `Application.kt` installs `WebSockets` with `pingPeriod` 15 s and `timeout` 30 s (`Limits.WS_PING_SECONDS`, `WS_TIMEOUT_SECONDS`). Ktor's pinger (`PingPongKt.pinger`) waits the period, sends a Ping on the raw session's outgoing inside `withTimeoutOrNull(timeout)`, waits for the matching Pong, and on a timeout closes the session with "Ping timeout". **RUN** (2026-11-26, the 0119 slow-reader spike): a match connection that never read again was closed by the server with `java.io.IOException: Ping timeout` exactly 45.0 s after it opened (`101 Switching Protocols ... in 45007ms`): 15 s to the first ping plus 30 s waiting for its pong. So a silent drop is noticed 30-45 s late today, as the plan inferred. Both values are per session in 2.3.13 (`DefaultWebSocketSessionImpl.setPingIntervalMillis`, `setTimeoutMillis`, READ), so the game socket can have its own without touching the lobby's.
- **The heartbeat must be the connection's own pings** (P11-E13 As built, "For the hard pause"; owner decision 7). A page timer or a page reply would pause the game for every hidden tab (Chromium runs its timers once a minute after 5 minutes hidden) and every frozen one. The browser answers protocol pings while the page's thread is held (RUN in E13: a page held 40 s kept its lobby socket past the server's 30 s timeout). So: the server pings each **player's** match socket every 2 s and closes it when 3 s pass without the pong (5 s of silence after the last pong, Q7 B); the page sends nothing for it. **The plan's `BEAT_BACK` page reply is dropped** (it is decision 7's option (b), which the owner did not choose).
- **"Away" today counts from the lobby** (SOURCE). `LiveMatch.endForAway` takes `offlineSince` from the lobby's presence (`LobbyHub` / `OfflineClock`); the page's `theyAreGone` / `goneSince` (`GameScreen.tsx`) read lobby presence, trusted only while `lobbySeesMe`. The away window (`AwayWindow.tsx`, `.gs-away-win` 420 px wide, `game.css`) offers Keep waiting / End the game · you win / Peek.
- **The away window's footer wraps today** (SOURCE): `.gs-win-peek-hint` has `flex-wrap: wrap` (spec 0057 item 2: "in a narrow window 'or hold Space' goes under Peek"), and at 420 px with two buttons beside it the hint goes to two lines (INFERENCE from the widths; to be measured in the build's first test). The pause canvas draws the window 500 px wide (`.awin`), and decision 6 Q5 asks that it never wraps.

## What the player sees

Alice is seat 1, Bob seat 2. It is Alice's turn 7, Main 1. Bob has nothing he could cast, so the game never needs to ask him anything while Alice plays (the worst case for a drop). Every look below is the canvas's, section named.

1. **Bob's wifi dies** (canvas "Q1", option B). For up to about 5 seconds the server can't know. Alice plays a Mountain, taps it and casts Lightning Bolt at Bob: all accepted, and all go into Bob's catch-up (spec 0119). Then the server pauses the game. The Bolt's "Resolving" ring stops and turns grey with "Paused". Nothing on Alice's screen changes yet.
2. **1.5 seconds later the pause shows** (so a quick refresh of Bob's shows nothing):
   - the table dims a little (the rail does not; the cards stay readable);
   - the act button, where "Bob's move" normally is: a pause sign, **"Connection dropped"**, and under it **"Bob · game paused · 0:04"**, the clock counting up;
   - Bob's plate: a small "dropped" sign on his picture, his picture greyed, a pill under his name;
   - **a window beside Bob's plate** (the away window's look): "Bob · connection", **"Bob's connection dropped"**, "The game is paused until he's back. You can look at cards, chat or concede." (wording: question 1), with Peek · or hold Space and **OK**.
3. **Alice clicks Goblin Guide to attack.** Refused: the card gives a little shake, the act button nudges, nothing moves (canvas "Q1", 5.2 s). The same for Shock (canvas "Q2", option A). She can still hover, open the close look, open piles, Peek, chat ("you there?") and concede.
4. **Bob's own screen, while his line is down** (canvas "Your choices: Bob comes back", Bob's screen): today's "Reconnecting to the game…" notice, its second line now **"The game is paused until you're back."**; the act button greyed, **"Reconnecting…" / "The game is paused"**.
5. **Bob is back** (about 40 s later). His page reconnects on its own. His three missed moves (Mountain, tap, Bolt cast) play at 3× with "Catching up… · Tap to skip" (spec 0119), then **"Back in the game"** for a moment. Meanwhile Alice's act button says **"Bob is back" / "Catching up · paused"** (a fast-forward sign) and the pill on his plate turns green: "Catching up".
6. **The game goes on** (Q3 A, Q4 B). Once Bob's table is live and his line has held for 2 seconds, the server un-pauses. Alice sees **"Bob is back" / "The game goes on"** in the act button for 1 second, a green glow round his plate, the pill "Back"; the dim lifts. The Bolt's 2.5 s rest starts again from the beginning, so both of them watch it resolve (20 → 17).
7. **Bob never comes back** (canvas "Q5", option A). Ten minutes after the drop, today's window beside his plate: "Bob has been gone 10 minutes", Keep waiting or End the game · you win, with Peek; now wide enough that "Peek · or hold Space" stays on one line.
8. **Bob keeps dropping** (canvas "Q6", option B): 4, 3, 2.5 and 2 minutes. Half a minute into the fourth drop his pauses reach 10 minutes in all, and Alice is offered End the game at once.
9. **Bob switches to another tab, or his browser freezes it** (decision 7): not a drop. His connection is still open and his browser still answers the server's pings, so nothing pauses. His page catches up the moment he looks again (spec 0119).
10. **Carol is watching** (D11): she sees the same act-button words and plate sign. A spectator dropping pauses nothing.

## Scope

In:
- the drop rule (2 s pings, 5 s silence, or the last player connection closing) on the server;
- the pause: answers refused (G1), the worker held (G2), the look on the page (G3);
- the resume rule (Q3 A) and its looks (Q4 B);
- the away clock from the game connection (D8), the budget (Q6 B), the away window's width (Q5);
- spectators shown the sign (D11).

Out (and why):
- **Catch-up itself**: spec 0119.
- **A per-click confirm mode** (D9): the owner chose none.
- **Changing what spec 0054 offers** (Keep waiting / End the game): only when it is offered changes (D8, Q6).
- **The lobby's own liveness** (E13, built).

## The change

### Detection (server)

- **Each player's match connection** sets `pingIntervalMillis = 2_000` and `timeoutMillis = 3_000` on its session as it opens (`MatchSocket.kt`). Ktor then closes a connection whose pong has not come 5 s after the last one (Q7 B). Spectators' connections and the lobby keep the global 15 s / 30 s. New constants `Limits.MATCH_PING_MS`, `MATCH_PONG_WAIT_MS`.
- **A seat is dropped** when its user has no open player connection to the match (`MatchWatchers.of` empty): the last tab closed, a refresh, a ping timeout. Two tabs: either one open keeps the seat. A new `SeatLinks` in `LiveMatch` keeps, per seat, `connectedSince`, `droppedSince` and the paused time used this game; the hub calls it on `open` and `close`.
- **The pings stay behind nothing** (INFERENCE, from 0119): Ktor's ping goes on the raw session's outgoing, behind frames already handed to the socket. Spec 0119's per-connection queue keeps that short, and a whole game after P11-D2 and D4 is about 90-96 KB a seat on the wire (D4 As built), so a 1 Mbit/s link carries a whole game's bytes in under a second: a ping is never held back 3 s by our own frames on the supported link. A false drop past that is measured in the browser test (F-0120-F), not assumed.

### The pause (server, G1)

- `LiveMatch.paused`: the dropped seats and since when (one atomic value). Set **at once** on a drop (the safe side), cleared only by the resume rule.
- `LiveMatch.answer` refuses with a new **`DecisionRefusal.PAUSED`** as its **first** check, before the `forwarded` claim. The refusal goes only to the user who sent the answer. `DECISION_SEARCH` (looks only), `CONCEDE`, `REPORTS_CLOSED`, `END_FOR_AWAY` and chat stay allowed.
- **The race** (the plan's R1-R5, kept): an answer read before the flip is forwarded and its boards go into Bob's kept list (0119); one read after is refused. `forwarded` allows one forward per question, so at most one answer can cross the flip.
- `MATCH_PAUSED {seat, since, endNow?}` to every player and spectator connection still open; `MATCH_RESUMED {seat}` the same. `since` is the server's time; the page turns it into a clock with 0119's skew.

### Holding the worker (G2)

- New frames on the pipe, server → worker: **`HOLD`** and **`GO`**. They name no seat.
- `DecisionGate` gets a `held` flag. While held:
  - the not-asked pass in `MatchController.java` waits before returning its pass;
  - the passed step's 400 ms sleep and the stack's rest become one helper, `gate.waitOut(ms)`, which stops counting while held and, on `GO`, **starts the wait again from its full length** (D10): the Bolt's rest is a full 2.5 s again after the pause;
  - a question already open is untouched (it can't be answered anyway: G1);
  - `CONCEDE` (`DecisionGate.interject`) still runs, so a concession ends a held game.
- The worker stops at the next priority point after `HOLD`: within milliseconds (measured, F-0120-B).

### Resuming (Q3 A)

The server un-pauses when **all** hold:
1. every dropped seat has an open connection again;
2. that connection's page has sent `CAUGHT_UP` (spec 0119: its table is live), **or** 8 s have passed since it opened (a cap, so a broken page can't hold the game);
3. that connection has been open, with its pings answered, for 2 s;
4. no other seat is dropped.

Then `GO` to the worker and `MATCH_RESUMED {seat}` to everyone. Moves are accepted from that moment.

### The away clock and the budget (D8, Q6 B)

- `END_FOR_AWAY` counts from `SeatLinks.droppedSince` of the other seat (the game connection), not the lobby's `offlineSince`. The page's `goneSince` comes from `MATCH_PAUSED.since`, not from lobby presence.
- Each seat's paused time is added up for the game (Karn's restart is the same match: it carries on). Once a seat's total reaches the away setting (`RoomTimeouts.active.away`, 10 minutes), its next `MATCH_PAUSED` carries `endNow: true` and `endForAway` accepts at once (canvas "Q6", option B).

### The page (G3)

- `match.ts`: `MATCH_PAUSED` / `MATCH_RESUMED` into the state (`paused: {seat, since, endNow} | null`, both seats possible); `DECISION_REFUSED` with `PAUSED` is handled quietly (no error words: the pause look is the answer).
- **Answers are not sent while paused**: the page refuses the click itself (the shake and nudge, canvas "Q1" 5.2 s, "Q2" option A). The server's G1 is the gate; the page's refusal is only the look.
- **The response window** ("Resolves in 5", spec 0005, `RESPONSE_WINDOW_MS`): its countdown stops on `MATCH_PAUSED` and starts again at 5 on `MATCH_RESUMED` (D10).
- **The look** shows 1.5 s after `MATCH_PAUSED` (`useSettled`, as the reconnect notice), or at once if Alice clicks a move meanwhile. Its parts are the canvas's "Q1" option B, listed under "What the player sees" 2.
- **Bob's page while disconnected**: the reconnect notice's line and the greyed act button (canvas "Your choices: Bob comes back", Bob's screen).
- **Bob's return on Alice's page**: "Bob is back" / "Catching up · paused" with the plate's green "Catching up", from the moment Bob's seat has a connection again until `MATCH_RESUMED`; then "Bob is back" / "The game goes on", the green glow and "Back" for 1 s (question 3 asks what a click on the act button does in that second).
- **Flapping**: a new `MATCH_PAUSED` within 10 s of `MATCH_RESUMED` shows the look at once and no "Bob is back" flash meanwhile (the plan's awkward-moments table).
- **Spectators** (D11): the act-button words and the plate sign; nothing is refused because they never act.

### Messages

```text
server -> page    MATCH_PAUSED      seat, since, endNow?     players and spectators
server -> page    MATCH_RESUMED     seat                     players and spectators
server -> page    DECISION_REFUSED  reason PAUSED            only to who answered
page   -> server  CAUGHT_UP         (nothing)                spec 0119; read as "this connection's table is live"
server -> worker  HOLD / GO         (nothing)                no seat named
```

`MATCH_BEAT` and the resume point are spec 0119's. The plan's `BEAT_BACK` is not built (decision 7).

### Documents changed with the build

`protocol/README.md` and `docs/architecture/MATCH_PROTOCOL.md` ("Reconnect", the message tables, "End and failure"); `docs/architecture/MATCH_RUNTIME.md` (the pipe's `HOLD`/`GO`); spec 0054's As built gets a dated note (D8 changes where "away" counts from; PHASE-002: an amendment to an approved spec, for the owner); the paper's As built; `ROADMAP.md`.

## Rules and boundaries

- **The server decides who may act** (AGENTS' one-line version). G1 is the gate; the page only shows it.
- **§6.111: a disconnect never passes, concedes or picks.** Unchanged: the pause refuses moves, it never makes one.
- **PROTO-004 (Mindslaver):** the pause is about the **authorised** player's link. One Lab case checks it.
- **PROTO-005:** `PAUSED` is refused before anything reaches Forge, like the other refusals.
- **VEND / no rules workarounds:** `HOLD` stops our own waits and our own not-asked pass; it changes no rule and no Forge code.
- **Decision 7:** detection is the browser-answered ping only (above).
- **FMT-005:** `paused` holds a set of seats; four seats need nothing new.
- **P11-R1:** every look is on the approved canvas (list under "What the player sees"); the open looks are questions below.
- **No "Forge" in player text:** none in any word above.

## Hidden information (HID-001, HID-005)

- `MATCH_PAUSED` / `MATCH_RESUMED` carry a seat number and a server time. Who dropped is public already (the lobby's presence, the plate's "Away"). They name no card, question or zone.
- `HOLD` / `GO` name no seat.
- A `PAUSED` refusal goes only to the user who answered and says nothing about the other seat.
- The dim and the shake change no card, count or zone (HID-005): the dim is one layer over the whole table, the same for every board.
- **Whether the game was waiting for Bob** was already on Alice's screen ("Bob's move"); the pause shows the same look either way, so it adds nothing.
- Catch-up resends to Bob only what was already built for Bob's seat (spec 0119's argument and gate). P11-R4's gate runs over paused games too (F-0120-F).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0120-A | Server, `SeatLinks` with a fake clock: connected; a clean close drops at once; two tabs (one closes: not dropped); spectators never count; paused time added up; the budget's `endNow`; `endForAway` from the game connection | unit |
| F-0120-B | Server, `LiveMatch.answer` → `PAUSED` first; **the race**: an answer just before the flip is forwarded and is in the seat's kept list (0119), one just after refused; 1,000 answers racing the flip from another thread: each refused or forwarded once, never lost, never twice | unit |
| F-0120-C | Server, the resume rule: steady 2 s; `CAUGHT_UP` or the 8 s cap; both seats dropped resume only when both are back; a flap restarts the 2 s | unit |
| F-0120-D | Worker (beside `DecisionGateTest`): `HOLD` during a passed step's pause, during a not-asked pass, during the stack's rest; `GO` restarts the rest at its full 2,500 ms; `CONCEDE` while held ends the game; an open question untouched; time from `HOLD` to the hold taking effect measured | unit (worker) |
| F-0120-E | Mechanics Lab: one scenario sends `HOLD`/`GO` around an unanswered spell (the Lab has no server); its trace shows the rest held and run again in full | Lab |
| F-0120-F | **Browser, a real game** (0119's helpers): a clean drop (the guest's socket closed by `routeWebSocket`) pauses the host within 1 s; a silent drop (the guest's `context.setOffline(true)`, which RUN in 0119's `net-tools` spike leaves the socket open while frames vanish both ways) pauses between 3 and 6.5 s (and measures it); **the race** (the host plays a land 4 s after the guest's silent drop: it is in the guest's catch-up and the guest's table ends equal to the server's); an 8 s stall pauses and resumes with nothing replayed; a refresh within 1.5 s shows the host nothing; both drop; the 10-minute window with the away setting at 1 minute (as `match-away`); 0119's slow link (a relay at about 1 Mbit/s and 300 ms: Chrome's own emulation does not reach WebSocket frames, RUN in 0119) never pauses a live game; every hidden check and P11-R4's browser gate pass | browser |
| F-0120-G | Decision 7: the guest's page thread held 20 s (as `hidden-tab.spec.ts` holds it) does **not** pause the game; the socket is the same one when it wakes | browser |
| F-0120-H | Page (Vitest, fake timers): the look after 1.5 s, at once on a click; the countdown frozen and restarted at 5; `PAUSED` handled quietly; "Bob is back" 1 s; no flash on a flap within 10 s; `endNow` opens the away window at once; spectators get the words and the sign only | unit |
| F-0120-I | The away window's footer: "Peek · or hold Space" is one line (its box one line high) at 1920×1080 and at 125% and 150% scaling | browser |
| F-0120-J | TEST-011: screenshots of the pause look with its window, Bob's return on both screens, "Bob is back", the 10-minute window, on the real app, for the owner | owner |

**TEST-004 (bites):** `PAUSED` checked after the `forwarded` claim (the race test fails); `GO` resuming the rest where it stopped (F-0120-D fails); the resume rule without the 2 s (F-0120-C fails); the ping settings left at 15/30 (F-0120-F's silent drop fails); the away clock from the lobby (F-0120-A fails); a page timer instead of the ping (F-0120-G fails).

## Risks

- **A false pause on a weak link.** 3 s without a pong closes the socket. The supported link (1 Mbit/s, 300 ms) is tested (F-0120-F); a worse one is best effort (decision 4 of the draft).
- **A browser that does not answer pings in a frozen tab** (one of the brands). Then decision 7 cannot hold there and the game pauses. F2's hand check covers it per brand.
- **The worker held at the wrong moment.** `HOLD` only stops our own waits; a Forge wait we don't own is not held (none is known: SOURCE, the only waits are `STEP_PAUSE_MS` and `StackRests`).
- **Spec 0054 changes where "away" counts from** (D8). Its own test (`match-away`) changes with it.

## Decisions only the owner can make

Asked as prompts (ESC-001), each with a game example and the canvas section that shows it.

1. **The pause window's words say "he".** The canvas window reads "The game is paused until he's back." The game doesn't know whether Bob is he, she or they. Recommended: "The game is paused until Bob is back. You can look at cards, chat or concede." Canvas: "Q1", option B (the window beside Bob's plate).
2. **The pause window's OK, and when it goes.** Alice clicks OK: the window closes, the dim and the act button stay. Does it come back if Bob drops again later in the game? Recommended: yes, once per drop; and it is replaced by the away window at 10 minutes (the same place beside his plate). Canvas: "Q1", option B, and "Q5" for the away window.
3. **The 1 second of "Bob is back": what does a click on the act button do?** The game is live, so Alice could act, but her act button is showing "Bob is back / The game goes on". Example: Alice clicks the act button at once to go to combat. Recommended: the cards on the table work at once; a click on the act button in that second ends the look and shows her own button, without acting, so nothing is done by a click she aimed at the words. Canvas: "Q4", option B.
4. **The pill on Bob's plate during a long pause.** The canvas shows "Dropped" in "Q1" and "Away · N min" in "Q5" (today's plate pill since spec 0054). Recommended: "Dropped" for the first minute, then "Away · 1 min", "Away · 2 min"…, so the plate says how long. Canvas: "Q1" and "Q5".
5. **A refresh: catch up or start fresh?** The two approved canvases disagree. The catch-up canvas ("The awkward moments", "A refresh"): "Not a stall. The page starts fresh with today's full table and the play log." The pause canvas ("The awkward moments", "A refresh"): "The page keeps its last update number, so a refresh catches up like a reconnect." Example: Bob presses F5 while Alice's Mountain is on its way. Recommended: start fresh (the catch-up canvas): a reloaded page has no table to replay from; the Mountain is in its table and its play log at once, and, with question 5 of spec 0119, the "While you were away" window lists it when Bob's page knows its last update (kept in the tab).
6. **Spectators: the dim too?** D11 says spectators see "the same act-button words and plate sign". Example: Carol is watching when Bob drops. Recommended: words and sign only, no dim and no window (she can't act, so "nothing will happen" needs no emphasis). Canvas: none draws a spectator; this would need a small addition to "Q1".
7. **"Bob's connection dropped" or "Connection dropped" when the game was waiting for Bob anyway?** The canvas's awkward-moments table says Alice sees "Bob's connection dropped" instead of "Bob's move"; its "Q1" scene shows "Connection dropped / Bob · game paused · 0:04". Recommended: the "Q1" look always (one look for every pause). Canvas: "Q1" and "The awkward moments", "A drop while the game is asking Bob".

## Owner answers, 2026-11-26 (by prompt, canvas `Proxic canvases/questions-0119-0120.html`)

1. **"The game is paused until Bob is back."** The player's name, never a pronoun.
2. **The pause window shows for every drop**; at 10 minutes the away window replaces it in the same place.
3. **A click during "Bob is back" only ends the look** and shows the player's own act button, without acting; cards on the table work at once.
4. **The plate says "Dropped" for the first minute, then "Away · N min".**
5. **A refresh starts fresh** (no catch-up for a reloaded page).
6. **Spectators get the act button's words and the plate sign only**: no dim, no window.
7. **One standard pause look, always** (owner: "we need the drop to be standardized so it always looks the same and has the same behavior regardless of which player drops"). Every drop shows the same dim, act button words ("Connection dropped / <name> · game paused · 0:04"), plate sign and window, whatever the game was doing and whichever seat dropped; no special wording for any case. The returning player's catch-up is the only difference, because their screen could not receive anything while down.

## Where the plan and the owner's answers differ (the answer wins)

- **Q1:** the plan recommended A (no window); the owner chose **B** (plus a window). Built: B.
- **The heartbeat:** the plan had the page answer each beat (`BEAT_BACK`), and its "Bob switches to another tab" row said a frozen tab "stops answering and the game pauses, which is right". Decision 7 says a hidden or frozen tab counts as connected while its connection is open. Built: the connection's own pings, answered by the browser; no `BEAT_BACK`; a frozen tab does not pause the game (P11-E13's note says the same).
- **The stack's rest** was "not built yet" in the plan; it is built (spec 0105, 1.74.0), so G2 holds it now, not "with it".
- **The two plans' "A refresh" rows disagree** (question 5).

## Rough size

M on the server (`SeatLinks`, `paused`, `PAUSED`, the resume rule, the ping settings, D8), S on the worker (`HOLD`/`GO`, `waitOut`), M on the page (the look, the window, Bob's return, the countdown, the away window's width), M in tests (a real game with drops, the race). About 1.5 times spec 0105's build.

## Amendments

**Amendment 1, owner 2026-11-27 (by prompt: "Count it as a drop"):** decision 7 rested on the browser keeping a frozen tab's connection open and answering pings. **It does not** (RUN, 2026-11-26/27, the probe `frontend/e2e/probe-frozen.spec.ts`, commit 65cc8c9c on `p11-pause`: Edge driven over raw DevTools, since every page Playwright drives reports itself visible). A tab only **hidden** kept one connection for 10.5 minutes of a live game (beats arriving, longest gap 6.9 s, the server's queue never over 3 ms). A tab really **frozen** (`Page.setWebLifecycleState frozen`) had both its sockets, the lobby's and the game's, failed by Edge itself at the instant of the freeze ("Page entered Back-Forward Cache"), 3 of 3 runs; it then answers no pings. So the server cannot tell a frozen tab from a dropped connection. **The rule now:** a tab that is only hidden never pauses the game; a tab the browser freezes counts as a drop, with the standard pause look (answer 7), the 10-minute away clock and the pause budget like any drop; when the player returns, the tab wakes, reconnects with `resume`, catches up (0119), "<name> is back" for 1 s, and play goes on. Decision 7's text and this spec's item 9 are read with this amendment; F-0120-G becomes two checks: a hidden tab does not pause, and a frozen tab pauses and comes back cleanly. Not measured: the brands' own savers (Edge sleeping tabs, Chrome Memory and Energy Saver; F2's hand check) and WebKit (no hidden or frozen page through Playwright). Also corrected: P11-E13's "the browser answers pings while frozen" was measured on a busy script thread, not a real freeze; a frozen lobby tab's socket fails too.
