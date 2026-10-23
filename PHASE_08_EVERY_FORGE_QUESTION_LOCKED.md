# Phase 8 — Every Forge question, answered and proven

**Status: LOCKED 2026-10-22 by the owner ("Yes lock it") — ACTIVE.**
Changes from here are dated, owner-approved amendments at the end of this
document, never edits to the text above them (AGENTS PHASE-002). Part 1 is
spec 0001.

**Owner, 2026-10-22:** "create a phase 8 … all Forge calls / questions we
have built and all of the ones we are missing … a 100% complete list … a
record to ensure they cannot be skipped or bypassed … rock solid and
tested". Decisions taken the same day: build the Un-set cards too (D1),
no import warning (D2), build in order of how many cards need each (D3),
and a real phase with an exit gate rather than a feature spec (D4).

**Part 1** is `docs/features/0001-sacrifice-and-surveil.md` (approved
2026-10-22): sacrifice, destroy and surveil, the first three of the
missing questions.

## Why

A game of Magic is Forge asking players questions — which land, which
target, which creature to sacrifice — and Proxic answering each one
exactly as the player chooses. A question Proxic cannot answer stops the
game (2026-10-22: Eldrazi Monument at turn 10). Until now the list of
questions was written by hand: it said 42 unbuilt; the compiled code says
43 (`chooseSingleCardFace`, "venture into the dungeon", was missing). A
hand-written list will drift again; this one is generated from Forge
itself and checked on every build.

**Today, measured from the compiled code and Forge's 33,978 card scripts:**

| | Count |
|---|---|
| Questions Forge may put to a player (`PlayerController`, every overload) | **109** |
| … answered by Proxic | 66 |
| … being built in 0001 | 3 |
| … not built, reachable in Open Format | 28 |
| … Un-set only (D1) | 3 |
| … cannot arise under Proxic's rules (proven, kept loud) | 9 |
| Forge's own default answers (each classified) | **21** |
| Kinds of payment cost (`ICostVisitor`) | **40** — 9 built (4 forms refused), 31 not |
| **Total entries in the record** | **170** |
| Cards that can reach something not built | **2,231 of 33,978** (≈ 1 in 15) |

## What Phase 8 delivers

1. **The record** — `forge-worker/src/test/resources/forge-questions.tsv`:
   one row per entry above, never fewer. For each: the plain-English name,
   its status (BUILT / UNBUILT / UNREACHABLE / NOT-A-QUESTION / ROUTES-TO),
   the cards that ask it, and its **evidence** — the test that proves it.
2. **A gate that cannot be bypassed** (CI, every build): it reads Forge's
   interfaces from the compiled code, at whatever Forge version is pinned,
   and fails the build when
   - a question or cost kind exists that has no row (a Forge update added
     one: nobody can ship until it is classified);
   - a row says BUILT but Proxic does not answer it, or says UNBUILT but
     it does (the record can never claim more, or less, than is true);
   - a BUILT row names no evidence, or evidence that does not exist or is
     not run in CI;
   - a question marked BUILT was never actually asked in any Mechanics Lab
     game in that CI run (the run's game records are read for it, as
     `check-kinds` reads them for rows);
   - an UNREACHABLE row's proof is missing or no longer holds (someone
     turns ante on, Forge starts calling a method it never called).
