# 0091 — The casting card steps aside while a card under it is spent or tapped

**Status:** Approved 2026-11-13. The owner chose this by prompt on the canvas "hidden-fold-1113" (https://claude.ai/artifact/3DbDvEfXKWaW7gTP6Y83vj), and was told plainly that it changes approved spec 0068.
**Owner decision:** **C · the casting card steps aside**, over A (a see-through window), B (lift the card out first) and D (a small copy by the cost).

This amends 0068 item 1 ("no sliding aside") for one case only (see 0068 Amendment 1). It comes from reviewing the 0084 clips on 2026-11-13: during payment, the spent Treasures sit under the big casting card in the middle, so their fold and coin spark are hidden from both seats.

## Why

- 0068 puts the big casting card in the middle of the screen for every question. It turns see-through only when the pointer is over a covered card.
- A card under it that is spent, sacrificed or tapped as part of paying for the spell is therefore hidden at the exact moment it acts. This covers 0084's fold-and-go with its coin spark, Village Rites' sacrificed creature, and a mana creature tapping with its mana ball (0070).
- This is seen in `Arrow videos/0084/01-treasures-spent-*`.

## Built

1. **When it steps aside.** At the moment a card that the casting card covers is spent, sacrificed or tapped to pay for this spell, the casting card and its cost pips slide aside together just far enough to uncover it. For Alice they go up and aside; for the other player (the face-down back and "Alice is casting a spell…") they go down and aside, clear of the hand. The move takes about 0.25 s.
2. **What plays.** The card's own animation plays in full view: 0084's fold, coin spark and glide to the graveyard; a tap with its mana ball flying into the pips (0070).
3. **Coming back.** The casting card glides back to the exact middle, about 0.25 s after the last such card finishes. If several are paid in one step, it stays aside for all of them and comes back once.
4. **What doesn't change.** It never stays aside: between questions, for a target, and when nothing under it acts, it remains in the middle exactly as 0068 says. The pointer-over see-through look (0068) is unchanged.
5. **Both seats.** The other player sees the same step aside with the face-down back, so their view of the payment is never hidden.
6. **Hurry and reduced motion.** A click hurries it (A-00). With reduce motion there is no slide: the casting card turns see-through over the acting card for that moment instead (0068's see-through), so the change is still visible.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0091-A | Three Treasures under the casting card pay for Hill Giant: it steps aside, all three fold in view, it comes back once; both seats | page test; Lab (check-spent treasures); clip |
| F-0091-B | Village Rites sacrificing a covered Bears; Llanowar Elves under it tapping for {G}: it steps aside for each, then back | page test; clip |
| F-0091-C | A target question and between questions: it stays centred (0068 tests still pass) | page test (fixes0068) |
| F-0091-D | Reduced motion: no slide, see-through over the acting card; a click hurries it | page test |

## Amendments
