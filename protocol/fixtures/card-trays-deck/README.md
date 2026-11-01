# The card trays test deck

A legal 60-card Open Format deck for the trays where a player handles
cards nobody else sees (PHASE_09 group 3, W-07..W-10, owner 2026-11-01).

```text
Card Trays Test Deck.txt   14 Island, 10 Swamp, 4 Evolving Wilds
                           order:   4 Ponder, 4 Brainstorm, Impulse's rest
                           rows:    4 Preordain (scry 2), 4 Opt (scry 1)
                           hidden:  4 Demonic Tutor, 4 Impulse, Evolving
                                    Wilds, 4 Thoughtseize
                           piles:   4 Fact or Fiction
```

Both players cast whatever of these they can and answer every tray by
clicking. Used by `frontend/e2e/match-card-trays.spec.ts`. CI builds the
package with `scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/card-trays-deck.zip" protocol/fixtures/card-trays-deck
