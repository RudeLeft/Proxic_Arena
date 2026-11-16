# 0096 — The board keeps its cards between game updates

**Status:** Approved 2026-11-16 (owner, by prompt: "Commit now, follow-up later", after 0095's measurements; no look changes, so no canvas). To build after 0093 and 0094.

The follow-up to 0095. From the owner's list of 2026-11-16, item 3 ("the game needs to be very snappy").

## Why (measured in 0095)

After 0095, renders fell by about 60% in a cast and a combat and by over 90% at the game's end, but a cast's and a combat's page JavaScript at 4x CPU (a slower laptop) stays at 64-102 ms a second against 0095's target of 70-80: the Board rebuilds every card's item from the whole snapshot on every game update (`fromSnapshot`, layout, the per-card derivations in `Board.tsx`), even for cards that did not change. 0095's speed test holds 130 ms a second until this is done.

## Built (to be confirmed by the builder's own measurements)

1. Per-card derived data (face, badges, marks, layout box) is kept between updates and recomputed only for cards whose snapshot data changed; unchanged cards keep the same objects, so 0095's memoised parts skip them.
2. Layout reuses unchanged lines (a line whose members and sizes are unchanged keeps its boxes).
3. 0095's speed test budgets for cast and combat at 4x return to 0095's targets (JavaScript ≤ 80 / 70 ms a second), set from CI's numbers if they differ.

Nothing looks different; no new jumps.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0096-A | The speed test passes with cast ≤ 80 and combat ≤ 70 ms/s JavaScript at 4x; before (HEAD) it fails them | browser test; numbers in As built |
| F-0096-B | No look change; no new jumps | screenshots; jump check |

## Amendments
