# 0095 — Snappy frames: less work per game update, and a real-game speed test

**Status:** Approved 2026-11-16 (owner, by prompt, after the frame-rate deep dive of 2026-11-16; no look changes, so no canvas).
**Owner decision:** **fix causes 1-6 and 7 (the bigger one), plus a real-game speed test**.

From the owner's list of 2026-11-16, item 3: "I have noticed some frame rate drops since the last couple of updates … the game needs to be very snappy."

## Why (measured)

Real two-player games on the owner's PC (i5-13600KF, RTX 3060 Ti), headed Edge at 1920x1080, 1.67.0 against 1.70.0 served to the same server. At real speed both hold 60 fps (p95 16.8 ms) apart from single hitches; but 1.70.0 does about twice the page work per game update. With the CPU slowed 4x (a slower laptop), combat JavaScript went from 45-59 to 81-129 ms/s and the slowest frame from 33 to 67 ms; re-renders in combat from about 400-580/s to 1,450-2,000/s. Scratch tools and results: the deep dive's `scratchpad\fps\`.

## Built

1. **Game end** (0089, `lifeTicks.ts` ~256-277 `useLifeLanded` in `GameScreen`): GameScreen no longer re-renders every frame while the last hit lands; the moment is computed once (a small leaf or one timer).
2. **Flight measuring** (0086, `flights.tsx` ~242-257, `remember` ~638-674): stop measuring every card on every update; measure only what can fly, or use the board's known layout boxes; all reads before writes.
3. **Plate redraws** (`useShownPlate`, `SeatBlock`): only the counting number follows the life clock; StatusTray, FaceMarks, LibraryTop, ZoneIcon and the like are memoised with stable props.
4. **Glow follower** (0090, `Board.tsx` ~7720-7728, `breathMotion.ts` ~41-70): runs only for animations started this draw; no extra next-frame pass when nothing started.
5. **Waiting plate glow** (`.gs-seat-deciding`, `game.css` ~137-152): two still shadows with only opacity animated, as 0090 did for the breath; the step-ladder dot's glow checked in the same pass.
6. **Forced layouts**: the marks effect (0085, `Board.tsx` ~4363-4390) and `LibraryTop.tsx` ~160-170 return early before measuring.
7. **Board re-renders**: CardFace, CardBadges, FightMarkView, ManaCost, SizeFigure and the like memoised with stable props; stable callbacks from GameScreen, so a change elsewhere doesn't redraw every card.

Nothing looks different (TEST-006 still applies: before/after screenshots compared as in F-0090-B).

## Real-game speed test

A browser spec plays a real game (the mono-green deck) to 28+ permanents and times five scenes — idle, hand hover, cast, all-out combat, the game-ending blow — once at real speed and once with the CPU slowed 4x (CDP). Budgets (set from CI's own first run if it differs, as 0090 learned):
- frames: real speed p95 ≤ 17 ms, worst ≤ 50 ms; 4x p95 ≤ 34 ms, worst ≤ 100 ms;
- main-thread JavaScript at 4x: combat ≤ 70 ms/s, cast ≤ 80 ms/s;
- re-renders: GameScreen ≤ 2 per game update; SeatBlock ≤ 2 per update outside a life count;
- idle repaints: 0 per second for both the acting and the waiting player.
It runs in CI's browser tests and in the once-per-release local run.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0095-A | The real-game speed test passes its budgets; before (HEAD) it fails at least the re-render and idle-repaint budgets | browser test; numbers in As built |
| F-0095-B | No look change: screenshots of the five scenes before/after match (as F-0090-B) | browser test |
| F-0095-C | No new jumps: jump check before/after on the Lab traces | jump check |

## Amendments
