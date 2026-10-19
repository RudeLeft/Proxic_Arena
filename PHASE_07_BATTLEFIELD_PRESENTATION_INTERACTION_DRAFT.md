# Proxic Arena Build Plan

# Phase 7 — Battlefield Presentation & Interaction

**Status:** DRAFT — not locked. Requires owner review.
**Phase Type:** Presentation, interaction, rendering
**Depends on:** Phase 6 accepted (match protocol, action model, object identity)
**Next Phase:** Phase 8 — Mechanics Coverage

---

> **SCOPE AMENDMENT — 2026-10-15 (owner decision).**
> Proxic Arena supports **one play mode: Open Format** — 65-card deck
> maximum, no more than 4 copies of a specific card, unrestricted card
> pool, 2 players. **Commander and Two-Headed Giant are out of scope.**
> Wherever this document describes a format choice, a preset catalog,
> a command zone, teams or shared life, that content is **void**.
> See `docs/architecture/OPEN_FORMAT.md`.

## 7.0 Purpose

Phase 7 builds the thing a player actually looks at and clicks: the
battlefield, the hand, the stack, the HUD, and every gesture that turns a
Phase 6 action into a sent message.

Phases 5 and 6 repeatedly defer presentation decisions to "Phase 7." This
document exists so that those deferrals land somewhere. §7.4 lists every
one of them explicitly, and nothing in Phase 7 may quietly drop one.

Phase 7 does **not** decide what is legal, what actions exist, or who may
see what. Those are Forge's and Phase 6's, permanently.

---

## 7.1 Why this phase is DRAFT and the others are LOCKED

Phases 0–6 are marked LOCKED. Phase 7 is deliberately not, for two
reasons:

1. Phase 0 has not been executed. A locked specification downstream of an
   unexecuted research phase is a guess wearing a lock.
2. §7.10's zone-membership questions are genuine product decisions that
   only the project owner can make, and they change the layout model.

Phase 7 should be locked when §7.53's open questions are answered and
Phase 6 is accepted — not before.

---

## 7.2 Project Locations

Unchanged from Phase 0 §0.8A:

```text
READ OLD
BUILD NEW
```

Reference-only old project:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

The old project's Tk client is **obsolete as architecture** — none of its
rendering survives. Its *interaction lessons* are not obsolete, and are
cited throughout this document where they apply. Read them before
redesigning the same mistake.

---

## 7.3 Phase 7 Ownership

### Phase 7 owns

```text
battlefield rendering
zone layout and card placement
hand, stack dock, graveyard/exile surfaces
HUD: life, phase, turn, priority, counters
card faces, face-down backs, multiface display
selection, focus, hover, inspect
gesture → action_id invocation
targeting and relationship visuals
animation and event presentation
responsive behaviour across real viewports
visual regression and interaction testing
```

### Phase 7 does NOT own

```text
Magic legality
which actions exist
hidden-information filtering
object identity
game outcome
mana legality
target legality
turn structure
```

If Phase 7 ever needs to *decide* one of those rather than *display* one,
that is an escalation (§7.51), not an implementation detail.

---

## 7.4 Inherited Obligations

Every deferral made to Phase 7 by an earlier phase. This table is the
phase's definition of done for inherited scope.

| Source | Obligation | Discharged in |
| --- | --- | --- |
| 6.53 | Selection is not execution; convenience may not erase the distinction | §7.25 |
| 6.58 | All of an object's actions stay discoverable | §7.29 |
| 6.59 | Same `action_id` may appear in multiple surfaces, must be one implementation | §7.28 |
| 6.80 | Relationships (attachments) must not be reconstructed by parsing card text | §7.21 |
| 6.81 | Multiface asset mapping follows the Forge-exposed face | §7.19 |
| 6.84 | Render from Forge-derived current characteristics, not printed values | §7.20 |
| 6.122 | Match-scoped asset authorization; seeing a card in play ≠ deck access | §7.17 |
| 6.138 | Primary click selects; it does not mean "attack" | §7.26 |
| 6.139 | Click meaning may be redefined by an explicit Forge context | §7.27 |
| 6.140 | A discoverable contextual action surface | §7.28 |
| 6.141 | Inspect/zoom reuses the same action IDs | §7.30 |
| 6.142 | Convenience gestures only under four stated conditions | §7.32 |
| 1.19 | Responsive foundation at 1366×768 and up | §7.39 |
| 6.49 | Events are presentation hints; snapshot wins | §7.35 |

