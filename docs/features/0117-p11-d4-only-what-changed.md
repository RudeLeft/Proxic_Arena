# 0117 — Phase 11 P11-D4: each player is sent only what changed (`MATCH_DELTA`)

**Status:** Approved 2026-11-23 (owner, by prompt: "Approve"; decisions 3-5 below answered A, A, A). Phase 11 item P11-D4, step 5 of the recommended order. A protocol change, so it gets a full spec and the owner's approval of its decisions (`PHASE_11_EFFICIENCY_LOCKED.md`, "How work runs"). **Built after P11-B4** (the hidden-information script in CI), which the paper puts before D4 and which isn't done yet (`.github/workflows/ci.yml` still lists `check-hidden-information` as "run only by hand").
**Owner decisions:** two are already made, in the Phase 11 paper's "Owner decisions on the draft (2026-11-19)":

- **1. Full-picture fallback: yes.** Every update is numbered and names the update it builds on. A page that gets one that doesn't follow asks for a full picture. Full pictures go on join, reconnect, a new game (Karn's restart too), on request, and once at the start of every turn as a checkpoint. A server switch turns "only what changed" off. CI proves the rebuilt view equals the full view for every seat and spectator.
- **2. Spectators: yes, the same mechanism,** switched on after the players' version is proven.

Three questions are still open, under "Decisions only the owner can make" (asked as prompts, ESC-001).

## Why (researched)

Read at main 6b31d0fa (2026-11-22).

