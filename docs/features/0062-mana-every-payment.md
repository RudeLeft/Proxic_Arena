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

### Amendment 1 -- As built (2026-11-08)

**Worker: what each mana paid, as it is paid.** New `Payments` (a
bounded ledger, the last 24 steps, numbered like the dice rolls) and a
`payments` list on every seat's snapshot (and the spectators'). Each step:
{n, seat, payment, for "card:N", kind cast|spell|ability|trigger, cost
(when the payment began), owing (after the step), mana [{colour
W|U|B|R|G|C, shard (the symbol it paid: "1", "B", "B/G", "B/P"...), from
"card:N" | "pool" | "life"}]}. `ManaPayment` records a permanent tapped
(Forge's `ManaPool.payManaFromAbility`, ported call for call so the
unpaid symbols are read around EACH mana -- Forge's own choice, not a
guess afterwards), mana already made (`tryPayCostWithColor`), and 2 life
for a Phyrexian symbol (colour = the symbol's colour); convoke and
improvise (`MatchController.chooseCardsForConvokeOrImprovise`) record
each creature or artifact tapped, and the mana that follows is the same
payment (its cost is the whole one, {4}{W}). Not while a cost is only
being checked (`CHECKING`). A step rides the next snapshot, which comes
at once: the next payment question's, or -- after the last mana, which
has no question -- the one with the spell on the stack (a snapshot of its
own after the last mana showed a "being cast, stack empty" board the game
never stops in, and the Lab's "stack empty = done" read it as the end:
check-mana-pool failed; dropped). Hidden
information: a spell still being cast (and an ability of a face-down
card) keeps `cost`, `owing` and `shard` to its payer; the others get the
colour and source only (the land tapped, the mana display and the life
total are public). Abilities, triggers and spells already on the stack
are told in full to everyone. Protocol: `protocol/README.md` `payments`.

**Page (look C · Spark arc, `manaBalls.tsx`).** One ball per mana, 0.62 s
on an arc rising 0.42 of the distance, ~13% of a card's height, dropping
twinkling sparks (fall 0.48 s); several from one tap set off 70 ms apart;
the symbol pops (x1.38, 0.26 s) and lights in that mana's colour with six
sparks. Colours are the canvas's (W warm white, U blue, B dark with a pale
ring, R red, G green, C grey). The balls are drawn on a layer over the
whole page, so they leave the rail's life total (Phyrexian) and mana
display (`data-pool`; the last place it was drawn if it just emptied).
Each step's mana goes to the first free pip of the symbol it paid
(`assignBalls`); the pip is drawn lit (`data-paid-by`, `data-ball`) and
held unlit until its ball lands. The card being cast stays exactly where
it is until every ball for it has landed and its symbol popped (in the
animations' own time, so a hurry or a slowed clock keeps them together) (at most 8 s, if a background tab never runs them), then flies as
before (its last step arrives with the board where it is already cast);
a spell that already resolved stays hidden on the battlefield
meanwhile. "Still to pay" now keeps every symbol (a grey pip per generic)
and lights each; it stands on the front stack card, or -- an ability, put
on the stack only once paid -- where the first stack card goes; the other
player sees it too while its balls fly, and everyone for 0.6 s after the
last lands. The other player's view of a spell being cast: the balls fly
into its back, no symbols. A click or key hurries them (Phase 10's
HURRY_MS); reduced motion: no ball, the symbol is just lit. Spec 0058's
one spark from the land just tapped is gone.

**Tests.** Worker JUnit `PaymentsTest` (8). Lab `check-mana-balls.py`
(in CI's list): nekrataal (G->{1}, B->{B}, B->{B}, last B->{1}, sent while
still casting; seat 2: same steps, no cost), sol-ring (one step, two C),
phyrexian (two {B/P} from life, a Swamp's B -> {1}), convoke (three Lions
then two Plains, one payment of {4}{W}), floating (pool C -> {1}),
ability (cycling Forgotten Cave: R -> {R}, told to both seats); each
seat must have every step, the last too, by the first board after the
cast. Page `fixes0062.test.tsx` (10):
colours and pips incl. the last, Sol Ring, an older cast, Still to pay,
Phyrexian and pool, a ball in its colour to the right pip, the
opponent's back, the hurry, reduced motion; with `assignBalls` disabled 7
fail, with the hurry removed 1 fails.

**Not done / known.** When the card then flies, its cost row goes with no
fade (as before this spec; the flight draws the card only). The other
player sees the spell on the stack while its back waits for the last
ball and turns over (as during spec 0044's reveal). Not seen in a live
two-browser game: convoke, Phyrexian life, floating mana and an
ability's pill were proven by the Lab (data) and page tests (drawing)
only; the film is Lab boards replayed into the real page.

**Filmed** at one-tenth speed (tools/jumps clips, now with `more`/`at` to
film a whole payment; `payments` is part of a board's signature):
Nekrataal paid Forest + 3 Swamps, Sol Ring's two grey balls, and the
other player's view.
