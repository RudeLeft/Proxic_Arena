# 0024 — Keep the printing you picked

**Status:** Approved 2026-10-27
**Owner decisions (2026-10-27):** D1 yes, keep the printing the player
picked; D2 no note to the player; D3 spec 0023 keeps its Arena half and
drops its Deck Builder half (0023 Amendment 1). The idea is the owner's (2026-10-27):
"when users select their cards they are picking the cards they like with
the art they like … I just want users to be able to pick the card print
they want", without anything that would break Forge or anything hardcoded
into Forge.

## What the player sees

You build a deck in the Deck Builder with the Lightning Bolt promo you
love, from a promo set Forge has never heard of. Today the Deck Builder
swaps it for a printing Arena knows before sending, and the deck shows up
with a different Bolt. After this change the deck goes to Arena as you
built it. In the Deck Depot and in a game it wears your picture, and in a
game it plays exactly like any Lightning Bolt.

A card Arena cannot play at all is still refused, as today. So are the 24
cards whose printing changes what the card does (below).

## Why it works without touching Forge

- **Forge plays a card by its name.** One Lightning Bolt plays like any
  other, whatever set it was printed in. The frozen Phase 2 paper says the
  same: "For gameplay the substitution is harmless"
  (`PHASE_02 §2.49`, `UPSTREAM-DOC` of our own history).
- **Pictures already come from the player's deck, not from Forge.**
  Import files each picture under the card's name (`DeckImporter.frontNameOf`,
  `art_sha256` per entry), and a game shows the owner's picture by printing
  first, then by name (`MatchArt.card`) — `SOURCE`.
- **A match already plays Forge's own copy.** Import stores the player's
  printing (`set_code`, `collector_number`) and the one Forge matched
  (`resolved_set`, `resolved_number`), and a match sends the second
  (`MatchRecords.entriesOf`: "the PRINTING travels") — `SOURCE`.

What stops it today is Arena's own import rule, not Forge. When Forge knows
the card but not that printing, the worker answers `PRINTING_MISMATCH` —
it already names the printing it would use instead — and import refuses
the whole deck (`DeckImporter`, `CARDS_NOT_RESOLVED`). That came from
Phase 2 owner decision D2 and §2.94 "No silent card substitution", and the
reason given was the picture: "the printing is what the player chose and
what their artwork is keyed to" (§2.49). The picture stays the player's
here, so this spec keeps that reason and changes the rule.

## How big it is (measured 2026-10-27, `RUN`, read-only)

Every English paper printing in the Deck Builder's Scryfall copy, of a
card Forge plays, checked the way the Deck Builder checks it today
(`arena_printings.printing_accepted`) against this Arena's deck rules:

- 100,653 printings; **13,682 refused (13.6%), across 7,353 cards.**
- 9,669 of those are from a set Forge does not have (Collectors' Edition,
  promo sets such as "Murders at Karlov Manor Promos", art series), 3,908
  are a known set with a numbered variant Forge does not list ("220★"
  foils, promo stamps), and 105 are a plain number Forge does not list.
- Approximate: art-series and other non-game printings are counted, so
  the real figure is a little lower (`INFERENCE`).

## The 24 cards whose printing changes the card

