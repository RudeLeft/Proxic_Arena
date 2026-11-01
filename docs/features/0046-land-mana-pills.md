# 0046 — What each land makes

**Status:** Built in 1.25.0 (approved 2026-10-31)
**Owner decisions:** 2026-10-31, from the canvas
https://claude.ai/artifact/9zAJGg3MBjLo59aG2KjsZ5 (report 5): option A.

## What the player sees

Every land on the battlefield has a small pill at the bottom of its card
with the mana it can make, as the mana symbols: a Plains {W}, Hallowed
Fountain {W}{U}, Command Tower its commander-less colours as Forge says,
a colourless land {C}. A land that makes no mana itself (a fetch land)
has no pill. A player said duals were hard to tell apart.

## Rules and boundaries

The colours come from the worker reading the land's own mana abilities in
Forge, as they are now (an effect that changes a land changes its pill),
not from its name or type line.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0046-A | A basic, a dual and a colourless land show the right symbols | worker test + screenshot |
| F-0046-B | A land changed by an effect shows its new colours | Lab |

## Built (2026-10-31)

- The worker sends `makes` on every land on the battlefield: the symbols
  its mana abilities make now (WUBRG, then C), read from Forge's mana
  parts -- "Any" is all five colours, a combination its colours. Mana
  Forge only works out while it is being made ("Special") is left out
  rather than guessed. Public, so both players see the same pill.
- Command Tower with no commander makes nothing in Forge, so it has no
  pill; Evolving Wilds (no mana ability) has none either.
- The pill: the symbols in a dark rounded strip low on the card's
  picture; the card's spoken label says "makes W or U".
- Evidence: `scripts/check-land-mana.py` (Lab: Plains {W}, Hallowed
  Fountain {W}{U}, Wastes {C}, Evolving Wilds nothing, to both seats; under
  Blood Moon the Fountain and the Wilds make {R} and the basics are
  unchanged), a parsing test in `match.test.ts`, a screenshot of a real
  game with Steam Vents, Breeding Pool, Hallowed Fountain, Command Tower,
  Plains and Wastes.

## Amendments

None.
