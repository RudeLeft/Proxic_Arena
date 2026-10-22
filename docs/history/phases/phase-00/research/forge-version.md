# Phase 0A — Forge version, pin candidate and delta from the old pin

**Section:** `PHASE_00A` §0A.4
**Date:** 2026-10-14

---

## Environment actually used

```text
[RUN] java    openjdk 17.0.20.1  Temurin-17.0.20.1+1
[RUN] javac   17.0.20.1
[RUN] maven   Apache Maven 3.9.16
[RUN] git     2.55.0.windows.5
[RUN] OS      Windows 11 Pro 10.0.22631
```

Forge requires Java 17:

```text
[SOURCE] pom.xml  <maven.compiler.release>17</maven.compiler.release>
[SOURCE] pom.xml  <versionCode>2.0.15</versionCode>
```

The installed JDK satisfies it. Only one JDK is present on this machine
(`jdk-17.0.20.101-hotspot`), so there is no ambiguity about which was used.

---

## Pin candidates

```text
[RUN] git ls-remote https://github.com/Card-Forge/forge.git
```

| Candidate | Commit | Date | Relation to old pin |
| --- | --- | --- | --- |
| `forge-2.0.15` (latest release tag) | `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676` | 2026-09-28 | **11 commits behind** |
| Old project's pin | `83168c1dc406fd8cd4657ae0a2d605be5cc87070` | 2026-09-29 | — |
| `master` HEAD | `34a8662b7966a6ee757411feae2ae8ff38cce436` | **2026-10-14** | 186 commits ahead |

```text
[RUN] GitHub compare API
      83168c1d...4ec5f1a2   status=behind  ahead=0    behind=11
      83168c1d...34a8662b   status=ahead   ahead=186  behind=0
      4ec5f1a2...34a8662b   status=ahead   ahead=197  behind=0
```

### The finding that shapes the decision

**The latest Forge release is older than the commit the old project was
already running.** `forge-2.0.15` was tagged 2026-09-28; the old project
pinned a `master` commit from 2026-09-29, one day later and 11 commits
ahead. That pin was almost certainly "master on the day" rather than a
considered choice.

So "upgrade to the latest release" would move *backwards*.

---

## Recommended pin: `forge-2.0.15` — `4ec5f1a2`

Reasons:

1. **It is a tagged release.** Upstream's own stability signal, produced
   by their release plugin. `master` HEAD is literally today's commit
   (`fix vprompt`, committed hours before this was written) and carries
   197 commits of unreleased change.
2. **Updateability is a formal project requirement** (`PHASE_00 §0.9.1`).
   Tracking releases is a sane, repeatable update cadence. Chasing
   `master` is not, and makes "what version are we running?" unanswerable
   in a way a user could act on.
3. **The 11-commit gap to the old pin is incidental, not a feature gap.**
   Every engine fix the old project made lived in *its own adapter*, never
   in Forge. The Forge APIs it depended on are long-standing — verified
   below.
4. It is an exact hash either way, satisfying `PHASE_00 §0.10`'s
   prohibition on testing against a floating `master`.

**This is a recommendation for the owner to accept at the Phase 0A gate,
not a decision taken unilaterally.** The alternative — pin `master` HEAD
`34a8662b` to gain 186 commits of fixes — is defensible if something in
those commits turns out to matter. Nothing found so far does.

Expected upgrade path: advance to `forge-2.0.16` when released, run the
compatibility suite (Phase 0B §0B.15).

---

## Delta from the old pin — architecture-relevant areas

`PHASE_00 §0.11` asks what changed that could alter Proxic architecture.
The answer is unusually clean.

### PlayerController: identical

```text
[SOURCE] old pin 83168c1d : 105 distinct abstract methods (109 declarations)
[SOURCE] tag 2.0.15       : 105 distinct abstract methods (109 declarations)

         ADDED   : none
         REMOVED : none
```

Compared by parsing `public abstract` declarations from both files and
diffing the name sets. The decision surface the old project faced is
**exactly** the surface we face.

Consequences:

- The old bridge's **41 implemented methods** port directly. None of them
  targets a method that has since moved or disappeared.
- Its **64 stubs** all still correspond to real methods; none was removed.
- There are **no new methods** the old project never encountered.

This materially raises the value of the old project's evidence and lowers
the cost of Phase 0A, exactly as `PHASE_00A §0A.2` anticipated.

### APIs the old implementation depended on: all present

```text
[SOURCE] verified in the 2.0.15 checkout

Card.getAllPossibleAbilities           PRESENT
GameActionUtil.getAlternativeCosts     PRESENT
CardView.canBeShownTo                  PRESENT
CardView.canFaceDownBeShownTo          PRESENT
PlayerController.chooseOptionalCosts   PRESENT
PlayerController.chooseCounterType     PRESENT
Player.getController()                 PRESENT
CardDb  collectorNumber                PRESENT
```