3. **Every question proven in a real game.** A BUILT question's evidence is
   a Mechanics Lab scenario (Forge running a real game) that reaches it and
   checks five things:
   1. the right player is asked (the controller, or the one Forge names —
      Mindslaver);
   2. the choices offered are exactly Forge's legal ones — nothing added,
      nothing removed;
   3. what the player picks is what happens, on the board afterwards;
   4. nothing hidden reaches the other player (`check-hidden-hands`);
   5. nothing is answered for the player (no guess, no first option, no
      silent default — only the priority pass the player's own stops allow).
   The 66 already built get this proof where they lack it; the record shows
   which do today.
4. **The missing ones built,** in slices, each a release (D3 for the
   order): 0001 first, then by how many cards reach them.
5. **Until a question is built,** it still stops the game loudly and names
   the card that asked (done 2026-10-22), never guesses. No warning at deck
   import (owner, D2).

### Kinds of entry

Not every one of Forge's 109 methods asks a person something; the record
says which, because each needs a different proof:

| Status | Means | Its proof |
|---|---|---|
| ASKS | a question to a player, answered on the board or in the question line | reached and answered in a Mechanics Lab game, five points checked |
| TELLS | Forge informs a player (a coin flip's result, a reveal) | a scenario checking the player was told, and only that player when private |
| ENGINE | housekeeping Forge needs a controller to do (playing a chosen ability, shuffles) | a unit or game test of the effect |
| UNBUILT | not answered yet: a loud stop that names the card | the stop itself (LoudFailureTest) |
| UNREACHABLE | cannot arise under Proxic's rules | a test asserting the rule (e.g. damage-assignment order off) |
| ROUTES-TO | a Forge default that only forwards to another entry | the entry it forwards to |
| NOT-A-QUESTION | a property (isAI, getGame) | — |

## Scope

**In:** all 170 entries; the record and its gate; real-game evidence for
every BUILT question; building the 31 missing questions (the 28 reachable
ones and, by D1, the three Un-set ones) and the 31 missing costs; proofs
for the 9 that cannot arise.

**Out:** changing how Forge decides anything (ARCH-002 — Forge's rules,
untouched); Commander and Two-Headed Giant (their questions are in the
record — it is generated from Forge — but are reached only by modes Proxic
does not play); a computer opponent; an import warning (D2).

## Rules and boundaries

- **The record is generated, then reviewed** — the list of entries comes
  from Forge's compiled interfaces, never from someone's memory; only the
  words and evidence are written by hand.
- **A status changes only with evidence** in the same change (PHASE-002):
  code and its scenario, or the proof that it cannot arise.
- **Hidden information** is checked on every scenario game (HID).
- **No rule workarounds**: a question whose honest answer needs Forge to
  change is a Forge patch (VEND-002, owner-approved), never a shortcut here.
- **The Forge pin**: moving it re-runs the gate first; new questions are
  classified before anything else (VEND-005).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| P8-A | The record has a row for every one of Forge's questions and cost kinds at the pin; the gate fails on a missing row (proven by deleting one) | gate test in CI |
| P8-B | The gate fails when a row's status disagrees with the code, both ways (proven by flipping one) | gate test |
| P8-C | Every BUILT row names a scenario that exists and runs in CI | gate test |
| P8-D | Every UNREACHABLE row's condition is asserted by a test (rules flag off, never called at the pin, mode not played) | gate test + unit tests |
| P8-E | Each of the 66 already-built questions has a real-game scenario checking the five points | Mechanics Lab |
| P8-F | Each newly built question or cost: the same, in its slice | Mechanics Lab, per slice |
| P8-G | A deliberately unbuilt question still stops the game, names the card, and no game ever guesses | real game |
| P8-H | `check-hidden-hands` and `check-snapshot-first` hold over every new scenario | cross-game checks |
| P8-I | Every Un-set question works with its cards in an Open Format game, including whatever deck support D5 decides | Mechanics Lab |
| P8-O | The owner plays games with cards from each slice and accepts the phase at its exit gate | owner |

## Owner decisions

- **D1 — Un-set cards: BUILD THEM** (owner, 2026-10-22). Open Format's
  pool is unrestricted. Unfinity sectors and sprockets and Unstable
  contraptions (71 cards, three questions) are built like everything else.
- **D2 — No warning at import** (owner, 2026-10-22). A deck with a card
  whose question is not built yet imports as today; if the game reaches
  it, the game stops loudly and the record names the card.
- **D3 — Order: by card count** (owner, 2026-10-22), after Part 1: the gap
  the most cards reach goes first — "tap an untapped creature" costs (239),
  costs paid with cards for an "unless" (~200), keyword extra costs (104),
  returning a permanent as a cost (94), mana in any combination (88), and
  on down the appendix.
- **D4 — A real phase** (owner, 2026-10-22): this document, locked by the
  owner, with acceptance tests and an exit gate, as Phases 1–7. Approved
  feature specs (0001) carry on alongside; Phase 8's own work is under
  PHASE-001 as a phase.
- **D5 — open: contraption and attraction decks.** Contraptions (Unstable)
  are played from a separate contraption deck; Open Format has no second
  deck or sideboard and the Deck Builder exports none. Building D1 needs a
  rule for it: a second, small deck in the package; or contraptions made
  playable only through the cards that create them; or another way. To be
  decided before that slice, with a recommendation then.

## Amendments

- **Amendment 1 — D5 decided: all of them** (owner, 2026-10-23, asked
  with the choice of "leave them out", "dice only" or "all of them").
  Every Un-set question is built: contraptions, sectors and sprockets,
  and the dice questions only Un-set cards reach (rerolling, nudging,
  swapping, ignoring a roll -- Monitor Monitor, Xenosquirrels, Vedalken
  Squirrel-Whacker, Bamboozling Beeble), including a way to bring a
  contraption deck to the table. How that deck is carried (the package,
  the Deck Builder's export) is a design question put to the owner
  before that slice is built.
- **Amendment 2 — ask before the point of no return** (owner,
  2026-10-23). Forge pays each part of a cost as soon as it is decided,
  and backing out later gives back only what it can refund (tapping,
  counters, energy, mana): declining Sinister Concoction's mill after its
  sacrifice lost the Concoction, as on Forge's desktop. Proxic now pays
  the parts in an order the rules allow (CR 601.2h): what can be given
  back first, then the yes-or-no costs that spend only resources (life,
  mill, damage, a draw, a flip), then those that pick cards to lose,
  sacrifices last. No Forge patch was needed: Forge asks the controller
  for this order (`orderCosts`), and the record's row says so. Proven by
  `check-cost-kinds.py` mill-no, with a mutant (Forge's order) caught.

## Appendix — the 170 entries, 2026-10-22

Generated from the compiled worker and Forge at the pin
(`forge-2.0.15`, `4ec5f1a2`), card counts from Forge's scripts. The gate
will keep this table true; this copy is the starting point.

### A. Built and answered by Proxic — 66

Each needs its named real-game proof in the registry (§ The rules). Today:

`announceRequirements`, `applyManaToCost`, `arrangeForScry`, `assignCombatDamage`, `autoPassCancel`, `awaitNextInput`, `cancelAwaitNextInput`, `chooseBinary`, `chooseCardName`, `chooseCardName`, `chooseCardsForConvokeOrImprovise`, `chooseCardsForEffect`, `chooseCardsForZoneChange`, `chooseCardsToDelve`, `chooseCardsToDiscardFrom`, `chooseCardsToDiscardToMaximumHandSize`, `chooseColor`, `chooseColorAllowColorless`, `chooseColors`, `chooseCounterType`, `chooseEntitiesForEffect`, `chooseModeForAbility`, `chooseNewTargetsFor`, `chooseNumber`, `chooseNumber`, `chooseOptionalCosts`, `chooseProtectionType`, `chooseSaToActivateFromOpeningHand`, `chooseSingleCardFace`, `chooseSingleCardForZoneChange`, `chooseSingleEntityForEffect`, `chooseSingleReplacementEffect`, `chooseSingleSpellForEffect`, `chooseSingleStaticAbility`, `chooseSomeType`, `chooseSpellAbilitiesForEffect`, `chooseSpellAbilityToPlay`, `chooseStartingPlayer`, `chooseTargetsFor`, `confirmAction`, `confirmPayment`, `confirmReplacementEffect`, `confirmStaticApplication`, `confirmTrigger`, `declareAttackers`, `declareBlockers`, `getAbilityToPlay`, `getCostDecisionMaker`, `mulliganKeepHand`, `notifyOfValue`, `orderAndPlaySimultaneousSa`, `orderCosts`, `orderMoveToZoneList`, `payCostDuringRoll`, `payCostToPreventEffect`, `payManaCost`, `playChosenSpellAbility`, `playSaFromPlayEffect`, `playSpellAbilityNoStack`, `playTrigger`, `reveal`, `reveal`, `revealUnsupported`, `sideboard`, `tuckCardsViaMulligan`, `willPutCardOnTop`


### B. Being built in 0001 — 3

| Question | Cards that ask it |
|---|---|
| `arrangeForSurveil` | 243 cards — Consider, Curate, Price of Fame |
| `choosePermanentsToDestroy` | 3 cards — Imperial Edict, Wei Assassins |
| `choosePermanentsToSacrifice` | 540 cards — Eldrazi Monument, Diabolic Edict, Innocent Blood; also Emerge, Balance |

### C. Not built, reachable in Open Format — 28

| Question | Cards that ask it (Forge's card scripts, 2026-10-22) |
|---|---|
| `chooseCardsForCost` | ~200 cards — "unless its controller sacrifices / discards / returns…" (Daze-style taxes paid with cards) |
| `chooseNumberForKeywordCost` | 104 cards — Offspring, Multikicker (Everflowing Chalice), Casualty, Replicate, Squad, Conspire |
| `specifyManaCombo` | 88 cards — "add N mana in any combination of colours" |
| `chooseSingleCardFace` | 45 cards — venture into the dungeon: which dungeon |
| `chooseTarget` | 43 cards — change a spell's target (Redirect, Deflection, Shunt) |
| `vote` | 37 cards — Council's Judgment, Expropriate |
| `exertAttackers` | 36 cards — exert (Glorybringer) |
| `payCombatCost` | 35 cards — attack/block taxes (Ghostly Prison, Propaganda, War Tax) |
| `chooseCardsToRevealFromHand` | 35 cards — reveal any number from hand (Blackmail, Ivy Seer) |
| `chooseCardsPile` | 32 cards — two piles (Fact or Fiction, Steam Augury) |
| `chooseKeywordForPump` | 32 cards — "flying or first strike, your choice" (Steel Seraph) |
| `chooseCardsForSplice` | 30 cards — splice onto Arcane |
| `chooseSingleCardState` | 30 cards — unlock a door (Duskmourn Rooms) |
| `choosePlayerToAssistPayment` | 16 cards — assist (Gang Up) |
| `helpPayForAssistSpell` | the same 16 — the other player's side of assist |
| `enlistAttackers` | 15 cards — enlist |
| `chooseCardsToDiscardUnlessType` | 15 cards — Thirst for Knowledge, Wrench Mind |
| `chooseCardsForEffectMultiple` | 12 cards — look and sort into several places (Harper Recruiter) |
| `chooseDiceToReroll` | 4+ cards — dice you may reroll |
| `chooseRollToIgnore` | with the dice cards — ignore a roll |
| `chooseRollToModify` | with the dice cards — change a roll |
| `chooseRollToSwap` | with the dice cards — swap rolls |
| `chooseRollSwapValue` | with the dice cards — the value swapped |
| `chooseNumberForCostReduction` | 3 cards — "reduce by up to" (Mana Matrix) |
| `confirmBidAction` | 3 cards — bid life (Mages' Contest) |
| `chooseFlipResult` | 1 card — Krark's Thumb |
| `divideShield` | rare — dividing a damage-prevention shield among several creatures; cards to find |
| `chooseManaFromPool` | rare — choosing which floating mana pays a cost; when Forge asks a person this, to find |

### D. Un-set cards — 3, to build (owner D1; D5 for the deck)

| Question | What |
|---|---|
| `chooseContraptionsToCrank` | Unstable contraptions (71 cards across the three) |
| `chooseSector` | Unfinity sectors (71 cards across the three) |
| `chooseSprocket` | Unfinity sprockets (71 cards across the three) |

### E. Cannot arise under Proxic's rules — 9

Kept as a loud stop, each with a test that proves the condition.

| Question | Why it cannot arise |
|---|---|
| `chooseCardsYouWonToAddToDeck` | ante is not played |
| `choosePDRollToIgnore` | Planechase is not played |
| `chooseStartingHand` | Backup Plan, a Conspiracy-draft card that is never in a deck |
| `orderAttackers` | Forge's old damage-assignment-order rule, off in every Proxic game |
| `orderBlocker` | same rule, off |
| `orderBlockers` | same rule, off |
| `orderSimultaneousSa` | never called by Forge's rules at the pinned version |
| `revealAISkipCards` | asked of Forge's computer player only |
| `revealAnte` | ante is not played |

### F. Forge's own default answers — 21

| Method | What it is |
|---|---|
| `addKeywordCost` | → chooseNumberForKeywordCost (UNBUILT): Casualty, Conspire, Offspring |
| `canPlayUnlimitedLands` | not a question (a property or housekeeping) |
| `cheatShuffle` | not a question (a property or housekeeping) |
| `chooseBinary` | → chooseBinary (built) |
| `chooseCardsToDiscardFrom` | → chooseCardsToDiscardFrom (built) |
| `chooseNumber` | → chooseNumber (built) |
| `complainCardsCantPlayWell` | not a question (a property or housekeeping) |
| `endTempShowCards` | not a question (a property or housekeeping) |
| `getAnteResult` | not a question (a property or housekeeping) |
| `getCostDecisionMaker` | → getCostDecisionMaker (built) |
| `getFullControl` | not a question (a property or housekeeping) |
| `getGame` | not a question (a property or housekeeping) |
| `getLobbyPlayer` | not a question (a property or housekeeping) |
| `getMatch` | not a question (a property or housekeeping) |
| `getPlayer` | not a question (a property or housekeeping) |
| `isAI` | not a question (a property or housekeeping) |
| `isFullControl` | not a question (a property or housekeeping) |
| `isGuiPlayer` | not a question (a property or housekeeping) |
| `isOrderedZone` | not a question (a property or housekeeping) |
| `resetAtEndOfTurn` | not a question (a property or housekeeping) |
| `tempShowCards` | not a question (a property or housekeeping) |

### G. Payment costs — 40 kinds

**Built (9):** `CostDiscard`, `CostExile`, `CostPartMana`, `CostPayEnergy`, `CostPayLife`, `CostPutCounter`, `CostRemoveCounter`, `CostSacrifice`, `CostTap`. Four forms of them are refused loudly today: discard *with the same name*, sacrifice *with different names*, exile *from any player's zone*, exile *from the top of a library* (32 cards).


**Not built (31):**

| Cost | Cards |
|---|---|
| `CostTapType` | 239 cards — tap untapped creatures/artifacts you control (Hecatomb, Springleaf Drum) |
| `CostReturn` | 94 cards — return a permanent to hand (Daze, Gush) |
| `CostReveal` | 76 cards — reveal a card from hand (Land Grant) |
| `CostRevealChosen` | with reveal — reveal the chosen card |
| `CostDraw` | 52 cards — draw as a cost |
| `CostRemoveAnyCounter` | with counters — remove any counter |
| `CostPutCounterYou` | with counters — a counter on you |
| `CostExert` | with exert |
| `CostEnlist` | with enlist |
| `CostCollectEvidence` | 25 cards — collect evidence |
| `CostBehold` | 25 cards — behold |
| `CostBeholdExile` | with behold |
| `CostBlight` | 23 cards — blight |
| `CostUntap` | 18 cards — the untap symbol {Q} |
| `CostDamage` | 18 cards — damage to yourself (Browbeat) |
| `CostForage` | 10 cards — forage (Bloomburrow) |
| `CostPutCardToLib` | 11 cards — put a card on top of a library |
| `CostMill` | 9 cards — mill as a cost |
| `CostGainLife` | 5 cards — an opponent gains life (Invigorate) |
| `CostUntapType` | 3 cards — untap permanents |
| `CostChooseColor` | 2 cards |
| `CostChooseCreatureType` | with the above |
| `CostPromiseGift` | Bloomburrow gift — count to confirm |
| `CostAddMana` | rare |
| `CostUnattach` | rare |
| `CostGainControl` | rare |
| `CostFlipCoin` | rare |
| `CostRollDice` | rare |
| `CostExileFromStack` | rare |
| `CostExiledMoveToGrave` | rare |
| `CostPayShards` | Forge Adventure mode only |
