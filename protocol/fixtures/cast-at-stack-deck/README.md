# The cast-at-stack test deck

A legal 64-card Open Format deck for spec 0110's real-click game
(F-0110-F).

```text
Cast At Stack Test Deck.txt   24 Swamp, 12 Plains, 12 Island
                              4 Victim of Night: the host's spell, at the guest's Gryff Vanguard
                              4 Disfigure: the host's second spell, cast with one entry on the stack
                              4 Gryff Vanguard: the guest's creature the old middle card covered
                              4 Elite Vanguard: the guest's creature Disfigure is aimed at
```

Both seats bring it; spec 0098's test deal gives each seat its cards,
whoever goes first. Used by `frontend/e2e/match-cast-at-stack.spec.ts`. CI
builds the package with `scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/cast-at-stack-deck.zip" protocol/fixtures/cast-at-stack-deck
