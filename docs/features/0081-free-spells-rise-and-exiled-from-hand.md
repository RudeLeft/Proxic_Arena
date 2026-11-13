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
