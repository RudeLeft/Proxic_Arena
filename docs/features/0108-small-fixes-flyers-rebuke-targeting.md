# 0108 — Small fixes: a flyer floats as one piece, a spell with nothing to target isn't lit, no "(Targeting: [[...]])" on the stack; the combat caption and the mill re-checked

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase. Phase 11 starts after 0108-0115 ship as 1.75.0.
**Owner decisions** (owner feedback batch 2026-11-19b, `Owner feedback 2026-11-19b decisions.md`; canvas `frontend/zz-canvas/feedback-1119b.html`):

- Items 8/9, canvas section "8 + 9" ("A fix, no choice"): **"Fix: the card, its tabs and its glow float as one."**
- Item 11, canvas section "11": **"Fix: a spell with no legal target isn't lit; clicking it says why."**
- Item 12, canvas section "12": **"Fix: strip it in the worker. `triggers.ts` `copiesOnStack` must then compare `targets`."**
- Item 2, canvas section "2": **"Remove."** (the top-left combat caption).
- Item 4, canvas section "4": "Film a mill 2 and a Thought Scour slowly before changing anything (no decision needed yet). **Likely cause found while building 0106 (commit 8a7c095e):** a board re-sent by each passed step (every 0.4 s) replayed its card moves, so a mill streamed up to four times. 0106 fixed it. Re-film after 0106 to confirm item 4 is closed."

- **Approved 2026-11-20** (owner, by prompt: "Approve all."). Build 0108 → 0115 in that order, one at a time, then release them together as 1.75.0. The defaults below were in the spec the owner approved and stand.

Research: `Owner feedback 2026-11-19b research A.md` items 2, 4, 8, 9 and `research B.md` items 11, 12 (in the working folder, outside the repo).

## Why (researched)

Research A read the repo at 61ce7fed (1.73.0), research B the 1.73.0 source with one Lab probe; both are re-read here against main 1f813795 (1.74.0) where 1.74.0 changed the answer.

