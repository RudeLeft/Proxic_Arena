# Proxic Arena Build Plan

# Phase 0A — Blocking Forge Validation

**Status:** DRAFT — supersedes the scope of `PHASE_00` when accepted
**Phase Type:** Research, proof-of-concept, architecture validation
**Production Feature Work:** PROHIBITED
**Next Phase:** Phase 1 — Application Foundation
**Companion:** `PHASE_00B_FORGE_DEFERRED_VALIDATION_DRAFT.md`

---

## 0A.0 Why Phase 0 was split

`PHASE_00` is correct in substance and unfinishable in practice. It
contains roughly eighty sections and sixteen mandatory acceptance tests,
including three-worker benchmarks, a Mindslaver runtime test, multiplayer
voting, a Commander runtime game and a Docker proof — all before the
application exists.

The realistic failure mode is not that Phase 0 produces a wrong answer. It
is that Phase 0 never completes, or completes by rubber stamp. Either way
the evidence discipline it exists to enforce is lost.

So Phase 0 is split by a single test:

```text
Does getting this wrong force an ARCHITECTURE REWRITE?

   YES -> Phase 0A, blocking, must be answered before Phase 1
   NO  -> Phase 0B, deferred, with a named trigger that un-defers it
```

Nothing is deleted. Everything deferred appears in Phase 0B with the
condition that brings it back. Deferred is not forgotten.

---

## 0A.1 Inherited Rules

All of `PHASE_00` remains in force except its scope and its acceptance
list. Specifically, these are inherited verbatim and not restated here:

```text
0.3   WHAT WE KNOW / WHAT WE THINK / WHAT WE HAVE ACTUALLY RUN
0.4   Evidence classification: UPSTREAM-DOC SOURCE RUN BENCHMARK
      INFERENCE USER
0.5   No false verification
0.8A  READ OLD / BUILD NEW, and the read-only old project
0.9   Forge preservation: upstream stays untouched, adapter lives outside
0.80  Escalation rule
0.81  Unexpected findings procedure
0.82  Prohibited shortcuts
0.85  Locking and amendment procedure
```

Where this document and `PHASE_00` conflict on **scope**, this document
wins. Where they conflict on **rigour**, `PHASE_00` wins.

---

## 0A.2 Prior Evidence Is a Starting Point, Not an Answer

`PHASE_00 §0.7` is right that old implementation choices must not be
retained unexamined. But re-validating a documented `RUN` result is far
cheaper than rediscovering it from nothing, and the old project left an
unusually good record.

The rule for Phase 0A:

```text
Old evidence sets the EXPECTATION.
Current Forge sets the ANSWER.

A prior RUN result may be re-confirmed by a targeted test.
It may never be copied forward as though it were current evidence.
```

Each prior result below is labelled with the old pinned commit. If the new
pin differs, every one of them is an expectation to check, not a fact.

### Old project reference

```text
Project:      C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
Forge commit: 83168c1dc406fd8cd4657ae0a2d605be5cc87070  (2026-09-29)
Capability record: vendor/forge/CAPABILITIES.md
Build log:         ROADMAP.md
Contract:          AGENTS.md
Protocol:          PROTOCOL.md
```

### What the old project actually proved

| Area | Old result | Re-validation cost |
| --- | --- | --- |
| Headless bootstrap | `RUN` — games ran end to end | Medium: re-derive, do not copy |
| Required resources | `RUN` — `cardsfolder, languages, lists, editions, formats, tokenscripts, setlookup, blockdata` | Low: start from this list, prove each |
| `Localizer` crash trap | `RUN` — NPE during plain card loading without `languages/` | Low: confirm still present |
| Basic lands / type lists | `RUN` — bootstrap bug found and fixed | Low |
| Custom `PlayerController` adapter | `RUN` — 42 of 109 methods implemented, full games | — informs adapter choice |
| Priority, stack, targeting | `RUN` | Low |
| Combat: attack/block/damage | `RUN` | Low |
| Counters | `RUN` — a stub had silently disabled all counters | Low |
| Triggered abilities with targets | `RUN` — needed explicit `setupTargets` | Low |
| Alternative costs, morph, kicker | `RUN` — via `getAllPossibleAbilities` | Low |
| Face-down hidden information | `RUN` — `test_face_down.py`, both seats | **High value, re-run** |
| `canBeShownTo` vs `canFaceDownBeShownTo` | `SOURCE` — zone-level vs identity-level | **Confirm at new pin** |
| Duplicate / stale / wrong-player rejection | `RUN` — `test_command_authority.py` | Medium |
| Reconnect to same seat | `RUN` — `test_reconnect.py` | Medium |
| Process-per-match | `RUN` — one JVM per game, in production on Unraid | Low |
| Event bus | `SOURCE` 58 event types; `RUN` 9 translated | Low |
| Exact printing | `SOURCE` — `CardDb.CardRequest` supports it; bridge discarded it | Low |
| Control-another-player | `SOURCE` — `Player.getController` routes to controller | See 0A.8 |
| Attachments, DFCs | **Untested** | Phase 0B |

