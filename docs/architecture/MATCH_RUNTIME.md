# Match runtime

PHASE_06 §6.176. How a prepared room becomes a running Forge game and
how it stops. Written from the code (`server/.../match/`) and the
runs recorded in `docs/history/phases/phase-06/PHASE_06_ACCEPTANCE_AUDIT.md`; where they disagree,
the code is right and this file is the bug.

Related: `MATCH_PROTOCOL.md` (the wire), `FORGE_WORKER_RUNTIME.md`
(the process), `MATCH_SETUP_CONTRACT.md` (Phase 5's input).

---

## Launch transaction

`POST /api/matches` with `{setupId}`, host only (`MatchLauncher`).

**One transaction, one conditional update.** Inside it, in order:

1. Load and lock the setup; one that does not exist is
   `SETUP_NOT_FOUND`.
2. Only the room's host may launch (`403 MATCH_HOST_REQUIRED`), asked
   before anything else so a non-host does not learn whether a setup is
   launchable.
3. Revalidate everything §6.12 lists -- the preset still offered, every
   seat's deck still exists and is still usable by that player, every
   account still active (`LAUNCH_REVALIDATION_FAILED`). A seat's failure
   names the seat and which of the three it is ("Pat's deck is gone"),
   never the detail behind it (§5.101); a withdrawn preset or an empty
   setup names no seat.
4. **Claim the setup**: `READY → CONSUMED`, and continue only if that
   update changed a row. Reading the status and then updating is the
   race this is written to lose; two concurrent launches create exactly
   one match (P6-B, `two concurrent launches create exactly one match`).
   The loser is told `MATCH_ALREADY_LAUNCHED`, not "not found".
5. Insert `match` in `LAUNCHING` and one `match_participant` per seat,
   snapshotting each seat's deck name and display name.
6. Room `READY_FOR_MATCH → IN_MATCH`.

Starting Forge is **not** in the transaction. A game takes seconds to
start (about 13 s measured, below); the server gives up only after 180 s
of silence with nobody being asked (a player's mulligan does not count,
`FORGE_WORKER_RUNTIME.md`), so there is no overall ceiling; holding a row lock across a process spawn would let §6.9's race
be decided by whoever's Forge loaded faster, and an HTTP request that
waited would be cut off by Cloudflare at 100 s. The route returns once
the match exists; `MatchRuntime` starts the worker on its own thread
and both players are told over their lobby sockets.

## Lifecycle

```text
LAUNCHING ──worker running──▶ RUNNING ──Forge result──▶ ENDED
    │                            │
    │ start failed               ├─worker died / unanswerable──▶ FAILED_RUNTIME
    ▼                            ├─server restarted───────────▶ FAILED_RUNTIME (SERVER_RESTARTED)
FAILED_STARTUP                   └─a participant abandoned────▶ TERMINATED
```

Abandon is accepted from `LAUNCHING` too (also `TERMINATED`). A
concession and spec 0054's "End the game" are Forge results: `ENDED`.

Enforced by the `match.status` CHECK. `ENDED` is the only status with a
Forge result; the others record **no winner** (§6.153). A late failure
cannot overwrite a real result (`a late failure cannot overwrite a real
result`).

## Room `IN_MATCH`

While a match is `LAUNCHING` or `RUNNING` its room is `IN_MATCH`:

- no lobby action can change it -- leave, close, readying, prepare are
  refused (§6.152; un-readying is accepted and changes nothing that
  matters); the match ends through the game: its own end, a concession
  (PHASE_07 §7.55), "End the game" for a player gone as long as the away
  setting (spec 0054), or "Abandon match" -- or an administrator closing
  the room from the Admin page, which abandons the match first
  (`ROOM_CLOSED` reason `CLOSED_BY_ADMIN`);
- it is still the players' room: a refreshed page is given it back, and
  neither player can host or join another room (`RoomStore.activeRoomOf
  (includeInMatch = true)`; fixed 2026-10-20, found by the live-site run);
- deck-access changes do **not** touch it -- the match was built from
  the decks as they were (P6-BC).

When the match stops, for any reason, the room goes back to **OPEN with
both players still seated and readiness cleared** (owner decision D4,
amending §6.151's "room closes").

## Participant mapping

Seat N in the room is seat N in the match, the Nth registered Forge
player, and the seat number in every snapshot, question and answer.
`match_participant (match_id, user_id)` is the primary key and
`(match_id, seat_number)` is unique. A WebSocket answer is attributed to
the seat of the **authenticated** user who sent it; nothing in the
message names a seat (P6-M, P6-N). Under Mindslaver the controlling
player answers the controlled player's questions -- Forge decides who
acts, and the worker routes by `authorisedSeat` (P6-U).

## Game epoch

Karn Liberated restarts the game inside the same match. The match id,
participants and processes are unchanged; `gameEpoch` goes from 1 to 2
on every snapshot and question. Decision ids keep rising, so no answer
from game 1 can be accepted in game 2 (P6-AD).

## Normal end

Forge reports a result; the worker publishes final snapshots to every
registered player, then `GAME_ENDED` with the winning seat and, for an
alternate win, Forge's own reason (Felidar Sovereign, Laboratory
Maniac). The server records `ENDED`, `result_summary`, `ended_at`;
stops the worker (`destroyForcibly`, 10 s); releases the room; tells
both players. Both pages show the result from their own side ("You won
on turn 9." / "Your opponent won on turn 9.") and the final board stays
visible (P6-BA, P6-AP).

## Runtime failure

The worker's stdout ending or the process dying raises
`WorkerEvent.Stopped`; a match that can no longer be answered ends with
the worker's own `GAME_ENDED` result `FAILED`. Either way:
`FAILED_RUNTIME`, no winner, room released, both players told "The game stopped before it
finished. Nobody won it." Other matches are untouched -- one match per
process (P6-AW, P6-AX: a worker killed with SIGKILL among three).

A start that fails records `FAILED_STARTUP` with a code
(`WORKER_UNCONFIGURED`, `WORKER_MISSING`, `WORKER_UNREACHABLE`,
`WORKER_INCOMPATIBLE`, `GAME_START_TIMEOUT`, `DECK_UNAVAILABLE`, or the
worker's own, such as `GAME_START_FAILED` and `DECK_UNRESOLVED`) and
gives the room back
(P6-AT).

## Ktor restart

**A running match does not survive a server restart, by design.** The
worker is a child process whose pipes live only in the server's memory;
when the server exits there is nothing to reattach to (§6.157's second
branch). `MatchRecovery` runs at startup: every `LAUNCHING` or
`RUNNING` match becomes `FAILED_RUNTIME` with `failure_code
SERVER_RESTARTED`, its room is released, and no worker survives.
Observed on a real restart under a running match (P6-AZ).

## Abandon

`POST /api/matches/{id}/abandon`, **any participant** -- the trapped case
is exactly the one where somebody's browser is gone. `TERMINATED`, no
winner, so there is nothing to gain by abandoning a game you are
losing.

## Cleanup

- The worker is stopped on every end path; `MatchLauncherTest`
  proves the process is gone (mutation-tested).
- Two files per match: the worker's stderr log,
  `<dataRoot>/match-logs/<matchId>.log`, kept for diagnosis (§6.155), and
  the server's game record, `<dataRoot>/match-records/<matchId>.jsonl.gz`
  (PHASE_07 §7.56, deleted after `PROXIC_MATCH_RECORD_DAYS`). Nothing else
  is created per match (§6.30).
- Card artwork is served from the imported packages; nothing is
  copied per match.

## Measured (P6-AY, local stack, 2026-10-20)

Three matches at once: room setup to first question 12.9-13.9 s;
worker memory 824-940 MiB each (2.66 GiB for three); server 498 MiB;
19-21 CPU-seconds per worker to the first question.
