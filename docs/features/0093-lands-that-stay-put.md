# 0093 — Lands that stay put when tapped, nearer the hand

**Status:** Approved 2026-11-16 (owner, by prompt, on the canvas "Owner list 2026-11-16", https://claude.ai/artifact/Ky53Huv37tXYsLXWLqDMZq, sections 2 and 4; section 4 redrawn twice at the owner's request).
**Owner decisions:** section 2 **C · tapped lands glide to the end; tidy up at your untap**; section 4 **L-1 · the row grows left from the edge of a 7-card hand**.

From the owner's list of 2026-11-16, items 2 and 4. Players complained that tapping a land makes the lands jump away from where they were clicking.

## Why (researched)

- Tapped is part of a pile's identity (spec 0036; `layout.ts` ~376-398), so tapping one of three Swamps splits the pile; the untapped Swamps re-form a new pile at the next member's arrival position. At 1920x1080, with Swamp, Island, Swamp, Dismal Backwater, Plains, Swamp, Island, tapping the first Swamp moves the two untapped Swamps 214 px right, past the Islands, and Backwater and Plains 113 px. A second click on the same spot hits the tapped Swamp.
- Any tap also shifts everything to its right by 11.5 px (the leaning card's extra room, `planLine` ~526-532).
- A land picked to pay (0070) leaves its pile too (`pileKey` ~419), so the jump starts before anything taps.
- The land row starts at the table's left edge (x 3.75 at 1080) while the hand is centred: about 615 px of mouse travel at 1080, 820 at 1440.

## Built

1. **Where lands go (L-1).** Each side's land row grows **leftward from a fixed spot**: the left edge of a 7-card hand (x ≈ 542 at 1080, 723 at 1440, scaled by height). The first land played sits just left of that spot; each new land takes the next space to the left. The spot never follows the live hand, so drawing or playing a card moves no land. The opponent's row mirrors this at the top. Other permanents that share the land line (0059) start just right of the spot and go right, so they never push a land.
2. **Tapping moves only the tapped card (C).** Every slot keeps room for a lean, so a lean never shifts its neighbours. A land that taps, or is picked to pay, glides to a tapped group at the **far (left) end** of the row; every other pile keeps its place, so the next untapped copy is under the pointer where the last one was. A pile that empties keeps its place held (like 0079's held places) until the tidy-up.
3. **The tidy-up.** At that side's untap step, the row re-packs once into arrival order — when no one is clicking.
4. **Taking one back while paying (0070)** is a click on it in the tapped group.
5. Both seats; a click hurries everything (A-00); reduce motion: the tapped card moves without gliding.

This amends 0036 (tapped is part of a land pile's identity — kept, but the tapped group lives at the row's end), 0040 (lands start at the left edge), 0059 (shared lines) and 0070 (a picked land stands apart — now at the row's end). Each gets an amendment note pointing here.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0093-A | 3 Swamps, 2 Islands, Backwater, Plains: tap each Swamp in turn at the same pointer spot — each click taps an untapped Swamp; no untapped pile moves more than 0 px | page test; real-game test (TEST-012) |
| F-0093-B | The tapped group sits at the far left; at the untap step the row re-packs once | page test; clip |
| F-0093-C | The first land sits just left of the 7-card-hand spot and later ones go left; drawing and playing cards moves no land; opponent mirrored | page test; battlefield sweep at 1920x1080 and 2560x1440 |
| F-0093-D | Picking and un-picking a land to pay (0070) moves only that land | page test |

## Amendments
