# Phase 6 Exit Gate

**Status: PASSED — 2026-10-20, approved by the owner.** Every
acceptance test is met or classified, and the
production run was made by the owner on the live host against build
`21d3fa1`.

Two signed-in players launch a prepared room into a **real game of
Magic run by Forge**, each in their own browser, each sent only what
Forge lets them see, answering every decision Forge asks a player --
mulligans, lands, spells, targets, modes, costs, combat, choices --
until Forge declares a result. The board is functional, not final: the
graphical battlefield is Phase 7's.

```text
439 server tests                     0 skipped  0 failed
137 frontend unit tests                         0 failed
 57 browser tests   53 run in CI, 0 failed; 3 skipped by design
                    (2 on-demand fault injection, 1 marked fixme)
                    and 1 opt-in live-site check, run on production
 21 Mechanics Lab scenario scripts in CI, 44 scenarios, 0 failed
  3 cross-game trace checks in CI (snapshot-first, hidden hands, start budget)
ktlint, detekt, ESLint, Prettier, tsc     clean
```

**65 of 65 acceptance tests: 63 MET, 2 CLASSIFIED.** **48 of 48 Phase-6-
required Mechanics Lab cards PASSED.** Evidence, row by row:
`PHASE_06_ACCEPTANCE_AUDIT.md`; card by card:
`docs/testing/MECHANICS_LAB_COVERAGE.md`.

---

## §6.185 Exit criteria

