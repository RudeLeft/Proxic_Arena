# Deck Builder export — package inspection

**PHASE_02 §2.4. Inspected 2026-10-15.**

Observed from a real export, not inferred:

```text
Test Deck/Basic_Mono_Red_65_Card_Deck.zip
12,404,818 bytes uncompressed, 12 entries
```

Cross-checked against the exporter source
(`Proxic_Deck_Builder/mtgdb/arena/export.py`, read-only — ISO-002).
Where the two agree, both are cited; where only one could tell us,
it says which.

---

## Archive structure

```text
Basic_Mono_Red_65_Card_Deck.txt          365 bytes, at the root
real_cards/Fiery Temper [INR].png
real_cards/Hellspark Elemental [CON].png
real_cards/Legion Warboss [RVR].png
real_cards/Light Up the Stage [RVR].png
real_cards/Mardu Scout [FRF].png
real_cards/Mountain [FRA].png
real_cards/Rabbit Battery [NEO].png
real_cards/Reckless Stormseeker [MID].png
real_cards/Rift Bolt [2X2].png
real_cards/Staggershock [2X2].png
real_cards/Voldaren Epicure [INR].png
```

| Property | Observed |
| --- | --- |
| Entries | 12 — one `.txt`, eleven `.png` |
| Directory entries | **none** — paths are implied, not stored |
| Compression | DEFLATE (`compress_type=8`) |
| Absolute paths, `..`, backslashes | **none** |
| Encrypted entries | none (`flag_bits=0`) |
| Nested archives | none |

**No manifest.** §2.13 asks not to require one unless necessary;
there is none to require.

**No sideboard section.** The exporter writes main-deck entries only
(`deck_to_text(detached, include_side=False)`), which matches Open
Format having no sideboard.

## The deck text

`<DeckName>.txt` at the archive root.

| Property | Observed |
| --- | --- |
| Encoding | UTF-8, **no BOM** |
| Line endings | **LF only** — 13 LF, 0 CRLF |
| Trailing newline | yes |

```text
// Basic_Mono_Red_65_Card_Deck (commander)
<blank>
4 Fiery Temper [INR:154]
4 Hellspark Elemental [CON:65]
...
25 Mountain [FRA:287]
4 Reckless Stormseeker // Storm-Charged Slasher [MID:157]
```

**Line syntax**

```text
<quantity> <card name> [<SET>:<COLLECTOR NUMBER>]
```

- Quantity is a bare integer, space-separated, first token.
- The card name is everything between the quantity and ` [`.
- Set code and collector number are colon-separated inside brackets.
- A double-faced card carries **both faces**, joined by ` // `.

**Header line** is a `//` comment: the deck name and a format label
in parentheses. See the finding below — the label is not
trustworthy.

## Artwork

```text
real_cards/<front face name> [<SET>].png
```

- **Front face only.** `Reckless Stormseeker // Storm-Charged
  Slasher` is filed as `Reckless Stormseeker [MID].png`. The back
  face has no image in the package.
- **One image per distinct card NAME, not per printing or per copy.**
  11 images for 65 cards. The exporter says so explicitly: Arena's
  art index is keyed by name, so a second printing of a name could
  only overwrite the first.
- **No collector number** in the PNG name, though the deck line has
  one. The two identifiers are not interchangeable.
- Illegal filename characters `<>:"/\|?*` are stripped; **accents
  are preserved** deliberately, because matching is by name as
  printed, case-folded only.
- Sizes here: 379 KB to 1.77 MB, median 1.5 MB.

## Size and compression, for §2.30 and §2.31

```text
compressed    12,403,850
uncompressed  12,404,818      ratio 1.0001
```

PNGs are already compressed, so a legitimate package is **barely
smaller than its contents**. That is a useful signal: a package with
a high compression ratio is not a normal export, and §2.31's bomb
protection can treat ratio as evidence rather than relying on an
absolute size alone.

Scaling from this deck: 11 images at ~1.1 MB average. A 65-card
deck of entirely distinct cards would be ~65 images, so roughly
**70 MB** is a plausible upper bound for one honest export, before
§2.134's down-scaling.

---

## FINDING 1 — the format label says `(commander)` and is wrong

The header reads:

```text
// Basic_Mono_Red_65_Card_Deck (commander)
```

This deck is 65 cards with 25 Mountains and four copies of ten
different cards. It is **not** a Commander deck, and Commander is
out of scope for Arena entirely (owner decision, 2026-10-15).

The label reflects a setting inside Deck Builder, not the deck's
actual legality.

**Arena must ignore it.** Deck legality is Proxic's own
determination (§2.45), and Open Format's rules are checked against
the parsed contents: 60–65 cards, at most 4 of any card, basic lands
unlimited. A deck is not Commander because a comment says so, and it
is not legal because a comment says it is.

Recorded rather than escalated under §2.7: no information is
missing, and the only thing required of Arena is to not trust a
field it never needed.

## FINDING 2 — art is optional, by design

A card whose art could not be fetched is **omitted from the ZIP and
the export still succeeds**, with a comment in the exporter saying
exactly that: the decklist is still worth having.

So a package with fewer PNGs than distinct cards is **valid**, not
corrupt. §2.62 ("Missing Required PNG") must therefore mean "render
the fallback", never "reject the import".

Every card in this export had art, so the missing-art path was not
observed here — only established from source. A test fixture should
include it deliberately.

## FINDING 3 — the back face of a double-faced card has no art

`Reckless Stormseeker // Storm-Charged Slasher` ships one image, of
the front.

Nothing in Phase 2 needs the back face. **Phase 7 does** — a
transformed permanent has to be drawn, and there will be no art for
it. The options, none of which belong to this phase, are: generated
fallback art for back faces, a Deck Builder change to export both
faces, or Arena fetching them itself (§2.90 currently forbids that).

Raised here so it is a known gap rather than a Phase 7 surprise.

## FINDING 4 — the `.txt` name is derived from the deck, not the archive

The exporter names the member from the **deck name**, and the
archive from wherever the user saved it. They match in this sample
because the owner saved it that way.

Arena must locate the decklist **by extension** — the single
`.txt` at the archive root — and must not assume it matches the ZIP
filename. §2.34's duplicate-path handling and the "exactly one
`.txt`" rule cover the rest.
