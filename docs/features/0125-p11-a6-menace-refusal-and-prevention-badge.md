# 0125 — Phase 11 P11-A6: menace's pop at a refused block, and "prevent the next N" on a player

**Status:** **Approved by the owner 2026-11-27 (by prompt: menace "At the refusal", prevention "On the life shield")**; built 2026-11-28 (As built, at the end). Phase 11, item P11-A6 (0101's leftovers).
**Owner decisions** (2026-11-27, by prompt, from the canvas `Proxic canvases/a6-menace-and-prevention.html`):

1. **Menace: "At the refusal" (Option A).** When a block is refused because the attacker has menace, the attacker's menace square pops on BOTH screens at the refusal, with the same pulse the other combat squares use. The lone block stays where the defender put it; the defender's button note stays as today. No window, no pill.
2. **Prevention: "On the life shield" (Option A).** A pale round badge with N touching the life shield at its lower right (poison sits lower left); it grows in; on a soaked hit it ticks down like the creature square, then shrinks away at 0 or when gone; pointing at it says "Prevent the next 3 damage to Bob this turn". Same on both screens, no window. A partly prevented hit: the ticking badge plus the usual red −N, no extra pale shield.

## Why (researched)

Researched at origin/main a63a8445. SOURCE / RUN / INFERENCE as in EVID-001. Worker paths are under `forge-worker/src/main/java/net/barnflix/proxic/worker/`, page paths under `frontend/src/battlefield/`.

- **The menace refusal reaches only the defender** (SOURCE). When the defender says "done", `CombatChoices#blocksAccepted` asks Forge (`CombatUtil#validateBlocks`); a refusal's words go to `GameHost#offerRefused` for that seat alone, and `WorkerMain` puts them on that seat's next `DECISION_REQUEST` (`refused`, spec 0097). Nothing reaches `MATCH_SNAPSHOT`. The page shows `decision.refused` only as the defender's combat-button note (`GameScreen.tsx`), and `Board.tsx` `popCombatSquares` pops only from the damage wave, so the `kw:menace` square (0101 item 3) never has its moment. RUN: in the 0101 Lab trace `blocks-menace.jsonl` the board after the refusal (rev 197) is the same on both seats as the one before, the lone block in `combat.blocks`; only the defender's next question says "Boggart Brute has menace: block it with two or more creatures.".
- **A player's "prevent the next N" is sent and never drawn** (SOURCE). `game/ViewerSnapshot.java` `of` puts `preventNext` on the player entry (`GameEntityView#getPreventNextDamage`); a soaked hit says `by: "prevent-next"` (`game/Survivors.java` `preventedBy`, `withPrevented`). The page parses it (`match.ts` `SnapshotPlayer.preventNext`) but no plate draws it. The creature version is `CardBadges.tsx` `PreventSquare`, its used tick from `fromSnapshot.ts` `tableCards` (`preventUsed`). A fully prevented player hit already shows the pale shield and a grey 0 (`Board.tsx`, the damage effect's `wards` pass; in a fight `playFights`).
- **A partly prevented spell hit drew the pale shield too** (SOURCE + RUN), on a player and on a creature alike. `Survivors#withPrevented` sends the stopped part as its own entry (`amount 0, prevented 3`) beside the hit that got through (`amount 2`); `Board.tsx`'s `wards` pass draws a pale shield for every `amount 0` entry. RUN: Lava Axe into Bob's Salve, `survive-rows-prevent-next-partial.jsonl`. A combat hit is merged by `fights.ts` (amount 3, prevented 3), so it already showed only the red −3.

## What the player sees

