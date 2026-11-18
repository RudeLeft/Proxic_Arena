# 0100 — Spells: what they chose and what they aim at

**Status:** Approved 2026-11-17 (owner, by prompt, deep dive 3). Phase 10.
**Built:** 2026-11-18, unreleased (commit 8db8ff1; AGENTS.md "Current work"; noted 2026-11-18, a documentation check)
**Owner decisions** (`Phase 10 deep dive 3 decisions.md`, all approved 2026-11-17):
round 2 Q1 **B** (X medallion) · round 2 Q2 **B** (modes as the card's text, unchosen struck through) · round 2 Q3 **C** (extra costs shown in what it aims at) · round 2 Q4 **A** (a number at each beam's ripple) · missed Q2 **A** (graveyard/exile target: beam to the tile, the card peeks out with corners) · round 2 Q5 **A** (Curse: a mirror tab on the cursed plate) · combat Q2 **A, reworked** (whose beam: yours gold with a glint, theirs blue-violet with motes) · combat Q4 **A** (the beam swings to a new target; a window to the caster) · combat Q3 **C** (pointing at a stack card lifts its source and targets; nothing dims).

Canvases (untracked, `frontend/zz-canvas/`): `deep3-round2-1117.html` (Q1-Q5), `deep3-missed-1117.html` (Q2), `deep3-combat-outcomes-1117.html` (Q2, Q3, Q4). Each item below names the canvas section and option whose coded scene is the look to build. Research: `Phase 10 deep dive 3.md`, sections A1, A2, A4, B4, B5, B10.

## Why (researched)

All line numbers at HEAD (4a5acfe, 1.72.0). Trace facts are from the 1.72 Lab traces (`scratchpad/rel172/traces/*.jsonl`, both seats); "SOURCE" means read from the code, "TRACE" read from a trace, "INFERENCE" reasoned and not yet run (EVID-001).

**The stack entry today** (SOURCE). `forge-worker/.../game/ViewerSnapshot.java:412-517` builds each entry: `id` (420), `description` = `PlainWords.humanise(String.valueOf(instance))` (427), `source` (431), `name` (432), `owner` (442), copies (449-481), for spells the printed `manaCost` (487), `splitSecond` (496), `cantBeCountered` (499), `controller` = the seat of `getActivatingPlayer()` (503-504), `kind` (505), `targets` (508), `why` (513). `targetsOf` (752-787) walks the sub-abilities and emits `{object:"card:N"}`, `{object:"stack:N"}` or `{player:seat}`, deduplicated, with **no amount per target and no mode grouping**. Nothing sends X paid, optional costs, alternative costs, the chosen modes or the divided damage: grep `getXManaCostPaid|isKicked|OptionalCost|isAlternativeCost|getDividedValue|getChosenList` in `forge-worker/src/main/java` finds only the decision-time uses (`MatchController.java:1463`, `:3811`, `:5488`).

**What the description already says** (TRACE):

| Trace | Stack entry (both seats identical) | What it gives | What it lacks |
|---|---|---|---|
| `modes-cryptic` | stack:11 Cryptic Command, targets `[card:83]`: "Return target permanent to its owner's hand. (Targeting: Grizzly Bears (83)) Draw a card." | the two chosen modes, in words | the two modes **not** chosen (round 2 Q2 B shows them struck through) |
| `modes-escalate` | stack:9 Collective Brutality, targets `[card:76, player 2]`: "Target creature gets -2/-2 … Target opponent loses 2 life and you gain 2 life. (Targeting: Bob) Alice gains 2 life." | the chosen modes | the unchosen mode, and the fact it was escalated (no flag; Forge has no `isEscalate`, it is a keyword only, `Card.java:2687`) |
| `numbers-split` | stack:8 Arc Lightning, targets `[card:118, player 2]`: "deals 3 damage divided to Gray Ogre (118) (2 damage) and Bob (1 damage)." | each share, as English | a share per target the page may read (PROTO-006 forbids parsing prompt text; this is stack text, the same rule applies) |
| `tracked-state-meren` | stack:23 Meren's end-step trigger, targets `[card:28]` = Llanowar Elves **in Alice's graveyard** | the target | — (the page draws nothing for it, below) |
| `numbers-x` | Fireball is never on the stack in a snapshot (the Lab resolves it straight through; `numbers.log`: "Fireball: X = 3 at {3}{R}") | — | X itself: not verified in any stack entry |
| `numbers-kicker` | stack:3 Everflowing Chalice: "Everflowing Chalice" (kicked once, `numbers.log`) | — | the kick: the description does not say it |

