# 0098 — Exact test games: a test-only way for the server to deal set cards

**Status:** Approved 2026-11-16 (owner, by prompt: "Also make the planeswalker game exact", after the flake diagnosis). No look changes, so no canvas.

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

## Amendments
