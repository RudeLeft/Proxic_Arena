# Match protocol

PHASE_06 §6.177. The public contract between a browser and the Arena
server during a match. Field-level detail of the snapshot and the
question kinds lives in `protocol/README.md`; this file is the shape
and the rules. Written from `MatchSocket.kt`, `MatchHub.kt`,
`MatchRoutes.kt` and `frontend/src/match.ts`.

The browser never talks to Forge. The worker's own protocol is
internal (`FORGE_WORKER_RUNTIME.md`).

---

## Version

Every frame carries `protocolVersion` (currently **1**), `type` and a
fresh `messageId`. `/api/version` reports the same number. A client
never interprets a version it does not know.

## Finding the match (HTTP)

```text
POST /api/matches                  {setupId}        host launches (MATCH_RUNTIME.md)
GET  /api/matches/current          the caller's LAUNCHING/RUNNING match, or null
GET  /api/matches/{id}             one match, participants only
POST /api/matches/{id}/abandon     any participant; TERMINATED, no winner
GET  /api/matches/{id}/assets/{sha256}   card artwork (MATCH_ASSET_AUTHORIZATION.md)
```

`/api/matches/current` is what a page asks on load, so a refresh lands
back in the match (§6.114).

## WebSocket

```text
/ws/matches/{matchId}
```

Authenticated by the session cookie, like every request (§3.78). A
match the user is not in and a match that does not exist close the
same way (`VIOLATED_POLICY`, "not a participant"); knowing a match id
grants nothing, and there are no spectators (§6.108). Separate from
the lobby socket `/ws/user`.

### On connect, in this order (§6.110)

```text
MATCH_HELLO       matchId, seat
MATCH_SNAPSHOT    the board as THIS player may see it      (if any yet)
DECISION_REQUEST  the question still waiting for this player (if any)
```

State before the question: a question names objects by id, so the board
that holds them arrives first. Proven over every question of every
regression game (P6-L, `scripts/check-snapshot-first.py`).

### Server → browser

```text
MATCH_SNAPSHOT          state: viewer snapshot (below)
DECISION_REQUEST        decisionId, actedForSeat, kind, stateVersion, gameEpoch,
                        mandatory, prompt?, options: [{actionId, label}],
                        searchable?, optionCount?
DECISION_ACCEPTED       decisionId -- a receipt, not a game event
DECISION_REFUSED        decisionId, reason
DECISION_CLEARED        nothing is waiting on you
DECISION_OPTIONS        decisionId, query, total, options   (search results)
DECISION_SEARCH_REFUSED decisionId, reason
```

A `DECISION_REQUEST` reaches only the player Forge is waiting on.
`actedForSeat` says whose decision it is (under Mindslaver, somebody
else's); who is *authorised* is the server's conclusion and is not sent
(§6.38, §6.100).

### Browser → server

```text
DECISION_RESPONSE   decisionId, actionId     actionId null = pass
DECISION_SEARCH     decisionId, query        searchable questions only
```

**Only `decisionId` and `actionId` are read.** Not a seat, not a user,
not a Forge player id, not a state version: a client that could supply
those could answer for somebody else or defeat the staleness check
(§6.100). The answering seat is the authenticated user's.

## Viewer snapshots

One per player, built by the worker for that viewer from Forge's state
and forwarded unchanged; the server does not re-filter or rebuild it
(§6.42). Carries the turn, phase, active seat, `dayTime`, `gameEpoch`,
`stateRevision`, every player's public totals and Forge state
(counters, designations, command zone, Ring temptations, completed
dungeons), and the zones this viewer may see: `hand` (own), `otherHands`
(only what Forge reveals), `battlefield`, `graveyard`, `exile`,
`stack`, plus `notices` -- Forge's messages to this player. What may
appear is `MATCH_STATE_VISIBILITY.md`; every field is in
`protocol/README.md`.

## Identity

```text
card:<forge id>     a card or token             typed: card and stack ids overlap
stack:<instance>    a stack entry
target:card:N / target:player:N / target:stack:N    targets
action:<n>:card:<id>  a playable ability -- distinct per ability of one object
number:N / divide:N / value:<text> / mana:... / <kind>:<index>   other answers
decisionId          rises for the whole match, across a game restart
stateRevision       rises with every snapshot
stateVersion        the revision a question was asked against
gameEpoch           1, then 2 after Karn Liberated restarts the game
```

An object id is never an action id (P6-AB); the action model is
`MATCH_ACTION_MODEL.md`.

## Refusals

`DECISION_REFUSED.reason`, one of:

```text
NOT_PENDING        nothing is being asked
WRONG_SEAT         you are not the one being asked
DUPLICATE          that question was already answered
STALE_DECISION     not the current question (e.g. from game 1 in game 2)
STALE_STATE        asked against a board that has moved on
UNREACHABLE        the match cannot be answered (worker gone)
NOT_YOURS          not a match you are in
PASS_NOT_ALLOWED   a mandatory question
NOT_SEARCHABLE     a search on a question that is not searchable
```

and an `actionId` that was not offered is refused before Forge sees it
(P6-Q). Two tabs answering at once: exactly one is accepted (P6-R).
Clients branch on `reason`, never on text.

## Nested interaction

Forge may ask a question while another is open -- a spell cast in the
middle of a library search (Panglacial Wurm), mana paid for it, then
the search resumes. Each is its own `DECISION_REQUEST` with its own id,
asked one at a time in Forge's order; nothing is flattened into one
list (P6-AE).

## Non-object choices

A colour, a creature or land type, a number, a card name, a coin call,
a mode, a dungeon room: the allowed values are Forge's, sent as
options. A card name allows ~34,000 values, so that question is
**searchable**: the browser searches, the server sends the best 50, and
the answer must be one this player was sent (protocol/README.md,
P6-AG).

## Reconnect

A dropped socket changes nothing in the game. The question stays
pending -- a disconnect never passes, concedes or picks (§6.111) -- and
on reconnect the hello, snapshot and same question are sent again.
Refresh, two tabs and a closed browser are covered by P6-R/S/T/BB;
on the live site a page reloaded mid-game was back in the same match
(P6-BK).

## End and failure

The final snapshots are sent to every player before the end. The match
then shows its result through the lobby (`ENDED` with the winner, or
`FAILED_*`/`TERMINATED` with no winner) and the question area is
cleared; a question from a finished match is never shown
(MATCH_RUNTIME.md).
