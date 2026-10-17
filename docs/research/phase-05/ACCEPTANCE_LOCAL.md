# Phase 5 acceptance — local pass

PHASE_05 §5.229. Run 2026-10-17 against the local Docker stack
(`docker-compose.yml` + `docker-compose.local.yml`), with a real
Forge worker answering the preflight.

**26 of 26 pass.** P5-Y was run by the owner on the production host
on 2026-10-17, build `0299372`; its record is in
`PHASE_05_EXIT_GATE.md`.

```text
325 server tests      0 skipped  0 failed
 73 frontend tests               0 failed
 37 browser tests                0 failed
 19 scripted acceptance checks   0 failed
ESLint, Prettier, ktlint, detekt   clean
```

How to re-run the scripted pass:

```bash
node scripts/phase5-acceptance.mjs http://127.0.0.1:8080
```

---

## Results

| Test | Result | Evidence |
| --- | --- | --- |
| P5-A Authenticated room creation | **PASS** | script |
| P5-B Join (by invitation — AMENDMENT 1) | **PASS** | script |
| P5-C Anonymous rejection | **PASS** | script |
| P5-D One active room per user | **PASS** | script |
| P5-E Duplicate session identity | **PASS** | script |
| P5-F Capacity race | **PASS** | `RoomServiceTest` |
| P5-G Host authorization | **PASS** | script |
| P5-H Supported preset enforcement | **PASS** | script |
| P5-I 2HG safety | **PASS** | script |
| P5-J Owned deck selection | **PASS** | `match-setup.spec` |
| P5-K Shared deck selection | **PASS** | script + `match-setup.spec` |
| P5-L Unauthorized deck rejection | **PASS** | script |
| P5-M Deck privacy | **PASS** | script + `RoomRoutesTest` + browser |
| P5-N Share revocation invalidation | **PASS** | script + `RoomRecoveryTest` |
| P5-O Ready-state integrity | **PASS** | script |
| P5-P Disconnect / reconnect | **PASS** | script + `lobby.spec` |
| P5-Q Server restart recovery | **PASS** | manual, recorded below |
| P5-R Protected room access | **PASS** | script |
| P5-S Identity spoof protection | **PASS** | script |
| P5-T Forge preflight | **PASS** | `match-setup.spec` + `MatchPreflightTest` |
| P5-U Prepare match | **PASS** | `match-setup.spec` |
| P5-V Prepare preconditions | **PASS** | script + `MatchSetupServiceTest` |
| P5-W Prepared-state lock | **PASS** | `match-setup.spec` |
| P5-X Cancel preparation | **PASS** | `match-setup.spec` + `MatchSetupServiceTest` |
| P5-Y Production multi-user workflow | **PASS** | owner, on the host |
| P5-Z Project integrity | **PASS** | below |

---

## The ones worth repeating

### P5-Q — server restart recovery

The test that caught a wiring failure nothing else did.

Set up a room with two members, both with decks, both ready, the
room `READY_FOR_MATCH` and a `READY` setup. Restarted the container.

**First run — FAILED.** Nothing changed: still ready, still
prepared, no recovery log line. `RoomRecovery` existed, compiled and
was tested, and `grep RoomRecovery Application.kt` returned nothing.
An edit script had aborted on an assertion before writing, so the
wiring was never applied — and an unused class compiles perfectly.

The same shape as the §5.51 finding below and the Phase 3 gate's
`purgeExpiredSessions`. Three times now.

**After wiring — PASS:**

```text
room recovery: 1 prepared setup(s) invalidated, 2 seat(s) un-readied

members      2    kept        §5.120
decks kept   2    kept        §5.120
still ready  0    reset       §5.198
room status  OPEN             §5.213
ready setups 0  / invalidated 1   §5.122
```

### P5-N — share revocation invalidation

The rule that was written, tested and unreachable.

A recipient selects a shared deck and marks themselves ready. The
owner revokes the share. The recipient's selection **and** readiness
clear, and the owner's own seat is untouched — a revocation is about
one person.

