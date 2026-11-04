# Deck package format

**The interoperability contract between Proxic Deck Builder and
Proxic Arena.** PHASE_02 §2.11–§2.16.

```text
Proxic Deck Builder
        ↕
Proxic Arena
```

This describes **what actually works**, not what either program
intends. Every statement here was observed from a real export
(`Basic_Mono_Red_65_Card_Deck.zip`, 65 cards, 12.4 MB) and is
exercised by a test that imports it.

The two projects are permanently separate (AGENTS ISO-002). Neither
may change to suit the other without this document changing first.

---

## 1. Archive

| | |
| --- | --- |
| Type | ZIP; DEFLATE or STORED (pictures are stored since spec 0051: they are already compressed) |
| Directory entries | none — paths are implied |
| Encryption | none |
| Nested archives | none |
| Filename | whatever the user saved it as |

The archive filename is **not** meaningful. It is a label.

## 2. Structure

```text
<DeckName>.txt                            exactly one, at the root
real_cards/<front face name> [SET].png    zero or more (cards and token cards)
                                  or .jpg  (spec 0051)
art_crops/<front face name> [SET].jpg     zero or more (spec 0051)
pictures.json                             optional (spec 0022)
```

**Spec 0051 (1.28.0).** A card picture may be a JPEG (the Deck Builder
sends the full-size 88% JPEG Arena's close-up copy always was, about a
seventh of the PNG), and each picture may bring Scryfall's **art crop**
under `art_crops/`, named exactly as its picture is. The table's art
window shows the crop; without one it zooms into the picture as before.
`/api/deck-rules` says what Arena takes (`format.pictures`: formats
`png`, `jpeg`; `artCrops`), and a Deck Builder finding no such field
sends PNGs and no crops. `pictures.json` may name art crops too.

Nothing else is permitted. A package containing any other member is
rejected, including a nested archive, a stray `notes.txt`, or a file
in a subdirectory.

**The decklist is found by extension, not by name.** Deck Builder
names it from the DECK and the archive from wherever the user saved
it; the two match only by coincidence.

Exactly one `.txt` must be present. Zero is `NO_DECK_LIST`; two or
more is `MULTIPLE_DECK_LISTS`, because importing the wrong one
silently would hand a player a deck they did not build.

### 2.1 Pictures already sent (spec 0022, 1.11.0)

Arena keeps every picture it has been sent, by its SHA-256. Before
packing, a linked Deck Builder asks which of its pictures the
player's own decks already hold (`POST /api/deck-builder/pictures/known`)
and leaves those out, naming each in `pictures.json` instead:

```json
{"real_cards/Lightning Bolt [LEA].png": "<sha-256 of the PNG>"}
```

Each one must be a picture a deck **the sender owns** already uses;
any other refuses the import (`PICTURE_NOT_HELD`), and the Deck
Builder sends it in full. Never "any deck on the server": a hash
would then tell a player what somebody else's decks hold. A picture
sent in the package wins over one named. This keeps a big deck under
Cloudflare's 100 MB upload cap and makes sending a deck again quick.

## 3. Deck text

| | |
| --- | --- |
| Encoding | UTF-8, **no BOM** |
| Line endings | LF (CRLF is tolerated on import) |
| Trailing newline | present |

```text
// Basic_Mono_Red_65_Card_Deck (commander)
<blank line>
4 Fiery Temper [INR:154]
25 Mountain [FRA:287]
4 Reckless Stormseeker // Storm-Charged Slasher [MID:157]
```

### 3.1 Grammar

```text
line     := comment | blank | entry
comment  := "//" text
entry    := quantity SP name [ SP "[" set [ ":" collector ] "]" ]
quantity := integer, 1 or greater
name     := text, may contain " // " for a multi-face card
```

- The first comment carries the deck name. Everything from the last
  ` (` is a format label.
- **The format label is ignored.** The real export declares
  `(commander)` for a 65-card mono-red deck: it reflects a Deck
  Builder setting, not legality. Legality is Arena's own
  determination.
- The printing is optional; Deck Builder omits it when a card has no
  set code.

### 3.2 Sections

