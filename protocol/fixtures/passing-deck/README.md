# The passing test deck (spec 0124)

A legal 60-card Open Format deck for "Nothing to play" re-checked at every
step (P11-A4) and the ante report window (P11-A5), in a real game.

```text
Passing Test Deck.txt   26 Island, 14 Mountain
                        4 Scroll Thief, 4 Air Elemental, 4 Mahamoti Djinn
                        4 Lightning Bolt
                        4 Contract from Below
```

Both players hold it, dealt (spec 0098). The host plays three Islands and
Scroll Thief, holding only five- and six-mana cards, so its turns pass for it;
the Thief's hit draws an Island in the middle of a passed turn. The guest holds
Mountains and Lightning Bolt, and Bolts the host during a passing turn. Ante
isn't played, so every Contract from Below is taken out before the game and
each player gets the report window for their own deck.

Used by `frontend/e2e/match-passing.spec.ts`. CI builds the package with
`scripts/make-ci-deck.mjs`.
