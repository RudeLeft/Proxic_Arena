# Proxic Arena Build Plan

# Phase 6 — Forge Match Runtime & Authoritative Game Protocol

**Status:** PROVISIONAL  
**Phase Type:** Core game-runtime implementation  
**Depends On:** Completed, tested, and accepted Phase 5  
**Primary Goal:** Launch, supervise, connect to, and complete real Forge-controlled matches through a stable Proxic browser protocol  
**Forge Authority:** REQUIRED  
**Available-Action Protocol:** REQUIRED  
**Match-Time Asset Plumbing:** REQUIRED  
**Final Graphical Battlefield:** NOT IMPLEMENTED IN THIS PHASE  
**Full Mechanics/UI Coverage:** NOT CLAIMED IN THIS PHASE  


> **PROVISIONAL, not LOCKED.** This phase was locked before Phase 0 was
> executed. Phase 0 exists to decide the architecture, so a locked
> specification downstream of it is a guess wearing a lock. Phase 0 has
> been split into `PHASE_00A` (blocking) and `PHASE_00B` (deferred with
> triggers); this phase may be locked once 0A is accepted.
>
> Content is unchanged. Only the status and the dependency notes below
> were added.

> **SCOPE AMENDMENT — 2026-10-15 (owner decision).**
> Proxic Arena supports **one play mode: Open Format** — 65-card deck
> maximum, no more than 4 copies of a specific card, unrestricted card
> pool, 2 players. **Commander and Two-Headed Giant are out of scope.**
> Wherever this document describes a format choice, a preset catalog,
> a command zone, teams or shared life, that content is **void**.
> See `docs/architecture/OPEN_FORMAT.md`.

**Phase 0A amendments to this phase (2026-10-15):**

- §6.46 — ids must be **typed**; card and stack id spaces overlap.
- §6.44 — both visibility questions, plus the empty-name trap.
- §6.189 **added** — the worker needs its own loop guard, because
  Forge's is AI-only.
- §6.190 **added** — verify that what Forge returned is what was
  asked for.
- P6-BH — replaced by zone coverage (Commander is out of scope).

See `docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md`.

**Phase-0A-dependent decisions in this phase: most of them.**

This is the phase 0A exists to inform.

- §6.20 — explicitly requires the accepted Forge architecture.
- §6.25–6.29 — the internal worker protocol, handshake and bootstrap come
  from 0A.5 and 0A.6.
- §6.39–6.45 — state ownership, viewer snapshots and hidden information
  come from 0A.7. Note 0A.7's warning that `canBeShownTo` is zone-level
  and `canFaceDownBeShownTo` governs identity — re-verify at the new pin.
- §6.46–6.47 — object identity comes from 0A.12 P0A-F.
- §6.33–6.36 — exact printing and identity mapping come from 0A.9A.
- §6.37 — control-another-player: 0A.8 requires the protocol to carry
  "acted for" separately from "authorized to answer"; the runtime test is
  0B.6.

Presentation deferred by this phase now has a home: Phase 7, which lists
every such deferral in its §7.4.

---

## 6.0 Purpose

Phase 6 crosses the boundary from a validated pre-game room into a real running Magic game.

Phase 5 produces:

```text
READY_FOR_MATCH
        ↓
immutable MATCH_SETUP
```

Phase 6 consumes that setup and creates:

```text
Arena Match
        ↓
Phase-0-selected Forge runtime
        ↓
real Forge Match/Game
        ↓
viewer-specific authoritative state
        ↓
Forge-derived available actions and decisions
        ↓
authenticated player responses
        ↓
Forge game mutation
        ↓
Forge-derived match result
```

The intended runtime chain is:

```text
Phase 5
READY_FOR_MATCH
        ↓
immutable MATCH_SETUP
        ↓
host launch request
        ↓
atomic setup claim
        ↓
Arena match record
        ↓
Forge worker/runtime launch
        ↓
Forge bootstrap
        ↓
normalized Arena decks → Forge decks
        ↓
Arena participants → Forge players/controllers
        ↓
Forge Match/Game created
        ↓
initial viewer-safe states available
        ↓
RUNNING
        ↓
real gameplay
        ↓
Forge reports game/match end
        ↓
Arena records result
        ↓
worker/runtime cleanup
```

Phase 6 establishes the permanent authority boundary:

```text
Browser
        ↓
Proxic Match Protocol
        ↓
Ktor Arena Server
        ↓
accepted Forge adapter / worker boundary
        ↓
Forge
```

Forge remains authoritative for:

```text
game rules
card behavior
current characteristics
available actions
legal actions
priority
costs
mana payments
targets
combat legality
replacement effects
trigger handling
random game outcomes
hidden-information visibility
alternate win/loss conditions
winner / loser / draw determination
```

Proxic Arena MUST NOT become a second Magic rules engine.

---

## 6.1 Phase 6 Execution Gate

Do not begin implementing Phase 6 until:

```text
Phase 0 has been executed, tested as required, and accepted.

Phase 1 has been fully implemented, tested, and accepted.

Phase 2 has been fully implemented, tested, and accepted.

Phase 3 has been fully implemented, tested, and accepted.

Phase 4 has been fully implemented, tested, and accepted.

Phase 5 has been fully implemented, tested, and accepted.
```

Only after those execution gates are satisfied may Phase 6 rely on:

```text
the Phase 0 accepted Forge architecture
the Phase 0 pinned Forge commit
the Phase 0 accepted Forge adapter strategy
the Phase 0 accepted worker/process isolation strategy
the Phase 0 accepted internal protocol
the Phase 0 accepted hidden-information model
the Phase 0 accepted decision/control model
Forge bootstrap/resource requirements proven by Phase 0

authenticated Arena users
stable Arena user IDs
authenticated HTTP and WebSocket identity
Phase 3 CSRF and same-origin protections

Deck Depot deck IDs
Deck Depot authorization
canUseDeck(userId, deckId)
normalized immutable imported decks
Forge-resolved card identities
imported card PNGs

Phase 5 rooms
Phase 5 player seats
Phase 5 supported match presets
Phase 5 immutable MATCH_SETUP snapshots
Phase 5 READY_FOR_MATCH state
```

If implementation evidence contradicts a locked prior-phase requirement:

**STOP AND REPORT THE CONFLICT.**

Do not silently replace or reinterpret the earlier architecture.

---

## 6.2 Required Architecture Documents

Before implementation, the coding agent must read the actual project copies of:

```text
docs/phases/PHASE_00_FORGE_ARCHITECTURE_VALIDATION.md

docs/research/phase-00/FINAL_RECOMMENDATION.md

docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md

docs/architecture/MATCH_SETUP_CONTRACT.md
```

If filenames differ because the implemented project uses an approved equivalent, locate the authoritative documents rather than guessing.

The accepted Phase 0 result controls exact Forge implementation details.

Phase 6 MUST NOT reopen the Phase 0 architecture choice merely because another integration approach appears convenient.

---

## 6.3 Project Paths and Read-Only Boundaries

### New authoritative project

Build only in:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena
```

### Old Arena reference

Reference only:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

The old Arena may be inspected for lessons including:

```text
BridgeMain
PlayerControllerNetwork
DecisionChannel
StateSnapshot
GameEventTranslator
worker lifecycle
request/response IDs
duplicate response handling
reconnect handling
hidden-information handling
real-game regression tests
```

It MUST NOT be:

```text
modified
renamed
deleted
used as the production build location
silently migrated
```

### Proxic Deck Builder

Strictly read-only:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder
```

Phase 6 MUST NOT modify:

```text
Deck Builder source
Deck Builder exporter
Deck Builder dependencies
Deck Builder tests
Deck Builder configuration
Deck Builder generated project files
```

If Phase 6 exposes an incompatibility with the deck package, report it rather than changing Deck Builder.

---

## 6.4 Mechanics Lab Canonical Test Corpus

The project contains a canonical Mechanics Lab test corpus at:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena\Test Deck
```

Before implementing or claiming Phase 6 mechanics/runtime coverage, inspect the actual project-local:

```text
Mechanics Lab TXT source deck

Mechanics Lab CSV coverage classification
```

Expected project-local filenames are conceptually:

```text
Proxic_Arena_Mechanics_Lab_SOURCE.txt

Proxic_Arena_Mechanics_Lab_Coverage.csv
```

Use the actual filenames present in the folder.

### Source-of-truth roles

The TXT/source deck is authoritative for:

```text
card entries
quantities
set codes
collector/printing identifiers where supplied
multiface card names as exported
the actual test deck contents
```

The CSV is authoritative for:

```text
why a card is in the corpus
mechanic/stress-case classification
coverage intent
category grouping
```

Do not replace either file with a simplified list copied from this phase document.

### Test-corpus mutation

Treat both project-local Mechanics Lab source files as read-only test inputs during implementation.

Do not edit, regenerate, normalize, reorder, or rewrite them unless the project owner explicitly authorizes a test-corpus change.

---

## 6.5 Mechanics Lab Coverage Document

Create and maintain:

```text
docs/testing/MECHANICS_LAB_COVERAGE.md
```

This file is the implementation-facing coverage ledger.

It must derive its initial intent from the actual TXT/CSV files in `Test Deck`.

Track important scenarios with fields equivalent to:

```text
Card / Scenario
Source Printing
Category
Mechanic / Stress Case
Phase Owner
Required vs Exploratory
Focused Test Scenario
Forge Support Status
Proxic Support Status
Current Result
Evidence
Known Issue / Blocker
Notes
```

Useful implementation statuses include:

```text
P6_REQUIRED
P7_PRESENTATION
P8_COVERAGE

PASSED
FAILED
NOT_YET_TESTED

BLOCKED_BY_FORGE
BLOCKED_BY_DECK_PACKAGE
BLOCKED_BY_PROTOCOL
BLOCKED_BY_UNSUPPORTED_PRESET
```

Do not claim mechanic support merely because the full Mechanics Lab deck imports successfully.

---

## 6.6 Mechanics Lab Test Strategy

The Mechanics Lab corpus has three distinct uses.

### Layer A — Full corpus smoke test

Use the full actual Deck Builder package / source corpus to prove:

```text
package import succeeds
card identities resolve
Forge deck construction succeeds
printing identity is preserved as required
artwork mapping succeeds
worker/runtime can load the deck
```

This test DOES NOT prove every mechanic works.

### Layer B — Focused deterministic mechanics scenarios

Create focused test decks/scenarios derived from the corpus so required cards can be reached predictably.

Examples include:

```text
Agent of Kotis
Karn Liberated
Panglacial Wurm
Pithing Needle
Adaptive Automaton
Mind Bend
Leyline of the Void
Gemrazer
Invasion of Zendikar
Room cards
Prepare cards
alternate win/loss cards
multiplayer voting cards
complex cost/mode cards
```

Do not rely on lucky draws from the giant singleton corpus for mandatory acceptance.

### Layer C — Protocol harness

Use the real Proxic match protocol through an automated harness to repeatedly test:

```text
object identity
available actions
decisions
wrong-user rejection
duplicate rejection
stale rejection
hidden information
reconnect
runtime failure
```

The harness must exercise the same authority boundaries as the real browser.

It must not use a privileged test-only gameplay bypass.

---

## 6.7 Phase Boundary

Phase 6 owns:

```text
match records
match participant records
atomic MATCH_SETUP consumption
room transition into IN_MATCH
Forge runtime launch
Forge bootstrap
Forge deck construction
Forge player/controller construction
Forge Match/Game construction
worker/process supervision
worker/runtime isolation
match lifecycle
browser match WebSocket
viewer-specific authoritative snapshots
hidden-information sanitization
stable object identity
Forge-derived available-action discovery
semantic action identity
semantic decision transport
decision authorization
wrong-user rejection
duplicate/stale response protection
nested interaction contexts
pregame decisions
reconnect
pending decision replay
match-scoped artwork authorization/retrieval
normal Forge match completion
runtime failure handling
minimal result persistence
minimal functional browser match client
Mechanics Lab runtime coverage
```

Phase 6 does NOT own:

```text
final PixiJS battlefield
final battlefield layout
drag-and-drop polish
battlefield animations
card movement animations
tap/untap animations
combat arrows
final stack visualizer
final card zoom styling
final contextual action styling
final counter/badge styling
production responsive battlefield layout
complete mechanics-specific user experience
spectator mode
matchmaking
friends
match chat
replays
match-history product UI
tournament systems
```

---

# PART I — MATCH CREATION AND LIFECYCLE

## 6.8 Match Identity

Every Arena match receives an immutable:

```text
match_id
```

Use UUID.

`match_id` is distinct from:

```text
room_id
setup_id
worker_id
Forge player ID
Forge game ID
game_epoch
```

---

## 6.9 One Setup Creates At Most One Match

A Phase 5 `setup_id` may create at most one Arena match.

Enforce this in the database.

A race between duplicate launch requests MUST NOT start two Forge runtimes.

---

## 6.10 Match Launch Endpoint

Provide an authenticated, CSRF-protected operation equivalent to:

```text
POST /api/matches
```

with a request containing only the required setup reference, e.g.:

```json
{
  "setup_id": "..."
}
```

The browser MUST NOT authoritatively supply:

```text
participant user IDs
seat assignments
deck IDs
player count
preset ID
team identities
Forge options
```

Those come from the immutable Phase 5 setup.

---

## 6.11 Launch Authority

Only the host of the source prepared room may initiate normal launch.

A non-host participant cannot start the match.

ADMIN status does not automatically make a user the room host.

---

## 6.12 Launch Revalidation

Immediately before claiming the setup, revalidate:

```text
setup exists
setup.status = READY
setup has not been consumed
room is READY_FOR_MATCH
requester is source-room host

