# 0094 — Hovering a hand card shows the whole, readable card, lifted clear of the fan

**Status:** Built 2026-11-16, unreleased. Approved 2026-11-16 (owner, by prompt, on the canvas "Owner list 2026-11-16", https://claude.ai/artifact/Ky53Huv37tXYsLXWLqDMZq, section 6).
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

## As built (2026-11-16)

**Geometry (`frontend/src/battlefield/motion.ts`).** `HAND_ZOOM`,
`handZoomBox` and `opponentRevealBox` are gone. `HAND_READ` = 2.6,
`HAND_RISE` = 0.1, `READ_GAP` = 10/1080 of the board height.

- `handRiseBox(rest, g, side)`: the pointed-at hand card where it was, tilt
  and all, 0.1 card height up (the other player's: down), drawn over its
  neighbours (z + 1000). Nothing else about it changes, so every card along
  the hand stays under the pointer.
- `handReadBox(rest, g, side, keep, lift)`: upright, 2.6x (253.4 x 354.8 at
  1920x1080, 337.9 x 473.1 at 2560x1440). Its bottom is `READ_GAP` above the
  highest of the risen card's drawn corners and the hand's resting top
  (`handTop`), whichever is higher; centred on the middle of the card's top
  edge as drawn; clamped to the play area (`inset` on the left,
  `max(inset, keepRight)` on the right, so it stays clear of the pile fan).
  `lift` is 0061's discard pick (0.08 card height, the `.bf-picked`
  translate), so a picked card keeps the gap too. For the other player it
  mirrors: its top `READ_GAP` below their fan's lowest corner.

**Board (`Board.tsx`).** The hand card uses `handRiseBox`; a memoised
`reading` (only `pointed`, the hand, `act`, the costs and `keepRight` feed
it) draws one `ReadingCard` (`memo` + `sameProps`) in `.bf-cards` after the
slots, at its real size (a translate, not a scale, so the scan is sharp),
`--card-h` set to its own height so the marks scale with it. It holds
`SharpCard` (the table copy, then the close-up once whole); a card with no
picture shows its table face, scaled. `aria-hidden`, `data-reading`,
`pointer-events: none` on it and everything in it. Marks: `act()`'s classes
(`bf-choosable` with a `Breath` layer, `bf-unpayable`, `bf-picked`,
`bf-pay-picked`), the pay sign or the seen eye (top-left; bottom-left for
theirs), and 0058's cost now in a chip over the printed cost's corner only
when Forge's cost differs (the scan shows the printed one). Keyboard focus
shows it (the hand card's own focus handlers). The board's `at()` answers a
pointed hand card with the reading card's box, so `castFrom` captures it and
`CastingCard` rises from there. A pointed card that leaves the hand stops
being pointed (it waits for the pointer if it comes back). Hovering redraws
what it did before (the `pointed` state already drove the hand's boxes); the
reading card is one extra memoised element.

**CSS (`battlefield.css`).** `.bf-read`: a 250 ms settle (`SETTLE_MS`: opacity and a
0.04-card-height drop) only under
`prefers-reduced-motion: no-preference`; under reduce, no settle and the
playable glow is the steady ring.

**Land row (0093).** The reading card sits in the band just above the fan
(y 625-980 at 1080), and from about x 542 the land row stands in the same
band, so while hovering it can cover lands, a land row reaching right over
the hand most of all. It can't be clicked, so it never takes a click from a
land; it goes when the pointer leaves the hand. The act button (x 1647+ at
1080) is right of the play area and never covered (the real game measured
it each card).

**Tests.**
- `motion.test.ts`: rise only; reading box 2.6x, upright, clear of every fan
  card's drawn corners by `READ_GAP` (and not far above), inside the play
  area and the fan's `keepRight`, centred unless clamped; 1, 7, 12 cards; 4
  sizes; the size at 1080 and 1440; the discard lift; theirs below their fan.
- `fixes0094.test.tsx` (the real game screen): along a 7-card hand at
  1920x1080 and 2560x1440 the whole scan, 2.6x, above the fan, the card
  risen 0.1; no button in it; focus shows it; it goes with its card; cost
  now, playable glow, discard pick, seen eye (F-0094-A, C).
- `fixes0071.test.tsx` F-0071-B: their revealed card now comes down a little
  and its reading card shows below their hand.
- `battlefield.spec.ts`: the hover check is now the rise and `handReadBox`
  to 0.1 px; a new sweep along the hand at 1920x1080 and 2560x1440 (every
  card: `handReadBox` to 0.1 px, the pointer still on the card by
  `elementFromPoint`, `pointer-events: none`, clear of the fan).
- `match-reading-card.spec.ts` (TEST-012): a real game; the real mouse slides
  along a 7-card hand (each card: the whole picture loaded, card-shaped; the
  pointer on the card; no hand card and no act button covered), plays a
  Forest, and clicks Birds of Paradise: the casting card's first frame is
  the reading card's box (to 0.02 px), F-0094-B.
- Bite tests (TEST-004): reading box half a card lower (over the fan) -
  motion.test and both F-0094-A page tests fail; the reading card without
  the hand card's marks - the playable and discard tests fail; `at()`
  without the reading card's box - the real game fails, the cast rising
  258 px lower (from the fan).
- Other real-game specs, local stack, bundled Chromium headless:
  match-cast-landing and match-lands-stay-put pass. match-speed: its
  re-render, JavaScript and repaint guards pass; only frame p95 misses
  (1x combat 50.1 and end 50 > 40) fail -- and they fail the same way on a
  build of main without 0094 (1x combat/end p95 50; 4x combat 49.9, slowest
  166.7; 4x end p95 83.4), so they are this browser's 16.7 ms frame steps
  (the budgets were set on headless Edge), not this spec. Its hover scene:
  no game update, no GameScreen or plate render; renders per second 27.5-41.9
  at 1x (10.3 without 0094) and 30.4 at 4x (17.6). Pointing at a card was
  already one Board render (the `pointed` state); the extra are (1) more
  cards really pointed at -- the old 2x zoom stayed under the pointer and
  skipped its neighbours -- and (2) the reading card's own small parts
  (ReadingCard, SharpCard and its sharp copy arriving, the glow, the sign)
  for each card. Not measured apart; no extra Board render per pointing.- Clip: `Arrow videos/0094/0094-reading-card-slide-and-cast.webm`, the
  player's seat, normal speed: sliding along the hand, the Forest, the cast.
  The local stack's card pictures are plain coloured stand-ins, so the clip
  shows the reading card's place and size, not real printed text.
## Amendments
