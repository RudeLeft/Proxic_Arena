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

**Amendment 1 — As built (2026-11-07).** Not committed; page and e2e
results below are from this build (`RUN`).

*Item 9 — badges, the line on pointing.* `frontend/src/battlefield/Board.tsx`:
an attack line is added only for the attacker pointed at (`aimed`: pointer
enter/leave with a mouse or pen, keyboard focus/blur, and on a touch screen
a tap that toggles it, since a finger has no pointing); one line per drawn
card as before (a pile of 15 is one line, "×15"). Each unblocked attacker
carries `AimBadge`: the defending player's picture (new optional prop
`playerFaces`, seat → picture; `GameScreen.tsx` passes each participant's
avatar, the same `avatarOf` the plates use; the default face without it),
or a blue diamond with the planeswalker mark (a rust one with crossed
blades for a battle, from Forge's type line). While it is pointed at, the
name shows on the card ("You", the other player's name, or the
planeswalker's). The card's words say it too ("attacking you",
"attacking The Wandering Emperor"). New hooks: `data-aims` on the attacker,
`data-aimed` while pointed at, `data-attack-badge="player:N|card:N"` on
the badge. Blocks, targets, sources, stolen and chain lines unchanged.
`battlefield.css` `.bf-aim*`. *Decision:* the badge sits on the card's
right under its name, as on the canvas, but moves low on the left when the
line is squeezed (the next card covers a squeezed card's right side); the
name sits under the ATTACKING tag so it covers neither the card's name nor
its tag (the first screenshot showed it overlapping the tag).

*Item 10 — sharing a line.* `frontend/src/battlefield/layout.ts`:
`sizeSide` tries, at each size, the side's own lines, then
`Sharing` "land", then "creature" (`SHARINGS`), and steps down only when
none shows every card at least half; `planSide(…, sharing)` lays the
shared line; `planShared` gives each kind its own stretch -- the host kind
from the left end, the others from the right end, oldest at the end
(newer further in, so nobody moves when one arrives), `SHARE_GAP` = 0.5
reference pitch between; when they would meet, both squeeze by about the
same share. `Line.rect` is each kind's stretch, `shared: true`; the layout
reports `sharing` per side. Line ids never change (`other-1`, `land-1`,
`creature-2`), so a sharing that begins or ends is a Glide. The front line
is never shared. `SHARE_SHOW` = `SHOW_MIN` (0.5). *Decision, to confirm
with the owner:* the canvas's slider counted a shared line full as soon as
cards overlapped at all (its "about 29 cards"); the brief said a shared
line overflows when cards would show less than half, as any line. Built:
the brief's rule -- on the canvas's mix a side in combat stays full size
past 60 cards at 1920×1080. With `SHARE_SHOW` = 1 (one constant) it is
the canvas's stricter rule: land line shared to 30 cards, creature line to
47, then 90%, 80%, 75% (measured).

*Item 11 — lands nearer the hand.* `layout.ts` `LAND_GAP` = 4/1080 of the
height; `BAND_EDGE`: each band reaches on, at the player's edge only, to
LAND_GAP above the hand's resting top (opponent's band 0.0870–0.4975, was
0.0964–0.4975). *Decision:* the 4 px is from the land LINE (whose height
holds a tapped land's tilted corner), so an untapped land's edge is about
8 px from the hand (18 before) and a tapped one's lowest corner about
4 px; measured from the card's edge, a tapped land's corner would reach
0.2 px into the hand's middle card, and the spec says nothing may touch
it. Lines from the middle and the lines a band holds at each size are
unchanged.

*Docs:* contract §7b amended, new §7c, header; spec 0040 Amendment 2;
`BATTLEFIELD_RENDERING.md` (attack lines on pointing);
`PHASE_10_ANIMATION_LOCKED.md` note after Amendment 18. *Dev page:*
`/dev/board?…&combat=1` makes a board's attackers attack (`&pw=N`: the last
N at the defender's first planeswalker), with players' pictures; two dev
boards `attack8` and `fight7` (`scenarios.ts` `DEV_BOARDS`, not among the
owner's ten).

*Tests:* `layout.test.ts` 127 (new: a 7-card side in combat full size on
every screen and seat; lands left / others right / the gap, squeezed too;
the order land → creature → size step; the canvas's mix full size to 40;
the land line 4 px from the hand on every screen, mirrored; no land, tapped
or not, touching either hand fan at 1-15 cards; only the land line moved;
the 12/40/90/200 sweep now card by card, and reaches sharing). `Board.test.tsx`
53 (badges, faces, planeswalker mark, the line on pointing / focus / a tap,
nothing moves on pointing, the default face; three tests changed: no
attack lines at rest). Each fails with its part removed (sharing off,
creature sharing off, others from the left, no gap, the old or no land gap,
lines at rest, no touch). 903 page tests. e2e on the rebuilt local stack:
`battlefield.spec.ts` (lines at rest without attack lines; badges; pointing
at each attacking card draws exactly its line, ends checked, then gone),
`match-big-combat.spec.ts`, `match-damage-tray.spec.ts`: all pass.

**Amendment 2 — the owner's shrink rule (2026-11-07).** Asked which
rule (prompt), the owner chose "only when cards would overlap": `SHARE_SHOW`
= 1, the canvas's rule -- a shared line holds its cards side by side and is
full as soon as they would overlap (measured at 1920x1080: the land line
shared to 30 cards, the creature line to 47, then 90%, 80%, 75%). Tests
changed to that rule; 903 page tests; `battlefield.spec.ts`,
`match-big-combat.spec.ts`, `match-damage-tray.spec.ts` pass on the rebuilt
local stack. Screenshots shown to the owner and approved.
