# The reports-and-comfort test deck

A legal 60-card Open Format deck for spec 0103's real-click game
(F-0103-G): a fetch land cracked by the guest (the host's report window,
replayed by R and by its medallion), Brainstorm cast by the host (the cards
it put back, known on top of its library), the plates' "this turn" counts,
and the "Bigger text" switch.

```text
Reports Comfort Test Deck.txt   32 Island, 8 Swamp
                                4 Flooded Strand, 4 Polluted Delta: the
                                  guest cracks one; the host's window
                                  reports it, and replays it
                                4 Brainstorm: the host's, putting back
                                  Consider and then Swamp
                                4 Consider, 4 Opt: the cards put back
```

Both seats bring it; spec 0098's test deal gives each the cards for its
half. Used by `frontend/e2e/match-reports-comfort.spec.ts`. CI builds the
package; locally:

```text
node scripts/make-ci-deck.mjs "Test Deck/reports-comfort-deck.zip" protocol/fixtures/reports-comfort-deck
```