required users still exist
required users remain ACTIVE
required participants remain valid

all selected decks still exist
canUseDeck(userId, deckId) = true for every participant

preset remains enabled
player count remains valid
team topology remains valid when applicable

required Forge preflight assumptions remain valid
```

Do not trust only the Phase 5 validation performed earlier.

---

## 6.13 Atomic Match Claim

Conceptual launch transaction:

```text
lock READY setup
        ↓
revalidate
        ↓
create unique match record
status = LAUNCHING
        ↓
create immutable match participants
        ↓
commit
        ↓
launch Forge runtime
```

The database must prevent a second match from claiming the same setup.

---

## 6.14 Setup Consumption Milestone

Do not set:

```text
setup = CONSUMED
```

merely because an operating-system process/JVM was created.

The setup becomes `CONSUMED` only after the runtime proves:

```text
Forge bootstrap succeeded
Forge identity/version verified
decks loaded
players mapped
Match/Game constructed
required hooks/controllers attached
initial viewer states available
runtime is ready for player input
```

At that successful milestone:

```text
match = RUNNING
setup = CONSUMED
room = IN_MATCH
```

---

## 6.15 Startup Failure

If failure occurs before the successful running milestone:

```text
match = FAILED_STARTUP
setup = INVALIDATED
room = OPEN
Phase 5 ready flags = false
```

Clean worker/runtime resources.

Do not repeatedly recycle the failed immutable setup.

Players must prepare a new valid setup.

---

## 6.16 Room IN_MATCH

Phase 6 extends the room lifecycle with:

```text
IN_MATCH
```

While `IN_MATCH`:

```text
no new participant may join
decks cannot change
preset cannot change
seat topology cannot change
Phase 5 ready state no longer controls gameplay
```

The live Forge match becomes authoritative.

---

## 6.17 Match Lifecycle

Required conceptual lifecycle:

```text
LAUNCHING
RUNNING
ENDED
FAILED_STARTUP
FAILED_RUNTIME
TERMINATED
```

### LAUNCHING

Match record exists, but Forge has not reached the accepted running milestone.

### RUNNING

Forge is alive and authoritative; viewer state exists and gameplay input may occur.

### ENDED

Forge reported normal match/game completion.

### FAILED_STARTUP

No valid running game was established.

### FAILED_RUNTIME

A previously RUNNING match became unusable due to a runtime failure.

### TERMINATED

Intentional operational termination that is not itself a Forge game result.

Do not use runtime failure/termination as a substitute Magic win or loss.

---

## 6.18 Match Database Record

Conceptually store:

```text
matches
├── match_id
├── setup_id
├── room_id
├── status
├── preset_id
├── forge_commit
├── forge_version/build identity
├── worker_protocol_version
├── public_match_protocol_version
├── created_at
├── started_at
├── ended_at
├── failure_code nullable
└── result metadata
```

Do not store secrets.

---

## 6.19 Match Participants

Persist immutable participant mapping:

```text
match_participants
├── match_id
├── user_id
├── seat_number
├── team_id nullable
├── deck_id
├── display_name_snapshot
└── ...
```

Enforce:

```text
unique user per match
unique seat per match
```

---

# PART II — FORGE RUNTIME

## 6.20 Accepted Forge Architecture Only

Use exactly the architecture selected and accepted by Phase 0.

Examples of possibilities Phase 0 may have evaluated include:

```text
one isolated JVM per match
Forge network implementation
custom PlayerController
hybrid adapter
```

Phase 6 does not choose among them again.

If the Phase 0 accepted design proves impossible against the actual pinned Forge checkout:

**STOP AND REPORT THE CONTRADICTION.**

---

## 6.21 Forge Preservation

Forge should remain as intact upstream source/dependency as Phase 0 allows.

Do not:

```text
copy Forge implementation classes into Proxic casually
rewrite card logic
add scattered Proxic changes to Forge
modify upstream classes without approval
```

Prefer the accepted:

```text
adapter
wrapper
composition
subclassing
public/protected API
```

strategy.

Reflection, if already accepted by Phase 0, must remain explicitly documented and regression-tested.

---

## 6.22 Forge Patch Escalation

If an upstream Forge modification appears unavoidable:

**STOP BEFORE APPLYING IT.**

Produce:

```text
FORGE PATCH REQUEST

Pinned Forge commit:
Problem:
Exact Forge class/file:
Why supported adapter approaches fail:
Smallest proposed patch:
Update/merge risk:
Required regression test:
Recommendation:
```

No silent Forge patch is permitted.

---

## 6.23 Worker Isolation

Where the accepted architecture uses isolated workers:

```text
one running match
=
one isolated Forge runtime
```

No mutable game state is shared between matches.

---

## 6.24 Worker Privacy

Expected trust boundary:

```text
Browser
  ↓ HTTPS/WSS
Cloudflare
  ↓
Ktor Arena Server
  ↓ private internal boundary
Forge Match Runtime
```

Forge runtime endpoints/process protocol MUST NOT be publicly exposed.

The browser never talks directly to Forge.

---

## 6.25 Internal Protocol

Use the exact Phase 0 selected internal server↔worker protocol.

Document its production form.

Do not silently swap transport because another mechanism appears simpler.

---

## 6.26 Protocol/Forge Handshake

Worker launch must establish and verify:

```text
worker protocol version
worker build identity
expected pinned Forge commit/version
```

Mismatch causes safe startup failure.

Do not permit silent Forge drift.

---

## 6.27 Forge Bootstrap

Use the actual current bootstrap requirements proven in Phase 0.

Historical old-project lessons showed headless Forge can depend on initialization/resources including:

```text
localization
language setup
card type definitions
card scripts
token scripts
StaticData
edition data
block/set lookup data
custom data paths
```

Do not remove required initialization simply because ordinary cards still appear to load.

---

## 6.28 Machine-Readable Output Integrity

If stdout is part of the accepted worker protocol:

```text
stdout = protocol only
```

Forge diagnostics belong on:

```text
stderr
or
another structured log channel
```

Random Forge logging must never corrupt the machine protocol.

---

## 6.29 Worker Startup Timeout

Use a configurable startup timeout derived from measured behavior.

On timeout:

```text
terminate runtime
mark FAILED_STARTUP
invalidate setup
return room to OPEN
clean temporary runtime state
```

Human gameplay decisions do not use this startup timeout.

---

## 6.30 Runtime Directory

If per-match temporary files are needed, use a private path such as:

```text
/data/runtime/matches/<match-id>/
```

or the accepted equivalent.

The runtime directory is not persistent Deck Depot storage.

---

## 6.31 Imported Deck Immutability

Do not modify:

```text
/data/decks/<deck-id>/
```

during gameplay.

Match execution may read imported normalized data and artwork.

It must not rewrite the original imported deck.

---

## 6.32 Forge Deck Construction

Construct Forge decks from the normalized Forge-resolved Arena deck representation.

Do not require the browser to send an authoritative card list.

Do not reparse the original ZIP during every match when the normalized representation already contains the required identity.

---

## 6.33 Exact Printing

Where the locked Phase 2 package contract preserves exact printing/set/collector identity and Forge supports it:

preserve that identity when constructing the Forge deck.

Do not silently downgrade to name-only resolution.

---

## 6.34 PNGs Are Not Rules Identity

Imported PNG artwork is presentation data.

It must never determine which Forge card/rules object is used.

---

# PART III — PLAYER, VIEWER, AND CONTROL IDENTITY

## 6.35 Identity Dimensions

Do not overload a single `player_id`.

Keep distinct:

```text
Arena user ID
match participant
seat
team
Forge player identity
object owner
object controller
decision subject
decision controller
viewer
active player
priority holder
```

These may coincide frequently.

They are not semantically identical.

---

## 6.36 Explicit Mapping

Maintain an explicit chain:

```text
Arena user
        ↓
match participant
        ↓
seat/team
        ↓
Forge player
```

The browser cannot authoritatively choose the Forge player identity.

---

## 6.37 Control-Another-Player Effects

The runtime MUST support the Phase 0 accepted control model for effects such as Mindslaver.

Never hardcode:

```text
decision concerning Forge Player in Seat N
=
Arena owner of Seat N answers
```

When Forge changes who controls another player's decisions, the adapter determines the current authorized Arena user.

---

## 6.38 Decision Controller

When Forge requests a human decision, preserve enough semantic identity to know:

```text
Forge player affected by the decision
current Forge controller of that decision
Arena user authorized to answer
viewer receiving private decision data
```

The client never decides this mapping.

---

# PART IV — AUTHORITATIVE STATE AND VISIBILITY

## 6.39 Forge Owns Live Game State

The authoritative live game state resides in Forge.

React is a view.

Ktor is a secure transport/translation/orchestration layer.

PostgreSQL is lifecycle persistence.

None of those becomes a parallel Magic engine.

---

## 6.40 Viewer-Specific Snapshots

Define a semantic browser-facing:

```text
MATCH_SNAPSHOT
```

Every snapshot is generated for a specific authorized viewer.

Two players in the same game may receive different snapshots.

---

## 6.41 State Revision

Every authoritative state update carries a monotonically increasing:

```text
state_revision
```

Use one documented match-state revision strategy.

---

## 6.42 Hidden Information Removed Server-Side

Do not send hidden opponent information to the browser and hide it with CSS/React.

The server/worker translation layer must omit or replace hidden information before serialization to that viewer.

---

## 6.43 Forge Visibility Is Authoritative

Do not implement simplified visibility rules such as:

```text
hand = hidden
battlefield = visible
```

Use Forge's actual current visibility semantics.

---

## 6.44 Face-Down Safety

Preserve the Phase 0 accepted face-down visibility solution.

A face-down permanent may have different visibility to:

```text
controller
opponent
other authorized viewer
```

An unauthorized opponent must not receive the real identity or real front-face asset.

**Phase 0A supplies the accepted solution, and both halves are
required.**

```text
canBeShownTo          ZONE-level     -- returns TRUE unconditionally
                                        for the battlefield
canFaceDownBeShownTo  IDENTITY-level -- the one that governs a
                                        face-down permanent
```

Ask **both**, per card, per viewer. Proven by deliberately breaking
each:

```text
[RUN] zone-level check only      -> 5 distinct face-down creatures
                                    leaked their identity
[RUN] trusting Card.getName()    -> 650 nameless sightings; the card
                                    was blanked for its OWN controller
```

A player may look at their own face-down permanents (CR 713.4a), so
blanking everything is equally wrong.

**`Card.getName()` returns the CURRENT state's name, which for a
face-down card is the EMPTY STRING — not null.** Fall back to the
original state, and require a *meaningful* name: "not null" is not
"identifies the card". Three separate Phase 0A bugs trace to this.

A guard that never fired is not a verified guard (AGENTS HID-004):
test with a deck that actually produces face-down permanents.

---

## 6.45 Hidden-Information Regression

Run actual production-boundary tests for applicable scenarios including:

```text
opponent hand
library contents
face-down permanents
revealed cards
look-at effects
known hidden cards
temporary visibility
private decision candidates
hidden artwork references
```

Use the Phase 0 H-series scenarios where defined.

---

## 6.46 Stable Object Identity  *(amended 2026-10-15)*

Every exposed live game object receives a stable match/game-instance object identifier.

Do not use card name as game-object identity.

Multiple copies of a card may exist.

**Phase 0A supplies the identifier, and one hard constraint.**

`Card.getId()` is stable for the lifetime of a match, including across
zone changes:

```text
[RUN] distinct ids per game = cards + tokens, nothing more
      none recycled, none duplicated
      20-24 ids observed in more than one zone