**Forge already answers each question** (SOURCE, vendored at `spikes/forge-phase0a/forge-upstream/forge-game/src/main/java/forge/game/`): X paid `SpellAbility.getXManaCostPaid()` (`spellability/SpellAbility.java:2562`; `Card.getXManaCostPaid()` `card/Card.java:1621` reads the cast SA); kicker `isKicked()` (`SpellAbility.java:649`), `getOptionalCosts()` (565), `Card.getKickerMagnitude()` (`Card.java:7365`, multikicker); entwine `isEntwine()` (654); alternative costs `isAlternativeCost(AlternativeCost)` (2534), with `AlternativeCost.Overload` and `Evoke` (`spellability/AlternativeCost.java:22` and :3), `isEvoke()` (690); Forge's own ready string `StackItemView.getOptionalCostString()` (`spellability/StackItemView.java:60`); modes: all of them `sa.getAdditionalAbilityList("Choices")` (as `ability/effects/CharmEffect.java:29-40` `makePossibleOptions` reads them), the chosen ones `getChosenList()` (`SpellAbility.java:2307`); divided damage `isDividedAsYouChoose()` (1835), `getDividedValue(GameObject)` (1842), `TargetChoices.getDividedValue(GameObject)` (`TargetChoices.java:156`).

**The page drops spells' words** (SOURCE). `frontend/src/battlefield/fromSnapshot.ts:644-686` builds each `StackView`; `does: stackWords(...)` only when `kind !== "spell"` (681). The close-up's spell branch says so: `GameScreen.tsx:4953-4954` ("A spell's rules text is not in the snapshot …"), `{entry.kind !== "spell" && (` at 4955. The casting card (`CastingCard.tsx:508-590`) has no place for a medallion; its pips are empty for the other player's cast (505-506). The play log's cast line (`PlayLog.java:802-891`) names the card and its targets only.

**Beams** (SOURCE). `Arrows.tsx:172-189` `TargetBeam({route, aim, w, reduced})` has no seat or caster input; the colour is fixed `GOLD = {aura:"#f0a830", body:"#f4c25e"}` (`Arrows.tsx:13`); the ripple is `Ripple` (100-148). Board draws it at `Board.tsx:9056`. A card end comes from `positions.get(to.object)` and **returns undefined if the card is not drawn on the table** (`aimOf`, `Board.tsx:8368-8375`; `positions` from drawn slots at 3685-3691; stack targets use `stackBeam`, 8533-8537). So a graveyard or exile target has no beam. The targeted set reaches only slots (Sight at `Board.tsx:2036`), stack cards (Sight at 8793) and, as a bare class, fan cards (`act` at 8670; no `Sight` in `FanCards.tsx`); the pile tiles and the opened pile (`ZoneViewer`, `GameScreen.tsx:5017`) never get it. The player's life shield is "targeted" by `board.stack[0]` only (`GameScreen.tsx:3217-3219`), not the stack card you point at.

**Which beams show** (SOURCE). `stackFocus` (`Board.tsx:798-801`) picks the pointed stack card, else the front one; the pointed one is `pointedOnStack` (2877, set at 8827-8830). The other stack cards fade (`bf-stack-faded`, opacity 0.45, `battlefield.css:1418`). Nothing lifts the source or the targets.

**A new target** (SOURCE). A line's key is `${kind}:${drawn(from)}:${to}` (`Board.tsx:8361`); a changed target is a new key, so the old beam takes the generic leaving fade (`bf-line-out`, 160 ms, `Board.tsx:8170-8202`, `battlefield.css:966-985`) and a new one draws in. No code compares a stack entry's old and new targets (grep `retarget|redirect|prev.*targets` in `frontend/src`: none). No report kind exists for it (`ActionReports.java:128-164`).

**Curses** (SOURCE). `ViewerSnapshot.java:1144-1147` reads `view.getAttachedTo()` (a `CardView` only) and emits `attachedTo: "card:N"`. **The worker does not send an Aura's enchanted player** (grep `getEntityAttachedTo|getEnchantedPlayer|attachedToPlayer` in `forge-worker`: only `Survivors.java:172 aura.getEnchantingCard()`). Forge answers it: `CardView.getEnchantedPlayer()` (`card/CardView.java:734`), `Card.getEntityAttachedTo()` (`card/Card.java:3874`). The page type is `attachedTo: string | null` (`match.ts:508-509`, `layout.ts:134`). No Lab game has a Curse (deep dive 3, section D). **So this spec adds it to the snapshot**, as asked.

## What the player sees

Alice is you (seat 1, bottom), Bob the other player. Your own spells get the same marks (they are what you chose; nothing here is a window to you).

