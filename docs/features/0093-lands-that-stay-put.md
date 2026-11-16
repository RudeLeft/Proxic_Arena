# 0093 — Lands that stay put when tapped, nearer the hand

**Status:** Built 2026-11-16, unreleased. Approved 2026-11-16 (owner, by prompt, on the canvas "Owner list 2026-11-16", https://claude.ai/artifact/Ky53Huv37tXYsLXWLqDMZq, sections 2 and 4; section 4 redrawn twice at the owner's request).
**Owner decisions:** section 2 **C · tapped lands glide to the end; tidy up at your untap**; section 4 **L-1 · the row grows left from the edge of a 7-card hand**.

From the owner's list of 2026-11-16, items 2 and 4. Players complained that tapping a land makes the lands jump away from where they were clicking.

## Why (researched)

- Tapped is part of a pile's identity (spec 0036; `layout.ts` ~376-398), so tapping one of three Swamps splits the pile; the untapped Swamps re-form a new pile at the next member's arrival position. At 1920x1080, with Swamp, Island, Swamp, Dismal Backwater, Plains, Swamp, Island, tapping the first Swamp moves the two untapped Swamps 214 px right, past the Islands, and Backwater and Plains 113 px. A second click on the same spot hits the tapped Swamp.
- Any tap also shifts everything to its right by 11.5 px (the leaning card's extra room, `planLine` ~526-532).
- A land picked to pay (0070) leaves its pile too (`pileKey` ~419), so the jump starts before anything taps.
- The land row starts at the table's left edge (x 3.75 at 1080) while the hand is centred: about 615 px of mouse travel at 1080, 820 at 1440.

## Built

1. **Where lands go (L-1).** Each side's land row grows **leftward from a fixed spot**: the left edge of a 7-card hand (x ≈ 542 at 1080, 723 at 1440, scaled by height). The first land played sits just left of that spot; each new land takes the next space to the left. The spot never follows the live hand, so drawing or playing a card moves no land. The opponent's row mirrors this at the top. Other permanents that share the land line (0059) start just right of the spot and go right, so they never push a land.
2. **Tapping moves only the tapped card (C).** Every slot keeps room for a lean, so a lean never shifts its neighbours. A land that taps, or is picked to pay, glides to a tapped group at the **far (left) end** of the row; every other pile keeps its place, so the next untapped copy is under the pointer where the last one was. A pile that empties keeps its place held (like 0079's held places) until the tidy-up.
3. **The tidy-up.** At that side's untap step, the row re-packs once into arrival order — when no one is clicking.
4. **Taking one back while paying (0070)** is a click on it in the tapped group.
5. Both seats; a click hurries everything (A-00); reduce motion: the tapped card moves without gliding.

This amends 0036 (tapped is part of a land pile's identity — kept, but the tapped group lives at the row's end), 0040 (lands start at the left edge), 0059 (shared lines) and 0070 (a picked land stands apart — now at the row's end). Each gets an amendment note pointing here.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0093-A | 3 Swamps, 2 Islands, Backwater, Plains: tap each Swamp in turn at the same pointer spot — each click taps an untapped Swamp; no untapped pile moves more than 0 px | page test; real-game test (TEST-012) |
| F-0093-B | The tapped group sits at the far left; at the untap step the row re-packs once | page test; clip |
| F-0093-C | The first land sits just left of the 7-card-hand spot and later ones go left; drawing and playing cards moves no land; opponent mirrored | page test; battlefield sweep at 1920x1080 and 2560x1440 |
| F-0093-D | Picking and un-picking a land to pay (0070) moves only that land | page test |

## Amendments

### Amendment 1 — the row continues right when the line is free (owner, 2026-11-16)

Asked after the build (the capacity cost: with all three kinds on a side
the land row wrapped at 5 distinct lands and the side shrank at 14), the
owner chose "Commit, then let it continue right".

1. When no other permanents share a land line, the row keeps going **right
   past the spot**, over the hand's side of the table, before it wraps to a
   new line.
2. Where the places go (chosen): the stretch left of the spot fills first,
   side by side, as before; the next place stands **just right of the
   spot**, and each later one a full step further right. A newcomer never
   moves a land before it. The tapped group follows the places, so in a
   row that has continued right it stands at the right-hand end.
3. When the others need the land line (0059's sharing), today's rule: the
   lands keep left of the spot, the others right of it.

| ID | Test | Evidence |
|---|---|---|
| F-0093-E | Lands played one by one: none moves; the 5th stands just right of the spot, later ones further right; the 14th (1080) wraps; a shared land line stays left of the spot | layout test; battlefield sweep |

## As built (2026-11-16)

**Layout (`frontend/src/battlefield/layout.ts`).**

- *The fixed spot (L-1).* `landAnchor(g)` is the left edge of a hand of
  `LAND_ANCHOR_HAND` = 7 at that size (`handFan(7)`; x 541.9 at 1920x1080,
  722.6 at 2560x1440 = centre - 2.84 card widths), never the live hand (no
  fan room, no hand count). `planLandLine` lays a land line right to left
  from it: the first land's right edge, a lean's room included, one inset
  short of the spot; each next place one step further left. Every land
  step is the reference pitch plus both sides' lean room, tapped or not (C:
  a lean never shifts a neighbour). The opponent's row uses the same x. A
  land line's `rect` runs from the inset to the spot.
- *The row's memory.* `LayoutInput.previousLands` / `Layout.lands`
  (`LandRow`: `places`, `ends`, `turn`, `at`), passed in as `previousScale`
  is: the Board keeps it in a ref (`landRows`) and hands it back. Each land
  slot has a key (`p:` an untapped pile's identity, `e:` a tapped or
  picked one; `#n` for a pile past 15). Places keep their order; a place
  whose pile has emptied (tapped, or the land gone) is **held** -- an empty
  gap -- until the tidy-up; a new untapped pile is appended (one step
  further left). The tapped group (`ends`) follows the places after
  `END_GAP` = a quarter step: a newcomer fills a held place in it first,
  else joins at the far end; held places at its very end are let go. So
  paid picks become tapped piles where the picks stood, and a pick taken
  back and picked again returns to its own place. A held spot (spec 0079,
  `held:` id) takes its land's place when that place is empty.
- *The tidy-up.* `LayoutInput.landTurns`: the Board (`turnNow`, from
  GameScreen's `board.turn`, `activeSeat`, `phase`) gives the side whose
  turn it is its turn number once past the `UNTAP` step; a row remembered
  from another turn is dropped and laid out fresh, in arrival order. The
  other side's row is kept. Laid out again in that turn, nothing moves
  (the memory is a fixed point; tested).
- *Picked to pay (0070).* `paying` lands key as `e:` and go to the tapped
  group, alone (no pile), leaning; a click there sends the take-back as
  before. Board's `pickOf` is unchanged: a pile answers as its first
  choosable member, so the next click on the same spot takes the next
  untapped copy.
- *z.* A land's z follows its place in the row (left lower), so a land
  leaving its place changes no other land's z.
- *Others on the land line (0059).* The shared land line: lands left of
  the spot, the others from the spot plus an inset rightwards, oldest
  first; only the others must stay side by side (`SHARE_SHOW`).
- *Many lands -- the capacity choice.* With lean room a step is 112.8 px
  at 1920x1080, so **4 places fit left of the spot** at full size (the
  brief's "about 5" is without lean room). In order, moving no land when a
  new one arrives wherever possible:
  1. the tapped group closes up first, down to the sliver (`SLIVER`), the
     untapped places untouched -- tapping in a full row moves no place;
  2. then the row **wraps**: lines fill to 4 places each, from the same
     spot, the next line nearer the middle, the last line taking the
     rest, so a newcomer never moves a land before it. A spare line is
     taken when the untapped places would squeeze; with none in the band,
     the other permanents share the land line (right of the spot) so the
     lands can wrap -- that moves the others, never a land;
  3. then the last line squeezes, then the side steps down a size, as
     before.

  Measured (layout, 1920x1080 and 2560x1440 alike, distinct lands played
  one by one): a lands-only side moves no land until the 13th (3 lines of
  4) and shrinks at 18 (before: first move at the 17th, no shrink by 40);
  a side with 3 creatures and 3 others moves no land until the 9th (two
  land lines, the others on the first) and shrinks at 14 (before: 17 and
  33). Basics pile, so these count distinct piles; the spec's 7-land row
  is 4 places. Of the scenario boards, `stress` (15 distinct lands a side)
  and `commander` (24/16) now size their land-heavy side down a step;
  `syn90`/`syn200` grow. **For the owner:** not built -- letting a row
  continue right of the spot when no others share the line, before
  squeezing, would win back most of that capacity.

**Board / GameScreen.** `Board.tsx`: the `turnNow` prop, `landTurns`, the
`landRows` ref read and written in the layout memo. `GameScreen.tsx`
passes `turnNow`. Glides, A-00's hurry and Reduce motion are the
existing box-change motion: a land whose box changes glides; under Reduce
motion it moves without gliding.

**Arrows (`effects.ts`, a deviation).** With lands and others in new
places, three scenario arcs from a stack card's stud broke F-0066-B's
checks (a 2% tight bend; one over its target). The stud arc now prefers a
candidate with no corner (`cornered`), goes round a target right above
the stud, and searches a smoother climb; each change has a bite test.

**Tests.** `layout.test.ts` "lands that stay put (spec 0093)": F-0093-A at
both screens and the jump without memory; F-0093-B tidy-up once, held gap,
the other side's turn; F-0093-C spot at 542 and 723, mirror, hands of any
size and new permanents move no land; capacity x3; F-0093-D pick, take
back, re-pick, paid in place; held spot; fixed point. "Tapped basics form
their own pile" kept; "lands start at the left edge", "tapping moves
neighbours a little" and 0059's "from the right end" rewritten to the new
rule. `fixes0093.test.tsx`: the real game screen, socket replaced, real
DOM clicks on `applyManaToCost` and `CostTapType` questions, F-0093-A..D.
`battlefield.spec.ts`: the sweep (1920x947, 1920x1080, 3440x1440,
2560x1440) checks every land is drawn left of the spot; the settle test
follows the row's memory through its 16 changes.
`match-lands-stay-put.spec.ts` (TEST-012): the sacrifice deck; the payer
casts a 3-mana creature with 3+ untapped Swamps and clicks, with the real
mouse, the spot where the Swamp pile stood -- each click hits an untapped,
choosable Swamp and taps it, no untapped land moves (< 0.5 px), the
tapped group is left of the untapped; at the payer's next turn the Swamps
are one untapped pile at that spot again.

**Bite tests (TEST-004), 17, all caught:** no memory (layout; Board ref
not written); never tidies; tidies during UNTAP; tapped group placed
first; spot at the old left edge; spot from a 3-card hand; no lean room
for upright lands; a picked land keeps its place; tapped-group holes not
refilled; places squeeze before the tapped group closes; no wrap under
land sharing; a squeezed row never asks for sharing; no held-spot place;
and the three arc changes.

**Runs.** tsc, `eslint . --max-warnings=0`, `prettier --check src e2e
tools`, vitest 1441/1441. On the local stack rebuilt from this tree:
`match-lands-stay-put` passed 3 of 3; `battlefield.spec` 4/4,
`match-board-motion` 1/1, `match-cast-step-aside` 1/1, `match-speed` 2/2
(it failed once at :809 straight after a filmed game and passed on the
rerun: in ROADMAP's flake list). 0070 has no browser spec ("No e2e" in
its As built); `fixes0070.test.tsx` passes.

**Jumps.** Lab traces with land taps (`check-mana-balls`, 6 games incl.
Nekrataal paid with a Forest and three Swamps; `check-pay-picks`, 4;
`check-land-mana`, 2) replayed into the page with headless Edge (no
headed Edge, per the owner), before (the previous commit's build, served
by `vite preview`) and after (this build on :8080): before 0 found on 24 recordings (12 games x 2 seats); after 0 jumped, 0 popped in, 1 "blinked out" -- `pay-delve` seat 2 board 12, Treasure Cruise's graveyard ghost at 75% (not a land; the same replay twice more: 0). No land move counted as a jump; the tidy-up and the taps are Glides.

**Clips** (the payer's seat, normal speed, from the real game):
`Arrow videos/0093/0093-tap-three-swamps-same-spot-payer.webm` (three
clicks at one spot, each Swamp leaning off to the tapped group on the
left while the pile stays put) and `0093-untap-tidy-up-payer.webm` (at the
payer's next turn the tapped Swamps glide back into the pile). Frames
read.

## As built, Amendment 1 (2026-11-16)

`layout.ts`: `planLeft` is the left stretch as built; `planLandLine` now
takes the line's right end (`x1`, or null for a land line the others
share) and, when the left stretch cannot hold the line's places side by
side, keeps as many there as stand side by side and lays the rest from
just right of the spot (`anchor + inset + lean room`) rightwards, a full
step each (lean room kept, END_GAP before the tapped group); past `x1`
that stretch closes its tapped group up, then squeezes, as the left one
does. `planLandLines` passes each line's right end: every land line when
nothing shares, every line but the first when the others share the land
line. A free land line's `rect` is the whole width again; a shared one
ends at the spot. Drawing order: left of the spot 49 down to 0 going
left, right of it 50 up going right (a card further right is on top).

Measured (distinct lands played one by one; 1920x1080 and 2560x1440
alike; 13 places fit on one line at full size, 4 left + 9 right):

| Side | Before 0093 | 0093 as committed | Amendment 1 |
|---|---|---|---|
| Lands only: first land that moves an earlier one / side shrinks at | 17 / none by 40 | 13 / 18 | 40 / 52 (wraps at 14) |
| 3 creatures + 3 others: first move / shrinks at | 17 / 33 | 9 / 14 | 14 / 39 (at 14 the others share the land line and the lands wrap: the lands right of the spot move up a line) |

Tests: `layout.test.ts` capacity tests rewritten to the amendment (30
lands one by one at every screen, none moves; the 5th just right of the
spot; 13 to a line at 1080, the 14th wraps; tapping a full row with no
line to spare moves no untapped place and now carries the tapped group
on right of the spot -- full size, nothing shared; a shared land line
keeps its lands left of the spot). `battlefield.spec.ts`'s sweep: no land
drawn across the spot; on a shared land line, all left of it. Bite test:
a free line not continuing right -- caught (10 tests). Gates: tsc,
eslint, prettier, vitest 1441/1441. Rebuilt local stack:
`battlefield.spec` 4/4, `match-lands-stay-put` 1/1, `match-speed`
5 of 6 tests over 3 runs: the 1x test failed once, "1x end: slowest frame 159.9 > 150" -- the game-end scene, no lands moving; in ROADMAP's flake list. Jumps: 4 land-heavy Lab traces (Nekrataal paid with a Forest and three Swamps, convoke, both land-mana games) x 2 seats, headless Edge: 0 found. No new clip: a normal game's few lands
look as before.
