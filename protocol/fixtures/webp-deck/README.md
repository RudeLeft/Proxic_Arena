# The WebP pictures test deck

Fifty-six Forests and four Llanowar Elves, each with a picture and an art
crop (spec 0121): enough for a game to show a hand, a spell on the stack, an
art window and a close-up, every one of which Arena now serves as a WebP
copy at quality 80.

```text
WebP Test Deck.txt   56 Forest, 4 Llanowar Elves
real_cards/          each card's picture (a solid colour, as every CI deck's)
art_crops/           its art crop: the small yellow-and-blue checkered JPEG
```

The folder holds only the deck list; the pictures are made when the
package is built (`scripts/make-ci-deck.mjs --crops`). The package still
carries PNG and JPEG only: the Deck Builder does not send WebP (spec 0121
leaves it out), Arena makes the WebP copies at import.

Used by `frontend/e2e/match-webp-pictures.spec.ts`, in Chromium, Firefox
and WebKit. CI builds it; locally:

```text
node scripts/make-ci-deck.mjs "Test Deck/webp-deck.zip" protocol/fixtures/webp-deck --crops
```
