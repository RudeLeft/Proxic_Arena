# Phase 5 Deliverables

PHASE_05 §5.230. The 39-item record, in the order the section asks
for it. Where a document already covers something in depth, this
points at it rather than restating it badly.

---

## 1. Summary of implementation

Authenticated rooms with server-authoritative membership, seats,
deck selection and readiness; presence and invitations in place of
join codes; one global ephemeral chat channel; and a validated,
frozen match setup handed to Phase 6. No match is started.

Four owner amendments reshaped the phase before a line was written:
join codes are gone, presence and invitations replace them, there is
a chat channel, and the lobby is one page.

```text
server     net.barnflix.proxic.room       rules, persistence, setup, sweeps
           net.barnflix.proxic.lobby      the socket's half: presence, invites, chat
frontend   lobby.ts                       the lobby as data, UI-free
           LobbyPage.tsx                  one page (AMENDMENT 4)
```

## 2. Phase 5 database migration

`V006__rooms.sql` — `room`, `room_member`, `match_setup`,
`match_setup_player`.

Three more followed, each from a defect rather than a plan:

| | |
| --- | --- |
| `V007` | `match_setup_player.display_name` — §5.111 requires the snapshot; V006 did not have it |
| `V008` | releases decks held by **invalidated** setups |
| `V009` | trigger: deleting a deck clears readiness before the FK nulls the selection |

## 3. Final room schema

```text
room_id              UUID PK
host_user_id         UUID NOT NULL → app_user      RESTRICT
preset_id            TEXT NOT NULL                 OPEN_FORMAT_1V1
desired_player_count INTEGER NOT NULL              CHECK BETWEEN 2 AND 8
status               TEXT NOT NULL                 CHECK OPEN|READY_FOR_MATCH|CLOSED|EXPIRED
revision             BIGINT NOT NULL DEFAULT 1
created_at           TIMESTAMPTZ
last_activity_at     TIMESTAMPTZ                   §5.124, owner D4
```

**No `join_code` column.** AMENDMENT 1.

## 4. Final membership schema

```text
room_id, user_id     PRIMARY KEY (room_id, user_id)
seat_number          UNIQUE (room_id, seat_number), CHECK > 0
team_id              NULL in Phase 5 (§5.38 forbids inferring one later)
selected_deck_id     → imported_deck   ON DELETE SET NULL
ready                BOOLEAN
joined_at            TIMESTAMPTZ

CONSTRAINT room_member_ready_needs_deck
    CHECK (NOT ready OR selected_deck_id IS NOT NULL)
```

One row per user per room, enforced by the key rather than by a
check-then-insert, because two tabs racing would both pass a check.

## 5. Final prepared-match schema

`match_setup` + `match_setup_player`. Full field-by-field account in
`docs/architecture/MATCH_SETUP_CONTRACT.md`.

The guarantee Phase 6 needs:

```sql
CREATE UNIQUE INDEX match_setup_one_ready_per_room
    ON match_setup (room_id) WHERE status = 'READY';
```

## 6. Join-code generation rules

**None. AMENDMENT 1 removed join codes.**

Deleted with them: collision handling, secure generation,
regeneration, attempt throttling, code-error privacy and code
redaction in logs — all of them solving problems the code created.
A room id is not a capability; an invitation the server recorded is
the only door.

## 7. Room-state machine

```text
                prepare-match
   OPEN ──────────────────────────► READY_FOR_MATCH
      ◄──────────────────────────
             cancel-preparation
      │                                    │
      │ host closes / host leaves          │ restart
      ▼                                    ▼
   CLOSED                               OPEN (setup invalidated)

   OPEN ──── 24h inactive ───► EXPIRED
```

`CLOSED` and `EXPIRED` are terminal; both end memberships and
invalidate any unconsumed setup.

## 8. Host authority rules

May: invite, remove a participant, set the player count, prepare,
cancel preparation, close. May not: choose another user's deck, ready
another user, act as another participant, bypass Deck Depot
authorization.

The second list is enforced by the **shape of the endpoints** — there
is no field for whose deck — and a body that invents one is ignored
(P5-S).

Host departure ends the room (§5.18). No host transfer in Phase 5.

## 9. Seat-assignment rules

The next free seat, never a chosen one (§5.27). A seat is a position,
not an identity (§5.26). The last seat is taken under
`SELECT ... FOR UPDATE`, so two simultaneous claims serialise (P5-F).

## 10. Supported match-preset catalog

One: `OPEN_FORMAT_1V1`, served by `GET /api/match-presets`.

No endpoint accepts a preset id, so §5.220 holds by construction.
Two-Headed Giant is not in the catalog, cannot be requested, and the
player count is bounded at 2 in the service and by a CHECK (P5-I).

## 11. Player-count rules

