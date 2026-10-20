# The opening-hand test deck

A legal 60-card Open Format deck that exists to reach one pregame
decision: **beginning the game with a card on the battlefield**
(PHASE_06 §6.68, P6-AC).

```text
Leyline Test Deck.txt   40 Swamp
                        4 Leyline of the Void
                        4 Leyline of Sanctity
                        4 Leyline of Punishment
                        4 Leyline of Anticipation
                        4 Leyline of Vitality
```

Five different Leylines because Open Format allows four of each:
twenty in sixty means an opening hand without one is about one in
twenty, for each player. Their colours do not matter -- they are
never cast, which is the point: "If this is in your opening hand,
you may begin the game with it on the battlefield." No mana, no
stack.

Used by `frontend/e2e/match-leyline.spec.ts`. CI builds the package
with `scripts/make-ci-deck.mjs`, which generates placeholder art.
The worker-level check (`scripts/check-leyline.py`) uses its own,
non-legal deck with far more Leylines, because the worker does not
check format and needs two in one hand every time.
