# 0116 — A spell on the stack is offered once as a target: "Lightning Bolt on the stack", and it works

**Status:** Approved 2026-11-21 (owner, by prompt: "Approve"). Not part of a phase. Build after 1.75.0 is released. **Not part of 1.75.0** (owner, 2026-11-21: "its own fix"); its own release after 1.75.0.
**Built:** 2026-11-23 (commit f72c9c76). **Released:** in 1.76.0, 2026-11-25.
**Owner decisions:**

- 2026-11-21, by prompt, canvas "One Bolt, Two Buttons" (https://claude.ai/artifact/HYY7LzPujZQYaJinGLJoLP), section "Options", option **A**: **"one button, 'Lightning Bolt on the stack'."** Option B (one button, "Lightning Bolt") and option C (keep both, make both work) were not taken.

Found by the owner in the spec 0113 walk-through (canvas https://claude.ai/artifact/51CEtdatEyGeKoaWzqHtmN, its closing note "Two buttons for one Bolt").

## Why (researched)

Read at main 2e66c04a.

- **What the owner saw** (USER). Pat activates Spellskite while your Lightning Bolt is on the stack and opens "List choices": two buttons, "Lightning Bolt" and "Lightning Bolt on the stack".
- **Where the two come from** (SOURCE). `MatchController.selectTargets` offers Forge's `TargetRestrictions.getAllCandidates` as `target:card:<id>` / `target:player:<id>`, and, when the target zone includes the stack, every `SpellAbilityStackInstance` that `canTargetSpellAbility` accepts as `target:stack:<id>`. The comment there says `getAllCandidates` "never" covers the stack; that is wrong. `CounterEffect`, `ChangeTargetsEffect`, `CopySpellAbilityEffect` and `ControlSpellEffect` set the target zone to `Stack` in `buildSpellAbility`, and `getAllCandidates` returns every card in that zone that `canTarget` accepts. So the spell's **card** comes back as well as the **spell**. Forge knows: `TargetRestrictions.getNumCandidates` carries "TODO this may count some SA twice".
- **What Forge's own screen does** (SOURCE). `forge-gui` `TargetSelection.chooseCardFromList` lists the stack's cards and, when one is picked, adds the spell (`SpellAbilityStackInstance`, spells only) as the target instead of the card. The worker ported the spell entry (`chooseCardFromStack`) but not that turn-the-card-into-the-spell step.
- **Why the card button fails** (SOURCE). Counter, change-target, copy and control effects act on `getTargetSpells`; a card target isn't a spell, so they resolve doing nothing. No error and no message.
- **Played** (RUN, 2026-11-21: a scratch Lab probe on `check-spell-choices.py`'s `redirect` game, worker rebuilt from 2e66c04a; Alice's Bolt at Bob's Grizzly Bears, Bob answers):

  | Bob answers with | Bob presses | Result |
  |---|---|---|
  | Spellskite | "Lightning Bolt" (`target:card`) | 2 life paid; the Bolt still kills the Bears |
  | Spellskite | "Lightning Bolt on the stack" (`target:stack`) | the Bolt hits Spellskite (3 damage); the Bears live |
  | Counterspell | "Lightning Bolt" | two blue paid; the Bolt is not countered; the Bears die |
  | Counterspell | "Lightning Bolt on the stack" | the Bolt is countered; the Bears live |
  | Remand | "Lightning Bolt" | paid; the Bolt still kills the Bears |
  | Remand | "Lightning Bolt on the stack" | the Bolt goes back to Alice's hand |
  | Unsubstantiate | "Lightning Bolt" | the Bolt goes back to Alice's hand (works) |
  | Unsubstantiate | "Lightning Bolt on the stack" | the Bolt goes back to Alice's hand (works) |

- **How many cards** (SOURCE, a scan of the pinned card scripts). 573 cards can target a spell: 438 counter it, 44 copy it, 21 change its target, 3 gain control of it, 67 move it or aim at "a spell or a permanent" (Remand, Memory Lapse, Unsubstantiate, Venser, Shaper Savant). Cards whose `TargetType` is only abilities (Stifle, Bolt Bend; 44 cards) aren't affected: a card on the stack is never an ability. Only the copy and gain-control kinds are INFERENCE (same `getTargetSpells` shape, not played).
- **The board** (SOURCE). A spell on the stack is drawn as `stack:<id>`; clicking it answers `target:stack:<id>`. The `target:card:<id>` of a card on the stack has no object on the board, so the broken button is reachable only from "List choices".

## What the player sees

Pat has Spellskite; you cast Lightning Bolt at Pat's Grizzly Bears.

1. Pat activates Spellskite. Pat's "List choices" has **one** button for the Bolt: "Lightning Bolt on the stack" (0113's words, unchanged). Pat clicks it; the Bolt's beam swings to Spellskite; you get the report window "Pat changed your Lightning Bolt's target to Spellskite." (spec 0100, unchanged).
2. Clicking the Bolt on the stack itself does what it did before (the same answer).
3. Counterspell, Fork, Redirect, Commandeer, Remand: one button per spell on the stack, and it does what the card says.
4. Unsubstantiate ("return target spell or creature"): the list has the creatures on the battlefield and "Lightning Bolt on the stack", not a third "Lightning Bolt".
5. Two Bolts on the stack: two buttons, "Lightning Bolt on the stack (first)" and "(second)" (0113's rule, unchanged).

## Changes

### Worker

- `MatchController.selectTargets`: when the restriction's target zone includes `Stack`, drop from Forge's candidates every **card that is in the Stack zone**. The spell itself is still offered, as today, through the `canTargetSpellAbility` loop (`target:stack:<id>`). This is what Forge's own `TargetSelection.chooseCardFromList` does by turning such a pick into the spell. Cards in other zones (Unsubstantiate's creatures, Venser's permanents) are untouched.
- Correct the comment ("never the stack") to say what is true, and cite `TargetSelection.chooseCardFromList`.
- `chooseNewTargetsFor` (Deflecting Swat, Redirect choosing new targets) goes through the same `selectTargets`, so it gets the same fix with nothing extra.

Nothing else changes: no protocol, server or page code. The labels are 0113's.

## Rules and boundaries

- **ARCH-002 / FORGE-RULE.** Forge still decides what may be targeted: the spell is offered only when Forge's `canTargetSpellAbility` accepts it. Arena only stops offering the same spell a second time under its card, which Forge's own screen never offers as a card either. No rule is computed here.
- **UI-002.** Every action Forge allows stays reachable. Each dropped entry is the card of a spell that is still offered (when Forge accepts the spell), and the card entry never did what the player chose (the RUN table above).
- **PROTO-001.** The one remaining entry has the id the board uses for that stack object.
- **Hidden information.** Nothing new is sent; one entry fewer is.
- **VEND-001.** No Forge edit.

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0116-A | Lab, `check-spell-choices.py`: in `spellskite` and `swat`, the target question has exactly one option naming the Bolt, a `target:stack:` one, and no `target:card:` option for a card on the stack | real game (Lab, Layer B) |
| F-0116-B | Lab, new scenarios in `check-spell-choices.py`: `counter` (Counterspell: the Bolt is countered, the Bears live), `remand` (the Bolt goes back to Alice's hand, the Bears live), `unsubstantiate` (offered: Bob's Bears and the Bolt on the stack, no Bolt card; the Bolt goes back to Alice's hand). Each also asserts F-0116-A's one-option rule | real game (Lab, Layer B); `mechanics-lab-status.json` rows, ledger regenerated |
| F-0116-C | Real-click game (TEST-012), below | browser, `match-spell-choices.spec.ts` |

**TEST-004 (bites):** with the drop removed, F-0116-A and every F-0116-B scenario fail (the one-option check), and `counter` and `remand` also fail on the outcome. Dropping every stack candidate too (spell entries as well) makes all of them fail. That's two worker mutations, plus one page-test mutation: the real-click test answering the first list button that names the Bolt fails on its one-button assertion.

**Real-click game (TEST-012).** `match-spell-choices.spec.ts` step 2 changes from clicking the Bolt on the board to: the guest, choosing Spellskite's target, opens "List choices", the list has exactly one button whose text names Lightning Bolt and it reads "Lightning Bolt on the stack"; the guest **really clicks** it; then, as today, the host's Bolt beam swings to Spellskite and the host gets the report window. The board click of a spell on the stack sends the same answer (`target:stack:<id>`) and stays covered by the page's board tests. Waits on states (the list open, the button count, the beam's end). No clip: nothing on the board looks different.

**Per spec, locally (TEST-013):** the new and changed Lab scenarios three times, the worker gate, the real-click game, tsc/eslint/prettier/vitest for the one e2e file. The full Lab and browser suites run in CI.

## Out of scope

- The words on the button (0113's, unchanged).
- Abilities on the stack (Stifle): not affected (above).
- **Copy and gain-control cards** (Fork, Commandeer) are fixed by the same line but not played here. **Trigger (PHASE-004):** a Lab or owner game with Fork, Twincast or Commandeer shows a target question for a spell; then a scenario is added for it.

## Open questions

None. The owner chose option A on 2026-11-21.

## Amendments

None.

## As built (2026-11-22)

Built on branch `spec-0116` from 247212b9 (after 1.75.0's specs), one builder. Labels: SOURCE (read in the code), RUN (run here, this build).

### What changed

- **Worker** (`MatchController.selectTargets`): before the stack's spells are listed, every candidate from `TargetRestrictions.getAllCandidates` that is a card in the Stack zone (`Game.getZoneOf`) is dropped when the restriction's zone includes `Stack`; the test is the pure helper `MatchController.offeredAsItsSpell` (unit test `SpellTargetOnceTest`). The spell is still offered as `target:stack:<id>` only when Forge's `canTargetSpellAbility` accepts it. The wrong comment ("never the stack") now says what is true and cites `TargetSelection.chooseCardFromList`. `chooseNewTargetsFor` uses the same `selectTargets`, nothing extra. No protocol, server or page code; the labels are 0113's.
- **Lab** (`scripts/check-spell-choices.py`): `spellskite` and `swat` now also check F-0116-A (`once`: the first target question after the Bolt is answered has exactly one option naming the Bolt, "Lightning Bolt on the stack", a `target:stack:` id, and no question offers a `target:card:` of a card that is a stack entry's `source`). New scenarios `counter`, `remand`, `unsubstantiate` (F-0116-B): Bob answers with Islands up and picks, as a player would, the FIRST option that names the Bolt. Already in CI's Lab list (`spell-choices`), so no CI change.
- **Ledger**: `mechanics-lab-status.json` rows for Counterspell and Deflecting Swat (both in the corpus; PASSED); `MECHANICS_LAB_COVERAGE.md` regenerated. Remand, Unsubstantiate, Spellskite and Lightning Bolt are not corpus cards, so they have no rows.
- **Browser** (`match-spell-choices.spec.ts`, F-0116-C): step 2's target is chosen from "List choices" (opened by a real click), the button texts naming the Bolt are read in the "Every choice" window and must be exactly `["Lightning Bolt on the stack"]` (asserted at that moment), then the first is really clicked; the beam swing and the host's report window are asserted as before.

### Proofs (RUN)

- Worker gate `mvn -q -o test` with `-Dforge.res`: green, `SpellTargetOnceTest` 3 tests.
- `check-spell-choices.py`, all ten scenarios, three runs: all OK each time. Hidden checks over its traces (`check-snapshot-first`, `check-hidden-hands`, `check-hidden-log`, `check-kinds`, `check-hidden-mulligans`, `check-hidden-information`, `check-wording`, and the as-sent copies): all OK; `check-hidden-tops` exit 2 (nothing to check, allowed as in CI).
- **TEST-004, worker mutation 1** (the drop switched off): `spellskite`, `swat`, `counter`, `remand`, `unsubstantiate` all WRONG on the one-option check (each list was `Lightning Bolt` as `target:card:` first, then `Lightning Bolt on the stack`); `counter` and `remand` also WRONG on the outcome (the Bears died; the Bolt went to the graveyard, not back to hand) -- the spec's RUN table again; `unsubstantiate`'s outcome held, as the table says, and its offered-list check failed.
- **Worker mutation 2** (the spell entries dropped too): all five WRONG (no target question for the Bolt, or none naming it).
- **Real-click game** on the second local stack (1920x1080): passed twice on the fixed build, and once more under `node ci/ci-speed.mjs` (CPU 4x, after its CI neighbour `match-ring`): guest's list `["Lightning Bolt on the stack"]`, the beam swung to Spellskite, the host told "... changed your Lightning Bolt's target to Spellskite.".
- **Page-test bite**: the same game on a stack built with mutation 1 fails at the one-button assertion (received `["Lightning Bolt", "Lightning Bolt on the stack"]`). Its screenshot shows the owner's bug ("Two choices"); after the fix the window says "One choice" with the one button, matching option A on the canvas.

### Not done here

- Copy and gain-control cards (Fork, Commandeer) are not played, as Out of scope says; the trigger there stands.