The old project's test files are executable evidence, not prose. Read them
before designing their replacements.

---

## 0A.3 The Blocking Questions

Phase 0A answers exactly these. Nothing else is in scope.

```text
1. Which exact Forge commit, and does it build clean?
2. What is required to boot Forge headless, and which resources must ship?
3. What is the current PlayerController surface?
4. Which adapter strategy: custom controller, Forge network reuse, hybrid?
5. Can a two-player game be completed through that adapter, headless?
6. How is per-viewer state produced, and how is hidden information
   guaranteed not to leak?
7. What is a stable public object identity for one match?
8. How are decision ownership, duplicates and stale responses enforced?
9. One JVM per match, or something else? And how is Forge packaged?
10. Can an action be offered from a zone other than hand/battlefield?
```

Ten questions. If an experiment does not serve one of them, it belongs in
Phase 0B.

---

## 0A.3A Disposition of Every PHASE_00 Section

The split is only trustworthy if nothing fell through it. `PHASE_00` has
86 numbered sections; every one is dispositioned below.

`RULE` = inherited verbatim per 0A.1. `0A` / `0B` = where the work moved.
`N/A` = narrative or procedural, no work item.

| § | Title | → |
| --- | --- | --- |
| 0.1 | Purpose | N/A |
| 0.2 | Why Phase 0 Exists | N/A |
| 0.3 | Phase 0 Principle | RULE |
| 0.4 | Evidence Classification | RULE |
| 0.5 | No False Verification | RULE |
| 0.6 | Starting Architecture Hypotheses | 0A.6 |
| 0.7 | Existing Code Is Evidence | 0A.2 |
| 0.8 | Working Area | 0A.11 |
| 0.8A | Project Locations / Read-Only | RULE |
| 0.9 | Preserve Forge as Upstream | RULE |
| 0.10 | Select and Pin Forge | **0A.4** |
| 0.11 | Current vs Previous Forge | **0A.4** |
| 0.12 | PlayerController Audit | **0A.6** |
| 0.13 | Decision Surface Matrix | **0A.6** |
| 0.14 | Forge Network Architecture | **0A.6** |
| 0.15 | Forge Network Coupling | **0A.6** |
| 0.16 | Network Strategy Proof | **0A.6** (only if B/C viable) |
| 0.17 | Compare Three Adapter Strategies | **0A.6** |
| 0.18 | Bootstrap Audit | **0A.5** |
| 0.19 | Resource Dependency Audit | **0A.5** |
| 0.20 | Headless Worker Proof | **0A.12 P0A-B** |
| 0.21 | Card Loading Tests | **0A.5** (land, token); 0B.12 (DFC) |
| 0.22 | Game Construction Documentation | **0A.5** |
| 0.23 | State Representation Audit | **0A.7** |
| 0.24 | Hidden Information Tests | **0A.7** (H1–H4); 0B.8 (H5–H7) |
| 0.25 | Hidden Information Decision | **0A.7** |
| 0.26 | Semantic Event Audit | 0B.20 |
| 0.27 | Events Remain Presentation Data | RULE (also Phase 6 §6.49) |
| 0.28 | Decision Ownership Audit | **0A.8** |
| 0.29 | Mindslaver Test | **0A.8** (protocol); 0B.6 (runtime) |
| 0.30 | Priority Test | **0A.12 P0A-C** |
| 0.31 | Payment Context Test | **0A.6** (one alt cost); 0B.13 |
| 0.32 | Trigger Test | **0A.6** (one targeted); 0B.13 |
| 0.33 | Replacement Effect Test | 0B.13 |
| 0.34 | Combat Test | 0B.9 |
| 0.35 | Scry / Surveil / Ordering | 0B.10 |
| 0.36 | Name / Type / Colour Selection | 0B.10 |
| 0.37 | Multiplayer Voting | 0B.11 |
| 0.38 | Commander Capability Audit | **REMOVED** — format cancelled |
| 0.39 | Commander Runtime Test | **REMOVED** — format cancelled |
| 0.40 | 2HG Capability Audit | **REMOVED** — format cancelled |
| 0.41 | 2HG Classification | **REMOVED** — format cancelled |
| 0.42 | 2HG Escalation Gate | **REMOVED** — format cancelled |
| 0.43 | Evaluate Forge Network Play | 0B.16 |
| 0.44 | Forge Network Test Questions | 0B.16 |
| 0.45 | Browser Must Not Speak Forge Protocol | RULE |
| 0.46 | Process Isolation Test | **0A.10** (decision); 0B.2 (3 workers) |
| 0.47 | Crash Isolation Test | 0B.3 |
| 0.48 | Memory Benchmark | 0B.4 |
| 0.49 | CPU Benchmark | 0B.4 |
| 0.50 | Worker Startup Benchmark | 0B.4 |
| 0.51 | Multiple Games in One JVM | 0B.19 |
| 0.52 | Process Model Recommendation | **0A.10** |
| 0.53 | Docker Runtime Proof | 0B.5 |
| 0.54 | Runtime Artifact Inventory | **0A.5** (inventory); 0B.5 (image) |
| 0.55 | Docker Filesystem Rules | 0B.5 |
| 0.56 | Scryfall Identity Boundary | **0A.9A** |
| 0.57 | Exact Printing Fallback | **0A.9A** (API exists); 0B.18 (fallback) |
| 0.58 | Forge Update Boundary | **0A.10** |
| 0.59 | Default Preference on Vendoring | **0A.10** |
| 0.60 | Forge Update Smoke Test | 0B.14 |
| 0.61 | Minimal Architecture Test Deck | **0A.11A** |
| 0.62 | Broad Mechanics Is Not Phase 0 | RULE |
| 0.63 | Protocol Lessons from Existing Project | **0A.8A** |
| 0.64 | Stable Object Identity | **0A.12 P0A-F** |
| 0.65 | Snapshot Strategy | 0B.17 |
| 0.66 | Snapshot Benchmark | 0B.17 |
| 0.67 | Reconnect Architecture | **0A.12 P0A-H** |
| 0.68 | Duplicate Response | **0A.12 P0A-G** |
| 0.69 | Stale Response | **0A.12 P0A-G** |
| 0.70 | Wrong-Player Response | **0A.12 P0A-G** |
| 0.71 | No Magic Rules in Transport | RULE |
| 0.72 | Forge Worker API Candidate | **0A.13** (report heading 14) |
| 0.73 | Do Not Design Browser UX Here | RULE |
| 0.74 | Research Output Directory | **0A.13** |
| 0.75 | Every Research File Needs Evidence | RULE |
| 0.76 | Required Phase 0 Checklist | superseded by 0A.12 + 0B.20 |
| 0.77 | Mandatory Acceptance Tests | superseded by **0A.12** |
| 0.78 | Exit Report | superseded by **0A.13** |
| 0.79 | Final Recommendation Must Be Decisive | RULE |
| 0.80 | Escalation Rule | RULE |
| 0.81 | Unexpected Findings | RULE |
| 0.82 | Prohibited Shortcuts | RULE |
| 0.83 | What Phase 0 Does Not Build | RULE |
| 0.84 | Success Condition | N/A |
| 0.85 | Locking Procedure | RULE |

