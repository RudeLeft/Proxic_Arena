# 0074 — Discards, mills, countered spells, and cards leaving a graveyard or exile

**Status:** Approved 2026-11-12 (owner, by prompt, on the canvas "grave-1112", https://claude.ai/artifact/CG9TUMfS1yG8PTnj4DiYCE)
**Owner decisions:** discard **A · Lift and drop**; mill **C · Stream**; countered **F · Struck by the beam**; out of a graveyard or exile **H · Rise and show** (a whole graveyard exiled: **swept as one**).

Phase 10 items A-06 (discarded, milled, a spell countered; sacrifice was done in Amendment 6) and the graveyard/exile part of A-14; the jump audit's row 10 (Amendment 1: about 130 not shown).

## Why (researched)

- Your discard already slides to the graveyard with its "Discarded" tag (`Board.tsx` ~2997, ~3281). The other player's discard is the last back of their fan sliding off as a back: never face up, no tag (hidden-hand backs, ~2406).
- Mill: nothing moves, only the tile numbers change (`GameScreen.tsx` ~2675, ~2690), though the move names the card.
- Countered: the spell glows as if it resolved and its spark still runs to its target (`Board.tsx` ~3196), then it slides to the graveyard with "Countered by …" (~3235, ~3257).
- Graveyard to battlefield: a faint glide from the tile (`fromSnapshot.ts` ~275). Graveyard to hand: only table/stack returns are tracked (~256), so the card fades in from the stack spot. A graveyard exiled, or cards put into a library from it: nothing moves.
- Every such move is named (a graveyard is public; `Moves.java` ~236-281); a card going into a hidden hand or a library loses its id (`HiddenIds.java` ~61), so the page matches it by comparing graveyards and never carries the id on.

## Built

1. **Discard (A):** the card lifts out of the hand and drops into its owner's graveyard tile, face up, with the "Discarded" tag as today. The other player's discards leave the middle of their fan (no hidden id; as spec 0072) and turn face up on the way. Several discards go one after another.
2. **Mill (C):** cards slide off the library tile one after another, turn face up and drop into the graveyard; after 10, the rest go together as one ×N bundle. The tile numbers tick as each lands.
3. **Countered (F):** the countering spell's gold beam (spec 0069) flares onto the countered spell, which crumbles to grey ash on the stack and goes to its graveyard with "Countered by …". A countered spell never shows its own resolve glow or spark. A spell countered with no beam (no visible source) crumbles the same way.
4. **Out of a graveyard or exile (H):** the card rises out of its tile and pauses, enlarged, for a moment so it can be read, then glides where it goes: the table, a hand (into the other player's hidden hand it turns face down near their fan), a library (face down). A whole graveyard exiled at once (Bojuka Bog) is swept to the exile tile as one.
5. A click hurries all of it (100 ms, A-00); reduce motion: no movement, the numbers change. The other player's hidden cards never gain an id.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0074-A | Mind Rot on Bob: two backs leave his fan, turn face up, drop into his graveyard; your discard unchanged except the lift | page test; Lab; clip |
| F-0074-B | Glimpse the Unthinkable (10): a stream, tile numbers tick; more than 10: a bundle after 10 | page test; Lab; clip |
| F-0074-C | Counterspell on Giant Growth: beam, ash, graveyard; no spark to the Bears | page test; Lab; clip |
| F-0074-D | Raise Dead (to Bob's hand: face down near his fan, no id), Unearth (to the table), Bojuka Bog (swept as one) | page test; Lab; hidden check; clip |
| F-0074-E | The jump check no longer flags row 10 on the Lab games | jump check run |
| F-0074-F | Hurry and reduce motion | page test |

## Amendments
