# Lobby Architecture

**Required by PHASE_05 §5.224.** How a room works: who owns what,
what is persisted, and what happens when things go wrong.

The one sentence that explains most of the decisions below: **the
server is the room.** The browser renders what it is told and
predicts nothing (§5.132). Every rule lives in `RoomService`, inside
the transaction that does the writing, because a rule enforced in a
route is a rule the next route forgets.

---

## Room identity

A room is a `UUID`, and that is all it is.

**There is no join code.** PHASE 5 AMENDMENT 1 removed it: join codes
exist so strangers can find each other, and Arena has no
self-registration (§3.106) — the owner creates every account, so
there are no strangers. What went with the code: collision handling,
secure generation, regeneration, attempt throttling, code-error
privacy and code redaction in logs. They were all solving problems
the code itself created.

A room id is **not** a capability. Knowing one gets you nothing: the
only way into a room is an invitation the server recorded (below),
and a non-member asking about a room gets the same 404 as somebody
naming an id that was never issued.

---

## Joining: presence and invitations

AMENDMENT 2. The host sees who is signed in and clicks a name.

```text
host clicks a name   →  INVITE          (server records it)
invited player       →  INVITED         (a prompt, not a seat)
they accept          →  INVITE_ACCEPT   (server SPENDS the record)
everybody in the room →  ROOM
```

The server-side record is the load-bearing part. Without it,
accepting would need only a room id — and a room id passed from one
user to another is a join code with extra steps. The invitation is
**consumed**, so it admits you once.

Invitations are in memory and live five minutes, because owner
decision D2 limits them to users who are online. After a restart
there are no connections, so there is nobody an invitation could
still be reaching.

An invitation is forgotten when the room fills, when it closes, when
it expires, or when either party disconnects.

Still forbidden, and not loosened by the amendments: friends, friend
requests, a social graph, public invite URLs, and **any directory of
rooms** (§5.13). The presence list shows accounts that are connected
right now and nothing about them beyond a display name.

---

## Membership and seats

`room_member`, keyed `(room_id, user_id)`.

- **One room at a time** (§5.5), enforced by the database rather than
  a check-then-insert, because two tabs racing would both pass a
  check.
- **Several sessions are one player** (§5.6). Opening a second tab is
  not a second member and does not announce an arrival.
- **A seat is a position, not an identity** (§5.26). Seat 1 today and
  seat 2 tomorrow is the same person; the identity is `user_id`.
- Joining takes the next free seat (§5.27). Never a chosen one.
- The last seat is taken under `SELECT ... FOR UPDATE`, so two people
  clicking at the same moment serialise and the second sees a full
  room (§5.22).

Membership is **persisted and independent of the WebSocket**. A
dropped connection does not remove anybody (§5.61); it only makes
them not-present.

---

## Host authority

Exactly one host per room: whoever created it (§5.15). The host is
also a player and occupies a seat (§5.16).

| The host may | The host may not |
| --- | --- |
| invite | choose another user's deck |
| remove a participant | mark another user ready |
| set the player count | act as another participant |
| prepare the match | bypass Deck Depot authorization |
| close the room | |

The right-hand column is enforced by the **shape of the endpoints**,
not by a check: `PUT /api/rooms/{id}/my-deck` has no field for whose
deck it is, so §5.44 cannot be expressed, let alone attempted.

**Host departure ends the room** (§5.18). Phase 5 implements no host
transfer, so a host leaving is the end of that room rather than a
succession puzzle.

---

## Presets

Server-authoritative, and there is exactly one: `OPEN_FORMAT_1V1`
(FMT-001, owner decision 2026-10-15).

No endpoint accepts a preset id. `GET /api/match-presets` says what
exists, so a browser holding a stale list is corrected rather than
believed (§5.94), and §5.220's "reject an unsupported preset" holds
by construction: there is nowhere to submit one.

**Two-Headed Giant is unreachable** (§5.221). It is not in the
catalog, there is no way to ask for it, and the player count is
bounded at 2 in the service and by a CHECK in the schema.

---

## Deck selection

Each player chooses their own, from the Phase 4 library: decks they
own plus decks shared with them (§5.41).

`DeckAuthorization.canUseDeck(userId, deckId)` is **the only deck
question** (§5.42, carry-forward C5). It is computed from the database
on the asking, which is what makes §5.51 work: a share revoked a
second ago is already false. It does not decide format legality — a
deck you may use can still be an illegal deck.

A deck id you do not hold is not a key to anything: the refusal is
identical to the one for a deck that does not exist (§5.43), so a
member cannot probe which deck ids are real.

### Privacy — what the table sees

§5.46, §5.47 and §5.140, and this was wrong at first:

```text
your own seat        deck id + deck NAME
everybody else's     deckSelected: true | false
```