---

# PART II — LAYOUT

## 7.5 The Layout Contract Is Authoritative

```text
docs/architecture/BATTLEFIELD_LAYOUT_CONTRACT.md
```

That document is the normative source for battlefield geometry. Phase 7
implements it. Where this phase and the contract disagree, the contract
wins and this document is amended.

---

## 7.6 Layout Is a Pure Function

```text
layout(gameState, viewport) -> positions
```

Same state and viewport always yield the same positions. No stored
coordinates, no accumulated state, no persisted per-card rectangles.

The layout engine makes **no game decisions**. It positions what it is
handed. This is §6.50 applied to presentation.

---

## 7.7 Geometry Comes From Constants, Not a Coordinate File

The owner's tuned design is expressed as ~20 fractional constants (six
zone rectangles, a mirror rule, card aspect, card scale, gap, and four
boundary lines). Those constants were verified to regenerate all 36 zone
rectangles of the existing locked blueprint to within **0.15px**, and card
sizes exactly, at 1920×1080, 2560×1440 and 3840×2160.

```text
[RUN] see BATTLEFIELD_LAYOUT_CONTRACT.md §2 "Verification"
```

Implement from the constants. Do not ship a lookup table of known screen
sizes.

---

## 7.8 Mirror Rule

The player's half is the exact mirror of the opponent's about the divider.
Implement it as a mirror, not as twelve independent rectangles, so the two
halves cannot drift apart.

**Scope, resolved 2026-10-15 (§7.51.5, option B):** the mirror applies
*within a viewer*, not across viewers. Each player's board is laid out
from what that player is entitled to see, so the two clients may
legitimately differ. Implement the mirror as a mirror within one
viewer's layout; do not assert that the two viewers' boards match.

---

## 7.9 Overflow Ladder

The existing blueprint fills every zone to exactly its capacity (14/14,
8/8, 4/4, 3/3) and has no defined behaviour past full. A ninth land has
nowhere to go; 23 lands need 2,332px of an 816px zone.

Apply in order, stopping when contents fit:

```text
1. SPREAD          distribute spare width as larger gaps,
                   never exceeding the contract's reference pitch
2. COMPRESS GAP    shrink gaps to the minimum; card size untouched
3. OVERLAP         fan cards, preserving a minimum exposed sliver
                   so each stays identifiable and clickable
4. SCALE DOWN      uniform shrink toward a readability floor
5. PILE            group identical non-distinct permanents into a
                   counted stack
```

Steps 1–2 are arithmetic. Steps 3–5 carry design judgement and must be
reviewed on a real board before locking.

**Resolved constants (2026-10-15, §7.51):**

```text
step 3  OVERLAP     minimum exposed sliver = 33% of card width
                    (~32px @ 1080) -- name and mana cost stay readable
step 4  SCALE DOWN  readability floor = 75% of reference card size
                    (~73px wide); below that, pile instead
```

**Front / rear rows (§7.51.6).** Presentation only — Magic has no such
concept. Assignment is AUTOMATIC: the front row fills first in play
order, and the rear row is used only when the front overflows. Nothing
is player-arranged and nothing is persisted, which is what keeps
§7.13's "no stored coordinates" rule intact.

The two rows are part of a zone's capacity, so the ladder above
applies to the zone as a whole: a zone is "full" only once both rows
are full.

`layout.mjs` in the PixiJS spike already implements most of this ladder
(density gaps, pile clearance, scale-to-fit, stack-collision avoidance).
It is currently marked inactive legacy while the fixed-coordinate renderer
is active. **Phase 7 reverses that.**

---

## 7.10 Zone Membership Model

**RESOLVED 2026-10-15 (§7.51.3).** The `artifact` row becomes the
**noncreature permanents** row and holds artifacts, enchantments,
planeswalkers and battles. The three zone kinds stay `land`,
`noncreature`, `creature`, so the 36 verified zone rects and the
mirror geometry are unchanged.

Any permanent whose type the model does not enumerate falls back to
the noncreature row. A permanent must never vanish because its type
was unrecognised, and a fallback that renders is always better than a
gap nobody notices.

The existing model has three zone kinds: `land`, `artifact`, `creature`.
Across Phases 0–6, "planeswalker" appears 0 times and "enchantment" 0
times. The Mechanics Lab corpus contains Karn Liberated. There is
currently nowhere to draw him.

