# Proxic Arena Build Plan

# Phase 0B — Deferred Forge Validation

**Status:** DRAFT
**Phase Type:** Standing register, not a phase that is "done"
**Companion:** `PHASE_00A_FORGE_BLOCKING_VALIDATION_DRAFT.md`

---

## 0B.0 What this document is

Phase 0 asked many questions. Phase 0A answers the ones whose wrong answer
would force an architecture rewrite. **Every other Phase 0 question lives
here**, with the condition that brings it back.

This is not a backlog, and it is not a list of things that turned out not
to matter. It is a register of known-unanswered questions, each paired
with the moment it stops being safe to leave unanswered.

```text
DEFERRED is a scheduling decision.
DEFERRED is never a silent decision.
```

A Phase 0B item whose trigger has fired is **blocking** from that moment
on, with the same evidence standard as Phase 0A. It does not become
optional because the project is busy.

---

## 0B.1 How to use the register

Each entry has:

```text
ITEM      what is unanswered
SOURCE    the PHASE_00 section it came from
WHY SAFE  why deferring does not risk a rewrite
TRIGGER   the condition that makes it blocking
EVIDENCE  the standard required when it is done
STATUS    DEFERRED / TRIGGERED / DONE
```

Review the register at every phase gate. An item whose trigger has fired
and whose status is still `DEFERRED` blocks that gate.

---

# PART I — SCALE AND OPERATIONS

## 0B.2 Three simultaneous match workers

```text
SOURCE    0.46, 0.48, 0.49, P0-L
WHY SAFE  The old project ran one JVM per match in production on Unraid.
          Process-per-match is already RUN evidence for the model itself;
          what is unmeasured is concurrency headroom, which changes
          capacity planning, not architecture.
TRIGGER   Any of:
            - more than two matches may run at once
            - the server is exposed beyond the owner's known group
            - a match is observed to be slow with another running
EVIDENCE  RUN + BENCHMARK, real OS measurements, no extrapolation
STATUS    DEFERRED
```

## 0B.3 Worker crash isolation

```text
SOURCE    0.47, P0-M
WHY SAFE  Follows structurally from process-per-match, which 0A decides.
          If 0A chooses multiple-matches-per-JVM instead, this becomes
          blocking immediately.
TRIGGER   0A selects anything other than one-JVM-per-match
          OR before first use by anyone other than the owner
EVIDENCE  RUN — kill one worker, others unaffected, parent detects exit
STATUS    DEFERRED
```

## 0B.4 Memory, CPU and startup benchmarks

```text
SOURCE    0.48, 0.49, 0.50
WHY SAFE  Determines whether workers are spawned per match or pre-warmed.
          PHASE_00 0.50 already says to prefer simplicity unless the
          measured delay is problematic — so spawn-per-match is the
          default until measurement says otherwise.
TRIGGER   Match startup is perceptibly slow to a player,
          OR the host runs out of memory,
          OR pre-warming is proposed
EVIDENCE  BENCHMARK
STATUS    DEFERRED
```

## 0B.5 Minimal Docker runtime image

```text
SOURCE    0.53, 0.54, 0.55, P0-N
WHY SAFE  The runtime RESOURCE INVENTORY is blocking and sits in 0A.5 --
          that is the part that bit the old project. Building the image
          from a known inventory is routine work, and the old project
          already ships a working Dockerfile and runs on Unraid.
TRIGGER   Before the first deployment of the new stack
EVIDENCE  RUN — game completes inside the container; no Maven at runtime;
          Forge resources treated read-only; writable paths identified
STATUS    DEFERRED
```

---

# PART II — RULES COVERAGE

## 0B.6 Control-of-another-player runtime (Mindslaver)

```text
SOURCE    0.29, 0.70
WHY SAFE  Split deliberately. 0A.8 requires the PROTOCOL to carry
          "acted for" separately from "authorized to answer", because
          SOURCE evidence already establishes the need: Forge's
          Player.getController() returns the CONTROLLING player's
          PlayerController. Designing the field now is cheap;
          retrofitting is not. Only the runtime exercise is deferred.
TRIGGER   A deck containing a control-player effect is importable,
          OR before the protocol is declared stable for 1.0
EVIDENCE  RUN — whose controller is called, who is authorized, what
          hidden information becomes visible, and the wrong human is
          still rejected
STATUS    DEFERRED
NOTE      The old bridge could not express this: each controller held one
          fixed `player` and built forViewer(game, player, opponent, ...),
          so Alice acting for Bob would see Bob's board as "opponent".
```

## 0B.7 Commander full runtime

```text
SOURCE    0.38, 0.39, P0-J
WHY SAFE  0A.9 requires the blocking part -- that a Commander game can be
          CONSTRUCTED and STARTED, and the commander cast from the command
          zone -- because that touches deck mapping and player setup. The
          rest is rules coverage that does not change architecture.
TRIGGER   Before Commander appears as a selectable lobby preset
EVIDENCE  SOURCE + RUN: commander tax across recasts, commander damage,
          zone-change replacement choice, colour identity, multiple
          commanders, starting life, mulligan
STATUS    DEFERRED
NOTE      The old project never configured or ran Commander at all. There
          is no prior evidence here to lean on.
```

