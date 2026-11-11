# 0070 — Click-to-pay ribbons: every card you pick is marked at once

**Status:** Approved 2026-11-09 (owner, by prompt, on the canvas "tap-to-pay" in the Deck Builder chat, handed to this project's chat)
**Owner decisions:** every card-by-card cost marks the card the moment you pick it with a **Ribbon** (colour + word); cards picked to tap lean **5 degrees** (never turned sideways before the cost is paid); **clicking a picked card again un-picks it**; **the other player sees nothing** until the cost is paid.

## Why (researched)

Costs paid by picking cards one at a time (tapping creatures for Voice of the Woods, crew, convoke, untapping, sacrificing, exiling, returning to hand, putting into a library, revealing) are asked by the worker one card at a time (`MatchCostDecision` pickCards / pickOne / pickOrDone) and never send "picked so far"; Forge pays everything at the end. So nothing on the table shows what you've already picked, and a picked card can't be taken back.

## Built

1. Each pick question carries the cards picked so far; the page marks each with a Ribbon in the cost's colour and word: TAP, UNTAP, SACRIFICE, EXILE, TO HAND, TO LIBRARY, REVEAL, DISCARD (and the cost's own word where Forge names another).
2. A card picked to tap leans 5 degrees; it turns sideways only when the cost is actually paid.
3. Clicking a picked card un-picks it: the ribbon and lean go and the card can be picked again. (Worker change: the pick loop accepts an "un-pick".)
4. The other player sees no ribbons or leans; they see the result once paid.
5. Reduce motion: no lean animation; the ribbon still shows.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0070-A | Voice of the Woods: five Elves picked one by one each show TAP and lean; paid sideways at the end | Lab + browser; clip |
| F-0070-B | Un-pick: clicking a picked card removes the mark and frees it | worker test + browser |
| F-0070-C | Every card-by-card cost kind shows its word | worker test; page test |
| F-0070-D | The other player sees nothing until paid (no picked ids in their frames) | worker test; Lab hidden check |
| F-0070-E | Reduce motion | page test |

## Amendments

## As built (2026-11-11, not committed)

