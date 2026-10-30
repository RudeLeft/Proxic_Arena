# Battlefield Rendering

**Status:** ACCEPTED — owner decision 2026-10-19
**Amends:** Phase 7 §7.15 (renderer), §7.16 (texture strategy), §7.48 (acceptance); Phase 1 stack table row "Battlefield renderer" via `docs/history/phases/phase-01/PHASE_01_AMENDMENTS.md` Amendment 3
**Companion:** `BATTLEFIELD_LAYOUT_CONTRACT.md` (geometry — unchanged by this document)
**Date:** 2026-10-19
**Amended by:** spec 0040 (owner 2026-10-30): §4's centre-out placement now
applies per line, to creatures and everything else; lands start at the left
edge. A tapped card tilts 5° and is never clipped (PHASE 7 AMENDMENT 4 item 6
superseded).

---

## 1. The decision

The battlefield is rendered in **React DOM**, with cards as real elements
positioned by CSS transform, and **SVG overlays** for anything drawn
between or over them. There is **one renderer**.

PixiJS stays installed (Phase 1 §1.17–1.18 are discharged and remain
true) as a **measured contingency** for the card layer only. It is not
part of the architecture until a benchmark in §6 is missed.

```text
Layer        Technology                              Owns                              Takes input
----------   -------------------------------------   -------------------------------   -----------
chrome       React DOM                               rail, step track, stack, dialogs  yes
cards        React DOM, transform: translate3d       every permanent and hand card     yes
connectors   SVG below the cards, pointer-events:none attachment lines                  no
effects      SVG above the cards, pointer-events:none targeting arrow, glows            no
```

One coordinate system, one input path, one render pass. Nothing is
synchronised between two technologies, because there are not two.

---

## 2. Why — in the project's own terms

This reverses the Phase 7 draft's "PixiJS owns the board." The reasons
are the project's documents, labelled per EVID-001.

**§7.44 requires testing through the real event path.** `SOURCE`

> Drive the real UI through Playwright against a real match. Assert that a
> gesture sends the expected `action_id` — not that a handler was called.
> Old project precedent: headless tests called `_on_card_click` directly
> and passed, while real clicks were being swallowed by an overlay.

To dispatch a real click at a card on a canvas, the test must first ask
the renderer where the card is, then click there. That has the same shape
as calling the handler directly: it passes whether or not a real player
could hit that card. On DOM, `getBoundingClientRect()` reports where the
browser actually put the element; the test and the player look at the
same thing.

**§7.45 requires the hidden-information assertion to be made on what is
rendered.** `SOURCE` — and §7.47 forbids "filtering hidden information
in the UI after transmitting it." The opponent-seat test must prove the
face-down card's identity is *absent from the view*. On DOM that is a
text query over both seats. On a canvas it is not provable from outside.

**§7.42's property tests become one-line DOM queries.** `SOURCE` — no
card escapes its zone, no overlap beyond the sliver, mirror symmetry,
hit region ≥ minimum, determinism, continuity. "Every card has a hit
region of at least the minimum size" is measurable from outside on DOM
and is internal renderer state on a canvas.

**The texture argument was sized for a format this project does not
play.** `INFERENCE` — §7.16 assumes 150+ distinct faces. Open Format is
two decks of 60–65 cards at four-of; a representative deck has ~23
distinct cards (`docs/architecture/OPEN_FORMAT.md`; the Phase 2 import
fixtures). Two decks plus tokens is roughly **50–60 distinct faces**, a
third of what §7.16 planned for. This figure is to be confirmed by the
benchmark in §6, not assumed.

**The old project's 12fps ceiling was not a DOM problem.** `UPSTREAM-DOC`
— §7.16 records that card faces were rebuilt through Pillow on every
redraw at 82ms per frame until cached. That is a CPU image-processing
bug. The browser's decoded-image cache is the fix, and it is free.

**§6.134 already sanctions DOM and requires replaceable presentation.**
`SOURCE` — "Ordinary React/DOM controls and simple image rendering are
sufficient... Phase 7 must be able to replace presentation while
preserving MATCH_PROTOCOL, object identity, current characteristics,
action identity, decision semantics, viewer-safe state, asset
authorization, asset retrieval." This document preserves all eight.

**The overlay-swallows-clicks bug becomes structurally impossible.**
`SOURCE` (§7.31 old-project precedent) — an SVG layer with
`pointer-events: none` can be drawn over everything and can never take a
click.

**Declared bias.** `USER` — the agent that proposed this is far more
effective reading DOM than a canvas. That bias was named in the
discussion; the owner's decision rests on the sourced reasons above,
which stand without it.

---

## 3. The contract: one place computes positions

```text
layout(state, viewport, viewer) -> Map<objectId, Box>
```

Pure, DOM-free, deterministic. It implements `BATTLEFIELD_LAYOUT_CONTRACT.md`
§2–§3 and Phase 7 §7.6–§7.9 and §7.51 in full: the six fractional
rectangles, the mirror about `y = 0.5`, the overflow ladder, centre-out
placement within each zone (§4 below), piling, and per-viewer layout for
face-down permanents (§7.51.5 — hence the `viewer` argument §7.6 lacks).

