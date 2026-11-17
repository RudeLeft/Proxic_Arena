# 0099 — The last two jumps: a card cast out of your library, a creature paid as a cost

**Status:** Approved 2026-11-16 (owner, by prompt: Q1 "Approve"; Q2 "Fix all, count waits" -- Q2a, Q2b and Q2c all in this spec). Canvas: "Last Two Jumps" (Q1, Q2), https://claude.ai/artifact/RonoXEWctBj4ydA3wCrgQQ. Found by the Phase 10 final jump check (release 1.71 run: `frontend/tools/jumps/jumps.spec.ts` + `scripts/check-jumps.py`, 364 Lab traces, both seats); both confirmed by eye on the slow-motion clips. The owner approved fixing both before the Phase 10 play-through.

## Why (researched)

The final check found exactly two boards that still jump, out of every recorded board in the Lab. Everything below was read from the recordings (`<trace>.seat<N>.jsonl`, `report2.json`, the clips), the traces and the page's code at HEAD.

### Q1 — A card cast straight out of your library appears from nowhere

**What happens.** Trace `panglacial-wurm`, board 33. Bob cracks Evolving Wilds; while he searches his library he answers "Yes" to casting Panglacial Wurm from it. On **Bob's own page** (seat 2) the Wurm fades in at the middle of the table ("came from nowhere (cast:card:62)"). Alice's page (seat 1) is clean: her view of his cast rises from his Library tile.

