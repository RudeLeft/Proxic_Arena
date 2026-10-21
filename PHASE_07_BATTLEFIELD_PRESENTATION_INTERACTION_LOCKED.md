# Proxic Arena Build Plan

# Phase 7 — Battlefield Presentation & Interaction

**Status:** **LOCKED 2026-10-20** by the owner, after review against
Phase 6 as built with every owner decision recorded (§7.51, §7.52).
Changes from here on are amendments (§7.69 lists the ones this phase
makes to Phases 3-6).
**Phase Type:** Presentation, interaction, rendering — and, since
2026-10-20, the redesigned application pages (PART X)
**Depends on:** Phase 6 — COMPLETE 2026-10-20 (match protocol, action
model, object identity, visibility, assets)
**Review:** `docs/research/phase-07/PHASE_07_REVIEW.md`
**Next Phase:** Phase 8 — Mechanics Coverage

---

> **SCOPE AMENDMENT — 2026-10-15 (owner decision).**
> Proxic Arena supports **one play mode: Open Format** — 60–65 card
> deck, no more than 4 copies of a specific card, unrestricted card
> pool, 2 players. **Commander and Two-Headed Giant are out of scope.**
> Wherever this document describes a format choice, a preset catalog,
> Commander's command zone, teams or shared life, that content is
> **void**. See `docs/architecture/OPEN_FORMAT.md`.
>
> **Correction 2026-10-20:** Open Format still has a command zone as a
> game zone -- the initiative's dungeon, the Ring, planeswalker emblems
> -- and Phase 6 sends it. The board must show it (§7.23). The design
> canvas's note "No command zone: Open Format has none" is wrong.

## 7.0 Purpose

Phase 7 builds the thing a player actually looks at and clicks: the
battlefield, the hand, the stack, the HUD, and every gesture that turns a
Phase 6 action into a sent message.

Phases 5 and 6 repeatedly defer presentation decisions to "Phase 7." This
document exists so that those deferrals land somewhere. §7.4 lists every
one of them explicitly, and nothing in Phase 7 may quietly drop one.

Phase 7 does **not** decide what is legal, what actions exist, or who may
see what. Those are Forge's and Phase 6's, permanently.

**Widened 2026-10-20 (owner decision):** Phase 7 also builds every page
on the private UI design canvas -- Sign in, Lobby, Deck Depot, Account
and Admin (PART X). Where those pages change a rule a locked phase made,
the change is recorded as an amendment there (§7.69).

---

## 7.1 Why this phase was DRAFT, and why it can now be locked

It was drafted before Phase 0A ran and before Phase 6 existed, with
open product questions. All three are resolved: Phase 0A was accepted
(2026-10-15), Phase 6 is complete (2026-10-20), and every owner
question is answered (§7.51, §7.52). The 2026-10-20 review found the
corrections and protocol needs folded in below. Locked by the owner
2026-10-20.

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
| P6 action model | `docs/architecture/MATCH_ACTION_MODEL.md` "Phase 7 contract": every option reachable, generic fallback, inspect separate from action | §7.28–§7.33 |
| P6 live game | every priority stop asked; unpayable spells offered; refused attack gives no reason | §7.53, §7.54, §7.61 (B7) |
| P6 visibility | the command zone, the Ring-bearer, dungeon rooms, day/night, player counters are on the wire and must be shown | §7.23 |

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
turn / phase / step    and day/night once it exists
priority holder        distinct from active player -- needs §7.61 B1
mana available         the floating pool -- needs §7.61 B6
counters               whatever Forge reports on a player (poison,
                       energy, experience, rad...), never a fixed list
designations           monarch, initiative, the city's blessing
command zone           the dungeon and its current room, the Ring (and
                       how many times it has tempted), emblems
