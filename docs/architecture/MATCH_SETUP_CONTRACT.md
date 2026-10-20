# Match Setup Contract

**Required by PHASE_05 §5.110.** This is the explicit handoff:

```text
Phase 5 Lobby
        ↓
Phase 6 Match Runtime
```

Phase 5 produces a **match setup**: a frozen, validated statement of
who is playing what, in which seat. Phase 6 turns one into a running
match. Nothing else crosses this line.

---

## What a setup is

A snapshot of a room at the moment every player was ready. It is a
separate record from the room on purpose: the room keeps changing,
and a match must not be launched from a moving target (§5.102).

Phase 5 **never starts Forge** (§5.91). Preparation validates and
freezes; that is the whole of it.

---

## The record

`match_setup`, one row per preparation:

| Field | Meaning |
|---|---|
| `setup_id` | immutable identity (§5.103) |
| `room_id` | the room it was taken from |
| `source_room_revision` | the room revision it was taken AT (§5.111) |
| `preset_id` | `OPEN_FORMAT_1V1` — the only one (FMT-001) |
| `status` | `READY` / `INVALIDATED` / `CONSUMED` (§5.114) |
| `created_at` | when it was frozen |

`match_setup_player`, one row per seat:

| Field | Meaning |
|---|---|
| `user_id` | the permanent identity (§5.105) |
| `display_name` | **a snapshot**, not a join (§5.106) |
| `seat_number` | 1-based position, not an identity (§5.26) |
| `deck_id` | a reference, never a card list (§5.107) |
| `team_id` | null in Phase 5; Open Format has no teams (§5.38) |

### Two fields that are easy to get wrong

**`display_name` is captured, not joined.** §5.106 permits a setup to
keep the name it was prepared with even after the player renames
their account. A join to `app_user` would silently give the new one,
which is a different promise. The column was added in `V007` after
the §5.111 checklist named it and `V006` did not have it.

**`source_room_revision` is the staleness guard and the idempotency
key.** Preparing twice at the same revision is the same preparation
(§5.115), and a setup whose room has since moved on must not launch.

---

## What is NOT in it

§5.109, and this list is a prohibition rather than a summary:

```text
hands          battlefield    life totals
priority       turn number    the stack
```

Those are Forge's, from the first untap step onward. A setup says who
sits where with which deck, and stops.

Also absent, by §5.104: anything a browser sent. Every field is read
from server-authoritative rows inside the transaction that writes the
snapshot. A client that could supply a `deck_id` here would be
choosing what to launch.

---

## Validation that has already happened

By the time a setup exists, all of this was true **inside the
transaction that wrote it** (§5.92, §5.93):

```text
the requester was the host
the room was OPEN
the preset was still supported
every seat was filled
every member was connected
every member had selected a deck
canUseDeck was true for every selected deck
every member was ready
Open Format legality passed for every deck
Forge built every deck without unresolved cards
```

Phase 6 should still re-check what matters at launch. §5.93's own
rule — do not assume earlier validation is still valid — does not
stop applying at this boundary. In particular `canUseDeck` can become
false between preparation and launch (§5.51): a share revoked in that
window is revoked.

### Where the two halves of deck validation live

```text
Open Format bounds   →  PROXIC          60-65, max 4, no sideboard
deck construction    →  FORGE           BUILD_DECK, no game started
everything in play   →  FORGE           exclusively
```

The split is the amended §2.45's, not an invention here: Forge's
`DeckFormat.Constructed` has no maximum deck size and permits a
sideboard, so Open Format's bounds cannot be delegated to it. See
`OPEN_FORMAT.md` and AGENTS FMT-001.

**No §5.97 conflict exists.** The Phase 2 worker answers `BUILD_DECK`
without starting a game, which is the Forge-side preflight §5.96
asks for. The cost is a JVM per deck (~611 MB, ~2.8 s, Phase 0A), paid
once per preparation and outside every database lock.

---

## Lifecycle

```text
                prepare-match
   OPEN ──────────────────────────► READY_FOR_MATCH
      ◄──────────────────────────
             cancel-preparation
```

A setup is `READY` until something ends it:

| Event | Setup becomes | Room becomes |
|---|---|---|
| host cancels (§5.117) | `INVALIDATED` | `OPEN`, readiness reset |
| host closes the room (§5.79) | `INVALIDATED` | `CLOSED` |
| the room expires (§5.125) | `INVALIDATED` | `EXPIRED` |
| **Phase 6 launches it** | `CONSUMED` | Phase 6's |

