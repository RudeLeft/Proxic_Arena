# The trample test deck

A legal 60-card Open Format deck for spec 0107's real-click game
(F-0107-L): lands and creatures only, so nothing is ever cast in combat.

```text
Trample Test Deck.txt   24 Forest
                        4 Garruk's Companion: the trampler (3/2, trample)
                        4 Llanowar Elves, 4 Elvish Mystic: the blockers (1/1)
                        the rest other green creatures, for the shuffle
```

Both seats bring it; spec 0098's test deal gives the host a Garruk's
Companion and Forests, and the guest Forests with a Llanowar Elves and an
Elvish Mystic, whoever goes first. Used by
`frontend/e2e/match-trample.spec.ts`. CI builds the package with
`scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/trample-deck.zip" protocol/fixtures/trample-deck