```

But ids are **not unique across object kinds**:

```text
[RUN] card ids   [1..130]
      stack ids  [1.. 18]   -- entirely inside the card range
```

`SpellAbilityStackInstance.getId()` counts from 1 independently of
`Card.getId()`. One run caught a stack instance whose id equalled its
own source card's.

> **IDS MUST BE TYPED ON THE WIRE** — `card:51`, `stack:3`,
> `ability:266`, or an equivalent explicit kind field. A bare integer
> cannot identify a game object.

This also makes §6.55's `object_id` vs `action_id` distinction
explicit rather than conventional.

**Known limitation:** CR 400.7 says an object changing zones becomes a
*new* object. Forge does not reflect that in the id. If a rule ever
depends on new-object-ness, represent it separately — it cannot be
inferred from an id change, because there is none.

---

## 6.47 Candidate/Snapshot Identity Invariant

For the same current Forge game object:

```text
action/decision candidate object ID
=
snapshot object ID
```

The browser must never need to guess correspondence by name.

---

## 6.48 Snapshot-Before-Interaction Invariant

If an action or decision references a newly relevant object:

```text
send sufficient current viewer state first
        ↓
then send the action/decision
```

A client must not receive an interaction referencing an object it cannot identify from current state.

---

## 6.49 Events Are Presentation Hints

Forge events may be translated for presentation.

They do not supersede the authoritative snapshot.

Principle:

```text
snapshot = current authoritative viewer state
event    = contextual/presentation hint
```

If they disagree:

```text
snapshot wins
```

Do not require event replay to reconstruct the game on reconnect.

---

# PART V — AVAILABLE ACTION MODEL

## 6.50 Core Action Authority

Available gameplay actions originate from Forge/current Forge interaction context.

The browser MUST NOT infer legal gameplay actions from:

```text
printed card type
printed rules text
zone alone
mana cost alone
card name
visual position
```

---

## 6.51 Multi-Action Object Invariant

A visible/selectable game object may expose:

```text
zero actions
one action
multiple actions
```

depending on current Forge state.

Possible influences include:

```text
zone
phase
step
priority
controller
cost state
continuous effects
temporary permissions
temporary prohibitions
current selection/decision context
card-specific abilities
```

Do not collapse the object to one default action.

---

## 6.52 Prohibited Creature Shortcut

This architecture is prohibited:

```text
if card.type == CREATURE:
    click = attack
```

A creature can:

```text
attack when Forge permits
activate abilities
participate in another selection
have no legal action
gain/lose abilities
change type
move zones and expose different actions
```

Card type does not permanently define click semantics.

---

## 6.53 Selection Is Not Execution

At protocol level:

```text
select / focus object
```

is distinct from:

```text
perform game action
```

Phase 7 may make interaction convenient, but it cannot erase this semantic distinction.

---

## 6.54 Action Identity

A discrete current Forge-provided action must have a server-issued semantic identity where required.

Conceptually:

```json
{
  "action_id": "...",
  "source_object_id": "...",
  "kind": "ACTIVATE_ABILITY",
  "label": "Renew"
}
```

Exact protocol shape must reflect the accepted Forge integration.

The browser chooses an `action_id`.

It does not reconstruct an action by parsing text.

---

## 6.55 Object ID vs Action ID

These are different:

```text
source_object_id
action_id
```

One source object may have multiple action IDs.

One action may later create/use another Forge object.

Never assume:

```text
one object = one action
```

---

## 6.56 Zone-Dependent Actions

The same card identity may expose different actions in:

```text
hand
battlefield
graveyard
exile
command zone
library or another zone when Forge permits
```

After a zone transition, derive action availability again from current Forge state.

Do not cache the object's old action identity as permanent behavior.

---

## 6.57 Combat Is Contextual

Attack declaration is a Forge interaction context.

During a Forge-provided declare-attackers decision:

```text
legal attacker candidates
```

may be clicked/toggled as attackers.

This does not imply that primary-clicking that creature outside the combat context means attack.

---

## 6.58 Multiple Abilities Remain Discoverable

If Forge exposes:

```text
Action A
Action B
Action C
```

for one object, Proxic must preserve all of them.

Do not:

```text
silently choose Action A
hide B/C
make B/C unreachable behind a hardcoded default
```

---

## 6.59 Same Action in Multiple UI Surfaces

Phase 7 may display the same current `action_id` in more than one UI surface.

For example:

```text
selected-card contextual actions
        ↓
[ Renew ]
```

and:

```text
inspect/zoom panel
        ↓
[ Renew ]
```

Both MUST invoke the same Phase 6 semantic action.

Do not create separate mechanic implementations for each visual location.

---

## 6.60 Agent of Kotis Regression

Agent of Kotis in the Mechanics Lab is a mandatory regression fixture.

The purpose is to prove the generic zone-dependent action architecture.

### Battlefield

When Agent of Kotis is on the battlefield:

```text
do not invent Renew from printed text
do not map Creature → Attack
```

If Forge exposes it as a legal attacker during an attack declaration:

```text
current Forge combat context
        ↓
Agent object is a legal candidate
        ↓
browser may select/toggle it
```

### Graveyard

After the same card reaches the graveyard, when Forge exposes Renew as currently legal:

```text
graveyard object
        ↓
Forge-provided Renew action
        ↓
distinct action_id
        ↓
browser displays action
        ↓
user chooses action
        ↓
Forge handles costs/targets/effect
```

Arena MUST NOT independently implement:

```text
Renew timing
Renew costs
Renew target legality
Renew effect
```

No Agent-of-Kotis-specific client rule is permitted.

---

## 6.61 Generic Multi-Action Regression

In addition to Agent of Kotis, test at least one real Forge-supported scenario where one source object exposes multiple meaningful user-selectable actions.

Prove:

```text
one object
        ↓
multiple Forge-derived actions
        ↓
distinct action identities
        ↓
player chooses intended action
```

No legal action may become unreachable because another action was treated as "the default."

---

# PART VI — NESTED INTERACTION CONTEXTS

## 6.62 No Flat One-Decision Assumption

Do not assume:

```text
interaction starts
        ↓
interaction fully ends
        ↓
only then may another legal action appear
```

Magic can expose legal actions during another process.

The architecture must preserve the actual Forge interaction model.

---

## 6.63 Panglacial Wurm Regression

The Mechanics Lab includes Panglacial Wurm and supporting stress cases such as search effects and cards relevant to actions/casting from unusual zones.

Use a focused deterministic scenario to prove the browser/protocol does not flatten away a legal Forge action merely because another search/selection context is active.

Conceptually:

```text
search library
        ↓
search context remains active
        ↓
Forge exposes an additional legal action
        ↓
player chooses that action
        ↓
nested casting/cost decisions occur
        ↓
Forge returns to/completes the correct surrounding process
```

Do not hardcode Panglacial Wurm behavior.

---

## 6.64 Nested Context Identity

If Forge exposes nested human interactions, preserve enough context to reject:

```text
response intended for parent interaction applied to child
response intended for child applied to parent
stale action from earlier context
```

The exact implementation must follow Phase 0/Forge capabilities.

---

## 6.65 Rules-Version Regression

The Mechanics Lab must be used to detect rule/Forge regressions involving unusual interactions.

When expected current behavior appears inconsistent:

```text
verify pinned Forge behavior
record exact Forge revision
record exact test
compare with authoritative project evidence if needed
```

Do not "fix" the Magic rule in Kotlin/TypeScript.

If Forge itself appears wrong and the mismatch matters to supported play:

**STOP AND REPORT IT.**

---

# PART VII — PRE-GAME INTERACTIONS

## 6.66 Game Does Not Begin at Main Phase 1 by Assumption

The runtime must support Forge-driven pregame state and decisions.

At minimum account for applicable:

```text
starting-player determination
opening hands
mulligan decisions
pregame actions
pregame effects
transition into first turn
```

---

## 6.67 Pregame Uses Same Authority Model

Pregame interactions use the same principles:

```text
Forge supplies legal options
server routes to authorized user
browser chooses server-issued option
Forge applies result
```

Do not implement separate client-side Magic rules for mulligans or pregame cards.

---

## 6.68 Leyline-Style Regression

The Mechanics Lab contains Leyline of the Void.

Use it or another real accepted Forge scenario to prove a legal opening-hand/pregame action can be represented without pretending the card was cast normally from hand.

---

# PART VIII — GAME RESTART / GAME EPOCH

## 6.69 Arena Match Is Not Necessarily One Forge Game Instance

Do not assume:

```text
one Arena match_id
=
exactly one immutable Forge Game object forever
```

Some supported Forge card behavior can restart/recreate the game while the overarching Arena match remains the same user session.

---

## 6.70 Game Epoch

Introduce an explicit semantic concept equivalent to:

```text
game_epoch
```

or another Phase-0-compatible game-instance generation identifier.

Conceptually:

```text
Arena match
    ├── game_epoch 1
    └── game_epoch 2
