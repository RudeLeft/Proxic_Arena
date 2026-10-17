# Phase 5 Exit Gate

**Status: PASSED LOCALLY — 2026-10-17.**
**One criterion outstanding: P5-Y, the production run, which is the
owner's to perform.**

Two signed-in players find each other in a presence list, one hosts
and invites the other by clicking their name, both choose a deck
from the Deck Depot, both ready up, and the host freezes a validated
match setup. No match starts — that is Phase 6's.

```text
325 server tests      0 skipped  0 failed
 73 frontend tests               0 failed
 37 browser tests                0 failed
 19 scripted acceptance checks   0 failed
ESLint, Prettier, ktlint, detekt   clean
```

**25 of 26 acceptance tests pass.** Evidence:
`docs/research/phase-05/ACCEPTANCE_LOCAL.md`.

---

## §5.231 Exit criteria

| Criterion | Result |
| --- | --- |
| authenticated users can create rooms | **YES** |
| authenticated users can join rooms by short code | **AMENDED** — AMENDMENT 1 removed codes; joining is by invitation |
| room identity and join code are separate | **VOID** — there is no code |
| room membership is server-authoritative | **YES** |
| each user occupies one seat | **YES** — `UNIQUE (room_id, seat_number)` |
| one user cannot occupy multiple active rooms | **YES** — `PRIMARY KEY (room_id, user_id)`, P5-D |
| room capacity is enforced atomically | **YES** — `FOR UPDATE`, P5-F |
| host permissions are enforced | **YES** — P5-G |
| only Phase-0-supported presets are exposed | **YES** — one, and no endpoint accepts a preset id |
| unsupported 2HG cannot be selected | **YES** — P5-I |
| users can select owned/shared decks | **YES** — P5-J, P5-K |
| `canUseDeck` is enforced server-side | **YES** — inside the writing transaction |
| private deck data is not leaked to opponents | **YES** — per-viewer snapshot, P5-M |
| share revocation invalidates affected selection | **YES** — P5-N (this was broken; see below) |
| ready state is server-authoritative | **YES** — P5-O |
| disconnect does not delete membership | **YES** — P5-P |
| reconnect restores authoritative room state | **YES** — P5-P |
| room WebSockets require authentication and membership | **YES** — P5-R; there is no per-room socket |
| room state survives server restart safely | **YES** — P5-Q (this did not exist; see below) |
| stale rooms expire | **YES** — hourly sweep, owner D4 |
| Forge performs supported pre-match validation | **YES** — `BUILD_DECK`, P5-T |
| Arena does not implement Magic legality rules | **YES** — only Open Format's own bounds, per amended §2.45 |
| host can prepare a valid setup | **YES** — P5-U |
| `READY_FOR_MATCH` creates an immutable snapshot | **YES** — P5-U |
| no Forge match is started in Phase 5 | **YES** |
| `MATCH_SETUP_CONTRACT.md` is complete | **YES** |
| production multi-user workflow succeeds | **NOT RUN** — P5-Y, owner's host |
| old Arena remains unchanged | **YES** — P5-Z |
| Deck Builder remains unchanged | **YES** — P5-Z |
| Forge remains clean | **YES** — pin matches `/api/version` |
| documentation matches actual behaviour | **YES** |

---

## What the checklist audit found

The §5.228 checklist was walked against the code, not from memory.
Four items were implemented-but-unreachable or outright wrong. All
four are fixed, and each now has a test that would have caught it.

**1 — `RoomDeckWatch` was called by nothing.** The class that
enforces §5.51 existed, was tested, and no production path invoked
it. A revoked share left the recipient sitting in a lobby, ready,
with a deck they could no longer use; they would have found out when
the host pressed Prepare.

**2 — deleting a deck somebody was ready with failed outright.** Two
constraints each correct alone: `selected_deck_id ON DELETE SET
NULL`, and `CHECK (NOT ready OR deck IS NOT NULL)`. Together, the
foreign key wrote a row the CHECK rejected and the `DELETE` failed.
The owner's Deck Depot delete returned 500 and the deck could not be
removed. Found by trying it against the real schema rather than
reading the DDL.

**3 — there was no restart recovery at all.** §5.198 wants readiness
conservatively reset; §5.213 wants an unconsumed setup invalidated.
Neither existed. A restart left a table showing itself ready in front
of two people who had gone to bed, and a prepared setup frozen for
players who were all gone.

**4 — the room snapshot leaked every member's deck id and name to
everybody.** §5.47 says another participant does not need an
opponent's deck display name; §5.140 forbids "one overbroad payload
to all clients when deck information differs by viewer". The
snapshot is now built per viewer. An end-to-end test I had written
was asserting the leak as though it were the feature.

---

## The same mistake, three times

Findings 1 and 3 are one failure in two costumes: **code that exists,
is tested, and is never called.** The Phase 3 gate found the first
instance — `purgeExpiredSessions()` and `LoginThrottle.evictExpired()`
were both written, both tested, and neither was ever invoked.

