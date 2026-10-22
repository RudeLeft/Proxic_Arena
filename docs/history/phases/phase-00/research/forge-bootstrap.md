# Phase 0A — Forge bootstrap and runtime resource inventory

**Section:** `PHASE_00A` §0A.5 (and `PHASE_00` §0.18, §0.19, §0.22, §0.54, §0.55)
**Forge pin:** `forge-2.0.15` — `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`
**Date:** 2026-10-14
**Harness:** `spikes/forge-phase0a/bootstrap-harness/` (source versioned, jars not)

---

## 1. The bootstrap sequence that works

```text
[RUN] java -jar bootstrap-harness.jar --res=<forge-gui/res>
      RESULT: PASS   96,916 cards in ~2.8 s
```

Derived against 2.0.15, using the old project's sequence as a hypothesis
per §0A.2 rather than as an answer.

```text
1. Localizer.getInstance().initialize("en-US", <res>/languages)
2. Lang.createInstance("en-US")
3. ImageKeys.initializeDirs("", emptyMap(), "", "", "", "", "", "", "")
4. CardType.Helper.parseTypes(...) from <res>/lists/TypeLists.txt     [see §4]
5. CardStorageReader(<res>/cardsfolder, null, false)
6. CardStorageReader(<res>/tokenscripts, null, false)
7. new StaticData(cards, tokens, null, null,
                  <res>/editions, <res>/editions,
                  <res>/blockdata, <res>/setlookup,
                  "Latest", false, false, false, false)
```

Timings from a cold JVM:

```text
[BENCHMARK]  localizer                35 ms
             ImageKeys                 0 ms
             type lists               16 ms
             StaticData (card load) 2684 ms
             --------------------------------
             total to usable          2.8 s
```

33,980 card scripts and 854 token scripts, read with Forge's own thread
pool. This is the floor for worker startup and feeds §0B.4's
spawn-per-match vs pre-warm question.

### API locations differ from assumption

```text
[SOURCE] CardStorageReader is in package `forge`, NOT `forge.card`
[SOURCE] TokenDb has no getAllCards(); it has getAllTokens()
```

Both cost a compile error, which is the harmless kind of surprise.

---

## 2. Resource necessity matrix

Each resource path is independently overridable in the harness, so a run
can point exactly one at a path that does not exist — the realistic
Docker failure, *we forgot to `COPY` it* — without copying a
34,000-file tree.

```text
[RUN] spikes/forge-phase0a/bootstrap-harness/run-matrix.sh

OMITTED        RESULT  CARDS    G-MANA  FAILURE
(baseline)     PASS    96,916   true
languages      FAIL    –        –       NullPointerException: ResourceBundle.getBaseBundleName()
lists          PASS    96,916   true
cardsfolder    FAIL    –        –       RuntimeException: CardReader : constructor error
tokenscripts   FAIL    –        –       RuntimeException: CardReader : constructor error
editions       FAIL    –        –       NoSuchElementException
blockdata      PASS    96,916   true
setlookup      PASS    96,916   true
```

### Methodology note — a real trap, and a real finding

The first version of this matrix reused one absent path across all runs
and produced **different results for the same input**: `cardsfolder`
failed with a constructor error on one run and "0 cards loaded" on
another.

Cause: **Forge creates missing resource directories.** After the first
run, the shared path existed and was merely empty, silently converting
every later run from *missing directory* into *empty directory* — a
different test. The matrix now uses a unique path per run and deletes it
afterwards.

That accident is itself evidence for `PHASE_00 §0.55`:

```text
[RUN] Forge WRITES to the resource tree: it creates a resource directory
      that does not exist.
```

A production worker that mounts Forge resources **read-only will fail**,
or at least behave differently from development. This must be settled
before the Docker image is built (Phase 0B §0B.5), and it is exactly the
kind of thing §0.55 asks for.

---

## 3. Required resources

| Resource | Required? | Evidence |
| --- | --- | --- |
| `languages/` | **YES** | `RUN` — NPE in `Localizer` during bootstrap |
| `cardsfolder/` | **YES** | `RUN` — `CardStorageReader` constructor error |
| `tokenscripts/` | **YES** | `RUN` — `CardStorageReader` constructor error |
| `editions/` | **YES** | `RUN` — `NoSuchElementException` in `StaticData` |
| `lists/` | **YES — see §4** | not proven by this probe; proven by source |
| `blockdata/` | No, for Constructed | `RUN` — passes when absent |
| `setlookup/` | No, for Constructed | `RUN` — passes when absent |

