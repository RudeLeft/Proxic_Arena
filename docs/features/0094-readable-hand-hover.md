# 0094 — Hovering a hand card shows the whole, readable card, lifted clear of the fan

**Status:** Approved 2026-11-16 (owner, by prompt, on the canvas "Owner list 2026-11-16", https://claude.ai/artifact/Ky53Huv37tXYsLXWLqDMZq, section 6).
**Owner decision:** **A · whole card, 2.6x, lifted clear**.

From the owner's list of 2026-11-16, item 6.

## Why (researched)

- Today the hand card itself grows to 2x (`handZoomBox`, `motion.ts` ~907-923, `HAND_ZOOM = 2`) on top of the fan. It shows the table face — name, art, type line — with no rules text (owner decision 2026-10-20: "the whole card is for inspect"), so a player must right-click to read it.
- At 1080 the 195-px zoom covers 70 of the next card's 76-px strip, so sliding along the hand skips cards.
- The full scan already exists for every hand card (`card.art`, and `SharpCard` used by the close-up and W-20's readable stack card).

## Built

1. **A reading card.** Pointing at (or keyboard-focusing) a hand card shows the **whole printed card** (`SharpCard`) at **2.6x** card size (about 254x355 px at 1080, 338x473 at 1440), upright, its bottom 10 px (scaled) above the top of the fan, centred on the card and kept inside the play area and clear of the pile fan.
2. **It can't be clicked or pointed at** (`pointer-events: none`, hidden from screen readers; the hand card keeps its own label). The hand card itself only rises a little (about 0.1 card height) to show which one you're on, so every card stays under the pointer as you slide along.
3. **Marks carry over**: 0058's "cost now" chip, the playable glow, pay sign, seen eye and 0061's discard-pick outline show on the reading card.
4. **Casting**: a click on the hand card casts as today; the casting card rises from the reading card's box (`castFrom`), not from the fan. The reading card goes when its card leaves the hand.
5. The other player's revealed hand cards use the same reading card, under their hand.
6. Reduce motion: it appears without a settle.

This amends the 2026-10-20 decision for the hand's hover only (the table still shows the table face).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0094-A | Hovering each card along a 7-card hand: the reading card shows the full card and covers none of the fan; the pointer stays on the hovered card | page test; real-game test (TEST-012); battlefield sweep at 1920x1080 and 2560x1440 |
| F-0094-B | A click casts; the casting card rises from the reading card | real-game test; clip |
| F-0094-C | Marks (cost now, playable, discard pick) show on the reading card | page test |

## Amendments
