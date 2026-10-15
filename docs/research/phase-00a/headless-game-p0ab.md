# Phase 0A — P0A-B / P0A-C: headless two-player game

**Sections:** `PHASE_00A` §0A.12 (P0A-B, P0A-C), `PHASE_00` §0.20, §0.22
**Forge pin:** `forge-2.0.15` — `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`
**Date:** 2026-10-15
**Harness:** `spikes/forge-phase0a/game-harness/`

---

## 1. Result

```text
[RUN] 10 consecutive games, mono-green architecture deck

      PASS                 10 / 10
      turns                10 – 13
      stubs reached         0 (every run)
      game wall time      ~750 ms after bootstrap
      bootstrap           ~2.9 s
```

**P0A-B: PASSED.** A real two-player game runs headless through the
Strategy A adapter on `forge-core` + `forge-game`, with no GUI classes
anywhere on the path, covering mulligan, land play, mana production,
casting, targeting, attacking, blocking, damage and a decided outcome.

Representative final state:

```text
turns played : 11
outcome      : winner Alice
  Alice  life=12   hand=1   battlefield=10  graveyard=1
  Bob    life=-5   hand=0   battlefield=9   graveyard=3
```

Lethal damage actually resolved; the loser is at −5, not merely "the
game stopped".

**P0A-C: PASSED, with a caveat recorded.** See §3.

### §0.22 construction graph, confirmed by running it

```text
StaticData
   -> Deck (DeckLoader, name-resolved)
   -> RegisteredPlayer.setPlayer(LobbyPlayer)
   -> LobbyPlayer implements IGameEntitiesFactory
        -> createIngamePlayer(game, id)
             -> new Player(...)
             -> player.setFirstController(ScriptedController)
   -> GameRules(GameType.Constructed)
   -> Match
   -> match.createGame()
   -> match.startGame(game, null)
```

`LobbyPlayer` + `IGameEntitiesFactory` is the attachment point for a
Proxic adapter: one controller per seat, installed via
`setFirstController`. `createMindSlaveController` is the hook where
Forge hands one player another's decisions — the §0A.8 protocol
requirement, runtime test deferred to 0B.6.

---

## 2. Decisions a real game actually reaches

This is the measurement §0A.6 needed to size the adapter. **13–15 of
105** decision kinds, for this deck:

```text
  2x  revealUnsupported          1x  orderAndPlaySimultaneousSa
  1x  chooseStartingPlayer       1x  playSpellAbilityNoStack
  2x  mulliganKeepHand           4x  chooseTargetsFor
240x  chooseSpellAbilityToPlay   6x  declareAttackers
 23x  playChosenSpellAbility     4x  declareBlockers
 13x  getAbilityToPlay          13x  payManaCost
 13x  getCostDecisionMaker      13x  applyManaToCost
```

Two notes:

- `chooseSpellAbilityToPlay` dominates at ~240 calls for ~23 actions,
  because Forge asks on **every** priority window — upkeep, end step,
  the opponent's whole turn. The old project reached the same
  conclusion and auto-passed empty windows in the client. Phase 6/7
  must plan for that ratio; it is not a defect.
- No `CONFIRMATION`, `RANDOM_RESULT`, `NAMING` or `COLOR_SELECTION`
  method was reached, consistent with the old project never reaching a
  confirmation in a year of games (§0A.6).

Cost kinds: only `CostPartMana` was ever asked for. The other 39
`ICostVisitor` kinds were never visited by this deck.

---

## 3. P0A-C — stack interaction

Required: a targeted spell is cast, the opponent receives priority, a
response is made, the stack resolves.

```text
[RUN] over 10 games
      max stack depth 2          : 5 / 10 runs
      spell cast onto non-empty  : 5 / 10 runs (1–2 per such run)
      spell cast outside own turn: every run
```

**Caveat, recorded rather than smoothed over.** The first measured
attempt produced **max stack depth 0** — every spell resolved into an
empty stack and no response ever happened, even though
`chooseTargetsFor` had been called 8 times. "A targeted spell was cast"
is not the same claim as "the opponent responded and the stack resolved
in order", and only the instrumentation made the difference visible.

The scripted controller now deliberately responds when it holds an
instant and the stack is non-empty. That is a policy added to reach the
branch, not an optimisation. Even so it is **draw-dependent** — 5 of 10
games never present the opportunity.

A deterministic stack test (seeded shuffle or a stacked hand) is the
honest next step before Phase 6 relies on this path. Recorded as
follow-up, not claimed as done.

---

## 4. Findings

### 4.1 Forge's priority loop has no safety valve for a human controller

