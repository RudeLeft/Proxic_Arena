# Proxic Arena Build Plan

# Phase 5 — Lobby, Game Rooms & Match Setup

**Status:** LOCKED  
**Phase Type:** Production feature  
**Depends On:** Completed, tested, and accepted Phase 4  
**Primary Goal:** Authenticated host/join rooms, deck selection, readiness, and validated match setup  
**Forge Match Execution:** NOT IMPLEMENTED IN THIS PHASE  
**Battlefield:** NOT IMPLEMENTED IN THIS PHASE  
**Gameplay:** NOT IMPLEMENTED IN THIS PHASE

---

## 5.0 Purpose

Phase 5 creates the multiplayer lobby system that sits between Deck Depot and the Forge match runtime.

The intended flow is:

```text
Authenticated User
        ↓
Lobby
        ↓
Create Room
or
Join Room by Code
        ↓
Authenticated Players
        ↓
Select Match Preset
        ↓
Select Authorized Decks
        ↓
Ready
        ↓
Server Validates Entire Setup
        ↓
READY_FOR_MATCH
        ↓
Phase 6
Forge Match Launch
```

Phase 5 must establish one authoritative server-side answer to:

```text
Who is in this room?

Which seat does each user occupy?

Which deck did each user select?

May that user use that deck?

Which supported match preset is selected?

Are all required players ready?

Is this setup valid enough to hand to the Forge match-launch phase?
```

Phase 5 does not start a Forge game.

It produces the stable validated match-setup contract that Phase 6 will consume.

---

## 5.1 Phase 5 Execution Gate

Do not begin Phase 5 implementation until:

```text
Phase 0 has been executed and accepted

Phase 1 has been fully implemented, tested, and accepted

Phase 2 has been fully implemented, tested, and accepted

Phase 3 has been fully implemented, tested, and accepted

Phase 4 has been fully implemented, tested, and accepted
```

Once those phases have been implemented and accepted, Phase 5 may rely on:

```text
authenticated Arena users

stable user IDs

authenticated HTTP requests

authenticated WebSocket identity

Phase 3 CSRF protection

Deck Depot ownership and sharing

canUseDeck(userId, deckId)

persistent normalized decks

Forge-resolved deck identities

the Phase 0 accepted Forge capability findings

the Phase 1 realtime/protocol foundation
```

If any required prior-phase capability is missing, incomplete, or materially inconsistent with its locked specification:

**STOP AND REPORT THE CONFLICT.**

Do not silently rebuild, bypass, or replace the earlier subsystem.

---

## 5.2 Phase Boundary

Phase 5 owns:

```text
room creation

room codes

room joining

room membership

host authority

player seats

supported match-preset selection

desired player count

deck selection

ready state

room realtime updates

reconnect to lobby

setup validation

Forge-backed deck/preset preflight where supported

creation of a READY_FOR_MATCH setup snapshot
```

Phase 5 does not own:

```text
starting a Forge match worker

constructing the live Forge Match/Game

turn progression

priority

combat

game decisions

battlefield state

match reconnect

winner detection

match termination
```

Those begin in Phase 6 or later.

---

## 5.3 Authenticated Users Only

Creating or joining a room requires:

```text
valid authenticated session
ACTIVE user
```

Anonymous users cannot participate in multiplayer rooms.

---

## 5.4 Arena User Is the Lobby Identity

Room identity comes from:

```text
authenticated session
        ↓
AuthenticatedUser.userId
```

Do not trust browser-supplied:

```text
user_id
username
display_name
role
```

as authoritative lobby identity.

---

## 5.5 One Room Membership Per User

A user may belong to at most one active pre-match room at a time.

If the user attempts to join or create another active room:

```text
ALREADY_IN_ROOM
```

or equivalent must be returned.

The user must explicitly leave or close the existing room first.

---

## 5.6 Multiple Browser Sessions Do Not Create Duplicate Players

The same authenticated Arena user may have multiple browser tabs or sessions.

They still represent:

```text
one Arena user
=
one room membership
=
one player seat
```

Do not create duplicate room participants for the same `user_id`.

---

## 5.7 Room Identity

Every room receives an immutable internal identifier.

Recommended:

```text
UUID
```

Conceptually:

```text
room_id
```

This is the permanent server/database identifier.

---

## 5.8 Join Code Is Separate From Room ID

Users should not need to type a UUID.

Each open room receives a short human-friendly join code.

Conceptually:

```text
room_id
=
d32c...

join_code
=
F7KM2Q
```

The room ID and join code are different concepts.

---

## 5.9 Join Code Format

Use a six-character uppercase code from an unambiguous alphabet.

Recommended alphabet:

```text
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

Avoid visually ambiguous characters such as:

```text
0
O
1
I
L
```

---

## 5.10 Join Code Generation

Join codes must be generated using a secure random source.

The server must guarantee uniqueness among active rooms.

If a collision occurs:

```text
generate another code
```

Do not derive room codes from:

```text
user ID
timestamp
database sequence
username
```

---

## 5.11 Join Code Is Not Authentication

The join code is a room locator/invitation mechanism.

It does not replace:

```text
Arena authentication
server authorization
room membership validation
```

Possession of a room code must never impersonate another user.

---

## 5.12 Join-Code Attempt Protection

Rate-limit repeated failed room-code attempts.

At the expected project scale, application-level throttling is sufficient.

Do not add Redis solely for room-code rate limiting.

---

## 5.13 No Public Room Directory

Phase 5 does not provide:

```text
Browse Public Games
Global Room List
Matchmaking Queue
Public Lobby Directory
```

Users join by receiving the room code from another user.

---

## 5.14 Room Creation

Provide an authenticated operation such as:

```text
POST /api/rooms
```

Creating a room:

```text
creates room_id

creates join_code

sets creator as host

creates host membership

assigns host a player seat

creates initial room configuration

returns current room snapshot
```

---

## 5.15 Host Identity

Every active room has exactly one host.

Conceptually:

```text
rooms.host_user_id
```

The creator becomes the host.

---

## 5.16 Host Is Also a Player

Phase 5 assumes the host occupies a player seat.

A spectator-only host is not required.

---

## 5.17 Host Authority

The host may:

```text
choose match preset

choose permitted player count

remove another participant

prepare the match setup

close the room
```

The host may not:

```text
choose another user's deck

mark another user ready

impersonate another participant

bypass Deck Depot authorization
```

---

## 5.18 Host Departure

If the host explicitly leaves the room before match launch:

```text
the room closes
```

All remaining members are removed from that active room.

Phase 5 does not implement automatic host transfer.

---

## 5.19 Host Disconnect Is Not Host Departure

A browser/network disconnect does not automatically close the room.

The host remains a member.

The room closes only when:

```text
host explicitly leaves

host explicitly closes room

room expires

later match lifecycle consumes/closes it
```

---

## 5.20 Join Room

Provide an authenticated join operation such as:

```text
POST /api/rooms/join
```

Request concept:

```json
{
  "code": "F7KM2Q"
}
```

The server obtains the joining user from authentication.

---

## 5.21 Join Must Validate

Before joining:

```text
room exists

room is OPEN

room code is valid

room is not full

user is ACTIVE

user is not already in another active room

user is not already a duplicate member
```

---

## 5.22 Full Room

If all configured player seats are occupied:

```text
ROOM_FULL
```

or equivalent must be returned.

Do not silently create additional seats.

---

## 5.23 Closed Room

Joining a:

```text
CLOSED

READY_FOR_MATCH

