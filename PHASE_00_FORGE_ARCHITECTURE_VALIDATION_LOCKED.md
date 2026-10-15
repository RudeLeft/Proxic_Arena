# Proxic Arena Build Plan

# Phase 0 — Forge Architecture Validation

**Status:** LOCKED  
**Phase Type:** Research, proof-of-concept, architecture validation  
**Production Feature Work:** PROHIBITED  
**Next Phase:** Phase 1 — Application Foundation, only after Phase 0 is completed, reviewed, and accepted by the project owner

---

## 0.1 Purpose

Phase 0 exists to eliminate the major Forge-related architectural unknowns before the new Proxic Arena application is built.

The goal is not to create the new web application.

The goal is to determine, with evidence, exactly how the new application should integrate with the current Forge rules engine.

At the end of Phase 0 we must be able to answer:

```text
How should Proxic Arena start Forge?

Which Forge modules and resources are required?

How should a human browser player answer Forge decisions?

Can Forge's current networking/controller infrastructure
replace any part of our existing custom PlayerController adapter?

How should game state be exposed to Proxic?

How should hidden information be filtered?

How should semantic game events be obtained?

How should multiple simultaneous matches be isolated?

Can Commander be supported correctly?

Can Two-Headed Giant be supported correctly?

What does one Forge game cost in memory/CPU?

Can three matches run safely at once?

How should Forge be packaged inside Docker?

How should Forge updates be handled?

What APIs are stable enough for Proxic to depend on?
```

These questions must be answered before the production architecture is locked.

---

## 0.2 Why Phase 0 Exists

The previous Proxic Arena implementation already demonstrated that Forge can be driven by an external application.

That implementation successfully used:

```text
Client
    ↓
WebSocket
    ↓
Python relay
    ↓
stdin/stdout JSON
    ↓
one Java process per match
    ↓
Forge
```

That architecture successfully completed real games.

Therefore Phase 0 is not starting from nothing.

The previous implementation is our baseline.

However, the previous implementation also discovered that Forge integration has significant hidden complexity:

- Forge bootstrap requires more than simply constructing a `Game`.
- Forge card/resource loading depends on initialization normally performed by its own application.
- Basic land handling exposed runtime type-list initialization requirements.
- Token support requires the appropriate Forge resources.
- Human interaction is represented through a large `PlayerController` decision surface.
- Some unimplemented controller methods can fail loudly.
- Other missing methods may be caught by Forge and fail silently.
- Hidden-information APIs require careful understanding of exactly what each visibility method means.
- Some decisions occur in obscure rules situations and are easy to miss with simple test decks.
- Testing only the easy branch of a decision can create false confidence.
- Multiplayer decision ownership is more complicated than "whose turn is it?"
- A client response delivered twice can corrupt a subsequent synchronous Forge decision if not rejected before reaching the engine.
- Forge has changed materially since the previous pinned snapshot.

Phase 0 exists so that the new architecture is designed around those facts.

---

## 0.3 Phase 0 Principle

The coding agent must distinguish:

```text
WHAT WE KNOW

from

WHAT WE THINK

from

WHAT WE HAVE ACTUALLY RUN
```

An architecture decision must never be presented as proven merely because it appears plausible from reading Forge source.

---

## 0.4 Evidence Classification

Every material Phase 0 finding must be labeled with one or more evidence levels.

Use:

### `UPSTREAM-DOC`

The conclusion comes from current official Forge documentation.

Example:

```text
UPSTREAM-DOC:
Forge documents network play for up to eight players.
```

This proves what Forge documents.

It does not prove that the specific feature works correctly for Proxic's use case.

### `SOURCE`

The conclusion comes from reading the exact Forge source at the pinned Phase 0 commit.

Example:

```text
SOURCE:
Class X calls method Y when a human chooses targets.
```

Source evidence is stronger than documentation for implementation architecture.

It still does not prove runtime behavior.

### `RUN`

A real test was executed against the pinned Forge build and produced the claimed behavior.

Example:

```text
RUN:
Two headless human-controller clients completed a game
in which each cast a targeted instant.
```

This is required for critical integration assumptions.

### `BENCHMARK`

A measured runtime result.

Example:

```text
BENCHMARK:
Idle match worker:
312 MB RSS

Three simultaneous match workers:
946 MB total RSS
```

Do not estimate benchmark values.

Measure them.

### `INFERENCE`

A reasoned conclusion that has not yet been directly verified.

Example:

```text
INFERENCE:
Process-per-match is likely safer because Forge uses
substantial static application state.
```

An inference cannot satisfy an acceptance gate that requires `RUN`.

### `USER`

A product decision explicitly made by the project owner.

Example:

```text
USER:
Proxic Arena will only support real Scryfall MTG cards.
```

---

## 0.5 No False Verification

The coding agent must not write:

```text
Forge supports feature X.
```

when the evidence actually means:

```text
A class related to feature X exists.
```

Instead write:

```text
SOURCE:
Classes implementing feature X exist.

RUN:
Not yet verified.
```

Similarly:

```text
The test completed.
```

does not prove:

```text
The test exercised the desired branch.
```

The agent must demonstrate that the tested interaction actually occurred.

---

## 0.6 Starting Architecture Hypotheses

The following are hypotheses to test.

They are not locked decisions.

### Hypothesis A — Browser

The eventual frontend will use:

```text
TypeScript
React
PixiJS
```

Phase 0 does not need to build it.

### Hypothesis B — Arena Server

The eventual application server will use:

```text
Kotlin
Ktor
```

Phase 0 does not need to build the production server.

### Hypothesis C — Forge Worker

Each active match will run in its own isolated JVM process.

Expected eventual shape:

```text
Arena Server
     │
     ├── Match Worker A
     ├── Match Worker B
     └── Match Worker C
```

Phase 0 must determine whether this remains the best model.

### Hypothesis D — Forge Adapter

A Proxic-owned Forge adapter will isolate Proxic from Forge internals.

Expected boundary:

```text
Proxic Protocol
       ↓
Forge Adapter
       ↓
Forge
```

The unresolved question is what lies inside the adapter.

### Hypothesis E — Human Decision Integration

There are three integration strategies to investigate:

```text
STRATEGY A

Custom PlayerController
similar to existing PlayerControllerNetwork
```

```text
STRATEGY B

Reuse Forge's current network / remote-player
controller infrastructure
```

```text
STRATEGY C

Hybrid:
reuse useful Forge network/controller components
but expose a Proxic-owned external protocol
```

Phase 0 must recommend one.

---

## 0.7 Existing Proxic Code Is Evidence, Not Production Constraint

The existing project should be treated as:

```text
reference implementation
test evidence
bug-history archive
architectural research
```

It is not required to survive the rebuild.

The coding agent should study it before writing new Forge integration code.

Important existing areas include:

```text
bridge/

PlayerControllerNetwork
DecisionChannel
BridgeMain
StateSnapshot
GameEventTranslator

tabletop_server/

relay.py

PROTOCOL.md
ROADMAP.md
AGENTS.md
```

Lessons learned there should be harvested.

Old implementation choices should not automatically be retained.

---

## 0.8 Phase 0 Working Area

Phase 0 experimental work must be isolated.

Recommended:

```text
spikes/
└── forge-phase0/
```

or an equivalent temporary research module.

Do not begin building the permanent:

```text
frontend/
server/
forge-worker/
```

architecture during this phase unless a tiny skeleton is absolutely necessary for a specific experiment.

