# Phase 7 — acceptance audit

**2026-10-21.** Phase 7 is LOCKED (2026-10-20) and active. This audits
what is built against the 27 acceptance tests, P7-A through P7-AA, in
`PHASE_07_BATTLEFIELD_PRESENTATION_INTERACTION_LOCKED.md` §7.48.

This is **not an exit gate**. It is a status report: what is proven,
what is only partly proven, and what is missing, so the gaps can be
closed before the owner is asked to sign the phase off.

## How each row was decided

The same rules as the Phase 6 audit.

| Status | Means |
|---|---|
| **MET** | Implemented, and evidence of the kind the test asks for exists and has been run. |
| **PARTIAL** | Implemented, but the required evidence is missing, weaker than asked for, or covers only part of the test. |
| **NOT MET** | Not implemented, or no evidence at all. |
| **OWNER** | Only the owner can decide it. |

`RUN` evidence for a pure function (`layout()`) is its unit and property
suite, run in CI: the function IS the system there. For anything a player
does, `RUN` means a real game or a real browser, not a unit test alone
(AGENTS TEST-011).

## Where it stands

**Updated 2026-10-21, later.** Every partial is closed. Two of the new
tests found faults on the way, both fixed: a renamed deck kept its old
name in the other player's room until a reload (P7-AA), and the Mechanics
Lab's combat and Dismember checks had wrong expectations (two Knights can
attack; a hand of Swamps casts nothing). What is left is the back-face
pictures (P7-W, waiting on the Deck Builder) and the owner's sign-off.

| Status | Count |
|---|---|
| MET | 25 |
| PARTIAL | 0 |
| NOT MET | 1 |
| OWNER | 1 |
| **Total** | **27** |

## The 27

