# 0101 — Outcomes: survive statuses, "didn't happen", combat abilities

**Status:** Approved 2026-11-17 (owner, by prompt, deep dive 3). Phase 10.
**Owner decisions** (`Phase 10 deep dive 3 decisions.md`, all approved 2026-11-17):
combat Q6 **version 3 approved as shown** (seven survive rows; owner rule: "every survive status needs a badge and a graphic when used up"; every shield up about 0.15 s before the hit; a grey number rises) · missed Q3 **A** (shield counter: the silver shield cracks) · combat Q5 **A** (didn't happen: always 0074's grey crumble, never the resolved glow or a spark) · missed Q5 **A** (a countered ability crumbles, and a window to the ability's controller) · combat Q1 **A** (printed combat abilities as gold squares from the attack through damage, each popping as it works).

Canvases (untracked, `frontend/zz-canvas/`): `deep3-combat-outcomes-1117.html` ("Q6" rows 1-7, "Q5" option A both rows, "Q1" option A), `deep3-missed-1117.html` ("Q3" option A, "Q5" option A). Research: `Phase 10 deep dive 3.md` A3, A5, B1, B8, B9.

## Why (researched)

Line numbers at HEAD (4a5acfe, 1.72.0). Forge paths are under `spikes/forge-phase0a/forge-upstream/forge-game/src/main/java/forge/game/`. SOURCE / TRACE / INFERENCE as in EVID-001.

### Survive statuses

- **The worker reports four ways to survive** (SOURCE). Regenerated: `GameHost.java:1071-1076` (`GameEventCardRegenerated`). Indestructible: `Survivors.stoodDestroy` after a Destroy resolves (`GameHost.java:1223-1224`, `Survivors.java:271-311`) and `Survivors.heldLethal` after damage (`GameHost.java:1493-1494`, `Survivors.java:323-327`). Umbra: `Survivors.umbraSave` (`Survivors.java:167-177`, `GameHost.java:1177-1182`). Prevented: `Survivors.isPrevention`/`preventing` (`Survivors.java:180-189`, 246-265; Forge's private `replaceDamageList` by reflection, 207-219). The snapshot carries `survived: [{card, how, by?}]` (`Survivors.java:92-107`) and prevented hits in the damage wave as `{source?, target, amount: 0, prevented: N}` (116-150); the page reads them at `fromSnapshot.ts:843-857`.
- **Shield counters are not a survive kind** (SOURCE). Forge gives a card with a shield counter two replacements: damage (`PreventionEffect$ True`) and destroy (`ShieldCounter$ True`), both removing a shield counter (`card/Card.java:7032-7045`). The worker has no SHIELD handling (grep `SHIELD|ShieldCounter` in the worker: only regeneration's `getShieldCount` and `divideShield`). So a Murder stopped by a shield counter reports nothing; the badge (`COUNTER_KIND.SHIELD`, `CardBadges.tsx:93`) just ticks 1 → 0. A damage hit stopped by one probably shows as a generic prevented hit (INFERENCE: it should pass `isPrevention`; not traced). No Lab game has a shield counter (deep dive 3, D).
- **"Prevent the next N" has no badge** (SOURCE). Grep `prevent` in `ViewerSnapshot.java`/`Marks.java`: none. Forge keeps it as a command-zone effect with `ShieldAmount` (`ability/effects/DamagePreventEffect.java:122-169`) and answers the remaining amount per object: `GameEntity.getPreventNextDamageTotalShields()` (`GameEntity.java:153-154`, via `ReplacementHandler.getTotalPreventionShieldAmount`, `replacement/ReplacementHandler.java:886-920`), mirrored as `GameEntityView.getPreventNextDamage()` (`GameEntityView.java:56-61`).
- **Shield timing today** (SOURCE, `frontend/src/battlefield/survive.ts`, `umbra.ts`): the hex dome starts at blow −80 ms (`survive.ts:90-118`), the pale shield at blow −120 (139-148), the green burst **at** the blow (205, 213), the umbra shield at blow −650 (`umbra.ts:57-58`). A grey "0" rises only for prevention (`survive.ts:159-175`); indestructible in a fight turns the "−N" gold (`Board.tsx:5367`); regeneration, umbra and the destroy-path dome rise nothing.
- **Protection and ward have no "used" look** (SOURCE). Their squares are drawn in `marks.tsx` (protection 216-241, ward 93-96 / 132-137). The only pulse is `WHY_PULSE_MS` (`markMotion.ts:109-110`) when a spell fizzles against its target (`Board.tsx:7529-7541`). Ward's trigger is a `BecomesTarget` trigger that counters via `Defined$ TriggeredSourceSA` (`card/CardFactoryUtil.java:1990-2010`): its stack entry has the warded card as `source` but does **not** target the spell (INFERENCE from the script); the countered card's move carries `counteredBy` = the warded creature (`GameHost.java:1314-1318`, `Moves.java:116-118`).

### Didn't happen

- **The page knows "countered" only from a card move** (SOURCE). `fromSnapshot.ts:748-750` builds `countered` from moves with `why === "countered"` out of the stack; 0074's crumble runs on `struckDown = !ret && !!s.card && countered.has(s.card)` (`Board.tsx:7409`, branch 7406-7477, `COUNTER_MS` in `graves.ts:308-318`). An ability has no card, so a countered ability takes the resolved path: the gold glow (`RESOLVE_MS` 380, `Board.tsx:1841`) and a spark to its targets (`Board.tsx:7673-7692`, element 9172-9185).
- **Forge does not move a countered ability** (SOURCE). `CounterEffect.removeFromStack` (`ability/effects/CounterEffect.java:247-307`) calls `game.getStack().remove(si)` (258) and moves nothing for an ability (270-272); `MagicStack.remove` fires `GameEventSpellRemovedFromStack(sa)` (`zone/MagicStack.java:763-767`). The worker does not listen to it (grep: none). The COUNTER report (`ActionReports.java:1022`, moves at 1060-1066) is built from stack card moves only, so a countered ability has no report either.
- **Time Stop** (SOURCE): `EndTurnEffect.java:43` exiles every stack card, then `getStack().clear()` (46) fires `GameEventSpellRemovedFromStack(null)` (`MagicStack.java:997`). The exiled spells take the resolved path today (stragglers item 3; combat canvas Q5 "Today").
- **So the page cannot know an ability was countered today.** This spec has the worker say so (below): the page must not guess it from a stack entry vanishing (an ability that resolves vanishes the same way).

### Combat abilities

- 0085 marks printed keywords only for hexproof, shroud, protection and ward (`docs/features/0085-protection-marks-and-held-cards.md:60-63`); printed first strike, double strike, deathtouch, trample, menace and lifelink show only when gained (`marks.tsx` `GAINED`, 63-74). Their pictures already exist (`marks.tsx`: first strike 357, double strike 374, deathtouch 391, trample 315, menace 409, lifelink 346).
- The snapshot already sends every current keyword (`keywords`, `ViewerSnapshot.java:1056-1078`; printed vs gained: `Marks.gained`, `Marks.java:77-96`) and the `phase` (`ViewerSnapshot.java:106`). The damage wave (`CombatDamage.java:8-31, 91-107`) says `combat: "first-strike" | "regular"`, the `fights` (attacker, defender, blockers), lifelink `gains` (`gainedFrom` 66-78) and `deathtouch: true` per hit (`GameHost.java:818-820`). There is no trample field: a hit on the defending player by a blocked attacker is the trample excess.
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
2. **One grey crumble for anything that didn't happen (combat Q5 A; missed Q5 A).** Your Prodigal Pyromancer aims 1 damage at Bob's Llanowar Elves; Bob Stifles it. Stifle's beam strikes the ability, which turns grey and crumbles to ash where it is: no gold glow, no spark at the Elves. **You** get the report window: "Bob countered Prodigal Pyromancer's ability with Stifle." (the controller of the countered ability; Bob gets none). Second scene: your Lightning Bolt waits on the stack when Bob casts Time Stop: the Bolt crumbles the same way and goes to your Exile tile (0099 Amendment 1). Its window is 0102 item 3's "Bob ended the turn" line, not a second one. The same crumble for a spell countered by ward (row 6), and for a fetch land's search or Solemn's death trigger stifled.
3. **Printed combat abilities in combat (combat Q1 A; combat canvas "Q1", option A).** Bob attacks with Vampire Nighthawk (flying, deathtouch, lifelink), Boggart Brute (menace) and Colossal Dreadmaw (trample). As attackers are declared, gold squares pop on for the printed deathtouch, lifelink, menace and trample on the attackers, and first strike on your Benalish Knight (a creature the game offers you as a blocker). They stay while blockers are chosen and through damage, each **popping as it works**: first strike as the first-strike damage lands, deathtouch as it kills the Knight, lifelink as Bob's +2 rises, trample as the excess hits you, menace when a single blocker is refused. They go when combat ends. Flying is left out (the card already hovers). Gained ones (0085) are unchanged.

House rules: the one new window is item 2's, to the countered ability's controller (the other player of the countering action); no pills; rising numbers; no "Forge" in player text.

## Changes

### Worker

- **Item 1, row 3 (shield counters).** `Survivors`: a new kind `shield` when a Destroy or DamageDone replacement whose overriding ability removes a SHIELD counter runs on a card (Forge's own replacement, `Card.java:7032-7045`; detect it the way `umbraSave` and `isPrevention` already read the replacement, `Survivors.java:167-189`). A damage hit stopped by a shield counter reports `{..., prevented: N, by: "shield"}` instead of a generic prevented hit.
- **Item 1, row 7 (prevent the next N).** `ViewerSnapshot`: `preventNext: n` on a card and on a player entry when `getPreventNextDamageTotalShields()` > 0 (or the view's `getPreventNextDamage()`). A hit soaked by it: `by: "prevent-next"`.
- **Item 1, row 6 (ward).** The ward trigger's stack entry gets `ward: true` (the trigger's keyword origin, `Keyword.WARD`), so the page does not recognise ward by text or by card (UI-005, PROTO-006).
- **Item 2.** `GameHost` listens to `GameEventSpellRemovedFromStack` (`MagicStack.java:763-767`, 997). When a stack entry leaves without resolving — during a Counter (`ApiType.Counter`) or an end-the-turn (`ApiType.EndTurn`) resolution — the next snapshot lists it: `left: [{stack: "stack:N", why: "countered" | "ended", by?: "card:N"}]`. A spell keeps its card move too (unchanged). **This is how the page knows an ability was countered when no card moves.**
- **Item 2's window.** `ActionReports`: the COUNTER report also covers a countered ability (picture: the ability's source card as on the stack; words "<Actor> countered <Card>'s ability with <Spell>."). It goes to the countered ability's controller when that is not the actor (today COUNTER is `reader != actor`, `ActionReports.java:1524`; an ability's report narrows that to its controller, matching the decision "a window to the ability's controller").
- **Item 3.** While blockers are being declared, the snapshot carries `blockerCandidates: ["card:N", ...]`, the same ids the defender's declare-blockers decision offers (PROTO-001), for every viewer (Decided 1). Which creatures may block is public (every player sees the board); nothing hidden is added.

### Protocol

`protocol/README.md` and `match.ts`: `survived.how: "shield"`, hit `by`, card/player `preventNext`, stack entry `ward`, snapshot `left`, `blockerCandidates`. All optional.

### Server

None.

### Page

- `survive.ts` / `umbra.ts`: one shared lead: every shield shape fully up at blow −150 ms (regeneration's burst moves earlier; the umbra keeps its unfold but its shield is up at −150); a grey number rises for every save (0, or the damage on the hit). New looks: the silver shield (crack, shatter, count ticks; 0080's flash), the protection square pulse, the ward flare + ring at the trigger's rise and at the counter, the prevent-N badge (new mark in `marks.tsx`/`CardBadges.tsx`) and its tick.
- `fromSnapshot.ts`: `countered` also takes `left` entries (by stack id, not card id), so `Board.tsx`'s stack-leave loop (7358, crumble branch 7406-7477) plays the crumble for an ability or a Time Stop exile instead of the resolved glow and spark.
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
- **Speed.** Combat is the tightest budget: `scriptMsPerSecond4x combat 88` (`frontend/e2e/match-speed.spec.ts:105-113`), and 0096's 70 ms/s target is still unmet (efficiency phase item). Item 3 adds squares to every attacker and possible blocker for the whole combat: measure `match-speed.spec.ts` and `match-big-combat.spec.ts` before and after; the pops must be compositor-only.
- **Jump check.** None new expected: the badges are marks, not cards; the silver shield and ring are overlays.
- **Two "survived" sources.** A creature with both indestructible and a shield counter facing Murder: Forge applies the shield replacement first (the counter is removed; indestructible never matters). Show only what Forge reports (`shield`), never both.

## Decided 2026-11-17 (owner, by prompt, via the coordinator)

1. **Combat squares go on the attackers and on the creatures the game offers as blockers** (the declare-blockers decision's candidates), never on a list the page works out (UI-001). The worker sends those candidate ids to both seats (worker change, item 3).
2. **Ward when its cost is paid: the flare only.** Nothing is countered, so no ring at the counter, no crumble and no grey number.

## Build order notes

Second of the four (after 0100), because item 2 changes the same stack-leave loop (`Board.tsx` 7358-7720) that 0100 item 8 (the swing) and 0102 item 3 (Time Stop) rely on. Inside: worker `left` + report first, then the crumble for abilities (smallest page change), then the seven rows (one shared lead in `survive.ts` first, then each row), then combat squares last (speed measurement).