Phase 0 code may be discarded afterward.

---

## 0.8A Existing Project Locations and Read-Only Reference Rule

The coding agent must treat the existing Proxic Arena implementation and the new Proxic Arena rebuild as two separate project trees.

### Existing / Old Project

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

This directory contains the previous Proxic Arena implementation.

It is **REFERENCE-ONLY** unless the project owner explicitly authorizes a change.

The coding agent MAY:

- read files from the old project;
- inspect the old architecture;
- inspect old Forge integration work;
- inspect tests;
- inspect protocol definitions;
- inspect Docker configuration;
- inspect networking/session code;
- inspect the existing Java bridge;
- inspect `PlayerControllerNetwork`;
- inspect `DecisionChannel`;
- inspect state serialization;
- inspect hidden-information handling;
- inspect event translation;
- inspect previous bugs and fixes;
- compare old behavior with current Forge;
- copy useful ideas or code into the new project when appropriate;
- use the old implementation as evidence that a particular approach has previously worked.

The coding agent MUST NOT:

- modify files in `Proxic_Arena_OLD`;
- rename files in `Proxic_Arena_OLD`;
- delete files in `Proxic_Arena_OLD`;
- build new production work inside `Proxic_Arena_OLD`;
- treat `Proxic_Arena_OLD` as the new project;
- silently migrate changes back into the old project;
- assume an old architectural choice remains correct without re-validating it against current Forge.

The old project exists as:

```text
reference implementation
historical record
test evidence
bug-history archive
source of proven lessons
```

It is not the production target.

### New Project

All new Proxic Arena implementation work must occur under:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena
```

This is the authoritative project directory for the rebuild.

Any new:

```text
frontend
server
forge-worker
protocol
database
Docker configuration
documentation
tests
research
scripts
```

must be created in the new project unless a Phase 0 experiment explicitly requires a temporary external scratch location.

The coding agent should never have to infer which project is current.

Use this rule:

```text
READ OLD
BUILD NEW
```

### Code Reuse Rule

Reusing code from the old project is allowed when it is useful.

However, copied code must not be treated as automatically correct merely because it previously worked.

Before reused code becomes part of the new architecture, the agent should determine:

```text
Does it still match current Forge?

Does it still match the new architecture?

Does it depend on Python/Tkinter assumptions we are abandoning?

Does it contain a workaround that current Forge no longer needs?

Does it contain a proven safety mechanism we should preserve?
```

Proven lessons should be preserved.

Obsolete architecture should not be preserved merely for historical compatibility.

---

## 0.9 Preserve Forge as an Upstream Dependency

The long-term goal is to make Forge updates as straightforward and low-risk as practical.

Therefore:

> **Upstream Forge must remain as close to a complete, untouched upstream checkout as practical. Proxic-specific functionality must live outside the Forge source tree whenever technically possible.**

The desired architecture is:

```text
Proxic Arena code
│
├── frontend/
├── server/
├── forge-worker/
├── protocol/
└── third_party/
    └── forge/
         ↑
         upstream Forge
         pinned to an exact commit
         minimally or preferably never modified
```

rather than:

```text
Forge source
├── upstream Forge code
├── Proxic modifications
├── custom Proxic rules
├── Proxic networking patches
├── UI-specific changes
└── scattered local edits
```

The first model is strongly preferred.

### 0.9.1 Forge Updateability Is an Architectural Requirement

Forge updateability is not merely a convenience.

It is a formal project requirement.

The intended future update process should resemble:

```text
current pinned Forge commit
        ↓
advance Forge commit
        ↓
build Forge
        ↓
build Proxic Forge adapter
        ↓
run Forge compatibility tests
        ↓
run Proxic integration tests
        ↓
run mechanics smoke tests
        ↓
review failures
        ↓
adapt Proxic boundary if necessary
        ↓
accept new Forge version
```

Updating Forge should **not normally require manually merging Proxic modifications throughout the Forge source tree**.

### 0.9.2 Proxic Code Must Live Outside Forge

Proxic-specific code should normally live in:

```text
forge-worker/
```

or another clearly Proxic-owned adapter module.

Examples include:

```text
Forge bootstrap code
match-process management
Proxic PlayerController adapter
Proxic protocol translation
state DTO conversion
hidden-information serialization
semantic event translation
deck translation
worker command handling
logging
health reporting
```

These should not be implemented by editing upstream Forge classes unless Phase 0 proves that no reasonable external integration point exists.

### 0.9.3 Do Not Copy and Fork Forge Classes Casually

The coding agent MUST NOT solve an integration difficulty by casually copying a Forge class into Proxic and modifying it.

For example:

```text
copy PlayerController.java
modify it
maintain our own version forever
```

is prohibited unless there is a documented, approved reason.

Prefer:

```text
subclassing
composition
adapters
wrappers
public APIs
protected extension points
Forge-provided interfaces
```

where technically sound.

### 0.9.4 Reflection Is an Update Risk

If integration requires Java/Kotlin reflection into Forge internals, the agent must document it.

Reflection is not automatically prohibited.

But every reflective dependency must identify:

```text
Forge class
Forge field/method
reason reflection is required
failure behavior if Forge changes
test covering that dependency
```

Reflection should be treated as a compatibility risk because Forge updates can break it without compiler errors.

### 0.9.5 Unavoidable Forge Patches

If Phase 0 proves that an upstream Forge modification is genuinely unavoidable:

**STOP AND ASK THE PROJECT OWNER BEFORE APPLYING IT.**

If approved, the patch must be:

```text
minimal
isolated
documented
reviewable
mechanically reproducible
covered by a regression test
```

The project must maintain a patch inventory such as:

```text
forge_patches/
```

Each patch should document:

```text
Patch ID
Forge commit
Forge file affected
Reason
Why adapter-based implementation was not viable
Expected upstream behavior
Regression test
Whether an upstream Forge issue/PR exists
```

Patches must not be scattered as undocumented edits inside the Forge checkout.

### 0.9.6 Full Forge Checkout Is the Preferred Phase 0 Candidate

Phase 0 should begin with a preference for retaining a complete upstream Forge checkout rather than immediately repeating the previous project's selective-vendoring approach.

Preferred candidate:

```text
third_party/forge/
```

containing an identifiable upstream Forge checkout pinned to an exact Git commit.

A Git submodule is one candidate implementation.

Other mechanisms may be selected if Phase 0 finds a better solution.

The important property is:

> We must always be able to identify exactly what came from upstream Forge and exactly what belongs to Proxic.

### 0.9.7 Selective Vendoring Must Earn Its Complexity

The old Proxic project successfully used a selective Forge snapshot, but it also discovered that apparently unrelated runtime resources were required by headless Forge initialization.

Examples from the old implementation included localization resources and runtime type-list data that Forge's normal application startup initialized implicitly.

Therefore selective vendoring should no longer be assumed to be the default.

Phase 0 must compare:

```text
A. Full pinned Forge checkout

B. Selective Forge vendoring

C. Building Forge from a full checkout and consuming
   only produced runtime artifacts
```

The evaluation must prioritize:

```text
updateability
resource completeness
reproducibility
build reliability
maintenance burden
Docker size
runtime size
Forge compatibility
```

Saving repository or build-context size is less important than avoiding fragile missing-resource failures.

### 0.9.8 Full Source Does Not Mean Full Runtime Image

Keeping a complete Forge source checkout does **not** mean the production Docker image must contain the complete Forge repository.

Preferred model:

```text
BUILD STAGE

