# 0101 — Outcomes: survive statuses, "didn't happen", combat abilities

**Status:** Approved 2026-11-17 (owner, by prompt, deep dive 3). Phase 10.
**Built:** 2026-11-18 (commit 1a4b775). **Released:** in 1.73.0, 2026-11-19
**Owner decisions** (`Phase 10 deep dive 3 decisions.md`, all approved 2026-11-17):
combat Q6 **version 3 approved as shown** (seven survive rows; owner rule: "every survive status needs a badge and a graphic when used up"; every shield up about 0.15 s before the hit; a grey number rises) · missed Q3 **A** (shield counter: the silver shield cracks) · combat Q5 **A** (didn't happen: always 0074's grey crumble, never the resolved glow or a spark) · missed Q5 **A** (a countered ability crumbles, and a window to the ability's controller) · combat Q1 **A** (printed combat abilities as gold squares from the attack through damage, each popping as it works).

Canvases (untracked, `frontend/zz-canvas/`): `deep3-combat-outcomes-1117.html` ("Q6" rows 1-7, "Q5" option A both rows, "Q1" option A), `deep3-missed-1117.html` ("Q3" option A, "Q5" option A). Research: `Phase 10 deep dive 3.md` A3, A5, B1, B8, B9.

## Why (researched)

Researched at HEAD (4a5acfe, 1.72.0). Forge paths are under `spikes/forge-phase0a/forge-upstream/forge-game/src/main/java/forge/game/`. SOURCE / TRACE / INFERENCE as in EVID-001.

### Survive statuses

- **The worker reports four ways to survive** (SOURCE). Regenerated: `GameHost.java`, `on` (`GameEventCardRegenerated`). Indestructible: `Survivors.stoodDestroy` after a Destroy resolves (`GameHost.java` `spellResolved`, `Survivors.java` `stoodDestroy`) and `Survivors.heldLethal` after damage (`GameHost.java` `publishSnapshots`, `Survivors.java` `heldLethal`). Umbra: `Survivors.umbraSave` (`Survivors.java` `umbraSave`, `GameHost.java` `replacementChosen`). Prevented: `Survivors.isPrevention`/`preventing` (`Survivors.java` `isPrevention`, `preventing`; Forge's private `replaceDamageList` by reflection, `DAMAGE_LIST`). The snapshot carries `survived: [{card, how, by?}]` (`Survivors.java` `survivedJson`) and prevented hits in the damage wave as `{source?, target, amount: 0, prevented: N}` (`withPrevented`); the page reads them in `fromSnapshot.ts`, `survivedNow` in `boardFromSnapshot`.
- **Shield counters are not a survive kind** (SOURCE). Forge gives a card with a shield counter two replacements: damage (`PreventionEffect$ True`) and destroy (`ShieldCounter$ True`), both removing a shield counter (`card/Card.java`, `updateReplacementEffects`). The worker has no SHIELD handling (grep `SHIELD|ShieldCounter` in the worker: only regeneration's `getShieldCount` and `divideShield`). So a Murder stopped by a shield counter reports nothing; the badge (`COUNTER_KIND.SHIELD`, `CardBadges.tsx`) just ticks 1 → 0. A damage hit stopped by one probably shows as a generic prevented hit (INFERENCE: it should pass `isPrevention`; not traced). No Lab game has a shield counter (deep dive 3, D).
- **"Prevent the next N" has no badge** (SOURCE). Grep `prevent` in `ViewerSnapshot.java`/`Marks.java`: none. Forge keeps it as a command-zone effect with `ShieldAmount` (`ability/effects/DamagePreventEffect.java`, `addPreventNextDamage`) and answers the remaining amount per object: `GameEntity.getPreventNextDamageTotalShields()` (`GameEntity.java`, via `ReplacementHandler.getTotalPreventionShieldAmount`, `replacement/ReplacementHandler.java`), mirrored as `GameEntityView.getPreventNextDamage()` (`GameEntityView.java`).
- **Shield timing today** (SOURCE, `frontend/src/battlefield/survive.ts`, `umbra.ts`): the hex dome starts at blow −80 ms (`survive.ts` `domeMarks`), the pale shield at blow −120 (`wardMarks`), the green burst **at** the blow (`shieldBreakMarks`), the umbra shield at blow −650 (`umbra.ts` `umbraTimes`). A grey "0" rises only for prevention (`survive.ts` `wardMarks`, its `zero` riser); indestructible in a fight turns the "−N" gold (`Board.tsx`, `playFights`' `held` tone); regeneration, umbra and the destroy-path dome rise nothing.
- **Protection and ward have no "used" look** (SOURCE). Their squares are drawn in `marks.tsx` (protection `protectionShield`, ward `wardNumber` / `cardMarks`). The only pulse is `WHY_PULSE_MS` (`markMotion.ts`) when a spell fizzles against its target (`Board.tsx`, the stack-leave loop's fizzle branch, beside `fizzleWards`). Ward's trigger is a `BecomesTarget` trigger that counters via `Defined$ TriggeredSourceSA` (`card/CardFactoryUtil.java`, `addTriggerAbility`'s Ward branch): its stack entry has the warded card as `source` but does **not** target the spell (INFERENCE from the script); the countered card's move carries `counteredBy` = the warded creature (`GameHost.java` `graveFacts`, `Moves.java` `graveReason`).

### Didn't happen

- **The page knows "countered" only from a card move** (SOURCE). `fromSnapshot.ts` (`countered`, in `boardFromSnapshot`) builds `countered` from moves with `why === "countered"` out of the stack; 0074's crumble runs on `struckDown = !ret && !!s.card && countered.has(s.card)` (`Board.tsx`, the stack-leave loop's spec 0074 `struckDown` branch, `COUNTER_MS` in `graves.ts`, section "F · Struck by the beam"). An ability has no card, so a countered ability takes the resolved path: the gold glow (`RESOLVE_MS` 380, `Board.tsx`) and a spark to its targets (`Board.tsx`, the stack-leave loop's `sparks`, element `.bf-spark`).
- **Forge does not move a countered ability** (SOURCE). `CounterEffect.removeFromStack` (`ability/effects/CounterEffect.java`) calls `game.getStack().remove(si)` and moves nothing for an ability (its `tgtSA.isAbility()` branch); `MagicStack.remove` fires `GameEventSpellRemovedFromStack(sa)` (`zone/MagicStack.java`). The worker does not listen to it (grep: none). The COUNTER report (`ActionReports.java`, `kindOf`, moves in `relevant`) is built from stack card moves only, so a countered ability has no report either.
- **Time Stop** (SOURCE): `EndTurnEffect.java` (`resolve`) exiles every stack card, then `getStack().clear()` fires `GameEventSpellRemovedFromStack(null)` (`MagicStack.java`, `clear`). The exiled spells take the resolved path today (stragglers item 3; combat canvas Q5 "Today").
- **So the page cannot know an ability was countered today.** This spec has the worker say so (below): the page must not guess it from a stack entry vanishing (an ability that resolves vanishes the same way).

### Combat abilities

- 0085 marks printed keywords only for hexproof, shroud, protection and ward (`docs/features/0085-protection-marks-and-held-cards.md`, "As built (2026-11-13)", Page); printed first strike, double strike, deathtouch, trample, menace and lifelink show only when gained (`marks.tsx` `GAINED`). Their pictures already exist (`marks.tsx` `PICTURE`: first strike `firststrike`, double strike `doublestrike`, deathtouch `deathtouch`, trample `trample`, menace `menace`, lifelink `lifelink`).
- The snapshot already sends every current keyword (`keywords`, `ViewerSnapshot.java` `describe`; printed vs gained: `Marks.gained`, `Marks.java`) and the `phase` (`ViewerSnapshot.java` `of`). The damage wave (`CombatDamage.java`, class comment and `wave`) says `combat: "first-strike" | "regular"`, the `fights` (attacker, defender, blockers), lifelink `gains` (`gainedFrom`) and `deathtouch: true` per hit (`GameHost.java`, the damage branch of `on`). There is no trample field: a hit on the defending player by a blocked attacker is the trample excess.
- **Item 3 needs one small worker change**: which creatures the game offers as blockers is known only to the defender's declare-blockers decision (its candidates); the attacking player's page has no decision, so the worker also puts those candidate ids in both seats' snapshots (Decided 1).

## What the player sees

Alice is you (bottom), Bob the other player. Each row of the survive table is the coded scene "Bob's Lightning Bolt resolves on the creature" in the combat canvas, "Q6", rows 1-7.

1. **Survive statuses: a badge at rest, a graphic when used (combat Q6 v3; missed Q3 A).** Every shield shape is up about 0.15 s **before** the hit (regeneration's moves earlier than today), and every save shows a **grey number rising** from the card: 0 when nothing got through, or the damage it lived through.

   | Row | Badge at rest | When used (Bob's Bolt on your creature) | Grey number | New? |
   |---|---|---|---|---|
   | 1 Regeneration | the green-rimmed shield square | a green shield comes up over the card and takes the hit, then bursts; the badge bursts and goes; the creature taps | 3 | timing earlier, number new |
   | 2 Indestructible | the gold hexagon | the gold hex dome takes the hit; the hexagon pulses and stays (never used up) | 3 | pulse and number new on the destroy path |
   | 3 Shield counters | the grey-blue shield with its count | the silver (steel-blue) heater shield grows from the badge, takes the hit, cracks and shatters; the count ticks 2 → 1 (at 0 the badge goes); 0080's survived flash on the creature | 0 | all new (missed Q3 A: Bob's Murder on your shielded Serra Angel looks the same, no number) |
   | 4 Umbra armor | the Aura's side tab | the tab swings out into the gold shield with the umbra's picture, takes the hit, cracks and shatters; the Aura goes to the graveyard | 0 | number new |
   | 5 Protection from red | the protection square | the pale round shield soaks up the hit; the square pulses and stays | 0 | pulse new |
   | 6 Ward | the ward square with its cost (2) | the square flares and a ring pulses out from the creature as its trigger rises, and again as the trigger counters the spell, which crumbles to ash (item 2); if Bob pays the ward cost, the flare only (Decided 2) | 0 (none when the cost is paid) | flare, ring new |
   | 7 "Prevent the next 3 damage" | **new**: a pale round shield square with the number 3 | the pale round shield soaks up the hit; the number ticks 3 → 0 and the badge goes | 0 | all new |

   Bob gets no window for any of these (missed Q3 A: the table shows it).
   *As of 2026-11-18: the row 4 exception (spec 0089's umbra report window, still told to Bob) was removed 2026-11-18 (owner, "like the others"): no row gets a window (code: forge-worker/.../game/ActionReports.java, no UMBRA kind; GameHost.java, `replacementChosen` adds the survivor only).*
2. **One grey crumble for anything that didn't happen (combat Q5 A; missed Q5 A).** Your Prodigal Pyromancer aims 1 damage at Bob's Llanowar Elves; Bob Stifles it. Stifle's beam strikes the ability, which turns grey and crumbles to ash where it is: no gold glow, no spark at the Elves. **You** get the report window: "Bob countered Prodigal Pyromancer's ability with Stifle." (the controller of the countered ability; Bob gets none). Second scene: your Lightning Bolt waits on the stack when Bob casts Time Stop: the Bolt crumbles the same way and goes to your Exile tile (0099 Amendment 1). Its window is 0102 item 3's "Bob ended the turn" line, not a second one. The same crumble for a spell countered by ward (row 6), and for a fetch land's search or Solemn's death trigger stifled.
3. **Printed combat abilities in combat (combat Q1 A; combat canvas "Q1", option A).** Bob attacks with Vampire Nighthawk (flying, deathtouch, lifelink), Boggart Brute (menace) and Colossal Dreadmaw (trample). As attackers are declared, gold squares pop on for the printed deathtouch, lifelink, menace and trample on the attackers, and first strike on your Benalish Knight (a creature the game offers you as a blocker). They stay while blockers are chosen and through damage, each **popping as it works**: first strike as the first-strike damage lands, deathtouch as it kills the Knight, lifelink as Bob's +2 rises, trample as the excess hits you, menace when a single blocker is refused. They go when combat ends. Flying is left out (the card already hovers). Gained ones (0085) are unchanged.

House rules: the one new window is item 2's, to the countered ability's controller (the other player of the countering action); no pills; rising numbers; no "Forge" in player text.

## Changes

### Worker

- **Item 1, row 3 (shield counters).** `Survivors`: a new kind `shield` when a Destroy or DamageDone replacement whose overriding ability removes a SHIELD counter runs on a card (Forge's own replacement, `Card.java` `updateReplacementEffects`; detect it the way `umbraSave` and `isPrevention` already read the replacement, `Survivors.java`). A damage hit stopped by a shield counter reports `{..., prevented: N, by: "shield"}` instead of a generic prevented hit.
- **Item 1, row 7 (prevent the next N).** `ViewerSnapshot`: `preventNext: n` on a card and on a player entry when `getPreventNextDamageTotalShields()` > 0 (or the view's `getPreventNextDamage()`). A hit soaked by it: `by: "prevent-next"`.
- **Item 1, row 6 (ward).** The ward trigger's stack entry gets `ward: true` (the trigger's keyword origin, `Keyword.WARD`), so the page does not recognise ward by text or by card (UI-005, PROTO-006).
- **Item 2.** `GameHost` listens to `GameEventSpellRemovedFromStack` (`MagicStack.java` `remove`, `clear`). When a stack entry leaves without resolving — during a Counter (`ApiType.Counter`) or an end-the-turn (`ApiType.EndTurn`) resolution — the next snapshot lists it: `left: [{stack: "stack:N", why: "countered" | "ended", by?: "card:N"}]`. A spell keeps its card move too (unchanged). **This is how the page knows an ability was countered when no card moves.**
- **Item 2's window.** `ActionReports`: the COUNTER report also covers a countered ability (picture: the ability's source card as on the stack; words "<Actor> countered <Card>'s ability with <Spell>."). It goes to the countered ability's controller when that is not the actor (today COUNTER is `reader != actor`, `ActionReports.java` `tells`; an ability's report narrows that to its controller, matching the decision "a window to the ability's controller").
- **Item 3.** While blockers are being declared, the snapshot carries `blockerCandidates: ["card:N", ...]`, the same ids the defender's declare-blockers decision offers (PROTO-001), for every viewer (Decided 1). Which creatures may block is public (every player sees the board); nothing hidden is added.

### Protocol

`protocol/README.md` and `match.ts`: `survived.how: "shield"`, hit `by`, card/player `preventNext`, stack entry `ward`, snapshot `left`, `blockerCandidates`. All optional.

### Server

None.

### Page

- `survive.ts` / `umbra.ts`: one shared lead: every shield shape fully up at blow −150 ms (regeneration's burst moves earlier; the umbra keeps its unfold but its shield is up at −150); a grey number rises for every save (0, or the damage on the hit). New looks: the silver shield (crack, shatter, count ticks; 0080's flash), the protection square pulse, the ward flare + ring at the trigger's rise and at the counter, the prevent-N badge (new mark in `marks.tsx`/`CardBadges.tsx`) and its tick.
- `fromSnapshot.ts`: `countered` also takes `left` entries (by stack id, not card id), so `Board.tsx`'s stack-leave loop (over `before.stack`, crumble branch `struckDown`) plays the crumble for an ability or a Time Stop exile instead of the resolved glow and spark.
- Item 3: `marks.tsx` shows the printed combat keywords (first strike, double strike, deathtouch, trample, menace, lifelink) while the snapshot's `phase` is a combat step from declare attackers to end of combat, on the attackers and on `blockerCandidates` (the creatures the game offers as blockers; Decided 1); each pops (`markMotion.ts` pulse) on its moment, read from the damage wave and the block result. Reduce motion: squares appear and go without pops.

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0101-A | Worker: Murder on a creature with a shield counter → `survived how:"shield"`; damage on it → hit `by:"shield"`; a "prevent the next 3" effect → `preventNext: 3`, then 0 after a 3-damage hit; ward trigger `ward: true` | worker unit; new Lab script `check-survive-rows.py` (shield counter, prevent-next, ward, plus the existing `check-survivors.py` rows) 3 times |
| F-0101-B | Worker: Stifle on a Pyromancer ping → `left [{stack, why:"countered"}]`, a COUNTER report to the ability's controller only; Time Stop → `why:"ended"` for every stack entry; both seats | worker unit; new Lab `check-didnt-happen.py` 3 times; hidden checks over its traces |
| F-0101-C | Page: each of the seven rows: shield up at blow −150 ms ±1 frame, the grey number, the badge's end state (gone / stays / ticks) | `fixes0101.test.tsx` (real Board) |
| F-0101-D | Page: a `left` countered ability plays the crumble and **no** spark element; a resolved ability still sparks | `fixes0101.test.tsx` |
| F-0101-E | Page: printed deathtouch on an attacker shows from declare attackers, pops on the deathtouch hit, gone at end of combat; printed first strike shows on a blocker candidate and not on a creature that is not one (a tapped one); outside combat not shown; gained ones unchanged | `fixes0101.test.tsx` |
| F-0101-F | Real game (TEST-012), below | `match-outcomes.spec.ts` |
| F-0101-G | No new jumps on survivors-*, combat-choices-*, card-actions-counter, thrown-away-countered and the new traces, both seats | jump check on those (TEST-013 1) |

**TEST-004 (bites):** one per row (C counts as seven), one each for `shield`, `preventNext`, `left`, the window's reader.

**Real-click game (TEST-012).** One game with 0098's deal: the host attacks with a printed-deathtouch creature and the guest **really clicks** a first-strike creature to block; both pages check the squares appear at declare attackers and are gone after combat. The host activates Prodigal Pyromancer at the guest's creature and the guest **really casts** Stifle on it; the host's page shows the crumble, no spark, and the window; the guest's page no window. The guest Murders a host creature with a shield counter (dealt with one, e.g. a shield-counter card in the deck): the silver shield and the grey 0 on both pages. Clips: one normal-speed clip per row (seven, Alice's seat), one for the Stifle (Bob's seat), one for combat (Alice's seat).

## Risks

- **Hidden information.** `left` lists only stack entries the viewer saw (stack ids are public); `preventNext` is public (the effect was announced). A face-down creature's shield or prevention badge shows like any counter on it today. Hidden checks over the new traces from both seats.
- **Speed.** Combat is the tightest budget: `scriptMsPerSecond4x combat 88` (`frontend/e2e/match-speed.spec.ts`, `SPEED_BUDGETS`), and 0096's 70 ms/s target is still unmet (efficiency phase item). Item 3 adds squares to every attacker and possible blocker for the whole combat: measure `match-speed.spec.ts` and `match-big-combat.spec.ts` before and after; the pops must be compositor-only.
- **Jump check.** None new expected: the badges are marks, not cards; the silver shield and ring are overlays.
- **Two "survived" sources.** A creature with both indestructible and a shield counter facing Murder: Forge applies the shield replacement first (the counter is removed; indestructible never matters). Show only what Forge reports (`shield`), never both.

## Decided 2026-11-17 (owner, by prompt, via the coordinator)

1. **Combat squares go on the attackers and on the creatures the game offers as blockers** (the declare-blockers decision's candidates), never on a list the page works out (UI-001). The worker sends those candidate ids to both seats (worker change, item 3).
2. **Ward when its cost is paid: the flare only.** Nothing is countered, so no ring at the counter, no crumble and no grey number.

## Build order notes

Second of the four (after 0100), because item 2 changes the same stack-leave loop (`Board.tsx`, over `before.stack`) that 0100 item 8 (the swing) and 0102 item 3 (Time Stop) rely on. Inside: worker `left` + report first, then the crumble for abilities (smallest page change), then the seven rows (one shared lead in `survive.ts` first, then each row), then combat squares last (speed measurement).

## As built (2026-11-18, uncommitted)

Built on main at 8db8ff1. "RUN" = run here on this tree; "SOURCE" = read from the code (EVID-001). Worker paths are under `forge-worker/src/main/java/net/barnflix/proxic/worker/game/`, page paths under `frontend/src/battlefield/`.

*As of 2026-11-18 (a documentation check): committed as 1a4b775 (on 379bc4e); 0102 and 0103 moved the code since. The "Why" and "Changes" sections are the research, of 4a5acfe (code: `git log 1a4b775`).*

### Where each item is

| Item | Worker | Page |
|---|---|---|
| Shared lead, grey number | (nothing new) | `survive.ts` `SHIELD_UP_MS` 150 (every shape fully up 150 ms before the blow, `SHAPE_IN_MS` 120 to come up, `shapeStart`); `greyNumber`, `numberPoint`; dome and pale shield re-timed (`domeMarks`, `wardMarks`); umbra `umbra.ts` `SHIELD_LEAD_MS` = unfold 550 + 150. A survivor's red "−N" and crack are replaced by the grey number (`Board.tsx` `lived`; in a fight `Board.tsx` the strike number turns grey, was gold) |
| Row 1 regeneration | (unchanged) | green shield over the card `regenShieldMarks` (`survive.ts`), bursts 350 ms after the blow with green sparks; 0080's badge burst; grey number = damage on this board (`Board.tsx` survive effect, the `useLayoutEffect` gated on `playedSurvive`) |
| Row 2 indestructible | (unchanged) | dome fully up at −150; the hexagon square pulses at the blow (`pulseSquare`, `Board.tsx`, called from the survive effect's `indestructible` branch); grey number (3 for a Bolt, 0 for a Murder) |
| Row 3 shield counters | `Survivors.shieldSave` (`Survivors.java`, the destroy replacement's `ShieldCounter` parameter) -> `survived how:"shield"` (`GameHost.java` `replacementChosen`); `Survivors.preventedBy` (overriding RemoveCounter of a Shield counter) -> the prevented hit's `by:"shield"` (`Survivors.java` `withPrevented`) | silver heater shield `silverShieldMarks` (`survive.ts`; `UmbraShield tone="silver"`), cracks at the blow, shatters 550 ms after (silver shards); the SHIELD badge pops at blow+100 (its count ticks on 0078's clock); grey 0 on a hit (`Board.tsx`, the damage effect's `wards` pass, fights `playFights`' `stoppedBy`); no number on the destroy path (`Board.tsx`, the survive effect's `shield` branch) |
| Row 4 umbra | (unchanged) | shield whole at −150 after its unfold; grey 0 as it shatters (`Board.tsx`, the survive effect's umbra branch) |
| Row 5 protection | (unchanged) | pale shield up at −150; the protection square pulses at the blow on a prevented hit with no `by` (spell `Board.tsx`, the damage effect's `wards` pass, fight `playFights`; the fizzle path's pulse is 0085's); grey 0 |
| Row 6 ward | stack entry `ward: true` (`ViewerSnapshot.java` `of`, `Polish.isWard` `Polish.java`: the trigger's `Keyword.WARD` origin) | `wardsThen` effect (`Board.tsx`): a ward entry rising -> its creature's ward square flares (`wardFlareFrames`) and a ring (`wardRingMarks`, `survive.ts`); leaving -> flare, and when `left` names the creature as `by` a second ring + grey 0 at +450; paid (nothing left): the flare only (Decided 2). The countered spell crumbles struck by the ward trigger's beam (`Board.tsx`, the stack-leave loop's `wardBy`) |
| Row 7 prevent the next N | `preventNext` on a battlefield card (`ViewerSnapshot.java` `describe`) and a player (`of`), from `GameEntityView#getPreventNextDamage`; a soaked hit `by:"prevent-next"` | new square `PreventSquare` (`CardBadges.tsx`): pale round shield with N; used (`fromSnapshot.ts` `withOutcomes` -> `preventUsed`), each count shows in turn (`PREVENT_TICK_AT_MS` 430, 100 ms a step) and at 0 the square goes (CSS, compositor-only); pale shield up at −150; grey 0; *as of 2026-11-18 (a documentation check): a stack compares `preventNext`, so a shielded card stands apart from its twins (spec 0036; `layout.ts:433`, commit 01c8ccc)* |
| Item 2 didn't happen | `StackLeft.java` (new) + `GameHost.stackLeft` (`GameHost.java`): entries removed while a Counter or EndTurn part resolves -> `left [{stack, why, by}]`, only ids a board showed (`GameHost.java` `publishSnapshots`); `ActionReports.abilityCountered`, kind `COUNTER_ABILITY`, "Bob countered Prodigal Pyromancer's ability with Stifle." (`abilityCounteredWords`), told to the ability's controller only (`tells`) | `fromSnapshot.ts` `boardFromSnapshot`: `left` stack ids join `countered` (+ `leftBy`); `Board.tsx` `struckDown` also by stack id: crumble, no glow, no spark; an ability ticks no pile; Time Stop's Bolt crumbles where it is and goes to its exile tile (`departures`) |
| Item 3 combat squares | `blockerCandidates` (`CombatChoices.candidatesJson`, the decision's own `offered` test), between GameEventAttackersDeclared and GameEventBlockersDeclared (`GameHost.java` `stackLeft`, `publishSnapshots`), every viewer | `fromSnapshot.ts` `COMBAT_STEPS` + `withOutcomes` (`inCombat`: attacking, blocking or a candidate); `marks.tsx` `cardMarks` printed first strike, double strike, deathtouch, trample, menace, lifelink (never flying) as `kw:` squares (`combat: true`); they pop on (`combatPopFrames`, `markMotion.ts`; no riser, `Board.tsx`, the risers' `m.combat` branch); `popCombatSquares` (`Board.tsx`): first/double strike at the first-strike wave, deathtouch on its hit, lifelink on the gain, trample when a blocked attacker's damage reaches the player; gone after end of combat (0085's shrink) |

Protocol: `protocol/README.md` (`survived.how "shield"`, `left`, `blockerCandidates`, `card.preventNext` (and players), stack `ward`, hit `by`, action `COUNTER_ABILITY`); `frontend/src/match.ts`. Server: no change. CI: `survive-rows` and `didnt-happen` added to the Lab list; the outcomes deck package built (`protocol/fixtures/outcomes-deck`, `Test Deck/outcomes-deck.zip` built locally as 0100's was).

### Tests and results (RUN, this tree)

- Worker `mvn -q -o test`: pass. New: `ActionReportsTest.aCounteredAbilityIsToldToItsControllerOnly`, `SurvivorsTest.aShieldCounterOrPreventNextSaysWhatStoppedTheHit`, `SurvivorsTest.entriesThatLeftAreToldOnceAndOnlyWhenShown`.
- Lab, new `scripts/check-survive-rows.py` (shield-murder, shield-bolt, prevent-next, ward, ward-paid, blockers) and `scripts/check-didnt-happen.py` (stifle, time-stop), x3: every scenario OK every run (run 1 inside the full list below).
- Whole ci.yml Lab list locally (69 scripts, 3 at a time, before main moved to 379bc4e): 69/69 exit 0 at the first go, no retries.
- Hidden checks over the whole list's 379 traces: snapshot-first, hidden-hands, hidden-log, kinds, hidden-mulligans OK; hidden-tops `problems: []`; questions-asked summarised. Over the new scripts' own 24 traces (3 runs): the same OK (hidden-tops exit 2 there: nothing of its kind in those games, as CI accepts).
- Page: `fixes0101.test.tsx` (14: the seven rows each with the shield up at blow −150 ms within a frame, the grey number and the badge's end state; ward paid; the countered ability crumbling with no spark and a resolved one sparking; `left` in fromSnapshot; printed squares from declare attackers on an attacker and a blocker candidate, not on a non-candidate, not outside combat, gained unchanged, the pop on the deathtouch hit). `fixes0080`/`fixes0089` updated for the approved timing (dome start, the fight number grey, umbra 0.15 s). Whole vitest 1528/1528; tsc, eslint (whole frontend, 0 warnings), prettier pass.
- Real-click game (TEST-012) `frontend/e2e/match-outcomes.spec.ts`, headless bundled: pass (2.6 min). The host really attacked with Typhoid Rats and the guest really clicked Youthful Knight to block: deathtouch on the Rats and first strike on the Knight on both pages as the attack was declared, none after combat. The host pinged the Knight, the guest really cast Stifle: the ping crumbled on both pages, no spark at the Knight, the host's window "Pat countered Prodigal Pyromancer's ability with Stifle.", the guest none. The guest really cast Murder at the host's Wingshield Agent: the silver shield on both pages, the Agent stayed.
- Mutations (TEST-004): page 18/18 caught (one per row, the shared lead, ward paid, the crumble, `left`, the combat squares' steps, candidates, pops, no riser). Worker 8/8 caught (W1 the window's reader, W2 Counter not recognised, W3 the `left` shown-ids guard (HID), W4 shield survivor, W5 prevent-next, W6 ward, W7 the candidates' window, W8 preventNext).
- Jump check over survive-rows-*, didnt-happen-*, survivors-*, wipes-*, combat-choices-*, card-actions-counter, thrown-away-countered and game-flow-umbra (41 traces, both seats): no problem found (every kind of move listed with boards only).
- Clips and stills: `scratchpad/b0101/clips/` (CLIPS.txt lists each clip's video, time range and what it shows; stills `<clip>-at250/420/650.png`). The clip tool was a temporary copy of 0100's, removed.

### Open (not done, or not proven)

- **Row 7's tick timing** is fixed on the page (from 430 ms after the board, 100 ms a step), not read from the blow; right for a resolving spell, early or late for other blows.
- **Row 3's count tick** plays on 0078's badge clock; the badge pops at blow+100. "0080's survived flash" was read as that pop (the v3 canvas row shows no other flash).
- **Shared lead reading**: the spec's Changes say "fully up at blow −150"; the canvas starts each shape at about −150. Built as the spec words (fully up at −150, up over 120 ms before that), as F-0101-C tests.
- **Regeneration in a fight**: its green shield plays on the survive effect's clock, not the fight's strike.
- **W3 (HID-004)**: the `left` shown-ids guard was caught by a unit test only; no Lab game removes an entry no board showed, so it has not fired in a game.

### Not built (no approved look / no data)

On the coordinator's stragglers list (2026-11-18):

- **Menace's pop when a single blocker is refused** (combat Q1): the refusal reaches only the defender's decision (`refused`), not the damage wave the pops read. The other pops (first/double strike, deathtouch, lifelink, trample) are built.
- **A "prevent the next N" badge on a player** (row 7): the worker sends `preventNext` on players, but the approved canvas shows only the creature's square.

### Fixed while finishing: a false "countered" window (pre-existing, coordinator 2026-11-18)

- **Cause** (SOURCE + RUN): Forge moves a resolved spell's card off the stack after GameEventSpellResolved, with the stack still resolving and the spell still its top entry (`MagicStack#finishResolving`: `removeCardFromStack`, then `remove(si)`). ActionReports' `noteResolving` took that move as the start of a new effect under the same spell. After Stifle resolved, `resolving` was Stifle again. The next permanent spell's move onto the battlefield was gathered under it, and that spell was told as countered. The real-click game showed the host "Pat countered your Wingshield Agent.".
- **Fix**: `ActionReports.justResolved` holds the entry that last resolved, set after its report (`ActionReports.java` `on`). `noteResolving` starts a new effect only for a different top entry (`startsResolving`). A spell is told countered only from moves made while the countering effect itself resolves.
- **Test**: `ActionReportsTest.aCounterspellsOwnMoveAfterItResolvedStartsNoNewReport`. With the old rule restored (`top != null`) it fails (RUN); with the fix it passes. `match-outcomes.spec.ts` now asserts that neither page gets a "countered your Wingshield Agent" window. Before the fix the same game showed one to the host; after it, none (RUN).
- **Re-run after the fix**: worker `mvn -q -o test` pass. `check-survive-rows.py` and `check-didnt-happen.py` x1 OK, with the hidden checks over their traces OK (hidden-tops `problems: []`). The real-click game passed (1.1 min, stack rebuilt). tsc, eslint and prettier pass, and vitest is 1528/1528.