Phase 7 must define, for every permanent Forge can put on a battlefield,
exactly one zone — including a defined fallback for types the model does
not enumerate. An unmapped permanent must render *somewhere visible*, never
vanish.

---

## 7.11 Type Is Not Stable

A layout keyed on card type must define behaviour when type changes.

```text
artifact creature          which row owns it?
creature-land              Dryad Arbor pattern
animated land              Blood Moon, creature-lands
type overwritten           Mind Bend
mutate / modification      Gemrazer, Arcbound Ravager
no visible type            face-down permanent
```

**Old project precedent:** the Tk client inferred land-ness from a
hardcoded list of basic-land names, so every nonbasic land rendered in the
wrong row. It looked correct only because the test deck's lands were all
Mountains. Derive type from the Phase 6 snapshot's Forge-supplied current
characteristics (§6.84) — never from name, never from printed text.

**RESOLVED 2026-10-15 (§7.51.4): move immediately.**

A permanent that changes type moves rows the moment the snapshot says
so. This follows from Phase 7's final principle — the battlefield is a
view of Forge's state, never a second model — and holding a stale row
would mean the board knowingly disagrees with the authoritative state.

Accepted cost: a card can jump rows mid-combat. If that proves
disorienting on a real board, the fix is an animated transition, NOT a
delayed one.

---

## 7.12 Face-Down Permanents May Break the Mirror

A face-down permanent's controller knows it is a creature. The opponent
knows only that a face-down permanent exists.

If zone assignment is type-derived, the two viewers may legitimately need
it in **different rows** — which §7.8's mirror rule currently forbids.

**RESOLVED 2026-10-15 (§7.51.5): option B, per-viewer layout.**

Layout is a function of (snapshot, viewer). Each client's board is
computed from what that viewer is entitled to see, and the mirror
applies within a viewer rather than across viewers (§7.8 amended to
match). Option C was rejected: it leaks "it is probably a creature".

Testing obligation that comes with B: every layout test runs from
BOTH seats. A per-viewer layout that is only ever tested from one seat
is how the old project's `canBeShownTo` leak survived review — the
guard existed, was believed correct, and was never exercised from the
other side.

The options as originally put:

```text
A. Face-down permanents get a dedicated row, identical for both viewers.
B. Layout is computed per-viewer; the mirror applies within a viewer,
   not across viewers.
C. Face-down permanents always occupy the creature row for both viewers,
   accepting that this leaks "it is probably a creature."
```

Option C leaks information and should not be chosen casually. Option B is
the most correct and the most work.

**Old project precedent:** this is the same class of bug as the
`canBeShownTo` / `canFaceDownBeShownTo` leak — the one where the guard was
written, reviewed, and believed correct while sending every face-down
creature's real name to the opponent. Hidden information is easy to leak
through presentation, not just through the protocol.

---

## 7.13 No Stored Coordinates

```text
PROHIBITED:

a committed file containing per-card x/y/w/h for a fixture board
a layout keyed by exact screen resolution
a "locked geometry" artifact that the renderer reads at runtime
```

The owner's design intent lives in the constants (§7.7). Generated pixel
positions are an output.

---

## 7.14 Retiring the Blueprint

`designer-blueprint.json` becomes a **reference artifact**, not an input.
It stays readable as the record of the owner's tuning and as the fixture
for a regression comparison, but the renderer must not consume it.

The Designer tool, if retained, should author **constraints** — band
heights, anchors, gaps, scale floors — not coordinates.

---

# PART III — RENDERING

## 7.15 Renderer  *(amended 2026-10-19 — owner decision)*

> **Original text (superseded, kept per PHASE-002):**
> PixiJS, mounted inside React per Phase 1 §1.17–1.18, with the lifecycle
> guarantees already required there (no duplicate canvases, no abandoned
> animation loops, no leaked listeners across navigation).
> React owns chrome, panels, menus and forms. PixiJS owns the board.

**Amended decision.** The board is rendered in **React DOM** — cards as
real elements positioned by CSS transform — with **SVG overlays**
(`pointer-events: none`) for connectors and effects. One renderer.
PixiJS stays installed and remains a *measured contingency for the card
layer only*, opened solely by a missed benchmark.

The normative statement is `docs/architecture/BATTLEFIELD_RENDERING.md`.
Where this phase and that document disagree, that document wins.

Recorded in the PHASE-003 CONFLICT format:

