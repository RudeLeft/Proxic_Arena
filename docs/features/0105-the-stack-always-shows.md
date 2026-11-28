# 0105 — The stack always shows: a spell or ability nobody can answer rests on the stack 2.5 s, with a countdown ring, then resolves

**Status:** Approved 2026-11-19 (owner, by prompt, feedback batch). Not part of a phase.
**Built:** 2026-11-19 (commit 61ce7fed). **Released:** in 1.74.0, 2026-11-20.
**Owner decisions** (owner feedback batch 2026-11-19; canvas `frontend/zz-canvas/feedback-1119.html`):
Q2 **B** (2.5 s; A was 2 s, C 3 s). A spell or ability nobody can answer rests on the stack 2.5 s with a countdown ring, the act button's "Resolves in" coin look with no words and nothing to click, then resolves. Several in a row: the first rests the full 2.5 s, each after it about 0.8 s. The game itself (the worker) holds, as research A recommended (its option 2A), not only the screen.

Canvas sections: "Q2" (decided line; Alice's seat and Bob's seat, option B; "Several triggers in a row", option B). Research: `Owner feedback 2026-11-19 research A.md`, item 2.

## Reverses two approved decisions (PHASE-003 record)

- **Requirement (earlier decisions).** Phase 9 Amendment 13 item 2 (owner, 2026-11-03; `docs/history/phases/phase-09/PHASE_09_GAME_WINDOWS_LOCKED.md`, Amendment 13, "No stack flash"): "a spell that resolves first goes straight from the big card to the battlefield (instants and sorceries likewise)". The owner's item 2 of 2026-11-01 (cited in `CastingCard.tsx` at `DECIDE_MS` and in `GameScreen.tsx` at `fieldWhileCasting` / `flyingOnto`): a permanent nobody answered lands straight on the battlefield.
- **Observed reality.** RUN (research A, Victim of Night against Grizzly Bears, stops rule on and off): when nobody can answer, both seats are passed for at once and the spell is on the stack for a few thousandths of a second; the caster's big card fades where it stands and never reaches the stack. SOURCE: the other player's screen holds the board for `HOLD_MS` (1500 ms, `GameScreen.tsx`) while the card's flip, face-up hold and flight take `FLIP_MS` + `HOLD_MS` + `FLY_MS` = 420 + 650 + 560 = 1630 ms (`CastingCard.tsx`), and the stack entry is hidden while the card flies (`castOnItsWay` / `hiddenStack`), so it is gone before it lands (INFERENCE: the canvas's "Bob's seat, Today" shows it; no clip was filmed).
- **Today's owner decision (2026-11-19, Q2 B).** "The stack always shows": everything that uses the stack is seen on it, for 2.5 s, whether or not anyone can answer.
- **Why.** The owner could not see what was cast or why things happened when nothing could be answered (the Victim of Night report in the feedback batch); a game in which spells skip the stack reads as things happening by themselves. The 2026-11-01 / 2026-11-03 decisions were made to avoid a stack flash; a 2.5 s rest is not a flash.
- **Effect on the earlier decisions.** Amendment 13 item 2's first half ("while a cast card is in the air nothing is drawn in the stack spot") stays: the stack card still appears only when the flight lands. Its second half ("a spell that resolves first goes straight from the big card to the battlefield") and the 2026-11-01 item 2 are superseded for every game where the stops rule is on (every real game): the card always flies to the stack, rests, and a permanent then glides from the stack to its place. The fade-where-it-stands path stays only as the fallback for a board that missed the stack (PROTO-007: a dropped snapshot, a reconnect, a Lab game with no stops). The frozen Phase 9 document is not edited (PHASE-002); this section is the record.

## Why (researched)

Researched at HEAD 3370c75 (1.73.0); SOURCE unless marked.

