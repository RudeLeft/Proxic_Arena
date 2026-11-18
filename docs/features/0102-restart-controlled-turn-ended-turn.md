# 0102 — Turns and whole games: Karn's restart, a turn played by the other player, a turn ended or skipped

**Status:** Approved 2026-11-17 (owner, by prompt, deep dive 3). Phase 10.
**Owner decisions** (`Phase 10 deep dive 3 decisions.md`, all approved 2026-11-17):
missed Q6 (the sweep, riffle and 0089's deal) + round 2 Q6 **B** (the window opens first and holds the sweep until closed or 4 s) · missed Q7 **A** (Mindslaver: a window plus a gold chain round the plate for that turn; "Playing for Alice" instead of a seat number) · missed Q8 **A** (Time Stop or a skipped turn/step: one window line, to the other player).

Canvases (untracked, `frontend/zz-canvas/`): `deep3-round2-1117.html` "Q6 Karn: the window", option B; `deep3-missed-1117.html` "Q6" option A (the sweep itself), "Q7" option A and "Bob's seat: the heading of his windows", "Q8" option A. Research: `Phase 10 deep dive 3.md` A6, A7, A8.

## Why (researched)

Line numbers at HEAD (4a5acfe, 1.72.0). Forge paths are under `spikes/forge-phase0a/forge-upstream/forge-game/src/main/java/forge/game/`.

### Karn's restart

- **The epoch** (SOURCE). Forge fires `GameEventGameRestarted` (`phase/PhaseHandler.java:1153`); the worker's `EpochCounter` (`GameHost.java:1440-1459`) bumps `epoch` (756-759), clears `lifeChanges`, and calls `reports.restarted(...)`. The snapshot carries `gameEpoch` (`ViewerSnapshot.java:93`; also `MATCH_STEP` `GameHost.java:723`, `DECISION_REQUEST` `WorkerMain.java:327`; `protocol/README.md:99-100`). Card ids are kept across the restart (`protocol/README.md:145-149`; `GameHost.java:748-754`).
- **The page plays nothing across an epoch change** (SOURCE). `fromSnapshot.ts`: `openingOf` returns null unless the previous board has the same epoch (97), so **0089's deal never plays for game 2's first board**; `tileMovesOf` returns `[]` (235); `withLeavers` pairs nothing (494); the was-on-board sets need the same epoch (759); `sizesOf` returns null (910); `pileFan.ts:105`, `theirCast.ts:122`, `turnStart.tsx:34,40`, `flights.tsx:250,261` do the same; `match.ts:1229` drops a `MATCH_STEP` of another epoch. So the table is swapped in one frame.
- **The window** (SOURCE). `ActionReports.restarted()` (921-947): actor = the player who restarted, picture = Karn as it was on the battlefield (1242-1248); words "<Name>|You restarted the game. This is game N." (1456-1457); `case RESTART -> reader != actor` (1521-1522), so Bob (Karn's controller) gets none. The page keys "closed reports" per epoch (`GameScreen.tsx:1775`, `proxic:reports-closed:${matchId}:${gameEpoch}`), and `ReportBook` is not cleared on restart, so game 1's unclosed reports gather with the RESTART one (SOURCE; not run).
- **TRACE `karn`** (both seats): 1,140 frames at `gameEpoch: 1`, 10 at `gameEpoch: 2`; "restarted the game. This is game 2." three times; epoch 2 has `turn: 0` frames (the new opening hand) and DECISION_REQUESTs. `check-karn.py`: "Forge restarted the game, game 2 is a new epoch, and nothing from game 1 can act in it".
- Existing pieces to reuse: the library riffle (`Board.tsx:5597-5625` and 8002-8028, `riffleFrames`, `.bf-return-riffle`, `battlefield.css:2257`) and 0089's deal (`opening.ts`: `DEAL_BEAT_MS` 100, `DEAL_MS` 500, :20-21; triggered `fromSnapshot.ts:896` → `GameScreen.tsx:2184`).

### Mindslaver

- **The heading names a seat number** (SOURCE): `GameScreen.tsx:1984-1985` ("Playing for seat ${decision.actedForSeat}"), combat heading 2295-2297, `WindowFacts.actingFor` 2501-2507 ("Playing for seat N (Name)"), also 4078 and 4099; `GameWindow.tsx:60` hides the `actingFor` line when the title starts "Playing for seat". `actedForSeat`/`authorisedSeat` come on `DECISION_REQUEST` (`WorkerMain.java:322-323`, `DecisionGate.java:89`), the name from `board.players` (2501-2507). TRACE `mindslaver`: 8 decisions `actedForSeat 2, authorisedSeat 1` (Alice playing Bob's turn).
- **Nothing tells the controlled player** (SOURCE). The snapshot has no "controlled by" (grep `controll|activePlayer` in `ViewerSnapshot.java`: only card controllers, 504, 730); the worker does not listen to `GameEventPlayerControl` (grep: none). Forge answers it: `Player.getControllingPlayer()` (`player/Player.java:2526`), `isControlled()` (2533), the event at 2547, `PlayerView.getMindSlaveMaster()` (`player/PlayerView.java:396`). No report kind for it (`ActionReports.java:128-164`).

### Ending the turn, skipping

- **Time Stop / Sundial** (SOURCE): `ability/effects/EndTurnEffect.java:21-59` exiles the stack (43), clears it (46), ends combat and calls `endTurnByEffect()` (`PhaseHandler.java:1238-1243`), which fires an ordinary `GameEventTurnPhase` (cleanup): nothing marks the turn as ended by an effect.
- **Skipped turns and steps fire no event at all** (SOURCE). `SkipTurnEffect.java:31-59` makes a `BeginTurn` replacement applied at `PhaseHandler.java:871-876` (straight to the next player; no `GameEventTurnBegan` for the skipped turn). `SkipPhaseEffect.java:49-104` makes a `BeginPhase` replacement applied at 196-205, which returns before `fireEvent(GameEventTurnPhase)` at 216.
- The worker listens to `GameEventTurnPhase` (`GameHost.java:775`, `ActionReports.java:283`) and `GameEventTurnBegan` (`ActionReports.java:288`) only; nothing for EndTurn/SkipTurn/SkipPhase (grep: none). No Lab game plays any of them (deep dive 3, D).

## What the player sees

Alice is you (bottom), Bob the other player.

1. **Karn restarts the game (round 2 Q6 B; `deep3-round2-1117.html` "Q6", option B; the sweep from `deep3-missed-1117.html` "Q6", option A).** Bob's Karn −14 resolves. **Your report window opens first**: Bob's medallion, "BOB · KARN LIBERATED", "Bob restarted the game. This is game 2.", Karn's picture, and a thin bar along its foot draining over 4 seconds. Nothing on the table moves while it is open. When you close it, or the 4 s run out, every card sweeps home (after 4 s the window itself stays open until you close it): each permanent, hand card and graveyard card glides into its **owner's** Library tile, one after another (about 50 ms apart), the library counts rising as they land; the cards exiled with Karn glide to Bob's Exile tile; both lives rise to 20 as floating numbers. Both libraries **riffle**, then 0089's opening deal plays for game 2 ("GAME 2 · BEFORE THE GAME" on the turn panel). Bob, whose ability it was, gets no window: his table sweeps at once. A click hurries it, as everywhere.
2. **Bob plays your turn (missed Q7 A; "Q7", option A).** Bob sacrificed Mindslaver; at the start of your turn 9 **you** get the window: "Bob is playing your turn", with Mindslaver's picture. A thin gold chain runs round your plate, with Mindslaver's square on it, until the turn ends. On **Bob's** page every window heading says "Playing for Alice", never "Playing for seat 1" (the canvas's "Bob's seat" scene).
3. **The turn ends early, or is skipped (missed Q8 A; "Q8", option A).** You Bolt Bob; Bob answers with Time Stop. Your Bolt crumbles (0101 item 2) and goes to your Exile tile; **you** get one window line: "Bob ended the turn: the spells on the stack were exiled.", with Time Stop's and the Bolt's pictures (→ exile). Time Stop's line comes at once, as it resolves. A skip uses the same window, one line, **when the skip effect resolves** (often a turn before the skip itself): "Bob's spell: you skip your next turn." or, for Fatespinner, "Bob's spell: you skip your combat." Bob gets no window for his own Time Stop.

House rules: windows go to the other player only; no banner (round 2 Q6 C's banner was not chosen); no pills; rising numbers; no "Forge" in player text.

## Changes

### Worker

- **Item 1:** the epoch, the RESTART report (to `reader != actor`), kept ids and turn 0 of game 2 already exist (TRACE `karn`). One change: **`ReportBook` is cleared at the restart** (in `EpochCounter`, `GameHost.java:1440-1459`, before `reports.restarted(...)`), for every reader, so game 1's reports never gather into the RESTART window (Decided 1).
- **Item 2:** each player entry gets `controlledBy: seat` while `Player.getControllingPlayer()` is not that player (`Player.java:2526`; refreshed on `GameEventPlayerControl`, 2547). A new report kind **CONTROL** at the controlled turn's start (`GameEventTurnBegan` with a controlled active player): actor = the controller, picture = the card that made it (Mindslaver; Forge's effect source, or the last resolved stack host as `restarted()` does), told to the controlled player only.
- **Item 3:** a new report kind **END_TURN** when an `ApiType.EndTurn` effect resolves (the stack exiled with it as the report's cards, `to: exile`), and **SKIP** when an `ApiType.SkipTurn` or `ApiType.SkipPhase` effect resolves (words from the effect's parameters: whose turn / which step: "<Actor>'s spell: you skip your next turn."). Both told to every reader other than the actor. END_TURN is made as the effect resolves (immediate); SKIP is made when the skip effect resolves, not when the turn or step is later skipped (Forge fires nothing then; Decided 2).

### Protocol

`protocol/README.md`, `match.ts`: player `controlledBy`; action kinds CONTROL, END_TURN, SKIP. Optional fields.

### Server

None (`MatchArt` maps report cards already; verify the new kinds pass through `MatchReports.kt` unchanged).

### Page

- **Item 1.** `fromSnapshot.ts`: a new `restart` result when `gameEpoch` rises: the previous board's cards by owner and zone, the new board's exile (ids kept, so Karn's cards are matched), and the new opening (`openingOf` allowed across exactly one epoch rise when the new board is at `turn === 0`; line 97). `GameScreen.tsx`: while the RESTART report is open (and at most 4 s, a draining bar in `RevealTray`), keep drawing the **previous** board; the window stays open after the 4 s until the player closes it (Decided 3); then hand `Board` the sweep (glide every card to its owner's `:library` tile, Karn's to the Exile tile; library counts tick on landing via `tickTile`), both riffles, then the deal. Bob's page (no window) starts the sweep at once. Every other epoch-gated path stays as it is (no moves are guessed across the epoch).
- **Item 2.** The headings (`GameScreen.tsx` 1984-1985, 2295-2297, 2501-2507, 4078, 4099) read "Playing for <name>" from `board.players`; `GameWindow.tsx:60` adjusted to the new title. The plate (`SeatBlock`, `GameScreen.tsx:3176`) draws the gold chain while that seat's `controlledBy` is set, with the source's square.
- **Item 3.** None beyond the report window (the generic window renders any kind; its words come from the worker).
- Reduce motion: no sweep or riffle: the window, then the new table and the deal's end state.

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0102-A | Page: a snapshot pair across epochs 1 → 2: the old board stays while the RESTART window is open; on close (or at 4 s, the window still open after) every old card's last frame is on its owner's Library tile; Karn's exiled card ends on Bob's Exile tile; riffle then deal play; on Bob's page the sweep starts at once | `fixes0102screen.test.tsx` (real game screen, socket replaced); extend `check-karn.py` only if the worker changes |
| F-0102-B | Worker: `controlledBy` set on Bob's entry for Alice's Mindslaver turn and cleared after; CONTROL report to Bob only | worker unit; extend `check-mindslaver.py` 3 times; hidden checks over its trace (the controller sees the controlled player's hand only as Forge's `canBeShownTo` allows) |
| F-0102-C | Page: no heading on either page contains "seat "; "Playing for Alice" on Bob's | `fixes0102screen.test.tsx`; grep test over `GameScreen.tsx` strings |
| F-0102-D | Worker: Time Stop → END_TURN report to the other player with the exiled stack, in the snapshot after it resolves; Fatespinner / a skip-your-next-turn card → SKIP when the effect resolves; after a restart the report book holds only the RESTART report | worker unit; new Lab `check-turn-ends.py` (Time Stop, a skip-turn card, Fatespinner) 3 times |
| F-0102-E | Real game (TEST-012), below | extend `match-karn.spec.ts` and `match-mindslaver.spec.ts` |
| F-0102-F | No new jumps: the jump checker learns to compare across a restart (today it does not, deep dive 3 A6), and `karn`, `mindslaver`, the new trace show none | `scripts/check-jumps.py` change + run on those traces |

**TEST-004 (bites):** the hold (sweep starts before close), the sweep's destination (owner's tile, not the viewer's), `openingOf` across epochs, the name in the heading, CONTROL's reader, END_TURN's reader.

**Real-click game (TEST-012).** `match-karn.spec.ts`: the guest's page **really clicks Close** on the RESTART window; the test checks no card moved before the click, the cards reach the Library tiles after, and the deal plays; the host's page sweeps without a window. `match-mindslaver.spec.ts`: on the controlled player's page the CONTROL window and the chain; on the controller's page the heading reads "Playing for <name>" and the controller **really clicks** a land for the controlled player. Clips: Karn (guest's seat, normal speed), Mindslaver (both seats: they differ), Time Stop (the other player's seat).

## Risks

- **Hidden information.** The sweep moves the other player's hand cards as backs (they are hidden): they glide from the hand fan to that player's Library tile face down; graveyard and battlefield cards face up. Nothing new is sent. The controller's view of the controlled player's hand is Forge's (`CardView.canBeShownTo`, Mindslaver master case) and is unchanged.
- **Holding the board.** While the window holds the sweep, game 2's decisions (mulligan) may already be waiting. The decision window must not open over the held old board: hold it until the deal ends (PROTO-002 is kept: the state is there, only drawn late). A reconnect during the hold draws game 2 directly.
- **Speed.** About 60-100 cards glide in one sweep (50 ms apart in the canvas means several seconds for a big board): cap the stagger so the sweep ends within about 1.5 s, measured with `match-speed.spec.ts`.
- **Jump check.** Across a restart the checker compares nothing today; teaching it (F-0102-F) may surface old cases.

## Decided 2026-11-17 (owner, by prompt, via the coordinator)

1. **Game 1's open reports at the restart: cleared.** The worker clears the report book at the restart, so the RESTART window shows alone (worker change, item 1).
2. **When a skip is told: when the skip effect resolves**, worded "Bob's spell: you skip your next turn." Time Stop (end the turn) is told at once, as it resolves.
3. **The 4-second hold:** after 4 s the sweep plays and the window stays open until the player closes it, as 0088's reports stay.

## Build order notes

Third of the four. Item 3 relies on 0101 item 2 (the crumble for the exiled stack), so build after 0101. Item 2 is small and independent (headings + chain); item 1 is the biggest single page change in these four specs (`GameScreen.tsx` hold, `fromSnapshot.ts` restart result, `Board.tsx` sweep) and should be its own build step, last inside this spec.
