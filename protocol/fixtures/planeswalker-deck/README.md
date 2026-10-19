# The loyalty test deck

A legal 65-card Open Format deck that exists to reach decisions a
deck of basic lands cannot.

```text
Loyalty Test Deck.txt   45 Plains
                        4 Elspeth Resplendent
                        4 Steel Wall
                        4 Wall of Omens
                        4 Perimeter Captain
                        4 Yoked Ox
```

## Why this deck and not the CI gate deck

The CI gate deck next door is 65 basic lands, deliberately — its
README explains why, and that reasoning is sound for what it is
for. But a deck of 65 lands **never casts anything**. It cannot
activate an ability, pay a cost that is not mana, put a counter on
a permanent or choose what kind of counter it is. A browser test
driving that deck can only ever prove that a game starts.

## Why these cards

Elspeth Resplendent's `+1` is the one shape in the pinned Forge
pool that asks `chooseCounterType` with more than one candidate:
"a counter from among flying, first strike, lifelink, or
vigilance". Every other card that chooses a counter type sets
`EachExistingCounter`, which loops over all of them and never asks.

Her loyalty cost is also what exposed `CostPutCounter` — no
planeswalker ability could be activated at all until that cost was
implemented, and this deck is what made that fail loudly instead of
never being tried.

Sixteen 0/4s, and every one of them is the point. The `+1` needs a
creature: with none in play it has no legal target, `TargetMin$ 0`
means Forge does not ask, and the decision under test never
happens.

The first version of this fixture used 2/1s and 2/2s. They attack,
they trade, and the board empties -- two runs in five reached the
end of a game without ever once having a creature in play at the
moment Elspeth was activated. A 0/4 survives everything these decks
can attack with, and a Defender cannot attack at all, so a target
is there from the first one cast until the game ends.

Four of each because Open Format allows at most four copies of a
card that is not a basic land, and a fixture that breaks the format
it is testing is not a fixture. Five different ones because four
copies of anything is not enough on its own.

45 Plains because Elspeth costs `{3}{W}{W}` and a test that loses
to mana is a test that reports a fault it did not find.

## What it is not

Not a good deck, and not meant to be. It is chosen to reach a
branch, which is how this project avoids the defect it keeps
meeting: code that exists, is tested, and is never called.

The zip is built at test time by `scripts/make-ci-deck.mjs`, which
takes a fixture directory as its second argument:

```bash
node scripts/make-ci-deck.mjs frontend/build/loyalty-deck.zip protocol/fixtures/planeswalker-deck
```

Artwork is generated from the decklist, one flat-coloured rectangle
per card name. Nothing here is a real card image, and `*.zip` stays
gitignored (AGENTS GIT-001).