EXPIRED
```

room must fail.

---

## 5.24 Room Membership

Persist room members using stable user IDs.

Conceptually:

```text
room_members
├── room_id
├── user_id
├── seat_number
├── selected_deck_id
├── ready
├── joined_at
└── ...
```

---

## 5.25 Seat Identity

Every participant occupies exactly one logical player seat.

Recommended:

```text
seat_number
```

Use one documented numbering convention consistently.

---

## 5.26 Seat Is Not User Identity

Do not treat a seat number as permanent user identity.

A seat is match-local.

The permanent user identity remains:

```text
user_id
```

---

## 5.27 Automatic Seat Assignment

For ordinary free-for-all or one-on-one rooms, joining users should automatically receive the next available seat.

Manual seat selection is not necessary unless required by an accepted Forge-supported topology.

---

## 5.28 Match Presets

The host selects from a server-provided catalog of supported match presets.

Conceptually:

```text
CONSTRUCTED_1V1

COMMANDER_FFA

<other Phase-0-verified presets>
```

The exact final preset list must come from accepted Forge capability evidence.

---

## 5.29 Do Not Invent Unsupported Presets

Do not expose a preset merely because Magic supports it in theory.

A preset must be supported by the accepted Proxic/Forge architecture.

---

## 5.30 Two-Headed Giant

Do not expose Two-Headed Giant unless Phase 0 and the accepted Forge integration prove it is supported correctly.

Never approximate Two-Headed Giant using unrelated Forge rules.

---

## 5.31 Match Preset Catalog

Provide an authenticated or safe public configuration endpoint such as:

```text
GET /api/match-presets
```

Each preset should provide only information the UI needs.

Conceptually:

```json
{
  "id": "COMMANDER_FFA",
  "display_name": "Commander",
  "min_players": 3,
  "max_players": 4,
  "allowed_player_counts": [3, 4]
}
```

Actual values must come from accepted capability decisions.

---

## 5.32 Preset Is Server-Authoritative

The browser must not create arbitrary match configurations.

The client submits a known preset identifier.

The server validates it.

---

## 5.33 Desired Player Count

If a preset supports a range of player counts, the host selects the intended count within the preset's accepted values.

For fixed-count modes, the player count is fixed by the preset.

---

## 5.34 Room Capacity

Room capacity equals the configured desired player count.

The server does not infer capacity from how many users happen to join.

---

## 5.35 Cannot Shrink Below Occupied Seats

The host may not change player count to a value lower than the current number of members.

The host must remove participants first.

---

## 5.36 Configuration Changes Reset Ready State

A material room-configuration change must invalidate previous readiness.

Examples:

```text
match preset changes

player count changes

seat/team structure changes
```

After such a change:

```text
all player ready flags = false
```

---

## 5.37 Preserve Deck Selection When Safe

Changing the match preset does not need to automatically delete the selected deck ID.

However:

```text
ready state resets

deck access is revalidated

Forge preflight must be rerun
```

before the room can become ready again.

---

## 5.38 Team Assignment

If an accepted match preset genuinely requires teams:

```text
team identity
```

must be represented explicitly.

Do not infer teams from odd/even seats, join order, or browser assumptions.

---

## 5.39 No Team Feature Without Supported Mode

Do not build generic team assignment UI solely for hypothetical future modes.

Only implement it if an enabled Phase 5 preset needs it.

---

## 5.40 Deck Selection

Each room member selects their own deck.

Conceptually:

```text
PUT /api/rooms/{roomId}/my-deck
```

Request:

```json
{
  "deck_id": "..."
}
```

---

## 5.41 Deck Selection Uses Deck Depot

The selectable library for the current user is:

```text
owned decks
+
decks shared with that user
```

as defined in Phase 4.

---

## 5.42 `canUseDeck` Is Mandatory

Before recording the selected deck:

```text
canUseDeck(authenticatedUserId, deckId)
```

must return true.

---

## 5.43 Client Cannot Select Another User's Private Deck

Supplying a known or guessed private deck ID must not bypass authorization.

If:

```text
canUseDeck = false
```

selection fails.

---

## 5.44 Host Cannot Assign Another User's Deck

The host does not receive an administrative shortcut for deck selection.

Each user chooses their own deck.

---

## 5.45 Selected Deck Does Not Become Shared

Selecting a private deck in a multiplayer room does not:

```text
share the deck with opponents

give opponents Deck Depot access

allow opponents to browse its card list

grant permanent access
```

---

## 5.46 Lobby Deck Privacy

Other room members do not need the selecting user's full deck contents.

The room snapshot should expose only what is required for setup.

Recommended opponent-visible representation:

```text
deck_selected = true
```

rather than full deck contents.

---

## 5.47 Deck Name Privacy

By default, another participant does not need to see an opponent's deck display name.

The selecting user may see their own selected deck name in their personalized snapshot.

---

## 5.48 Server-Sanitized Room Views

Room snapshots may vary by viewer.

The server must build the safe representation.

Do not send sensitive deck information to every client and rely on React to hide it.

---

## 5.49 Viewer-Specific Snapshot

Conceptually, User A may receive:

```text
My seat:
Deck = "My Commander Deck"
```

while User B receives for User A:

```text
Deck selected = yes
```

This follows the project's broader server-side information-boundary principle.

---

## 5.50 Deck Access Can Change

A selected deck may become unusable after selection.

Examples:

```text
owner revokes a share

deck is deleted

user account becomes disabled

deck becomes otherwise inaccessible
```

Room state must not assume initial selection remains valid forever.

---

## 5.51 Deck Revocation Invalidates Readiness

If:

```text
canUseDeck(userId, selectedDeckId)
```

changes from true to false:

```text
the user is no longer ready

the selected deck must be cleared or marked invalid

READY_FOR_MATCH must be invalidated
```

---

## 5.52 Deck Deletion Invalidates Selection

Deleting a deck currently selected in an open room must make that room selection invalid.

Do not retain a dangling deck ID and later attempt to launch it.

---

## 5.53 Deck Depot Integration Hook

Implement a clean integration mechanism for deck deletion and share revocation to invalidate affected active-room selections.

Do not require a distributed message broker.

An in-process service/domain event plus database revalidation is sufficient.

---

## 5.54 Request-Time Revalidation

Even if integration events are used, all important actions must revalidate server-side state.

At minimum revalidate selected deck access when:

```text
player marks ready

room configuration changes

host prepares match

Phase 6 later launches match
```

---

## 5.55 Ready State

Each room member has a server-authoritative:

```text
ready
```

flag.

The user may toggle only their own readiness.

---

## 5.56 Ready Requirements

A player may become ready only when:

```text
user account is ACTIVE

user remains a room member

selected deck exists

canUseDeck(userId, deckId) = true

required lobby configuration is complete
```

Forge deck/preset validation rules defined later in this phase also apply.

---

## 5.57 Cannot Mark Another User Ready

The authenticated principal determines which member's ready state changes.

---

## 5.58 Ready Toggle Endpoint

Conceptually:

```text
PUT /api/rooms/{roomId}/ready
```

Request:

```json
{
  "ready": true
}
```

---

## 5.59 Readiness Is Invalidated by Own Deck Change

If a ready player changes their selected deck:

```text
ready = false
```

until the new selection passes validation and they explicitly become ready again.

---

## 5.60 Readiness Is Invalidated by Relevant Room Change

Preset/player-count/team changes reset affected readiness as specified earlier.

---

## 5.61 Connection Presence

Lobby state should track whether a room member currently has an active realtime connection.

Conceptually:

```text
connected = true / false
```

This is transient presence data.

---

## 5.62 Connection Presence Is Not Membership

A disconnected player remains a room member.

Do not remove them merely because Wi-Fi drops, browser refreshes, the WebSocket reconnects, or the computer briefly sleeps.

---

## 5.63 Starting Requires Connected Players

The room may not become `READY_FOR_MATCH` while a required participant is disconnected.

All configured seats must have an actively connected authenticated user when the host prepares the match.

---

## 5.64 Reconnect

When a member reconnects:

```text
authenticate

verify room membership

open room WebSocket

