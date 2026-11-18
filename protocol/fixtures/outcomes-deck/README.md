# The outcomes test deck

A legal 60-card Open Format deck for spec 0101's real-click game
(F-0101-F): a printed-deathtouch attacker blocked by a first-strike
creature, an ability Stifled, and a creature saved by its shield counter.

```text
Outcomes Test Deck.txt   10 Swamp, 10 Mountain, 10 Island, 6 Plains
                         4 Typhoid Rats: the host's printed deathtouch
                           attacker
                         4 Youthful Knight: the guest's printed first
                           strike, really clicked to block
                         4 Prodigal Pyromancer: the host's ping at the
                           guest's Knight
                         4 Stifle: the guest really casts it on the ping
                         4 Wingshield Agent: the host's, with a shield
                           counter
                         4 Murder: the guest's, at the Agent
```

Both seats bring it; spec 0098's test deal gives each the cards for its
half. Used by `frontend/e2e/match-outcomes.spec.ts`. CI builds the
package; locally:

```text
node scripts/make-ci-deck.mjs "Test Deck/outcomes-deck.zip" protocol/fixtures/outcomes-deck
```
