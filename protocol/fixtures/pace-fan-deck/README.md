# The pace-fan test deck

A legal 60-card Open Format deck for spec 0106's real-click game
(F-0106-I): a graveyard holding more cards you may cast than the fan has
places, so the fan shows six and a "+N".

```text
Pace Fan Test Deck.txt   24 Island, 20 Swamp
                         4 Glimpse the Unthinkable: the host mills itself 10
                         4 Think Twice, 4 Deep Analysis, 4 Dream Twist:
                           flashback, every one castable from the graveyard
                           with three lands
```

Both seats bring it; spec 0098's test deal stacks the host's library so
Glimpse mills nine or ten flashback cards (whoever goes first). Used by
`frontend/e2e/match-pace-fan.spec.ts`. CI builds the package with
`scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/pace-fan-deck.zip" protocol/fixtures/pace-fan-deck