1. **X (round 2 Q1 B; canvas `deep3-round2-1117.html`, "Q1 X", option B, scenes "Fireball, X=6" and "Hydroid Krasis, X=4").** Bob casts Fireball with X=6 at you. As his casting card rises, a gold round **X=6** medallion pops on its top-right corner; when the card flies to the stack the medallion flies with it (one arc, about 0.45 s) and stays on the stack card's corner at 0.8 size until the spell leaves the stack. Hydroid Krasis with X=4 (no target) gets the same medallion. In the close-up: "X is 6".
2. **Modes (round 2 Q2 B; "Q2 Modes", option B, scenes "Cryptic Command" and "Collective Brutality, escalated").** Bob's Cryptic Command lands on the stack: its body shows all four modes as the card prints them, one line each. "Return target permanent to its owner's hand" and "Draw a card" are lit gold; "Counter target spell" and "Tap all creatures your opponents control" are grey and struck through. An escalated Collective Brutality shows all three lit. The close-up lists the same lines.
3. **Extra costs, in what the spell aims at (round 2 Q3 C; "Q3 Extra costs", option C).**
   - Kicked Burst Lightning at your Serra Angel: **a doubled beam** (two strands side by side) to the Angel.
   - Overloaded Cyclonic Rift (it targets nothing): **a beam with sight corners fanned to every card it would return now** (all your nonland permanents); if the board changes while it waits, the fan follows (Decided 1: Forge's best guess, refreshed each snapshot).
   - Evoked Mulldrifter: **a grey beam from the stack card to Bob's own graveyard tile** (it will be sacrificed as it enters).
   No square, no word on the table; the close-up says "Kicked", "Overloaded", "Evoked" in words.
4. **Split damage (round 2 Q4 A; "Q4 Split damage", option A, scene "Arc Lightning").** Bob's Arc Lightning: a gold **2** stands at the beam's ripple on your Ogre Warrior and a gold **1** at the ripple on your life shield, while the spell waits. When it resolves the usual red −2 and −1 rise. Numbers appear only where the caster chose the split (Arc Lightning, Forked Bolt): Bob's Fireball split between two creatures shows its X medallion (item 1) and no per-target number (Decided 2).
5. **A target in a graveyard or exile (missed Q2 A; `deep3-missed-1117.html`, "Q2", option A, scene "Bob's Reanimate on the Craw Wurm").** Bob's Reanimate aims at the Craw Wurm in your graveyard: the beam runs to your Graveyard tile, and the Craw Wurm lifts a little out of the tile, face up (about half a table card), wearing 0088's four still corners until the spell leaves the stack. If you open the pile, the Wurm wears the corners there too. Exile works the same for a face-up exiled card.
6. **Curses (round 2 Q5 A; "Q5 Curses", option A).** Bob casts Curse of the Pierced Heart on you. The card lands among Bob's enchantments **and stays there**. A small mirror picture tab of it unfolds on the left of your plate, and a gold thread runs once from the card to the tab (about 1 s, then fades). At your upkeep its trigger rises from the card on Bob's side and the tab glows with it. Several Curses stack as several tabs.
7. **Whose beam (combat Q2 A, reworked; `deep3-combat-outcomes-1117.html`, "Q2", option A).** Your beams and corners stay gold, with a slow glint running down the beam. Bob's are cool blue-violet (beam `#8f9cff`, flow `#e4e8ff`, corners `#aeb8ff`), with a few soft motes drifting along. In a response war (his Murder, your Bolt, his Shock) each beam says whose it is by itself.
8. **A beam that changes target (combat Q4 A; "Q4", option A).** Your Bolt is aimed at Bob's Goblin Guide; Bob activates Spellskite. The beam's end **swings** from the Goblin Guide to Spellskite in one motion (about 0.4 s), its corners riding with it; then **you** (the caster) get the report window: "Bob changed your Lightning Bolt's target to Spellskite", with both pictures. Bob, who did it, gets none.
9. **Pointing at a stack card (combat Q3 C; "Q3", option C).** You point at Flametongue Kavu's trigger: nothing dims; the Kavu on Bob's side (its source) and your Serra Angel (its target) lift a little and glow gold. Point at your Bolt and the lift moves to its target. A spell cast from a hand has no source on the table: only its targets lift.

House rules kept: the only explanation window is item 8's (to the other player of that action, i.e. the caster); no word pills; numbers rise as floating numbers; no "Forge" in any player text.

## Changes

*As of 2026-11-18 (a documentation check): the line numbers in this section, as in "Why", are of 4a5acfe (the research); the code has since moved, and the As built table below carries HEAD's (bc93fa9).*

### Worker (`ViewerSnapshot.java`, `ActionReports.java`, `GameHost.java`)

New fields on each **spell** stack entry (copies too, `ViewerSnapshot.java:729-746`), read from the entry's `SpellAbility` (`SpellAbilityStackInstance.getSpellAbility()`), all public once cast (they are the choices announced on casting, CR 601.2b-c):

| Item | Field | From |
|---|---|---|
| 1 | `x: number` when the cost has X | `getXManaCostPaid()`; absent when null |
| 2 | `modes: [{text, chosen}]` in printed order, for a modal spell | `getAdditionalAbilityList("Choices")` (each `AbilitySub.getDescription()`, `PlainWords.humanise`), `chosen` = in `getChosenList()` |
| 3 | `extra: ["kicked" \| "overloaded" \| "evoked" \| "entwined" \| "escalated", ...]`, `kicks: n` for multikicker | `isKicked()`, `isAlternativeCost(Overload)`, `isEvoke()`, `isEntwine()`; escalated = keyword Escalate on the host and more than one mode chosen |
| 3 | `hits: ["card:N", ...]` for an overloaded spell | Forge's own filter for the overloaded effect, asked each snapshot (Decided 1) |
| 4 | `amount` on each target ref, for divided damage | `TargetChoices.getDividedValue(GameObject)` when `isDividedAsYouChoose()` (in `targetsOf`, 752-787; a target the walk dedupes keeps its first amount) |
| 6 | `attachedToPlayer: seat` on a permanent | `CardView.getEnchantedPlayer()`; `attachedTo` unchanged |

Item 8: a new report kind **RETARGET** in `ActionReports` (kinds 128-164), made when a change-targets effect (`ApiType.ChangeTargets`: Spellskite, Deflecting Swat, Redirect) resolves and a stack entry's targets differ before and after. Actor = the effect's controller; told to the changed spell's controller only when that is not the actor (`tells`, 1501-1527). Words: "<Actor> changed your <Spell>'s target to <New target>." with the spell and the new target as pictures. Hidden ids: the pictures pass `HiddenIds` as every report does.

Nothing new for items 5, 7, 9: the target `card:N` in a pile (TRACE `tracked-state-meren`) and the caster seat (`controller`, 503-504) are already sent.

### Protocol

`protocol/README.md` (stack entry: `x`, `modes`, `extra`, `kicks`, `hits`, target `amount`; card: `attachedToPlayer`; action kind RETARGET), `frontend/src/match.ts` types (`StackEntry` 706-744, card 508) and parsers. All optional: an old worker sends none and the page draws today's look.

### Server

None beyond `MatchArt` giving the RETARGET report's cards their pictures, as for every report (no code change expected: it maps any report's cards; verify).

