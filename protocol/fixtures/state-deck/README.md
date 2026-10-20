# The player-state test deck

A legal 60-card Open Format deck that exists to put Forge's PLAYER
state on the board (PHASE_06 §6.96, P6-AO): counters on a player and
designations, beyond the ordinary zones.

```text
State Test Deck.txt   20 Forest, 16 Plains
                      energy   4 Aether Hub, 4 Servant of the Conduit
                      poison   4 Glistener Elf, 4 Blight Mamba (infect)
                      monarch  4 Palace Jailer, 4 Palace Sentinels
```

Eight sources of each, and BOTH players play the same way, so a game
without all three is rare. Used by `frontend/e2e/match-state.spec.ts`;
the worker-level check (`scripts/check-player-state.py`) also covers
day/night and uses its own non-legal deck.