```text
Requirement:   PixiJS owns the board (this section, original text)
Observed:      §7.44 demands testing through the real event path; §7.45
               and §7.47 demand the hidden-information assertion be made
               on what is rendered; §7.42's properties are external DOM
               measurements. A canvas can satisfy none of these from
               outside without a test API that trusts the renderer about
               itself — the shape of the old _on_card_click bug.
Evidence:      SOURCE §7.42, §7.44, §7.45, §7.47; SOURCE §6.134;
               UPSTREAM-DOC §7.16 (82ms Pillow rebuild, a CPU bug);
               INFERENCE Open Format faces ~50-60 not 150+.
Impact:        the verification half of this phase; accessibility of
               every card; the overlay click-swallowing bug class.
Options:       (a) PixiJS board + test API; (b) DOM cards + Pixi effects;
               (c) DOM cards + SVG overlays, Pixi as measured contingency.
Recommendation (c). Option (b) was rejected for introducing a second
               renderer and a seam to maintain for a dozen vector shapes.
Owner answer:  (c), 2026-10-19.
```

The Phase 1 §1.18 lifecycle guarantees still apply to the overlay layers
and to any animation loop.

---

## 7.16 Texture Strategy  *(amended 2026-10-19 — owner decision)*

> **Scope note.** Under the amended §7.15 the card layer is DOM, so card
> art is an `<img>` with the five layout scales offered as `srcset`, and
> decode, caching and eviction belong to the browser. The questions below
> become binding **only if** the §7.15 contingency is taken. What remains
> binding now is the measurement: the performance budget in
> `BATTLEFIELD_RENDERING.md` §6, run on a 60-face / 80-permanent synthetic
> board (acceptance P7-M, P7-Q).
>
> The "150+ distinct faces" figure below was sized before Open Format.
> Two 60–65 card decks at four-of are ~23 distinct cards each; two decks
> plus tokens is roughly 50–60 faces. `INFERENCE` — to be confirmed by
> the P7-M benchmark, not assumed.

Card faces are the dominant asset cost. A 60-permanent board plus two hands
plus graveyards is easily 150+ distinct faces.

Phase 7 must determine, with measurement:

```text
texture atlas vs individual textures
source resolution vs displayed size
mip/downscale strategy at the five layout scales
eviction policy when a match exceeds texture memory
behaviour while a face is still loading
```

**Old project precedent:** card faces were rebuilt through Pillow on every
redraw, costing 82ms per frame — a 12fps ceiling — until cached. The cost
was found by profiling, not by guessing, and the first guess about the
cause was wrong. Measure before optimizing, and measure again after.

---

## 7.17 Card Face Authorization

Per §6.122, a player may legally see an opponent's card in play without
gaining Deck Depot access to that opponent's deck. Face assets are served
under match-scoped authorization.

The browser must never be sent a face it is not currently entitled to.
**Filtering in the UI after transmitting is prohibited** (Phase 0 §0.82).

---

## 7.18 Face-Down Rendering

A face-down permanent renders as a card back **for both viewers**,
including its controller — who is entitled to know what it is (CR 713.4a)
but whose opponent must not be able to infer it from across the table.

The controller learns its identity through inspect/hover, from the
Phase 6 snapshot, which supplies the real name to that viewer only.

**Old project precedent:** the first fix for this blanked the card for
*everyone*, so a player could not tell their own two morphs apart. Both
halves of the asymmetry are requirements; satisfying one is not the fix.

---

## 7.19 Multiface Cards

Display the face Forge currently exposes (§6.81). Never infer the current
face from name, layout type, or printed text. A transform must be driven
by state, not by the animation that accompanies it.

---

## 7.20 Card Annotations

Render from Forge-derived current values (§6.84), never printed ones:

```text
power / toughness        current, after all effects
counters                 whatever kinds the engine reports
tapped                   current
summoning sickness       current
attacking / blocking     from combat state
damage marked
```

**Old project precedent:** counter badges were rendered for whatever
counter kinds the engine reported rather than a hardcoded list, because a
counter type is engine data. Keep that. Do not enumerate counter kinds in
the client.

---

## 7.21 Relationships

Attachments (Auras, Equipment, and anything else Forge models as attached)
are rendered from the Phase 6 relationship data. §6.80 is explicit:
**Phase 7 must not reconstruct these by parsing card text.**

Define the visual: attached cards tucked under their host, a connector, or
both. Must survive the host moving zones.

