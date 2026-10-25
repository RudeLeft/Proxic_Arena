# Troubleshooting — deck import

PHASE_02 §2.125. Each entry names what the player or operator sees,
what it means, and what to do.

**The import never asks anyone to read container logs for an
ordinary package mistake.** Every rejection below is shown on the
page with its reason. If you find one that is not, that is a bug in
the error view, not in the package.

The contract is `docs/architecture/DECK_PACKAGE_FORMAT.md`; the
mechanism is `docs/architecture/DECK_IMPORT_PIPELINE.md`.

---

## `NOT_A_ZIP` — "That file is not a deck package"

The upload is not a readable ZIP. A `.zip` extension is not
evidence.

Usually the wrong file. Export the deck again from Proxic Deck
Builder and upload the archive it produced, not a renamed decklist.

## `NO_DECK_LIST` — no decklist in the package

The archive has no `.txt` at its root.

Likely an archive made by hand, or one where the decklist was put in
a folder. The decklist must be at the top level.

## `MULTIPLE_DECK_LISTS`

Two or more `.txt` files at the root. Arena will not guess which one
is the deck — importing the wrong one silently would hand you a deck
you did not build.

## `INVALID_DECK_LIST` — a line could not be read

The message names the line number and what was wrong.

```text
Line 7: line is not '<quantity> <card name> [SET:NUMBER]'
```

Nearly always a hand-edited decklist. The grammar is in the format
document §3.1.

## `DECK_NOT_LEGAL` — the deck breaks Open Format

Every problem is listed at once:

```text
Open Format requires at least 60 cards; this deck has 54.
Open Format allows at most 4 copies of "Fiery Temper"; this deck has 5.
```

Open Format is 60–65 cards, at most 4 of any card, basic lands
unlimited, no sideboard.

**"Any number" cards are not exempt.** Relentless Rats, Dragon's
Approach and Persistent Petitioners are limited to 4 like everything
else (owner decision). Magic's own rules disagree; Open Format is
Arena's format.

Arena never trims a deck to fit. Fix it in Deck Builder and export
again.

## `CARDS_NOT_RESOLVED` — Forge does not recognise a card

The message names each card and why.

| Detail | Meaning |
| --- | --- |
| `Forge does not know a card named "..."` | the name is wrong, or the card is newer than the pinned Forge |
| `Requested CON/65, Forge returned CFX/65` | see below |

**One unresolvable card refuses the whole import.** Arena does not
import a partial deck and does not substitute another card: a deck
you cannot actually play is worse than a clear refusal.

If the card is real and current, the pinned Forge commit may predate
it. Updating Forge is not a routine bump — see the README's Forge
update warning.

### Printing mismatches

Forge's lookup does **not** fail for a wrong set or collector
number; it quietly returns another printing of the same name. Arena
checks and refuses, because the printing is what you chose and what
your artwork is keyed to.

Set-code differences between Deck Builder (Scryfall) and Forge are
handled automatically — `CON` and `CFX` are both Conflux — so a
mismatch here means a genuinely different printing.

## `INVALID_ARTWORK` — an image is not a usable PNG

| Code | Meaning |
| --- | --- |
| `NOT_A_PNG` | the file is not a PNG whatever it is called |
| `UNDECODABLE_IMAGE` | a PNG header, but the data is corrupt |
| `UNREASONABLE_DIMENSIONS` | smaller than 50 px or larger than 4000 px |
| `IMAGE_TOO_LARGE` | over 16 MB |

Re-export. If it recurs for the same card, the cached art in Deck
Builder is probably damaged.

## Missing artwork is NOT an error

A package with fewer images than cards is **valid**. Deck Builder
omits art it could not fetch and still exports, deliberately. The
import succeeds and says how many cards arrived without art; those
cards render a fallback.

## `ARCHIVE_TOO_LARGE` / `TOO_MANY_ENTRIES` / `TOO_MANY_IMAGES`

Above the limits in `PackageLimits.kt`: 150 MB, 300 entries, 200
images. A 65-card deck of entirely distinct cards is ~70 MB, so a
package past these is not a normal export.

## `COMPRESSION_RATIO` — the package expands too much

A real export expands at a ratio of about **1.0001**, because PNGs
are already compressed. A ratio above 10 is not a well-packed deck.

## `UNSAFE_PATH` / `DUPLICATE_PATH` / `UNEXPECTED_ENTRY`

The archive contains a path that escapes its directory, two files
that resolve to the same name, or a member that is neither the
decklist nor a PNG in `real_cards/`.

Not produced by Deck Builder. Something rebuilt the archive.

## `DUPLICATE_PACKAGE` — already imported

The byte-for-byte identical package was imported before. The message
names the existing deck; use that one, or delete it first.

A deck with any change — one card, one different printing — has a
different checksum and imports normally.

## `IMPORT_DISABLED`

`DECK_IMPORT_ENABLED=false` on this server. Reading stays available;
only mutation is off. Set it to `true` and restart.

---

## Operator failures

### The import returns 500, or the page says the server could not be reached

Check readiness first:

```bash
docker compose exec arena-server wget -qO- http://127.0.0.1:8080/api/health/ready
```

| Check | Meaning |
| --- | --- |
| `database` not `ok` | see `FOUNDATION.md` |
| `forgeWorker` not `ok` | resolution will fail for every deck |

### `forgeWorker: resources-missing`

Forge's data files are not where the worker expects. In the Docker
image they are baked in at `/app/forge/res`; outside it,
`PROXIC_FORGE_RES` must point at a Forge `res` directory. The detail
names which subdirectory is missing.

### Imports fail only for large packages

Almost certainly the route body limit rather than the package.
`/api/decks/import` accepts 150 MB; every other endpoint accepts
1 MB. A reverse proxy in front may impose its own smaller limit —
Cloudflare's free tier caps uploads at 100 MB, which is **below**
Arena's own limit, so a 120 MB package fails at the edge with no
Arena error at all.

### `dataRoot` is not `ok`, or art disappears after a restart

`/data` must be a real volume. In the Unraid deployment it is
`/mnt/user/appdata/proxic_arena/v2/data`. If the bind mount is
missing, imports succeed into the container's own filesystem and
vanish when it is recreated.

```bash
docker compose exec arena-server sh -c 'touch /data/probe && rm /data/probe && echo writable'
```

### Storage permission failure

The server runs as `uid=100(proxic)` with a **read-only root
filesystem**. It can write only `/data` and `/tmp`. A permission
error naming any other path means something is trying to write where
it should not.

### Disk filling up

Art is de-duplicated by content hash, so decks sharing cards cost
nothing extra. What does accumulate:

```bash
du -sh /mnt/user/appdata/proxic_arena/v2/data/art/*
du -sh /mnt/user/appdata/proxic_arena/v2/data/temp
```

`temp` should be nearly empty — staging is removed after every
import. Anything persistent there is a bug worth reporting.

Deleting a deck does **not** delete its art, because another deck
may share it. Reclaiming unreferenced art is a sweep that does not
exist yet.

### A deck imported before a Forge change now behaves differently

`deck_entry` stores what Forge said at import time, including the
resolved set and collector number. Compare that against what Forge
says now before assuming the import was wrong.
