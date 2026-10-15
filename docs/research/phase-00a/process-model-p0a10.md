# Phase 0A — §0A.10: process model and Forge packaging

**Sections:** `PHASE_00A` §0A.10; `PHASE_00` §0.46–§0.52, §0.58, §0.59, §0.9.8
**Also closes:** Phase 0B §0B.2 and §0B.3 (triggers fired — see §1)
**Forge pin:** `forge-2.0.15` — `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`
**Date:** 2026-10-15

---

## 1. Why this is measured now rather than deferred

```text
[USER] 2026-10-15: maximum concurrent matches ever expected = 5
```

Phase 0B §0B.2's trigger read *"more than two matches may run at
once"*. That condition is now met, so the three-worker benchmark
stopped being deferred and became blocking — which is the register
working as designed rather than an exception to it.

0B.3 (crash isolation) was run at the same time because it shares the
setup and directly supports the recommendation.

---

## 2. RECOMMENDATION — one JVM per match

```text
RECOMMENDED

  ONE JVM PER MATCH, spawned on demand, no pre-warming.

NOT RECOMMENDED

  Multiple matches per JVM. Nothing at this scale requires it, and it
  trades proven isolation for memory this deployment does not need to
  save. Kept as 0B.19 with a measured trigger (§5).
```

---

## 3. Measurements

All figures are real OS working-set readings, not estimates
(`PHASE_00 §0.48`).

### Memory

```text
[BENCHMARK] 1 worker    632 MB RSS
[BENCHMARK] 5 workers   3,055 MB total
                          611 MB mean
                          625 MB max single worker
            all 5 games completed
```

Per-worker cost is **flat at ~600 MB** whether one or five are running,
and does not grow meaningfully with game length. That shape says the
cost is dominated by the loaded card database — 96,916 cards from
33,980 scripts — not by game state.

**At the stated ceiling of 5 concurrent matches, budget ~3 GB.**

### Startup

```text
[BENCHMARK] Forge ready, 1 worker alone   2.8 s
[BENCHMARK] Forge ready, 5 concurrent     5.7 – 5.9 s
```

Startup roughly **doubles under full concurrent load**, because five
JVMs read 34,000 card files simultaneously and contend on I/O.

Consequence worth stating plainly: when the host is already running
four matches, a player waits about **6 seconds** for a fifth to start,
most of it before any game state exists. That is acceptable, and
`PHASE_00 §0.50` explicitly prefers simplicity unless the measured
delay is problematic. It is not — but it is the number to revisit if
match startup ever feels slow.

### Crash isolation (0B.3)

```text
[RUN] 3 workers launched; at t+4s none had completed, so the kill was
      genuinely mid-run rather than against an idle process.
      One worker terminated externally (§0.47: kill the process, do
      not corrupt Forge internals).

      victim    : did not complete, 12 lines of output
      survivor 1: completed, 10 turns, 82 lines
      survivor 2: completed, 14 turns, 82 lines
```

**Killing one worker mid-run leaves the others entirely unaffected.**

A methodology note, because the first attempt proved nothing: with a
20-second sleep before the kill, all three games had *already
finished* and the test killed an idle process. It reported
`survived 3/3`, which looked like a pass and measured nothing. The
kill has to land while a game is actually running.

---

## 4. Why process-per-match, given the memory cost

~600 MB per worker is not cheap, and sharing one card database across
matches would reclaim most of it. The recommendation is still
process-per-match:

- **Isolation is proven, by measurement, today** (§3). Shared-JVM
  isolation would have to be argued from a static-state audit.
- `PHASE_00 §0.51` says process-per-match remains safer under
  uncertainty, and Forge carries substantial static application state
  (`StaticData`, `FModel`, localisation globals, thread pools).
- 3 GB at the stated maximum is a capacity question, not an
  architectural one.
- A crashed match kills exactly one game. In a shared JVM it would
  take every concurrent match with it — the worst possible failure for
  a service whose whole point is that two people are mid-game.

This also preserves the Phase 6 requirement that a worker can be
terminated independently, and keeps the loop-guard recommendation from
P0A-B/F meaningful: a worker stuck in Forge's safety-valve-free
priority loop can simply be killed.

---

## 5. When to revisit (0B.19 trigger, now measured)

```text
Revisit multiple-matches-per-JVM if EITHER:

  concurrent matches must exceed ~8        (~5 GB at 611 MB each)
  OR the host has less than ~4 GB free for Proxic
```

The lever is the card database: it is per-JVM, flat, and the dominant
cost. Nothing else about the current design is memory-hungry.

---

## 6. Forge packaging (§0.58, §0.59, §0.9.8)

```text
RECOMMENDED

  Build from a FULL pinned upstream checkout.
  Ship only the produced artifacts and the proven resource set.
```

Evidence, from P0A-A and §0A.5:

```text
[RUN] mvn -pl forge-core,forge-game -am builds clean from an entirely
      UNMODIFIED upstream checkout. Zero local edits, no patched POM.

[PRIOR] The old project vendored selectively and therefore had to
        hand-maintain a rebuilt parent POM, because upstream's parent
        declares eleven modules a trimmed tree does not contain. Its
        first version broke Maven's parser on unescaped XML inside its
        own <description>.
```

Selective vendoring has to *earn* its complexity (`§0.59`) and here it
does not: module selection does the same job with nothing to maintain.

### Runtime artifact inventory

Build stage needs the full checkout, JDK and Maven. The runtime image
needs only:

```text
forge-core-2.0.15.jar          552 KB
forge-game-2.0.15.jar          2.5 MB
proxic forge-worker jar
resources (proven in §0A.5):
    cardsfolder/     languages/     editions/
    tokenscripts/    lists/
```

`blockdata/` and `setlookup/` are **not** required for Open Format and
may be omitted; they are small, so shipping them is also defensible.
No Forge *source* is needed at runtime (`§0.9.8`), and no Maven.

### One unresolved constraint

```text
[RUN] Forge CREATES a missing resource directory (§0A.5).
```

So Forge **writes to the resource tree**. A read-only mount will
behave differently from development. This must be settled before the
image is built — it is Phase 0B §0B.5's work and the trigger is
"before the first deployment", which has not yet fired.

---

## 7. Status

| Item | State |
| --- | --- |
| §0.46 process isolation | **DONE** — 5 concurrent, all complete |
| §0.47 crash isolation (0B.3) | **DONE** — mid-run kill, others unaffected |
| §0.48 memory benchmark (0B.2) | **DONE** — 611 MB mean, 3,055 MB for 5 |
| §0.50 startup benchmark | **DONE** — 2.8 s solo, 5.8 s at 5 concurrent |
| §0.52 process model recommendation | **DONE** — one JVM per match |
| §0.58/§0.59 packaging | **DONE** — full checkout, artifacts only at runtime |
| §0.55 Docker filesystem rules | **PARTIAL** — Forge writes; 0B.5 |
| §0.51 multi-match JVM | deferred, trigger now quantified (§5) |

Phase 0A remaining: §0A.8A, §0A.9A, P0A-K, then the §0A.13 exit report.
