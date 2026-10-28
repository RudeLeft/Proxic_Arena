# The own-printing test deck

A legal 60-card Open Format deck in a printing Forge does not have
(spec 0024, F-0024-D).

```text
Own Printing Deck.txt   60 Mountain [ZZZ:1]
```

"ZZZ" is no set at all, so Forge knows the card (Mountain) but not the
printing. Before spec 0024 the import refused the deck; now it keeps the
player's printing and picture and records the printing Forge plays. The
browser test (`frontend/e2e/match-own-printing.spec.ts`) then proves the
rest of the path: the room's deck check passes, the game starts, and a
Mountain on the battlefield wears the deck's own picture for both
players.

A basic land, because it reaches the battlefield on turn one with no
other card's help, and a basic land's printing never changes what it
does.
