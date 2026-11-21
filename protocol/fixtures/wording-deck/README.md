# The wording test deck

A legal 60-card Open Format deck for spec 0113's real-click game
(F-0113-G).

```text
Wording Test Deck.txt   28 Island
                        24 Swamp
                        4 Nagging Thoughts: "Look at the top two cards of your
                          library. Put one of them into your hand and the other
                          into your graveyard." (W1-141's report window)
                        4 Weaponcraft Enthusiast: Fabricate 2, whose cost is
                          "Put two +1/+1 counters on it?" (W1-223's cost window)
```

Both seats bring it; spec 0098's test deal gives the host Islands, Swamps,
Nagging Thoughts and Weaponcraft Enthusiast, with an Island and a Swamp as
the two cards Nagging Thoughts looks at, and the guest lands only. Used by
`frontend/e2e/match-wording.spec.ts`. CI builds the package with
`scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/wording-deck.zip" protocol/fixtures/wording-deck
