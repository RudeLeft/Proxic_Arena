# Phase 0A — P0A-F: stable object identity

**Sections:** `PHASE_00A` §0A.12 (P0A-F); `PHASE_00` §0.64
**Forge pin:** `forge-2.0.15` — `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`
**Date:** 2026-10-15
**Probe:** `spikes/forge-phase0a/game-harness/.../IdentityProbe.java`

---

## 1. Result — PASSED, with one protocol requirement it produced

```text
[RUN] 3 consecutive games, ~240 samples each, sampled live mid-game

      no id ever meant two different objects    OK
      duplicate copies remain distinct          OK  (up to 11 sharing a name)
      tokens remain distinct                    OK  (1-4 tokens per game)
      stack object vs source card               distinguishable BUT see §4
      ability id vs card id                     distinguishable BUT see §4
```

---

## 2. `Card.getId()` is stable for the lifetime of a match

The central question was whether Forge's internal numeric id is safe to
expose as a public protocol id. It is.

```text
[RUN] distinct card ids seen per game : 121, 124, 122, 123, 128, 130
      deck size                       : 60 per player = 120 cards
      tokens created                  : 1-4 per game
```

The distinct-id count equals **cards + tokens, and nothing more**. No id
was ever recycled, and no card ever acquired a second id.

```text
[RUN] ids observed in more than one zone : 20-24 per game
```

So an id **survives a zone change**: library → hand → battlefield →
graveyard is one id throughout.

### The CR 400.7 consequence, stated plainly

Magic says an object that changes zones becomes a **new object**
(CR 400.7). Forge does **not** reflect that in the id — the number is
preserved.

That is good news for the protocol (ids are stable and cheap) but it
means **"new object" semantics are not carried by the id**. If a rule
ever depends on new-object-ness — a targeting spell losing its target
because the creature returned as a new object, a "this creature" linkage
breaking — Proxic must represent that separately. It cannot be inferred
from an id change, because there is none.

Recorded as a known limitation, not a defect.

---

## 3. The empty-name trap bit again, in the opposite direction

The first measurement reported **3 id collisions**:

```text
id 1:  was [Alice/Ainok Tracker]  now [Alice/]
id 8:  was [Alice/Ainok Tracker]  now [Alice/]
id 11: was [Alice/Ainok Tracker]  now [Alice/]
```

These were **false failures**. The probe fingerprinted a card by owner +
`Card.getName()`, and `getName()` returns the *current* state's name,
which is the **empty string** while a card is face down. A morph turning
face down therefore looked like "this id used to mean one object and now
means another".

The identical trap produced a near-*false pass* in P0A-E (§4 of that
document). Worth recording that it cuts both ways:

```text
P0A-E:  empty name accepted as "identified"  -> false PASS narrowly avoided
P0A-F:  empty name read as "different card"  -> false FAIL
```

Any code fingerprinting, caching, diffing or logging a card must take
the name from the **original state** when the current state has none.
This is now the third distinct bug traced to `Card.getName()` on a
face-down card, counting the old project's.

After the fix: zero collisions in every run.

---

## 4. Protocol requirement: ids MUST be namespaced by object kind

The sharpest finding, and the reason §0.64 asks for it.

```text
[RUN] measured id ranges, 3 games

      card ids       [1 .. 128]   [1 .. 130]   [1 .. 128]
      stack ids      [1 ..  18]   [1 ..  18]   [1 ..  16]
      ability ids  [250 .. 341] [251 .. 342] [250 .. 340]

      cards vs stack: OVERLAP in every run
```

`SpellAbilityStackInstance.getId()` starts at 1 and counts up
independently of `Card.getId()`. Its range sits **entirely inside** the
card range. In one run the probe caught an outright equality: a stack
instance whose id numerically equalled its own source card's id.

Therefore:

```text
A BARE INTEGER CANNOT IDENTIFY A GAME OBJECT.
```

The protocol must carry the kind alongside the number — `card:51`,
`stack:3`, `ability:266`, or an equivalent typed field.

Ability ids happened to be disjoint (250+) in these runs, but that is an
artifact of how many abilities get created during setup, not a
guarantee. Namespace those too.

### Note on the old project's approach

The old `StateSnapshot` sidestepped this by keying a stack entry on its
**source card's** id rather than the stack instance's:

```java
obj.addProperty("id", source == null ? "stack-" + si.getId()
                                     : String.valueOf(source.getId()));
```

with the stack instance id carried separately as `stack_id`. That is a
defensible alternative — it keeps one id per visible object, which is
what `PROTO-001` wants, and reflects that the client clicks the *card*
on the stack. But it breaks down when one card puts two abilities on the
stack at once, and it is why that code carries the comment about "two
ids for one object" being the shape of the original targeting bug.

Phase 6 should choose deliberately between:

```text
A. typed ids everywhere            card:51 / stack:3 / ability:266
B. source-card id + separate kind  id=51, stack_id=3
```

This document recommends **A**: it is the only option that remains
correct when one source produces several simultaneous stack objects, and
it makes `PROTO-003`'s `object_id` vs `action_id` distinction explicit
rather than conventional.

---

## 5. A fourth infinite loop, and the rule it confirms

Running this test produced another instance of the §4.1 hazard from
P0A-B, with a new cause — worth recording because the pattern is now
unmistakable.

```text
[RUN] 679,963 identical attempts, frozen on turn 2
      chooseSpellAbilityToPlay  679,988
      playChosenSpellAbility    679,966
      chooseTargetsFor          679,963   <- SUCCEEDING every time
      getCostDecisionMaker      679,964
      payManaCost                     2   <- never reached
```

Targeting succeeded; the failure was between `getCostDecisionMaker` and
`payManaCost`. Cause: Mogg Fanatic's **"Sacrifice Mogg Fanatic"** cost.
The cost visitor answers `CostPartMana` and returns `null` for every
other kind — the correct way to say "I cannot pay this" — which fails
the payment, fails the cast, and Forge re-offers it forever.

Note what was *not* visible: no exception, no stub reached, no log line.
Only the ratio between decision counts localised it.

The fix is the rule Forge's missing safety valve forces:

> The adapter must not offer an action whose cost it cannot pay.

`canPayNonManaCosts()` now screens enumeration, and declined kinds are
counted rather than silently dropped:

```text
=== actions declined: cost kind not payable by this adapter ===
       263x  CostSacrifice
```

That counter is the honest version of a gap: it says "263 legal actions
existed that this adapter could not offer", instead of the game quietly
playing differently.

**Four infinite loops across P0A-B and P0A-F, four different causes,
zero error messages.** For a human-shaped controller this is Forge's
default failure mode, not an edge case. A Phase 6 worker needs its own
loop guard — a repeated identical choice with no state-version change
should abort the match with a diagnosable error, because Forge will
never do it.

---

## 6. Status

| Test | State |
| --- | --- |
| P0A-A Forge builds | PASSED |
| P0A-B headless two-player game | PASSED 10/10 |
| P0A-C target + stack | PASSED, draw-dependent |
| P0A-D resource inventory | PASSED |
| P0A-E hidden information | PASSED, both halves |
| **P0A-F object identity** | **PASSED** + typed-id requirement |
| P0A-G/H protocol safety, reconnect | not started |
| P0A-I Commander | not started |
| P0A-J adapter recommendation | pending owner acceptance |