full pinned Forge source
JDK
Maven
build tools
        ↓
compile / package
        ↓

RUNTIME STAGE

JRE
Proxic Forge worker
required Forge JARs
required Forge runtime resources
```

The build environment may contain the full Forge repository.

The runtime container should contain only the artifacts and resources proven necessary by Phase 0.

### 0.9.9 Exact Forge Version Must Always Be Known

Every supported Proxic Arena build must identify the exact Forge version used.

At minimum record:

```text
Forge Git commit
Forge release/tag if applicable
build date
Java version
Proxic Arena version
protocol version
```

The running server should eventually expose this information through diagnostics.

Example:

```json
{
  "proxic_version": "1.0.0",
  "protocol_version": 1,
  "forge_commit": "abc123...",
  "java_version": "..."
}
```

### 0.9.10 Forge Update Compatibility Suite

Phase 0 must define the beginning of a Forge compatibility suite.

Eventually, advancing Forge must automatically or reproducibly test at least:

```text
Forge bootstrap
card database loading
basic lands
mana
tokens
targeting
stack
priority
hidden information
face-down cards
zone changes
trigger decisions
replacement decisions
combat
Commander
worker startup/shutdown
multiple simultaneous matches
```

Later phases will expand this with the Proxic Mechanics Lab.

The Forge version must not be updated merely because it compiles.

### 0.9.11 No Silent Forge Update

The coding agent must never silently update Forge while working on an unrelated feature.

A Forge update is a deliberate operation.

It must report:

```text
Old Forge commit:
New Forge commit:

Reason for update:

Forge build result:

Proxic adapter build result:

Compatibility tests:

Behavior changes:

Adapter changes required:

Known regressions:
```

The new Forge commit should only become the project's pinned version after review.

### 0.9.12 Upstream-First Preference

When Proxic encounters a genuine Forge engine defect, the default preference should be:

```text
1. Confirm it is actually a Forge defect.

2. Confirm current upstream has not already fixed it.

3. Determine whether Proxic can adapt around it without
   changing Magic behavior.

4. If the engine itself must change, consider an upstream
   Forge fix/issue/PR.

5. Only maintain a local patch when necessary.
```

Do not create competing Magic rules in Proxic to compensate for an engine defect.

### 0.9.13 Permanent Boundary

The architectural goal is:

```text
PROXIC
owns:

web application
accounts
decks
sessions
browser protocol
presentation state
match orchestration
Forge adapter
Docker deployment


FORGE
owns:

Magic rules
card behavior
legality
priority
stack
combat rules
state-based actions
replacement effects
trigger behavior
format rules it supports
```

Proxic should integrate with Forge.

Proxic should not gradually become a fork of Forge.

### 0.9.14 Phase 0 Forge Preservation Acceptance Criteria

Before Phase 0 can recommend the permanent Forge integration strategy, it must answer:

- [ ] Can a complete upstream Forge checkout be used without modification?
- [ ] Can Proxic adapter code remain entirely outside Forge?
- [ ] What Forge modules must be compiled?
- [ ] What Forge runtime resources must ship?
- [ ] Can the runtime Docker image omit Forge source?
- [ ] How will the Forge commit be pinned?
- [ ] How will an update be performed?
- [ ] What compatibility tests run after an update?
- [ ] Are any local patches unavoidable?
- [ ] If patches are unavoidable, can they remain isolated and reproducible?
- [ ] Does the proposed architecture make Forge updates easier than the old selective-vendoring system?

The preferred result is:

```text
UPSTREAM FORGE:
untouched

PROXIC ADAPTER:
separate

FORGE VERSION:
exactly pinned

UPDATE:
advance upstream commit + run compatibility suite
```

---

## 0.10 Select and Pin the Forge Candidate

Before any Phase 0 experiment begins:

1. Fetch the current official Forge repository.
2. Record the current upstream commit hash.
3. Record the latest stable release/tag if one exists.
4. Record the Java requirement.
5. Record Maven/build requirements.
6. Record the date of the snapshot.
7. Decide which exact commit will be used for Phase 0 testing.

Do not run tests against a floating `master` without recording the commit.

The Phase 0 report must contain:

```text
Forge repository:
https://github.com/Card-Forge/forge

Phase 0 commit:
<hash>

Phase 0 date:
<date>

Java:
<actual version>

Maven:
<actual version>
```

---

## 0.11 Current Forge vs Previous Forge

The agent must explicitly compare the previous Proxic Forge snapshot against the Phase 0 Forge snapshot.

At minimum inspect changes affecting:

```text
PlayerController
Game / Match creation
network play
remote player controllers
state synchronization
hidden-information handling
GameView / CardView
event system
card loading
StaticData
resource loading
Commander
team multiplayer
Two-Headed Giant
```

The goal is not to produce a full Forge changelog.

The goal is to identify changes that could alter Proxic architecture.

---

## 0.12 PlayerController Audit

The previous implementation was built around Forge's `PlayerController`.

Phase 0 must inspect the current version from scratch.

Required output:

```text
docs/research/phase-00/forge-player-controller-audit.md
```

It must document:

- current class path;
- whether it remains abstract;
- number of abstract decision methods;
- newly added methods compared with the old pinned version;
- removed methods;
- methods with useful default implementations;
- methods that are AI-only;
- methods that are human-interaction relevant;
- methods that involve payment;
- methods that involve hidden information;
- methods that involve combat;
- methods that involve opening-hand/pregame decisions;
- methods involving multiplayer voting or player selection;
- methods involving dice/coin/random choices;
- methods involving face-down cards;
- methods involving alternative card faces;
- methods involving replacement effects;
- methods involving optional costs.

Do not manually guess the total.

Use source inspection or a small script to enumerate the actual abstract method declarations.

---

## 0.13 Decision Surface Matrix

Create:

```text
docs/research/phase-00/forge-decision-surface.csv
```

Columns:

```text
Forge method
Category
Shape
Requires player response?
Requires hidden information?
May occur during payment?
May occur during resolution?
May occur without priority?
Current Proxic semantic choice type
Covered by old bridge?
Covered by current Forge network layer?
Phase 0 runtime exercised?
Notes
```

Example categories:

```text
TARGET_SELECTION
CARD_SELECTION
PLAYER_SELECTION
MODE_SELECTION
NUMBER_SELECTION
COLOR_SELECTION
CONFIRMATION
PAYMENT
MANA
COMBAT
ORDERING
REPLACEMENT
PREGAME
HIDDEN_INFORMATION
RANDOM_RESULT
VOTING
NAMING
OTHER
```

The purpose is not to implement every method.

The purpose is to understand the complete interface before choosing the permanent adapter strategy.

---

## 0.14 Inspect Forge's Current Network Architecture

Current Forge network play must be inspected at source level.

The coding agent must identify:

```text
server entry point
client entry point
remote player abstraction
controller abstraction
network message classes
state synchronization mechanism
hidden-information filtering path
decision request/reply path
reconnect implementation
session lifecycle
multiplayer seat handling
game-state serialization
```

Create:

```text
docs/research/phase-00/forge-network-architecture.md
```

The document must contain a diagram showing the current Forge network path.

Do not invent class names.

Use the real classes from the pinned source.

---

## 0.15 Determine Forge Network Coupling

The audit must answer:

```text
Is Forge's network layer usable independently
of Forge's Swing/mobile GUI?
```

Inspect whether it depends heavily on:

```text
forge-gui
forge-gui-desktop
Swing classes
desktop rendering
FModel
GUI singletons
platform-specific classes
```

Classify coupling as:

```text
LOW
MEDIUM
HIGH
```

Explain why.

---

## 0.16 Network Strategy Proof

If Forge's current network system can reasonably be reused, build the smallest possible proof.

The goal is NOT:

```text
Browser connects directly to Forge.
```

The goal is:

```text
Can Proxic internally reuse Forge's
remote-player/network decision machinery?
```

For example:

```text
Headless adapter
       ↓