send fresh authoritative room snapshot
```

Do not reconstruct lobby state from stale browser memory.

---

## 5.65 No Separate Resume Token Needed for Lobby

Phase 3 authenticated identity provides lobby reconnection identity.

Do not add an additional secret lobby resume token unless implementation evidence proves one is necessary.

---

## 5.66 Room Realtime Endpoint

Create a protected realtime channel such as:

```text
/ws/rooms/{roomId}
```

The exact path may follow established project conventions.

---

## 5.67 WebSocket Authentication

Room WebSocket authentication uses the Phase 3 authenticated session.

The browser must not authenticate the connection by sending username, user ID, or seat number as a trusted first message.

---

## 5.68 WebSocket Membership Authorization

Before subscribing a connection to room events:

```text
authenticated user must be a member of that room
```

Knowing a room ID is not sufficient.

---

## 5.69 Initial Room Snapshot

After successful WebSocket connection, send a complete viewer-safe room snapshot.

Conceptually:

```json
{
  "type": "ROOM_SNAPSHOT",
  "room_revision": 17,
  "room": {
    "...": "..."
  }
}
```

---

## 5.70 Room Revision

Every material room-state mutation should increment a monotonic:

```text
room_revision
```

or equivalent version.

This allows the browser to identify stale realtime state.

---

## 5.71 Snapshot Beats Event Reconstruction

On reconnect:

```text
send fresh full snapshot
```

Do not require the browser to replay every missed room event.

---

## 5.72 Realtime Updates

Room events should cover material changes such as:

```text
member joined

member left

member removed

connection presence changed

preset changed

player count changed

deck selection status changed

ready changed

room closed

room became ready for match
```

---

## 5.73 Server Is Authoritative

The WebSocket broadcasts what the server accepted.

The browser does not locally finalize membership/readiness/configuration before server confirmation.

---

## 5.74 HTTP + WebSocket Responsibility

Recommended model:

```text
HTTP
=
commands / mutations / queries

WebSocket
=
live room snapshots and update notifications
```

Do not create two competing authoritative mutation protocols without a reason.

---

## 5.75 Join Event Ordering

When a user joins successfully:

```text
database membership succeeds
        ↓
room revision increments
        ↓
updated room state is broadcast
```

Do not broadcast membership before the transaction succeeds.

---

## 5.76 Leave Room

A non-host member may explicitly leave.

Conceptually:

```text
POST /api/rooms/{roomId}/leave
```

After leaving:

```text
membership removed

seat becomes available

room revision increments

remaining members receive update
```

---

## 5.77 Leaving Clears Room-Specific State

When a member leaves, remove their seat membership, selected deck reference, and ready state from that room.

Do not affect the user's actual Deck Depot deck.

---

## 5.78 Host Close Room

The host may explicitly close the room.

Conceptually:

```text
POST /api/rooms/{roomId}/close
```

---

## 5.79 Close Room Result

Closing:

```text
marks room CLOSED

ends active membership

invalidates join code

invalidates any unconsumed setup snapshot

notifies connected members
```

---

## 5.80 Host Remove Participant

The host may remove a non-host participant.

Conceptually:

```text
DELETE /api/rooms/{roomId}/members/{memberUserId}
```

The server must verify requester is host, target is member, and target is not host.

---

## 5.81 Removed User

After removal:

```text
membership ends

selected deck/ready state clears

room socket is closed or unsubscribed

user may join/create another room
```

---

## 5.82 Removed User Cannot Continue Mutating Room

A stale browser connection/request from a removed user must fail authorization.

---

## 5.83 No Ban List

Phase 5 does not require a room-level permanent ban list.

---

## 5.84 Regenerate Join Code

The host should be able to regenerate the room join code if necessary.

Conceptually:

```text
POST /api/rooms/{roomId}/regenerate-code
```

The old code becomes invalid immediately.

---

## 5.85 Code Regeneration Does Not Remove Existing Members

Changing the join code affects future joining only.

Existing room members remain.

---

## 5.86 Room State Machine

Use an explicit room lifecycle.

Recommended:

```text
OPEN
READY_FOR_MATCH
CLOSED
EXPIRED
```

Phase 6 may later extend the lifecycle for active matches.

---

## 5.87 `OPEN`

In `OPEN`:

```text
users may join if capacity exists

members may select decks

members may change readiness

host may alter supported configuration

members may leave
```

---

## 5.88 `READY_FOR_MATCH`

`READY_FOR_MATCH` means:

```text
Phase 5 setup validation succeeded

membership/configuration is temporarily locked

an immutable setup snapshot exists for Phase 6 consumption
```

It does not mean a Forge game is running.

---

## 5.89 No Joining Once Ready

While `READY_FOR_MATCH`:

```text
new users cannot join
```

---

## 5.90 Match Setup Can Be Invalidated

Before Phase 6 consumes the setup, a material underlying change may invalidate it.

Examples:

```text
selected deck deleted

deck share revoked

user disabled

required participant loses authorization

host cancels preparation
```

In that case:

```text
setup snapshot invalidated

room returns to OPEN or closes as appropriate

ready state is reset where required
```

---

## 5.91 Prepare Match Action

Phase 5 provides a host-only operation such as:

```text
POST /api/rooms/{roomId}/prepare-match
```

This does not start Forge.

It validates and freezes a match-setup snapshot.

---

## 5.92 Prepare Match Preconditions

Before accepting preparation, verify:

```text
requester is host

room is OPEN

configured player count is valid

exact required number of members is present

all required members are connected

all required members have selected decks

all selected decks still exist

canUseDeck is true for every selected deck

all players are ready

preset remains supported

Forge preflight succeeds as required
```

---

## 5.93 Transactional Revalidation

Do not assume validation performed earlier is still valid.

`prepare-match` must revalidate the entire setup from authoritative state.

---

## 5.94 Match Preset Capability Validation

Before `READY_FOR_MATCH`, verify the selected preset is still enabled by the accepted server/Forge capability configuration.

Do not trust a stale browser preset list.

---

## 5.95 Forge Is Authoritative for Deck/Format Rules

Arena must not implement Magic deck-format legality itself.

Do not write Arena logic for:

```text
minimum deck size

maximum deck size

sideboard rules

Commander singleton

color identity

copy limits

format-specific banned cards

Commander requirements
```

Use Forge.

---

## 5.96 Forge Preflight Validation

Before a setup becomes `READY_FOR_MATCH`, Phase 5 must use the accepted Phase 0 Forge boundary to perform the Forge validation that can be reliably performed before starting a game.

This may include:

```text
deck construction

deck-format compatibility

required Commander identity

preset compatibility

other Forge-provided pre-match validation
```

Do not reproduce Forge rules in Kotlin.

---

## 5.97 Forge Preflight Capability Conflict

If actual accepted Forge integration cannot reliably perform a required pre-match legality check without launching a real game:

**STOP AND REPORT THE CONFLICT.**

Report:

```text
FORGE PREFLIGHT CONFLICT

Requested preset:

Validation required:

Forge capability observed:

What can be validated before launch:

What cannot:

Risk:

Options:

Recommendation:
```

Do not silently invent legality logic.

---

## 5.98 Preflight Failure

If Forge rejects a deck/setup:

```text
room remains OPEN

affected readiness is cleared where appropriate

READY_FOR_MATCH is not created

user receives actionable error
```

---

## 5.99 Forge Error Detail

Convert Forge/preflight failures into safe application-level messages.

Do not expose raw JVM stack traces, internal filesystem paths, or unfiltered Forge diagnostics to browsers.

---

## 5.100 Per-Player Validation Result

Each player should be able to receive an actionable result for their own deck.

Conceptually:

```text
VALID

INVALID_FOR_PRESET

FORGE_RESOLUTION_ERROR