```

The exact representation may follow the Forge adapter, but stale identity across a game restart must be impossible.

---

## 6.71 Epoch-Scoped Identity

When a Forge game restart occurs:

all prior-game:

```text
object IDs
action IDs
decision IDs
pending interaction IDs
state revisions scoped to the old game instance
```

must become invalid.

Do not accidentally allow an old card/action ID to target a new post-restart object.

---

## 6.72 Karn Liberated Regression

The Mechanics Lab contains Karn Liberated specifically to stress restart-the-game behavior.

If current pinned Forge supports the card's restart behavior through the accepted runtime:

test it.

Required outcome:

```text
Arena match_id remains coherent
Forge performs the restart
new authoritative game state appears
old pending interactions are dead
old object/action/decision IDs cannot be reused
browser receives new current state
```

Arena does not simulate Karn's rules.

If Forge cannot support the scenario through the accepted architecture:

classify it accurately in `MECHANICS_LAB_COVERAGE.md` and escalate if it blocks claimed Phase 6 support.

---

# PART IX — NON-OBJECT CHOICES

## 6.73 Not Every Choice Is a Game Object

Do not assume every decision candidate corresponds to a current card/permanent/player object.

The Mechanics Lab contains cases requiring semantic values such as:

```text
card name
creature type
color
basic land type
mode labels
numeric values
```

---

## 6.74 Server/Forge-Backed Choice Catalogs

Support semantic decision kinds or a generic catalog-choice system suitable for choices such as:

```text
CHOOSE_CARD_NAME
CHOOSE_CREATURE_TYPE
CHOOSE_COLOR
CHOOSE_BASIC_LAND_TYPE
```

Exact message names may follow the final protocol.

The important rule is:

```text
allowed values originate from Forge/server authoritative rules data
```

The browser must not contain its own independently maintained Magic vocabulary as rules authority.

---

## 6.75 Pithing Needle Regression

Use Pithing Needle or another equivalent accepted Forge scenario to prove:

```text
choice is not restricted to cards currently on battlefield
choice is not inferred from visible objects
browser submits an authoritative catalog choice
Forge applies the named-card rule
```

---

## 6.76 Adaptive Automaton Regression

Use Adaptive Automaton or equivalent to prove creature-type choice can be represented without hardcoding a frontend creature-type rules list.

---

## 6.77 Mind Bend Regression

Use Mind Bend or equivalent to prove semantic non-object choices such as color/basic-land-type values can travel through the generic protocol.

---

# PART X — COMPOSITE OBJECTS, FACES, AND RELATIONSHIPS

## 6.78 Composite Object Invariant

A Forge game object is not guaranteed to correspond one-to-one with one printed card face.

The protocol/snapshot/asset architecture must accommodate Forge-supported cases including:

```text
double-faced cards
modal double-faced cards
transform
meld
mutate / merged permanents
split/adventure-like structures
Battles
Rooms
Prepare-related alternate representation
copies
tokens
changing characteristics
```

Do not design object identity around:

```text
one Forge object = one static PNG forever
```

---

## 6.79 Object Components

Where Forge exposes relevant component relationships, the snapshot must be able to represent them.

Examples include:

```text
component objects/cards
current visible face
merged permanent components
front/back identity
attached objects
```

The browser does not derive these structures from printed text.

---

## 6.80 Attachment / Relationship Model

The snapshot must support Forge-derived relationships needed for presentation and interaction, including as applicable:

```text
owner
controller
attached_to
equipped_to
enchanted_object
fortified_object
merged/component relation
```

Phase 7 must not reconstruct these relationships by parsing card text.

---

## 6.81 Multiface Asset Mapping

When Forge exposes a particular face/state:

the match asset layer maps to the correct authorized imported image where available.

The asset layer follows Forge-visible identity.

It does not determine the game's face/state.

---

## 6.82 Mechanics Lab Composite Regressions

Focused scenarios should cover representative accepted cases from the Mechanics Lab such as:

```text
Gemrazer / mutate
Room card
Battle
transforming card
multiface card
Prepare card
```

Use actual Forge support evidence.

Do not claim every category passed because one transforming card worked.

---

# PART XI — EFFECTIVE CHARACTERISTICS

## 6.83 Printed vs Current Characteristics

Hard invariant:

```text
printed characteristics
≠
necessarily current game characteristics
```

The browser must not treat imported card metadata as the live rules state.

---

## 6.84 Current Forge-Derived Characteristics

Where needed for safe presentation, interaction, and future Phase 7 rendering, use Forge-derived current values such as:

```text
controller
owner
types
subtypes
supertypes
color where relevant
power
toughness
loyalty/defense where relevant
tapped state
counters
face/state
token status
attachments
current visible name/identity when permitted
```

Do not implement Magic continuous-effect layers in TypeScript.

Do not implement them independently in Ktor.

---

## 6.85 Effective-Characteristics Regression

Use focused Mechanics Lab scenarios that stress current characteristics, including representative effects such as:

```text
type-changing effects
control-changing effects
continuous buffs/debuffs
Humility-like ability/characteristic changes
Blood Moon-like land changes
March of the Machines-like type changes
Station threshold/state changes
```

Test current Forge-derived state rather than printed metadata.

---

# PART XII — RANDOMNESS

## 6.86 Forge Is Gameplay RNG Authority

Forge is the sole gameplay authority for:

```text
shuffle results
random card selection
coin flips
die rolls
random ordering
other rules-defined randomness
```

The browser does not roll gameplay randomness.

Ktor does not independently reroll Forge outcomes.

---

## 6.87 RNG Presentation

The browser may display the result and presentation event after Forge produces it.

Presentation animation must not determine the outcome.

---

## 6.88 Test Seeding

Deterministic test RNG may be used only if the accepted Forge architecture provides a supported deterministic mechanism.

Do not patch or override Forge randomness solely for convenience without owner approval.

---

## 6.89 RNG Regression

Use Mechanics Lab cards such as real coin-flip/die-roll scenarios to prove:

```text
Forge decides result
browser displays result
reconnect does not reroll
duplicate response does not reroll
```

---

# PART XIII — MODES, COSTS, PAYMENTS, TARGETS

## 6.90 Generic Rich Choice Model

Phase 6 must not assume:

```text
CHOOSE_MODE = pick exactly one mode
```

The semantic interaction system must accommodate Forge-driven structures such as:

```text
zero/one/many modes where legal
multiple modes
repeated modes
bounded weighted modes
X values
alternative costs
additional costs
optional costs
mode-specific costs
mode-specific targets
cost resource assignment
ordering/cardinality requirements
```

---

## 6.91 Forge Determines Cost Legality

Arena MUST NOT independently calculate:

```text
which alternative cost is legal
which additional cost is required
what mana can pay a cost
cost reduction
cost increase
Phyrexian mana payment
convoke
delve
improvise
affinity
entwine
escalate
spree
X legality
```

Forge supplies the legal structure/options.

---

## 6.92 Mechanics Lab Cost/Mode Regressions

Use focused scenarios from cards classified in the Mechanics Lab coverage CSV, including representative examples such as:

```text
Cryptic Command
Collective Brutality
Three Steps Ahead
Season of Weaving
Tooth and Nail
Fireball
Dismember
Force of Will
Venerated Loxodon
Reverse Engineer
Treasure Cruise
Thoughtcast
```

The goal is generic protocol coverage.

Do not hardcode those cards.

---

## 6.93 Targets

Legal targets come from Forge.

A browser may submit only server-issued candidates for the current action/decision.

An arbitrary guessed object ID must fail.

---

## 6.94 Combat

Legal attackers, attack targets, blockers, assignments, and orderings come from Forge.

The UI may later make those interactions intuitive.

The protocol must remain Forge-driven.

---

# PART XIV — PLAYER, GLOBAL, AND NON-CARD STATE

## 6.95 Snapshot Is More Than Players + Cards

Do not design the snapshot as only:

```text
players
+
cards in zones
```

Magic contains player resources/designations and game-level state.

---

## 6.96 Extensible Forge-Derived State

The semantic snapshot must have a generic/extensible way to carry current Forge-derived state required for supported mechanics, including as applicable:

```text
energy
poison
experience
monarch
initiative
dungeon progress
Ring / Ring-bearer state
day/night
other player counters/resources
other global designations
```

Do not create a hardcoded rules implementation for each.

---

## 6.97 Mechanics Lab State Regressions

Use representative Mechanics Lab scenarios for:

```text
energy
poison
experience
monarch
initiative
dungeon
Ring
day/night
```

If an item is deferred to Phase 8, classify it explicitly rather than silently omitting it.

Phase 6 must at minimum ensure the protocol can carry the state without architectural redesign.

---

# PART XV — DECISION PROTOCOL

## 6.98 Decision Identity

Human decisions use explicit unique:

```text
decision_id
```

Decision IDs are match/game-instance scoped and one-time consumable.

---

## 6.99 Decision Request

Conceptual shape:

```json
{
  "type": "DECISION_REQUEST",
  "decision_id": "...",
  "state_revision": 123,
  "kind": "CHOOSE_FROM_LIST",
  "payload": {}
}
```

The exact schema follows the accepted worker adapter.

---

## 6.100 Decision Response

Conceptual shape:

```json
{
  "type": "DECISION_RESPONSE",
  "decision_id": "...",
  "payload": {}
}
```

The authenticated connection determines who answered.

Do not trust browser-supplied:

```text
from
user_id
seat
Forge player ID
```

as authority.

---

## 6.101 Decision Authorization

Accept a response only when:

```text
decision exists
decision belongs to this match/game instance
decision remains pending
authenticated user is the current authorized controller
response matches expected semantic kind
candidate/action IDs belong to the decision/context
required count/order/bounds are satisfied
decision has not already been consumed
```

---

## 6.102 Wrong User

If User B attempts to answer User A's current private decision:

```text
reject
```

Do not forward anything to Forge.

---

## 6.103 Duplicate Response

First valid accepted response wins.

A duplicate response MUST NOT execute twice.

Multiple browser tabs for the same authenticated user do not create duplicate logical players.

---

## 6.104 Stale Response

If Forge/current interaction has advanced:

reject the old decision/action ID.

Never apply it to the next interaction.

---

## 6.105 Unsupported Required Decision

If Forge requests a human interaction the Proxic semantic protocol cannot represent safely:

```text
do not choose randomly
do not choose first option
do not pass automatically
do not invent an answer
```

Transition the match to controlled:

```text
FAILED_RUNTIME
```

unless the accepted architecture provides a safe recoverable behavior.

Record exact evidence for future implementation.

---

## 6.106 Unsupported Interaction Report

Capture safe technical evidence:

```text
match_id
Forge commit
worker build
source Forge method/message
interaction semantic context
source object/card if safe
why current protocol cannot represent it
required new semantic capability
```

Do not leak hidden data to unrelated users.

---

# PART XVI — MATCH WEB SOCKET AND RECONNECT

## 6.107 Match WebSocket

Provide a protected endpoint equivalent to:

```text
/ws/matches/{matchId}
```

---

## 6.108 Authentication and Participation

Connection requires:

```text
valid authenticated Phase 3 session
ACTIVE account
authenticated user is a participant in this match
```

Knowing `match_id` is not sufficient.

No spectator access exists in Phase 6.

---

## 6.109 Multiple Connections

One participant may have multiple browser connections.

They remain one logical participant.

All may receive viewer state.

For a pending decision/action, first valid accepted input wins.

---

## 6.110 Initial Connection Sequence

On successful participant connection:

```text
MATCH_HELLO
        ↓
latest complete viewer-safe snapshot
        ↓
current still-valid available-action/decision state for that viewer
```

Do not send a decision before required state.

---

## 6.111 Reconnect Sequence

On reconnect:

```text
authenticate
verify participant
obtain latest authoritative Forge viewer state
send complete viewer snapshot
re-send current still-valid pending interaction
```

Do not reconstruct from the browser's cached state.

---

## 6.112 Pending Decision During Disconnect

If the authorized user disconnects while Forge waits:

```text
worker remains alive
decision remains pending
user may reconnect
same still-valid decision returns
```

Do not automatically:

```text
pass
pick first option
concede
choose random target
```

because of disconnect.

---

## 6.113 Browser Refresh

Refreshing the match page MUST NOT:

```text
launch another worker
create another match
create another participant
lose current pending decision
change Forge state
```

---

## 6.114 Current Match Discovery

Provide authenticated current-match lookup equivalent to:

```text
GET /api/matches/current
```

so navigation/refresh can recover the correct active match.

---

# PART XVII — MATCH PROTOCOL

## 6.115 Public Protocol Version

Define explicit:

```text
match_protocol_version
```

Browser/server incompatibility must fail deliberately.

---

## 6.116 Protocol Envelope

Use a typed envelope equivalent to:

```json
{
  "protocol_version": 1,
  "type": "MATCH_SNAPSHOT",
  "match_id": "...",
  "sequence": 123,
  "payload": {}
}
```

Exact naming may follow implemented conventions.

---

## 6.117 Message Ordering

Ensure a client cannot observe:

```text
decision referencing state revision N
```

before it has the required state.

Use sequence/revision data to reject stale/out-of-order behavior.

---

## 6.118 Conceptual Server Messages

Support the implemented equivalents of:

```text
MATCH_HELLO
MATCH_SNAPSHOT
MATCH_EVENT
AVAILABLE_ACTIONS or action data in snapshot/context
DECISION_REQUEST
DECISION_ACCEPTED
MATCH_ENDED
MATCH_FAILED
```

Do not create message types merely to match this list if the final semantic protocol combines them cleanly.

---

## 6.119 Browser Inputs

Keep browser gameplay inputs narrow.

Conceptually:

```text
ACTION_SELECT
DECISION_RESPONSE
```

plus a Forge-backed concession action if supported.

Do not support arbitrary free-form commands such as:

```text
"cast Lightning Bolt at opponent"
```

---

## 6.120 Serialized Forge Mutation

Game-changing player inputs for one Forge game must be serialized according to the accepted adapter/controller model.

Do not concurrently mutate the same Forge game from unrelated Ktor threads.

---

# PART XVIII — MATCH-TIME GRAPHICAL ASSET PLUMBING

## 6.121 Asset Boundary

Phase 6 owns:

```text
game object → visible card identity
visible identity → asset identity
viewer authorization for asset
correct visible face
secure asset retrieval
```

Phase 6 does NOT own:

```text
where card is positioned
card size
battlefield overlap
animations
tap animation
combat arrows
final zoom layout
final counter styling
final battlefield composition
```

Those belong to Phase 7.

---

## 6.122 Match-Scoped Asset Authorization

A player may legally see an opponent's card during a match without gaining Deck Depot access to that opponent's deck.

Provide a match-scoped authorized route equivalent to:

```text
/api/matches/{matchId}/assets/{assetRef}
```

The exact route may vary.

---

## 6.123 Opaque Asset Reference

Prefer server-issued opaque asset references.

Do not expose raw:

```text
filesystem paths
deck directories
opponent deck asset indexes
```

to the browser.

---

## 6.124 Hidden Assets

If a card identity is hidden from the viewer:

```text
do not send a real artwork reference
```

Use a generic hidden/card-back presentation.

---

## 6.125 Face-Down Assets

An opponent viewing a hidden face-down permanent MUST NOT be able to retrieve the real front-face image through the match asset endpoint.

---

## 6.126 Visible Card Asset

When Forge permits the viewer to know the card/face:

map it to the correct imported Deck Builder artwork where available.

---

## 6.127 Multiface Assets

The current Forge-visible face/state controls which imported face image is exposed.

The browser does not decide the face from card text.

---

## 6.128 Tokens

Gameplay-created tokens are not assumed to exist in the Deck Builder ZIP.

Do not add an Internet artwork dependency.

Use an approved local/Forge/generic functional token presentation.

Token rules remain Forge-controlled.

Final token visual polish belongs later.

---

## 6.129 Asset Enumeration Protection

Match asset authorization must not allow a participant to enumerate all images from an opponent's private deck.

Seeing one currently visible card does not authorize browsing the deck package.

---

## 6.130 No Deck Depot Share

Serving match-visible artwork does not create:

```text
Deck Depot share
permanent deck access
future access after match ends
```

---

## 6.131 Functional Rendering Standard

A simple functional browser image is enough for Phase 6.

Acceptance is:

```text
correct visible Forge object
        ↓