Two, for Open Format. `PUT /rooms/{id}/player-count` exists because
§5.35's rule — never shrink below the seats already occupied — is far
easier to write now than to remember when a preset with a range
arrives. A material change clears readiness (§5.36).

## 12. Deck-selection authorization flow

```text
PUT /rooms/{id}/my-deck  →  inside ONE transaction:
                            lock the room
                            check revision (if given)
                            canUseDeck(session user, deckId)
                            write, clear readiness, bump revision
```

`canUseDeck` is the only deck question (§5.42, carry-forward C5),
computed from the database on the asking. A deck you do not hold is
refused identically to one that does not exist (§5.43).

## 13. Viewer-specific deck privacy behavior

```text
your own seat        deckSelected + selectedDeckId + selectedDeckName
every other seat     deckSelected
```

Built per viewer, by one `RoomView` serving both the HTTP response
and the socket message so the two cannot drift. Deck contents never
travel. §5.46, §5.47, §5.140; evidence P5-M.

## 14. Ready-state rules

Yours alone to change. Requires a deck, in the service and by a CHECK
constraint. Re-checks `canUseDeck` rather than trusting the earlier
choice.

Cleared by: your own deck changing, a material room change, losing
access to your deck, a failed preflight for your deck, cancelling a
preparation, and a server restart.

## 15. Presence/reconnect behavior

In memory, never persisted (§5.120). Announced on a user's first
connection and last disconnection, not per tab (§5.6).

A dropped socket does **not** remove anybody (§5.61). Reconnecting
asks `GET /api/rooms/current` and is also sent the room on connect,
so a refresh lands you back where you were (§5.119, P5-P).

## 16. Room expiration behavior

24 hours of inactivity (owner D4). Activity is joining, leaving,
configuring, selecting a deck, readying or a host action — **a held
socket is not activity**. Hourly sweep; finished rooms purged after
seven days (§5.126).

Not housekeeping: nothing else expires a room, so a room can outlive
its 24 hours by up to one sweep interval and no longer.

## 17. Server-restart recovery behavior

| | |
| --- | --- |
| rooms, members, configuration, deck selections | kept |
| presence | everybody disconnected, automatically |
| readiness | reset (§5.198) |
| an unconsumed prepared setup | invalidated, room back to `OPEN` (§5.122, §5.213) |

Runs before the routes open. A restart is not activity, so it does
not extend a room's life. Evidence P5-Q.

## 18. Lobby HTTP API routes

Nine room routes plus four for match setup and presets. Full table
with bodies, statuses and error codes in
`docs/architecture/LOBBY_PROTOCOL.md`.

**There is no join route.**

## 19. Lobby WebSocket protocol

`/ws/user`, the authenticated socket from Phase 3 (carry-forward
C3). Client vocabulary: `PING`, `INVITE`, `INVITE_ACCEPT`,
`INVITE_DECLINE`, `CHAT`. Thirteen server event types. There is no
per-room socket, so §5.215 has nothing to attack. Full account in
`LOBBY_PROTOCOL.md`.

## 20. Room revision/concurrency design

Every mutation bumps `room.revision`. `expectedRoomRevision` is
optional; a mismatch is `409 ROOM_REVISION_STALE`. Checked **inside
the transaction, after the row lock** — the only place the answer
cannot go stale before the write.

Leaving and closing deliberately do not take one: they are statements
of intent, not edits to state.

## 21. Forge preflight implementation

Two halves, split on the Forge boundary by the amended §2.45:

```text
Open Format bounds   PROXIC    60-65, max 4 copies, no sideboard
deck construction    FORGE     BUILD_DECK, no game started
```

Forge's `DeckFormat.Constructed` has no maximum deck size and permits
a sideboard, so those bounds cannot be delegated. Everything from the
first untap step remains Forge's.

**No §5.97 conflict.** The Phase 2 worker already answers
`BUILD_DECK` without starting a game. The cost is a JVM per deck
(~611 MB, ~2.8 s), paid once per preparation and outside every
database lock. It **fails closed** when no worker is configured.

## 22. Final `MATCH_SETUP_CONTRACT.md`

`docs/architecture/MATCH_SETUP_CONTRACT.md`. Complete, including what
Phase 6 must re-check and the atomic claim that stops one setup
launching two matches.

## 23. Create/join test results

P5-A, P5-B, P5-C, P5-D, P5-E — all pass. Joining is by invitation
(AMENDMENT 1); the deviation is recorded in the acceptance document.

## 24. Capacity-race result

P5-F passes: two concurrent claims on the last seat, exactly one
seated, the other refused `ROOM_FULL`.

## 25. Deck authorization results

P5-J, P5-K, P5-L pass. Owned and shared decks are selectable; a deck
id you do not hold is refused `422 DECK_NOT_USABLE`, identically to
one that does not exist.

## 26. Deck privacy result