`CONSUMED` is written by Phase 6 and by nothing in Phase 5. Nothing
in Phase 5 ever rewrites a `CONSUMED` row — that is a match that
happened, and tidying it would be falsifying history.

While a room is `READY_FOR_MATCH`, ordinary configuration is blocked
(§5.116). Cancelling is the way back.

### The guarantee Phase 6 needs

```sql
CREATE UNIQUE INDEX match_setup_one_ready_per_room
    ON match_setup (room_id) WHERE status = 'READY';
```

At most one live setup per room. §5.113 asks Phase 5 to provide the
foundation for preventing a double launch; this partial index plus
`setup_id` is it. **Phase 6 must claim a setup atomically** — a
conditional update from `READY` to `CONSUMED`, and launch only if it
changed a row. Reading the status and then updating is the race this
index cannot save you from.

---

## Endpoints

| Method | Path | Who |
|---|---|---|
| `POST` | `/api/rooms/{roomId}/prepare-match` | host |
| `POST` | `/api/rooms/{roomId}/cancel-preparation` | host |
| `GET` | `/api/rooms/{roomId}/match-setup` | members |
| `GET` | `/api/match-presets` | any signed-in user |

`prepare-match` answers one of three things:

- **200** with the setup and the room — frozen.
- **409 `SETUP_NOT_READY`** with a per-seat `needsAttention` flag.
- **403 / 404 / 409** for a host, room or revision problem.

### The privacy split in that 409

§5.100 and §5.101 divide one answer in two:

```text
to the HOST      which seats need attention        (HTTP response)
to the PLAYER    what is wrong with THEIR deck     (their socket)
```

The host never learns why another player's deck failed. That detail
is about a deck shared with that player, not with the table, and
Phase 4's sharing rules do not stop applying because a match is being
set up. Every member appears in the seat list, so the answer does not
reveal the roster by omission either.

Codes a player may receive about their own deck (§5.100):

```text
DECK_REQUIRED            choose one
NOT_READY                mark yourself ready
NOT_CONNECTED            reload the lobby
ACCESS_REVOKED           the deck is no longer yours to use
INVALID_FOR_PRESET       Open Format: which rule, in the detail
FORGE_RESOLUTION_ERROR   Forge could not build it
```

§5.99: these are application-level messages. No stack traces, no
filesystem paths, no raw Forge diagnostics reach a browser.

---

## Concurrency, and why preparation is three steps

The Forge preflight is slow — a JVM per deck. Holding a row lock
across it would freeze the lobby for seconds because somebody clicked
Prepare. So:

```text
1. locked    every cheap check; capture the revision
2. unlocked  the Forge preflight
3. locked    the revision must be UNCHANGED, then write
```

Step 3 is what makes step 2 safe. If anything moved the room while
Forge was thinking — somebody left, swapped a deck, was removed — the
preparation is refused as `ROOM_REVISION_STALE` rather than written
from facts that have since expired. §5.93 is honoured rather than
dodged: nothing checked in step 1 is trusted at step 3 without the
revision agreeing.

---

## What Phase 6 must do

1. **Claim atomically.** `UPDATE ... SET status = 'CONSUMED' WHERE
   setup_id = ? AND status = 'READY'`, and launch only on a row count
   of 1 (§5.113).
2. **Re-check `canUseDeck`** for every seat. Access can have changed
   (§5.51).
3. **Fetch decks server-side** by `deck_id`. Never from the browser
   (§5.107).
4. **Keep the seat numbers.** They are the match topology Phase 5
   agreed with the players.
5. **Use typed object ids** in its own protocol — `card:51`,
   `stack:3` — per the Phase 0A binding constraint. A bare integer is
   ambiguous between card and stack-instance id spaces.

**Done, 2026-10-20.** All five, as built: `MATCH_RUNTIME.md` (the launch
transaction, revalidation, the claim, seat mapping) and
`MATCH_PROTOCOL.md` (typed ids). Two concurrent launches create exactly
one match (P6-B); a revoked deck or a disabled player stops the launch
(P6-C).

---

## See also

- `PHASE_05_LOBBY_GAME_ROOMS_MATCH_SETUP_LOCKED.md` — §5.91–§5.117
- `PHASE_00_ACCEPTED_DECISIONS.md` — the Forge boundary and process model
- `OPEN_FORMAT.md` — the only play mode
- `PHASE_02_DECK_PACKAGE_IMPORT_LOCKED.md` §2.45 (amended) — who owns legality
