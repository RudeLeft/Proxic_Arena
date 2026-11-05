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
without all three is rare -- provided the test casts the cards. The deck
alone did not make it so: in CI 41905836041 both players spent their
mana on Blight Mamba's regeneration every turn (the spell pattern also
matched the ability) and nobody became the monarch. The spec now casts
only "Name · {cost} · Type" options and tries the cards for whatever is
still unseen first (87103a2). Used by `frontend/e2e/match-state.spec.ts`;
the worker-level check (`scripts/check-player-state.py`) also covers
day/night and uses its own non-legal deck.
