# Lobby Protocol

**Required by PHASE_05 §5.225.** The wire: routes, socket events,
what a snapshot contains, and what the refusals mean.

Two rules run through all of it:

- **Identity is never a client claim** (§5.67). The server reads the
  session, never a field. A message may say *who to invite*; it can
  never say *who is inviting*.
- **Nothing in a message tells a client what it may DO.** A client
  learning it is the host is being told what to render, not what it
  is allowed to ask for. Every rule is re-checked server-side.

---

## Authentication

| | |
| --- | --- |
| HTTP | session cookie, plus `X-CSRF-Token` on every mutation (§3.51) |
| WebSocket | the same session cookie authenticates the upgrade (§3.78) |

`/api/rooms` and `/api/match-presets` are behind the same intercept as
`/api/decks` (carry-forward C4): `requireAuth`, then `csrfOk`, then
the principal is stashed. One gate, not two.

The socket re-validates the session **every 30 seconds** and ends the
connection when it has been revoked (§3.81).

---

## HTTP routes

All under `/api`. Every one requires a session.

### Rooms

| Method | Path | Who | Answer |
| --- | --- | --- | --- |
| `POST` | `/rooms` | any | `201` + room; optional body `{"name": "…"}` (PHASE_07 Amendment 9: one line, ≤ 40 characters, `422 INVALID_ROOM_NAME`) |
| `GET` | `/rooms/current` | any | `200` + room **or `null`** |
| `GET` | `/rooms/{roomId}` | members | `200` + room |
| `POST` | `/rooms/{roomId}/leave` | members | `200` + room |
| `POST` | `/rooms/{roomId}/close` | host | `200` + room |
| `DELETE` | `/rooms/{roomId}/members/{userId}` | host | `200` + room |
| `PUT` | `/rooms/{roomId}/my-deck` | members | `200` + room |
| `PUT` | `/rooms/{roomId}/ready` | members | `200` + room |
| `PUT` | `/rooms/{roomId}/player-count` | host | `200` + room |

**There is no join route.** AMENDMENT 1 removed join codes; an
invitation over the socket is the only way in. Since PHASE_07 §7.64
every room is LISTED (`ROOMS` below), so a room id is no secret; the
consumed invitation is what stands between the list and a seat.

### Match setup

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/rooms/{roomId}/prepare-match` | host |
| `POST` | `/rooms/{roomId}/cancel-preparation` | host |
| `GET` | `/rooms/{roomId}/match-setup` | members |
| `GET` | `/match-presets` | any signed-in user |

### Bodies

```jsonc
// PUT /rooms/{id}/my-deck    — null clears the selection
{ "deckId": "uuid | null", "expectedRoomRevision": 42 }

// PUT /rooms/{id}/ready
{ "ready": true, "expectedRoomRevision": 42 }

