# 0123 — Phase 11 P11-A2: a drawn card comes off the Library tile (and A3 closed)

**Status:** **Approved by the owner 2026-11-27 (by prompt: "As it leaves"; A3 "Close it")**; built 2026-11-27 (As built, at the end). Phase 11, items P11-A2 and P11-A3 (step 10 of the recommended order, "the small look fixes"). Canvas the owner saw: `Proxic canvases/a2-a3-library-glow.html` ("Library and Glow Timing").
**Owner decisions** (2026-11-27, by prompt, after the canvas):

- **A2: "As it leaves"** (the canvas's Option A, recommended). The Library number drops by one as each card lifts off the Library tile, the way a mill, Light Up the Stage and a card leaving a graveyard already count. The drawn card lifts off its owner's Library tile and glides to the hand: Alice sees her card turn face up on the way; Bob sees only a card back go from her Library to her hand (never more than today, HID rules). When a resolving spell made the draw, the cards go after the spell has resolved, a beat apart: cause, then effect.
- **A3: "Close it"**. Since spec 0099 the glow already waits for the card. Add one unit test that fails if a pile tile's glow ever comes on before the card's landing tick (bite-checked, TEST-004); the one way it could still come on early (the other player's held-spell boards, `HOLD_MS`) belongs to P11-A1 and is folded into A1's row.

## Why (researched)

Researched 2026-11-27 at origin/main 48b8ff8b (re-checked while building at 6b4df553). SOURCE = read in code, RUN = filmed or measured, INFERENCE = reasoned. The research's scratch evidence (slow-motion clips of agent-of-kotis board 57/58, `a3clips/`, `a2-kotis-full.jpg`) is in the lead's scratch folder.

**A2, the Library number** (spec 0099 "Left open": "Draws (the Library number) still change as the board arrives").

- The Library tile shows the player's `libraryCount` straight from the board (`battlefield/GameScreen.tsx`, `SeatBlock`'s `.gs-zone-n`), so it drops the moment the board arrives (SOURCE). Only the board's own tile ticks hold it back, and those exist only for the restart sweep (`Board.tsx` `restartSweep`), mills and cards exiled off the library (the mill stream in `Board`'s movement effect, spec 0074/0081) and the opening deal (spec 0089). Nothing ticks the library for a draw (SOURCE).
- `fromSnapshot.ts` `tileMovesOf` skips every move out of a library that is not going to a graveyard or exile (SOURCE), and `boardFromSnapshot`'s `arrivals` is filled only for cards new to the battlefield (SOURCE). The dev fixture fakes `viewer:library` for its draw (`fixture.ts`), but a real game never sets it (SOURCE).
- So a new hand card enters by `Board.tsx`'s generic entry, `boxAt(where[arrivals?.get(item.id) ?? "stack"])`: from the **stack's spot**, starting at 0.2 opacity, delayed only by `hold`, over `MOVE_MS` (SOURCE). Filmed: a drawn card's first frame is the stack spot, mid-table (RUN, the research's clips).
- A draw a resolving spell made (Village Rites, "draw two") reaches the hand **before** the spell is shown resolving: a hand entry is paced by `hold` alone (`pace` in `Board`'s movement effect), not `RESOLVE_MS` (SOURCE; RUN, agent-of-kotis board 58: Library 49 -> 47 at +0.03 s, both cards in the hand by +0.30 s, Village Rites glowing at +0.70 s).
- How often (RUN, 432 Lab traces of 2026-11-22, both seats, every `library -> hand` move): 2,420 of your own draws (each named by the game), 2,460 of the other player's (never named: an id is a live handle on a hidden card); 113 own and 75 other draws in a board where a stack entry resolved; 11 and 7 of them with a mill in the same board; 12,166 at turn 0 (the opening deal, spec 0089's).

**A3, the pile glow** (0099 "Risks": "the gold playable glow of the tile is unchanged").