ACCESS_REVOKED
```

Exact codes should follow established error conventions.

---

## 5.101 Opponent Validation Privacy

Other players need to know:

```text
player is ready
or
player requires attention
```

They do not need another user's detailed deck-validation error or deck contents.

---

## 5.102 Match Setup Snapshot

Successful preparation creates an immutable Phase 5 match-setup snapshot.

Conceptually:

```json
{
  "setup_id": "...",
  "room_id": "...",
  "room_revision": 42,
  "preset_id": "CONSTRUCTED_1V1",
  "player_count": 2,
  "players": [
    {
      "seat": 0,
      "user_id": "...",
      "display_name": "...",
      "deck_id": "..."
    },
    {
      "seat": 1,
      "user_id": "...",
      "display_name": "...",
      "deck_id": "..."
    }
  ]
}
```

The actual contract must include any Phase-0-required match topology information.

---

## 5.103 Setup ID

Every prepared setup receives an immutable:

```text
setup_id
```

Recommended:

```text
UUID
```

---

## 5.104 Setup Snapshot Contains IDs, Not Browser Claims

The setup is assembled entirely from server-authoritative records.

Do not copy unverified request fields into the match-launch contract.

---

## 5.105 Required Player Identity

For every player, preserve:

```text
user_id

display_name snapshot

seat identity

selected deck_id
```

The permanent identity is still `user_id`.

---

## 5.106 Display Name Snapshot

The setup may include the player's current display name for match presentation.

If the user changes their account display name after setup creation, the setup may retain the captured match display name until invalidated or consumed.

---

## 5.107 Deck Reference

The setup references:

```text
deck_id
```

rather than browser-uploaded card lists.

Phase 6 obtains the normalized validated deck through the server.

---

## 5.108 Deck Version Stability

If Phase 2/4 imported decks are immutable, the deck ID is sufficient to reference that immutable deck version.

Do not add a second deck versioning system in Phase 5.

---

## 5.109 Setup Snapshot Is Not a Gameplay State

Do not put:

```text
hands

battlefield

life totals

priority

turn number

stack
```

into the Phase 5 match setup.

Those are Phase 6+ Forge game state.

---

## 5.110 Match Setup Contract Documentation

Create:

```text
docs/architecture/MATCH_SETUP_CONTRACT.md
```

This becomes the explicit handoff between:

```text
Phase 5 Lobby
        ↓
Phase 6 Match Runtime
```

---

## 5.111 Contract Must Define

At minimum:

```text
setup_id

room_id

room_revision

preset identifier

player count

seat identities

team identities if applicable

user IDs

display-name snapshots

deck IDs

validation status

creation timestamp

invalidated/consumed status
```

---

## 5.112 Setup Consumption

Phase 5 does not consume the setup.

Phase 6 will define how a setup becomes:

```text
live match
```

---

## 5.113 Setup Cannot Be Consumed Twice

The data model must allow Phase 6 to atomically prevent the same setup from launching two separate matches.

Phase 5 should provide the necessary status/identity foundation.

---

## 5.114 Setup Status

Recommended setup statuses:

```text
READY
INVALIDATED
CONSUMED
```

Phase 5 uses:

```text
READY
INVALIDATED
```

Phase 6 will use:

```text
CONSUMED
```

when actual launch succeeds.

---

## 5.115 Prepare Is Idempotent Where Practical

Repeated identical prepare requests must not create uncontrolled duplicate setup rows.

Use room revision and current setup status to provide deterministic behavior.

---

## 5.116 Room Changes After Preparation

While the room is `READY_FOR_MATCH`, ordinary configuration mutations are blocked.

The host may:

```text
cancel preparation
```

to return to `OPEN`.

---

## 5.117 Cancel Prepared Match

Provide a host-only operation such as:

```text
POST /api/rooms/{roomId}/cancel-preparation
```

This:

```text
invalidates the READY setup

returns room to OPEN

resets player readiness
```

Deck selections may remain if still valid.

---

## 5.118 Database Persistence

Lobby state must be persisted in PostgreSQL.

Do not keep the authoritative room only in server memory.

---

## 5.119 Why Rooms Are Persistent

Persisted rooms allow:

```text
Arena Server restart

browser refresh

temporary network interruption
```

without silently destroying the pre-match lobby.

---

## 5.120 Transient Presence Is Not Persistent Truth

Connection presence may live in application memory.

After Arena Server restart:

```text
members remain

selected decks remain

room configuration remains

ready flags may remain or may be conservatively reset

all presence begins disconnected
```

Preferred behavior:

```text
reset ready flags after server restart
```

because active presence and prior validation can no longer be assumed.

---

## 5.121 Startup Recovery

On Arena Server startup:

```text
load active rooms

mark all members disconnected

reset readiness for active OPEN rooms

invalidate stale READY_FOR_MATCH setups unless safely recoverable
```

Do not pretend a pre-restart realtime state is still live.

---

## 5.122 Prepared Setup Recovery

A `READY_FOR_MATCH` setup that was not consumed before a server restart defaults to:

```text
INVALIDATED
```

and the room returns to:

```text
OPEN
```

unless Phase 6 later introduces a stronger durable launch protocol.

This avoids launching stale setup state accidentally.

---

## 5.123 Room Expiration

Open rooms must not remain forever.

Use a configurable inactivity lifetime.

Recommended initial value:

```text
24 hours
```

---

## 5.124 Room Activity

Material actions update:

```text
last_activity_at
```

Examples:

```text
join

leave

configuration change

deck selection

ready change

host action
```

WebSocket heartbeat alone does not need to keep an abandoned room alive indefinitely.

---

## 5.125 Expired Room

When an inactive room exceeds the configured lifetime:

```text
status = EXPIRED

join code becomes invalid

active membership ends

unconsumed setup invalidates
```

---

## 5.126 Closed/Expired Cleanup

Closed and expired lobby records may be retained briefly for diagnostics and then removed.

Do not build permanent match-history storage from lobby records in Phase 5.

---

## 5.127 Database Migration

Add a Phase 5 Flyway migration.

Example:

```text
V005__lobby_and_match_setup.sql
```

Use the actual next migration number.

Never edit previously applied migrations.

---

## 5.128 Expected Room Schema

Conceptually:

```text
rooms
├── room_id
├── join_code
├── host_user_id
├── preset_id
├── desired_player_count
├── status
├── revision
├── created_at
├── last_activity_at
└── ...
```

Exact implementation may vary.

---

## 5.129 Expected Membership Schema

Conceptually:

```text
room_members
├── room_id
├── user_id
├── seat_number
├── team_id nullable
├── selected_deck_id nullable
├── ready
├── joined_at
└── ...
```

---

## 5.130 Expected Setup Schema

Conceptually:

```text
match_setups
├── setup_id
├── room_id
├── source_room_revision
├── preset_id
├── status
├── created_at
└── ...
```

Player/setup detail may be normalized or stored in another appropriate form.

---

## 5.131 Referential Integrity

Database constraints should prevent:

```text
membership in nonexistent room

duplicate user membership in same room

duplicate seat in same room

setup referencing nonexistent room

selected deck referencing nonexistent deck where practical
```

---

## 5.132 Global One-Room Constraint

The system must enforce the one-active-room-per-user rule server-side.

Do not rely only on the frontend.

---

## 5.133 Room Capacity Race

If two users attempt to claim the final available seat simultaneously:

```text
exactly one succeeds
```

The other receives:

```text
ROOM_FULL
```

Use transaction/locking/constraints.

---

## 5.134 Duplicate Join Race

Two simultaneous requests from the same user must not create two memberships.

---

## 5.135 Host Configuration Race

Concurrent host configuration requests must use current room revision/state so stale updates do not silently overwrite newer accepted state.

---

## 5.136 Optimistic Concurrency

Mutating room requests may include:

```text
expected_room_revision
```

or use another documented concurrency-control mechanism.

If the state changed:

```text
return conflict

