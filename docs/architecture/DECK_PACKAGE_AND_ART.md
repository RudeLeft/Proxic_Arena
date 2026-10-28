# Deck package and card art

**Status:** Owner decision + measured findings, 2026-10-15
**Feeds:** Phase 2 (import), Phase 4 (depot), Phase 6 (match assets), Phase 7 (textures)

---

## 1. The decision

```text
[USER] 2026-10-15: "a zip file will be imported when a player logs in
       it will contain a deck txt and a folder with all of the card
       images. the zip comes from Proxic Deck Builder"
```

Card art is **player-supplied, via the deck package**. Proxic Arena
never fetches images from Scryfall or anywhere else at runtime.

---

## 2. The package contract, read from the exporter

Not inferred — read from `Proxic_Deck_Builder/mtgdb/arena/export.py`
(read-only sibling, AGENTS ISO-002).

```text
<DeckName>.txt
real_cards/<Card Name> [SET].png
```

```text
[SOURCE] REAL_ART_DIRECTORY = "real_cards"
[SOURCE] zipfile.ZipFile(..., compression=ZIP_DEFLATED)
[SOURCE] archive.writestr(f"{_safe_member(job.deck_name)}.txt", job.deck_text)
```

Four behaviours Phase 2 must build around, all from the exporter
itself:

### 2.1 One image per DISTINCT NAME, not per copy

```text
[SOURCE] "Return one card per distinct name of the main deck...
          Arena's art index is keyed by card name, so a second
          printing of the same name could only overwrite the first.
          The deck's own first printing of a name wins."
```

A deck with 20 Mountains ships **one** Mountain image. This changes
the size arithmetic by a large factor (§3).

It also means **the package cannot express two printings of the same
card name**. If a player owns a foil Lightning Bolt and a regular one,
the package carries whichever the deck lists first. That is a real
limitation of the art pipeline, not of Forge, and it interacts with
§0A.9A's exact-printing work: Proxic can know the printing from the
decklist, but may not have distinct art for it.

**Spec 0024 (2026-10-27): any printing of a card Forge plays is
accepted.** When Forge knows the card but not the printing a line asks
for, import keeps the line's printing and picture on the entry
(`set_code`, `collector_number`, `art_sha256`) and records the printing
Forge will play (`resolved_set`, `resolved_number`,
`resolution_status = PRINTING_MISMATCH`). The room's check and the match
both send Forge's. The exception is a card whose printing changes what it
does (Forge's functional variants: Attractions, Everythingamajig, Garbage
Elemental, Sly Spy): that one must be a printing Forge has. The deck rules
say so (`format.anyPrinting`, `printingMatters` on those cards).

### 2.2 Sideboard cards are excluded at source

```text
[SOURCE] "Arena has no sideboard, so a card held only there is not
          exported and gets no art."
```

The exporter already assumes no sideboard, which independently matches
the owner's Open Format decision. Phase 2 should still **reject** a
package that somehow contains one rather than silently dropping it
(`OPEN_FORMAT.md` §4.2).

### 2.3 Filenames keep accents and spaces

```text
[SOURCE] _ILLEGAL_FILENAME_CHARACTERS = '<>:"/\\|?*'
         "Accents and spaces are deliberately NOT touched: Arena
          matches the name as printed, case-folded only, so stripping
          accents here would make Eowyn's art unfindable."
```

Member names are UTF-8 with spaces and accents. Phase 2's ZIP handling
(§2.36 Unicode filenames) must preserve them, and the server must not
normalise them into something that no longer matches the decklist.

### 2.4 The export is written durably

Temp file plus `os.replace`, with `fsync`. A half-written archive is
never left where a complete one is expected. Proxic's import should be
equally atomic from the user's perspective, which Phase 2 §2.18
already requires.

