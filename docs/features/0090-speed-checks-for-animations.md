# 0090 — Speed checks for Phase 10's animations

**Status:** Approved 2026-11-13 (owner, by prompt: improvement 5 of "Phase 10 deep dive 2.md", "5 · Speed checks"; no look changes, so no canvas).

Phase 10 A-22, second deep dive, improvement 5.

## Why

The speed test (/dev/bench) times only a row re-centring; none of Phase 10's effects are timed. The "you can pick this" glow animates a shadow on every card it marks, so each frame is redrawn. Every flyer bobs all the time. A big board (a 31-card Wrath of God, 20 hovering Faeries, a day/night wash, a whole army able to attack) could stutter on a mid-range laptop exactly when the most is happening.

## Built

1. **Bench scenes.** The speed test gains the Phase 10 moments:
   - a 31-card board wipe;
   - a 64-token wave (0089);
   - a 10-creature combat with first strike;
   - 20 flyers;
   - the day/night wash;
   - a full "you can pick this" army;
   - storm ×N;
   - a report window gathering several reports (0088).

   Each records frame times. The test fails if the slowest frames pass an agreed budget on CI's machine, set from a first measured run and recorded here.
2. **Cheaper glow.** The "you can pick this" breath animates only the opacity of a soft layer, never a shadow, so it is cheap to draw. The look stays the same, checked by screenshot.
3. **Calmer flyers.** Flyers stop bobbing while the tab is hidden, and when more than about 12 are on the table they bob in step on one shared clock.
4. **Every animation stays on the board's clock.** A click hurries it, and with reduce motion it is skipped, as A-00 requires.

No new looks. What the player sees does not change, except smoother frames.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0090-A | Bench scenes run in CI and record frame times; budget set and enforced | bench test; CI |
| F-0090-B | The glow looks the same (screenshot compare) and animates opacity only | page test; screenshot |
| F-0090-C | Flyers pause when hidden; in step above 12 | page test |

## Amendments
