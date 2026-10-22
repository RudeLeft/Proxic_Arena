# Phase 0A — Final Recommendation

**Status:** Complete. Awaiting project-owner acceptance.
**Forge pin:** `forge-2.0.15` — `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`
**Date:** 2026-10-15
**Required by:** `PHASE_00A` §0A.13

---

## 1. Executive summary

Phase 0A set out to answer the questions whose wrong answer would
force an architecture rewrite. All nine acceptance tests pass.

```text
P0A-A  Forge builds clean from unmodified upstream          PASS
P0A-B  Headless two-player game, full turn cycle            PASS  10/10
P0A-C  Targeted spell, opponent responds, stack resolves    PASS  draw-dependent
P0A-D  Runtime resources proven by failure-on-absence       PASS
P0A-E  Hidden information H1-H4, both directions            PASS  + 2 negative controls
P0A-F  Stable object identity                               PASS  + typed-id requirement
P0A-G  Wrong-player / duplicate / stale rejected            PASS  + leak reproduced
P0A-H  Reconnect restores seat, game continues              PASS
P0A-K  Action offered from a non-hand/battlefield zone      PASS  4/4
P0A-J  Adapter strategy recommended decisively              DONE
```

**The architecture is viable and the recommended shape is unchanged
from the hypothesis**, but four findings materially constrain how
Phase 6 must be built, and none of them were predictable from reading
Forge's source.

---

## 2. Forge version tested

```text
repository   github.com/Card-Forge/forge
pinned       forge-2.0.15  4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676  (2026-09-28)
java         Temurin 17.0.20.1          maven 3.9.16
```

The latest *release* is **older** than the commit the old project ran
(`83168c1d`, 2026-09-29, 11 commits ahead). `master` is a further 197
commits on from the tag.

**`PlayerController` is byte-identical between the old pin and
2.0.15** — 105 distinct abstract methods, zero added, zero removed —
so the old project's evidence transfers almost completely.

