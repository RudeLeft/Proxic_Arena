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
| MET | 56 |
| PARTIAL | 4 |
| NOT MET | 3 |
| CLASSIFIED | 2 |
| **Total** | **65** |

**Updated 2026-10-19.** Three of the six findings are fixed: the
pregame decisions (Finding 2, P6-AC → PARTIAL), match-time artwork
(Finding 1, P6-X/Y/Z → MET) and semantic non-object choices
(Finding 3, P6-AH/AI/AM → MET, P6-AG blocked on the protocol).

**Updated 2026-10-20.** Finding 6 is closed: two and three matches
at once, a crashed worker and a server restart have all been run
(P6-AX, P6-AY → MET; P6-AZ PARTIAL → MET).

**Updated 2026-10-20, later.** Finding 5 was wrong: the Mechanics
Lab corpus exists. P6-AS, P6-AA and P6-AE → MET, with the coverage
ledger §6.5 asks for. Two cost types the scenarios needed
(CostExile, CostSacrifice) were stubs and are now ported. P6-AG
→ MET: naming any card is answered by searching Forge's names.

**Updated 2026-10-20, last.** P6-AP → MET: Laboratory Maniac wins
with both players on 20 life, and the players are told Forge's
reason in Forge's words. P6-AU, P6-AV → MET: a worker with the wrong
protocol version (previously never checked) or the wrong Forge is
refused before it is asked to play, run against a real impostor.
P6-BI, P6-BJ → MET: a room or setup rewritten to Two-Headed Giant or
Commander cannot be prepared or launched through the API. P6-L →
MET: every question in every regression game reached its seat after
the state it refers to. P6-BA → MET: a finished match's worker is
stopped and nothing per-match is left but its log. P6-BC → MET:
deck storage is unchanged across a match, rows and artwork. P6-AK
→ MET: attachments, including an Aura across the table, drawn with
what they modify.

