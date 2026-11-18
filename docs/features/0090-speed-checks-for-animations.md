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

### As built (2026-11-15)

Built as approved; unreleased then (released in 1.70.0; noted 2026-11-18). Page only: no worker or server change.

**Bench scenes (F-0090-A)** (`benchScenes.ts`, `benchBudgets.ts`, `DevBenchPage.tsx`, `e2e/bench-scenes.spec.ts`).
- `/dev/bench?scene=<name>` draws a scene's first board ("Show board"), then "Play" sends the moment's boards at their times and records every frame interval over the moment's length (`window.__bench.scene`). The real Board draws them, with the game screen's own styles (`game.css`) and pictures the size of the server's 384-wide copies; the report window is the real `RevealTray`. The scenes: **wipe** (31 creatures, 16 yours and 15 theirs, none piled, all to their graveyards in one update: the flash, Shatter, Glide); **tokens** (64 Goblins in one update after Krenko's ability: eight waves of 8, 0089); **combat** (5 attackers, 5 blockers; a first-strike wave in which three blockers die, then the regular wave 0.4 s later, played after it); **flyers** (20 that fly, 10 a side, 3 s of hovering); **wash** (day to night over 40 permanents); **army** (30 of your creatures, 6 of them flyers, all "you can pick this"); **storm** (Grapeshot x10: the worker's own board shapes through the page's own parser, `boardFromSnapshot`: copies counting up beside it, landing as x10, three resolving); **reports** (five reports, one every 0.6 s, gathering as rows, 0088). The row re-centring speed test (`/dev/bench` without `scene`) is unchanged.
- `e2e/bench-scenes.spec.ts` is in the browser suite's "other" project, so CI runs it (headless, its bundled Chromium) on every run. Each scene is played 3 times at 1920x1080; it records every frame interval, the long tasks and the page's main-thread work (CDP `Performance.getMetrics` TaskDuration, in ms per second of the moment), and fails if the 95th-percentile frame passes 50 ms or the slowest frame passes 250 ms (`BUDGETS`). `PROXIC_BENCH_OUT` writes every frame time with the machine named; `PROXIC_BENCH_CPU=4` slows the page's CPU four times (CDP), as a slower laptop would run it.
- **Item 4, the board's clock**, checked on the same scenes by the same spec: a key pressed while each moment plays (the wipe, the tokens, the combat's fights, the wash, the storm, the reports) leaves no animation that was then running with more than 20 ms to go 160 ms later (A-00's 100 ms hurry; 218 animations hurried in the wipe, 139 in the tokens, 102 in the combat); with reduce motion no scene starts a looping animation or anything that moves for more than 300 ms (a damage number that stays put and fades, A-13's reduce-motion look, is not motion). No change was needed: every Phase 10 movement these scenes play was already on the board's clock.

**Budget, and the first measured runs** (`docs/testing/evidence/0090-bench-scenes.json`; machine: the owner's PC, i5-13600KF, 20 threads, 34 GB, Windows 11; browser: Microsoft Edge through Playwright's `msedge` channel; 1920x1080; 3 runs a scene). Before = HEAD 630948c's board and styles with the new bench page; after = this build. Frame interval p95/slowest in ms, then main-thread work in ms per second (mean of runs 2 and 3):

