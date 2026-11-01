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

## Built (2026-11-01)

- **The public view.** The worker builds a third view of each moment,
  with no viewer, sent as seat 0 (`spectator: true`, drawn from the first
  seat's side, `viewFrom`): battlefield, graveyards, face-up exile, the
  stack, the card being cast (drawn face down, as to an opponent), life
  and counts. Never a hand, a library, notices, a reveal or a face-down
  card's identity -- even one its owner may look at: a card is named only
  when Forge says EVERY player may see it (both questions, per player:
  HID-002; Forge answers no for a viewer of nobody). Built only while somebody is
  watching: the server sends the worker `WATCHED` on the first spectator
  and off after the last.
- **Server.** A non-player may open the match socket when the match is
  running here and its room lets people watch; they are sent the public
  view and the steps, and nothing they send is read. Their own
  `MatchWatchers`, so nothing addressed to a player can reach them.
  Spectators may fetch the pictures the public view showed. Players are
  sent `WATCHING {count}`. `GET /api/matches/watch/{roomId}` finds the
  game for the lobby's Watch button (404 when it cannot be watched, 409
  for your own game). Room column `watchable` (V031), on by default.
- **Page.** "Let people watch" beside Open a room (on); a playing room's
  card shows **Watch** -- or "Players said no watching". `/watch/<room>`
  shows the game read-only: no hand (each plate says how many cards it
  holds), no questions, no menu but "Stop watching"; "You are watching"
  above the turn, whose turn by name. Players see "N watching" there. The
  page checks every 5 s that the game is still on and says when it ends.
- **Not built: the game's chat for spectators.** The chat travels with
  the room's members through the lobby; spectators are not members.
- Evidence: Lab `scripts/check-spectator.py` (WATCHED mid-game, a
  face-down creature out: no hand, no hand card, face-down unnamed, and
  nothing sent before anybody watched) and the cross-game
  `check-hidden-hands.py` over seat 0's frames; e2e
  `frontend/e2e/match-watching.spec.ts` (a third account watches; players
  see "1 watching"; with watching off, no button and a 404); unit tests in
  `match.test.ts`; screenshots from all three seats.

## Amendments

None.
