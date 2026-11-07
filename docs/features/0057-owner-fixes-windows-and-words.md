# 0057 — Windows by the card asking, plainer words, Peek footers

**Status:** Approved 2026-11-06 (owner, on the canvas "Your fixes from
November 6", and item 5 on its own canvas "Cycling Lands Choices", both
sent as files: publishing to claude.ai failed that afternoon)
**Owner decisions:** 1 A, 2 build, 3 "Cancel" and the action, 4 A,
5 A for every card, 6 A, 7 A

The owner's list after playing (2026-11-06), researched in a Mechanics Lab
game with the owner's cards (Allosaurus Rider, Wren's Run Vanquisher,
Elvish Eulogist, Forgotten Cave, Tranquil Thicket) and today's windows
shown in a real game page.

## 1 · Allosaurus Rider's alternative cost (A · say what it really is)

Today: "As an additional cost to cast this spell, exile two Card.Green
cards from your hand. (You may exile two green cards from your hand
rather than pay this spell's mana cost.)" -- Forge's own description,
wrong twice (internal "Card.Green"; not an additional cost) and said
twice. Built: one line from the card's reminder, "Exile two green cards
from your hand instead of paying {5}{G}{G}", for every alternative cost
of this kind; Forge's type shorthand ("Card.Green") never shown.
Also: the card being cast floats beside the stack while cards are picked
(spec 0044: intentional, so nothing to click is covered) -- for cards
picked from the HAND it need not move, and doesn't. Cancelling flew the
card from the middle back to the hand (a jump, Phase 10 P10-R1): it now
flies back from where it is.

## 2 · Peek footers everywhere (build)

Five windows had Peek against Close and no "or hold Space": revealed
cards, a graveyard or exile opened, the two card close-ups, the status
tray's list (the 156 Peek buttons of question windows were already
right, measured). Every window gets the question windows' footer: Peek
and "or hold Space" on the left, buttons on the right, a clear gap; in a
narrow window "or hold Space" goes under Peek. A check measures every
window.

## 3 · A cost you chose to pay ("Cancel" and the action)

"Sacrifice Elvish Eulogist?" (asked twice, title and line) with Skip /
Pay, beside the stack. Built: beside the card (item 6), the card's
effect as the line, and the buttons "Cancel" and the cost's action
("Sacrifice"; "Discard", "Tap", "Exile"...; "Pay" for mana).

## 4 · "To pay" on a stack card (A · a bigger pill)

The pill's symbols were 6% of the card's height (~8 px at 1920x1080).
Built: same place, about 2.5x bigger, "Still to pay", a bright gold edge.

## 5 · Play it, or throw it away for something (A · make them look different, every card)