- **What is sent today** (SOURCE). The worker builds one board per seat each round (`GameHost`; `ViewerSnapshot.of`, with the hidden ids stripped by `HiddenIds`), plus the public view while someone watches. The server adds picture addresses (`MatchArt.annotate`), stores the board (`LiveMatch.snapshotTaken`) and sends it to each of that user's connections (`MatchHub.sendTo` → `Connection.deliver` → `BoardStream.send`). Since P11-D3, `BoardStream` keeps per connection the history lists the page holds and trims `payments`, `rolls` and `notices` to what the page lacks (`kept`). The page rebuilds the whole board (`history.ts` `withHistory`) in `match.ts`'s `MATCH_SNAPSHOT` case before anything reads it.
- **How much of it is new** (RUN, from the paper). Lab, 432 traces at 1.75.0 (`scripts/measure-wire.py`, P11-D1): median board 3,384 bytes; a simple delta (changed top-level keys, plus list members changed or added by id, plus removed ids) has a median of 46 bytes (p95 890), **6.8%** of the bytes. Real game (P11-D3 As built, after D3): median board 9.3-9.7 KB a seat, 298 boards a game. On the wire, D2's compression already brings a real game to 3.1-4.0% of the bytes read (P11-D2 As built).
- **So what D4 buys** (INFERENCE from those RUN numbers). The bytes the page reads and parses drop to about a tenth. The bytes on the wire drop less, because deflate's window already removes most repetition: D3 cut the parsed board by 13-25% but the compressed combat by only 6-10%. The bigger gain is the next step: the page keeps the **same object** for every card that didn't change, which P11-C2 needs (work that grows with what changed, not with the size of the table). D0 showed parsing is under 1 ms a moment, so D4 alone won't make the page feel faster.
- **Revision numbers** (SOURCE). `stateRevision` comes from `DecisionGate.bumpStateVersion`, once per round, and is shared by every seat's board in that round. It rises across Karn's restart; `gameEpoch` says which game. A seat's boards aren't always consecutive numbers (a spectator's public view, for example, is built only while someone watches). So a delta names **the board it builds on**, not "the one before by number".
- **The page's own changes to its board** (SOURCE). `MATCH_STEP` moves `turn`, `phase`, `activeSeat` and `prioritySeat` on the board the page shows, without a new board. So the board on screen isn't always the board the server last sent. A delta has to apply to the board as **sent**, kept apart.
- **Order and loss** (SOURCE). One socket per page, sent in order under the connection's lock (`BoardStream.send`). A frame can't go missing without the socket closing, and a closed socket reconnects and gets a full board. So a delta that "doesn't fit" means a bug on one side. The fallback is there for exactly that case (decision 1: "a single bad delta could leave a player's table wrong until they reload").

## What the owner sees

**Nothing changes on screen** (P11-R1). The table, hand, plates, windows, glides and timings look exactly as they do today, on both seats and for spectators. The jump check and a normal-speed clip of a busy moment prove it.

What changes is what travels:

1. **Bob taps a Forest.** Today each seat is sent the whole table again (about 9-12 KB in a real game). After this spec, each is sent one small message that says "the Forest is now tapped, Bob's mana pool now holds G" (a few hundred bytes). Each page rebuilds the whole table from the table it already has plus that message, and draws it as before.
2. **Alice reloads, opens a second tab, or her Wi-Fi drops and comes back.** That page gets the whole table first, as today, and small messages from then on.
3. **Turn 7 begins.** Every page gets the whole table once, as a checkpoint (decision 1). If anything had drifted, it's put right there.
4. **Karn's restart.** The first board of the new game is whole.
5. **Something doesn't fit** (only ever a bug). Bob's page gets a message that builds on a table it doesn't have. It keeps showing what it has, asks the server for the whole table, gets it a moment later and carries on. What Bob sees meanwhile is open question 3; the default is "nothing".
6. **Carol is watching.** Until spectators are switched on (decision 2, open question 2), Carol's page keeps getting the whole public table on every update, as today. After that, she gets small messages too.

## The change

### The message: `MATCH_DELTA` (server → browser)

```text
MATCH_DELTA   gameEpoch   the game it belongs to (the base's; a new game is always a full board)
              from        stateRevision of the board this connection was last sent (the base)
              to          stateRevision of the board it makes
              set         {key: value}   top-level keys whose value changed, whole
              unset       [key]          top-level keys the new board no longer has
              lists       {key: {put: [item], drop: [id], order?: [id]}}   keyed lists, by item
              kept        P11-D3's rule, unchanged, for payments / rolls / notices
              payments? rolls? notices?   P11-D3's new entries, unchanged
              whole?      TEST ONLY (PROXIC_TEST_DELTA_CHECK): the full board, to compare
```

- **Keyed lists.** A top-level list is patched by item when every entry, old and new, is an object with a unique `id` (the zones and the stack), or, with no `id`, a unique `seat` (`players`). `put` holds each item that is new or changed, whole. `drop` holds the keys of items gone. `order` holds every key in the new order, and is sent only when the order isn't the default: kept items in their old order, then new ones in `put` order. Any other list (the round's `moves`, `playLog`, `life` and so on) goes whole in `set` when it changed and in `unset` when it's gone.
- **Nothing finer than one card.** A changed card is sent whole (STUB-005: the simplest correct rule). That's the rule the paper's 6.8% was measured with. If a real game's median misses the target, the next step is a field diff inside a card, measured first.
- **History lists** (`payments`, `rolls`, `notices`) keep P11-D3's `kept` rule exactly. They are never in `set`, `unset` or `lists`.
- **The play log** needs nothing new. Each board's `playLog` is that round's lines, so a delta carries them in `set` (or `unset` when a round has none), and the page merges them by number as today.
- **The envelope** is the usual `protocolVersion`, `type` and `messageId`. One message sent to several connections keeps one `messageId`, as in D3, even when each connection gets a different delta. D0's timeline joins on it.
- **Structural rule, not game knowledge** (ARCH-005). The diff compares JSON values and keys lists by `id` or `seat`. It knows nothing about cards, zones or rules. Two values are equal when their JSON is equal, ignoring key order.

### The resync request: `MATCH_RESYNC` (browser → server)

`MATCH_RESYNC {have?: {gameEpoch, stateRevision}}`. The server reads nothing from it except that it came on this connection. `have` is written to the server's log line and never acted on (§6.100: the client supplies no fact the server relies on). The server answers the way a new connection is answered, without the hello:

1. it resets this connection's `BoardStream` (D3's history memory and D4's base);
2. it sends the stored board with the whole play log (`MatchRuntime.snapshotFor`; for a spectator, `publicSnapshotWithLog`), whole;
3. it re-sends the question still waiting for this user (`pendingFor`), then `MATCH_ASKING`.

