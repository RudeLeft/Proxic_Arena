# 0077 — Damage, life and poison on a player's life shield

**Status:** Approved 2026-11-12 (owner, by prompt, on the canvas "life-1112", https://claude.ai/artifact/SKkU7MDodUcVn5to93nLUn)
**Owner decisions:** damage **A · Impact**; life loss **looks the same as damage**; big changes **B · point by point**; poison **A · by the life shield** -- touching the shield, but further down and to the left so it never covers the life number. Life gain: a green "+N" rising with a soft glow, one tick per trigger (as on the canvas).

Phase 10 item A-19 (life, poison and damage to players). Combat damage to a player already ticks per hit with a red shake (spec 0067); prevented damage is A-20.

## Why (researched)

- Spell/ability damage to a player: a card-wide orange burst and a gold "−N" (`Board.tsx` ~2070-2111, `battlefield.css` ~1476-1530); the life number changes the moment the board arrives, before the burst lands, with no shake. Only combat ticks per hit (`lifeTicks.ts`, `GameScreen.tsx` ~2585-2597, ~4631-4639).
- Life gain: only lifelink in a damage step shows a green "+N" (`GameHost.java` ~780-807); Soul Warden and other gains show nothing.
- Life loss (Sign in Blood, Gray Merchant): only the number changes; the worker sends no event, just a play-log line (`PlayLog.java` ~957-990).
- Poison: a "3 poison" chip on the status tray, changing without a mark (`StatusTray.tsx` ~24-31, ~166-175).
- **Bug:** the worker drops Forge's infect flag (`GameHost.java` ~808-819), so an infect hit is sent as ordinary damage: a red "−3" and the plate reading 23 until the blow lands, then 20.

## Built

1. **Worker:** each life change is sent with its kind (damage, loss, gain), its amount and its source where visible; infect/wither-to-player damage is sent as poison, not damage (fixing the bug). Hidden-info rules apply (a source is named only if the reader may see it).
2. **Damage and loss (A · Impact, one look for both):** when the spell's gold beam (spec 0069) lands -- or at once for a source with no beam -- the life shield shakes as in combat (0067) and shows a brief crack, a red "−N" floats up, and the number steps down **point by point** (20, 19, 18, 17). The number never changes before the hit lands.
3. **Gain:** a green "+N" rises with a soft green glow and the number steps up point by point; several triggers (Soul Warden ×3) each tick in turn.
4. **Big changes (B · point by point):** every change steps one point at a time (Gray Merchant draining 5: 20 → 15 on Bob's shield while Alice's climbs), at a pace that keeps a 10-point change readable without holding the game long; a click hurries it to the end (A-00).
5. **Poison (A):** a round poison badge (spec 0076's language: drop picture + number) touching the life shield at its lower left, placed far enough down and left that it never covers the life number; a ring of 10 notches around it fills as poison grows, and it pulses when counters arrive. It replaces the tray's "N poison" chip (the tray keeps energy, experience, the Ring).
6. Reduce motion: no shake, float or pulse; numbers change, the badge shows its count.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0077-A | Lightning Bolt to Bob: number holds until the beam lands, then shake, crack, "−3", 20→19→18→17 | page test; Lab; clip |
| F-0077-B | Sign in Blood: same look as damage | page test; Lab; clip |
| F-0077-C | Soul Warden ×3: three green ticks | worker test; page test; Lab; clip |
| F-0077-D | Gray Merchant drain 5: both shields step point by point | page test; Lab; clip |
| F-0077-E | Infect: poison badge 3 → … → 10, never shown as life loss; badge never covers the life number (both seats, all sizes) | worker test; Lab; page test; clip |
| F-0077-F | Hurry and reduce motion; hidden info clean | page test; Lab hidden checks |

## Amendments
