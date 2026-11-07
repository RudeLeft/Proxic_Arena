# 0058 — Cancel, costs, Gempalm, the blue ring, triggers, mutate

**Status:** Approved 2026-11-07 (owner, on the canvas "Your fixes,
7 November", sent as a file; all eight as shown)
**Owner decisions:** 1-8 as shown; 3 "damage in the menu and the window";
4 "keep the ring, explain it"; 8 both (name each trigger's card, list the
cards inside)

The owner's list after playing 1.48.0 (2026-11-07), items 1-8. Items 9-11
(arrows, shrinking in combat, lands nearer the hand) are on their own
canvas and are not in this spec. Research: three read-only passes over
the page and the worker, and a Lab game for item 6.

## 1 · A cancelled card can be played again (a bug)

Cancelling while choosing targets answers `target:cancel`, which the
gate does not count as the player's "no"; at the next priority the loop
guard takes the cast as having gone nowhere and drops that action from
what is offered until the game changes (MatchController's `declined`).
The card is then not on offer, a click only selects it (the blue ring),
and it cannot be cast. Built: a Cancel on targets counts as the player
backing out, so the card stays on offer; a Lab scenario casts, cancels
at targets, and casts again.

## 2 · A cheaper card shows its real cost everywhere

The current cost is sent only with "what will you play" questions, so
every other moment (paying, targeting, the other turn, the close-up,
the card being cast) shows the printed cost; a green ring marks a
cheaper cost. Built: no ring; the worker sends each hand card's current
cost with every snapshot, and every place uses it while the reducer
stays; the close-up says why ("Costs {1} less: Goblin Warchief").

## 3 · Gempalm Incinerator says how much damage

X ("the number of Goblins") is counted by the game and shown: the
discard choice reads "... draw a card, then deal 3 damage to a creature
(3 Goblins)", and the target window's title is "Deal 3 damage" with
"(3 Goblins on the battlefield)". For every "X = a count" effect the
game can compute (the Gempalms and the like); the number is counted
again when it resolves, as the rules say.

## 4 · The blue ring explains itself

The ring on a clicked card that has nothing to do now stays (owner); a
short note by the card says "Nothing to do with this card right now"
and fades. The other blue marks (blocking, keyboard focus) unchanged.

## 5 · The phase button stays steady while triggers go on the stack

Each trigger is its own question; between them the button cycled
through several labels. Built: the button holds its last state until
the next question arrives (or a short quiet time passes), and says
"One moment · Putting triggers on the stack" while the game is doing
that.

## 6 · Paying {2}: two pips

Proven in a Lab game (Nekrataal, a Forest paid first): owed went
{2}{B}{B} -> {1}{B}{B} -> {B}{B} -> {B}; the payment is right. The
display was not: the generic part was one number and the card flashed
back to unpaid between questions. Built: generic drawn as one pip per
point, each lighting as it is paid; nothing flashes back between
questions.

## 7 · The cost being paid, not the printed one

The card being cast drew its cost from the printed cost, so mutate
({2}{B/G}{B/G}), ninjutsu, evoke, dash, flashback, madness and X costs
showed the wrong symbols (hybrid ones never). Built: drawn from the cost
actually being paid; the missing symbol pictures (colourless hybrid,
hybrid Phyrexian, {Q}, {E}, half mana) added where the game uses them.

## 8 · Mutate made understandable

Every trigger of a mutated creature was named and pictured as its top
card ("three Boneyard Lurkers"). Built: the worker sends each trigger's
own card and a public list of the cards in a merged permanent; the order
window names each ("Boneyard Lurker (top)", "Gemrazer (underneath)")
with its ability in a line; the close-up lists "Cards in this creature"
with "A mutated creature has every ability of its cards." The table
still shows one card (Phase 10 A-10).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0058-A | Cast, cancel at targets, cast again | Lab scenario; screenshot |
| F-0058-B | A reduced cost stays reduced in hand, close-up and while cast; no ring | worker test; page test; screenshot |
| F-0058-C | Gempalm's X counted in the choice and the target window | worker test; screenshot |
| F-0058-D | Nothing-to-do note by a clicked card | page test |
| F-0058-E | The act button holds while triggers go on the stack | page test; e2e many-triggers |
| F-0058-F | Generic pips light one by one; no flash back | page test; screenshot |
| F-0058-G | Alternative costs drawn as paid (mutate hybrid) | page test; screenshot with Boneyard Lurker |
| F-0058-H | Order window and close-up name the cards of a mutated creature | Lab; screenshot |

## Amendments
