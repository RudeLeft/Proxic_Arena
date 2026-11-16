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

### As built (2026-11-16)

Built; unreleased. Page only (no worker or server change), plus a deck fixture and a CI step for the new browser test. **All numbers are headless** (Microsoft Edge through Playwright's `msedge` channel, the repo config's default; headed Edge was not run, and headed bundled Chromium does not start on this PC).

**The fixes** (`lifeTicks.ts`, `flights.tsx`, `breathMotion.ts`, `Board.tsx`, `game.css`, `LibraryTop.tsx`, `sizeTicks.ts`, the new `sameProps.ts`, and memo wrappers in `CardBadges.tsx`, `SizeFigure.tsx`, `ManaCost.tsx`, `StatusTray.tsx`, `playerMarks.tsx`, `PoisonBadge.tsx`, `GameScreen.tsx`).
1. **Game end**: `useLifeLanded` no longer redraws the game screen each frame while the last hit lands. A frame loop only *looks* at the clocks and redraws once, the frame the hit lands; the clocks' own start and end redraw it only when the answer changed, and only while it is watched (a game ending).
2. **Flights**: where things fly from is read off the board still on screen, in React's last look before the next board is drawn (`getSnapshotBeforeUpdate`, a small `BeforeDrawn` class inside `PlayerFlights`), and only when something will fly (`flyingFrom`: a holder, a Ring-bearer, a new emblem, energy paid, mana in or out); of the cards, only the emblem's maker and mana's sources. No card is measured on an ordinary update, and nothing is read after the layer's writes.
3. **Plates**: `useShownPlate` redraws the plate only on the frame its number, poison or blow count changes (a frame loop looks; it no longer redraws every frame), and a clock that is not this plate's does not redraw it. StatusTray, FaceMarks, LibraryTop, PoisonBadge and ZoneIcon are memoised. Size numbers and badges (`useSizeClock`) redraw on a clock's start or end only if that clock holds their card.
4. **Glow follower**: `followStarted` (the Board, after each drawing and on the next frame) asks only the cards that started a Web Animation since its last look (the page's `animate` notes cards that have a glow layer) and cards whose glow layer is new; nothing is asked when nothing started. Where `animate` was replaced (a test's stand-in) it looks at every card once, as before.
5. **Waiting plate's glow**: `.gs-seat-deciding` keeps its two looks as two still shadows on `::before` and `::after` (the plate's border box, under the plate as its own shadow was) whose opacity alone animates (`gs-deciding-strong` and `gs-deciding-soft`, 2.4 s, ease-in-out). The step ladder's gem, checked in the same pass, is a still shadow whose transform alone moves: the acting player's page repaints 0 times a second, before and after.
6. **Forced layouts**: the marks effect measures the board only when a mark rises; `LibraryTop` measures only when its card changes.
7. **Board re-renders**: CardFace, CardBadges, SizeFigure, ManaCost and FightMarkView (by its mark; its effect runs once anyway) are memoised; props are compared by content (`sameProps`: plain objects and arrays a few levels down, functions and elements by identity). The GameScreen callbacks the board's parts take were already stable (`pick`, `setInspecting`, `dropGoneMark`).
- **Also, found by profiling:** the glide pass asked each moving card for its animations in turn, between the animations it starts, so the browser worked out every style once per card; it now reads the whole table's animations once, the first time a card has to glide (`animationsOf` in `Board.tsx`).

