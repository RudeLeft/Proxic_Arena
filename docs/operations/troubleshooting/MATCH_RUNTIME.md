# Troubleshooting matches

PHASE_06 §6.175. Symptoms, what they mean, and what to do. How it works
is `docs/architecture/MATCH_RUNTIME.md`.

## Where to look

```bash
# the server: launches, failures, restarts
docker logs proxic-arena-arena-server-1 2>&1 | tail -200

# one match's Forge log (its stderr), by match id
docker exec proxic-arena-arena-server-1 ls -t /data/match-logs | head
docker exec proxic-arena-arena-server-1 tail -100 /data/match-logs/<matchId>.log

# what is deployed (signed in: open it in the browser, or the Admin page's health pill)
https://proxic.barnflix.net/api/version
```

A player's own view of their match: `GET /api/matches/current` while
signed in.

## "Waiting for the game" and nothing happens

- **The other player is being asked something.** Only the player Forge
  is waiting on sees a question. Check the other screen.
- **The match died.** If the server restarted, every running match is
  ended (`FAILED_RUNTIME`, `SERVER_RESTARTED`) and the page says the game
  stopped; refresh. A match does not survive a restart by design.
- **Truly stuck.** Either player can press **Abandon match**: no winner
  is recorded and the room comes back. Then look at that match's log.

## "The game stopped before it finished. Nobody won it."

The worker process ended under the match (`FAILED_RUNTIME`). Look at the
match log. The most common cause is a Forge question Proxic does not
yet implement:

```text
UnsupportedOperationException: Forge asked for <method>, which this
adapter does not implement [asked: {...}] [declined: N]
```

That is deliberate (AGENTS STUB-002): an unbuilt question fails loudly
rather than being answered for the player. Note the card that was being
played and the method name; it is built when a real game reaches it
(42 are still unbuilt -- `docs/history/phases/phase-06/PHASE_06_ACCEPTANCE_AUDIT.md`). Out of memory
is the other cause: allow ~1 GiB per concurrent match.

## A match never starts

`FAILED_STARTUP`, the room comes back, and the page says why:

| failure_code | Meaning | Do |
| --- | --- | --- |
| `WORKER_UNCONFIGURED` | no worker jar configured | the image is incomplete; redeploy |
| `WORKER_MISSING` | the jar is not where configured | same |
| `WORKER_UNREACHABLE` | the worker would not start or stopped talking | match log; memory |
| `WORKER_INCOMPATIBLE` | wrong protocol version or wrong Forge commit | an image built from mismatched parts; redeploy a CI-built image |
| `GAME_START_TIMEOUT` | Forge said nothing for 180 s with no question open | match log; host load |

A pregame question a player is slow to answer does **not** time out.

## Launch refused

| code | Meaning |
| --- | --- |
| `MATCH_HOST_REQUIRED` | only the host starts it |
| `MATCH_ALREADY_LAUNCHED` | the other click won; the match is starting |
| `SETUP_NOT_READY` | prepare the match again |
| `LAUNCH_REVALIDATION_FAILED` | a seat's deck or account changed since preparing; that player picks again |

## "No game yet / Host a game" while a match is running

Fixed 2026-10-20 (build 21d3fa1): a refreshed page lost its room
mid-match. If it appears on a newer build, the room lookup has
regressed -- `RoomServiceTest` "a room in a match is still yours".

## A card picture is missing

Expected for: **tokens** (in no deck package), a **transformed card's
back face** (packages carry front images only), and any card after the
match ended (pictures are served only during the match). Otherwise check
that the deck was imported with its artwork (Deck Depot).

## Confusing but correct

- **Spells you cannot pay for are offered.** Forge offers them and puts
  the spell back when the payment fails. They are shown dimmed (§7.54),
  and a number you can't pay for is marked (Phase 9 W-11).
- **The game stops at every step** (upkeep, draw...). It should not:
  one stops rule decides where play stops for everyone (spec 0035). A
  stop at every step is a bug worth a report.
- **An attack or block that won't go.** Forge refused it -- usually a
  creature that must attack (a Legion Warboss token) was left home. The
  page says which one can't go there and keeps the rest selected
  (Phase 9 W-14).

## Checking a deployment end to end

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-production-check.ps1
```

Plays one real game on the live site as RudeLeft and Pat; see
`docs/operations/UPDATING.md`.
