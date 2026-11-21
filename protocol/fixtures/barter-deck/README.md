# The barter test deck

A legal 60-card Open Format deck for spec 0112's real-click game
(F-0112-E).

```text
Barter Test Deck.txt   48 Swamp
                       4 Barter in Blood: "Each player sacrifices two creatures."
                       4 Typhoid Rats: each seat's first creature
                       4 Walking Corpse: each seat's second creature
```

Both seats bring it; spec 0098's test deal gives each seat Swamps, one
Typhoid Rats and one Walking Corpse, and the host Barter in Blood. Used
by the second test in `frontend/e2e/match-sacrifice.spec.ts`. CI builds
the package with `scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/barter-deck.zip" protocol/fixtures/barter-deck
