# The printings test deck

Sixty Mountains in four printings (spec 0053): Duel Decks: Elves vs.
Goblins' Mountains 59, 60, 61 and 62, fifteen of each, as the owner's
Goblins deck holds them.

```text
Printings Test Deck.txt         15 Mountain [DD1:59] ... 15 Mountain [DD1:62]
real_cards/Mountain [CI].png    the name's picture (the first printing's)
real_cards/Mountain [DD1-60].png, [DD1-61], [DD1-62]
                                each other printing's own picture, a colour each
```

The folder holds only the deck list; the pictures are made when the
package is built (`scripts/make-ci-deck.mjs --printings`).

That is what the Proxic Deck Builder sends since 1.4.3: the deck's first
printing of a name is the name's picture, and each other printing comes as
a picture of its own. In a game each Mountain wears its own printing's
picture, so an opening hand shows more than one colour.

Used by `frontend/e2e/match-printing-pictures.spec.ts`. CI builds it;
locally:

```text
node scripts/make-ci-deck.mjs "Test Deck/printings-deck.zip" protocol/fixtures/printings-deck --printings
```