correct authorized asset
        ↓
secure retrieval
        ↓
functional display
```

Not:

```text
finished battlefield
```

---

# PART XIX — MINIMAL FUNCTIONAL MATCH CLIENT

## 6.132 Match Route

Provide a functional authenticated route equivalent to:

```text
/matches/{matchId}
```

---

## 6.133 Purpose

The Phase 6 client exists to prove:

```text
runtime
viewer state
hidden information
available actions
decision transport
asset authorization
reconnect
normal end/failure
```

It is not the final game UI.

---

## 6.134 No Final PixiJS Requirement

Ordinary React/DOM controls and simple image rendering are sufficient.

Do not spend Phase 6 implementing the final PixiJS battlefield.

Phase 7 must be able to replace presentation while preserving:

```text
MATCH_PROTOCOL
object identity
current Forge-derived characteristics
action identity
decision semantics
viewer-safe state
asset authorization
asset retrieval
```

---

## 6.135 Functional State Display

Display enough viewer-safe state for representative games:

```text
match lifecycle status
players
life totals / player state
turn
phase/step
priority holder
hand
battlefield
graveyard
exile
stack
library count/known information
command zone where applicable
player/global mechanic state
pending actions/decisions
```

Only show information actually present in the safe snapshot.

---

## 6.136 Functional Action Controls

The minimal client must be capable of displaying:

```text
current Forge-derived actions for a selected/relevant object
generic decision controls
```

Plain buttons/forms are acceptable.

---

## 6.137 Generic Decision Widgets

Support functional controls for required semantic interaction kinds such as:

```text
single selection
multi-selection
confirm / decline
number entry
ordering
target selection
player choice
mode choice
catalog/value choice
attack selection
block assignment
cost/payment choices
```

The actual required set is driven by Phase 0 and Mechanics Lab evidence.

---

# PART XX — PHASE 7 INTERACTION HANDOFF

## 6.138 Primary Interaction Philosophy

Phase 7 MUST consume the Phase 6 action architecture.

Default philosophy:

```text
LEFT / PRIMARY CLICK
        ↓
select/focus object
or
satisfy the current explicit Forge selection context

RIGHT CLICK / INSPECT
        ↓
open enlarged card inspection

CURRENT AVAILABLE ACTIONS
        ↓
explicit Forge-derived action controls
```

Outside a specific Forge selection decision:

```text
left-click card
=
select/focus

NOT
=
automatically attack
```

---

## 6.139 Context-Specific Click Meaning

During an explicit Forge interaction such as:

```text
DECLARE_ATTACKERS
```

primary click may toggle a legal attacker because the **current Forge context** defines the gesture.

That is not a permanent creature shortcut.

---

## 6.140 Contextual Action Panel

Phase 7 should provide an easily discoverable action surface equivalent to:

```text
Selected Card
─────────────
[ Action A ]
[ Action B ]
[ Inspect ]
```

The exact visuals belong to Phase 7.

The action IDs/data come from Phase 6.

---

## 6.141 Inspect / Zoom

Right-click or equivalent inspect opens a larger card view.

Where appropriate, it may show current Phase 6 actions such as:

```text
[ Activate Ability ]
[ Renew ]
[ Cast ]
```

Those buttons reuse the exact same current action IDs used elsewhere.

Do not parse printed card text to invent an action.

---

## 6.142 Convenience Shortcuts

Phase 7 may add direct convenience gestures only when:

```text
Forge currently supplies the action/context
the shortcut cannot make another legal action undiscoverable
server-issued action/candidate identity is still used
the client does not implement Magic legality
```

Convenience never replaces correctness.

---

# PART XXI — PHASE 8 COVERAGE HANDOFF

## 6.143 Phase 8 Role

Phase 8 broadens mechanics/decision UI coverage after the runtime and presentation abstractions are stable.

Mechanics Lab cases suitable for Phase 8 stress include:

```text
multiple activated abilities
abilities from unusual zones
alternative casting/action paths
special actions
modal actions
complex payment
replacement choices
multi-object selections
control-changing effects
unusual combat
new/recent mechanics
```

The goal is to validate generic architecture, not hardcode every keyword.

---

# PART XXII — LEARN / OUTSIDE-THE-GAME INVESTIGATION

## 6.144 Professor of Symbology Compatibility Check

The Mechanics Lab includes Professor of Symbology / Learn coverage.

Before claiming full Learn/Lesson support, inspect the actual implemented:

```text
Deck Builder export
Phase 2 normalized deck package
Forge deck representation
```

to determine whether the permitted outside-game/sideboard Lesson pool is represented.

---

## 6.145 If Sideboard/Lesson Pool Exists

If the locked implemented deck package already carries the required outside-game pool:

test the Forge path through the real protocol.

---

## 6.146 If Sideboard/Lesson Pool Does Not Exist

Do NOT invent a sideboard.

Classify the scenario in:

```text
docs/testing/MECHANICS_LAB_COVERAGE.md
```

as:

```text
BLOCKED_BY_DECK_PACKAGE
```

or the accurate equivalent.

Do not modify locked Phase 2 or Deck Builder silently.

If supporting the mechanic requires a package-contract change:

**STOP AND ASK THE PROJECT OWNER FOR A PHASE 2 AMENDMENT DECISION.**

---

# PART XXIII — MULTIPLAYER DECISIONS

## 6.147 Multiplayer Runtime

If Phase 0 accepted a multiplayer preset such as Commander, Phase 6 must test more than merely starting multiple players.

At least one accepted real scenario must require meaningful choices from multiple participants.

---

## 6.148 Sequential Multi-Participant Decision

Use a real Forge-supported Mechanics Lab scenario such as a voting/join-forces/demonstrate-style interaction where appropriate.

Prove:

```text
correct participant receives each decision
turn/decision order comes from Forge
one participant cannot answer another's choice
viewer-private details stay private
reconnect between decisions remains safe
```

Do not invent multiplayer sequencing in Ktor.

---

# PART XXIV — ALTERNATE RESULTS

## 6.149 Forge Owns Match Result

Arena MUST NOT determine winner from simplistic conditions such as:

```text
life <= 0
browser disconnected
worker exited
host left
```

Forge reports the result.

---

## 6.150 Alternate Win/Loss Regression

Use a deterministic focused Mechanics Lab scenario involving an alternate win/loss/prevention condition where supported.

The corpus includes stress cases such as:

```text
Laboratory Maniac
Felidar Sovereign
Phage the Untouchable
Platinum Angel
Platinum Emperion
Angel's Grace
```

The acceptance goal is:

```text
non-trivial result condition occurs
        ↓
Forge reports outcome
        ↓
Arena records exactly that result
```

Arena does not independently infer the outcome.

---

# PART XXV — NORMAL END AND FAILURE

## 6.151 Normal Match End

On Forge-reported normal end:

```text
capture final safe state where available
capture Forge-derived result
send MATCH_ENDED
persist result
match = ENDED
source room = CLOSED
release participant active-room restriction
shut down worker/runtime
clean temporary runtime state
```

---

## 6.152 Browser Close Is Not Concession

Browser close/navigation/disconnect:

```text
disconnects client
```

It does not automatically concede.

---

## 6.153 Concession

If the accepted Forge integration exposes a correct concession action:

Phase 6 may expose it through Forge.

Arena MUST NOT independently declare the opponent winner without the Forge result.

---

## 6.154 Worker Crash

Unexpected RUNNING worker failure:

```text
match = FAILED_RUNTIME
```

unless Phase 0/Phase 6 has actually proven safe live recovery.

Do not record a fake winner.

Notify participants with a controlled application error.

---

## 6.155 Worker Failure Diagnostics

Capture safe diagnostic metadata:

```text
match_id
worker_id
Forge commit
worker build
protocol versions
exit code
failure category
safe recent protocol context
log/stderr reference
```

Avoid routine storage of hidden hands/private libraries.

---

## 6.156 No Fake State Reconstruction

A browser snapshot is NOT a Forge save file.

Do not attempt:

```text
browser snapshot
        ↓
new Forge Game
```

as recovery unless Forge provides and Phase 0/6 proves a real supported serialization/restore mechanism.

---

## 6.157 Ktor Restart

Test and document exactly what happens if the Arena Server restarts while matches are running.

One of the following must be honestly proven:

```text
worker survives and Ktor safely reattaches
```

or:

```text
live match cannot safely reattach
→ match becomes FAILED_RUNTIME
```

Do not claim reattachment without evidence.

---

## 6.158 Reattach Requirements

If reattachment is supported, prove:

```text
worker identity survives
match identity survives
Ktor locates correct worker
current viewer snapshots can be requested
pending decisions can be recovered
duplicate inputs remain prevented
```

---

# PART XXVI — CONCURRENCY AND RESOURCE BEHAVIOR

## 6.159 Target Concurrency

Prove the runtime can support the project's expected target:

```text
3 simultaneous matches
```

on representative deployment hardware.

---

## 6.160 Measurements

Measure:

```text
worker startup time
idle worker memory
active match memory
CPU during representative gameplay
shutdown time
```

Record evidence.

---

## 6.161 Three-Match Isolation

Run three simultaneous matches.

Verify:

```text
unique match/runtime identity
no cross-match state
no cross-match decision delivery
no cross-match asset authorization
no cross-match worker failure propagation
```

---

## 6.162 Failure Isolation

Crash one match runtime.

Other running matches must continue.

---

# PART XXVII — SECURITY

## 6.163 Browser Is Untrusted

Every gameplay mutation must be validated against:

```text
authenticated user
match participation
current game epoch/context
current action/decision identity
current controller authorization
server-issued candidates/options
```

---

## 6.164 No Browser Worker Control

Browser cannot:

```text
kill worker
restart worker
execute Forge console command
select filesystem path
load arbitrary Forge resource
```

---

## 6.165 Filesystem Safety

All runtime/deck paths are server-generated.

Do not accept browser-supplied filesystem paths.

---

## 6.166 HTTP CSRF

All state-changing match HTTP endpoints, including launch or administrative termination, use Phase 3 CSRF protection.

---

## 6.167 WebSocket Security

Gameplay WebSocket uses authenticated same-origin controls established by Phase 3.

Identity is derived from the session, not a client-provided `user_id`.

---

# PART XXVIII — LOGGING AND DIAGNOSTICS

## 6.168 Lifecycle Logging

Log safe metadata for:

```text
launch requested
match created
worker starting
worker ready
match RUNNING
participant connected
participant disconnected
action exposed
action accepted/rejected
decision issued
decision accepted/rejected
game epoch changed
match ended
worker exited
runtime failed
cleanup completed
```

---

## 6.169 Correlation IDs

Use:

```text
request_id
room_id
setup_id
match_id
game_epoch / game-instance identity
worker_id
user_id
connection_id
action_id
decision_id
state_revision
```

where applicable.

---

## 6.170 Sensitive Logging

Do not routinely log:

```text
passwords
raw session tokens
CSRF tokens
full private hands
full library contents
private candidate payloads
all opponent deck artwork
```

---

## 6.171 Development Protocol Diagnostics

Provide a development/testing method to inspect safe protocol flow.

Do not expose hidden-information dumps through the production browser.

---

# PART XXIX — DATABASE

## 6.172 Phase 6 Migration

Add the next Flyway migration.

Expected conceptual additions:

```text
matches
match_participants
minimal result fields
runtime/worker metadata where required
```

Use the actual next migration version.

Never edit an already-applied migration.

---

## 6.173 No Live Card-State Database

Do not create database tables mirroring every:

```text
permanent
hand card
stack object
mana pool
combat assignment
```

solely to imitate Forge.

Forge is the live rules engine.

PostgreSQL stores lifecycle/business metadata.

---

## 6.174 Forge Identity Persistence

Persist exact Forge commit/version and worker/protocol identity used for the match.

This is required for:

```text
Forge upgrade regression
failure diagnosis
reproducibility
Mechanics Lab evidence
```

---

# PART XXX — REQUIRED DOCUMENTATION

## 6.175 Required Architecture Documents

Create:

```text
docs/architecture/MATCH_RUNTIME.md