client refreshes authoritative snapshot
```

---

## 5.137 HTTP Conflict Response

Use:

```text
409 Conflict
```

or the project's structured equivalent for stale/conflicting room mutations.

---

## 5.138 Room Snapshot API

Provide a server-authorized query such as:

```text
GET /api/rooms/{roomId}
```

Only room members may retrieve the room snapshot.

---

## 5.139 Current Room API

Provide a convenient authenticated query such as:

```text
GET /api/rooms/current
```

to determine whether the logged-in user belongs to an active room.

This helps recover after refresh/restart.

---

## 5.140 Personalized Snapshot

Room snapshot generation must know the requesting viewer.

Do not return one overbroad payload to all clients when deck information differs by viewer.

---

## 5.141 Room Member Public Fields

Safe shared member information may include:

```text
user ID

display name

seat number

connected/disconnected

ready/not ready

deck selected/not selected
```

Do not expose:

```text
session information

password/account security data

private deck contents

Deck Depot share graph
```

---

## 5.142 Host Marker

The room snapshot should clearly identify which member is the host.

---

## 5.143 Account Disable During Lobby

If a participant account becomes disabled while in a room:

```text
their authenticated access ends

their room readiness invalidates

they cannot remain eligible for READY_FOR_MATCH
```

The room must update accordingly.

---

## 5.144 Host Account Disable

If the host becomes disabled:

```text
the room closes
```

because Phase 5 does not implement host migration.

---

## 5.145 No Spectators

Phase 5 does not implement spectator seats or spectator WebSockets.

Every room member is a prospective player.

---

## 5.146 No Matchmaking

Do not implement automated matchmaking.

---

## 5.147 No Friend System

Do not add:

```text
friends

friend requests

presence directory

invitations
```

solely for room joining.

Users may manually share the join code.

---

## 5.148 No Chat

Lobby chat is not required in Phase 5.

Do not create a chat subsystem.

---

## 5.149 No Voice

Voice/video communication is outside the project scope for this phase.

---

## 5.150 No Public Invite URL Required

A join code is sufficient.

A convenience URL may be added only if it uses the same authenticated join flow and does not bypass authentication.

---

## 5.151 Join-Code Display

The host UI should make the join code easy to read and copy without exposing any authentication credential.

---

## 5.152 Lobby Page

Create an authenticated lobby entry page.

Recommended route:

```text
/play
```

or another route consistent with the established frontend.

It should provide:

```text
Create Game

Join Game
```

---

## 5.153 Create Game UI

The create flow should allow:

```text
select supported match preset

select desired player count when applicable

create room
```

Do not expose unsupported arbitrary Forge settings.

---

## 5.154 Join Game UI

The join flow includes:

```text
room code input

Join button

clear validation errors
```

Normalize accepted join-code casing server-side.

---

## 5.155 Room UI

Recommended room layout:

```text
Game Room

Code: F7KM2Q          [ Copy ]

Mode: Commander
Players: 3 / 4

Seat 1 — Eric
  Deck: My Commander Deck
  Ready

Seat 2 — Alice
  Deck: Selected
  Ready

Seat 3 — Bob
  Deck: Selected
  Not Ready

Seat 4 — Waiting...

[ My Deck ]
[ Ready ]

Host controls:
[ Settings ]
[ Remove Player ]
[ Prepare Match ]
[ Close Room ]
```

Actual visual styling may evolve later.

---

## 5.156 Viewer Privacy in UI

A user sees their own selected deck identity.

For another user's private selection, display:

```text
Deck Selected
```

unless the viewer independently has Deck Depot access and product design explicitly requires more.

The default is privacy.

---

## 5.157 Deck Picker

The player's deck picker shows:

```text
My Decks

Shared With Me
```

that satisfy:

```text
canUseDeck(currentUserId, deckId)
```

---

## 5.158 Deck Picker Does Not Show Other Users' Decks

Do not populate the picker from all database decks or other room members' private decks.

---

## 5.159 Deck Picker Selection Confirmation

After server acceptance, show the player's selected deck clearly in their own UI.

---

## 5.160 Ready Button

The user may toggle:

```text
Ready
Not Ready
```

only after required selection/configuration is valid.

---

## 5.161 Prepare Match Button

Only the host sees/enables:

```text
Prepare Match
```

when obvious client-visible prerequisites are met.

The server still independently revalidates everything.

---

## 5.162 Phase 5 Prepared UI

After successful preparation:

```text
Match setup validated.
Ready for match engine.
```

may be displayed.

Phase 5 must not falsely claim:

```text
Game started
```

because Forge execution begins in Phase 6.

---

## 5.163 Error Messages

Provide actionable errors for cases such as:

```text
ROOM_NOT_FOUND

ROOM_FULL

ROOM_CLOSED

INVALID_JOIN_CODE

ALREADY_IN_ROOM

NOT_ROOM_MEMBER

HOST_REQUIRED

DECK_ACCESS_DENIED

DECK_NO_LONGER_AVAILABLE

PLAYER_NOT_READY

PLAYER_DISCONNECTED

ROOM_CONFIGURATION_INVALID

MATCH_PRESET_UNSUPPORTED

FORGE_PREFLIGHT_FAILED

STALE_ROOM_REVISION
```

Exact names should follow established conventions.

---

## 5.164 Do Not Leak Room Existence Unnecessarily

For internal UUID-based room access, unauthorized non-members should not receive sensitive room state.

Knowing a room ID must not expose its membership.

---

## 5.165 Join-Code Error Privacy

Ordinary join errors should avoid exposing unnecessary room metadata before membership succeeds.

---

## 5.166 CSRF

All state-changing room HTTP operations require the Phase 3 CSRF mechanism.

Examples:

```text
create room

join room

leave

close

kick

change settings

select deck

change readiness

regenerate code

prepare match

cancel preparation
```

---

## 5.167 WebSocket Origin/Auth Rules

Room WebSockets must preserve the Phase 3 authenticated/same-origin security model.

---

## 5.168 Logging

Log useful lobby events.

Examples:

```text
room created

join success

join failure

member left

member removed

room closed

preset changed

deck selected

ready changed

prepare attempted

prepare succeeded

prepare failed

room expired
```

---

## 5.169 Logging Fields

Where appropriate:

```text
request_id

room_id

user_id

setup_id

room_revision

event

result
```

Do not log passwords, raw session tokens, CSRF tokens, or full deck contents.

---

## 5.170 Join Code Logging

Avoid unnecessarily writing active join codes into routine production logs.

---

## 5.171 Metrics

A dedicated metrics platform is not required.

Basic diagnostics may include:

```text
active rooms

active room connections

prepare failures
```

if useful.

Do not overengineer monitoring.

---

## 5.172 Old Arena Reference

The old reference project remains:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

strictly read-only.

The coding agent may inspect its prior:

```text
session code behavior

seat binding

duplicate handling

reconnect logic

server-side identity enforcement
```

for lessons.

It must not modify the old project.

---

## 5.173 Old Implementation Lessons

Useful concepts from the old implementation may be reused when they remain correct:

```text
short session/join codes

server-side seat binding

server overwrites/rejects client identity claims

duplicate suppression

reconnect returns authoritative state

disconnected participant remains claimed
```

Do not copy old architecture blindly.

Revalidate it against the new authenticated Ktor design.

---

## 5.174 No Forge Modification

Phase 5 must not modify upstream Forge to build lobby functionality.

Any Forge interaction is through the accepted adapter boundary.

---

## 5.175 Forge Preservation

The pinned Forge source remains an upstream dependency.

Do not scatter lobby-specific patches through Forge.

---

## 5.176 Proxic Deck Builder

Phase 5 has no reason to modify:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder
```

It remains strictly read-only.

---

## 5.177 Unit Tests

Backend unit tests must cover at minimum:

```text
join-code generation

join-code normalization

room capacity

host authorization

membership rules

one-room-per-user

seat assignment

ready-state transitions

deck-selection authorization

room-revision behavior

room-state transitions

setup validation
```

---

## 5.178 Database Integration Tests

Test:

```text
room creation

membership persistence

duplicate membership prevention

seat uniqueness

room capacity races

deck reference behavior

share revocation invalidation

room restart recovery

expiration

setup persistence

setup invalidation
```

