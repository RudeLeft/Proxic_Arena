# Phase 0 — Accepted Architectural Decisions

**Accepted by the project owner: 2026-10-15.**
**Required by:** `PHASE_01` §1.3
**Evidence:** `docs/history/phases/phase-00/research/` — this document carries
decisions, not the narrative.

> These are the architectural facts established by Phase 0A. Later
> phases build on them. Changing one is an amendment requiring owner
> approval (AGENTS PHASE-002), not an implementation choice.

---

## Forge commit

```text
forge-2.0.15
4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676   (2026-09-28)
Java 17  ·  Maven 3.9.16
```

Chosen over `master` after a full review of the 197-commit delta
(976 files, diffed locally). Nothing we depend on changes; `master`
would add three abstract `PlayerController` methods and a new mechanic
for no identified benefit. See `forge-pin-delta-review.md`.

## Forge packaging model

Build from a **complete, unmodified upstream checkout**, selecting
modules (`-pl forge-core,forge-game -am`). Zero local edits, no
patched POM. **Since 2026-10-21 also `forge-ai`** (owner decision,
PHASE_07 §7.61 B8), for one check alone: Forge's "can this be paid
now?" (`ComputerUtilMana.canPayManaCost` in test mode), so the board
can dim what cannot be afforded. No computer player is created or
used, and Strategy A's line -- no `forge-gui`, which is Swing -- is
unchanged: `forge-ai` has no GUI coupling. It brings one library,
Apache Commons Math 3.6.1. Ship only produced artifacts at runtime; no Forge source
and no Maven in the runtime image.

## Forge source preservation model

Upstream Forge is **never modified**. All Proxic code lives outside
the Forge tree. A patch requires owner approval, lives in
`forge_patches/`, and carries a regression test (AGENTS VEND-001/002).
Phase 0A required **no patches and no reflection**.

**Amended 2026-10-20 (owner decision):** one patch is approved --
`forge_patches/0001-leyline-last-known-state.patch`, a single
`game.copyLastState()` after opening-hand actions, so Leyline of the
Void works before anyone has acted. The vendored checkout stays
unmodified; the Docker build applies the patch to a fresh clone of the
pin. See `forge_patches/README.md`.

## Forge adapter strategy

**Strategy A — a Proxic-owned `PlayerController`**, on `forge-core` +
`forge-game` only. Scored 53, against 24 for reusing Forge's network
layer and 30 for a hybrid.

Forge's own network layer is remote invocation of **GUI** methods over
Java serialization, lives entirely in `forge-gui`, and is HIGH-coupled
to Swing/EDT/`GuiBase`/`FModel`. A browser cannot speak it.

## Forge worker protocol

Proxic-owned, JSON over WebSocket to the browser; the worker protocol
is Phase 6's to specify. Binding constraints from Phase 0A:

- **Object ids MUST be typed** (`card:51`, `stack:3`, `ability:266`).
  Card ids `[1..130]` and stack-instance ids `[1..18]` share a number
  space; a bare integer is ambiguous.
- `state_version` must be **server-authoritative and monotonic**.
- A response must be rejected **before** it reaches the synchronous
  waiter — ownership, decision id, duplicate ledger, state version.
- **Keep both duplicate defences** (ledger *and* single-slot
  clear-on-ask). Removing either alone appears safe; removing both
  leaked 203 answers in one game.
- The protocol must distinguish **"the player being acted for"** from
  **"the connection authorised to answer"**.
- The browser must never depend on English prompt text.

## Forge process model

**One JVM per match**, spawned on demand, no pre-warming.

```text
~611 MB per worker, flat
3,055 MB for 5 concurrent (the stated ceiling)
2.8 s startup alone, 5.7-5.9 s with five starting at once
crash isolation verified: one killed mid-run, others unaffected
```

Revisit shared-JVM only above ~8 concurrent matches or below ~4 GB
free (Phase 0B §0B.19).

## Forge bootstrap requirements

In order, from a clean JVM:

```text
Localizer.initialize("en-US", <res>/languages)
Lang.createInstance("en-US")
ImageKeys.initializeDirs(...)              // CardDb.hasImage() NPEs otherwise
CardType.Helper.parseTypes(<res>/lists/TypeLists.txt)
CardStorageReader(<res>/cardsfolder)
CardStorageReader(<res>/tokenscripts)      // getAllTokens() NPEs otherwise
new StaticData(cards, tokens, null, null, editions, editions,
               blockdata, setlookup, "Latest", false, false, false, false)
```

~2.8 s to load 96,916 cards from 33,980 scripts.

