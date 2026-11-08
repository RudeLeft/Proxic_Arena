# 0063 — Attack arrows: ride the middle; the target glows

**Status:** Approved 2026-11-07 (owner, on the canvas "arrows-1107", sent as a file)
**Owner decisions:** curve B · Ride the middle; at rest R2 · the target glows

## Why

Spec 0059 item 9 put a badge (the defender's face) on attackers and a
name pill on pointing; in a real game only one card in a group showed
it, and only one answered the pointer: blocked attackers lose badge,
line and pointer; identical attackers at one target are one drawn card;
a focused card stays "pointed at". The curve (effects.ts curve()) is an
S-bend whose side flips with the direction of travel, lanes in list
order make lines cross, and lines start inside the card's picture.

## Built

- No face badge, no name pill (amends 0059 item 9).
- At rest (R2): each attacker wears ATTACKING and a warm edge; what is
  attacked glows -- the player's life circle with "4 attacking", a
  planeswalker's or battle's frame.
- Every attacker answers pointing, focus or a tap -- blocked ones too
  (a short arrow to its blocker), a pile as one arrow with "×2".
- The curve (B · Ride the middle): the arrow leaves the card's top edge
  straight out, sweeps along the open middle of the table, and lands
  straight onto its target (a player's life circle from the table side;
  a planeswalker's near edge); neighbouring curves nest, never cross,
  never pass over card faces; a fixed arrowhead along the curve; drawn in
  over about 300 ms with its glow, faded out in about 160 ms. The other
  lines the table draws follow the same rule where they can (blocks,
  targets, sources); the stolen and chain arcs stay as built.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0063-A | No face badge or name pill; R2 rest looks | page test; screenshot |
| F-0063-B | Every attacker (blocked, piled) draws its own arrow on pointing | page test; e2e battlefield |
| F-0063-C | Curves leave the top edge, ride the middle, never cross each other or card faces | geometry test; screenshot |

## Amendments

**Amendment 1 — As built (2026-11-07).** Not committed; the page and
browser results below are from this build (`RUN`).

*No badge, no pill; R2 at rest.* `frontend/src/battlefield/Board.tsx`:
`AimBadge`, its `.bf-aim*` CSS and the `playerFaces` prop (only the badge
used it; `GameScreen.tsx` and `DevBoardPage.tsx` no longer pass it) are
gone. The ATTACKING tag and the warm edge (`.bf-attacking`) were already
there and are unchanged. New: an attacked player's life circle gets an
ember halo and an "N attacking" count (`.bf-attacked-life`,
`data-attacked-player`; N counts the unblocked attackers at that player,
pile members each, as the canvas did), drawn by the board at the life
anchor; the count sits on the halo's far side from where its arrows come
in (under your banner, over the other player's). An attacked planeswalker's
frame glows ember, a battle's rust (`data-attacked="true"`); both brighten
while an attacker aimed at them is pointed at (`"hot"`, `.bf-attacked-hot`).

*Every attacker answers.* Pointer, keyboard focus or a tap now work on
every drawn attacker (`data-aims` on each, blocked ones too). A blocked
attacker draws a short ember arrow to each of its blockers (kind
`attack`, `data-to` the blocker) and its blockers light up blue
(`data-pointed-blocker`); a pile draws one arrow with a "×N" chip at the
middle of its length (`data-chip`). Focus points at a card only when it is
keyboard focus (`:focus-visible`), so a click (or focus coming back after
a window closes) no longer leaves a card pointed at.

*The curve as built* (`effects.ts` `ride`, `facingPort`, `lifePort`,
`shownShare`): a line starts at the middle of the attacker's edge facing
the middle of the table (top edge on your side, bottom on the other; tilt
included; on a squeezed line the middle of the part that shows), leaves
straight out, turns into the middle line (y = half the board height,
between the two front lines) over 0.36 card heights, runs straight along
it, and turns out to land straight on its end: a card's edge facing the
middle (a turn of the same shape), or a life circle (it leaves the middle
at the play area's edge, `g.rail.x`, and comes in along the line from
the circle toward that point). The tip stops `TIP_GAP` (0.03 card
heights) off the target. Every card in a row at one target joins the same
ride, so the lines meet and never cross. The arrowhead is
`effectSizes().line × 4.4` on every line, along the curve's own direction
at the tip; the body stops under it (`trimmed`). Drawn in, glow included,
over 300 ms (head at 220 ms, 110 ms); a line that goes fades out over
160 ms (a copy kept outside React's lines, `data-line-leaving`, so counts
of `[data-line]` are unchanged). Reduce motion: no draw-in, no fade.
Blocks (blocker → each further attacker), targets (from the stack card's
left edge at the middle; to a player, from its top or bottom edge, one
curve in along the same landing) and sources (to the stack card's left
edge) use the same rule; no lanes any more. The attach line keeps the old
curve inside the picture; the stolen and chain tethers are unchanged.

*Decisions.* (1) The open middle strip is narrow on the real table (the
front lines are about 12 px apart at 1920×1080, not the canvas's wide
gap), so "ride the middle" is a short turn into the strip and a straight
run along it, not one wide sweep (`INFERENCE`, worked through on
attack8: the canvas's single curve, scaled, leaves the 12 px strip about
300 px from its start and lies on the other front line's cards). (2) Next to the middle there
is less room than the arrowhead's length: the head then reaches into the
card above the middle, over its bottom bar's empty middle (a blocked
attacker's short arrow, a target or attacker just across), never over the
name bar of a card below. (3) A planeswalker or battle behind its own
creatures is landed on as specified (its near edge), so that line crosses
the creature in front of it; the "no card faces" test covers players. (4)
Lines into a life circle cross the edge of the player's plate (its
tiles) on their way in, never the life total. (5) Attach lines (dev board
only) are not changed: the spec names blocks, targets and sources.

*Tests:* `effects.test.ts` "attack arrows ride the middle (F-0063-C)":
starts on the edge facing the middle, straight out, reaches the middle,
tip at the life circle's rim + gap from the table side, a fixed-size head
along the tangent; no two arrows of a row cross and none passes over any
card on the owner's ten boards and the dev boards, every creature of a
side attacking, both seats, at 1920×1080, 1920×947, 2560×1440 and
3440×1440; a planeswalker landed on its near edge; ends straight across
do not wander. `Board.test.tsx` (57): no badge or pill; R2 halo and
"2 attacking", the planeswalker's glow and its brightening; the line on
pointing, keyboard focus and a tap, a click's focus not sticking; a
blocked attacker's arrows and lit blockers; a pile's "×15" and the next
pile answering; "299 attacking" with a blocked one pointing at its
blocker; the fade-out and reduced motion; a target line from the stack.
Each was seen to fail with its part removed (focus sticking, no blocked
arrow, handlers on unblocked attackers only, not riding the middle,
starting inside the picture, no fade-out, no count). 938 page tests;
`tsc`, `eslint --max-warnings=0`, `prettier --check` clean. On the
rebuilt local stack: `battlefield.spec.ts` (no badges; pointing at every
drawn attacker, blocked ones included, draws exactly its arrows, ends
checked against the new tip gap), `match-big-combat.spec.ts`,
`match-damage-tray.spec.ts`: all pass. *Dev page:* `&blocked=N` (the
defender's first N untapped creatures block the first N attackers) and a
dev board `arrows` (the canvas's: a pile of two Bears, the Goblin at
Chandra with `&pw=1`).
