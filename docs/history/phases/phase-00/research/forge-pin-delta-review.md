# Phase 0A — review of the 197 commits between `forge-2.0.15` and `master`

**Question:** does pinning the release instead of `master` cost us anything?
**Answer:** no identifiable benefit is being given up, and `master` would add work.
**Date:** 2026-10-15

---

## 0. Why this was done

The Phase 0A recommendation to pin `forge-2.0.15` originally rested on
an argument from principle — a tagged release is upstream's own
stability signal — plus a check that the APIs we use still exist. It
did **not** rest on knowing what the intervening commits contained.
That was the one soft spot in the gate, so it was closed.

A correction to the earlier figure: **197** commits separate the tag
from `master`. The previously quoted 186 was the *old pin* →
`master` distance.

---

## 1. Method

The GitHub compare API caps its file list at 300, which hid two thirds
of the change. The diff was therefore taken **locally** against both
trees:

```text
[RUN] git fetch --depth=1 origin 34a8662b
      git diff 4ec5f1a2...34a8662b

      976 files changed   (API had shown 300)
```

---

## 2. Where the change is

```text
card scripts (cardsfolder)      506
platform GUIs (not vendored)    126
other res                       111
forge-game   (RULES ENGINE)      78
forge-ai     (not vendored)      25
forge-core   (shared)            20
editions                         19
token scripts                     4
```

Over half of it is in modules Proxic does not vendor.

### Card scripts are mostly noise

```text
[RUN] git diff --name-status, cardsfolder/

      343  R100   pure renames, 100% similarity -- NO content change
      107  A      new cards
       54  M      genuine fixes to existing cards
        1  D      deleted
        1  R092   rename with a small edit
```

So of 506 touched files, **162 carry content** and 343 are file moves.

### None of them touches the Mechanics Lab corpus

```text
[RUN] cross-reference of 162 content changes against 303 corpus names
      (275 cards, plus both faces of split/DFC entries)

      CONTENT changes hitting the corpus : 0
      pure RENAMES hitting the corpus    : 0
```

Every card in the project's own test corpus behaves identically at both
commits.

---

## 3. The four APIs Proxic depends on

| File | Change | Verdict |
| --- | --- | --- |
| `CardDb.java` | **unchanged** | exact-printing lookup identical |
| `ManaPool.java` | **unchanged** | payment path identical |
| `PlaySpellAbility.java` | +1 −1 | trivial |
| `GameActionUtil.java` | +2 −2 | trivial |
| `CardView.java` | +16 −1 | visibility — see §3.1 |
| `PhaseHandler.java` | +20 −2 | priority loop — see §3.2 |
| `PlayerController.java` | +9 −0 | **surface grows — see §3.3** |
| `Card.java` | +123 −6 | `getAllPossibleAbilities` unchanged |

### 3.1 `canBeShownTo` changed, but not in a way that affects us

```text
[RUN] exact diff of the method:

      44a45,47
      >         case StickerSheets:
      >             // CR 123.2c
      >             return true;
```

One new zone case for a new mechanic. **Battlefield, Hand and Library
behaviour is untouched**, and `canFaceDownBeShownTo` is byte-identical.
The P0A-E analysis holds at both commits.

### 3.2 The AI-only loop guard is NOT fixed upstream

```text
[RUN] 2.0.15  line 1102:  } while (loopCount < 999 || !pPlayerPriority.getController().isAI());
      master  line 1117:  } while (loopCount < 999 || !pPlayerPriority.getController().isAI());
```

Identical. Finding §4.1 in the gate report is **how Forge works**, not
a bug awaiting an upstream fix. Moving to `master` would not remove the
need for our own loop guard.

`PhaseHandler`'s actual changes are a new undo-barrier system and a
stack trigger-repeat reset — neither affects the adapter.

### 3.3 `master` ADDS three abstract methods

```text
[RUN] abstract declarations in PlayerController
      2.0.15 : 110
      master : 113

+    public abstract Sticker chooseSticker(List<Sticker> options, Card target,
+            SpellAbility sa, boolean isOptional);
+    public abstract int chooseStickerNamePosition(Sticker sticker, Card target);
+    public abstract Card chooseCardToKeepStickers(CardCollectionView options);
```

**This corrects a claim in the gate report.** "`PlayerController` is
byte-identical between the two pins" is true of **old pin → 2.0.15**.
It is *not* true of **2.0.15 → master**, where the surface grows by
three sticker methods.

The cost is small — the adapter base is generated, so they would
arrive as loud stubs automatically — but it is work added, not saved.

---

## 4. Other findings

- **`GameType` gains `CommanderDraft`.** Still **no `TwoHeadedGiant`**,
  so 2HG remains unsupported at `master` too. The owner's decision to
  drop it is unaffected either way.
- **Stickers are a whole new mechanic** at `master` (`StickerSheets`
  zone, `Sticker` class, three controller methods, `CR 123`). Adopting
  `master` means adopting that surface.
- `forge-core/CardDb` and `ManaPool` are untouched, so the two
  subsystems where Phase 0A found real traps behave identically.

---

## 5. Conclusion

```text
Benefit of moving to master, identified:  none
Cost of moving to master, identified:     three more abstract methods
                                          plus a new mechanic's surface
Risk retired by staying on 2.0.15:        none that was found
```

The 107 new cards and 54 card fixes at `master` are real, and Open
Format allows any card — so one of them could matter to a deck someone
builds later. But **none affects the project's own test corpus**, and
the Forge update path (0B.14 / 0B.15) exists precisely to take those
improvements deliberately, with a compatibility suite, rather than by
pinning a moving target now.

**Recommendation unchanged, but now evidence-backed rather than
argued from principle: pin `forge-2.0.15` (`4ec5f1a2`).**