| ID | Test | Status | Evidence, or what is missing |
|---|---|---|---|
| P7-A | Layout renders correctly 1366×768 → 3840×2160, continuously | MET | `layout.test.ts` "§7.42 properties, across viewports × counts × both seats" (8 viewports, 1366×768 to 3840×2160, ultrawide included) and "continuity: a 1px resize moves no card more than a few px"; `battlefield.spec.ts` "the drawn battlefield is exactly layout()'s" in a real browser |
| P7-B | 23 permanents in a zone render legibly via the overflow ladder | MET | the property suite runs 23, 31 and 60 per kind at every viewport (no overlap, readable floor); `layout.test.ts` "a pile is one slot of the overflow ladder" |
| P7-C | Every permanent type in the Mechanics Lab corpus has a defined zone | MET | `check-kinds.py`, in CI over every Mechanics Lab game: every permanent Forge puts on a battlefield, in every snapshot to both seats, has a row -- the one its CURRENT type line says (run locally over the whole Lab 2026-10-21: 62 different permanents, 767,824 sightings, none without its row); rows from Forge's `kind`, with an unknown kind falling back to the noncreature row (`layout.test.ts`) |
| P7-D | A permanent that changes type behaves per §7.11 (moves at once) | MET | `layout.test.ts` "a permanent that changes type moves rows at once (§7.11, P7-D)": the same card id goes land → creature row → back, and an Equipment leaves the creature row, in the next layout, nothing else moving; `check-characteristics.py` proves Forge's changed type reaches the snapshot in a real game (Blood Moon) |
| P7-E | Face-down: card back to both, identity to controller only | MET | `check-face-down.py` (65 frames, both seats), `match-face-down.spec.ts` (browser), `Board.test.tsx` "an opponent's face-down card shows no name" |
| P7-F | A card with 3 actions exposes all 3; none reachable only by default | MET | `check-shapes.py` "fuse" (real game): Wear // Tear in hand offers all three for the one card -- Wear, Tear, and both fused -- and the fused cast is the one taken; `interaction.test.ts`: several answers for one card are offered, never one by default |
| P7-G | Primary click outside a Forge context selects and does not attack | MET | `match-interaction.spec.ts` (real browser game): clicking your own creature while nothing is asked about it selects it, it does not attack, and the open question stays open; `interaction.test.ts` "selects when nothing is being asked" |
| P7-H | Targeting: source visible, candidates visible, cancel works | MET | `match-interaction.spec.ts` (real browser game): starting Shock / Lightning Bolt / Lightning Strike shows the opponent as a target; Pass at the target question casts nothing -- the card stays in hand, the stack is empty, nobody takes damage |
| P7-I | An unmapped decision kind renders a usable generic fallback | MET | `interaction.test.ts` "a question kind this page has never seen": an unknown kind is shown as a question (not mistaken for priority), its answers are on the board or in the list with nothing dropped, a click answers, and the heading and hint are generic but never blank. No real game can be made to ask an unmapped kind on demand; every kind Forge asks today goes through this same path |
| P7-J | Reconnect rebuilds the board from the snapshot alone and play continues | MET | `match-session.spec.ts` (reload mid-game), `reconnect.test.ts` (the game connection retries on its own and sets the question aside), and the 2026-10-21 server-restart run (both players reconnected without a reload) |
| P7-K | Dropping an event costs an animation, not correctness | MET | `Board.test.tsx` "a missed update costs only the movement": a board shown 12 updates in one jump ends with every slot exactly where the board shown every update ends; an older snapshot arriving late is ignored (`match.test.ts`) |
| P7-L | Attachments render from relationship data, not parsed text | MET | `check-attachments.py` (real games), `match-attachments.spec.ts` (browser), `layout.test.ts` "attachments" |
| P7-M | Texture strategy measured under a 60-permanent board | MET | `benchmark.spec.ts`, `docs/testing/evidence/p7-benchmark.json` (80 permanents, 60 distinct pictures) |
| P7-N | Layout property suite green across viewport × card-count matrix | MET | `layout.test.ts` (8 viewports × 7 counts × both seats), in CI |
| P7-O | Owner has seen and accepted the board | OWNER | The owner's sign-off, at the exit gate |
| P7-P | Every card's `getBoundingClientRect()` equals `layout()`'s box | MET | `battlefield.spec.ts` "the drawn battlefield is exactly layout()'s", and "after every change the board moves, then settles exactly where layout() says" |
| P7-Q | The §6 performance budget is met on the synthetic board, numbers committed | MET | `p7-benchmark.json`, re-measured 2026-10-21 with the pictures the game really sends (384-px copies): 46.1 MB at 4K (budget 150), first paint ~30 ms, new face ~30 ms, 60 fps through a full re-centre (Amendment 8's correction) |
| P7-R | Default stops: quiet turns pass; a spell on the stack stops; an added stop is honoured; no non-priority question auto-answered | MET | `check-stops.py` (quiet, respond, nothing, skip), `match-stops.spec.ts` (browser) |
| P7-S | Unpayable spell dimmed, still clickable, Forge decides; Force of Will not dimmed when its alternative cost can be paid | MET | `check-board-data.py` "afford" (Shivan Dragon, Fling: dimmed exactly when unpayable, on every offer); `check-costs.py` "force-of-will": with no lands, Force of Will's {3}{U}{U} offer is dimmed and its pay-1-life alternative is not, and casting it counters the spell |
| P7-T | Concede: opponent is Forge's winner; Abandon still ends with none | MET | `check-concede.py`, `match-concede.spec.ts`, `lobby.test.ts` |
| P7-U | The game record holds every question, answer and refusal of a real match; only an administrator can read it | MET | `match-record.spec.ts` (real browser match): questions with their seat and options, answers and their acceptance, a server-refused answer, both seats' snapshots and Forge's game log, all in order, downloaded by the administrator; the other player is refused (403); the Admin page lists it. Also `GameRecordTest`, `AdminApiTest` |
| P7-V | Identical untapped basics pile from the start; a tapped one leaves the pile | MET | `layout.test.ts` "identical untapped basics are one slot from the start", "tapped basics form their own pile"; seen in every browser game |
| P7-W | A back-face picture is shown for the back face; without one, a text frame, never the front's picture | NOT MET | The "never the front's picture" half holds (`MatchArtTest` "a transformed card does not borrow its front's art"). Showing a back-face picture waits for the Proxic Deck Builder to export back-face images |
| P7-X | Every §7.61 addition reaches both seats correctly, none carries hidden information | MET | `check-board-data.py` (combat, stack, tokens, face-down, afford, options over 5,000+ options), `check-hidden-hands.py` and `check-snapshot-first.py` over every Lab game, `check-mana-cost.py`, `check-blocks.py` "reasons" |
| P7-Y | The pages work through real clicks; a player reaches no admin route; the last administrator cannot be disabled or demoted | MET | `auth.spec`, `decks.spec`, `lobby.spec`, `admin.spec` (browser); `AdminApiTest` "a player reaches no admin route", "the last active administrator cannot be disabled or demoted" |
| P7-Z | Force close of a room mid-match ends it with no winner; both players told | MET | `admin.spec.ts` "force closing a room mid-game ends the match with no winner, for both players" |
| P7-AA | Deck names: duplicate import or rename refused; renaming a deck selected in a room works and the other seat sees the new name | MET | `decks.spec.ts` "one name per player: a clash asks for another, rename refuses one" and "a deck selected in a room can be renamed, and the other player sees the new name" (real browser, two players; it found the room's deck list showing the old name until reload, fixed 2026-10-21) |

## What closes the gaps

| Gap | Plan |
|---|---|
| P7-W | Waits on the Deck Builder's back-face export (owner) |
| P7-O | The owner's acceptance, at the exit gate |