```text
              headed (a real window)          headless                        headless, CPU slowed 4x
scene         before         after            before         after            before           after
wipe          16.8/16.9  60  16.8/16.9  58    16.8/17.3  64  16.8/19.3  60    16.9/83.4   432  16.8/133.4  440
tokens        16.8/17.0  64  16.8/17.2  62    16.9/34.6 124  20.3/51.3 137    16.8/133.3  488  16.8/116.7  479
combat        16.8/17.3  38  16.8/18.0  42    16.9/50.9  78  17.3/51.1  92    16.8/100.0  284  16.8/66.7   298
flyers        16.8/17.1  56  16.8/17.4  48    16.8/50.5  76  18.1/39.1 102    16.8/17.6   351  16.8/17.2   372
wash          16.8/16.9  18  16.8/17.4  20    16.9/33.3  29  19.0/34.8  44    16.8/17.3   112  16.8/17.5   132
army          16.8/17.0  99  16.8/16.9  72    16.8/34.0 154  17.2/50.6 126    16.8/33.4   670  16.8/49.9   486
storm         16.8/17.1  76  16.8/17.2  80    16.8/35.1 118  16.9/32.1 120    16.8/33.5   512  16.8/33.8   528
reports       16.8/17.1  18  16.8/17.2  22    16.9/33.1  44  19.7/32.7  42    16.8/17.6   114  16.8/16.9   144
```

What it says: on this machine every scene keeps 60 fps in a real window, before and after. The glow's saving shows in the main-thread work of the scene it is in: the army, 99 to 72 ms a second (-27%) headed, 670 to 486 (-27%) with the CPU slowed 4x. Elsewhere the after numbers are within run-to-run spread (headless frames jitter on their own, BATTLEFIELD_RENDERING.md §6). The budget (p95 <= 50 ms, slowest <= 250 ms) is set from these runs: about 3x the slowest p95 and 2x the slowest single frame measured (133 ms, CPU slowed 4x), so it fails a moment that really stutters, not headless jitter.