Forge gives a few cards different abilities by printing (its "functional
variants"). Measured on this Forge (`RUN`), leaving out variants that only
change the name shown (the Godzilla-style flavour names, Universes
Within): **24 cards** — 21 Attractions (their lights differ by printing),
Everythingamajig, Garbage Elemental and Sly Spy. For these, playing
another printing would change the game, so they stay strict: a printing
Forge does not know is refused, as today. Nothing in Arena handles
functional variants today (searched: no mention anywhere).

## Scope

In:
- **Worker.** A `PRINTING_MISMATCH` answer says whether the printing
  changes the card (Forge's `CardRules` functional variants, excluding
  flavour-name-only ones). Forge decides which cards these are; Arena
  keeps no list.
- **Import.** A card Forge knows under another printing is accepted when
  its printing does not change the card. The entry keeps both printings
  (player's and Forge's) and the player's picture. A card Forge does not
  know, or one of the 24 in a printing Forge lacks, is refused as today.
  The status stored stays `PRINTING_MISMATCH`, so the record says plainly
  that Forge plays its own printing (§2.94's "not silent" kept as a record,
  not as a refusal).
- **The room's deck check before a game.** `MatchPreflight.entriesOf`
  asks Forge again with the PLAYER's printing; an accepted card would fail
  there with "not supported yet" and the game would never start. It reads
  Forge's printing (`resolved_set`, `resolved_number`), as the match
  already does.
- **Deck rules for the Deck Builder.** The document says that any printing
  of a listed card is accepted, except cards marked as having printings that
  change the card. `POOL_REVISION` goes up, so a kept pool is asked for
  again and linked Deck Builders refetch the rules.
- **Documents.** `DECK_PACKAGE_AND_ART.md` and `RULES_COVERAGE.md` (if it
  cites import's printing check) say what is true after. The frozen Phase 2
  paper is not edited (PHASE-002); this spec is the record of the change.

**The Deck Builder's part (its own project and session, ISO-002; not built
here).** It stops swapping a printing Arena does not list, except for a
card the rules mark as having printings that change it. Until it is
updated, an older Deck Builder still swaps, and Arena accepts that too:
nothing breaks in either order.

Out (and why):
- **Two printings of one card in one deck, each with its own picture.**
  The Deck Builder sends one picture per card name, and import files
  pictures by name (`DECK_PACKAGE_AND_ART.md` §2.1). A deck with a foil
  Bolt and a regular Bolt shows one of the two pictures on all four. That
  is today's limit too, not made worse here; a later feature can lift it.
- **Cards Forge cannot play at all.** Still refused; the Deck Builder
  already warns about them (spec 0021).
- **Telling Forge which printing it is.** Forge's own copy is used for
  play. Nothing a player sees comes from Forge's printing.

## Rules and boundaries

- **VEND-001/002, ARCH-001:** no Forge source changed, no patch, no
  Forge in the server. The worker only reports what Forge says.
- **ARCH-002 / FORGE-RULE:** Arena implements no rule. Which cards'
  printings matter is Forge's own answer.
- **FMT-002:** deck legality is unchanged; the copy limit counts by card
  name, as now.
- **HID-001/005:** pictures are the deck owner's own, served as today under
  the match's existing checks; nothing new is sent.
- **PHASE-002:** Phase 2 D2 and §2.94 stay as written in the frozen paper;
  this spec, once approved, is the dated owner change to them.
- **Phase 6 P6-BD** ("where exact printing identity is part of the
  accepted deck contract, verify Forge construction preserves it",
  `scripts/check-printings.py`): unchanged for a printing Forge knows. For
  an accepted card in another printing, the contract is the printing Forge
  recorded at import, which is what the match already sends; the check
  stays as it is and keeps passing.
- **TEST-004/010:** the import test must fail on today's code; the room
  check must be proven by starting a real game, not only by a unit test.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0024-A | A deck with a Lightning Bolt from a set Forge lacks imports; the entry keeps the player's printing and picture and records Forge's. Refused on today's code. | unit (`DeckImportTest`), real worker |
| F-0024-B | An Attraction (or Everythingamajig) in a printing Forge lacks is still refused, naming the card. | unit, real worker |
| F-0024-C | A card Forge does not know at all is still refused, as today. | unit |
| F-0024-D | That deck passes the room's deck check and a real game starts and plays the card; both players see the owner's picture of it. | real game (`play-a-game.py`), browser e2e |
| F-0024-E | The deck rules say "any printing accepted" and mark exactly Forge's rules-changing variant cards; `rulesVersion` changes. | unit (`DeckRulesTest`, `CardPoolTest`) |
| F-0024-F | Unchanged gates stay green: `CardPoolTest`, `DeckImportTest`, the Mechanics Lab gate, the e2e match spec. | unit, real game |
| F-0024-G | In the Deck Builder, a deck with the promo Bolt sends with that promo, and the export window no longer offers to swap it. Built and checked in the Deck Builder's session; the owner's eyes on it. | Deck Builder session, owner |

## Decisions for the owner

**D1 — Keep the printing the player picked?** Any printing of a card Arena
can play is accepted; the game uses the player's picture, and the card
plays like any copy of that card. Recommendation: **yes.**

**D2 — Say anything to the player?** Example: the Deck Depot could show
"plays as a regular Lightning Bolt" under the promo Bolt (player text never
names Forge). Nothing about the game is
different, so the recommendation is **no note**: the record keeps both
printings for us, and the player just sees their card.

**D3 — What happens to spec 0023?** With this, the Deck Builder only swaps
printings for the 24 cards above, so 0023's better swap order (and its
skipping crossover sets) almost never comes into play. 0023's Arena half
is still a correct, small fix: Forge would see its sets' real types.
Recommendation: **keep 0023's Arena half as a small fix, drop its Deck
Builder half.**

## Amendments

None.