1. **Menace (canvas "Menace: Option A").** Bob attacks with Boggart Brute (menace). Alice puts her Grizzly Bears alone in front of it and presses Done blocking. The game refuses: at that moment the Brute's gold menace square pops (the deathtouch and trample pulse) on Alice's screen and on Bob's. The Bears stay where Alice put them; her button note says "Boggart Brute has menace: block it with two or more creatures." as today. She takes the Bears back (or adds her Elves); the Brute's 3 reaches her, with no second pop.
2. **Prevention (canvas "Prevent: Option A" and "part of a hit").** Alice Bolts Bob; Bob answers with Healing Salve's "prevent the next 3 damage" on himself. As the Salve resolves, a pale round badge with 3 grows in against Bob's life shield, lower right, on both screens. When the Bolt lands, the pale shield comes up over his life shield and the grey 0 rises, as today, and the badge's number ticks 3, 2, 1, 0 and the badge shrinks away; Bob stays at 20. Pointing at it says "Prevent the next 3 damage to Bob this turn" ("to you" on Bob's own screen). If instead Alice's Lava Axe (5) lands, 3 is stopped and 2 gets through: the badge ticks 3 → 0 and goes, and the red −2 rises as from any hit (20 → 18), with no pale shield. Unused at the end of the turn, the badge just shrinks away.

## Scope

In:
1. **Worker.** `CombatChoices#blocksAccepted`: when Forge's reason is "too few blockers" for an attacker with menace (Forge's keyword on the card, the id in Forge's own reason), it also notes the refusal for every board (`GameHost#offerBlockRefused`). `GameHost#publishSnapshots` drains it once (`BlockRefusals.drain`) into the round's snapshots for both seats and the public view: `blockRefused: [{attacker: "card:N", blockers: ["card:M", ...], why: "menace"}]`. New class `game/BlockRefusals.java`.
2. **Protocol.** `protocol/README.md` and `docs/architecture/MATCH_PROTOCOL.md`: `blockRefused`, optional. Player `preventNext` was already documented (0101).
3. **Page, menace.** `match.ts` parses `blockRefused`; `fromSnapshot.ts` puts the attackers on the table into `Moments.menaceRefused` (keyed by the board); `Board.tsx` pulses each one's `kw:menace` square once per board (`pulseSquare`, `whyPulseFrames`, `WHY_PULSE_MS`), after any hold. Reduce motion: no pop, as every combat square.
4. **Page, prevention.** New `PreventBadge.tsx` on each plate (`GameScreen.tsx` `SeatBlock`), beside the poison badge: the creature square's look at the plate's scale (`game.css` `.gs-prevent`), growing in from 0; on a board whose damage wave has a `prevent-next` hit on that player (`PlateFacts.preventSoaked`), the count ticks from the moment the blow lands -- a combat or fight blow at its moment on the fight clock (the same moment its pale shield or red −N shows on the life shield), a resolving spell's at the creature square's beat (`PREVENT_TICK_AT_MS`) -- one step each `PREVENT_STEP_MS`, and shrinks away at 0; a count gone with no hit just shrinks away. A click hurries it. Screen-reader words on the plate: ", the next 3 damage prevented".
5. **Page, the creature's square in combat (a 0101 leftover; coordinator 2026-11-27, no look change).** `CardBadges.tsx` `PreventSquare` ticks when the blow lands on that creature in a fight (the same fight-clock moment its damage shows), from the same blow marks as the plate's badge; a resolving spell keeps 0101's beat (`PREVENT_TICK_AT_MS`).
6. **Page, a partly prevented spell hit, one look (owner, by the coordinator 2026-11-27).** `Board.tsx`'s `wards` pass draws no pale shield for the stopped part when the same source's hit on the same player or creature got through (amount > 0): the ticking badge or square and the red −N, on a player as on a creature. All of it stopped keeps the pale shield and the grey 0 on both.

