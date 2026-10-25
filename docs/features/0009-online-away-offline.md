# 0009 — Online, away, offline

**Status:** Approved 2026-10-24 — built in 1.3.0
**Owner decisions:** A1 a dot on the picture (option A of three on the
lobby canvas); A2 away means no activity for 5 minutes; A3 shown in the
Players list, on room seats and in chat (owner, 2026-10-24)

## What the player sees

Every avatar in the lobby carries a small badge on its corner (A1):

| | Badge | Under the name (Players list) |
|---|---|---|
| Online | a green dot | where they are, as today: "In the lobby", "In your room" |
| Away | a yellow dot with a clock | "Away 7 min · in the lobby" |
| Offline | a grey dot with an ✕ | "Offline · last seen 2h ago" (or just "Offline") |

The shape changes as well as the colour, so it reads for a colour-blind
player too, and each badge has words for a screen reader ("Dana, away 7
minutes").

- **Away (A2)** — signed in, but no mouse, keyboard or touch anywhere in
  Proxic Arena for 5 minutes, or its tab hidden for 5 minutes. The next
  move or the tab coming back makes them green again at once. Someone in
  a game is never away while the game asks them something (the game
  already has its own clock for that). A player with two tabs open is
  away only when both are.
- **Where (A3)** — the Players list, the two seats in your room (so you
  can see your opponent stepped away before you press Start), and the
  avatar beside each run of lines in chat.
- **Offline** — as today, offline accounts stay folded under "Offline ·
  N"; open the fold to see their grey badges and when they were last
  seen.

## Scope

In: the lobby (Players, seats, chat).

Out (and why):
- **Setting yourself away or "do not disturb" by hand** — not asked for.
- **The game screen** — it has its own turn clock and connection marks.
- **Notifications when someone comes online** — a separate idea.

## Rules and boundaries

- **What others learn:** online, away, and roughly when you were last
  seen — never which page you are on or what you are doing. "Last seen"
  is rounded ("2h ago", "yesterday") and comes from the session the
  server already keeps (`user_session.last_active_at`); signing out
  everywhere leaves just "Offline".
- **Live only:** away is held in the server's memory with the
  connections, like presence today; a server restart starts everyone
  fresh.
- **Cheap:** a page reports only a change (active ↔ away), never each
  mouse move; the server tells everybody only when a player's state
  changes.
- **No layout geometry change:** the badge sits on the avatars that are
  already there.

## How it works (for the build)

- Frontend: one activity watcher for the app (pointer, key, touch,
  visibility), sending `ACTIVITY { away }` on the lobby socket when the
  state flips; avatars take a `status` and draw the badge.
- Server: each connection's away flag; a user is away when every one of
  their connections is; `PRESENCE` entries gain `awaySince`, and a
  `PRESENCE_AWAY { userId, awaySince | null }` goes out when it changes.
  `PLAYERS` entries gain `lastSeenAt` for offline accounts.
- `LOBBY_PROTOCOL.md` updated.

## Tests

- Server: two connections, one away -> still online; both away -> away,
  and everybody told once; back -> online; last seen is given for an
  offline account and is absent after sign-out everywhere.
- Unit: the watcher (5 min idle, hidden tab, back on a move; no message
  without a change); "Away 7 min" / "last seen 2h ago" wording.
- Browser: two players; one goes idle (clock moved on in the test) ->
  the other sees the yellow badge in Players, on the seat and in chat;
  a move -> green again.
- Screenshots for the owner before it ships.
