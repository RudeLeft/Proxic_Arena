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

### Amendment 1 -- As built (2026-11-07)

**Item 1 (cancel at targets).** Worker: `DecisionGate.notePlayerBackedOut()`
counts a named "no" as the player's own; `MatchController.selectTargets`
calls it when the answer is `target:cancel`. Before, only a null answer
counted, so the loop guard took a Cancel on targets as "went nowhere" and
dropped that card from the offers until the game changed. Lab:
`check-take-backs.py retarget` (Shock, Cancel at its target, the same
Shock offered at the very next question, cast again at Bob: -2). It FAILED
against the 1.48 worker ("not offered at the next question") and passes
now; `recast` (Cancel at the payment) and `check-numbers.py targets` still
pass. e2e `match-interaction.spec.ts` now also expects the cancelled card
choosable again and saves `test-results/seen/0058-cancelled-castable.png`.

**Item 2 (a reduced cost everywhere).** Worker: `GameHost.addHandCosts`
puts `costNow` ("{R}") and `costWhy` ("Costs {1} less: Goblin Warchief")
on each card in the viewer's OWN hand on every snapshot, when Forge's
test-mode cost (`MatchController.currentCost`, the same
`ComputerUtilMana.calculateManaCost` the play options use) differs from
printed. Worked out on the game thread only (Forge's check briefly sets
the card's cast-from zone); a snapshot sent from another thread (a
spectator joining) reuses the last. X costs are skipped (test mode reads X
as 0). The names come from Forge's own test of which ReduceCost/RaiseCost
abilities apply -- `CostAdjustment.checkRequirement`, private, called by
reflection (VEND-004: documented at `COST_APPLIES`; if Forge changes it the
words say "Costs {1} less" without names; `TargetWordsTest` fails so it is
noticed). Words: "Costs {N} less", "Costs {N} more", "Costs less/more"
when coloured mana changed too, then ": " and the cards. Page: the hand,
the zoomed hand card and the close-up use `costNow`; the close-up adds the
`costWhy` line; the card being cast starts from the hand's cost. No ring
for a lower cost (`.bf-cost-down` removed); a HIGHER cost (Thalia) keeps
its red edge -- one CSS rule, kept as cheap. Lab: `check-costs.py
warchief` (both seats' turns, never on the other seat's snapshot).

**Item 3 (Gempalm).** Worker: `MatchController.countedX` -- an ability's
X when its SVar is a count (`Count$...`, not paid, chosen, triggered or
targeted), from `AbilityUtils.calculateAmount`; `PlainWords.countedX`
fills it in where the words say "where X is the number of ...". Cycle
option line: "Discard Gempalm Incinerator and draw a card, then deal 3
damage to a creature (3 Goblins). You won't cast it." Target window
prompt: "Gempalm Incinerator may deal 3 damage to target creature (3
Goblins on the battlefield)." -- the page's existing words make the title
"Deal 3 damage" and the hint "Click a creature." (the decline button reads
"Don't deal 3 damage"). `triggerEffect` also reads Forge's "you may have
it ..." as "Gempalm Incinerator may ...". Lab: `check-numbers.py gempalm`;
`PlainWordsTest`.

**Item 4 (the blue ring).** Page: a click that only selects (no reason, no
greyed abilities) shows `NothingNote` above the card: "Nothing to do with
this card right now", fading over 2.7 s; each click shows it again. The
ring and the other blue marks are unchanged.

**Item 5 (the act button).** Page only: `useSteadyAct` in the rail. While
a trigger question the page answers itself (the copies after "Yes to
all", an order already clicked) is up, and for up to 1.5 s after any
trigger question (order, target, "use it?", mode with `about.kind`
trigger), the button says "One moment · Putting triggers on the stack";
any other moment with nothing asked shows the last button, disabled, for
400 ms, then what is true now. Not built from MATCH_ASKING `doing`: that
message goes only to the other seat and spectators, never to the player
being asked. A trigger question the player answers keeps its own button
(Cancel and the rest), so nothing reachable is hidden (UI-002). e2e
`match-many-triggers.spec.ts` records the button's words after "Yes to
all" and expects "Putting triggers on the stack" among them.

**Items 6-7 (pips; the cost being paid).** Page: `keepPaying` keeps, for
the card being cast, the FIRST payment question's `owing` as the cost
drawn and the latest `owing` until the next payment question or the cast
ends -- nothing flashes back between questions. `costPips` draws generic
mana as one grey pip per point and lights each kind from the left. A
small spark (`.gs-cast-spark`, 420 ms) flies from the land just tapped
(the payment option's card) to the pip it lit, in that land's colour.
Symbol pictures added from the Proxic Deck Builder's `assets/mana`
(Scryfall-made): colourless hybrid {C/W} {C/U} {C/B} {C/R} {C/G}, {C/P},
and hybrid Phyrexian ({W/U/P} ... ten). {Q}, {E} and half mana have no
picture in either project; they keep the text fallback. Lab:
`check-shapes.py mutate-two` -- Trumpeting Gnarr's mutate payment owes
"{3}{G/U}{G/U}". Page tests: Nekrataal's {2}{B}{B} -> {1}{B}{B} -> {B}{B}
-> {B}, Boneyard Lurker's {2}{B/G}{B/G}.

**Item 8 (mutate).** Worker: a mutated creature's snapshot entry carries
`merged` (top first: id, its OWN name -- the bottom card's current state
is the top card's, so its original state is read -- owner, printing);
the server's `MatchArt` gives each its own picture. The order question
carries `arrange.sources` by option id: {card, name, place "top" |
"underneath", says}, from the trigger's original host (Forge keeps the
CardState a copied trait came from), else the merged card with a trigger
of the same mode and words. Page: tiles "Trumpeting Gnarr (top)",
"Glowstone Recluse (underneath)", each its own card's picture and a line
of its words ("Create a 3/3 green Beast creature token."); the close-up:
"Cards in this creature: Boneyard Lurker (top), Gemrazer, Pouncing
Shoreshark" and "A mutated creature has every ability of its cards." Lab:
`check-shapes.py mutate`, `mutate-under` (both seats' `merged`),
`mutate-two` (Gnarr over Glowstone Recluse over Grizzly Bears).

**Protocol** (`protocol/README.md`): `card.costNow`, `card.costWhy`,
`card.merged`, `decision.arrange.sources`. Snapshots pass through the
server untouched; only `MatchArt` changed (pictures for `merged`).

**Verification (2026-11-07, local).** Worker `mvn -o test` green; Lab:
take-backs (4), costs warchief, numbers targets + gempalm, shapes mutate,
mutate-under, mutate-two all OK; many-triggers, trigger-costs, cost-kinds,
text-effects, you-choose, play-a-game and check-hidden-hands (95 traces,
4157 hand-card sightings, no leak) unchanged. Page: tsc, eslint, prettier,
vitest 893/893 (`fixes0058.test.tsx`; the old green-ring test now expects
no ring, and fails if it comes back). Server: ktlint, detekt, tests green
(`MatchArtTest` +1). e2e on the rebuilt local stack: match-interaction
(cancelled card choosable again), match-many-triggers (after "Yes to all"
the button went "Your answer" -> "One moment · Putting triggers on the
stack" -> the result: one change, not five), match-cast-aside. Not seen in
a real browser game: the Warchief close-up, Gempalm's window, the mutate
order window and the spark -- each is covered by the Lab (data) and page
tests (drawing) only.