Forge network layer
       ↓
Forge game
```

If that path requires substantial GUI initialization or would expose Forge's protocol directly to browsers, document that.

---

## 0.17 Compare the Three Adapter Strategies

Create:

```text
docs/research/phase-00/forge-adapter-options.md
```

Score:

| Criterion | Custom PlayerController | Forge Network Reuse | Hybrid |
|---|---:|---:|---:|
| Forge update resilience | | | |
| Implementation effort | | | |
| Decision completeness | | | |
| Hidden-information safety | | | |
| Browser-protocol isolation | | | |
| Headless friendliness | | | |
| Debuggability | | | |
| Testability | | | |
| Crash isolation | | | |
| Dependency size | | | |
| GUI coupling | | | |
| Long-term maintenance | | | |

Use:

```text
1 = poor
5 = excellent
```

Every score needs a short evidence note.

---

## 0.18 Forge Bootstrap Audit

The previous project discovered that Forge initialization required several pieces normally initialized by the Forge application.

Phase 0 must determine the current requirements.

Do not blindly copy the old bootstrap.

Starting from a clean process, determine exactly what is required to:

```text
load Forge
load StaticData
load editions
load card rules
load card type vocabularies
load language/localization resources
load token definitions
load format information
construct a Deck
construct RegisteredPlayer objects
construct a Match
construct a Game
start a game
```

Create:

```text
docs/research/phase-00/forge-bootstrap.md
```

For each initialization step record:

```text
Class/method
Why required
Resource path
Module containing resource
Evidence
Failure observed if omitted
```

---

## 0.19 Resource Dependency Audit

Create a complete list of runtime resource directories required by a headless Forge worker.

Potential categories to investigate include:

```text
cardsfolder
languages
lists
editions
tokens
formats
keywords
scripts
other forge-gui/res content
```

Do not assume the category list above is complete.

Generate the actual list from the current Forge build and observed runtime accesses where practical.

---

## 0.20 Headless Worker Proof

Create the smallest headless current-Forge worker capable of:

```text
starting a game
loading two decks
mulliganing
drawing
playing lands
producing mana
casting a creature
attacking
blocking
dealing combat damage
ending the game
```

No browser.

No React.

No database.

No authentication.

No production WebSocket server.

Use scripted test controllers if necessary.

---

## 0.21 Card Loading Tests

The bootstrap proof must include:

### Basic land

Verify `Forest` is correctly recognized and generates/uses its mana ability.

This specifically guards against repeating the previous type-list bootstrap bug.

### Token

Use a card that creates a token.

Verify:

```text
token definition loads
token appears
token has correct basic characteristics
```

### Double-faced card

Load and exercise at least one DFC.

Verify that both Forge rules state and Proxic-relevant view data can identify the current face.

### Modal DFC or another alternate-face structure

Confirm exact card identity does not become ambiguous.

### Exact printing

Resolve a card using:

```text
name
set
collector number
```

and determine the current Forge API required.

Then intentionally use a Scryfall printing Forge does not know exactly, if a suitable example exists, and validate the intended fallback behavior.

---

## 0.22 Game Construction Documentation

Document the actual current object graph required to create a match.

Do not reuse the old object's names without verification.

Produce a current diagram such as:

```text
StaticData
    ↓
Deck
    ↓
RegisteredPlayer
    ↓
LobbyPlayer / equivalent
    ↓
GameRules
    ↓
Match
    ↓
Game
    ↓
PlayerController
```

The diagram must reflect the actual current commit.

---

## 0.23 State Representation Audit

Investigate:

```text
GameView
PlayerView
CardView
CombatView
StackItemView
ZoneView
GameSnapshot
other current Forge state/view objects
```

Determine which should form the basis of Proxic state serialization.

Do not begin by hand-writing another complete state model.

First determine what Forge already provides.

---

## 0.24 Hidden Information Tests

Hidden information is a release-blocking concern.

The following must be tested with two independently serialized viewer perspectives.

### Test H1 — Opponent hand

Player A must not receive card identities from Player B's unrevealed hand.

### Test H2 — Library

Player A must not receive private identities of Player B's library.

### Test H3 — Own hand

Player A must receive their own hand identities.

### Test H4 — Face-down permanent

A face-down permanent must expose only information that its viewer is legally entitled to know.

Test from:

```text
controller's perspective
opponent's perspective
```

Do not consider the test valid if both perspectives return the same data accidentally.

### Test H5 — Look without reveal

Use an effect where one player looks at hidden cards without revealing them.

Verify only the entitled viewer receives the identities.

### Test H6 — Reveal

Use an effect that reveals hidden cards.

Verify the appropriate viewers gain access.

### Test H7 — Return to hidden zone

After a previously known card becomes hidden again, determine what Forge exposes and how Proxic should represent known/unknown information.

Do not invent memory rules in Phase 0.

Record Forge's behavior.

---

## 0.25 Hidden Information Architecture Decision

The final report must recommend one of:

```text
Serialize Forge's per-viewer View objects directly
```

```text
Build Proxic DTOs using Forge visibility APIs
```

```text
Hybrid
```

The recommendation must explain why it cannot leak:

```text
hand cards
library cards
face-down identities
private choices
look-only information
```

---

## 0.26 Semantic Event Audit

The previous project successfully used Forge's game-event system for presentation events.

Re-evaluate this against the current commit.

Determine whether the following can reliably be observed:

```text
ZONE_CHANGED
DAMAGE_DEALT
LIFE_CHANGED
COUNTER_CHANGED
TAPPED_CHANGED
ATTACHMENT_CHANGED
STEP_CHANGED
ATTACKERS_DECLARED
BLOCKERS_DECLARED
SPELL_CAST
STACK_OBJECT_ADDED
STACK_OBJECT_RESOLVED
STACK_OBJECT_COUNTERED
TOKEN_CREATED
TRANSFORMED
GAME_OVER
```

These names are Proxic concepts.

They do not need to correspond one-to-one with Forge event class names.

---

## 0.27 Events Must Remain Presentation Data

Validate the architecture:

```text
Forge state
    =
authoritative truth

Forge event translation
    =
presentation/history feed
```

If an event is missed:

```text
the next authoritative snapshot
must still describe the correct game
```

The browser must never require an animation event to reconstruct game legality.

---

## 0.28 Decision Ownership Audit

Phase 0 must determine how Forge represents:

```text
active player
priority player
player being affected
player making the decision
player controlling another player's turn
team making a decision
```

These are not assumed to be identical.

---

## 0.29 Mindslaver Test

Use a real control-another-player-turn interaction.

The test must answer:

```text
Whose PlayerController gets called?

Which Player owns the objects?

Which player is active?

Which human is authorized to answer?

What hidden information becomes visible?