- **The flyer's tab stays down** (SOURCE; SEEN in the owner's screenshot 5). The bob is `battlefield.css` `@keyframes bf-fly` / `bf-fly-bob` on `.bf-card.bf-fly` (and `.bf-fly-shadow`, `game.css` `.bf-breath.bf-fly`). In the `Board.tsx` card view, `.bf-tags` (Phase 10 A-17's tabs), each tab's glow (`Breath` `bf-breath-tag`), `PaySign`, the picked seal `.bf-marked-n` and `Sight`'s gold corners are siblings of the `.bf-card` button in the slot, with no bob. Mist Raven rises off its Sharpened Pitchfork tab.
- **The glow looks like a second card** (SOURCE, INFERENCE strongly held). `Breath.tsx` is mounted only while the card can be chosen (`breathes && <Breath …/>`). It gets the same `bf-fly` class and `animation-delay` (`Board.tsx` `breathStyle` → `hoverDelay`), but a CSS animation's clock starts when the element gets it: the card's at its arrival, the glow's at the moment it becomes choosable. Same delay, different start: the gold ring floats above or below the card. They agree only above `FLY_SYNC_AT` (12) flyers, where `breathMotion.ts` `bobInStep` puts every bob on one clock; `breathMotion.ts` copies other movements' `startTime` onto the glow but not the bob's.
- **Rebuke glows and does nothing** (RUN, research B's Lab probe: seat 1 with three Plains and Rebuke, nothing attacking). The priority question (`MatchController.chooseSpellAbilityToPlay`) offers what Forge's `Card.getAllPossibleAbilities(player, true)` returns, screened by `sa.checkRestrictions(player)` and `sa.canCastTiming(player)`; neither asks whether a target exists. Chosen, Forge's own casting finds no legal target and rolls the cast back; `chooseTargetsFor` is never asked, so no window opens; the worker marks it declined (`declined.add(lastOffered)`, `GameHost.noteDeclinedAction`) and a second click says only "It can't be cast right now." (`WhyNot.play` has no "no target" case). Forge has the test: `forge.game.spellability.TargetRestrictions.hasCandidates(SpellAbility)` (read with javap from the vendored jar); the worker uses it nowhere. Side effect: the false offer makes the stops rule (`PriorityStops`) think the player holds something playable.
- **"(Targeting: [[Butcher Ghoul]])"** (SOURCE: Forge bytecode; SEEN in screenshot 5). Forge's `WrappedAbility.getStackDescription(boolean)` appends `" (Targeting: " + sa.getAllTargetChoices() + ")"` for a non-charm trigger with targets (a Java list of lists, printed `[[Butcher Ghoul (65)]]`), and `" (" + getTriggerRemembered() + ")"` when the trigger remembers something (printed `([Goblin Token])`). `SpellAbilityEffect` adds a plain "(Targeting: X)" for some effects. The worker sends it as the stack entry's `description` (`ViewerSnapshot`: `PlainWords.humanise(String.valueOf(instance))` for stack items, `PlainWords.humanise(sa.getStackDescription())` for copies) and in `MatchController.selectTargets`' "on the stack: …" labels. The page's `triggers.ts` `stackWords` strips the card number, leading name, "->" and the trailing "[cause]", but not the clause; it shows on the stack plate (`Board.tsx` `bf-stack-said`), the leaving stack card, and the stack close-up's "Does" row (`GameScreen.tsx` stack inspect).
- **The trap** (SOURCE). `triggers.ts` `copiesOnStack` (the "Yes to all N" count, `TriggerWindows.tsx`) tells copies of a trigger apart by their words, and `triggers.test.ts`' fixture `"deal 1 damage (Targeting: [[Pat]])"` relies on the clause to count a differently aimed copy apart. `sameTrigger` already compares `targets`; `copiesOnStack` does not.
- **The combat caption is already gone** (SOURCE, main 1f813795). Spec 0107 (commit 4948cdbc, released in 1.74.0, owner confirmed 2026-11-19 "remove ALL fight captions") renders every fight caption mark `pa-visually-hidden` with `aria-live="polite"` (`Board.tsx` `FightMarkDrawn`, the `mark.kind === "caption"` class); `fights.ts` `captionOf` still writes the words for screen readers and the play log. Research A read 1.73.0, before 0107. Item 2 therefore needs no new build here, only the check below (F-0108-H).
- **The mill** (RUN in research A: Thought Scour's snapshot carried exactly two `library → graveyard` moves; SOURCE in 0106's As built). 0106 found that a step the game passes through (`match.ts` `MATCH_STEP`, every 0.4 s under the stops rule) re-sent the drawn board with its `moves` and the page replayed them, so Glimpse the Unthinkable's mill streamed four times; `GameScreen.tsx`'s board data now drops the moves of a board whose revision and `moves` are the ones already drawn (`again`). That is the likely cause of "a bunch"; it is not yet confirmed on the owner's own cards (EVID-004), hence F-0108-I.

## What the player sees

Alice is you (bottom), Bob the other player.

1. **A flyer with a tab** (canvas "8 + 9"). Bob's Mist Raven carries Sharpened Pitchfork. The Raven, the Pitchfork tab on its right edge and any gold corners on it rise and tilt together, every 5 s; the tab never leaves the card's edge. With 1 tab or 3, in a crowded row (lift only) or not.
2. **A glowing flyer** (canvas "8 + 9"). Alice is asked to choose a creature; her Chapel Geist (flying) can be chosen. Its gold ring hugs the card at every point of the bob, from the moment it lights up; there is no "second card" behind it.
3. **Rebuke with nothing attacking** (canvas "11", option A). Alice's main phase, three Plains untapped, Rebuke in hand. Rebuke is not lit. She clicks it: the menu says "Not now." and "There's no attacking creature to target." Nothing else happens, and the act button doesn't stop her for it. On Bob's turn, his Grizzly Bears attack: Rebuke lights up; she clicks it, the target window opens, she clicks the Bears, pays, and the Bears are destroyed. A spell with "up to one target", or a charm with another mode it can use, stays lit.
4. **Slayer of the Wicked's trigger** (canvas "12"). The stack card reads "When Slayer of the Wicked enters, you may destroy target Vampire, Werewolf, or Zombie." and ends there; the line and the gold corners show it is aimed at Butcher Ghoul. The same in the stack close-up, on a copied trigger, and on the target buttons of a "counter target ability" effect.
5. **"Yes to all"** keeps counting right: with seven Boggart Shenanigans triggers, five aimed at Bob and two at his creature, "Yes to all" counts the copies aimed the same way only, as before.
6. **Combat damage** (canvas "2"): no words at the top left; the dim, the slash, the "−2" and 16 going to 14, as today (1.74.0).
7. **Screeching Skaab mills 2** (canvas "4"): two cards leave Alice's library one after the other, each turns face up beside her plate and lands in her graveyard; the library goes down by one per card and the graveyard up by one per card. Thought Scour: two cards stream to Bob's graveyard, and Alice's draw flies to her hand.

## Changes

### Page (items 8/9)

- **One floating piece.** In the `Board.tsx` card view, the card button, its `Breath` glow, its `.bf-tags` (and the tabs' own glows), `PaySign`, the picked seal and `Sight`'s corners sit in one wrapper inside the slot; the wrapper carries `bf-fly` / `bf-fly-bob` and the card's `hoverDelay`, and the pieces inside no longer animate the bob on their own. The shadow (`.bf-fly-shadow`) stays on the table, outside the wrapper (it is the table's shadow of the flyer). `breathMotion.ts` `bobInStep` puts the wrappers in step above `FLY_SYNC_AT` as it does the cards today. Hit areas are unchanged: a click on the tab still opens the tab's card, a click on the card still clicks the card (TEST-003).
- `docs/architecture/BATTLEFIELD_RENDERING.md`: one line under the flyer bob, "the card, its glow, tabs and marks bob as one wrapper (spec 0108)".

### Worker (item 11)

- **The offer screen** (`MatchController.chooseSpellAbilityToPlay`'s loop). An ability is also left out when its own target step, or a required target step in its chain, has no candidates: `sa.usesTargeting()`, a minimum of at least one target, and `!sa.getTargetRestrictions().hasCandidates(sa)` (Forge's own answer, FORGE-RULE). Left offered as Forge does: a modal spell (a mode is chosen first; Izzet Charm with nothing to counter still has its other modes), an "up to" target (minimum zero), an Aura spell is screened the same way (its enchant target is Forge's target step). Every left-out ability goes to `unavailable` with its reason, as unpayable and timing-blocked ones do today, so the card shows unlit and its click opens the "Not now." menu (`GameScreen.tsx` `ActionPopup`, `gs-popup-why`).
- **The reason** (`WhyNot.play`): a no-target case, worded from Forge's target restriction description (`TargetRestrictions` / the ability's `ValidTgts` description as Forge prints it, e.g. "target attacking creature" → "There's no attacking creature to target."); when Forge's words can't be read that way, "There's nothing it can target right now." (canvas "11": "Not now: there's no attacking creature to target."). Never parsed from Oracle text (ARCH-006): the words come from Forge's own restriction text for the ability.
- **The stops rule** follows for free: `PriorityStops` already counts only what is offered.
- `docs/architecture/RULES_COVERAGE.md`: the offer row gains "and a required target exists (Forge `TargetRestrictions.hasCandidates`, spec 0108)".

### Worker (item 12)

- **One helper** (say `PlainWords.stackText`) used by `ViewerSnapshot`'s two description builders (stack items and copies) and by `MatchController.selectTargets`' "on the stack: …" labels: removes `\s*\(Targeting: …\)` including the nested-bracket form and the plain form, and Forge's trigger-remembered note when it is a raw Java list (`" ([…])"`), then trims. Default (in the approved spec; stands): the remembered note goes with the Targeting clause; both are raw code text (the wording rules' "no code words"), and the arrow and the stack's own marks carry the facts. The labels' "on the stack:" wording itself is renamed in spec 0113 (W1-003), not here.

### Page (item 12)

- `triggers.ts` `copiesOnStack` compares `targets` as `sameTrigger` does. `triggers.test.ts`' fixture loses its "(Targeting: [[Pat]])" text and keeps the two copies apart by `targets` alone. `stackWords` does not gain a strip (the worker's is the one source, research B option A); a guard test asserts no `description` in the page fixtures carries "Targeting:".

