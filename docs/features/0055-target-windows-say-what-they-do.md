# 0055 — Target windows say what they do

**Status:** Approved 2026-11-06 (owner: option A on the canvas); built 2026-11-06
**Owner decisions:** A · Say what it does (canvas
https://claude.ai/artifact/FB1Wo7i92d2t2Yy4h6DiQ2)

## What the player sees

Your Goblin dies and Boggart Shenanigans triggers. The window used to say
only "Choose a target / These are the legal targets." Now it says:

> **Deal 1 damage**
> Boggart Shenanigans may deal 1 damage to a player or planeswalker.
> Click a player or planeswalker.
> [Don't deal 1 damage]

The title is the action; under it the card's own words, made plain
("target X" reads "a X"; Forge's "It deals ..." reads "Mogg Fanatic
deals ..."); then what to click. A "may" can be declined with a button
saying so (it backs out of the trigger, as Cancel always did). Every
target window -- a click on the table, a list, one of several copies of
a trigger -- uses the same words.

## Why (found 2026-11-06)

A trigger's target question reached the page with NO words: the worker
used the ability's description, which Forge leaves empty for a triggered
ability; a trigger's words are its trigger description. 27 of the Lab's
target questions had none (Storm-Charged Slasher, Karplusan Minotaur,
Reckless Stormseeker, Boggart Shenanigans...). Target lists also showed
Forge's internal numbers ("Glistener Elf (46)").

## Scope

In: the words of `chooseTargetsFor` in every window; a trigger's effect
from its trigger description (the condition -- "Whenever ..." -- left
out); target names without numbers, the same name twice told apart as
"(first)", "(second)". Out: questions other than targets (they have
their own titles from Phase 9).

## Rules and boundaries

Words only: the targets offered are Forge's, unchanged (§6.93). Hidden
information: a target's name is what the viewer may see
(`ViewerSnapshot.nameFor`). No "Forge" in player text.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0055-A | A trigger's target question carries its effect, without its condition | worker `TargetWordsTest`; Lab many-triggers game: "Boggart Shenanigans may deal 1 damage to target player or planeswalker." |
| F-0055-B | The title is the action, the words plain, the click said, a "may" declinable | page `targetWords.test.ts` (Boggart, Bolt, Mogg Fanatic, Doom Blade, Storm-Charged Slasher, Swords, Unsummon) |
| F-0055-C | Target names carry no internal numbers; twins are told apart by order | `TargetWordsTest` |
| F-0055-D | The real window shows it | rebuilt local stack, the Lab's Boggart question shown in a game page (screenshot); `match-many-triggers` passes |

## Amendments
