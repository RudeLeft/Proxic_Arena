# The Ring and dungeon test deck

A legal 60-card Open Format deck that puts the Ring and a dungeon on
the board (PHASE_06 §6.96-6.97, P6-AO): the Ring-bearer marked on its
card, how many times the Ring has tempted a player, and the dungeon
room a player's venture marker is in.

```text
Ring Test Deck.txt   20 Swamp, 16 Plains
                     the Ring   4 Call of the Ring
                     dungeon    4 White Plume Adventurer (the initiative)
                     bearers    4 Walking Corpse, 4 Child of Night,
                                4 Savannah Lions, 4 Elite Vanguard
```

Both players play the same way. Used by `frontend/e2e/match-ring.spec.ts`;
the worker-level check is `scripts/check-tracked-state.py`.