docs/architecture/MATCH_PROTOCOL.md

docs/architecture/FORGE_WORKER_RUNTIME.md

docs/architecture/MATCH_STATE_VISIBILITY.md

docs/architecture/MATCH_ACTION_MODEL.md

docs/architecture/MATCH_ASSET_AUTHORIZATION.md

docs/testing/MECHANICS_LAB_COVERAGE.md

docs/troubleshooting/MATCH_RUNTIME.md
```

Update where required:

```text
docs/architecture/MATCH_SETUP_CONTRACT.md
README.md
BUILD_PLAN.md
AGENTS.md
```

---

## 6.176 MATCH_RUNTIME.md

Document:

```text
launch transaction
match lifecycle
setup consumption
room IN_MATCH transition
worker lifecycle
participant mapping
game epoch/restart behavior
normal end
runtime failure
Ktor restart behavior
cleanup
```

---

## 6.177 MATCH_PROTOCOL.md

Document:

```text
public protocol version
WebSocket route
hello
viewer snapshots
state revision
game epoch/context identity
available actions
action identity
decision requests
decision responses
nested interaction behavior
non-object catalog choices
errors
reconnect
match end/failure
```

---

## 6.178 FORGE_WORKER_RUNTIME.md

Document:

```text
pinned Forge commit
worker build
internal protocol
launch strategy
bootstrap resources
version handshake
startup milestone
health monitoring
temporary directories
shutdown
crash behavior
resource measurements
```

Do not document secrets.

---

## 6.179 MATCH_STATE_VISIBILITY.md

Document actual Forge-derived behavior for:

```text
viewer-specific state
hands
libraries
reveals
known hidden cards
face-down objects
private decisions
current characteristics
global/player state
match assets
```

Do not substitute simplified Magic assumptions.

---

## 6.180 MATCH_ACTION_MODEL.md

Document:

```text
selection vs action
object ID vs action ID
zero/one/multiple actions
Forge action authority
zone-dependent actions
combat-context actions
multiple abilities
nested interaction contexts
non-object choices
Phase 7 contextual action/inspect contract
```

Explicitly prohibit:

```text
Creature click = Attack
```

as a general gameplay rule.

---

## 6.181 MATCH_ASSET_AUTHORIZATION.md

Document:

```text
Forge object → visible identity
visible identity → imported asset
match-scoped asset references
viewer authorization
hidden cards
face-down cards
multi-face mapping
token fallback
cache/access behavior
relationship to Deck Depot permissions
```

State explicitly:

> Phase 6 owns asset identity, authorization, visibility, and retrieval. Phase 7 owns final graphical composition and battlefield presentation.

---

## 6.182 MECHANICS_LAB_COVERAGE.md

This is a live regression ledger, not a duplicate decklist.

It must reference/derive from the actual project-local TXT/CSV.

At minimum include focused entries for:

```text
Agent of Kotis — zone-dependent Renew/action discovery
Karn Liberated — restart game / game epoch
Panglacial Wurm — action during search / nested context
Leyline of the Void — pregame interaction
Pithing Needle — card-name choice
Adaptive Automaton — creature-type choice
Mind Bend — semantic value choice
Gemrazer — merged permanent
Room card — component/door state
Battle — alternate object lifecycle/face
Prepare card — source/action/result identity separation
complex modes/costs
effective-characteristics cases
RNG cases
alternate win/loss
multiplayer sequential decision
Learn / sideboard capability classification
```

---

# PART XXXI — ACCEPTANCE TESTS

## P6-A — Atomic Match Launch

A valid `READY_FOR_MATCH` setup creates exactly:

```text
one match record
one runtime
```

**Required evidence:** RUN.

---

## P6-B — Duplicate Launch Protection

Two concurrent valid launch requests against one setup cannot create two matches/runtimes.

**Required evidence:** RUN.

---

## P6-C — Launch Revalidation

Prepare a setup, then invalidate one selected deck's authorization before launch.

Launch fails safely.

The stale setup is not consumed as a running match.

**Required evidence:** RUN.

---

## P6-D — Real Forge Runtime

`RUNNING` is reached only after actual:

```text
Forge bootstrap
deck construction
player mapping
Match/Game construction
initial state generation
```

succeed.

**Required evidence:** RUN.

---

## P6-E — Forge Identity

Runtime reports/persists the expected pinned Forge revision and worker/protocol identity.

**Required evidence:** RUN.

---

## P6-F — Viewer-Safe State

Two participants receive appropriately different viewer snapshots.

Hidden information is absent rather than frontend-hidden.

**Required evidence:** payload inspection/RUN.

---

## P6-G — Hidden Hand

Opponent hand identities do not leak through:

```text
snapshot
event
available actions
decision payload
asset URLs
logs returned to browser
```

**Required evidence:** RUN.

---

## P6-H — Library Privacy

Opponent library identities do not leak unless Forge exposes specific known/revealed information.

**Required evidence:** RUN.

---

## P6-I — Face-Down Safety

Controller/opponent receive the correct asymmetric view.

Unauthorized opponent does not receive true identity or front-face art.

**Required evidence:** RUN.

---

## P6-J — Revealed / Known Hidden Information

A Forge-authorized reveal/look-at/known-card case exposes exactly the permitted information.

**Required evidence:** RUN.

---

## P6-K — Stable Object Identity

The same visible game object keeps the expected stable object identity through snapshot/action/decision references.

**Required evidence:** protocol trace/RUN.

---

## P6-L — Snapshot Before Interaction

No action/decision references a newly relevant object before the receiving viewer has sufficient state to identify it.

**Required evidence:** protocol trace/RUN.

---

## P6-M — Correct Decision Routing

The currently authorized Arena user receives and answers a Forge decision.

Forge receives the response exactly once.

**Required evidence:** RUN.

---

## P6-N — Wrong-User Protection

Another participant attempts to answer the decision.

Server rejects before Forge receives anything.

**Required evidence:** RUN.

---

## P6-O — Duplicate Response Protection

Send one valid decision response twice.

Forge applies once.

**Required evidence:** RUN.

---

## P6-P — Stale Response Protection

Send a response for an already-resolved decision.

It cannot affect the next decision.

**Required evidence:** RUN.

---

## P6-Q — Invalid Candidate Protection

Submit an object/action/value not issued for the current interaction.

Reject safely.

**Required evidence:** RUN.

---

## P6-R — Multiple Browser Tabs

Same participant opens two match tabs.

Both may receive state.

First valid action/decision response wins.

Second duplicate does not execute.

**Required evidence:** Playwright/RUN.

---

## P6-S — Disconnect During Decision

Authorized participant disconnects while Forge waits.

Worker remains alive.

Pending decision remains.

Reconnect receives:

```text
fresh authoritative snapshot
then
same still-valid decision
```

**Required evidence:** RUN.

---

## P6-T — Browser Refresh

Refreshing a running match does not create a new match/player, restart Forge, or lose the current pending interaction.

**Required evidence:** Playwright RUN.

---

## P6-U — Control-Another-Player

Where accepted Forge support exists, execute a representative control-changing effect.

Decision routes to the Arena user Forge says currently controls the decision, not blindly to seat owner.

**Required evidence:** RUN.

---

## P6-V — Combat

Run real combat.

Attacker/blocker legality comes from Forge.

Invalid candidate injection fails.

**Required evidence:** RUN.

---

## P6-W — Targeting

Use a real target-requiring effect.

Targets originate from Forge.

Invalid target injection fails.

**Required evidence:** RUN.

---

## P6-X — Asset Plumbing

For an imported visible card, prove:

```text
Forge object
→ visible identity
→ correct imported asset
→ match-scoped authorization
→ browser retrieval
```

No final graphical polish required.

**Required evidence:** RUN.

---

## P6-Y — Hidden Asset Protection

Hidden card/front-face asset cannot be retrieved by an unauthorized opponent.

**Required evidence:** RUN.

---

## P6-Z — No Asset Enumeration

A participant cannot enumerate the opponent's private deck images through match asset endpoints.

**Required evidence:** RUN.

---

## P6-AA — Agent of Kotis Renew Regression

Using real Forge support:

### Battlefield

Verify:

```text
Agent is represented as a creature object
Renew is not invented from printed text
selecting the card does not inherently mean attack
attack interaction appears only in Forge combat context
```

### Graveyard

Move the same card to graveyard through real gameplay.

When Forge says Renew is legal:

```text
card remains identifiable
Renew becomes discoverable through generic action model
Renew receives distinct action identity
player can choose Renew
Forge handles all legality/cost/targets/effect
```

Verify no:

```text
Agent-specific client rule
card-text parsing
Creature = Attack mapping
```

exists.

**Required evidence:** real Forge RUN + protocol trace.

---

## P6-AB — Multiple Actions Remain Discoverable

Use a real scenario where one object exposes more than one meaningful current action.

All valid actions remain discoverable and have distinct semantic identity.

**Required evidence:** RUN.

---

## P6-AC — Pregame Decisions

Exercise:

```text
opening hand
mulligan
pregame action/effect
transition to first turn
```

using real Forge behavior.

Include Leyline-style coverage where supported.

**Required evidence:** RUN.

---

## P6-AD — Karn / Game Restart

Where current Forge supports the scenario:

activate the relevant Karn restart behavior through real gameplay.

Verify:

```text
Arena match remains coherent
new Forge game instance/epoch begins
old object/action/decision IDs are invalid
new authoritative state is delivered
```

If Forge support is insufficient, classify and escalate accurately.

**Required evidence:** RUN or documented BLOCKED_BY_FORGE evidence.

---

## P6-AE — Nested Interaction / Panglacial Wurm

Use a focused real scenario to prove legal Forge actions can occur within an active surrounding interaction such as library search.

Do not flatten the action away.

**Required evidence:** RUN / protocol trace.

---

## P6-AF — Rules-Version Regression

Record the pinned Forge revision and observed behavior for the selected nested/unusual rules scenario.

If current Forge conflicts with authoritative expected project behavior, do not patch rules in Proxic; produce conflict evidence.

**Required evidence:** RUN + recorded Forge identity.

---

## P6-AG — Card-Name Choice

Use Pithing Needle or equivalent.

Prove a semantic card-name choice does not depend on a currently visible game object.

**Required evidence:** RUN.

---

## P6-AH — Creature-Type Choice

Use Adaptive Automaton or equivalent.

Prove the choice uses authoritative allowed values rather than a hand-maintained frontend rules list.

**Required evidence:** RUN.

---

## P6-AI — Color / Land-Type Choice

Use Mind Bend or equivalent.

Prove semantic non-object value choice.

**Required evidence:** RUN.

---

## P6-AJ — Composite / Multi-Representation Object

Use representative accepted Mechanics Lab scenarios to prove the snapshot/object/asset model handles at least one complex composite/multi-face case without a one-object/one-static-image assumption.

**Required evidence:** RUN.

---

## P6-AK — Attachment Relationships

Use representative equipment/aura/mutate/reconfigure/attachment behavior.

Verify current relationships are represented from Forge state.

**Required evidence:** RUN.

---

## P6-AL — Effective Characteristics

Use a scenario where current characteristics differ materially from printed card characteristics.

Verify the browser receives Forge-derived current characteristics and does not compute Magic layers itself.

**Required evidence:** RUN.

---

## P6-AM — Forge RNG Authority

Use a real coin-flip/die-roll/random scenario.

Verify:

```text
Forge produces outcome
browser displays outcome
reconnect does not reroll
duplicate response does not reroll
```

**Required evidence:** RUN.

---

## P6-AN — Complex Modes / Costs

Use representative Mechanics Lab scenarios to prove the semantic protocol can carry more than a single simple mode/cost.

Include at least:

```text
multi-mode or repeated/weighted mode
X or variable numeric choice
alternative/additional cost structure
```

as supported by current Forge.

**Required evidence:** RUN.

---

## P6-AO — Player / Global State

Use representative supported mechanics to prove the protocol can carry Forge-derived player/global state beyond ordinary card zones.

**Required evidence:** RUN.

---

## P6-AP — Alternate Forge Result

Use a deterministic supported alternate win/loss/prevention scenario where ordinary life-total inference would be unsafe.

Forge reports the result.

Arena records that result.

**Required evidence:** RUN.

---

## P6-AQ — Multiplayer Sequential Decision

If multiplayer/Commander is an accepted supported Phase 0 mode, execute a real multi-participant decision sequence.

Verify correct participant order/authorization and reconnect behavior.

If no accepted multiplayer preset supports such a scenario yet, classify accurately rather than inventing one.

**Required evidence:** RUN or supported-scope classification.

---

## P6-AR — Learn / Outside-Game Capability Classification

Inspect actual implemented deck package/sideboard support.

Result must be explicitly one of:

```text
SUPPORTED_AND_TESTED
BLOCKED_BY_DECK_PACKAGE
BLOCKED_BY_FORGE
OUT_OF_ACCEPTED_SCOPE
```

No fabricated sideboard.

**Required evidence:** inspection + test/classification.

---

## P6-AS — Mechanics Lab Full-Corpus Import

Use the canonical project-local Mechanics Lab source/package.

Prove:

```text
source corpus can be imported
card identities resolve as required
Forge deck construction succeeds
printing identity survives as required
assets map
runtime can load the deck
```

Explicitly record:

> Passing P6-AS does not mean all mechanics in the corpus are supported.

**Required evidence:** RUN.

---

## P6-AT — Worker Startup Failure

Force startup/bootstrap failure.

Verify:

```text
FAILED_STARTUP
setup invalidated
room OPEN
ready flags reset
runtime cleaned
```

**Required evidence:** RUN.

---

## P6-AU — Worker Protocol Mismatch

Run incompatible worker protocol identity.

Launch fails safely.

**Required evidence:** RUN.

---

## P6-AV — Forge Revision Mismatch

Worker reports unexpected Forge revision.

Launch fails safely.

**Required evidence:** RUN.

---

## P6-AW — Worker Runtime Crash

Crash a RUNNING worker.

Verify:

```text
FAILED_RUNTIME
controlled participant failure message
no fake winner
cleanup
```

**Required evidence:** RUN.

---

## P6-AX — Failure Isolation

Run at least two matches.

Crash one runtime.

Other match continues.

**Required evidence:** RUN.

---

## P6-AY — Three Concurrent Matches

Run three simultaneous matches.

Measure:

```text
startup
memory
CPU
decision routing
state isolation
asset isolation
shutdown
```

**Required evidence:** RUN/BENCHMARK.

---

## P6-AZ — Ktor Restart

Restart Arena Server during a live match.

Observed behavior must exactly match documented reattach/failure policy.

**Required evidence:** RUN.

---

## P6-BA — Normal Forge Match End

Complete a real game.

Forge reports result.

Verify:

```text
match = ENDED
result persisted
room closes
participants released
worker exits
runtime directory cleanup occurs
```

**Required evidence:** RUN.

---

## P6-BB — Browser Close Is Not Concede

Close participant browser.

No automatic Magic loss is recorded.

**Required evidence:** RUN.

---

## P6-BC — Imported Deck Immutability

After match execution, original imported deck storage remains unchanged.

**Required evidence:** integrity comparison.

---

## P6-BD — Exact Printing Runtime

Where exact printing identity is part of the accepted deck contract, verify Forge construction preserves it.

**Required evidence:** RUN/inspection.

---

## P6-BE — Basic Land Runtime

Representative basic lands initialize and function correctly.

**Required evidence:** RUN.

---

## P6-BF — Multi-Face Runtime

Run a supported multiface case.

Verify Forge rules identity and correct viewer-safe asset face mapping.

Final animation is not required.

**Required evidence:** RUN.

---

## P6-BG — Token Runtime

Forge creates a token.

Verify:

```text
real Forge token object exists
rules work
browser represents it functionally
lack of imported token PNG does not crash match
```

**Required evidence:** RUN.

---

## P6-BH — Zone coverage  *(replaces "Commander Runtime")*

**AMENDED 2026-10-15.** Commander is out of scope; this test is
replaced rather than deleted, because the Phase 0A Commander work found
a gap that outlives the format.

An adapter that enumerates playable actions from only hand and
battlefield silently never offers anything else. Open Format allows any
card, so graveyard (flashback, escape), exile (foretell, adventure) and
even library (Panglacial Wurm, which is in the Mechanics Lab corpus)
are all reachable.

Prove that an action offered by Forge from a zone **other than hand or
battlefield** is enumerated, presented, and can be performed.

```text
zone coverage of the action enumerator
object identity across that zone
viewer snapshots
decision routing
```

**Required evidence:** RUN. See `docs/architecture/OPEN_FORMAT.md` §5.

---

## P6-BI — Unsupported Preset Guard

A direct API request cannot launch an unsupported preset.

**Required evidence:** RUN.

---

## P6-BJ — 2HG Guard

If 2HG is not accepted as supported, direct Phase 6 manipulation cannot launch it.

**Required evidence:** RUN.

---

## P6-BK — Production End-to-End

Through:

```text
https://arena.barnflix.net
```

with independent authenticated browsers:

```text
prepared room launches
Forge reaches RUNNING
viewer-safe states differ correctly
real action/decision is completed
authorized visible card artwork loads
hidden artwork remains unavailable
disconnect/reconnect works
real Forge match can end normally
```

Final battlefield graphical polish is not required.

**Required evidence:** external/Playwright RUN.

---

## P6-BL — Production Worker Privacy

Forge runtime ports/endpoints are not directly reachable publicly.

**Required evidence:** external network test.

---

## P6-BM — Project Integrity

Verify:

```text
Proxic_Arena_OLD unchanged
Proxic_Deck_Builder unchanged
canonical Test Deck TXT unchanged
canonical Test Deck CSV unchanged
pinned Forge tree contains no unapproved Proxic edits
```

**Required evidence:** integrity check.

---

# PART XXXII — STATIC QUALITY

## 6.183 Required Quality Checks

Frontend:

```text
TypeScript strict compile
ESLint
Prettier check
Vitest
Playwright
```

Backend/worker:

```text
Kotlin compile
Java compile where applicable
ktlint
detekt
JUnit/Kotlin tests
Forge adapter/worker tests
```

Use the project-pinned tool versions.

---

# PART XXXIII — PHASE 6 CHECKLIST

## Execution prerequisites

- [ ] Phases 0–5 implemented, tested, and accepted.
- [ ] Phase 0 final recommendation reviewed.
- [ ] Phase 0 accepted decisions reviewed.
- [ ] MATCH_SETUP_CONTRACT reviewed.
- [ ] Pinned Forge revision verified.
- [ ] Canonical Test Deck TXT/CSV inspected.

## Mechanics Lab

- [ ] TXT treated as authoritative deck/printing source.
- [ ] CSV treated as authoritative mechanics-coverage intent.
- [ ] Source files left unchanged.
- [ ] `MECHANICS_LAB_COVERAGE.md` created.
- [ ] Focused deterministic scenarios created for P6-required cases.
- [ ] Full-corpus smoke test does not masquerade as mechanic coverage.

## Match lifecycle

- [ ] UUID match identity.
- [ ] One setup → at most one match.
- [ ] Atomic launch claim.
- [ ] Setup consumed only after successful runtime milestone.
- [ ] `IN_MATCH` room state.
- [ ] Normal end.
- [ ] Startup failure.
- [ ] Runtime failure.
- [ ] Cleanup.

## Forge runtime

- [ ] Accepted Phase 0 architecture used.
- [ ] Forge revision handshake.
- [ ] Worker protocol handshake.
- [ ] Required bootstrap resources.
- [ ] Worker privacy.
- [ ] Startup timeout.
- [ ] Health monitoring.
- [ ] Runtime cleanup.
- [ ] Imported decks remain immutable.

## Identity

- [ ] Arena user / participant / seat / Forge player distinct.
- [ ] Viewer distinct.
- [ ] Active player distinct.
- [ ] Priority holder distinct.
- [ ] Decision subject/controller distinct.
- [ ] Mindslaver-style routing supported where accepted.

## State

- [ ] Viewer-specific snapshots.
- [ ] Stable object IDs.
- [ ] State revisions.
- [ ] Snapshot-before-interaction.
- [ ] Hidden state removed server-side.
- [ ] Face-down identity protected.
- [ ] Current Forge characteristics represented.
- [ ] Player/global state extensible.
- [ ] Attachment/component relationships represented where needed.

## Actions

- [ ] Selection distinct from execution.
- [ ] Card type does not define click behavior.
- [ ] Zero/one/multiple actions supported.
- [ ] Object ID distinct from action ID.
- [ ] Zone-dependent actions re-derived.
- [ ] Combat context supplies attacker semantics.
- [ ] Multiple actions remain discoverable.
- [ ] Agent of Kotis regression passes.
- [ ] Generic multi-action regression passes.
- [ ] Nested interaction contexts supported.
- [ ] Panglacial Wurm focused regression classified/tested.

## Decisions

- [ ] Unique decision IDs.
- [ ] Wrong-user rejection.
- [ ] Duplicate rejection.
- [ ] Stale rejection.
- [ ] Candidate validation.
- [ ] Non-object choice support.
- [ ] Card-name choice.
- [ ] Creature-type choice.
- [ ] Color/land-type style choice.
- [ ] Complex modes/costs.
- [ ] Unsupported decisions fail safely.

## Pregame/restart

- [ ] Opening/mulligan/pregame interactions tested.
- [ ] Leyline-style scenario tested where supported.
- [ ] Game epoch concept implemented.
- [ ] Karn restart classified/tested.
- [ ] Old game IDs invalid after restart.

## RNG

- [ ] Forge sole gameplay RNG.
- [ ] Browser does not determine result.
- [ ] Reconnect/duplicate behavior cannot reroll.

## Assets

- [ ] Match-scoped asset authorization.
- [ ] Correct imported art for visible card.
- [ ] Hidden card art unavailable.
- [ ] Face-down art protected.
- [ ] Multi-face mapping.
- [ ] Token fallback.
- [ ] Opponent deck art cannot be enumerated.
- [ ] No Deck Depot share created.
- [ ] Final battlefield visuals deferred.

## Reconnect/reliability

- [ ] Pending decision survives client disconnect.
- [ ] Refresh safe.
- [ ] Current match discovery.
- [ ] Ktor restart behavior tested honestly.
- [ ] Worker crash controlled.
- [ ] Failure isolation.
- [ ] Three concurrent matches.

## Results

- [ ] Forge controls normal result.
- [ ] Alternate-result scenario.
- [ ] Browser close is not concede.
- [ ] Worker crash is not a Magic loss.

## Multiplayer

- [ ] Zone-coverage test (P6-BH): an action offered from a zone other than hand or battlefield.
- [ ] At least one sequential multi-user decision when supported.
- [ ] Unsupported 2HG blocked.

## Learn / sideboard

- [ ] Actual package capability inspected.
- [ ] Learn/Lesson classified accurately.
- [ ] No sideboard invented.
- [ ] Phase 2 amendment escalated if required.

## Documentation

- [ ] `MATCH_RUNTIME.md`
- [ ] `MATCH_PROTOCOL.md`
- [ ] `FORGE_WORKER_RUNTIME.md`
- [ ] `MATCH_STATE_VISIBILITY.md`
- [ ] `MATCH_ACTION_MODEL.md`
- [ ] `MATCH_ASSET_AUTHORIZATION.md`
- [ ] `MECHANICS_LAB_COVERAGE.md`
- [ ] runtime troubleshooting
- [ ] README/BUILD_PLAN/AGENTS updated as needed.

---

# PART XXXIV — REQUIRED DELIVERABLES

## 6.184 Required Phase 6 Deliverables

At completion provide:

```text
1. Implementation summary.