How does Forge represent this internally?
```

This test is required before the permanent authentication/decision-routing protocol is designed.

---

## 0.30 Priority Test

Run an interaction where:

```text
Player A is active
Player B receives priority
Player B casts an instant
Player A responds
stack resolves
```

Verify how priority is exposed by Forge.

Do not infer priority solely from current phase.

---

## 0.31 Payment Context Test

Exercise at least:

```text
normal mana payment
mana ability during payment
additional nonmana cost
alternative cost
X cost or variable number
optional cost
```

The goal is not broad card coverage.

The goal is to determine:

```text
which Forge controller APIs are involved
which decisions occur without ordinary priority
how many round trips are required
whether suggested automatic payment is available
```

---

## 0.32 Trigger Test

Exercise:

```text
mandatory trigger
optional trigger
trigger with target
trigger requiring mode/choice
```

Determine how the current Forge controller is consulted.

---

## 0.33 Replacement Effect Test

Exercise a replacement effect requiring human choice or confirmation.

Determine:

```text
which controller method runs
when it runs
whether it occurs during another action's resolution
what state the client needs to make the choice
```

---

## 0.34 Combat Test

The Phase 0 combat scenario must include:

```text
attack with some but not all creatures
multiple possible defenders if practical
no block
single block
double block
first strike
trample
deathtouch
combat damage assignment choice if Forge requests one
```

Do not use only vanilla "attack everything, never block" tests.

The old project already demonstrated why that is inadequate.

---

## 0.35 Scry / Surveil / Ordering Test

Exercise at least one interaction requiring ordering or partitioning cards.

Verify whether the permanent protocol needs a generic:

```text
ORDER
```

or:

```text
PARTITION
```

decision shape.

---

## 0.36 Card-Name / Type / Color Selection Test

Exercise at least one card that requires choosing:

```text
card name
creature type or another game-defined type
color
number
```

The goal is to identify decision families, not to design final UI.

---

## 0.37 Multiplayer Voting Test

If current Forge supports an appropriate real card and multiplayer configuration, inspect one voting decision.

This helps determine whether a generic:

```text
CHOOSE_OPTION
```

shape is sufficient or a multiplayer-specific decision type is useful.

Failure to run this test does not block two-player Phase 1 if the reason is documented.

---

## 0.38 Commander Capability Audit

Do not assume "Forge has Commander" means every Proxic requirement is solved.

Verify:

```text
Commander deck construction
commander designation
command zone
commander replacement choice
commander tax
color identity enforcement
commander damage
multiple commanders if supported
starting life
mulligan/game setup
```

Separate findings into:

```text
SOURCE
RUN
```

---

## 0.39 Commander Runtime Test

Complete a small Commander test game or controlled sequence that demonstrates at minimum:

```text
commander starts in command zone
commander can be cast
commander tax changes after recast
commander can move to command zone when appropriate
commander damage is tracked
```

This does not need to be a full-length 100-card natural game if a deterministic test harness can reach the required states legitimately.

---

## 0.40 Two-Headed Giant Capability Audit

Two-Headed Giant is considered **UNPROVEN** until this section passes.

Current Forge documentation listing supported network variants is not sufficient proof.

Inspect actual source for:

```text
shared team turn
shared life total
team priority
attack as a team
block as a team
team poison threshold
player-specific resources
teammate hidden-information rules
range-of-influence or multiplayer assumptions
team loss conditions
```

---

## 0.41 Two-Headed Giant Capability Classification

At the end classify Forge 2HG as exactly one:

### `SUPPORTED`

Current Forge implements the required game structure and Phase 0 runtime tests demonstrate it.

### `PARTIAL`

Some required team mechanics exist, others do not.

### `UNSUPPORTED`

The current Forge build does not implement the required shared-team model.

### `UNKNOWN`

Evidence was insufficient.

Do not label:

```text
SUPPORTED
```

based solely on general multiplayer support.

---

## 0.42 2HG Escalation Gate

If Forge is `PARTIAL`, `UNSUPPORTED`, or `UNKNOWN`:

**STOP.**

Do not implement missing 2HG rules in Kotlin, TypeScript, or Python.

The project owner must decide whether to:

```text
remove 2HG from initial scope

wait for Forge

maintain an isolated Forge patch

contribute upstream to Forge

choose another approach
```

That decision belongs to the project owner.

---

## 0.43 Evaluate Current Forge Network Play

Current Forge documents:

```text
host/server role
remote clients
multiple players
reconnect behavior
network game synchronization
```

Phase 0 must run Forge's own network tests if practical.

Do not merely read them.

Record:

```text
test command
Forge commit
number of games
pass/fail
failures
runtime
```

---

## 0.44 Forge Network Test Questions

After running them, answer:

```text
What is synchronized?

Are entire views serialized?

Are decisions serialized?

Does the client still execute substantial game logic?

How are private objects represented?

How does reconnect reconstruct state?

Does the protocol assume Forge client classes?

Does a remote client require forge-gui?

Can the server operate truly headlessly?

Can Proxic reuse the server side without Forge's client side?
```

---

## 0.45 Browser Must Not Speak Forge Protocol Directly

Even if Forge networking is reused internally, the default Phase 0 position is:

```text
Browser
   ↓
Proxic protocol
   ↓
Proxic server/adapter
   ↓
Forge internals
```

The browser should not become coupled to:

```text
Forge class names
Forge serialization classes
Forge network packet classes
Forge Java object IDs
Forge version-specific method signatures
```

If the agent recommends direct browser-to-Forge networking, that is a major architectural deviation and requires explicit user approval.

---

## 0.46 Process Isolation Test

Validate:

```text
one JVM worker per game
```

against the current Forge build.

Launch:

```text
Game A
Game B
Game C
```

simultaneously.

Each should use distinct deterministic test decks or seeds where practical.

Verify:

```text
game state does not cross
decisions do not cross
logs can be separated
one worker can terminate independently
one worker failure does not kill others
memory is returned after worker exit
```

---

## 0.47 Crash Isolation Test

Intentionally terminate:

```text
Game B worker
```

while:

```text
Game A
Game C
```

are active.

Expected:

```text
Game A unaffected
Game C unaffected
parent process detects Game B exit
Game B session can be marked failed
```

Do not deliberately corrupt Forge internals merely to create a crash.

Killing the worker process externally is sufficient.

---

## 0.48 Memory Benchmark

Measure:

```text
worker startup RSS
idle game RSS
active simple-game RSS
active complex-game RSS if practical
three simultaneous workers
post-game parent/server RSS
```

Use actual operating-system measurements.

Record:

```text
minimum
typical
maximum observed
```

Do not extrapolate beyond measured data without labeling it `INFERENCE`.

---

## 0.49 CPU Benchmark

For the same worker tests record:

```text
idle CPU
typical decision processing CPU
startup CPU spike
game-over cleanup
```

Extremely detailed performance profiling is unnecessary.

The purpose is to answer:

> Is 2–3 simultaneous games trivial for the intended Docker host?

---

## 0.50 Worker Startup Benchmark

Measure approximately:

```text
JVM process spawn → Forge ready
```

and:

```text
Forge ready → initial game state available
```

This helps decide whether workers should be:

```text
spawned per match
```

or:

```text
pre-warmed
```

At the project's expected scale, simplicity should be preferred unless the measured startup delay is problematic.

---

## 0.51 Multiple Games in One JVM

Phase 0 should investigate, but does not need to make this the production design.

Run a source audit for:

```text
static mutable state
singletons
global preferences
StaticData
FModel
localization globals
image/resource globals
network globals
thread pools
```

If practical, attempt two simultaneous matches in one JVM.

The purpose is comparison only.

If there is substantial uncertainty, process-per-match remains safer.

---

## 0.52 Process Model Recommendation

The final report must choose:

```text
ONE JVM PER MATCH
```

or:

```text
MULTIPLE MATCHES PER JVM
```

or:

```text
OTHER
```

and justify the choice with:

```text
SOURCE
RUN
BENCHMARK
```

evidence.

---

## 0.53 Docker Runtime Proof

Build a minimal Docker image containing only what a Forge worker needs.

Do not build the final Proxic production stack.

The image should prove:

```text
Java version works
Forge dependencies work
required resources exist
no Maven required at runtime
no Forge source required at runtime unless proven necessary
worker starts
simple game runs
```

---

## 0.54 Runtime Artifact Inventory

The Docker proof must document exactly what must ship.

Example categories:

```text
worker JAR
Forge dependency JARs
card scripts
token scripts
language resources
type lists
format files
edition files
other discovered resources
```

Do not copy the entire Forge repository into the runtime image merely because that is easy.

First identify what runtime actually requires.

---

## 0.55 Docker Filesystem Rules

Determine whether Forge attempts to:

```text
write preferences
write cache files
write logs
write card data
modify resource files
download assets
```

A production match worker should ideally treat Forge rules/resources as:

```text
read-only
```

and use a designated writable temp/data directory only where necessary.

Record actual behavior.

---

## 0.56 Scryfall Identity Boundary

Confirm the intended permanent architecture:

```text
Scryfall
=
card / printing identity + artwork

