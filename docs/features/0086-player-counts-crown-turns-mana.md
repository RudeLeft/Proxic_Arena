# 0086 — Energy and other player counts, monarch and initiative, dungeons, emblems, turn start, mana into the pool

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "gaps-players-1113", https://claude.ai/artifact/LrCTwwbm4KPBsHN4qemdTJ)
**Owner decisions:** 7 **B · badges in the tray** · 8 **the recommended set** (monarch and initiative on the face, flying face to face; dungeon map card with a stepping marker; emblem grows out of its ability into the tray as a picture tile) · 10 **C + B** (plate lights every turn, sweep only when it becomes your turn; extra turn told in the report window at its start) · 11 **A · a ball per mana**.

Phase 10 A-22, from the deep dive "Phase 10 graphical gaps.md" (2026-11-13), items 7, 8, 10 and 11.

## Why

- Energy, experience, rad, tickets, monarch, initiative, dungeon and emblems are word chips in the player's tray with no animation (`StatusTray.tsx` ~142-200; `game.css` ~2741-2780).
- The active plate is a colour switch (`game.css` ~131-134, 237-239; `GameScreen.tsx` ~2407-2445).
- Mana balls exist only for spending (`manaBalls.tsx` ~340-380).

## Built

1. **Player counts (7 B).**
   - Energy, experience, rad and tickets become round picture badges in the player's tray, with rising +N/−N in the badge's colours. Paying energy sends sparks to what it paid for.
   - Poison keeps its place by the life shield (0077).
2. **Monarch and initiative (8).**
   - The crown sits on the monarch's face picture. When it changes hands (combat damage, a card), it lifts off one face and flies to the other, and it glows when its owner draws for it.
   - The initiative token sits on the face's lower corner and flies the same way.
3. **Dungeons (8).** The dungeon is a small map card in the tray. When a player ventures, it lifts, its gold marker steps to the next room, and it settles. Completing a dungeon is told in the report window to the other player.
4. **Emblems (8).** An emblem grows out of the ability that made it on the stack, flies into its owner's tray and stays as a small square tile with its planeswalker's picture. The close-up shows its words.
5. **Turn start (10).**
   - Every turn, the new active player's plate lights up: a light runs along its top edge, the shield glows, and the turn number and "whose turn" words roll over.
   - Only when the turn becomes yours, a soft band of light also sweeps across the table toward you.
   - On an extra turn (Time Warp), the plate lights again for the same player, and at the start of that turn the report window says "Extra turn: this is Alice's turn again." The turn number rolls over (owner-approved exception to rising numbers, shown on the canvas).
6. **Mana in (11 A).** Each mana added to a pool flies as one ball from its source (a land, Dark Ritual, a creature) into the pool chip; the count steps up with a rising +N. Spending keeps today's balls (0070) with a rising −N.
7. Fast and never in the way: nothing here blocks a click. A click hurries everything (A-00). Reduce motion: no movement; badges, crown, tiles and counts still change. Hidden-info rules apply.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0086-A | Aether Hub +1, Harnessed Lightning +3 then −3: energy badge with rising numbers, sparks to the spell; two kinds at once | page test; Lab; clip |
| F-0086-B | Monarch stolen by combat damage: crown flies face to face; glows at the draw; initiative the same | page test; Lab; clip |
| F-0086-C | Venture: map card, marker steps; completing told to the other player | page test; Lab; clip |
| F-0086-D | A planeswalker emblem: grows from the ability, flies to the tray tile | page test; Lab; clip |
| F-0086-E | Turn start both seats; sweep only on your turn; Time Warp's extra turn window | page test; Lab; clip |
| F-0086-F | Swamp and Dark Ritual: balls in, count steps, +3; spending −N | page test; clip |

## Amendments
