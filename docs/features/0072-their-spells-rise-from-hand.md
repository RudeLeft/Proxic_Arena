# 0072 — The other player's spells rise from where they are cast

**Status:** Approved 2026-11-11 (owner, by prompt, on the canvas "opp-cast-1111", https://claude.ai/artifact/D1v6VHFhQ8pPYqmFr4qbvz)
**Owner decisions:** look **A · Rise from his hand**; a card cast from a pile where it was face up (flashback, escape from a graveyard; an Adventure or "you may play it" card from exile; the revealed top of a library) **rises showing its face**; a cancelled cast goes **back where it came from**.

Phase 10, item A-21 (the stack), part "the other player's casts"; the jump audit's row 7 (Amendment 1: 1,278 times in the Lab games).

## Why (researched)

`CastingCard` animates only when given a starting box (`CastingCard.tsx` ~378-389); without one only the CSS fade `gs-cast-in` (game.css) plays. The box comes from `castFrom`, set only by the viewer's own click (`GameScreen.tsx` ~1162, passed ~1860). So when Bob casts, Alice's screen fades a card back in at the middle, and in the same frame Bob's fan drops a card with no movement (hidden backs are `hidden-hand:seat:i`, `fromSnapshot.ts` ~97-101). The snapshot already says enough without any hidden id: `casting` (the stack is public), Bob's hand count, and the round's `moves` (hand/graveyard/exile/library -> stack, `Moves.java`). Cancelled, it already flies back to his hand (GameScreen.tsx ~846-852), even when it came from his graveyard.

## Built

1. **From his hand:** a card back leaves the middle of Bob's fanned hand (all backs look alike; no worker change, no hidden id) and makes the A-00 Glide (450 ms arc) to the centred casting spot (spec 0068) while his fan closes the gap. It turns face up when he commits, as today. Adds no time; a click hurries it (100 ms) like any Glide.
2. **From a pile where it was face up** (graveyard, exile face up, the revealed top of his library, a card in his hand Alice was shown): it rises from that pile or card showing its face the whole way. A card cast face down from exile (foretell) rises from his exile pile as a back.
3. **Cancelled:** it glides back to where it came from (his hand, or the pile).
4. Spectators see the same as Alice does. Reduce motion: no glide, it appears in place as today.
5. Your own casts are unchanged.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0072-A | Bob casts from his hand: Alice's casting card starts at his hand, glides to the centre; his fan closes; no hidden id used | page test; clip |
| F-0072-B | Flashback from his graveyard: rises from the graveyard pile, face up the whole way | page test; Lab; clip |
| F-0072-C | Cancelled: goes back to its origin (hand / graveyard) | page test; clip |
| F-0072-D | The jump check no longer flags the other player's casts (row 7) on the Lab games | jump check run |
| F-0072-E | Reduce motion; a click hurries the glide | page test |

## Amendments