So the board still arrives before the question that names its objects (PROTO-002, §6.110), and anything the missed delta carried (its play log lines) comes back. A connection gets at most one resync a second; more are logged and ignored. Every resync is logged as `match <id>: connection <c> asked for a full board (had <epoch>/<rev>, sent <epoch>/<rev>)`. That's the owner's and the builder's evidence in a live game that the fallback ever ran. Logs only: no Admin change (P11-R1).

### Server (`server/.../match/`)

- **`BoardStream`** (`BoardHistory.kt`) grows from "the lists the page holds" to "**the last whole board this connection was sent**": the board after pictures (`MatchArt.annotate`) and after the whole play log a first board carries, before D3's trimming. Each board is still sent under the one lock per connection, so a stored board read by a joining connection and a live one can't cross (D3's rule). A new pure object, `BoardDelta` (`diff(base, board)`, `apply(base, delta)`), holds the rule; `BoardHistory.trim` stays as it is and is called for the history keys.
- **A full `MATCH_SNAPSHOT` is sent instead of a delta when:**
  - the connection has no base yet: join, reconnect, reload, second tab, a spectator arriving;
  - `gameEpoch` differs from the base's (Karn's restart);
  - `turn` differs from the base's: the once-per-turn checkpoint (decision 1). The checkpoint resets the memory, so its history lists come whole as well and nothing the page holds is relied on. Its `playLog` is still that round's lines only (the page keeps the log by number);
  - the page asked (`MATCH_RESYNC`);
  - the delta's text would be no shorter than the board's: the board goes instead (a wipe, a big restart round);
  - deltas are off: the server switch, the page didn't say it takes them (below), or the connection is a spectator's while spectator deltas are off.
