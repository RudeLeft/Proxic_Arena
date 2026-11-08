# 0065 — No logo on the table; the mana vortex loading screen

**Status:** Approved 2026-11-07 (owner, on the canvas "loading-1107", sent as a file)
**Owner decisions:** remove the logo from the battlefield and the loading screen; option A · Mana vortex

## Built

- The Proxic Arena logo is gone from the battlefield's top-left corner
  (nothing replaces it) and from the loading screen before the table.
- The loading screen (A · Mana vortex): the five mana symbols orbit,
  speed up into a swirl, and burst into light as the table appears; the
  words stay as today ("Setting up the table...", "Shuffling up and
  dealing...", "Reconnecting to the game..."). The ending is kept short
  (under about 1.5 s) so it never holds the table up; reduced motion shows
  a still version.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0065-A | No logo on the battlefield or the loading screen | page test; screenshot |
| F-0065-B | The vortex loops while waiting and bursts as the table appears | slow-motion clip |

## Amendments

### As built (2026-11-07)

- **The corner:** the logo picture and its style are gone from the
  battlefield's top left (`GameScreen.tsx`, `game.css`); nothing replaces
  it. The screen reader's line ("The game is running." and so on) stays.
- **The loading screen** (`battlefield/LoadingRing.tsx`) is the canvas's
  option A, its drawing code carried over: no logo; the five mana symbols
  (the existing `assets/mana/sym_*.png`) orbit with glowing trails and
  motes spiralling in, speeding up the longer the wait (from 0.6 to 2
  radians a second over about 12 s), sizes as on the canvas
  (orbit 112 px, symbols 50 px). The words are unchanged and sit under the
  swirl. Loops while waiting, for as long as the wait lasts. It is still
  shown only after 0.4 s. The swirl keeps its place from the page's
  "Starting the game." loading screen to the table's own one.
- **The ending, 1.2 s in all:** the symbols fall into the centre
  (0.3 s), then burst into light: sparks, a ring of light and a flash
  that fades while a circle opening from the centre uncovers the table
  (0.6 s, reaching the screen's corners), and the last sparks fade
  (0.3 s). Shorter than the canvas's 1.9 s, so it stays under 1.5 s.
- **How the burst meets the table:** the table is drawn in the same
  render its first picture arrives, at its final place, UNDER the burst;
  the burst plays over it (clicks pass straight through) and then goes.
  So the table is never delayed, and nothing on it moves when the burst
  ends. The end comes on a timer, not on animation frames, so a game
  opened in a background tab is uncovered too. A table that arrives
  before 0.4 s shows no loading screen at all, as before.
- **Reduced motion:** the five symbols stand still on their circle,
  softly lit, with the words; when the table arrives the loading screen
  fades out in 0.25 s.
- **Tests:** `battlefield/fixes0065.test.tsx` -- the real game screen with
  its socket replaced: no logo on the loading screen or in the corner;
  the vortex still looping after 10 s; the table drawn in the very render
  the board arrives, the burst over it, gone at 1.2 s; no loading screen
  for a table before 0.4 s; the table leaving mid-burst goes back to
  waiting; reduced motion still. Checked to fail with the logo put back,
  with the burst removed, and with a 2 s ending. No e2e test named the
  logo or the loading screen.
- **Seen:** slowed screenshots of a real local game (waiting, a long
  wait, the collapse, the flash, the opening circle, the last sparks, the
  table, the top left, reduced motion).
