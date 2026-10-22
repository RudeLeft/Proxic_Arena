# Phase 2 Exit Gate

**Status: PASSED — 2026-10-15**

Deck package import is built, tested and run. A real Proxic Deck
Builder export becomes a stored deck with artwork, in a browser,
against the deployed stack.

```text
105 server tests      0 skipped  0 failed
 37 frontend tests    0 failed
 12 browser tests     0 failed
ESLint, Prettier, ktlint, detekt   clean
```

**20 of 20 acceptance tests pass.** One carries a caveat and says
so.

---

## §2.127 Mandatory acceptance tests

| Test | Result |
| --- | --- |
| P2-A Real export inspection | **PASS** — `docs/research/phase-02/DECK_BUILDER_EXPORT_INSPECTION.md`, seven findings from a real 12.4 MB export |
| P2-B Deck Builder integrity | **PASS** — read-only; `mtgdb/arena/export.py` read, nothing written (ISO-002) |
| P2-C Real package import | **PASS** — 65 cards, 11 entries, 11 art rows, over HTTP and in a browser |
| P2-D Forge resolution | **PASS** — every card resolved; wrong printings refused |
| P2-E Forge deck construction | **PASS** — Forge's own pool holds 65 cards across 11 names |
| P2-F Artwork mapping | **PASS** — front-face key; 11 images render in the browser |
| P2-G Persistent import | **PASS** — rows and files survive a restart |
| P2-H Container recreation | **PASS** — both containers destroyed and recreated; deck and art intact |
| P2-I ZIP traversal protection | **PASS** — six escape shapes refused |
| P2-J Extraction limit | **PASS** — an 8 MB bomb under 1 MB on disk is refused by ratio |
| P2-K Invalid PNG | **PASS** — magic bytes, decode and dimensions all checked |
| P2-L Missing card | **PASS** — refuses the import, names the card, substitutes nothing |
| P2-M Missing required art | **PASS** — import succeeds and reports the count; art is optional by design |
| P2-N Atomic failure | **PASS** — an illegal deck leaves zero rows and no staging |
| P2-O Browser import | **PASS** — Playwright drives the real page against the real stack |
| P2-P Delete isolation | **PASS** — deck and entries removed, shared art untouched |
| P2-Q No external card service | **PASS** — no network card lookup; the only Scryfall reference is a local Forge field |
| P2-R Public mutation protection | **PASS (amended)** — see below |
| P2-S Old Arena integrity | **PASS, with one observation** — see below |
| P2-T Forge integrity | **PASS** — checkout clean at `4ec5f1a2`, no modifications |

### P2-R — the amended one

§2.20 forbids exposing deck mutation publicly before authentication
exists, and §2.108 requires a test proving it. **PHASE 2 AMENDMENT
1** reversed that by owner decision: import is enabled in
production.

So the test asserts what is still true and useful — that the switch
works (`DECK_IMPORT_ENABLED=false` refuses mutation while reading
stays available) and that §2.30's limits are enforced, since they
are now the only thing bounding a hostile upload.

**This is a knowingly accepted exposure, not an oversight.** Anyone
who learns the hostname can upload deck packages. The realistic
damage is disk and unwanted rows, not access to the host or the
database. It should be revisited when Phase 3 lands, and the
amendment says so.

### P2-S — one observation

`Proxic_Arena_OLD` has **one deleted file** in its working tree:

```text
 D Proxic_Arena_Complete_Build_Plan.docx
```

Nothing in this session wrote to that project, and the file is
intact in git history (commit `6247e977`) — most likely it was moved
out by hand during the pivot. Recorded rather than quietly fixed,
because ISO-001 forbids writing there:

```bash
git -C ../Proxic_Arena_OLD checkout -- Proxic_Arena_Complete_Build_Plan.docx
```

No tracked file was modified, and the branch tip is unchanged.

---

## §2.129 Exit conditions

| Condition | Met |
| --- | --- |
| The real package format is understood | yes — from a real export, not from source alone |
| Deck Builder source used read-only | yes |
| Deck Builder unchanged | yes |
| The package contract is documented | `docs/architecture/DECK_PACKAGE_FORMAT.md` |
| Arena accepts a real Deck Builder ZIP | yes |
| Unsafe ZIPs are rejected | 13 safety tests |
| TXT parsing is deterministic | 14 parser and legality tests |
| Every required card resolves through Forge | yes |
| Arena can construct the intended Forge deck | yes, counted from Forge's own pool |
| PNGs map reliably to deck cards | yes, by front-face name |
| Decks persist under Arena-controlled storage | yes |
| `/data` is backed by persistent Unraid storage | yes — `/mnt/user/appdata/proxic_arena/v2/data` |
| Container replacement does not erase decks | **verified by doing it** |

---

## What Phase 2 found that the specification could not

Six things learned by running against the real export and the real
engine. Each would have shipped as a defect.

1. **The header's format label is wrong.** A 65-card mono-red deck
   declares `(commander)`. Trusting it would make Arena's legality
   depend on a Deck Builder setting.
2. **Forge does not know `A // B` card names.** The first resolver
   reported `NOT_FOUND` for every transforming card — and the real
   export contains one.
3. **Deck Builder and Forge use different set vocabularies.**
   `CON` versus `CFX`, both Conflux. String comparison rejected a
   perfectly valid deck, and would have done so only for decks
   containing the sets where they differ.
4. **Forge silently substitutes a wrong printing.** It does not
   return null for a bad set or collector number. Harmless for
   gameplay, wrong for Proxic.
5. **A 512 px display derivative was bigger than the small
   originals.** Measuring moved it to 384 px: every derivative
   smaller, 3.7x fewer pixels, deck art 12.1 MB → 4.9 MB.
6. **Re-selecting the same file did nothing.** A file input fires no
   change event for an unchanged value, so a second attempt at the
   same deck was silently ignored — and the duplicate message is
   exactly what that player needed to see.

Two more were found in the tests rather than the code:

- **Two tests were never running.** JUnit silently skips a `@Test`
  that returns a value, and `fun x() = withConnection { }` returns
  the row count. Found by counting written against reported.
- **The global body limit blocked the import route.** The tempting
  fix raises it everywhere; the right one raises it for one path,
  and a test now asserts the other routes still refuse.

---

## Deviations

1. **P2-R is amended**, as above.
2. **Art lives in one content-addressed store**, not under each
   deck's directory as §2.57 describes. §2.135 supersedes it for
   storage; §2.60's immutability still holds, enforced by a foreign
   key.
3. **No separate `manifest.json`.** §2.14 says Arena *should* keep a
   normalised internal manifest; the database rows are it, carrying
   the schema version and every line with what Forge said. A second
   file would be a second source of truth that can disagree.

## Not built, deliberately

Deck editing, generic text import, card-art downloading, gameplay
selection, user ownership (§2.88–§2.91, §2.69) — each belongs to a
later phase.

## Open for Phase 3

- Authentication, which removes the amendment's exposure.
- A sweep for art no deck references. Deleting a deck leaves its art
  by design; nothing reclaims it yet.
- Back-face artwork. A transforming card ships only its front, and
  Phase 7 has to draw the back.