Arena has no sideboard, so Deck Builder exports main-deck entries
only. Since spec 0022 (1.11.0) there is one section: a `// Tokens`
line starts it, and every line after it is a **token card**, sent
for its picture only:

```text
// Ape Tribal (constructed)

4 Pongify [PLC:44]
56 Forest [M21:274]

// Tokens
1 Ape [TOTC:15]
```

Token lines are never resolved by Forge, never counted toward 60-100
and never in the copy limit. Their pictures are stored with the deck
(`deck_token`), and in a game a token wears the picture of the same
name, from its controller's deck first, then the other player's
(`MATCH_ASSET_AUTHORIZATION.md`). The marker is checked before the
deck-name comment, so a deck with no name line never takes "Tokens"
as its name.

## 4. Card identity

| Field | Meaning |
| --- | --- |
| name | the card, both faces for a transforming card |
| set | **Scryfall** set code |
| collector | collector number within that set |

### 4.1 Set codes differ between the two programs

Deck Builder writes Scryfall codes; Forge uses its own.

```text
Hellspark Elemental   package says CON/65
                      Forge knows   CFX/65
```

Both are Conflux. Arena resolves this by asking Forge for the
edition's own aliases — code, secondary code, alias and Scryfall
code — and **does not** carry a mapping table, which would rot with
every new set.

### 4.2 A wrong printing is reported (and, since spec 0024, kept)

Forge's lookup does **not** return null for a bad set or collector
number; it quietly returns another printing of the same name:

```text
Forest + KTK + 261          ->  TRK/325
Lightning Bolt + ZZZ + 999  ->  SLZ/63
```

For gameplay that substitution is harmless. For Proxic it is not:
the printing is what the player chose and what their artwork is
keyed to. Arena compares what Forge returned against what was asked
for and records a mismatch. Since spec 0024 (owner 2026-10-27) a
mismatch is accepted: the line keeps its printing and picture, and
Forge plays the printing it has. Only a card whose printing changes
what it does (`printingMatters`) must be a printing Forge has.

### 4.3 Multi-face cards

The deck line carries **both** faces joined by ` // `. Forge does
not know that combined string at all — it knows each face
separately — so the **front face is the identity**.

## 5. Artwork

```text
real_cards/<front face name> [<SET>].png
```

- **One image per distinct card NAME**, not per printing and not per
  copy. 11 images for a 65-card deck. Since spec 0053 a package may
  also bring a picture of one PRINTING (§5.3).
- **Front faces only** in packages exported before 2026-10-20. Since
  then a transforming card's back face comes too (§5.0).
- The set code appears in the filename without the collector number,
  so the deck line and the image name are not interchangeable.
- Illegal filename characters `<>:"/\|?*` are stripped. **Accents
  are preserved**, because matching is by name as printed,
  case-folded only.
- Observed sizes: 745×1040, 370 KB–1.77 MB.

### 5.0 Back faces (added 2026-10-20, owner decision — Phase 7 §7.59)

Deck Builder **will also** export the back face of a card that turns
over (a transforming card, a daybound/nightbound card, a modal
double-faced card), named exactly like any other face:

```text
real_cards/<back face name> [<SET>].png
e.g. real_cards/Storm-Charged Slasher [MID].png
     real_cards/Insectile Aberration [ISD].png
```