- **The worker passes for both** (RUN). `MatchController.chooseSpellAbilityToPlay`: when `host.stops().shouldAsk` says no, the seat is passed for at once (`showTheirStack()` publishes a board for the other player's stack top first); when it says yes and the top is the seat's own, `offerResponseWindow` starts the page's 5 s countdown (`RESPONSE_WINDOW_MS`, spec 0005). The only worker pause today is `PriorityStops.STEP_PAUSE_MS` (400 ms, spec 0061), slept on the game thread in that same branch while `PriorityStops.pausing` says so — the mechanism this spec reuses.
- **The server adds no delay** (SOURCE: it relays boards as they come).
- **The page.** `match.ts`'s `MATCH_SNAPSHOT` reducer sets `spotlight` for the other player's new stack entry; `GameScreen.tsx` holds it `HOLD_MS`. `CastingCard.tsx`: `DECIDE_MS` 150, `FLY_MS` 560, `FLIP_MS` 420, `HOLD_MS` 650, and the "Already resolved before this viewer saw it on the stack" fade. `Board.tsx`: `RISE_MS` 520 (a trigger rising), `STACK_IN_MS` 260, `RESOLVE_MS` 380, `SPELL_WAIT_MS` 4000 (a safety limit). A permanent arriving from a stack card glides from that card's box (`Board.tsx`, the arrival glide's `fromStack`).
- **The countdown coin.** The act button's response-window coin: `GameScreen.tsx`, `gs-coin gs-coin-timer` with `gs-coin-dial` / `gs-coin-ring` (and `gs-coin-pause`, not used here).
- **Tests today.** `frontend/e2e/match-stops.spec.ts` checks flow, not timings; `scripts/check-stops.py` checks the worker side.

## What the player sees

Alice is you (bottom), Bob the other player.