---

## 7.22 Stack Dock

The stack is a first-class surface. Each item is individually identifiable
and inspectable, bottom-first in resolution order.

**Old project precedent:** the stack panel existed, with hit regions and
an arrival animation, and never rendered once — because the bridge never
populated the key it read. Verify the dock against a real multi-item
stack, not an empty one. Its label was also drawn 8px inside the top card
and was invisible for weeks.

---

## 7.23 HUD

```text
life totals            both players, change clearly signalled
turn / phase / step
priority holder        distinct from active player
mana available
counters (poison, energy, experience)
connection status
```

Priority and active player are different facts (Phase 6, and old
`StateSnapshot` sends them separately). Do not conflate them in the UI.

---

# PART IV — INTERACTION

## 7.24 Consume the Phase 6 Action Model

Every gesture resolves to a server-issued `action_id` or decision
candidate id. The client never constructs an action, never parses a label
to decide what something does, and never infers legality.

---

## 7.25 Selection Is Not Execution

Per §6.53, selecting/focusing an object and performing a game action are
distinct. Convenience may shorten the path; it may not merge the concepts.

---

## 7.26 Primary Click Selects

Outside an explicit Forge selection context:

```text
left-click a card = select / focus
left-click a card ≠ attack
```

The prohibited shortcut (§6.52) `if type == CREATURE: click = attack` must
not reappear in any form.

---

## 7.27 Context Redefines the Gesture

Inside an explicit Forge context such as declare-attackers, primary click
may toggle a legal candidate, because the current context defines the
gesture (§6.139). The context ends; the gesture meaning ends with it.

Phase 7 must make the active context **visible**. A player should never
have to guess what clicking will do.

**Old project precedent:** interaction modes were introduced precisely so
the client stopped reading English prompts to decide what a click meant.
Keep the mode concept; derive it from `choice_type`, never from prose.

---

## 7.28 Contextual Action Panel

A discoverable surface listing the selected object's currently available
actions (§6.140). The same `action_id` may appear here and in inspect
(§6.59) — **one implementation, two surfaces**, never two code paths.

---

## 7.29 Every Action Stays Reachable

Per §6.58, if Forge exposes actions A, B and C for one object, all three
must be reachable. Silently choosing A, or hiding B and C behind a
hardcoded default, is prohibited.

**Old project precedent, and the sharpest one:** the decision options map
was keyed by card id, one entry per card, so a card offering two abilities
silently kept only the last. It was latent for months, then became the
normal case the moment alternative costs landed — every morph card offers
both a face-up cast and a face-down cast. The fix was to give abilities
their own ids plus a `card_id` naming their host, and to ask the player
which when a card offers several. Phase 6 §6.55 encodes this as
`object_id` vs `action_id`. Phase 7 must present it.

A card with multiple actions must remain **a clickable card**, not degrade
into a row of text buttons.

---

## 7.30 Inspect / Zoom

Right-click or equivalent opens an enlarged view, showing the current
Forge-derived characteristics and, where appropriate, the same action IDs
used elsewhere (§6.141).

Inspect must work on anything visible: battlefield, hand, stack, graveyard,
exile, command zone, and an opponent's revealed cards.

---

## 7.31 Targeting

A targeting gesture must make three things obvious: what is doing the
targeting, what is legally targetable, and how to cancel.

**Old project precedent, three separate bugs:**

- The targeting arrow was an 18px line drawn above the cards, so it
  swallowed clicks meant for them. Hit-testing was resolved at the canvas
  level afterwards. Headless tests missed it entirely because they called
  the click handler directly rather than dispatching a real click.
- Legal targets were rendered as flat text buttons for weeks, because
  candidate ids did not match snapshot ids. This is why §6.47 exists.
- Cancel did not exist, so clicking a card committed you with no way out;
  a player reported it as being unable to pass the turn.

Cancel is a requirement, not a nicety, wherever Forge permits it.

---

## 7.32 Convenience Shortcuts

Permitted only when all four of §6.142's conditions hold. A shortcut that
makes another legal action undiscoverable is prohibited regardless of how
convenient it is.

---

## 7.33 Unknown Action Kinds Must Still Render

Forge's decision surface is large and Phase 6 will not have mapped all of
it. When the client receives an action or decision kind it does not have a
bespoke UI for, it must render a **generic, usable fallback** from the
protocol data — never a dead end, never a blank panel.