### Page

- `fromSnapshot.ts` 644-686: carry `x`, `modes`, `extra`, `hits`, per-target `amount` and `seat` into `StackView` (`Board.tsx:493-560`); keep `does` for triggers as now. `attachedToPlayer` into the card's layout entry (`layout.ts:134`).
- Item 1: `CastingCard.tsx` gets an `x` medallion on the casting card (both the other player's rise, `TheirGlide` 430-459, and your own), flying to the stack card's corner with the card; the stack card keeps it (`Board.tsx` stack card render ~8737-8800).
- Item 2: the stack card's body shows `modes` (lit / struck) in place of the art band when `modes` is present; the close-up (`GameScreen.tsx:4950-4961`) lists them and X and the extra costs for spells (and the "not in the snapshot" comment goes).
- Item 3: `Arrows.tsx` gains a doubled strand (kicked), a grey beam (evoked, to the caster's graveyard tile, using item 5's tile end) and the fan to `hits` with Sight corners on each (overloaded).
- Item 4: `Ripple` gets an optional gold number at the beam's end (canvas: 88 % along the beam).
- Item 5: `aimOf` (8368-8375) falls back, for a `card:N` that is in a graveyard or exile (the game screen's `pileCards` set, from 0099), to that pile's tile (`anchors(geometry)["<side>:graveyard"|"<side>:exile"]`). A new peek card (half a table card, face up, Sight corners) stands out of the tile while the target is on the stack; a fan card (0087) gets `Sight` too; `ZoneViewer` (`GameScreen.tsx:5017`) shows the corners on that card.
- Item 6: the plate (`SeatBlock`, `GameScreen.tsx:3176`) gets a column of mirror tabs (0085's held-card tab look) for cards whose `attachedToPlayer` is that seat; the thread draws once when the tab first appears; the tab glows when a trigger whose `source` is that card rises.
- Item 7: `TargetBeam` and `Sight` take `theirs` (stack entry `seat !== viewer`); colours and the glint / motes per the canvas. Corners on targets follow the focused entry's owner.
- Item 8: Board compares the focused entry's targets by stack id from the previous board: same id, one target changed → the beam end and corners swing (0.4 s) instead of the leave-and-redraw.
- Item 9: the focused entry's `source` slot and target slots get a lift-and-glow class while `pointedOnStack` is set (canvas: lift about 6 % of a card's height and the gold glow; no dim anywhere). The life shield follows the focused entry, not `stack[0]` (`GameScreen.tsx:3217-3219`).
- Reduce motion: medallion, mode lines, numbers, peek card, tabs and corners appear at once; no swing (the beam simply points at the new target), no glint or motes. A click hurries everything (A-00).

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0100-A | Worker: Fireball X=6 entry has `x: 6`; Cryptic has 4 `modes`, 2 `chosen`; Brutality escalated has 3 chosen and `extra: ["escalated"]`; Arc Lightning targets carry `amount` 2 and 1; kicked Burst Lightning `extra: ["kicked"]`; Rift overloaded `extra: ["overloaded"]` and `hits`; Mulldrifter evoked `extra: ["evoked"]`; a Curse on Alice has `attachedToPlayer: 1` — both seats get identical fields | worker unit tests (GameHost harness); Lab: extend `check-modes.py`, `check-numbers.py` (make Fireball wait on the stack: the other seat holds priority) and a new `check-spell-choices.py` (Burst Lightning kicked, Cyclonic Rift overloaded, Mulldrifter evoked, Curse of the Pierced Heart, Spellskite and Deflecting Swat); each new script 3 times; hidden checks (`check-hidden-*.py`) over its traces |
| F-0100-B | Worker: RETARGET report to the caster only, not the actor; none when you redirect your own spell | worker unit; Lab trace both seats |
| F-0100-C | Page: X medallion on the casting card, then on the stack card; mode lines lit/struck; numbers at ripples; doubled / grey / fanned beams | `fixes0100.test.tsx` (real Board from a snapshot pair) |
| F-0100-D | Page: Meren's trigger on `card:28` in the graveyard draws a beam to the Graveyard tile, the peek card with corners, and corners in the opened pile; on both seats | `fixes0100screen.test.tsx` (real game screen, socket replaced) |
| F-0100-E | Page: the other player's beams blue-violet, yours gold; the swing keeps one beam element and ends on the new target; pointing at a stack card lifts its source and targets and dims nothing (no card's opacity or filter changes) | `fixes0100.test.tsx` |
| F-0100-F | Curse: the tab on the cursed player's plate, the card still in Bob's rows; the tab glows when its trigger rises | `fixes0100screen.test.tsx` |
| F-0100-G | Real game (TEST-012), below | `match-spell-choices.spec.ts` |
| F-0100-H | No new jumps on the touched traces (modes-*, numbers-*, tracked-state-meren, the new ones), both seats | jump check on those traces only (TEST-013 1); full run at release |

**TEST-004 (bites):** one per row above (about 9 page, 5 worker), and one for `attachedToPlayer` sent to a spectator only as a seat (no hidden data involved).

**Real-click game (TEST-012).** One game, 0098's deal (`startAMatch(..., { deal })`), new fixture deck: the guest casts Arc Lightning split 2 / 1 at the host's creature and the host; the host **really points** at the stack card and the test checks the numbers at the two ripples, the blue-violet beam on the host's page, the lifted target; the host casts Lightning Bolt at the guest's creature and the guest **really clicks** Spellskite's ability; the host's page shows the swing and the RETARGET window; the guest casts Reanimate on a card in the host's graveyard (the host's page draws the beam to the tile and the peek card). Extend `match-modes-doing.spec.ts` with a Cryptic Command cast for the modes lines. Clips: one normal-speed clip per new moment from the seat that sees it (items 1, 2, 3, 4, 5, 6, 8; item 7 and 9 on one clip).

