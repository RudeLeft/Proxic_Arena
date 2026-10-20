# The game-restart test deck

A legal 60-card Open Format deck that exists to reach one event:
**Karn Liberated restarting the game** (PHASE_06 §6.69-§6.72, P6-AD).

```text
Karn Test Deck.txt   56 Plains
                     4 Karn Liberated
```

Karn costs seven, starts at six loyalty, and needs fourteen for the
-14: cast, +4, +4, -14 -- three of the caster's turns once seven
lands are out. The host mulligans until Karn is in hand; the guest
plays lands and nothing else, so the board is only Karn's doing.

Used by `frontend/e2e/match-karn.spec.ts`. CI builds the package with
`scripts/make-ci-deck.mjs`, which generates placeholder art. The
worker-level check (`scripts/check-karn.py`) uses its own non-legal
deck with far more Karns, so it never depends on the draw.