---

## 5.179 Realtime Tests

Test:

```text
authenticated room connection

non-member rejection

initial snapshot

member join update

member leave update

ready update

deck-selected status update

preset update

disconnect presence

reconnect snapshot

room close event

setup-ready event
```

---

## 5.180 Two-Browser Test

Use at least two independent authenticated browser contexts.

Verify real identity separation.

Do not simulate both users by swapping `user_id` in one browser request.

---

## 5.181 Create/Join E2E Test

Using two users:

```text
User A creates room

room code appears

User B enters code

User B joins

both browsers show both participants
```

---

## 5.182 Wrong-Code Test

Authenticated user enters an invalid code.

Join fails safely.

No room membership is created.

---

## 5.183 Final-Seat Race Test

With one seat remaining:

```text
User B
and
User C
```

attempt to join simultaneously.

Exactly one succeeds.

---

## 5.184 Duplicate-User Test

The same authenticated `user_id` attempts to join from multiple tabs.

Only one room membership exists.

---

## 5.185 One-Room Test

User already in Room A attempts to join Room B.

Request fails until the user leaves Room A.

---

## 5.186 Host Permission Test

Non-host attempts to:

```text
change preset

kick user

prepare match

close room

regenerate code
```

All fail.

---

## 5.187 Host Cannot Select Another Deck Test

Host attempts to assign another member's selected deck.

Request fails.

---

## 5.188 Private Deck Selection Test

User selects an owned private deck.

Selection succeeds.

Opponent receives only permitted room information and does not receive the deck contents.

---

## 5.189 Shared Deck Selection Test

User selects a deck shared with them through Deck Depot.

Selection succeeds because:

```text
canUseDeck = true
```

---

## 5.190 Unauthorized Deck Selection Test

User submits another user's unshared deck ID.

Selection fails.

---

## 5.191 Share Revocation During Lobby Test

User B selects a deck shared by User A.

User B becomes ready.

User A revokes sharing.

Verify:

```text
User B's deck selection becomes invalid

User B is no longer ready

room cannot prepare
```

---

## 5.192 Deck Deletion During Lobby Test

A selected deck is deleted.

The room invalidates that player's selection/readiness.

---

## 5.193 Deck Change Ready Reset Test

Ready player changes deck.

Ready state resets.

---

## 5.194 Preset Change Ready Reset Test

Host changes match preset.

All readiness is reset.

---

## 5.195 Disconnect Test

Ready participant loses WebSocket connection.

Membership remains.

Room may not prepare while the required participant is disconnected.

---

## 5.196 Reconnect Test

Disconnected participant reconnects with their authenticated account.

They resume the same membership and receive the latest authoritative room snapshot.

---

## 5.197 Browser Refresh Test

Refreshing the room page does not create:

```text
new membership

new seat

duplicate player
```

---

## 5.198 Server Restart Test

Create a room with multiple members and selected decks.

Restart Arena Server.

Verify:

```text
room persists

members persist

configuration persists

all users initially show disconnected

readiness is conservatively reset

clients can reconnect
```

---

## 5.199 Room Expiration Test

Create an inactive room with a controlled short test TTL.

After expiration:

```text
join code fails

members are no longer active

room cannot prepare
```

---

## 5.200 Regenerate-Code Test

Host regenerates join code.

Verify:

```text
old code fails

new code works

existing members remain
```

---

## 5.201 Kick Test

Host removes User B.

Verify:

```text
User B loses membership

seat becomes available

User B socket loses room access

User B may join another room
```

---

## 5.202 Host Leave Test

Host explicitly leaves.

Verify:

```text
room closes

join code invalidates

remaining members leave active-room state
```

---

## 5.203 Account Disable Test

Disable a non-host participant while in room.

Verify:

```text
their authentication becomes invalid

room cannot prepare with them

their readiness is invalidated
```

---

## 5.204 Host Disable Test

Disable the host.

Verify the room closes.

---

## 5.205 Prepare Match Success Test

With valid room:

```text
correct player count

all connected

all decks selected

all canUseDeck checks true

all ready

supported preset

Forge preflight succeeds
```

host prepares match.

Verify:

```text
room = READY_FOR_MATCH

immutable setup snapshot exists
```

---

## 5.206 Prepare Match Missing Player Test

Room configured for four players with only three members.

Preparation fails.

---

## 5.207 Prepare Match Disconnected Player Test

All players are ready but one required participant is disconnected.

Preparation fails.

---

## 5.208 Prepare Match Unauthorized Deck Test

A previously selected deck has lost authorization.

Preparation fails and affected user readiness invalidates.

---

## 5.209 Forge Preflight Failure Test

Provide a deck/setup that Forge considers invalid for the selected supported preset.

Verify:

```text
Arena does not implement substitute legality

Forge rejection blocks preparation

room remains OPEN

actionable user-facing result exists
```

---

## 5.210 Prepared Room Mutation Test

After `READY_FOR_MATCH`, attempt ordinary:

```text
join

deck change

ready change

preset change
```

These mutations are rejected until preparation is cancelled or consumed.

---

## 5.211 Cancel Preparation Test

Host cancels preparation.

Verify:

```text
setup = INVALIDATED

room = OPEN

ready flags reset

valid deck selections may remain
```

---

## 5.212 Setup Duplicate Test

Repeated identical preparation attempts must not create multiple independent launchable setup records.

---

## 5.213 Setup Restart Test

Prepare a room.

Restart Arena Server before Phase 6 consumes the setup.

Verify the stale setup is invalidated and room returns safely to OPEN according to Phase 5 recovery policy.

---

## 5.214 Personalized Snapshot Privacy Test

User A selects a private deck.

Verify User A snapshot may include their deck identity while User B's snapshot does not reveal private deck details.

---

## 5.215 Direct WebSocket Room Attack

User C learns Room A's UUID but is not a member.

Attempt to connect directly to:

```text
/ws/rooms/{roomId}
```

Connection is rejected.

---

## 5.216 Identity Spoof Test

User B submits HTTP or WebSocket payload containing:

```text
user_id = User A
```

Server continues to treat the action as User B.

---

## 5.217 Stale Revision Test

Client mutates room using an outdated expected room revision.

Server rejects the stale mutation instead of overwriting newer state.

---

## 5.218 Production E2E

Through:

```text
https://arena.barnflix.net
```

using at least two authenticated accounts:

```text
User A creates room

User B joins by code

both select authorized decks

both ready

realtime state synchronizes

host prepares setup

READY_FOR_MATCH is reached
```

No Forge game is started in Phase 5.

---

## 5.219 Three/Four Player Test

If an enabled accepted preset supports more than two players:

run a real browser/backend test using the maximum Phase-5-supported player count for that preset.

Verify:

```text
unique seats

membership

deck selection

ready state

realtime updates

setup snapshot
```

---

## 5.220 Unsupported Preset Test

Attempt to submit a made-up or Phase-0-unsupported preset ID.

Server rejects it.

---

## 5.221 Two-Headed Giant Guard Test

If 2HG is not an accepted supported mode:

verify no 2HG preset is exposed and direct API attempts to request it fail.

---

## 5.222 Static Analysis

Frontend:

```text
TypeScript compile

ESLint

Prettier check

Vitest

Playwright
```

Backend:

```text
Kotlin compile

ktlint

detekt

JUnit/Kotlin tests
```

---

## 5.223 Required Documentation

Create:

```text
docs/architecture/LOBBY_ARCHITECTURE.md

docs/architecture/LOBBY_PROTOCOL.md

docs/architecture/MATCH_SETUP_CONTRACT.md

docs/troubleshooting/LOBBY.md
```

Update as appropriate:

```text
README.md

BUILD_PLAN.md

AGENTS.md
```

---

## 5.224 `LOBBY_ARCHITECTURE.md`

Document:

```text
room identity

join-code model

membership

host authority

seat model

preset model

deck selection

readiness

presence

reconnect

room state machine

persistence

expiration

recovery
```