## 0B.8 Hidden information: reveal, look-without-reveal, re-hiding

```text
SOURCE    0.24 H5, H6, H7
WHY SAFE  H1-H4 are blocking and sit in 0A.7; they settle the
          serialization ARCHITECTURE. H5-H7 extend coverage within that
          architecture rather than changing it.
TRIGGER   A card with a look-without-reveal or reveal effect enters any
          supported deck
          OR before the first release to anyone other than the owner
EVIDENCE  RUN, both viewers, asymmetry asserted in both directions
STATUS    DEFERRED
NOTE      H7 asks what Forge exposes after a known card becomes hidden
          again. PHASE_00 is explicit: record Forge's behaviour, do not
          invent memory rules.
```

## 0B.9 Combat branch matrix

```text
SOURCE    0.34, P0-I
WHY SAFE  0A.12 P0A-B requires attack/block/damage to work at all.
          The branch matrix is coverage depth.
TRIGGER   Phase 8, or the first combat bug reported from real play
EVIDENCE  RUN: partial attack, no block, single block, double block,
          first strike, trample, deathtouch, damage assignment order
STATUS    DEFERRED
NOTE      The old project's AGENTS.md records why "attack everything,
          never block" testing is inadequate: three real engine crashes
          reached production behind exactly that test shape.
```

## 0B.10 Decision-shape discovery: ordering, naming, colour, number

```text
SOURCE    0.35, 0.36
WHY SAFE  The old PROTOCOL.md already carries a choice_type taxonomy
          covering these shapes, which 0A reviews as part of the protocol
          boundary. Exercising each shape is coverage.
TRIGGER   Phase 8, or when a decision arrives that no existing
          choice_type can express
EVIDENCE  RUN per shape
STATUS    DEFERRED
NOTE      Phase 7 §7.33 requires a generic usable fallback for unmapped
          decision kinds, which is what makes deferring this safe.
```

## 0B.11 Multiplayer voting

```text
SOURCE    0.37
WHY SAFE  PHASE_00 0.37 itself says failure to run this does not block
          two-player work, provided the reason is documented. This is
          that documentation.
TRIGGER   A multiplayer preset with more than two players is enabled
EVIDENCE  SOURCE + RUN
STATUS    DEFERRED
```

## 0B.12 Attachments and double-faced cards

```text
SOURCE    0.21, 0.61
WHY SAFE  Not architecture; but note Phase 7 §7.21 depends on the
          relationship data existing, so this is earlier than it looks.
TRIGGER   Before Phase 7 renders attachments,
          OR when a deck containing an Aura, Equipment or DFC is imported
EVIDENCE  RUN
STATUS    DEFERRED
NOTE      Both were UNTESTED in the old project, for the honest reason
          that no deck contained one.
```

## 0B.13 Replacement effects and complex payment, in depth

```text
SOURCE    0.31, 0.32, 0.33, P0-G, P0-H
WHY SAFE  0A's adapter proof must handle at least one trigger with a
          target and one payment with an alternative cost, since those
          are where the old adapter needed non-obvious fixes. Breadth
          beyond that is coverage.
TRIGGER   Phase 8, or the first stub reached in real play
EVIDENCE  RUN per family
STATUS    DEFERRED
NOTE      `confirmReplacementEffect` was still an unimplemented stub in
          the old bridge at its final commit.
```

---

# PART III — FORGE LIFECYCLE

## 0B.14 Forge update smoke test

```text
SOURCE    0.60
WHY SAFE  Measures coupling to Forge internals. Useful, but it cannot
          change the 0A adapter decision, because it tests the adapter
          that 0A selects.
TRIGGER   The first time the pinned Forge commit is advanced
EVIDENCE  RUN — what breaks, and how much adapter code had to change
STATUS    DEFERRED
```

## 0B.15 Forge compatibility suite

```text
SOURCE    0.9.10
WHY SAFE  The suite is assembled from tests that 0A, Phase 6 and Phase 8
          produce. It cannot be written before they exist.
TRIGGER   Same as 0B.14 — the first Forge bump
EVIDENCE  The suite runs and gates the update
STATUS    DEFERRED
NOTE      PHASE_00 0.9.10 is explicit: Forge must not be updated merely
          because it compiles.
```

## 0B.16 Forge's own network tests

```text
SOURCE    0.43, 0.44
WHY SAFE  Only relevant if 0A.6 selects Strategy B or C. If 0A selects
          a custom controller, this becomes informational.
TRIGGER   0A recommends reusing Forge's network layer
EVIDENCE  RUN — test command, commit, pass/fail, failures, runtime
STATUS    DEFERRED
```

---

# PART IV — PROTOCOL AND STATE

## 0B.17 Snapshot size and delta-vs-full

