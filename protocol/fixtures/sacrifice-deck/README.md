# The sacrifice test deck

A legal 60-card Open Format deck for sacrificing in a real game
(feature spec 0001, F-0001-H).

```text
Sacrifice Test Deck.txt   28 Swamp
                          4 Innocent Blood: each player sacrifices a
                          creature -- no target, so both are asked
                          creatures with nothing to activate: Walking
                          Corpse, Scathe Zombies, Typhoid Rats, Severed
                          Legion, Bog Raiders, Zombie Goliath, Mass of
                          Ghouls (4 each)
```

Each player casts creatures, then Innocent Blood. Whoever is asked to
sacrifice answers by clicking one of their own creatures on the board:
the question names Innocent Blood, offers nothing else, and has no
Cancel or Pass.

Used by `frontend/e2e/match-sacrifice.spec.ts`. CI builds the package
with `scripts/make-ci-deck.mjs`.
