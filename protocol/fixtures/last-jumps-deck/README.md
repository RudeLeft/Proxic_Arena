# The last-jumps test deck

A legal 60-card Open Format deck for spec 0099's real-click game
(F-0099-G): a card cast out of your library, and a creature paid as a
cost going into the graveyard fan.

```text
Last Jumps Test Deck.txt   16 Forest, 12 Island, 12 Swamp
                           4 Llanowar Elves (mana sooner)
                           4 Evolving Wilds, 4 Panglacial Wurm: cast the
                             Wurm while the Wilds searches the library
                           4 Agent of Kotis (Renew, from the graveyard),
                           4 Village Rites: sacrifice the Agent to pay
```

Both seats bring it; spec 0098's test deal gives each the cards for its
half. Used by `frontend/e2e/match-last-jumps.spec.ts`. CI builds the
package with `scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/last-jumps-deck.zip" protocol/fixtures/last-jumps-deck