- **An older board** than the base (the stored board a joining connection reads, overtaken by a live one) goes whole and leaves the memory as it was (D3's rule, kept). The page drops it by revision, but keeps its play log lines (spec 0064).
- **The switches.**
  - `PROXIC_MATCH_DELTAS` (production; default `true`) turns deltas off for every new board on this server. With it off, the server sends exactly what it sends today after P11-D3.
  - `PROXIC_SPECTATOR_DELTAS` (production; default `false` until it's switched on under decision 2).
  - `PROXIC_TEST_DELTA_CHECK` (**test only**; on in `docker-compose.ci.yml`, `${PROXIC_TEST_DELTA_CHECK:-true}` in `docker-compose.local.yml`, and off for the measuring kit, whose bytes it would double) adds `whole` to every delta. `scripts/check-test-switch.py` gains it, so it can never reach the production compose files or the Dockerfile.
- **The page says it takes deltas** with `?deltas=1` on the socket address (`/ws/matches/{id}?deltas=1`). An older page, a tool, or a test that wants full boards leaves it off and gets full boards, as today. It carries no personal data, only the format choice. No `protocolVersion` bump: nothing changes for a client that doesn't ask.
- **CPU** (INFERENCE, measured in the build). One comparison per top-level key and per card, per connection, against a board already in memory. One user's two tabs normally share a base, so `sendTo` may compute one delta per distinct base revision and reuse it. That's allowed, not required, unless the CPU measure needs it.

### Page (`frontend/src/`)

- **`delta.ts`** (new): `applyDelta(base, delta)` rebuilds the board. Every item, list and value the delta doesn't name is **the same object** as in the base, which is what P11-C2 builds on. It sits beside `history.ts`, which still does D3's part. For tools and tests only, `deltaOf(base, board)` mirrors the server's rule, as `trimHistory` does for D3.
- **`match.ts`:**
  - the state keeps the **base** (the last whole board taken, as sent, before `asSnapshot`) apart from the board shown. `MATCH_STEP` changes only the shown board, never the base;
  - **`MATCH_DELTA`:** if a base exists, its `gameEpoch` is the delta's and its `stateRevision` is `from`, the page rebuilds the board and goes on exactly as for `MATCH_SNAPSHOT` (the play log merge, the revision check, `spotlight`, `recent`, `history`). Otherwise it sends `MATCH_RESYNC` once, drops further deltas until a full board arrives, and keeps showing what it has. If no full board has come 3 s after asking, it closes the socket, and the existing reconnect (`MATCH_RECONNECT_DELAYS`) brings one. A delta that fails to apply (a malformed message) is treated the same way;
  - **`MATCH_SNAPSHOT`:** as today, at any time. It becomes the base unless it's older than the base;
  - **with `whole` present** (test only), after rebuilding, the page compares the rebuilt board (after `withHistory`) with `whole`, ignoring key order. On a mismatch it logs `DELTA_MISMATCH` with the first differing path to the console. It still draws the **rebuilt** board, never `whole`, so the check proves what players get.
- **The socket address** gains `?deltas=1` (the game page and the spectate page).

### Documents changed with the build

- `protocol/README.md`: `MATCH_DELTA`, `MATCH_RESYNC`, `?deltas=1`, and the envelope note.
- `docs/architecture/MATCH_PROTOCOL.md`: the server → browser and browser → server tables, "Viewer snapshots" and "Reconnect".
- `docs/architecture/MATCH_STATE_VISIBILITY.md`: one paragraph beside D3's (below).
- The paper's "As built: P11-D4" with the numbers, and `ROADMAP.md`'s spec list.

## Rules and boundaries

- **HID-001, P11-R4: see "Hidden information" below.** It's the release-blocking part.
- **ARCH-003: no second source of truth.** The worker's board, stored by the server, stays the truth. The delta is a way of sending it, and the page's rebuilt board must equal it exactly (the desync proof below).
- **ARCH-005.** The transport knows boards, revisions and connections, never Magic (above).
- **PROTO-002 and §6.110: state first.** A full board, a resync or a new connection always sends the board before the pending question. Deltas go in the same order, under the same lock, as boards do today. `check-snapshot-first.py` runs over the rebuilt traces.
- **PROTO-005.** An answer given against a board the page hasn't rebuilt yet is still refused by the existing `STALE_STATE` check. Nothing about answers changes.
- **PROTO-007.** The rebuilt board is the snapshot. A delta's one-time moments (`moves`, `damage`, `life`) are presentation hints as before. A resync loses the missed delta's moments, as a reconnect does today.
- **"Deltas keep today's ids"** (the paper's "Not in Phase 11"). Ids are the worker's. D4 never renames, re-issues or invents one, so the dropped idea "a card into a hidden zone comes back as a new card" doesn't return by the side door.
- **P11-R1.** Nothing visible changes. The jump check and one clip prove it.
- **P11-R5 / R7.** Measured before and after, on the same machine (below). A measure that gets worse is reported with its numbers.
- **TEST-012.** No player clicks anything new, so no new click test is owed. The real-game recovery test below plays like one.
- **FMT-005.** Deltas are per connection and per seat, so four seats would need nothing new.

## Hidden information (P11-R4)

**How a delta is made, per seat.** A connection's delta is `BoardDelta.diff(base, board)`, where:

- `base` is the board **this connection** was last sent, which is this seat's own board (or, on a spectator's connection, the public view) as the worker stripped it (`HiddenIds`), with pictures added;
- `board` is this seat's new board, made the same way.

No other seat's board, the stored board of another seat, or anything from the game itself is ever an input. The base is kept per **connection**, so a spectator's stream holds only public views, and a player's two tabs each hold that player's own boards.

**Why it can't carry more than the full board would** (INFERENCE, proven by the gate below). The delta is a function of (base, board) only, and both are boards this connection was or would be sent whole. Anything the page learns from it, it would have learned from the full board next to the one before. "Card:7 is gone from the stack" is what two full boards say too. Every id in a delta is in `put` (so in the new board), in `drop` (so in the base) or in `order` (so in the new board). That's the paper's rule: "a delta may name a card id only if the seat's previous view or its new view names it". Its size depends on those two views alone, so compression (D2) leaks no more than it does today. Nothing here decides visibility (`MATCH_STATE_VISIBILITY.md`).

**The gate, in CI. The format change doesn't ship without it:**

1. **Lab half, every Lab game, every seat and the public view.** A new `scripts/check-deltas.py` runs in the Lab job over every trace, after the games. For each seat's stream and the public stream it rewrites the boards as the server would send them (full board first, deltas after, the checkpoint at each new turn, the epoch rule, D3's trimming), then:
   - (a) rebuilds every board as the page does and requires **0 mismatches** with the worker's board;
   - (b) requires every card id in every delta to be named by that stream's base or new board;
   - (c) writes the rebuilt traces to a folder.

   The existing hidden checks then run over that folder exactly as they run over the worker's traces: `check-snapshot-first`, `check-hidden-hands`, `check-hidden-log`, `check-hidden-tops`, `check-hidden-mulligans` (P11-R4's five), plus `check-kinds` and `check-wording.py --res`, as D3 ran them over its trimmed traces. Each must pass with the **same counts** as over the worker's traces (D3's proof: 11,818 hand-card sightings, 22,806 play log lines). **P11-B4's `check-hidden-information.py`** runs in CI first (B4), and its trace goes through `check-deltas.py` the same way.