| Criterion | Result |
| --- | --- |
| a READY_FOR_MATCH setup safely launches one Arena match | **YES** — P6-A |
| duplicate launch cannot create duplicate Forge runtimes | **YES** — conditional claim, P6-B |
| the accepted Phase 0 Forge architecture is used | **YES** — one child process per match, Strategy A controller, P6-D |
| Forge revision/protocol identity is verified | **YES** — commit and protocol checked at handshake, P6-E, P6-AU, P6-AV |
| real normalized Deck Depot decks construct real Forge decks | **YES** — exact printings, P6-BD, P6-BE |
| Arena participants map correctly to Forge players/controllers | **YES** — P6-M, P6-N, P6-U |
| Forge owns live game state | **YES** — snapshots are Forge's view layer, never a client model |
| room transitions to IN_MATCH | **YES** — and stays the players' room on refresh (fixed 2026-10-20) |
| viewer-specific snapshots work | **YES** — P6-F |
| hidden information is removed server-side | **YES** — 21,236 hand sightings checked, P6-G, P6-H; 835 snapshots live, P6-BK |
| face-down identity and artwork remain protected | **YES** — a real morph across 60 frames, P6-I |
| stable object identity works | **YES** — typed ids, P6-K |
| state is delivered before dependent interactions | **YES** — every question of every regression game, P6-L |
| object selection is not automatic action execution | **YES** — MATCH_ACTION_MODEL.md |
| card type does not define click meaning | **YES** — attack only in Forge's combat context, P6-V |
| one object can expose zero, one, or multiple actions | **YES** — P6-AB |
| object IDs and action IDs are distinct | **YES** — `card:N` vs `action:n:card:N`, P6-AB |
| zone-dependent actions work generically | **YES** — P6-BH |
| Agent of Kotis Renew is reachable through the generic action architecture | **YES** — P6-AA |
| combat actions are defined by Forge context, not permanent creature shortcuts | **YES** — P6-V |
| nested interaction contexts are represented without flattening legal actions | **YES** — Panglacial Wurm, P6-AE |
| pregame decisions use the authoritative semantic protocol | **YES** — mulligan, London putback, play/draw, Leyline, P6-AC |
| game restart uses epoch-safe identity | **YES** — Karn Liberated, P6-AD |
| non-object choices are representable without frontend rules lists | **YES** — Forge's own lists; card names searched, P6-AG/AH/AI |
| composite/multiface objects do not require one-card/one-image assumptions | **YES** — P6-AJ, P6-BF; split, adventure, Room, mutate, battle, prepare, daybound in CI |
| current characteristics come from Forge | **YES** — Humility, March of the Machines, Mind Bend, P6-AL |
| Forge is gameplay RNG authority | **YES** — Forge flips, player calls, a duplicate call cannot reroll, P6-AM |
| complex mode/cost structures can be carried generically | **YES** — escalate, entwine, spree, pawprint, convoke, delve, Phyrexian, alternative costs, P6-AN |
| player/global/non-card state does not require protocol redesign | **YES** — counters, designations, command zone, the Ring, dungeons, day/night, P6-AO |
| wrong-user decisions fail | **YES** — P6-N |
| duplicate responses do not double-execute | **YES** — P6-O, P6-R |
| stale responses fail | **YES** — P6-P |
| reconnect restores authoritative state and pending interactions | **YES** — P6-S, P6-T, P6-BB; live, P6-BK |
| control-changing effects route decisions correctly where accepted | **YES** — Mindslaver, P6-U |
| match-scoped artwork works without Deck Depot leakage | **YES** — P6-X, P6-Y, P6-Z; live 200/404, P6-BK |
| no final battlefield graphical design is falsely claimed | **YES** — the board is stated functional, not final |
| startup/runtime failures are controlled | **YES** — P6-AT, P6-AW |
| worker failure does not fabricate a Magic result | **YES** — no winner on any failure, P6-AW |
| three simultaneous matches are proven | **YES** — P6-AY |
| at least one real Forge game completes | **YES** — in CI and on the live site, P6-BA, P6-BK |
| Forge determines normal/alternate result | **YES** — Laboratory Maniac, Felidar Sovereign, Platinum Angel, P6-AP |
| workers and runtime directories clean up | **YES** — mutation-tested, P6-BA |
| Ktor restart behavior is honestly documented/tested | **YES** — matches fail with SERVER_RESTARTED; run, P6-AZ |
| Mechanics Lab full corpus imports/constructs | **YES** — 275 entries / 390 cards, none refused, P6-AS |
| Mechanics Lab focused P6-required scenarios have evidence/classification | **YES** — 48 of 48 PASSED |
| Learn/outside-game support is accurately classified | **YES** — CLASSIFIED out of Open Format, P6-AR |
| old Arena remains unchanged | **YES** — P6-BM (one owner-authorised restore of a deleted file) |
| Deck Builder remains unchanged | **YES** — P6-BM |
| canonical Mechanics Lab TXT/CSV remain unchanged | **YES** — P6-BM |
| Forge remains unmodified unless separately approved | **YES** — vendored tree clean; one approved patch, applied at build, P6-AF, P6-BM |
| documentation matches observed runtime behavior | **YES** — the six architecture documents written 2026-10-20 from the code and runs (below) |

Two tests are classified rather than run, as the phase permits:
**P6-AQ** multiplayer sequential decisions (Open Format is two players,
FMT-001) and **P6-AR** Learn/outside-game (no sideboard in Open Format,
FMT-002).

---

## What the phase found

Real faults, each found by running real games and fixed with a test that
fails without the fix:

- **Eleven Forge questions ended a match when reached** -- divided
  damage, delve, convoke/improvise, optional costs, static-ability
  order, discard-from, a number, a dungeon and its rooms, a copy's new
  targets, scry, a cost paid during resolution, cards for an effect.
  Each is now a port of Forge's own human controller.
- **Counterspells could not be cast** -- stack targets were never offered.
- **No Phyrexian life payment.**
- **Day and night were shown the wrong way round** (Forge's flag is true
  for night).
- **Half-cards were offered at the whole card's name and cost**; a Room
  unlocked at the wrong price.
- **A face-down card's controller could not see its name**; an Aura on
  an opponent's creature was invisible to its owner.
