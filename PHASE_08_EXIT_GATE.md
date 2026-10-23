# Phase 8 Exit Gate

**Status: WAITING ON THE OWNER (P8-O).** Nine of the ten acceptance
tests are met; the tenth is the owner playing and accepting. Evidence,
row by row: `PHASE_08_ACCEPTANCE_AUDIT.md`.

Every question Forge can put to a player is now answered by the player,
on the board, and proven in a real game. A deck can hold any card Forge
has, the joke sets included, and no card makes a game stop for want of a
question. If Forge ever asks something new (a new Forge version), the
build fails until it is classified, and a game that reaches it stops
loudly, naming the card, never guessing.

```text
170 entries in the record      110 asked of a player, 19 Forge's own housekeeping,
                               19 not questions, 13 cannot arise under our rules
                               (each with its proof), 5 forwarded, 4 told
                               0 unbuilt, 0 waiting for proof
 37 Mechanics Lab scenario scripts in CI, each a real game or several,
    every one checking the answer on the board afterwards
  4 cross-game trace checks over every Lab game (snapshot-first, hidden
    hands, every permanent has its row, every answered question was asked)
502 server tests, worker tests (the record gate, unreachable proofs,
    loud stops), frontend unit and browser tests       0 failed
ktlint, detekt, ESLint, Prettier, tsc                   clean
```

At the start (2026-10-22): 66 built, 61 unbuilt, 34 unproven; 2,231 of
Forge's 33,978 cards could reach a question Proxic did not answer.

---

## What Phase 8 built

| Area | What a player gets |
|---|---|
| Sacrifice and destroy (spec 0001) | "Sacrifice a creature", edicts, "each player chooses": the right player picks, on the board, even with one choice |
| Surveil and scry | The cards shown as pictures in a "looking at" tray; top, bottom, graveyard and order picked there |
| Costs | Every cost kind Forge has: tapping or untapping creatures, crew, cards for an "unless", multikicker and offspring counts, returning lands, mana in any combination, reveal, draw, exert, behold, collect evidence, blight, forage, damage, gifts, counters, coin flips, dice. Asked before the point of no return (Amendment 2): what can be refunded first, sacrifices last, so backing out loses nothing it should not |
| Your choices | Colours, protection, "use this trigger?", copy or not, X, modes, votes, piles, splice, Room doors, keyword pumps, dungeons, bidding, Krark's Thumb, ward, shields, counter kinds, cascade |
| Combat | Damage split across blockers, Lone Wolf's "as though unblocked", exert, enlist, attack taxes (Ghostly Prison) |
| Dice | Rolls shown; reroll, nudge, swap, ignore (Monitor Monitor, Xenosquirrels, Vedalken Squirrel-Whacker, Bamboozling Beeble) |
| Un-sets (Amendments 1, 3) | Silver-bordered cards import and play. Contraptions and Attractions go to their own decks by card type (at least 15 or 10, one of each, outside the 60-65); assembling onto a sprocket, cranking, Space Beleren's sectors; the board shows each card's sector and sprocket |
| A stop that says why | A question Proxic cannot answer ends the match with no winner and names the card, for the admin's match record (players are told the game stopped) |

---

## What the phase found

Faults found by building and proving it, all fixed:

- **A game that stopped did not always say which card.** A question asked
  as a creature entered came after its spell had left the stack, and the
  stop named only the stack ("chooseSector -- turn 8"). Found by playing
  a game with an answer deliberately removed; now "about Savannah Lions".
- **Assist asked both players at every priority**, while Forge was only
  checking whether a spell could be cast.
- **Card labels carried Forge's internal numbers** ("Grizzly Bears (62)").
- **"Protection from from black"** on the board (Forge's title quirk).
- **Declining part of a cost lost the card**: Sinister Concoction's mill,
  declined after its sacrifice, lost the Concoction, as on Forge's own
  desktop. Costs are now asked in a rules-legal order, refundable first
  (Amendment 2), with no Forge patch.
- **Unstable's Contraptions could not even be imported**: Forge was
  started without its silver-bordered cards (Amendment 3).
- **The style checks failed on another session's work** (too many
  functions in one class), and the browser tests were flaky in CI; both
  fixed.

