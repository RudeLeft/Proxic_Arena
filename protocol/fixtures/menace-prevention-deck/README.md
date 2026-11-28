# The menace-prevention test deck

A legal 60-card Open Format deck for spec 0125's real-click game
(F-0125-E): a lone block of a menace attacker refused, and "prevent the
next 3 damage" on a player, whole and in part.

```text
Menace Prevention Test Deck.txt   16 Mountain, 12 Forest, 12 Plains
                                  4 Boggart Brute: the host's menace attacker
                                  4 Grizzly Bears: the guest's lone blocker,
                                    really clicked
                                  4 Lightning Bolt: the host's 3 at the guest
                                  4 Lava Axe: the host's 5 at the guest
                                  4 Healing Salve: the guest really casts its
                                    "prevent the next 3" on herself
```

Both seats bring it; spec 0098's test deal gives each the cards for its
half. Used by `frontend/e2e/match-outcomes.spec.ts` (its second game). CI
builds the package; locally:

```text
node scripts/make-ci-deck.mjs "Test Deck/menace-prevention-deck.zip" protocol/fixtures/menace-prevention-deck
```
