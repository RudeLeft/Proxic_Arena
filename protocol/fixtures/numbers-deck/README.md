# The numbers test deck

A legal 60-card Open Format deck for the questions whose answer is a
number (PHASE_09 W-11, owner 2026-11-03).

```text
Numbers Test Deck.txt   24 Mountain, 4 Gray Ogre, 4 Hill Giant (targets)
                        X:        4 Fireball, 4 Rolling Thunder, 4 Comet Storm
                        divide:   4 Arc Lightning, 4 Forked Bolt,
                                  Rolling Thunder, Fireball
                        how many: 4 Everflowing Chalice, Comet Storm
                                  (multikicker)
                        a number: 4 Harnessed Lightning (energy)
```

Used by `frontend/e2e/match-numbers.spec.ts`. Build the package with:

    node scripts/make-ci-deck.mjs "Test Deck/numbers-deck.zip" protocol/fixtures/numbers-deck
