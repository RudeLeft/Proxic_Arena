# The surveil test deck

A legal 60-card Open Format deck for looking at the top of your library
in a real game (feature spec 0001, F-0001-H and D3).

```text
Surveil Test Deck.txt   25 Island, 15 Swamp
                        surveil: 4 Consider (surveil 1),
                                 4 Notion Rain (surveil 2)
                        scry:    4 Opt (scry 1), 4 Preordain (scry 2),
                                 4 Serum Visions (scry 2)
```

Each player casts whatever of these they can. Whoever is looking sees
the cards as pictures, alone, in the tray from the bottom (PHASE_09
W-08): two rows, top and bottom (surveil: graveyard); a click moves a
card across, the ones on top are numbered in draw order, then Done. No
Cancel.

Used by `frontend/e2e/match-surveil.spec.ts`. CI builds the package
with `scripts/make-ci-deck.mjs`.