- Already fixed by spec 0099 (SOURCE): `Board.tsx` `playFans` holds a tile dark (`TILE_DARK`) until its first card rises out of it (`firstRise`), and a new fan card rises only once the board's cards have landed on its tile (`landed(tile)` from the tile ticks, plus `FAN_AFTER_LAND_MS`). Filmed (RUN, 2026-11-27): Agent of Kotis dying, Bonecrusher Giant's Stomp going to exile, Faithless Looting's discards, Light Up the Stage's exile: the glow comes on after the card lands, every time.
- The one way left (INFERENCE, not seen): on the other player's page a held spell's boards (`GameScreen.tsx` `HOLD_MS`) were never drawn, so a card that arrived meanwhile has no landing on record. That is P11-A1's problem ("a board skipped during a hold gives its moves to the board drawn", built in spec 0119), and is folded into A1's row.

## What the player sees

1. **Alice draws for her turn.** Her Library reads 40. The top card lifts off the tile, the number ticks to 39 at that moment, the card turns face up on its way and lands in her hand. On Bob's screen a card back goes from Alice's Library to her hand, and her number ticks the same way. (Today: 39 at once, and a faint card appears mid-table, where spells sit.)
2. **Bob casts Village Rites (sacrificing Agent of Kotis): draw two.** Village Rites glows as it resolves; then the first card lifts off his Library (49 -> 48), a beat later the second (48 -> 47); both glide to his hand. (Today: 47 at once, both cards in the hand before Village Rites is shown resolving.)
3. **Alice casts a tutor that puts a card into her hand** (Sylvan Scrying): the card comes off her Library the same way. Bob sees a back unless the game shows him the card.
4. **Thought Scour: mill two, then draw.** The two milled cards stream off the Library to the graveyard (68, 67, 66), then the drawn card lifts off (65). Every number shown once, in order.
5. **Unchanged:** the opening hand and mulligans (spec 0089's deal), the restart sweep (spec 0102), a card back to a hand or a library (A-14), a card out of a graveyard (0074), and every other pile's count.

## The change (page only)

- `fromSnapshot.ts` `boardFromSnapshot`: for each `library -> hand` move in the update (not in an opening update, `openingOf`), a named card now in a hand arrives from `<side>:library` (its owner's library, the move's `from.seat`). The other player's unnamed draws go to their hand's **new** backs, the last ones (`hidden-hand:<seat>:<i>` for the backs that were not there before), by place only, never by an id; A-14's returns take the first new backs, in the record's order, as before.
- `opening.ts` `DRAW_BEAT_MS` (`paced(150)`, the canvas's 0.40 s then 0.55 s).
- `Board.tsx`, `Board`'s movement effect, the generic entry of a new element: a hand card (or back) with a library arrival lifts off the Library tile (`boxAt` at the tile, the start every tile-born card uses) at `hold`, plus `RESOLVE_MS` when this board's stack lost an entry, after this board's mill stream off the same library, plus `DRAW_BEAT_MS` per card; one `tick(<side>:library, delay, -1)` per card, so the existing tile run (`tickTile`, 0099 Amendment 1's `tileRuns` carry-over and the 0108 follow-up) holds the number until each card leaves.
  - Yours, or one the game shows you: the card turns face up on the way (`turnUp(path, "face")`) while a card back flies the same path and turns away (a `turn: "back"` ghost): the turn the board already uses for a card leaving the other player's hidden hand (spec 0073). Spec 0089's own deal flip (`opening.ts` `dealFrames`) is built for the opening window's card-and-back elements; the board's hand card has no back of its own, so 0073's two-element turn is the board's equivalent, with the same look (a back narrowing edge-on, the face widening in).
  - Theirs, hidden: their new back, a back the whole way; unseen until it lifts (its first frame transparent, as 0089's redeal backs).

## Rules and boundaries

- **HID-001/HID-005.** Nothing new is sent; the page uses the moves it already has. The other player's draw is a back from their Library to their hand, matched to a back by place, never by an id; the drawn card's face is never drawn for them (bite M7 below). A drawn card the game shows the viewer (a revealed hand) is drawn as the game sends it.
- **ARCH-002 / UI-001.** No rule is read: which cards were drawn, from whose library, is the game's move record.
- **PROTO-007.** The move is a presentation hint; a dropped move costs the animation only (the card then enters as before), and the tile still ends on the game's number.
- **Spec 0089, 0102, 0099 Amendment 1, 0108.** The opening update is skipped (0089 plays it), the restart branch never reaches this entry (0102), the tile ticks go through the same `tickTile` and `tileRuns` (the carry-over still counts 68, 67, 66, 65).

## Must hold

1. The Library number never drops before a card leaves its tile; each drawn card's lift and its tick are the same moment.
2. A draw made by a resolving spell starts after `RESOLVE_MS`; several cards a beat apart.
3. Your draw's first drawn frame is on your Library tile; the other player's too, as a back, never a face.
4. The opening deal (0089) and the restart sweep (0102) are not played twice.
5. Tutors (library -> hand) come from the tile the same way.
6. Mill then draw, and a draw arriving mid-mill (0108 follow-up): every number once, in order.
7. Nothing jumps (P10-R1).
8. A3: a pile tile's glow never comes on before the card's landing tick.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0123-A | The number drops as each card leaves: a spell's draw two reads 49 while it resolves, 48 as the first card lifts, 47 a beat later; the lift and the tick at the same moment; mill two then draw reads 68, 67, 66, 65, the draw last | unit (`fixes0123.test.tsx`, the real Board), fails on origin/main |
| F-0123-B | Your drawn card's first frame is on your Library tile; a back flies the same path and turns away as the face turns in; nothing on the tile while it waits | unit (`fixes0123.test.tsx`) |
| F-0123-C | The other player's unnamed draws go to their new backs (the last ones), through `boardFromSnapshot`; the back lifts off their Library tile, never a face, unseen while it waits; your named draw arrives from your library; an opening update sets no draw arrivals | unit (`fixes0123.test.tsx`), fails on origin/main |
| F-0123-D | A3: a pile tile is held dark at least until its number's landing tick (a creature dying with a use from the graveyard; a spell going to exile with a use from there) | unit (`fixes0123.test.tsx`), bite-checked |
| F-0123-E | 0074 (`fixes0074`, the mid-mill draw 68, 67, 66, 65), 0099 (`fixes0099*`) and 0089 (`fixes0089*`) unchanged | unit, green |
| F-0123-F | Lab replays of draw-heavy traces and agent-of-kotis board 57/58, both seats: every drawn card's first frame at its owner's Library tile, no jumps | jump tool (`tools/jumps/jumps.spec.ts`, `scripts/check-jumps.py`) on the chosen traces; stills read by eye |
| F-0123-G | A real game (TEST-012): the player's turn draw, the tile's number read while the card is on its way | browser (`e2e/match-draw-from-library.spec.ts`, stack A) |

## Not in this spec

- A draw that comes with a cast or a land play from the same hidden hand in one update (their backs only shift): no new back exists to carry it, so that draw's number still changes as the board arrives (STUB-005; today's look). Trigger: seen on film or reported.
- The held-board case of A3: P11-A1.

## Amendments

None.

## As built (2026-11-27)

Page only, as "The change" says (commit 915cfe09; the browser test and its CI line in the next commit). Built on origin/main 6b4df553. Stack A (port 8080) rebuilt from this branch for every RUN below; the Lab traces are the 432 of 2026-11-22 (the lead's scratch `b4-mycheck/`), replayed into today's page (a page-only change).

**What a player notices.** A drawn card now lifts off its owner's Library tile and glides to the hand: your own turns face up on the way; the other player's is a card back the whole way. The Library number drops by one as each card leaves the tile. A draw a spell made waits for the spell: Village Rites glows, then its two cards leave a beat apart (the number 50, 49, 48 with them). A surveil or mill in the same update goes first, then the draw.

**Unit tests** (`frontend/src/battlefield/fixes0123.test.tsx`, 12 tests; RUN, vitest):

- F-0123-A: draw two while a spell resolves reads 49 until `RESOLVE_MS`, 48, then 47 a `DRAW_BEAT_MS` later; each lift and its tick on the same moment; mill two then draw reads 68, 67, 66, 65 with the draw last; a turn's draw lifts at once.
- F-0123-B: your drawn card's first frame on your Library tile (not the stack's spot); a back on the same path turning away as the face turns in; nothing seen on the tile while it waits.
- F-0123-C: through `boardFromSnapshot`, the other player's unnamed draws go to the last new backs; your named draw arrives from your library; an opening update sets no draw arrival; on the page their back lifts off their tile, a back the whole way (no turn, no ghost with a picture); a held-back board's draw waits for the spell.
- F-0123-D (A3): a pile tile is held dark at least until its number's landing tick, for a creature dying into a graveyard with a use there and a spell going to exile with a use there.
- On origin/main (Board.tsx and fromSnapshot.ts put back, the tests kept): 8 of the 12 fail (every F-0123-A timing test, the back-and-face test, all four F-0123-C tests). The four that pass there are guards of what already held: the turn's-draw-at-once test, the first-frame test with an arrival handed in (the Board already honoured an arrival; nothing set one), and the two A3 tests (0099 had fixed it).
- Full vitest: 150 files, 2,013 tests passing, with `motion.test.ts`'s pace table classifying `DRAW_BEAT_MS` as a move (it failed until classified, as it should).

**Bites** (TEST-004; each mutation applied alone, `fixes0123.test.tsx` run; all 13 caught):

| Mutation | Caught by |
|---|---|
| M1 no tick as each card leaves | 4 tests (F-0123-A x3, the held-back board) |
| M2 no `RESOLVE_MS` wait | 4 tests |
| M3 no beat between cards | 3 tests |
| M4 the draw ignores this board's mill | the mill-then-draw test |
| M5 your card not turned (no face-up turn) | the back-and-face test |
| M6 their back seen on the tile while it waits | the their-back test |
| M7 HID: their back given a face turn and a picture ghost | the their-back test ("never a face") |
| M8 your named draw given no arrival | the own-draw arrivals test |
| M9 their unnamed draws not mapped | 2 tests |
| M10 the opening update played again (0089 twice) | the own-draw/opening test |
| M11 their draws mapped to old backs, not the new ones | 2 tests |
| A3-M1 the tile dark only for the hold | both A3 tests |
| A3-M2 the fan's rise ignores the landing (0099 undone) | the creature A3 test |

**Lab replays** (F-0123-F; RUN, the jump tool, real Edge window, both seats): agent-of-kotis, anywhere-opt, card-actions-mill, card-trays-piles (Fact or Fiction), card-trays-tutor (Demonic Tutor), life-changes-sign (Sign in Blood), top-goes-home, turn-ends-meditate, who-did-it-scour. `scripts/check-jumps.py`: 408 boards, **no findings** (no jump, pop-in, blink or unseen move). Every card new to a hand on a board whose moves draw it (93 appearances: 49 own, 44 the other player's backs) is first drawn at its owner's Library tile: own at (1776, 935) +-4 px, theirs at (1774, 154) +-2 px; none elsewhere (scratch `a2/firstframes.py`). Village Rites (agent-of-kotis, board 48 in the tool's numbering; the research's 57/58): its cards first drawn 483 and 666-683 ms after the board, on both seats.

**Stills, read by eye** (slow-motion clips, scratch `a2/clips/` and the sheets `a2/*-sheet.jpg`):

- Your turn draw (agent-of-kotis seat 1, board 23): Library 52, then 51 as a small card back sits on the tile and lifts; the back glides down-left, turns edge-on, and a face-up Swamp lands in the hand. Nothing appears mid-table.
- The other player's draw (seat 2, board 23): Alice's Library 52 -> 51 as a back lifts off her tile; it glides along the top into her fan as a back; no face at any frame.
- Village Rites, Bob's own page (seat 2, board 48): Library 50 while Village Rites glows; 49 as the first back lifts, 48 as the second does; the backs turn face up on the way; Graveyard 1 -> 2 when Village Rites' card lands.
- Village Rites, Alice's page (seat 1): Bob's Library 50 while it glows, 49, 48 as the two backs lift; both go to his fan as backs.
- Mill and draw (surveil-consider-graveyard seat 1, board 7, Consider): 52 while Consider glows; 51 as the surveilled Island lifts and streams to the graveyard; 50 as the drawn card lifts after it; Graveyard 0 -> 1 -> 2 (the Island, then Consider).

**Real game** (F-0123-G, TEST-012; `frontend/e2e/match-draw-from-library.spec.ts`, stack A, RUN 47 s): the guest really plays lands, casts Agent of Kotis, casts Village Rites and really clicks the Agent to sacrifice it. Both pages, every frame: every card new to a hand after the opening first drawn 1-4 px from its owner's Library tile (6 per page: turn draws both ways, and Village Rites' two); on the guest's page the Library read 51 until 499 ms, 50 until 683 ms, then 49, the cards first drawn at 499 and 683 ms; on the host's page Bob's Library 50 at 483 ms and 49 at 666 ms, his two backs first drawn at 483 and 683 ms. **Bite:** stack A rebuilt with origin/main's Board.tsx and fromSnapshot.ts: the test fails (the first new back drawn 353 px from the Library tile, at the stack's spot); a copy with that check made soft fails on "the first card waited for Village Rites" (both cards first drawn at 0 ms, the Library at 48 from the board's first frame). Stack A was then rebuilt from this branch.

**A test changed with it.** `match-small-fixes`' 0108 mill test counts each card-back ghost starting on the player's half of the screen as a milled card's stream. A drawn card's back now starts there too (Thought Scour draws after its mill), so the first CI-speed run of machine 2 read three streams for Thought Scour's two (`card:106`, `card:103` and the drawn `card:112`). The tiles counted one at a time and passed. The recorder now marks a ghost whose card is in this player's hand (`toHand`) and leaves it out: a milled card never is. After the change the test passes (streams `card:106`, `card:114`, and the land played `card:34` as before).

**CI speed** (`node ci/ci-speed.mjs --whole`, 4x CPU, stack A, Playwright's Chromium; RUN 2026-11-27):

- Machine 6 (this spec's, with `match-surveil`): 13 of 13 passed (20.8 min).
- Machine 3 (`match-last-jumps`, Village Rites): 17 passed, 1 skipped (`match-wording-pages`' five-copy test needs `PROXIC_E2E_CONTAINER`, set only on CI).
- Machine 2 (`match-small-fixes`, Thought Scour; `match-reports-comfort`, Brainstorm): the first run failed only the mill test above (fixed). The second run passed the mill test, but `match-reports-comfort` timed out before turn 1 in `settlePregame` (it passed in the first run). Two reruns with its neighbour: 1 passed; 1 failed before any game, on an empty `/api/rooms/current` body in `clearEverything`.
- Machine 1 (`match-opening-hand`, 0089's deal): 9 passed, 1 skipped (`match.spec.ts`' abandon test). `match-away`, `match-big-combat` and `match-opening-hand` timed out before turn 1 (`settlePregame`, or waiting for the opening window while the game was already at turn 1). Rerun with their neighbours on the same build: 5 of 5 passed.
- The pregame timeouts are recorded in ROADMAP's flake list (TEST-013). They are not counted here as this spec's. Each one stopped before any draw, in the turn-0 opening, which this spec leaves to 0089 (its update is skipped: bite M10). The same build passed each on a rerun. During those runs another builder was using stack B on the same PC, and an account outside the test pair signed in to stack A. CI's run of the pushed commit is the current RUN for the full suites (TEST-013).

**Gates** (the lead's gate script, on this branch with these docs; RUN 2026-11-27): worker (both orders), server (ktlint, detekt, tests), tsc (page and browser tests), eslint, prettier, vitest, vite build, doc refs, `check-deltas.py`, `as-sent-traces.py`, the test switch: all PASS. Run without its `npm ci` step: this worktree's `frontend/node_modules` was linked to the main checkout's, whose installed set matches this lockfile (a fresh install was not run). A first attempt with the step was stopped before it reached `npm ci`. Its worker run read FAIL with no output while another Maven run of mine overlapped; alone, and then in the full run, it passed.

**Left open.** A draw that comes in the same update as a cast or a land played from the same hidden hand (no new back to carry it) still changes the number as the board arrives ("Not in this spec"). The held-board glow case is P11-A1's.
