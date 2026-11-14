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

Every frame the server sends carries `protocolVersion` (currently
**1**), `type` and a fresh `messageId`; the browser's frames carry only
`type` and their fields. `/api/version` reports the same number. The game
page does not check `protocolVersion` on this socket (only the
foundation socket and `/api/version` are checked); an unknown `type` is
ignored rather than misread.

## Finding the match (HTTP)

```text
POST /api/matches                  {setupId}        host launches (MATCH_RUNTIME.md)
GET  /api/matches/current          the caller's LAUNCHING/RUNNING match, or null
GET  /api/matches/{id}             one match, participants only
POST /api/matches/{id}/abandon     any participant; TERMINATED, no winner
GET  /api/matches/{id}/assets/{sha256}   card artwork (MATCH_ASSET_AUTHORIZATION.md)
GET  /api/matches/watch/{roomId}   spec 0047: the game a room is playing, to watch;
                                   404 (sent as NOT_WATCHABLE, rewritten to
                                   NOT_FOUND like every 404) while there is
                                   none to watch (still starting, over),
                                   409 YOUR_GAME for one of its players.
                                   Spec 0067: every running game; the page
                                   asks it every 3 s to follow the players
                                   into their next game in the room
```

Since 1.30.0 (spec 0052) the game page loads every picture from
`GET /api/pictures/{sha256}` (`?size=full` for the close-up), one address
per picture for any signed-in player, so the browser keeps it between
games. The per-match route still answers, for older pages.

`/api/matches/current` is what a page asks on load, so a refresh lands
back in the match (§6.114).

## WebSocket

```text
/ws/matches/{matchId}
```

Authenticated by the session cookie, like every request (§3.78). A
match the user is not in and a match that does not exist close the
same way (`VIOLATED_POLICY`, "not a participant"); knowing a match id
grants nothing by itself (§6.108). Separate from the lobby socket
`/ws/user`.

