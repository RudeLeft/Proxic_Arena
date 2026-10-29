# 0028 — The stack as a cascade

**Status:** Built in 1.16.0
**Owner decisions:** 2026-10-28 — layout A, the Cascade, with the six
ideas marked "In the plan" on the canvas.

## What the player sees

RudeLeft casts Lightning Bolt at Pat's creature; Pat responds with Shock;
a trigger goes on top. At the right edge of the board the three are
fanned so every card's name shows, numbered 1, 2, 3 in the order they
resolve, 1 in front. Each card's edge says whose it is (gold yours, red
the opponent's) and a small picture of its caster sits on its corner.
The front card's target line shows; pointing at any other card shows its
line and fades the rest. Clicking a stack card opens its close-up. A
trigger shows the picture of the card it came from, says "Ability", and
has a faint line back to that permanent. When the front card resolves it
glows, its effect travels along its line, and it moves to the graveyard;
the numbers update. When you are asked to respond, a thin ring round the
front card counts down the 2-second auto-pass (spec 0005).

## Scope

In: the cascade (every object shown, not four), order numbers, owner
colours and caster pictures, point-to-trace, ability look and source
line, the resolve, the response clock.

Out (canvas "Optional" and "Later"): the stack count on the turn track,
the "just resolved" list, the opponent-spell spotlight.

## Rules and boundaries

- The stack's order and contents are Forge's (the snapshot's `stack`,
  top first); nothing is reordered or invented.
- Hidden information: a face-down spell stays face-down; a card's
  close-up shows only what the snapshot already gives the viewer.
- The response clock shows the existing auto-pass timing; it does not
  change it.
- Many objects: the fan tightens so a tall stack still fits the board's
  height; past what fits, the oldest compress to their name bars.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0028-A | Every stack object is drawn, in order, numbered, with its owner's colour and caster | unit (layout) + browser |
| F-0028-B | The front card's line shows; pointing at another shows its line instead | browser (dev board script) |
| F-0028-C | An ability shows its source's picture and a line to the source | unit + browser |
| F-0028-D | Resolving: the front card plays its effect and leaves; the numbers update | browser |
| F-0028-E | The response clock shows while asked and stops when answered | browser |
| F-0028-F | A tall stack (8+) fits; nothing overlaps the column or leaves the board | unit (layout) |
| F-0028-G | It looks right in real games | owner |

## Decisions for the owner

All taken 2026-10-28 (see the top).

## Amendments

None. Note (2026-10-28, as built): the number and the caster's picture sit
just left of each card's name bar rather than on its corners, so neither
covers the name; the caption under the front card has a dark backing,
since it often sits over the board's right-hand cards.
