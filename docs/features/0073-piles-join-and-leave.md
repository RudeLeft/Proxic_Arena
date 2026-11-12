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

### As built (2026-11-12)

Page only; the worker is untouched (no `by` on the move). The Lab says the page can tell a token's source on its own: over 39 boards where tokens appeared (10 traces: the two recorded for this, `p73-piles` and `p73-krenko`, and the older Lab traces with Raise the Alarm, Krenko, Voice of the Woods, Halo Fountain, Patrol Signaler, Steward of Solidarity, Fain, Blooming Blast, Rust-Shield Rampager's offspring), exactly one stack object left the stack in that update every time -- the spell, or the ability/trigger whose source permanent is on the table. Two at once or none seen falls back to the stack, as item 2 allows.

- **Joining (A)** (`Board`, `piles.ts`): a card that joins a pile it was not drawn in before gets its own ghost from where it came from -- its stack spot (a permanent spell resolving onto its twins), a zone tile (faint, as any arrival), your hand (the hand card's existing ghost) -- and lands on the pile with A-00's Glide. Your own cast landing on its twins: the pile counts it once the flight has landed (`flyingOnto`).
- **Their hidden hand**: their land leaves the middle back of the fan as it was drawn (`floor((n-1)/2)`, as spec 0072's casts), the fan closes on the gap (spec 0072's `handLeft` closing, now also for a land), and it turns face up half-way (35-65% of the Glide: the back narrows edge-on and goes, the face widens in -- one picture at a time). No hidden id is used: only the back count and the public arrival. Before, the fan's last back slid off to his graveyard.
- **Tokens**: each grows out of a spark on its source (the resolved spell's stack spot, or the permanent whose ability it was) over 150 ms, then Glides; the first 230 ms in (the spell leaves at 380), the next 150 ms behind (120 for an ability, the canvas's Krenko). A token with no pile yet does the same with its own card.
- **The badge**: each pile's number changes as each card lands or lifts off, never before, popping (the canvas's 0.4 over 240 ms). Drawn as the page's own copies of the old numbers over the badge, each shown for its stretch, on the board's animation clock -- so a click hurries it with the cards.
- **Leaving (D)**: a card leaving a pile for a graveyard or exile lifts off the top (160 ms, to the canvas's offsets; two fan apart) as the number drops, then plays Shatter or Banished -- one animation (`peelFrames`). The pile draws it until then. When the whole pile goes, its own card shatters in place and the rest peel off it, all at the same moment. The oldest leaving: the next takes over in place (no jump). Back to a hand or library: A-14 unchanged.
- **Combat** (A-13): a pile whose own card died but whose others live fights as the pile it was (the next of it draws the fight); its dead peel off as that fight ends, above the fight's dimming. A fight's dead are not a board wipe (A-07's flash needs three leaving outside fights; a board wipe still peels and flashes).
- **Reduce motion**: none of it; the number simply changes.

Tests: `fixes0073.test.tsx` (F-0073-A, B, C, D, F; 10 of its 11 fail with the Board change removed, the 11th is the reduce-motion "unchanged" guard).

Jump check (F-0073-E), rebuilt local stack, both seats, nine Lab traces (`p73-piles`: Plains/Forest/Raise the Alarm/Path to Exile against Mountain/Forest/Stone Rain/Grizzly Bears, with land drops onto piles on both sides, Stone Rain on the newest of three Forests, two blocked Soldier tokens dying, Path on a Soldier; `p73-krenko`; and `sacrifice-innocent-blood`, `take-backs-attack-one`, `take-backs-block-one`, `costs-convoke`, `pay-picks-voice`, `cost-kinds-untap`, `mana-balls-convoke`). Before (the stack built from spec 0072's tree) and after:

| Row | Before | After |
|---|---|---|
| 6 -- joins "not shown at all" (their hand to battlefield; new tokens) | 49 + 15 = 64 | 1 + 9 = 10 |
| 5 -- leaves "not shown at all" (battlefield to graveyard; tokens gone) | 2 + 4 = 6 | 1 + 1 = 2 |

All 12 left are on seat 2 boards where the recorder saw no change at all: the replay sends the next board while the page still holds the other player's spell reveal or rising ability on its timers (the artefact spec 0072 recorded); the same tokens are drawn sparking and gliding on a later board of the recording. Nothing new was flagged (other rows unchanged).

Clips at 1920x1080, normal and quarter speed, in `Arrow videos/0073/` (Lab boards replayed into the real page): third Forest onto its pile, Bob's third Mountain out of his fan, Raise the Alarm's Soldiers one by one (they are summoning sick, so they form their own pile beside the old one, as the layout rules say), Krenko's Goblins, Stone Rain peeling one Forest off three, two Soldier tokens dying in combat. Found filming and fixed: the peeled-off card of a fight was drawn under the other attackers (now above the fight's dimming). The quarter-speed combat clip shows the deaths only (the replayed fight does not play twice).