All sixteen of `§0.77`'s acceptance tests (P0-A … P0-P) are covered:
P0-A→P0A-A, P0-B→P0A-B, P0-C→P0A-C, P0-D→P0A-E, P0-E/F→P0A-G,
P0-G/H→0A.6 + 0B.13, P0-I→0B.9, P0-J→P0A-I + 0B.7, P0-K→0A.9,
P0-L→0B.2, P0-M→0B.3, P0-N→0B.5, P0-O→P0A-J, P0-P→0A.10 + 0B.14/15.

---

## 0A.4 Forge Pin and Build

Record, do not estimate:

```text
Forge repository
Phase 0A commit hash
Release/tag if applicable
Date
Java version actually used
Maven/Gradle version actually used
Clean build result
```

Then run `PHASE_00 §0.11`'s comparison against the old pin
`83168c1d`, limited to areas that could change the architecture:
`PlayerController`, game construction, the view/visibility model, the
event system, card loading, `StaticData`.

A full Forge changelog is out of scope.

---

## 0A.5 Bootstrap and Resource Inventory

Derive from a clean process what is required to reach a running game.

Start from the old project's proven resource set as a **hypothesis**:

```text
cardsfolder   languages   lists   editions
formats       tokenscripts   setlookup   blockdata
```

For each, prove it is required by observing the failure when it is absent.
`languages/` is the cautionary case: the old project found `Localizer`
hard-crashes with an NPE during ordinary card loading, which no amount of
reading the module graph would have predicted.

