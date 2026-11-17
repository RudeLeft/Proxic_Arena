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

## Amendments