### Items 2 and 4

No change: checks only (F-0108-H, F-0108-I). If either check shows the problem still there, the builder stops and reports it (PHASE-003) rather than fixing it inside this spec.

## Rules and boundaries

- **FORGE-RULE, UI-001, ARCH-002:** whether a target exists is Forge's `hasCandidates`, asked in the worker; the page infers nothing. **UI-002:** a modal spell's other modes and "up to" targets stay reachable; nothing Forge would cast is hidden.
- **HID:** item 11 asks Forge's candidates for the player's own offer; `hasCandidates` looks at targets the player could legally choose, which are public or the player's own. A spell that can target a card in a hidden zone (a card in an opponent's hand is not a legal target unless revealed) is Forge's answer, unchanged. No new field leaves the worker. Item 12 removes text. No hidden-information guard is added, so no HID-004 bite is owed; F-0108-E still reads both seats' frames for the stripped text.
- **PROTO-006:** `copiesOnStack` stops depending on English words to tell copies apart (it uses `targets`), which removes a PROTO-006 smell.
- **Approved looks:** items 8/9 fix Phase 10 A-17's tabs and the flyer bob (CI 2026-11-03 "a flyer you can choose hovers too") to look as approved; no canvas change.

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0108-A | Page: a flyer with 1 and with 3 tabs, crowded and not, from a real snapshot: the card, glow, tabs, pay sign, seal and corners are inside the one bobbing wrapper; the shadow is outside; a click on a tab and on the card each do what they did | `fixes0108screen.test.tsx` (the real game screen, TEST-003) |
| F-0108-B | Browser: on `/dev/board` (Playwright on :8080), a flyer with a tab bobbing; it becomes choosable mid-bob. Over one 5 s bob, sampled ten times, the tab's and the glow's offset from the card stays within 1 px | `frontend/tools/jumps`-style measurement (one new bench scene); stills read |
| F-0108-C | Worker: Rebuke with nothing attacking is not offered and is in `unavailable` with "There's no attacking creature to target."; with an attacker it is offered and casts; an Aura spell with nothing to enchant not offered; Izzet Charm with nothing to counter and no small creature still offered (its draw mode); a "up to one target" spell offered | new Lab `check-no-target.py`, scenarios `rebuke-none`, `rebuke-attacker`, `aura-none`, `charm-other-mode`, `up-to-one`; worker unit for `WhyNot.play`'s words and fallback |
| F-0108-D | Worker: with only Rebuke in hand and nothing attacking, the stops rule makes no stop it would not make with an empty hand | `check-no-target.py` `rebuke-stops` |
| F-0108-E | Worker: no stack `description`, copy description or target label in any trace of the scenarios carries "Targeting:", "[[" or a "([" list, read from **both** seats' frames; Slayer of the Wicked's plate reads its trigger sentence whole | `check-no-target.py` `slayer` (Slayer of the Wicked aimed at a Zombie; a Stifle-style target of that trigger for the labels); worker unit for the helper (nested, plain, remembered forms) |
| F-0108-F | Page: `copiesOnStack` with two same-word copies aimed differently counts them apart; same aim counts them together | `triggers.test.ts` |
| F-0108-G | Real-click game (TEST-012), below | `match-small-fixes.spec.ts` |
| F-0108-H | Item 2 re-confirmed on 1.75.0's code: in the real-click game's combat damage, no visible element with class `bf-fight-caption` (the caption is in the DOM only as `pa-visually-hidden`); one still read | `match-small-fixes.spec.ts` step; still in As built |
| F-0108-I | Item 4: one normal-speed and one quarter-speed clip (TEST-013 3) of Screeching Skaab's mill 2 and of Thought Scour on the other player, from the seat whose library mills. Frame count: one stream per milled card (its back, then its face, is one card), the library count down by one per card, the graveyard up by one per card, and no repeat at the next passed step. Result recorded in As built; if it fails, stop and report (PHASE-003) | Lab replay through `frontend/tools/jumps` at quarter speed, or the real-click game's clip; `fixes0074.test.tsx` F-0074-B unchanged and green |