The snapshot is built **per viewer**. The first version sent one
payload to everybody carrying every member's deck id and name; §5.140
forbids exactly that ("do not return one overbroad payload to all
clients when deck information differs by viewer") and §5.47 says
another participant does not need an opponent's deck display name. A
deck name is the title of a private object in somebody's Deck Depot,
and it may be a deck a third party shared with them.

Deck **contents** never travel at all.

### When access changes underneath a room

§5.50, §5.51. Three triggers, and all of them clear the selection
*and* the readiness that rested on it:

| Trigger | What happens |
| --- | --- |
| share revoked | that recipient's seat is cleared; everyone else keeps theirs |
| deck deleted | every seat holding it is cleared, in every active room |
| preparation | `canUseDeck` is asked again for every seat (§5.93) |

The members are told, rather than finding out when the host cannot
start the match.

A deck deletion also has a **database backstop** (`V009`): a trigger
clears readiness before the foreign key nulls the selection. Without
it the two constraints collided — `ON DELETE SET NULL` wrote a row
that `room_member_ready_needs_deck` rejected — and the owner's Deck
Depot delete failed outright.

---

## Readiness

Server-authoritative, and yours alone to change (§5.57).

- Ready requires a deck (§5.41), enforced in the service **and** by a
  CHECK constraint, so "ready with no deck" is unrepresentable rather
  than merely unlikely.
- Readying re-checks `canUseDeck` rather than trusting the choice
  made a minute ago.
- Readiness is cleared by: changing your own deck (§5.59), a material
  room change such as the player count (§5.60), losing access to your
  deck, a failed preflight for your deck (§5.98), cancelling a
  preparation (§5.117), and **a server restart** (§5.198).

---

## Presence

In memory, never persisted (§5.120). Presence is connection state;
after a restart there are no connections, so everybody is correctly
disconnected without anything having to write that down.

Announced on a user's **first** connection and **last** disconnection,
not per tab (§5.6).

Presence is also a precondition for preparing a match (§5.92): a
player who closed their tab cannot answer Forge's first prompt.

---

## Realtime

**One socket: `/ws/user`** — the authenticated connection Phase 3
built (carry-forward C3). §5.66 permits following project
conventions, and the reason to take that permission is that
authentication and the 30-second revalidation already live there. A
second socket would reimplement both, and one of them would drift.

There is **no `/ws/rooms/{roomId}`**, which is why §5.215's "direct
room socket attack" has nothing to attack.

Client vocabulary: `PING`, `INVITE`, `INVITE_ACCEPT`,
`INVITE_DECLINE`, `CHAT`, `REACT`. Everything else is server-to-client. See
`LOBBY_PROTOCOL.md`.

Chat is AMENDMENT 3: one global ephemeral channel, memory only,
bounded length, rate limited, sender identity from the session.
Nothing stores it and nothing survives a restart.

---

## Room state machine

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

`CLOSED` and `EXPIRED` are terminal. Both end the memberships and
invalidate any unconsumed setup; the room row survives as a record
until the sweep removes it.

While `READY_FOR_MATCH`, ordinary configuration is blocked (§5.116).
Cancelling is the way back.

---

## Optimistic concurrency

Every mutation bumps `room.revision`. A client may send
`expectedRoomRevision`, and a mismatch is `409 ROOM_REVISION_STALE`
rather than a silent overwrite (§5.136, §5.137).

It is checked **inside the transaction, after the row lock**, which
is the only place the answer cannot go stale between the check and
the write.

Leaving and closing deliberately do **not** take one. They are
statements of intent, not edits to state: "I want out" does not stop
being true because somebody else changed their deck while you
clicked.

---

## Persistence

PostgreSQL, always (§5.118). The authoritative room is never only in
memory.

```text
room                  identity, host, preset, count, status, revision, activity
room_member           seat, selected deck, ready
match_setup           the frozen snapshot (see MATCH_SETUP_CONTRACT.md)
match_setup_player    its seats
```

In memory, and only in memory: presence, pending invitations, chat.

Persisted rooms are why a server restart, a browser refresh and a
network blip do not destroy a lobby (§5.119).

---

## Expiration

Owner decision D4: **24 hours of inactivity**.

Activity is joining, leaving, configuring, selecting a deck, readying
or a host action (§5.124). **A browser holding a socket open is not
activity** — that is why `last_activity_at` is written by those
operations and never by the heartbeat. Two people idling in a room
all night have an abandoned room with tabs open.

An hourly sweep expires them, ends the memberships, invalidates any
unconsumed setup and tells whoever was in it. Finished rooms are
removed after seven days — a diagnostics window, not an archive
(§5.126).

Unlike the session sweep, this one is **not housekeeping**: nothing
else expires a room, so if it stopped running, abandoned rooms would
stay joinable forever. The honest cost is that a room can outlive its
24 hours by up to one sweep interval.

---

## Recovery

What a restart puts right, before the routes open:

| | |
| --- | --- |
| rooms, members, configuration, deck selections | **kept** (§5.119, §5.120) |
| presence | everybody disconnected, automatically — it never left memory |
| readiness | **reset** (§5.198) |
| an unconsumed prepared setup | **invalidated**, room back to `OPEN` (§5.122, §5.213) |

Readiness is reset because "ready" is a claim about a person who is
watching, and after a restart nobody is — every socket died with the
old process. A table showing itself ready, in front of two people who
have gone to bed, is the state this prevents.

A restart is **not** activity, so it does not extend a room's life. A
server bounced nightly must not keep dead rooms alive forever.

---

## See also

- `LOBBY_PROTOCOL.md` — the wire: routes, events, fields, codes
- `MATCH_SETUP_CONTRACT.md` — the Phase 6 handoff
- `DECK_AUTHORIZATION.md` — `canUseDeck`, from Phase 4
- `docs/operations/troubleshooting/LOBBY.md` — when it misbehaves
- `docs/history/phases/phase-05/PHASE_05_LOBBY_GAME_ROOMS_MATCH_SETUP_LOCKED.md` — the specification and its four amendments
