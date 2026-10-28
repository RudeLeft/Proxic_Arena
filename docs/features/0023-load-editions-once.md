# 0023 — Load Forge's editions once

**Status:** Approved 2026-10-27 — built in 1.13.0
**Owner decisions:** D1 load the editions once, and the Deck Builder (in
its own project) skips crossover (Universes Beyond) printings when it has
to swap one in (owner, 2026-10-27: "I would rather not get a Sol Ring or
any other card from a special/themed card set").

## What the player sees

Nothing in a game. The difference shows in the Deck Builder's Proxic
Arena export, when a deck holds a printing Arena does not have and the
Deck Builder swaps in one Arena does (spec 0022 takes that printing from
Arena's list, first one first).

Example: your deck has a Lightning Bolt from a set Arena's Forge does not
know. Today the Deck Builder swaps in **SLZ 184**, a collector-edition
printing from The Zeta Set. After this change Arena's list puts
ordinary sets first, as spec 0022 meant ("core, expansion and reprint
sets first, newest first"), and the Deck Builder passes over crossover
sets in that list, so it swaps in **2X2 117** (Double Masters 2022).
Sol Ring: today a Commander-deck printing; Arena's fixed list alone would
give the Teenage Mutant Ninja Turtles one; with the Deck Builder's part,
a The List reprint. A card printed only in crossover sets still gets
one: there is nothing else.

## Why

The worker hands Forge its editions folder twice: once as Forge's
editions and again as *custom* (home-made) editions
(`ForgeRuntime.ensureLoaded`: `root + "/editions", root + "/editions"`).
Forge reads custom editions with their type forced to "custom set"
(`CardEdition.Reader`, `isCustomEditions` → `Type.CUSTOM_SET`) and
`Collection.append` puts each one over the real edition of the same code.
So every edition Forge has reads as a custom set — `SOURCE`, and `RUN`:
all 682 editions in `GET /api/deck-rules` say `CUSTOM_SET`. With every
edition the same type, spec 0022's "core, expansion and reprint first"
has nothing to sort on and becomes plain newest-first. Spec 0022's
2026-10-27 amendment recorded this and left the fix to its own change:
this one.

The double path dates from Phase 0A, recorded as such in
`PHASE_00_ACCEPTED_DECISIONS.md` "Forge bootstrap requirements"
(`editions, editions`). Nothing there says why — `INFERENCE`: it filled a
required argument with a folder that existed.

## Scope

In:
- The worker gives Forge a custom-editions folder that holds no editions:
  a new empty temporary folder per worker process, deleted on exit. Not a
  missing folder: Forge **creates** a missing one
  (`StorageReaderFolder` calls `mkdirs`, `SOURCE`), and in production the
  resource tree is read-only and owned by root (`docker-compose.yml`
  `read_only: true`; `/tmp` is a tmpfs), so the worker would fail to
  start. Temporary rather than a folder shipped in the image: no Dockerfile
  or local-setup change, and the same in tests, CI and production.
- `DeckRules.POOL_REVISION` 2 → 3. The server keeps the pool per
  `pool-r<revision>-<forge commit>.json` and `rulesVersion` hashes the
  same two; the Forge commit does not change here, so without the bump
  the server keeps serving the old order and old types from
  `/data/deck-rules`, and a linked Deck Builder holding the old ETag gets
  "not modified" and never refetches.
- The amendment to `PHASE_00_ACCEPTED_DECISIONS.md` (that document's
  preamble makes any change to it an owner amendment): `editions, <empty>`. The
  same block also still says `loadNonLegalCards` false, which Phase 8
  Amendment 3 changed to true; corrected in the same amendment.
- `FORGE_WORKER_RUNTIME.md` and the `CardPool` comment ("Forge's default
  preference is not used … Secret Lair") say what is true after.
- Tests (below), including one that fails on today's code.

Out (and why):
- Any printing order of Arena's own. The order stays Forge's
  `LATEST_ART_CORE_EXPANSIONS_REPRINT_ONLY`; this change only lets Forge
  read its own edition types. Forge labels the Universes Beyond "Eternal"
  sets (TLE, TMC) and Marvel's Spider-Man as expansions, so they rank as
  regular sets; that is Forge's label, not ours to correct.
- Real custom editions. Arena loads no custom cards (`customCardReader`
  is null); offering home-made sets is a different feature.
- Crossover sets in Arena. Forge's edition files carry no mark for them
  (Avatar Eternal's metadata reads like Duskmourn's: code, date, name,
  `Type=Expansion`), so Arena could only skip them by keeping its own list
  of sets, which spec 0022 decided against. Scryfall marks them, and the
  Deck Builder already records that per set (`universes_beyond`, from the
  triangle security stamp or the `universesbeyond` promo type).

**The Deck Builder's part (its own project and session, ISO-002; not
built here).** When `choose_printing` has to swap, it ranks a printing
from a set its own data marks `universes_beyond` after every other
candidate, keeping Arena's order otherwise; the deck's own set still
comes first. Today it stores each edition's `type` but never acts on it,
and needs nothing else: it picks up Arena's new order when it refetches
the rules.

## What reads an edition's type (forge-core, forge-game, forge-ai at the pin)

The worker loads forge-core, forge-game and forge-ai (`pom.xml`). Every
reader of `CardEdition.Type` or "custom" there, and what this change does
to it — `SOURCE` unless marked:

| Reader | What it does | Effect here |
|---|---|---|
| `CardDb.CardArtPreference.compare/accept` (filter `CORE, EXPANSION, REPRINT`) | Ranks and filters editions for the two "core, expansion, reprint" preferences | **The intended change.** Only Arena's `CardPool.ORDER` asks for it. Forge's default preference, set from `"Latest"`, is "latest, all editions": no filter, date only, so untouched — `RUN`: 0 of 33,555 cards change the printing a set-less deck line gets |
| `CardEdition.Predicates.getPreferredArtEditionWithAllBasicLands` | Basic-land edition by the default preference | No filter under `"Latest"`. `RUN`: TRK both before and after |
| `CardDb.initialize` / `addUnassignedCardPrints` (`CORE`/`EXPANSION` dated in the future = "upcoming set") | A card in `cardsfolder/upcoming/` that no edition lists joins the upcoming set | Today no edition is core or expansion, so there is never an upcoming set and such a card would be left out. After: Star Trek (TRK, dated 2026-11-13) is the upcoming set, and Forge logs that once per load. `RUN`: no card is added today (97,090 printings either way) |
| `StaticData` constructor: `FUNNY` or silver border → leave the card out | Leaves out joke-set cards | Skipped: Arena passes `loadNonLegalCards` true (Phase 8 Amendment 3) |
| `StaticData` alternative-art search (`EXPANSION`), `deck.CardPool.getTheMostFrequentEditionType`, `Deck` art optimisation | "Smart card art selection" | Off: Arena passes `enableSmartCardArtSelection` false, and `Deck` runs its art optimisation only when `isEnabledCardArtSmartSelection()` is true |
| `CardDb.EDITION_NON_PROMO`, `EDITION_NON_REPRINT` | Predicates for card lists | No call site in the worker, forge-game or forge-ai |
| `StaticData.audit` (`FUNNY`), `getEditionsTypeMap` | Desktop image audit, set menus | Desktop-only; not called by the worker |
| `CardRules.isCustom` → `DeckFormat` with `allowCustomCardsInDecksConformance` false | Refuses home-made **cards** in a deck | A card property, set only for cards from the custom-card reader (null for Arena); not an edition type. Arena also enforces Open Format itself (FMT-002), not Forge's `DeckFormat`. No effect |
| The `USER` edition `Collection.append` always adds | Bucket for custom cards with no set | Still added (it is in `append`, not the folder): 682 editions either way, `USER` stays `CUSTOM_SET` |
| Arena's own code | `CardPool` sends `type` in the edition list; nothing in the server or browser reads it (grep) | The `type` field becomes Forge's real type for 681 of 682 editions |

## Measured before/after (2026-10-27, `RUN`, scratch probe, no project change)

Forge loaded twice in fresh JVMs from the 0022 worker jar, exactly as
`ForgeRuntime` loads it, with the custom-editions folder as today and as
proposed, then `CardPool.describe` compared:

- Same 33,555 card names, same printings per card, same 682 edition codes,
  same 763 accepted set codes; editions identical apart from `type`.
- Printing **order** changes for 9,865 of the 19,474 cards with more than
  one printing; the **first** printing changes for 7,835. Mostly from
  Commander, draft-only, online and collector sets to expansion, core and
  reprint ones.
- 3,319 cards have more than one printing and none in a core, expansion or
  reprint set; they stay newest first.

| Card | First printing today | After |
|---|---|---|
| Lightning Bolt | SLZ 184 (collector edition) | TLE 32 (expansion) |
| Counterspell | PF26 5 (promo) | DMR 281 (reprint) |
| Sol Ring | FRC 21 (Commander) | TMC 59 (expansion) |
| Llanowar Elves | SLZ 202 (collector edition) | FDN 227 (core) |
| Serra Angel | SLZ 10 (collector edition) | FDN 147 (core) |
| Island, Forest, Giant Growth | TRK / MSH (expansion) | unchanged |

Crossover printings, measured against the Deck Builder's own marking (77
sets; read-only), over the 17,807 cards that have a non-crossover
printing. The first pick is a crossover printing for:

| Order | Cards |
|---|---|
| Today (newest first) | 1,122 |
| This change alone | 446 |
| Forge's "original art, core, expansion, reprint" (oldest first; Alpha Bolt and Sol Ring) | 305 |
| This change + the Deck Builder skipping crossover sets (chosen) | 0 |

One run each, so the load time (3.1 s today, 2.7 s after) is not a
measurement of a difference (EVID-005).

## Rules and boundaries

- **VEND-001/002:** no Forge source is edited and no patch is applied; the
  change is the argument Arena passes.
- **ARCH-002 / FORGE-RULE:** the order stays Forge's preference; Arena
  ranks nothing.
- **ARCH-001:** the server still learns the pool only from the worker.
- **TEST-001/004:** spec 0022's F-0022-G compares the first listed printing
  with `getCardFromEditions(…, CardPool.ORDER, …)` — both read the same
  wrong types, so it passes before and after and cannot catch this. F-0023-B
  asserts the edition type itself and must fail on today's code.
- **EVID-004:** the gates below are re-run after the change; earlier runs
  are not carried forward.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0023-A | Every edition's type is the one in its own file; only `USER` reads custom set. Fails today (682 custom). | unit, real Forge (`CardPoolTest`) |
| F-0023-B | Lightning Bolt's first listed printing is from a core, expansion or reprint edition (not SLZ). Fails today. | unit, real Forge (`CardPoolTest`) |
| F-0023-C | Nothing else moves: card names, printings per card, set codes and the set-less default printing are identical before and after (the probe above, re-run on the built worker). | real worker |
| F-0023-D | The worker starts with a read-only resource tree: the local container stack (`read_only: true`) starts, `/api/deck-rules` answers, a game starts. | real container |
| F-0023-E | `POOL_REVISION` 3: a server with a kept `pool-r2-…` file asks the worker again; `rulesVersion` changes; a request with the old ETag gets the new document, not "not modified". | unit (`DeckRulesTest`) |
| F-0023-F | Unchanged gates stay green: `CardPoolTest`, `DeckImportTest`, the Mechanics Lab gate (48/48 required), and a real game (`scripts/play-a-game.py`). | unit, real game |
| F-0023-G | In the Deck Builder, after it refetches the rules, a deck with a Lightning Bolt Arena lacks exports with a non-crossover printing (2X2 117 by the measurement above), and Sol Ring with no Turtles printing. Built and checked in the Deck Builder's own session (ISO-002); the owner's eyes on the export window. | Deck Builder session, owner |

## Decisions for the owner

**D1 — Load Forge's editions once?** Today Forge believes every set is a
home-made one, so "regular sets first" cannot work and the Deck Builder
swaps in the newest special printing: Secret Lair-style Lightning Bolts,
Commander-deck Sol Rings, promo Counterspells. Loading the editions once
lets Forge tell a regular set from a special one; nothing in a game
changes, and no card is added or removed.

Forge counts the Universes Beyond "Eternal" sets as regular expansions,
so on its own this would make Sol Ring's first choice the Teenage Mutant
Ninja Turtles printing (TMC 59). The options put to the owner: this
change only (446 cards still swap to a crossover printing); Forge's
oldest-first order (Alpha printings, 305 still crossover); or this change
plus the Deck Builder skipping crossover sets (0).

**Decided 2026-10-27 (owner):** this change plus the Deck Builder skipping
crossover printings.

## Amendments

- **Amendment 1, 2026-10-27 (owner, with spec 0024).** Spec 0024 lets a
  player keep any printing of a card Arena can play, so the Deck Builder
  swaps a printing only for the 24 cards whose printing changes the card.
  The swap order then rarely matters. **The Deck Builder's part is
  dropped** (no skipping crossover sets; F-0023-G dropped). Arena's part
  stays as written: Forge sees each set's real type, and the deck rules
  list printings in Forge's order.
