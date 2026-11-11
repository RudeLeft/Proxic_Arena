# 0066 — Arrows that arrive with their card and arc softly; crossed swords; no "Died"

**Status:** Approved 2026-11-08 (owner, on the canvas "arrows-1108", sent as a file; items 5 and 6 in chat)
**Owner decisions:** spell and ability arrows A · Soft arc; attack arrows A · Soft arc; blocks 2 · Crossed swords; remove the "Died", "Destroyed" and "Sacrificed" pills and their message; the payment box fixed as proposed

The owner's list of 2026-11-08 after 1.52/1.53.

## Why (researched)

1. A target arrow drew on the first board with the spell on the stack, while the card was still flying there (your own: hidden during its cast flight; Bob's: turning over and held in the middle ~1.6 s) or popping in (a trigger) -- an arrow from nothing.
2. The front stack card's arrow left its left edge at the table's middle height, a card further back dropped ~250 px past its number and face badges, and an arrow at a player left the bottom edge straight through "Next: ..."; lines were layered above the words.
3. The middle gap is ~13 px at 1920x1080, so spec 0063's "ride the middle" made two tight knuckles and a ruler-straight run.
4. The "gold" arrow to blockers was the attack arrow (orange with a pale core): a short dash along the gap with a hook onto the attacker; two blockers made a "T".
5. "Still to pay": the stack is drawn at 1.5x while a question is asked and 3x otherwise; after the payment question ended the box was held a moment (the last mana ball), the stack went to 3x and the box doubled -- alone in an empty stack slot if its card had left.
6. Spec 0061's graveyard tags put "Died", "Destroyed" or "Sacrificed" on a dying creature and a "Died: Grizzly Bears (Bob's)" message; the shatter (Phase 10 A-04) already shows it.

## Built