The 197 commits to `master` were reviewed in full (local diff, 976
files; the compare API's 300-file cap hid two thirds). Summary, with
detail in `forge-pin-delta-review.md`:

```text
[RUN] content changes to card scripts hitting our test corpus : 0
      (343 of 506 cardsfolder changes are pure renames)
[RUN] CardDb and ManaPool                                     : unchanged
[RUN] canFaceDownBeShownTo                                    : identical
[RUN] canBeShownTo       : one new zone case (StickerSheets); hand,
                           battlefield and library behaviour unchanged
[RUN] the AI-only priority guard (§4.1)                       : UNCHANGED
                           -- not an upstream bug awaiting a fix
[RUN] PlayerController at master : 113 abstract, vs 110 at the tag
                           -- master ADDS three sticker methods
[RUN] GameType at master : gains CommanderDraft, still no TwoHeadedGiant
```

No identifiable benefit is given up by pinning the release, and
`master` would add a new mechanic's surface for no demonstrated gain.

---

## 3. Recommended architecture

```text
Browser (TypeScript / React / PixiJS)
    │  Proxic protocol, JSON over WebSocket
Arena Server (Kotlin / Ktor)
    │  worker protocol
Forge Worker JVM   -- ONE PER MATCH
    │  Proxic-owned PlayerController adapter
forge-game + forge-core 2.0.15, UNMODIFIED
```

- **Adapter: Strategy A**, a Proxic-owned `PlayerController`. Scored
  53 vs 24 (Forge network reuse) vs 30 (hybrid).
- **Process model: one JVM per match**, spawned on demand.
- **Packaging: full upstream checkout**, build with module selection,
  ship artifacts only.
- **State: Proxic DTOs built using Forge's visibility APIs**, not
  serialized Forge view objects.

---

## 4. The four findings that constrain Phase 6

### 4.1 Forge's priority loop has no safety valve for a human controller

```text
[SOURCE] } while (loopCount < 999 || !controller.isAI());
```

The guard is **AI-only**. Any adapter failure — an unplayable action
offered, a cost that cannot be paid, a `false` return — makes Forge
re-offer the identical action **forever**, at full CPU, with no
exception and no log line.

Observed **four times, four different causes**: a missing
`playChosenSpellAbility`, mana abilities played through the wrong
path, an unpayable `CostSacrifice`, and an unimplemented discard. Once
at 679,963 identical attempts frozen on turn 2.

> **Phase 6 requirement:** the worker needs its own loop guard. A
> repeated identical choice with no state-version change must abort
> the match with a diagnosable error. Forge will never do it.
>
> And: never offer an action that cannot be performed; never fail to
> perform one that was offered.

### 4.2 Object ids are not unique across kinds

```text
[RUN] card ids   [1..130]
      stack ids  [1.. 18]    entirely inside the card range
```

A bare integer cannot identify a game object. **Ids must be typed on
the wire** (`card:51`, `stack:3`, `ability:266`).

Card ids are otherwise excellent: stable for a whole match, surviving
zone changes, one per physical object. Note that CR 400.7's
"new object on zone change" is *not* reflected in the id.

### 4.3 Visibility is two questions, and the obvious one is wrong

```text
canBeShownTo          zone-level   -> TRUE for everything on the battlefield
canFaceDownBeShownTo  identity     -> the one that governs a face-down card
```

Asking only the first leaks every face-down creature's name and
power/toughness. Asking only the second blanks the card for its own
controller, who is entitled to look (CR 713.4a). **Both halves are
requirements**, and both were proven by deliberately breaking them.

Related: `Card.getName()` returns the **current** state's name, which
for a face-down card is the **empty string** — not null. Three
separate bugs in this phase trace to that.

### 4.4 Lookups and overloads fail silently

Three instances of the same shape, all caught only because something
was loud:

```text
exact printing   asked KTK/261 -> got TRK/325 (different set), not null
                 asked ZZZ/999 -> got SLZ/63
discard          overriding the 5-arg convenience overload compiles,
                 satisfies @Override, and never runs
action zones     an enumerator missing the graveyard offers nothing
                 from it, with no error
```

> **Phase 6 requirement:** verify that what Forge returned is what was
> asked for. Do not trust a non-null result.

---

## 5. Measured facts for capacity planning

```text
[BENCHMARK] bootstrap             2.8 s   96,916 cards from 33,980 scripts
            worker RSS            ~611 MB, flat regardless of concurrency
            5 concurrent workers  3,055 MB total, all games completing
            startup at 5 workers  5.7-5.9 s  (I/O contention)
            game wall time        ~750 ms after bootstrap
            crash isolation       one killed mid-run, others unaffected
```

At the owner's stated ceiling of 5 concurrent matches: **budget ~3 GB**.

Required runtime resources, each proven by observing the failure when
absent: `cardsfolder`, `languages`, `editions`, `tokenscripts`,
`lists`. (`blockdata` and `setlookup` are not required for Open
Format.) **Forge creates missing resource directories**, so it writes
to the resource tree — unresolved for a read-only mount (0B.5).

---

## 6. Scope decisions taken during Phase 0A

```text
[USER] Open Format is the only play mode: 60-65 cards, max 4 copies
       of a card, basic lands unlimited, no sideboard, 2 players.
[USER] Commander removed. Two-Headed Giant removed (also UNSUPPORTED
       at this pin: no TwoHeadedGiant GameType, no shared turns or life).
[USER] Card art arrives in a Proxic Deck Builder zip at login.
[USER] Max 5 concurrent matches.
[USER] The Unraid deployment stays live until replaced.
```

Deck legality is **Proxic's**, not Forge's: `DeckFormat.Constructed`
is min 60 with no maximum, and Open Format is 60–65. Neither bound can
be delegated.

---

## 7. Known risks

1. **Silent divergence is this engine's default failure mode.** Four
   infinite loops, three silent-fallback lookups, and several
   never-fired guards. Every one was found by instrumentation, not by
   an error message. Phase 6 should assume anything unmeasured is
   unverified.
2. **Card art volume.** 745×1040 sources are 58× the displayed pixel
   count; ~16–27 MB per deck, up to ~68 MB. Needs import-time
   derivatives and content-hash de-duplication.
3. **Forge writes to its resource tree** — unresolved for Docker.
4. **`confirmReplacementEffect` and 60-odd other controller methods
   remain unimplemented.** By design (STUB-001), but each must be
   loud.

## 8. Known unknowns

- Attachments (Auras, Equipment) and double-faced cards: never
  exercised — 0B.12, and Phase 7 §7.21 depends on them.
- Look-without-reveal / reveal / re-hide (H5–H7): 0B.8.
- Combat branch matrix: 0B.9.
- Control-of-another-player at runtime: 0B.6. The *protocol*
  requirement is settled; the runtime test is not.
- Whether the deck package ships both faces of a DFC.

## 9. Prior-evidence re-validation (§0A.13 heading 12)

```text
RE-CONFIRMED at 2.0.15:
  bootstrap sequence and the Localizer/languages crash
  basic-land type vocabulary
  canBeShownTo vs canFaceDownBeShownTo semantics
  PlayerController surface (identical)
  process-per-match viability

CHANGED since the old pin:
  nothing material found

ACCEPTED ON PRIOR EVIDENCE, NOT RE-RUN:
  the old project's 41 implemented controller methods were read and
  selectively ported (mana payment, trigger targeting), not
  wholesale re-verified
  snapshot dedup being not worth doing (0B.17)
```

## 10. Required Phase 1 architecture

Phase 1 may proceed as written, with the Forge side of §1.6's diagram
replaced by §3 above, and these additions:

- the worker protocol must carry **typed object ids** (§4.2)
- `state_version` server-authoritative and monotonic
- the worker needs a **loop guard** (§4.1)
- deck legality enforced by Proxic (§6)

## 11. Questions requiring an owner decision

1. **Accept `forge-2.0.15` as the pin.** The 197-commit delta to
   `master` was reviewed in full and contains nothing we depend on;
   see §2 and `forge-pin-delta-review.md`. This is now a
   confirm-the-evidence question rather than an open judgement call.
2. **Accept Strategy A and one-JVM-per-match** as the locked
   architecture?
3. §7.51's six battlefield questions remain open and now block Phase 7
   — in particular the face-down model, and where enchantments and
   planeswalkers go, which Open Format guarantees will appear.
4. Should cards keyworded "any number" (Relentless Rats) be exempt
   from the 4-copy limit? Default is no.

---

## 12. Recommendation

**Accept Phase 0A and proceed to Phase 1.**

The evidence supports the intended architecture. The four constraints
in §4 are real but all are satisfiable in the adapter, and each is now
written into `AGENTS.md` so it cannot be quietly lost.

Phase 0B's register carries 16 deferred items, each with a trigger.
Two fired during this phase and were completed rather than waived.
