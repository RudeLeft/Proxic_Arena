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
| Type | ZIP, DEFLATE compressed |
| Directory entries | none — paths are implied |
| Encryption | none |
| Nested archives | none |
| Filename | whatever the user saved it as |

The archive filename is **not** meaningful. It is a label.

## 2. Structure

```text
<DeckName>.txt                            exactly one, at the root
real_cards/<front face name> [SET].png    zero or more
```

Nothing else is permitted. A package containing any other member is
rejected, including a nested archive, a stray `notes.txt`, or a file
in a subdirectory.

**The decklist is found by extension, not by name.** Deck Builder
names it from the DECK and the archive from wherever the user saved
it; the two match only by coincidence.

Exactly one `.txt` must be present. Zero is `NO_DECK_LIST`; two or
more is `MULTIPLE_DECK_LISTS`, because importing the wrong one
silently would hand a player a deck they did not build.

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

There are none. Arena has no sideboard, so Deck Builder exports
main-deck entries only.

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

### 4.2 A wrong printing is not silently accepted

Forge's lookup does **not** return null for a bad set or collector
number; it quietly returns another printing of the same name:

```text
Forest + KTK + 261          ->  TRK/325
Lightning Bolt + ZZZ + 999  ->  SLZ/63
```

For gameplay that substitution is harmless. For Proxic it is not:
the printing is what the player chose and what their artwork is
keyed to. Arena compares what Forge returned against what was asked
for and reports a mismatch.

### 4.3 Multi-face cards

The deck line carries **both** faces joined by ` // `. Forge does
not know that combined string at all — it knows each face
separately — so the **front face is the identity**.

## 5. Artwork

```text
real_cards/<front face name> [<SET>].png
```

- **One image per distinct card NAME**, not per printing and not per
  copy. 11 images for a 65-card deck.
- **Front faces only** in packages exported before 2026-10-20. A
  transforming card's back face is being added (§5.0).
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

Implemented by the owner in Proxic Deck Builder; Arena's import change
is Phase 7 work.

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

## 6. Validation Arena applies

Structural, in order, before anything is extracted:

| Check | Refusal |
| --- | --- |
| Really a ZIP | `NOT_A_ZIP` |
| ≤ 150 MB | `ARCHIVE_TOO_LARGE` |
| ≤ 300 entries | `TOO_MANY_ENTRIES` |
| No path escapes the staging directory | `UNSAFE_PATH` |
| No two entries normalise to one path, case-insensitively | `DUPLICATE_PATH` |
| Expansion ratio ≤ 10 | `COMPRESSION_RATIO` |
| Only the two permitted member shapes | `UNEXPECTED_ENTRY` |
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
| Every image decodes as a PNG | `INVALID_ARTWORK` |
| Package not already imported | `DUPLICATE_PACKAGE` |

Open Format: **60–65 cards, at most 4 copies of any card, basic
lands unlimited, no sideboard.** "Any number" cards — Relentless
Rats and similar — are **not** exempt (owner decision 2026-10-15).

## 7. Failure behaviour

- **Nothing is silently corrected.** An over-limit deck is refused,
  never trimmed. An unresolvable card refuses the whole import,
  never a substitution.
- **Every problem is reported at once**, not the first one found.
- **An import is all or nothing.** A failure leaves no deck, no
  rows, and no staging directory.
- **An identical package is refused**, naming the deck already
  imported. Identity is the SHA-256 of the package.

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