Before the audit this did nothing in production: `RoomDeckWatch` had
no caller. §5.51 says "a share revoked a second ago is already
false", and `canUseDeck` made that true for every *future* question
while saying nothing to the player already sitting in the lobby.

### P5-M — deck privacy

```text
the chooser's own view     deck id + deck NAME
every other member's view  deckSelected: true
```

The host's snapshot of the guest's seat contains neither the deck id
nor the name, and the raw response body does not contain the deck id
anywhere.

This was wrong at first: one payload went to everybody carrying
every member's deck id and name. §5.47 says another participant does
not need an opponent's deck display name and §5.140 forbids exactly
that shape. An end-to-end test I had written was asserting the leak
as though it were the feature.

### P5-T / P5-U — Forge preflight and prepare

Run against a stack with a real worker (`forgeWorker: ok`). Two
players, a shared 65-card deck, both ready; the host prepares;
`match_setup` is `READY` with two seats, each carrying a user id, a
seat number, a deck id and a captured display name.

No Forge match starts (§5.91). Preparation spawns a worker per deck
to run `BUILD_DECK` and shuts it down again.

The preflight **fails closed** when no worker is configured, which
`MatchPreflightTest` pins: a server that cannot check decks must not
launch matches with unchecked ones.

### P5-F — capacity race

Two users take the last seat concurrently; exactly one succeeds. The
loser is refused `ROOM_FULL`, not seated into a third seat.
`SELECT ... FOR UPDATE` is what makes this deterministic rather than
lucky.

### P5-Z — project integrity

```text
Forge pin        4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676  (forge-2.0.15)
                 matches /api/version on the running server
Proxic_Arena_OLD 0 files modified; 1 pre-existing uncommitted
                 deletion, recorded at the Phase 4 gate and left
                 alone by owner decision
Proxic_Deck_Builder  0 files modified, 0 uncommitted changes
```

---

## Deviations from §5.229 as written

Four tests describe a mechanism the amendments removed. Each is
recorded rather than quietly re-scoped:

| Test | As written | As run |
| --- | --- | --- |
| **P5-A** | "join code exists" | asserts the opposite: no code field anywhere in the snapshot (AMENDMENT 1) |
| **P5-B** | "User B enters the room code" | User B is invited and accepts; one member, one unique seat |
| **P5-G** | host-only list includes "regenerate code" | that endpoint does not exist; the other five are tested |
| **§5.200** | Regenerate-Code Test | void — there is no code to regenerate |

§5.219 (three/four player) is **not applicable**: Open Format is two
players (FMT-001), the player count is bounded at 2 in the service
and by a CHECK, and a 4-player request is refused `422`.

---

## What the audit found

The §5.228 checklist was walked item by item against the code rather
than from memory. Four items were implemented-but-unreachable or
wrong; all four are fixed and each has a test that would have caught
it:

1. **`RoomDeckWatch` was called by nothing** (§5.50, §5.51).
2. **Deleting a deck somebody was ready with failed outright** —
   `ON DELETE SET NULL` wrote a row the `ready ⇒ deck` CHECK
   rejected, so the owner's Deck Depot delete returned 500. Fixed in
   `V009` with a trigger, plus the application clearing selections
   first so the room is told.
3. **No restart recovery existed at all** (§5.120, §5.122, §5.198,
   §5.213).
4. **The room snapshot leaked every member's deck id and name to
   everybody** (§5.46, §5.47, §5.140).

A fifth turned up while writing the standing check itself:
**`ChatLimiter.evictIdle()` had no caller**, while its own comment
claimed it was "called by the same sweep as session cleanup". The
leak was one map entry per user who ever spoke — small, and small is
not the same as fixed. It now rides the hourly room sweep.

Three of these — 1, 3 and the chat limiter — are the same failure:
code that exists, is tested, and is never called. The Phase 3 gate
found the first instance. It is now **AGENTS TEST-010**, and the
audit that produced it was a grep for call sites across every public
function in `room` and `lobby`.
