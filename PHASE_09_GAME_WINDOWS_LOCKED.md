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

Still open (2026-11-04): W-17 and W-21, then the exit gate. Two parts of
built items are recorded as **not built** and need a decision at the
exit gate: Amendment 2's modes counted in one go ("Choose three, 2 of
3") and Amendment 3's "Pat is splitting the cards" line on the other
player's screen. Everything else is built (see the Amendments), with
these gaps against principle 6 found by a documentation check
(2026-11-04): there is no Peek button (only holding Space; see the
as-built note below), and holding Space fades only the bubble and the
tray windows (`usePeek`), not the opening hand window (W-15); the reveal
tray and the graveyard/exile viewer do not fade either, if they count
as windows. Owner 2026-11-04: Peek is designed with W-21 and W-17.

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

**Amendment 7 (2026-11-02, W-20 decided and built -- canvas
https://claude.ai/artifact/36FFjtgAJYkNMHVaAvAgZr).**

- *Today (found from screenshots of real games):* a spell on the stack
  showed its art (a real deck's picture) but not what it does; a trigger
  was its card's art with the word "Trigger"; what anything does showed
  only on pointing or a right-click; older items showed a sliver of their
  name; a name shared its bar with the mana cost and was cut off. And
  "Let it all resolve" sat over the opponent's plate at the top of the
  right-hand column, unplaced.
- *W-20, the stack (owner: option A; the card being cast keeps its large
  place in the middle):* the stack is drawn readable -- each object as
  its card's whole picture at the close-up's size (twice the old stack
  card), at the right edge of the table, the next to resolve in front and
  lowest; older ones fan upward showing their name bar and some art.
  A trigger or ability has its own words on a plate over the card's text
  box ("Trigger -- Whenever you gain life, ..."). Pointing at an older
  one brings it to the front. While something is to be chosen on the
  table (a target, a payment, attackers), the stack steps back to the
  old size, off what might be clicked under it. A card with no picture
  this viewer may see (face down, or no picture) keeps the drawn card.
- *Fixed with it:* "Let it all resolve" sits in "All attack"'s place,
  above the act button.
- *The card being cast (owner, 2026-11-02, from the screenshots):* large
  in the middle only while it is being cast and paid for. Once it is on
  the stack it flies there (turning over first, for the other player)
  in about a second; nothing keeps it in the middle, so it is never shown
  twice for longer than that flight. The response window's ring keeps
  close to the card and thin at the readable size.
- *Evidence:* `effects.test.ts` (the readable size stays on the play
  area, between the turn track and the hand, at any depth),
  `battlefield.spec.ts` (a spell's line starts on its readable card),
  `match-what-happened.spec.ts` (a real Pridemate trigger shows its own
  words on the stack), screenshots of real games with real pictures.

**Amendment 8 (2026-11-03, W-18 and W-19 decided and built -- canvas
https://claude.ai/artifact/79rgBXtDRtKjod4GwdFZej).**

- *Today (found from screenshots of real games):* a graveyard or exile
  opened as a list of names, no pictures, in no stated order; a card
  clicked in the list opened its close-up behind the list; exile did
  not say why a card was there; the close-up showed the card and a few
  facts but not what had changed.
- *W-18, graveyard and exile (owner: option A, the card tray):* the cards
  as pictures, newest first (Forge's timestamp of arrival), identical
  cards with nothing on them as one "×N"; tabs for each player's
  graveyard and exile with their counts (your piles first). In exile a
  card says why it is there: "Exiled by Light Up the Stage", "You may
  play it", a suspend's time counters. A card opens its close-up on top.
  No library window: a library is hidden; what a player may see of it
  comes through the game's own questions (W-09).
- *W-19, the close-up (owner: option A):* as before, plus power and
  toughness as printed struck through before the current ones when they
  differ, whose it is, what is attached to it and what it is attached to,
  why it is in exile and whether you may play it, and its state as chips
  (tapped, new this turn, attacking, blocking, token, Ring-bearer).
- *What the game now tells the page* (the worker's snapshot):
  `basePower`/`baseToughness` on a creature; `exiledBy` and `playable`
  (this viewer only) on an exiled card (protocol README).
- *Evidence:* `zoneTray.test.ts` (copies grouped only when nothing
  tells them apart, exile's reasons, printed power and toughness only
  when changed), `match-stolen-picture.spec.ts` (a graveyard card's
  close-up is on top of the tray, nothing over it), screenshots of real
  games.

**Amendment 9 (2026-11-03, W-15 decided and built -- canvas
https://claude.ai/artifact/YYU4WXrboPPCa6EnKz1dFp).**

- *Today (found from screenshots of a real game):* each start-of-game
  question was the small bubble at the side; the hand to keep or
  mulligan was the fanned, overlapping hand at the bottom, names cut
  off; putting cards back showed nothing picked until it went; the
  other player saw "Pat's move" and no more; the turn track read
  "Turn 0 · Opponent's turn"; the Leyline question was a tray of long
  sentences, one card at a time.
- *W-15 (owner: option A, the hand laid out):* one window over the table
  (`OpeningHand.tsx`): the opening hand in a row, large enough to read,
  the question above it and its answers under it. Play or draw: two
  buttons ("You're a turn ahead", "You're a card ahead"). Keep or
  mulligan: "Keep 7" / "Mulligan -- draw seven again, put 1 back", the
  count of cards and lands. Putting back: click the cards (they drop and
  grey), then "Keep these 5"; the game asks one card at a time and the
  page answers each from the clicks. A Leyline: a "Start in play?" tick
  on its card, then "Begin with 1 in play"; the page answers the game's
  one-at-a-time question from the ticks, then "no more".
- *Mulligans are public (owner):* the waiting line says "Mulliganed
  once" (else "Choosing their opening hand"), and your own window adds
  "Pat mulliganed once". The worker sends `player.mulligans`, Forge's
  own count, which it takes once the cards are back.
- *Before the first turn* the turn track says "Before the game" and no
  one's turn.
- *Kept:* the game's own name for each question stays as a hidden
  heading ("Keep or mulligan"...), so a screen reader and the scripted
  games read it as before; "List choices" still lists every option.
- *Evidence:* `match-opening-hand.spec.ts` (a real game: a mulligan put
  back by clicking, the other player told, a Leyline ticked and begun on
  the battlefield), `OpeningHand.test.ts`, `stops.test.ts` (the
  pregame waiting line), screenshots of real games.

**Amendment 10 (2026-11-03, W-16 decided and built -- canvas
https://claude.ai/artifact/8aNguFgyNh2uSGeE4kUKkg).**

- *Today (found from screenshots of a real game, the Loyalty deck):* a
  card with several abilities opened a menu that said "2 actions
  offered" and began every line with the card's name again; the cost
  sat in the middle of each line; abilities that could not be used now
  were left out (Elspeth's -7 at 5 loyalty); the "why not" beside a card
  faded after a few seconds and did not name it.
- *W-16 (owner: option A, a tidy menu, cost first):* the card's picture,
  name and type once at the top; each ability a row with its cost first
  and large -- a loyalty cost on the planeswalker's shield, green for +,
  red for -, or mana symbols -- then its words; an unpayable one says
  "Not enough mana right now". The abilities the card can't use now are
  greyed, with why: "Needs 7 loyalty (it has 5).", "Once each turn --
  already used this turn.", "It's tapped.", "Came in this turn -- it
  can't tap yet.", or timing. A card that can't be played opens the same
  panel with "Not now." and the reason, which stays until closed.
- *One click no longer uses a card's only usable ability when it has
  others it can't use now:* the menu opens, so a planeswalker's +1 is
  never taken by a click that meant to look.
- *What the game now tells the page:* `decision.notNow` (protocol
  README), from the worker (`WhyNot.ability`) through the server.
- *Evidence:* `abilities.test.ts` (the cost split), `interaction.test.ts`
  (a click with abilities held back opens the menu),
  `match-ability-menu.spec.ts` (a real game: a held-back ability greyed
  with why; a card in hand says why not, until closed), screenshots of
  Elspeth's real -7 ("Needs 7 loyalty (it has 5).").


**Amendment 11 (2026-11-03, W-14 decided and built -- canvases
https://claude.ai/artifact/Tf7Kbcab4xVxDg4fWoKRY9 (today and first options),
https://claude.ai/artifact/BVZPPwrXny7AzmXWQhcikg (point, then follow),
https://claude.ai/artifact/CWpWdsm4GHvXwESVPPi6Xn (the safety)).**

- *Today (found from screenshots of a real game, with a Goblin and Elspeth
  added to a real game's board for the attack picture):* the game asks
  what each attacker attacks one creature at a time ("What does Goblin
  Token attack?"), so ten Goblins are ten questions, and nothing shows
  where each is going until the attack is made. Blocking with a pile
  opens two boxes at once ("Block how many of these 2?" over "Choose
  what to block"), worded "One of your creatures on each, at most 2".
- *W-14 (owner: select several, then point -- for every attack and every
  block):* clicking your creature SELECTS it (the word on screen is
  "selected", never "ticked"); clicking it again unselects it. Clicking
  what to attack (the player's picture or life, a planeswalker, a battle)
  or what to block (an attacker) sends every selected creature there, and
  a line shows each one's target. This is the same with one thing to
  attack as with several (owner: more control, and it feels better), so
  a plain attack is two clicks: your creature, then the player.
- *Piles:* each click on a pile of yours selects one more of it (the pile
  shows "✓ 2"); clicking a pile of attackers spreads your selected
  blockers one on each; clicking a single attacker puts them all on it.
  The "Block how many of these?" box goes.
- *"All attack" selects* every creature that can attack; you then click
  the target.
- *The safety (owner: option B, the button locked):* while anything is
  selected but not pointed at anything, the Attack / Block button reads
  "N selected" ("Click what they attack · Esc unselects") and cannot
  be pressed. To go on without
  them, unselect them (click each again, or Esc for all). Selected
  creatures never attack or block unless pointed; nothing is quietly
  dropped and no turn moves on by mistake. Nothing selected and nothing
  declared: the button is "No attack" / "No blocks", as today (*as
  built:* "No attacks").
- *The game still decides:* the page answers the game's own questions
  one creature at a time from what you pointed (as the Boggart "same for
  all" plan does), each checked by the game; if one is refused, the page
  stops there, says why, and the rest stay selected. Whole-attack and
  whole-block rules (can't attack alone, menace) are checked when the
  button is pressed, as today.
- *Combat damage (W-13's window) is unchanged:* it already handles any
  number of blockers; it will appear more often now that several
  blockers on one attacker is easy.
- *Evidence:* `combatPlan.test.ts` (selecting, piles, what can be pointed
  at, and the answers to the game's questions: one by one, "All attack"
  in one go, a refused creature stopping the rest, one blocker on each of
  a pile); `match-big-combat.spec.ts` (a real game: "All attack" pointed
  at the player; a pile selected "✓ N", the button locked, then pointed
  at the attacking pile, blockers riding one on each);
  `match-damage-tray.spec.ts` (two blockers pointed at one attacker, the
  damage window unchanged); screenshots of a real game, with an Elspeth
  added for the picture, showing the selection, the locked button, and
  the attack line after pointing.

**Amendment 12 (2026-11-03, W-22 follow-up decided and built -- who did it; canvas
https://claude.ai/artifact/G4xmYLxuUdTsUviDaSAUCe).**

- *Today (16 cards played in real games by the test harness, recording
  every message each seat was sent):* nothing names the player who acted.
  Tray titles name only the card ("Goblin Matron revealed:"); most private
  actions tell the other player nothing (Ponder, Brainstorm, Impulse, Opt,
  Consider, Demonic Tutor, Rampant Growth, Gitaxian Probe, Mind Rot,
  Thought Scour); some say the wrong thing (Goblin Matron: "Looking at
  Pat's hand: Goblin Matron"; Thoughtseize to the target: "Looking at your
  hand: Savannah Lions").
- *Decided (owner: option A, the tray says it; wording approved; both
  players see it):* when a spell or ability searches a library, looks at
  or reveals its top cards, reorders it, scries, surveils, puts cards from
  a hand on top, looks at a hand, makes a player discard, or mills, BOTH
  players get the tray: headed by the acting player's picture and name and
  the card ("Pat · Demonic Tutor"), the whole action in one sentence in the
  reader's words ("Pat searched their library and put a card into their
  hand." / "You searched your library and put Goblin Matron into your
  hand."), the acting player's seat glowing, and the cards: face up only
  where Magic makes them public to that reader (revealed to them, or in a
  public zone, or their own), otherwise face-down backs, each marked where
  it went. It stays until closed or the next turn, as the reveal tray does.
  The 16 sentences are the canvas's table.
- *Hidden information is unchanged:* a card nobody revealed is a back with
  no name and no id the reader could follow.
- *As built:* the worker (`ActionReports`) reads Forge's own events while
  the effect resolves (each card moved, a shuffle, a scry's and a
  surveil's counts) and the resolving ability's kind; the snapshot's
  `action` (MATCH_STATE_VISIBILITY.md); the reveal tray headed by the
  player's picture, name and card, the sentence, and card backs.
  Forge's old "Looking at ..." line is dropped beside a report.
- *Evidence:* `scripts/check-who-did-it.py` (a real game for each of
  Demonic Tutor, Goblin Matron, Ponder, Brainstorm, Thoughtseize,
  Gitaxian Probe, Thought Scour: both seats' sentences, backs where the
  reader may not know the card, no real card id), added to the Mechanics
  Lab in CI; over its games, `check-hidden-hands.py` (1,652 hand-card
  sightings, nothing unshown) and `check-snapshot-first.py`;
  `check-hidden-information.py` (green and burn), `check-surveil.py`,
  `check-library-order.py`, `check-what-happened.py` still pass;
  screenshots of the real page with the reports Bob was sent.


**Amendment 13 (2026-11-03, the owner's 13-item list -- canvases
https://claude.ai/artifact/Qy16T3u4YahPD51CDGC4LU and
https://claude.ai/artifact/64zmhdhcZTYn4KiJCTuMSN; every item approved
before building).**

1. *Pause:* the countdown circle shows a pause sign; clicking it pauses
   ("Paused · Resolve when you're ready"), clicking again resolves; the
   words still resolve now.
2. *No stack flash:* while a cast card is in the air nothing is drawn in
   the stack spot; a spell that resolves first goes straight from the big
   card to the battlefield (instants and sorceries likewise). The
   opponent's hold on the stack (2026-10-22) stays.
3. *Targets say what they're for:* every target step names the card and
   what the target is for ("Wirewood Symbiote: choose a creature to
   untap."), and says when a cost choice follows ("Next, you'll choose an
   Elf to return."); the cost step names it too. With a pile, the cost
   step prefers a card other than the one just targeted.
4. *Ability rows:* the words flow as one paragraph with mana inline; a cost
   with an action puts the mana in the cost column and the rest in words;
   the bracketed reminder is dropped; "Play this land".
5. *Playable look:* option A, the breathing gold glow, replaces the dashed
   outline and the CHOOSE tag (still "can be chosen" to a screen reader).
6. *Card-row room:* 16px round the cards in a tray, so a chosen card's
   outline and number always show.
7. *Amends Amendment 12:* whoever made the choices gets no report, no
   reveal tray and no "Looking at ..." line for it; everyone else does
   (Mind Rot: the caster is told what the target discarded).
8. *Mana on triggers:* while a trigger on the stack is being paid for, its
   card shows the mana still due under its words, counting down.
9. *The mana question:* "Pay the mana"; "Tap a land or other source, or
   use mana you already made."; "Use {R} you already made (1 left)"; a
   source's button is its name; "Pay 2 life instead (you have 20)". The
   amount due travels as its own field.
10. *Selected attacker or blocker:* option 1, a gold seal with a check on
   the card's corner and the count in a dark bubble.
11. *No em dashes:* the 38 player-facing lines and the admin ones are
   rewritten as the canvas's table (card text keeps its dashes).
12. *Trigger text:* the plate's words flow as one paragraph sized to fit;
   no words under a pointed stack card; one line under the stack, one
   style: "Next: Pat's trigger · 2 on the stack".
13. *A resolved trigger keeps its stack look* (whole card and words),
   glows, sparks to its target and shrinks into its source (option B);
   a card that has left is drawn on top.

- *As built:* the pause holds until the player passes (first built
  per stack object, made simpler 2026-11-03). Item 11's words, where
  this document quotes the older ones: the mulligan button is
  "Mulligan" with "Draw seven again, put 1 back" under it (W-15); the
  greyed reasons read "Only once each turn, and you've used it." and
  "It came in this turn, so it can't tap yet." (W-16). Item 3's target
  prompt is the ability's own words and its cost ("Wirewood Symbiote:
  Untap target creature. Next, you'll pay its cost: return an Elf you
  control to its owner's hand."). The worker sends the
  payment's `owing`
  (protocol/README.md) and the target prompt from the ability's own text;
  `abilities.ts` reads " · " rows, "no cost" and mixed costs; the seal
  hangs beside the card and a selected card is drawn over its neighbours
  (the card clipped it, the next card covered its count); the stack
  ghost carries the stack card's look. Also, approved on the
  screenshots (owner 2026-11-03): a card's ability menu stays on screen
  for a card in the far-left column (it was half off the edge).
- *Evidence:* the unit tests (Board, abilities, triggers, match);
  `match-window.spec.ts` (a paused window still paused after the 5 s,
  then resolved by a click); `match-big-combat.spec.ts` (the seal's count
  seen, not covered: it failed before the fix); `match-ability-menu.spec.ts`
  (the menu inside the screen: failed before); `match-card-trays`,
  `match-damage-tray`, `match-what-happened` and the other e2e specs
  reworded for item 11; the lab checks reworded for " · "; screenshots of
  a real game for items 1, 5, 6, 10 and 12 (two defects found only on
  them: the pause sign turned on its side, the seal cut off).


**Amendment 14 (2026-11-03, W-11 decided -- choosing a number; canvas
https://claude.ai/artifact/FSPaHn8XrLy4a5egPdiVuM).**

- *Today (a real game with the numbers test deck,
  `protocol/fixtures/numbers-deck`, `match-numbers.spec.ts`):* X
  (Rolling Thunder, Fireball, Comet Storm) is ten buttons "X = 0" to
  "X = 9" with one Mountain out, saying nothing of cost or of what can
  be paid (X = 8 could be chosen, and the payment then failed); the split
  (Arc Lightning, Forked Bolt, Rolling Thunder) is titled "Your move",
  asked for each target as it is chosen, the rest going to the last
  target unasked; multikicker (Everflowing Chalice, Comet Storm) shows
  the engine's "Choose Amount for Multikicker: {2} -- how many times?";
  Harnessed Lightning shows "amount of energy to pay" under "Choose",
  without its card's name, what the energy does, or how much there is.
- *Decided (owner: option A for one number, option A for the split,
  wording approved as written):*
  - *One number* (X, a kicker paid more than once, energy, any "choose a
    number"): one window, a dial: the number large with − and +, "None"
    and "Most you can pay: N", the cost as it changes ("Costs {3}{R}"),
    what you can make ("You can make 5 mana." / "You have 3 energy."),
    and one button that answers ("Cast Fireball with X = 3"), with
    Cancel where today's question can be cancelled. More than can be
    paid stays choosable and is marked "more than you can pay now" (the
    rules decide, as today).
  - *The split:* every target is chosen first, then one window like the
    combat damage window: each target's picture with − and +, at least 1
    each, filled in to start (enough to kill each creature, in order,
    the rest to the player), "Damage left: N", Done when it is 0. This
    is the rules' order (601.2d), so the worker asks the split after the
    targets instead of as each is chosen.
  - *Words:* "Choose X" (the card's words and its cost); "Split N
    damage" ("Each target gets at least 1."); "Kick it how many times?"
    ("Each time costs {2} more and gives Everflowing Chalice a charge
    counter." -- the card's own effect); "Pay how much energy?"
    ("Harnessed Lightning deals that much damage to Hill Giant. You have
    3."). Every one names its card at the top.
    *As built (2026-11-04, a documentation check):* the sentence after
    the cost is the card's own Oracle sentence, unchanged: "Each time
    costs {2} more. Everflowing Chalice enters with a charge counter on it
    for each time it was kicked."; "Harnessed Lightning deals that much
    damage to that creature. You have 3." (no target's name is put in).
- *As built:* the worker sends each number question's values in the
  options' order, what can be made, the keyword and its cost, and the
  card's sentence (`arrange.number`), and each option's cost and whether
  it can be paid; a split is asked after the targets, one question per
  share with a choice, each carrying the whole split (`arrange.divide`,
  protocol/README.md); no more targets than there is to divide. The
  page's dial (`NumberWindow`) starts at the most that can be paid (a
  kicker at none; nothing payable, the least); the split tray
  (`DivideTray`) answers the game's shares from the split. The multikicker
  question no longer carries the engine's "--".
- *Evidence:* `scripts/check-numbers.py` (Fireball, Everflowing Chalice,
  Arc Lightning, Harnessed Lightning: values, costs, payable, the split's
  order and contents, the board after; every scenario fails on the worker
  before this change), added to the Mechanics Lab in CI;
  `check-shapes.py` split (Fire // Ice, 1 and 1 not asked);
  `NumberCostsTest` (worker); unit tests for the split's start and
  answers and the dial's words; `match-numbers.spec.ts` (a real game with
  the numbers deck: the dial for X, multikicker and energy, the split
  tray, no share asked again), with screenshots of each.

**Amendment 15 (2026-11-04, a second tab and the countdown).**

- *Today:* every tab a player has open on a game runs their spell's
  5-second countdown, so a forgotten tab resolves a spell they paused in
  the other (found in CI 2026-11-03, where a previous test's page did
  exactly that; older than the pause).
- *Decided (owner: "only the tab in front counts"):* a hidden or
  minimised tab never resolves anything for the player; brought back to
  the front, its countdown starts again from 5. The tab in front works
  as before. A pause holds until the player passes (Amendment 13,
  item 1, as rebuilt 2026-11-03).
- *Evidence:* `match-window.spec.ts` (the page hidden for 6 s with the
  spell still on the stack, then counting from 5 again in front); every
  game spec closes its pages when it ends.

**Amendment 16 (2026-11-04, W-12 decided -- name a card; canvas
https://claude.ai/artifact/A6oesok4EKVjhqk9nVbAFs).**

- *Today (a real game, the name-a-card test deck, Pithing Needle and
  Phyrexian Revoker, `match-card-name.spec.ts`):* the old question panel
  in the middle of the table, over the board; a search box and a list of
  names only (no cost or type: "Mountain Goat" and "Mountain Stronghold"
  look alike); no way to click a card you can see; the hint "Any of
  34,457 card names can go here."
- *Decided (owner: option A, wording approved as written):* the cards
  this player can see on the table, and in open zones such as a
  graveyard, glow; one click names one. The window beside the card
  asking (the W-00 frame) holds the search for any other name, each
  result with its cost and type ("Goblin Guide {R} · Creature — Goblin
  Scout"). A card the effect can't name (a land, for Phyrexian Revoker)
  does not glow, and a click on it says why ("Phyrexian Revoker can't
  name a land."). The answer is always one of the game's own names: a
  click searches the card's exact name and picks that result.
- *Words:* "Name a card" (Phyrexian Revoker: "Name a nonland card");
  the card's own words under it; "Type any card's name"; "Showing 8 of
  214. Type more to narrow it down."
- *As built:* the worker names the card asking (about), sends
  `arrange.name` (title from the effect's own restriction, the card's
  sentence, and the ids of the cards on the battlefield, in graveyards and
  face up in exile whose names are allowed) on the searchable question,
  and each search result's cost and type line (`types`, through the
  server). The page's `NameWindow` sits beside the card; the table's
  allowed cards glow, as do those in an open graveyard or exile; a click
  searches the card's exact name and answers with that result.
- *Evidence:* `check-card-name.py` (the window's card, title, words, the
  Evolving Wilds on the table listed, a result's type line);
  `match-card-name.spec.ts` (Pithing Needle named by a click on a
  Mountain; for Phyrexian Revoker a Mountain does not glow and a click
  says it can't name a land; results with types), with screenshots.

**As built (2026-11-04, a documentation check -- principle 6).** Only
holding Space fades a window; there is no Peek button, so a player who
does not know the key cannot see behind a window. Owner 2026-11-04: a
visible Peek is designed with the remaining windows (W-21, W-17), on a
canvas for approval.

**As built (2026-11-04, a documentation check -- Amendment 14's energy
words).** The dial says "You have 3." after the card's sentence, not
"You have 3 energy." (the question already says "Pay how much energy?").

**As built (2026-11-04, a documentation check -- W-04/05/06).** The
yes/no bubble does not say "2 of 7": its header is the card and how many
are on the stack ("Skirk Drill Sergeant · 7 on the stack"). Only the
copy-target bubble numbers the trigger ("<card> · trigger 2 of 7").