---

## 5.225 `LOBBY_PROTOCOL.md`

Document:

```text
HTTP routes

WebSocket route

room snapshot

viewer-specific fields

room revision

event types

authorization requirements

error codes
```

---

## 5.226 `MATCH_SETUP_CONTRACT.md`

Document the exact immutable contract handed to Phase 6.

This is a critical cross-phase interface.

---

## 5.227 Lobby Troubleshooting

Cover:

```text
cannot create room

invalid join code

room full

already in room

WebSocket not connecting

room state not updating

deck unavailable

share revoked

player cannot ready

player disconnected

Forge preflight failure

stale room revision

room expired

prepared setup invalidated
```

---

## 5.228 Phase 5 Checklist

### Execution prerequisites

- [ ] Phases 0–4 implemented, tested, and accepted.
- [ ] Authenticated user identity available.
- [ ] Deck Depot authorization available.
- [ ] `canUseDeck` available.
- [ ] Authenticated WebSocket foundation available.
- [ ] Accepted Forge capability findings available.

### Room model

- [ ] Add persistent room ID.
- [ ] Add short join code.
- [ ] Add host identity.
- [ ] Add room state.
- [ ] Add room revision.
- [ ] Add desired player count.
- [ ] Add preset.
- [ ] Add timestamps.
- [ ] Add expiration.

### Membership

- [ ] Add room membership.
- [ ] Add unique seats.
- [ ] Enforce one active room per user.
- [ ] Prevent duplicate membership.
- [ ] Track selected deck.
- [ ] Track readiness.
- [ ] Track realtime presence.
- [ ] Persist membership independently of WebSocket connection.

### Host controls

- [ ] Create room.
- [ ] Close room.
- [ ] Change preset.
- [ ] Change allowed player count.
- [ ] Remove participant.
- [ ] Regenerate join code.
- [ ] Prepare match.
- [ ] Cancel preparation.
- [ ] Do not allow host to select another user's deck.

### Joining

- [ ] Join by code.
- [ ] Normalize code.
- [ ] Rate-limit invalid attempts.
- [ ] Reject full room.
- [ ] Reject closed room.
- [ ] Reject second active-room membership.
- [ ] Handle final-seat race safely.

### Presets

- [ ] Build server-authoritative supported-preset catalog.
- [ ] Source support from accepted Forge decisions.
- [ ] Do not expose unsupported modes.
- [ ] Guard 2HG unless explicitly proven.
- [ ] Support valid player-count selection where needed.

### Decks

- [ ] Show user's usable Deck Depot decks.
- [ ] Validate `canUseDeck`.
- [ ] Reject private unshared deck.
- [ ] Keep selected deck private from opponents.
- [ ] Invalidate on share revocation.
- [ ] Invalidate on deletion.
- [ ] Reset readiness after deck change.

### Readiness

- [ ] User changes only own ready state.
- [ ] Validate required deck before ready.
- [ ] Reset ready on material changes.
- [ ] Require connected players for preparation.

### Realtime

- [ ] Add protected room WebSocket.
- [ ] Require room membership.
- [ ] Send initial snapshot.
- [ ] Add viewer-safe snapshots.
- [ ] Add room revision.
- [ ] Broadcast accepted state changes.
- [ ] Track connection presence.
- [ ] Reconnect with authoritative snapshot.

### Persistence/recovery

- [ ] Persist room.
- [ ] Persist members.
- [ ] Persist deck selections.
- [ ] Persist configuration.
- [ ] Reset unsafe readiness after restart.
- [ ] Mark users disconnected after restart.
- [ ] Expire stale rooms.
- [ ] Invalidate stale prepared setup on restart.

### Forge preflight

- [ ] Use accepted Forge adapter only.
- [ ] Do not implement Arena legality rules.
- [ ] Validate supported preset.
- [ ] Validate decks through Forge.
- [ ] Surface safe validation errors.
- [ ] Escalate if Forge cannot provide required reliable preflight.

### Match setup

- [ ] Create immutable setup ID.
- [ ] Capture room revision.
- [ ] Capture preset.
- [ ] Capture seats.
- [ ] Capture users.
- [ ] Capture deck IDs.
- [ ] Capture team identity if required.
- [ ] Prevent duplicate launchable setup.
- [ ] Support invalidation.
- [ ] Document Phase 6 contract.

### Frontend

- [ ] Add Play/lobby entry.
- [ ] Add create flow.
- [ ] Add join flow.
- [ ] Add room screen.
- [ ] Add join-code copy.
- [ ] Add deck picker.
- [ ] Add ready control.
- [ ] Add connected indicator.
- [ ] Add host controls.
- [ ] Add Prepare Match.
- [ ] Add preparation status.
- [ ] Preserve opponent deck privacy.

### Security

- [ ] Require authentication.
- [ ] Require CSRF for mutations.
- [ ] Never trust client identity.
- [ ] Protect room WebSocket.
- [ ] Prevent non-member room reads.
- [ ] Prevent unauthorized deck selection.
- [ ] Rate-limit join-code attempts.
- [ ] Avoid join-code logging.
- [ ] Verify stale member cannot mutate after removal.

### Testing

- [ ] Create/join E2E passes.
- [ ] Wrong-code test passes.
- [ ] Capacity-race test passes.
- [ ] Duplicate-user test passes.
- [ ] One-room test passes.
- [ ] Host permission tests pass.
- [ ] Private deck privacy passes.
- [ ] Shared-deck selection passes.
- [ ] Revocation invalidation passes.
- [ ] Ready-reset tests pass.
- [ ] Disconnect/reconnect tests pass.
- [ ] Browser refresh passes.
- [ ] Server restart recovery passes.
- [ ] Kick passes.
- [ ] Host-leave behavior passes.
- [ ] Forge preflight passes.
- [ ] Prepare-match tests pass.
- [ ] Setup invalidation passes.
- [ ] WebSocket attack test passes.
- [ ] Identity spoof test passes.
- [ ] Revision conflict test passes.
- [ ] Production E2E passes.
- [ ] Maximum supported multiplayer test passes where applicable.
- [ ] Static analysis passes.

### Documentation

- [ ] `LOBBY_ARCHITECTURE.md` complete.
- [ ] `LOBBY_PROTOCOL.md` complete.
- [ ] `MATCH_SETUP_CONTRACT.md` complete.
- [ ] Lobby troubleshooting complete.
- [ ] README updated.
- [ ] BUILD_PLAN updated.
- [ ] AGENTS.md updated if required.

---

## 5.229 Mandatory Acceptance Tests

### P5-A — Authenticated Room Creation

Authenticated User A creates a room.

Verify:

```text
room_id exists

join code exists

User A is host

User A occupies one seat
```

**Required evidence:** RUN.

### P5-B — Join by Code

Authenticated User B enters the room code.

Verify User B becomes exactly one room member and receives a unique seat.

**Required evidence:** RUN.

### P5-C — Anonymous Rejection

Unauthenticated user cannot create or join a room.

**Required evidence:** RUN.

### P5-D — One Active Room Per User

User already in Room A cannot join/create Room B until leaving/closing Room A.

**Required evidence:** RUN.

### P5-E — Duplicate Session Identity

The same Arena user joining through multiple browser contexts does not create duplicate player memberships.

**Required evidence:** RUN.

### P5-F — Capacity Race

Two users attempt to take the final room seat concurrently.

Exactly one succeeds.

**Required evidence:** RUN.

### P5-G — Host Authorization

Only host can:

```text
change preset

change player count

remove member

regenerate code

prepare match

close room
```

**Required evidence:** RUN.

### P5-H — Supported Preset Enforcement

Server accepts only presets proven/accepted by the Forge capability architecture.

Invented/unsupported preset IDs fail.

**Required evidence:** RUN.

### P5-I — 2HG Safety

If Two-Headed Giant was not proven supported:

