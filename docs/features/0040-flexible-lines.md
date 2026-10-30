# 0040 — Flexible lines: a busy battlefield kept in order, and tapped cards whole

**Status:** Built 2026-10-30 (owner: "build it"); unreleased
**Owner decisions:** 2026-10-30 — from the canvas
(https://claude.ai/artifact/5xcXeSuHf4ZwCNJNgtwV7K): layout D "flexible
lines"; a tapped card tilts 5°; each card shows at least half of itself
before cards shrink.

## Why

The owner: "when i tap a card the corners get clipped", and a busy board
should stay dynamic without "cards spread all over the place like mixing
creatures with lands".

Found (2026-10-30), by running ten named boards through the real
`layout()` at five screen sizes and drawing them on the real board:

- **The cut corners are a rule.** A tapped card tilts 15°, which makes
  it 157 px tall at 1920×1080 in a 144 px row; PHASE 7 AMENDMENT 4 item 6
  trims every card to its row, so the top corner loses ~5 px and the
  bottom ~8 px.
- **Cards never shrink today.** All ten boards, up to Commander size,
  fit at 100%: a group overlaps first, down to about half a card on the
  biggest board (the 75% shrink starts only past a third of a card).
- **Each kind owns two of six fixed boxes a side, centred in each.** A
  normal midgame looks scattered: lands top-left, artifacts far right,
  creatures floating in the middle.
- **Kinds share a line when busy** on 6 of the 10 boards: the middle line
  holds lands (left), creatures (middle) and artifacts (right).
- **A full-width line holds about 16 cards** at full size. One kind per
  full-width line fits every board at full size except the two biggest.

## What the player sees

**Lines.** Each side of the table has lines running its whole width
(left of the rail), and **each line holds one kind only**:

1. **Creatures**, nearest the middle of the table.
2. **Everything else** — artifacts, enchantments, planeswalkers,
   battles — next.
3. **Lands**, at the player's own edge.

Which kind a card is follows Forge's own precedence, as today: a
creature first (an artifact creature, Dryad Arbor), else a land, else
everything else. A kind with nothing on the battlefield takes no line.

Within a line, cards keep their arrival order, left to right. Creatures
and everything else sit centred on the table; lands start at the left
edge. A later card overlaps the one before it, as today.

**When it fills up**, each side, separately (your opponent's board never
makes yours smaller):

1. Identical cards stack, up to 15 (spec 0036).
2. Full size, normal gaps.
3. Cards overlap evenly, but each always shows **at least half** of
   itself: its name, the left half of its picture, its power and
   toughness.
4. **A spare line goes to the most crowded kind.** At full size a side
   has three lines; if a kind is absent, the line it would have used
   goes to whichever kind needs room (a creature horde takes it), its
   cards split evenly between its lines in arrival order.
5. **Then the whole side shrinks a step**, all its cards together:
   90%, 80%, 75% (where a fourth line fits), 70%.
6. At 70% (the floor) cards overlap past half, down to a third; below
   that the side is reported crowded, as today.
7. **Grows back only with room to spare**: a side goes back up a step
   only when the bigger size would show at least 60% of every card, so
   one card coming and going never makes the board jump between sizes.

Measured on the canvas's boards at 1920×1080: every board stays at 90%
or more with at least half of each card showing; on a 1366×768 laptop
the Commander-size board is 80%.

**Tapped cards** tilt **5°** (was 15°), keep the dim and the TAPPED tag,
and are never cut: a 5° tilt fits inside its line (144 px tall in a
144 px line at 1080), so the clip is removed. The tilt room of PHASE 7
AMENDMENT 3 stays (a tapped card overlaps nothing while a line has
room); at 5° it is a few pixels.

Unchanged: the hands, the rail, combat (blockers ride on their
attackers, spec 0037), stacks (0036), Aura and Equipment tags, the
lines and effects layer, card sizes at rest (100% is today's card).

## How

- `layout.ts`: the six `ROWS` and `FILL_ORDER` give way to lines. A side
  is the band today's three rows cover (0.0964–0.4975 of the height for
  the opponent, mirrored for the viewer); a line's height is a row's
  height × the side's size, so it holds `floor(1 / size × 3)` lines
  (3 at 100–80%, 4 at 75–70%). `planRows`' overlap is reused per line
  with the half-card minimum; the size is chosen per side from the
  steps above.
- Stays a pure function: the side's previous size, for growing back, is
  an input the board passes in, never stored inside `layout()` (§7.6).
- `TAPPED_TILT` 15 → 5; `Board.tsx` stops clipping battlefield cards to
  their band (`bandClip`); an animation that leaves its line still draws
  above the lines (AMENDMENT 4 item 6's second half).
- Row ids (`viewer:creature-front`...) become line ids
  (`viewer:creature-1`, `viewer:other-1`, `viewer:land-1`...); the page,
  the effects and the e2e tests that read `data-zone` move with them.
- `/dev/board?scenario=<name>` keeps the ten named boards from the
  canvas (early, mid, landsheavy, wide, tokens, artifacts, combat,
  stress, horde, commander) as a permanent fixture, for tests and for
  looking.
- Docs: BATTLEFIELD_LAYOUT_CONTRACT.md §2–§3 and BATTLEFIELD_RENDERING.md
  §4 say they are amended by this spec; PHASE 7 AMENDMENT 4 item 6 (the
  corner clip) and the six-box geometry are superseded. The frozen phase
  papers are not edited.

## Scope

In: where battlefield cards sit, how a busy side shrinks, the tapped
tilt, the dev fixture, the docs above.

Out: the hand, the rail, card art and frames, combat and stack effects,
anything Forge reports.

## Rules and boundaries

- `layout()` stays pure and per viewer (§7.6, §7.12), and still decides
  nothing about the game: a card's line follows Forge's `kind`, its
  place Forge's entry timestamp (§6.50).
- Every card stays individually clickable: never less than a third of a
  card showing.
- The performance budget (BATTLEFIELD_RENDERING.md §6) still holds on the
  90-permanent benchmark.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0040-A | No line ever holds two kinds: the ten scenario boards and seeded boards up to 200 permanents, at five screen sizes | unit (layout) |
| F-0040-B | No tapped card's drawn corners leave its line; nothing is clipped | unit (polygon), browser |
| F-0040-C | The steps in order: overlap to half, spare line, then 90/80/75/70%; a horde takes the empty line; each side sized alone | unit |
| F-0040-D | Growing back needs 60% showing; one card in and out does not change the size | unit |
| F-0040-E | The ten boards on the real board at 1366×768, 1920×1080 and 3440×1440 | browser screenshots |
| F-0040-F | Real games still play: combat riders, stacks, attachments, targeting, the e2e suite | e2e |
| F-0040-G | The benchmark stays inside the budget | benchmark |
| F-0040-H | It looks and plays right | owner |

## Decisions for the owner

All taken 2026-10-30 (see the top).

## Amendments

**Amendment 1 (2026-10-30, at build).** Three things the build settled:

- *Which cards count as overlapping.* A tapped card's tilt room may be
  squeezed before anything counts as overlapping: "showing" is measured
  between cards' upright edges. At 5° the tilt is a few pixels.
- *Riders.* A blocker riding its attacker (spec 0037) is drawn over every
  line, so it may cross the divider and cover the defender's line, as
  spec 0037 already draws it; the line checks leave riders out.
- *Draw order.* Up to four lines a side, so a line's cards are stacked
  four apart (was ten) and a rider sits 2000 above them, keeping every
  battlefield card under the lines and effects layers.
