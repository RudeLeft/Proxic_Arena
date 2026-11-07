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
