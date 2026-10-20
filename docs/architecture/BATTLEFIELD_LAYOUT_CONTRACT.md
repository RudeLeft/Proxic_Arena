# Battlefield Layout Contract

**Status:** ACCEPTED — its open questions were answered by the owner 2026-10-15
(Phase 7 §7.51); resolved values below. Placement within a zone is
centre-out (`BATTLEFIELD_RENDERING.md` §4, owner decision 2026-10-19).
**Supersedes:** `designer-blueprint.json` as a source of coordinates
**Preserves:** every proportion the owner tuned in that file
**Date:** 2026-10-14

---

## 1. Why this document exists

The PixiJS spike stores the battlefield as `designer-blueprint.json`: 3,640
lines holding three hand-authored resolutions, twelve zone rectangles each,
and ninety card instances at absolute pixel positions.

That file cannot describe a real game, for one reason that measurement
makes unarguable:

```text
zone                        width   capacity   cards in fixture
BOB — CREATURES / FRONT     1425.0     14            14
BOB — LANDS — REAR           816.0      8             8
BOB — ARTIFACTS — REAR       813.8      8             8
BOB — ARTIFACTS — FRONT      408.8      4             4
BOB — LANDS — FRONT          309.0      3             3
```

**Every zone is filled to exactly its capacity.** There is no headroom
anywhere. A ninth land has nowhere to go. A Commander game with 23 lands
needs 2,332px of a zone that is 816px wide — 2.9× overflow.

The fixture is a photograph of a board that happens to fit. The moment the
engine supplies a real board, the stored coordinates stop being able to
express it.

This document replaces the stored coordinates with the rules that generate
them, so that the same design works at any card count and any viewport.

---

## 2. The owner's tuning is fully preserved

This is not a redesign. The three locked layouts were measured and found to
be **numerically identical once normalized** — every zone, every resolution,
agreeing to four decimal places:

| zone | x | y | w | h |
| --- | --- | --- | --- | --- |
| LANDS — REAR | 0.0000 | 0.0964 | 0.4250 | 0.1333 |
| ARTIFACTS — REAR | 0.4293 | 0.0964 | 0.4238 | 0.1333 |
| LANDS — FRONT | 0.0000 | 0.2302 | 0.1609 | 0.1333 |
| CREATURES — REAR | 0.1883 | 0.2302 | 0.4246 | 0.1333 |
| ARTIFACTS — FRONT | 0.6400 | 0.2302 | 0.2129 | 0.1333 |
| CREATURES — FRONT | 0.0000 | 0.3642 | 0.7422 | 0.1333 |

Those six rectangles are the opponent's half. The player's half is their
**exact mirror** about `y = 0.5` — verified to within 0.01px on all six
pairs, with identical `x` and `w`. So the design is six rectangles and a
mirror rule, not twelve independent ones.

The rest of the design is a handful of constants:

```text
divider                 y = 0.5000
top boundary            y = 0.0907
hand baseline           y = 0.9167
zone height             h = 0.1333   (2/15 of board height)
card aspect             w/h = 0.7143 (5:7 — correct MTG proportion)
card height             = 0.9479 × zone height
card inset / min gap    = 0.00347 × board height  (3.75px @ 1080)
```

Twenty numbers, resolution-independent. Nothing the owner tuned is
discarded by this change.

### Verification

This is not asserted, it is measured. The six fractional rectangles plus
the mirror rule were used to regenerate all **36 zone rectangles** (12
zones × 3 resolutions) and compared against the blueprint:

```text
[RUN] Max error reproducing all 36 zone rects:  0.150 px
      Worst case: 3840x2160  artifacts-front.x
                  predicted 2457.60   actual 2457.75

[RUN] Card geometry regenerated from card-aspect + card-height constants:
      1920x1080   predicted  97.5 x 136.5   actual  97.5 x 136.5
      2560x1440   predicted 130.0 x 182.0   actual 130   x 182
      3840x2160   predicted 195.0 x 273.0   actual 195   x 273
```

A 0.15px worst case is rounding in the owner's export, not a design
difference. The constants are therefore a lossless description of the
locked geometry, and the blueprint's 3,640 lines carry no information
that these twenty numbers do not.

---

## 3. What was missing: the overflow ladder

The blueprint fixes card pitch at a constant (101.25px @ 1080). That is
correct *until a zone is full*, and the fixture never goes past full, so
the behaviour beyond it was never defined.

This contract defines it. When a zone's contents exceed its width, apply
these steps **in order**, stopping as soon as the contents fit:

1. **Spread** — if there is spare width, keep cards at full size and
   distribute the surplus as larger gaps, up to the fixture pitch. Never
   exceed it; a two-land board must not show two enormous cards.
2. **Compress the gap** — reduce the inter-card gap down to the minimum
   (`0.00347` of board height). Card size is untouched.
3. **Overlap** — allow cards to overlap horizontally, keeping a minimum
   exposed sliver of each card's left edge so every card stays
   individually identifiable and clickable. Minimum sliver is an owner
   decision; a fan of lands is the normal case this serves.
4. **Scale down** — shrink cards uniformly toward a floor: **75% of the
   reference card size** (owner decision 2026-10-15); below that, pile.
5. **Pile** — group identical, non-distinct permanents into a counted
   stack. The existing `PILE` constants in `layout.mjs`
   (`clearance: 5.5, overhang: 14, hoverVertical: 3`) already describe
   this and should be reused.

