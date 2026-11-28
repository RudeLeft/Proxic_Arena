# 0123 — Phase 11 P11-A2: a drawn card comes off the Library tile (and A3 closed)

**Status:** **Approved by the owner 2026-11-27 (by prompt: "As it leaves"; A3 "Close it")**; building. Phase 11, items P11-A2 and P11-A3 (step 10 of the recommended order, "the small look fixes"). Canvas the owner saw: `Proxic canvases/a2-a3-library-glow.html` ("Library and Glow Timing").
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
