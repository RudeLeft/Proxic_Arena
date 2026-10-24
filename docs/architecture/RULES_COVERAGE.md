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
| Trample: lethal damage to every blocker before any to the player (CR 702.19c); deathtouch makes 1 lethal (702.2c) | `CombatChoices.allLethal`, as Forge's `VAssignCombatDamage.canAssignTo` | `check-combat-choices trample` |
| Divided damage or counters: at least 1 to each target, all of it assigned (CR 601.2d) | `MatchController.divide` / `finishDivision` | `check-shapes`, `check-concede` (divided damage); `check-you-choose` (Harm's Way's shield) |
| Convoke / Improvise / Waterbend: each tapped card pays a mana it can | `MatchController.chooseCardsForConvokeOrImprovise` | `check-costs` |
| Costs paid in a rules-legal order that never loses a card for nothing (CR 601.2h) | `MatchController.orderCosts` -- refundable first, sacrifices last (Phase 8 Amendment 2) | `check-cost-kinds mill-no` |
| Choices between min and max (sacrifice, discard, reveal, "any number") | `pickSeveral` / `pickCards`: never fewer than required, a pass only when allowed | the record's scenarios |

## Every answer Arena gives without asking -- and why it is not a guess

Phase 8 point 5: nothing is answered for a player. These are the only
places a question Forge puts is answered by Arena, each matching Forge's
own human screen or a rule that leaves no choice:

| Question | Arena's answer | Why |
|---|---|---|
| A priority pass at a step you do not stop at, with nothing on the stack | pass | Your own stops (PHASE_07 Amendment 13) |
| A priority pass with something on the stack but nothing you could do | pass | Nothing to choose |
| Your OWN spell or trigger on top, and you could act | asked, as a **response window**: your page passes after a visible 2-second countdown you let run out; any pause cancels it | Phase 8 Amendment 4, spec 0005 |
| "Skip to end of turn" | no more stops of your own this turn; the opponent's spells still stop you | PHASE_07 §7.53 |
| One legal answer (one colour, one defender, one blocker taking all the damage) | that answer | Forge's human screen does the same |
| `chooseNumberForCostReduction` | the whole reduction | Forge's human screen asks only in its "full control" mode |
| `chooseManaFromPool` (Forge's automatic pool payment, a tie) | the first | as Forge's screen; only reached while a cost is checked |
| `sideboard` | none | Open Format has no sideboard (FMT-002) |
| A question while Forge only *checks* whether a cost can be paid (assist) | none asked | `CHECKING` guard: a check is not a payment |
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
