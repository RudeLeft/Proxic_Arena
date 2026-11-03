# 0053 — Each printing of a card keeps its own picture

**Status:** Built in 1.32.0 (approved 2026-11-03)
**Owner note** (2026-11-03): approved after confirming it changes no Forge
rule. It does not: Forge already builds each card from its printing (spec
0024); this changes only which picture Arena shows.
**From:** the owner, 2026-11-03, sending the Duel Decks: Elves vs. Goblins
decks from the Deck Builder: the Goblins deck holds four Mountain printings
(DD1 59, 60, 61, 62) and the Elves deck four Forest printings, and in Arena
every Mountain shows the same picture.

## What the player sees

- **Every printing looks like itself.** A deck with 5 Mountain [DD1:61],
  6 Mountain [DD1:59], 6 Mountain [DD1:60] and 5 Mountain [DD1:62] shows
  four different Mountain pictures: on the deck page, on the table (the art
  window too), and in the close-up. Today all 22 show the first one.
- **Any card, not only lands.** Two printings of Lightning Bolt in one deck
  each keep their own picture the same way.
- **Nothing else changes.** A deck with one printing per card sends and
  looks exactly as today, and a deck sent before this change keeps the
  pictures it has.

## Why it happens today

Both halves file a picture under the card's **name**:

- The Deck Builder sends one picture per card name (the deck's first
  printing of it), because Arena's package format keys a picture by name
  (`real_cards/<Name> [SET].png`, DECK_PACKAGE_FORMAT.md §5).
- Arena's importer gives every deck line of that name the same picture.

The game itself is already ready: since P6-BD (owner decision 2026-10-20)
each card on the table names the printing it was built from ("DD1/59") and
the board looks a picture up by printing first, then by name. Only the deck
never brought more than one picture per name. The board's art crop (spec
0051) is still looked up by name only.

## Rules and boundaries

- **A printing picture** is a package member named for its printing:
  `real_cards/<Name> [SET-NUM].jpg` (or `.png`), and its art crop
  `art_crops/<Name> [SET-NUM].jpg`. The set code is everything before the
  first `-` (set codes never contain one), the collector number the rest.
  A plain `[SET]` member stays what it is today: the picture for the name.
- **Which picture a deck line wears:** its own printing's picture when the
  package brought one; otherwise the name's picture, as today. The same for
  the art crop.
- **The Deck Builder sends printing pictures only for a name the deck holds
  in more than one printing**, and only to an Arena whose deck rules say it
  takes them (`format.pictures.printings: true`). The deck's first printing
  of a name stays the name's picture; each other printing is sent as a
  printing picture. A deck with one printing per name sends exactly what it
  sends today.
- **Limits are unchanged.** A printing picture counts like any other
  picture (count and size limits, "already on Arena", the weekly clean-up,
  one address per picture). Four Mountains add about 170 KB.
- **Back faces stay by name.** A two-faced card held in two printings shows
  each printing's own front; its back face keeps one picture per name (a
  back face is looked up by the face's name, and two-printing two-faced
  cards are rare). Tokens stay by name (spec 0022).
- **Hidden information is unchanged:** a picture is named to a viewer only
  for a card they may see (§6.124, spec 0049).

## Build

### Arena

- `PackageInspector` / `DeckImporter`: read `[SET-NUM]` members as printing
  pictures and crops; a deck line with a printing takes its printing
  picture when present, else the name's (`deck_entry.art_sha256` per line,
  which the board already reads by printing).
- Art crops by printing: store and look up a crop for a printing, so the
  table's art window matches the picture (`MatchArt.cropIn`).
- `DeckRules`: `format.pictures.printings: true`.
- Docs: DECK_PACKAGE_FORMAT.md §5 (printing pictures), MATCH_ASSET
  notes if needed, CHANGELOG, ROADMAP.

### Deck Builder

- `arena/export.py`: for each name held in more than one printing, add a
  printing picture (and crop) for every printing after the first, when
  `ArenaFormat` says Arena takes them. AGENTS ARN rule for it.
- `assets/arena/deck_rules.json` refreshed from Arena.

## Acceptance tests

- **F-0053-A** A package with `Mountain [DD1].jpg` plus `Mountain [DD1-59]`,
  `[DD1-60]`, `[DD1-62]` pictures imports with four different pictures on
  the four Mountain lines; a line with no printing picture wears the name's.
- **F-0053-B** In a real game the four Mountains on the table show four
  different pictures and art crops (e2e, Elves vs. Goblins style deck).
- **F-0053-C** A package with one printing per name imports exactly as
  before (existing import tests unchanged).
- **F-0053-D** The Deck Builder sends printing pictures only for names held
  in more than one printing and only when Arena's rules allow it; the real
  export window sends the owner's Goblins deck and Arena shows four
  Mountains.

## Built (2026-11-03)

- **Found while building: Forge's answer was one per NAME.** The importer
  asked Forge about each distinct card name and filed the answer by name,
  so a deck with Mountain DD1:59, 60, 61 and 62 had all four lines
  resolved to DD1/59, and in a game every Mountain was #59 -- whatever
  pictures the package brought. `CardResolver.resolve` now asks about each
  card in each printing (`resolutionKey`: name, set, number) and labels
  each answer with the printing it was asked for; the importer finds a
  line's answer by that key. Forge rules are untouched: the worker already
  looked each printing up by set and number.
- `deck/PrintingPictures.kt`: `printingKeyOf` reads `<Name> [SET-NUM]`
  members; `pictureFor` gives a line its printing's picture, else the
  name's; printing pictures are never filed as back faces.
- Art crops by printing: the importer keeps them as `mountain [dd1-60]`;
  `MatchRecords.printingCropsOf` files them by the printing Forge built,
  and `MatchArt.cropIn` looks there first (the stack, which names no
  printing, keeps the name's crop).
- `DeckRules`: `format.pictures.printings: true`.
- Tests: `DeckBuilderApiTest` "each printing of a card wears its own
  picture" (F-0053-A, C: pictures per line, crops, resolved printing per
  line; fails if resolution goes back to by-name, or a line takes only the
  name's picture); `MatchArtTest` "each printing wears its own picture and
  art crop"; e2e `match-printing-pictures.spec.ts` with fixture
  `protocol/fixtures/printings-deck` (`make-ci-deck.mjs --printings`),
  F-0053-B: an opening hand shows more than one picture -- it failed
  against the build without the resolver fix, and passes with it.
- Deck Builder 1.4.3 sends the printing pictures (F-0053-D).
- A deck sent before 1.32.0 keeps its one-picture-per-name pictures and
  its by-name printings until it is sent again.

## Release

Arena 1.32.0 (1.31.0 is out), then Deck Builder 1.4.3. Arena first: an older Arena does not advertise
`printings`, so the Deck Builder keeps sending one picture per name to it.