2. **The Python model is held to the server's code.** Lab games never pass through the Arena Server, so the Lab half reads a Python copy of the server's rule. Shared fixtures keep the copies the same: `protocol/fixtures/delta/` holds board sequences from three Lab traces (a big combat, Karn's restart, a hand bounce whose id is stripped mid-game) and the deltas the server's `BoardDelta` makes from them. The Kotlin test, the page's vitest and `check-deltas.py --self-test` must each produce and apply the same deltas, as `protocol/fixtures/` already does for the infrastructure messages.
3. **Browser half, every browser game in CI, with the real server.** `PROXIC_TEST_DELTA_CHECK` is on in the CI stack, so every delta any CI browser game sends carries `whole`. The shared `e2e/match-helpers.ts` fixture fails a test whose page logged `DELTA_MISMATCH`. For a seat, the full board **is** the worker's stripped view, so "rebuilt equals full" means the page held nothing more than the worker allowed.
4. **HID-004: the gate must be seen running.** `check-deltas.py` prints how many deltas it made per stream and fails on a game with boards but no deltas. The browser fixture records how many deltas each page applied, and `match-deltas` (below) requires more than zero on both seats and, once switched on, the spectator. A gate that compared nothing would pass, and this makes that visible.

**Bites (TEST-004).** Each of these must make the gate fail:

- the server's base taken from the other seat's stored board (one-line mutant);
- the spectator's base taken from seat 1's board;
- `drop` keeping the id of an item that only moved;
- the checkpoint's memory reset removed (one Lab trace, Krark's hand bounce: a stripped id must still match).

## The desync proof

The rebuilt board must equal the full board, **always**, checked three ways:

- **Unit:**
  - `BoardDeltaTest` (server): 300 random board pairs built from the fixtures (cards added, moved, changed, removed, reordered, keys appearing and going) round-trip exactly;
  - each "full board instead" rule has its own test;
  - `apply(base, diff(base, board)) == board` for every board of the three fixture traces.
  
  The page's `delta.test.ts` does the same in TypeScript.
- **Lab, in CI:** `check-deltas.py`'s 0 mismatches over every board of every trace, every seat and the public view.
- **Browser, in CI:** the test-only **send-both switch** (`PROXIC_TEST_DELTA_CHECK`, above) over every browser game.

**What a mismatch means in a live game** (production, no `whole`). It can't be seen there, because there's nothing to compare against. That's why decision 1's net stays:

- a delta that doesn't follow → resync;
- the once-per-turn checkpoint puts right any drift that a delta which did follow could have carried;
- `PROXIC_MATCH_DELTAS=false` turns the whole thing off without a new build.

## When a full board is sent

| Moment | What the connection gets | Why |
|---|---|---|
| Join, reconnect, reload, a second tab | the stored board, whole, with the whole play log (as today) | a new connection has no base |
| Karn's restart (new `gameEpoch`) | the new game's first board, whole | the base belongs to a game that no longer exists |
| A new turn (`turn` changed) | that board whole, history lists whole too | decision 1's checkpoint (open question 1) |
| The page asks (`MATCH_RESYNC`) | the stored board, whole, with the whole play log, then the pending question and `MATCH_ASKING` | a delta didn't fit |
| A delta no shorter than the board | the board | never send more than today |
| Deltas off (server switch, page didn't ask, spectators while off) | every board whole (D3's trimming still applies) | the fallback |
| A board older than the base | that board whole, not remembered | D3's rule; the page drops it but keeps its log lines |

## Revisions

