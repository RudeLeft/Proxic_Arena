# Phase 9 — Every window, popup and prompt in a game

**Status:** LOCKED and ACTIVE 2026-10-30 (owner: "Lock it, build group 1").
Changes from here are dated amendments (PHASE-002). Items not yet decided
still each get their canvas and the owner's decision before they are built.
**Owner's brief (2026-10-30):** the "List choices" box at the bottom left,
every popup notification (the "select a target" one at the top), every
window (library, graveyard, exile), reordering your library, and the stack,
where a spell's card art cannot be seen. "The windows are ugly, and
overall it was not a smooth UI experience." Every window is listed, then
taken **one at a time**: a canvas draft and demo, the owner's approval,
and only then a build.

## Why

The owner's game with **Boggart Shenanigans** ("whenever another Goblin you
control dies, you may have it deal 1 damage to target player"), when seven
Goblins died at once:

1. a window asked which of the **seven identical triggers** should resolve
   first, one click each;
2. each trigger asked for a **target**, the other player every time;
3. each asked **"Confirm"**, yes, seven times.

Twenty-odd clicks for one effect, through three different-looking boxes.
And a spell on the stack shows a name bar but not its picture, so you can't
see what it does.

What already holds and stays: the board is the answer wherever a click on
it can do (PHASE 7 AMENDMENT 12: no box over the table when a card or
player can be clicked); every option stays reachable without the board
(§7.29); the game never answers for a player without a rule saying so
(Phase 8: every question asked).

## How the phase runs

For each item below, in an order the owner sets:

1. **Today**: a screenshot of the real window in a real or Lab game, and
   which cards bring it up.
2. **Canvas**: two or three ways it could look and work, drawn on the real
   board's look, with a demo you can click.
3. **Owner decision**, asked as a question, recorded here as an amendment.
4. Then the next item.

Building happens only after an item's decision (in groups, as the owner
chooses), each with its screenshots before it ships.

**Group 1 (built, in 1.23.0):** the W-00 frame (the bubble beside the card,
the tray from the bottom, the seven rules) as used by the yes/no questions
(W-04), trigger ordering (W-05) and the same question again and again
(W-06): Boggart Shenanigans in 2 clicks. Every other window moves into the
frame as its own item is decided.

## The inventory

**W-00 — One look for every window.** First, so every later canvas uses
it: where windows appear (over the board, at the side, from the rail), how
they look (frame, title, buttons), how they get out of the way so you can
still see the board, and what Esc and clicking away do.

### Questions the game asks you

| # | Window | When you see it | Example cards |
|---|---|---|---|
| W-01 | **The question banner** at the top ("Choose a target", "Tap something for mana") | Whenever the answer is a click on the board: targets, paying costs, mana | Lightning Bolt, any spell with a target, sacrifice costs |
| W-02 | **The question box** in the middle: choices the board can't show | Modes, a colour, a creature type, a kind of counter, protection, "choose one" | Charms, Cavern of Souls, Gods Willing |
| W-03 | **"List choices (N)"**, bottom left, and the full list it opens | Any question, as every option in a list | — |
| W-04 | **"Confirm" yes/no** | A "may" trigger, an optional cost, a replacement ("you may"), paying for an effect | Boggart Shenanigans, Rhystic Study, Thalia's tax |
| W-05 | **"Choose what resolves first"**: ordering triggers | Two or more of your triggers at the same moment | Boggart Shenanigans × 7, Blood Artist + Zulaport Cutthroat |
| W-06 | **The same question, again and again** (a flow, not one window) | Many identical triggers each asking the same target or yes | Boggart Shenanigans, Impact Tremors |
| W-07 | **Put cards in order** on your library | Putting several cards back on top or bottom | Ponder, Sensei's Divining Top, Brainstorm's two back |
| W-08 | **Looking at cards**: the tray of cards only you see | Scry, surveil, top or bottom | Opt, Consider, Preordain |
| W-09 | **Choosing from a hidden zone**: searching your library, cards from the top, the opponent's hand | Tutors, digging, discard spells that show the hand | Evolving Wilds, Impulse, Thoughtseize |
| W-10 | **Piles** | Split into piles and choose one | Fact or Fiction |
| W-11 | **Numbers**: X, "how much", how many times | Choosing X, paying extra, dividing | Fireball, kicker multiples, divide damage |
| W-12 | **Name a card** (a search box) | Naming a card | Pithing Needle, Meddling Mage |
| W-13 | **Assign combat damage** | Trample, or an attacker blocked by several | Any trampler, double blocks |
| W-14 | **Combat choosers**: block many, choose what to attack | Blocking with a stack (0037), attacking a planeswalker or battle | Token armies, planeswalkers |
| W-15 | **Before the game**: play or draw, keep or mulligan, put cards back, start with it in play | Every game's start | Leyline of Sanctity |
| W-16 | **"Choose which ability"** popup, and the **"why not"** tip | Clicking a card that can do several things, or one that can't be played now | Creature lands, planeswalkers |
| W-17 | **Dice, rolls and Un-set choices** | Rerolls, sectors, sprockets, cranks | Rare: Un-sets and dice cards |

### Windows you open

| # | Window | When you see it |
|---|---|---|
| W-18 | **Graveyard, exile and library viewer**, yours and the opponent's | Clicking a zone in the right-hand column |
| W-19 | **Card close-up** | Right-clicking (or pointing at) a card |
| W-20 | **The stack**: spells and abilities waiting to resolve (no picture today) | Every spell cast, every trigger |
| W-21 | **The status tray's lists**: the command zone, "+N" | An emblem, a dungeon, the Ring; many counters |

### Messages

