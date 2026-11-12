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