**Deliverable:** the exact list of runtime resources, each with the
observed failure that justifies it. This feeds both the vendoring decision
(0A.10) and the Docker image, and it is where selective vendoring
historically went wrong.

---

## 0A.6 Adapter Strategy — the central decision

This is the one question most likely to force a rewrite if answered badly.

Audit the current `PlayerController` (count the real abstract methods with
a script, do not guess), inspect Forge's current network/remote-player
architecture, and classify its GUI coupling as `LOW` / `MEDIUM` / `HIGH`
with reasons.

Then score the three strategies from `PHASE_00 §0.17` and **recommend
one**, decisively, per `§0.79`.

Relevant prior evidence: the old project implemented 42 of 109 controller
methods through Strategy A and completed real games with 100-card
decks. That is a known-viable floor. It also found that a stub can be
swallowed by Forge's own `try/catch` — `CountersPutEffect.resolve` did
exactly that, silently disabling every counter in the game while printing
one line to stderr. **Any adapter strategy must make an unimplemented
decision loud, not silent.** That is an evaluation criterion, not a
footnote.

---

## 0A.7 Hidden Information

Release-blocking. Two independently serialized viewer perspectives, and a
test that fails if both sides return the same data.

Required in 0A:

```text
H1  opponent hand hidden
H2  opponent library hidden
H3  own hand visible
H4  face-down permanent: hidden to opponent, identified to controller
```

`H5` (look without reveal), `H6` (reveal) and `H7` (return to hidden zone)
move to Phase 0B — they are real requirements but they do not change the
serialization architecture, only its coverage.

**Carry this forward explicitly.** At the old pin, `CardView.canBeShownTo`
is zone-level and returns true unconditionally for the battlefield;
`canFaceDownBeShownTo` is what governs identity. Asking only the first
leaked every face-down creature's real name and power/toughness. The guard
had been written, reviewed and believed correct.

Both halves of H4 are requirements. Blanking the card for everyone also
fails, because a player may look at their own face-down permanents
(CR 713.4a) — that was the first attempted fix, and it meant a player
could not tell their own two morphs apart.

Re-verify which method means what at the **new** pin. Do not assume the
names kept their meanings.

---

## 0A.8 Decision Ownership and Protocol Safety

Required in 0A:

```text
wrong-player response rejected
duplicate response cannot answer a later question
stale response for a superseded decision rejected
reconnect restores the seat and play continues
```

The old project has executable precedent for all four
(`test_command_authority.py`, `test_reconnect.py`). Note the trap recorded
there: the first reconnect test asserted only that a snapshot arrived,
which proves nothing, because the relay replays the last snapshot on
resume whether or not the match is alive. Assert that the game
**continues**.

### Control-of-another-player — split deliberately

`PHASE_00 §0.29` requires a Mindslaver runtime test before the
decision-routing protocol is designed. That is a fair concern, and it is
also the single most expensive test in Phase 0 for a mechanic no deck in
the Mechanics Lab corpus currently contains.

The split:

```text
0A  The PROTOCOL must be able to express, separately:
        the player whose game object is being acted for
        the player/connection authorized to answer

0B  The Mindslaver RUNTIME test that exercises it
```