## Risks

- **Hidden information.** All new spell fields are announced on casting and are public; X, modes and costs of a **face-down** spell (morph, disguise, foretold cast face down) must not be sent to the other seat: gate the new fields on the same face-down check that blanks `description` ("Face-down spell", `ViewerSnapshot.java:427`). An overloaded spell's `hits` lists only permanents on the battlefield. Item 5's peek card: a face-down exiled card (foretell, Hideaway) is shown as its back, and its id is already stripped by `HiddenIds` for a viewer who may not see it — the beam then ends on the tile with no peek card. Hidden checks over every new trace (HID-003, both seats).
- **Speed.** The glint and the motes loop while a beam is up. The match-speed budget `idlePaintsPerSecond 1` (`frontend/e2e/match-speed.spec.ts:105-113`) counts paints while idle: they must be compositor-only (transform/opacity) and stop when no beam is shown; measure with `match-speed.spec.ts` before and after. The fan of beams to an overloaded Rift's `hits` can be 20+ beams: cap the drawn beams (canvas shows 6) and put corners on the rest.
- **Jump check.** The peek card and the mirror tab are new drawn cards; the jump tool will see them appear. They must rise out of the tile / unfold from the plate (never pop in), and the jump checker must be taught they are copies, as for 0087's fan (`scripts/check-jumps.py`).
- **Stack card space.** Four mode lines on a stack card: long modes are shortened on the card, the close-up has the full words.