```text
SOURCE    0.65, 0.66
WHY SAFE  PHASE_00 0.65 already says to optimize for correctness and
          simplicity at 2-3 games. Full per-viewer snapshots were RUN
          evidence in the old project at Commander deck scale.
TRIGGER   A snapshot is observed to be slow or large enough to matter
EVIDENCE  BENCHMARK — real byte sizes at opening, midgame, large board
STATUS    DEFERRED
NOTE      The old project tried snapshot deduplication, measured it
          saving one snapshot per game out of 27, and reverted it. The
          earlier claim of a performance win was withdrawn. Do not
          re-litigate this without measurement.
```

## 0B.18 Exact printing fallback

```text
SOURCE    0.21, 0.57
WHY SAFE  0A must confirm the lookup API exists -- it did at the old pin
          (CardDb.CardRequest carries collectorNumber). Fallback
          behaviour for printings Forge does not know is a Phase 2
          import concern.
TRIGGER   Phase 2 deck import, or the first import that fails to resolve
          an exact printing
EVIDENCE  RUN
STATUS    DEFERRED
NOTE      The old bridge parsed `[SET:NUMBER]` in a NON-CAPTURING group
          and resolved every card by name alone. Forge supported the
          lookup; the bridge never asked for it. This is a known gap,
          not an open question.
```

## 0B.19 Multiple matches in one JVM

```text
SOURCE    0.51
WHY SAFE  Comparison only. PHASE_00 0.51 says process-per-match remains
          safer under uncertainty, and 0A.10 makes the decision.
TRIGGER   Process-per-match is shown to be too expensive (see 0B.4)
EVIDENCE  SOURCE audit of static mutable state, then RUN
STATUS    DEFERRED
```

---

## 0B.20 Semantic event audit

```text
SOURCE    0.26, 0.27
WHY SAFE  Because of the architecture itself: Phase 6 §6.49 and Phase 7
          §7.34 make the snapshot authoritative and events mere
          presentation hints. A missing event costs an animation, never
          correctness, and reconnect rebuilds from snapshot alone. So the
          BREADTH of event coverage cannot force a rewrite.
TRIGGER   Before Phase 7 animates a given event class,
          OR if any event is ever proposed as a source of truth
EVIDENCE  SOURCE for availability, RUN for each event actually consumed
STATUS    DEFERRED
NOTE      Old pin: 58 distinct IGameEventVisitor.visit overloads on a
          Guava EventBus; the old bridge translated 9 of them
          (zone change, damage, life, counters, tap, attach, step,
          attackers declared, blockers declared). That set is a starting
          point for Phase 7, not a limit.
WARNING   §0.27 is a RULE, not a deferred item. Events must never become
          authoritative, whatever this audit finds.
```

---

## 0B.21 Trigger Register

The live summary. Keep this table current; it is what a phase gate reads.

| Item | Trigger | Status |
| --- | --- | --- |
| 0B.2 Three workers | >2 concurrent matches, or beyond owner's group | DEFERRED |
| 0B.3 Crash isolation | 0A picks non-process-per-match, or non-owner use | DEFERRED |
| 0B.4 Benchmarks | Slow startup, memory pressure, or pre-warming proposed | DEFERRED |
| 0B.5 Docker image | Before first deployment | DEFERRED |
| 0B.6 Mindslaver runtime | Control-player deck importable, or protocol 1.0 | DEFERRED |
| 0B.7 Commander runtime | Before Commander is a lobby preset | DEFERRED |
| 0B.8 Reveal / look / re-hide | Such a card enters a deck, or non-owner release | DEFERRED |
| 0B.9 Combat matrix | Phase 8, or first combat bug | DEFERRED |
| 0B.10 Decision shapes | Phase 8, or an inexpressible decision | DEFERRED |
| 0B.11 Voting | A >2-player preset is enabled | DEFERRED |
| 0B.12 Attachments / DFC | Before Phase 7 renders them, or such a deck imports | DEFERRED |
| 0B.13 Replacement / payment depth | Phase 8, or first stub hit in real play | DEFERRED |
| 0B.14 Forge update smoke | First Forge bump | DEFERRED |
| 0B.15 Compatibility suite | First Forge bump | DEFERRED |
| 0B.16 Forge network tests | 0A recommends Strategy B or C | DEFERRED |
| 0B.17 Snapshot sizing | Observed slow or large | DEFERRED |
| 0B.18 Printing fallback | Phase 2 import | DEFERRED |
| 0B.19 Multi-match JVM | Process-per-match too expensive | DEFERRED |
| 0B.20 Semantic events | Before Phase 7 animates that event class | DEFERRED |

---

## 0B.22 The Honesty Rule

Phase 0A's exit report must state, for every item above, that it was
deferred and why. A reader of that report must never be able to mistake

```text
"we decided this later"
```

for

```text
"we checked this"
```

Three of these entries exist because the old project discovered the
problem and ran out of road: attachments and DFCs were untested because no
deck contained one, `confirmReplacementEffect` was still a stub at the
final commit, and exact printing was being parsed and silently thrown
away. Those are documented gaps, not unknowns, and they must not be
rediscovered as surprises.

---

# Phase 0B Final Principle

A deferred question with a trigger is engineering.

A deferred question without one is a bug with a long fuse.