`languages/` confirms the old project's hardest-won bootstrap finding is
**still true at 2.0.15**: `Localizer` is reached during plain card
loading, and a headless worker that omits localisation resources dies
with an NPE that names nothing card-related.

`blockdata/` and `setlookup/` serve draft/sealed block data and set-code
aliasing. They are not required for a Constructed two-player game. They
are small; ship them anyway unless image size becomes a real constraint,
and re-test if draft or set-aliased lookups are ever added.

---

## 4. `lists/` — why the PASS must not be believed

The matrix says the bootstrap passes without `lists/`. **Do not conclude
that `lists/` is unnecessary.** This is the "testing only the easy
branch" failure the plan warns about (`PHASE_00 §0.5`, AGENTS EVID-003).

What actually happened:

```text
[SOURCE] CardEdition.java:671 calls CardType.Helper.parseTypes() for any
         edition section whose name ends in "Types".
```

So `editions/` *also* feeds the type vocabulary, and with `lists/`
omitted the probe still saw a correctly typed Forest with a green mana
ability.

But the two sources are not equivalent:

```text
[SOURCE] lists/TypeLists.txt sections (10):
         BasicTypes  LandTypes  CreatureTypes  SpellTypes
         EnchantmentTypes  ArtifactTypes  WalkerTypes
         DungeonTypes  BattleTypes  PlanarTypes

[SOURCE] "*Types" sections found anywhere in editions/ (6 kinds):
         WalkerTypes(10) CreatureTypes(9) ArtifactTypes(3)
         PlanarTypes(1)  LandTypes(1)     EnchantmentTypes(1)

         ABSENT from editions/: BasicTypes, SpellTypes,
                                DungeonTypes, BattleTypes
```

Edition sections carry *incremental* types introduced by a set, not the
complete vocabulary. Four whole categories exist only in `lists/`.

**Conclusion: ship `lists/`.** The probe passing without it proves only
that the handful of cards the probe touches do not need it. Proving it
genuinely unnecessary would require exercising Battles, Dungeons and
spell types, which is Phase 8 coverage work, not Phase 0A.

Whether the explicit `parseTypes` call in step 4 is still *needed* —
given `editions/` performs it — is a separate question. It is harmless
and cheap. Keep it.

---

## 5. The token probe was initially wrong

Worth recording because it nearly produced a false finding.

The first probe asserted `getAllTokens().size() > 0` and **failed on a
healthy build**, reporting "no tokens" after successfully reading 854
token scripts.

```text
[SOURCE] TokenDb.getAllTokens() returns allTokenByName.values(), a map
         populated LAZILY by loadTokenFromSet(), or eagerly only if
         preloadTokens() is called.
```

A count of zero before preload means nothing. The corrected probe asks
`containsRule("r_1_1_goblin")`, which tests the thing that actually
matters: whether the token *rules* parsed from `tokenscripts/` are
present for a token-creating effect to resolve against.

This is AGENTS EVID-002 in miniature — absence of a count is not absence
of capability — and it is the same shape as the old project's
`canBeShownTo` mistake: asking an API a question it does not answer.

---

## 6. Open items

- **Read-only resource mount.** Forge creates missing directories. Decide
  whether the production worker mounts resources read-only with a
  writable scratch path, and verify (Phase 0B §0B.5, `PHASE_00 §0.55`).
  Also still unknown: whether Forge writes preferences, caches or logs
  during a real game, as opposed to during bootstrap.
- **Game construction** (`PHASE_00 §0.22`) is not yet verified. This
  harness proves `StaticData` and card loading; constructing
  `Deck → RegisteredPlayer → Match → Game` and starting it needs a
  `PlayerController`, which is the §0A.6 adapter decision.

---

## 7. Status

| Item | State |
| --- | --- |
| §0A.5 bootstrap sequence | **DONE** — derived and run at 2.0.15 |
| §0A.5 resource inventory | **DONE** — 5 required, 2 optional, each with evidence |
| §0.55 Docker filesystem rules | **PARTIAL** — Forge writes; full behaviour unknown |
| §0.22 game construction | not started — blocked on §0A.6 |
| P0A-D (resource list proven by failure) | **PASSED** |