- A delta says `from` (the base's `stateRevision`) and `to` (the new board's). The page applies it only when its base has that `gameEpoch` and that `stateRevision`. Revisions rise but aren't consecutive for a seat, so "follows" means "builds on what I have", never "`to` is `from` + 1".
- A full board is taken at any time, unless it's older than the base (the existing §6.41 check). It becomes the new base.
- The page never edits the base. `MATCH_STEP`'s moves apply to the board shown only.
- A page waiting for a resync drops deltas. Questions arrive and are shown as today, and the resync answer sends the pending question again after the board. An answer clicked meanwhile meets the server's `STALE_STATE` check as it would today.

## Spectators (decision 2)

Spectators use the same code on the public view: their own `BoardStream` per connection, fed only `MatchHub.spectate`'s public boards. It's built and tested in this spec, behind `PROXIC_SPECTATOR_DELTAS` (default off).

**"Proven"** means:

- the players' deltas have shipped in a release;
- CI's gate has passed on every run since;
- the server's log on the live site shows no resync request over the owner's games in that release.

Then the switch's default flips to on (and the Unraid compose file needs nothing). When that happens is open question 2. Until then a spectator's page asks with `?deltas=1` and is sent full boards, exactly as today.

## Measuring (P11-R5, P11-R7)

Before is the build just before this spec, after is this spec's build, on the owner's PC as C1, with bundled Chromium. The measuring kit runs with `PROXIC_TEST_DELTA_CHECK=false`, 3 runs each.

| Measure | Target | How |
|---|---|---|
| Median bytes per update per seat, as the page reads them (snapshot or delta), before compression | **≤ 10% of today's full board.** Lab: ≤ 338 bytes against 3,384 (all 432 traces) and ≤ 567 against 5,674 (fixed 16). Real game: ≤ 10% of D1's whole-game median board (11.8-12.2 KB), and reported against the after-D3 board of the same day (9.3-9.7 KB) | `scripts/measure-wire.py` (its "simple delta" columns become this format; p95 and largest too); D1's real-game measure (`tools/measure/wire.ts`, counting `MATCH_DELTA` as an update) |
| Bytes on the wire after D2's compression | reported per update and per game, and **not worse** than before; expected a small cut (INFERENCE: deflate's window already removes most repetition) | D2's `wire.ts` `tap` relay; `measure-wire.py` "streamed" column |
| Messages per game, per combat | unchanged (one delta per board) | D1's counts |
| Arena Server CPU per board sent | **not worse** than before, within the runs' spread (D3: 2.6-5.2 ms) | D1's `serverCpuMs` |
| Server memory per connection | measured and reported (the base board held) | a heap reading in the measure's game |
| Page: time in the message handler, and the redraw measure | not worse (D0: parse and handler under 1 ms a moment) | C1's redraw measure and D0's timeline (both learn `MATCH_DELTA`) |
| Full boards sent per game, by reason | reported (join, turn, epoch, size, resync); **0 resyncs** in every CI game | the server's log, counted by the measure |

## Tests