```text
it is not exposed
and
direct API requests fail
```

**Required evidence:** RUN.

### P5-J — Owned Deck Selection

User selects a deck they own.

`canUseDeck` succeeds and selection is recorded.

**Required evidence:** RUN.

### P5-K — Shared Deck Selection

User selects a deck legitimately shared with them.

Selection succeeds.

**Required evidence:** RUN.

### P5-L — Unauthorized Deck Rejection

User submits another user's unshared deck ID.

Selection fails.

**Required evidence:** RUN.

### P5-M — Deck Privacy

User A selects a private deck.

User B's room payload does not contain User A's private deck contents.

**Required evidence:** RUN / payload inspection.

### P5-N — Share Revocation Invalidation

User selects a shared deck and becomes ready.

Share is revoked.

Selection/readiness become invalid and room cannot prepare.

**Required evidence:** RUN.

### P5-O — Ready-State Integrity

Users can modify only their own ready state.

Changing deck or material room configuration invalidates readiness appropriately.

**Required evidence:** RUN.

### P5-P — Disconnect / Reconnect

Disconnecting a member does not delete membership.

Reconnecting restores the same seat and sends current authoritative state.

**Required evidence:** RUN.

### P5-Q — Server Restart Recovery

An open room survives Arena Server restart.

Membership/configuration persist, unsafe readiness resets, and users can reconnect.

**Required evidence:** RUN.

### P5-R — Protected Room WebSocket

A non-member cannot subscribe to another room's realtime channel merely by knowing its room ID.

**Required evidence:** RUN.

### P5-S — Identity Spoof Protection

User B cannot act as User A by supplying User A's identity in HTTP or WebSocket data.

**Required evidence:** RUN.

### P5-T — Forge Preflight

A valid supported setup passes the accepted Forge preflight path.

An invalid setup is rejected by Forge-derived validation rather than Arena-authored Magic rules.

**Required evidence:** RUN.

### P5-U — Prepare Match

A fully valid room produces exactly one immutable:

```text
READY_FOR_MATCH
```

setup snapshot.

No Forge match starts.

**Required evidence:** RUN.

### P5-V — Prepare Preconditions

Preparation fails if any required condition is missing:

```text
player

connection

deck

deck authorization

ready state

supported preset

Forge preflight
```

**Required evidence:** RUN.

### P5-W — Prepared-State Lock

Once `READY_FOR_MATCH`, ordinary room mutations are blocked until preparation is cancelled or later consumed.

**Required evidence:** RUN.

### P5-X — Cancel Preparation

Host cancels preparation.

Setup invalidates and room safely returns to `OPEN`.

**Required evidence:** RUN.

### P5-Y — Production Multi-User Workflow

Through:

```text
https://arena.barnflix.net
```

at least two authenticated users successfully:

```text
create

join

select authorized decks

ready

receive realtime synchronization

prepare valid match setup
```

**Required evidence:** Playwright/external RUN.

### P5-Z — Project Integrity

Verify:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

remains unchanged.

Verify:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder
```

remains unchanged.

Verify upstream Forge contains no unapproved Proxic modifications.

**Required evidence:** integrity check.

---

## 5.230 Required Phase 5 Deliverables

At completion provide:

```text
1. Summary of implementation.

2. Phase 5 database migration.

3. Final room schema.

4. Final membership schema.

5. Final prepared-match schema.

6. Join-code generation rules.

7. Room-state machine.

8. Host authority rules.

9. Seat-assignment rules.

10. Supported match-preset catalog.

11. Player-count rules.

12. Deck-selection authorization flow.

13. Viewer-specific deck privacy behavior.

14. Ready-state rules.

15. Presence/reconnect behavior.

16. Room expiration behavior.

17. Server-restart recovery behavior.

18. Lobby HTTP API routes.

19. Lobby WebSocket protocol.

20. Room revision/concurrency design.

21. Forge preflight implementation.

22. Final MATCH_SETUP_CONTRACT.md.

23. Create/join test results.

24. Capacity-race result.

25. Deck authorization results.

26. Deck privacy result.

27. Share-revocation invalidation result.

28. Reconnect result.

29. Server-restart result.

30. Forge-preflight test results.

31. READY_FOR_MATCH test result.

32. Production multi-user browser result.

33. Maximum-supported-player-count test where applicable.

34. Confirmation old Arena remained unchanged.

35. Confirmation Deck Builder remained unchanged.

36. Confirmation upstream Forge remained clean.

37. Any deviations.

38. Any unresolved concerns.

39. Proposed requirements for Phase 6.
```

Do not begin Phase 6 automatically.

---

## 5.231 Phase 5 Exit Gate

Phase 5 implementation is complete only when:

```text
authenticated users can create rooms

authenticated users can join rooms by short code

room identity and join code are separate

room membership is server-authoritative

each user occupies one seat

one user cannot occupy multiple active rooms

room capacity is enforced atomically

host permissions are enforced

only Phase-0-supported match presets are exposed

unsupported 2HG cannot be selected

users can select owned/shared decks

canUseDeck is enforced server-side

private deck data is not leaked to opponents

share revocation invalidates affected selection

ready state is server-authoritative

disconnect does not delete membership

reconnect restores authoritative room state

room WebSockets require authentication and membership

room state survives server restart safely

stale rooms expire

Forge performs supported pre-match rules validation

Arena does not implement Magic legality rules

host can prepare a valid setup

READY_FOR_MATCH creates an immutable setup snapshot

no Forge match is started in Phase 5

MATCH_SETUP_CONTRACT.md is complete

production multi-user workflow succeeds

old Arena remains unchanged

Deck Builder remains unchanged

Forge remains clean

documentation matches actual behavior
```

---

## 5.232 What Phase 5 Does Not Build

The following are intentionally outside Phase 5:

```text
Forge match process launch

live Match/Game creation

battlefield

hands

library display

graveyard gameplay

exile gameplay

priority

stack

combat

mana payment

targeting

card decisions

winner detection

match recovery

spectators

matchmaking

friends

lobby chat

voice/video

public room directory

match history

replays
```

---

## 5.233 Escalation Rule

Stop and ask the project owner before:

```text
allowing anonymous room participation

adding public matchmaking

adding public room browsing

allowing a user into multiple active rooms

implementing host transfer

exposing another user's private deck contents in lobby

allowing host to select another player's deck

implementing Magic legality outside Forge

exposing unsupported Forge presets

approximating Two-Headed Giant

adding spectators

adding lobby chat

changing Deck Depot access rules

changing the Deck Builder export format

modifying Proxic Deck Builder

modifying upstream Forge

starting actual Forge matches in Phase 5

expanding Phase 5 into battlefield/gameplay
```

For a conflict report use:

```text
CONFLICT

Phase 5 requirement:

Observed reality:

Evidence:

Impact:

Options:

Recommendation:

Question for project owner:
```

---

## 5.234 Locked-Phase Amendment Rule

This Phase 5 specification is locked.

If a legitimate change to a locked Phase 5 requirement becomes necessary, do not silently edit history.

Create an explicit amendment:

```text
PHASE 5 AMENDMENT <number>

Reason:
Affected requirement:
Old decision:
New decision:
Evidence:
Affected later phases:
Approved by project owner:
Date:
```

The amendment records the change separately.

---

# Phase 5 Final Principle

Phase 5 establishes a trustworthy pre-game chain:

```text
authenticated user
        ↓
room membership
        ↓
player seat
        ↓
supported match preset
        ↓
authorized deck_id
        ↓
ready state
        ↓
Forge preflight
        ↓
immutable READY_FOR_MATCH setup
```

The browser does not decide who occupies a seat.

The host does not decide whether another user may use a deck.

The lobby does not implement Magic legality.

Forge remains authoritative for Magic rules.

The output of Phase 5 is not a running game.

The output is:

```text
MATCH_SETUP
```

containing everything Phase 6 needs to safely start the real Forge match.
