# 0054 — Idle rooms close; a player left waiting can end the game

**Status:** Approved 2026-11-03, not built
**Owner note** (2026-11-03): "I don't want people creating a bunch of rooms
then sitting on them." Players open a room in the lobby and keep it open
without inviting anyone, or invite someone and never start the game. The
owner asked for the timeouts to tell apart a room waiting in the lobby from
a game on the battlefield, and approved the plan at
https://claude.ai/artifact/QuCnRBnip1cnPWtGMqfKn5 with the answers below.

## Two places, two sets of rules

- **A room in the lobby:** from "Create room" until the battlefield opens,
  and again after a game ends. Host alone, an invitation waiting, a guest
  joined, decks being picked, readying up.
- **A game on the battlefield:** from the moment the battlefield opens until
  someone wins, concedes or the game is ended. Room limits never run here.

## Rooms in the lobby

Something happening is: joining, leaving, inviting, changing settings,
picking a deck, readying, **chatting in the room**, or pressing **Keep it
open**. A socket left open is not.

| When | Limit | What happens |
|---|---|---|
| The host is alone in the room (an invitation may be waiting) | **30 minutes** with nothing happening | The room closes; a waiting invitation ends with it. |
| A second player is in the room | **2 hours** with nothing happening | The room closes; both are told why. |
| The host has been offline | **10 minutes** | The room closes even if the guest is still in it: "The host went offline, so the room closed." A refresh or a short drop does not lose it. |
| The guest has been offline | **10 minutes** | The guest is taken out of the room; the host keeps it (a host-alone room again: 30 minutes). |
| 5 minutes before an idle close | warning | Everyone in the room sees "This room closes in 5 minutes" and **Keep it open**, which counts as something happening. (The host-offline close is not warned: only the host coming back keeps the room.) |
| A game ends | fresh clock | The room is back in the lobby and its clock starts from zero. |

What the people in a closed room are told:
- idle: "This room closed after 30 minutes with nothing happening." (or
  "2 hours")
- host offline: "The host went offline, so the room closed."
- guest removed: "You were away for 10 minutes, so you left the room."

## Games on the battlefield

- **No game ends on its own** (owner: "Don't end games"). A game with both
  players gone stays until someone comes back, wins, concedes or presses
  Abandon, as today.
- **A player left waiting can end it.** When the other player has been
  offline for **10 minutes**, the player still at the table sees "Pat has
  been gone 10 minutes" with **Keep waiting** and **End the game**. Ending
  it **counts as a win** for the player who stayed (owner: fair to the
  player who stayed): it is the other player's concession, made through
  the game's own concede, so the winner is still the game's. If the other
  player comes back first, the choice goes away.
- **No time limit on answering.** A player thinking for a long time is
  allowed; a game clock would be its own feature.

## Rules and boundaries

- **Replaces owner decision D4** (rooms expire after 24 hours idle, "long
  enough that an interrupted evening survives the night";
  `ROOM_LIFETIME`, PHASE_05 §5.124): the limits above take its place.
- **One deliberate exception to "a disconnect never concedes"** (PHASE_06
  §6.111, MATCH_PROTOCOL): the game still never concedes by itself; only
  the player left at the table can, after 10 minutes, and only for the
  game as a whole.
- **Offline** means the lobby has no connection from that player (every
  tab closed or dropped), as the lobby's presence already knows; "away"
  (a tab idle, spec 0009) is not offline.
- **The limits are server settings** (30 min, 2 h, 10 min, 5 min warning),
  so they can be changed on the server without a release.
- **Checked every minute**, instead of the hourly sweep, so the times are
  accurate to about a minute.
- The **admin rooms page** shows each room's clock: "closes in 12 min".
- No database change beyond what the sweep needs to know (when a member
  went offline, when a warning was sent); the room's `last_activity_at`
  already exists.

## Proof

- Server tests with a fake clock for every row of both tables, including
  the warning timing, Keep it open, chat counting, the fresh clock after a
  game, and a game never being touched by a room limit.
- Real browser tests: a host-alone room warned and closed; Keep it open
  keeping it; a host going offline closing the room for the guest; a
  guest going offline being removed; a player left waiting ending the game
  and the win being recorded.
