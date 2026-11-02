# 0051 — Bigger decks and lighter pictures

**Status:** Approved 2026-11-01
**Owner decisions** (all 2026-11-01, from the Deck Builder chat's review
of how deck pictures are sent and used; part 1 of that review was spec
0049, released in 1.27.0):

- **D1** Open Format decks are **60 to 100 cards**. Everything else stays:
  at most 4 copies of a card, basic lands unlimited, no sideboard, the
  Contraption and Attraction side decks as they are.
- **D2** The Deck Builder sends **light JPEG pictures**, the same
  full-size 88% JPEG Arena makes for close-ups today, instead of 1.5 MB
  PNGs. Arena **accepts JPEG** pictures. A 100-card deck becomes about
  22 MB, under Cloudflare's 100 MB upload limit, so **pictures are not
  sent in batches**.
- **D3** The board shows Scryfall's **art crop** of each card instead of
  zooming into the full picture. Arena **accepts the art crops as
  JPEGs**. A card without one falls back to today's zoom.
- **D4** Arena's small **board copy** of each picture becomes a light
  JPEG instead of a 340-555 KB PNG.
- **D5** Decks already in the Deck Depot keep their **PNG originals**;
  Arena makes their light board copies from them, once.
- **D6** Older Deck Builders may still send PNGs, and a new Deck Builder
  sends PNGs to an older Arena (one that does not say it takes JPEGs).
- **D7** The copy rule does not change with the size: up to 4 of a card
  in a 100-card deck too.

Not in this spec (decided, next spec): one address per picture so a
browser keeps pictures between matches (any signed-in player may load a
picture; Cloudflare keeps no copies), and a weekly clean-up of pictures
no deck or running game has used for 30 days. Close-ups keep being
fetched ahead (owner).

## What the player sees

- **Deck size:** a deck of 60 to 100 cards is accepted everywhere (the
  Deck Builder's check, sending, the Deck Depot, choosing a deck for a
  room). 59 and 101 are refused, with the reason.
