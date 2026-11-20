# The quiet-windows test deck

A legal 68-card Open Format deck for spec 0109's real-click game
(F-0109-G).

```text
Quiet Windows Test Deck.txt   20 Swamp, 20 Island, 8 Forest
                              4 Victim of Night: the host's own spell, the short target window
                              4 Grizzly Bears: the guest's creature it destroys
                              4 Walking Corpse: the host's creature Mist Raven sends home
                              4 Mist Raven: the guest's bounce, with no report window
                              4 Griptide: the host's, on the Raven: the guest's window stays (a library)
```

Both seats bring it; spec 0098's test deal gives each seat its cards,
whoever goes first. Used by `frontend/e2e/match-quiet-windows.spec.ts`. CI
builds the package with `scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/quiet-windows-deck.zip" protocol/fixtures/quiet-windows-deck