```text
[SOURCE] PhaseHandler.mainLoopStep, end of the priority loop:

         } while (loopCount < 999 || !pPlayerPriority.getController().isAI());
```

The 999-iteration guard applies **only when `isAI()` is true**. For a
human-shaped controller the condition is permanently true, so if
`playChosenSpellAbility` returns `false` — or the cast fails during
payment — Forge re-offers the identical action **forever**: full CPU,
no exception, no log line, turn counter frozen.

```text
[RUN] Observed twice, from two different causes:
      340,251 identical cast attempts, stuck on turn 3, 0 stubs reached
      heartbeat showed turn=3 for 60s while main burned CPU inside
      checkStateBasedEffects
```

**Architectural consequence for the Proxic adapter:** it must never
offer an action it cannot perform, and never fail to perform one it
offered. A payment that cannot succeed must be refused *before* the
action is offered, not discovered during payment. The old project
reached the same rule from the other direction; this is the engine
behaviour that makes it mandatory rather than merely tidy.

A Phase 6 worker should additionally consider its own loop guard, since
Forge will not provide one.

### 4.2 Mana abilities must not be played through the normal cast path

The cause of one of those infinite loops.

```text
[RUN] PlaySpellAbility.playSpellAbility(this, player, manaAbility)
      returns FALSE for "{T}: Add {G}" on an untapped Forest when
      called from inside applyManaToCost.
```

The working approach, ported from the old project and re-validated
here (AGENTS ISO-003), taps and produces directly:

```java
manaAbility.setActivatingPlayer(player);
land.tap(false, manaAbility, player);
manaAbility.getManaPart().produceMana(manaAbility);
for (Mana m : manaAbility.getManaPart().getLastManaProduced()) {
    if (toPay.isNeeded(m, player.getManaPool())) {
        toPay.payMana(m, player.getManaPool());
    }
}
```

Colour is checked **before** tapping, via
`toPay.isAnyPartPayableWith(producedColorMask(found), pool)`. The old
project learned this the hard way: tapping the first untapped land was
invisible while every deck was mono-coloured, then crashed the bridge
on a two-colour deck with `addMana() error, mana not needed - R`. An
unpayable cost must fail cleanly and let Forge roll the cast back.

### 4.3 The survey tool masked the bug it was built to find

Documented because it is a lesson about method, not about Forge.

A "survey mode" was added to record stubs and return defaults instead
of throwing, so one run could enumerate every needed decision. The
missing method was `playChosenSpellAbility`; returning a default
`false` **created** the infinite loop while hiding its cause. The
throwing mode named it in a single run.

Survey mode is retained for enumeration but now refuses to report
`PASS`, because returning a default is not answering. The general rule:
a tool that substitutes defaults for answers cannot be used to judge
whether the system works.

### 4.4 Two harness bugs worth not repeating

- `System.out` is **block-buffered when redirected to a file**, and
  `Runtime.halt()` aborts without flushing. The first watchdog fired
  and discarded its entire report — indistinguishable from "the
  watchdog never ran". Fixed with an explicit flush before halt.
- A `| tail` pipeline buffers until the process exits, so a stalled run
  looks silent. A 10-second heartbeat printing turn number, decision
  kinds and stub count now makes a stall visible while it is happening.

Both cost more time than either finding above.

---

## 5. Design notes carried forward

- **The adapter base is generated** from `javap` against
  forge-game-2.0.15: 109 `PlayerController` overrides and 40
  `ICostVisitor` visits. Signatures are authoritative rather than
  hand-transcribed, and after a Forge bump the regenerated diff *is*
  the decision-surface change — directly serving §0.9.1's
  updateability requirement.
- **Unimplemented decisions are loud**: they record themselves in a
  registry *and* throw, so a stub swallowed by Forge's own `try/catch`
  still leaves a trace. Every run prints the stubs it reached. This is
  what turned each iteration into "the engine names the one method it
  needs next".
- **Cost visits return null rather than throwing**, because null is a
  legitimate answer there meaning "I cannot pay this". They are
  recorded instead, so unpayable cost kinds are still measured.

---

## 6. Status

| Test | State |
| --- | --- |
| P0A-A — Forge builds clean | PASSED |
| P0A-B — headless two-player game | **PASSED** 10/10 |
| P0A-C — target + stack interaction | **PASSED**, draw-dependent (5/10); deterministic test is follow-up |
| P0A-D — resource list proven | PASSED |
| §0.22 construction graph | **DONE** |
| P0A-E — hidden information | not started |
| P0A-F — object identity | not started |
| P0A-G/H — protocol safety, reconnect | not started |
| P0A-I — Commander | not started |
| P0A-J — adapter recommendation | done, pending owner acceptance |