## Forge resource requirements

Required, each proven by the observed failure when absent:

```text
cardsfolder/   languages/   editions/   tokenscripts/   lists/
```

Not required for Open Format: `blockdata/`, `setlookup/`.

`lists/` passes a naive absence test because `editions/` also feeds the
type vocabulary — but it is the **only** source of `BasicTypes`,
`SpellTypes`, `DungeonTypes` and `BattleTypes`. **Ship it.**

**Forge creates missing resource directories**, i.e. it writes to the
resource tree. A read-only mount is unresolved (Phase 0B §0B.5).

## State serialization strategy

**Build Proxic DTOs using Forge's visibility APIs.** Do not serialize
Forge's `GameView`/`CardView` directly — that couples the browser to
Forge class shapes (`§0.45`) and risks sending data intended to be
filtered later (AGENTS HID-001).

Full per-viewer snapshots, not deltas. A prior dedup attempt measured
one saved snapshot in 27 and was reverted.

## Hidden-information strategy

Ask Forge **both** questions, per card, per viewer:

```text
canBeShownTo          zone-level    -- TRUE for everything on the battlefield
canFaceDownBeShownTo  identity      -- governs a face-down permanent
```

Asking only the first leaks face-down identities. Asking only the
second blanks the card for its own controller, who may look
(CR 713.4a). **Both halves are requirements.**

`Card.getName()` returns the **current** state's name, which for a
face-down card is the **empty string**, not null. Fall back to the
original state, and require a *meaningful* name — "not null" is not
"identifies the card".

## Semantic-event strategy

Translate Forge's `GameEvent` bus for **presentation only**. The
snapshot is authoritative; a dropped event costs an animation, never
correctness, and reconnect rebuilds from snapshot alone. 58 event
types exist; 9 were translated previously as a starting point.

## Object identity strategy

`Card.getId()` is **stable for the lifetime of a match**, including
across zone changes — distinct ids equal cards plus tokens, nothing
recycled. Expose it as the public object id, **typed by kind**.

CR 400.7's "new object on zone change" is **not** reflected in the id;
represent that separately if a rule ever needs it.

## Decision ownership strategy

Forge routes a controlled player's decisions to the **controlling**
player's `PlayerController` (`Player.getController`). The protocol must
therefore carry both identities. Runtime verification is Phase 0B
§0B.6; the protocol requirement is settled now.

## Formats

```text
Open Format is the ONLY supported mode.
  60-65 cards, max 4 copies of a card, basic lands unlimited,
  no sideboard, 2 players, unrestricted card pool.

Commander             REMOVED from scope by owner decision.
Two-Headed Giant      REMOVED, and UNSUPPORTED by Forge at this pin
                      and at master (no TwoHeadedGiant GameType, no
                      shared turns, no shared life).
```

Deck legality is **Proxic's**, not Forge's: `DeckFormat.Constructed`
is min 60 with no maximum. Do **not** use
`DeckFormat.canHaveAnyNumberOf()` as the copy-limit exemption — it also
exempts "any number" cards the owner did not exempt.

## Forge update procedure

```text
advance the pinned commit
build Forge
build the Proxic adapter   (regenerate the generated adapter base --
                            the diff IS the decision-surface change)
run the Forge compatibility suite
run Proxic integration tests
review behaviour changes
accept the new pin
```

Never silently; never because it compiles (AGENTS VEND-005).

## Required Forge compatibility tests

Minimum set, all of which exist as Phase 0A harnesses:

```text
clean build of the pinned commit
bootstrap + resource inventory
headless two-player game to completion
targeted spell, response, stack resolution
hidden information H1-H4 from both seats
object identity across zones, duplicates, tokens
wrong-player / duplicate / stale rejection
reconnect and continue
action offered from a non-hand/battlefield zone
abstract-method count diff on PlayerController
```

---

## Unresolved items affecting Phase 1 (§1.4)

None blocking. For completeness:

| Item | Owner | Blocks |
| --- | --- | --- |
| Forge writes to the resource tree | 0B.5 | Docker image, not Phase 1 |
| §7.51 battlefield decisions (6) | owner | Phase 7 only |
| "Any number" cards exempt? | owner | Phase 2 validation; default no |
| DFC faces in the deck package | Phase 2 | Phase 2/7 |

## Phase 0A acceptance tests — all passed

```text
P0A-A build   P0A-B game    P0A-C stack    P0A-D resources
P0A-E hidden  P0A-F identity P0A-G authority P0A-H reconnect
P0A-K zones   P0A-J adapter recommendation
```
