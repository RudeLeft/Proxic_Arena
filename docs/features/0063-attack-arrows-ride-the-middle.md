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
