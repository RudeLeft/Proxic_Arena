# Match runtime

PHASE_06 §6.176. How a prepared room becomes a running Forge game and
how it stops. Written from the code (`server/.../match/`) and the
runs recorded in `PHASE_06_ACCEPTANCE_AUDIT.md`; where they disagree,
the code is right and this file is the bug.

Related: `MATCH_PROTOCOL.md` (the wire), `FORGE_WORKER_RUNTIME.md`
(the process), `MATCH_SETUP_CONTRACT.md` (Phase 5's input).

---

## Launch transaction

`POST /api/matches` with `{setupId}`, host only (`MatchLauncher`).

**One transaction, one conditional update.** Inside it, in order:

1. Load the setup and its room; a setup the caller may not launch and
   one that does not exist give the same answer (`SETUP_NOT_FOUND`).
2. Only the room's host may launch (`MATCH_HOST_REQUIRED`).
3. Revalidate everything §6.12 lists -- every seat's deck still exists
   and is still usable by that player, every account still active.
   A failure names the seat, not the reason (`LAUNCH_REVALIDATION_FAILED`).
4. **Claim the setup**: `READY → CONSUMED`, and continue only if that
   update changed a row. Reading the status and then updating is the
   race this is written to lose; two concurrent launches create exactly
   one match (P6-B, `two concurrent launches create exactly one match`).
   The loser is told `MATCH_ALREADY_LAUNCHED`, not "not found".
5. Insert `match` in `LAUNCHING` and one `match_participant` per seat,
   snapshotting each seat's deck name and display name.
6. Room `READY_FOR_MATCH → IN_MATCH`.

Starting Forge is **not** in the transaction. A JVM takes most of a
minute; holding a row lock across a process spawn would let §6.9's race
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

Enforced by the `match.status` CHECK. `ENDED` is the only status with a
Forge result; the others record **no winner** (§6.153). A late failure
cannot overwrite a real result (`a late failure cannot overwrite a real
result`).

## Room `IN_MATCH`

While a match is `LAUNCHING` or `RUNNING` its room is `IN_MATCH`:

- no lobby action can change it -- leave, close, ready, prepare are all
  refused (§6.152); "Abandon match" is the only exit;
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

The worker's stdout ending, the process dying, or a match that can no
longer be answered raises `WorkerEvent.Stopped`: `FAILED_RUNTIME`, no
winner, room released, both players told "The game stopped before it
finished. Nobody won it." Other matches are untouched -- one match per
process (P6-AW, P6-AX: a worker killed with SIGKILL among three).

A start that fails records `FAILED_STARTUP` with a code
(`WORKER_UNCONFIGURED`, `WORKER_MISSING`, `WORKER_UNREACHABLE`,
`WORKER_INCOMPATIBLE`, `GAME_START_TIMEOUT`) and gives the room back
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
- The only per-match file is the worker's stderr log,
  `<dataRoot>/match-logs/<matchId>.log`, kept for diagnosis (§6.155).
  The runtime creates no other per-match files (§6.30).
- Card artwork is served from the imported packages; nothing is
  copied per match.

## Measured (P6-AY, local stack, 2026-10-20)

Three matches at once: room setup to first question 12.9-13.9 s;
worker memory 824-940 MiB each (2.66 GiB for three); server 498 MiB;
19-21 CPU-seconds per worker to the first question.
