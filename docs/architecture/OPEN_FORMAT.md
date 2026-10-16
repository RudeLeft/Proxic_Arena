# Open Format — the only supported play mode

**Status:** Owner decision, 2026-10-15
**Supersedes:** Commander and Two-Headed Giant as supported modes
**Applies to:** Phases 1–7, and Phase 0A/0B validation scope

---

## 1. The decision

Proxic Arena supports **one play mode**: Open Format.

```text
deck size        60-65 cards (inclusive)
copy limit       no more than 4 copies of a specific card
                 EXCEPT basic lands, which are unlimited
card pool        unrestricted -- any real Magic card is allowed
sideboard        not allowed
players          2
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

## 4. Rules as confirmed by the owner

Card art and the deck package are covered separately in
`DECK_PACKAGE_AND_ART.md`.

### 4.1 Basic lands are EXEMPT from the 4-copy limit — CONFIRMED

```text
[USER] 2026-10-15: "the 4 card limit for a specific card would not
       include basic land"
```

Matches Magic and Forge. A deck may contain any number of basic lands.

### 4.2 Sideboards are NOT allowed — CONFIRMED

```text
[USER] 2026-10-15: "Sideboards are not allowed"
```

A deck is its 65-card maximum main deck and nothing else. Forge's
`DeckFormat.Constructed` permits a 0–15 sideboard; Open Format does
not, which is another reason deck legality cannot be delegated (§3).

Import (Phase 2) must **reject** a package carrying a sideboard
section rather than silently dropping it — quietly discarding part of
what a player built is the kind of divergence this project keeps
finding.

### 4.3 Do NOT use Forge's `canHaveAnyNumberOf()` as the exemption test

A trap worth naming, because the helper looks exactly right:

```text
[SOURCE] DeckFormat.canHaveAnyNumberOf(card) returns true for
             - basic lands                                   <- wanted
             - any card keyworded
               "A deck can have any number of cards named CARDNAME."
```

That second clause covers Relentless Rats, Shadowborn Apostle,
Persistent Petitioners, Dragon's Approach and similar. The owner
exempted **basic lands only**, so calling Forge's helper would silently
permit 30 Relentless Rats — a rule nobody chose.

```text
Open Format exemption test: card.getRules().getType().isBasicLand()
```

Nothing of that kind appears in the Mechanics Lab corpus today, but
Open Format allows any card, so one will eventually be imported.

**CONFIRMED by the owner, 2026-10-15.** Asked directly whether
"any number" cards should be exempt from the 4-copy limit, the
answer was **no — 4 copies max, no exceptions**. This was previously
an inference from how the format was described; it is now a
decision. The rule stays explainable in one sentence: four of any
card, unlimited basic lands.

A deck containing five Relentless Rats is therefore INVALID in Open
Format, and the import must say so plainly rather than silently
trimming it.

**Open question (small):** should those cards be exempt after all?
Default, pending a decision, is **no** — the literal reading of the
rule as given.

### 4.4 Deck size is 60–65 inclusive — CONFIRMED

```text
[USER] 2026-10-15: "No less than 60, no more than 65"
```

A narrow band, and **neither end matches Forge**:
`DeckFormat.Constructed` is min 60 with no maximum. The floor happens
to agree; the ceiling is Proxic's alone. Both ends are enforced by
Proxic at import and match setup (§3).

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
