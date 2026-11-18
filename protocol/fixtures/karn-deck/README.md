# The game-restart test deck

A legal 60-card Open Format deck that exists to reach one event:
**Karn Liberated restarting the game** (PHASE_06 §6.69-§6.72, P6-AD).

```text
Karn Test Deck.txt   56 Plains
                     4 Karn Liberated
```

Karn costs seven, starts at six loyalty, and needs fourteen for the
-14: cast, +4, +4, -14 -- three of the caster's turns once seven
lands are out. The host mulligans (at most twice, then keeps and draws into it) until
Karn is in hand; the guest
plays lands and nothing else, so the board is only Karn's doing.

Since spec 0102 (item 1) the e2e also checks the restart window on the
guest's page: game 1's table holds still under it until the guest
clicks Close, then the cards sweep to the libraries and game 2's deal
plays; the host, who restarted it, gets no window.

Used by `frontend/e2e/match-karn.spec.ts` and
`match-passing.spec.ts`. CI builds the package with
`scripts/make-ci-deck.mjs`, which generates placeholder art. The
worker-level check (`scripts/check-karn.py`) uses its own non-legal
decks (far more Karns; since spec 0102, the second seat's has Enlightened
Tutors, to leave a game-1 report open) and a test deal, so it never
depends on the draw.