Forge
=
gameplay rules
```

Phase 0 should test that:

```text
Scryfall ID
Oracle ID
set
collector number
canonical name
```

can be mapped reliably to Forge.

Do not parse Oracle text into game behavior.

---

## 0.57 Exact Printing Fallback Test

Use at least one card where:

```text
Scryfall exact printing
```

is unavailable or inconvenient in the pinned Forge data while:

```text
canonical card rules
```

exist.

Verify whether Proxic can safely:

```text
display imported Scryfall printing
+
use another Forge PaperCard/CardRules identity
```

without changing gameplay meaning.

Document limitations for cards whose printing itself matters mechanically, if any are discovered.

---

## 0.58 Forge Update Boundary

Determine what Proxic should pin:

```text
Git commit
release tag
Maven-built artifacts
vendored subset
full upstream submodule
```

Compare at least:

### Option A

Full Forge Git submodule.

### Option B

Selective vendoring like the old project.

### Option C

Build upstream modules externally and consume produced artifacts.

The final recommendation must consider:

```text
update effort
resource completeness
licensing
Docker build size
build time
risk of accidentally omitting resources
ease of comparing/updating Forge
```

---

## 0.59 Default Preference on Vendoring

Do not assume selective vendoring remains best simply because the previous project used it.

The old implementation proved selective vendoring can work.

It also proved that missing resource paths can cause subtle bootstrap failures.

Phase 0 must reevaluate the tradeoff.

---

## 0.60 Forge Update Smoke Test

If practical:

1. Build the chosen Phase 0 Forge commit.
2. Create the minimal adapter.
3. Advance to another nearby current commit or known release.
4. Rebuild cleanly.
5. Record what adapter code breaks.

The purpose is to measure how tightly coupled Proxic would be to Forge internals.

This need not become a permanent automated test yet.

---

## 0.61 Minimal Architecture Test Deck

Phase 0 must use a small deterministic card set.

Do not use the full Mechanics Lab deck for architecture validation.

Use representatives that exercise plumbing.

Recommended categories:

```text
basic land
vanilla creature
targeted instant
counterspell
ETB trigger
optional trigger
Aura
Equipment
token creation
counter creation
scry/surveil or ordering
double-faced card
alternate cost
replacement effect
face-down object
control-another-player effect
Commander
```

Exact cards may change if a better deterministic representative exists.

---

## 0.62 Broad Mechanics Testing Is Not Phase 0

The 275-card Mechanics Lab suite is for later rules/regression coverage.

Phase 0 asks:

```text
Can the architecture carry this kind of interaction?
```

not:

```text
Does every Forge-supported mechanic work?
```

Do not turn Phase 0 into months of card testing.

---

## 0.63 Protocol Lessons from the Existing Project

The following existing concepts should be evaluated for reuse:

```text
decision_request
decision_response
choice_type
candidate kind
source_id
stable object ID
state_version
expected_state_version
resume token
semantic event stream
full authoritative snapshot
```

The final Phase 0 report should say for each:

```text
KEEP
CHANGE
REMOVE
DEFER
```

with reasoning.

---

## 0.64 Stable Object Identity Test

Determine which Forge identity is safe to expose within one match.

Requirements:

```text
same object has same Proxic ID across snapshots
duplicate copies of same card remain distinct
tokens remain distinct
stack object and source card can be distinguished
ability objects can be distinguished from cards
zone changes do not accidentally create identity collisions
new-object rules after zone changes can be represented
```

Do not assume Forge's internal numeric ID can simply become a permanent public protocol ID without inspecting lifecycle behavior.

---

## 0.65 Snapshot Strategy Test

Compare:

```text
full per-viewer snapshots
```

against:

```text
delta/event-driven state synchronization
```

For 2–3 games, optimize for correctness and simplicity rather than bandwidth.

If full snapshots are acceptably small/fast, Phase 0 should say so.

---

## 0.66 Snapshot Benchmark

Measure representative serialized state sizes for:

```text
opening game
midgame
large battlefield
large graveyard
Commander board if practical
```

Record byte sizes.

This determines whether optimization is actually necessary.

---

## 0.67 Reconnect Architecture Test

Regardless of which network strategy is selected, demonstrate:

```text
client disconnects
match worker remains alive
client reconnects
correct seat restored
latest legal state supplied
outstanding decision supplied again or reconstructed
game continues
```

This can use a headless Proxic test client.

No browser UI is needed.

---

## 0.68 Duplicate Response Test

Reproduce the previous dangerous condition intentionally:

```text
same decision response sent twice
```

The second response must not become the answer to a later Forge question.

Reject before it reaches the synchronous decision waiter.

---

## 0.69 Stale Response Test

Send a response for:

```text
old decision ID
```

after state has advanced.

It must be rejected.

---

## 0.70 Wrong-Player Response Test

Player A attempts to answer Player B's decision.

It must be rejected.

Then test a controlled-turn interaction where the human authorized to make the decision is not simply the player object owning the turn.

The architecture must support both cases.

---

## 0.71 No Magic Rules in Transport Layer

If Phase 0 uses a temporary relay, it may know:

```text
connection
session
seat
decision owner
message ID
state version
```

It must not know:

```text
whether Flying can block
whether a card can be cast
how much mana something costs
whether a target is legal
whether a creature has summoning sickness
```

That remains Forge's job.

---

## 0.72 Forge Worker API Candidate

At the end of Phase 0, propose a small permanent interface.

Conceptually:

```text
CREATE_MATCH
SUBMIT_DECK
START_MATCH
SUBMIT_DECISION
REQUEST_SNAPSHOT
CLOSE_MATCH
```

outbound:

```text
MATCH_READY
STATE_SNAPSHOT
DECISION_REQUIRED
GAME_EVENT
GAME_OVER
WORKER_ERROR
```

This is only an example.

The final names are a Phase 0 result, not predetermined.

---

## 0.73 Do Not Design Browser UX Here

Phase 0 may identify that a Forge decision requires:

```text
select N cards
order objects
choose color
assign values
```

It should not design the final visual interface for those choices.

That belongs to later phases.

Phase 0 only defines what information the browser must eventually receive and return.

---

## 0.74 Research Output Directory

Recommended:

```text
docs/
└── research/
    └── phase-00/
        ├── README.md
        ├── forge-version.md
        ├── forge-module-map.md
        ├── forge-bootstrap.md
        ├── forge-resource-map.md
        ├── forge-player-controller-audit.md
        ├── forge-decision-surface.csv
        ├── forge-network-architecture.md
        ├── forge-state-and-visibility.md
        ├── forge-events.md
        ├── forge-formats.md
        ├── forge-process-model.md
        ├── forge-docker-runtime.md
        ├── forge-update-strategy.md
        ├── adapter-options.md
        ├── benchmark-results.md
        └── FINAL_RECOMMENDATION.md