Where it stands now (2026-10-20): 56 of 65 met. What is left is
narrow: **production** (P6-BK, P6-BL — they need the deployed
server, so they are the owner's to schedule), a **rules-version
regression** scenario nobody has chosen yet (P6-AF), and four
partials -- hidden-hand logs (G), face-down cards actually played
(I), exact printings inspected at runtime (BD) and a formal
project-integrity comparison (BM).

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

**P6-AG — BUILT 2026-10-20 (owner decision: search, then pick); this paragraph is the history.** Was: blocked, and not on effort. Pithing Needle names any
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

### 5. ~~The Mechanics Lab corpus does not exist in this project~~ — WRONG; it does. Built on 2026-10-20

**This finding was wrong.** The corpus has been in the project all
along, at `Test Deck/Testing Deck/` (TXT, CSV and 275 images),
one folder below where this audit looked. The spec names the
parent folder and says to use the filenames actually present.

Now: `docs/testing/MECHANICS_LAB_COVERAGE.md` exists (§6.5),
generated from the read-only TXT/CSV plus a hand-maintained status
file and checked in CI. P6-AS, P6-AA and P6-AE are MET.

### 6. ~~Several failure paths are implemented but never actually triggered~~ — RUN 2026-10-20

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
| P6-J | Revealed / known information | MET | **Run 2026-10-20**, `scripts/check-multiface.py` (in CI). Delver's "look at the top card" reaches its controller before "Reveal?" is asked; the controller reveals only an instant; the opponent is told of every reveal and of nothing declined. **Found and fixed: `reveal()` was a no-op**, so that question had been answered about a card nobody was shown, and no opponent ever saw a reveal. Now a notice to each player Forge calls it for, which is exactly the entitled set |
| P6-K | Stable object identity | MET | Typed ids asserted by `check-hidden-information.py`; a searched card followed by id from library to battlefield |
| P6-L | Snapshot before interaction | MET | **Run 2026-10-20**, `scripts/check-snapshot-first.py` over the protocol traces of every Mechanics Lab regression (in CI): 3,362 questions in 11 games -- graveyard casting, library search, Mindslaver, a game restart, revealed and two-faced cards -- each sent after a snapshot for the same seat published after the question was asked (`stateRevision > stateVersion`), and all 17,648 card references in their options either in that snapshot or, for the 35 in a hidden zone (a library being searched, cards being ordered onto a library), named by the option's own label. The checker was itself checked on doctored traces -- one snapshot moved after its question, and an unlabelled option naming a card nobody was shown -- and fails both. The server's socket sends state before any pending question on connect (§6.110) |

### Decision protocol

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-M | Correct decision routing | MET | `the authorised player's answer reaches the worker`; `the player being asked gets the question and nothing else`; e2e |
| P6-N | Wrong-user protection | MET | `the other player cannot answer`, `somebody who is not in the match cannot answer` |
| P6-O | Duplicate response protection | MET | `DecisionGateTest` duplicate defences (both tested separately); `an acceptance clears the pending question` |
| P6-P | Stale response protection | MET | `a late acceptance does not discard the next question`, `the state version comes from the question, not the caller` |
| P6-Q | Invalid candidate protection | MET | `an action that was not offered is refused` |
| P6-R | Multiple browser tabs | MET | **Built 2026-10-19.** Same player, two tabs, both click the same decision at once: both answers are sent, exactly one is accepted and the other tab is told it was refused — asserted on the WebSocket frames, six runs in six. **Found a defect on the way**: before the fix both tabs were told DECISION_ACCEPTED. Forge applied the answer once (its gate refused the duplicate, measured directly), but the server reported "forwarded" as "accepted" and the worker's refusal reached nobody. The server now claims a decision atomically on first forward |
| P6-S | Disconnect during decision | MET | **Built 2026-10-19.** The page leaves, the socket closes, the match stays LAUNCHING/RUNNING and the question stays pending; on return the frames show a snapshot BEFORE the re-sent question (§6.110) and the question is unchanged |
| P6-T | Browser refresh | MET | **Built 2026-10-19.** A refresh keeps the same match id, the same participants and the same pending question, compared option for option |
| P6-U | Control-another-player | MET | **Run 2026-10-20**, `scripts/check-mindslaver.py` (in CI) and `e2e/match-mindslaver.spec.ts`. Mindslaver by real play: the controlled player's questions carry actedForSeat 2 / authorisedSeat 1 and reach the master's page ("Playing for seat 2"); the controlled player answering is refused WRONG_SEAT and their page is asked nothing; the master sees their hand (`otherHands`, Forge's `canBeShownTo`) during control only. **Found and fixed a hidden-information defect**: seats were mapped by the CURRENT controller's lobby player, so the master received a second snapshot built from the controlled player's view and the controlled player received none |
| P6-V | Combat | MET | Attack/block/order/damage all from `CombatUtil`; creature decks run combat to a winner; gate refuses un-offered candidates |
| P6-W | Targeting | MET | `chooseTargetsFor` answered 1,600+ times across decks; candidates are Forge's; injection refused by the gate |

### Assets

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-X | Asset plumbing | MET | **Built 2026-10-19.** Forge object → visible identity → imported asset → match-scoped route → image on screen, asserted end to end in the browser: 16 assets served in one match, the reference matched `/api/matches/{uuid}/assets/{sha256}`, and the response was a 200 image. Two-faced cards (stored "A // B", named "A" by Forge) had none until 2026-10-20 — seen in a screenshot, now unit-tested |
| P6-Y | Hidden asset protection | MET | A card with `known: false` is never given a reference, so there is nothing to retrieve; proven by a test that fails when the `known` check is removed (mutation run) |
| P6-Z | No asset enumeration | MET | Being shown one card of an opponent's deck authorises that asset and no other — unit-tested both ways, and a well-formed unshown reference returns 404 in the browser suite |

### Card behaviour and the action model

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-AA | Agent of Kotis renew regression | MET | **Run 2026-10-20**, `scripts/check-agent-of-kotis.py`, in CI. A creature on the battlefield with nothing offered for it there; attacking only via declareAttackers; sacrificed by real play, same id in the graveyard; Forge offers Renew as its own action, chosen, paid, exiled, two +1/+1 counters. No source names the card. Trace: `docs/testing/evidence/p6-aa-agent-of-kotis.trace.json`. Found and fixed: CostExile and CostSacrifice were stubs; the action label showed Forge's `CARDNAME` placeholder |
| P6-AB | Multiple actions discoverable | MET | Action ids are `action:<n>:card:<id>`, distinct per ability; Hellspark Elemental offers cast and unearth, Sensei's Divining Top two abilities |
| P6-AC | Pregame decisions | MET | **Fixed 2026-10-19.** Opening hand, mulligan, London putback and play-or-draw are all asked and answered, through two browsers and the worker harness; transition to the first turn verified. **Leyline-style added 2026-10-20** (`scripts/check-leyline.py`, `e2e/match-leyline.spec.ts`, both in CI): asked before turn one, one pick per question, the chosen cards begin on the battlefield uncast, a declined one stays in hand. Was a loud stub. **A Forge defect was found** -- if nobody acts before the first card moves to a graveyard, the Leyline's replacement is skipped (last-known battlefield not refreshed); confirmed by experiment, owner decision pending under VEND-002 |
| P6-AD | Karn / game restart | MET | **Run 2026-10-20**, `scripts/check-karn.py` (in CI) and `e2e/match-karn.spec.ts`. Karn's -14 through real play; Forge restarts in place, keeping card id numbers, so a game EPOCH (from Forge's `GameEventGameRestarted`) goes on every snapshot and question; game 2 starts at turn 1 and 20 life, the Karn-exiled cards return under the caster, both players are told in words; game 1's last answer is refused as DUPLICATE and a game-1 action id against a game-2 question as STALE_DECISION. Trace: `docs/testing/evidence/p6-ad-karn-liberated.trace.json` |
| P6-AE | Nested interaction / Panglacial Wurm | MET | **Run 2026-10-20**, `scripts/check-panglacial-wurm.py`, in CI. Evolving Wilds' search on the stack; Forge offers the Wurm; seven mana decisions pay for it and it goes on the stack ABOVE the search; the search then resumes and a Forest is chosen; the Wurm resolves. Trace: `docs/testing/evidence/p6-ae-panglacial-wurm.trace.json` |
| P6-AF | Rules-version regression | NOT MET | No scenario selected or recorded |
| P6-AG | Card-name choice | MET | **Built 2026-10-20, owner decision: search, then pick** (`protocol/README.md`). The question arrives searchable with Forge's count (34,334 for Pithing Needle, 33,067 for Phyrexian Revoker's nonland list) and no options; the player searches, the server sends the best 50 from FORGE's list, and only a name it sent can be the answer. Worker run `scripts/check-card-name.py` (in CI): accents ignored, a guessed id refused, the named card's ability refused on activation. Browser `e2e/match-card-name.spec.ts` (in CI): search box, Mountain first for the Needle, absent for the Revoker; screenshots `seen/name-a-card-*.png` |
| P6-AH | Creature-type choice | MET | **Built 2026-10-19.** Adaptive Automaton asks with **356 options — Forge's own valid-type list**, which is exactly the "authoritative allowed values rather than a hand-maintained frontend rules list" the test asks for |
| P6-AI | Colour / land-type choice | MET | **Built 2026-10-19.** Alchor's Tomb asks for a colour from Forge's `ColorSet`; `chooseColor`, `chooseColorAllowColorless` and `chooseColors` all ported, including Forge's own short-circuits |
| P6-AJ | Composite / multi-representation | MET | **Run 2026-10-20** (`check-multiface.py`, `e2e/match-multiface.spec.ts`): Delver of Secrets // Insectile Aberration is one object id whose face changes; the snapshot carries Forge's `face` and every face name (§6.79), and the art follows the face shown -- the front's picture, then none for the back rather than the front's. Mutate, Rooms and battles are still untested (ledger) |
| P6-AK | Attachment relationships | MET | **Run 2026-10-20**, `scripts/check-attachments.py` (in CI) and `e2e/match-attachments.spec.ts`. From both seats' snapshots: Bonesplitter equipped to one creature then another (the relationship moves); Pacifism, seat 1's Aura on seat 2's creature; Control Magic on a creature whose seat goes 2 → 1 under the same id; Rabbit Battery reconfigured -- no longer a creature, `Artifact - Equipment`, attached. Every `attachedTo` names a card on that viewer's battlefield. In the browser each attachment is drawn on what it modifies, whoever controls it ("Pacifism (yours)" / "Pacifism (RudeLeft's)"). **Found and fixed:** an Aura on an opponent's creature was drawn nowhere -- attachments were looked for among their controller's own cards only. Mutate is P6-AJ's (Gemrazer) |
| P6-AL | Effective characteristics | MET | **Run 2026-10-20**, `scripts/check-characteristics.py` (in CI). Humility: Serra Angel 4/4 Flying Vigilance -> the same object 1/1 with no keywords. Blood Moon: Evolving Wilds `Land` with its search ability -> `Land - Mountain` offering only `{T}: Add {R}`. All Forge's current values; the snapshot now carries current KEYWORDS (it had none), shown on the card chip -- seen in the browser ("Defender") |
| P6-AM | Forge RNG authority | MET | **Built 2026-10-19.** Forge produces the outcome (`MyRandom` inside `FlipCoinEffect`); the player only CALLS it (`chooseBinary`); and the outcome now reaches them, which it did not before — `notifyOfValue` was a no-op. Reconnect and duplicate answers cannot reroll because the flip is not a decision |
| P6-AN | Complex modes / costs | MET | Modes (Abrade, Alley Evasion), X (`announceRequirements`, verified paid and dealt), costs (`CostPutCounter`, `CostRemoveCounter`, `CostTap`, mana) |
| P6-AO | Player / global state | MET | **Run 2026-10-20**, `scripts/check-player-state.py` (in CI) and `e2e/match-state.spec.ts`. Generic, per §6.96: every Forge counter on a player, Forge's designations, emblems/dungeons in the command zone, and day/night. Energy (Aether Hub), poison (Glistener Elf, life unchanged), monarch (Palace Jailer), day (Reckless Stormseeker) -- all seen on the board. **Found and fixed:** paying energy was an unimplemented cost that ended the match, and declining "which mana ability?" eight times ended it too (`check-mana-choice.py`; mutation-tested) |
| P6-AP | Alternate Forge result | MET | **Run 2026-10-20**, `scripts/check-alternate-win.py` (in CI; trace `docs/testing/evidence/p6-ap-laboratory-maniac.trace.json`) and `e2e/match-alternate-win.spec.ts`. Laboratory Maniac: seat 1's library empties and its next draw wins; nobody attacks, both players end on **20 life**, so life could not have decided it. GAME_ENDED carries WINNER seat 1 and Forge's own reason ("has won due to effect of 'Laboratory Maniac'", the winner's PlayerOutcome, alternate wins only); the match record keeps it (`an alternate win is recorded with Forge's reason`) and both players read it on the result line. **Found and fixed:** the final board was never sent -- snapshots went out only with a question, so what happened after the last one (the mill that emptied the library; combat damage taking a player to 0) never reached the players. The worker now publishes the board before GAME_ENDED, to every registered player -- Forge drops a player who has lost from `getPlayers()`, so the first fix sent the final board to the winner alone, showing the winner alone. The check fails without either fix |
| P6-AQ | Multiplayer sequential decision | CLASSIFIED | Open Format is two players (FMT-001); the test permits classification. Recorded 2026-10-20 in `docs/testing/MECHANICS_LAB_COVERAGE.md`: the six Multiplayer-category Lab cards are BLOCKED_BY_UNSUPPORTED_PRESET |
| P6-AR | Learn / outside-game capability | CLASSIFIED | `sideboard` returns null citing FMT-002 — `OUT_OF_ACCEPTED_SCOPE`. Recorded 2026-10-20 in `docs/testing/MECHANICS_LAB_COVERAGE.md` (Professor of Symbology, CLASSIFIED) |
| P6-AS | Mechanics Lab full-corpus import | MET | **Run 2026-10-20**, `MechanicsLabCorpusTest` (CI) and `MechanicsLabArtTest` (local; the images are never committed). 275 entries / 390 cards parsed as written; **every card resolves to its TXT printing, none refused**; Forge builds the deck; a real game starts with it as both libraries; all 275 images valid and mapped, in the Depot and at match time; TXT/CSV SHA-256 pinned. The upload route refuses it — 390 cards is not Open Format, 289 MB exceeds the package limit — and that refusal is asserted. **Passing P6-AS does not mean all mechanics in the corpus are supported** |

### Failure handling and scale

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-AT | Worker startup failure | MET | `a missing worker jar fails cleanly`, `an unconfigured worker fails cleanly`, `a failed start returns the room to the players` |
| P6-AU | Worker protocol mismatch | MET | **Run 2026-10-20**, `WorkerIdentityTest` (in CI). The worker's `protocolVersion` was sent but never validated; `MatchWorker` now refuses a different or missing one as WORKER_INCOMPATIBLE before anything else in the greeting is believed. Run against a real impostor process compiled by the test: refused, and START_GAME never reached it; a correctly greeting impostor (the control) IS sent the game. Mutation-tested: disabling the check fails both protocol tests |
| P6-AV | Forge revision mismatch | MET | **Run 2026-10-20**, `WorkerIdentityTest` (in CI): an impostor greeting with another `forgeCommit` is refused as WORKER_INCOMPATIBLE and never sent START_GAME. Mutation-tested: disabling the check fails exactly this test |
| P6-AW | Worker runtime crash | MET | `a runtime failure records no winner`, `a late failure cannot overwrite a real result`; `WorkerEvent.Stopped` → FAILED |
| P6-AX | Failure isolation | MET | **Run 2026-10-20** (`e2e/match-concurrency.spec.ts`). Three matches; one worker found by its stderr file descriptor and killed with SIGKILL. Both of its players were told "The game stopped before it finished. Nobody won it.", its room reopened, and the other two matches answered their pregame questions and reached RUNNING afterwards. Screenshots `seen/crashed.png`, `seen/survivor.png` |
| P6-AY | Three concurrent matches | MET | **Run 2026-10-20**, six players, three matches launched together. Startup (room setup to first question) 12.9–13.9 s; worker memory 824–940 MiB each, 2.66 GiB for three, server 498 MiB; 19–21 CPU-seconds per worker to the first question. Routing: exactly one player asked per match. State: three match ids, each pair sharing one. Assets: one match's image refused (404) through another match's route and to a non-participant. Shutdown: no worker left after abandoning. Numbers in `seen/concurrency.json` |
| P6-AZ | Ktor restart | MET | **Run 2026-10-20**: the server container restarted under a RUNNING match. Observed exactly the documented policy (`MatchRecovery`, §6.157): status FAILED_RUNTIME, `failure_code` SERVER_RESTARTED, no current match, room OPEN, no worker survived, and the player is back in the room (`seen/after-restart.png`) |

### Ending, integrity and production

| ID | Test | Status | Evidence |
|---|---|---|---|
| P6-BA | Normal Forge match end | MET | **Run 2026-10-20**, `MatchLauncherTest` `a finished match stops its worker and leaves nothing behind` (in CI): the real runtime and a real process -- an impostor worker that reports Forge's result and then refuses to exit -- give match ENDED, the result persisted, the room OPEN with readiness cleared (D4's amendment to "room closes"), the runtime no longer holding it, the worker process gone, and nothing per-match on disk but the worker log §6.155 keeps; the runtime creates no other per-match files (§6.30). Mutation-tested: without `worker.stop()` the process outlives its match and the test fails. Real games end this way in `match-alternate-win.spec.ts`; after a full browser suite the container holds no worker process |
| P6-BB | Browser close is not concede | MET | **Built 2026-10-19.** The other player's whole browser context is closed; the match stays LAUNCHING/RUNNING with no result, and on signing in again they are returned to the same match |
| P6-BC | Imported deck immutability | MET | **Integrity comparison 2026-10-20**, two ways. In CI, `MatchLauncherTest` `a finished match stops its worker and leaves nothing behind` compares every column of every `imported_deck`, `deck_entry`, `deck_share` and `art_asset` row before launch and after the match ends, through the real runtime and a real worker process: identical. Mutation-tested -- one space appended to an entry's source text in the end-of-match path fails it. On the real stack, `e2e/match-alternate-win.spec.ts` (with the container) fingerprints the same rows plus every artwork file under /data/art after import and again after a whole real game: unchanged (`4d76b182…`, `3ad66a45…`) |
| P6-BD | Exact printing runtime | PARTIAL | Import resolves exact printings (`CardResolverTest`); **runtime preservation not inspected** |
| P6-BE | Basic land runtime | MET | Every deck in `harness-decks.json` runs on basics through real games |
| P6-BF | Multi-face runtime | MET | **Run 2026-10-20**: Delver transforms by real play -- same id, `face` Original -> Backside, 1/1 -> 3/2 and Human Wizard -> Human Insect from Forge. Viewer-safe asset mapping: front art from the package, none for the back (packages carry fronts only; never the wrong face). Browser screenshots `seen/delver-*.png` |
| P6-BG | Token runtime | MET | Legion Warboss creates Goblin tokens; they appear in snapshots, attack and block; no token art exists and nothing crashes |
| P6-BH | Zone coverage | MET | **Hellspark Elemental's Unearth offered from the graveyard and performed three times.** Enumerator uses `getAllCards()` + Forge's `getAllPossibleAbilities`, so it is not hand/battlefield-bound |
| P6-BI | Unsupported preset guard | MET | **Run 2026-10-20**, `MatchRoutesTest` (in CI), through the real HTTP routes: a preset named in the launch body is ignored (`extra fields in the launch body are ignored`), and a setup rewritten in the database to COMMANDER is refused at `POST /api/matches` (422) with no match row created. Mutation-tested |
| P6-BJ | 2HG guard | MET | **Run 2026-10-20**, `MatchRoutesTest` (in CI): a ROOM rewritten to TWO_HEADED_GIANT cannot be prepared (422 INVALID_ROOM_CONFIGURATION), and a SETUP rewritten to it after preparation cannot be launched (422 LAUNCH_REVALIDATION_FAILED, no match row, so no worker). Mutation-tested: disabling either guard fails its tests |
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
2. ~~**The Mechanics Lab corpus**~~ — done 2026-10-20: it existed
   all along in `Test Deck/Testing Deck/`. P6-AS, P6-AA and P6-AE
   met; the ledger is `docs/testing/MECHANICS_LAB_COVERAGE.md`,
   where 43 of the 48 Phase-6-required cards are still not yet
   tested one by one.
3. ~~**Semantic non-object choices**~~ — done 2026-10-19; P6-AG
   done 2026-10-20 by searching (owner decision).
4. ~~**Pregame**~~ — done 2026-10-19; Leyline-style 2026-10-20.
5. ~~**Browser-session tests**~~ — done 2026-10-19: P6-R, P6-S, P6-T
   and P6-BB met, in one match (`e2e/match-session.spec.ts`).
   P6-R found a real server defect, fixed in the same change.
6. ~~**Concurrency and restart**~~ — done 2026-10-20: P6-AX, P6-AY
   and P6-AZ met (`e2e/match-concurrency.spec.ts`, run on demand
   with `PROXIC_E2E_CONTAINER`). Looking at its screenshots found
   two-faced cards had no artwork; fixed in the same change.
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
