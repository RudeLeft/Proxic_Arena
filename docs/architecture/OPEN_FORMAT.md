# Open Format — the only supported play mode

**Status:** Owner decision, 2026-10-15
**Supersedes:** Commander and Two-Headed Giant as supported modes
**Applies to:** Phases 1–7, and Phase 0A/0B validation scope

---

## 1. The decision

Proxic Arena supports **one play mode**: Open Format.

```text
deck size        65 cards maximum
copy limit       no more than 4 copies of a specific card
card pool        unrestricted -- any real Magic card is allowed
```

No Commander. No Two-Headed Giant. No other preset.

Everything in the phase documents that assumes a choice of formats, a
preset catalog, a command zone, teams, or shared life is out of scope
and has been stripped.

---

## 2. What this removes

| Removed | Was | Now |
| --- | --- | --- |
| Commander | a supported preset (Phase 5), a Phase 0A blocking test (P0A-I), a Phase 0B deferred item (0B.7) | **out of scope** |
| Two-Headed Giant | capability-gated, already classified `UNSUPPORTED` | **out of scope** (unchanged in effect) |
| Match preset catalog | multiple presets, player counts 2–4 | one mode, 2 players |
| Team assignment | 2HG only | **out of scope** |

Two whole areas of risk disappear with this. Commander was the only
remaining Phase 0A test with **no prior evidence at all** — the old
project never configured it — and it had already surfaced a real gap
(see §5). 2HG was the one capability Forge could not support without
patching upstream.

---

## 3. How this maps onto Forge

Proxic continues to use `GameType.Constructed`, which is already what
every passing Phase 0A test ran against. No Forge-side change is
needed to *play* Open Format.

Deck legality is where Proxic and Forge differ:

```text
[SOURCE] DeckFormat.Constructed = Range.of(60, Integer.MAX_VALUE)
                                  sideboard 0-15, 4 copies max

         Open Format             = max 65, 4 copies max
```

Forge's Constructed has a **minimum of 60 and no maximum**; Open Format
has a **maximum of 65**. These are not the same rule, so Proxic cannot
simply delegate deck validation to `DeckFormat.Constructed`.

**Deck legality is a Proxic concern, enforced at import (Phase 2) and
at match setup (Phase 5).** This does not violate the "Forge owns the
rules" boundary: deck *construction* legality is a format policy, while
Forge remains sole authority for everything that happens once the game
starts. Phase 2 already treats structural validation as Proxic's job.

---

## 4. Two things the owner must still decide

These are genuine ambiguities in the rule as stated, and getting either
wrong breaks real decks. **Flagged rather than guessed.**

### 4.1 Are basic lands exempt from the 4-copy limit?

Magic exempts basic lands from the four-copy rule, and so does Forge:

```text
[SOURCE] DeckFormat.canHaveAnyNumberOf(card)
             -> true for basic lands
```

Taken literally, "no more than 4 copies of a specific card" with no
exemption means a 65-card deck could contain at most 4 Mountains. A
normal deck runs 20–25 lands, so it would need six or more *distinct*
land cards and would be close to unbuildable.

```text
ASSUMED, pending confirmation: basic lands are EXEMPT.
```

This matches both Magic and Forge. If the owner intends the literal
reading, say so and it will be enforced instead — but every existing
test deck in this repository would become illegal.

### 4.2 Is there a minimum deck size?

"65 maximum" states a ceiling and no floor. Without one, a 1-card deck
is legal and decks out immediately.

```text
ASSUMED, pending confirmation: minimum 60, matching Forge's
Constructed floor and ordinary Magic.
```

If the owner wants a lower floor (40, say, or none), Proxic must
enforce it itself rather than inheriting Forge's.

A third, smaller question: **is a sideboard allowed?** Forge's
Constructed permits 0–15. Open Format says nothing, so it is assumed
to be **none** until stated.

---

## 5. What P0A-I found before being cancelled

Recorded because the finding outlives the format that produced it.

Commander validation was in progress when the mode was cancelled. It
had already established:

```text
[RUN] Commander game constructs and starts (GameType.Commander)
[RUN] commanders assigned from DeckSection.Commander
[RUN] starting life 40
[RUN] both commanders begin in the command zone, 373 samples
[RUN] 16-turn game completes
[RUN] the commander is NEVER CAST
```

The last line is the finding, and it is **not Commander-specific**:

> The action enumerator walked only **hand** and **battlefield**. The
> command zone is a third source of playable actions, so the commander
> was never offered. Nothing errored — the game simply never cast it.

That is the same silent-divergence shape as the `CostSacrifice` gap
(P0A-F §5): a legal action that is invisible because the adapter never
looked where it lived. It generalises to **Phase 6 §6.56, zone-dependent
actions**, and survives the removal of Commander:

> **An adapter must enumerate every zone Forge can offer an action
> from, not the zones a designer expects.** Graveyard (flashback,
> escape), exile (foretell, adventure), and library (Panglacial Wurm,
> which is in the Mechanics Lab corpus) are all reachable in Open
> Format, because Open Format allows any card.

Open Format makes this *more* important, not less: with an unrestricted
card pool there is no subset of zones that can be assumed irrelevant.

---

## 6. Consequences for Phase 0A

| Item | Before | After |
| --- | --- | --- |
| P0A-I Commander | blocking acceptance test | **removed** |
| 0A.9 Formats | Commander + 2HG | **removed**; no format capability gate remains |
| 0B.7 Commander runtime | deferred with trigger | **removed** |
| Acceptance tests | 10 | **9** |

Phase 0A's remaining open work is unchanged: §0A.8A (protocol lessons
review), §0A.9A (Scryfall/Forge identity boundary) and §0A.10 (process
model and Forge packaging).

**A new Phase 0A item replaces the Commander test**, because the gap it
found is real and Open Format widens it:

```text
P0A-K  Zone coverage: enumerate playable actions from every zone Forge
       can offer them from, and demonstrate at least one action offered
       from a zone other than hand or battlefield.
```

---

## 7. Consequences for the other phases

- **Phase 1** — no change beyond removing Commander from examples.
- **Phase 2** — deck import must enforce Open Format legality (§3),
  not Forge's Constructed range.
- **Phase 4** — no change.
- **Phase 5** — the preset catalog collapses to a single mode. Player
  count is fixed at 2. Team assignment is removed.
- **Phase 6** — remove Commander from the runtime scope; keep §6.56
  zone-dependent actions and strengthen it per §5 above.
- **Phase 7** — the battlefield no longer needs a command-zone row.
  Note that §7.10's zone-membership question is **unchanged**:
  enchantments and planeswalkers still have nowhere to go, and Open
  Format's unrestricted pool guarantees they will appear.
