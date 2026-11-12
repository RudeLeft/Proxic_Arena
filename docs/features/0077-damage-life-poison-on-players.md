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

**As built (2026-11-12).**

- **Worker.** `LifeChanges.java` sends each round's life and poison changes as the snapshot's `life` ({key, changes: [{player, kind, amount, source?, combat?}]}, kinds damage / loss / gain / poison) to every seat and the public view; sources go through `HiddenIds.strip` like every other id. Damage is told apart from loss by Forge's own order (the hit's `GameEventPlayerDamaged`, then `processDamage`'s life change). **The infect bug is fixed:** a hit on a player keeps Forge's flag (`infect: true` in the damage wave) and is never counted as damage. Run finding: Forge gives a combat step's poison in one go, after the hits (its counter table), so the poison change names its source only when one creature gave all of it.
- **Page.** Life changes outside combat play on a "life clock" on the board (a click hurries it, A-00): they land when the resolving spell's spark reaches the shield (0.38 s), at once with no beam, and after any fights still playing. Damage and loss: the 0067 shake, a crack, a red "−N" floating off the shield's left; gain: a green "+N" and a soft glow. Every change steps one point at a time, 90 ms a point, at most 0.9 s for the whole change. One source's changes to two players land together (Gray Merchant); anything else waits a beat (Soul Warden ×3). Combat keeps the fights' clock (0067).
- **Poison never looks like life** (coordinator review, 2026-11-12): an infect attacker lunges at the **poison badge**, not the shield. Its short slash across the badge is green; the shield gets no shake, crack or red glow, the screen gets no red edge, and the life number does not move. The badge pulses and lights one notch per counter. Poison has no bare green "+N": it shows a dark pill in the badge's colours, the poison drop beside the number, rising off the badge. Gain is a bare green "+N" floating off the shield's left, so the two differ in picture and in place. The first counter grows the badge in at its spot, then it settles. Page tests fail if a poison change makes a gain float, glow, crack, red number or hurt glow, or a bare "+N".
- **Poison badge** (`PoisonBadge.tsx`): a 40 px round badge (rail units), a drop, the count and a ring of 10 notches (the ring breathes at 10), pulsing as counters land. Its centre is 31 left of and 22 below the shield's centre. Measured on the real page: it touches the shield and clears the life number's box by 4.5 px at 1920×1080 and 6 px at 2560×1440, on both seats. The tray no longer shows poison.
- **Not done / differs:** Gray Merchant's points do not fly between the shields as sparks; the spec describes point-by-point steps on each shield, and that is what was built. Removing poison counters is not shown as a change: the badge just shows the new count. Reduce motion: no clock, no marks, the numbers change at once.
- **Evidence:** worker `LifeChangesTest` (10); `fixes0077.test.tsx` (F-0077-A..F, 14 tests; each failed with its part removed); Lab `scripts/check-life-changes.py` (bolt, sign, warden, merchant, infect to 10 poison, ended "Poisoned"), added to CI; check-hidden-hands and check-hidden-log ran clean over its traces; clips and stills are in `Arrow videos/0077`.