The renderer applies it. The overlays read it. The tests assert it.
Nothing else positions anything.

```text
Box = { x, y, w, h, scale, rotation, z }   in CSS px for the given viewport
```

---

## 4. Centre-out placement (owner decision 2026-10-19)

*Spec 0040: per line now, and for creatures and everything else only;
lands start at the left edge of their line.*

Every zone fills from its horizontal centre outward. One permanent sits
in the middle of its rectangle; a second joins it and the pair stays
centred; the group grows both ways until the rectangle is full, and only
then overflows to the rear row per §7.51.6. All six zones behave this way.

The ladder decides the **pitch**; this rule decides the **placement**.
They compose: compute pitch, measure the group's width, centre that
width in the rectangle.

```text
pitch   = ladder(n, zone.w)
groupW  = (n - 1) * pitch + cardW
left    = zone.x + (zone.w - groupW) / 2      clamped to zone.x + inset
```

This also resolves a dead branch in the contract. `BENCHMARK` — fixture
pitch is `0.09375` of board height; card width plus the minimum gap is
`0.090256 + 0.00347 = 0.093726`; the difference is 0.02px at 900px tall.
Ladder step 1 ("spread: distribute surplus as larger gaps") therefore
has no range to travel. Spare width becomes equal margins, never larger
gaps. The contract's §3 step 1 and step 2 are one step.

Consequence to design for: playing a permanent moves every permanent
already in that row, because the group re-centres. The contract's
identity-stable boxes (§5) exist for exactly this — the move animates
rather than teleports.

---

## 5. Rendering rules

1. **Cards are fixed-size and positioned only by transform.**
   `left:0; top:0; width:cardW; height:cardH;
   transform: translate3d(x, y, 0) rotate(θ) scale(s)`.
   A transform change is composited and causes no reflow; eighty cards
   re-centring at once is a compositor job.

2. **Every card element is self-describing.**
   ```html
   data-object-id="card:51" data-zone="p-crea" data-controller="p"
   data-tapped="true" data-pt="4/4" data-face="front"
   ```
   Ids are the Phase 6 typed ids (`card:51`, `stack:3`), never bare
   integers. This is what makes §7.42 and §7.45 assertions one-liners.

3. **Each card is a real `<button>`** with an accessible name carrying
   the current characteristics (§7.20). Inspect, selection and the
   contextual action surface (§7.28) hang off real elements with real
   focus order. No `role` on a `div`.

4. **Card art is an `<img>`** with the five layout scales offered as
   `srcset`, `decoding="async"`. Decode, caching and eviction belong to
   the browser. §7.17 asset authorization is unchanged: the `src` is a
   match-scoped authorized URL.

