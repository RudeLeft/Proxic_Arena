# 0062 — A spark of mana for every payment

**Status:** Approved 2026-11-07 (owner, on the canvas "mana-1107", sent as a file)
**Owner decisions:** look C · Spark arc; the plan as written on the canvas

## Why

The owner likes the glowing ball that flies from a tapped land to the
symbol it pays (spec 0058 item 6) and wants it for every payment. Today
it plays only for the card you are casting, only for you; never for the
last mana of a payment (that symbol never lights); gold, not the mana's
colour, for colourless, dual or any-colour sources; one ball per tap; no
ball for mana already made, abilities ("Still to pay"), convoke or
Phyrexian life.

## Built (look C · Spark arc)

A small ball on a higher arc dropping twinkling sparks; the symbol pops
when it is hit and lights in that colour. For every payment with a mana
symbol on the card being paid for: casting (the last mana too), an
ability's "Still to pay", a creature or artifact making mana, mana
already made (the ball leaves the player's mana display), convoke and
improvise (from the tapped card), Phyrexian life (from the life total).
The ball is the colour of the mana actually made -- W warm white, U
blue, B dark with a pale ring (visible on the felt), R red, G green,
colourless grey; one ball per mana (several from one tap fly together);
each goes to the symbol the game actually paid (its own colour first,
then a two-colour symbol, then generic). The other player sees the balls
too; into a spell still face down to them they fly to the back with no
symbols (its cost stays hidden). A click hurries them; reduced motion
lights the symbol with no ball. The worker says what each mana paid as it
is paid (so the last one and the other player's view work).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0062-A | Each mana's ball in its colour to the symbol it paid, the last included | page test; Lab; slow-motion clip |
| F-0062-B | Abilities, mana already made, convoke, Phyrexian life get balls | page tests; clip |
| F-0062-C | The other player sees the balls, never the hidden cost | Lab hidden-info check; clip |

## Amendments
