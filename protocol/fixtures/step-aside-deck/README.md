# The step-aside test deck

A legal 80-card Open Format deck for spec 0091's real-click game
(`frontend/e2e/match-cast-step-aside.spec.ts`), dealt since spec 0110.

```text
Step Aside Test Deck.txt   24 Forest
                           4 each of thirteen different cheap green creatures
                           (Llanowar Elves last): a creature line long enough
                           to reach the stack column, so the Elves stand under
                           the card being cast at the stack spot (spec 0110)
                           4 Craw Wurm: the spell paid with them
```

Spec 0110 moved the card being cast from the middle of the table to the
stack's next slot: only the right-hand end of a line is under it now, and
identical cards stack, so the line needs that many different creatures.
Both seats bring it; spec 0098's test deal gives the host its cards. CI
builds the package with `scripts/make-ci-deck.mjs`:

    node scripts/make-ci-deck.mjs "Test Deck/step-aside-deck.zip" protocol/fixtures/step-aside-deck