- **The Ring, the Ring-bearer and dungeon rooms never reached the board.**
- **A start timeout counted a player's mulligan** and failed real
  matches.
- **The worker's protocol version was never checked.**
- **A Leyline of the Void skipped its replacement** when nobody acted
  first -- a Forge defect, fixed by owner-approved patch 0001.
- **A page refreshed mid-game lost its room**, and a player in a match
  could host or join another room (found by the live-site run).
- **A server restart left matches "running" for ever** with no worker.

### And what kept recurring

**Scenario tests that lied in their own favour.** About a dozen times a
Mechanics Lab script reported a failure that was the script's: Forge
offers spells it cannot pay for and undoes them; a discarded copy in the
graveyard looked like a resolved spell; one player's board was read
before the other's arrived. Each was fixed in the script, and the traps
are written down so the next one is not.

**A test that waits instead of failing.** The live-site check stalled
three times in its dry runs, each on something trivial (a turn line that
said "It is day · Turn 11", two identical token labels). Every step now
has a time limit and a stall detector. The pattern was already in the
project's notes from Phase 5 and still cost an hour.

---

## Owner decisions during Phase 6

| | Decision |
| --- | --- |
| Card names | **Search, then pick** from Forge's ~34,000 names |
| Leyline defect | **Fix it in the engine** -- patch 0001, the only Forge patch |
| Hidden moves | **Hide only forbidden ones** -- an action Forge forbids is not offered; one that merely cannot be paid for still is |
| Face-down cards | **Show a 2/2 creature** to the opponent |
| Rules-version record | **Leyline of the Void** is the P6-AF scenario |
| After a match | the room returns **OPEN with both players seated** (D4) |
| Production address | **proxic.barnflix.net** (Phase 1 Amendment 1; the phase text's arena.barnflix.net is superseded) |
| Old project | one deleted file restored at the owner's request (ISO-001 exception) |

---

## §6.184 Deliverables

| # | Deliverable | Where |
| --- | --- | --- |
| 1 | Implementation summary | this file |
| 2-4 | Migration, match and participant schema | `server/.../db/migration/V010__matches.sql` |
| 5 | Lifecycle state machine | `docs/architecture/MATCH_RUNTIME.md` |
| 6-7 | Setup consumption; room IN_MATCH | MATCH_RUNTIME.md, `MatchLauncher.kt` |
| 8-9 | Forge pin; worker build/protocol identity | `forge-pin.properties`; FORGE_WORKER_RUNTIME.md |
| 10-11 | Worker launch; deck-to-Forge construction | FORGE_WORKER_RUNTIME.md |
| 12-13 | Seat / player / decision mapping | MATCH_RUNTIME.md, MATCH_PROTOCOL.md |
| 14-20 | The seven documents | `docs/architecture/MATCH_RUNTIME.md`, `MATCH_PROTOCOL.md`, `FORGE_WORKER_RUNTIME.md`, `MATCH_STATE_VISIBILITY.md`, `MATCH_ACTION_MODEL.md`, `MATCH_ASSET_AUTHORIZATION.md`, `docs/testing/MECHANICS_LAB_COVERAGE.md`; plus `docs/troubleshooting/MATCH_RUNTIME.md` |
| 21-26 | Snapshot schema; object, action, decision ids; revision/epoch; zone-dependent actions | `protocol/README.md`, MATCH_PROTOCOL.md, MATCH_ACTION_MODEL.md |
| 27-47 | Regression results (Kotis, multi-action, pregame, Karn, Wurm, rules version, choices, multiface, attachments, characteristics, RNG, modes/costs, player state, alternate results, multiplayer, Learn, corpus, hidden info, face-down, combat, targeting) | audit rows P6-AA..P6-AS, P6-F..P6-W; traces in `docs/testing/evidence/` |
| 48 | Artwork/privacy | MATCH_ASSET_AUTHORIZATION.md; P6-X/Y/Z |
| 49-53 | Reconnect; startup failure; crash; isolation; Ktor restart | P6-S/T, P6-AT, P6-AW, P6-AX, P6-AZ |
| 54-55 | Resource measurements; three concurrent matches | P6-AY; FORGE_WORKER_RUNTIME.md |
| 56-58 | Complete game; Docker; production E2E | P6-BA; CI image; P6-BK (`docs/testing/evidence/p6-bk-production-run.json`) |
| 59-62 | Old Arena, Deck Builder, TXT/CSV, Forge unchanged | P6-BM (`scripts/check-integrity.py`, `docs/testing/evidence/p6-bm-integrity.json`) |
| 63 | Unsupported Forge paths encountered | below |
| 64 | Deviations | owner decisions above |
| 65 | Unresolved concerns | below |
| 66 | Proposed requirements for Phase 7 | below |

---

## Unsupported Forge paths

Every question the regressions and the 48 required cards reach is built.
**42 Forge questions are not**, and fail a match loudly when reached
(AGENTS STUB-002; built when a real game reaches one, STUB-001). Among
them, the ones most likely to be met in the full card pool:
`choosePermanentsToSacrifice` ("each player sacrifices": Diabolic
Edict), `arrangeForSurveil`, `vote`, `exertAttackers`,
`chooseNumberForCostReduction`, `chooseCardsForSplice`,
`chooseSingleCardState`, `orderBlockers`. Finding them across the rest of the
lab's 275 entries (the Exploratory ones) is Phase 8 coverage work.

## Unresolved

- **The 42 unbuilt questions above** -- not a Phase 6 failure, but the
  biggest risk for "any deck works".
- **A transformed card shows no picture** -- deck packages carry front
  images only. Correct rather than wrong, but visible.
- **A match does not survive a server restart** -- by design and
  documented (P6-AZ); an update during a game ends it with no winner.
- **No computer opponent.** Forge has one; Proxic does not offer it and
  no phase plans it. An owner question, not an omission.
- Phase 5's open question -- *a live match's effect on room expiry* -- is
  resolved: the expiry sweep covers only open and ready rooms, so a room
  in a match is never swept, and sweeping resumes when it reopens.

## Proposed for Phase 7

Recorded in the Phase 7 draft (§7.32a), each needing an owner decision:

1. **Every priority stop is asked** -- the upkeep of turn 1 asks before a
   land can be played. Decide default stops and how a player sets them,
   never passing for a player who could act.
2. **Unpayable spells are offered** -- decide how they are shown, never
   hidden by a client guess.
3. **A refused attack does not say why**, and identical tokens cannot be
   told apart.

Plus the standing contract in `MATCH_ACTION_MODEL.md`: every option
reachable, a generic fallback for any question kind, inspect separate
from action.

---

## P6-BK and P6-BL — on the live host

**P6-BK**, run by the owner 2026-10-20 on `https://proxic.barnflix.net`,
build `21d3fa1`, `scripts/run-production-check.ps1`: RudeLeft and Pat in
two independent browsers; room launched; RUNNING on both; 835 snapshots,
each holding only its player's hand; 413 real decisions; 7 pictures
rendered; a picture shown only to the host served to it and refused to
the guest; a reload on turn 4 back in the same match; Forge ended it on
turn 11 and both pages agreed. 2.4 minutes, passed.

**P6-BL**, 2026-10-20: inside the production container the web server is
the only listener and the database is not published; the worker opens
no socket. From a different network, the site answers through Cloudflare
and the home address refuses 8765, 5432, 80 and 443
(`docs/testing/evidence/p6-bl-worker-privacy.md`).

---

## Next

Phase 6 is marked COMPLETE in `CLAUDE.md`, `AGENTS.md`, `BUILD_PLAN.md`
and `README.md`.

Phase 7 (Battlefield Presentation & Interaction) is a **DRAFT** and is
**not** started automatically: it needs locking first.