**Cheaper glow (F-0090-B)** (`Breath.tsx`, `breathMotion.ts`, `Board.tsx`, `FanCards.tsx`, `LibraryTop.tsx`, `GameScreen.tsx`, `game.css`).
- The breath was the card's own `box-shadow`, animated (`gs-breathe`), so every marked card was repainted every frame. Now the card keeps the breath's still part, its drop shadow, and a soft layer drawn right after it in its place (`.bf-breath`, the card's box: a shadow is drawn only outside a box, so it lies over the drop shadow and never over the card, as the animated shadow did) carries the glow in two halves -- the dim look (the old 0% and 100%) and the bright look (the old 50%) -- whose **opacity alone** animates, one fading out as the other fades in (`gs-breathe-dim`, `gs-breathe-bright`, 1.8 s, ease-in-out, as before). A card clips what it holds, so the layer is its sibling: table cards, hand cards, stack cards, fan cards (0087), side tabs (in the tab's place), the library's top card (0088) and the cards of a "looking" window; the life banner (as a target) and a zone tray's nameable card hold the two halves in their own `::before` and `::after`. The old keyframes are gone.
- **Kept exactly where the CSS before 0090 had it:** the breath stood in for any other shadow and CSS animation of the card (a pull's pulse, a chain's clink, an attacked card's red glow) and still does; a card picked, marked or picked to pay held still -- except a flyer, whose hover and breath went on when marked or picked (a higher-specificity rule) -- and so it is now (`act().breathing` and `still`); a flyer's glow layer wears the flyer's hover classes and point in the bob, and breathes from the same offset the card's one animation list gave it; a targeted life banner shows its own glow, not the breath; reduce motion: no layer, the same still ring as before.
- **It goes where its card goes.** The card's own Web Animations (a flip, a fighter's lunge, a shake, a merge) are played on its glow layer too, from the same moment and at the same speed (`followCards`, run by the Board after every drawing and once more on the next frame), keeping only movement (transform, translate, rotate, scale, opacity, filter); a click hurries both alike. *As of 2026-11-17 (a documentation check): since spec 0095 the Board runs `followStarted` (`breathMotion.ts`), which follows only the cards that started moving (and cards whose glow layer is new) and does nothing when none did; it looks at every card with `followCards` only where the page's `animate` cannot be watched (a test's stand-in) (code: frontend/src/battlefield/breathMotion.ts:120-144, Board.tsx:8208-8219; corrected 2026-11-18).*
- **Screenshot compare** (bench-scenes.spec.ts, F-0090-B): the army scene's cards frozen at 0, 450, 900 and 1350 ms of the breath, drawn now, then with the old keyframes put back on the same cards and their layers hidden. Away from the card's edge (the glow) the two differ by 0.17 / 2.29 / 0.76 / 2.29 levels of 255 on average, at most 6 / 18 / 9 / 18; along the edge (2.5 px either side: the 1.5 px ring) by 13-23 on average. Read by eye at 4x (`Arrow videos/0090/glow-before-and-after-zoomed.png`): the same ring and glow; the ring sits about half a pixel further out at its anti-aliased edge. Every geometry tried for the layer (its size, a border like the card's, its own compositing layer, insets of ±0.5 and 1 px, the layer under the card) matched no closer. The test holds the glow to < 3 on average and <= 24 at worst, the ring band to < 30 on average. And every animation on a breathing card or its layer, other than a flyer's hover, animates opacity and nothing else (asserted from the browser's own keyframes).

**Calmer flyers (F-0090-C)** (`breathMotion.ts`, `Board.tsx`).
- More than 12 (`FLY_SYNC_AT`) flyers on the table: every hover (the card's, its shadow's, its glow layer's) loses its own offset and runs on the page's timeline from its zero (`bobInStep`), so all are at the same point of the bob. They stay in step until no flyer is left (coming out of step would jump every one of them).
- The tab hidden (`visibilitychange`): every hover pauses; shown again, they go on (and back in step). The glow's breath is not a hover and is left alone.

**Tests.** Page: `fixes0090.test.tsx` (18): every scene, its shape and budget (the wipe's 31 unpiled cards, 64 tokens, 10 fighters with a first-strike wave then the regular one, 20 flyers over the threshold, the wash, the whole army choosable, the storm's x10 from the parser, the reports' rows 0-1-2-3-3, each scene recording past its last board); the keyframes animate opacity only and hold the two old looks; the glow layer after a choosable card and none for one picked, marked or paying; a marked flyer still breathing, with its hover classes and offsets; hand, stack and tab layers, the tab's in its place; the layer playing its card's movements (frames, timing, start, speed, cancel; a CSS hover left alone); the Board calling it; reduce motion; 12 flyers each their own, 13 in step, staying in step, their own again only after none; `bobInStep`, `pauseFlyers` and the Board doing both. Browser: `bench-scenes.spec.ts` (11 tests).
- TEST-004, page: 41 mutations each fail a test (no layer on a table card, a marked card breathing, the flyer exception dropped, a paying card breathing, no `bf-breathes`, the tab's layer missing or out of place, hand and stack layers missing, a flyer's layer without its classes or its breath offset, the Board not following, the mirror not from the same moment / copying a shadow / outliving its card's animation / ignoring its speed / mirroring a CSS hover, the threshold 20, in step at 12, not sticky, sticky forever, in step keeping own offsets, `bobInStep` touching the glow or doing nothing, no pause, no resume, the Board not listening to the tab or not back in step, keyframes animating a shadow, the bright half's shadow wrong, reduce motion keeping the layer, the still shadow outside the motion query, the nameable card's shadow, a wipe of 30, 63 tokens, no first strike, 12 flyers, the army not all choosable, the storm landing one copy short, reports not gathered, a scene ending before its moment). Two first came back NOT APPLIED and NOT CAUGHT because the mutants themselves were wrong (prettier's line breaks; a loop change that still reached x10); rewritten, both caught.
- TEST-004, browser: against HEAD's page (served by the same image), F-0090-B fails (the breathing card animates `box-shadow`) and F-0090-C fails (20 flyers 970 ms apart in the bob); against this build both pass. The phase check first read the bob's local time, which ignores each flyer's offset, and so did not catch HEAD at that step: it now reads the iteration's progress. The reduce-motion check first failed this build on combat's damage numbers (`bf-number-still`, a still number fading for 1 s, the designed reduce-motion look): it now counts only animations that move something. The budget is enforced: with the army's slowest-frame budget set to 15 ms the scene fails.

**Deviations.**
- **CI's machine.** The spec sets the budget "from a first measured run on CI's machine". Nothing is pushed here, so CI has not run it; the budget is set from the runs above on the owner's PC (headed, headless, CPU slowed 4x), with the margins stated. The first CI run after commit is the first measurement on CI's own machine; if a scene misses there, those numbers are the ones to set the budget from.
- **"The look stays the same, checked by screenshot":** the glow matches within a few levels of 255; the 1.5 px ring is anti-aliased about half a pixel differently at the card's edge (above). To the eye at normal size it is the same (the clips and the zoomed comparison).
- **Kept as the CSS before 0090 had it, though probably never meant:** a marked or discard-picked flyer kept hovering and breathing, and a choosable card's pull pulse (A-08) and chain clink (A-17) did not play while it breathed. No look changes are allowed, so they are kept.
- **In step, once.** When the 13th flyer arrives, every flyer's hover moves to the shared point of the bob in one frame (at most 0.03 of a card's height, about 4 px at 1080); after that they stay in step.

**Evidence.**
- Gates (frontend): `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npx prettier --check src e2e tools` clean; `npx vitest run` 91 files, 1,398 tests passed (was 90 files, 1,380). ESLint first failed on `e2e/benchmark.spec.ts`: the new spec declared `window.__bench` with its own shape and the two global declarations clashed; the new spec now reads it through a cast. Worker and server not touched.
- e2e on the local stack rebuilt from this tree (`docker compose ... up -d --build --force-recreate arena-server`): `battlefield.spec.ts` and `bench-scenes.spec.ts` 15 passed; the real-game specs that touch what changed (the breath, flyers, tabs, the library top, the looking window, the fan) -- match, match-ability-menu, match-big-combat, match-board-motion, match-card-name, match-card-trays, match-cast-aside, match-cast-landing, match-casting-dock, match-damage-tray, match-interaction, match-numbers, match-sacrifice, match-stops, match-surveil, match-watching, match-what-happened, match-window, match-state, match-face-down, match-loyalty: 22 passed, 1 skipped (match.spec's abandon test, as before). match-many-triggers not run (not to be touched). `bench-scenes.spec.ts` again after the ESLint fix: 11 passed.
- Jump check (local stack, both seats, 16 Lab traces chosen for big boards and Phase 10 moments -- the six wipes, first strike, double block, trample, storm and split storm, daybound, Holy Day, Krenko, umbra, Scute Swarm; 2,181 boards): before (HEAD's page, the same image) 2 findings, after 2 -- the same two, both seats of `shapes-daybound` board 21 (Reckless Stormseeker to Storm-Charged Slasher, "changed form, no animation"), which this spec does not touch.
- Clips (`Arrow videos/0090/`, 1920x1080, normal and quarter speed, each with a stills folder every 100 ms of game time; before = HEAD's page, after = this build): `bench-army`, `bench-flyers`, `bench-wipe` (the bench's 31-card wipe) and `lab-wrath-of-god` (the Lab's Wrath of God: 27 permanents, 15 die; Alice's and Bob's screens). I read every clip's frames at 10 per second of game time, before and after side by side: the same wipe flash, cracks and glides; the army breathing alike; the flyers hovering alike; the Lab's Wrath the same on both screens, the Darksteel survivor's dome included.

### Budget from CI (2026-11-16)

The 50 ms p95 budget, set from the builder's runs, failed CI on 2b0a1a8 (the 1.70.0 version commit): headless CI frames come in 16.7 ms steps and measured 50.1 ms for wipe, wash and army and 66.7 ms for storm, so 50 sat exactly on the three-frame line. As this spec says, CI's numbers set the budget: p95 is now 100 ms (six frames) for every scene, which still fails a scene running at half speed or worse; the slowest-frame budget stays 250 ms. The owner's PC measured 66.7-83.4 ms headless in the 1.70.0 local run, also inside it.
