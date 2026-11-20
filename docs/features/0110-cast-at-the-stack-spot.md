# 0110 — Cast at the stack spot: the big card waits at its place on the stack while you choose targets and pay

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase.
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

## Amendments

None yet.