- **Sending from the Deck Builder:** much faster. A first send of a
  100-card deck is about 22 MB instead of 120-150 MB. The bar moves
  while the deck uploads, and Cancel works at every step, including
  during a picture's download. When an upload is refused before it
  reaches Arena (Cloudflare's limit, a proxy) the window says so in
  plain words instead of "Proxic Arena refused the deck."
- **On the board:** each card's art window shows the card's own art,
  cut by Scryfall: no slivers of frame or text box on old-frame,
  borderless, showcase, full-art, saga, planeswalker or battle cards.
  The art is about twice as sharp as today's crop.
- **Close-ups:** look the same as today (the same 88% JPEG).
- **Old decks:** play as before. Their board pictures get lighter; the
  art window keeps today's zoom until the deck is sent again.

Example: Pat sends a 100-card deck with an Alpha Lightning Bolt and a
borderless Sheoldred. The send takes seconds. On the board the Bolt's
art window shows Alpha's painting without the old frame's border, and
Sheoldred shows her art without the borderless frame's name bar.

## Rules and boundaries

- **The rule's one source is Arena.** The deck size comes from Arena's
  format, served at `/api/deck-rules`; the Deck Builder follows it
  (Deck Builder ARN-007, ARN-012), so the Deck Builder needs no rule of
  its own. Its built-in fallback copy is refreshed from Arena's answer.
- **Arena says what pictures it takes.** `/api/deck-rules` gains
  `pictures: {formats: ["png", "jpeg"], artCrops: true}`. A Deck Builder
  that sees no such field sends PNGs and no art crops (D6).
- **The package format** (`DECK_PACKAGE_FORMAT.md`) gains:
  `real_cards/<Name> [SET].jpg` beside `.png`, and
  `art_crops/<Name> [SET].jpg` (fronts, back faces and tokens, named as
  their picture is). Pictures are STORED in the zip, not deflated: they
  are already compressed.
- **Nothing hidden is newly shown.** An art crop is attached to a card
  exactly when its picture is (§6.124, §6.129 and spec 0049's owner
  rule), and being shown it is what lets a player fetch it.
- **Limits** are re-measured for 100 cards: pictures per package 200 ->
  500 (100 fronts, their back faces, tokens, and an art crop for each),
  zip entries 300 -> 600, the pictures/known question up to 500 hashes.
  The 150 MB upload cap stays (old PNG packages).

## Build

### Arena

1. `OpenFormat.MAX_CARDS` = 100; messages, `OPEN_FORMAT.md` (owner
   amendment D1), AGENTS FORMAT rules, CLAUDE.md and README wording.
2. `/api/deck-rules` serves 100 and the `pictures` field.
3. Package: PackageInspector allows `real_cards/*.jpg` and
   `art_crops/*.jpg`; PackageLimits as above.
4. ArtStore accepts JPEG (checked by its own header and decoded, as PNGs
   are); originals keep their format. A JPEG card picture IS the
   close-up copy (no second encode). The board copy is a 384-px JPEG for
   every new picture; a once-only pass makes light board copies for the
   pictures already stored, keeping the PNG originals (D5). A picture
   Arena already holds is recognised by its hash before it is decoded.
5. Art crops: stored like any picture; a new table maps a deck's card,
   back face or token name to its crop (migration V033 unless taken).
   MatchRecords loads them per seat; MatchArt puts `crop` beside `art`
   on every card it gives a picture, and authorises it.
6. Board: the art window shows `crop` filling the window (cover,
   centred) when there is one; otherwise today's zoom of the picture.
7. Imports run off the web request threads (`Dispatchers.IO`).

### Deck Builder

1. Follows 60-100 from Arena (no code change); refresh
   `assets/arena/deck_rules.json` from Arena's answer; ARN-007 wording.
2. When Arena takes JPEGs: each card picture is turned into a full-size
   88% JPEG with its see-through corners filled in the card's border
   colour (as Arena's close-up copy does today), kept in the cache so it
   is converted once. Printing keeps using the PNGs.
3. When Arena takes art crops: fetches Scryfall's art crop for every
   card, back face and token picture it sends (`image_art_crop`, a face's
   `image_uris.art_crop`), cached like the pictures.
4. The package: pictures stored without compression; fixed timestamps,
   so the same deck sent twice is the same file and Arena says "already
   in your Deck Depot".
5. A picture's fingerprint is remembered (by file, size and time), so a
   re-send does not re-read every picture.
6. Cancel reaches a picture mid-download; the upload streams from one
   copy in memory and reports its progress; a removed link stops the
   send before the package is built.
7. If Arena answers that a picture it said it held is gone (a deck
   deleted mid-send), the Deck Builder sends again with that picture.
8. A refusal that is not Arena's own answer (no JSON: Cloudflare, a
   proxy) is said plainly, with the size when it is "too large".

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0051-A | 59 refused, 60 and 100 accepted, 101 refused, at import and in a room; side decks unchanged | server tests |
| F-0051-B | `/api/deck-rules` says 100 and the picture formats; the Deck Builder follows it | server test + Deck Builder test |
| F-0051-C | A JPEG package imports; the JPEG is served as the close-up unchanged; the board copy is a 384-px JPEG | server tests |
| F-0051-D | Old PNG decks get light board copies once; originals untouched | server test |
| F-0051-E | Art crops are stored, attached beside `art` to exactly the cards that get a picture, and fetchable only once shown | MatchArtTest |
| F-0051-F | On the board, an old-frame, a borderless, a saga and a planeswalker card show their art crop; a deck without crops shows today's zoom | e2e + screenshots |
| F-0051-G | A real 100-card deck goes from the real Deck Builder export window to a local Arena: under 30 MB, accepted, playable | driven window + screenshots |
| F-0051-H | Same deck sent twice: "already in your Deck Depot"; cancel mid-download stops; progress moves during upload; a non-JSON 413 is worded plainly | Deck Builder tests |
| F-0051-I | A Deck Builder facing an Arena without `pictures` sends PNGs and no crops | Deck Builder test |

## Built (2026-11-01)

- **Arena:** `OpenFormat.MAX_CARDS` 100; `/api/deck-rules` `format.pictures`
  (`formats` png, jpeg; `artCrops`); PackageInspector takes
  `real_cards/*.jpg` and `art_crops/*.jpg` (limits 500 pictures, 600
  entries); ArtStore takes JPEGs (size from the header before decoding),
  keeps originals in their format, serves a JPEG original as its own
  close-up, makes a 384-px JPEG table copy, and recognises a picture it
  already holds before decoding; the background fill (ZoomCopy) also makes
  the JPEG table copies of older pictures and removes the PNG ones; art
  crops in `deck_crop_art` (V033), loaded per seat and put beside `art` as
  `crop` by MatchArt (fetchable once shown); the board's art window shows
  `crop` (cover, centred) and zooms into `art` otherwise; imports run on
  `Dispatchers.IO`.
- **Deck Builder (1.4.0):** follows `format.pictures` (ARN-017, new
  `arena/pictures.py`): the print PNG goes as its 88% JPEG with filled
  corners, made once; each picture brings Scryfall's art crop; pictures
  are stored in the zip with one fixed time (the same deck is the same
  package); fingerprints remembered; downloads hear Cancel mid-transfer;
  the known-pictures question goes in batches of 200 and a refused token
  stops the send; the upload streams from one copy and shows its bytes;
  PICTURE_NOT_HELD sends again with every picture; a refusal that is not
  Arena's own JSON is worded plainly. The built-in rules copy is Arena
  1.28.0's own answer. Cancel stays off during the upload (Deck Builder
  ARN-005: Arena may already be importing).
- **Evidence:**
  - Server: all tests pass; new `LightPicturesTest`, crop tests in
    `MatchArtTest`, a 100-card JPEG + art-crop package and a refused 101 in
    `DeckBuilderApiTest`. With the crop step and the JPEG acceptance broken
    on purpose, six of them failed.
  - Browser (local stack): `match-art-crop.spec.ts` (the checkered test crop
    fills the art window for both players, sampled by colour);
    `match-stolen-picture`, `match-own-printing` (old decks keep the zoom),
    `match-multiface`, `battlefield`, `match-board-motion`, `decks`,
    `device-link`, `match`, `sharing` pass.
  - The real Deck Builder window sent a 100-card deck (91 pictures and
    their art crops) to the local Arena: a 30.3 MB package (the same
    pictures as PNGs are 159 MB), accepted, with the upload's bytes shown;
    the same deck sent again was recognised as already held.
  - A real game with a deck the real window sent (Scryfall's own crops):
    the Alpha Serra Angel, Alpha basic lands, borderless Sheoldred and
    Delver of Secrets show only their art on the table (screenshot read).
    History of Benalia and Jace did not reach the table in that game, so
    a saga and a planeswalker were not photographed.
  - Local server: the background fill made light table copies for 22
    older pictures; table copies average 56 KB (the PNG ones were
    340-555 KB).

## Release

Arena first (1.28.0: takes JPEGs and art crops, 100 cards), then the
Deck Builder (1.4.0: sends them). Plain-English notes for both.

## Amendments

None.
