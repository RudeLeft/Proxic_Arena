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

### As built (2026-11-09)

**The card.** `castingBox(g)` (CastingCard.tsx) is now one rule: full size (2.5 times a table card, at most half the window's height), centred on the middle of the window -- the game screen fills it -- for every spell, every question and between questions. It is a pure function of the window's size, so after a resize it is in the new middle; the existing 0.38 s glide on its place carries it there (none with Reduce motion). At 1920x1080 it spans x 838-1082 and at 2560x1440 x 1117-1442; the right-hand column starts at 1638 and 2184, so it never reaches the column, the stack or the plates (checked on screen at both sizes).

**Removed, superseded by this spec:** owner 2026-11-01 item 4's slide aside (`castingSpot`, 8 steps toward the stack); spec 0044's docking beside the stack at 1.5x for a question that needs the table (`docks`, `castingBox(g, true)`, `.gs-cast-docked`, `data-docked`); spec 0057 item 1's "stays where it was between questions" (`heldSpot`, `Floating`) and the remembered pixel spots in GameScreen (`floating`, `aside`, `heldCast`, the flight's `from`). The flight to the stack or back to the hand starts from the middle. Spec 0044's face-down back and reveal, spec 0057 item 1's "nothing to pick in the hand moves it" (now trivially true) and the bob and tilt are kept.

**See-through.** The card never took the pointer (`pointer-events: none`), so clicks always reached what is under it. New: while the pointer is inside the card and on something marked clickable for the question (`data-choosable="true"`), or the keyboard's focus is on such a thing under it, the card goes to 14% (the canvas's 1 - 0.86) in 0.12 s and back the same way (`data-see-through`, `.gs-cast-see`). It is read again when a new question arrives under a still pointer. The other player's face-down card never fades.

**Its window (found in a real game).** With the card no longer moving out of the way, Swords to Plowshares' window, on the card's left, hid the opponent's Sliver. The question's window now uses spec 0057's `anchorByCard` beside the centred card: the left as before, the right when the left would cover something to click, the left if neither is clear (`castingWindowAnchor`). The card itself never moves.

**The reveal.** The other player's card turns over in the middle, is held there (FLIP_MS + HOLD_MS), then flies to the stack from there.

**The pointer.** The canvas's D SVG, unchanged, as a data-URI cursor with hotspot 2 2 and `auto` fallback on `.gs-screen` and everything in it (`!important`, so cards, buttons, the table and disabled things all show it; no "not allowed", hand or help icons). Text boxes (`input` of text kinds, `textarea`, contenteditable) keep `text`; the chat's resize corner keeps its resize arrows (a decision made here: it is how a player finds the corner -- say if it should go). The chat window's grab hand is replaced by the arrow. The lobby and other pages are untouched.

**Evidence.** `frontend/src/battlefield/fixes0068.test.tsx` (the real game screen: centre = window centre for paying, a target, an optional cost, between questions and after a resize to 2560x1440; pointing at the covered Elf fades the card and the click answers it; keyboard focus fades it; a choosable card outside the card does not; the window's side; the reveal held in the middle until FLIP_MS + HOLD_MS; the pointer's computed cursor on the game screen, disabled buttons and text boxes) -- all 8 fail on the code before this change. `CastingCard.test.ts` and `fixes0057.test.tsx` rewritten to the new rule. Real games: `e2e/match-cast-aside.spec.ts` (every payment step centred, every payable card hit by the mouse, every covered one makes the card see-through, a real click through the card taps the Elf, resize to 2560x1440 re-centres) and `e2e/match-casting-dock.spec.ts` (a target keeps the card centred, the Sliver is hit by a real click, the opponent's reveal held centred and not yet flying, the computed cursor over table, card and button). Headless screenshots draw no mouse pointer: the spec draws the page's own cursor picture at the pointer's spot for the picture only.

### Amendment 1 — steps aside for a card it covers being spent or tapped (owner, 2026-11-13)

Item 1's "no sliding aside" now has one exception, by owner decision on the canvas "hidden-fold-1113" (spec 0091): while a card the casting card covers is spent, sacrificed or tapped to pay for the spell, the casting card and its cost pips step aside just enough to show it, then return to the middle. It never stays aside, and every other rule of this spec is unchanged.