**Since spec 0022 (Arena 1.11.0, Deck Builder 1.3.0)** no file is
written at all: the Deck Builder builds the package in memory and a
linked computer sends it straight to the Deck Depot
(`POST /api/deck-builder/decks`). The package also carries token
cards' pictures (a `// Tokens` decklist section) and may name
pictures Arena already holds in `pictures.json` instead of sending
them; `DECK_PACKAGE_FORMAT.md` §2.1 and §3.2 are the contract.

---

## 3. Measured sizes

From the Mechanics Lab corpus, which is a real Deck Builder export:

```text
[BENCHMARK] 275 images, 289 MB total
            mean   1,078 KB
            median 1,081 KB
            max    1,928 KB
            dimensions 745 x 1040 (0.77 MP)
```

Per-deck, using §2.1's distinct-name rule:

```text
typical 60-65 card deck   ~15-25 distinct names   ~16-27 MB
worst case, all distinct  65 distinct names       ~68 MB
```

The worst case is reachable: Open Format permits a 65-card deck with
no repeats.

---

## 4. The finding Phase 7 needs

```text
source image        745 x 1040  = 0.77 MP
battlefield display  97.5 x 136.5   (layout contract, at 1920x1080)

[BENCHMARK] 58x more pixels than are displayed
            15x more than needed even at 2x for high-DPI
```

Shipping these straight to the browser would mean a 65-card board
decoding ~50 MP of PNG to draw ~0.9 MP of card faces, plus the texture
memory to hold it. That is the single biggest avoidable cost in the
renderer.

**Recommendation: generate display-sized derivatives at import**, and
keep the original only for the inspect/zoom view (Phase 7 §7.30),
which is the one place full resolution is actually seen.

A reasonable derivative set, to be confirmed by measurement in Phase 7:

```text
board   ~200 x 280   (2x the 1920x1080 battlefield size)
hand    ~260 x 364
zoom    original
```

This is also what makes texture atlasing practical — 0.77 MP originals
do not atlas usefully.

**The old project's precedent applies directly:** card faces were
rebuilt through Pillow on every redraw, costing 82 ms per frame and
capping the client at 12 fps, until cached. The cost was found by
profiling, and the first guess about the cause was wrong. Measure
before and after.

---

## 5. Storage and de-duplication

At 5 players with a few decks each, naive per-deck storage is tens of
gigabytes of mostly identical files — every Lightning Bolt in every
deck stored again.

```text
Recommendation: store art once, keyed by content hash, and have decks
reference it. The package's own key, "<Card Name> [SET]", is a
reasonable natural key but is not collision-proof across printings
(§2.1), so hash the bytes.
```

This matters more than it looks: the Mechanics Lab corpus alone is
289 MB, and it is one deck.

De-duplication must not weaken Phase 6 §6.122's match-scoped
authorization. Shared storage is an implementation detail; **access is
still per match and per viewer**, and a player must not be able to
enumerate art they have no right to see.

---

## 6. Open questions

1. **Is the deck `.txt` inside the ZIP the same format the old bridge
   parsed** (`4 Lightning Bolt [SET:NUM]`)? Phase 2 must read the
   actual export rather than assume; `PHASE_02` §2.41 already says so.
2. **What happens when a card has no image in the package?** The
   exporter only ships main-deck art, and the old client fell back to
   generated art. Open Format allows any card, so a missing image must
   degrade visibly rather than break the board.
3. **Double-faced cards** — one member per distinct *name*, but a DFC
   has two faces. Does the export ship both? Not yet checked; it
   affects Phase 7 §7.19.
4. **Re-import of an updated deck** — does it replace art, add to it,
   or create a new deck? Phase 4 ownership rules interact here.

---

## 7. Current deployment

```text
[USER] 2026-10-15: "The unraid deployment can keep running. We are
       going to replace it."
```

The old Proxic Arena stays live on Unraid until the new stack replaces
it. It is not to be modified (AGENTS ISO-001), and no migration path
between the two is planned — the new build is a replacement, not an
upgrade.
