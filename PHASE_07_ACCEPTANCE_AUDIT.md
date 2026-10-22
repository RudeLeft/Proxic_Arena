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

| Status | Count |
|---|---|
| MET | 15 |
| PARTIAL | 10 |
| NOT MET | 1 |
| OWNER | 1 |
| **Total** | **27** |

## The 27

| ID | Test | Status | Evidence, or what is missing |
|---|---|---|---|
| P7-A | Layout renders correctly 1366×768 → 3840×2160, continuously | MET | `layout.test.ts` "§7.42 properties, across viewports × counts × both seats" (8 viewports, 1366×768 to 3840×2160, ultrawide included) and "continuity: a 1px resize moves no card more than a few px"; `battlefield.spec.ts` "the drawn battlefield is exactly layout()'s" in a real browser |
| P7-B | 23 permanents in a zone render legibly via the overflow ladder | MET | the property suite runs 23, 31 and 60 per kind at every viewport (no overlap, readable floor); `layout.test.ts` "a pile is one slot of the overflow ladder" |
| P7-C | Every permanent type in the Mechanics Lab corpus has a defined zone | PARTIAL | Rows come from Forge's own `kind` (creature, land, other), never from names, and every kind has a row (`layout.test.ts` "creature before land before other": Dryad Arbor, Urza's Saga, Darksteel Citadel). Missing: a check over **the corpus itself** that every permanent it can put on the battlefield gets a row |
| P7-D | A permanent that changes type behaves per §7.11 (moves at once) | PARTIAL | The board is drawn from each snapshot afresh, so a new type is a new row; `check-characteristics.py` (Blood Moon makes Evolving Wilds a Mountain, in a real game) proves Forge's new type reaches the snapshot. Missing: a test that the SAME card moves rows the moment its type changes |
| P7-E | Face-down: card back to both, identity to controller only | MET | `check-face-down.py` (65 frames, both seats), `match-face-down.spec.ts` (browser), `Board.test.tsx` "an opponent's face-down card shows no name" |
| P7-F | A card with 3 actions exposes all 3; none reachable only by default | PARTIAL | `interaction.test.ts` "several are offered (AMENDMENT 12)" (two actions on one card become a choice, never a default). Missing: three actions, in a real browser game |
| P7-G | Primary click outside a Forge context selects and does not attack | PARTIAL | `interaction.test.ts` "selects when nothing is being asked, or nothing is asked about that object". Missing: the same in a real browser game |
| P7-H | Targeting: source visible, candidates visible, cancel works | PARTIAL | Targets are choosable on the board and arrows drawn from the stack (`Board.test.tsx` line tests; screenshots 2026-10-21). Missing: an automated browser test that cancels a targeted spell and checks nothing was cast |
| P7-I | An unmapped decision kind renders a usable generic fallback | PARTIAL | Every kind is answered through the generic list (`questionOf` lists whatever the board cannot show; `MatchPanel` hints fall back to a generic line). Missing: a test that feeds an unknown kind and answers it |
| P7-J | Reconnect rebuilds the board from the snapshot alone and play continues | MET | `match-session.spec.ts` (reload mid-game), `reconnect.test.ts` (the game connection retries on its own and sets the question aside), and the 2026-10-21 server-restart run (both players reconnected without a reload) |
| P7-K | Dropping an event costs an animation, not correctness | PARTIAL | The board is a function of the latest snapshot; an older snapshot arriving late is ignored (`match.test.ts`). Missing: a test that skipping snapshots between two states draws the same final board as applying every one |
| P7-L | Attachments render from relationship data, not parsed text | MET | `check-attachments.py` (real games), `match-attachments.spec.ts` (browser), `layout.test.ts` "attachments" |
| P7-M | Texture strategy measured under a 60-permanent board | MET | `benchmark.spec.ts`, `docs/testing/evidence/p7-benchmark.json` (80 permanents, 60 distinct pictures) |
| P7-N | Layout property suite green across viewport × card-count matrix | MET | `layout.test.ts` (8 viewports × 7 counts × both seats), in CI |
| P7-O | Owner has seen and accepted the board | OWNER | The owner's sign-off, at the exit gate |
| P7-P | Every card's `getBoundingClientRect()` equals `layout()`'s box | MET | `battlefield.spec.ts` "the drawn battlefield is exactly layout()'s", and "after every change the board moves, then settles exactly where layout() says" |
| P7-Q | The §6 performance budget is met on the synthetic board, numbers committed | MET | `p7-benchmark.json`, re-measured 2026-10-21 with the pictures the game really sends (384-px copies): 46.1 MB at 4K (budget 150), first paint ~30 ms, new face ~30 ms, 60 fps through a full re-centre (Amendment 8's correction) |
| P7-R | Default stops: quiet turns pass; a spell on the stack stops; an added stop is honoured; no non-priority question auto-answered | MET | `check-stops.py` (quiet, respond, nothing, skip), `match-stops.spec.ts` (browser) |
| P7-S | Unpayable spell dimmed, still clickable, Forge decides; Force of Will not dimmed when its alternative cost can be paid | PARTIAL | `check-board-data.py` "afford" (Shivan Dragon, Fling: dimmed exactly when unpayable, over every offer); `check-costs.py` "force-of-will" (cast with no lands). Missing: the Force of Will offer's `payable` flag checked to be true |
| P7-T | Concede: opponent is Forge's winner; Abandon still ends with none | MET | `check-concede.py`, `match-concede.spec.ts`, `lobby.test.ts` |
| P7-U | The game record holds every question, answer and refusal of a real match; only an administrator can read it | PARTIAL | `GameRecordTest`, `AdminApiTest` "an administrator downloads a match's game record" (a player is refused); seen by hand on a real local game 2026-10-21 (81 lines). Missing: an automated check against a **real match** |
| P7-V | Identical untapped basics pile from the start; a tapped one leaves the pile | MET | `layout.test.ts` "identical untapped basics are one slot from the start", "tapped basics form their own pile"; seen in every browser game |
| P7-W | A back-face picture is shown for the back face; without one, a text frame, never the front's picture | NOT MET | The "never the front's picture" half holds (`MatchArtTest` "a transformed card does not borrow its front's art"). Showing a back-face picture waits for the Proxic Deck Builder to export back-face images |
| P7-X | Every §7.61 addition reaches both seats correctly, none carries hidden information | MET | `check-board-data.py` (combat, stack, tokens, face-down, afford, options over 5,000+ options), `check-hidden-hands.py` and `check-snapshot-first.py` over every Lab game, `check-mana-cost.py`, `check-blocks.py` "reasons" |
| P7-Y | The pages work through real clicks; a player reaches no admin route; the last administrator cannot be disabled or demoted | MET | `auth.spec`, `decks.spec`, `lobby.spec`, `admin.spec` (browser); `AdminApiTest` "a player reaches no admin route", "the last active administrator cannot be disabled or demoted" |
| P7-Z | Force close of a room mid-match ends it with no winner; both players told | MET | `admin.spec.ts` "force closing a room mid-game ends the match with no winner, for both players" |
| P7-AA | Deck names: duplicate import or rename refused; renaming a deck selected in a room works and the other seat sees the new name | PARTIAL | `decks.spec.ts` "one name per player: a clash asks for another, rename refuses one"; `DeckDepotPhase7ApiTest` rename tests. Missing: renaming a deck that is selected in a room, with the other seat seeing the new name |

## What closes the gaps

| Gap | Plan |
|---|---|
| P7-C | A check over the Mechanics Lab corpus: every card that can be a permanent gets a row from its Forge `kind` |
| P7-D | A layout test: the same card id with a new type is in its new row in the next layout |
| P7-F, G, H, I | One browser spec on a small fixture deck: a card with three actions (all offered), a click with nothing asked (selects, no attack), a targeted spell cancelled (nothing cast), an unknown question kind answered through the list |
| P7-K | A test that a board built from the last snapshot alone equals one built through every snapshot in between |
| P7-S | `check-costs.py` force-of-will also asserts the offer is not dimmed |
| P7-U | A browser spec: play a short real match, abandon it, download its record as the administrator, and find each question, answer and both seats' snapshots in it; the player is refused |
| P7-AA | A browser or API test: rename a deck selected in a room; the other seat's room shows the new name |
| P7-W | Waits on the Deck Builder's back-face export (owner) |
| P7-O | The owner's acceptance, at the exit gate |
