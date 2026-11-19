# 0106 — Animation pace 1.25× on movement; the pile fan beside the graveyard: whole 88×63 cards, apart, up to 7, then "+N"

**Status:** Approved 2026-11-19 (owner, by prompt, feedback batch). Not part of a phase.
**Owner decisions** (owner feedback batch 2026-11-19; canvas `frontend/zz-canvas/feedback-1119.html`):
Q3 **C** (1.25× on every movement; today 1.0×, A 1.15×, B 1.2× not taken): glides, flips, the cast, attacks, blocks, deaths take 25% longer; waits do not change. Q4 **B** (88×63 whole cards, tops at 990, 4 px apart, the corner sign inside the card, up to 7; A hand size with 5 places and C 102×73 hanging with 6 not taken).

Canvas sections: "Q3" (decided line; option C); "Q4" (decided line; option B, with "Show measurements"). Research: `Owner feedback 2026-11-19 research A.md`, item 3; `Owner feedback 2026-11-19 research B.md`, item 4.

Two items, one spec: both are the board's look with no game change, and both touch the same tests' numbers (exact-time and layout tests).

## Why (researched)

Researched at HEAD 3370c75 (1.73.0); SOURCE unless marked.

### Item 1, pace

- **No single speed.** Each animation time is its own constant: about 250 in the page code (`motion.ts` `MOVE_MS` 450, `SETTLE_MS` 250, `FLIP_MS` 760, `RETURN_MS`, `BANISH_MS`...; `CastingCard.tsx` `FLY_MS`, `FLIP_MS`; `Board.tsx` `ATTACK_MS`, `BLOCK_MS`, `RISE_MS`, `STACK_IN_MS`, `RESOLVE_MS`, `WASH_MS`, `SWING_MS`; `fights.ts` `FIGHT_*`, `STRIKE_*`, `SLASH_*`; `graves.ts` `DISCARD_MS`, `MILL_MS`, `SHOW_MS`; `copies.ts`, `manaBalls.tsx` `BALL_MS`, `markMotion.ts`, `sizeTicks.ts`, `lifeTicks.ts`, `flights.tsx`, `piles.ts`, `opening.ts`, `gameEnd.ts`, `FanCards.tsx`, `LibraryTop.tsx`, `alive.ts`, `playerMarks.tsx`, `PoisonBadge.tsx`) and about 120 durations in `game.css` and `battlefield.css`. A click already hurries everything (`motion.ts` `hurry`, `HURRY_MS`); reduce-motion turns movement off.
- **Chrome's playback rate is not a pace.** The clips' slow motion (`Animation.setPlaybackRate`, `frontend/tools/jumps/jumps.spec.ts`) slows CSS and Web Animations but not the `setTimeout`s that start the next step (recorded as a known gap in spec 0088), so a browser-level slowdown would fall out of step.
- **Limits that must not scale** (they are caps and safety waits, not movement): `FIGHTS_MAX_MS`, `FIGHTS_FASTEST`, `BALLS_LONGEST_MS`, `REPLAY_MAX_MS`, `END_WAIT_MAX_MS`, `RESTART_*`, `SPELL_WAIT_MS`, `SWING_HOLD_MS`.
- **Waits that must not scale** (owner: "waits do not change"): `GameScreen.tsx` `RESPONSE_WINDOW_MS` (5 s), spec 0105's rest (2.5 s / 0.8 s), the worker's `PriorityStops.STEP_PAUSE_MS` (0.4 s), the report window's reading times (`RevealTray.tsx` `READ_START_MS`, `READ_MS`; `reports.ts` `FOLD_MS`), `CastingCard.tsx` `HOLD_MS` (the other player's card staying face up to be read) and `DECIDE_MS`, the `FIGHT_BEAT_MS` beat, `SLASH_NUMBER_MS` (a number left to read), `HURRY_MS` (a hurry is a hurry).
- **Exact-time tests** (research A, by count): 11 tests pin a time (`fixes0083.test.tsx` `WASH_MS`, `fixes0088.test.tsx` `TOP_SHOW_MS`, `fixes0101.test.tsx`, `motion.test.ts`...) and about 53 places step a fake clock by a fixed number.

### Item 2, the pile fan (measured by research B on the real page, `/dev/board` on :8080, 1920×1080)

