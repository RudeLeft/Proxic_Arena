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

### As built (2026-11-11)

Page only; the worker is untouched. A Lab trace (`check-moves`, `check-pay-picks escape`) confirmed the snapshot that first carries the card in `casting` also carries the drop in his hand count and the move "hand (or graveyard) -> stack", so nothing else was needed. A cancel sends no move at all (the card is simply back), which is how a cancel is told from a spell that resolved (that one moves off the stack).

- **Where from** (`theirCast.ts`): read once, on the board where the card first appears being cast: the round's move, else the previous board's piles; face up from a graveyard, from exile only when it was face up there, from a library only when that viewer was shown it, from his hand only when it was a card shown to the viewer. From his hidden hand it leaves the middle back of his fan as it was drawn (`floor((n-1)/2)` of n backs); no hidden id is used or drawn.
- **The rise** (`CastingCard`, `motion.ts glideFramesAs`): the A-00 Glide (450 ms, the same arc and lift as every table card, computed as the table card would draw it), solid, no fade; "Bob is casting a spell..." comes in near the end. Face up the whole way when it was face up there; then no turn when he commits, it flies to the stack as your own does.
- **His fan closes** (`Board`, `handLeft`): each back after the one that left takes the place of the back after it, and no ghost of a back leaves for his graveyard (before: the last back slid off to his graveyard while a back faded in mid-screen).
- **Cancelled** (`GameScreen`, decided while the board is drawn, so there is no empty frame): it makes the Glide back. Into his hidden hand it lands on his fan's new last back, which makes the same Glide from the middle; the two hand over in the last quarter (ours is upright, his backs are drawn upside down; a whole-way cross-fade showed both). Onto a card of his you were shown it lands as that card; into a pile it shrinks onto the tile, fading.
- **Spectators**: the same. A spectator's bottom player has no fan drawn: that player's spell rises from (and goes back to) the middle of where the hand would be.
- **Reduce motion**: no Glide; it appears in the middle as before and a cancel is simply back. A click hurries it like any Glide (the board's `hurry`).
- **The jump check** (`scripts/check-jumps.py`): one rule added. A hidden hand's backs are anonymous, numbered by place, so when the fan closes the last number goes and when a card comes back a new number arrives; a back that appears or goes where another card is drawn at that very frame (12 px) is a hand-over, not a pop or a blink. Only hidden-hand backs are excused; the old recordings give the same counts with it.

Jump check (F-0072-D), seven Lab traces recorded for this (`check-moves` destroy/bounce/lapse, `check-shapes` adventure/aftermath, `check-pay-picks` escape -- Uro escaping from the graveyard is the face-up case; no Lab scenario casts flashback), both seats, before and after on the rebuilt stack: the other player's casts and cancels flagged **130 times before** (71 faded in mid-screen, 50 blinked out on a cancel, 2+1 from a graveyard/exile, 6 not shown), **6 after**. The 6 left are the same 6 as before, all "not shown at all", in `shapes-*` seat 1: the replay sends the next board while the previous spell's reveal is still held (FLIP + HOLD are timers, which the replay's "settled" does not wait for), and that spell is never drawn -- a replay timing artefact, not this item. Nothing new was flagged anywhere else (layout-only findings 20 -> 12).

Evidence: `fixes0072.test.tsx` (F-0072-A, B, C, E; 6 of its 8 fail with the change removed, the other two are "unchanged" guards: reduce motion, and a resolved spell not taken for a cancel; the fan closing, its start place, the missing ghost and the new back's Glide each fail with their own line removed). Clips at 1920x1080 in `Arrow videos/0072/`, each at full speed and a quarter speed.