```

---

## 0.75 Every Research File Needs Evidence

Every conclusion should use labels such as:

```text
[UPSTREAM-DOC]
[SOURCE]
[RUN]
[BENCHMARK]
[INFERENCE]
[USER]
```

Example:

```text
[SOURCE]
Forge class X owns the current remote-player request path.

[RUN]
The Phase 0 harness successfully selected a target through
that path in test scenario TARGET-001.

[INFERENCE]
Therefore the class is a strong candidate for Proxic reuse.
```

---

## 0.76 Required Phase 0 Checklist

### Forge source

- [ ] Fetch current official Forge.
- [ ] Record exact commit.
- [ ] Record latest release/tag.
- [ ] Record Java/Maven requirements.
- [ ] Build cleanly.
- [ ] Run relevant upstream tests.
- [ ] Record results.

### Existing Proxic

- [ ] Read old `AGENTS.md`.
- [ ] Read old `PROTOCOL.md`.
- [ ] Read old `ROADMAP.md`.
- [ ] Inspect `BridgeMain`.
- [ ] Inspect `PlayerControllerNetwork`.
- [ ] Inspect `DecisionChannel`.
- [ ] Inspect `StateSnapshot`.
- [ ] Inspect `GameEventTranslator`.
- [ ] Inspect relay/session authority code.
- [ ] List lessons worth preserving.
- [ ] List old assumptions no longer valid.
- [ ] Confirm `Proxic_Arena_OLD` remains unchanged.

### Forge bootstrap

- [ ] Identify required modules.
- [ ] Identify required resource directories.
- [ ] Verify card database initialization.
- [ ] Verify basic lands.
- [ ] Verify tokens.
- [ ] Verify DFC.
- [ ] Verify formats.
- [ ] Document bootstrap sequence.

### Player decisions

- [ ] Enumerate current abstract `PlayerController` surface.
- [ ] Categorize methods.
- [ ] Create decision-surface matrix.
- [ ] Compare against old adapter.
- [ ] Inspect current Forge remote-player architecture.
- [ ] Identify reusable pieces.

### Adapter strategy

- [ ] Prototype custom-controller path.
- [ ] Prototype Forge-network reuse if viable.
- [ ] Evaluate hybrid.
- [ ] Score all viable options.
- [ ] Recommend one.

### State

- [ ] Inspect current Forge View model.
- [ ] Determine per-viewer serialization strategy.
- [ ] Test opponent hand.
- [ ] Test library.
- [ ] Test own hand.
- [ ] Test face-down object.
- [ ] Test look-without-reveal.
- [ ] Test reveal.
- [ ] Test hidden information after zone movement.

### Events

- [ ] Inspect Forge event bus.
- [ ] Identify semantic event mappings.
- [ ] Confirm events are non-authoritative presentation data.
- [ ] Verify missing event cannot corrupt state.

### Decisions / rules timing

- [ ] Priority interaction.
- [ ] Normal mana payment.
- [ ] Payment-time mana ability.
- [ ] Additional cost.
- [ ] Variable cost.
- [ ] Optional cost.
- [ ] Trigger.
- [ ] Optional trigger.
- [ ] Replacement decision.
- [ ] Target selection.
- [ ] Ordering.
- [ ] Color/type/name/number choice.
- [ ] Complex combat.
- [ ] Controlled-player decision.

### Formats

- [ ] Verify Commander source capability.
- [ ] Run Commander tests.
- [ ] Audit 2HG source.
- [ ] Attempt 2HG runtime test if source suggests support.
- [ ] Classify 2HG as `SUPPORTED` / `PARTIAL` / `UNSUPPORTED` / `UNKNOWN`.

### Process model

- [ ] Start one worker.
- [ ] Start three workers.
- [ ] Run three matches simultaneously.
- [ ] Kill one worker.
- [ ] Verify others survive.
- [ ] Measure memory.
- [ ] Measure CPU.
- [ ] Measure startup time.
- [ ] Verify clean shutdown.

### Docker

- [ ] Create minimal worker image.
- [ ] Run simple game in container.
- [ ] List runtime resources.
- [ ] Confirm no Maven required at runtime.
- [ ] Determine write requirements.
- [ ] Determine final Forge packaging recommendation.

### Forge preservation/updateability

- [ ] Evaluate full pinned Forge checkout.
- [ ] Evaluate selective vendoring.
- [ ] Evaluate build-from-full-checkout/runtime-artifacts approach.
- [ ] Verify Proxic adapter can remain outside Forge if possible.
- [ ] Document any reflection dependencies.
- [ ] Document any unavoidable patch requirement.
- [ ] Define Forge update workflow.
- [ ] Define compatibility tests required after Forge updates.

### Protocol

- [ ] Evaluate old decision protocol.
- [ ] Evaluate `state_version`.
- [ ] Evaluate stable object IDs.
- [ ] Evaluate semantic events.
- [ ] Test duplicate response.
- [ ] Test stale response.
- [ ] Test wrong-player response.
- [ ] Test reconnect.

### Final decision

- [ ] Produce adapter recommendation.
- [ ] Produce process-model recommendation.
- [ ] Produce Forge packaging recommendation.
- [ ] Produce state/visibility recommendation.
- [ ] Produce protocol-boundary recommendation.
- [ ] Produce Commander determination.
- [ ] Produce 2HG determination.
- [ ] Produce Forge preservation/update recommendation.
- [ ] Produce Phase 1 requirements.
- [ ] Present report to project owner.
- [ ] Do NOT begin Phase 1.

---

## 0.77 Mandatory Acceptance Tests

Phase 0 is not complete unless these tests have evidence.

### P0-A — Forge Builds

The exact pinned Forge commit builds successfully in a clean environment.

**Required evidence:** `RUN`

### P0-B — Headless Two-Player Game

A current-Forge two-player game runs without Forge's desktop/mobile UI.

Must include:

```text
mulligan
land
mana
spell
attack
block
damage
game state advancement
```

**Required evidence:** `RUN`

### P0-C — Target and Stack Interaction

A targeted spell is cast.

Opponent receives priority.

A response is made.

Stack resolves correctly.

**Required evidence:** `RUN`

### P0-D — Hidden Information

Two independently produced viewer states demonstrate:

```text
own hand visible
opponent hand hidden
face-down object appropriately hidden
```

**Required evidence:** `RUN`

### P0-E — Decision Ownership

A response from the wrong human/connection is rejected.

**Required evidence:** `RUN`

### P0-F — Duplicate Decision

A duplicate response cannot answer a subsequent Forge question.

**Required evidence:** `RUN`

### P0-G — Complex Payment

At least one nontrivial Forge payment/choice flow works through the candidate adapter architecture.

**Required evidence:** `RUN`

### P0-H — Trigger / Replacement

At least one triggered choice and one replacement-related decision path are observed.

**Required evidence:** `RUN`

### P0-I — Combat Branches

Actual test execution includes:

```text
partial attack
real block
double block
damage assignment path
```

**Required evidence:** `RUN`

### P0-J — Commander

Core Commander behavior is demonstrated or explicitly shown unavailable.

**Required evidence:** `SOURCE + RUN` where available.

### P0-K — Two-Headed Giant

A capability classification is produced.

`SUPPORTED` requires runtime evidence.

**Required evidence:** `SOURCE`; `RUN` required for `SUPPORTED`.

### P0-L — Three Match Workers

Three independent Forge matches run simultaneously.

**Required evidence:** `RUN + BENCHMARK`

### P0-M — Worker Failure Isolation

One worker terminates while the others remain functional.

**Required evidence:** `RUN`

### P0-N — Docker Worker

The headless worker runs inside the proposed minimal container.

**Required evidence:** `RUN`

### P0-O — Architecture Decision

The final report recommends one permanent Forge adapter strategy and explains why the alternatives were rejected.

**Required evidence:** Combined Phase 0 evidence.

### P0-P — Forge Preservation / Updateability

Phase 0 demonstrates or explicitly rejects, with evidence, the preferred model:

```text
complete pinned upstream Forge checkout
+
Proxic-owned adapter outside Forge
+
minimal runtime artifacts
+
repeatable Forge update compatibility suite
```

**Required evidence:** `SOURCE + RUN` where applicable.

---

## 0.78 Exit Report

Phase 0 must conclude with:

```text
docs/research/phase-00/FINAL_RECOMMENDATION.md
```

Required headings:

```text
1. Executive Summary

