# 0110 — Cast at the stack spot: the big card waits at its place on the stack while you choose targets and pay

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase.
**Built:** 2026-11-20 (commit ab75a81f). **Released:** in 1.75.0, 2026-11-21.
**Owner decisions** (owner feedback batch 2026-11-19b, `Owner feedback 2026-11-19b decisions.md`; canvas `frontend/zz-canvas/feedback-1119b.html`):

- Item 6, canvas section "6", option **A** ("At its stack place through targeting and paying"): **"the card sits at its stack spot, big, through targeting and paying. The rules order stays: targets, then payment."** Option B (stack place for targets, middle for paying) and today's middle were not taken.

- The other player's view (asked 2026-11-20, by prompt): **"Yes, same spot."** Any spell being cast, by either seat, shows at the stack spot; the middle of the table is never covered.
- **Approved 2026-11-20** (owner, by prompt: "Approve all."). Build 0108 → 0115 in that order, one at a time, then release them together as 1.75.0.

Research: `Owner feedback 2026-11-19b research A.md` item 6 (in the working folder; its option letters differ: the owner's A is research A's "B · The stack spot for the whole cast").

## Why (researched)

Read at main 1f813795 (1.74.0).

- **The rules order** (UPSTREAM-DOC CR 601.2; SOURCE Forge). The card moves to the stack (601.2a), modes and X are announced (601.2b), targets are chosen (601.2c), then costs are worked out and paid (601.2f-h). Forge's `PlaySpellAbility` does exactly this: `game.getAction().moveToStack(c, ability)`, then `announceType()` / `announceValuesLikeX()`, then `ability.setupTargets()`, then `payment.payCost(...)`; cancelling rolls it back (`GameActionUtil.rollbackAbility`). "Pay first, then target" cannot be done, and during the whole cast the card **is** in the stack zone, not yet an entry anyone can answer. Nothing in the worker changes.
- **Where the card is today** (SOURCE). `CastingCard.tsx` `CastingCard` (spec 0068, "A · Stay centred, see-through", 2026-11-09) draws it at `stepAside.ts` `castingBox`: the exact middle of the screen, 2.5 times a table card and up to half the screen tall, for every question of the cast (modes, X, targets, payment). The middle is where the two creature rows meet (owner's screenshot 4: Abattoir Ghoul and Makeshift Mauler half covered). It fades to `SEE_THROUGH` (0.14) only while the pointer is over something clickable under it; during payment, spec 0091's step aside (`stepAside.ts` `asideOffset`, `castCoverBox`) slides it off a card being tapped or spent. Once paid, `CastingFlight` flies it from the middle to the stack.
- **History** (SOURCE, the specs): slid aside (removed 2026-11-01 item 4), docked beside the stack (spec 0044, removed by 0068), kept its last spot (spec 0057 item 1, removed by 0068). This spec amends 0068's placement (PHASE-002) and keeps its see-through rule and 0091's step aside.
- **The other player** (SOURCE). Spec 0044 / 0072: the other player sees the card's back rise from the caster's fan (`TheirGlide`) to the middle while it is paid, then it flips (`FLIP_MS`), is held (`HOLD_MS`) and flies to the stack.

## What the player sees

Alice is you (bottom), RudeLeft the other player (canvas "6": the cut-down table plays the whole cast).

1. Alice casts Victim of Night at RudeLeft's Gryff Vanguard. The card leaves her hand and glides straight to its place at the top of the stack column, at today's big size, its cost pips under it. The middle of the table is clear: Gryff Vanguard and the other creatures are uncovered.
2. The target line starts at the card and follows her pointer; she clicks Gryff Vanguard. The line stays on it.
3. She pays {1}{B}{B}, tapping three Swamps. The card stays where it is; its pips fill as she taps.
4. Paid, it settles into the stack (it shrinks into its slot, a short move), aimed at Gryff Vanguard, and resolves as today.
5. With one or three entries already on the stack, the big card sits at the new top place: over the stack's top, not over the table's middle; the entries under it stay readable by pointing (see-through, as today).
6. A spell with modes or X: the card is at the stack spot for those questions too (the whole cast). Cancel at any point: the card goes back to her hand from the stack spot.
7. **RudeLeft casts at Alice's creature** (owner 2026-11-20, "Yes, same spot"): on Alice's screen the card's back rises from RudeLeft's hand to the same stack spot, waits there while he pays, flips face up there, and settles into the stack. Alice's table middle is never covered.

## Changes

### Page

- **The place.** A new `stepAside.ts` box (say `castingStackBox(g, stack)`) replaces `castingBox` for the caster: the stack's next slot (where `CastingFlight` lands today), the card scaled to today's casting size and kept inside the play area at 1920x1080 and above (UI-006): it may grow left from the stack column, never off the screen's right edge, never under the act panel or the turn rail. From the board's geometry and stack count only (UI-003: a pure function of state and viewport).
- **One place for the whole cast.** `CastingCard` uses the new box for every question of the cast (modes, X, targets, payment), keyed on the board's `casting` entry, never on the decision's prompt (PROTO-006).
- **Kept:** the see-through rule (`SEE_THROUGH`, spec 0068 item 2) for anything clickable under it (a stack entry, a creature at the row's right end); spec 0091's step aside, now tested against the new box (`castCoverBox` follows the card); the pay pips (spec 0058) under the card.
- **The aim line** (`AimPointer.tsx`): starts from the card at the stack spot.
- **The finish** (`CastingFlight`): from the stack spot to the slot, the short settle; the hand-to-spot glide at the start replaces today's hand-to-middle.
- **Cancel:** the card returns to the hand from the stack spot (today's return, a new start point).
- **The other player** (owner 2026-11-20, "Yes, same spot"): the other player's spell (and a spectator's view of either seat's) rises from its `TheirGlide` start to the same stack box instead of the middle, shows its back there while it is paid, flips (`FLIP_MS`) and is held (`HOLD_MS`) there, then settles into its slot. Spec 0044's back and flip and spec 0072's glide stay; only their place changes (amends both).
- `docs/architecture/BATTLEFIELD_LAYOUT_CONTRACT.md`: the casting card's place is the stack's next slot at casting size (spec 0110), replacing the middle (spec 0068).

### Worker, server, protocol

None. Forge's order is unchanged (ARCH-002, FORGE-RULE).

## Rules and boundaries

- **FORGE-RULE / ARCH-002:** the order of questions is Forge's; the page only moves where the card is drawn. **UI-002:** every question of the cast stays reachable; nothing under the card is unclickable (see-through and pointer-through as today).
- **HID-005:** the other player still sees only the card's back until it is committed (spec 0044); moving the back to the stack spot changes where it is drawn, not when its face is shown. The timing of the rise and the flip is unchanged, so it tells nothing new.
- **UI-006:** measured at 1920x1080 full screen, about 1920x947 in a window, 2560x1440 and 3840x2160.
- **The jump check** (Phase 10 P10-R1): the card's glide to the stack spot and its settle must not jump; `tools/jumps` over the real-click game's traces.
- **Speed budgets:** `match-speed.spec.ts` cast budget unchanged; the move is shorter, not longer.

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0110-A | Page: `castingStackBox` at 1920x1080, 1920x947, 2560x1440, 3840x2160 with 0, 1, 3 and 9 stack entries: inside the play area, not over the act panel or rail, its centre on the stack column side of the table, and not over the middle of the table (the creature rows' meeting line) (TEST-007: each size really changes the box; TEST-008: counts) | `stepAside.test.ts` (new) |
| F-0110-B | Page: from a real Lab board, a cast through a mode question, a target question and payment: the card is at the stack box for each, the aim line starts at it, the step aside still fires when a card under it is tapped | `fixes0110screen.test.tsx` (the real game screen, TEST-003) |
| F-0110-C | Page: see-through still works at the new place (a stack entry pointed at under it fades the card); a click on a creature that used to be under the middle card answers the target question | `fixes0110screen.test.tsx` |
| F-0110-D | Page: spec 0109's short target window (F-0109-A) still beside the card and not over it at the new place | `fixes0110screen.test.tsx` re-runs F-0109-A's case |
| F-0110-G | Page: the other player's cast from a real Lab board (and a spectator's): the back, the flip and the hold are at the stack box, never `castingBox`; the face is not drawn before the commit, as today (spec 0044) | `fixes0110screen.test.tsx` |
| F-0110-E | Browser: no jump, pop-in or unseen move in the cast (hand → stack spot → slot) and in a cancel (stack spot → hand) | `frontend/tools/jumps/jumps.spec.ts` + `check-jumps.py` over the real-click game's traces |
| F-0110-F | Real-click game (TEST-012), below | `match-cast-at-stack.spec.ts` |

**TEST-004 (bites):** the caster's box back to `castingBox` (A, B fail); the aim line from the middle (B fails); the step aside measured against the old box (B fails); the other player's back left in the middle (G fails); a box that overflows the right edge at 1920x947 (A fails). About eight page mutations.

**Real-click game (TEST-012).** Spec 0098's exact deal: the guest has Gryff Vanguard where the old middle card covered it at 1920x1080. The host **really clicks** Victim of Night in hand; the test asserts the casting card's box is at the stack column (its centre right of the table's centre) and that Gryff Vanguard's box is not covered; the host **really clicks** Gryff Vanguard (`realClick`, the click point inside the visible card), then really clicks three Swamps; the card settles into the stack and resolves; Gryff Vanguard goes to the graveyard. Second cast with one entry already on the stack (the guest's trigger, or the host's own instant in response): the card sits at the next slot. Waits on states (the question present, the stack count, the graveyard count). On the guest's page, during each of the host's casts, the casting back is at the stack column and not over the table's middle. Clip: one normal-speed clip per seat (the guest's view changes too).

## Out of scope

- Moving the card for anything that is not a spell being cast (triggers and abilities have no big card).
- Changing the cast's order or the questions (Forge's).

## Open questions

None. The other player's view was answered 2026-11-20: the same spot (Owner decisions).

## Build order notes

After 0109 (it re-runs 0109's short window at the new place). Inside: the box and its geometry tests first, then `CastingCard` / `AimPointer` / `CastingFlight` / the step aside, then the jump check, then the real-click game.

## As built (2026-11-20)

Built on main at 757d7549, not committed. Labels: SOURCE (read in the code), RUN (run here, this build).

### The place (page)

- **The box.** `stepAside.ts` `castingStackBox(g, stack)` replaces spec 0068's `castingBox` (removed; nothing draws the middle any more). It is the front box of `effects.ts` `stackSpotBoxes(g, stack + 1, STACK_SCALE)` (the stack's next slot, where a cast spell lands) at spec 0068's casting size (2.5 table cards, at most half the window): the slot's right edge and middle, growing left from the stack column; kept under the turn track (the top tenth), its cost pips (66 px) above the hand, never right of the play area, so never under the rail (the act panel and the turn rail are in it). A pure function of the board's size and the stack's count (UI-003). At 1920x1080: x 1386-1630 and y 369 (empty stack), 390 (one entry), 431 (three), 554 (nine); the table's middle (x 819) is clear. `BATTLEFIELD_LAYOUT_CONTRACT.md` §7e records it.
- **The count.** `GameScreen.tsx` `stackUnder(board, card)`: the stack's entries other than this card's own spell (it is there once cast, while it lingers for its balls and settles), so the place is one slot from the hand to the stack. Keyed on the board's `casting` entry (or spec 0044's optional-cost card in hand, spec 0081's free cast), never the question (PROTO-006).
- **Both seats, one place.** `CastingCard.tsx` `CastingCard` and `CastingFlight` take the box as a prop (`box`); `GameScreen.tsx` passes `castingStackBox(geometry, stackUnder(board, ...))` to the card, to the flight (cast, the other player's reveal) and to the other player's cancelled back (`theirBack`). So the other player's card (and a spectator's view of either seat's) rises with spec 0072's Glide to the same place, shows its back there while paid, flips (`FLIP_MS`) and is held (`HOLD_MS`) there; nothing about when its face is drawn changed (HID-005).
- **The settle.** `CastingFlight`: into a stack slot it is a straight two-keyframe move from its place (shrinking or growing into the slot, fading to 0.35 as before), the same `FLY_MS`; spec 0042's arc (lift, tilt, 0.75 mid-scale) is kept only for a spell already on the battlefield (`landing`). Cancelled, it flies back to the hand from its place.
- **The aim line.** `GameScreen.tsx`'s `AimPointer` `from`: the casting card's `castingStackBox`.
- **The step aside (spec 0091).** `stepAside.ts` `castCoverBox(card)` and `asideOffset(g, card, acting)` now take the casting card's box; GameScreen passes the place, and `Board.tsx` gets the count (`castCover`, now `number | null`) and builds the same box for its ghosts' wait. `asideOffset` keeps its little sideways step (0.2 of the card's width) inside the play area: at the stack column there is no room on the right (the rail), so a step that would go right goes left instead. Since only the right-hand end of a line is under the card now, and identical cards stack, the step fires only with a long line of different cards (or a tall stack).
- **See-through (spec 0068 item 2).** `CastingCard.tsx` `CHOOSABLE` also counts a stack entry (`[data-zone="stack"]`): the card sits over the stack's top entries, which stay readable by pointing.
- **The question window.** `GameScreen.tsx` `castingWindowAnchor`: left of the card (its right is the stack), else above it (`GameWindow.tsx` `anchorByCard`'s new `orAbove`, which may reach over the stack column, never over its top card), else left as before.
- **Modes (RUN, finding).** In the Lab game cut for the tests (`check-modes.py` `escalate`, Collective Brutality) the mode questions come while the board still has the card in the hand: there is no `casting` entry until the modes are chosen, so no big card is drawn for them, as before this spec (spec 0068's "every question" never covered modes). Targets and payment have it. See "For the owner".

### Tests and runs

- **F-0110-A (RUN):** new `stepAside.test.ts`: `castingStackBox` at 1920x1080, 1920x947, 2560x1440 and 3840x2160 with 0, 1, 3 and 9 entries (16 cases): casting size, inside the play area and never right of it (the rail), under the turn track, pips above the hand, the next slot's right edge (and middle where it fits), its centre and its whole box right of the table's middle; each size gives a different box (TEST-007), each count moves it down the column, never sideways (TEST-008); a 60-entry stack still inside. Also the cover follows the card, and the step aside stays in the play area and still steps sideways (left, at the column).
- **F-0110-B, C, D, G (RUN):** new `fixes0110screen.test.tsx`, the real game screen fed the frames the worker sent each seat in a Lab game (`check-modes.py` `escalate`, cut into `fixes0110.round.json`; TEST-003): (B) no big card for the mode questions (no `casting` entry yet), then at `castingStackBox` for both target questions, both payments and the discard, the aim line's start on the card's own edge there, and the settle a straight move from there; the step aside fires for an Elf added at the end of Alice's line, up and never into the rail; (C) with one entry on the stack the card is at the next slot, pointing at the entry under it fades it, and a click on Bob's Grizzly Bears (alone in its line: where the old middle card was) answers the target; (D) F-0109-A's case (Victim of Night): one short line, the window left of the card, not over it; (G) Bob's board and a spectator's (Bob's board turned into one: `spectator`, `viewFrom`, no hand): the back rises to `castingStackBox`, stays there through every payment with no face drawn, then flips and is held there for `FLIP_MS + HOLD_MS` before it moves.
- **Changed claims, citing 0110 (RUN):** `fixes0068.test.tsx` (its one place is the stack's next slot; the window goes above the card when its left would hide a creature; the reveal is held there), `fixes0091.test.tsx` (each board puts a dozen permanents first so the acting cards are at the line's right end, under the card; the cut-short step's flight is a straight settle; new: with nine entries the card waits lower, so what it covers follows the stack), `fixes0057.test.tsx` (the flight back starts at the place), rise-start helpers measured from the card's place instead of the window's middle in `fixes0083screen`, `fixes0087screen`, `fixes0088screen`, `fixes0099screen`; `CastingCard.test.ts` F-0068-A removed (proven by F-0110-A); `fixes0058`/`fixes0062` pass a fixed box (they test pips).
- **Real-click game F-0110-F (TEST-012; RUN):** new `e2e/match-cast-at-stack.spec.ts`, deck `protocol/fixtures/cast-at-stack-deck` (built in CI), dealt (spec 0098). The host really clicks Victim of Night: its card's box is x 1386-1630, y 369-710 (its centre right of the table's centre, x 819; off it), Gryff Vanguard (in the middle, where the old card covered it) 0% covered; the guest sees the back at the same box. The host really clicks Gryff Vanguard and really clicks two Swamps: the card never moved (to the pixel). With Victim of Night on the stack the host really clicks Disfigure: its card at y 390 (the next slot), its right edge on the entry's (x 1630), lower than the entry it waits over; the guest's back there too. Elite Vanguard aimed and paid by real clicks; both resolve, both creatures in the guest's graveyard. Three passes in a row on the final code (1.3, 1.2, 1.3 minutes), each filmed from both seats. Getting there (test-side): Forge's Gryff Vanguard is blue (the deal gives the guest Islands) and Victim of Night costs {B}{B} (two Swamps, not the spec's three); a hand card's text starts with its cost's digits (no `^` on names); identical lands stack (pile-aware counts); a stale local deck of the same name had to be deleted once.
- **The stack rest (spec 0105; RUN):** `match-stack-rests` on the final code: Raging Goblin's card stayed on the stack after landing for **3628.5 ms on the host's page and 2998.1 ms on the guest's** (at least 2500 promised), arriving 2286.9 ms and 2916.6 ms after the rest board; the promise holds. The settle keeps `FLY_MS`, so the timing is unchanged.
- **Existing browser specs (RUN, headless bundled Chromium):** `match-casting-dock` (claims changed, citing 0110: at its stack spot for a target; the reveal held there; read with `castCentre`, which now measures from `castingStackBox`, and the reveal read as soon as it turns, no fixed wait), `match-cast-aside` (claims changed likewise; the fixed 700 ms wait replaced by polling `castRisen`, now in `match-helpers.ts`, or the card gone; the resize polled; no Elf was ever under the card in its game: covered 0), `match-cast-step-aside` (rewritten as a dealt game, below), `match-cast-landing`, `match-stack-rests`, `match-spell-choices`, `match-quiet-windows`, `battlefield.spec`, `bench-scenes`: all pass.
- **`match-cast-step-aside` (spec 0091's real-click game):** with the card at the stack spot only a line's right-hand end is under it, and identical cards stack, so the landing deck's game never had an Elf there. It is now dealt from a new `protocol/fixtures/step-aside-deck` (thirteen different cheap green creatures, Llanowar Elves last, then Craw Wurm; built in CI): the payer really clicks the covered Elf through the card; the card went up 244 px and 49 px sideways (left: no room on the right) for 73 frames and came back; on the other seat the back went down 178 px. Passed on the final code (3.1 minutes). Its fixed 700 ms wait is a poll too.
- **Mutations (TEST-004; RUN): 12 of 12 page mutations caught**, each against `stepAside.test.ts`, `fixes0110screen.test.tsx`, `fixes0091.test.tsx`, `fixes0068.test.tsx`: the caster's box back to the middle; the aim line from the middle; the step aside measured against the old box; the other player's back left in the middle; a box over the right edge at 1920x947; the count including its own spell; see-through ignoring a stack entry; the settle arcing again; no window above the card; the step into the rail; the other player's face drawn before the commit (HID-005's guard: F-0110-G and F-0068-C fail); the board's cover ignoring the stack count (caught once the nine-entry case was added: the first run did not catch it). No worker code changed: no worker mutations.
- **Jump check (RUN, headless bundled Chromium, nothing else running):** `frontend/tools/jumps` over seventeen fresh Lab traces of the final worker that cast spells: `check-stack-rests` (all seven), `check-spell-choices` `kicked`, `spellskite`, `evoke`, `check-modes` `escalate`, `cryptic`, `check-game-flow` `bolt`, `check-mana-balls` `nekrataal`, `convoke`, and `check-take-backs` `recast`, `retarget` (casts cancelled at payment and at the target question: the card back to the hand from the stack spot) -- 34 seat replays, 866 boards, among them 44 casts from the hand, 84 settles onto the stack and 4 cancels (both seats); `scripts/check-jumps.py`: no jump, pop-in, blink or unseen move (exit 0). The page code under it was the final one (the jump recording ran on the rebuilt stack).
- **Gates (RUN):** frontend `tsc -b`, `eslint . --max-warnings=0`, `prettier --check src e2e tools`, vitest (117 files, 1642 tests); `python -I scripts/check-doc-refs.py`.
- **Clips and stills** (scratchpad, not committed): one normal-speed clip per seat of each of the three final passes; stills of each step from both seats, read.
- **ci.yml:** the cast-at-stack and step-aside deck packages built for the browser job.
- **Not run here:** CI's full Lab and full browser suite (TEST-013 2); worker and server gates (not touched).

### For the owner

- **Modes (RUN):** a modal spell's mode questions come before the game lists the card as being cast (it is still in the hand on the board), so no big card shows for them, now or before this spec. The spec's "the card is at the stack spot for those questions too" holds for every question asked while the card is being cast (targets, X if asked then, payment, extra costs); the modes would need the worker to send the card as being cast earlier. Not changed here.
- **The other player's view over a readable stack:** when the other player casts in response, the readable stack card (spec W-20, three table cards tall, shown while you are not asked anything) is bigger than the back, which sits over its lower part until it settles. Seen in the stills; the spec does not ask for a change.
- **The spec's numbers:** Forge's Victim of Night costs {B}{B} (two Swamps), and Gryff Vanguard is blue; the game was built to Forge's cards.

### Decided while owner away, to review (2026-11-20)

- **Modes:** left as built. A modal spell's mode questions show no big card, as before this spec. Showing it would need the game to send the card as being cast before the modes are picked, which is a separate change. To reverse: a later spec for that change.
- **The other player's view over a readable stack:** left as built. The back covers the lower part of the readable stack card for a moment, until it settles into the stack. To reverse: a later spec that moves the back or shrinks the readable card while a back is held.

## Amendments

None yet.
