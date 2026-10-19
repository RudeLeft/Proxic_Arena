# Phase 6 — acceptance audit

**2026-10-19.** Phase 6 is LOCKED (2026-10-17) and active. This
audits what is built against the 65 acceptance tests, P6-A through
P6-BM, in
`PHASE_06_FORGE_MATCH_RUNTIME_AUTHORITATIVE_GAME_PROTOCOL_LOCKED.md`.

This is **not an exit gate**. It is a status report, written to
answer "how far along is Phase 6" with something other than a
feeling.

## How each row was decided

| Status | Means |
|---|---|
| **MET** | Implemented, and evidence of the kind the test asks for exists and has been run. |
| **PARTIAL** | Implemented, but the required evidence is missing, weaker than asked for, or covers only part of the test. |
| **NOT MET** | Not implemented, or no evidence at all. |
| **CLASSIFIED** | The test permits a scope classification instead of a run, and one exists. |

A test that asks for **RUN** evidence and has only a unit test is
**PARTIAL**, not MET. A unit test proves the code does what it was
written to do; the phase asks whether the *system* does. That
distinction is most of the difference between the two columns
below, and it is deliberate — AGENTS TEST-011 exists because
green unit tests sat underneath four shipped faults.

## Where it stands

| Status | Count |
|---|---|
| MET | 28 |
| PARTIAL | 22 |
| NOT MET | 13 |
| CLASSIFIED | 2 |
| **Total** | **65** |

**Updated 2026-10-19.** Three of the six findings are fixed: the
pregame decisions (Finding 2, P6-AC → PARTIAL), match-time artwork
(Finding 1, P6-X/Y/Z → MET) and semantic non-object choices
(Finding 3, P6-AH/AI/AM → MET, P6-AG blocked on the protocol).

Roughly a third done, a third started, a third untouched. The
untouched third is not evenly spread: it is almost entirely
**assets**, **semantic non-object choices**, and **production /
scale**, which are three coherent pieces of work rather than
twenty-one scattered ones.

---

## The findings that matter

Read these before the table.

### 1. ~~There is no artwork in a match at all~~ — BUILT 2026-10-19

P6-X, P6-Y and P6-Z are met. `/api/matches/{matchId}/assets/{sha}`
serves a card's imported artwork to a viewer who has been shown
that card, and to nobody else.

**The authorization is the snapshot.** A viewer may fetch exactly
the assets their own snapshots have carried, because the set is
built BY sending them. That makes §6.124, §6.125 and §6.129 fall
out of work already done rather than needing rules of their own: a
card the viewer may not identify arrives with `known: false` and
no name, so there is nothing to look up and no reference to send,
and an opponent cannot ask for the front of a face-down card
because they were never told which card it is.

Still open from this area: the artwork halves of **P6-BF**
(multiface, which needs a multi-face card to run at all) and
**P6-BK** (production).

### 2. Decisions are still being made FOR the player, outside the stub system

The survey measures what is *unimplemented*, because an
unimplemented method records itself and throws. It cannot see a
method that is implemented as "return a sensible default", and
there are two of those:

```text
mulliganKeepHand    always keeps. The player is never asked.
chooseStartingPlayer always returns this player. Never asked.
```

Both contradicted FORGE-RULE — "we don't want to take decisions
away from the player, we want the rules to enforce them".

