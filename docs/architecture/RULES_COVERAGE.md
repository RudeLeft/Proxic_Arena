# Rules coverage — who applies each rule, and the proof

**2026-10-23**, after the Phase 8 rules review. A living document: change
it in the same commit as any change to how a rule is applied.

Proxic Arena never implements a Magic rule (AGENTS ARCH-002, PHASE_06
§6.50). **Forge** applies every rule of the Comprehensive Rules (CR).
Arena's part is four things, and each has its proof:

1. **Ask the right player every question Forge has** -- 170 entries,
   generated from Forge itself and held by the build
   (`forge-worker/src/test/resources/forge-questions.tsv`, Phase 8).
2. **Show each player only what they may see** -- every Mechanics Lab
   game is checked (`check-hidden-hands`, `check-snapshot-first`).
3. **Deck legality** -- Open Format is Proxic's own rule, not Forge's
   (`docs/architecture/OPEN_FORMAT.md`, AGENTS FMT-001/002).
4. **Enforce what Forge leaves to its own screen** -- where Forge's game
   code takes whatever answer its controller returns and only its desktop
   screen checks it (below).

## The rulebook, chapter by chapter

| CR chapter | Applied by | Arena asks / does | Proof (in CI) |
|---|---|---|---|
| 1. Game concepts: starting player, mulligans, winning and losing, conceding | Forge | Who starts; keep or mulligan; which cards go to the bottom; concede | `check-mulligan`, `check-alternate-win`, `check-results`, `check-concede`, `check-karn` |
| 2. Parts of a card | Forge's card data | Shown on the board, as each player may know it | `check-characteristics`, `check-text-effects`, `check-multiface`, `check-printings`, `check-shapes` |
| 3. Card types (Contraptions, Attractions, dungeons, battles included) | Forge | A board row for every type | `check-kinds` over every Lab game, `check-unset`, `check-board-data` |
| 4. Zones, hidden and public | Forge's visibility | Each player's snapshot filtered | `check-hidden-hands`, `check-face-down`, `check-library-order`, `check-surveil` |
| 5. Turn structure, priority, combat | Forge | Attackers, blockers, damage assignment; priority stops and the response window | `check-stops`, `check-blocks`, `check-combat-choices`, `check-results` |
| 6. Spells, abilities, effects: casting, the 40 cost kinds, targets, modes, X, trigger order, replacements | Forge | Every question in the record, answered by the player | the record; `check-you-choose`, `check-cost-kinds`, `check-costs`, `check-modes`, `check-mana-*`, `check-sacrifice`, `check-mindslaver`, `check-panglacial-wurm` |
| 7. Keywords and special rules | Forge | Every keyword that asks a question is built | the record; `check-dice`, `check-unset`, `check-coin-flip`, `check-attachments`, `check-tracked-state` |
| 8. Multiplayer | -- | Not offered (two players); Commander and Two-Headed Giant are planned | -- |
| 9. Casual variants (Planechase, Archenemy, Vanguard...) | -- | Not offered; the questions only they ask are proven unreachable | `check-unreachable`, `UnreachableQuestionsTest`, `check-dice planar` |

## What Forge leaves to its screen, and Arena enforces

Forge's game code applies what its player controller returns; for these,
Forge's own desktop screen does the checking, so Arena's worker must.