2. Forge Version Tested

3. What the Existing Proxic Project Proved

4. Current Forge Architecture Findings

5. Bootstrap Requirements

6. Human Decision Architecture

7. Forge Network Architecture

8. Adapter Options Evaluated

9. Recommended Adapter

10. State Serialization Strategy

11. Hidden Information Strategy

12. Event Strategy

13. Object Identity Strategy

14. Worker Process Strategy

15. Resource / Docker Strategy

16. Forge Preservation and Update Strategy

17. Commander Result

18. Two-Headed Giant Result

19. Runtime Benchmarks

20. Known Risks

21. Known Unknowns

22. Required Phase 1 Architecture

23. Questions Requiring Project-Owner Decision
```

---

## 0.79 Final Recommendation Must Be Decisive

The final report must not merely say:

```text
All three approaches have advantages.
```

It must say:

```text
RECOMMENDED:
Strategy C

REASON:
...

NOT RECOMMENDED:
Strategy A
Reason: ...

NOT RECOMMENDED:
Strategy B
Reason: ...
```

If evidence is genuinely insufficient to choose, Phase 0 is not complete.

Design another targeted experiment.

---

## 0.80 Escalation Rule

The coding agent must stop and ask the project owner before:

```text
editing upstream Forge

patching Magic rules

replacing Forge

dropping a required format

implementing missing 2HG rules independently

coupling the browser directly to Forge

abandoning process-per-match isolation without evidence

adding a second source of game legality

changing the approved Scryfall/Forge responsibility boundary

discarding a proven safety mechanism from the previous project

modifying anything in Proxic_Arena_OLD

making a major architecture decision not covered by this phase
```

---

## 0.81 Unexpected Findings Procedure

When reality conflicts with this Phase 0 plan:

Do not blindly follow the document.

Report:

```text
CONFLICT

Requirement:
<what Phase 0 said>

Observed reality:
<what source/runtime showed>

Evidence:
<SOURCE/RUN/etc.>

Impact:
<why it matters>

Options:
A.
B.
C.

Recommendation:
<agent's recommendation>

Question:
How would you like to proceed?
```

Wait for the project owner's answer before making a material architecture change.

---

## 0.82 Prohibited Phase 0 Shortcuts

The agent must not:

- Assume current Forge behaves like the old pinned Forge.
- Assume old method counts remain accurate.
- Assume Forge network documentation proves Proxic compatibility.
- Assume general multiplayer support means Two-Headed Giant support.
- Assume a class existing means a feature works.
- Assume a game completing means every intended branch was tested.
- Implement unsupported rules outside Forge.
- Parse Scryfall Oracle text into gameplay logic.
- Let a test client make legality decisions Forge should make.
- Hide private information only in the UI after transmitting it.
- Treat English prompt text as the primary programmatic decision API.
- Use card-name-specific Proxic rules to make a test pass.
- Benchmark by guessing.
- Claim a Docker test ran when only the Dockerfile was inspected.
- Begin building the production React/Ktor application.
- Modify the old project.
- Scatter Proxic modifications through upstream Forge.
- Update Forge silently.
- Treat a successful Forge compile as sufficient compatibility verification.

---

## 0.83 What Phase 0 Does Not Build

At completion, Proxic Arena still does not need:

```text
production web frontend
user accounts
Deck Depot UI
PostgreSQL schema
production lobby
production authentication
PixiJS battlefield
match history
friends
production reverse proxy
production Caddy configuration
```

Those come later.

Phase 0 exists to ensure those systems are built on the right Forge foundation.

---

## 0.84 Phase 0 Success Condition

Phase 0 is successful when we can draw the final architecture from evidence rather than intention.

For example:

```text
Browser
TypeScript / React / PixiJS
             │
             ▼
Arena Server
Kotlin / Ktor
             │
             ▼
<PHASE 0 CHOSEN WORKER PROTOCOL>
             │
             ▼
Forge Worker JVM
<PHASE 0 CHOSEN ADAPTER>
             │
             ▼
Pinned Forge
```

And every placeholder above has an evidence-backed answer.

---

## 0.85 Locking Procedure

This document is now the locked Phase 0 specification.

The coding agent must execute Phase 0 against this specification and produce the evidence package.

When the coding agent completes Phase 0:

1. Project owner receives the complete evidence package.
2. Project owner reviews the final recommendation.
3. Any disputed conclusions are investigated or amended.
4. Project owner explicitly accepts the Phase 0 execution result.
5. Only then may Phase 1 be finalized.

If a legitimate change to this locked specification becomes necessary, do not silently edit history.

Create an explicit amendment:

```text
PHASE 0 AMENDMENT <number>

Reason:
Affected requirement:
Old decision:
New decision:
Evidence:
Approved by project owner:
Date:
```

---

# Phase 0 Final Principle

**Do not build the application around what we think Forge probably does.**

First prove:

```text
how Forge boots

how Forge asks a human questions

how Forge exposes state

how Forge protects hidden information

how Forge communicates remotely

how Forge behaves across multiple matches

how Forge handles required formats

how Forge can remain as intact and updateable upstream code

and where Proxic should attach to it
```

Then build Proxic Arena around those facts.

---

# Locked Project Paths

**Reference-only old project**

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

**Authoritative new project**

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena
```

Permanent shorthand:

```text
READ OLD
BUILD NEW
```
