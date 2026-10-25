# 0013 — Game screen polish

**Status:** Approved 2026-10-25 — built in 1.4.0
**Owner decisions:** G1 the picture sits beside the life medallion
(option B of three); G2 the game chat is not stored: gone once you leave
the game; G3 the loading screen keeps its picture and words, only the
corner icons wait for the board; everything else as in the demo
(https://claude.ai/artifact/98dP4QExeMNByrrwwGK5S2) (owner, 2026-10-25)

## What the player sees

1. **Waiting for the host.** When both players are ready, the joiner's
   "3 · Start" shows a button-shaped box that is plainly not a button:
   dashed, dimmed, an hourglass, "Waiting for the host", no pointer.
2. **Loading.** When the host presses Start, the joiner's box becomes
   "Loading…" with a spinner. The sentence "Both decks are being
   checked, so a card that can't be played turns up now and not
   mid-game." is gone, for both players.
3. **A clean loading screen (G3).** Until the battlefield has drawn,
   the gear and chat icons are not shown. The loading picture and its
   words are unchanged.
4. **The game has its own page** (`/game`). A refresh during a game
   opens the game straight away; the lobby is never drawn behind or
   before it. Starting a game takes both players there; leaving a
   finished game goes back to the lobby. Opening `/game` with no game
   goes to the lobby.
5. **Game chat.** Its own chat for the players of this game, separate
   from the lobby chat, with everything the lobby chat has: the time by
   the name, your lines marked, bubbles, the emoji button, reactions and
   the "New" marker. You can keep talking on the end screen; it is gone
   once you go back to the lobby (G2). The lobby chat is not shown in a
   game.
6. **Your picture on the medallion (G1).** Each player's avatar sits
   against the left edge of their round life total; the life number and
   circle are unchanged.
7. **Opening and closing the chat.** A tab on the chat's edge opens and
   closes it (a dot on the tab when something new came in), and Close
   sits beside Send.
8. **The gear menu says what each option does.** "Stop options: choose
   the steps where the game waits for you instead of passing", "Concede:
   end the game now; your opponent wins", "Abandon match: for a stuck
   game; it ends for both of you with no winner". The stops panel's
   title is "Stop options".

## Scope

In: the room's start step, the game screen's loading, menu and chat, its
own page, and the medallion.

Out (and why): storing game chat (G2); spectators (there are none);
changing the loading picture (G3).

## Rules and boundaries

- **Who hears the game chat**: only the players seated in the sender's
  game: one that is starting or running, or that ended within the last
  30 minutes (the end screen). Nobody else is sent a word of it, and
  nothing is stored. Same length and rate limits as the lobby chat.
- **Hidden information**: the chat carries only what players type; no
  game state.
- **Layout**: the medallion's circle and the board do not move; the
  picture overlaps the circle's left edge inside the seat panel.

## How it works (for the build)

- Server: `CHAT` and `REACT` take an optional `scope: "game"`; the
  server finds the sender's game (as above) and sends `CHAT`/`REACTION`
  with `scope: "game"` to its players only. `LOBBY_PROTOCOL.md` updated.
- Frontend: the lobby state keeps `gameChat` apart from `chat`, cleared
  when you leave the game; the chat panel is one component with its
  lines, title and Close given; a `/game` route renders the game screen
  from the lobby connection the app already holds.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0013-A | A game line reaches the two players and nobody else; the lobby never sees it; a player not in a game is refused | server test |
| F-0013-B | `gameChat` and `chat` stay apart; reactions land on the right list; leaving clears it | unit test |
| F-0013-C | Refreshing a game shows the game, not the lobby; `/game` with none goes to the lobby | browser |
| F-0013-D | Waiting box, Loading…, no corner icons while loading, medallion picture, menu words | browser + owner screenshots |

## Amendments

None.