Rules 1 and 2 are pure arithmetic. Rules 3–5 are where the design
judgement lives and should be reviewed on screen, at a real board, before
being locked.

`layout.mjs` in the spike already implements most of this ladder —
density gaps, pile clearance budgets, scale-to-fit, and stack-collision
avoidance. **It is currently marked inactive legacy in `BUILD_STATUS.md`
while the fixed-coordinate renderer is active. That should be reversed.**

---

## 4. Zone membership is not yet defined, and must be

The blueprint has exactly three zone kinds: `land`, `artifact`, `creature`.

Across all seven phase documents, "planeswalker" appears **0 times** and
"enchantment" appears **0 times**. The Mechanics Lab corpus contains Karn
Liberated. There is currently nowhere to draw him.

Worse, permanent type is not stable in Magic, so a layout keyed on type
needs defined behaviour for all of these:

| situation | example in the Mechanics Lab corpus |
| --- | --- |
| land that is also a creature | Dryad Arbor pattern |
| creature that becomes an artifact / vice versa | Gemrazer, Arcbound Ravager |
| permanent with no visible type | a face-down morph |
| type changed by another permanent | Mind Bend, Blood Moon |
| permanent that is two types at once | any artifact creature |

The old project shipped this exact bug: the client guessed land-ness from
a hardcoded list of basic-land names, so every nonbasic land was laid out
in the wrong row, and it only looked correct because the test deck's lands
were all Mountains.

**Required decisions before implementation:**

- Which zone owns an artifact creature — and is that stable if its type
  changes mid-turn, or does the card physically move rows?
- Where do enchantments, planeswalkers and battles go? (A fourth and fifth
  band, or a shared "other permanents" row?)
- Where does a face-down permanent go, given its type is hidden from the
  opponent and known to its controller? **The two players may need it in
  different rows, which the mirror rule currently forbids.**
- Is `front` / `rear` a player-controlled arrangement, or engine-derived?
  Magic has no such concept, so this is presentation-only and someone must
  own the rule.

Until these are answered, no amount of coordinate tuning will converge,
because the set of things being positioned is not yet defined.

---

## 5. Required properties of the implementation

```text
layout(gameState, viewport) -> positions
```

- **Pure function.** Same state and viewport always produce the same
  positions. No stored coordinates, no hidden accumulated state.
- **No game decisions.** The layout engine must not infer legality, card
  behaviour, or available actions. It positions what it is given. This is
  Phase 6 §6.50 applied to presentation.
- **Resolution-independent.** Driven by the fractional constants in §2, not
  by a lookup of three known screen sizes. Phase 1 §1.19 requires
  1366×768, which the blueprint has no layout for at all.
- **Identity-stable.** A card's on-screen box is keyed by its engine object
  id, so it can be animated between positions rather than disappearing and
  reappearing. This is what makes Phase 6 §6.47 usable visually.
- **Verifiable without a human.** Every property in §3 is machine-checkable:
  no two cards overlap beyond the allowed sliver, nothing escapes its zone,
  nothing collides with the stack dock, mirror symmetry holds. These become
  Playwright assertions, not screenshot opinions.

---

## 6. Why the locked geometry should be unlocked

`BUILD_STATUS.md` states that geometry files are SHA-256 pinned and that
"no geometry changes of any type" are permitted without owner approval.

The same file states:

```text
npm install --offline: FAILED (ENOTCACHED pixi.js); no local live bundle/render.
Production Vite build / PixiJS screenshots / Windows browser checks: NOT VERIFIED.
```

The geometry is therefore locked but has never been observed rendering in
a browser. That is the same failure the old project hit when a layout test
looped over three window sizes while silently rendering only one — caught
by a human screenshot, not by the suite that passed.

**Recommendation:** keep the *proportions* in §2 locked, since those encode
real design judgement and are now expressed in twenty reviewable numbers.
Unlock the generated pixel coordinates, which are an output, not an input.

---

## 7. Open questions for the owner — ANSWERED 2026-10-15 (Phase 7 §7.51)

Sliver 33% of card width; floor 75%; one noncreature row for
enchantments, planeswalkers and battles with a visible fallback; a
permanent that changes type moves rows at once; per-viewer layout for
face-down permanents; front/rear automatic by overflow. Basic lands pile
from the start (Phase 7 §7.58, 2026-10-20). Steps 1 and 2 of §3 are one
step: fixture pitch equals card width plus the minimum gap
(`BATTLEFIELD_RENDERING.md` §4).

As originally asked:

1. Minimum exposed sliver when cards must overlap (§3 step 3).
2. Card scale floor before piling (§3 step 4, proposed 70%).
3. Zone assignment for enchantments, planeswalkers, battles (§4).
4. Behaviour when a permanent changes type mid-game (§4).
5. Whether `front` / `rear` is player-arranged or automatic (§4).
6. Whether face-down permanents may occupy different rows per viewer (§4).

---

## 8. Provenance

Derived by measurement from
`Proxic_Arena_PixiJS_Mock_Battlefield.zip` → `proxic-arena-spike-10/designer-blueprint.json`
(`schemaVersion: 9`, `appSource: "Spike 08.3"`, owner export 2026-10-14),
cross-read against `layout.mjs` (ported from the V3.3.57 placement path).

All figures in §1 and §2 are computed from that file, not estimated.
