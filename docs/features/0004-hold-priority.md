# 0004 — Hold priority: respond to your own spell or trigger

**Status:** Approved 2026-10-23
**Owner decisions:** build before Phase 8 closes (owner, 2026-10-23, from
the Phase 8 rules review); D1 a Hold button only; D2 until turned off

## What the player sees

Your Mulldrifter enters and its "draw two cards" trigger goes on the
stack. You want to cast Opt before it resolves. Today the game passes
for you the moment the trigger is on the stack, because it is your own
-- Arena-style stops never stop for your own spell or ability. With
**Hold** on, you get priority back after anything you put on the stack:
the rail says "Your trigger is on the stack" and you can cast Opt, or
pass to let it resolve.

The rules give you that priority every time (CR 117.3c: after a player
casts a spell or activates an ability, that player receives priority).
MTG Arena hides it behind "full control"; Proxic has no way to reach it.

## Scope

In: a way for a player to keep priority after their own spells,
abilities and triggers; the server and worker honouring it; the rail
saying it is on.

Out (and why): changing what the opponent's stops do (unchanged); a
per-spell "hold" key on top of the setting, unless the owner chooses it
(D1); anything Forge decides -- this only stops passing on the player's
behalf.

## Rules and boundaries

- Only ever MORE questions: Hold never answers anything for the player
  (§6.50); with it off, behaviour is exactly today's.
- The setting is the player's own, and only theirs (it travels with the
  STOPS message for their seat). Mindslaver's controlled seat is always
  asked already.
- No Forge change: Forge already asks; Proxic's stops decide whether to
  pass for the player (PriorityStops.shouldAsk).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0004-A | Hold off: your own spell on the stack is passed for, as today | worker unit + existing stops e2e |
| F-0004-B | Hold on: after you cast a spell (or your trigger goes on the stack) you are asked, and can cast an instant on top; passing resolves yours | real game (Mechanics Lab) |
| F-0004-C | Hold is per player: turning it on never makes the opponent stop | real game |
| F-0004-D | In the browser: the Hold control turns it on and off, says when it is on, and survives a reload as D2 says | browser test |
| F-0004-O | The owner plays it and accepts it | owner |

## Decisions for the owner

- **D1 — How is it turned on?** A **Hold** button on the rail beside
  Pass (click: on/off), or holding a key (Ctrl) while you cast, or
  both. *Recommendation: the button, plus Ctrl as a shortcut for it --
  visible, and quick for those who know it.* **Owner, 2026-10-23: the
  button only.**
- **D2 — How long does it last?** Until you turn it off; or for the
  rest of this turn; or for the one spell you cast with it.
  *Recommendation: until you turn it off -- simplest to understand, and
  the rail always shows it is on.* **Owner, 2026-10-23: until you
  turn it off.**

## Amendments
