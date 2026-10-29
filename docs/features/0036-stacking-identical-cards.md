# 0036 — Identical cards stack, up to 15

**Status:** Built in 1.19.0
**Owner decisions:** 2026-10-29 — any identical cards stack, not only
basic lands and tokens; any difference splits them; at most 15 to a
stack; clicking a stack in an attack sends one card per click; cards
with the same counters stack; different artwork of one card stacks
(the first card's art shows); a token copy never stacks with the real
card.

## Why

The owner: "if a set of cards are the same they stack up to 15 … if
they are all the same but 4 have flying and 4 have deathtouch then they
don't stack, the flying cards would stack and the deathtouch cards
would stack."

Today (layout.ts `pileKey`, PHASE_07 §7.58 and §7.52a L5/L8, spec 0003):

- Only basic lands and tokens stack; four Grizzly Bears stay four cards.
- There is no limit: 40 Goblin tokens are one ×40.
- Damage marked is not compared: a token with 1 damage can sit in a
  stack of undamaged ones.
- Counters keep a card out of every stack, even when its twins carry
  the same counters.

## What the player sees

**Any identical cards stack** — creatures, artifacts, enchantments,
lands (basic or not), tokens — drawn as one card with a "×N" badge, as
basics and tokens are today.

**Identical means all of these match**, as the board shows them now:

| Fact | Example of a split |
|---|---|
| Controller and card name | — |
| A token, or a real card | a token copy of Grizzly Bears beside a Grizzly Bears |
| Tapped or untapped | 3 tapped Forests, 2 untapped |
| Attacking, and at whom | 2 Bears at the player, 1 at a planeswalker |
| Power and toughness now | one Bear pumped to 4/4 |
| Keywords now | 4 with flying, 4 with deathtouch: two stacks of 4 |
| Counters (kind and number) | two +1/+1 counters vs one |
| Damage marked this turn | a Bear with 1 damage |
| Summoning sickness | the Bear cast this turn |
| Type line | an animated land |
| Ring-bearer, sector, sprocket | the Ring-bearer |

Artwork is not compared: two printings of one card stack, showing the
first card's art.

**Always on their own:** a card with something attached or attached to
something (aura, equipment); a blocking creature, and an attacker once
blocked (so each block line stays clear); a face-down card.

**At most 15 to a stack.** The 16th identical card starts a second
stack: 40 Goblins show ×15, ×15, ×10, oldest first.

**Clicking a stack acts on one card of it** (§7.58: tapping "a Forest"
is choosing one of them). Attacking: each click sends one more; the
attackers form their own stack beside the rest; "All attack" still
sends every creature. Targeting, tapping and blocking likewise take one,
which then splits off. Safe because the members are identical in every
way the game can see.

## Scope

In: which battlefield cards stack and how many (layout.ts); the
interaction rule that a stack answers as one member (already true).

Out: the look of a stack (the ×N badge is unchanged); the hand, the
stack zone, graveyard and exile lists; anything the server or Forge
decides.

## Rules and boundaries

- Only what the board already shows is compared; nothing hidden from
  either player is used. Both players see the same stacks for public
  cards.
- A stack never hides a difference that could change a choice: if a
  fact on the list above differs, they split. A fact missing from the
  snapshot cannot be compared, so anything the board learns later
  (say, a new per-card state) must join the list or keep the card
  alone.
- Spec 0003's unblocked-attacker piles still hold (one card, one fire
  line), now for any card and capped at 15.
- Replaces §7.58 / §7.52a L5 / L8's "basic lands and tokens only".

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0036-A | 4 identical nontoken creatures stack ×4; nonbasic lands, artifacts and enchantments stack | unit (layout) |
| F-0036-B | Each fact in the table splits a stack (one case each, incl. 4 flying + 4 deathtouch → ×4, ×4) | unit (layout) |
| F-0036-C | Same counters stack; different counts split | unit (layout) |
| F-0036-D | Different art stacks; a token copy and the real card split | unit (layout) |
| F-0036-E | 40 identical tokens → ×15, ×15, ×10 | unit (layout) |
| F-0036-F | Attached, blocking, blocked and face-down cards stand alone | unit (layout) |
| F-0036-G | Clicking a stack of 6 attackers-to-be sends one per click; All attack sends all | e2e |
| F-0036-H | Stacks in a real game, at laptop and computer sizes | browser screenshots |
| F-0036-I | It looks and plays right | owner |

## Decisions for the owner

All taken 2026-10-29 (see the top).

## Amendments

None.