- **Today.** `pileFan.ts`: `FAN_H = (BAND_EDGE - FAN_LAND_GAP - FAN_EDGE) / (1 + FAN_SIGN)` gives 80 px; width 57; `FAN_PITCH = FAN_H * 64 / 96` (54 px apart), so the edges overlap 4 px; `FAN_SIGN` 0.094: the corner sign (graveyard stone, exile star) sticks out above and right (`battlefield.css` `.bf-fan-sign`, `top` and `right` at −0.094 × the card height), covering about 12 px of the next card and the end of its own name ("Think Twi..."). `FAN_MAX_W` 0.3 of the table; past 9 cards `fanPitch` squeezes down to 18% of a card showing; no "+N".
- **The room.** The strip below the land row is 94 px at 1080 (land row ends at 986). The fan stays 4 px under the land row (`FAN_LAND_GAP`, Amendment 2 of 0087: 0 px overlap allowed), 10 px left of the plate column (`FAN_RIGHT`), and the hand closes up to keep `FAN_HAND_GAP` 16 px clear (`layout.ts` `handFan`, `keepRight`). The 0093 land anchor (`landAnchor`, `LAND_ANCHOR_HAND`) ignores the fan, so a bigger fan moves no land. The other player's fan is the mirror at the top.
- **Option B fits.** 88 = 94 − 4 (land gap) − 2 (edge): the whole strip once the sign no longer sticks out. Width 63 (88 × the card ratio). Seven cards at 4 px gaps are 7 × 63 + 6 × 4 = 465 px, inside the 491 px `FAN_MAX_W` at 1080. A 7-card hand does not move; the hand starts closing up at 9 cards with a full fan (research B's table).

## What the player sees

1. **Pace** (canvas "Q3", option C). A land played, a creature cast, an attack, a block, a creature dying: each movement takes 25% longer than today (a card's glide from 0.45 s to 0.56 s; the cast card's flight from 0.56 s to 0.70 s; a creature turning over from 0.76 s to 0.95 s). The waits are the same: "Resolves in 5" is still 5 s, the stack's rest still 2.5 s, a turn step passed for you still 0.4 s, report windows read as before. A click still hurries everything.
2. **The fan** (canvas "Q4", option B). Alice may cast Think Twice from her graveyard and Ancestral Vision is suspended in her exile: beside her graveyard, right of her hand, the fan shows whole cards 88 × 63 at 1920×1080, tops level with the hand's (990), 4 px apart, never overlapping; each card's graveyard or exile sign sits inside its top-right corner and the name reads in full ("Think Twice"). At 3 cards and at 6, nothing else on the table moves. With 9 playable pile cards, 6 show and the seventh place is a "+3" card (a card back with the count); clicking it opens the pile viewer (W-18's `ZoneViewer`) on the tab of the pile holding the hidden cards (decision default below). Bob's fan at the top follows the same rule, mirrored at the top edge, drawn as his fan cards are drawn today (his "+N" opens his pile in the viewer, as clicking his pile tile does).
3. Every other screen size: the same proportions (2560×1440 is 117 × 84; at 1920×947 the strip and the cards shrink with the table as today), and still at most 7 places.

## Changes

### Item 1, pace (page only)

- **`motion.ts`**: `export const PACE = 1.25;` and `export const paced = (ms: number) => Math.round(ms * PACE);` next to `MOVE_MS`. Every movement constant in the files listed under Why becomes `paced(<today's value>)` (`MOVE_MS = paced(450)`), so each spec's canvas number still reads in the code. The waits and limits listed under Why are left as they are, each with a one-line comment "not paced: a wait (spec 0106)" or "not paced: a limit", so a later reader knows it was decided, not missed. Derived holds that must cover a movement (`GameScreen.tsx`'s hold, 0105) are computed from the paced values, never fixed.
- **CSS**: one custom property on the game screen root, `--pa-pace: 1.25`, set from `PACE` (so the two cannot drift), and every movement `transition` / `animation` duration in `game.css` and `battlefield.css` written `calc(<today's ms> * var(--pa-pace))`. Looping glows and breaths (not movement from one place to another) are not paced. Builder: a grep for `ms` / `s` durations in both sheets, each classified movement / loop / wait in the As built list.
- **The worker**: unchanged (`STEP_PAUSE_MS` is a wait).
- **Approved specs quote canvas times** ("the canvas's 520 ms"): from 0106 on, every such movement time is that value × `PACE`. This line is the amendment for all of them; they are not edited one by one.
- **`ARRIVE_MS` check (0105).** With pace the other player's spell arrives in 420 × 1.25 + 650 + 560 × 1.25 = 1875 ms and a trigger rises in 650 ms: inside 0105's 2000 / 700. F-0105-F re-runs and must pass; if a later change pushes an arrival past them, the worker allowance goes up in the same change.

### Item 2, the pile fan (page only)

- **`pileFan.ts`**: `FAN_SIGN` stops adding height: `FAN_H = BAND_EDGE - FAN_LAND_GAP - FAN_EDGE` (88 px at 1080); `FAN_PITCH` = the card's width + `FAN_GAP` (new, 4 / `CANVAS_H`): no overlap; `FAN_PLACES = 7` (new). `fanPitch` no longer squeezes: past `FAN_PLACES`, `fanBoxes` lays out `FAN_PLACES − 1` cards (the newest, the order 0087 uses) and a "+N" box in the last place, N the cards not shown. `fanWidth` and `fanReach` follow (at most 7 places). If a screen's `FAN_MAX_W` cannot hold 7 places at the gap (narrower than the supported screens, UI-006 best effort), fewer places, never overlap.
- **`battlefield.css` `.bf-fan-sign`**: inside the card's top-right corner (no negative `top` / `right`), sized as in the canvas (0.2 of the card height), with the card's name bar padded right so the name ends before the sign.
- **`FanCards.tsx`**: a "+N" card (`FanMoreView`, a card back at the fan size with the count, focusable, `aria-label` "N more cards you may play: open the pile"). Click (or Enter) opens `GameScreen.tsx`'s `ZoneViewer` on the tab of the pile of the newest hidden card (graveyard or exile; the other player's for his fan). **Decision default the owner can change:** "+N" opens the existing pile viewer; the alternative was that the fan squeezes as today.
- **`layout.ts` `handFan`**: unchanged rule (keep `FAN_HAND_GAP` clear of the fan), now reading the wider fan through `fanReach`.

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0106-A | Page: `PACE` is 1.25; each movement constant equals `paced(base)`; each listed wait and limit is unchanged (a table-driven test naming each constant, so a new constant has to be classified) | `motion.test.ts` (extended) |
| F-0106-B | Page: CSS pace: `--pa-pace` on the game screen equals `PACE`; a sampled movement (a card glide's computed `transition-duration`) is 1.25× today's; a looping glow's is not | `fixes0106screen.test.tsx` (real game screen) |
| F-0106-C | Page: the exact-time tests (`fixes0083.test.tsx` `WASH_MS`, `fixes0088.test.tsx` `TOP_SHOW_MS`, `fixes0101.test.tsx`, `motion.test.ts`) assert `paced(base)`, not a bare number; fake-clock steps that wait for a movement step by the paced constant, not a literal (grep `advanceTimersByTime(` with a number) | vitest |
| F-0106-D | Page: the fan at 1080: cards 88 × 63 (±1 px), tops at 990, 4 px gaps, 0 px overlap between fan cards, the sign inside its card's box, the name bar ending before the sign; 1, 3, 6, 7 cards: all shown; 8 and 12: 6 cards and "+2" / "+6" | `fixes0087.test.tsx` rewritten where 0087's numbers change: "stands just left of the column, below your land line..." (its 80.4 px height and the two-thirds-of-the-height pitch become 88 and width + 4 px; the "drawn over the one before" z order no longer matters), "96 px at 1080, in proportion above it" (its title is stale already: the check is `FAN_H`, which becomes 88 px at 1080; retitle it), "closes up when many cards would reach across the table" (now the "+N" rule), "draws each card with its pile's corner sign" (sign inside); new `fixes0106.test.tsx` for "+N" |
| F-0106-E | Page: the other player's fan follows the same numbers, mirrored | `fixes0087.test.tsx` "for the other player's plate..." |
| F-0106-F | Page: "+N" click opens `ZoneViewer` on the right tab; Enter does too; the other player's "+N" opens his pile, showing only what that viewer may see (foretold cards as backs, spec 0087 F-0087-C) | `fixes0106screen.test.tsx` (real game screen from a real board, TEST-003) |
| F-0106-G | e2e layout sweep: `battlefield.spec.ts` "spec 0087: the fans stand where pileFan says..." at 1920×947, 1920×1080, 2560×1440, 3440×1440 with 1, 3, 6 and 9 cards (TEST-008): each fan card where `pileFan` says, inside the table, 0 px over any table card (Amendment 2), never on the plate column, never over a hand card, no two fan cards overlapping, every sign inside its card; the geometry really changed between sizes (TEST-007) | `frontend/e2e/battlefield.spec.ts` |
| F-0106-H | The jump check at 1.25×: `check-jumps.py` over the CI deck's traces reports no new jump or blink | `scripts/check-jumps.py`, once, recorded in As built |
| F-0106-I | Real game (TEST-012), below | `match-pace-fan.spec.ts` |

**TEST-004 (bites):** `PACE` set back to 1 (A, B fail); the sign moved back out (D fails); the squeeze restored (D fails at 8 cards); "+N" wired to nothing (F fails).

**Real-click game (TEST-012).** 0098's exact deal puts 8 castable cards in the host's graveyard (a flashback deck through the deal); the host's fan shows 6 and "+2"; the host **really clicks** "+2" and the pile viewer opens on the graveyard; the host closes it and **really casts** one fan card by clicking it in the fan (a real click at the card's centre; the fan is not under the hand, so no clamp is needed, but use `hitPoint` if the builder hoists it). Pace is checked by the page test, not here: the e2e waits on states (the viewer open, the card on the stack), never on how long a movement took.

