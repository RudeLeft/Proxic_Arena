# The always-choose test deck

A legal 60-card Open Format deck for spec 0104's real-click game
(F-0104-I): Appetite for Brains at a hand holding one card of mana value 4
or more, which the caster is now asked to click.

```text
Always Choose Test Deck.txt   14 Swamp, 14 Island, 4 Forest
                              4 Appetite for Brains: the host's, at the
                                guest's hand
                              4 Hill Giant: the one card it may take
                              4 Lightning Bolt, 4 Grizzly Bears,
                                4 Counterspell: shown, dimmed with why
                                ("mana value 1", "mana value 2")
                              4 Shardless Agent: the host's cascade
                              4 Giant Killer: an adventure card cascade
                                may cast only as the creature (Chop Down
                                is mana value 3): the half is still asked
                                (owner 2026-11-19)
```

Both seats bring it; spec 0098's test deal gives each the cards for its
half. Used by `frontend/e2e/match-always-choose.spec.ts`. CI builds the
package; locally:

```text
node scripts/make-ci-deck.mjs "Test Deck/always-choose-deck-2.zip" protocol/fixtures/always-choose-deck
```
