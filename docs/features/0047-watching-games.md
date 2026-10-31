# 0047 — Watching games

**Status:** Approved 2026-10-31
**Owner decisions:** 2026-10-31, from the canvas
https://claude.ai/artifact/9zAJGg3MBjLo59aG2KjsZ5 (report 7): option A —
watch live, if the players allow.

## What the player sees

- **In the lobby**, a room that is playing has a **Watch** button.
- **The host** has "Let people watch" when opening a room, on to start; a
  room with it off shows "players said no watching" and no button.
- **A spectator** sees the public table: both players' battlefields,
  graveyards, exile, the stack, life, counts of cards in hand and library,
  the turn and step — never a hand's contents or a library's order — and
  the game's chat. They are never asked anything and can leave at any time.
- **The players** see "2 watching" by the turn ladder.

## Rules and boundaries

Hidden information is the whole point (AGENTS hidden-information rules):
the worker makes a third, public view of each moment for spectators, with
nothing any player's view hides; a spectator's socket can send nothing that
changes the game. Tested like the hidden-hand check: no spectator frame
carries a card a player holds or a library's order.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0047-A | Watch opens a live, read-only game for a third account | browser |
| F-0047-B | No spectator frame names a card in any hand or library | Lab/cross-game check |
| F-0047-C | "Let people watch" off: no Watch button, and the server refuses a spectator | server test + browser |
| F-0047-D | Players see how many are watching | browser |

## Amendments

None.