This is safe because the requirement is already established by `SOURCE`
evidence, not conjecture: at the old pin `Player.getController()` returns
the *controlling* player's `PlayerController`, so Forge already routes a
controlled player's decisions to someone else's controller. The old bridge
could not express it — each controller held one fixed `player` and built
its snapshot as `forViewer(game, player, opponent, …)`, so Alice acting
for Bob would have seen Bob's board labelled "opponent".

Designing the protocol field now costs almost nothing. Retrofitting it
later is expensive. Running the test later is cheap.

---

## 0A.8A Protocol Lessons Review

`PHASE_00 §0.63` requires a `KEEP` / `CHANGE` / `REMOVE` / `DEFER` verdict
on each concept the old protocol established. This is blocking and cheap:
it is a review of a document that already exists
(`Proxic_Arena_OLD/PROTOCOL.md`), and its output shapes the Phase 1
protocol boundary.

Produce a verdict with reasoning for at least:

```text
decision_request / decision_response
choice_type
candidate kind (CARD / PLAYER / ABSTRACT)
card_id on a multi-action candidate
source_id
stable object ID
state_version / expected_state_version
resume token
semantic event stream
full authoritative snapshot
```

Two of these were bought with real bugs and should not be re-derived from
scratch:

- **`kind` on a candidate** exists because the client once classified
  options by intersecting their ids with ids it had been shown. One call
  site prefixed its ids, so the intersection was always empty for
  targeting and every legal target rendered as a flat text button —
  reported from real play as "it seems to be confusing my cards with your
  cards."
- **`card_id` alongside an action id** exists because options keyed by
  card id silently dropped a card's second ability. Phase 6 §6.55 now
  encodes this as `object_id` vs `action_id`.

---

## 0A.9A Scryfall / Forge Identity Boundary

Confirm the permanent boundary (`§0.56`):

```text
Scryfall = card and printing identity, and artwork
Forge    = gameplay rules
```

Blocking in 0A: prove that `name + set + collector number` can be mapped
to a Forge card at the new pin, and record the exact current API. At the
old pin this was `CardDb.CardRequest`, which carries a `collectorNumber`.

Not blocking: fallback behaviour when Forge does not know an exact
printing — that is Phase 2 import work, deferred as 0B.18.

**Known gap, not an open question:** the old bridge matched the
`[SET:NUMBER]` tag in a *non-capturing* group and resolved every card by
name alone. Forge supported the lookup; the bridge never asked for it. Do
not rediscover this.

Never parse Oracle text into gameplay behaviour (`§0.82`).

---

## 0A.9 Formats — removed from scope

**Owner decision, 2026-10-15: Proxic Arena supports one play mode,
Open Format.** See `docs/architecture/OPEN_FORMAT.md`.

```text
deck size     65 cards maximum
copy limit    no more than 4 copies of a specific card
card pool     unrestricted
```

Commander and Two-Headed Giant are both out of scope. There is no
format capability gate left to evaluate: Open Format runs on
`GameType.Constructed`, which every passing Phase 0A test already used.

Deck legality (65 max) differs from Forge's `DeckFormat.Constructed`
(60 min, no max) and is therefore enforced by Proxic at import and
match setup, not delegated to Forge. That is a format policy, not a
game rule, so it does not cross the Forge boundary.

The Commander work that had been done before cancellation produced one
finding that outlives it, and it is now `P0A-K` in §0A.12: the action
enumerator must walk **every zone Forge can offer an action from**, not
just hand and battlefield. Open Format's unrestricted card pool makes
that broader, not narrower. Details in `OPEN_FORMAT.md` §5.

---

## 0A.10 Process Model and Forge Packaging

Required in 0A, because both shape the repository and the deployment:

```text
one JVM per match, or multiple matches per JVM
full pinned checkout vs selective vendoring vs built artifacts
what must exist in the runtime image
```

Prior evidence: the old project ran one JVM per match in production on
Unraid. That is `RUN` evidence that the model works, at the old pin, at
two players.

What 0A needs is the **decision and its justification**, including a
source audit for static mutable state (`StaticData`, `FModel`,
localization globals, thread pools) if multi-match-per-JVM is seriously
considered.

