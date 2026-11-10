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
