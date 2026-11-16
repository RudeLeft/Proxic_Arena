# The mana colours test deck

Spec 0092, F-0092-B (owner 2026-11-16): every land makes two colours
(four gain lands and four guildgates, each with black, four copies each:
Open Format's limit), so every spell is paid by tapping one for a colour -- the moment
Forge announces "Bob picked {B}." to the other player, which used to open
a report window on every tap.

```text
Mana Colours Test Deck.txt   32 two-colour lands with {B}, 28 black one- and two-drops
```

Used by `frontend/e2e/match-mana-colours.spec.ts`. CI builds the package
with `scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/mana-colours-deck.zip" protocol/fixtures/mana-colours-deck