Forgotten Cave's choices, "Play this land" and "Cycling · Discard this
card: draw a card", looked alike: one click discarded the land. Built:
the play is the gold main choice ("Play it as your land" / "Cast it",
with what that means), and the other is marked as the one that gets rid
of the card, saying what you lose ("Cycle it instead: {R} -- Discard
Forgotten Cave and draw a card. You won't have it as a land."). For every
card with such a choice (counted in Forge's card pool 2026-11-06): 50
lands with cycling, 7 lands with a channel-style ability from the hand,
357 other cards with cycling or landcycling -- 414.

## 6 · Where windows appear (A · by the card asking)

Today: the page's own menus sit over the card clicked; every question
the game asks sits by the card being cast, else the stack. Built: one
rule -- a window about a card sits by that card, pointing at it: a hand
card, above it; a card on the table, beside it; the stack or a spell
being cast, as today; about nothing in particular, by the stack. Never
over the stack, the action button or a card to click.

## 7 · A reveal paid as a cost (A · like "put back")

The other player saw "Wren's Run Vanquisher revealed:" and the card --
no one, no reason. The window of Phase 9 Amendment 12 (medallion, who,
what) appears only when the game sends a sentence; for a reveal paid as
a cost it sent none. Built: "Pat revealed Llanowar Elves from their
hand", then "to cast Wren's Run Vanquisher for {1}{G} instead of {4}{G}"
(or the cost's own words when there is no cheaper price).

## 8 · Attacking and blocking

Noted for Phase 10 A-11..A-13 (PHASE_10_ANIMATION_LOCKED.md, fe4bac7).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0057-A | Alternative costs read as the card's reminder; no "Card.X" shorthand anywhere | worker test; Lab |
| F-0057-B | Cancelling a cast flies the card back from where it is | Board/CastingCard test; jump check |
| F-0057-C | Every window's Peek has "or hold Space" and touches nothing | page test; the window measurement |
| F-0057-D | A chosen cost's window: by the card, the effect, "Cancel" and the action | page test; screenshot |
| F-0057-E | The To pay pill at the new size | screenshot |
| F-0057-F | Windows sit by the card asking (hand, table) | page test; screenshots with the owner's cards |
| F-0057-G | A reveal paid as a cost says who, what and why to the other player | worker test; screenshot |
| F-0057-H | A card's play is the main choice; cycling, landcycling and channel are marked as discarding it | page test; screenshot with Forgotten Cave |

## Amendments

### Amendment 1 -- As built (2026-11-06)

**Item 1.** Worker: `MatchController.alternativeCostLine` -- a spell cast
for a static ability's alternative cost (Forge marks it `AltCost`, or its
description says "instead of its mana cost") is labelled from its cost's
own parts plus the printed cost: "Allosaurus Rider · Exile two green cards
from your hand instead of paying {5}{G}{G}". New `PlainWords.humanise`
turns Forge's script shorthand into words ("Card.Green cards" -> "green
cards", "Creature.Elf+YouCtrl" -> "Elf creature you control",
"Permanent.nonLand" -> "nonland permanent", "Creature.cmcLE3" -> "creature
with mana value 3 or less"); it is applied where text leaves the worker:
every option label and prompt (WorkerMain), the abilities not offered now,
every notice (`GameHost.note`) and the stack's descriptions. Page:
`docks()` takes "is it in the hand" -- cards to pick from the hand no
longer move the cast card aside. `heldSpot()` (CastingCard.tsx) keeps the
cast card where it was drawn, docked or not, while no question is asked
or the last one is answered; the cancelled card's flight starts there.
Before, the cancelled question's "cleared" made it slide to the middle
first, and the flight started from the middle.

**Item 2.** `PeekHint` and `PeekFoot` (GameWindow.tsx): Peek and "or hold
Space" left, the window's buttons right (`.gs-peek-foot`, 24px gap,
wraps; the hint itself wraps "or hold Space" under Peek). Used by the
reveal tray, both close-ups (`Inspect`, `StackInspect`), the graveyard /
exile tray (`ZoneViewer`, its × stays top right) and the status tray's
list; Bubble and Tray use `PeekHint`. Not done here: the window
measurement in a real browser (no e2e run in this build).

**Item 3.** Worker: `MatchCostDecision.confirm` sets the question's
`about` to the ability (name, kind, its card) plus `act` -- the cost's
action from the question the worker wrote (`PlainWords.costAct`:
"Sacrifice", "Discard", "Exile", "Tap", "Pay 2 life", "Pay 3 energy",
"Take 2 damage", else "Pay") -- and `effect`, the ability's own
description ("You gain 1 life for each Elf card in your graveyard.").
The option's label stays "Pay the cost": the scripted games
(e2e, check-tracked-state.py) find it by that. Page (ConfirmWindow): with
`about.act`, the line is the effect (not the question again) and the
buttons are "Cancel" (the pass) and the action. A trigger's own "you may
pay" (spec 0043) keeps Skip / Pay.

**Item 4.** Board.tsx / battlefield.css: "Still to pay", symbols 15% of
the card's height (were 6%), words 9% (were 4.5%), a 2px #ffd36b edge with
a glow; the words over the symbols, since at this size both no longer fit
across a stack card.

**Item 5.** Worker: for each card in hand with an option that discards it
(cycling, typecycling -- landcycling and the rest --, or any activated
ability from the hand whose cost discards the card itself: channel), each
of that card's options gets `use` {kind, title, line, cost}: the land play
"Play it as your land" (+ "It comes in tapped." by Forge's own test, its
AI's: the replacement "CARDNAME enters tapped."); the ordinary cast "Cast
it" (+ cost and type line); "Cycle it instead" / "Swampcycle it instead" /
"Channel instead" with "Discard Forgotten Cave and draw a card. You won't
have it as a land." ("You won't cast it." for a spell; the effect from the
ability's reminder or description). Server passes `use` through
(DecisionOption, a Kotlin field -- the one server change). Page
(ActionPopup): the play first, gold, focused; the discard red-tinted,
"Cycle it instead: {R}" and the line. Cards without such a choice are
unchanged. An alternative-cost cast of such a card keeps its own line.

**Item 6.** Worker: `about.card` ("card:N") on a question about an
ability or a card being played, when that card is on the battlefield or
in the asker's own hand (never another player's hand). Page:
`askingCardAnchor` / `anchorByCard`: by the card -- above it in the hand,
beside it on the battlefield on the side with more room (right first when
equal) -- when that place is on the table, left of the stack, and clear
of every card the question needs clicked; otherwise by the stack as
before. A trigger or a spell stays by the stack / the cast card. Bubble
takes `anchor.side` ("left" as before, "right", "above") and points from
that side.

**Item 7.** Worker: `MatchCostDecision.visit(CostReveal)` notes the cards
chosen; the other player's controller, shown them next by Forge, sends
the reveal with `by`, `source`, `said` "Pat revealed Llanowar Elves from
their hand" and `why` "to cast Wren's Run Vanquisher for {1}{G} instead
of {4}{G}" (the other price from the card's "reveal ... or pay {3}"; "to
pay for <card>" otherwise). The RevealTray shows the Amendment 12 look
with the second line. Decided: the card being cast is named in that
sentence though the opponent's cast card shows its back while it is paid
for (spec 0044) -- the approved words name it, and Forge's own log names
it ("reveals X to pay a cost for ...").

**Tests.** Worker `PlainWordsTest` (7); server `WorkerFramesTest` (`use`
passes through); page `fixes0057.test.tsx` (17: Peek footers in the five
windows, the chosen cost's window, "Still to pay", play vs discard, the
anchor by hand / battlefield / stack, docking, `heldSpot`, the flight's
start). Not verified here: a real game (no Lab or e2e run was allowed in
this build) -- the alternative-cost label, the uses and the cost reveal
are proven on Forge's words in tests, not on a live game.

Checked in the real page (2026-11-06) with the Lab game of the owner's cards:
Forgotten Cave's and Tranquil Thicket's choices, Allosaurus Rider's menu, Elvish
Eulogist's "Cancel" / "Sacrifice" beside the card, the "Still to pay" pill on a
stack card, Wren's Run Vanquisher's Elf pick with the cast card left in the middle,
and the other player's "Alice revealed Llanowar Elves from their hand" window,
shown to the owner and approved. One defect found by eye and fixed: the play /
discard choices sat in the ability grid's 52px cost column and wrapped one word a
line (`.gs-option.gs-ab-use` now has one column).
