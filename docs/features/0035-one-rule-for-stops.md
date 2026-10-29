# 0035 — One rule for when the game stops for you

**Status:** Built in 1.18.0
**Owner decisions:** 2026-10-29 —
remove the stop options and everyone's saved settings;
on the opponent's turn stop before they attack, after they attack,
after blocks and at their end step (the full set);
keep the countdown on your own spells and triggers (spec 0005), at
**5 seconds**, and a click on it **resolves now**;
no Hold button (it was considered and dropped: the countdown and the
full set cover everything but rare moments);
remove "Skip to end of turn".
Canvas: https://claude.ai/artifact/7NsVw6JDK3FruZGcbMXfcX

## Why

The owner asked for a deep pass on the turn's steps: remove the moments
where a player can do nothing, without taking any choice away, and
remove the stop options, which "just don't make sense".

The analysis (2026-10-29, from PriorityStops in the worker and the
server's defaults) found the game already passes only when you have
nothing you could do, but the per-step settings let real choices go
missing, and the defaults had gaps:

1. **The opponent's end step** never stopped: a flash creature or an
   instant held up all turn could only be used in their combat or in
   answer to a spell. If they did not attack, you were never asked.
2. **Before they attack** never stopped: a creature could not be killed
   or tapped before it attacked (its attack abilities had already fired
   by "after attackers").
3. **Abilities that work in one step only** ("only during your upkeep",
   "only during combat") were offered by Forge only in that step, and
   nobody was asked there: such cards could never be used.
4. **Sacrifice outlets that make mana** (Ashnod's Altar) counted as "only
   mana", so you were not asked when the opponent's removal could be
   answered by sacrificing.
5. **Free and alternative-cost spells** (Force of Will, Snuff Out):
   whether you were asked rests on Forge's affordability check; not
   proven for alternative costs.
6. **Any step a player turned off** became a place they could not act.

## What the player sees

**No stop options.** The game menu has Concede and Abandon only.

**One rule.** The game stops for you only when you hold something you
could really play right then (tapping a land alone never counts), and
only at these moments:

| Your turn | The opponent's turn | Either turn |
|---|---|---|
| Main 1, Main 2 | Before they attack (when they have a creature that could) | The opponent's spell or ability on the stack, when you can answer it |
| After you attack | After they attack | Your own spell or trigger on the stack: the countdown |
| After blocks | After blocks | The one step a card of yours only works in |
| | Their end step | A sacrifice outlet that makes mana, while something is on the stack |

Every real choice (attackers, blockers, targets, payments, "may"
abilities, mulligans, discards) is asked exactly as before.

**The countdown (spec 0005, changed).** Your own spell or trigger on
the stack, when you could still do something: the button counts down
from **5** ("Resolves in 5 · Your Lightning Bolt · click to resolve
now"). Do nothing and it happens at 0. **Clicking the button makes it
happen now** (it used to pause the countdown). Clicking a card you
could play still stops the countdown so you play it on top, as do the
close look and opening a card list. Space still resolves at once.
**The look is unchanged** (owner 2026-10-29: "looks really cool and makes
it stick out"): the gold ring draining round the button's coin and the
ring round the card you cast (spec 0028), both now over 5 seconds.

**Skip to end of turn is gone.** Main 2's "End turn" is an ordinary
pass, as before.

## What is still skipped (accepted, owner 2026-10-29)

Only rare moments, each with a near-equal moment the rule keeps:

- The opponent's upkeep, draw and main phases with nothing on the
  stack (their spells are always answerable; "before they attack"
  follows their Main 1).
- Between first-strike and regular combat damage; the end of combat.
- Your own upkeep, draw, beginning of combat and end step, for an
  instant that works in any step (Main 1 or Main 2 does the same);
  a card that works only in one of those steps is still asked there.

## Scope

In: when a priority question is asked or passed for; the countdown's
length and its click; removing the Stops panel, the stops API, the
saved settings and "Skip to end of turn"; the button's words where
they depended on stops.

Out: every question that is not a priority pass; the look of the action
button and the turn's steps (spec 0034).

## Rules and boundaries

- FORGE-RULE (PHASE_07 §7.53 rule 1) holds: only a priority pass is ever
  automatic. Rule 2 ("the player's own setting") is replaced by one
  fixed rule that never passes a moment where the player holds
  something they could play and the moment can matter.
- What is playable is Forge's (§6.50): this only decides whether to ask.
  "Could attack" is Forge's CombatUtil; "only works in one step" is
  Forge's own timing restriction on the ability, never card text.
- The countdown is still Phase 8 Amendment 4's timed pass, only longer;
  the click that resolves now is the player's own pass.
- The Mechanics Lab keeps its "ask every time" seat (no rule set), for
  driving the worker directly; it is not offered to players.
- A pause while the opponent decides tells you they hold *something*;
  true today and in MTG Arena, and hiding it would need fake pauses in
  every game. Accepted (owner 2026-10-29).
- Saved stop settings are deleted by a migration.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0035-A | A flash creature is offered at the opponent's end step when they did not attack | check-stops |
| F-0035-B | Lightning Bolt is offered before the opponent attacks; not when they have no creature that could | check-stops |
| F-0035-C | An ability usable only in your upkeep is offered in your upkeep | check-stops |
| F-0035-D | Ashnod's Altar is offered in answer to the opponent's removal | check-stops |
| F-0035-E | Force of Will, paid by its alternative cost, is offered in answer to a spell | check-stops |
| F-0035-F | Ninjutsu is offered after blocks on your turn | check-stops |
| F-0035-G | Nothing playable: no stop at any of these moments | check-stops |
| F-0035-H | Your own spell counts down from 5, both rings (button and cast card) running the full 5 s; a click resolves it at once; clicking a playable card stops the countdown | unit, e2e, browser frames |
| F-0035-I | Questions asked per turn, before and after, on the eight-turn game | check-stops (numbers in the record) |
| F-0035-J | The Stops panel, its API and Skip to end of turn are gone; the menu reads Concede, Abandon | e2e, unit |
| F-0035-K | The countdown and menu in real games, at laptop and computer sizes | browser screenshots |
| F-0035-L | It plays right in real games | owner |

## Measured (2026-10-29, scripts/check-stops.py, Forge)

The same nine-turn game of two burn decks (Mountains, Raging Goblin,
Lightning Bolt, Shock), each run without any stops and with them:

| Version | Priority questions, both players | Per turn |
|---|---|---|
| No stops at all | 135-146 | about 15-16 |
| Before (Amendment 13 defaults) | 27 | 3 |
| After (this rule) | 45 | 5 |

The rise is the moments the old defaults skipped (their end step and
before they attack) in a deck that always holds a Bolt. A deck with no
instants sees none of them. The old worker, run on the new scenarios,
never asked at the end step, before the attack or in the Augur's
upkeep, and failed the Ashnod's Altar check; Force of Will and Ninjutsu
were already asked.

## Decisions for the owner

All taken 2026-10-29 (see the top).

## Amendments

None. (This spec changes spec 0005's D1, 2 s → 5 s, and its "clicking
the countdown pauses it" rule; and retires spec 0034's stop-dependent
words.)
