# Deck import pipeline

PHASE_02 §2.124. What happens between a player choosing a file and a
deck existing, and where each step's code lives.

The contract for the package itself is `DECK_PACKAGE_FORMAT.md`.

---

## Flow

```text
browser  /decks
    │  multipart POST, one .zip
    ▼
/api/decks/import ─────────────── DeckRoutes.handleImport
    │  streamed to /data/temp/uploads/<id>.zip
    │  route limit 150 MB; the GLOBAL body limit stays at 1 MB
    ▼
inspect ───────────────────────── PackageInspector
    │  central directory only; NOTHING is written yet
    │  type, size, entry count, paths, duplicates, ratio, shape
    ▼
checksum ──────────────────────── ArtStore.sha256Of
    │  SHA-256; an identical package stops here as a duplicate
    ▼
parse ─────────────────────────── DeckListParser
    │  the single root .txt, UTF-8, LF or CRLF
    ▼
legality ──────────────────────── OpenFormat.validate
    │  60-65 cards, max 4 copies, basics unlimited
    │  BEFORE Forge: refusing is free, resolving costs ~3 s
    ▼
resolve ───────────────────────── CardResolver -> forge-worker
    │  one child JVM, whole deck in one request
    │  printing verified; a mismatch is reported, never accepted
    ▼
artwork ───────────────────────── ArtStore.store
    │  one member at a time into staging, decoded, hashed
    │  stored content-addressed; display derivative generated
    ▼
persist ───────────────────────── DeckImporter.persist
    │  ONE transaction: imported_deck, art_asset, deck_entry
    ▼
cleanup ───────────────────────── always, including on failure
    │  /data/temp/deck-imports/<id> removed
    ▼
201 Created
```

## Steps

### Upload

`POST /api/decks/import`, multipart, one `.zip`.

The route carries its **own** 150 MB limit. The global body limit
stays at 1 MB: raising it instead would let every endpoint accept a
deck-sized body.

The uploaded filename is a **label**, used for display. It is never
used as a path.

### Staging

```text
/data/temp/uploads/<uuid>.zip          the upload
/data/temp/deck-imports/<uuid>/        extraction
```

Under `/data`, **never `/tmp`**. The production container runs with
a read-only root filesystem and `/tmp` on a tmpfs — extracting there
would consume RAM rather than disk, and a 150 MB package would be
150 MB of memory.

### Archive validation

Everything is decided from the archive's central directory, before
any member is written. A check performed *during* extraction has
already let the bytes through.

Rejections are listed in `DECK_PACKAGE_FORMAT.md` §6.

### TXT parsing

The single root `.txt`. The header's format label is parsed and
discarded; legality is Arena's own determination.

### Forge resolution

The server owns no card database and never will. Resolution is a
question asked of a worker process:

```text
server ──RESOLVE_CARDS──▶ forge-worker (child JVM)
       ◀──CARDS_RESOLVED─ one result per entry
```

One worker per request, whole deck at once: Forge costs ~2.8 s and
~611 MB to load, so a worker per card would be 40 GB for a 65-card
deck.

Four outcomes: `RESOLVED`, `NOT_FOUND`, `PRINTING_MISMATCH`,
`UNAVAILABLE`. Anything but `RESOLVED` refuses the import, naming
the card.

### PNG validation

Magic bytes, then a real decode, then dimensions. The extension is
never trusted — a "PNG" that is really a payload must not reach disk
under a name the browser might serve.

### Internal manifest

The database rows **are** the manifest: `imported_deck` carries the
schema version, and `deck_entry` carries each line with what Forge
said about it. A separate JSON file would be a second source of
truth that can disagree.

### Database persistence

One transaction. Either the whole deck exists or none of it does.

```text
imported_deck   one row, package_sha256 UNIQUE
art_asset       one row per distinct image, shared across decks
deck_entry      one row per decklist line
```

### File promotion

Art is **content-addressed**, so there is no promotion step:

```text
/data/art/original/<ab>/<sha256>.png    as exported, for zoom
/data/art/display/<ab>/<sha256>.png     384 px wide
```

Writing is idempotent — the same bytes land in the same place — so a
failed import can leave art behind harmlessly. The two-character
fan-out keeps any one directory small.

A derivative that is not smaller than its original is deleted; the
original is served instead.

### Cleanup

Staging is removed after success, failure, exception and abandonment
alike. A staging directory that survives a crash is a disk leak
nobody watches.

### Serving artwork

```text
GET /api/decks/{deckId}/assets/{assetId}
```

`assetId` **is** the content hash. Its shape is validated — 64 hex
characters — so traversal is impossible whatever is sent, rather
than resolving a path and checking where it landed.

The display derivative is served when it exists, the original
otherwise. Content-addressed bytes cannot change for an id, so
responses are cacheable for a year.

De-duplication is **storage only**. Access control is per match and
per viewer from Phase 6 (§6.122); nothing here lets a player
enumerate art they have no right to see.

### Unraid-backed persistent storage

```text
container                 host
/data            ──▶      /mnt/user/appdata/proxic_arena/v2/data
/var/lib/postgresql/data ─▶ /mnt/user/appdata/proxic_arena/v2/postgres
```

Bind mounts under `appdata`, where Unraid's backup routines look.
Verified to survive `docker compose down`, container recreation and
a host reboot.

## Sizes, measured

```text
package               12.4 MB, 12 entries, 11 images
images                745x1040, 370 KB - 1.77 MB
derivatives           384 px, 338-555 KB
deck art on disk      12.1 MB original + 4.9 MB display
import time           ~4 s, dominated by Forge's first load
```

## Where things live

| | |
| --- | --- |
| `DeckRoutes.kt` | HTTP surface |
| `PackageInspector.kt` | archive safety |
| `PackageLimits.kt` | the numbers, with their reasons |
| `DeckList.kt` | decklist grammar |
| `OpenFormat.kt` | legality |
| `CardResolver.kt` | the worker conversation |
| `ArtStore.kt` | validation, hashing, derivatives |
| `DeckImporter.kt` | the pipeline itself |
| `V002__deck_package_import.sql` | the schema |
| `forge-worker/.../ForgeRuntime.java` | Forge, inside the worker |