## Decided 2026-11-17 (owner, by prompt, via the coordinator)

1. **Overload's "every card it hits": YES, best guess.** An overloaded spell has no targets; Forge decides what it affects only on resolution. The worker asks Forge's own filter (the overloaded effect's `ValidCards`/`Defined`, as `Survivors.stoodDestroy` already does for DestroyAll, `Survivors.java:271-311`) on every snapshot, so the fan shows what it would hit **now** and updates each snapshot. When the filter has X in it (as `Survivors.java:297` skips), no fan.
2. **Fireball: its X medallion only, no computed split.** Fireball divides X evenly on resolution and has no Forge divided value, so nothing computes a share. Split numbers appear only where the caster chose the split (Forge's `isDividedAsYouChoose()` with `getDividedValue`: Arc Lightning, Forked Bolt).

## Build order notes

Build after nothing (first of the four), or after 0101 if that is preferred; see the suggested order in 0103. Inside the spec: worker fields + protocol first (one commit, page unchanged), then items 7 and 9 (beam tint and lift, smallest page change, touches `Arrows.tsx` and the stack focus), then 5 (tile ends), then 1-4 (stack card body, medallion, numbers, extra beams), then 6 and 8. One builder at a time on `Board.tsx` / `GameScreen.tsx`.

## As built (2026-11-18, uncommitted)

Built on main at b1ffb3d. Line numbers are of the working tree. "RUN" = run here on this tree; "SOURCE" = read from the code (EVID-001).

*As of 2026-11-18 (a documentation check): committed as 8db8ff1 (on 9b37f74); specs 0101-0103 moved the code since, and the As built table's line numbers marked "re-pointed" are of bc93fa9 (code: `git log 8db8ff1`).*

### Where each item is

| Item | Worker | Page |
|---|---|---|
| 1 X | `SpellChoices.java` `mark` (`x` when `costHasManaX`); called at `ViewerSnapshot.java:523` (stack) and `:756` (copies) (re-pointed 2026-11-18) | `XMedallion` (`SpellMarks.tsx`), on the stack card `Board.tsx:9907` (re-pointed 2026-11-18); on the card flying to the stack `CastingCard.tsx:814` (`gs-cast-xmed`), fed `x={onStack?.x}` at `GameScreen.tsx:2790`; close-up "X is 6" `GameScreen.tsx:5517` (re-pointed 2026-11-18) |
| 2 Modes | `SpellChoices.modes` (every `Choices` sub-ability in printed order; chosen = chained onto the spell, matched by description) | `ModeLines` (`SpellMarks.tsx`) on the stack card body `Board.tsx:9896` (re-pointed 2026-11-18), left-aligned lines, struck grey for not chosen (`battlefield.css` `.bf-modes`/`.bf-mode-off`); close-up list `GameScreen.tsx` StackInspect |
| 3 Extra costs | `SpellChoices.extras` (kicked, overloaded, evoked, entwined, escalated = keyword Escalate and >1 mode), `kicks` (multikicker), `hits` (overloaded effect's `Defined` "Valid..." filter via `AbilityUtils.getDefinedCards`, battlefield only, none with X) | doubled strand `Arrows.tsx` `beside`/`TargetBeam doubled`; overload fan `Board.tsx:9521-9523` (re-pointed 2026-11-18) (at most `HITS_DRAWN` = 6 beams, corners on all via `targeted`); evoked grey beam to the caster's graveyard tile `Board.tsx:9528-9529`; close-up "Cast: Kicked/Overloaded/Evoked..." `GameScreen.tsx:5545` (re-pointed 2026-11-18) |
| 4 Split | `targets[].amount` from `TargetChoices#getDividedValue` when `isDividedAsYouChoose` (`ViewerSnapshot.java:783`, `:796`) | `spellChoices` parser `match.ts:1966` -> `shares` (re-pointed 2026-11-18); `Share` at 88 % of the beam (`Arrows.tsx:228`); close-up "(2 damage)" |
| 5 Pile target | (nothing new) | `peekOf` + `peekBox` (`Board.tsx:9222`, `:1952` (re-pointed 2026-11-18): `PEEK_SCALE` 0.8 of a table card, the canvas's size, owner 2026-11-18; just left of the rail at the tile's height, wholly on the table) + `PeekCard` (`:1972` (re-pointed 2026-11-18), rises out of the tile, 450 ms Web Animation, corners); fan card corners (`FanCards.tsx` `sight`); opened pile corners (`ZoneViewer aimed`, `GameScreen.tsx:5605`, `:5742` (re-pointed 2026-11-18)); face-down exiled card: beam to the tile, no peek (HID-005) |
| 6 Curse | `attachedToPlayer` from `Card#getEntityAttachedTo` (`ViewerSnapshot.java:1229-1230`) | `CurseTabs`/`CurseTab` (`GameScreen.tsx:3789`, `:3807` (re-pointed 2026-11-18)): mirror tab on the cursed plate's left, gold thread once, glow when its trigger rises |
| 7 Whose | (controller already sent) | `THEIRS` colours (`Arrows.tsx:19`), glint (`BeamLife`, yours) and motes (theirs), none with motion turned down; `Sight theirs` (#aeb8ff); `focusTheirs` `Board.tsx:3749` (re-pointed 2026-11-18) |
| 8 Retarget | `ActionReports` kind `RETARGET` (`retargeted`, `:420`; targets noted on cast and after each resolution, `noteTargets` `:387`); told to the changed spell's controller only when not the actor (`tells`, `:1935`, its RETARGET case `:1955` (re-pointed 2026-11-18)); words `retargetWords` | `SwingBeam` (`Board.tsx:2066` (re-pointed 2026-11-18)): one element, its end swings 400 ms, corners riding; an entry whose beams are not drawn keeps the targets they last showed (`beamsDrawn`, `Board.tsx:9584` (re-pointed 2026-11-18)), so the Bolt swings once Spellskite's ability has gone; report window as for every report (0085 Amendment 1: it comes up at once). **Owner 2026-11-18, the hold:** when a stack entry on two boards running aims at something new (`retargeted`, `GameScreen.tsx:263` (re-pointed 2026-11-18)), the game screen holds that board (`swingHeld`, `:429` (re-pointed 2026-11-18), shown in place of the latest; it clears 0089-style spotlight `held`, being newer) until the Board says the swing has landed (`onSwinging`, `Board.tsx:9035` (re-pointed 2026-11-18)), at most `SWING_HOLD_MS` 1.5 s (`:260` (re-pointed 2026-11-18): the ability in front resolving, 380 ms, then the 400 ms swing); never with motion turned down. So when the caster cannot answer and the Bolt resolves 330 ms later, the swing still plays first. No worker change. |
| 9 Pointing | (nothing new) | `lifted` (`Board.tsx:3760` (re-pointed 2026-11-18)): source + targets lift and glow (`bf-lifted`), no `bf-stack-faded` any more; life shield follows the focused entry (`onStackFocus` -> `SeatBlock stackFocus`, `GameScreen.tsx:3552` (re-pointed 2026-11-18)) |

Protocol: `protocol/README.md` (stack entry `x`, `modes`, `extra`, `kicks`, `hits`, `targets[].amount`; `card.attachedToPlayer`; action RETARGET). Server: no change (MatchArt maps any report's cards: SOURCE; the RETARGET window showed both pictures' slots in the real game, RUN).

### Tests and results (RUN, this tree)

- Worker `mvn -q -o test`: pass (ActionReportsTest adds three RETARGET tests: told to the caster only, nobody for your own spell, the sentence).
- Lab `check-spell-choices.py` (new: kicked, overload, evoke, curse, spellskite, swat, own-swat) x3: 7/7 OK each run. `check-modes.py` (escalate, cryptic, entwine read the stack entry off both seats) and `check-numbers.py` (Fireball waits on the stack: `x` to both seats, no share; Arc Lightning shares 2/1 to both seats): OK.
- Whole ci.yml Lab list locally (3 at a time): 65 of 66 scripts exit 0 at the first go; `unreachable` hit the 300 s limit with three running at once, and passed alone (14 s).
- Hidden checks over the new traces (3 runs) and over the whole Lab list's traces: snapshot-first, hidden-hands, hidden-log, kinds, hidden-tops, hidden-mulligans all OK (hidden-tops: 27 report cards checked on the new traces, RETARGET's among them); questions-asked OK.
- Page: `fixes0100.test.tsx` (22) and `fixes0100screen.test.tsx` (12: + the held board until the swing lands, + never held past 1.5 s, + a spectator sees the Curse tab) pass; whole vitest pass; tsc, eslint (whole frontend, 0 warnings), prettier pass.
- Real-click game (TEST-012) `match-spell-choices.spec.ts`, headless bundled, the host (the Bolt's caster) NOT able to answer: pass, the swing played through (largest frame at > 0.85) before the Bolt resolved (Arc Lightning: 2 at the Ogre's ripple, 1 at the host's shield, blue-violet, the Ogre lifted, nothing faded; Spellskite: the Bolt's beam swung as one element, frames 0.00 to 0.96, the host told "Pat changed your Lightning Bolt's target to Spellskite.", the guest told nothing; Reanimate: beam to the host's Graveyard tile, the Ogre peeking out with corners). Touched `match-modes-doing.spec.ts` (Cryptic's mode lines on the stack): pass.
- Follow-up mutations: the hold removed, the hold never released by the landing, a 15 s cap, and Curse tabs hidden from a spectator: 4/4 caught by `fixes0100screen.test.tsx`; worker `attachedToPlayer` withheld from the public view (viewer null): caught by `check-spell-choices.py curse`, which now sends WATCHED and checks seat 0 (the spectator's view) as well (x3 OK, hidden checks OK over those traces).
- Mutations (TEST-004): page 20/20 caught (`pmut3.py`), including the HID-005 face-down peek guard, the real-game swing fix and the peek's place. Worker 6/8 caught (W1-W6: RETARGET to the actor, no RETARGET, kicked, every mode chosen, no divided amount, no attachedToPlayer). Not caught: W7 (overload `hits` without the battlefield filter: equivalent for every card here, the `Defined` filter only yields permanents) and W8 (the face-down guard on the new fields, HID): see Open.
- Jump check over modes-cryptic, modes-escalate, numbers-split, tracked-state-meren and spell-choices-*: no problem found on either seat (every kind of move listed with boards only; no jumped, popped, blinked or unshown card). The peek card and the Curse tab carry no `data-object-id`, so the jump tool does not follow them as cards (they are mirrors, as 0087's fan).
- Clips: plus `item8-held-for-the-swing` (the boards sent 330 ms apart as in the real game: the swing plays through, then the Bolt resolves) and item 5 again at 0.8 (`scratchpad/b0100/clips2/`, still `stills2/item5-graveyard-target.png`). Earlier: eleven normal-speed clips (items 1, 2 x2, 3 x3, 4, 5, 6, 8, and 7+9 on one), from the seat that sees each, listed with what each shows in `scratchpad/b0100/clips/CLIPS.txt` (not in the repo; the clip tool was temporary and is removed).

### Fixed while finishing (found by the real-click game and screenshots)

- The swing never showed in a real game: the Bolt's targets changed on a board where Spellskite's ability was still in front, so the next board had nothing to compare. An entry whose beams are not drawn now keeps the targets they last showed.
- The peek card stood over the Graveyard tile, under the rail, nearly hidden; it now stands just left of the rail on the table (the canvas's PEEK).
- Mode lines were centred by the card face; now left-aligned as the canvas.
- The real-click game's host has nothing to answer with when Spellskite's ability resolves (the owner's case): the page's hold shows the swing.
- The peek card is 0.8 of a table card (owner 2026-11-18, the canvas's size); its name reads.

### Open (not done, or not proven)

- **W8 (HID-004 note): the face-down guard on `x`/`modes`/`extra`/`kicks`/`hits` cannot fire in any game.** A spell is face down on the stack only when cast face down (morph, disguise, and their kin): Forge casts it through a static face-down ability whose cost is a fixed {3}-style cost (no X), with no modes (a face-down card has no abilities, so no Charm), and with no optional or alternative cost of the kinds sent (a face-down card has no kicker, overload, evoke, entwine or escalate keyword). A foretold card is cast face UP from exile, so it is not hidden on the stack. A copy of a face-down spell copies face-down characteristics, so the same holds. The guard stays as defence in depth, beside the description guard it mirrors; mutated, nothing caught it, as expected: it is not verified by firing.
- `match-speed.spec.ts` (idle paints) not run locally; the glint and motes are SVG `animateMotion` loops (not compositor-only) while a beam is up. CI's browser run is the measurement.
- Flake record (for ROADMAP's flake table, kept by the coordinator): `check-unreachable.py` hit `timeout 300` (exit 124; worker exit 143 in the `ante` scenario, "worker exited without a frame") while the whole Lab list ran three at a time on the local Windows machine; run alone straight after, it passed in 14 s.
- The round "1" badge under Alice's plate in the item 5 stills is the status tray (spec 0038, its round counter badges are spec 0086's 7 B, `playerMarks.tsx`): Alice's experience counter (Meren of Clan Nel Toth gives her one), drawn by `StatusTray.tsx`; not new in 0100.