library / graveyard / exile counts, each opening a viewer
connection status
```

There is **no player-facing game log** (owner decision 2026-10-20,
§7.52): what a player needs to notice reaches them through the board
itself -- animation, the stack, short messages (§7.57). The verbose
record is server-side (§7.56).

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
Keep the mode concept; derive it from the question's `kind` (Phase 6's
field name), never from prose.

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

## 7.32a Findings from the first live game (2026-10-20) — decided

The three findings the owner's live game raised are decided in §7.52
and specified in §7.53 (priority stops), §7.54 (unpayable spells) and
§7.61 B7 (why a choice was refused). Identical tokens stop being a
problem once a token is chosen by clicking it on the board (§7.61 B5)
rather than from a list of same-named labels.

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
layout is continuous: a 1px viewport change never moves a card 100px,
  except where a card changes rows at a capacity point (AMENDMENT 2)
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
| P7-R | *(added 2026-10-20)* Default stops: a turn with nothing to respond to passes without asking; a spell on the stack always stops; a player's added stop is honoured; no non-priority question is ever answered automatically | `RUN` |
| P7-S | An unpayable spell is shown dimmed, is still clickable, and Forge decides; a Force of Will is not dimmed when its alternative cost can be paid | `RUN` |
| P7-T | Concede ends the match with the opponent as Forge's winner; Abandon still ends it with none | `RUN` |
| P7-U | The game record holds every question, answer and refusal of a real match, and only an administrator can read it | `RUN` |
| P7-V | Identical untapped basics pile from the start; a tapped one leaves the pile | `RUN` |
| P7-W | A back-face picture in a package is shown for the back face; without one, a text frame -- never the front's picture | `RUN` |
| P7-X | Every §7.61 addition reaches both seats correctly, and none carries hidden information (both seats, as P6-G) | `RUN` |
| P7-Y | The pages (PART X) work through real clicks; a player cannot reach any admin route; the last administrator cannot be disabled or demoted through the API | `RUN` |
| P7-Z | Force close of a room mid-match ends it with no winner and both players are told | `RUN` |
| P7-AA | Deck names: a duplicate import or rename is refused; renaming a deck selected in a room works and the other seat sees the new name | `RUN` |

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

## 7.52 Owner Decisions — RESOLVED 2026-10-20

Asked after the Phase 6 review, in plain English with game examples.

| # | Question | Decision |
| --- | --- | --- |
| 7 | Stopping at every step | **Skip steps by default, adjustable** -- Forge-desktop style (§7.53) |
| 8 | Spells that cannot be paid for | **Dimmed, still clickable**; Proxic asks Forge, never guesses (§7.54) |
| 9 | A game log | **A very verbose server-side record for a future bug button; players do not see it.** What players need comes through animation and short messages (§7.56, §7.57) |
| 10 | Concede | **Add Concede (a real loss), keep Abandon (no winner)** (§7.55) |
| 11 | Piling basic lands | **Pile from the start**; tapped ones leave the pile (§7.58) |
| 12 | Back faces have no picture | **Deck Builder will export back-face pictures** (owner's change in that project); Arena maps them; a text frame until a deck has them (§7.59) |
| 13 | The game screen | **Full window, chat in a drawer** (§7.60) |
| 14 | Scope | **Everything on the UI design canvas**, Admin page included (PART X) |
| 15 | Admin safety | **The last admin cannot be disabled or demoted; every admin action is recorded.** No password re-entry and no home-network restriction -- owner's call, trade-off in §7.67 |
| 16 | Force close mid-game | **The game ends with no winner and both players are told** (§7.67) |
| 17 | Renaming a selected deck | **Allowed** (§7.65) |
| 18 | Two decks with one name | **Not allowed** (§7.65) |
| 19 | The room list | **Every room is visible; taking a seat still needs an invitation** (§7.64) |

## 7.52a Layout decisions at the start of the build — 2026-10-20

Asked before `layout()` was written, because the canvas and the text left
them open (owner: "if there is anything you need clarification on even if
it's locked in the doc please ask"). Where one changes a locked decision
it is PHASE 7 AMENDMENT 1 below.

| # | Question | Decision |
| --- | --- | --- |
| L1 | A window that is not 16:9 | **Rows stretch sideways.** Card size follows the window's height; zone x/width follow the width left of the rail, so a wider window fits more per row (a creature row holds ~18 on 3440x1440 instead of 14) |
| L2 | The rail on wide windows | *(build decision)* the rail's width is **proportional to the height** (235/900 of it, as on the canvas), so it never balloons; at 16:9 this reproduces the contract's x = 0.8529 exactly |
| L3 | A permanent with two types | **Creature, then land, then other**: anything currently a creature is in the creature rows (Dryad Arbor, an animated Mutavault, artifact creatures); otherwise any land is in the land rows (Urza's Saga, Darksteel Citadel); everything else is noncreature |
| L4 | Which row fills first | **Lands fill the long BACK row first** (by the player's edge), spilling into the short front row; creatures and noncreature permanents fill their FRONT row first |
| L5 | Identical tokens | **Pile, like basics**: same name, same current characteristics, untapped, no counters, no attachments, not in combat |
| L6 | Order within a row | **Arrival order**, oldest left, newest right, never re-sorted; the key is Forge's own game timestamp for when the permanent entered (§7.61 B11) |
| L7 | Auras and Equipment | **Tucked behind their host**, name strip peeking out above it; they share the host's slot and move with it, on the host's side of the table whoever controls them |
| L8 | Tapped basics | **Their own tapped pile** beside the untapped one ("Forest x2" untapped, "Forest x3" tapped) |

Taken from the canvas as designed, not re-asked: a tapped card **tilts
15 degrees** about its lower centre, dims and says "TAPPED"; an attacker
**steps toward the divider** (14px at a 900px board); the hand fans in a
shallow arc along the 0.9167 baseline, partly below the edge, and a card
lifts when pointed at; the opponent's hand is a count.

## PHASE 7 AMENDMENT 1

**Reason:** Owner answers at the start of the build (§7.52a L4, L5).

**Affected requirements:** §7.51 decision 6 ("front/rear automatic by
overflow; rear fills only when front is full") and §7.58 (only basic
lands pile).

**Old decision:** every kind fills its front row first; only identical
untapped basic lands pile.

**New decision:** lands fill their back row first and spill forward;
creatures and noncreature permanents fill their front row first.
Identical tokens pile like basics (§7.52a L5), and tapped basics form
their own pile (L8). Nothing else in §7.51 or §7.58 changes: placement is
still automatic, nothing is player-arranged or stored.

**Evidence:** owner decisions 2026-10-20, asked with diagrams.

**Approved by project owner:** yes, 2026-10-20
**Date:** 2026-10-20

## PHASE 7 AMENDMENT 2

**Reason:** "Rows stretch" (§7.52a L1) makes a row's capacity depend on
the window's width, so at the width where a row stops fitting, one card
must move to its kind's other row -- about one row-height, which §7.42's
continuity property forbids.

**Affected requirements:** §7.42 "a 1px viewport change never moves a
card 100px".

**Old decision:** no card ever moves more than ~100px on a 1px resize.

**New decision:** cards move smoothly on resize **except at a row's
capacity point**, where one card changes rows and the cards left in that
row re-centre (by about half a card). Nothing else may jump; the test
exempts only the group where a card actually changed rows, and fails if
such events are frequent. Mid-game resizing is rare.

**Evidence:** owner decision 2026-10-20, asked against the alternative
of fixed row capacities (no hop, but no extra cards per row on wide
windows).

**Approved by project owner:** yes, 2026-10-20
**Date:** 2026-10-20

## PHASE 7 AMENDMENT 3

**Reason:** Drawing `layout()`'s output showed a tapped card's 15-degree
tilt (taken from the canvas) leaning its top onto the next card and
covering that card's name. The owner chose to keep 15 degrees and not
overlap.

**Affected requirements:** §7.52a's "a tapped card tilts 15 degrees" as
the canvas drew it (overlapping its neighbour).

**Old decision:** tapped cards tilt in place, at the normal spacing,
over their neighbour.

**New decision:** a tapped card gets **tilt room** -- the extra width its
tilt reaches past its upright box, computed from the rotation (about 1%
of a card on the left, 32% on the right at 15 degrees) -- **only while it
is tapped**. While a row is not overflowing, a tapped card overlaps
nothing. Tapping or untapping re-centres the row, so its neighbours glide
a little (animated). When a row overflows, every gap in it is squeezed by
one factor, tilt room included, so squeezing starts exactly where the
spaced layout stops and nothing jumps; tilted cards then overlap like
everything else, and no card's drawn outline leaves its row. Rows hold
fewer cards when many are tapped.

**Evidence:** owner decision 2026-10-20, asked with the alternative of
always leaving tilt room (no movement on tap, fewer cards per row).

**Approved by project owner:** yes, 2026-10-20
**Date:** 2026-10-20

## PHASE 7 AMENDMENT 4

**Reason:** The first drawn board (build step 2), measured card by card
in a real browser at 1366x768, 1920x1080 and 3440x1440, showed four
places where the canvas's choices made one card cover another. The rows
are packed edge to edge (3.75px apart at 1080), so anything that leaves
its row lands on a neighbour:

- an attacker's step toward the divider, plus its tilt, reached up to
  23px over the divider and covered the name of the creature across
  from it -- the card the defender reads to choose blocks;
- an Aura's or Equipment's peeking name strip (L7) covered the bottom of
  the card in the row above it, where that card's power/toughness is;
- in a squeezed row each card shows its left third, and power/toughness
  sat on the right, so it was covered;
- a 15-degree tilt makes a card about 15% taller, so a tapped card's
  corner tips reached about 4px into the rows above and below.

The owner also pointed to the relationship primitives of the earlier
PixiJS mock (`Proxic_Arena_PixiJS_Mock_Battlefield.zip`,
`proxic-arena-spike-10`: `attack-presentation.mjs`,
`block-presentation.mjs`, `target-presentation.mjs`,
`attach-presentation.mjs`) as the intended look for combat and targeting.

**Affected requirements:** §7.52a L7 (attachments peek above the host);
the canvas rules recorded under §7.52a ("an attacker steps toward the
divider"; the bottom bar reads type, then power/toughness); PHASE 7
AMENDMENT 3 (tapped cards overlap nothing); BATTLEFIELD_RENDERING.md §7
step 5 (connectors and effects, previously unspecified).

**Old decision:** attackers step 14/900 of the board's height toward the
divider; attachments are tucked behind the host with their name strip
peeking out above; the bottom bar reads "Creature ... 2/2"; tapped cards
tilt in place.

**New decision:**

1. **Attackers keep their place.** An attacking creature stays in its
   slot, tilted if tapped, with the amber outline and an **ATTACKING**
   tag (in place of TAPPED). What it attacks is shown by the **fire
   line** (item 5), not by moving it.
2. **Combat damage is an impact.** When Forge deals combat damage, each
   attacker swoops onto what it is hitting -- its blocker, or, if
   unblocked, the player's life total or the planeswalker or battle it
   attacked -- covers about half of it, an **impact burst** plays, and it
   slides back to its place. First strike and regular damage are
   separate waves. A **damage number** ("-3") rises off whatever was hit
   and fades; it is the amount Forge actually dealt, so prevention and
   replacement are reflected. These are animations: per §7.34-§7.36 they
   never gate input and the snapshot stays the truth.
3. **Auras and Equipment are name tags on their host.** Nothing peeks
   out of the host. The host shows one tag per attachment across its
   picture (glyph and name, oldest first). Each tag is its own control
   with the attachment's object id, so it can be targeted (Disenchant on
   Pacifism) and pointed at to see the whole card. Attachments still
   share the host's slot and side of the table whoever controls them.
4. **Power/toughness on the left.** The bottom bar reads "2/2 Creature";
   a pile's count ("x3") sits at the left under the name. A squeezed row
   therefore always shows each card's name and power/toughness.
5. **Relationship lines, from the mock:** a fiery red-orange line with
   moving particles and an arrowhead from an attacker to what it attacks;
   a blue shield line from a blocker to the attacker it blocks; a purple
   crosshair line from a spell or ability to its target; a gold chain
   from an Aura or Equipment to the creature while the player chooses
   where it goes (afterwards it is a name tag). They are drawn in the SVG
   effects layer and take no clicks.
6. **Tapped corners tuck under.** Each horizontal band of rows clips its
   cards vertically, so a tilted card's corner tips disappear under the
   next band instead of covering it. Sideways nothing is clipped
   (AMENDMENT 3's tilt room still applies). An animation that must leave
   its band (the impact swoop, a card changing rows) draws in a layer
   above the bands while it moves.

**Measured result:** on seeded boards of 12 and 40 permanents, no card
overlaps any card of another row and nothing crosses the divider, at all
three window sizes; on a 90-permanent board the only overlaps are the
overflow ladder's own squeeze within a row (§7.51).

**Protocol addition:** B13 (Part IX) -- combat damage dealt, for the
damage numbers.

**Evidence:** owner decisions 2026-10-20, asked with screenshots of the
measured overlaps and with the alternatives (attackers step but slide
under the defender's cards; peek and tuck under; keep the canvas;
smaller cards so tilted cards fit).

**Approved by project owner:** yes, 2026-10-20
**Date:** 2026-10-20

## PHASE 7 AMENDMENT 5

**Reason:** On the drawn board, the canvas's card text measured about
8px tall at 1920x1080 and 6px at 1366x768.

**Affected requirements:** the card face's type sizes as taken from the
canvas (§7.52a, owner decision "canvas frame + art crop").

**Old decision:** name and type text 0.062 of the card's height; badges
and tags 0.058.

**New decision:** about a fifth larger: name and type text **0.075** of
the card's height (still inside the 0.132 bars), state and pile badges
and Aura/Equipment tags **0.070**, tags 0.12 tall. Everything else on
the card face is unchanged.

**Evidence:** owner decision 2026-10-20 ("yes make the text bigger").

**Approved by project owner:** yes, 2026-10-20
**Date:** 2026-10-20

## PHASE 7 AMENDMENT 6

**Reason:** Build step 4 (movement). The document required that movement
never gates input (§7.34-§7.36) and named "an animated transition" as
the remedy for row changes (§7.11), but set no speed and did not say how
cards enter, leave or respond to the pointer in the hand.

**Affected requirements:** Part V (events and animation) and the canvas
rule recorded under §7.52a ("a card lifts when pointed at").

**Old decision:** none recorded; the canvas lifted a pointed-at hand
card a little.

**New decision:**

1. **Speed: about a quarter of a second** (250 ms, quick to start and
   gentle to land) for every move: a tap, a row re-centring, a card
   arriving, leaving or rising from the hand.
2. **A card that enters play travels from where it was**: from the hand
   (the same card, gliding), from a pile it leaves, or from its zone in
   the rail -- the stack for a resolving spell, the library for a draw, a
   graveyard for a return -- growing from small to full size.
3. **A card that leaves play slides to where it went**: its owner's
   graveyard, exile, library or hand in the rail, shrinking and fading on
   the way; its row then closes the gap. A card that joins another's spot
   (a land into its pile) glides into it.
4. **A pointed-at hand card rises and zooms**: upright, **twice** the
   table size, wholly on screen and inside the play area, covering part of
   the board while pointed at (owner's choice over "rise fully, a little
   larger" and "rise a little"). Keyboard focus does the same.
5. **Where the zones are** is the canvas's rail: each player's block
   (life, then library, graveyard and exile rows) -- the opponent's at the
   top, the viewer's at the bottom -- and the stack between them. Until
   the rail is built (Part X), cards travel to those positions.
6. Not movement: a new window size redraws in place; the first board, a
   reload or a reconnect (§7.37) is drawn where it is, nothing flying in;
   the system's "reduce motion" setting turns all of it off.
7. A card on its way out is drawn but has no object id and takes no
   clicks, so a test or a player never acts on something already gone
   (§7.36). The tilted-corner clip of AMENDMENT 4 is drawn per card, in the
   card's own coordinates, so it rides with a moving card instead of
   cutting it at a band's edge.

**Evidence:** owner decisions 2026-10-20, asked with game examples (a
tapped Forest, a resolving Serra Angel, a Goblin Guide dying in combat,
pointing at a hand card). Verified on the real stack:
`frontend/e2e/battlefield.spec.ts` drives sixteen seeded changes and
checks that each one moves and then settles exactly on `layout()`, ghosts
gone, and that a pointed-at hand card lands exactly on its zoomed box;
shown to fail with transitions switched off and with ghosts that never
leave.

**Approved by project owner:** yes, 2026-10-20
**Date:** 2026-10-20

## PHASE 7 AMENDMENT 7

**Reason:** Before build step 5 (connectors and effects), the details
AMENDMENT 4 left open: which relationship lines show when, how they
move, and how the combat impact plays in the cases that are not one
attacker against one blocker.

**Affected requirements:** PHASE 7 AMENDMENT 4 items 2 and 5;
BATTLEFIELD_RENDERING.md §5.5 and §7 step 5.

**Old decision:** the four lines and the swoop-and-impact as the PixiJS
mock (`proxic-arena-spike-10`) drew them, details unspecified.

**New decision:**

1. **Targeting lines** (purple crosshair): only the stack's **top**
   object (the one that resolves next) shows its lines, plus any stack
   object the player points at. With Lightning Bolt, a response and a
   response to that on the stack, one line shows, not three.
2. **Fire lines** (attacks) appear when the attacking player's choice is
   confirmed and stay **until combat ends**, through blocks and damage.
   Shield lines (blocks) appear when blocks are confirmed and stay until
   combat ends.
3. **Lines keep moving** while shown, as in the mock: sparks along the
   fire line, pulses along the shield line, glints along the chain. The
   system's "reduce motion" setting makes them still.
4. **The impact is a burst about a card wide** over what was hit, in the
   fire line's colours, gone in about half a second. No table shake.
5. **A damage number lasts about one second**: it rises a little and
   fades.
6. **Several blockers:** the attacker swoops to land **between** them,
   covering the inner half of each; each gets its burst and its number
   at the same moment, because the rules deal that damage at once.
7. **Many attackers:** every swoop of one damage step plays **at once**
   (one quarter second), never one after another.
8. **First strike:** each combat damage step is its own swoop -- the
   first-strike step, then the regular step -- each showing exactly what
   Forge dealt in that step.

**Evidence:** owner decisions 2026-10-20, asked with game examples (a
Bolt and two responses on the stack; Serra Angel blocked by Goblin Guide
and Llanowar Elves; six attackers, three blocked; a first-strike White
Knight blocked by Goblin Guide).

**Approved by project owner:** yes, 2026-10-20
**Date:** 2026-10-20

## PHASE 7 AMENDMENT 8

**Reason:** Build step 6 measured the performance budget
(BATTLEFIELD_RENDERING.md §6; evidence
`docs/testing/evidence/p7-benchmark.json`). First paint, a new face and
60 fps through a full re-centre all pass with wide margins. Decoded-image
memory does not: with 60 different pictures at 4K, pictures served at a
scan's full 745 x 1040 hold about 175 MB (budget 150); served at the size
the table draws them, about 33 MB. The miss is the pictures' size, not
the renderer's -- any renderer keeps full-size pictures decoded -- so it
does not open the PixiJS contingency.

**Affected requirements:** BATTLEFIELD_RENDERING.md §5.4 (sized pictures
offered as `srcset`, until now a refinement); PHASE_04's stored deck
images and PHASE_06's match-scoped asset route (§6, P6 asset
authorization), which today store and serve one full-size picture.

**Old decision:** each imported picture is stored and served at its own
size; the table draws it scaled down.

**New decision:** **table-sized copies.** When a deck's pictures are
imported, the server also keeps smaller copies of each; the asset route
serves a picture at a requested size, under exactly the same match-scoped
authorization as today (a copy is no more visible than its original).
The table asks for the size it draws; zooming a hand card and inspecting
a card ask for the full scan. The look at table size is unchanged; the
memory budget is then met (about 33 MB at 4K with 60 pictures). Listed
with the protocol additions as **B14**.

**Evidence:** owner decision 2026-10-21, asked with the measured numbers
and the alternative (keep full size and raise the budget to about 200 MB).

**Approved by project owner:** yes, 2026-10-21
**Date:** 2026-10-21

## PHASE 7 AMENDMENT 9

**Reason:** The application pages (Part X) were moved ahead of the rest
of the battlefield integration (owner decision 2026-10-21). §7.64 left
one question "to confirm at build", and three details the canvas draws
were not yet rules.

**Affected requirements:** §7.64 (rooms), §7.67 (Admin: reset a
password, sign-in activity).

**Old decision:** §7.64: fixed set of rooms or on demand, to confirm.
Room names, the password-reset flow and what sign-in activity shows were
unspecified.

**New decision:**

1. **Rooms are opened on demand, as today** -- not the canvas's five
   fixed rooms. "Open a room" makes a new one; the list shows every open
   room; there is no "all rooms busy" state. Phase 5's one room per
   player and the server's existing limit on simultaneous games are
   unchanged. The canvas's "claim an empty room" (notes r5, i1) becomes
   "open a room".
2. **A room may be named** when it is opened -- optional; left blank it
   is "<display name>'s room". The name is shown to everyone in the room
   list.
3. **Resetting a password on the Admin page:** the administrator types
   the new password, every session of that account ends, and the
   administrator tells the player -- as `arena-admin` does today. No
   forced change at the next sign-in.
4. **Sign-in activity shows the address** each attempt came from, with
   its time, account and result. Only administrators see it.

**Evidence:** owner decisions 2026-10-21, asked with the alternatives
(five fixed rooms; automatic names; forcing a password change; no
address).

**Approved by project owner:** yes, 2026-10-21
**Date:** 2026-10-21

---

# PART IX — PLAY, AS DECIDED 2026-10-20

## 7.53 Priority stops

The board stops for a player's decision only at **stops**. Defaults:

```text
your precombat and postcombat main phases
declare blockers, when you are attacked
any moment a spell or ability is on the stack -- always, so a
  response is never skipped
