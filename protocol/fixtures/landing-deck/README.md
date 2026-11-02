# The landing test deck

Lands and creatures only (owner 2026-11-01, item 2): nobody ever holds an
instant, so every creature resolves the moment it is cast -- the case
where the cast card used to fly to an empty stack while the creature slid
out of it (the "blink"). The card now lands straight on the creature's
place on the battlefield.

```text
Landing Test Deck.txt   24 Forest, 36 creatures (Birds of Paradise flies; 2-drops up to Craw Wurm)
```

Used by `frontend/e2e/match-cast-landing.spec.ts`, `match-cast-aside.spec.ts` and
`match-board-motion.spec.ts` (flying and summoning sickness, item 3). CI builds the package
with `scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/landing-deck.zip" protocol/fixtures/landing-deck
