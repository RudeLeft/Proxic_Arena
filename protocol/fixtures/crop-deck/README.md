# The art-crop test deck

Sixty Mountains, with a picture AND an art crop (spec 0051): the package
the Proxic Deck Builder sends since 1.4.1, in miniature.

```text
Crop Test Deck.txt   60 Mountain
real_cards/          the Mountain's picture (a solid colour, as every CI deck's)
art_crops/           its art crop: a small yellow-and-blue checkered JPEG
```

A Mountain on the battlefield shows the checkered crop in its art window
instead of the zoomed solid picture; its close-up still shows the whole
picture. Decks without crops (every other fixture) keep the zoom.

Used by `frontend/e2e/match-art-crop.spec.ts`. CI builds it; locally:

```text
node scripts/make-ci-deck.mjs "Test Deck/crop-deck.zip" protocol/fixtures/crop-deck --crops
```
