# The alternate-win test deck

A legal 60-card Open Format deck that exists to reach one event:
**Laboratory Maniac winning the game** with both players on 20 life
(PHASE_06 §6.149, P6-AP).

```text
Maniac Test Deck.txt   40 Island
                       4 Laboratory Maniac
                       4 Hedron Crab
                       4 Traumatize
                       4 Tome Scour
                       4 Thought Scour
```

The host mulligans until the Maniac is in hand, casts it, and only
then mills ITSELF -- every mill spell and Hedron Crab trigger targets
the host -- until its library is empty and its next draw wins. The
guest plays lands and nothing else. Nobody attacks, so life never
moves and could not have decided the game.

Used by `frontend/e2e/match-alternate-win.spec.ts`. CI builds the
package with `scripts/make-ci-deck.mjs`, which generates placeholder
art. The worker-level check (`scripts/check-alternate-win.py`) uses
its own non-legal ten-card deck, so it never depends on the draw.
