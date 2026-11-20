# The small-fixes test deck

A legal 78-card Open Format deck for spec 0108's real-click games
(F-0108-G, F-0108-H, F-0108-I).

```text
Small Fixes Test Deck.txt   20 Plains, 6 Forest, 6 Swamp, 14 Island
                            4 Rebuke: the spell with nothing to target until something attacks
                            4 Slayer of the Wicked: its trigger aimed at a Zombie (the stack plate)
                            4 Butcher Ghoul: the Zombie
                            4 Grizzly Bears: the attacker Rebuke destroys
                            4 Mist Raven, 4 Sharpened Pitchfork: a flyer with a tab
                            4 Screeching Skaab, 4 Thought Scour: the two mills
```

Both seats bring it; spec 0098's test deal gives each seat its cards,
whoever goes first. Used by `frontend/e2e/match-small-fixes.spec.ts`. CI
builds the package with `scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/small-fixes-deck.zip" protocol/fixtures/small-fixes-deck