Out (and why):
- **Any other "too few blockers" refusal** (a creature that "can't be blocked except by three or more", Forge's same words): the defender's note only, as today (owner decision 1 names menace only). Trigger to revisit: an owner report, or a card the owner wants shown.

## Rules and boundaries

- **Hidden information (HID-001, HID-005).** `blockRefused` names only the attacker and the creatures blocking it, ids every board already shows in `combat.blocks` and `combat.attackers`; it passes `HiddenIds.strip` like every key. It is told for a refusal Forge made (no rule decided here, ARCH-002); menace is read from Forge's keyword on the card, never from text (PROTO-006: the English reason is parsed only for Forge's game id, and the field it makes is typed). `preventNext` was already public (0101). Hidden checks over the new traces from both seats.
- **Deltas (spec 0117).** `blockRefused` is a top-level key: set on the board that has it, unset on the next. `check-deltas.py` and `as-sent-traces.py --rebuilt` over the new traces must rebuild every board equal.
- **No "Forge" in player text.** No new player text but the hover words and the screen-reader line.
- **Nothing jumps.** The menace pop is a pulse on a square; the badge grows, ticks and shrinks in place; nothing on the table moves.
- **UI-006.** The badge fits inside the plate at 1920x1080 without overlapping poison, the tray or the plate's edge (measured, below).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0125-A | Worker: only a menace attacker's "too few blockers" is told (not another attacker's, not "can't block alone"); each refusal once, with its blockers; emptied after | `BlockRefusalsTest` (unit) |
| F-0125-B | Lab: `check-blocks.py menace` -- the board after the refusal tells BOTH seats, once, `blockRefused [{the Brute, [the Bear], menace}]` on the same round, the lone block still in `combat.blocks`; no other board carries it. Page: the `kw:menace` square pulses once at the refusal on either seat's screen, nothing else pulses or moves, not again on the same board, not with reduce motion; `fromSnapshot` reads only `why: "menace"` | Lab x3; `fixes0125.test.tsx` |
| F-0125-C | Lab: `check-survive-rows.py prevent-next-player` (Bolt into Bob's Salve: Bob's `preventNext 3` while the Bolt waits, the hit `{target {player 2}, amount 0, prevented 3, by "prevent-next"}`, none after, Bob at 20, both seats) and `prevent-next-partial` (Lava Axe: prevented 3, 2 through, Bob at 18). Page (real game screen): the badge appears on Bob's plate only, grows in, says his name or "you"; ticks 3, 2, 1, 0 on the creature clock and shrinks away; the partial hit ticks the same with no pale shield; unused at the turn's end it just shrinks; reduce motion shows and goes | Lab x3; `fixes0125screen.test.tsx` |
| F-0125-D | Deltas and hidden checks over the new traces | `check-deltas.py`, `as-sent-traces.py --rebuilt`, the hidden checks |
| F-0125-F | Page: in combat a creature's "prevent the next N" square ticks when its blow lands (never before); a resolving spell's keeps 0101's beat (`fixes0101.test.tsx` row 7) | `fixes0125.test.tsx` |
| F-0125-G | Page: part of a spell hit stopped looks the same on a creature as on a player: the ticking square, the red −N, no pale shield; all of it stopped: the pale shield and grey 0 on both | `fixes0125.test.tsx`; `fixes0125screen.test.tsx` (the player) |
| F-0125-E | Looks: stills of both screens at 1920x1080 for each item; the badge's box inside the plate, clear of poison, the tray and the edge | a real game on the local stack (stills read by eye) |

**TEST-004 (bites):** one per acceptance row, listed in As built.

## Amendments

None.

## As built (2026-11-27)

Built on origin/main a63a8445. RUN = run here on this tree; SOURCE = read from the code (EVID-001).

### Where each item is

| Item | Worker | Page |
|---|---|---|
| 1 Menace at the refusal | `BlockRefusals.menaceAttacker` (the attacker's game id in Forge's "cannot be blocked with N creatures" reason, only when that attacker has Forge's `Keyword.MENACE`); `CombatChoices#blocksAccepted` -> `GameHost#offerBlockRefused`; `GameHost#publishSnapshots` drains it once (`BlockRefusals.drain`) into every seat's snapshot and the public view as `blockRefused` | `match.ts` `asBlockRefused` (only `why: "menace"`); `fromSnapshot.ts` `Moments.menaceRefused` (attackers on the table); `Board.tsx`, the `menacePopped` effect: `pulseSquare` on `.bf-mark[data-mark="kw:menace"]` once per board key, after `holdLeft()`, none with reduce motion |
| 2 Prevention on the life shield | (unchanged: player `preventNext`, hit `by: "prevent-next"`, 0101) | `PreventBadge.tsx` (grow `PREVENT_GROW_MS`; the tick starts at the blow: in combat `lifeTicks.ts` `preventedBlowIn` -- `lifeSteps` now also marks a stopped part's blow on the fight clock (`LifeStep.prevented`, amount 0) -- timed again through `onLifeClocks` when the fight clock starts after the plate is drawn; for a spell `PREVENT_TICK_AT_MS`; `PREVENT_STEP_MS` a step; shrink `PREVENT_GONE_MS`; hurried by a click; words `preventWords`); `GameScreen.tsx` `SeatBlock` draws it, `plateFacts` gives `preventSoaked`; `game.css` `.gs-prevent` (24 x 24 at (187, 47) in the plate's padding box); the plate's screen-reader line |
| 2 The creature's square in combat | -- | `lifeTicks.ts` `lifeSteps` also marks a creature's stopped part (`LifeStep.object`, seat -1: no plate's number); `CardBadges.tsx` `usePreventStart` reads `preventedBlowIn(card id)` when the square is drawn used, and again through `onLifeClocks` when the board's fight clock starts after it (before the frame is painted, so the CSS tick starts once), never after its tick began; else `PREVENT_TICK_AT_MS` |
| 2 Part of a hit, one look | -- | `Board.tsx`, the damage effect's `wards` pass: no pale shield for a stopped part when the same source's hit on that player or creature got through (`refKey`); a fight's strikes were already merged (`fights.ts`) |

Protocol: `protocol/README.md` (`blockRefused`), `docs/architecture/MATCH_PROTOCOL.md`. Server: no change (the delta is generic: set on the board that has it, unset on the next; RUN below). CI: the menace-prevention deck built beside the outcomes deck (`.github/workflows/ci.yml`); the real-click game is `match-outcomes.spec.ts`'s second test, so the browser deal (`ci/browser-shard.mjs`, by file) is unchanged.

### Tests and results (RUN, this tree)

- Worker: `BlockRefusalsTest` (2). Whole `mvn -q -o test`, both orders: pass (gates).
- Lab x3 (`check-blocks.py` menace + reasons, `check-survive-rows.py` all eight scenarios, the two new ones included): every scenario OK in every run. `check-blocks.py menace` saw `blockRefused [{attacker: the Brute, blockers: [the Bear], why: "menace"}]` on exactly one board per seat, the same round on both, with the lone block in `combat.blocks`.
- Hidden checks over the 30 traces of the three runs: snapshot-first, hidden-hands, hidden-log, kinds, hidden-mulligans, hidden-information OK; hidden-tops `problems: []`; check-wording 0 hits. `check-deltas.py` over them: every board rebuilt equal (7,254 boards, 3,962 sent as deltas, 1,010 resumes); `as-sent-traces.py --rebuilt` the same. As sent, the refusal board's MATCH_DELTA carries `set.blockRefused` and the next board's `unset: ["blockRefused"]`, both seats.
- Page: `fixes0125.test.tsx` (6: one look for part of a spell hit -- Lava Axe's 5 into a Craw Wurm's 3: the square ticks, the red −2, no pale shield; a Bolt all stopped keeps the pale shield and grey 0; the creature's square in combat -- Bob's 3/3 into Alice's shielded Bears, the 3 holding until the Giant's blow on the fight clock, then a step each, then gone; the pop on either seat's screen, once per board, nothing else pulsing or moving; none without a refusal or with reduce motion; `fromSnapshot`), `fixes0125screen.test.tsx` (8, the real game screen: appears with Bob's words or "you", grows in; ticks 3, 2, 1, 0 and shrinks away, the pale shield shown for the whole Bolt; Lava Axe's part: the same tick, no pale shield; **in combat (a 6/6 into 3) the tick waits for the blow on the fight clock, 3 holding until it lands**; a fight clock already playing when the board comes: the tick waits for its blow, another seat's blow does not count; the turn's end: no tick, it goes; reduce motion). `motion.test.ts` pace table gains `PreventBadge.tsx`. tsc, eslint, prettier, vitest (whole), vite build: pass (gates).
- Gates (`gates.sh`): worker-fwd, worker-rev, server, npm-ci, tsc, eslint, prettier, vitest, vite, docrefs, check-deltas self-test, as-sent-traces self-test, test-switch: all PASS.

### Bites (TEST-004)

Worker 4/4 caught: W1 any attacker's too-few-blockers told (unit), W2 told again next round (unit), W3 the refusal never reaching the boards, as on main (Lab: "seat 1/2: exactly one board tells the refusal: []"), W4 only seat 1 told (Lab: seat 2). Page 20/20 caught: P1 no pulse, P2 a second pop on the same board, P3 a pop with reduce motion, P4 the parser taking any `why`, P5 the pulse on another square, P6 no badge, P7 the soaked hit not seen, P8 no shrink at 0, P9 the partial hit's pale shield back, P10 "you" lost on your own plate, P11 no grow, P12 the steps off their beat, P13 the badge ignoring reduce motion, P14 the combat tick on the fixed beat (before the blow), P15 not timed again when the fight clock starts after the plate, P16 no blow marker for a stopped part, P17 the creature square on the fixed beat in combat, P18 no blow marker for a creature's stopped part, P19 the creature square not timed again when the fight clock starts after it, P20 the one look for players only (a creature's partial pale shield back).

### On the local stack (RUN, stack A rebuilt from this branch, build e7faab11, PROXIC_TEST_DEALS on, 2026-11-28)

- **Real-click game** (`match-outcomes.spec.ts`, second test; deck `protocol/fixtures/menace-prevention-deck`):
  - The host really attacks with Boggart Brute. The guest really clicks Grizzly Bears, then the Brute, then Done blocking. The note "Boggart Brute has menace: block it with two or more creatures." shows, and the Bears stay blocking.
  - Both pages' recorders saw the menace square's pop-on at the attack (450 ms at this pace) and then the why-pulse at the refusal (625 ms, `WHY_PULSE_MS`).
  - She takes the Bears back with a real click; the Brute's 3 lands (20 to 17).
  - The host Bolts her, and she really casts Healing Salve ("Prevent the next 3...", aimed at her own life). The badge shows on her plate on both pages and ticks 3 to 0 (`data-used` "3-0"), with the pale shield over her life shield for the whole Bolt. She stays at 17.
  - The host's Lava Axe meets a second Salve: the badge ticks again, no pale shield appears on either page (a pale shield is counted each time one appears), and she goes to 15.
  - Passed with the guest at 1920 x 1080 and at 1920 x 947.
- **Found here and fixed (commit e7faab11):** the badge often never showed (3 of 4 early runs). The Salve's board and the Bolt's board arrive a few hundred ms apart, and the host's page holds the guest's spell on the table (`HOLD_MS`), so it never drew the Salve's board: the count went from none to none. Both the plate's badge and the creature's square now tick from the hit's own `prevented` amount (F-0125-H; bites P21, P22). On the host's page the badge is still not seen *waiting* in that case (the held board is skipped, as P11-A1 designed); it shows as the Bolt lands, ticking 3 to 0.
- **The badge's fit, measured** (the recorder, at rest, the guest's plate; boxes in screen px):
  - At 1920 x 1080 (rail scale 1.2): badge 28.8 px; 3.6 px inside the plate's right edge; 6 px above the tiles; clear of the poison badge's place, the status tray and the life number (2.4 px below it); overlapping the life shield's lower right.
  - At 1920 x 947: badge 25.7 px; 2.9 px inside the plate's edge; 5 px above the tiles; 1.9 px below the life number; clear of poison and the tray.

  The game asserts all of these on both pages.
- **Stills, read by eye** (scratch `a6/shots9`, `a6/shots-947`, `a6/strip9.png`, `a6/strip947.png`):
  - The menace refusal on both screens: the Brute's gold menace square on the attacking card, the Bears in front, the guest's note on her combat button.
  - The Salve's trail landing on her shield.
  - Mid-tick: the pale shield over the life shield, the grey 0 to its left, the badge at the shield's lower right showing 1 or 2.
  - The Lava Axe at 1920 x 947: the red −2 and the crack, the badge ticking (1), no pale shield.
  - The badge's 3 waiting, both screens.

  Nothing overlaps; nothing on the table moves.
- **Whole-machine replays,** CI machine match 2/6 (12 specs, 14 tests, 4x CPU, `node ci/ci-speed.mjs --whole`): 4 of 4 passed (14 passed each, 0 skipped; 21.8, 19.5, 19.0 and 19.8 min).

### Left for CI and the release

- `ci/browser-durations.json` still weighs `match-outcomes.spec.ts` at 126 s; it now runs about 1.8 min longer. It is left as is, so CI's deal over its machines is unchanged; the next durations refresh will move it.
