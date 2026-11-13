# 0081 — Free spells rise from the hand; cards exiled from a hand or library are shown

**Status:** Approved 2026-11-13 (owner, by prompt, on the Phase 10 finish-line clips `Arrow videos/phase10-finish/findings/gap-their-free-spell-*` and `gap-their-pitch-exile-from-hand-quarter`)
**Owner decision:** "Fix both now". No new look: both reuse looks the owner has already approved (0072's rise from the hand, 0074's lift-and-drop / stream to a pile, A-05's exile).

Phase 10 exit gate: the two real gaps the full jump check found (finish line, 2026-11-13). Drawing (A-03) was accepted as it is on the same prompt.

## Why (found by the full jump check)

- **Free spells pop onto the stack (47 cases, plus 4 free casts from exile).** The other player's Memnite, Ornithopter, a free Shivan Dragon, cascade and Skyclave casts fade in at the stack spot instead of rising from his hand. Likely cause, to confirm: 0072's rise is read from `casting` (`GameScreen.tsx` ~675, ~763-773), the card being cast while a payment question is open; a spell with nothing to pay never has that step, so it reaches the stack with no rise. Example: wipes-judgment seat 1 board 3.
- **Cards exiled straight from a hand or library are never drawn (14 cases).** Force of Will's alternative cost (exile a blue card from your hand), Karn's exiles, cascade's revealed cards: only the exile count changes. 0074 draws hand→graveyard (discard) and library→graveyard (mill); hand→exile and library→exile are not handled.

## Built

1. **Free spells (0072):** a spell cast without a payment step -- the other player's, or either player's to a spectator -- rises from where it was cast from (the middle of his hidden fan, a shown card, or the pile it came from, face up when it was seen there), exactly as a paid spell does. Your own free spells keep how your own casts look today.
2. **Exiled from a hand:** the card lifts out of the hand (0074's lift) and glides to its owner's exile pile; from a hidden hand it leaves from the middle of the fan and turns face up on the way when it is exiled face up (as 0074's discards do); face-down exile stays a back.
3. **Exiled from a library:** the card leaves the top of the library (0074's mill stream, one card or several one after another) to the exile pile, face up when exiled face up.
4. The exile count ticks as each card lands (as the graveyard count does for discards). A click hurries everything (A-00); reduce motion: no movement, the counts still change. Hidden-info rules apply: no hidden card is ever named or shown face up before it is public.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0081-A | The other player casts Memnite (0 cost) and a free spell by cascade: each rises from his hand / the exile pile, never fades in at the stack spot; a spectator sees the same | page test; Lab; jump check; clip |
| F-0081-B | Force of Will paid by exiling a blue card: the card lifts from the hand and glides to exile, from both seats (theirs from the middle of the fan, turning face up) | page test; Lab; jump check; clip |
| F-0081-C | Karn / cascade exiling from the library: the cards stream from the library to exile | page test; Lab; jump check; clip |
| F-0081-D | Full jump check over every Lab trace: no "popped in" left for free casts or hand/library exiles; hurry, reduce motion, hidden checks clean | jump check; page test; Lab hidden checks |

## Amendments

### As built (2026-11-13)

Page only; the worker, the server and the snapshot are untouched (no Lab script needed re-running for shape).

**Cause confirmed** (RUN, Lab trace `wipes-judgment`): the board where Bob's Memnite first appears already has it on the stack (`stack:1`, source `card:75`) with the move "hand -> stack", and `casting` is empty; no snapshot of the game, for either seat, ever carries `card:75` in `casting`. 0072's rise is read from `casting`, so a spell with no payment step never rose and its stack card slid in at the stack spot. Force of Will's pitched card (`costs-force-of-will`, board 12) is a move "hand -> exile" that 0074's tile moves dropped (they took only "-> graveyard"); cascade's and Karn's exiles are "library -> exile" and "hand -> exile", the same gap.

- **Free spells** (`theirCast.ts freeCast`, `GameScreen`, `CastingCard onRisen`): on the board where a spell first shows on the stack with a move "hand / graveyard / exile / library -> stack" and was not being cast on the board before, the page holds it as the card being cast for the length of 0072's rise, built only from what is public there (the stack entry; from a pile, the card as it lay there). It rises exactly as a paid spell does -- a back from the middle of his fan (no hidden id), face up from a pile it was face up in -- his fan closes, and when the Glide lands (a click hurries it) it is cast as a paid spell is: it turns face up if it was a back and flies to the stack. Its stack card waits under it, so it never fades in at the stack spot. Spectators see the same. Reduce motion: none of it; it appears on the stack as before. A cap (1.8 s) lets it go on if nothing ever drew the rise.
- **Deviation:** your *own* free spell from a pile (your cascade casting from your exile) rises from that pile too. Item 1 says your own free spells keep today's look; for one cast from your hand that holds (it still rises from the card you clicked), but one cast from a pile had no look of its own -- it faded in at the stack spot, the very gap the jump check found (cascade-yes seat 1). Nothing was clicked, so it rises from the pile, as his does.
- **Exiled from a hand** (`fromSnapshot tileMovesOf`, `Board`): "hand -> exile" is now a tile move, played with 0074's lift and drop into the owner's exile pile: yours (and his shown to you) lifts out of the hand; his hidden card leaves the middle of his fan as a back and turns face up on the way (one picture at a time). Exiled face down and not known to you, it stays a back the whole way and is never named. Several go one after another (Karn's two).
- **Exiled from a library**: "library -> exile" streams off the library as 0074's mill does (face up beside the plate, then into the exile pile; past ten, a bundle). Face down: one back, never turned (`graves.ts millPose` takes no turn).
- **The exile number** ticks as each card lands; a tile already ticking also counts other cards landing in an exile pile that update (as it did for graveyards).
- No new look: the rise, the lift and drop and the stream are 0072's and 0074's, unchanged.

Tests: `fixes0081.test.tsx`, 16 (F-0081-A, B, C, D). With the page change taken out (theirCast's helper left in), 12 of them fail; the 4 that pass are "unchanged" guards (your own free spell from your hand, a paid spell not risen twice, reduce motion for each half). Full gates: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npx prettier --check src e2e tools`, `npx vitest run` (77 files, 1156 tests) pass.

Hidden checks (Lab traces of the jump check's cases, 20 games): `check-hidden-hands.py` OK (2,541 hand-card sightings), `check-hidden-log.py` OK (1,438 lines). The page uses no hidden id: a free spell from his hand is a back by place only; an exiled card's face is the exile's, as the worker sent it to that seat.

Jump check (F-0081-D), rebuilt local stack, both seats, the 20 Lab traces that showed these gaps (free casts: card-actions-duress, costs-affinity, costs-improvise, modes-spree, shapes-fuse, shapes-battle (Skyclave), tracked-state-marvel (free Shivan Dragon), the six wipes; cascade yes/no; Force of Will; Karn; Leyline; copies-storm; shapes-prepare). Before (the finish line's `rec-full2`, same traces): **78** findings of these kinds -- 51 free spells faded in at the stack spot, 4 free casts from exile faded in (Skyclave, cascade), 10 cards exiled from a hand or library never shown, plus 13 below. After: **0** of those. The 13 left are not this spec's: 7 are storm's Grapeshot copies (`copies-storm`, spec 0079's copies held in `casting`, from no zone), 6 are `shapes-prepare` (a copy made straight into exile, and its cast from there). One run flagged a "jump" on your own cancelled Harnessed Lightning (`tracked-state-marvel`, the flight back starting one frame after the cast card went); no code of this spec runs on those boards, and a re-recording of that game found no finding at all.

Clips at 1920x1080, each at normal and a quarter speed with stills, in `Arrow videos/0081/` (Lab boards replayed on the rebuilt stack): `1-their-free-memnite-rises` (wipes-judgment, seat 1: a back leaves the middle of Bob's fan, which closes; it rises to the middle, turns, flies to the stack), `2-their-cascade-exile-then-cast` (seat 2: Bloodbraid Elf's two cards stream off Alice's library into her exile, the number ticking to 2; Grizzly Bears rises face up from the exile pile to the stack), `2b-your-cascade-exile-then-cast` (the same from the caster's seat), `3-their-force-of-will-pitch` and `3b-your-force-of-will-pitch` (the pitched card lifts out of the hand, from the other seat out of the middle of the fan turning face up, and drops into the exile pile, while Force of Will flies to the stack), `4-their-karn-exiles-from-hand` (Karn's exile of a card from Bob's hand). The Lab deck has no card pictures, so cards show as their names.