**FIXED 2026-10-19.** Both are asked now, along with
`tuckCardsViaMulligan` (which had to land in the same change: it
was a loud stub, so asking the mulligan question without it would
have turned "always keeps" into "fails the match the moment
anybody mulligans"). P6-AC is PARTIAL rather than MET because
Leyline-style pregame effects are still uncovered.

**Fixing it exposed a three-layer deadlock**, which is the part
worth remembering. A pregame question could not be answered by
anyone, because every layer assumed nothing needs answering before
RUNNING — and RUNNING means the first priority window, which is
after the mulligans:

```text
worker    the only thread that reads stdin was blocked in
          awaitRunning, so the answer could never be read
browser   the match socket opened only at status RUNNING, so the
          question was never delivered
```

The server layer was already correct. Nothing logged, nothing
threw: 120 seconds of silence and GAME_START_FAILED. It had been
latent since the decision protocol was written and could not be
reached while the adapter answered pregame itself.

**The survey's blind spot remains, and is the standing lesson.**
It measures what is UNIMPLEMENTED, because an unimplemented method
records itself and throws; a method implemented as "return a
sensible default" is invisible to it. The 19 asking vs 20
non-asking overrides were separated by hand for this audit — most
of the 20 are legitimate plumbing, since combat and mana delegate
to classes that do ask — but no tool checks that, and nothing
stops the next default being added.

### 3. ~~Semantic non-object choices~~ — THREE OF FOUR BUILT 2026-10-19

P6-AH, P6-AI and P6-AM are met. They follow
`announceRequirements`'s pattern: a value that is not a game object
becomes one option per value, with the value in the id.

The numbers say what P6-AH is really asking for — a creature-type
choice offers **356 options**, which is Forge's own list of every
valid type. A frontend rules list would have been wrong the day a
set shipped.

P6-AM turned out to be two halves. Calling a coin (`chooseBinary`)
is the player's; the flip itself is Forge's, so a reconnect cannot
reroll it. The other half was missing entirely: `notifyOfValue`,
which is how Forge TELLS a player an outcome, was a no-op, so the
game acted on flips nobody saw. Outcomes now travel per seat on the
snapshot — measured: "Mana Clash: tails", "Goblin Archaeologist:
win", "Alchor's Tomb: White".

**P6-AG is blocked, and not on effort.** Pithing Needle names any
card in or out of the game. Forge answers it by listing every face
in the database and letting the player search — thirty-four
thousand of them, which is not a list this protocol can carry as
options. The bounded form (Forge hands over the faces it accepts)
is implemented; the open form fails loudly and says why. What it
needs is a protocol shape that does not exist: a typed-and-searched
answer rather than a chosen one. Picking one, or offering a
"sensible" subset, would be the adapter deciding which cards are
worth naming.

### 4. Nothing has been verified against production

P6-BK and P6-BL require `https://arena.barnflix.net` and an
external network test. Everything in this session ran against the
local Docker stack. The production deployment exists, but no Phase
6 acceptance evidence has been gathered through it.

### 5. The Mechanics Lab corpus does not exist in this project

P6-AS requires importing "the canonical project-local Mechanics
Lab source/package". There is no such corpus in `Proxic_Arena`.
§6.4 and §6.5 of the locked spec describe it as a required
artefact; it has not been created. P6-AA (Agent of Kotis) and
P6-AE (Panglacial Wurm) both draw their scenarios from it, so this
blocks three tests rather than one.

### 6. Several failure paths are implemented but never actually triggered

P6-AX (failure isolation), P6-AY (three concurrent matches) and
P6-AZ (Ktor restart during a live match) are all "crash it and
watch". The code exists — `MatchRecovery` is tested at unit level
and `live` is a `ConcurrentHashMap` — but no two matches have ever
run at once in this project, and the server has never been
restarted under a live match outside a unit test.

---

## The 65

### Launch and runtime

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-A | Atomic match launch | MET | `a ready setup launches exactly one match`; browser e2e reaches a running match |
| P6-B | Duplicate launch protection | MET | `two concurrent launches create exactly one match`, `launching twice is refused the second time` |
| P6-C | Launch revalidation | MET | `a deck revoked after preparation stops the launch`, `a disabled participant stops the launch` |
| P6-D | Real Forge runtime | MET | `the worker starts a real two-player game`; every harness run reaches RUNNING through real bootstrap |
| P6-E | Forge identity | MET | `MatchWorker` refuses a worker whose `forgeCommit` differs; `forge_commit NOT NULL` persisted in V010 |

### Viewer-safe state and privacy

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-F | Viewer-safe state | MET | `check-hidden-information.py` on burn/green/blue/black/counters; two-browser e2e |
| P6-G | Hidden hand | PARTIAL | Snapshot and decision payloads covered. **Asset URLs N/A (no assets). "Logs returned to browser" never checked.** |
| P6-H | Library privacy | MET | No library in any snapshot; search options go to one seat; delayed reveal is the authorised exposure |
| P6-I | Face-down safety | PARTIAL | Both §6.44 checks implemented and exercised **only by deliberately breaking them** — no morph/manifest card has ever been played |
| P6-J | Revealed / known information | PARTIAL | `known` flag and delayed reveal implemented; no deliberate Forge-authorised reveal scenario run |
| P6-K | Stable object identity | MET | Typed ids asserted by `check-hidden-information.py`; a searched card followed by id from library to battlefield |
| P6-L | Snapshot before interaction | PARTIAL | §6.48 enforced in code (`publishSnapshots()` inside `publishDecision`) and in the socket's hello order; **no automated assertion** |

### Decision protocol

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-M | Correct decision routing | MET | `the authorised player's answer reaches the worker`; `the player being asked gets the question and nothing else`; e2e |
| P6-N | Wrong-user protection | MET | `the other player cannot answer`, `somebody who is not in the match cannot answer` |
| P6-O | Duplicate response protection | MET | `DecisionGateTest` duplicate defences (both tested separately); `an acceptance clears the pending question` |
| P6-P | Stale response protection | MET | `a late acceptance does not discard the next question`, `the state version comes from the question, not the caller` |
| P6-Q | Invalid candidate protection | MET | `an action that was not offered is refused` |
| P6-R | Multiple browser tabs | NOT MET | `MatchHub` is per-connection, so the mechanism exists; **no Playwright test opens two tabs** |
| P6-S | Disconnect during decision | PARTIAL | Reconnect re-sends snapshot then pending decision (§6.111/§6.112) in code; **never exercised by a test** |
| P6-T | Browser refresh | NOT MET | §6.113 implemented; **no e2e refreshes a running match** |
| P6-U | Control-another-player | PARTIAL | `actedForSeat`/`authorisedSeat` carried end to end and unit-tested both ways; **no real control-changing card has ever been played** |
| P6-V | Combat | MET | Attack/block/order/damage all from `CombatUtil`; creature decks run combat to a winner; gate refuses un-offered candidates |
| P6-W | Targeting | MET | `chooseTargetsFor` answered 1,600+ times across decks; candidates are Forge's; injection refused by the gate |

### Assets

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-X | Asset plumbing | MET | **Built 2026-10-19.** Forge object → visible identity → imported asset → match-scoped route → image on screen, asserted end to end in the browser: 16 assets served in one match, the reference matched `/api/matches/{uuid}/assets/{sha256}`, and the response was a 200 image |
| P6-Y | Hidden asset protection | MET | A card with `known: false` is never given a reference, so there is nothing to retrieve; proven by a test that fails when the `known` check is removed (mutation run) |
| P6-Z | No asset enumeration | MET | Being shown one card of an opponent's deck authorises that asset and no other — unit-tested both ways, and a well-formed unshown reference returns 404 in the browser suite |

### Card behaviour and the action model

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-AA | Agent of Kotis renew regression | NOT MET | The *mechanism* it asks for is demonstrated (see P6-BH), but the named regression has never been run; card not in any deck |
| P6-AB | Multiple actions discoverable | MET | Action ids are `action:<n>:card:<id>`, distinct per ability; Hellspark Elemental offers cast and unearth, Sensei's Divining Top two abilities |
| P6-AC | Pregame decisions | PARTIAL | **Fixed 2026-10-19.** Opening hand, mulligan, London putback and play-or-draw are all asked and answered, through two browsers and the worker harness; transition to the first turn verified. **No Leyline-style coverage** |
| P6-AD | Karn / game restart | NOT MET | Not attempted; no classification recorded |
| P6-AE | Nested interaction / Panglacial Wurm | NOT MET | Not attempted; card is in the absent Mechanics Lab corpus |
| P6-AF | Rules-version regression | NOT MET | No scenario selected or recorded |
| P6-AG | Card-name choice | PARTIAL | The bounded form (Forge supplies the faces) is implemented. **The open form — name any card — needs a typed answer the protocol does not carry**, and fails loudly saying so rather than guessing |
| P6-AH | Creature-type choice | MET | **Built 2026-10-19.** Adaptive Automaton asks with **356 options — Forge's own valid-type list**, which is exactly the "authoritative allowed values rather than a hand-maintained frontend rules list" the test asks for |
| P6-AI | Colour / land-type choice | MET | **Built 2026-10-19.** Alchor's Tomb asks for a colour from Forge's `ColorSet`; `chooseColor`, `chooseColorAllowColorless` and `chooseColors` all ported, including Forge's own short-circuits |
| P6-AJ | Composite / multi-representation | NOT MET | No multi-face card has been run |
| P6-AK | Attachment relationships | PARTIAL | Snapshot carries `attachedTo`; the artifacts deck equips Bonesplitter; **never seen in a browser, no aura or mutate** |
| P6-AL | Effective characteristics | PARTIAL | Snapshot sends Forge's `getNetPower`/`getNetToughness` plus counters and damage; **no scenario proving a difference from printed values** |
| P6-AM | Forge RNG authority | MET | **Built 2026-10-19.** Forge produces the outcome (`MyRandom` inside `FlipCoinEffect`); the player only CALLS it (`chooseBinary`); and the outcome now reaches them, which it did not before — `notifyOfValue` was a no-op. Reconnect and duplicate answers cannot reroll because the flip is not a decision |
| P6-AN | Complex modes / costs | MET | Modes (Abrade, Alley Evasion), X (`announceRequirements`, verified paid and dealt), costs (`CostPutCounter`, `CostRemoveCounter`, `CostTap`, mana) |
| P6-AO | Player / global state | PARTIAL | Life, hand/library/graveyard counts, turn, phase, active seat all carried; **no poison/energy/experience-style state tested** |
| P6-AP | Alternate Forge result | PARTIAL | Result is read from Forge's outcome, never inferred from life; **no deterministic alternate-win scenario run** |
| P6-AQ | Multiplayer sequential decision | CLASSIFIED | Open Format is two players (FMT-001); the test permits classification. **Not formally recorded anywhere** |
| P6-AR | Learn / outside-game capability | CLASSIFIED | `sideboard` returns null citing FMT-002 — effectively `OUT_OF_ACCEPTED_SCOPE`. **The classification lives in a code comment, not in a recorded result** |
| P6-AS | Mechanics Lab full-corpus import | NOT MET | **The corpus does not exist in this project** |

### Failure handling and scale

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-AT | Worker startup failure | MET | `a missing worker jar fails cleanly`, `an unconfigured worker fails cleanly`, `a failed start returns the room to the players` |
| P6-AU | Worker protocol mismatch | PARTIAL | The **browser** protocol version is checked (`PROTOCOL_VERSION_MISMATCH`). The **worker's** is sent but never validated, and nothing tests it |
| P6-AV | Forge revision mismatch | PARTIAL | `MatchWorker` refuses on mismatch; **no test covers it** |
| P6-AW | Worker runtime crash | MET | `a runtime failure records no winner`, `a late failure cannot overwrite a real result`; `WorkerEvent.Stopped` → FAILED |
| P6-AX | Failure isolation | NOT MET | Two matches have never run at once |
| P6-AY | Three concurrent matches | NOT MET | No benchmark of any kind |
| P6-AZ | Ktor restart | PARTIAL | `MatchRecovery` implemented and unit-tested three ways; **the server has never been restarted under a live match** |

### Ending, integrity and production

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-BA | Normal Forge match end | PARTIAL | `a finished game records Forge's result and gives the room back`; games end naturally in harness runs. **Worker exit and runtime-directory cleanup not verified** |
| P6-BB | Browser close is not concede | PARTIAL | The pending decision survives a disconnect by design and the UI says so; **no test closes a browser and checks no loss is recorded** |
| P6-BC | Imported deck immutability | PARTIAL | `a deck can be deleted after the match that used it` is adjacent; **no before/after integrity comparison** |
| P6-BD | Exact printing runtime | PARTIAL | Import resolves exact printings (`CardResolverTest`); **runtime preservation not inspected** |
| P6-BE | Basic land runtime | MET | Every deck in `harness-decks.json` runs on basics through real games |
| P6-BF | Multi-face runtime | NOT MET | No multi-face card has been run |
| P6-BG | Token runtime | MET | Legion Warboss creates Goblin tokens; they appear in snapshots, attack and block; no token art exists and nothing crashes |
| P6-BH | Zone coverage | MET | **Hellspark Elemental's Unearth offered from the graveyard and performed three times.** Enumerator uses `getAllCards()` + Forge's `getAllPossibleAbilities`, so it is not hand/battlefield-bound |
| P6-BI | Unsupported preset guard | PARTIAL | `MatchSetupService` rejects an unavailable preset; **no test asserts a direct API request cannot launch one** |
| P6-BJ | 2HG guard | PARTIAL | Same mechanism; **not separately tested** |
| P6-BK | Production end-to-end | NOT MET | Everything has been run against the local Docker stack |
| P6-BL | Production worker privacy | NOT MET | No external network test |
| P6-BM | Project integrity | PARTIAL | ISO-001/ISO-002 respected throughout and GIT-001 holds (no artwork committed); **no formal integrity comparison has been run** |

---

## What would close the biggest gaps

In rough order of how many tests each unblocks:

1. ~~**Card artwork in a match**~~ — done 2026-10-19. P6-X, P6-Y
   and P6-Z are met; the artwork halves of P6-BF and P6-BK remain,
   and both are blocked on other things (a multi-face card, and a
   production run).
2. **The Mechanics Lab corpus** (§6.4, §6.5) — closes P6-AS and
   unblocks P6-AA and P6-AE, which draw their scenarios from it.
3. ~~**Semantic non-object choices**~~ — done 2026-10-19 except
   P6-AG, which needs a typed-answer protocol shape rather than
   more adapter work.
4. ~~**Pregame**~~ — done 2026-10-19. Only Leyline-style coverage
   is left on P6-AC.
5. **Browser-session tests** — two tabs, refresh, disconnect, close.
   Four tests (P6-R, P6-T, P6-S, P6-BB), all against code that
   already exists, all needing Playwright rather than new features.
6. **Concurrency and restart** — two matches, three matches, a
   restart under load. Three tests (P6-AX, P6-AY, P6-AZ).
7. **Production evidence** — P6-BK and P6-BL, once the above make a
   production run worth gathering evidence from.

## A note on the method

Every MET row above rests on something that was run, not on
reading the code. Where a row says PARTIAL because evidence is
missing, that is a statement about this audit, not a claim the code
is wrong — most of those are likely correct and simply unproven.

The reverse also holds, and is the reason for Finding 2: **the
survey tool cannot see a decision that is answered by a default**,
so "no unimplemented decision kinds reached" is a weaker statement
than it sounds. It means nothing threw. It does not mean nothing
was decided on the player's behalf.
