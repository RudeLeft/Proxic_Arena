# 0068 — The casting card stays in the middle; an obsidian pointer

**Status:** Approved 2026-11-09 (owner, on the canvas "casting-cursor-1109", sent as a file)
**Owner decisions:** casting card A · Centred, see-through; keep today's bob and tilt; battlefield pointer D · Obsidian arrow with a gold edge (one pointer, no per-action icons)

## Why (researched)

The big casting card sat at 45% across and down of the play area (not the middle), slid toward the stack in steps when it covered something clickable for the question and stayed there for the rest of the spell, docked smaller beside the stack when the question needed the table, kept its last spot between questions, and kept an old pixel spot after a window resize (CastingCard.tsx castingBox / castingSpot / docks / heldSpot; GameScreen.tsx castingAt). The owner saw it "move around".

## Built

1. The big casting card always sits in the middle of the screen, at full size, for every spell and every question -- no sliding aside, no docking beside the stack, no remembered spot. After a window resize it is in the new middle.
2. When your pointer is over something you can click for the current question that the card covers (an Elf to tap, a target), the card fades almost away and the click goes to that thing; move off and it comes back. Nothing moves.
3. The other player's card turns over in the middle and is held there as today, then flies to the stack.
4. The bob and tilt stay as they are.
5. The battlefield uses one custom pointer: the obsidian arrow with a gold edge from the canvas, tip as the click point, everywhere on the game screen (table, cards, buttons); the normal text cursor stays in text boxes. Lobby and other pages unchanged.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0068-A | The casting card's centre is the screen's centre for every question and after a resize | page test; screenshots |
| F-0068-B | Pointer over a covered clickable thing: card see-through and the click reaches the thing | page test + browser |
| F-0068-C | Opponent's reveal held in the middle | page test |
| F-0068-D | Game screen uses the pointer; text boxes keep the text cursor | page test; screenshot |

## Amendments