| ID | Test | Evidence |
|---|---|---|
| F-0117-A | `BoardDeltaTest` (server): random round-trips, every full-board rule, an older board left out of the memory, a resync resetting both memories, one delta per distinct base. The id rule: every id in a delta is in its base or its new board | unit |
| F-0117-B | Shared fixtures `protocol/fixtures/delta/`: Kotlin, vitest and `check-deltas.py --self-test` produce and apply the same deltas | unit, three languages |
| F-0117-C | `delta.test.ts` (page): apply; unchanged items are the same object; `MATCH_STEP` never touches the base; a delta that doesn't fit sends one `MATCH_RESYNC` and drops deltas until a full board; a malformed delta does the same; a full board is taken at any time; `whole` compared and `DELTA_MISMATCH` logged on a planted difference | unit |
| F-0117-D | **P11-R4 Lab gate in CI:** `check-deltas.py` over every Lab trace, every seat and the public view (0 mismatches, the id rule, a delta count per stream), then the hidden checks over the rebuilt traces with the same counts as over the worker's, including B4's `check-hidden-information` trace | real games (Lab), CI |
| F-0117-E | **P11-R4 browser gate in CI:** every browser game with the send-both switch; any `DELTA_MISMATCH` fails the test; the number of deltas applied is recorded | browser, CI |
| F-0117-F | **`match-deltas.spec.ts`** (new real game). Taps, a cast with a target and a combat. Then: the host reloads, the guest's socket is cut and reconnects, the host opens a second tab, a new turn begins (the checkpoint seen), and a test relay drops one delta so the page asks and recovers (a forced resync). After each, both pages' rebuilt boards equal the server's whole board, both seats applied more than zero deltas, and the resync is in the server's log. With the server's `from` check broken (a mutant image), the forced resync step fails | browser, real game |
| F-0117-G | Karn's restart: `match-karn` (existing) runs with the send-both switch; game 2's first board is whole on both seats and deltas resume after it | browser, real game |
| F-0117-H | Spectators: `match-watching` with `PROXIC_SPECTATOR_DELTAS` on (send-both, more than 0 deltas applied by the spectator) and off (full boards only, as today) | browser |
| F-0117-I | Switch off: one run of `match-deltas` with `PROXIC_MATCH_DELTAS=false` plays to the end with full boards only (D3's trimming still on). A page without `?deltas=1` gets full boards | browser |
| F-0117-J | Looks identical (P11-R1): the jump check over the traces with moves and history, both seats, with whole boards and with `JUMPS_DELTAS=1` (boards played into the page as deltas through `applyDelta`): `check-jumps.py`'s reports identical line for line; one normal-speed clip of a big combat, compared by eye with before | jump tool, clip |
| F-0117-K | `scripts/check-test-switch.py` knows `PROXIC_TEST_DELTA_CHECK` (fails if production files mention it; fails if the CI and local overrides stop naming it) | script, CI |
| F-0117-L | The measures above, 3 runs before and after, in the As built | measure (RUN) |

**TEST-004 (bites):**

- server: the `from` check removed; the epoch and turn rules removed; the base taken from the stored board instead of the connection's (each fails F-0117-A or F-0117-F);
- page: the base edited by `MATCH_STEP`; a dropped item left in place; `order` ignored (each fails F-0117-C, and the first also F-0117-E);
- the HID bites listed under "Hidden information".

That's about half a dozen of each, within TEST-004's norm.

**Per spec, locally (TEST-013):**

- `check-deltas.py` and the hidden checks over the 1.75.0 run's traces;
- `match-deltas`, `match-history`, `match-dice`, `match-modes-doing`, `match-status-list`, `match-ability-menu`, `match-session`, `match-watching`, `match-karn` and `notices`, then `node ci/ci-speed.mjs` on the new and changed specs;
- tsc/eslint/prettier/vitest and the server gate;
- the jump check (F-0117-J).

The full Lab and browser suites run in CI.

## Tests and tools that read `MATCH_SNAPSHOT` frames or replay full boards

From the D4 row, checked against the code at 6b31d0fa (SOURCE):

| Test or tool | What it does with boards | How it keeps working |
|---|---|---|
| `match-dice`, `match-modes-doing`, `notices` | route the match socket, clone the last board and send it again (`WholeBoards`) | `WholeBoards.take` learns `MATCH_DELTA`: it rebuilds as the page does and hands the page a whole `MATCH_SNAPSHOT`. The page takes full boards at any time, so the specs are unchanged |
| `match-status-list` | routes the socket and rewrites each `MATCH_SNAPSHOT` (`filled`) | adopts `WholeBoards` so it rewrites whole boards; otherwise the next delta would build on a board the server never sent |
| `match-ability-menu` | reads each board's `battlefield` to know the host's cards | reads them through `WholeBoards` (read only) |
| `match-history` | `WholeBoards`; checks each new connection's first board is whole | unchanged: a new connection's first board is still a whole `MATCH_SNAPSHOT`. Its trimmed-board count now counts trimmed snapshots and deltas |
| `match-session` | the first frame after a reconnect is `MATCH_SNAPSHOT`, before `DECISION_REQUEST` | unchanged (a reconnect gets a full board) |
| `match-record` | reads the game record's **worker** frames | unchanged: the worker-to-server leg doesn't change |
| `production` | collects `MATCH_SNAPSHOT` states off the live site's socket | collects through a `WholeBoards` so deltas are rebuilt; run against the live site after the release |
| `match-away` | routes the socket to cut it | unchanged (reconnect = full board) |
| `tools/jumps/jumps.spec.ts` | replays the Lab's full boards into the page | unchanged (full boards accepted); new `JUMPS_DELTAS=1` mode plays them as deltas (F-0117-J), beside D3's `JUMPS_HISTORY_ONCE` |
| `tools/measure/wire.ts`, `timeline.ts`, `timeline-probe.ts`, `redraw.spec.ts` | count and join board messages by type | learn `MATCH_DELTA` as a board message; the bench (`benchScenes.ts`) feeds full boards, unchanged |
| About 50 page tests (`fixes00NN*.test.tsx`, `match.test.ts`, `fromSnapshot.test.ts`, the `.round.json` fixtures) | feed `MATCH_SNAPSHOT` into the reducer | unchanged: full boards are always taken |
| Lab scripts, hidden checks, the ledger | read the worker's traces | unchanged; they also run over the rebuilt traces (F-0117-D) |
| `scripts/measure-wire.py` | rebuilds Lab boards as the page does (D3) | its delta columns become this format, with `historyMismatches` joined by a delta mismatch count |

## Out of scope

- **Field-level diffs inside a card.** Only if the measured median misses 10%.
- **P11-C2.** The page reading only what changed. D4 hands it unchanged cards as the same object; `asSnapshot`, `boardFromSnapshot` and `keepCards` still run over the whole board here.
- **P11-D5, bundles.** One delta per board, as one board per message today.
- **P11-D6, slow links.** A per-connection queue, skipping deltas to one full board for a connection far behind. D4's full-board-on-demand is the piece D6 builds on. **Trigger (PHASE-004):** D6 starts.
- **The lobby socket** (P11-E10 decides separately).
- **The worker.** Its output and the Lab traces stay whole (as in D3).

## Decisions only the owner can make

**Answered 2026-11-23 (owner, by prompt):** 1. the once-per-turn checkpoint stays, every turn (A); 2. spectators: built in this spec, switched off, switched on in the next release once the players' version has run live with no resync lines in the server log (A); 3. a re-sent table shows nothing to the player (A).

Asked as prompts (ESC-001), each with a game example. The technical choices are made above, with reasons: the message shape, the per-connection base, card-level items, the resync's answer, the switches' names, the test-only send-both check, and the "never bigger than the board" rule.

**1. Keep the once-per-turn checkpoint?**
At the start of every turn each page is sent the whole table once, even though nothing went wrong. Example: turn 7 begins; Alice's and Bob's screens each get the whole table. If a hidden bug had left Bob's screen showing his Forest untapped when it's really tapped, it's put right at the start of turn 7 at the latest. Without the checkpoint it stays wrong until he reloads (or the next "doesn't fit"). The cost is one whole table per turn per player, which is small once compressed, and measured in the build.
- **A. Keep it, as decided on 2026-11-19 (recommended).** A cheap net for the one kind of error the numbering can't catch.
- B. Drop it: whole tables only on join, reconnect, a new game and on request. CI's checks would be the only guard.
- C. Less often: every fifth turn.

**2. Spectators: when do they switch on?**
Carol watches Alice and Bob. Today her page gets the whole table on every update; she sees no difference either way.
- **A. Built in this spec, switched off; switched on in the next release, once the players' version has been live for one release with no "asked for the whole table" lines in the server's log (recommended).**
- B. Built and switched on in this same release, once CI's checks pass.
- C. Not in this spec: a follow-up spec later, and spectators stay on whole tables until then.

**3. What does a player see if their table has to be resent?**
This should only happen through a bug. Example: Bob's page gets an update that builds on a table it doesn't have. Within a fraction of a second it asks for the whole table and gets it.
- **A. Nothing (recommended).** The table carries on. At worst a card that changed in the missed update appears in its new place without its little animation, for example Bob's Forest turns sideways without the tap glide.
- B. A quiet "Catching up…" in the act button for that moment, like the catch-up sign the owner chose for a stall (decision 5, Q3). It needs a canvas (P11-R1).
- C. A short report window saying the table was refreshed.

## Amendments

None.
