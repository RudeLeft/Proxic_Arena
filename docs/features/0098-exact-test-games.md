# 0098 — Exact test games: a test-only way for the server to deal set cards

**Status:** Built 2026-11-16, unreleased. Approved 2026-11-16 (owner, by prompt: "Also make the planeswalker game exact", after the flake diagnosis). No look changes, so no canvas.

## Why (researched)

`e2e/match-loyalty.spec.ts` failed ("never asked in 1081 answered decisions") because in about 1 game in 40 neither player drew Elspeth Resplendent in 36 turns. Browser tests have no way to set the deal: the Lab's `labDeal` is accepted only by a worker started with `--lab-deal` (`WorkerMain.java` ~263-275), and the server never passes it. The near-deterministic test fix (mulligan for Elspeth, no Sensei's Top spam) is being made anyway; this spec makes such games exact.

## Built

1. A **test-only** switch (an environment setting off by default, only in the local and CI compose files, never in the production compose or image config) lets the server start the worker with `--lab-deal` and accept a deal (each seat's opening hand and library top) from a browser test's match start.
2. With the switch off, any deal sent is refused and nothing changes; a server test proves it, and the production compose files are checked in CI not to set it.
3. Hidden information is unchanged: the deal sets what is in the libraries and hands, and each seat still sees only what the rules allow (HID checks over the dealt games' traces).
4. `match-loyalty` deals Elspeth Resplendent into a hand and drops its mulligan workaround; the e2e helpers gain a `deal` option for other specs to use.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0098-A | With the switch on, a dealt match starts with the dealt cards; with it off, a deal is refused | server test; real-game test |
| F-0098-B | Production compose and image never set the switch | CI check |
| F-0098-C | match-loyalty passes 10/10 with a dealt Elspeth | real-game test |
| F-0098-D | Hidden checks pass over the dealt games' traces | Lab hidden checks |

### As built (2026-11-16)

- **Design: (a), a test-only endpoint.** `POST /api/matches/test-deal` queues each seat's `hand`/`top` (by card name) for the next match between exactly the two named accounts; the caller must be one of them; taken once, forgotten after 10 minutes (`server/.../match/TestDeals.kt`). Chosen over (b), a field on the match start, because §6.10 lets the browser send only the setup id when it starts a match: a deal field would sit in the production request body whether the switch was on or not, while a route that is not mounted is no surface at all. Smaller, too: no change to the launch route, the room messages or the page.
- **The switch.** `PROXIC_TEST_DEALS=true` (`ServerConfig.testDeals`, off unless exactly "true"), set only in `docker-compose.local.yml` and `docker-compose.ci.yml` (so CI's browser-tests job gets it from its compose file; nothing in the job). On: the server logs a warning at start, mounts the route, `MatchRuntime` attaches a queued deal to the seats (`dealTo`), `startGameFrame` sends it as the worker's existing `labDeal`, and the worker is started with `--lab-deal` (`workerCommand`, after the resource root). Off: no store, no route (404), no flag -- and the worker refuses any `labDeal` without the flag, as before. The worker is unchanged.
- **CI check (F-0098-B).** `scripts/check-test-switch.py`, a step in the `checks` job: fails if `docker-compose.yml`, `docker-compose.unraid.yml` or the `Dockerfile` names the switch at all (a pass-through from `.env` would let a host's settings file turn it on), and if the two overrides stop setting it.
- **e2e.** `startAMatch(..., { deal: { host, guest } })` queues the deal (`queueDeal`) just before Start match and fails loudly if the stack has no switch. `match-loyalty`: both seats dealt Elspeth Resplendent, Perimeter Captain, Alley Evasion and four Plains, then Plains, Sensei's Divining Top, Secure the Wastes, Plains, Plains; the mulligan workaround (4eddfda) is gone, the Top/unaffordable skip kept; each seat's keep question checks the three dealt spells are in its opening hand (F-0098-A, real game). `match-ring`: both seats dealt Call of the Ring, White Plume Adventurer, Elite Vanguard and two of each land, then lands and Walking Corpse.
- **Server tests.** `TestDealsTest` (store once/expiry/pair, request limits, `--lab-deal` only with the switch, the switch's parsing, `labDeal` only on a dealt seat), `TestDealLaunchTest` (a real launch through an impostor worker: the queued deal reaches each player's own seat and is taken; with no store, no seat carries one), `MatchRoutesTest` (switch off: 404; on: 204, 403 for a non-player, 422 for an unknown name, 400 for one seat, 401 signed out).
- **Bite tests.** Route mounted regardless of the switch: "a test deal is refused with the switch off" fails. `--lab-deal` passed regardless: `TestDealsTest` fails. Production check: the switch added to a copy of `docker-compose.yml`, of `docker-compose.unraid.yml` (as an `.env` pass-through) and of the `Dockerfile` each fails it, as does the CI override without it. Undealt loyalty game (deal removed): 2 of 2 fail at the dealt-hand check (one hand had no Elspeth; one had Elspeth and the Captain but no Alley Evasion -- the first version checked Elspeth alone, and two undealt games passed it, so it now checks all three).
- **Real games** (local stack on :8080, rebuilt with `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build --force-recreate arena-server`, headless bundled Chromium). `match-loyalty` dealt: 20 of 21 passed, about 47 s each (it used to play up to 36 turns); the final version (three-card check) 6/6; its counter-type screenshot shows turn 11, Elspeth on the battlefield, the counter question on Perimeter Captain beside her -3 dig report. The one failure (third of a batch of four, before the check was strengthened) lost its message to a truncated console; its game record and the server log show all five questions asked and answered by turn 11 and the closing picture checks made (picture 200, unseen asset 404) before the clean-up, so it failed after the game in a step not identified -- left in ROADMAP's flakes. `match-ring` dealt: 5/5, about 26 s each. `match-karn` 1/1, `match-what-happened` 1/1.
- **F-0098-C** asks for 10/10: the last 16 dealt runs in a row passed; 20/21 overall.
- **Hidden information (F-0098-D).** e2e games keep no Lab traces, so the server's game records (every frame each way, `/data/match-records`) of the dealt games were copied out and turned into Lab-format traces (`from: worker|server` -> `dir: in|out`): `check-hidden-hands`, `check-hidden-log`, `check-hidden-mulligans` OK over 19 dealt games (both seats; 266 opening moves of the other player's hand, every one a back). `check-hidden-tops` fails on every loyalty game -- **dealt and undealt alike** (the same failure over two undealt games), so not from the deal: after Sensei's Divining Top puts itself on top of its owner's library, both seats' boards still carry its id under `stack[].source` and `payments[].for`. Recorded for the owner, not fixed here (out of scope: the worker's id hiding).
- **Deviations.** (1) The deal is per pair of accounts, not per room: two specs using the same pair at once on one stack could take each other's deal (CI runs game specs one at a time per stack). (2) No Lab script: nothing in the worker changed.

## Amendments
