# 0032 — The card-title font on the battlefield, and the new life banner

**Status:** Built in 1.16.0
**Owner decisions:** 2026-10-28 — from the canvas
(https://claude.ai/artifact/DFdLiGuErNQgvGWnJvjjkT): the life banner L2
"Drawn, ornate"; the owner's card-title font (Beleren 2016 Bold) on the
battlefield only, in the nine places the canvas numbers, with the tile
words a step larger; everywhere else (every other page, the emails)
keeps today's fonts. The font file lives in the repository under a
plain name (owner decision, after being told of Wizards of the Coast's
copyright notice in the file, which stays in it).

## What the player sees

On the game screen, the words that are part of the game are in the font
real Magic cards use for their names: every card's name and type line,
power/toughness and loyalty, damage numbers, the counts on piles, the
name tags of Auras and Equipment, the stack's order numbers, the
question's title, the "Game over" title, player names, the life total,
the zone counts and words, the ladder's "Turn 3 · Your turn" line, and
the big word on the act button — and the words that take its place
("Waiting for Pat", "Game over"), so that spot always looks the same
(owner, at the ship question). Small words and sentences (step names,
help lines, the stack caption, chat, menus) keep today's font. No wording
changes anywhere.

The life total sits in a new banner drawn after the owner's: a gold
frame, red velvet, a ruby in each top corner and at the point. On that
player's turn it glows gold; when a spell targets the player it pulses,
as before.

## Scope

In: the font file and one CSS variable for it (`--pa-card`), applied to
the nine places; the banner picture.

Out: every page outside the game screen; emails; the Deck Builder.

## Rules and boundaries

- Words are unchanged; only their face.
- The type scale (spec 0017) still holds: the tile words move from the
  scale's 12 to its 13; nothing new is hand-sized.
- If the font file fails to load, the display face shows, as today.
- The banner keeps its size and place (motion.ts unchanged), its button,
  and its chosen and targeted states.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0032-A | The nine places use the card-title face; nothing outside the game screen does | unit (typeScale) + screenshots |
| F-0032-B | Names, counts and buttons still fit at laptop and computer sizes | browser screenshots |
| F-0032-C | The banner shows, glows on its player's turn, and can still be chosen as a target | browser (existing match tests) + screenshots |
| F-0032-D | It looks right in real games | owner |

## Decisions for the owner

All taken 2026-10-28 (see the top).

## Amendments

None.
