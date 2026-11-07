# 0059 — Attack badges, sharing lines before shrinking, lands nearer the hand

**Status:** Approved 2026-11-07 (owner, on the canvas "table-1107", sent
as a file)
**Owner decisions:** arrows B (badges, lines on pointing); share lines
before shrinking: yes; lands: Option 1 (lands lower)

Items 9-11 of the owner's list of 2026-11-07 (items 1-8 are spec 0058).

## 9 · Attack arrows: badges, the line when you point (B)

Today every unblocked attacker draws its own long orange curve to the
player or planeswalker it attacks, fanned apart into lanes, so eight
attackers cross the whole table. Built: no long attack lines at rest;
each attacker wears a small badge showing what it attacks (the player's
portrait, or a planeswalker/battle icon). Pointing at an attacker (or
focusing it with the keyboard, or tapping it on a touch screen) draws
its full line, as today. The other lines (blocks, targets, sources, the
stolen and chain arcs) are unchanged. Every line the table draws is
listed in the canvas.

## 10 · Share a line before shrinking

Since 1.48.0 (Phase 10 Amendment 16, contract §7b) a side with fighting
creatures, other creatures, other permanents and lands drops a size
step during combat however few cards it has. Built: before any size
step, kinds share a line -- first the other permanents share the land
line (lands from one end, the others from the other, a gap between),
then creatures not in combat share the creature line behind the front
line -- and a size step is taken only when a shared line would overflow.
The front line stays alone. The canvas's rough rule: one side stays full
size up to about 29 cards. Contract §7b and Amendment 16 are amended to
match; nothing may ever overlap (the 12-200 permanent sweep holds).

## 11 · Lands nearer the hand (Option 1)

Your land line is already the line nearest your hand; it moves down to
about 4 px above the hand's resting top (today about 18 px at
1920x1080), the hand unchanged; the other player's land line mirrors
it. Spec 0040's band and the contract's mirror rule are amended for the
land line only; nothing may touch the hand fan.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0059-A | Attackers wear target badges; no attack line at rest; the line shows on pointing | page test; screenshot with 8 attackers |
| F-0059-B | A 7-card side in combat stays full size; sharing before any size step; no overlaps at any count | layout test sweep; battlefield.spec |
| F-0059-C | The land line sits ~4 px above the hand at 1920x1080, mirrored | layout test; screenshot |

## Amendments