any question that is not a priority pass (targets, modes, choices,
  combat declarations, pregame) -- always
```

Everywhere else the client answers "pass priority" for the player. A
small settings panel lets a player add or remove stops per step (for
example, the opponent's end step for an instant); stored per player,
server-side, defaulting as above.

Two rules keep this inside FORGE-RULE:

1. Only a **priority pass** is ever automatic -- never a target, mode,
   payment, or combat choice.
2. It is the **player's** setting, visible and changeable. Turning every
   stop on gives today's behaviour exactly.

Forge's own desktop client works this way (phase stops), which is the
precedent; nothing here decides legality.

## 7.54 Spells that cannot be paid for

Forge offers some spells it cannot pay for and undoes the cast when
payment fails (Phase 6). The worker asks **Forge's own payment check**
whether each offered spell or ability can currently be paid and marks the
option (`payable: false`, §7.61 B8). The board shows it **dimmed, with a
short "not enough mana right now" note, still clickable**: Forge has the
final word, because an alternative cost (Force of Will), convoke, or an
overlooked mana ability can pay what looks unpayable. Never hidden.

## 7.55 Concede

A participant may **concede**: Forge's concession, so Forge declares the
opponent the winner; the match is `ENDED` with that result and reason
("conceded"). **Abandon** stays, for stuck or broken games: no winner
(Phase 6). Concede asks for confirmation; it cannot be undone.

## 7.56 The game record (server-side)

Every match keeps a **verbose record**, for diagnosing problems and for
the owner's planned bug-report button:

```text
every question asked, to whom, with every option
every answer, accepted or refused, and why
every snapshot sent to each player (or a digest plus the changes)
Forge's own game log
the worker's stderr (already kept, Phase 6)
timings
```

Not shown to players. It contains **both players' hidden information**,
so it is readable only by an administrator (and by whatever the bug
button sends, which is the owner's later design). Kept for a bounded,
configurable period per match, beside the existing match log. It is
the production equivalent of the Mechanics Lab traces that found most of
Phase 6's bugs.

## 7.57 What a player is told

Instead of a log: the opponent's actions **animate** (a card moving to
the stack, a creature stepping into combat, damage landing), the stack
shows what is pending (§7.22, §7.61 B2), and **short messages** carry
what an animation cannot -- a reveal, a coin flip, a game restart,
Forge's notices (Phase 6 already sends them per player). Messages fade;
a missed one costs nothing, because the board is the truth (§7.34).

## 7.58 Basic lands pile from the start

Identical **untapped basic lands** of one controller always form one
counted pile ("Forest ×5"), like a physical table -- not only under
overflow pressure (resolves the canvas's open question). A tapped land
leaves the pile and shows separately; an untap returns it. Nonbasic
lands and anything with counters, attachments or a changed state are
never piled. The pile is one clickable object whose actions are the
lands' own (§7.29: tapping "a Forest" is choosing one of them).

## 7.59 Back faces

Deck packages carry front images only today, so a transformed card has
no picture (Phase 6, correct rather than wrong). Owner decision: **Proxic
Deck Builder will also export back-face pictures**, named like any other
face (`DECK_PACKAGE_FORMAT.md` §5.3):

```text
real_cards/<back face name> [<SET>].png
```

Arena imports and maps them by face name; a package without them stays
valid. Until a deck has one, the back face renders as a clean text frame
(name, type line, power/toughness) -- never the front's picture.

## 7.60 The game screen

During a match the battlefield takes **the whole window** (the canvas's
Battlefield artboard: board plus the right-hand rail). Chat is a
**drawer** that slides out and back; the lobby returns when the game
ends. A refresh or a new tab lands on the board while the match is
live.

## 7.61 Protocol additions Phase 7 needs

The design shows things Phase 6 does not send yet. Each is additive (no
breaking change, `protocolVersion` stays 1), recorded as a Phase 6
protocol amendment in `MATCH_PROTOCOL.md`, built in Phase 7, and tested
like Phase 6's fields (both seats, hidden information checked).

| # | For | Addition |
| --- | --- | --- |
| B1 | who may act (canvas: priority dot, "Bob to act") | `prioritySeat` in the snapshot |
| B2 | stack items as cards ("resolves next") | per entry: source object id and name, controller seat, spell or ability |
| B3 | targeting arrows from the stack | per entry: its targets (object or player ids) |
| B4 | combat lines | blocker → attacker, attacker → player / planeswalker / battle |
| B5 | choosing by clicking the board | an explicit `objectId` on each option (the client never parses ids) |
| B6 | mana available | each player's floating mana pool |
| B7 | why a choice was refused | Forge's own reason text where Forge gives one |
| B8 | dimmed unpayable options (§7.54) | `payable` on each option, from Forge's payment check |
| B9 | concede (§7.55) | a `CONCEDE` message and Forge's result |
| B10 | stops (§7.53) | the player's stop settings, and which questions are priority passes |
| B11 | arrival order within a row (§7.52a L6) | each permanent's entry timestamp, Forge's `getGameTimestamp()` |
| B12 | identical tokens pile (§7.52a L5) | `token: true` on a token (Forge's `isToken()`) |
| B13 | damage numbers at impact (AMENDMENT 4) | per combat damage wave: source, recipient (object or player) and the amount Forge dealt |
| B14 | table-sized pictures (AMENDMENT 8) | the asset route serves each picture at a requested size, from smaller copies kept at import; same authorization |

---

# PART X — THE APPLICATION PAGES (added 2026-10-20)

The private UI design canvas (artboards Login, Lobby, Deck Depot,
Account, Admin, Battlefield) is the design source for these pages. As
for the battlefield, the canvas is the look; this part is the rules.
Where the canvas and a rule here disagree, the rule wins and the canvas
is updated.

## 7.62 Shared shell

One header on every signed-in page: the logo (back to the Lobby), Deck
Depot, Lobby, Account, **Admin only for an administrator**, connection
status, Sign out. The server re-reads the role from the session on every
request; hiding Admin is the courtesy, not the protection (Phase 3
§3.19).

## 7.63 Sign in

The canvas's Login page over the existing Phase 3 sign-in: the notice
slot (session ended, wrong password, throttled) and every state the page
already has. No new rule.

## 7.64 Lobby

The canvas's Lobby: players online, the room list, lobby chat, and the
room you are in opened in place.

- **Every room is visible to every signed-in player** -- name, seats,
  who is in them. **Taking a seat still requires an invitation**:
  there is no Join for an uninvited player (owner decision 19).
  Amends Phase 5's "no directory of rooms" (§7.69).
- Invitations, one at a time, withdraw after a short delay, declined
  and withdrawn states: as the canvas's notes specify.
- **Start match** is one button: preparing and launching are one step
  for the player; the server still freezes, validates and claims as
  Phases 5 and 6 require, and the button says what the wait is for.
- Seat dots carry readiness, not presence (canvas notes s4, s5).
- The canvas shows a fixed set of rooms ("all five rooms always
  exist") -- **to confirm at build** whether rooms are a fixed set or
  created on demand as today; either keeps Phase 5's one-room-per-player
  rule.

## 7.65 Deck Depot

The canvas's Depot over Phase 4: import, my decks and decks shared with
me as two lists, open a deck, share and revoke.

- **Rename** a deck you own (new). Allowed while the deck is selected in
  a room: everything refers to the deck id (owner decision 17).
- **Deck names are unique per owner** (owner decision 18): an import or
  rename that would duplicate one of your names is refused and asks for
  another name. Existing duplicates, if any, are left as they are but
  cannot be renamed into another duplicate. Amends Phase 4 (§7.69).
- A deck shared with you shows no Rename or Delete (Phase 4 §4.59).

## 7.66 Account

The canvas's Account page over existing Phase 3 features: identity
(username, role), change display name, change password (ends every
session, said before the button), sign out everywhere. No new rule.

## 7.67 Admin

The canvas's Admin page: accounts (list, create, enable/disable, reset a
password, role), rooms (with force close), the server's state (version,
database, Forge worker, uptime) and recent sign-in activity. **Amends
Phase 3**, which kept account administration on the host only (§7.69).

Rules (owner decisions 15, 16):

- **The last active administrator cannot be disabled or demoted**, by
  anyone, including themselves; the control is not offered and the
  server refuses it.
- **Every admin action is recorded**: who, what, to which account or
  room, when -- in the server log and the game-record store (§7.56).
- **Force close** of a room with a running match ends the match with
  **no winner** (as Abandon) and tells both players "An administrator
  closed this game"; the room closes.
- The admin tool `arena-admin` stays; the page does not replace it.
- **Accepted trade-off (owner decision 15):** no password re-entry and
  no home-network restriction, so a browser left signed in as an
  administrator can change accounts. Recorded so it is a decision, not a
  discovery.

## 7.68 Testing the pages

Each page gets Playwright tests through real clicks (§7.44), the
hidden-information discipline where a page shows other players' data
(the room list shows seats, never decks), and the owner's look (§7.46).
Admin tests prove a player cannot reach any admin route and that the
last-admin rule holds against the API, not only the page.

## 7.69 Amendments to locked phases

| Phase | Was | Now |
| --- | --- | --- |
| 3 | account administration only through `arena-admin` on the host | also the Admin page, with §7.67's rules |
| 4 | deck names may repeat; no rename | rename your own decks; names unique per owner |
| 5 | no directory of rooms; invitation-only | rooms visible to all; seats still by invitation; Start match is one step for the player |
| 6 | protocol as built | §7.61's additive fields and messages |

Each is written into the locked phase's amendment record when Phase 7 is
locked.

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
