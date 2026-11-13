# 0078 — Creatures getting bigger or smaller, damage left, loyalty

**Status:** Approved 2026-11-12 (owner, by prompt, on the canvas "pt-1112", https://claude.ai/artifact/79k1e8y9dA5hvVBEpemG8y)
**Owner decisions:** getting bigger **A · pop, tick and float**; a counter arriving **A · badge grows in, number pops**; getting smaller **red, like damage**; a creature killed by shrinking **shrinks, then shatters** (small worker change); Anthem **A · all together**; end of turn **B · with a grey float**; damage left **A · the toughness left, in red**; at rest **A · green bigger, red smaller**; planeswalker **A · tick with a float**; a counter taken off **B · like a shrink**. Owner: "I really like the rising numbers ... it really illustrates what's happening" -- every number change gets its rising number.

Phase 10 item A-18 (counters and power/toughness changing). Same language as spec 0077 (life: green rise, red impact with the small shake, point-by-point ticks) and 0076 (counter badges).

## Why (researched)

Every change is a one-step text swap: the P/T is `figure()` (`Board.tsx` ~585-592) drawn as `.bf-pt` (~664); counter badges (0076) don't animate; damage left on a creature shows only in the close-up ("· N damage", `GameScreen.tsx` ~4037) once the fight's red number fades. The snapshot already sends power, toughness, basePower, baseToughness, damage (`ViewerSnapshot.java` ~813-821) and counters (~853-861); loyalty is the LOYALTY counter shown in `.bf-pt`. A creature killed by -N/-N arrives already gone, so today it shatters still showing its old size.

## Built

1. **Getting bigger (Giant Growth, an Anthem, a +1/+1 counter):** the P/T pops and counts up point by point (3/3, 4/4, 5/5), a green "+3/+3" rises off the card, and its edge glows soft green for a moment. An Anthem's creatures all do it at the same moment.
2. **A counter arriving:** its badge (0076) grows in (or its number pops), then the P/T pops and counts, the rising "+1/+1" coming off the badge.
3. **Getting smaller (Grasp of Darkness, -1/-1 counters) and a counter taken off:** the small shake of 0077's impact, a red "−4/−4" (or "−1/−1") rising, the P/T counting down.
4. **Killed by shrinking:** the worker sends the creature's last size with its death, so it visibly shrinks to 0/0 (red float) before it shatters (A-04).
5. **End of turn (B):** a pump or damage wearing off counts back with a grey float ("−3/−3"), no glow, no shake.
6. **Damage left on a creature that lives (A):** after the fight, the toughness it has left shows in red ("4/1" on a 4/4 with 3 damage) until end of turn; pointing at it and the close-up say "3 damage".
7. **At rest (A):** while power or toughness differ from what is printed, the number stays green (bigger) or red (smaller); pointing at it shows the printed size, as today.
8. **Planeswalker loyalty (A):** a gold "+1" or a red "−3" rises and the number ticks.
9. A click hurries everything (A-00); reduce motion: no pop, shake, glow or float, the numbers just change. Fights (A-11..13) keep their own red damage number.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0078-A | Giant Growth: pop, 2/2→5/5 point by point, green "+3/+3", green at rest; end of turn: grey float back to 2/2 | page test; Lab; clip |
| F-0078-B | Soul Warden + Pridemate: badge grows in, then +1/+1 float and tick | page test; Lab; clip |
| F-0078-C | Grasp on a 5/5 (lives): shake, red "−4/−4", 1/1 red at rest; on a 4/4: shrinks to 0/0, then shatters | worker test; page test; Lab; clip |
| F-0078-D | Glorious Anthem: all creatures together | page test; clip |
| F-0078-E | A 4/4 with 3 damage reads 4/1 in red until end of turn | page test; Lab; clip |
| F-0078-F | Planeswalker +1 / −3: floats and ticks; a counter removed: red float like a shrink | page test; Lab; clip |
| F-0078-G | Hurry; reduce motion; hidden info clean | page test; Lab hidden checks |

## Amendments

**Amendment 1 (owner, 2026-11-12), after reviewing the clips.**

1. **No counting on cards.** Owner: a 5/5 getting −4/−4 counting 5, 4, 3, 2 to 1/1 "looks odd"; "the −4/−4 rises and the card's P/T just shows 1/1. The count makes sense for the player medallion/shield but not for the cards." For every change on a card -- growing, shrinking, counters added or taken off, an Anthem, the end-of-turn wear-off, damage left, planeswalker loyalty, and a creature shrunk to death -- the rising number appears and the P/T (or loyalty) switches straight to the new value with a small pop at that moment. The green/red at-rest tint and the red toughness-left look stay. The life shield (0077) keeps its point-by-point count. A creature killed by shrinking: "−4/−4" rises, the P/T switches to 0/0 in red, then it shatters.
2. **Damage wearing off at end of turn gets a grey rising number too** ("+3" as 4/1 becomes 4/4), like a pump wearing off.

**As built (2026-11-12).**

- **Worker (item 4).** A creature's move off the battlefield carries `last` {power, toughness}: its size as it last stood there, read from Forge's last-known information (`Game#getLeftBattlefieldThisTurn`, recorded by `GameAction#changeZone` before it reports the move). Grasp of Darkness on a Rumbling Baloth sends `last` {0, 0} to both seats (RUN, Lab `dies`); a Hill Giant killed in a block sends {3, 3}. Only with a named card and only from the battlefield (both numbers were on the board). `MovesTest` covers it.
- **Page.** `sizeTicks.ts` compares the board drawn with the new one (power, the toughness left = toughness less damage, loyalty, counters) and names the change from what the game sent: a +1/+1 or -1/-1 counter that came or went, damage the round's damage wave dealt, the turn having changed (wear-off), anything else. Nothing is worked out from rules (ARCH-002). Each change plays on a "size clock" on the board, landing when the resolving spell's beam lands (0.38 s), when a permanent spell has flown onto the table (0.45 s: the Anthem), or when a trigger has gone back into its card, after any fights still playing. `SizeFigure.tsx` draws the number and runs the looks; `CardBadges.tsx` grows a new badge in (with a ring in its colour), pops a changed number, and keeps a badge whose last counter was taken off until it has shrunk away.
- **Looks, as chosen** (counting replaced by a single switch with a pop, Amendment 1): bigger: pop, soft green edge, green "+3/+3"; a counter arriving: the badge first, then the pop, the "+1/+1" rising off the badge; smaller and a counter taken off (8 B): the small shake, red edge, red "−4/−4" / "−1/−1"; killed by shrinking: its red float rises, it reads 0/0 in red, then breaks (A-04); end of turn (5 B): grey with a grey "−3/−3", no glow or shake; damage left (6 A): the toughness left pops down in red as the fight ends ("4/1"), no float of its own (the fight keeps its red number); at rest (A): each number green when above printed, red when below, the toughness left red while damaged; pointing says "4/4 with 3 damage" or "5/5, printed 2/2", and the card's label adds "3 damage"; loyalty (7 A): gold "+2", red "−1"/"−3" with the shake. A click hurries it all; reduce motion: no clock and no looks, the numbers change at once.
- **Differs from the canvas / not done:** (damage wearing off now rises a grey "+3", Amendment 1.) A planeswalker damaged in combat ticks down without its own float (the fight shows the number). Wear-off is read as "the turn changed in between": the game sends no board during cleanup. A creature shrunk to death inside a pile's peel-off shrinks too; one killed in a fight does not (A-13). Damage marked now reaches the page's pile rule as spec 0036 already listed (a damaged copy stands apart from its pile).
- **Found by eye, fixed (2026-11-12):** filming the Baloth blocked by a Hill Giant showed its toughness already red ("4/**4**") from the moment the board came, two seconds before the fight's blow; it now stays white until the hit lands, then counts to 4/1 in red (page test checks it). A rising number that started at the bottom bar crossed the badge column (Spike Feeder's "−1/−1" over its "1"); with badges on the card it now starts just above the highest badge.
- **Evidence:** worker `MovesTest` (2 new); `fixes0078.test.tsx` (F-0078-A..G, 11 tests, all failing with the page change removed); Lab `scripts/check-pt-changes.py` (growth, pridemate, grasp, dies, anthem, damage, walker, counter: all OK, added to CI); `check-hidden-hands.py` and `check-hidden-log.py` clean over its traces. Clips (normal and quarter speed, 1920×1080) and close stills are in `Arrow videos/0078`.
- **As built, Amendment 1 (2026-11-12):** `sizeSteps` makes one step per change (the whole difference, 40 ms after the change lands, with the pop); every look pops, worn and healed too; a creature shrunk to death switches to its last size, then breaks 0.6 s later (`SHRINK_BEAT_MS`, was 0.3 s after a count) so the red float and the 0/0 read first; healed damage rises a grey "+N". New page test "a card's number never shows a value between the old and the new" (Giant-Growth-like +7/+7, −5/−5, loyalty 6 to 1, sampled every 5 ms) failed with the old counting `sizeSteps` and passes now. Clips re-filmed: giant-growth, giant-growth-wears-off, grasp-lives, grasp-dies, damaged-after-combat, damage-heals-end-of-turn, planeswalker-plus.
