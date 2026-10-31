# The casting test deck

A legal 60-card Open Format deck for spec 0044 (the card being cast,
docked beside the stack, face down to the opponent until committed).

```text
Casting Test Deck.txt  24 Plains
                       4 Sinew Sliver, 4 Plated Sliver, 4 Sentinel Sliver,
                       4 Watcher Sliver, 4 Steelform Sliver, 4 Sliver Hivelord
                       4 Raise the Alarm
                       4 Swords to Plowshares
                       4 Archon's Glory
```

The Slivers put creatures in the middle of the table;
Swords to Plowshares asks for a target there (the card docks, and the
creature under the middle is clicked with a real mouse); Archon's Glory
asks its Bargain question while it is still in the hand.

Used by `frontend/e2e/match-casting-dock.spec.ts`. CI builds the package
with `scripts/make-ci-deck.mjs`, which generates placeholder art.
