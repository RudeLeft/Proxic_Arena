# The "what happened" test deck

A legal 60-card Open Format deck for spec 0045 (seeing what happened).

```text
What Happened Test Deck.txt  12 Plains, 12 Mountain
                             4 Soul Warden, 4 Ajani's Pridemate
                             4 Goblin Ringleader
                             4 each: Raging Goblin, Goblin Piker, Goblin Raider,
                               Mogg Flunkies, Goblin Bushwhacker
                             4 Shock
```

Soul Warden then Ajani's Pridemate: Pridemate's +1/+1 counter says where
it came from, and its trigger, held on the stack while the other player
(holding Shock and an untapped Mountain) may respond, opens close up with
its cause. Goblin Ringleader reveals the top four, face up, each
marked where it went, to the other player; the player who chose sees no
tray (Phase 9 Amendment 13, item 7).

Used by `frontend/e2e/match-what-happened.spec.ts`. CI builds the package
with `scripts/make-ci-deck.mjs`, which generates placeholder art.