// PUT /rooms/{id}/player-count
{ "playerCount": 2, "expectedRoomRevision": 42 }
```

`expectedRoomRevision` is optional everywhere it appears (§5.136).
`DELETE` and `prepare-match` carry no body, so theirs rides in the
query string: `?expectedRoomRevision=42`.

There is **no field for whose** deck or readiness. That is how §5.44
is enforced — the host cannot assign a deck because the endpoint
cannot express it — and a body that adds one is ignored (§5.216).

---

## The room snapshot

```jsonc
{
  "room": {
    "roomId": "…",
    "name": "Kitchen Table",   // PHASE_07 Amendment 9; "<host>'s room" when unnamed
    "hostUserId": "…",
    "presetId": "OPEN_FORMAT_1V1",
    "desiredPlayerCount": 2,
    "status": "OPEN | READY_FOR_MATCH | CLOSED | EXPIRED",
    "revision": 42,
    "everyoneReady": false,
    "members": [
      {
        "userId": "…",
        "username": "…",
        "displayName": "…",
        "seatNumber": 1,
        "ready": false,
        "isHost": true,
        "deckSelected": true,
        "selectedDeckId": "…",      // viewer's own seat only
        "selectedDeckName": "…"     // viewer's own seat only
      }
    ]
  }
}
```

### Viewer-specific fields

§5.46, §5.47, §5.140. **The snapshot is built per viewer**, and the
HTTP response and the socket message are built the same way — from
one `RoomView`, so the two cannot drift.

```text
your own seat        deckSelected + selectedDeckId + selectedDeckName
every other seat     deckSelected
```

A deck **name** is the title of a private object in somebody's Deck
Depot, possibly one a third party shared with them. The table needs
to know a seat has decided; what it decided is the chooser's
business. Deck **contents** never appear here at all.

Never present, for anybody: session data, account security data,
deck contents, the Deck Depot share graph (§5.141).

### `revision`

The optimistic-concurrency token. Sent so a client can hand it back
on its next mutation; a client that does is told `409` rather than
silently overwriting a change it never saw.

It also lets a client ignore a stale snapshot: a page loading asks
`GET /rooms/current` while the socket delivers a `ROOM`, and those
two can land either way round.

---

## WebSocket

**`/ws/user`** — the authenticated connection from Phase 3. There is
no per-room socket, so §5.215's "direct room socket attack" has
nothing to connect to.

Every frame is a Phase 1 envelope:

```jsonc
{ "protocolVersion": 1, "type": "…", "messageId": "…", /* body */ }
```

A protocol-version mismatch fails loudly and is never interpreted
(§1.32).

### Client → server

| Type | Body | Notes |
| --- | --- | --- |
| `PING` | — | answered `PONG` |
| `INVITE` | `userId` | host only, into your own room |
| `INVITE_ACCEPT` | `roomId` | spends the invitation |
| `INVITE_DECLINE` | — | the host is told (`INVITATION_ENDED`) |
| `INVITE_WITHDRAW` | — | host only; the player is told (PHASE_07 Amendment 11) |
| `CHAT` | `text` | ≤ 500 chars, rate limited |

Anything else is answered `ERROR` / `UNKNOWN_TYPE`.

### Server → client

| Type | When | To whom |
| --- | --- | --- |
| `HELLO` | on connect | the connection |
| `PRESENCE` | on connect | the connection |
| `PRESENCE_JOINED` | a user's **first** connection | everyone else |
| `PRESENCE_LEFT` | a user's **last** disconnection | everyone else |
| `ROOM` | any room change | each member, **individually** |
| `ROOM_CLOSED` | closed, host left, expired | former members |
| `ROOM_REMOVED` | you were removed | that user |
| `INVITED` | you were invited (`roomId`, `roomName`, `from`); again on reconnect | that user |
| `INVITATION_SENT` | your invitation reached somebody (`roomId`, `to`); again on reconnect | the inviter |
| `INVITATION_ENDED` | an invitation stopped being one (`reason`, `direction`, `other`) | **both** sides |
| `ROOMS` | on connect, and on any room change | everyone |
| `PLAYERS` | on connect | the connection |
| `SETUP_PROBLEM` | your deck blocked preparation | **that player only** |
| `CHAT` | somebody said something | everybody |
| `ERROR` | a refusal | the asker |
| `SESSION_ENDED` | your session was revoked | the connection |

`ROOM` is sent **once per member**, not once to all of them, because
each member's copy names only their own deck.

`PRESENCE_JOINED` / `PRESENCE_LEFT` fire on first/last connection, not
per tab: §5.6 makes several sessions one player.

`ROOM_CLOSED` carries a `reason`: `HOST_LEFT`, `CLOSED_BY_HOST`,
`EXPIRED`. A client that meets an unfamiliar reason should say
something true and vague rather than show the code.

**PHASE_07 additions (§7.64, Amendments 9 and 11), additive only:**

- `ROOMS` is every room that is open, starting or in a match:
  `roomId`, `name` (the host's, or "<host>'s room"), `hostUserId`,
  `status`, `desiredPlayerCount`, `seats` (`seatNumber`, `userId`,
  `displayName`, `ready`, `isHost`) and `clearsAt` (null in a match).
  The same for every viewer, which is safe only because it carries
  **no deck and no invitation** (§7.68).
- `PLAYERS` is every active account (`userId`, `username`,
  `displayName`), online or not; presence says who is online.
- Invitations are **one at a time both ways** and have **no timer**.
  `INVITATION_ENDED.reason` is `ACCEPTED`, `DECLINED`, `WITHDRAWN`,
  `ROOM_CLOSED`, `SEAT_FILLED` or `OFFLINE` (gone for a minute; a
  reload is back inside it). `direction` is `FROM_YOU` for the host's
  copy and `TO_YOU` for the player's.

---

## Authorization, per answer

| Situation | Answer |
| --- | --- |
| not signed in | `401` |
| signed in, not a member | `404` — identical to a room that does not exist |
| member, not the host | `403 ROOM_HOST_REQUIRED` |
| malformed id | `400` — no real id has that shape, so saying so leaks nothing |

The `404` is **literal**. Carry-forward C2: the §1.44 handler rewrites
every 404 into one shape, so `ROOM_NOT_FOUND` never reaches a client
and "no such room" and "not yours" are byte-identical on the wire.

---

## Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `ROOM_NOT_FOUND` | `404` | no such room, **or** not yours |
| `ROOM_NOT_OPEN` | `409` | closed, expired, or locked by preparation |
| `ROOM_FULL` | `409` | every seat is taken |
| `ALREADY_IN_A_ROOM` | `409` | §5.5 — leave the current one first |
| `ALREADY_MEMBER` | `409` | you are already in that room |
| `ROOM_HOST_REQUIRED` | `403` | §5.17 |
| `ROOM_REVISION_STALE` | `409` | §5.137 — refresh and choose again |
| `DECK_NOT_USABLE` | `422` | §5.42, and the answer for a deck that does not exist |
| `DECK_REQUIRED` | `422` | §5.41 — ready needs a deck |
| `INVALID_ROOM_CONFIGURATION` | `422` | §5.35, unsupported preset, host removing themselves |
| `SETUP_NOT_READY` | `409` | §5.100 — with per-seat `needsAttention` |
| `INVALID_ROOM_ID` / `INVALID_USER_ID` / `INVALID_DECK_ID` | `400` | not a uuid |
| `INVALID_REQUEST` | `400` | the body is not the expected shape |

Socket refusals use the same codes in an `ERROR` frame, so a client
has one way of showing a refusal regardless of which door it came
through (§4.101).

Socket-only codes: `USER_NOT_ONLINE`, `CANNOT_INVITE_YOURSELF`,
`PLAYER_IN_A_ROOM`, `ONE_INVITATION_AT_A_TIME`, `PLAYER_ALREADY_INVITED`,
`INVITATION_GONE` (accepting one that has ended),
`MESSAGE_TOO_LONG`, `TOO_FAST`, `UNKNOWN_TYPE`.

### `SETUP_NOT_READY`, and who learns what

§5.100 and §5.101 split one answer in two:

```jsonc
// to the HOST, over HTTP — who, never why
{
  "errorCode": "SETUP_NOT_READY",
  "detail": "Not everyone is ready yet.",
  "seats": [{ "userId": "…", "needsAttention": true }]
}

// to EACH affected player, over their own socket
{ "type": "SETUP_PROBLEM", "errorCode": "DECK_REQUIRED", "detail": "Choose a deck." }
```

Every member appears in `seats`, so the answer does not reveal the
roster by omission. A host who could read the other player's reason
would be reading something about a deck shared with that player, not
with the table.

Per-player codes (§5.100): `DECK_REQUIRED`, `NOT_READY`,
`NOT_CONNECTED`, `ACCESS_REVOKED`, `INVALID_FOR_PRESET`,
`FORGE_RESOLUTION_ERROR`.

§5.99: these are application-level messages. No stack traces, no
filesystem paths, no raw Forge diagnostics reach a browser.

---

## See also

- `LOBBY_ARCHITECTURE.md` — why the model is shaped this way
- `MATCH_SETUP_CONTRACT.md` — the Phase 6 handoff
- `docs/operations/troubleshooting/LOBBY.md` — what to do when one of these shows up
