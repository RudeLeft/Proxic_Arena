# Match action model

PHASE_06 §6.180. How a player acts, and what a client may and may not
assume. Written from `MatchController.java` (the worker's Forge
controller) and the regressions that exercise it.

---

## Forge is the only authority

Every action a player can take, and every answer to every question,
comes from Forge as an option with an id. The client never constructs
an action, never parses a label to decide what something does, and never
infers legality. An id that was not offered is refused before Forge sees
it (P6-Q). Forge offers some things that will fail -- a spell nobody can
pay for -- and undoes them when they do; the client must not "fix" that
by hiding options on its own judgement (§6.142; see the Phase 7 notes).

## Selection is not action

Selecting or focusing an object and performing a game action are
different things (§6.53). Clicking a card shows what it can do; it does
not do it.

**Prohibited as a general rule:**

```text
Creature click = Attack
```

Attacking is a **combat-context** decision Forge asks for in the declare
attackers step ("Choose a creature to attack with, or pass to stop
attacking"), offering exactly the creatures that may attack, one at a
time; blocking is the same (P6-V). A creature on the battlefield outside
that context offers only what Forge says it can do there -- often nothing.
Agent of Kotis on the battlefield offers nothing; in the graveyard it
offers Renew (P6-AA).

## Object id vs action id

```text
card:57              an object -- what it IS
action:3:card:57     one thing it can DO, numbered per offer
```

Distinct by construction (P6-AB). One object may have:

- **zero** actions -- a land already tapped, a creature outside combat;
- **one** -- a land's "Play land";
- **many** -- Hellspark Elemental offers cast and unearth; Sensei's
  Divining Top two abilities; a split card each half plus fuse; a Room
  each door; an adventure creature its adventure.

Each is its own option, labelled `<face name> — <its own cost> —
<description>` with the face's own name and cost (a Fire // Ice half is
"Fire — {1}{R}", never the whole card's cost).

## Zone-dependent actions

Actions come from Forge's enumeration of every card's playable abilities
in every zone (`getAllPossibleAbilities`), not from a list of zones the
client expects: Renew and unearth from the graveyard, an adventure
creature cast from exile, Memory (aftermath) from the graveyard, a
suspended spell, a Leyline from the opening hand (P6-BH, P6-AC).

## The question loop

A turn is a series of `DECISION_REQUEST`s. `chooseSpellAbilityToPlay`
("Your move") lists everything this player may do now plus Pass; casting
then asks, one question at a time and in Forge's order, the targets,
modes, X, optional and additional costs, and mana -- each with its own
id. Passing a target or payment question cancels the cast, as in
Forge.

## Nested interaction contexts

A question may open inside another: a spell cast while a library search
is on the stack (Panglacial Wurm), with its own mana payment, after
which the search resumes (P6-AE). Each is a separate question with its
own id; nothing is flattened into one combined list, and the stack in
the snapshot shows what is pending.

## Non-object choices

Some answers are values, not objects: a colour, a creature or land
type, a number, a card name, heads or tails, a mode, a dungeon room, a
text-change word. The values are **Forge's** list (356 creature types
for Adaptive Automaton, ~34,000 card names, searched rather than sent),
never a list the client maintains (P6-AG, P6-AH, P6-AI, P6-AM).

## Questions Forge may ask

`MatchController` answers a question for the player only when there is
exactly one answer (as Forge's own client does); otherwise it asks. A
question it does not yet implement **fails the match loudly**, naming
the method -- never a silent default (AGENTS STUB-002). Built so far:
every question the Phase 6 regressions and the 48 required Mechanics Lab
cards reach. **42 Forge questions are still unbuilt** (for example
"each player sacrifices", surveil, voting); each is built when a real
game reaches it (STUB-001). Listed in `PHASE_06_ACCEPTANCE_AUDIT.md`.

## Phase 7 contract

Phase 7 builds the battlefield on this model and must:

- keep every option reachable -- a shortcut may shorten a path, never
  hide a legal action (§6.142, Phase 7 §7.29, §7.32);
- render an unknown question kind with a generic, usable fallback from
  the protocol data (the current page already does: every kind is a list
  of labelled options plus Pass where allowed);
- offer **inspect** for any visible object without it being an action;
- address the open findings from the first live game: every priority
  stop is asked, unpayable spells are offered, and a refused attack
  does not say why (Phase 7 §7.32a, decided in §7.53, §7.54, §7.61).
