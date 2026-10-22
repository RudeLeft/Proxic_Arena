# The interaction test deck

A legal 60-card Open Format deck for clicking on the board in a real
game (PHASE_07 P7-G, P7-H).

```text
Interaction Test Deck.txt   24 Mountain
                            burn that needs a target: 4 Shock,
                            4 Lightning Bolt, 4 Lightning Strike
                            creatures with nothing to activate: Raging
                            Goblin, Goblin Piker, Gray Ogre, Hill Giant,
                            Mons's Goblin Raiders, Bladetusk Boar (4 each)
```

The host puts a creature on the battlefield and clicks it while nothing
is being asked about it (it is selected; nothing attacks), and starts a
burn spell, then cancels at the target question (nothing is cast).

Used by `frontend/e2e/match-interaction.spec.ts`. CI builds the package
with `scripts/make-ci-deck.mjs`.
