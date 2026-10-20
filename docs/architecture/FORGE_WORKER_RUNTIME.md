# Forge worker runtime

PHASE_06 §6.178. The process that runs one Forge game. Written from
`forge-worker/`, `MatchWorker.kt`, the `Dockerfile` and
`forge-pin.properties`. No secrets are involved: the worker has no
database, no network, and no credentials.

---

## Pinned Forge

```text
forge.commit   4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
forge.release  forge-2.0.15
```

`forge-pin.properties` is the single source. The image build clones the
release tag and **fails if the tag does not resolve to the pinned
commit**. `/api/version` reports the commit the running server was built
with; the worker reports its own at startup and the server refuses a
mismatch (below).

**Patches:** one, owner-approved, applied at image build only
(`forge_patches/0001-leyline-last-known-state.patch`, AGENTS VEND-002,
`forge_patches/README.md`). The vendored checkout
`spikes/forge-phase0a/forge-upstream` is never edited (VEND-001);
`scripts/check-integrity.py` proves it matches the pin with no change.

## Build

Multi-stage `Dockerfile`, `worker` stage (Maven, Temurin 17):

1. clone the pinned Forge release, verify the commit;
2. `git apply` every `forge_patches/*.patch` (a patch that does not
   apply fails the build);
3. `mvn install` forge-core and forge-game;
4. `mvn package` the worker -- one shaded jar.

The runtime image carries `/app/forge/forge-worker.jar` and Forge's
resources at `/app/forge/res` (`PROXIC_FORGE_WORKER_JAR`,
`PROXIC_FORGE_RES`). The worker is built **once per image** and promoted
with it; nothing compiles on the host (docs/deployment/UPDATING.md).

## Launch

One process per match (§6.162), started by the server
(`MatchWorker.start`):

```text
java -jar /app/forge/forge-worker.jar /app/forge/res
```

stdout is the protocol; stderr goes to
`<dataRoot>/match-logs/<matchId>.log`. The worker opens **no network
socket** -- verified in its code and inside the production container
(P6-BL, `docs/testing/evidence/p6-bl-worker-privacy.md`).

## Internal protocol

Newline-delimited JSON over stdin/stdout. Every frame carries
`protocolVersion` (1), `type` and `messageId`. Never exposed to a
browser.

```text
server → worker                 worker → server
PING                            PONG
VERSION                         WORKER_READY  forgeCommit, forgeRelease, workerVersion,
                                              javaVersion, pid, resourcesUsable
VERIFY_RESOURCES                RESOURCES
RESOLVE_CARDS                   CARDS_RESOLVED      (import, Phase 2)
BUILD_DECK                      DECK_BUILT          (preflight, Phase 5)
START_GAME  matchId, players    GAME_STARTED        the running milestone
                                MATCH_SNAPSHOT      one per seat, per change
                                DECISION_REQUEST    authorisedSeat, actedForSeat, kind, options...
DECISION_RESPONSE               DECISION_ACCEPTED / ERROR DECISION_REFUSED
DECISION_SEARCH                 DECISION_OPTIONS
GAME_RESULT (diagnostics)       GAME_RESULT
                                GAME_ENDED          outcome, winningSeat, reason?, turn
SHUTDOWN                        SHUTTING_DOWN
                                ERROR               errorCode, detail
```

`START_GAME` carries each seat's display name and its deck as **card
names and printings**, resolved by the server from the stored import;
the worker never sees a deck id or the database (§6.107).

## Bootstrap and handshake

The worker sends `WORKER_READY` first. The server checks, before
anything else is believed (P6-AU, P6-AV):

- `protocolVersion` equals its own, else `WORKER_INCOMPATIBLE`;
- `forgeCommit` equals the pin, else `WORKER_INCOMPATIBLE` -- a worker
  built against another Forge would play a different game.

Then `START_GAME`. Forge loads its card database (~34,000 cards) from
the resources directory, builds both decks with the exact printings
asked for (P6-BD), and runs the pregame (mulligans, play or draw).

## Startup milestone and time budget

`GAME_STARTED` (the first priority window) turns the match `RUNNING`.

Pregame questions are **players' decisions, not startup** (§6.29):

- the worker's own budget (120 s, `proxic.startBudgetSeconds`) counts
  only while nobody is being asked;
- the server fails a start (`GAME_START_TIMEOUT`, 180 s) only on
  **silence with no question open**.

Measured: room setup to first question 12.9-13.9 s (P6-AY).

## Health

One reader thread per match pumps stdout and does nothing else -- a
slow consumer would fill the pipe and block Forge on its own output.
End of stream or process death raises `WorkerEvent.Stopped` →
`FAILED_RUNTIME` (MATCH_RUNTIME.md). Forge's own diagnostics go to the
match log; a question Forge asks that the adapter does not implement
**fails the match loudly** with the method named (`UnsupportedOperation
Exception: Forge asked for X`) and the counts of questions asked and
declined -- never a silent default (AGENTS STUB-002).

## Temporary directories

None per match. The worker writes nothing but its stderr log; the
runtime creates no other per-match files (§6.30, P6-BA).

## Shutdown

After `GAME_ENDED` or on abandon/failure the server stops the process
with `destroyForcibly` and waits up to 10 s: a JVM inside a Forge game is
not reliably interruptible. `MatchLauncherTest` proves no worker
outlives its match (mutation-tested). On a server restart the child dies
with its parent (MATCH_RUNTIME.md, P6-AZ).

## Crash behaviour

A worker killed mid-game takes only its own match: `FAILED_RUNTIME`, no
winner, room released, players told; other matches keep playing (P6-AX,
SIGKILL among three).

## Resource measurements (P6-AY, 2026-10-20)

```text
worker memory       824-940 MiB each      2.66 GiB for three matches
server memory       498 MiB
CPU to first question   19-21 CPU-seconds per worker
start to first question 12.9-13.9 s
```

Capacity planning: roughly 1 GiB per concurrent match on top of the
server.

## What the worker does not do

It does not decide legality, hide information on a client's behalf, or
answer for a player. Forge decides; the worker's `MatchController` asks
the player every question Forge asks a human (a port of Forge's own
`PlayerControllerHuman` where needed) and builds each viewer's snapshot
(MATCH_STATE_VISIBILITY.md).