What 0A does **not** need is the three-worker benchmark matrix. See 0B.

---

## 0A.11 Working Area

```text
spikes/forge-phase0a/
```

Phase 0A code may be discarded. Do not begin `frontend/`, `server/` or the
permanent `forge-worker/`.

---

## 0A.11A Minimal Architecture Test Deck

Per `§0.61`, Phase 0A uses a **small deterministic card set**, not the
275-card Mechanics Lab corpus. The corpus is for Phase 6 Layer A and
Phase 8; using it here turns architecture validation into card testing,
which `§0.62` explicitly forbids.

Phase 0A needs representatives that exercise plumbing:

```text
basic land                   mana, land play, type lists
vanilla creature             combat, summoning sickness
targeted instant             targeting, stack, priority
ETB trigger with a target    trigger decision path
alternative cost             payment that is not the printed cost
face-down object             hidden information H4
graveyard/exile action       zone coverage, P0A-K
```

Use stacked decks so rare paths are reached deterministically. The old
project reached the legend rule with 24× Krenko, ETB triggers with 20×
Acidic Slime, and morph with 24× Ainok Tracker — a singleton corpus would
not have reached any of them reliably.

Attachments, DFCs, replacement effects and combat branches are **not**
Phase 0A deck requirements. They are 0B.12, 0B.13 and 0B.9.

---

## 0A.12 Acceptance Tests

Phase 0A is complete when these have evidence. Nine tests, down from
sixteen — Commander's P0A-I was removed with the format (§0A.9) and
replaced by P0A-K, which generalises the gap it found.

| ID | Test | Evidence |
| --- | --- | --- |
| P0A-A | The pinned Forge commit builds clean in a clean environment | `RUN` |
| P0A-B | Headless two-player game: mulligan, land, mana, spell, attack, block, damage, completion | `RUN` |
| P0A-C | Targeted spell cast, opponent responds, stack resolves in order | `RUN` |
| P0A-D | Runtime resource list proven by observed failure-on-absence | `RUN` |
| P0A-E | Hidden information H1–H4, two viewers, asymmetry asserted both ways | `RUN` |
| P0A-F | Stable object identity holds across snapshots, duplicates and zone changes | `RUN` |
| P0A-G | Wrong-player, duplicate and stale responses all rejected | `RUN` |
| P0A-H | Reconnect restores the seat and the game continues | `RUN` |
| P0A-K | An action is offered from a zone other than hand or battlefield | `RUN` |
| P0A-J | Adapter strategy recommended decisively, alternatives rejected with reasons | Combined |

Both 2HG and Commander are closed by owner decision rather than by
evidence, and are recorded in §0A.9 and `OPEN_FORMAT.md` rather than as
acceptance tests.

---

## 0A.13 Exit Report

```text
docs/research/phase-00a/FINAL_RECOMMENDATION.md
```

Required headings, reduced from `PHASE_00 §0.78`'s twenty-three:

```text
1.  Executive summary
2.  Forge version tested, and how it differs from the old pin
3.  Bootstrap and runtime resource inventory
4.  PlayerController surface
5.  Recommended adapter, and why the alternatives were rejected
6.  State serialization and hidden-information strategy
7.  Object identity strategy
8.  Decision ownership and protocol safety
9.  Process model and Forge packaging
10. Open Format: deck-legality enforcement point
11. Zone coverage (P0A-K)
12. Prior-evidence re-validation: confirmed / changed / not re-tested
13. Known risks and known unknowns
14. Required Phase 1 architecture
15. Questions requiring an owner decision
16. Phase 0B trigger register
```

Heading 12 is specific to the split: say plainly which old results were
re-confirmed, which changed under the new Forge, and which were accepted
on prior evidence without re-running. The third category is legitimate and
must be visible.

---

## 0A.14 Prohibited Shortcuts

All of `PHASE_00 §0.82`, plus two produced by the split itself:

```text
Treating an old RUN result as current evidence without saying so.

Moving an item to Phase 0B without recording a trigger that
brings it back.
```

---

# Phase 0A Final Principle

Phase 0 asked every question worth asking.

Phase 0A asks only the ones whose wrong answer would make us rebuild, so
that the asking actually finishes — and keeps the rest in Phase 0B where
a named condition will bring each one back.