**Spectators (spec 0047, spec 0067).** A signed-in user who is not a
player is let in as a spectator when the match is `RUNNING` on this
server (past the opening hands) and its worker is alive -- every game,
since spec 0067 removed the room's "Let people watch"; this is asked
again at every connection. A spectator gets `MATCH_HELLO` with `seat: 0`
and `spectator: true`, then the **public view** (a `MATCH_SNAPSHOT` whose
state has `spectator: true` and `viewFrom`: no hand, nothing face down)
carrying the **public play log** so far (spec 0067: only what every
player may see, `MATCH_STATE_VISIBILITY.md`), `MATCH_STEP`, and
`MATCH_ASKING`. It is never asked anything, and whatever it sends is
dropped. The players get `WATCHING` (`count`, people watching, and spec
0067's `names`: their display names, each person once) as it changes.
The worker builds the public view only while somebody is watching
(`WATCHED`, `FORGE_WORKER_RUNTIME.md`).

**The end, for spectators (spec 0067).** When the match ends -- any way:
a result, an abandon, a failure, a server stop -- every spectator
connection is sent `MATCH_ENDED` (`matchId`, `status`, `failureCode?`,
and the result as the lobby's `MATCH` carries it: `outcome`,
`winningSeat`, `endedOnTurn`, `reason?`, `concededSeat?`,
`lossReason?`; by seat, never a name) and then closed with `1000`
"game over"; the page does not reconnect after it. The server keeps the
last 64 endings: a non-player who connects to a match that ended here
lately (a spectator whose connection dropped at the end) is sent its
`MATCH_ENDED` and closed the same way, instead of `1008`. A dropped
spectator connection otherwise reconnects like a player's.

### On connect, in this order (§6.110)

```text
WATCHING          count, names -- only when somebody is watching
MATCH_HELLO       matchId, seat, awayMinutes (spec 0054: when "End the
                  game" is offered), spectator? (seat 0)
MATCH_SNAPSHOT    the board as THIS player may see it      (if any yet)
DECISION_REQUEST  the question still waiting for this player (if any)
MATCH_ASKING      who is being asked now
```

State before the question: a question names objects by id, so the board
that holds them arrives first. Proven over every question of every
regression game (P6-L, `scripts/check-snapshot-first.py`).

### Server → browser

```text
MATCH_SNAPSHOT          state: viewer snapshot (below)
MATCH_STEP              state: the step bar's state -- a step nobody is asked
                        at; public, the cards stay as the last board has them
                        (PHASE_07 Amendment 13)
WATCHING                count: people watching (spec 0047), to the players;
                        names: who, by display name (spec 0067)
MATCH_ENDED             spec 0067, to spectators only: the game is over --
                        status, failureCode?, outcome, winningSeat,
                        endedOnTurn, reason?, concededSeat?, lossReason?;
                        the socket is then closed (1000 "game over")
DECISION_REQUEST        decisionId, actedForSeat, kind, stateVersion, gameEpoch,
                        mandatory, prompt?, options: [{actionId, label,
                        objectId?, payable?, cost?, types?}], searchable?,
                        optionCount?,
                        unavailable?: {objectId: reason}  -- why each of your
                        cards NOT offered cannot act now (PHASE_07 B7),
                        about?: {name, kind, from?} -- the spell or ability a
                        question you can back out of is about (Cancel's words),
                        looking?: [card] -- cards this question shows you alone
                        (a scry's or surveil's top cards; spec 0001 D3),
                        window?: true -- a response window: your OWN spell or
                        trigger is on top (spec 0005, Phase 8 Amendment 4),
                        notNow?: {objectId: [{label, why, use?}]} -- abilities
                        not offered now (Phase 9 W-16), and the play a card
                        can't make when its only choices throw it away
                        (spec 0061),
                        owing?: "{1}{R}" -- mana still due on a payment
                        (Phase 9 Amendment 13),
                        arrange?: how a window lays the question out -- a
                        card tray (to, first, shuffle, zone, split, piles),
                        combat damage, a number (values, canMake, keyword,
                        each, says), a split (total, targets, at, values),
                        naming a card (title, says, objects); Phase 9,
                        field by field in protocol/README.md,
                        picking?: {word, tone, lean?, picked: [{objectId,
                        actionId, label}]} -- a cost paid card by card: what
                        it does to the cards picked so far and which they
                        are; each picked's actionId ("unpick:card:N") takes
                        it back, an answer accepted beside the options and
                        never one of them (spec 0070; the asking seat only).
                        Spec 0071: also on a window's one-at-a-time picks
                        (chooseEntitiesForEffect of two or more cards --
                        Escape, Delve, a search's "up to two"); same shape
DECISION_ACCEPTED       decisionId -- a receipt, not a game event
DECISION_REFUSED        decisionId, reason
DECISION_CLEARED        nothing is waiting on you
MATCH_ASKING            seat: the seat being asked now, or null -- nobody is,
                        the rules engine is working. To every participant,
                        on every change and on connect (spec 0002)
DECISION_OPTIONS        decisionId, query, total, options   (search results; each
                        with cost? and types?, Phase 9 W-12)
DECISION_SEARCH_REFUSED decisionId, reason
CONCEDE_ACCEPTED        the concession went to Forge; the end follows (PHASE_07 §7.55)
CONCEDE_REFUSED         reason: NOT_A_PLAYER, UNREACHABLE, NOT_STARTED, GAME_OVER
                        (and the worker's NO_GAME, NO_SEAT)
SERVER_STOPPING         spec 0056: the server is stopping under this game (an
                        update); it ends as FAILED_RUNTIME / SERVER_RESTARTED
                        with no result. No other fields: the page has the words
AWAY_END_ACCEPTED       spec 0054: the other player's concession went to Forge
AWAY_END_REFUSED        reason: NOT_AWAY (back, or not gone long enough),
                        NOT_A_PLAYER, UNREACHABLE
```

A `DECISION_REQUEST` reaches only the player Forge is waiting on.
`actedForSeat` says whose decision it is (under Mindslaver, somebody
else's); who is *authorised* is the server's conclusion and is not sent
(§6.38, §6.100).

`MATCH_ASKING` (spec 0002, 2026-10-23) names the seat that is deciding —
the authorised one, so under Mindslaver the controller — to both players,
because "who is thinking" is what a real table shows and the screen
otherwise guessed it from priority ("Waiting for Pat" while nobody was
asked). It is a label only: nothing is answered on its strength, the
server still decides who may answer, and nothing about the question
travels with it.

### Browser → server

```text
DECISION_RESPONSE   decisionId, actionId     actionId null = pass
DECISION_SEARCH     decisionId, query        searchable questions only
CONCEDE             (nothing)                PHASE_07 §7.55: for your own seat
END_FOR_AWAY        (nothing)                spec 0054: the OTHER seat concedes, only
                                             once its player has been offline 10 min
```

**Spec 0054 — the player left waiting.** The one exception to "a
disconnect never concedes" (§6.111): when the other player has had no
lobby connection for 10 minutes (a server setting), the player still at
the table may send `END_FOR_AWAY`, and the server sends the worker
`CONCEDE` for the other seat, so the winner is still Forge's. The server
checks the time itself; the page only says when to offer it. A game is
never ended by a timer.

**Stops (spec 0035; was PHASE_07 §7.53, AMENDMENT 13).** One rule for
every player, nothing to save (`STOPS`, `PASS_TURN` and
`/api/matches/stops` are gone). The server marks each seat in
`START_GAME` with `"stops": true`; the worker then passes priority for
that player -- only priority, never a target, payment, block or other
question -- unless they hold something they could play AND the moment
is one the rule keeps: their Main 1 and Main 2, after they attack and
after blocks; on the opponent's turn before they attack (when something
could), after they attack, after blocks and the end step; the one step a
card of theirs works only in; and anything on the stack. The opponent's
spell or trigger is asked plainly; their OWN is asked as a **response
window** (spec 0005, Phase 8 Amendment 4) -- marked `window: true`, the
page counts down 5 seconds and passes for them if they let it run out;
clicking the countdown's words passes at once; the pause in its circle,
clicking a card they could play, the close look or a list pauses it until
they pass; a tab not in front never counts down (Phase 9 Amendments 13,
15). A sacrifice that makes mana
counts while something is on the stack; tapping for mana alone never
does. A seat without `stops` (the Mechanics Lab) is asked at every step.

**Only `decisionId` and `actionId` are read.** Not a seat, not a user,
not a Forge player id, not a state version: a client that could supply
those could answer for somebody else or defeat the staleness check
(§6.100). The answering seat is the authenticated user's.

## Viewer snapshots

One per player, built by the worker for that viewer from Forge's state;
the server does not re-filter or rebuild it (§6.42) -- it only adds the
picture addresses (`art`, `crop`) for the cards that viewer was sent
(`MATCH_ASSET_AUTHORIZATION.md`). Carries the turn, phase, active seat, `dayTime`, `gameEpoch`,
`stateRevision`, every player's public totals and Forge state
(counters, designations, command zone, Ring temptations, completed
dungeons), and the zones this viewer may see: `hand` (own), `otherHands`
(only what Forge reveals; spec 0070: a card revealed to this viewer stays
there, `seen`, until it leaves that hand -- and a `hand` card another seat
has seen carries `seen` too), `battlefield`, `graveyard`, `exile`,
`stack`, plus `notices` -- Forge's messages to this player -- and
`action`: who searched, looked at or moved cards, in this reader's words
(Phase 9 Amendments 12, 13; never to the seat that chose; spec 0074
Amendment 1: counters, mills, cards out of a graveyard; spec 0075: a
bounce to the owner, the other player's cycling, choices and coin flips
with `marks` pictures, an empty look). Card actions are never told as
`notices` (spec 0075). Spec 0077: `life`, the round's changes to each
player's life and poison in Forge's order -- damage, loss, gain or poison,
with the amount and the source where it is known and the reader may see it
(an infect hit is poison, never damage) -- so the board can show each as
it lands; a presentation hint like the damage wave, the totals stay the
truth (PROTO-007). Spec 0078: a creature's move off the battlefield
carries `last`, its power and toughness as it last stood there, so a
creature killed by shrinking can be shown shrinking before it breaks; the
page works out every other size change by comparing two boards. Spec
0079: a copy says so (`copy`, and `copyOf` -- the card or stack entry it
copied, only while the reader may see it); a copied spell ending on the
stack moves to "nowhere"; a spell that fizzled has why "fizzled", and both
players get an `action` report ("Alice's Lightning Bolt did nothing: its
target was gone.") and a play-log line. Spec 0082: copies on their way
onto the stack (storm, Fork, a Strionic Resonator's copy of a trigger) are
sent in `copying` -- each while it is asked "new target?" (`aiming`) and
while Forge holds it until its maker has resolved -- never in `casting`;
copies of one batch carry a stable `group`, an ability copy is marked
`copy` too, and a prepared creature names its prepared spell (`prepared`),
a copy of it (`copyOf`) in exile and while it is cast; a cast copy (a token
spell) ends "nowhere". Spec 0083: a stack entry says `splitSecond` or
`cantBeCountered` (Forge's own checks), a Room its `locked` doors, a card
revealed from an opening hand reaches the other player's report window
(`reveal`, through turn 1), and identical replacement effects applied
without a question send `pulse` (their permanents) instead of a notice.
Spec 0084: a sacrifice that was a cost, its card's own ability or a Saga's
end is a move marked `spent` (an edict never is); `shuffles` names the
libraries shuffled, `crewed` each vehicle's crew, and a fight or bite
spell's damage wave says `fight` with its `fights`.
Spec 0085: a permanent says which keywords it `gained` (not printed), a
given "can't be blocked" (`unblockable`), that a creature lost all its
abilities (`lostAbilities`), and which exiled cards it `holds` (Banishing
Light's, an imprint, a Hideaway card; ids only, each named in `exile` as
the viewer may know it).
Spec 0080: phased-out permanents
are sent, flagged `phasedOut` (they were left out and drawn exiled), with
the round's `phased` changes; a flicker is one move ("flickered", `via`
its exile); `shields` and `indestructible` ride on a permanent; the
round's `survived` names a regeneration used or an indestructible
permanent something tried to destroy; prevented damage is a hit with
`prevented` (amount 0); and the other player's permanents phasing out
gives an `action` report ("Bob's permanents phased out until Bob's next
turn.", adding "Bob's life can't change." when the same effect left Forge a
CantChangeLife static ability for that player: Teferi's Protection). All public. What may
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
WRONG_SEAT         the worker's own gate: not the seat being asked
DUPLICATE          that question was already answered
STALE_DECISION     not the current question (e.g. from game 1 in game 2)
STALE_STATE        asked against a board that has moved on
UNREACHABLE        the match cannot be answered (worker gone)
NOT_YOURS          not a match you are in, or not you being asked
PASS_NOT_ALLOWED   a mandatory question
```

A search on a question that is not searchable is refused with
`DECISION_SEARCH_REFUSED`, reason `NOT_SEARCHABLE`.

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

When the game itself ends (a win, a draw, a concession), the final
snapshots are sent to every player before the end; a failure or an
abandon sends none (the worker is stopped). The match
then shows its result through the lobby (`ENDED` with the winner, or
`FAILED_*`/`TERMINATED` with no winner) and the question area is
cleared; a question from a finished match is never shown
(MATCH_RUNTIME.md).

**Concede (PHASE_07 §7.55)** is Forge's concession, not Arena's: the
server sends the worker `CONCEDE {seat}` for the authenticated user's own
seat; the worker queues it onto Forge's game thread (`DecisionGate.
interject`), where `Player.concede` and `checkGameOverCondition` run as in
Forge's own client, and every question still open is withdrawn. The game
then ends like any other, `ENDED` with Forge's winner, and the lobby's
`MATCH` message carries `concededSeat`. Refused with `NOT_STARTED` before
the game proper (the mulligan), as Forge's client refuses it; Abandon,
which has no winner, is the way out then. Proved against Forge by
`scripts/check-concede.py` and in the browser by `frontend/e2e/match-concede.spec.ts`.