P5-M passes. The host's view of another seat contains neither the
deck id nor the name; the raw body does not contain the deck id at
all.

## 27. Share-revocation invalidation result

P5-N passes. Selection and readiness both clear for the recipient;
the owner's own seat is untouched.

## 28. Reconnect result

P5-P passes. A closed socket leaves the membership intact; the page
recovers its room on reload.

## 29. Server-restart result

P5-Q passes, recorded in full in the acceptance document — including
the first run, which failed and exposed unwired code.

## 30. Forge-preflight test results

P5-T passes against a real worker. `MatchPreflightTest` pins the
Proxic half and the fail-closed behaviour; Phase 2's `CardResolver`
tests cover `BUILD_DECK` itself.

## 31. `READY_FOR_MATCH` test result

P5-U, P5-V, P5-W, P5-X pass: preparation freezes a two-seat snapshot,
preconditions refuse with per-seat attention flags, the prepared room
blocks ordinary mutation (`409` server-side, not merely a hidden
button), and cancelling returns it to `OPEN` with readiness reset and
deck choices kept.

## 32. Production multi-user browser result

**PASS.** Run by the owner on 2026-10-17, build `0299372`, two
accounts in two browsers through `proxic.barnflix.net`. All six
requirements, including realtime synchronization (the second player
saw the prepared state without refreshing) and deck privacy (each
player saw "deck chosen" on the other's seat, never the name).

## 33. Maximum-supported-player-count test

**Not applicable.** Open Format is two players (FMT-001). A
four-player request is refused `422` (P5-I).

## 34. Confirmation old Arena remained unchanged

`../Proxic_Arena_OLD`: no files modified. One pre-existing
uncommitted deletion, recorded at the Phase 4 gate and left alone by
owner decision (ISO-001).

## 35. Confirmation Deck Builder remained unchanged

`../Proxic_Deck_Builder`: no files modified, no uncommitted changes
(ISO-002).

## 36. Confirmation upstream Forge remained clean

Pin `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676` (forge-2.0.15),
matching `/api/version` on the running server. No tracked changes.
Arena does not depend on Forge at all; the worker does, behind a
process boundary (ARCH-001).

## 37. Any deviations

| | |
| --- | --- |
| Join codes | removed entirely (AMENDMENT 1). Four acceptance tests re-stated; `§5.200` void. |
| Presence + invitations | added (AMENDMENT 2), replacing §5.147's prohibition. |
| Chat | one global ephemeral channel (AMENDMENT 3), replacing §5.148's prohibition. |
| Lobby layout | one page (AMENDMENT 4), replacing the code-centred §5.151–§5.160. |
| Room socket | `/ws/user`, not `/ws/rooms/{id}` — §5.66 permits project conventions. |
| `ROOM_NOT_FOUND` | never reaches a client; the global 404 handler rewrites it (carry-forward C2). Stronger than specified. |
| Three/four players | not applicable (FMT-001). |

## 38. Any unresolved concerns

- ~~`/api/version` cannot say what is deployed.~~ **Resolved** —
  startup log, `/api/version` and an OCI label all carry the build
  identity, and a local build from uncommitted changes says
  `-dirty`.
- ~~Authentication events are not logged as events.~~ **Resolved** —
  §3.94–§3.97 implemented, with a test that proves no credential
  reaches the log.
- ~~No storage quotas.~~ **Not debt** — §4.128 says a quota system
  is not required at this scale. Carried in error.
- **Chat has no moderation or retention** — deliberate (AMENDMENT 3),
  and only safe because the owner creates every account by hand.
- **A room can outlive its 24 hours by up to one sweep interval.**
  Accepted; making it exact would put a clock in nine queries.
- **Invitations and chat do not survive a restart.** Deliberate
  (owner D2) and stated, but it is a thing to know.

## 39. Proposed requirements for Phase 6

1. **Claim a setup atomically.** `UPDATE ... SET status='CONSUMED'
   WHERE setup_id = ? AND status='READY'`, launch only on one row
   changed (§5.113).
2. **Re-check `canUseDeck` at launch.** Access can change between
   preparation and launch (§5.51).
3. **Fetch decks server-side by `deck_id`.** Never from the browser.
4. **Keep the seat numbers.** They are the topology the players
   agreed to.
5. **Typed object ids** — `card:51`, `stack:3` — per the Phase 0A
   binding constraint. A bare integer is ambiguous.
6. **Keep both duplicate defences** (ledger and single-slot
   clear-on-ask). Phase 0A measured 203 leaked answers with neither.
7. **Decide what a live match does to room expiry.** Today a room in
   a match would still be swept after 24 idle hours.
8. **Decide whether `CONSUMED` setups should keep blocking deck
   deletion.** Phase 5 says yes, as history; Phase 6 owns the
   question of whether a player can delete a deck they played with.

---

Phase 6 does **not** begin automatically (§5.230).