Correction to the brief: the page with the gap is the **caster's own**, not the opponent's. Seat 2 is Bob (the snapshot's `seat` is 2, his plate is the bottom one, the clip shows "YOUR TURN"), and the cast card is his (`casting[0].seat` 2, move `library (seat 2) -> stack`).

**Root cause.** `frontend/src/battlefield/GameScreen.tsx:1057-1068`, `ownPileRise`. Your own spell rises from the card you clicked (`castFrom`, set on a board click, `GameScreen.tsx:1543-1544`). Nothing on the board was clicked here (the Wurm is chosen in a yes/no window, live as in the replay), so the page falls back to `ownPileRise`. For a library cast it returns the Library tile only when the card was the shown top card (spec 0088, Bolas's Citadel):

```ts
if (zone === "library")
  return (frames.current.previous?.libraryTop ?? []).some((c) => c.id === card.id)
    ? libraryTopBox(geometry, "viewer")
    : null;   // <- a card found by a search was never the top: no start, so it fades in
```

A `null` start makes `CastingCard` skip its rise (`CastingCard.tsx:451`, `if (!from) return;`): it is simply there. The other player's cast does not have this gap because `placeOf` (`GameScreen.tsx:5561`) falls back to the pile's tile for any zone; a free cast of your own from the library (no payment step) goes through `freeCast` and `placeOf` too, which is why it is clean (below).

**Every library cast in the run** (moves `library -> stack`, all 364 traces, both seats):

| Trace, board | Whose page | Top card shown? | Path | Result |
|---|---|---|---|---|
| anywhere-citadel 86 | caster (seat 1) | yes (Citadel) | `ownPileRise` → small card on the tile (0088) | clean |
| anywhere-citadel 86 | other (seat 2) | no | `placeOf` → their Library tile | clean |
| panglacial-wurm 33 | other (seat 1) | no | `placeOf` → their Library tile | clean |
| **panglacial-wurm 33** | **caster (seat 2)** | **no (a search)** | **`ownPileRise` → null** | **came from nowhere** |
| tracked-state-marvel 127 | caster (seat 1) | no | free cast (no payment) → `freeCast` → `placeOf` → Library tile | clean |
| tracked-state-marvel 127 | other (seat 2) | no | free cast → `placeOf` → their Library tile | clean |

So the gap is exactly "your own spell, with a payment step, cast from your library when it was not the shown top card". Panglacial Wurm is the only card in the Lab that does that.

### Q2 — A creature paid as a cost shows in the graveyard before it gets there

**What happens.** Trace `agent-of-kotis`, board 57, both seats. Bob casts Village Rites and sacrifices Agent of Kotis to pay for it. Agent of Kotis has an ability usable from the graveyard (Renew), so in the graveyard it stands in the fan beside Bob's plate (spec 0087). On the page:

- 0 ms: a faint copy of the Agent (opacity 0.3, tile size) is already on Bob's Graveyard tile. The Agent itself is still drawn on the table, inside its "x2" pile.
- 267 ms: the Agent lifts off its pile (it waited 250 ms for the cast card to step aside, spec 0091), folds (0.32 s), then flies to the graveyard.
- 617 ms: the faint copy starts rising out of the tile into the fan, **while the Agent is still folding on the table**.
- about 1,180 ms: the flying Agent reaches the tile. By then the fan card has risen and landed.

The checker reads frame 0 as a 928 px jump (978 px on Alice's page): the only drawn card:107 strong enough to count is the faint one on the tile. The Graveyard number also reads 1 from the first frames (clip frame 010, 250 ms in), about a second early.

**Root cause.** Not the cost payment itself. It is the fan's timing for a card that arrives from the battlefield:

1. `frontend/src/battlefield/Board.tsx:2576-2592` (`playFans`): a card new to a fan waits `max(hold, landed(tile) + 150, fresh ? settle + MOVE_MS + 150 : 0)` and then rises. For a card that came off the battlefield, `landed(tile)` is 0 and the "fresh" guess assumes it left at once and flew one `MOVE_MS` (0.45 s). It ignores the leaving card's own wait and its fate: the step-aside wait (250 ms), the spent fold (320 ms; a defeated card's shake and crack is 520 ms) and the peel off a pile (160 ms).
2. `Board.tsx:7868-7882`: the leaving card's real landing time (`ghost.delay + fateMs + peel + MOVE_MS`) is computed, but only recorded for a tile that is **already** changing this board (`if (!tile || !ticks.has(tile)) continue;`). Bob's Graveyard tile had nothing else landing, so the landing was dropped and `landed(tile)` stayed 0. The same gate is why the Graveyard **number** changed at once: no tile change was recorded, so `tickTile` never ran and the plate shows the new count the moment the board arrives (`GameScreen.tsx:3400`).
3. `Board.tsx:2587-2592` with `FanCards.tsx:194-198`: while the fan card waits, `fill: "backwards"` holds the rise's first frame, a faint tile-sized copy **on the tile**, from the first frame. That is what the checker saw.

**Why this one, and not the 265 other battlefield → graveyard boards.** Only a card with a use from its graveyard is drawn there as a card at all (the fan); every other dead creature just joins the tile. In the whole run only **two** boards put a card leaving the battlefield into a fan:

| Trace, board | Card | How it left | Fan card visible from | Fan rise starts | Leaving card lands | Checker |
|---|---|---|---|---|---|---|
| **agent-of-kotis 57** (both seats) | Agent of Kotis | sacrificed for Village Rites, out of an x2 pile | 0 ms (0.3) | 617 ms | ~1,180 ms | **jumped** |
| pay-picks-escape 22 (both seats) | Uro, Titan of Nature's Wrath | sacrificed by its own trigger | 0 ms (0.3) | 1,017 ms | ~784 ms | clean |

Uro is clean only by luck: its trigger leaving the stack added the resolve beat (0.38 s) to the guess, so the rise happened to start after Uro landed; and the checker did not count the faint copy because Uro's own leaving card was in full view at the same time. By eye it has the same faint copy on the tile from the first frame. Agent of Kotis is worse because it was in a pile (its leaving card is not drawn until it peels off, so the faint copy is the only one) and because it waited for the cast card to step aside.

**Other sacrifice-as-a-cost boards** (moves marked `spent`, off the battlefield; 52 boards, both seats): 8 paid for a spell cast in the same board (pay-picks-fireblast 16, two Mountains; spent-rites 18, Grizzly Bears; tracked-state-meren 48, Llanowar Elves) and 40 did not. All clean: none of those cards has a use from the graveyard, so none goes into a fan; the tile alone receives them. The early Graveyard number, though, is the same on every one of them, and on every plain death into a tile with nothing else landing that board (the number is never held for a dying card on its own).

## What changes

Page only (`GameScreen.tsx`, `Board.tsx`). No worker, server or protocol change.

1. **Q1 — your card cast out of your library rises from your Library tile.** In `ownPileRise`, a library cast that was not the shown top card starts from the Library tile (`boxAt(anchors(geometry)["viewer:library"], geometry)`), exactly as the other player's does (`placeOf`'s tile fallback) and as your own graveyard and exile casts already do. A shown top card keeps 0088's start (the small card on the tile). Face up the whole way: it is your card and you just saw it in your search.
2. **Q2a — a card leaving the table for a fan rises into the fan only after it has landed.** The leaving card's landing time (`delay + fate + peel + MOVE_MS`, already computed at `Board.tsx:7880-7881`) is recorded for its tile whether or not the tile is changing this board, and `playFans`' `landed(tile)` reads it. The fan card then rises `FAN_AFTER_LAND_MS` after the landing, as it already does after a discard or a spell landing there.
3. **Q2b — nothing on the tile before it lands.** A fan card waiting to rise is not drawn (opacity 0) until its rise starts; the rise itself is unchanged (0087's canvas: from 0.6 of the tile's size, faint, into its place). This applies to every new fan card that waits, so a flashback card going to the graveyard no longer shows faintly on the tile during its flight either.
4. **Q2c — the Graveyard (or Exile) number waits for the card.** The tile's number changes when the dying card lands, through the existing `tickTile`, for a card that is now in that pile. A token (gone, never counted) is not ticked. This is the only part that changes every death, not just fan cards; the owner may cut it (see Risks).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0099-A | Q1: on the caster's page, panglacial-wurm board 33's Wurm sets off from the bottom plate's Library tile; the other page unchanged | jump check before (1 finding) and after (0) on `panglacial-wurm`, both seats; one normal-speed clip, seat 2 |
| F-0099-B | Q1 unit: `ownPileRise` gives the Library tile for a library cast that was not the top card, the small top card for one that was (0088 unchanged) | `fixes0099screen.test.tsx`, fails on HEAD |
| F-0099-C | Q2: on agent-of-kotis board 57 the Agent's fan card is not drawn until the Agent has landed on the tile, and rises after it; both seats | jump check before (1 finding per seat) and after (0) on `agent-of-kotis`; recording shows no card:107 row at the tile with opacity ≥ 0.15 before the ghost's last row; one normal-speed clip, seat 1 |
| F-0099-D | Q2: Uro (pay-picks-escape 22) also: no faint copy on the tile before Uro lands | same recording read, both seats |
| F-0099-E | Q2c: the Graveyard number on agent-of-kotis 57 reads 0 until the Agent lands, then 1; a dying token does not change it | unit test on the tile ticks; clip frame read |
| F-0099-F | No new jumps anywhere | full jump check (364 traces, both seats) once, at release (TEST-013 2) |
| F-0099-G | Real game (TEST-012), below | `match-*` on the local stack |

**TEST-004 (bites).** Each unit test fails with its line of the fix removed: `ownPileRise`'s tile fallback; the landing recorded only for ticking tiles; the waiting fan card drawn at the rise's first frame; the number ticked for a token.

### Real-click game (TEST-012)

One game on the local stack using 0098's test deal (`startAMatch(..., { deal })`), extending `match-sacrifice.spec.ts` or a new `match-last-jumps.spec.ts`:

- **Q1:** the host is dealt Evolving Wilds and Forests in hand and Panglacial Wurm in the library. The host plays and cracks Wilds, answers **Yes** to casting the Wurm, pays, and the test checks the casting card's first drawn position is over the host's Library tile (not the middle), and the Wurm reaches the stack.
- **Q2:** the guest is dealt Agent of Kotis, Village Rites and a Swamp/Islands. The guest casts the Agent, then casts Village Rites and **clicks the Agent** to sacrifice it; the test checks, from both pages, that no Agent is drawn in the graveyard fan until the leaving Agent has gone, that the fan Agent is there afterwards, and that the Graveyard number read 0 until then (Q2c).

Proportion (TEST-013): the two Lab scripts (`check-panglacial-wurm.py`, `check-agent-of-kotis.py`) three times each, the hidden checks over their traces, the jump check on those two traces and `pay-picks-escape`, `anywhere-citadel`, `tracked-state-marvel` (the clean neighbours), `fixes0087*`/`fixes0088*`/`fixes0091*` and the new tests, tsc/eslint/prettier/vitest, the real-click game above. Two normal-speed clips (F-0099-A, F-0099-C). Full Lab and full browser suite: CI.

## Risks and choices

- **Q2c changes every death.** Today a dying creature's graveyard number changes the moment the game says so, a second before the creature arrives. Holding it is right by the "nothing jumps" promise and uses the code that already holds it when something else lands there too, but it touches all 267 battlefield → graveyard boards. If the owner prefers, Q2c can be its own spec; Q2a and Q2b fix the jump alone.
- **Q2b changes every waiting fan card**, not only dying ones (Think Twice into the graveyard, a card discarded with flashback): they no longer sit faint on the tile while their flight is under way. Re-run 0087's and 0088's clips' moments by reading their recordings, not refilming.
- The Graveyard tile's gold "playable" glow also lights when the board arrives, before the card lands. Not in this spec (it is the tile, not a card); noted for the efficiency/error-checking phase.

## As built

Built 2026-11-16 on main at 3b9d540 (uncommitted at the time of writing). Page only, as specified.

**The changes.**

- Q1 -- `GameScreen.tsx` `ownPileRise`: a library cast that was not the shown top card now returns `boxAt(anchors(geometry)["viewer:library"], geometry)` instead of `null` (the shown top card keeps 0088's `libraryTopBox`).
- Q2a / Q2c -- `Board.tsx`, the loop that counts leaving cards into a tile: a ghost going to a graveyard or exile tile is counted (`tick(tile, delay + fate + peel + MOVE_MS, 1)`) when the tile is already ticking **or** the card is now in a graveyard or exile (`pileCards`, the game screen's set of every card there). So `playFans`' `landed(tile)` reads the real landing time, and `tickTile` holds the number until the card lands. A card that was a token is never counted -- also when the tile was already ticking for another card: before, a token dying beside a creature counted too (the bite test shows the old code drawing "-1" first).
- Q2b -- `FanCards.tsx` `FAN_WAIT` + `Board.tsx` `playFans`: a new fan card that waits gets a second animation, opacity 0 for exactly its wait, made after the rise so it wins over the rise's held first frame. The rise itself is unchanged.

Not changed: stack spells' ghosts (their ids are stack ids, not card ids) still count only when the tile is ticking, as before; so a resolving spell's own graveyard number is as it was. The gold "playable" glow of the tile (Risks) is unchanged.

**Tests (F-0099-B, C, D, E).** `frontend/src/battlefield/fixes0099screen.test.tsx` (the real game screen, socket replaced): the Wurm found by a search rises from the Library tile, not the middle; a shown top card still rises from the small card (0088). `frontend/src/battlefield/fixes0099.test.tsx` (the real Board, one board then the next): the fan card's rise starts at or after the leaving creature's last ghost frame; its opacity is under 0.15 at 0, 250, 600 ms and the frame before landing, then rises; the Graveyard number reads 0 until the creature lands, then 1; a token dying beside a creature never changes the number (never -1, never 2); a token dying alone leaves it alone. The unit test names no real card (the Lab's `check-agent-of-kotis.py` fails if `frontend/src` names the card; it did, on a first draft).

**Bites (TEST-004), one per acceptance test, each restored after:**

| Line of the fix removed | Result |
|---|---|
| `ownPileRise`'s tile fallback back to `: null` | F-0099-B "found by a search" fails |
| the count gate back to `if (!ticks.has(tile)) continue` | 3 of 5 fail (rise before landing, faint copy, number early) |
| `FAN_WAIT` never played | "nothing of it is drawn on the tile while it waits" fails |
| the token guard disabled | "a dying token does not change it" fails: the tile reads "-1" first |

**Gates.** `npx tsc -b` clean; `npx eslint . --max-warnings=0` clean; `npx prettier --check src e2e tools` clean; vitest 100 files, 1472 tests passed.

**Lab (TEST-013 1).** `check-panglacial-wurm.py` 3/3 OK, `check-agent-of-kotis.py` 3/3 OK (after the test-name fix above), `check-hidden-hands/log/mulligans/tops.py` over those six traces: all OK.

**Jump check, before and after.** Before: the release 1.71 recordings. After: the local stack rebuilt with this change, `tools/jumps/jumps.spec.ts` headless (`PROXIC_E2E_CHANNEL=bundled`) on 19 traces, both seats (38 recordings, 24.8 min), then `scripts/check-jumps.py`:

| | Before | After |
|---|---|---|
| panglacial-wurm seat 2, board 33 | 1 (faded in on the spot, "came from nowhere") | 0 |
| agent-of-kotis board 57, seat 1 / seat 2 | 1 (jumped 928 px) / 1 (jumped 978 px) | 0 / 0 |
| the 17 neighbours (anywhere-citadel, anywhere-fetch, anywhere-unearth, pay-picks-escape, pay-picks-fireblast, piles-stage, piles-think-twice, piles-unearth, sacrifice-edict, spent-clue, spent-rites, spent-treasures, survivors-pyroclasm, tracked-state-marvel, tracked-state-meren, wipes-pestilence, wipes-wrath), both seats | 0 | 0 |

Every board count matched the before run. Recording read (F-0099-C, D): rows of the card drawn at opacity >= 0.15 before its leaving ghost's last row -- agent-of-kotis 57: 27 (seat 1) and 26 (seat 2) before, 0 and 0 after (the fan card first drawn 1,333 ms in, the ghost's last row 1,133 ms); pay-picks-escape 22 (Uro): 1 and 1 before, 0 and 0 after (fan card 983 ms, ghost 717 ms).

**Clips (by eye).** `JUMPS_CLIPS` (the tool's mode: a tenth of the speed, one still per 25 ms of animation):

- panglacial-wurm seat 2 board 33 -- still 001: the Wurm, small, at the Library tile's left edge on Bob's plate; 002-008 it rises up and left onto the table, growing; 010 on it rests where it is paid for. Nothing appears in the middle from nowhere. (Its first frames are partly under the plate's edge, as every rise out of a tile is.)
- agent-of-kotis seat 1 board 57 -- Bob's Graveyard tile reads 0 on stills 000-040 and 1 from 042 (about 1,050 ms, as the Agent arrives; before the fix it read 1 from the first stills). No faint card on the tile while the Agent folds and flies (000-046). The fan card first shows small and faint on the tile at 048, rises out and stands in the fan beside the plate from 056.

**Real game (F-0099-G, TEST-012).** `frontend/e2e/match-last-jumps.spec.ts`, new deck `protocol/fixtures/last-jumps-deck` (package built by CI, step added in `.github/workflows/ci.yml`), 0098's deal: The host is dealt Forests, three Llanowar Elves and Evolving Wilds; the guest Islands, Swamps, Agent of Kotis and Village Rites. The host cracks the Wilds on turn 5 and really clicks **Yes** to casting the Wurm in the search; the guest casts the Agent, then Village Rites, and really clicks the Agent to pay. Both pages record every frame. Passed three times running (41 s each), headless, bundled Chromium, local stack on :8080:

- Q1: the host's casting Wurm is first drawn at (1776, 935), 1 px from the host's Library tile and 907 px from the middle of the table; the Wurm then reaches the table.
- Q2, both pages: the leaving Agent drawn from about 205 to 1,010-1,070 ms; the fan Agent drawn at opacity >= 0.15 on **0** frames while it flew, in full view from about 1,630 ms; the Agent's Graveyard tile read 0 until about 1,260 ms, then counted it.

A first run hung for 20 minutes on an unbounded `getAttribute` of a casting card that had just gone (a test fault, fixed: every read in the loop is now `evaluateAll` or bounded).

**Left open.**

- The Graveyard number on the real game went 0 -> 2 at about 1,260 ms on the caster's page (on the other page too in one run of three; the other two showed 0, 1, 2 there): Village Rites resolved while the Agent was still landing, and a resolving spell's own count is held only when its tile is already ticking on that board (its ghost carries the stack id, not the card id -- unchanged by this spec). The dying Agent itself is never counted early. Holding a resolving spell's own number is a small follow-up if the owner wants "the number waits for the card" for spells too.
- Clips are the tool's tenth-speed stills (`JUMPS_CLIPS` has no normal-speed mode); TEST-013 3 asks for normal-speed clips. The owner's eyes (TEST-006) are still owed.
- F-0099-F (the full 364-trace jump check) is for the release run, as the spec says.

## Amendments

### Amendment 1 -- a spell's graveyard number waits for the spell card (Q3)

**Status:** Approved 2026-11-17 (owner, by prompt: "Approve all" -- the counts wait AND exile-bound spells fly to the Exile tile). Canvas: "Last Two Jumps", section Q3, https://claude.ai/artifact/RonoXEWctBj4ydA3wCrgQQ. Raised by the owner from "Left open" above: every resolving or countered spell's graveyard (or exile) number should wait until the spell card visibly arrives there, the same as a death.

#### Why (researched)

Read from `Board.tsx` and `fromSnapshot.ts` at 12c4a44, the 1.71 traces (`<trace>.jsonl`, both seats, 364 traces) and the 1.71 and post-0099 recordings. **The recordings do not hold the tiles' numbers** (rows are cards, ghosts, casts, flights and the stack; no `data-zone-tile` rows, `n` is always empty), so the number's timing below is reasoned from the source over the traces' moves (SOURCE + INFERENCE), and checked against the one RUN that did read the tile: 0099's real-click game. Where a ghost went was read from the recordings (RUN).

**1. The resolving spell's own +1 is never held unless the tile was already ticking** (SOURCE). A resolving spell's ghost is made at `Board.tsx:7670-7709` with `id: s.id` (the stack id, `stack:22`) and flies to `${side}:graveyard`, starting at `RESOLVE_MS + hold`. Spec 0099's count gate (`Board.tsx:7887-7888`) asks `pileCards?.has(ghost.id)`; `pileCards` holds card ids (`card:100`), so the stack id never matches and the ghost counts only when `ticks.has(tile)`. Every other board, the plate shows the new number the moment the board arrives, about 0.83 s (380 + 450 ms) before the card lands.

How often (traces, every move `stack -> graveyard` with no `why`, both seats): **392 board-seats in 154 traces** resolve a spell into a graveyard that nothing else lands in that board, so its number changes early; 34 are held correctly today because something else landed there too (Faithless Looting's discards, Wrath of God's creatures).

**2. Why the real game showed 0 -> 2, not 1 -> 2** (SOURCE + the RUN in "As built"). In agent-of-kotis the sacrifice and the resolution are **two boards** (trace board 57: Agent to the graveyard, Village Rites on the stack as `stack:22`; board 58: `card:100` from the stack to the graveyard). Board 57 ticks the tile (Q2c): the old "0" is held over the number and the number itself is hidden until the Agent lands. Board 58 arrives while that is still running; it does not tick the tile (cause 1), so React writes "2" into the hidden number and board 57's animation, still running, reveals it when the Agent lands: **0 -> 2 at about 1,260 ms**, exactly what the game read. The page that showed 0, 1, 2 got both changes in one board (the tile was ticking, so the spell counted).

**3. Fixing cause 1 alone would bring the Agent's early count back** (SOURCE). If board 58 ticks the tile, `tickTile` (`Board.tsx:1233-1260`) first removes board 57's held "0" and starts from `now - (this board's changes)` = 2 - 1 = **1**, at once, while the Agent is still flying. A new board's run must carry the previous run's changes that have not happened yet. The jump tool never shows this: it sends the next board only once the page is idle (`tools/jumps/jumps.spec.ts`, top comment), so in the Lab two boards never overlap. In a real game they do: in the traces, **22** of the 392 boards above follow a board that also landed a card in the same graveyard (the Village Rites shape).

**4. A spell that goes to exile on resolution flies to the Graveyard tile** (RUN, recordings). The resolving ghost's destination is always the graveyard (`Board.tsx:7686`); `departures` (`fromSnapshot.ts:788-808`) covers only cards that left the battlefield. Every `stack -> exile` board in the run (15 board-seats, 8 traces), the ghost's last drawn centre (1.71 recordings) is the Graveyard tile (x 1730), not the Exile tile (x about 1850), on both seats:

| Trace, board | Card | Why it goes to exile | Ghost ends at |
|---|---|---|---|
| piles-think-twice 59 | Think Twice | flashback | Graveyard tile, both seats |
| shapes-adventure 53, piles-giant 26 | Bonecrusher Giant (Stomp) | Adventure | Graveyard tile, both seats |
| shapes-aftermath 101 | Commit // Memory | aftermath | Graveyard tile (seat 1; seat 2 no ghost) |
| marks-distortion 20 | Distortion Strike | rebound | Graveyard tile, both seats |
| survivors-ephemerate 16 | Ephemerate | rebound | Graveyard tile, both seats |
| survivors-teferi 20 | Teferi's Protection | exiles itself | Graveyard tile, both seats |
| cost-kinds-from-stack 11 | Lightning Bolt | exiled from the stack as Nivmagus Elemental's cost | Graveyard tile, both seats |

So the card lands on the wrong tile and the Exile number changes at once with nothing arriving there. (Spec 0087's Adventure fan card then rises out of the Exile tile, after a guess.)

**Every other route** (traces, every move into a graveyard or exile, both seats; code at the line given):

| Route | Board-seats | Number today | By this amendment |
|---|---|---|---|
| Resolved, to a graveyard | 392 alone + 34 | early unless the tile was ticking (cause 1) | fixed |
| Resolved (or exiled from the stack), to exile | 15 | early, and the card flies to the Graveyard tile (cause 4) | fixed |
| Countered | 9 | waits: `tick(.., hold + COUNTER_MS, 1)` (`:7453`); its ghost is `own`, never counted twice | unchanged; destination from the game too (a "exile it instead" counter would fly to the Graveyard tile today; none in the Lab) |
| Did nothing (fizzled) | 6 | waits: `hold + FIZZLE_MS` (`:7597`) | unchanged; destination from the game too |
| Battlefield -> graveyard / exile (died, destroyed, sacrificed, exiled) | 313 | waits since 0099 Q2c (card id in `pileCards`); tokens never counted | unchanged, but gains the carry-over (cause 3) |
| Discarded, cycled (hand -> graveyard) | 76 | waits: `delay + DISCARD_MS` (`:5791`, `:5805`, `:6975`) | gains the carry-over |
| Milled (library -> graveyard) | 59 | waits: `delay + MILL_MS` (`:5855`, `:5864`) | gains the carry-over |
| Hand or library -> exile (Force of Will's cost, cascade, Hideaway) | 32 | waits (same code, spec 0081) | gains the carry-over |
| Graveyard -> exile, exile -> graveyard (shown, swept) | 42 | waits: `start + SHOW_MS`, `T + SWEPT_MS` | gains the carry-over |
| A copy of a spell | -- | never counted (it ceases to exist) | unchanged |

Also found, not in this amendment: Lightning Bolt exiled from the stack by Nivmagus Elemental's cost plays as a resolving spell (glow, and a spark to its target) although it never resolved. Its destination is fixed here; how it leaves the stack is a look question for its own spec (trigger: the owner asks, or the efficiency/error-checking phase).

#### What changes

Page only (`fromSnapshot.ts`, `Board.tsx`). No worker, server or protocol change.

1. **The game says where a spell card went.** `departures` also names, for each spell card that left the stack this board and is now in a graveyard or exile, that pile (`${side(owner)}:graveyard` or `:exile`), as it already does for the battlefield. The resolving ghost (`Board.tsx:7686`), the countered ghost (`:7428`) and the fizzled ghost (`:7580`) fly to that tile; the graveyard stays the default. A copy is unchanged.
2. **The spell's ghost counts by its card.** The ghost carries its card id (`card: s.card`); the count gate (`:7887-7888`) asks `pileCards.has(ghost.card ?? ghost.id)`, and the tile it counts toward is the departure's tile. A token or copy is never counted (unchanged). The countered and fizzled ticks use the same tile.
3. **A tile's number carries its unfinished changes into the next board.** `Board` keeps each tile's last run (its changes and when it started, on the board's animation clock, so a click's hurry still applies). A new board's run for that tile starts with the changes that have not yet happened, at their remaining times, before adding its own; a tile the new board does not change keeps its run as it is, and a board whose numbers disagree with what the runs add up to (a reconnect, a move with no animation) simply shows the new number, as today. Reduced motion: unchanged (numbers simply change).

With 1-3, Village Rites on Bob's screen reads 0 while both cards are on their way, 1 as the Agent lands (about 1.2 s), 2 as Village Rites lands; a flashback Think Twice flies into the Exile tile and the Exile number turns as it lands.

#### Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0099-H | A spell resolving alone into a graveyard: the number reads the old count until the spell's ghost has landed, then +1 | unit (`fixes0099.test.tsx`, real Board), fails on HEAD |
| F-0099-I | Two boards: a creature to the graveyard, then (mid-flight) the spell resolving: the number reads 0, then 1 as the creature lands, then 2 as the spell lands; never 1 before the creature lands, never 2 before the spell does | unit, fails on HEAD (HEAD: 0 -> 2); also fails with only change 2 (reads 1 at once) |
| F-0099-J | A spell exiled on resolution (flashback, Adventure, rebound) flies to the Exile tile and the Exile number waits for it; the Graveyard number does not change | unit; and the recordings: last ghost centre at the Exile tile on the 15 board-seats in the table above (all at the Graveyard tile in 1.71) |
| F-0099-K | Countered and fizzled spells: still counted exactly once, as they land (no double count with the new gate); a countered spell sent to exile flies there | unit |
| F-0099-L | The Adventure's fan card (shapes-adventure 53) rises after the spell card has landed on the Exile tile | recording read: no fan row at opacity >= 0.15 before the ghost's last row, both seats |
| F-0099-M | Real game (TEST-012), below | `match-last-jumps.spec.ts` on the local stack |
| F-0099-F | No new jumps anywhere | full jump check at release (TEST-013 2), as before |

**TEST-004 (bites).** Each unit test fails with its line removed: the gate back to `ghost.id`; the carry-over dropped; `departures` for stack cards dropped; the countered tick doubled.

**Real-click game (TEST-012).** Extend `match-last-jumps.spec.ts`; no new game. Its Q2 already plays the Village Rites moment for real: record the stack ghosts' frames too (`[data-ghost-of^="stack:"]`) and check, on both pages, that the Graveyard number never shows 2 before Village Rites' ghost has gone and never 1 before the Agent's has, and ends at 2 (this is the RUN that showed 0 -> 2). Optional, for the exile route with a real click: add Think Twice to the guest's deal and have the guest cast it, then click it in the graveyard fan for flashback; check its ghost ends over the guest's Exile tile and the Exile number turns only then. It lengthens the game by about two turns; recommended, since nothing else in a `match-*` game reaches a spell going to exile.

Proportion (TEST-013): the jump check on agent-of-kotis, piles-think-twice, shapes-adventure, piles-giant, shapes-aftermath, marks-distortion, survivors-ephemerate, survivors-teferi, cost-kinds-from-stack and anywhere-unearth (the tile-already-ticking neighbour), both seats; `fixes0074*`/`fixes0079*`/`fixes0087*`/`fixes0099*`; tsc/eslint/prettier/vitest; the extended real-click game three times. Full Lab and full browser suite: CI.

#### Risks

- **Every instant and sorcery changes**: 392 board-seats in the Lab show a graveyard number turning about 0.8 s later than today (when the card lands). That is the point, but it is the most-seen change in this spec.
- The carry-over (change 3) touches every tile number, including the library's (a draw while a mill is landing). The rule is narrow (only changes not yet reached, on the same clock), and a mismatch falls back to today's "show the new number".
- The jump tool cannot see change 3 (boards never overlap there); only the unit test and the real game prove it.

#### As built

Built 2026-11-17 on main at ff9bb40 (uncommitted at the time of writing). Page only, as specified, plus the real-click game's deck.

**The changes.**

- 1 -- `fromSnapshot.ts`: `departures` also names, for each spell card that left the stack this board and is now in a graveyard or exile, that pile (the game's `stack -> graveyard/exile` move, owner's side). **Found by the real game, not in the spec:** on the other player's page the board that shows their spell on the stack is held (`GameScreen.tsx` spotlight, `HOLD_MS`), and the board drawn after it is a later round's, whose `moves` are empty, so the move was lost and the flashback Think Twice still flew to the Graveyard tile there (and the Graveyard read 2, 1, 2 as its ghost was counted there). So, as the battlefield's departures already do, a spell card gone from the previous board's stack and now in a pile is sent there without the move too.
- 1 -- `Board.tsx`: the resolving, countered and fizzled ghosts fly to that pile (`pile`, the graveyard when not said); the countered and fizzled ticks count on it.
- 2 -- `Board.tsx`: the resolving ghost carries `card: s.card`; the count gate asks `pileCards.has(ghost.card ?? ghost.id)`. Tokens and copies are unchanged (a copy never reaches this ghost).
- 3 -- `Board.tsx`: `tileRuns` keeps each tile's last run (its changes, its newest number's animation, the number it ends on). A new board's run for that tile starts with the changes the last run has not reached (`c.at > run.currentTime`, the animation clock, so a hurry counts), at their remaining times, then its own -- only when the last run's number plus this board's changes is the number now; otherwise it counts from the new number as before. The old run is cancelled. `tickTile` returns the newest number's animation.

**Tests.** `fixes0099.test.tsx` (the real Board; the snapshot reducer for the departures): F-0099-H (a spell alone: 0 until its ghost lands, then 1); F-0099-I (the Agent's board, then 300 ms in the spell's board: 0, 1 as the Agent lands, 2 as the spell lands; and a board whose numbers disagree counts from the new number); F-0099-J (the ghost's last frame on the Exile tile, the Exile number waits, the Graveyard's never moves; the departure from the move alone and from the held-board comparison alone); F-0099-K (countered and fizzled: 0 until it lands, then exactly 1; a countered spell sent to exile flies there).

**Bites (TEST-004), each restored after** (`scratchpad/c99/bite.py`):

| Line of the fix removed | Result |
|---|---|
| the gate back to `ghost.id` | 4 fail (H, I twice, J) |
| the carry-over dropped (`carried` always empty) | F-0099-I fails (reads 1 at once: the spec's "only change 2") |
| `departures` for stack cards by the move dropped | F-0099-J's "by the move alone" fails |
| the held-board comparison dropped | F-0099-J's "held board" fails |
| the resolving ghost's `to` back to the graveyard | F-0099-J's ghost test fails |
| the countered tick doubled | both countered tests of F-0099-K fail |

**Gates.** `npx tsc -b` clean; `npx eslint . --max-warnings=0` clean; `npx prettier --check src e2e tools` clean; vitest 100 files, 1480 tests passed. No source names the Lab's cards (`Kotis`/`Renew`: none).

**Jump check, before and after** (`tools/jumps/jumps.spec.ts` headless, bundled Chromium, then `scripts/check-jumps.py`; 22 traces, both seats, 44 recordings, 2,147 boards). Before: the post-0099 recordings for agent-of-kotis, panglacial-wurm, piles-think-twice, anywhere-unearth, pay-picks-escape, spent-rites, wipes-wrath, wipes-pestilence, sacrifice-edict, and a fresh run of the HEAD stack for shapes-adventure, piles-giant, shapes-aftermath, marks-distortion, survivors-ephemerate, survivors-teferi, cost-kinds-from-stack, card-actions-counter, thrown-away-countered, copies-fizzle, survivors-pro-red, who-did-it-mindrot, card-actions-mill. After: the local stack rebuilt with this change.

| | Before | After |
|---|---|---|
| findings (jumps, pop-ins, unseen moves), all 44 recordings | 0 | 0 |
| board counts per trace and seat | -- | identical to before |
| the 15 `stack -> exile` board-seats (flashback, Adventure, aftermath, rebound, Teferi's Protection, exiled from the stack as a cost): ghost's last centre | Graveyard tile (x 1730), all 15 | **Exile tile (x 1850), all 15** |
| countered (4) and fizzled (4) board-seats | Graveyard tile | Graveyard tile (unchanged; the game sent them there) |
| F-0099-L: the Adventure's fan card (shapes-adventure 53, piles-giant 26) drawn at opacity >= 0.15 before the ghost's last row | 0 rows (both seats) | 0 rows (both seats): ghost lands +816 ms, the fan card from +983 ms |

**Clips (by eye)** -- `JUMPS_CLIPS` (a tenth of the speed, one still per 25 ms of animation), `scratchpad/c99/clipsrun/clips/`, sheets `sheet-think-twice-s1-b59.jpg`, `zoom-think-twice-landing.jpg`, `sheet-rites-s2-b57.jpg`:

- piles-think-twice seat 1 board 59 (Think Twice's flashback resolving): 000-012 it glows on the stack; 016-023 it drifts down, shrinking and fading, onto the **Exile** tile (the right one of the pair); Graveyard 0 throughout; Exile 0 until it has landed, 1 from about 026.
- agent-of-kotis seat 2 (Bob's own page) board 57, with board 58 (Village Rites resolving) sent 300 ms in, while the Agent is still on its way: the Graveyard reads 0 through 036, **1** from about 040 (the Agent lands), Village Rites glows (032-044) and drops onto the tile (048-052, still 1), **2** from 056; the fan Agent rises beside the plate from 048. Never 2 early, never a step back. (The Library reads 47 from still 012: Village Rites' two draws are counted as its board arrives -- unchanged, not in this amendment.)

**Real game (F-0099-M, TEST-012).** `frontend/e2e/match-last-jumps.spec.ts` extended: both pages record Village Rites' stack ghost too and the Graveyard number is checked against it; Think Twice joins the guest's deal (deck `protocol/fixtures/last-jumps-deck`: 4 Think Twice for 4 Swamps; the package is now `last-jumps-deck-2.zip`, because a stack that already holds the old package's deck reuses it by name and the deal refused "1 Think Twice, the deck has 0"; CI step renamed). The guest casts Think Twice from the hand, then really clicks it in the graveyard fan for flashback; both pages check its ghost ends on the guest's Exile tile and the Exile number turns only then. Passed **three times running** (57, 57, 56 s), headless, bundled Chromium, local stack on :8080:

- Q3, both pages, every run: the Graveyard read 0, then **1** about 250 ms after the Agent's ghost was last drawn (1,342-1,455 ms), then **2** about 50-100 ms after Village Rites' ghost (3,281-3,389 ms). Never 1 before the Agent, never 2 before Village Rites (the old 0 -> 2 is gone). One run showed one empty frame on the guest's tile at the 0 -> 1 swap (1,404 ms, the two runs changing over).
- Flashback, both pages, every run: the ghost last drawn 1 px from the guest's Exile tile (119 px from the Graveyard tile); the Exile number turned on that frame. On the caster's page the flashback stack card is named by the other page's id (the caster's own page drew it there only as its casting card landing).
- Q1 and Q2 as before: the host's Wurm first drawn 1 px from its Library tile; no Agent drawn in the fan while it flew.

**Left open.**

- The other spotlight-held boards (the other player's spell held on the stack, `HOLD_MS`) lose their round's moves for everything else too -- a creature dying or a card discarded in that round flies by the old guesses, and its tile number is not held. The fallback here covers only a spell leaving the stack. Worth its own look (trigger: the efficiency/error-checking phase).
- The flashback stack card on the caster's own page was not found by its name on the stack in the real game; the ghost is right (same stack id), but why the stack card was not drawn there is not looked into.
- Draws (the Library number) still change as the board arrives.
- Clips are tenth-speed stills (as for 0099); the owner's eyes (TEST-006) are owed. F-0099-F (the full jump check) is for the release run.