- Same member shape as a front image, so packages stay structurally
  valid (§6's `UNEXPECTED_ENTRY` is unaffected) and older packages
  without back faces stay valid.
- Arena maps an image to a face **by that face's name**, case-folded,
  so a back-face image is used only while Forge shows that face.
- Split, adventure, aftermath, fuse and Room cards are one picture
  (both halves are on the front) and need nothing extra.
- Until a package carries it, a back face renders as a text frame,
  never with the front's picture.

Implemented by the owner in Proxic Deck Builder; Arena imports it
(`deck_face_art`, `V015`) and shows it while that face is up.

### 5.1 Artwork is optional

A card whose art could not be fetched is **omitted, and the export
still succeeds** — Deck Builder says so in its own source. A package
with fewer images than cards is valid, and Arena renders a fallback.

### 5.2 Mapping a deck entry to its image

```text
deck line:  4 Reckless Stormseeker // Storm-Charged Slasher [MID:157]
image:      real_cards/Reckless Stormseeker [MID].png
key:        front face name, lower-cased
```

### 5.3 A picture of one printing (spec 0053, Arena 1.32.0)

```text
real_cards/<front face name> [<SET>-<COLLECTOR>].png|.jpg
art_crops/<front face name> [<SET>-<COLLECTOR>].jpg
e.g. real_cards/Mountain [DD1-60].jpg  for  6 Mountain [DD1:60]
```

- For a card the deck holds in more than one printing. The set code is
  everything before the first `-` (set codes never hold one), the
  collector number the rest.
- A deck line wears its own printing's picture (and crop) when the
  package brought one, else the name's (§5.2). Deck Builder sends the
  deck's first printing of a name as the name's picture and each other
  printing this way, only to an Arena whose deck rules say
  `format.pictures.printings: true`.
- Arena also asks Forge about each printing separately, so each line
  keeps the printing Forge plays for it (`resolved_set`,
  `resolved_number`), and a game shows each card's own picture.
- Back faces and tokens stay one picture per name.

## 6. Validation Arena applies

Structural, in order, before anything is extracted:

| Check | Refusal |
| --- | --- |
| Really a ZIP | `NOT_A_ZIP` |
| ≤ 150 MB | `ARCHIVE_TOO_LARGE` |
| ≤ 600 entries (300 before spec 0051) | `TOO_MANY_ENTRIES` |
| No path escapes the staging directory | `UNSAFE_PATH` |
| No two entries normalise to one path, case-insensitively | `DUPLICATE_PATH` |
| Expansion ratio ≤ 10 | `COMPRESSION_RATIO` |
| Only the permitted members: the decklist, `real_cards/` PNGs or JPEGs, `art_crops/` JPEGs, `pictures.json` | `UNEXPECTED_ENTRY` |
| Exactly one decklist | `NO_DECK_LIST`, `MULTIPLE_DECK_LISTS` |

A legitimate package expands at a ratio of **1.0001** — PNGs are
already compressed — so a high ratio is direct evidence of a bomb
rather than something inferred from size.

Then content:

| Check | Refusal |
| --- | --- |
| Every line parses | `INVALID_DECK_LIST` |
| Open Format legality | `DECK_NOT_LEGAL` |
| Every card resolves in Forge | `CARDS_NOT_RESOLVED` |
| Every image decodes as a PNG or a JPEG, of a reasonable size | `INVALID_ARTWORK` |
| Every picture `pictures.json` names is in one of the sender's decks | `PICTURE_NOT_HELD` |
| Package not already imported by this account (per owner since `V005`) | `DUPLICATE_PACKAGE` |

Open Format: **60–100 cards (60–65 before spec 0051), at most 4 copies of any card, basic
lands unlimited, no sideboard.** "Any number" cards — Relentless
Rats and similar — are **not** exempt (owner decision 2026-10-15).

## 7. Failure behaviour

- **Nothing is silently corrected.** An over-limit deck is refused,
  never trimmed. A card Forge does not have refuses the whole import,
  never a substitution. (Another printing of a card Forge has is kept,
  §4.2.)
- **Every problem is reported at once**, not the first one found.
- **An import is all or nothing.** A failure leaves no deck, no
  rows, and no staging directory.
- **An identical package is refused** when the same account imported
  it before, naming that deck. Identity is the SHA-256 of the package;
  another account may import the same file (PHASE 4 AMENDMENT 4).

## 8. What Arena does not require

- a manifest
- a sideboard section
- art for every card
- Deck Builder to know anything about Arena's storage

## 9. Changing this contract

Deck Builder is a separate project and Arena cannot change it
(§2.7). If a future export needs a different shape:

1. Update this document first, from a real export.
2. Arena's parser follows the document.
3. Arena keeps accepting the previous shape until no package of it
   remains.

If inspection ever shows the package lacks information Arena needs,
§2.7 requires stopping and asking the owner rather than inferring.

---

**Verified by:** `DeckListTest`, `PackageInspectorTest`,
`CardResolverTest`, `DeckImportTest`, `DeckApiTest` and the
`decks.spec.ts` browser tests, each of which imports the real
export.
