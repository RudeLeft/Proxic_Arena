# 0001 — Sacrifice and surveil

**Status:** Approved 2026-10-22
**Owner decisions:** what to build (2026-10-22: "spec sacrifice plus
surveil"); approved 2026-10-22 with D1 yes (destroy too), D2 ask anyway,
D3 card pictures (scry moves to the same look)

## Why

Two of the 42 unbuilt Forge questions, and the two most likely to stop a
real game. The owner's game on 2026-10-22 ended at turn 10 with no winner
because Eldrazi Monument's upkeep trigger asked "which creature do you
sacrifice?" — a question Proxic could not ask, so the match stopped
(choosePermanentsToSacrifice; the Admin page now says so).

| Forge asks | Cards that ask it (examples) |
|---|---|
| `choosePermanentsToSacrifice` | Eldrazi Monument, Diabolic Edict, Innocent Blood, Liliana of the Veil's −2, Fleshbag Marauder, Barter in Blood — any "sacrifice a …" that is an effect, not a cost |
| `arrangeForSurveil` | Consider, Sinister Sabotage, Price of Fame, Doom Whisperer, Dimir Spybug — every "surveil N" |

Sacrifice as a COST (Fling, Village Rites) is already built
(`MatchCostDecision`, CostSacrifice) and is not part of this.

## What the player sees

**Sacrifice.** Pat casts Diabolic Edict targeting you. The line at the
top says Forge's own words — "Select a creature to sacrifice" — and your
creatures that may be sacrificed glow; nothing else does. You click one;
it goes to your graveyard and the game goes on. Pat sees the question is
yours — that you are choosing — and which creature only once you have.

Eldrazi Monument, your upkeep: the same — your creatures glow; with no
creature, Forge has you sacrifice the Monument, as the card says.

"Each player sacrifices a creature" (Innocent Blood): each player is asked
in turn, in the order Forge asks — the caster's choice is not seen by the
other before both have chosen, if that is how Forge orders it (it
decides; Proxic shows).

When the rules leave nothing to choose — you must sacrifice one creature
and have exactly one — Forge still asks: its own desktop screen shows that
one creature to click (see D2). An optional sacrifice ("you may
sacrifice…") is first a yes/no, which Proxic already asks.

**Surveil.** Consider: "Surveil 1 — Library or Graveyard?" with the card
shown big to you alone; two buttons. Surveil 2 or more (Price of Fame):
first "choose the cards to put into your graveyard" (any number, none
included), then, if two or more are left, "which goes on top" in order —
exactly how scry works today, so it reads the same.

## Scope

**In:** the two questions above, on the board and the act button as the
rest of the game screen works (owner 2026-10-22: no window where a click
will do, Cancel where backing out is allowed — here it is not: neither
question has a "no"). Mechanics Lab scenarios and browser tests for both.

**Out (and why):** sacrifice as a cost (built); the other 40 unbuilt
questions (each its own spec, ROADMAP); any change to how Forge decides
who sacrifices what — Forge's rules, untouched (ARCH-002).

## Rules and boundaries

- **Forge decides what may be chosen** (`validTargets`, min, max) and
  whose question it is. Proxic offers exactly that list — never filters
  it, never fills it in (§6.50, §6.105: no guessing, no first option).
- **Hidden information (HID):** the surveilled cards are library cards:
  shown to the surveilling player only, in their own question; the
  opponent sees "Pat is surveilling 2", and then the cards that reach the
  graveyard (public). `check-hidden-hands` must stay green over the new
  games. A sacrifice choice is public once made; before it, the other
  player sees only that it is being made.
- **Order matters for surveil** (first picked = top card), the trap scry
  already documents (Forge reverses the list) — the same test as
  `check-library-order.py`, for surveil.
- **Mandatory:** sacrificing N with N legal permanents of ≥ N, and surveil,
  have no "no". "Up to N" (min < max, rare) has a Done.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0001-A | Eldrazi Monument, upkeep, with creatures: the controller is asked, only their creatures are offered, the chosen one is in the graveyard, the game goes on | real game (Mechanics Lab) |
| F-0001-B | Eldrazi Monument with no creature: the Monument is sacrificed; no stop | real game |
| F-0001-C | Diabolic Edict on the opponent: the OPPONENT is asked, never the caster; only creatures | real game |
| F-0001-D | Innocent Blood: both players asked, each about their own creatures | real game |
| F-0001-E | Surveil 1 (Consider): Library keeps it on top (the next draw is that card); Graveyard puts it there | real game |
| F-0001-F | Surveil 2 (Price of Fame): chosen cards to the graveyard; the rest on top in the order picked — the next draws prove it | real game |
| F-0001-G | No surveilled card reaches the other player before it is public | `check-hidden-hands` over F/G games |
| F-0001-H | In the browser: a sacrifice is clicked on the board; a surveil is answered in the question line; neither shows a Cancel | browser test |
| F-0001-I | The Mechanics Lab ledger lists the new cards as passing | ledger |
| F-0001-O | The owner plays a game with Eldrazi Monument (or Edict) and a surveil card and accepts it | owner |

## Decisions for the owner

- **D1 — "Destroy one of your permanents" too?** Forge asks it through
  the same code, with one word different (`choosePermanentsToDestroy`;
  cards that make a player destroy their own permanents). Building it
  alongside costs almost nothing and removes a third unbuilt question.
  *Recommendation: yes, include it.* **Owner, 2026-10-22: yes.**
- **D2 — When there is no real choice** (sacrifice one creature, you have
  one): ask anyway, with that creature glowing (one click; you always see
  what happened — Forge's own screen does this), or let it go without a
  question and say so in the game's notices ("You sacrificed Goblin
  Instigator")? *Recommendation: ask — as Forge does, and never a silent
  move (§6.50); one click.* **Owner, 2026-10-22: ask anyway.**
- **D3 — Surveil's cards:** shown as their names in the question line
  (as scry is today), or as small card pictures you click (more like the
  rest of the board, more work)? *Recommendation: card pictures,
  clickable, since the owner wants the board to be the answer — and scry
  moves to the same look in the same change.* **Owner, 2026-10-22: card
  pictures.**

## Amendments

None.