**Old project precedent:** an unhandled decision kind rendered as
"Unsupported decision: …" and the game simply could not continue.

---

# PART V — EVENTS AND ANIMATION

## 7.34 Snapshot Is Truth

Per §6.49, the authoritative snapshot wins over any event. If they
disagree, the snapshot is correct and the animation was wrong.

## 7.35 Missing Events Are Survivable

Dropping an event may cost an animation. It may never cost correctness.
The next snapshot must still produce the right board.

## 7.36 Animation Must Not Gate Input

A player must never be unable to act because an animation is playing. Any
animation can be interrupted or skipped by the arrival of new state.

## 7.37 Reconnect

On reconnect the board is rebuilt from the current snapshot alone, with no
event replay (§6.49). An outstanding decision is re-presented.

**Old project precedent:** the relay could replay a dropped player's seat
and latest decision for a full day before any client tried to reconnect —
half a feature, shipped and invisible. And when reconnect arrived it
reopened the deck lobby over a live game. Test that the game *continues*,
not merely that a snapshot arrives; the snapshot arrives whether or not the
match is still alive.

---

# PART VI — RESPONSIVENESS

## 7.38 Real Viewport Range

```text
minimum supported:   1366 × 768      (Phase 1 §1.19)
common:              1536 × 864, 1920 × 1080, 1710 × 960
large:               2560 × 1440, 3440 × 1440, 3840 × 2160
```

Plus browser chrome, bookmarks bars, OS scaling at 125%/150%, and
arbitrary window sizes. The layout must be continuous across this range,
not a selection from a list.

**Old project precedent:** a layout test looped over three window sizes
while silently rendering the same one every time, because the window
manager ignored the resize. It passed. A human screenshot caught it. Any
viewport test must assert that geometry actually changed.

## 7.39 Readability Floor

Below the floor where card art and P/T become unreadable, the layout
switches strategy (pile, scroll, or zoom) rather than continuing to shrink.
Define the floor numerically.

## 7.40 Not Colour Alone

Selection, legality, targeting and damage states must be distinguishable
without relying on hue alone.

---

# PART VII — VERIFICATION

## 7.41 This Phase Can Be Verified by Machine

The old project's `AGENTS.md` carried rule TEST-003: no tool in that
environment could render or drive a native Tk window, so every UI claim
was MANUAL and screenshots were the owner's job. Three owner screenshots
found four real defects that automated runs had passed.

**A browser does not have that limitation.** Playwright is already in the
Phase 1 stack. Phase 7 must not inherit the MANUAL-only assumption.

Automate from the first commit, not at the end.

## 7.42 Layout Property Tests

Machine-checkable, no screenshots needed:

```text
no card escapes its zone
no two cards overlap beyond the allowed sliver
mirror symmetry holds
nothing collides with the stack dock
every card has a hit region of at least the minimum size
layout is deterministic for the same (state, viewport)
layout is continuous: a 1px viewport change never moves a card 100px
```

Run these across a generated range of viewports **and card counts**
(0, 1, 8, 9, 23, 60 permanents in a zone) — the counts the blueprint
could not express.

## 7.43 Visual Regression

Screenshot comparison at a fixed set of viewports, with a documented
tolerance. The spike's `VERIFY_VISUAL_WINDOWS.cmd` is the right instinct;
make it cross-platform and part of CI.

## 7.44 Interaction Tests

Drive the real UI through Playwright against a real match. Assert that a
gesture sends the expected `action_id` — not that a handler was called.

**Old project precedent:** headless tests called `_on_card_click` directly
and passed, while real clicks were being swallowed by an overlay. Test
through the real event path.

## 7.45 Hidden Information Is a UI Test Too

Render both seats and assert the asymmetry directly: the opponent's view
must not contain the identity of a face-down permanent or a hand card, and
the controller's must.

**Old project precedent:** the equivalent test is
`tabletop_server/test_face_down.py`, which asserts *both* halves. A
leak-only check passes when the card is blanked for everyone, which is
also wrong.

## 7.46 Human Review Still Required

Automation covers correctness. It does not cover whether the board *looks*
right. Aesthetic judgement remains the owner's, and a Phase 7 change that
alters what the board looks like is not complete until the owner has seen
it.

## 7.47 Prohibited Verification Shortcuts

