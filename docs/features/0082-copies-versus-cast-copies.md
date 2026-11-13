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

### As built (2026-11-13)

Built as approved (C); unreleased.

**Causes confirmed** (RUN, Lab traces `copies-storm`, `shapes-prepare`, and a worker built from the commit before):

- Storm copies are put on the stack by Forge's own route (MatchController `orderAndPlaySimultaneousSa`): each is asked "new target?" *before* it reaches the stack zone, then held by Forge's frozen stack (`MagicStack#add`) until the storm trigger has resolved. So during each question `casting` held the copies already answered (never the one being asked) and the page read them as spells being cast: the loose Grapeshot in the middle (Alice), a back leaving her hand (Bob). The `×N` card's React key was its first member's id, so it was rebuilt on every resolution.
- Prepare: the prepared spell is a token copy Forge adds straight to exile (`AlterAttributeEffect` "Prepared", no move); the creature names it (`Card#getPreparedSpell`) and Forge unlinks the two the moment the copy is cast. It was not marked a copy, so its stack entry was not one; as a token spell it goes to the graveyard and ceases to exist there, which read as a glide to a graveyard that never counts it.
- An ability copy (Strionic Resonator) was not marked at all (only `isCopiedSpell`).

**Worker.** A batch of copies (Fork's one, storm's four, a Resonator's) is recorded as it is put on (`Copies.batch/aiming/put`, called from `placeOrdered`). New snapshot list `copying`: the copies on their way, shaped as stack entries (id `copying:N`), top first, the one being asked marked `aiming`; each listed from its question until it is on the stack proper. A copy put onto the stack is never in `casting`. Copy stack entries carry `group` ("copies:N", the batch) and `copyingId`. An ability copy is `copy` with `copyOf` (Forge's CR 707.10b `getOriginalAbility`). A creature names its prepared spell (`prepared`); the spell is `copy` with `copyOf` the creature (in exile and while cast -- the link is kept, as Forge drops it); its stack entry is `copy`; a token spell off the stack into a graveyard is a move to "nowhere" (`Moves.ceasesOffStack`). Ids are card ids, so HiddenIds strips them as any other; `copying` is a board list. Server: MatchArt dresses `copying` like the stack. Protocol docs updated.

**Page.** Copies on their way are drawn beside the entry they copy (the canvas's offset, 0.88 its size, a second group under the first), peeling off it with the gold mark (0079's peel); the `×N` counts up as each copy peels on; the one being asked joins the card before it (its target is not known yet) and, picked at something else, peels off that card to one of its own (split targets). The maker -- the resolving top entry (storm trigger, Fork, the Resonator's ability) and the permanent it came from -- pulses gold as each copy is made. Each card of copies is one element from its way onto the stack to its last copy (its lasting key: batch and aim; or the key of the card a copy was on, if that card is gone), so landing is a glide and ticking down never re-pops. Aim lines start from the waiting card; the live aim pointer of a copy's "new target?" too. A prepared creature carries a gold-rimmed square with its spell's picture (badge column, 0076); it pulses and the square grows in as it arrives; the spell is left out of the exile pile and its count. Cast, the copy rises out of that square to the middle (both seats; your own too, nothing having been clicked), wears the copy mark while paid and flying, and ends in motes. Reduce motion: no peel, pulse or rise; marks and counts show. A click hurries all of it.

**Deviations.**
- The count reaches N one board later than the canvas for the *last* split: a copy's new target is unknown until picked, so the one being asked first counts on the card before it, then moves to its own card (the canvas knows the targets in advance).
- In the real game the copies resolve in Forge's order: in the split trace the two at Bob resolve first (the canvas has the Bears' first).
- The prepared square sits in the badge column (low left, MARK_H), as 0076 places marks, not low right and larger as on the canvas; on a summoning-sick creature the zZz touches its top edge (the badge bands are 0076's).
- The storm trigger itself still fades in at the stack spot when it appears (its source is the Grapeshot on the stack, not a permanent): 2 findings per storm trace, layout-only, present before 0082 and not part of the 13. Tried rising it out of the spell's stack card; the check still flagged it (the card it would rise from is hidden under the cast flight), so that change was taken out.
- Isochron Scepter / Mizzix's "cast a copy": the worker and page paths are general (a token spell whose copied card is real rises from where that card is), but no Lab game covers them.

**Evidence.**
- Tests: `fixes0082.test.tsx`, 12 (F-0082-A..E). Each piece taken out in turn fails tests (TEST-004): no lasting key 3, `copying` not drawn 7, no rise from the mark 3, spell left in the exile pile 3, no mark 2, no maker pulse 2. Worker: `HiddenIdsTest` (+2), `MovesTest` (+1); server `MatchArtTest` (+1).
- Lab: `check-copies.py` new scenarios `storm-split`, `resonator` (Strionic Resonator is in the pool) and `copying` checks in fork/storm; `check-shapes.py prepare` checks the link both ways and the end. Against a worker built from the commit before: fork, storm, storm-split, prepare WRONG and resonator INCONCLUSIVE (no copy flag). Every Lab script in CI's list run locally with the new worker: all exit 0; over their traces `check-snapshot-first`, `check-hidden-hands` (10,691 sightings), `check-hidden-log` (15,521 lines), `check-kinds` OK.
- Jump check (rebuilt local stack, both seats): before (`j81-after` for storm/prepare, the full run for Fork/Krark) copies-storm 25 findings, shapes-prepare 6, coin-flip-krark 6, copies-fork 0; after copies-storm 2, shapes-prepare 0, coin-flip-krark 0, copies-fork 0, new copies-storm-split 2, copies-resonator 0. The 4 left are the storm trigger's own arrival (above). The recorder now draws each copy on a `×N` card (`data-members`) and a prepared mark (`data-mark-of`); check-jumps reads `copying` and lets a mark grow in.
- Clips at 1920x1080, normal and quarter speed with stills, in `Arrow videos/0082/` (Lab boards replayed on the rebuilt stack; no card pictures in the Lab deck).