2. Phase 6 database migration.

3. Final match schema.

4. Final participant schema.

5. Final lifecycle state machine.

6. Atomic setup-consumption implementation.

7. Room IN_MATCH behavior.

8. Exact pinned Forge commit/version.

9. Worker build/protocol identity.

10. Worker launch/bootstrap architecture.

11. Deck-to-Forge construction procedure.

12. Arena user / seat / Forge player mapping.

13. Decision subject/controller/viewer mapping.

14. MATCH_RUNTIME.md.

15. MATCH_PROTOCOL.md.

16. FORGE_WORKER_RUNTIME.md.

17. MATCH_STATE_VISIBILITY.md.

18. MATCH_ACTION_MODEL.md.

19. MATCH_ASSET_AUTHORIZATION.md.

20. MECHANICS_LAB_COVERAGE.md.

21. Viewer snapshot schema.

22. Object-ID strategy.

23. Action-ID strategy.

24. Decision-ID strategy.

25. State revision/game epoch strategy.

26. Zone-dependent action strategy.

27. Agent of Kotis regression result.

28. Generic multi-action regression result.

29. Pregame regression result.

30. Karn restart result/classification.

31. Panglacial Wurm nested-interaction result/classification.

32. Rules-version regression evidence.

33. Non-object choice results.

