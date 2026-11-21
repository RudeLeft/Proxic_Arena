# The soulbond test deck

A legal 60-card Open Format deck for spec 0111's real-click game
(F-0111-E).

```text
Soulbond Test Deck.txt   24 Plains, 24 Island
                         4 Elder Cathar: the host's first creature, the partner
                         4 Tandem Lookout: the host's soulbond creature, cast second
                         4 Chapel Geist: filler (no soulbond), so the deck is 60 cards
```

Both seats bring it; spec 0098's test deal gives the host its two
creatures and lands, and the guest only lands, whoever goes first. Used
by `frontend/e2e/match-soulbond.spec.ts`. CI builds the package with
`scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/soulbond-deck.zip" protocol/fixtures/soulbond-deck
