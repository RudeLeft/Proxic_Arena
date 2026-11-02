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

**Group 2 (built, in 1.24.0):** the everyday questions in the same frame
-- a click on the table (W-01) and choices the table can't show (W-02) as
a bubble beside the card or the tray, "List choices" as the tray grouped
by card (W-03). See Amendment 2.

**Group 3 (built, in 1.26.0):** the card trays -- putting
cards in order (W-07), scry and surveil (W-08), choosing from a hidden
zone (W-09), Fact or Fiction's piles (W-10). See Amendment 3.

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

**W-01, W-02, W-03 decided (2026-10-30, canvas
https://claude.ai/artifact/4bM7QkuXj1o22V2T5QWc2q) -- group 2:**

- **W-01, the answer is a click on the table** (a target, paying mana,
  discarding, sacrificing): **a bubble beside the card asking** -- the
  spell being cast, in its place on the stack, or the card being paid for
  -- with its name, what to click in plain words ("3 damage to any
  target. Click a highlighted creature or player."), what is still owed
  when paying, and its Cancel. The top banner goes.
- **W-02, choices the table can't show** (modes, a colour, a type, "choose
  one"): **a bubble for up to six short choices; the tray from the bottom
  for more, or when the choices are cards**, with a search box when the
  list is long. Modes are counted in one go ("Choose three, 2 of 3");
  colours are the five mana symbols.
- **W-03, "List choices"**: **the corner button stays** and opens a tidy
  tray: every option grouped by its card, with the card's picture, in
  plain words ("Cast · {2}{R}"), the ones that can't be paid now dimmed
  with the reason.

**W-07, W-08, W-09, W-10 decided (2026-11-01, canvas
https://claude.ai/artifact/YYJjyLHDPYwmv5cRyxCDSR) -- group 3,** all in
the tray from the bottom, the cards as pictures:

- **W-07, putting cards back in order** (Ponder, Sensei's Divining Top,
  Brainstorm): **click them in the order you'll draw them** -- each gets a
  gold number, 1 the top card; clicking a numbered card takes it back
  (and the ones after it); Done when all are numbered (the last one numbers
  itself). Ponder offers **Shuffle instead** in the same tray. Cards going
  to the **bottom** (Impulse's other three) are worded for the bottom and
  have **Any order**, one click. Brainstorm's two are clicked in the hand
  the same way.
- **W-08, scry and surveil** (Opt, Preordain, Consider): **two rows**, "Top
  of library" and "Bottom of library" (surveil: "Graveyard"); every card
  starts on top, a click moves it to the other row; two or more on top
  are numbered in draw order and can be reordered there. Scry and its
  ordering are one window.
- **W-09, choosing from a hidden zone** (tutors, Evolving Wilds, Impulse,
  Thoughtseize, Duress): **one picture per different card, with a count**
  ("×4"), lands last, a search box and Lands / Spells filters; cards that
  can't be chosen stay in view, dimmed, with the reason ("a land"). A few
  cards (the top four, a hand) show one picture each.
- **W-10, piles** (Fact or Fiction): **the same two piles on both
  screens** -- the splitting player clicks cards between Pile 1 and Pile
  2, then Done; the choosing player sees the two piles as pictures with
  "Take this pile" under each.
- **Found in today's screenshots, fixed with the group:** the window names
  the wrong card when the game's question doesn't say which card asks (a
  search's words list the library: "Sensei's Divining Top" on Evolving
  Wilds, "Fact or Fiction" on Impulse) -- the card asking is the one
  resolving; and cards going to the bottom are asked "which do you want
  to draw first?". (A blank Fact or Fiction seen in the middle of the
  splitting player's table was the spell's own turn-over on its way to
  the stack, caught mid-way by the screenshot: gone a moment later, not
  a fault.)

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

**Amendment 2 (2026-10-30, group 2 as built).**

- *Which questions moved into the frame:* every question except four
  that are their own window already, which keep the bar: the cards you
  are looking at (scry, surveil -- their own item later), naming a card
  (its search box), combat (the act button, owner 2026-10-22), and your
  move with nothing to list (no bar at all, AMENDMENT 12).
- *W-01:* the bubble sits beside the stack, where the spell being cast
  or the card being paid for is; it says what to click, shows the game's
  own words ("still owing {1}"), the few choices the table can't show
  ("All attack", floating mana) as buttons. *No Cancel in the bubble
  (owner 2026-10-30):* backing out stays the button under the stack
  ("Cancel Lightning Bolt") and Esc, one place, as before; only "List
  choices", which that button steps aside for, has its own Cancel.
- *W-02:* a bubble for up to six choices of 60 letters or fewer that are
  not cards; otherwise the tray, the cards as large pictures, the rest in
  columns, with a search box over twelve choices. Colours are the mana
  symbols; very short choices ("X = 3") are a row of chips. A question
  the game doesn't name a card for ("Choose a mode for Fiery
  Confluence.") shows the card its words name.
- *Not built: modes counted in one go* ("Choose three, 2 of 3"). The game
  asks for modes one at a time and does not say how many are left; the
  page would have to guess. Modes stay one at a time, each in the bubble,
  until the worker sends the count (a later item).
- *W-03:* the tray lists every option grouped by its card, the card's
  picture beside them, dimmed when it can't be paid now ("not enough mana
  right now"). Copies of one card offering the same choices (five
  untapped Mountains) are one picture "×5" with one set of buttons, which
  uses the first copy; any copy is still a click on the table. The card's name is not repeated before each choice; it
  stays in the text a screen reader (and the scripted games) read.
  Naming a card keeps its search box even with the list open.
- *Mana as icons (owner 2026-10-30):* wherever the game's words name
  mana or the tap symbol ("{T}: Add {R}", "still owing {1}", a cost
  before an ability) they are drawn as the mana symbols -- in every
  window, the list, the menu on a card, the messages and the bar that
  stays. The letters stay in the text for reading aloud.
- *Evidence:* the full browser suite (every scripted game answers through
  the new windows: `.gs-win` list buttons, the `data-kind` and
  `.gs-question-title` hooks kept) and `QuestionWindows.test.ts`.

**Amendment 3 (2026-11-01, group 3 as built).**

- *The trays* (`frontend/src/battlefield/CardTrays.tsx`): every question
  that shows cards only its player sees moves into the tray -- putting
  cards in order, scry and surveil, a search, the top few, another
  player's hand, Fact or Fiction's split and its piles. The old scry box
  in the middle is gone. Each card shows its name under its picture.
- *What the game now tells the page* (the worker's `arrange`, passed
  through to the asking seat only): where the cards go ("to": top,
  bottom, graveyard), which end the first pick lands at ("first"),
  Ponder's "you may shuffle" ("shuffle"), the hidden zone ("zone":
  library or hand), the split, and the two piles by card. The cards
  themselves travel as pictures (`looking`), shown to that player only
  while the question is open, as the game's own client does. Names no
  longer carry the game's internal numbers ("Island (69)").
- *One set of clicks, the game's one-at-a-time questions answered from
  it.* The game still asks an order one card at a time, scry's "which go
  to the bottom?" then "which goes on top?", and pile 1 one card at a
  time. The tray asks once; the page answers each of those questions from
  what the player clicked, only while the game asks exactly what the
  click was for -- anything else ends it and the player is asked
  (`cardPlans.ts`). Ponder: Done answers its shuffle question No,
  Shuffle instead answers Yes; the shuffle bubble no longer follows.
  Brainstorm: the two hand cards are numbered as clicked (a gold number
  on the card) and their order question is answered from that.
- *Impulse's rest:* the game's own rule treated "the rest on the bottom"
  as the top, so the page was asked "which do you want to draw first?".
  It is now asked as the bottom ("Which goes at the very bottom of your
  library?"), the first pick landing at the very bottom, as it always
  did; the tray has Any order.
- *The card asking:* when the game does not name it, the spell or
  ability resolving on top of the stack, never the first card name in
  the question's words.
- *W-09:* a library is one picture per card with its count, spells before
  lands, a search box, and Spells / Lands chips when there are both; the
  top few and a hand show every card. Another player's hand shows the
  cards it revealed that can't be chosen, dimmed, with why ("a land").
  The game's words are kept without the list the pictures already show.
- *Not built:* a line on the other player's screen saying "Pat is
  splitting the cards". While one player splits or chooses, the other
  sees the five cards in the reveal tray and the rail's "Waiting for
  Pat", as for every question.
- *Evidence:* `scripts/check-card-trays.py` (Mechanics Lab: nine cards,
  what each question carries), `frontend/e2e/match-card-trays.spec.ts`
  (a real game: every tray clicked through, nothing asked twice) with
  the card trays test deck, `match-surveil.spec.ts` (the two rows), and
  `cardPlans.test.ts`.

**Amendment 4 (2026-11-01, W-13 decided and built -- owner's item 5,
canvas https://claude.ai/artifact/GXixi5Eb5b43KELUTGjn81).**

- *Assign combat damage, two or more blockers:* one tray, the blockers as
  pictures in the game's damage order, each with what it still needs to
  die ("needs 2 ✓" once it has it), filled in the usual way -- lethal to
  each in order, the rest to the last, or to the player with trample;
  + and − move points; "Damage left" and Done. Trample reaches the
  player only once every blocker has lethal (CR 702.19c); a creature
  that divides its damage as it chooses may give the player any of it.
- *How:* the worker's damage question carries the fight (`arrange.damage`:
  how much, each blocker with Forge's lethal reading, trample or divides);
  the game still asks one point at a time and the page answers each from
  the split (`cardPlans.ts` damageSteps), only while it asks exactly that.
- *Evidence:* `scripts/check-combat-choices.py` (double-block and trample
  now also check the fight carried), `frontend/e2e/match-damage-tray.spec.ts`
  (a real double block: the tray filled in, Done, never asked a point at a
  time), `cardPlans.test.ts`.

**Amendment 5 (2026-11-02, W-22 and W-23 decided -- built with spec 0050,
canvas https://claude.ai/artifact/P5eET6QgnywiZTCZPU1uP4).**

- *W-22, the game's own messages:* the notice card from spec 0050, in
  grey, top right of the table beside the opponent's column. Clicks go
  through it to the table, and it turns see-through under the pointer
  (Phase 7 Amendment 12). It fades after 7 s, as before; four are kept at most, three shown
  and the rest as "+1 more".
- *W-23, connection:* "Reconnecting to the game…" is the blue card,
  going on its own when the connection is back; "You're no longer
  connected to the game" is red with a Reload button. A new version
  waits until the game is over. Answers the game refused stay inside
  their question window.

**Amendment 6 (2026-11-02, W-24 and W-25 decided and built -- canvas
https://claude.ai/artifact/V6QHFDjArMC2HjfPThQV9L).**

- *Today (found from screenshots of a real game):* game over said the
  result three times (the box's title, its sentence and the column) and
  the turn twice; "You won" was the smallest thing on the screen; the box
  hid the middle of the table and could not be put aside; the waiting
  line was in capitals and broke a name over two lines.
- *W-24, game over (owner: option B, the banner; no Play again):* a
  banner across the table, which dims behind it -- "YOU WON" in gold, or
  "PAT WON" (or "A DRAW", "GAME OVER") in silver; under it why, said once
  (the loss reason, a concession, a life total at 0, or Forge's own
  sentence for an alternate win, word for word, P6-AP), and the turn.
  Buttons: **Back to the room** (a spectator: Back to the lobby) and
  **Look at the board**, which puts the banner away; the column's button
  then goes back to the room, with "Show the result" above it. The full
  sentence stays what a screen reader hears. A spectator is nobody's
  "you". The type scale gains one step for the banner alone
  (`--pa-size-result`, spec 0017).
- *W-25, the waiting line (owner: option B):* "Pat’s move" in plain
  letters on one line, and under it what the screen shows Pat doing
  ("Choosing blockers", "May respond to your Lightning Bolt"), or else
  the step ("Main 1 · their turn"); "Resolving…" names the spell under
  it. Pat's plate glows softly while you wait for Pat. Only what both
  players can see is used, never Pat's question.
- *Evidence:* `stops.test.ts` (the words, a spectator, an alternate
  win), `match-concede.spec.ts` (the banner both sides, Look at the
  board, Show the result, Back to the room), `match.spec.ts` (the
  waiting line and the glow on the waiting player's screen only),
  `match-alternate-win.spec.ts` (Forge's sentence in the banner).
