# 0069 — Arrows with effects: molten blade, beam, ripple, shield-and-steel

**Status:** Approved 2026-11-09 (owner, by prompt, on the filmed canvases "arrow-looks-1109" a-d and the earlier arrow review in the Deck Builder chat)
**Owner decisions:** Attack A2 · Molten blade (at a player only when pointed at; at a planeswalker or battle always). Spell or ability at a card T4 · Beam, landing with L3 · Ripple and sparks (the rune circle is dropped so cards and players match). Spell at a player: the same beam in one gentle arc onto the player's life shield, landing with L3 · Ripple and sparks. Blocks B4 · Shield and steel with the swords' clash, one fixed size; 1-3 blockers one mark each, 4 or more one centred mark with the number; no arrows. Attach: glow and tab preview, no line. Source: today's dotted thread stays. Also: the target pointer shows while choosing targets, and a spell or ability aimed at something on the stack (a counterspell) marks it.

Supersedes the arrow looks of specs 0063 and 0066 (their timing rules stay: a stack arrow waits for its card to land).

## Built

1. **Attack:** a molten blade (white-hot point, heat haze, drifting sparks) from the attacker to what it attacks. At a player it shows only while the attacker is pointed at (resting look as 0063); at a planeswalker or battle it is always drawn. A blade at a planeswalker directly above swings round to its side edge and never runs across its card.
2. **Spell or ability at a card:** a gold beam from the stack card's stud, stopping at the top edge of the target card (never down over its name), with rings rippling out from the target and small sparks.
3. **Spell or ability at a player:** the same beam, one gentle arc, onto that player's life shield -- from the stack card's top edge for a shield above it, from its bottom corner for a shield below it -- with the same ripple and sparks round the shield; the life number is never covered. Crossing a panel for the moment the spell is on the stack is accepted.
4. **Something on the stack as the target** (a counterspell): the targeted stack card gets the same ripple, with the beam between the two.
5. **Choosing targets:** while you choose, the beam follows your pointer from the card being cast, and the ripple shows on what you point at.
6. **Blocks:** a shield-and-steel mark per blocker on the attacker's picture, between its name and its ATTACKING tag, always the same size; the swords clash with a spark burst when the block is declared; with 4 or more blockers one centred mark shows the number. A blocker not facing its attacker keeps a short dotted bar with the mark. No block arrows.
7. **Attach** (auras, equipment): no line; the attached card glows with its host and the tab preview shows what it is on. The unused `attaching` chain is removed.
8. Reduce motion: every look is a still picture.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0069-A | Attack blade rules (player only when pointed at; planeswalker always; never across the planeswalker's card) | page test; clips |
| F-0069-B | Beam ends at the card's top edge; ripple on the target; none over a name | page test; clips |
| F-0069-C | Player target lands on the life shield in one arc; number not covered | geometry test; clips both seats |
| F-0069-D | Stack-object target marked | page test; clip |
| F-0069-E | Pointer beam while choosing targets | page test; clip |
| F-0069-F | Block marks: fixed size, 1-3 side by side, 4+ one with a number; no names/tags covered | page test; clips |
| F-0069-G | No attach line; glow and tab preview | page test |
| F-0069-H | Reduce motion stills | page test |

## Amendments

### As built (2026-11-10)

**The looks** are `frontend/src/battlefield/Arrows.tsx`: `AttackBlade` (item 1), `Beam` and `Ripple` (items 2-5), `SwordsMark` (item 6). Everything that moves is a CSS or SVG animation of opacity, a transform or a dash offset; nothing runs per frame in script. The dev-only look switch and every look not chosen (A1, A3, A4, T1-T3, the rune circle, R1-R6, L1, L2, L4, B1-B3) are gone, with the old arrowhead, the arrow body's draw-in and `effects.ts` `curve`, `arrowHead` and `trimmed`.

**1. Attack.** `bladePath` makes the route a tapering shape. At a player it is drawn only while its attacker is pointed at (as 0063); at a planeswalker or battle always. At a permanent the blade runs from the attacker's edge facing the middle to the target's edge facing it (`attackOnto`), so it never comes down across the card; when the two stand face to face across the middle (less than 0.7 of a card apart) it leaves the attacker's side edge near the corner, swings out, and comes in at the middle of the target's side edge.

**2. Card target.** The beam is the 0066 arc from the stack card's stud and now stops at the card's top edge (the first build's run down over the name to the crosshair is gone). The ripple is centred on the picture (42% down), a tenth of a card high in radius: clear of the name bar and the type line.

**3. Player target.** `beamToBanner`: one cubic from the stack card's top edge near its right corner (shield above the card) or its bottom-right corner, right of the caption (shield below it), onto the shield's rim; a plain arc from the facing side if the shield is beside the card. The ripple's ring is the shield's own radius plus the tip gap, with nothing drawn inside it. The 0066 route round the stack (`arcToRing` with `studRound`) is no longer used for a stack card; `arcToRing` still carries an attack to a player.

**4. Stack target.** The worker does send it (a Counterspell's target arrives as `{"object": "stack:N"}`; nothing was drawn before because a stack card is not on the table). The ripple sits left of the targeted stack card's badges, level with its name bar; the beam runs from the pointing card's stud to the ripple's rim. If the targeted object is one of those too far down to be drawn, nothing is shown.

**5. Choosing targets.** `AimPointer.tsx`, drawn by the game screen while the question is "choose targets" and is yours: the beam runs from the card being cast (in the middle of the screen), or the permanent whose ability it is, or else the front stack card, to just short of the pointer; on something that can be chosen (`data-choosable`) the ripple shows on it (a card's picture, a player's whole shield) and the beam ends on its rim. The pointer is followed by one listener that sets three attributes, outside React, so moving the mouse never re-draws the board. No beam while the pointer is inside the card being cast and on nothing.

**6. Blocks.** Radius 0.13 of a card's width, always. Marks of blockers facing an attacker sit on the attacker's picture at 27% down (73% for an attacker above the middle): one in the middle, two or three spread from 20% to 80% across in the blockers' left-to-right order, four or more one mark in the middle with the number in a badge. The swing and the burst play once, as the mark arrives. At the damage step Forge has already cleared the blocks, so the marks go and Phase 10's fights play. A blocker not facing its attacker keeps the dotted bar, with its mark at the same size.

**7. Attach.** No line anywhere: the `attaching` prop, `AttachView`, the copper theme and the dev board's step are removed. Kept as they were: the tab on the host (A-17) and its arrival glow. New: while you choose where an Aura (being cast) or an Equipment or Fortification (its ability) goes, the creature you point at shows a dashed gold tab with the card's name on its right edge, where the tab will be (`AimPointer` with `attach`), in place of the beam. The creatures you can choose glow as any choice does.

**8. Reduce motion.** The moving parts (embers, ripple rings and sparks) are not drawn at all; the stylesheet stops the rest (fade-ins, haze, glow, flowing light, swing, glint) and hides the burst.

**Decisions made here; say if any should change.** The beam while choosing starts at the edge of the big card in the middle, so pointing at something the card covers gives a very short beam (the ripple still shows, and the card fades as in 0068). The tab preview decides "Aura or Equipment" from the card's type line. A stack target's ripple is beside the card, not on it, so it never covers a stack card's name.

**Evidence.** Page tests: `Board.test.tsx` (F-0069-A blade rules and no blade point on the planeswalker; F-0069-F sizes, places, 3 in a row, 4 and 5 as one numbered mark, clear of name, type line and tag; F-0069-G no attach line), `fixes0069.test.tsx` (F-0069-B, the player ripple, F-0069-D, F-0069-E, the tab preview, F-0069-H), `effects.test.ts` (F-0069-C: 5 screen sizes, 1-6 stack cards, both players: one arc, on the rim, never turning back, never inside its card or the ring). 1006 page tests pass; tsc, eslint and prettier clean. Browser: `e2e/battlefield.spec.ts` (updated: an attack at a planeswalker is always drawn; no attach line), `match-big-combat`, `match-cast-aside` and `match-casting-dock` pass on the rebuilt local stack. Filmed at 1920x1080 from Lab games: `frontend/zz-canvas/arrow-final-1109.html` (creature, both players, Counterspell, choosing a target, four attackers, planeswalker, 1, 2 and 4 blockers). Not filmed: the tab preview (no Aura or Equipment in the Lab decks used).