**Reproduced first.** A Mechanics Lab game (scripts/check-pay-picks.py,
`voice`): Voice of the Woods' "tap five untapped Elves" asked five
`CostTapType` questions, each listing only the Elves left, with nothing
about the ones already picked; no answer could take one back. The same
check against the unchanged worker fails (WRONG: "question 2 lists [],
the picks so far are [card:16]"...).

**Worker.** `CostPicks` (new): what a cost does to its picks (word,
tone, lean) and the take-back answer (`unpick:card:N`). Each pick
question carries `picking` (GameHost.offerPicking -> WorkerMain), and
the gate accepts a take-back of any card picked so far; it is never
listed among the options. Loops that narrow as you pick (share a
creature type, same colour, different names) work the list out again
after a take-back. Paths covered:

- MatchCostDecision.pickCards: CostTapType (N), CostUntapType,
  CostSacrifice, CostExile (battlefield/hand), CostReturn,
  CostPutCardToLib, CostReveal, CostBehold / CostBeholdExile,
  CostDiscard, CostExiledMoveToGrave, CostUnattach, CostForage
  (graveyard).
- CostTapType crew / total power, "any number", share a creature type;
  CostReveal same colour; CostCollectEvidence; CostDiscard with
  different names.
- MatchController.chooseCardsForCost (paying while something resolves:
  Coral Atoll, Bellowing Mauler...), word from the cost's class.
- MatchController.chooseCardsForConvokeOrImprovise (convoke, improvise,
  waterbend): TAP and lean; a take-back works the mana out again. Its
  spec 0062 balls are now sent when the picking is over, not per pick
  (the other player was being shown each convoked creature early).

Not covered: CostExile from a graveyard or other zone and Delve (both
go through Forge's general chooseCardsForZoneChange /
chooseEntitiesForEffect, shared with effects); single-pick costs
(CostPutCounter, CostRemoveCounter, CostBlight, CostEnlist, a Food for
CostForage, CostRemoveAnyCounter) pay on the one click, so there is
nothing to mark.

**Server.** `DecisionRequest.picking` passed through to the asking seat
only (DecisionLayout.kt); LiveMatch accepts a take-back named in it.
protocol/README.md and MATCH_PROTOCOL.md updated.

**Page.** payPicks.ts; Board draws a Ribbon above the card's top edge
(colour by tone) and a coloured outline; a picked card stands apart
from its pile, and a tap leans TAPPED_TILT (layout `paying`). A click
on a picked card sends its take-back. Between a pick and the next
question the marks are held, with the card just clicked added, so
nothing flickers (PAY_HOLD_MS). Reduce motion: no ribbon animation, no
lean glide.

**Tests.** CostPicksTest (F-0070-B, -C, the gate); LiveMatchTest,
WorkerFramesTest; fixes0070.test.tsx (F-0070-A..E; three fail with the
take-back or the lean removed); scripts/check-pay-picks.py (`voice`,
`fireblast`, F-0070-A, -B, -D; in CI's Lab list). No e2e: no test deck
reaches a multi-card cost reliably (no stacked deal outside the Lab).

**Filmed** (replay of the Lab games into the real page, real clicks):
`Arrow videos/pay/`, canvas `frontend/zz-canvas/pay-ribbons-final.html`.

## Amendment 1 — no words: corner signs, and the "seen" eye (owner, 2026-11-11)

On the canvas "pay-effects-1111" the owner chose **C · Corner sign** instead of worded ribbons: "I don't like tagging everything with words; graphical effects should show what is happening." A picked card shows a small round sign in its top-right corner -- tap (also crew, convoke, improvise), untap, sacrifice (flame), exile (star), return to hand, into a library, discard, reveal (eye) -- no words anywhere on the card. Taps keep the 5-degree lean. Picking, taking back and "the other player sees nothing until paid" are unchanged.

**The "seen" eye (owner: yes, both ways).** A card in your hand that the other player has seen keeps an eye sign until it leaves your hand -- every reveal counts (a reveal cost, Duress, Thoughtseize, "reveal your hand", a revealed draw). A card the other player revealed to you stays visible to you in their hand, with the same eye, until it leaves their hand. Needs the worker to remember, per hand card, which seats have seen it (and forget when the card changes zone); spectators get nothing extra.

| ID | Test | Evidence |
|---|---|---|
| F-0070-F | Corner sign per cost kind; no words on picked cards | page test; clips |
| F-0070-G | Seen eye on your revealed hand card until it leaves your hand; gone after a zone change | worker test; Lab; clip |
| F-0070-H | A card revealed to you stays visible in their hand with the eye; never leaks to anyone who didn't see it (spectators, after it leaves the hand) | worker test; Lab hidden checks |

## As built, Amendment 1 (2026-11-11, not committed)

**Corner signs.** The worded Ribbon is gone: `PaySign.tsx` draws the
canvas's C signs (its icons and colours, copied exactly) on a picked
card's top-right corner, with a thin outline in the same colour; no words
on the card (the words stay for screen readers). In a hand the sign sits
on the left corner, where the fan leaves it visible (bottom-left in the
other player's hand, whose top is off the screen). A cost the canvas drew
no sign for (unattach, into a graveyard) gets a plain dot. Taps still
lean 5 degrees; picking, taking back and privacy are unchanged.

**The seen eye.** Worker `SeenHands`: MatchController.reveal (both
overloads -- Forge's single path for every reveal, called on the
controller of each player shown: GameAction.reveal / revealTo, so Duress
and Thoughtseize (DiscardEffect RevealTgtChoose / RevealYouChoose),
"reveal your hand", reveal and behold costs, revealed draws) records
each card of another player's hand shown to that seat. Forgotten on any
GameEventCardChangeZone (GameHost MoveLog) -- a card played and
bounced back is not seen again. ViewerSnapshot: own hand cards seen by
another seat carry `seen`; another player's hand card this seat saw is
in its otherHands, face up, `seen`. Nothing for other seats or the
public (spectator) view. Telepathy/Mindslaver otherHands unchanged.
Page: the eye on your seen hand cards; their revealed cards face up in
their hand with the eye.

**Convoke balls** still fly when the cost is paid (owner not yet asked).

**Tests.** SeenHandsTest (F-0070-G, -H); fixes0070.test.tsx adds
F-0070-F (sign per kind, no words) and the eye both ways (the eye tests
fail with the eye removed); scripts/check-seen-hands.py `duress`
(Duress, a Forest and the Bears played, the Bears Unsummoned back:
exactly the revealed cards still in hand are shown and marked; with the
forget removed it fails: "Alice still sent card:61 after it left Bob's
hand"); check-hidden-hands.py now checks `seen` cards are only ever in
the owner's hand, the owner's eye matches what the others were shown,
and the public view carries neither (a planted leak is caught). Both
Lab checks are in CI's list.

**Filmed:** `Arrow videos/pay/` (Voice, Fireblast, Duress, each with the
other player's screen); canvas `frontend/zz-canvas/pay-final-1111.html`.