Presence is `SOURCE` evidence only. Whether `canBeShownTo` still means
zone-level and `canFaceDownBeShownTo` still means identity-level must be
re-verified by reading the method bodies and by `RUN` — see §0A.7 and
AGENTS.md STUB-004.

---

## Build: P0A-A passed

```text
[RUN] mvn -pl forge-core,forge-game -am -DskipTests install
      EXIT = 0

      forge-core/target/forge-core-2.0.15.jar     551,432 bytes
      forge-game/target/forge-game-2.0.15.jar   2,540,965 bytes
```

Upstream's own tests for these two modules:

```text
[RUN] mvn -pl forge-core,forge-game test
      Tests run: 3, Failures: 0, Errors: 0, Skipped: 0
      BUILD SUCCESS
```

Three tests is all these two modules carry — the same figure the old
project recorded. Note what this does **not** prove: it is not a
scenario-level regression suite, and `PHASE_00 §0.9.10` is explicit that
a Forge version must not be accepted merely because it compiles and its
own tests pass.

### This is evidence for the packaging decision (§0A.10)

The build used an **entirely unmodified upstream checkout**. No patched
POM, no removed modules, no edits of any kind.

Contrast with the old project, which vendored selectively and therefore
had to hand-rebuild the parent POM, because upstream's parent declares
eleven modules that a trimmed tree does not contain. That hand-built POM
then became a thing to maintain — and its first version had unescaped
XML inside its own `<description>`, which broke Maven's parser.

With a full checkout, `-pl forge-core,forge-game -am` selects exactly the
two modules we need and upstream's own POM does the rest. The modules
Proxic does not want (`forge-ai`, the desktop/mobile/iOS/Android GUIs,
`adventure-editor`, `forge-installer`, `forge-lda`) are simply not built.

```text
[RUN]      full checkout + module selection: builds clean, zero local edits
[PRIOR]    selective vendoring: required a maintained hand-built parent POM
```

This is the first real evidence on `PHASE_00 §0.58`'s Option A vs Option
B, and it favours Option A. The runtime *image* is a separate question
(`§0.9.8`) — a full source checkout does not imply a full runtime image.

---

## Two-Headed Giant: still UNSUPPORTED at 2.0.15

```text
[SOURCE] GameType.java defines 26 types; TwoHeadedGiant is NOT one:
         Sealed Draft Winston Gauntlet Tournament CommanderGauntlet
         Quest QuestCommander QuestDraft PlanarConquest Adventure
         AdventureEvent Puzzle Constructed DeckManager Vanguard
         Commander Oathbreaker TinyLeaders Brawl Planeswalker
         Planechase Archenemy ArchenemyRumble MomirBasic MoJhoSto

[SOURCE] "TwoHeaded" occurrences in GameType.java : 0
[SOURCE] SharedTeamTurns / sharedTeamTurns in forge-game : 0 files
[SOURCE] teamLife / sharedLife / getTeamLife in forge-game : 0 files
[SOURCE] Player.getTeam / Player.setTeam : present (teams exist as an
         integer grouping only, deciding who loses together)
```

**Classification per `§0.41`: `UNSUPPORTED`.**

Identical to the old pin's finding. There is no shared team turn
structure and no shared life total anywhere in the rules engine.

`§0.42`'s escalation gate has **already been answered by the project
owner**: 2HG is removed from initial scope. No further 2HG work is
required in Phase 0A. Phase 5's preset catalog must not offer it
(see `PHASE_05` header note).

---

## Status against Phase 0A

| Test | State |
| --- | --- |
| P0A-A — Forge builds clean | **PASSED** |
| §0A.4 — pin recorded, delta from old pin | **DONE** (pin awaiting owner acceptance) |
| §0A.6 — PlayerController audit | **PARTIAL** — surface counted and diffed; adapter strategy not yet chosen |
| §0A.9 — 2HG classification | **DONE — UNSUPPORTED**, then removed from scope |
| §0A.9 — formats | **removed** — Open Format only, 2026-10-15 |
| §0A.5 — bootstrap and resource inventory | not started |
| Everything else | not started |

---

## Open question for the owner

**Pin `forge-2.0.15` (recommended) or `master` HEAD?**

Picking the release costs 186 commits of upstream fixes and gains a
repeatable update cadence plus upstream's stability signal. Nothing found
so far needs those 186 commits, but nothing has ruled them out either —
the bootstrap and runtime work in §0A.5 may yet surface something.