| Rule | Where | Proof |
|---|---|---|
| Legal attacks and blocks -- the whole block (menace, "can't block alone") | `CombatChoices` validates with Forge's `CombatUtil` before answering | `check-blocks` |
| Trample: lethal damage to every blocker before any to the player (CR 702.19c); deathtouch makes 1 lethal (702.2c) | `CombatChoices.allLethal`, as Forge's `VAssignCombatDamage.canAssignTo`, for every split asked; since spec 0107 a trampler's split is made for its player (`CombatChoices.usualSplit`: lethal-first by construction) unless changed with "Change split" (`DamagePlans`, used at damage only while `DamagePlans.Plan.fits`), and Forge still checks the map it is given | `check-combat-choices` trample-auto, trample-kept, trample-two-blockers, trample-elf-dies, trample-elf-plan, trample-deathtouch, trample-unblocked |
| Divided damage or counters: at least 1 to each target, all of it assigned, the split after every target is chosen (CR 601.2d) | `MatchController.divideAll` / `divide` / `finishDivision` | `check-numbers` (split: order, contents, the board after); `check-shapes` (divided damage); `check-you-choose` (Harm's Way's shield) |
| Targets: Forge's candidates only, no more than the most, stopping ("Done") only once enough are chosen; backing out at any point casts nothing (CR 601.2c) | `MatchController.selectTargets` -- `enough`, and its own cancel answer `target:cancel` (Phase 9 Amendment 17) | `check-numbers` (targets: what is chosen at each step, cancel at two backs out, Done at one) |
| Convoke / Improvise / Waterbend: each tapped card pays a mana it can | `MatchController.chooseCardsForConvokeOrImprovise` | `check-costs` |
| Costs paid in a rules-legal order that never loses a card for nothing (CR 601.2h) | `MatchController.orderCosts` -- refundable first, sacrifices last (Phase 8 Amendment 2) | `check-cost-kinds mill-no` |
| Choices between min and max (sacrifice, discard, reveal, "any number") | `pickSeveral` / `pickCards`: never fewer than required, a pass only when allowed | the record's scenarios |
| A card in another player's graveyard or exile that a player may use (Gonti's, Hostage Taker's: CR 109.5's "you may cast") is offered to that player, as its own cards are (FMT-003) | `MatchController` adds Forge's own `Player#getCardsActivatableInExternalZones` to the player's zones; the offer is still Forge's (`getAllPossibleAbilities`, its restrictions and timing). Before spec 0087 such a card was never offered | `check-piles gonti` |

## Every answer Arena gives without asking -- and why it is not a guess

Phase 8 point 5: nothing is answered for a player. These are the only
places a question Forge puts is answered by Arena, each matching Forge's
own human screen or a rule that leaves no choice:

| Question | Arena's answer | Why |
|---|---|---|
| A priority pass with nothing on the stack, outside the stops rule's moments | pass | One rule for everyone, nothing to set (spec 0035; was PHASE_07 Amendment 13) |
| A priority pass with something on the stack but nothing you could do | pass | Nothing to choose |
| The pass that lets the top of the stack resolve when nobody was asked about it (both seats passed for) | pass, held first: the boards mark the top `rest` and the game thread waits 2.5 s plus the card's arrival allowance (3400 ms a cast spell since spec 0105 Amendment 2, owner 2026-11-20; 700 an ability, trigger or copy), 0.8 s for each further one in a run; nothing about who is asked or what resolves changes (`StackRests`, `GameHost.restBeforePass`) | Spec 0105 (owner Q2 B): a spell nobody could answer resolved before either screen drew it on the stack. `check-stack-rests` |
| Your own Main 1 with nothing you could play (no land to play, nothing payable) | pass, and the rest of the turn too -- said on the act button ("Passing" / "Nothing to play · 1 land, no land in hand"; spec 0097 item 2, a notice before), each step held 0.4 s so the turn moves where you can see it | Spec 0061, item 2: the turn used to vanish in a tenth of a second, unexplained |
| Your OWN spell or trigger on top, and you could act | asked, as a **response window**: your page passes after a visible 5-second countdown you let run out (a click on it passes at once); the pause in its circle holds it until you pass, and a tab not in front never counts down (Phase 9 Amendments 13, 15) | Phase 8 Amendment 4, specs 0005 and 0035 |
| One legal answer: a colour, number, counter kind, keyword, face, type, protection, name, replacement or cost reduction with one legal answer (one defender, one blocker taking all the damage) | that answer. A card or player an effect has you choose, a mode, a new target or a spell to cast: always asked, even with one (spec 0104; `MatchController.chooseSingleEntityForEffect`, `chooseModeForAbility`, `chooseTarget`, `chooseSingleSpellForEffect`, `chooseSpellAbilitiesForEffect`). The half of an adventure card a free cast offers (Forge's Play effect: cascade): always asked, even when only one half can be cast (spec 0104 Amendment 1, `MatchController.getAbilityToPlay`, `freeCastOfAdventure`); any other card with one ability: the card clicked is the choice | Forge's human screen does the same for the first group; the second reverses part of this row as accepted at the Phase 8 exit gate, by the owner's decision (spec 0104, Q1 A). `check-always-choose` |
| Attacks and blocks chosen as a selection pointed at what they attack or block (Phase 9 W-14; the block-many chooser is gone) | the player's page answers Forge's own per-creature questions ("attack with which?", "attack what?", "block with which?", "block what?") for each creature it was given, stopping at the first Forge does not offer, the rest still selected | Phase 9 Amendment 11, spec 0037 Amendment 2: the player's choice, given once |
| A blocked trampler's damage split, by its own player, when it can trample over (its damage beats its blockers' total lethal), or one blocker takes it all | the usual split: each blocker in Forge's order its lethal (deathtouch 1, damage already marked counted: `CombatChoices.lethal`), the rest to the defender (`CombatChoices.usualSplit`, `CombatChoices.automatic`). The player may change it before damage: at declare blockers their seat is stopped with a "Change split" option per such attacker (`CombatChoices.trampleSplits`, `PriorityStops.shouldAsk`'s `splitOpen`), which asks today's damage window then and keeps the answer (`DamagePlans`); at damage a kept plan that still fits is used, one that no longer fits (an Elf died: Heedless One hits for less) is asked again, filled in with the new usual split. When a changed split kept the extra on the blockers, the defender is told (`ActionReports` kind `TRAMPLE_KEPT`). Two or more blockers with no excess, and a creature that divides its damage as it chooses, are asked as before | **An owner-approved exception to "you always choose"** (spec 0107, Q5b, 2026-11-19): the choice stays the player's, but its default is applied without a click. `check-combat-choices` trample-* |
| `chooseNumberForCostReduction` | the whole reduction | Forge's human screen asks only in its "full control" mode |
| `chooseManaFromPool` (Forge's automatic pool payment, a tie) | the first | as Forge's screen; only reached while a cost is checked |
| `sideboard` | none | Open Format has no sideboard (FMT-002) |
| A question while Forge only *checks* whether a cost can be paid (assist) | none asked | `CHECKING` guard: a check is not a payment |
| Convoke, improvise, waterbend or delve while Forge only *checks* a cost (can it be paid? what does it cost now?) | none asked; the check counts what those cards COULD pay -- Forge's AI matcher `ComputerUtilMana.getConvokeOrImproviseFromList` over cards with no mana ability of their own (`MatchController.couldConvoke`), and for delve as many graveyard cards as count | `CHECKING` guard, owner 2026-11-08: Forge asks these even in test mode, so Venerated Loxodon in hand asked "tap a creature for Convoke" twice per priority and Treasure Cruise about ten delve questions. Casting still asks, card by card. `check-costs` delve/convoke/improvise: no question outside a cast, dimmed exactly when lands and those cards cannot pay |
| A question interrupted while a match is being stopped | the first answer | Only as the game ends; recorded in the Phase 8 exit gate |

Every other question is asked of the player Forge names, and a question
Proxic cannot answer stops the game loudly, naming the card (Phase 8
P8-G), never guessing.

## Known limits

- A few dozen real cards Forge cannot play at all (digital-only Alchemy,
  some promos; ~26 measured 2026-10-02, before the joke sets were added):
  refused at import, and the Deck Builder warns on export.
- Forge's own bugs: two carried as patches (`forge_patches/`); more fixed
  in Forge 2.0.16 (planned on the ROADMAP).
- Not offered: multiplayer, the casual variants, Unfinity stickers (until
  Forge 2.0.16), clocks or time limits.
