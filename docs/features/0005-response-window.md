# 0005 — The response window: respond to your own spell, automatically

**Status:** Built in 1.1.0 (approved 2026-10-23)
**Owner decisions:** build it now (owner, 2026-10-23: "write the spec and
build it"); D1 a 2-second window; D2 remove the Hold button (spec 0004
is replaced); D3 Phase 8 Amendment 4 approved (a timed pass)

## What the player sees

Mulldrifter enters and its "draw two cards" trigger goes on the stack.
You hold Opt and an untapped Island. Instead of passing for you (Arena
style) or stopping you every time (spec 0004's Hold), the Pass button
counts down: **"Resolving in 2…"**. Do nothing, and the trigger resolves
when it runs out -- no extra click. Click Opt, and the countdown stops:
you cast Opt on top, as you would any time you have priority.

Fully automatic: no setting, nothing remembered, nothing to choose.

## The rules of the window

- **When:** a priority question where the top of the stack is YOUR OWN
  spell, ability or trigger, and you have something you could do (the
  same test stops already use). Nothing to do: passed for, as today.
  The opponent's spells and triggers: unchanged -- always asked when you
  could respond, with no countdown.
- **Pauses it, for good** (it becomes an ordinary "your move" question):
  clicking a card you could play right now (a highlighted one); right-
  clicking any card for the close look; opening a graveyard, exile or
  hand list; clicking the countdown button itself (it becomes Pass).
- **Does not pause it:** moving or hovering the mouse; clicking a card
  you cannot use (its "why not" still shows); chat; the game menu.
- **Skip the wait:** Space, or Pass after pausing.
- After a pause the countdown does not come back -- cancelling a cast
  returns to the ordinary question.
- **Who passes:** the player's own page, when its countdown runs out --
  never the server or the worker. A page that is closed or disconnected
  passes nothing; the question waits as any question does.

## Scope

In: the worker marking such a question as a response window; the server
carrying the mark to the asked player only; the page's countdown, its
pauses and its pass. Removing spec 0004's Hold button, setting and
database column.

Out: any change to the opponent's stops; per-card or remembered choices
(owner: "no remembering"); a configurable length.

## Rules and boundaries

- Phase 8 Amendment 4 (owner, 2026-10-23) is the only new automatic
  answer, and only this one: a priority pass, on your own item, after a
  visible countdown you let run out.
- Hidden information: the mark rides on the decision, which goes to the
  asked seat alone; the other player sees "Waiting for <name>" as for
  any question.
- No Forge change: Forge asks as it always did; only Proxic's stops and
  page change.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0005-A | Your own spell on the stack with something to respond with: asked, marked as a response window; nothing to respond with: passed for; the opponent's spell: asked with no mark | real game (Mechanics Lab) |
| F-0005-B | The countdown runs out: the page passes, the spell resolves | browser test |
| F-0005-C | A pause (clicking the countdown) stops it for good: no pass is sent, the button says Pass | browser test + unit |
| F-0005-D | The Hold button is gone | browser test |
| F-0005-O | The owner plays it and accepts it | owner |

## Decisions for the owner

- **D1 — How long?** 1.5, 2 or 3 seconds. **Owner, 2026-10-23: 2.**
- **D2 — The Hold button?** Keep or remove. **Owner, 2026-10-23: remove
  it** -- pausing the countdown is holding priority.
- **D3 — A timed pass** needs Phase 8's rule changed. **Owner,
  2026-10-23: approved, Phase 8 Amendment 4.**

## Amendments

1. **2026-10-24 -- "Skip to end of turn" covers your own spells too**
   (owner, asked with the choice of "countdown anyway"). After a skip,
   your own spells and triggers that turn get no countdown -- the Skip
   rule's "no more stops this turn unless the opponent acts" (PHASE_07
   §7.53); the opponent's still stop you. Proven by `check-stops.py
   window-skipped`, which fails on the code before it.