1. **Victim of Night nobody can answer** (canvas "Q2", option B, both seats). Alice casts Victim of Night at Bob's Grizzly Bears; Bob has nothing he could cast. Alice's big card flies to the stack as usual. On it, a small gold ring (the act button's "Resolves in" coin, no words, nothing to click) empties over 2.5 s; her act line says "Resolving · nobody can answer". Then the stack card glows, its beam strikes the Bears, they die and the spell goes to her graveyard. On Bob's screen her card turns face up, waits, flies to the stack, and the same ring empties for 2.5 s from the moment it lands. (Both rings end together, when the game resolves the spell; Alice's card lands sooner, so her ring runs longer, about 3.5 s. The 2.5 s is the least any seat sees.)
2. **A creature nobody can answer.** Alice casts Grizzly Bears: it flies to the stack, rests 2.5 s with the ring, then glides from the stack to its place on the battlefield. Never straight from the big card to the table any more.
3. **Three upkeep triggers** (canvas "Several triggers in a row", option B). Phyrexian Arena, Bitterblossom and Sulfuric Vortex trigger in Alice's upkeep and nobody can answer. They rise to the stack; the top one rests the full 2.5 s and resolves; the next rests about 0.8 s, then the last about 0.8 s. A dozen Soul Warden triggers take about 12 s, not 30.
4. **When someone can answer, nothing changes.** If Bob holds Counterspell with the mana up, he is asked as today (no ring, no timer: the question holds it). If Alice could respond to her own spell, she gets "Resolves in 5" as today. Either way the spell already showed, so it does not rest again afterwards.
5. **Not on the stack, no rest:** land drops, mana abilities, special actions (Forge never puts them on the stack).
6. **"Let it all resolve"** (spec 0043): skips the rests. Decision default — the owner can change it.

## Changes

### Worker

- **`StackRests`** (new, beside `PriorityStops`, owned by `GameHost` as `stops()` is). It decides, at a priority pass the worker makes for a seat (the `shouldAsk == false` branch of `chooseSpellAbilityToPlay`, and the two `byId.isEmpty()` passes), whether this pass is **the one that will let the top of the stack resolve with nobody having been asked about it**:
  - the stack is not empty; at least one seat follows the stops rule (`PriorityStops.active`); no seat is answering "Let it all resolve";
  - every other seat has passed since the current top was put on (the builder reads Forge's own record of who passed if `PhaseHandler` exposes it, else counts passes per top-of-stack id in `StackRests`; reset when the top changes);
  - no seat was asked anything (a priority question, a response window, or any decision) while this object was on top;
  - this object has not already rested.
  Then it publishes the boards with the rest marked (`GameHost.publishSnapshots`) and sleeps on the game thread, as `STEP_PAUSE_MS` does: `ARRIVE_MS + REST_MS` for the first rest in a run, `REST_NEXT_MS` for a rest that follows another rest with no question asked between them and the stack never empty between (a run). Decision default (owner may change): a trigger that a resolution puts on the stack (an ETB) counts as "in a row".
  - `REST_MS = 2500`, `REST_NEXT_MS = 800` (owner's numbers).
  - `ARRIVE_MS`: time for the stack entry to reach the stack on the slowest seat, so each seat's ring runs at least 2.5 s after its card lands: **2000 for a spell** cast from a hidden zone (the other player's flip 420 + face-up 650 + flight 560 = 1630 today, 1875 after 0106's 1.25× pace on movement; 2000 covers both) and **700 for an ability or trigger** (`RISE_MS` 520, 650 after 0106). These are presentation allowances held in the worker; the page tests below pin the page's arrivals to them. A copy or a free cast that is already on the stack when it appears (spec 0081) uses the ability value.
  - Interrupted (the match stopping, a concede): the sleep ends at once, as `STEP_PAUSE_MS`'s does.
- **The board says it is resting.** The resting stack entry carries `rest: { ms, arriveMs }` (`ms` = the sleep, `arriveMs` = the allowance it includes) in every seat's snapshot. Nothing else: no "nobody can answer" reason (each seat already knows it was not asked; see Risks).
- **Not changed:** `PriorityStops.shouldAsk` (who is asked), `offerResponseWindow`, `STEP_PAUSE_MS`, Forge's resolution. A Lab game with no seat on the stops rule never rests (`check-*` scripts driving the worker directly are unaffected).

### Protocol

`protocol/README.md`, `match.ts`: the stack entry's `rest` (`ms`, `arriveMs`), presentation only (PROTO-007: a missing `rest` costs the ring, never the game).

### Server

None (it relays boards as they come).

### Page

- **The ring.** `Board.tsx` / the stack card: while a stack entry has `rest`, the `gs-coin-timer` dial (no words, `aria-hidden`, not clickable, no pause sign) sits on the stack card's corner and empties from the moment that card has landed on this screen until `ms` after the board arrived. It is a CSS animation with that duration; the stack card leaves when the next board (the resolution) arrives, never on a page timer, so the screen cannot run ahead of the game (ARCH-003). The act line says "Resolving · nobody can answer" (the canvas's words; the act button's own text, not a notice).
- **The caster's card always flies to the stack.** `CastingCard.tsx`'s fade-where-it-stands and `GameScreen.tsx`'s `flyingOnto` / `landingChoice` (straight to the battlefield) are kept only as the fallback when the board shows the spell already resolved; with a rest it never is. A permanent then arrives from the stack card (the existing `fromStack` glide).
- **The side finding: the other player's hold.** `GameScreen.tsx` `HOLD_MS` (1500) becomes derived from the flight it must cover: `FLIP_MS + HOLD_MS + FLY_MS` (`CastingCard.tsx`, with 0106's pace when it lands) plus a landing beat of 250 ms, never a fixed number shorter than the flight. With the worker's rest it only matters for a board that arrives without one (a Lab game, "Let it all resolve").
- `SPELL_WAIT_MS` (4000, a safety limit) must exceed the longest rest a page may see (`ARRIVE_MS + REST_MS` = 4500): raise it to 6000, or derive it from `rest.ms` + 1500 when a rest is present.

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0105-A | Worker: Victim of Night with stops on and nobody able to answer: one board shows it on the stack with `rest.ms` = 4500; the resolution's board comes no sooner than 4500 ms after it (measured on the trace's timestamps, RUN); with stops off, no rest and no gap (unchanged) | new Lab `check-stack-rests.py`, scenario `victim-unanswered`, 3 runs |
| F-0105-B | Worker: Bob holds Counterspell with mana: asked as today, no `rest`; he passes: no rest after (it showed). Alice's response window ("Resolves in 5") runs out: no rest after | `check-stack-rests.py` `answerable`, `own-window` |
| F-0105-C | Worker: three upkeep triggers: first `rest.ms` = 3200 (700 + 2500), then 800, 800; "Let it all resolve" clicked: no rests | `check-stack-rests.py` `three-triggers`, `let-it-all-resolve` |
| F-0105-D | Worker: a land drop and a mana ability: no rest | `check-stack-rests.py` `no-stack` |
| F-0105-E | Page: a real snapshot with `rest`: the ring appears when the stack card has landed and its animation duration is `ms` minus this seat's arrival; the stack card stays until the next board, whatever the clock does (advance fake timers past `ms`: still there) | `fixes0105screen.test.tsx` (real game screen, TEST-003) |
| F-0105-F | Page: the arrivals fit the worker's allowances: the other player's spell (`FLIP_MS + HOLD_MS + FLY_MS` with pace) ≤ 2000, a trigger's rise ≤ 700; `GameScreen`'s hold ≥ the flight it covers | `fixes0105.test.ts` (constants; re-run by 0106) |
| F-0105-G | Page: a permanent spell with a rest flies to the stack, then glides from the stack card's box to its place; never fades in place | `fixes0105screen.test.tsx` |
| F-0105-H | Hidden information (below) | `check-hidden-tops.py` over the new traces |
| F-0105-I | Real game (TEST-012), below | `match-stack-rests.spec.ts` |

**TEST-004 (bites):** one per row: the rest removed (A fails), the "someone was asked" guard removed (B fails), the run rule removed (C fails), the page's ring on a timer instead of the next board (E fails).

**Real-click game (TEST-012).** 0098's exact deal: the host **really casts** a creature the guest cannot answer (a real click on the hand card, clamped with `hitPoint`) and pays; both pages show the stack card with the ring; the test then waits for the creature on the battlefield and checks, from the page's own record (a `performance.now()` stamp the page writes when the stack card appears and when it leaves, read at the end), that it stayed on the stack at least 2.5 s on the guest's page after landing. No frame-exact assertion: the claim is "at least", which CI's slower frames cannot break. Then the guest casts an instant the host can answer and the host is asked (no ring). Clip: one normal-speed clip per seat (the arrivals differ).

## Risks

- **Hidden information (HID-005).** The ring tells the caster that the other player was not asked, i.e. had nothing they could do. That is the same fact today's timing already shows (an unanswered spell resolves at once; an answerable one waits for the other player: spec 0035's stops rule, approved), and the canvas's act line says it in words; nothing new about the hand is sent. `rest` carries no card, no reason and no seat. The rest's length is the same for every unanswered object of a kind, so it does not vary with what the other player holds. Check with `check-hidden-tops.py` that `rest` frames carry nothing else.
- **Games get longer.** About 4.5 s per unanswered spell (3.2 s per unanswered ability or trigger, 0.8 s in a run). Research A estimated 30-60 such moments a game: 1-3 extra minutes. BENCHMARK this on the real-click game before release (EVID-005) and put the number in As built.
- **e2e timing.** Every browser spec that waits for a spell to resolve may now wait up to 4.5 s longer. Grep `frontend/e2e` for expect timeouts of 10 s or less that follow a cast, a trigger or an activation (`timeout: 5_000` and friends; `lifeSettled`, `castCentre`, `clickNow` in `match-helpers.ts`) and give them at least 10 s headroom over the rest. `match-stops.spec.ts` and `match-speed.spec.ts` (its "cast" moment: the page's work per second during the rest should fall, not rise; `SPEED_BUDGETS` unchanged). The whole browser suite runs in CI on the pushed commit (TEST-013); record any new flake in ROADMAP's flake list.
- **The jump check.** `check-jumps.py` replays recorded boards and waits for the page to settle (`jumps.spec.ts` `settled`, 12 s, hold timers under `HOLD_MAX` 3 s): the ring is a finite CSS animation (waited for) and the stack card leaves on the next board, so a replay simply shows a shorter ring. Run it once over the new traces: no new jumps.
- **Speed budgets.** No per-frame work added beyond one CSS animation on one card.
- **Lab.** Scenarios with the stops rule on now take longer; their timeouts may need raising (the Lab runs with stops off mostly; the builder greps `follow(` in the Lab scripts).

## Build order notes

Second (0104 → 0105 → 0106 → 0107). Built before 0106 on purpose: 0106 then scales the arrivals this spec pins (F-0105-F) and must stay within `ARRIVE_MS` (2000 / 700 were chosen to cover 1.25×). Inside: worker `StackRests` and its Lab script first (the rest is visible in traces with no page change: the old page simply shows the spell on the stack longer), then `rest` on the wire, then the ring, then the caster's flight and the derived hold, then e2e timeouts, then the real-click game.

## As built

Built 2026-11-19 on 8263532a (main moved to 78085afa during the build; uncommitted at hand-over).

### Worker

- **`StackRests`** (new, `forge-worker` `game/StackRests.java`; owned by `GameHost` as `GameHost.rests()`, beside `stops()`). Forge's own record of who has passed (`PhaseHandler.pFirstPriority`) is private with no getter, so the passes are counted here per top-of-stack instance id (`StackRests.see` resets them when the top changes; `StackRests.acted` when a seat plays anything, as Forge does, CR 117.3c). `StackRests.passing(seat, entry, players, flies)` returns the rest when this pass completes every player's pass, at least one seat follows the stops rule (`PriorityStops.active`, handed in as a supplier), nobody was asked anything while the entry was on top (`StackRests.asked`, called from `GameHost.publishDecision`, the funnel every question goes through) and the entry has not rested before. Constants: `REST_MS` 2500, `REST_NEXT_MS` 800, `ARRIVE_SPELL_MS` 3400 (Amendment 2; 3100 at Amendment 1; 2000 as first built), `ARRIVE_ABILITY_MS` 700. A run: `inRun` holds after a rest until a question is asked or the stack is seen empty; an ETB trigger put on by a resolution counts as in a row (decision default). `StackRests.flies`: a spell that is not a copy (`Card.isCopiedSpell`, `Copies.isCastCopy`) gets the spell allowance; a copy, ability or trigger the ability one. A free cast (spec 0081) gets the spell allowance (it rises from the hand like a cast), so it rests longer, never shorter.
- **Where it is called.** `MatchController.chooseSpellAbilityToPlay`: the `shouldAsk == false` branch and the `byId.isEmpty()` pass both call `GameHost.restBeforePass(seat)` (and `showTheirStack` only when it did not rest); an asked priority question answered with a pass calls `GameHost.passedWhenAsked` (counted as Forge counts it, never rested on); a chosen action calls `StackRests.acted`. `GameHost.restBeforePass` marks the rest (`StackRests.show`), publishes every seat's board (`GameHost.publishSnapshots`, which calls `StackRests.mark` for each seat and for the public view), then waits on the game thread (`StackRests.sleep`): it polls every 20 ms, runs the decision gate's pending interjections (`DecisionGate.interjectionsNow`, new) so a concession made during a rest runs at once and ends it, ends when the game is over, and `GameHost.stop` wakes it (`StackRests.wake`). The second `byId.isEmpty()` named in the spec is the discard question's (`chooseCardsToDiscardToMaximumHandSize`), not a priority pass: untouched.
- **"Let it all resolve" (spec 0043)** is the page passing each priority question while the stack holds what it held; each of those passes answers a question, so `StackRests.asked` already keeps every one of those objects from resting. No new wire field was needed (the Lab's `let-it-all-resolve` shows it; the case where the player who clicked it is no longer asked is a normal unanswered object and rests).
- Not changed: `PriorityStops.shouldAsk`, `offerResponseWindow`, `STEP_PAUSE_MS`, Forge's resolution. A game with no seat on the stops rule never rests (`check-stack-rests` `victim-stops-off`).

### Protocol and server

`protocol/README.md` `stack[]`: `rest {ms, arriveMs}` on the top entry, every seat's board and the public view; `MATCH_PROTOCOL.md` (priority stops paragraph). `match.ts`: `StackEntry.rest`, `StackRest`, `asRest` (a malformed rest is no rest). Server: none (it relays boards as they come; `MatchArt` passes stack entries through).

### Page

- **The ring.** `Board.tsx`: `StackView.rest` (from `fromSnapshot.ts`); `Board` `restRing` gives the top entry's ring length once its card has landed here (`stackWaiting` false): `rest.ms` less the time from the board that said it (`restSeen`) to the landing (`restLanded`). The ring is `bf-stack-rest gs-coin-timer` with the `gs-coin-dial` / `gs-coin-ring` circle (`battlefield.css` `.bf-stack-rest`, `bf-stack-rest-drain`; `aria-hidden`, no words, no pause sign, not a button), placed by `REST_RING`, `REST_RING_X`, `REST_RING_Y` (the canvas's 54 px on a 293 x 410 card, 36 px in, 29 px up). Only the top entry wears it. The stack card leaves with the next board, never on a timer. The page's own record for the real-click game: `stackRestRecord` (`window.__proxicStackRests`, `StackRestSeen`).
- **The act line.** `stops.ts` `waitingLine(..., resting)` says "One moment · Resolving · nobody can answer" (`RESTING_WORDS`) when the top rests and its card is no longer under its flight (`GameScreen.tsx` passes `resting` to `Rail`). It wraps (`game.css` `.gs-waiting .gs-waiting-sub`, 78085afa).
- **The caster's card flies to the stack.** No code change was needed: `CastingFlight` reads its destination when it sets off, and with a rest the spell is on the stack for seconds then, so it always goes there; the `landing` / `flyingOnto` path stays as the fallback for a board that missed the stack. The permanent then comes out of the stack card (`Board.tsx` arrival glide, `fromStack`).
- **The other player's hold.** `GameScreen.tsx` `THEIR_SPELL_HOLD_MS` = `FLIP_MS` + `HOLD_MS` + `FLY_MS` (`CastingCard.tsx`) + `LANDING_BEAT_MS` (250) = 1880 ms (was the fixed `HOLD_MS` 1500). Three older page tests that advanced a fixed 1600 ms past the hold now advance `THEIR_SPELL_HOLD_MS + 100` (`fixes0064.test.tsx`, `fixes0082.test.tsx` `wait`, `fixes0102screen.test.tsx`).
- `Board.tsx` `SPELL_WAIT_MS` 6000 (was 4000; it outlasts the 5600 ms spell rest; 6500 since Amendment 2, over the 5900 ms rest). `Board.tsx` `LANDED_FADE_MS` (176) names the landed stack card's fade, which F-0105-F counts.

### e2e timing (Risks)

Grepped `frontend/e2e` for expect timeouts of 10 s or less after a cast, trigger or activation: the short ones wait for clicks, windows, a response window's own countdown (asked, so no rest) or a beam after the report already arrived (resolved); `lifeSettled` waits 90 s and `clickNow` only clicks. None needed raising. The whole browser suite runs in CI on the pushed commit (TEST-013).

### CONFLICT (PHASE-003), resolved by Amendment 1: the spell allowance was shorter than the real arrival

- **Requirement.** "`ARRIVE_MS` ... 2000 for a spell ... so each seat's ring runs at least 2.5 s after its card lands"; F-0105-I: "it stayed on the stack at least 2.5 s on the guest's page after landing".
- **Observed reality (RUN, `match-stack-rests.spec.ts`, 2026-11-19, seven runs at 2000).** From the board that says the Goblin rests to the moment its card has landed: host (caster) 1830-1900 ms, guest 2495-2553 ms. On the stack after landing: host 2621-2687 ms, guest 1967-2022 ms.
- **Evidence (SOURCE).** Before the guest's card turns over, the page waits for the caster's mana balls to land (`GameScreen.tsx` `lingering`, `manaBalls.tsx` `BALL_MS` 620, spec 0066 item 1), then the flip, hold and flight (1630 ms) and the landing fade (`Board.tsx` `LANDED_FADE_MS`, 176 ms). The spec's allowance counted the flip, hold and flight only.
- **Resolved.** The owner chose option A (Amendment 1): `ARRIVE_SPELL_MS` 3100. Built and measured below.

### Tests and evidence

- **Worker unit:** `StackRestsTest` (the owner's numbers, which pass rests, asked guard, runs, `acted`, no stops / empty stack, `mark` says only `ms`/`arriveMs`, waking and game-over end a rest). `mvn -q -o test`: 228 tests, 0 failures.
- **Lab:** `scripts/check-stack-rests.py` (F-0105-A to D: `victim-unanswered`, `victim-stops-off`, `answerable`, `own-window`, `three-triggers`, `let-it-all-resolve`, `no-stack`), in CI's Lab list. RUN x3 on the Amendment 1 jar: every scenario OK each time; Victim of Night rested `{ms: 5600, arriveMs: 3100}` on both boards and resolved 5612-5621 ms after the rest board; with stops off no rest, gone 13-26 ms after it showed; three upkeep triggers rested 3200, 800, 800 (3211-3221 and 801-807 ms apart). (At 2000, before the amendment, the same three runs passed with 4500 / 4510-4519 ms.) `scripts/lab.py` now stamps every trace line with `t` (ms) for such timings.
- **Hidden information (F-0105-H):** `check-hidden-tops.py` gained the rests rule (`rest_problems`: `{ms, arriveMs}` only, top only, the same on every seat's board) and its self-test cases; run with CI's other hidden checks (`check-snapshot-first`, `check-hidden-hands`, `check-hidden-log`, `check-kinds`, `check-hidden-mulligans`) over the new traces plus `check-stops`, `check-thrown-away`, `check-many-triggers`, `check-copies`, `check-board-data`, `check-spell-choices` traces: all exit 0 (112 rest boards checked on the Amendment 1 worker; `check-stops` 149 s of its 300 s). Its bite: a rest carrying a `seat` fails it (worker mutation W8).
- **Existing Lab scripts touching the stack** (`check-stops`, `check-thrown-away`, `check-many-triggers`, `check-copies`, `check-board-data`, `check-spell-choices`): all OK; `check-stops` took 146 s (300 s limit).
- **Page:** `fixes0105.test.ts` (F-0105-F, reading the worker's constants from `StackRests.java`; since Amendment 1 the other player's arrival is `BALL_MS` + `FLIP_MS` + `HOLD_MS` + `FLY_MS` + `LANDED_FADE_MS` = 2426 ms, within 3100 now and at 0106's 1.25x, 3033), `fixes0105screen.test.tsx` (F-0105-E, F-0105-G, on the real `GameScreen`). Full vitest: 1567 passed.
- **Real-click game (F-0105-I, TEST-012):** `frontend/e2e/match-stack-rests.spec.ts` on the interaction deck, dealt (spec 0098): the host really clicks Raging Goblin (`realClick`, `hitPoint`) and pays; both pages show the ring and "Resolving · nobody can answer"; the Goblin lands; then the guest's Shock asks the host (no ring on either page) and resolves with no rest. It asserts, on each page, that the card stayed at least 2.5 s after landing and the whole 5.6 s rest. Passed 3 of 3 on the Amendment 1 build. Measured ring, i.e. time on the stack after landing: **guest 3088-3119 ms, host 3709-3734 ms** (arrival guest 2497-2526 ms, host 1882-1907 ms). `match-stops.spec.ts` passed.
- **Mutations (TEST-004):** page 13/13 caught (ring on a page timer, ring length ignoring arrival, ring before landing, ring below the top, `rest` not parsed, dropped in `fromSnapshot`, hold back to 1500, `SPELL_WAIT_MS` back to 4000, act line, `resting` prop, page record, arrival glide not from the stack card, caster's flight landing solid). Worker 9/9 (no rest, asked guard removed, run rule removed, `acted` not resetting, `publishDecision` not marking asked, boards not marked, rest not waited, a rest naming a seat, `MatchController` not resting). The first worker pass caught 8/9: removing the asked mark went unseen because asked passes were not counted; `GameHost.passedWhenAsked` now counts them as Forge does, and the guard is the one thing that stops the rest.
- **Jump check** over the seven new traces (`AUDIT_DIR`/`JUMPS_OUT`, `playwright.jumps.config.ts`, then `check-jumps.py`): 325 boards replayed, nothing found; again over the Amendment 1 traces: 329 boards, nothing found.
- **BENCHMARK (EVID-005):** each unanswered spell adds the whole rest the worker waits, 5.6 s since Amendment 1 (measured 5612-5621 ms in the Lab; on both pages of the real-click game the card stayed the whole rest); each unanswered ability or trigger 3.2 s, 0.8 s in a run. In `check-stops`' nine-turn `quiet` bot game (both seats on the stops rule) two objects rested: 9.0 s added to a 21.4 s game at 2000 (2 x 5.6 = 11.2 s at 3100). Research A's 30-60 such moments a real game is an estimate, not re-measured here.

## Amendments

### Amendment 1 (owner 2026-11-19): wait 1 s longer

**Why.** Building 0105, the real-click game measured the other player's card landing on the stack about 2.5 s after the board that says it rests (the caster's mana balls, 0.62 s, land before the flip, hold and flight), against the 2000 ms allowance: their ring ran about 2.0 s, not the owner's 2.5 s (As built, CONFLICT). Owner's choice, option A, "Wait 1 s longer".

**Changes.**
- `ARRIVE_MS` for a spell is **3100** (was 2000): it covers the balls, the flip, hold and flight and the landing fade (2426 ms today, about 3030 at 0106's 1.25x pace). An unanswered spell now rests `rest.ms` = 5600; F-0105-A reads 5600 where it says 4500. Abilities and triggers (700, 3200) and runs (800) are unchanged. `SPELL_WAIT_MS` 6000 still exceeds 5600.
- F-0105-F's sum for the other player's spell is `BALL_MS` + `FLIP_MS` + `HOLD_MS` + `FLY_MS` + the landed card's fade (`LANDED_FADE_MS`), with pace, at most `ARRIVE_SPELL_MS`.
- F-0105-I asserts at least 2.5 s after landing on each page again.
- The caster now sees the ring about 3.7 s (was about 2.65 s; the owner's earlier note accepted about 3.5 s).

*Owner confirmed 2026-11-19: the caster seeing the ring about 3.5 s (the slower seat's 2.5 s) is fine.*

### Amendment 2 (owner 2026-11-20): wait 0.3 s longer

**Why.** CI on 4aa1ecb0 (run 44741449950, match 5/6) failed F-0105-I at `match-stack-rests.spec.ts` "on the guest's page it stayed at least 2.5 s after landing": on a slow runner the other player's card arrived 3150.7 ms after the board that says it rests, past the 3100 ms allowance, and its ring ran 2493.5 ms against the owner's promise of at least 2.5 s on each screen (host: arrival 2603.4 ms, ring 3040.3 ms). The paper arrival, `BALL_MS` + `FLIP_MS` + `HOLD_MS` + `FLY_MS` + `LANDED_FADE_MS` at 0106's pace, is 2870 ms, so Amendment 1 left 230 ms spare. Owner's choice, "Wait 0.3 s longer".

**Changes.**
- `StackRests.ARRIVE_SPELL_MS` is **3400** (was 3100): 530 ms spare over the paper arrival. An unanswered spell rests `rest.ms` = **5900** (was 5600); F-0105-A reads 5900. Abilities and triggers (700, 3200) and runs (800) are unchanged.
- `Board.tsx` `SPELL_WAIT_MS` is 6500 (was 6000): a safety limit 100 ms over the 5900 ms rest was too close; `fixes0105.test.ts` now asks for at least 500 ms over it.
- `fixes0105.test.ts` pins the paper arrival (2870) and the spare (530); `StackRestsTest`, `scripts/check-stack-rests.py`, `fixes0105screen.test.tsx`, `motion.test.ts` (the limits table) and `match-stack-rests.spec.ts` carry the new numbers.
- Each seat's ring runs about 0.3 s longer than it would at 3100.

**Measured (RUN, 2026-11-20, on 4aa1ecb0 plus this change, local :8080 stack rebuilt, headless bundled Chromium).** `check-stack-rests` x3 on the new jar: every scenario OK each time; Victim of Night rested `{ms: 5900, arriveMs: 3400}` on both boards and resolved 5913, 5963, 5950 ms after the rest board; three upkeep triggers still rested 3200, 800, 800. `match-stack-rests.spec.ts` x3, passed 3 of 3: arrival guest 3057.3 / 3096.3 / 3007.8 ms, host 2366.0 / 2435.3 / 2419.3 ms; ring after landing guest 2857.9 / 2816.4 / 2902.0 ms, host 3549.1 / 3478.7 / 3491.9 ms. The guest's local arrival is already about 3.0-3.1 s (over the paper 2870), so at 3100 its ring would have run about 2.5 s even locally.

*Owner note 2026-11-28 (P11-B3; prompt on the canvas `Proxic canvases/stack-rest-slow-screen.html`, Option C, "Leave it"): no Amendment 3.* CI run 45906524872 failed F-0105-I's "on the guest's page it stayed at least 2.5 s after landing": the guest's card arrived 3617 ms after the rest board, past the 3400 ms allowance, and its ring ran 2318 ms. The owner chose to leave the allowance at 3400 ms (`StackRests.java` unchanged): on a very slow computer the rest after landing may be a little short. `match-stack-rests.spec.ts` now checks what the server promises: the full 2.5 s when the card arrived in time, and otherwise what the server's 5900 ms hold leaves, `min(2500, rest.ms - 100 - arrival)` (100 ms for when a board is drawn, so the full 2.5 s is owed up to a 3300 ms arrival). The log line keeps both numbers (arrival and time after landing) for each page.
