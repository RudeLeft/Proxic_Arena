# The pages test deck

A legal 60-card Open Format deck for spec 0114's real-click test of the
player pages' words (F-0114-F).

```text
Pages Test Deck.txt   56 Mountain
                      4 Lightning Bolt
```

Two packages are built from it:

- `Test Deck/pages-deck.zip`, as is: imported, then given a fifth Lightning
  Bolt in the database (with `PROXIC_E2E_CONTAINER`), so the lobby refuses it
  with W2-105's one sentence, "Open Format allows at most four copies of
  "Lightning Bolt". This deck has five." (an import refuses five copies
  itself, so no package can carry them into a room).
- `Test Deck/pages-bad-picture-deck.zip`, with Lightning Bolt's picture made
  a few bytes of text: the import refuses it with W2-086 / W2-087's words,
  "The picture for Lightning Bolt is not a PNG or JPEG file."

Used by `frontend/e2e/match-wording-pages.spec.ts`. CI builds both with
`scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/pages-deck.zip" protocol/fixtures/pages-deck
    node scripts/make-ci-deck.mjs "Test Deck/pages-bad-picture-deck.zip" protocol/fixtures/pages-deck "--not-a-picture=Lightning Bolt"