1. A target arrow (and the source line) waits until its stack card has landed -- after your cast flight, after Bob's card turns over, flies and lands, after a trigger rises from its card -- then draws from the card.
2. Every arrow from a stack card starts at a small gold stud on the card's left edge, at the picture, and is drawn under the stack's words and badges (never through "Next: ..." or the numbers); an arrow at a player leaves from the same stud.
3. A · Soft arc for spell, ability and attack arrows: one smooth curve that rises off the table and comes down onto its target, with a soft shadow on the felt; every arrow bends the same way, higher the further it travels; no strip-riding, no corners (replaces spec 0063's ride-the-middle curve). Pointing, piles, blocked attackers and the R2 rest look from 0063 stay.
4. Blocks: no arrow between an attacker and its blockers; a crossed-swords mark sits between each fighting pair (one per blocker), in the canvas's look.
5. "Still to pay" never grows: the stack keeps its asking size while the box is held, and the box is not drawn alone once its card has left (it goes with its card).
6. No "Died", "Destroyed" or "Sacrificed" pill and no matching message; the move keeps its why for the shatter. "Cycled", "Discarded: too many cards", "Countered by ..." stay.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0066-A | No target line before its stack card has landed (own cast, opponent's cast, trigger) | page test; slow-motion clip |
| F-0066-B | Lines start at the stud, under the words; never cross the caption or badges | geometry test; screenshot |
| F-0066-C | Soft arcs: one bend direction, no corners, no card faces crossed in standard layouts | geometry test; screenshot |
| F-0066-D | Crossed swords between fighting pairs; no attack arrow to blockers | page test; screenshot |
| F-0066-E | "Still to pay" keeps its size until it goes | page test; clip |
| F-0066-F | No Died/Destroyed/Sacrificed pill or message; why kept | worker test; Lab check-moves |

## Amendments

**Amendment 1 — As built (2026-11-08).** Results below are
from this build (`RUN`) unless marked.

*Item 1, arrows wait for their card.* `GameScreen.tsx` `castOnItsWay`: the
other player's card is now hidden on the stack while it turns over, is held
and flies (its reveal flight), and while it lingers face down for its mana
balls -- not only your own. `spellOf`: the stack object a cast card is
hidden under / flies to is its *spell*, never a trigger with the same
source (an ETB trigger of the permanent it became, e.g. Wasteland
Strangler, was hidden as if it were the spell and the cast card flew to
the trigger's spot; found on the slow-motion clip). `Board.tsx`: a stack
card's target arrows and source thread wait while it is hidden, for 160 ms
while it fades in after landing (its CSS transition's end), while a new
trigger or ability rises out of its card (`RISE_MS` 520, its own
animation's end, so a click's hurry and slow motion move it too), and while
any other new stack card slides in (`STACK_IN_MS` 260). The caption waits
for its only card too. Reduce motion: no rise, no wait.

*Item 2, the stud, under the words.* Every stack arrow starts at a gold
stud (`.bf-stack-stud`, on the card whose arrows show; `STUD_AT` 0.45 of the
card's height, on its left edge). The lines' layer is now `Z_LINES - 200`
(4800): under every stack card (their number and face badges are inside
them) and the caption, over every card on the table. A pointed-at card
further back comes to the front (also when the dev page points at it). The
ability's source is a faint dotted thread (no head, a dot) from the
permanent's side into the stack card's left edge at `SOURCE_AT` 0.22, under
its badges. **Owner report folded in (2026-11-08, via the coordinator):**
an arrow from a stack card to a player's life circle wrapped behind the
stack card. Now no stack arrow passes behind any stack card or under the
caption past its first few pixels: it leaves the stud outward and goes round
the stack -- over the cascade's top to a circle above the stack's middle,
down past the caption's left end and under it to one below (`effects.ts`
`Clear`, `arc`'s round-the-stack branch).

*Item 3, the arc rule as built* (`effects.ts` `arc`, `arcToRing`,
`arcLift`, `arcShadow`): one cubic; both handles lifted up the screen off
the straight line (the canvas's 0.22/0.78 handles), so it bends one way and
has no corner; the lift is 0.26 of the distance, between 0.23 and 1.07 card
heights (the canvas's 20..92 px on its 86-px cards). It always comes down
onto a card's top (the highest corner, `topOf`, `TIP_GAP` above) or a life
circle's rim (aimed at the centre, stopping on the side it comes from). From
a stack stud it leaves straight out left, rising; from your attacker's top
edge rising; from the other player's attacker's bottom edge it leaves level
or below (never back over its own card) and the bend is flattened to stay
one bend -- so their arrows down to you arc less than yours up to them. A
target close beside or above the stud is climbed past or rounded (its
corners avoided). Shadow: the arc's points moved down (0.9) and right (0.35)
by sin(πs)·depth, depth min(0.33 card heights, 0.4 × the arc's height),
drawn in with the line. Draw-in 300 ms / fade 160 ms, pointing, focus,
tap, the ×N chip and R2 are 0063's, unchanged.

*Item 4, crossed swords.* One mark per fighting pair as drawn (pile and
blocker), the canvas's mark scaled to the card (`g.cardW / 62 × 0.9`): in
the gap where a blocker faces its attacker, under where the two overlap;
for a blocker that blocks another attacker too, halfway along its (soft
arc) block line, which stays. It clicks in (scale 1.5→1, a spark ring) after
the blockers' move (`MOVE_MS` delay), brightens (×1.1) while its attacker is
pointed at, dims (0.4) the others, and fades out with the lines when combat
ends. A blocked attacker draws no arrow.

*Item 5.* `stackScale = asking || stackPay ? STACK_SCALE : STACK_READ_SCALE`;
the pill alone in an empty slot only with `stackPayLive` (the payment
question is live).

*Item 6.* `Moves.graveReason` from the battlefield returns the why with no
words; `toldByOwner` skips it, so no tag and no message. Spec 0061's text is
left as history. Updated: `ThrownAwayTest`, `HiddenIdsTest`/`HiddenIds`
comment, `scripts/check-moves.py` (now requires no `said`),
`fixes0061.test.tsx`, `protocol/README.md`, `match.ts`.

*Decisions.* (1) "No card faces crossed in standard layouts": a single arc
from the front lines to a life circle, or from the stack across the table,
cannot avoid the cards of the rows it passes over on a full board (0063's
ride along the 12-px gap was the only face-free path, and is what was
replaced; the canvas's own look A passes over Gray Ogre). As built and
tested: never over its own card, its target's face, a life total, the
stack's cards or caption (stack arrows), and never off the board; it flies
over other cards, in the air with its shadow. (2) The other player's
attackers' arrows arc less (see item 3). (3) Corners are measured as the
tightest turn of the drawn body (the last 0.2 card heights are under the
head): at least 0.12 card heights (0063's knuckles measured under 0.01); a
target touching the stud or right beside it is exempt (it must be climbed
past). (4) A permanent under the stack card itself keeps its arrow under the
card.

*Tests.* `effects.test.ts` "soft arcs (F-0066-C)": one cubic, one bend, up,
no corner, never over its own card / a life total / off the board, every
attacker of every standard and dev board, both seats, 1920×1080, 1920×947,
2560×1440, 3440×1440; higher with distance; onto a planeswalker's top; from
the stud to every permanent at both stack sizes (never over its target or
the caption); to a player from the front card and one further back, 1 and
3 cards, both sizes, both seats: never inside any stack card or the caption
(fails with the round-the-stack clearance removed: 30 points behind the
card). `Board.test.tsx`: the arc, shadow, one `C`; swords per pair, none
hot/dim at rest, no attack or block arrow, brighten/dim on pointing; the
stud and the lines' layer between the table and the stack. `fixes0066`:
waits (own cast, reveal, trigger rise, slide-in, reduced motion), `spellOf`,
the thread, "Still to pay" size and no lone pill, swords fading, no tag for
a death. Removing the wait, the scale fix or the live flag each failed
them. Worker: `mvn -q -o test` and `package` pass; Lab `check-moves` all
OK.

*Seen on screen* (slow-motion clips of Lab games through the jump tool at
0.1×, and the dev board at 1920×1080; `RUN`): Bob's Lightning Bolt -- no
stack card, caption or arrow while it turns over, is held and flies; the
card fades in, then its arc draws from the stud round the stack's foot to
your life circle (and, from the other seat, over the stack to his). The
Wasteland Strangler trigger rises from the Strangler, then its arc and
thread draw. Open for the owner's eye: the arrow round the stack's foot to
your own life circle comes in level across your plate's picture and name
before its head lands on the total's shield (it never crosses the total);
and the "Still to pay" clip could only show the ability's card keeping its
size while its ball flies -- the jump tool drops the questions, so the
payment question itself is covered by the page tests only. Browser suite on
the rebuilt local stack: `battlefield`, `match-big-combat`,
`match-damage-tray`, `match-sacrifice` pass.

*Review fixes (2026-11-08, coordinator's review of the screenshots).* (a) An
arrow at a player never crosses a plate's picture, name or tiles
(`motion.ts` `plateRects`; `effects.ts` `arcToRing`'s `keepOut`): it lands
on the life shield's top, from above. The default arc is kept when it
clears the plates; else, in turn: a landing along the circle's own radius
from straight above (then from either side of above); then two pieces over
the plate's top-left corner; from a stack stud, three pieces -- out under
the badges, up their left side, over and down -- all turning one way. To
your own circle under the stack, the arrow rounds the stack's foot under
the caption and comes down onto the shield -- two pieces, the second its
landing turn (the one place an arrow turns back the other way: going under
the stack and landing from above cannot be done in one bend). Stack arrows
also keep off the number and face badges (`Clear.badges`, each card's),
except level with the stud on the way out (a card further back has its stud
in that column). Known limit: with three or more stack cards at reading
size the caption reaches below your shield's top; nothing then reaches it
from above without crossing the stack, the caption or your plate, and the
arrow comes in across your plate (exempted in the test, named here). (b)
The crossed swords fit the gap between a pair (radius half the gap + 2 px,
5 px at least; the canvas's size only on a block line), so they cover no
name, power/toughness or tag -- only the cards' borders. Tests: the plate
sweep (every attacker, both seats, every board and screen; stud to both
plates from the front and a card further back, 1 and 3 cards, both sizes)
failed on attack8 with the keep-out removed; the swords' gap test failed
with the old size. Corners: 0.1 card heights at least now (0063's: under
0.01).

*Owner's choice on the path to the top plate (2026-11-08, "Tighter path").*
A stack card's arrow to a life circle beyond the stack now takes the
tightest clear way round it (`effects.ts` `studRound`, tried first): out
level from the stud to `STUD_CLEAR` (0.2 card heights) past the badges'
column (0.4 past the caption's end when going under it, to turn under its
corner), straight up past the stack's top (or down past the caption), over
(under) to the plate, and down onto the shield's top -- three pieces, each
corner rounded (the corner test now applies to these paths too). The badges
are now measured as drawn (`stackBadgeRects`: 1.5x size beside any stack
size; they were over-estimated as 0.4 of the card's width). A card further
back whose stud would sit on a front card's badges has its stud just below
them (`studY`). Dev page: `&aim=you|them` aims the scripted stack at a
player. Test: a player-target path never goes more than 0.6 card heights
left of the stack's badges (or its caption, going under it).