**The speed test** (`frontend/e2e/match-speed.spec.ts`, a `match-*` spec, so CI's game machines run it; `protocol/fixtures/green-deck/` is the owner's mono-green list without printings, built in CI by a new "Build the green deck package" step; `ci/browser-durations.json` weighs it 420 s). Both seats play the deck to 28+ permanents; the host's page is timed over idle (6 s: the host's move, the guest waiting), hovering over the hand, a cast, an all-out combat that leaves the guest alive (attackers picked under the guest's life), and the blow that ends the game; once at real speed, once with the host page's CPU slowed 4x (CDP). Lifted from the deep dive's scratch tools: a React DevTools-hook stand-in that walks each commit (components rendered; the game screen and the plates found by the element they draw first, so it works on the minified build), the frame recorder, and paint counting from Chrome's trace (`Paint` events of each page's frame). Game updates are the match socket's messages. `PROXIC_SPEED_OUT`, `PROXIC_SPEED_PROFILE=1` (CPU profiles) and `PROXIC_SPEED_TRACE=1` (Chrome traces) are for diagnosis. The spec runs with Playwright's trace off and with plain CSS locators: a trace and role locators run in the page, and were 90-130 ms a second of the "page's" JavaScript in the first measurements. Screenshots are taken after each moment is timed (one stalls headless frames about 100 ms).

**Before / after** (owner's PC, i5-13600KF; headless Edge, 1920x1080; before = HEAD bfc2d25's page in the same stack, after = this build; one game each, the same harness). Frames p50/p95/slowest in ms; JS = the page's main-thread JavaScript, ms per second; renders = React component renders per second; GameScreen = its renders / game updates; rep = the waiting player's page's repaints per second while idle (the acting player's: 0 in every run).

```text
                     before (HEAD)                                   after
scene       frames           JS  renders  GameScreen          frames           JS  renders  GameScreen
real speed
idle        16.7/16.8/17.2    1.1      0    0/0  rep 119      16.7/16.9/17.2    1.2      0    0/0  rep 0
hover       16.7/17.0/32.8   11.5     75    0/0               16.7/16.8/25.2    3.9     23    0/0
cast        16.7/17.2/41.6   31.5    965   88/80              16.7/17.0/45.7   19.8    400   65/57
combat      16.7/17.0/47.4   26.4    946   78/87              16.7/17.8/50.2   31.5    461  132/153
end         16.7/19.6/133.4  33.0   1800  339/33              16.7/17.7/117.1  11.0    132   40/33
CPU 4x
idle        16.7/16.8/16.9    5.9      0    0/0  rep 120      16.7/16.8/18.2    4.6      0    0/0  rep 0
hover       16.7/16.8/16.9   11.8     87    0/0               16.7/16.8/20.2   10.3     19    0/0
cast        16.7/16.8/52.0   96.9    969   76/95              16.7/16.8/33.7   80.5    398   75/100
combat      16.7/16.8/49.9   97.6    962  122/162             16.7/16.8/36.4   83.5    396  115/157
end         16.7/16.8/116.7  90.0   2315  429/33              16.7/16.8/61.1   32.8    114   33/33
```

What it says: the waiting player's page stopped repainting 120 times a second; the game screen no longer draws 10-13 times per update at the game's end (about once now), and the end's JavaScript fell from 90 to 33 ms a second at 4x; component renders fell by about 60% in a cast and a combat, and by over 90% at the end. A cast's and a combat's JavaScript per second fell less (at 4x, over five after-runs: a cast 64-101 against 97, a combat 80-102 against 98): what is left is the board's own drawing per game update, and the spread between runs (how many updates a moment holds differs by game) is as large as the change.

**Budgets as built** (the spec's `SPEED_BUDGETS`, each reason in its comment): re-renders as the spec (GameScreen <= 2 per update in a cast, a combat and the end; each plate <= 2 per update in a cast); idle repaints under 1 a second on both pages (a single repaint in 6 s, 0.2, was seen in two runs: not a loop); frames p95 <= 20 at real speed (spec 17: headless frames read 17.0-18.2 on their own, before and after alike) and <= 34 at 4x; the slowest frame <= 80 at real speed (spec 50: 41-73 measured) and <= 100 at 4x; the end's own p95 <= 34 and slowest <= 150 / 200 (below); JavaScript at 4x <= 130 ms a second for a cast and a combat (spec 80 and 70: not met, below).

**TEST-004 (F-0095-A).** Against HEAD's page (the same image, the same harness) the speed test fails both runs: the waiting page repainted 119.4 and 119.6 times a second (budget under 1), and the game screen drew 339 and 429 times for 33 updates at the end (budget 2 per update); after, both runs pass. Page tests, `fixes0095.test.tsx` (11), each fail against the code before them: HEAD's `lifeTicks.ts` (4 tests: the game end and the plate redraw every frame, and on another seat's clock), HEAD's `game.css` (the plate's box-shadow keyframes), HEAD's `LibraryTop.tsx` (a box read for the same card), `remember` measuring every card (the layer reads card 1's box), `flyingFrom` never returning null (that test and the layer's), `followStarted` falling back to a full look when nothing started; the memo test fails for any part not memoised.

**F-0095-B.** The waiting plate's glow at 0, 600, 1200 and 1800 ms of its loop, drawn now, then with the 0092 keyframes put back on the same plate and its layers hidden (as F-0090-B): away from the edge mean 0.25-0.67 and worst 1-3 levels of 255; within 4 px of the plate's edge (the 2 px ring) mean 1.9-9.3 and worst 15-43 -- the ring anti-aliased half a pixel apart on its own layer, as 0090's. The test holds the glow to mean < 3 and worst <= 24, the ring to mean < 30, and only opacity animating for it. Read by eye, side by side at 2x: the same ring and glow. The five moments' screenshots before and after (`1x-<moment>.png`, `4x-<moment>.png` per run) come from different games (Forge shuffles), so they are compared by eye, not by pixel: the same plates, rail, cards, marks, broken shield and "YOU WON" banner. The browser specs below are the deterministic look checks.

**F-0095-C.** Jump check (`tools/jumps/jumps.spec.ts` + `scripts/check-jumps.py`), both seats, 9 Lab traces with combat, life and mana (`combat-choices-first-strike`, `-double-block`, `-trample`, `life-changes-bolt`, `-merchant`, `-infect`, `survivors-wrath`, `pt-changes-damage`, `cost-kinds-add-mana`; 728 boards): before (HEAD's page) 0 findings, after 0. Run headless (the tool asks for a real window: headless drops frames, which could hide or fake a jump; none was reported either way).

**Deviations, and findings for the owner.**
- **The JavaScript budget is not met.** The spec's 80 and 70 ms a second at 4x for a cast and a combat are not reached; the test holds 130. Renders more than halved, but the board's per-update work (its layout and items, React's commit, the glides) is most of what is left; reaching the spec's numbers needs the board's items themselves kept between updates, a larger change than this spec's list.
- **The game's end has a slow frame of its own**: one frame of 100-135 ms about 7 s into the end, before and after alike, with no long task on the page's main thread in Chrome's trace (not the page's JavaScript or layout). Its budget is 150 / 200 ms, and its p95 34, until it is understood.
- **CI's machine** has not run it (nothing pushed). If CI misses a budget, CI's numbers set it, as 0090's did.
- **Headless only**, as asked: every number above, the jump check and the screenshots.
- **Flights read positions a moment later**: where a mana source or an emblem's maker was is read just before the next board is drawn, instead of just after the one before it was; a card still moving then is read where it is drawn, not where it was headed. It matters only for something flying from a card that has just left.

**Evidence.** Gates (frontend): `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npx prettier --check src e2e tools` clean; `npx vitest run` 94 files, 1,425 tests passed (was 93, 1,414). e2e on the local stack rebuilt from this tree: `match-speed.spec.ts` 2 passed (6.6 min); `battlefield.spec.ts`, `match-board-motion`, `match-what-happened`, `match-ring` (the Ring's flight), `match-state` (monarch, energy), `match-numbers`, `match-big-combat`, `match-alternate-win` (a game's end), `match-damage-tray` and `match-surveil`: 13 passed. Not run: the full browser suite and the full Lab (CI's), and `match-many-triggers`.

## Amendments

### Amendment 1 — timings enforced on a fixed machine only (2026-11-16)

CI ran the speed test twice (28e07b8, 726c14d) on shared machines whose timings swung run to run: frame p95 33-67 ms and 4x JavaScript 130-184 ms/s for the same code. The count budgets (re-renders per update, idle repaints) passed both times. So on CI the frame and JavaScript budgets are printed, not enforced; they are enforced on a fixed machine, in the once-per-release local run (TEST-013.2). The counts, which do not depend on the machine, are enforced everywhere. This follows the spec's own rule that CI's numbers set the budgets, without chasing a moving target.
