# The CI gate deck

A minimal, legal deck package used when the real Proxic Deck Builder
export is not available — which on a CI runner is always, because
that export carries Wizards of the Coast artwork and is gitignored
for exactly that reason.

```text
CI Gate Deck.txt      65 cards, five basic lands, 13 each
                      no real_cards/ directory: artwork is optional
```

## Why basics only

Open Format allows unlimited copies of a basic land, so 13 of each of
five basics is a **legal** 65-card deck without needing four-of
limits to be worked around. Every one of these names resolves in any
Forge card pool, so the fixture cannot fail for a reason that has
nothing to do with the code under test.

No artwork, because §5 of `DECK_PACKAGE_FORMAT.md` makes it optional
and because shipping card images in this repository is the thing the
gitignore exists to prevent.

## What it is for

The browser tests import a real export when one is present — richer,
and it is what a person actually uploads. On CI there is no such
file, and without this fixture every import test would skip itself
and the gate would pass having tested nothing. That is the failure
this directory exists to prevent, and it is the same shape as the
Phase 1 bug where two tests silently never ran.

The zip is built at test time by `scripts/make-ci-deck.mjs`; nothing
here is a `.zip`, because `*.zip` is gitignored and should stay that
way.