## Risks

- **Hidden information (HID-005).** The "+N" card shows a count of playable pile cards, which the fan already shows today one card at a time; the other player's "+N" opens his pile with exactly what the pile tile already opens (`ZoneViewer`, foretold cards as backs). F-0106-F checks the other seat.
- **Speed budgets.** Slower movement is not more work per frame: `match-speed.spec.ts` (`SPEED_BUDGETS`: frames p95 and worst, `scriptMsPerSecond4x` combat 88 / cast 100, `gameScreenPerUpdate`, `seatPerUpdate`) and `frontend/e2e/bench-scenes.spec.ts` (`benchBudgets.ts` `BUDGETS`) are unchanged and must pass as they are. The per-second script figure can only fall when the same work spreads over more time (INFERENCE: research A); measured on the pushed commit's CI run (EVID-005). Neither budget is loosened for this spec.
- **The jump check.** Longer movement means more frames per path (fewer false flags), but `jumps.spec.ts` `settled` waits at most 12 s and tracks hold timers only between `HOLD_MIN` 100 and `HOLD_MAX` 3000 ms. A paced hold that crosses 3000 ms would stop being waited for and the next board would arrive mid-move: the builder lists any paced timer at or above 3000 ms and raises `HOLD_MAX` above the longest (combat is capped by `FIGHTS_MAX_MS`, unpaced, so 12 s still holds). F-0106-H.
- **e2e timing.** About 52 browser specs use fixed waits (research A). Most wait on states; the ones that wait "until the animation is done" by a fixed `waitForTimeout` (grep `waitForTimeout(` with 400 ms or more in `frontend/e2e`) get the paced length or, better, a wait on the state that ends the animation. `match-helpers.ts`'s `lifeSettled` and `castCentre` are read for fixed numbers first. The full browser suite runs in CI on the pushed commit (TEST-013); a new flake goes in ROADMAP's flake list.
- **Clips.** Slow-motion clips keep using `Animation.setPlaybackRate`; pace is inside the page and simply makes them longer.
- **Fan near the hand.** At 9+ hand cards with a full fan the hand closes up (research B); unchanged in kind, measured by F-0106-G.

## Build order notes

Third (0104 → 0105 → 0106 → 0107), after 0105 so the stack's new arrival is paced with everything else and F-0105-F re-runs here; before 0107 so the trample carry-on is built at the final pace. Inside: the fan first (small, self-contained, its own tests), then `PACE` in `motion.ts` and the TS constants file by file, then the CSS, then the exact-time tests, then e2e waits, then the jump check, then the real-click game.

## Amendments

None yet.