And the lesson the Lab keeps teaching: a check must answer a NON-first
option and look at the board afterwards. Forge targets the caster by
default, labels need the right ability, results must be read after
triggers resolve, and a game that never reached its moment is
"inconclusive" and gets another shuffle, never a pass.

---

## Unresolved, carried forward

- **A match does not survive a server restart** (by design, P6-AZ).
- **No computer opponent** -- an owner question.
- **Very large boards are slow in Forge**, not in the page: about a third
  of the worker's time at 1,000 tokens is Forge checking which abilities
  can be played. Forge patch 0002 took Krenko from minutes to seconds;
  the rest is Forge's own design.
- **Forge patches 0001 and 0002 are carried locally**, not upstreamed.
- **The planar die** cannot be rolled outside Planechase, which Proxic
  does not play (proven, not built).
- **The Deck Builder's Arena export** (its own project): it caps a deck
  at 65 cards, Contraptions included, and picks printings Forge lacks,
  which Arena refuses. The owner is fixing both there (2026-10-23).
- **"Each slice a release" was missed:** Phase 8 shipped as builds, with
  no release or changelog entry since 1.0.0. One release closes it
  ("Next", step 3).

## The final check (2026-10-23)

A comb of this phase against its locked text, and a code review of
everything it added (about 3,000 lines of game code). The comb found the
missed releases and the Deck Builder gap above; everything else promised
has its evidence. The review found three real faults, fixed with tests:
with the card checker down, a legal Contraption deck was refused as "too
large"; decks illegal whatever Forge says were sent to Forge first (a
worker started for nothing); a face-down creature offered in a cost
question had no name. A fourth was hardened (the cost-check guard now
restores itself). One noted, not changed: a question interrupted as a
match is being stopped falls back to its first answer.

---

## P8-O — what to play

On `https://proxic.barnflix.net` (Unraid updated to `latest`, build
`2c872cc` or later), a game or two with cards from each slice, and say
whether the phase is accepted. A deck per row, or mix them:

| Slice | Cards to try | What should happen |
|---|---|---|
| Sacrifice and destroy | Eldrazi Monument, Diabolic Edict, Innocent Blood, Imperial Edict | The player who chooses is asked, on the board, even with one creature |
| Surveil and scry | Consider, Price of Fame, Preordain, Opt | The cards appear as pictures; top, bottom, graveyard and order are yours |
| Costs | Smuggler's Copter (crew), Coral Atoll, Gush, Everflowing Chalice, Sinister Concoction, Blazing Salvo | Each cost asks what it should; declining Concoction's mill keeps the Concoction |
| Your choices | Council's Judgment, Fact or Fiction, Clone, Blaze, Lightning Axe, Bloodbraid Elf | Votes, piles, copy-or-not, X, cascade yes or no, all asked |
| Combat | Lone Wolf, Glory-Bound Initiate, Ghostly Prison, a big creature double-blocked | Damage split, exert, the attack tax asked |
| Dice | Monitor Monitor, Xenosquirrels, Clay Golem | The roll is shown; reroll and nudge asked |
| Un-sets | Wrench-Rigger and the Steamfloggers with 15 different Contraptions (one of each) in the deck list, Space Beleren with creatures | The Contraptions go to their own deck; assembling asks for a sprocket and the board shows it; Beleren's sectors show on the cards |

Ready-made lists, to open in the Deck Builder (Open Deck) and export
for Arena: `Test Deck/Phase 8/` -- Blue White Choices, Black Red
Sacrifice (60 each), Red Green Contraptions (60 + 15 Contraptions).

---

## Next

When the owner accepts, one change closes the phase:

1. **Phase 8 COMPLETE** in `CLAUDE.md`, `AGENTS.md` ("Current work"),
   `ROADMAP.md` and `README.md`; spec 0001 marked done.
2. **The phase papers become history, unedited**: `PHASE_08_*.md` move
   to `docs/history/phases/phase-08/`, names and text unchanged; every
   path that names them is updated.
3. **`VERSION` 1.0.0 -> 1.1.0**, a `CHANGELOG.md` entry, and a GitHub
   release with plain-English notes.