```text
claiming a layout works at N resolutions without proving geometry changed
calling a click handler instead of dispatching a real click
asserting a snapshot arrived instead of asserting the game continued
screenshot tests with a tolerance so wide they cannot fail
testing only the easy branch of a decision
filtering hidden information in the UI after transmitting it
```

---

# PART VIII — ACCEPTANCE

## 7.48 Acceptance Tests

| ID | Test | Evidence |
| --- | --- | --- |
| P7-A | Layout renders correctly at 1366×768 through 3840×2160, continuously | `RUN` |
| P7-B | A zone with 23 permanents renders legibly via the overflow ladder | `RUN` |
| P7-C | Every permanent type in the Mechanics Lab corpus has a defined zone | `RUN` |
| P7-D | A permanent that changes type behaves per §7.11's documented rule | `RUN` |
| P7-E | Face-down permanent: card back to both, identity to controller only | `RUN` |
| P7-F | A card with 3 actions exposes all 3; none reachable only by default | `RUN` |
| P7-G | Primary click outside a Forge context selects and does not attack | `RUN` |
| P7-H | Targeting: source visible, candidates visible, cancel works | `RUN` |
| P7-I | An unmapped decision kind renders a usable generic fallback | `RUN` |
| P7-J | Reconnect rebuilds the board from snapshot alone and play continues | `RUN` |
| P7-K | Dropping an event costs an animation, not correctness | `RUN` |
| P7-L | Attachments render from relationship data, not parsed text | `RUN` |
| P7-M | Texture strategy measured under a 60-permanent board | `BENCHMARK` |
| P7-N | Layout property suite green across the viewport × card-count matrix | `RUN` |
| P7-O | Owner has seen and accepted the board | `USER` |
| P7-P | *(added 2026-10-19)* For a seeded board, every card's `getBoundingClientRect()` equals `layout()`'s Box — the renderer obeys the maths through the real path (`BATTLEFIELD_RENDERING.md` §6 tier 2) | `RUN` |
| P7-Q | *(added 2026-10-19)* The `BATTLEFIELD_RENDERING.md` §6 performance budget is met on the synthetic 80-permanent / 60-face board, numbers committed; a miss is the only thing that opens the §7.15 PixiJS contingency | `BENCHMARK` |

## 7.49 Escalation

Stop and ask the owner before:

```text
implementing any Magic legality in the client
adding a second source of truth for available actions
choosing a face-down model that leaks type (§7.12 option C)
reintroducing stored per-card coordinates
locking geometry that has not been observed rendering
changing an approved proportion from the layout contract
making a card's only path to an action a convenience shortcut
```

## 7.50 Prohibited Shortcuts

```text
if type == CREATURE: click = attack
inferring the current face from card name or layout type
enumerating counter kinds in the client
parsing card text to build an action or a relationship
a resolution lookup table in place of responsive layout
hiding a legal action because the UI is crowded
shipping a zone model with no fallback for unmapped types
```

## 7.51 Owner Decisions — RESOLVED 2026-10-15

All six are answered. Phase 7 is no longer blocked on the owner.

| # | Question | Decision |
|---|---|---|
| 1 | Minimum exposed sliver (§7.9 step 3) | **~33% of card width** (~32px @ 1080) — name and mana cost stay readable |
| 2 | Scale floor before piling (§7.9 step 4) | **75% of reference** (~73px) — pile earlier rather than shrink past readability |
| 3 | Enchantments, planeswalkers, battles (§7.10) | **One noncreature permanents row**, with a visible fallback for unenumerated types |
| 4 | Type change (§7.11) | **Move rows immediately** |
| 5 | Face-down model (§7.12) | **Option B — per-viewer layout** |
| 6 | `front` / `rear` (layout contract zone table; see §7.9) | **Automatic, by overflow**; rear fills only when front is full, order follows play order |

Consequences carried into the implementation:

- §7.8's mirror rule is scoped to *within a viewer*.
- Layout takes a viewer argument, and every layout test runs from both
  seats (§7.12).
- (6) stores nothing per player, which keeps §7.13's "no stored
  coordinates" intact — a player-arranged front/rear would have
  required persisted arrangement state and contradicted it.

---

# Phase 7 Final Principle

The battlefield is a **view of Forge's state**, not a second model of the
game.

Every pixel is derived from the authoritative snapshot. Every gesture
resolves to a server-issued action identity. Nothing on screen is the only
copy of anything.

When presentation and truth disagree:

```text
truth wins, and the presentation was a bug
```
