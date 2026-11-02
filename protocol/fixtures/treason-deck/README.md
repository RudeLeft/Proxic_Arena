# The stolen-creature test decks

Two legal 60-card Open Format decks that exist to put one player's
creature under the other player's control (spec 0049):

```text
Treason Test Deck.txt   40 Mountain
                        20 "gain control of target creature until end
                           of turn": Act of Treason, Threaten,
                           Traitorous Blood, Kari Zev's Expertise, Hijack
                        no creatures at all

../goblin-deck/
Goblin Test Deck.txt    40 Mountain
                        20 one-drop red creatures
```

The host plays the Treason deck, the guest the Goblin deck. The guest
casts creatures; the host takes one. A creature's picture is in its
OWNER's deck, and the Treason deck carries no creature pictures at all,
so a stolen creature that wears a picture can only have found it in the
guest's deck. Before spec 0049 it was looked for in the controller's
(the thief's) and came out bare. The spent steal spell, in the host's
graveyard, wears its picture too: graveyards had none before 0049.

Used by `frontend/e2e/match-stolen-picture.spec.ts`; the worker-level
check (`scripts/check-card-owner.py`) uses its own non-legal deck. CI
builds both packages; locally:

```text
node scripts/make-ci-deck.mjs "Test Deck/treason-deck.zip" protocol/fixtures/treason-deck
node scripts/make-ci-deck.mjs "Test Deck/goblin-deck.zip" protocol/fixtures/goblin-deck
```
