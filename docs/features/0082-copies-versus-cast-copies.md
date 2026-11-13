# 0082 — Copies versus cast copies (storm, prepare, ability copies)

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "spell-copies-1113", https://claude.ai/artifact/FtUSdEvLF3PUkt22t4AqxU)
**Owner decision:** **C · copy versus cast-a-copy, following Magic's own rule** (over A · peel off the original wherever it is, and B · spark out of the maker).

Phase 10, A-15/A-21 follow-up: the 13 "popped in" findings left after 0081 (copies-storm 7, shapes-prepare 6) and the related storm and prepare errors found in the analysis.

## Why (researched, 2026-11-13)

- **Storm.** The worker's `casting` list is the cards in the game's stack zone that are not on the stack yet (`ViewerSnapshot.java` ~413-433). Storm copies wait there while each is asked "new target?", so they show as cast spells.
  - On the caster's seat, a loose Grapeshot fades into the middle with its cost, as if to be paid (`GameScreen.tsx` ~661, `CastingCard.tsx` ~451; the CSS fade at `game.css` ~3851). The other copies never show until all four land.
  - On the other seat, `castOrigin` falls through to "hand" (`theirCast.ts` ~46-52), so a face-down card seems to leave the caster's hand each time, though her hand count never changes.
  - The ×N card takes its first member's id (`fromSnapshot.ts` ~367-378), so it is rebuilt, and pops, each time a copy resolves.
- **Prepare.** The prepared spell is a token in the owner's exile with no move and no `copy`/`copyOf` (`Copies.java` ~118-128). It appears in the exile pile with nothing tying it to its creature. When cast, it fades in at the middle. When it resolves, it glides to a graveyard and is never there, because a stack entry is a copy only when `isCopiedSpell` (`ViewerSnapshot.java` ~379).
- **Ability copies** (Strionic Resonator) are not marked as copies (spells only, `ViewerSnapshot.java` ~379). One shows as a second trigger: ×2 if it matches, otherwise it slides in.

## Built

1. **Copies put straight onto the stack** (Fork, storm, replicate, casualty, Dualcaster Mage, Double Vision, ability copies):
   - The copy always peels off the original's stack card (0079's peel, gold copy mark). It never visits the middle of the screen and never seems to leave a hand.
   - While its target is chosen, the peeled copy waits beside the original, and the aim line starts from it.
   - Storm's ×N card peels off and counts up 1→N as targets are picked. Split targets make one ×N card per group.
   - The ×N card keeps one identity while it ticks down, each copy ending in gold motes.
   - The cause (the storm trigger, Fork, the Resonator, Dualcaster) gives a short gold pulse.
2. **Cast copies** (prepare, Isochron Scepter, cipher, Mizzix's Mastery-style "cast a copy"):
   - The copy rises out of the card it copies, goes to the middle to be paid like any cast, and flies to the stack wearing the gold copy mark.
   - It ends in gold motes, never a graveyard.
3. **Prepared:**
   - When a creature enters prepared, it pulses gold. A gold-rimmed square "prepared" mark with the spell's picture settles on it (0076 placement). Nothing goes to the exile pile.
   - Casting the prepared spell peels it off that mark.
   - If the creature leaves, the mark goes with it.
4. **Worker:**
   - Copies in `casting` are told apart from cast spells; they are already marked `copy`.
   - Prepare's spell (and any cast-a-copy) is marked `copy` with `copyOf`, and links to its creature. The link comes from the game's own data, never by name.
   - Ability copies are marked `copy` with `copyOf`.
   - The ×N group keeps a stable id.
   - Hidden-info rules apply: with no visible original (`copyOf` stripped), the copy appears at the stack spot and is never guessed.
5. A click hurries everything (A-00). Reduce motion: no movement; the marks and counts still show. No new words on the table and no new report window: the copy mark and motes tell the story, and the game log already says "copied".

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0082-A | Grapeshot storm 4, both seats: nothing leaves a hand, nothing goes to the middle; ×N peels off and counts up 1→4 while targets are picked; one identity while ticking down to motes; split targets make two groups | worker test; page test; Lab; jump check; clip |
| F-0082-B | Studious First-Year enters prepared: prepared mark on the creature, nothing in exile; casting peels it off, middle, paid, stack with copy mark, motes, graveyard count unchanged; both seats | worker test; page test; Lab; clip |
| F-0082-C | Fork and Krark unchanged (0079) | page test; Lab |
| F-0082-D | An ability copy (Strionic Resonator or an available equivalent) peels off its trigger with the copy mark | worker test; page test; Lab (new scenario if the card is supported); clip |
| F-0082-E | Jump check: the 13 findings and the ×N re-pops gone; hurry, reduce motion, hidden checks clean | jump check; page test; Lab hidden checks |

## Amendments
