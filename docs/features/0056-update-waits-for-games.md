# 0056 — An update waits for games to finish

**Status:** Approved 2026-11-06 (owner, on the canvas); built 2026-11-06, unreleased
**Owner decisions:** "Update waits for games" (not resume-after-update, not
a separate games container); in a game, a notice card (A); the update
waits only until games end -- no deadline, no countdown; no email, the
admin page says when it is safe. Canvas:
https://claude.ai/artifact/XgKCZup8pqCA5vgqGayCFe

## What the player sees

You and Pat are on turn 9 when the owner wants to update. Today the
update ends your game ("game over") with no warning. With this, the owner
first switches on **Update waiting** on the admin page:

- **In a game:** a notice card, top right like the game's other messages:
  "An update is waiting -- finish your game as usual; no new games will
  start until the update is done." It stays while the update waits.
- **In the lobby:** rooms stay open and chat works, but a new game can't
  start; the room says why: "An update is coming. New games can start
  again once it's done (usually a few minutes)."
- **The owner, on the admin page:** how many games are still running
  (who, which turn), and, when none is, **"No games running: safe to
  update now."** The owner then presses Update on Unraid. Cancelling the
  switch lets new games start again at once.

If the server is stopped while a game is running anyway (an update
pressed regardless, a crash, a restart), the players are told plainly
instead of "game over": "The server is being updated. This game couldn't
be finished before the update. It isn't counted as a win or a loss. Your
room is still here." Docker is given longer to let the server say so
(it waited 10 seconds, then forced the stop).

## Why (found 2026-11-06)

Each game's Forge worker is a child process of the server, in the same
container (docker-compose.yml: per-match child JVMs, PHASE_00), and the
game's state lives only there. An update replaces the container: every
worker is force-stopped (MatchRuntime.stopAll), and at the next start
MatchRecovery marks unfinished matches FAILED_RUNTIME / SERVER_RESTARTED,
which the page showed as game over. Nothing warned anyone first. Resuming
a game after a restart would need Forge to replay deterministically (it
draws from an unseeded SecureRandom) and cannot work for the updates that
change Forge itself; the owner chose to wait for games instead.

## Scope

In: an admin switch (in memory: the update itself ends it; a restart
starts with it off); refusing new games while it is on; the lobby's
reason; the notice to players in games; the admin page's running games
and "safe to update"; a plain message to players when the server stops
with games running; the match's end shown as "the server was updated"
(SERVER_RESTARTED), not as a result; a longer stop grace period.
Out: resuming games after a restart (see Why); a deadline or countdown
(owner: wait only until games end); email (owner: no).

## Rules and boundaries

The admin switch is admin-only (the existing admin authorisation and
CSRF rules). Players see general words only -- never server details
(owner 2026-11-06). A game cut short by a stop is no result: no win or
loss is recorded for it (as today's SERVER_RESTARTED).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0056-A | With the switch on, a game can't start; with it off again, it can | server test; browser (lobby reason shown) |
| F-0056-B | Players in a game get the notice when it is switched on, and it goes when switched off | server test of the broadcast; browser |
| F-0056-C | The admin page lists running games and says "safe to update" when none | server test; browser |
| F-0056-D | A server stop with a game running tells its players plainly, and the game ends as "the server was updated", never a win or loss | server test; page test |
| F-0056-E | Only an admin can switch it | server test |

## Amendments

### As built (2026-11-06) -- what was built, not a change to the spec

- **The switch.** `admin/UpdateWaiting.kt` holds it in memory, off at every
  start. `GET /api/admin/update-waiting` -> `{on, games: [{matchId,
  players, turn?}]}`; `POST /api/admin/update-waiting {on}` switches it
  (administrators only, CSRF-checked like every admin change; recorded as
  `UPDATE_WAITING_ON` / `UPDATE_WAITING_OFF`). The Admin page's Server tab
  has an "Update waiting" panel (`frontend/src/AdminUpdate.tsx`): Switch
  on / Switch off, the running games as "RudeLeft vs Pat · turn 9", and
  "No games running: safe to update now." when there are none; it
  re-reads every 5 seconds while on.
- **No new game.** `POST /api/matches` is refused 409 `UPDATE_WAITING`
  ("An update is coming. New games can start again once it's done
  (usually a few minutes).") before the setup is claimed. The lobby hears
  `UPDATE_WAITING {on}` on its socket (on every connect, and by everybody
  when it changes); a room waiting in the lobby shows that sentence, and
  its Start box reads "Waiting for the update". Rooms and chat are
  untouched.
- **In a game.** A blue notice card, top right on the table, with no ×
  and no fade: "An update is waiting" / "Finish your game as usual; no new
  games will start until the update is done." It goes when the switch is
  off (or the game ends).
- **A stop under a game.** On Ktor's `ApplicationStopPreparing` (before
  connections close) `MatchRuntime.stopAll(tell)` sends `SERVER_STOPPING`
  on each game's match socket (players and spectators), records
  `FAILED_RUNTIME` / `SERVER_RESTARTED` with no result, gives the room
  back (the lobby's `MATCH` carries `failureCode: SERVER_RESTARTED`), then
  stops the worker (`match/ServerStopping.kt`). `GET /api/matches/{id}`
  now carries `failureCode`, so a page that finds the match after a
  restart (MatchRecovery) shows the same words. The result banner:
  "The server is being updated" / "This game couldn't be finished before
  the update. It isn't counted as a win or a loss. Your room is still
  here." Never "Game over", never a winner. `docker-compose.yml`:
  `stop_grace_period: 30s` (the override files inherit it).
- **Tests.** Server: `UpdateWaitsForGamesTest` (F-0056-A; F-0056-C's
  list and F-0056-D against a real worker process), `ServerStoppingTest`
  (F-0056-D, the frame), `UpdateWaitingApiTest` (F-0056-B, C, E) and the
  admin every-route test (E). Page: `updateWaits.test.ts`. Browser checks
  (F-0056-A to D's "browser" evidence) are not yet run.
- **Seen in the real app (2026-11-06, local stack):** a game running, the
  admin page switched on -- "1 game still running · RudeLeft vs Pat ·
  turn 1"; both players saw the notice top right; switched off, it went;
  the server then stopped under the game (`docker compose stop`): both
  players saw "The server is being updated / This game couldn't be
  finished before the update. It isn't counted as a win or a loss. Your
  room is still here." with Back to the room; no "game over", no winner.