| # | Window | When you see it |
|---|---|---|
| W-22 | **Notices** at the top (what just happened) | A card revealed, a choice the opponent made |
| W-23 | **Warning and error banners** | Connection lost, an answer the game refused |
| W-24 | **Game over** | The end of every game |
| W-25 | **"Waiting for..." line** in the right-hand column | While the opponent decides |

### Around the game: out of scope (owner 2026-10-30)

The gear menu (Concede, Abandon match), the game chat drawer and the Report
window (spec 0039) stay as they are.

## Screens

Every canvas and every check is at 1920×1080 (full screen and in a browser
window) and above (AGENTS UI-006, owner 2026-10-30); smaller screens and
phones are best effort.

## Out of scope

The board's layout (spec 0040), the rail's spacing (0038), the gear menu,
the chat and the Report window, the lobby and other pages; what the game
decides (Forge's rules); new questions.

## Exit gate (draft)

Every item above has a recorded decision (built, kept as is, or dropped
with a reason); every built item has its screenshots and its tests; the
Boggart Shenanigans case plays in a real game in the clicks the owner
approved; the owner plays and accepts.

## Decisions for the owner

Taken 2026-10-30:

- **Scope:** W-00 to W-25; the gear menu, chat and Report window are out.
- **Order:** W-00 (one look for every window) first, then the Boggart
  Shenanigans flow (W-04, W-05, W-06); the rest in an order set as we go.
- **Building:** after each group is designed and approved; screenshots of
  the group before it ships, then the next group.

**W-00 decided (2026-10-30, canvas
https://claude.ai/artifact/RQ672Re4nWxdmpxHcw8aDb):**

- **Style: a mix.** Quick questions (yes/no, a mode, a target, a number)
  are a **bubble beside the card asking**: on the stack, on the board or in
  your hand, pointing at it. Big questions with many cards (putting cards
  in order, searching, piles, looking at several cards) are a **tray from
  the bottom**, over your hand.
- **The seven rules, for every window:** (1) show the card asking, its
  picture; (2) plain words only, never the game's internal codes; (3)
  choices that are cards are shown as card pictures; (4) one button style,
  the main answer gold and on the right, the same words everywhere (Yes,
  No, Done, Cancel); (5) never cover the stack, the card being cast or the
  answer button, and no window at all when the answer is a click on the
  board, only a line of text; (6) hold Space (or Peek) to fade the window
  and see the table; (7) Esc backs out wherever the rules allow it, and
  clicking away never answers anything.

**W-04, W-05, W-06 decided (2026-10-30, canvas
https://claude.ai/artifact/Q2WQz1joTWbertoaQVzx4k):** measured today from a
real game's record, seven Boggart Shenanigans triggers take 20 clicks (6 to
order identical rows, 7 targets, 7 confirms). Chosen: **answer once for all
the copies**, 2 clicks:

- **Copies of one ability skip the order question** (same card, same
  ability: any order gives the same result). Different triggers are always
  asked: the tray shows their cards, and they are clicked in the order they
  should resolve, the first clicked resolving first.
- **One target question for all the copies**, with "Same target for all N"
  **ticked to start**; unticked, each asks in turn.
- **One yes for all**: the bubble at the first resolution offers "Yes to
  all N", "Just this one" and "No". The triggers still resolve one by one
  and the opponent can still respond between them; a remembered answer
  stops, and the game asks again, if its target is gone or a different
  question comes up. Nothing is answered without the player's click.
- The bubble names what happens in plain words ("Deal 1 damage to
  RudeLeft?") and shows which trigger it is ("2 of 7").

Still open: every other item, one at a time.

## Amendments

**Amendment 1 (2026-10-30, group 1 as built).**

- *Where "copies" is decided.* The worker already skipped the order
  question for identical triggers (Forge's own rule); copies now also
  match when only their cause differs ("[Zone Changer: Goblin Token
  (122)]"), unless the ability reads its cause (TriggeredCard and the
  like), when order can matter and it still asks. The worker tells each
  copy's target question which copy it is ("copy 2 of 7") -- also when
  the copies go on the stack beside a different trigger -- and names the
  card on a trigger's yes/no question. The page answers the later copies
  only from what the player chose ("Same target for all", "Yes to all").
- *Mixed triggers.* When copies go on the stack with a different trigger
  (Boggart Shenanigans and a Goblin Arsonist), the order is asked, and the
  tray shows the copies as one card, "×N"; they go on the stack together.
- *Which questions moved into the frame:* every yes/no question (a bubble
  beside the stack), the target of a trigger with copies (a bubble), and
  different triggers to order (the tray). Every other question stays as
  it was until its own item is decided. "List choices" still lists every
  option of every question (§7.29).
- *Same-name cards (owner 2026-10-30, from the screenshots):* the same
  trigger of other copies of one card -- three Goblin Arsonists dying
  together -- are copies too: matched by the card's name and the words,
  without the cause or Forge's card numbers. One card "×3" in the tray,
  no order among them, "for all 3" on the target and the yes.
- *The tray (owner 2026-10-30, from the screenshots):* as wide as its
  cards need, centred on the table; each choice is the card itself, large
  enough to read (220×307, the sharp close-up picture), or its name, type
  and words on a plain card when it has no picture.
- *Evidence:* `scripts/check-many-triggers.py` (Mechanics Lab: no order
  question, one target and one yes per copy, "1 of 4" to "4 of 4") and
  `frontend/e2e/match-many-triggers.spec.ts` (a real game in the browser:
  one target, "Yes to all", the opponent losing a life per copy), with the
  triggers test deck (`protocol/fixtures/triggers-deck`).
