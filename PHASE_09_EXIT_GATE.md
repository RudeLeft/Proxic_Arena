# Phase 9 Exit Gate

**Status: WAITING FOR THE OWNER (P9-O).** Every item is decided and built,
two audits are done and their findings fixed, CI is green on `02b33ae`.
What is left: one decision (Esc, below), a release so the owner can play
it on the live site, and the owner playing and accepting.

Phase 9 (`PHASE_09_GAME_WINDOWS_LOCKED.md`, locked 2026-10-30): every
window, popup and prompt in a game -- each with today's real screenshot,
a canvas, the owner's decision, then built and shown before it shipped.

```text
27 items (W-00 to W-26)          every one decided and built; none dropped
22 amendments                    each a decision or an as-built record, with its evidence
88 kinds of question             every one shown in a real page (170 shapes); each opens
                                 a window, has its own title and no filler line
 2 audits                        found 1 missed window (W-26) and 2 shared gaps; fixed
58 Mechanics Lab scripts, 58 browser specs (45 real games), 775 page tests,
658 server tests, the worker's tests              0 failed (CI 02b33ae); one browser
                                 test switched off on purpose (abandoning a match:
                                 covered by the server tests and match-concede)
ktlint, detekt, ESLint, Prettier, tsc             clean
```

---

## The items

| # | Window | Decided | Evidence (tests) |
|---|---|---|---|
| W-00 | One look for every window: bubble beside the card asking, tray from the bottom, the seven rules | 2026-10-30 | every window below; Peek and Space (Amendment 18) |
| W-01 | A click on the table: a bubble beside the card asking | 2026-10-30, Amendments 2, 17 | `match-numbers`, `match-interaction`, `Board.test` |
| W-02 | Choices the table can't show: bubble or tray | 2026-10-30, Amendment 2 | `QuestionWindows.test`, `match.spec` |
| W-03 | List choices | 2026-10-30, Amendment 2 | `match-status-list` (the tray, Peek) |
| W-04/05/06 | Yes/no, which first, the same question again (Boggart Shenanigans) | 2026-10-30, Amendment 1 | `check-many-triggers`, `match-many-triggers` |
| W-07..W-10 | Order, scry/surveil, hidden zones, piles | 2026-11-01, Amendment 3 | `check-card-trays`, `match-card-trays`, `match-surveil`, `cardPlans.test` |
| W-11 | Numbers: X, kicker, splits | Amendment 14 | `check-numbers`, `match-numbers` |
| W-12 | Name a card | Amendment 16 | `check-card-name`, `match-card-name` |
| W-13 | Assign combat damage | Amendment 4 | `match-damage-tray`, `cardPlans.test` |
| W-14 | Combat choosers: select, then point | Amendment 11 | `combatPlan.test`, `match-big-combat` |
| W-15 | Before the game: play or draw, mulligan, put back, begin in play | Amendment 9 | `OpeningHand.test`, `match-opening-hand` |
| W-16 | Which ability, and why not | Amendment 10 | `abilities.test`, `match-ability-menu` |
| W-17 | Dice, rolls, Un-set choices (3D die) | Amendment 19 | `check-dice`, `check-unset`, `DiceWindows.test`, `match-dice` |
| W-18/19 | Zone viewer, card close-up | Amendment 8 | `zoneTray.test`, `match-stolen-picture` |
| W-20 | The stack | Amendment 7 | `effects.test`, `match-what-happened` |
| W-21 | The status tray's lists, and Peek | Amendment 18 | `StatusTray.test`, `check-tracked-state`, `match-status-list` |
| W-22/23 | The game's messages; connection and refusals | Amendments 5, 12, 22 | `notices.spec`, the second audit (every window shows a refusal) |
| W-24/25 | Game over; the waiting line | Amendments 6, 21 | `stops.test`, `match-concede`, `match-alternate-win`, `match-modes-doing` |
| W-26 | The other player is away (added by the first audit) | Amendment 20 | `match-away` |

The two "not built" parts recorded on the way -- modes counted in one go
(Amendment 2) and "Pat is splitting the cards" (Amendment 3) -- were
built in Amendment 21. Stopping at enough targets (Amendment 17) shipped
in 1.44.0.

## The audits

- **First (Amendment 20):** every Mechanics Lab game played, and each of
  its real questions (88 kinds, 170 shapes) shown in a real game page
  with its own board. Found: the away card never listed (now W-26);
  filler words on 18 kinds; convoke titled "Your move"; identical
  Leylines asked; raw game words; dungeons with no information. Kept as a
  test: `everyQuestion.test.ts` fails when an asked kind has no title or
  shows filler.
- **Second (Amendment 22):** everything besides questions, the other
  player's screen, spectators, and for every kind a refused answer and
  answering for another seat. Found: 31 kinds showed no refusal and no
  "Playing for seat N"; spectators guessed; a tray under the corner
  buttons; the ability menu didn't fade. Fixed in the shared window frame,
  so a later window can't leave them out; re-run: 0 of 87 missing.

## The exit checks (2026-11-06)

- **Real card art.** A real game with the owner's Basic Mono Red deck
  (real printings): Play or draw, the "Everything you can do" tray with
  each card's picture, the hand. Pictures load and fit. (The browser
  tests' decks have blank pictures, so this was the first look at real
  art in the windows.)
- **The keyboard, in every kind of window** (95 cases): Tab reaches a
  button in every window that has buttons; Enter answers on answer
  buttons, and on a card tile or a stepper it picks or adjusts, as a
  click does; a question answered on the table is answered with the
  board's cards, which are buttons; Esc never answers a question that
  must be answered, and on a target it cancels the spell (Amendment 17).
- **Esc on a question you may decline: an owner decision.** Today Esc
  backs out of what you are casting or paying for (every cost, mana,
  which ability, the targets) -- exactly the act button's Cancel. In 23
  other questions that may be declined (a "may" trigger's payment,
  reroll, scry's top or bottom, modes, X, kicker, convoke, crank...)
  there is no Cancel on the act button, and Esc does nothing: the
  window's own button ("No", "Keep the 4", "Don't crank") declines. Rule
  7 says "Esc backs out wherever the rules allow it".

## Still to do

1. The owner decides Esc (above); built if it changes anything.
2. A release (1.45.0) with everything since 1.44.0, so the owner can
   play it on the live site.
3. **P9-O:** the owner plays real games on the live site and accepts.

On acceptance: this paper and `PHASE_09_GAME_WINDOWS_LOCKED.md` move to
`docs/history/phases/phase-09/` unedited, and Phase 9 is marked complete
in `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md` and `README.md`.