**TEST-004 (bites):** the tab moved back out of the wrapper (A and B fail); the glow given its own bob again (B fails); the `hasCandidates` screen removed (C, D fail); the no-target reason removed (C fails on the words); the "up to" exemption removed (C `up-to-one` fails); the helper skipped for copies (E fails); `copiesOnStack` comparing words only (F fails). About eight page and five worker mutations.

**Real-click game (TEST-012).** One game with spec 0098's exact deal: host (Alice) holds Rebuke and three Plains, guest (Bob) has Grizzly Bears and Mist Raven carrying Sharpened Pitchfork. (1) In the host's main phase Rebuke is not lit; the host **really clicks** it (`match-helpers.ts` `realClick` / `hitPoint`) and the menu shows "There's no attacking creature to target."; no question arrives. (2) On the guest's turn the guest **really clicks** to attack with the Bears; Rebuke lights for the host; the host really clicks it, then the Bears, then pays; the Bears go to the graveyard. (3) Combat damage on a later attack: no visible caption (F-0108-H). (4) The Raven's tab: the test reads the tab's and the card's boxes three times across a bob and asserts the gap is constant within 1 px. (5) The host plays Slayer of the Wicked aimed at a guest Zombie: both pages' stack plates have no "Targeting". The test waits on states (Rebuke's class, the question present, the graveyard count), never on an animation frame or a fixed short delay. Clip: one normal-speed clip per seat.

## Out of scope

- Any other wording on the stack plate or in "on the stack:" labels (spec 0113).
- The other non-window notices research A listed (the grey "Game" notice, TARGET/ATTACKING words on cards, "N attacking", the stack line): Phase 10 stragglers item 6, not this batch.
- A new mill look (research A's options A-C): only if F-0108-I fails, and then by a new owner decision.
- `ReturnMark`'s dead `kind: "tag"` (research A): maintenance, not this spec.

## Open questions

None. The default the owner approved with the spec stands: the trigger-remembered note "([…])" is stripped with the Targeting clause.

## Build order notes

First of the batch (0108 → 0115), smallest risk. Inside: item 12 (worker helper, `copiesOnStack`), then item 11 (offer screen, `WhyNot`, Lab), then items 8/9 (page), then the checks for items 2 and 4, then the real-click game.

## Amendments

None yet.
