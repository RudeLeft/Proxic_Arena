# Phase 0A — P0A-E: hidden information

**Sections:** `PHASE_00A` §0A.7, §0A.12 (P0A-E); `PHASE_00` §0.24, §0.25
**Forge pin:** `forge-2.0.15` — `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`
**Date:** 2026-10-15
**Probe:** `spikes/forge-phase0a/game-harness/.../VisibilityProbe.java`

---

## 1. Result — PASSED

```text
[RUN] morph deck, 3 consecutive games, both seats sampled live

      H1 opponent hand hidden              OK
      H2 opponent library hidden           OK
      H3 own hand visible                  OK
      H4a face-down hidden from opponent   OK
      H4b controller sees own face-down    OK  [Ainok Tracker]

      face-down sightings: 1040 / 1104 / 1444
      samples: ~200-330 per game, taken mid-game from BOTH seats
```

Sampling happens inside the live priority loop, so these are assertions
against real mid-game state rather than a contrived snapshot.

---

## 2. Visibility semantics re-verified at 2.0.15

`AGENTS STUB-004` requires confirming a Forge method answers the
question being asked, not one with a similar name. Both methods were
re-read in full at the new pin:

| Method | Level | Battlefield behaviour |
| --- | --- | --- |
| `CardView.canBeShownTo` | **zone** | returns `true` unconditionally |
| `CardView.canFaceDownBeShownTo` | **identity** | `isInZone(Battlefield, Stack, Sideboard) && getController().equals(viewer)` |

```text
[SOURCE] Unchanged from the old pin 83168c1d. canBeShownTo still lists
         Battlefield under "cards in these zones are visible to all",
         and Hand is visible only when controller.equals(viewer).
```

**A correct serializer must ask both.** One governs whether the viewer
may see the object; the other whether they may know what it is.

---

## 3. Both halves are required, and both are proven by failure

`AGENTS HID-003` — blanking everything passes a leak-only check and is
equally wrong, because a player may look at their own face-down
permanents (CR 713.4a). So the probe was run against two deliberately
broken variants.

### Negative control 1 — zone-level check only

The old project's shipped leak, reproduced:

```text
[RUN] idVis = true  (ask only canBeShownTo)

      H4a face-down hidden from opponent   LEAK (5)
          Ainok Tracker (card 72)
          Ainok Tracker (card 23)
          Ainok Tracker (card 78)
          Ainok Tracker (card 24)
          Ainok Tracker (card 61)
      RESULT: FAIL
```

### Negative control 2 — trust `Card.getName()`

The over-correction that followed the leak fix:

```text
[RUN] no original-state fallback

      H4b controller sees own face-down
          FAIL - blanked for its own controller too (650 nameless sightings)
      RESULT: FAIL
```

A test that only caught control 1 would have let control 2 ship.

---

## 4. The finding this run produced

`Card.getName()` returns the **current state's** name, and a face-down
card's current state has no name — it comes back as the **empty
string**, not null.

This nearly produced a false pass here. The first version of the probe
checked `nameIfEntitled() != null`, which an empty string satisfies.
The report printed:

```text
H4b controller sees own face-down          OK ([])
```

`OK` because the set was non-empty; `[]` because its single element was
`""`. The check was passing on a card the controller could not actually
identify — and two morphs would have been indistinguishable to their
own controller.

The fix, and the rule for Phase 6:

```java
String name = c.getName();
if ((name == null || name.isEmpty()) && c.isFaceDown()) {
    CardState orig = c.getOriginalState(CardStateName.Original);
    name = orig == null ? null : orig.getName();
}
```

and the assertion must require a **meaningful** name, not merely a
non-null one. "Not null" is not "identifies the card".

---

## 5. An unexercised filter is not a passing filter

`AGENTS HID-004`. The probe refuses to report success when no
face-down permanent ever reached the battlefield:

```text
[RUN] mono-green deck (no morph in the card pool)

      H1 opponent hand hidden              OK
      H2 opponent library hidden           OK
      H4a face-down hidden from opponent   OK      <- vacuous
      H3 own hand visible                  OK
      H4 face-down permanent               NOT EXERCISED
          This is NOT a pass. A filter that never fires and a
          filter that works look identical from outside.

      RESULT: FAIL - hidden-information check
```

Note H4a reporting `OK` there: with no face-down permanent in play, "no
leak was observed" is true and meaningless. That is precisely how the
old project's guard sat unexercised for a day while being believed
correct. The harness now makes the distinction structural rather than a
matter of someone remembering.

Reaching H4 at all required morph — an **alternative cost** — which is
only offered because `chooseSpellAbilityToPlay` enumerates via
`Card.getAllPossibleAbilities`. The hidden-information test and the
alternative-cost path are therefore coupled: neither can be verified
without the other.

---

## 6. Recommended strategy (§0.25)

**Build Proxic DTOs using Forge's visibility APIs** — not direct
serialization of Forge's `View` objects.

Reasons:

- Both visibility questions must be asked per card, and the empty-name
  trap handled, before anything is emitted. That logic has to live
  somewhere Proxic owns.
- `PHASE_00 §0.45` forbids coupling the browser to Forge class shapes;
  serializing `CardView` directly does exactly that.
- `AGENTS HID-001`: nothing a viewer is not entitled to may cross the
  wire, even to be filtered later. A DTO built from the checks cannot
  carry what it never read.

Forge's `View` objects remain the **source** of the per-viewer answers;
they are not the wire format.

---

## 7. Status

| Test | State |
| --- | --- |
| P0A-A Forge builds | PASSED |
| P0A-B headless two-player game | PASSED 10/10 |
| P0A-C target + stack | PASSED, draw-dependent |
| P0A-D resource inventory | PASSED |
| **P0A-E hidden information** | **PASSED**, both halves, both negative controls fire |
| P0A-F object identity | not started |
| P0A-G/H protocol safety, reconnect | not started |
| P0A-K zone coverage | not started (replaces Commander) |
| P0A-J adapter recommendation | pending owner acceptance |

H5 (look without reveal), H6 (reveal) and H7 (return to hidden zone)
remain deferred to Phase 0B §0B.8, as scoped — they extend coverage
within this architecture rather than changing it.
