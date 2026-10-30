# The triggers test deck

A legal 60-card Open Format deck for many triggers at once (PHASE_09
group 1: W-04, W-05, W-06). Goblins die together to a Pyroclasm with
Boggart Shenanigans out, so its trigger fires once per Goblin: copies of
one trigger, answered once. A Goblin Arsonist dying beside them adds a
different trigger, so the order tray shows two cards, the Boggart copies
as one.

```text
Triggers Test Deck.txt   24 Mountain
                         4 Boggart Shenanigans
                         4 Dragon Fodder, 4 Krenko's Command (two Goblins each),
                         4 Hordeling Outburst (three), 4 Goblin Rally (four),
                         4 Goblin Instigator (two)
                         4 Goblin Arsonist (its own death trigger)
                         4 Pyroclasm, 4 Sweltering Suns (damage to each creature)
```

Used by `frontend/e2e/match-many-triggers.spec.ts`. CI builds it; locally:

    node scripts/make-ci-deck.mjs "Test Deck/triggers-deck.zip" protocol/fixtures/triggers-deck