34. Composite/multiface object results.

35. Attachment relationship result.

36. Effective-characteristics result.

37. RNG authority result.

38. Complex modes/costs result.

39. Player/global state result.

40. Alternate win/loss result.

41. Multiplayer sequential-decision result/classification.

42. Learn/outside-game capability classification.

43. Full Mechanics Lab corpus import/Forge construction result.

44. Hidden-information regression results.

45. Face-down result.

46. Combat result.

47. Targeting result.

48. Match-scoped artwork/privacy results.

49. Reconnect result.

50. Worker startup-failure result.

51. Worker runtime-crash result.

52. Failure-isolation result.

53. Ktor restart result.

54. Resource measurements.

55. Three-concurrent-match benchmark.

56. Complete real Forge game result.

57. Docker acceptance result.

58. Production arena.barnflix.net E2E result.

59. Confirmation old Arena remained unchanged.

60. Confirmation Deck Builder remained unchanged.

61. Confirmation Mechanics Lab TXT/CSV remained unchanged.

62. Confirmation Forge remained clean or approved patch inventory.

63. Unsupported Forge action/decision paths encountered.

64. Deviations.

65. Unresolved concerns.

66. Proposed requirements for Phase 7.
```

Do not begin Phase 7 automatically.

---

# PART XXXV — EXIT GATE

## 6.185 Phase 6 Exit Gate

Phase 6 implementation is complete only when:

```text
a READY_FOR_MATCH setup safely launches one Arena match

duplicate launch cannot create duplicate Forge runtimes

the accepted Phase 0 Forge architecture is used

Forge revision/protocol identity is verified

real normalized Deck Depot decks construct real Forge decks

Arena participants map correctly to Forge players/controllers

Forge owns live game state

room transitions to IN_MATCH

viewer-specific snapshots work

hidden information is removed server-side

face-down identity and artwork remain protected

stable object identity works

state is delivered before dependent interactions

object selection is not automatic action execution

card type does not define click meaning

one object can expose zero, one, or multiple actions

object IDs and action IDs are distinct

zone-dependent actions work generically

Agent of Kotis Renew is reachable through the generic action architecture

combat actions are defined by Forge context, not permanent creature shortcuts

nested interaction contexts are represented without flattening legal actions

pregame decisions use the authoritative semantic protocol

game restart uses epoch-safe identity

non-object choices are representable without frontend rules lists

composite/multiface objects do not require one-card/one-image assumptions

current characteristics come from Forge

Forge is gameplay RNG authority

complex mode/cost structures can be carried generically

player/global/non-card state does not require protocol redesign

wrong-user decisions fail

duplicate responses do not double-execute

stale responses fail

reconnect restores authoritative state and pending interactions

control-changing effects route decisions correctly where accepted

match-scoped artwork works without Deck Depot leakage

no final battlefield graphical design is falsely claimed

startup/runtime failures are controlled

worker failure does not fabricate a Magic result

three simultaneous matches are proven

at least one real Forge game completes

Forge determines normal/alternate result

workers and runtime directories clean up

Ktor restart behavior is honestly documented/tested

Mechanics Lab full corpus imports/constructs

Mechanics Lab focused P6-required scenarios have evidence/classification

Learn/outside-game support is accurately classified

old Arena remains unchanged

Deck Builder remains unchanged

canonical Mechanics Lab TXT/CSV remain unchanged

Forge remains unmodified unless separately approved

documentation matches observed runtime behavior
```

---

# PART XXXVI — NON-GOALS

## 6.186 Phase 6 Does Not Build

Do not expand Phase 6 into:

```text
final PixiJS battlefield
production battlefield layout
final visual left/right-click design
drag-and-drop polish
zone transition animation
tap/untap animation
combat arrows
spell/effect animation
final stack visualizer
final zoom styling
final contextual action styling
final counter/badge visual system
production-quality token art
responsive battlefield polish
complete mechanics-specific UI polish
spectator mode
public matchmaking
friends
match chat
match history UI
full replay system
game clocks
disconnect-forfeit timers
rematch flow
tournament support
```

Phase 6 provides the authoritative semantic/runtime data that later phases render well.

---

# PART XXXVII — ESCALATION

## 6.187 Stop-and-Ask Conditions

Stop and ask the project owner before:

```text
changing the accepted Phase 0 Forge architecture

changing the pinned Forge commit without the required compatibility work

modifying upstream Forge

letting a browser connect directly to Forge

implementing Magic legality/rules in Ktor

implementing Magic legality/rules in TypeScript

sending hidden opponent data to browsers

mapping Creature directly to Attack

parsing card rules text to invent actions

hardcoding Agent of Kotis or Renew

hardcoding Panglacial Wurm behavior

hardcoding Karn restart behavior

flattening away a Forge-legal nested interaction

inventing a sideboard/Lesson pool

editing locked Phase 2 to support Learn

modifying Proxic Deck Builder

modifying old Arena

editing the canonical Mechanics Lab TXT/CSV

auto-answering an unsupported Forge decision

guessing a winner after worker failure

reconstructing Forge from browser snapshots

adding an external card/art service

starting final PixiJS battlefield work in Phase 6

claiming a mechanic works without focused evidence

claiming full Mechanics Lab support because the deck merely imported
```

Use:

```text
CONFLICT

Phase 6 requirement:

Observed reality:

Evidence:

Impact:

Options:

Recommendation:

Question for project owner:
```

---

# PART XXXVIII — LOCKED PHASE AMENDMENTS

## 6.188 Amendment Rule

This specification is:

```text
PHASE 6 — LOCKED
```

Do not silently change it.

Any legitimate future change requires:

```text
PHASE 6 AMENDMENT <number>

Reason:
Affected requirement:
Old decision:
New decision:
Evidence:
Affected components:
Affected later phases:
Approved by project owner:
Date:
```

---

# Phase 6 Final Principles

## Rules authority

```text
Forge decides what Magic permits.
```

Not React.

Not Ktor.

Not the database.

---

## Action authority

```text
CARD / GAME OBJECT
        ↓
SELECT / FOCUS
        ↓
CURRENT FORGE CONTEXT
        ↓
0 / 1 / MANY AVAILABLE ACTIONS
        ↓
PLAYER CHOOSES SERVER-ISSUED ACTION
        ↓
FORGE APPLIES RULES
```

Never:

```text
CARD
        ↓
PRINTED CARD TYPE
        ↓
HARDCODED CLICK BEHAVIOR
```

---

## Decision authority

```text
Forge interaction
        ↓
current decision controller
        ↓
authenticated Arena user
        ↓
validated semantic response
        ↓
Forge
```

Fixed seat ownership is not sufficient for every effect.

---

## State authority

```text
Forge authoritative game
        ↓
viewer-specific state
        ↓
server-side hidden-information filtering
        ↓
browser
```

The browser never receives secret information merely so it can hide it.

---

## Asset authority

Phase 6 answers:

```text
Which visible image corresponds to this Forge object?

May this viewer receive that image?

Which face/image is current?

How is the image retrieved securely?
```

Phase 7 answers:

```text
How should that authorized card and its current actions
look and behave on the polished battlefield?
```

---

## Mechanics Lab principle

The canonical Mechanics Lab corpus is not proof by itself.

It is the project-wide map of difficult cases.

For each supported claim:

```text
specific mechanic/stress case
        ↓
focused deterministic scenario
        ↓
real Forge behavior
        ↓
real Proxic protocol
        ↓
recorded evidence
```

Passing import of the giant deck means:

```text
the corpus loaded
```

It does NOT mean:

```text
every mechanic works
```

---

## Final Phase 6 Goal

Phase 6 proves that Proxic Arena can run a:

```text
real
Forge-authoritative
private
viewer-safe
multi-action
zone-aware
reconnectable
isolated
testable
multiplayer Magic match
```

from start to Forge-derived completion, while avoiding the architectural assumptions that caused the old application to lose valid card functionality.

Phase 7 may then build the polished battlefield on top of a runtime protocol that has already survived:

```text
Agent of Kotis
Karn restart
nested interaction contexts
pregame actions
non-object choices
complex costs/modes
current-characteristic changes
hidden information
control-changing decisions
multiplayer decision routing
artwork authorization
worker failures
reconnect
concurrent matches
```

without rewriting the Magic rules in Proxic.

---

## 6.189 The worker needs its own loop guard  *(added 2026-10-15)*

Forge's priority loop has **no safety valve for a human controller**.

```text
[SOURCE] PhaseHandler.mainLoopStep, end of the priority loop:

         } while (loopCount < 999 || !pPlayerPriority.getController().isAI());
```

The 999-iteration guard applies **only when `isAI()` is true**. For a
human-shaped controller the condition is permanently true, so any
adapter failure makes Forge re-offer the identical action **forever**:
full CPU, no exception, no log line, turn counter frozen.

```text
[RUN] observed FOUR times in Phase 0A, four different causes:
        an unimplemented playChosenSpellAbility
        a mana ability played through the wrong path
        an unpayable CostSacrifice
        an unimplemented discard

      worst case 679,963 identical attempts, frozen on turn 2,
      with targeting SUCCEEDING every time and zero stubs reached
```

Confirmed **unchanged at `master`** — this is how Forge works, not a
bug awaiting an upstream fix.

Two requirements follow:

1. **The adapter must never offer an action it cannot perform, and
   never fail to perform one it offered.** Screen enumeration by
   payability; count what is declined rather than dropping it
   silently.
2. **The worker must carry its own loop guard.** A repeated identical
   choice with no `state_version` change must abort the match with a
   diagnosable error. Forge will never do it, and from outside the
   failure is indistinguishable from a slow game.

Note what was *not* visible in the measured cases: no error, no stub,
no log. Only the **ratio between decision counts** localised it —
`chooseTargetsFor` at 679,963 against `payManaCost` at 2. Worker
instrumentation should expose per-decision-kind counters for exactly
this reason.

---

## 6.190 Verify that Forge returned what was asked for  *(added 2026-10-15)*

Three Phase 0A failures share one shape: **the obvious call succeeds
and silently does something else.**

```text
[RUN] exact printing: asked KTK/261 -> got TRK/325, a different set
                      asked ZZZ/999 -> got SLZ/63
                      a bad set or number does NOT return null

[SOURCE] chooseCardsToDiscardFrom has a 5-arg CONVENIENCE overload
         delegating to the 6-arg ABSTRACT one. Overriding the 5-arg
         version compiles, satisfies @Override, and NEVER RUNS.

[RUN] an action enumerator that omits a zone offers nothing from it,
      with no error -- the game merely plays differently
```

> **Do not trust a non-null result.** Check that the returned object
> matches the request: the printing you asked for, the method Forge
> actually calls, the zones Forge can actually offer from.

This is why AGENTS STUB-002 requires unimplemented decisions to be
*loud*. Each of the three was caught in one run because something
announced itself; a silent stub would have made all three look
implemented.

---

## 6.191 Decision volume  *(added 2026-10-15)*

```text
[RUN] a complete 12-turn game:
        chooseSpellAbilityToPlay   ~240 calls
        actions actually taken      ~23
```

Forge asks on **every** priority window — upkeep, end step, the
opponent's whole turn. The ratio is roughly 10:1 and is not a defect.

The protocol and the client must both be built for it: a naive
implementation that round-trips every priority window to the browser
will feel unusable. The old project auto-passed windows with no
playable option, which is the behaviour Phase 7 should inherit — with
the caveat recorded there that auto-pass must not hide a real
instant-speed response opportunity.