It happened again during this gate, in front of me. `RoomRecovery`
was written, tested, and the edit that wired it into `Application.kt`
aborted on an assertion before writing. Nothing failed: an unused
class compiles perfectly, and 324 tests stayed green. **P5-Q caught
it**, because P5-Q restarts a real container and looks at the
database afterwards.

A fourth instance turned up while writing this section:
`ChatLimiter.evictIdle()` had no caller either, while its own
comment claimed it was called by the session sweep.

The lesson is not "be careful". It is that a unit test proves a
function does what it says, and proves nothing about whether
anything calls it. The checks that caught these were end-to-end ones
that drove the running system — plus, finally, a deliberate grep for
call sites across every public function in `room` and `lobby`.

This is now **AGENTS TEST-010**, the one rule this phase added.

---

## Amendments

Four, each recorded in the locked phase document rather than edited
quietly into the phase text.

| | What |
| --- | --- |
| **1** | **No join codes.** They exist so strangers can find each other, and Arena has no self-registration — the owner creates every account. Collision handling, regeneration, attempt throttling and code redaction went with them. |
| **2** | **Presence and invitations** are the joining mechanism. Still forbidden: friends, a social graph, public invite URLs, and any directory of rooms. |
| **3** | **One global ephemeral chat channel.** Memory only, bounded, rate limited, escaped. No moderation or retention, which is only safe because every account is created by hand. |
| **4** | **One lobby page**: presence, chat, host, the room, and the Deck Depot inline. Presentation only — every rule about seats, authority, readiness and deck validation is unchanged. |

---

## Owner decisions

| | Decision |
| --- | --- |
| **D1** | No join codes; presence, invitations and chat instead (amendments 1–4). |
| **D2** | Invitations reach **online users only**, so an invitation is a message rather than a stored object with five states. |
| **D3** | One global ephemeral chat channel. |
| **D4** | Rooms expire after **24 hours of inactivity**. A held socket is not activity. |

---

## What this phase learned the hard way

**A frame is backed by a buffer the writer consumes.** One
`Frame.Text` handed to several connections gave everyone after the
first an *empty* frame, silently. The everyday shape of that is a
player with two tabs seeing nothing in the second one.

**A closed peer is not a quiet peer.** The Phase 3 socket treated
both as "nothing happened", so a dead connection spun the loop,
re-queried the session every pass, and never reached its own
cleanup — leaving a departed user online forever. Found by a Phase 5
presence test waiting for a departure that never came.

**Two correct constraints can be jointly wrong.** See finding 2. The
DDL read perfectly; the behaviour was a 500.

**An end-to-end test can assert a bug as though it were a feature.**
My own `match-setup.spec` asserted that the host could see the
guest's deck name. It passed, for months of elapsed session time,
while the server leaked.

**A test's second run finds what the first one hides.** The deck that
could not be deleted only surfaced because the test ran again and met
its own leftovers.

---

## Unresolved

- **P5-Y has not been run.** Until it is, "works on the host" is
  untested for this phase.
- ~~**`/api/version` cannot say what is deployed.**~~ **RESOLVED.**
  Carried unresolved from the Phase 3 and Phase 4 gates. The build
  identity is now the first line of the startup log, is reported by
  `/api/version`, and is an OCI label `docker inspect` can read with
  nothing running. A local build says `dev`, or the commit plus
  `-dirty` when the shell supplies it.
- **Authentication events are still not logged as events** —
  deferred at the Phase 3 gate.
- **No storage quotas.** Carried from Phase 4.
- **Rooms can outlive 24 hours by up to one sweep interval.**
- **Invitations and chat do not survive a restart** — deliberate.
- **One unexplained browser-suite failure.** `match-setup.spec`
  failed once in a full run and passed in four subsequent ones,
  alone and together. The trace was overwritten before I read it,
  so this was **not diagnosed**. The most plausible cause —
  selecting a deck by "first in the list", which depends on what an
  earlier spec file left behind — has been removed; both players
  now pick by name. If it recurs on CI, the trace will be kept.
- **A live match's effect on room expiry is undecided.** Today a room
  in a match would still be swept after 24 idle hours. Phase 6's.

---

## What Phase 5 did not build

Any gameplay. No Forge match is started, no game state exists, no
cards are drawn. Also absent: spectators, ranking, matchmaking, a
public room directory, friends, voice or video, chat moderation or
retention, host transfer, a room-level ban list, three- or
four-player formats, and Two-Headed Giant.

---

## Next

`PHASE_05_DELIVERABLES.md` for the §5.230 record, and
`docs/research/phase-05/ACCEPTANCE_LOCAL.md` for the evidence.

**Before Phase 6 opens:** the owner runs P5-Y on the production host
— two accounts, one room, invitation, decks, ready, prepare — and
records the result here.

Phase 6 (Forge Match Runtime) is **not** started automatically.