5. **Overlays are SVG, `pointer-events: none`, in separate layers.**
   Connectors (attachments, §7.21) render *below* the card layer so a host
   card covers its own connector's end; the targeting arrow (§7.31) and
   glows render *above*. Several layers at different z-indices are free
   on DOM and impossible on a single canvas.

   As built (step 5, PHASE 7 AMENDMENT 7): the four lines are one SVG layer
   above the battlefield and below the hand (stacking: battlefield up to
   ~2000, a swooping attacker 4500, lines 5000, bursts and numbers 6000,
   hand 10000+). Every line starts and ends **inside the card's picture**,
   never on its name or power/toughness bar (the mock ended its block line
   at 72% of the card's height for the same reason). A swoop comes
   **straight across the table**: centred over its target, or between its
   blockers, its near edge halfway down them; at a player it stops with its
   near edge on the life total. A swooping attacker is hit where it lands
   (the burst), and its damage number rises where it rests.

6. **State-driven appearance stays on the card.** Tapped (tilt, dim, and
   the word), attacking (step toward the line), selected, legal target,
   summoning sick — all per §7.40, never hue alone — are CSS states on
   the card element, not overlay drawings.

7. **Animation never gates input** (§7.36). Transitions are CSS; new
   state interrupts them. Entering play needs a mount transition and
   leaving needs a brief exit hold; both are real work and budgeted.

8. **Fonts are self-hosted.** Screenshot regression (§7.43) is not
   trustworthy against a web-font request. Barlow Condensed and any other
   display face ship with the frontend.

9. **Lifecycle guarantees of Phase 1 §1.18 still apply** to the overlay
   layers and any animation loop: no duplicates across navigation, no
   abandoned frames, no leaked listeners.

---

## 6. Verification, cheapest first

| Tier | Tool | Asserts | Evidence class |
| --- | --- | --- | --- |
| 1 | Vitest on `layout()` | §7.42 properties across (state × viewport × viewer × card count 0/1/8/9/23/31/60), both seats | `RUN` |
| 2 | **one** Playwright test (`frontend/e2e/battlefield.spec.ts`) | for seeded boards (0-200 permanents) at four window sizes, every card's `getBoundingClientRect()` equals `layout()`'s Box; and PHASE 7 AMENDMENT 4 on what was drawn: no card covers another row, nothing crosses the divider, tilted corners are really clipped (hit-tested) | `RUN` |
| 3 | Playwright, real events | a dispatched click sends the expected `action_id` (§7.44); the arrow never takes a click | `RUN` |
| 4 | Playwright, both seats | opponent view's DOM text lacks every face-down identity; controller's has it (§7.45) | `RUN` |
| 5 | screenshot regression | fixed viewports, pinned fonts, documented tight tolerance (§7.43, §7.47) | `RUN` |
| 6 | the owner | whether it looks right (§7.46) | `USER` |

Tier 1 is the fast loop: thousands of cases per second, no browser.
Tier 2 is the bridge: it proves the renderer obeys the maths through the
real path, so tiers 1 and 2 together satisfy §7.44 without a test API.

### The performance budget — a gate, not a hope

Set now, measured in §7 step 6, committed with the numbers:

```text
60 fps sustained through a full re-centre at 80 permanents      BENCHMARK
a new face visible <= 100 ms after entering play                 BENCHMARK
<= 150 MB decoded-image memory with 60 distinct faces at 4K      BENCHMARK
first paint of a 40-permanent board <= 300 ms after snapshot     BENCHMARK
```

Measured with a dev route that generates a synthetic board:
`?permanents=N&faces=M&seed=S`. The route is also how an agent inspects
the board reproducibly.

### Measured (step 6, 2026-10-21)

`frontend/e2e/benchmark.spec.ts` (opt-in, `PROXIC_BENCH=1`) on `/dev/bench`:
80 permanents, 60 distinct pictures (generated at a real scan's 745 x 1040,
with grain), five runs, in a real Edge window on the owner's PC
(i5-13600KF). Evidence: `docs/testing/evidence/p7-benchmark.json`.

```text
                         1920x1080            3840x2160
                         full      fit        full      fit
first paint (<= 300)     30 ms     29 ms      30 ms     30 ms     PASS (at 80, twice the board)
new face (<= 100)        30 ms     30 ms      30 ms     30 ms     PASS
re-centre at 60 fps      0/486     0/486      0/493     0/488     PASS (frames over 25 ms)
decoded images (<= 150)  174 MB    8 MB       175 MB    33 MB     FAIL at full size, PASS fitted
```

"full" is a picture served at the scan's own size, as Arena serves
imported pictures today; "fit" is at the size the table draws it, which
is what §5.4's `srcset` would serve. The memory miss is the PICTURES'
size, not the renderer's: a browser keeps every PNG decoded at its own
resolution whatever draws it, and a canvas renderer would upload the same
full-size pictures as textures. It does not open the PixiJS door; it
makes §5.4's sized pictures a requirement rather than a refinement.

Method notes: frames are measured in a real window -- headless Edge
schedules frames on a timer and dropped some whenever many animations
ran (15 of 24 re-centres against 1 of 24 idle windows), which measured
the test browser; headed, none of 24 did. The page is never polled
while something moves.

**Only a missed budget opens the PixiJS door**, and then only for the
card layer. Because positions come from `layout()` and the tests assert
rendered geometry, a swap is contained to one module and the tests
survive it. What would be lost is stated in §2: the DOM accessibility
tree and the one-line assertions. That trade is to be made with numbers.

---

## 7. Build order

| Step | Produces | Why here |
| --- | --- | --- |
| 1 | `layout()` and its Vitest property suite | verified maths before a pixel exists |
| 2 | static DOM board from a seeded fixture, data attributes from the first commit | something an agent can read and the owner can see |
| 3 | the tier-2 Playwright bridge | proves step 2 obeys step 1 |
| 4 | transforms, enter/exit transitions (PHASE 7 AMENDMENT 6: 250 ms; cards travel from and to their rail zones; the hand card zooms) | now it moves |
| 5 | SVG connector and effects layers: the fire, shield, crosshair and chain lines and the combat impact (PHASE 7 AMENDMENT 4, from `proxic-arena-spike-10`) | now it points and glows |
| 6 | density route, benchmarks against §6 | the PixiJS decision, with data |
| 7 | this document's acceptance rows green; Phase 7 gate updated | make it official |

Steps 1–3 yield a provably correct, unstyled board. That is the opposite
of the old project's order, and the point.

---

## 8. What this does not change

- `BATTLEFIELD_LAYOUT_CONTRACT.md` — the geometry, the constants, the
  ladder. This document consumes them.
- Phase 6 — protocol, identity, characteristics, visibility, asset
  authorization. §6.134's list is preserved item for item.
- Phase 1 §1.17–§1.18 — discharged and still true; PixiJS remains
  installed and its lifecycle test remains green.
- Phase 6's scope exclusions naming "final PixiJS battlefield" — they
  exclude building the final board in Phase 6, which is unchanged
  whatever renders it.

---

## 9. Provenance

Decided in design review on 2026-10-19 against the Phase 7 draft and
the layout contract, with the rendering alternatives compared on the
project's own verification rules. The companion UI design canvas
(private) holds the screen designs this will be built to; its geometry
is this document's §3–§4.
