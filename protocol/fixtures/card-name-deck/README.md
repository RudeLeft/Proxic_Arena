# The card-naming test deck

A legal 60-card Open Format deck that exists to reach one decision:
**naming any card** (PHASE_06 P6-AG).

```text
Card Name Test Deck.txt   52 Mountain
                          4 Pithing Needle       {1}, any card name
                          4 Phyrexian Revoker    {2}, any NONLAND card name
```

Both cards ask Forge's open-form `chooseCardName`: every name in the
card database that Forge's predicate allows, ~34,000 of them. That is
answered by searching (owner decision 2026-10-20) -- the question
arrives searchable, the browser sends what the player types, and the
player picks one of the names the server sent back.

The Revoker is here on purpose: its "nonland" restriction is checked
by Forge AFTER the pick, on a real card instance, and a land name is
asked for again. The Needle has no such restriction.

Colourless and cheap so that either card is castable from turn one
or two off Mountains alone; eight of them in sixty cards so that one
is drawn early in most games, by one player or the other.

Used by `frontend/e2e/match-card-name.spec.ts`. CI builds the
package from this folder with `scripts/make-ci-deck.mjs`, which
generates placeholder art -- no Wizards artwork is committed
(AGENTS GIT-001).
