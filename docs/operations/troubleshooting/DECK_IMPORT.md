# Troubleshooting — deck import

PHASE_02 §2.125. Each entry names what the player or operator sees,
what it means, and what to do.

**The import never asks anyone to read container logs for an
ordinary package mistake.** Every rejection below is shown with its
reason: since 1.11.0 (spec 0022) in the Deck Builder's Proxic Arena
Export window, which sends decks straight to the Deck Depot. If you
find one that is not, that is a bug in the error view, not in the
package.

The contract is `docs/architecture/DECK_PACKAGE_FORMAT.md`; the
mechanism is `docs/architecture/DECK_IMPORT_PIPELINE.md`.

---

## `NOT_A_ZIP` — "The upload is not a readable ZIP archive."

The upload is not a readable ZIP. A `.zip` extension is not
evidence.

Usually the wrong file. Send the deck again from Proxic Deck Builder
(Arena's Decks page has no upload since spec 0022); a renamed decklist
is not a package.

## `NO_FILE` — "No package was uploaded."

The send arrived with no file in it, or with an empty one
(`DeckRoutes.kt` `handleImport`, for both the browser's import and the
Deck Builder's send).

Usually a send cut off before the package was attached, or a package
file that is 0 bytes on disk. Send the deck again from Proxic Deck
Builder; if the package file itself is empty, export it again.

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

Open Format is 60–100 cards, at most 4 of any card, basic lands
unlimited, no sideboard. Contraptions and Attractions are the one
exception: they go in their own small deck (at least 15 Contraptions
or 10 Attractions, one copy of each) and do not count toward the
60–100.

**"Any number" cards are not exempt.** Relentless Rats, Dragon's
Approach and Persistent Petitioners are limited to 4 like everything
else (owner decision). Magic's own rules disagree; Open Format is
Arena's format.

Arena never trims a deck to fit. Fix it in Deck Builder and export
again.

## `CARDS_NOT_RESOLVED` — Forge does not recognise a card

The message names each card and why ("Line 12, Foo: ..."; spec 0114
gives fixed words for each answer, `CardResolution.wordsFor`, and never
passes the worker's own text on).

| Detail | Meaning |
| --- | --- |
| `Arena doesn't know this card yet.` | the name is wrong, or the card is newer than the pinned Forge |
| `This card works differently in each printing, and Arena doesn't have this one.` | a card whose printing changes what it does, in a printing Forge does not have; see below. Any other card in another printing is accepted (spec 0024) |

With the card checker down (no worker jar, or it did not answer) the
refusal is one sentence and no list: "The cards could not be checked
just now. Try sending the deck again in a minute." The server log says
which (`card checker unavailable: ...`).

**One unresolvable card refuses the whole import.** Arena does not
import a partial deck and does not substitute another card: a deck
you cannot actually play is worse than a clear refusal.

If the card is real and current, the pinned Forge commit may predate
it. Updating Forge is not a routine bump — see the README's Forge
update warning.

### Printing mismatches

Forge's lookup does **not** fail for a wrong set or collector
number; it quietly returns another printing of the same name. Since
spec 0024 (owner 2026-10-27) Arena **accepts** that: the deck keeps
your printing and picture, and Forge plays the printing it has. The
one refusal left is a card whose printing changes what it does
(Attractions, Everythingamajig, Garbage Elemental, Sly Spy and the
like): that one must be a printing Forge has.

Set-code differences between Deck Builder (Scryfall) and Forge are
handled automatically — `CON` and `CFX` are both Conflux — so a
mismatch here means a genuinely different printing.

## `INVALID_ARTWORK` — an image is not a usable picture

| Code | Meaning |
| --- | --- |
| `NOT_A_PICTURE` | the file is neither a PNG nor a JPEG (spec 0051), whatever it is called |
| `UNDECODABLE_IMAGE` | a picture's header, but the data is corrupt |
| `UNREASONABLE_DIMENSIONS` | smaller than 50 px or larger than 4000 px |
| `IMAGE_TOO_LARGE` | a picture whose data turned out larger than the archive declared |

Since spec 0114 the player sees each problem as a sentence naming the
card, never the code or the file inside the deck file: "The picture for
Foo is not a PNG or JPEG file.", "... could not be opened.", "... is too
big (9000 by 9000 pixels).", "... is too small (10 by 10 pixels).", "...
has no size we can read." The codes above are in the server's log
("picture real_cards/... refused: NOT_A_PICTURE"), not the problem lines.

A file the archive itself declares as over 16 MB is refused before any
picture is read, as `ENTRY_TOO_LARGE` on its own rather than under
`INVALID_ARTWORK`.

Re-export. If it recurs for the same card, the cached art in Deck
Builder is probably damaged.

## Missing artwork is NOT an error

A package with fewer images than cards is **valid**. Deck Builder
omits art it could not fetch and still exports, deliberately. The
import succeeds and says how many cards arrived without art; those
cards render a fallback.

## `ARCHIVE_TOO_LARGE` / `TOO_MANY_ENTRIES` / `TOO_MANY_IMAGES`

Above the limits in `PackageLimits.kt`: 150 MB, 600 entries, 500
images (300 and 200 before spec 0051). A 100-card deck of entirely
distinct cards is well inside them, so a package past these is not a
normal export.

## `DECK_TEXT_TOO_LARGE` — the decklist is too big

The decklist `.txt` is over 1 MB (`PackageLimits.kt`
`MAX_DECK_TEXT_BYTES`; checked in `DeckImporter.kt`). A real 100-card
decklist is a few kilobytes, so this is not a decklist.

Not produced by Deck Builder. Something replaced or padded the
decklist; export again.

## `COMPRESSION_RATIO` — the package expands too much

A real export expands at a ratio of about **1.0001**, because PNGs
are already compressed. A ratio above 10 is not a well-packed deck.

## `UNSAFE_PATH` / `DUPLICATE_PATH` / `UNEXPECTED_ENTRY`

The archive contains a path that escapes its directory, two files
that resolve to the same name, or a member that is not one of: the
decklist, a PNG or JPEG in `real_cards/`, a JPEG in `art_crops/`
(spec 0051), or `pictures.json` (spec 0022).

Not produced by Deck Builder. Something rebuilt the archive.

## `PICTURE_NOT_HELD` — a picture was named but not sent

The package's `pictures.json` named a picture by its hash instead of
sending it, but none of the sender's own decks uses that picture
(spec 0022). The Deck Builder only names pictures Arena told it the
player's decks already hold, so this means a deck was deleted between
that question and the send. Send again: the Deck Builder asks again
and sends the picture in full.

## `DUPLICATE_PACKAGE` — already imported

You imported the byte-for-byte identical package before (the check is
per account since PHASE 4 AMENDMENT 4: another player may import the
same file). The message names your existing deck; use that one, or
delete it first.

A deck with any change — one card, one different printing — has a
different checksum and imports normally.

## `DECK_NAME_TAKEN` — "You already have a deck called ..."

You already have a deck with that name (PHASE_07 §7.65: a player's
deck names are unique to that player; capitals and surrounding spaces
do not count, so "Burn" and " burn" clash). Sent for a deck whose name
you already use, and for a rename on the Decks page to such a name
(`DeckRoutes.kt` `importAndRespond`, `DeckRenameRoutes.kt`). Another
player's deck of the same name does not count.

The Deck Builder asks for another name and sends again with it. Or
rename or delete your existing deck first.

## `INVALID_DECK_NAME` — "A deck name is 1 to 80 characters on one line."

A name you typed (a new name for a send, or a rename) is empty, longer
than 80 characters, or has a line break or other control character in
it (`DeckNames.kt` `typed`). A name taken from the package itself is
never refused: it is shortened instead.

Type a shorter name on one line.

## `IMPORT_DISABLED`

`DECK_IMPORT_ENABLED=false` on this server. Only importing is off
(the Deck Builder's sends included); reading, renaming, deleting,
sharing and icons still work. The server reads it (default `true`), but no
compose file passes it through, so on the Compose/Unraid stack it is
only off if someone added it to the `arena-server` environment; remove
it there (or set `true`) and Compose Up again.

## `IMPORT_FAILED` — "The package could not be imported." / "The deck could not be stored."

Not a package mistake: the server failed while importing
(`DeckImporter.kt`). "Could not be imported" is an unexpected error
anywhere in the import, logged as `import <id> failed unexpectedly`
with its stack trace; "could not be stored" is the database refusing
the deck's rows, logged as `persisting deck <id> failed`. Nothing is
kept from a failed import: the staging folder is cleaned up and the
deck's rows are rolled back.

Send once more. If it fails again, this is the one case for the
logs: `docker compose logs arena-server` and look for those lines;
a database failure there usually means the database is unwell (see
`FOUNDATION.md`).

---

## Operator failures

### The import returns 500, or the page says the server could not be reached

Check readiness first:

```bash
docker compose exec arena-server wget -qO- http://127.0.0.1:8080/api/health/ready
```

It prints the JSON only when every check passes (`unconfigured` does
not count as failing); a `503` means one failed. The signed-in Status page shows the database and the Forge
worker; it has no data-folder indicator, so a 503 with both "Ready"
there is `dataRoot` (below; `FOUNDATION.md`).

| Check | Meaning |
| --- | --- |
| `database` not `ok` | see `FOUNDATION.md` |
| `forgeWorker` not `ok` | resolution will fail for every deck |

### `forgeWorker: resources-missing`

Forge's data files are not where the worker expects. In the Docker
image they are baked in at `/app/forge/res`; outside it,
`PROXIC_FORGE_RES` must point at a Forge `res` directory. Readiness
shows only the word; run the worker by hand (`FOUNDATION.md`) to see
which subdirectory is missing.

### Imports fail only for large packages

Almost certainly the route body limit rather than the package.
`/api/deck-builder/decks` and `/api/decks/import` accept 150 MB;
a bug report or idea (`/api/reports`, with its screen picture) 5 MB;
every other endpoint accepts 1 MB. The Deck Builder leaves out
pictures the player's decks already hold (spec 0022), so only a first
send of a big deck comes near the cap. A reverse proxy in front may impose its own smaller limit —
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

Deleting a deck does **not** delete its art at once, because another
deck may share it. A weekly sweep (`PictureCleanup`, spec 0052) removes
pictures no deck has held for 30 days, never one a game now running
may show.

### A deck imported before a Forge change now behaves differently

`deck_entry` stores what Forge said at import time, including the
resolved set and collector number. Compare that against what Forge
says now before assuming the import was wrong.
