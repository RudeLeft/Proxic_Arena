# 0073 — Cards and tokens visibly join a pile, and peel off it

**Status:** Approved 2026-11-12 (owner, by prompt, on the canvas "piles-1112", https://claude.ai/artifact/9FF67JH61BWFrJoV8n2mHU)
**Owner decisions:** joining **A · Glide onto the pile**; tokens **from their source, one by one**; leaving **D · Peel off**.

Phase 10 items A-02 (a card joining a pile), A-15 (tokens made; copies are a later canvas), and the pile part of A-04/A-05 (one card of a pile destroyed or exiled); the jump audit's rows 5 and 6 (Amendment 1: about 1,090 joins and 22 leaves not shown).

## Why (researched)

Identical permanents stand as one card with a "×N" badge; the pile is drawn for its oldest member (`layout.ts` ~794/818/1003, `Board.tsx` ~1317). Only your own land from your own hand glides onto a pile today (`Board.tsx` ~2625, ~2760), and even then the badge says ×3 before it lands. Everything else that joins (tokens, a creature spell landing on its twins, the other player's land) only changes the number: the arrival loop skips the pile because its element is unchanged (~2301); tokens come from zone "nowhere" (`protocol/README.md` ~219), which `anchorOf` can't place (`fromSnapshot.ts` ~214). Leaving, only the pile's own (oldest) card can be drawn leaving (~2148, ~2649), so any other member destroyed or exiled shows nothing; two of four tokens dying show at most one. Back to a hand or library is already done (A-14's pile pass ~2727). The move record names each visible card joining or leaving (`Moves.java`), so the page knows which member it is.

## Built

1. **Joining (A):** a card that joins a pile glides (A-00 Glide, 450 ms) from where it came from (your hand, their hand, the casting spot, a graveyard...) onto the pile and lands on top; the badge ticks up (×2 → ×3) as it lands, never before.
2. **Tokens, from their source, one by one:** new tokens spark out of what made them -- the spell or ability that just resolved on the stack, or the permanent whose ability made them (Krenko) -- and glide to their pile one after another, the badge ticking ×1, ×2, ×3. A token with no pile yet glides to its own place the same way. Where the page can't tell the source for sure (two things resolving in one update, an unseen trigger), the worker names it on the move (small worker change), or, if that proves unneeded in the Lab, the spark comes from the stack.
3. **Leaving (D · Peel off):** a card leaving a pile lifts off its top as the badge ticks down, then plays its usual look: Shatter (destroyed, died, sacrificed), Banished (exiled); A-14's lift-and-glide stays for hand or library. Several from one pile (two of four tokens die in combat) peel off together and shatter together. When the oldest member leaves, the next takes over as the pile's card with no jump.
4. A click hurries all of it (100 ms, A-00); reduce motion: no glides, the badge simply changes.
5. Board wipes (A-07) keep their look; piles in a wipe peel as in item 3, all together.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0073-A | Third Forest (yours, from hand) and Bob's Mountain glide onto their piles; badge changes on landing | page test; clip |
| F-0073-B | Raise the Alarm: two Soldiers spark from the spell and join one by one; Krenko's Goblins from Krenko | page test; Lab; clip |
| F-0073-C | Stone Rain on a non-oldest Forest of three: it peels off and shatters; badge ×3 → ×2; Path to Exile on one: Banished | page test; clip |
| F-0073-D | Two of four tokens die in combat: both peel and shatter together | page test; Lab; clip |
| F-0073-E | The jump check no longer flags pile joins/leaves (rows 5, 6) on the Lab games | jump check run |
| F-0073-F | Hurry and reduce motion | page test |

## Amendments
