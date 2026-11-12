# 0071 — Reports above your hand, revealed cards on a point, picks that stay in a window

**Status:** Approved 2026-11-11 (owner, by prompt, on the canvas "small-fixes-1111", https://claude.ai/artifact/M5H8EfHdchakmoQy2JFKYg)
**Owner decisions:** report box **A · Above your hand**; another player's revealed hand cards **B · Point to see**; cards picked in a window **A · Stay, signed, take back**.

Three defects found while filming spec 0070 (1.56.0).

## Why (researched)

1. **The report covers your hand.** `RevealTray` (`.gs-reveal`, game.css) sits at `bottom: 12px` in the middle of the table, which is where your hand rests. After Duress ("Alice looked at your hand and chose nothing") the box hides the very cards that just got their "seen" eye (0070 Amendment 1), until you close it.
2. **Revealed cards are off the screen.** 0070 keeps a card you saw face up in the other player's hand, with the eye. Their hand rests along the top edge, so only the bottom strip of each card shows ("…Creature –"); the name and picture are off the screen.
3. **A picked card vanishes from the window.** A cost that picks cards from a graveyard or exile (Escape: "exile five other cards from your graveyard"; Delve) goes through Forge's general `chooseCardsForZoneChange` / `chooseEntitiesForEffect`, the worker's `pickSeveral` loop (0070 "Not covered"). `HiddenZoneTray` shows only the cards still offered, so each pick disappears: no corner sign, no way to take it back, unlike picking on the table.

## Built

1. **Report above your hand.** A report window (`RevealTray`, every kind, not only Duress) sits just above your resting hand instead of on it: same width, same place in the middle, its bottom edge clear of the hand's top. When a question window holds the bottom it still goes to the top, as today. Your hand stays clickable under nothing.
2. **Point to see their revealed cards.** A card in the other player's hand that you saw stays at the top edge, face up, with the eye. Pointing at it slides it down fully into view (the whole card: name, picture, cost), the way pointing at a card in your own hand lifts it; moving away puts it back. Their hidden cards don't move. Reduce motion: it appears in place without sliding.
3. **Picks stay in the window, signed, and can be taken back.** When a window asks you to pick several cards one at a time (Escape, Delve, and the other picks that share the same loop), a picked card stays in the window, dimmed, with the corner sign of what will happen to it (0070's signs: exile star, graveyard, hand, library...; a plain dot where there is none). Clicking it again takes it back. The count in the window ("picked 2 of 5") follows. As in 0070, the other player sees nothing until you finish. Worker: `pickSeveral` sends the picked-so-far with the tone, and accepts a take-back (as `MatchCostDecision` does for 0070).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0071-A | Report window's bottom is above the resting hand's top at 1920x1080 and 2560x1440; at the top while a question window is open | page test; screenshot (Duress) |
| F-0071-B | A revealed card in their hand slides fully into view when pointed at and back when not; hidden cards don't move; reduce motion | page test; clip |
| F-0071-C | Escape from a graveyard: each pick stays, dimmed, with the exile sign; a second click takes it back; Done/count follow | worker test; Lab; clip |
| F-0071-D | The other player's frames carry no picked ids until the picking is over | worker test; Lab hidden check |

## Amendments

## As built (2026-11-11)

**1. Report above your hand.** `RevealTray` sets its bottom from the
layout: `reportBottom(geometry)` = board height - `geometry.handTop` (the
resting fan's highest point, layout.ts HAND_BASELINE) + `REPORT_HAND_GAP`
(10 px), so it follows the board at 1920x1080 and 2560x1440. Same width
and place in the middle. With a question window open it still goes to the
top (`.gs-reveal-top`; no bottom set then). A pointed-at hand card still
lifts above it, as before.

**2. Point to see their revealed cards.** Board: a face-up card in the
other player's hand (seen, or shown) slides to `opponentRevealBox`
(motion.ts): upright, its own size, top flush with the board's top edge,
over where it was -- the strip that was showing stays under the pointer,
so it does not slide away from it. Back on leave (or blur). Hidden backs
have no pointer handlers and never move. The eye goes with the card. The
slide is the slots' CSS transition, so reduce motion = it appears in place.

**3. Picks stay, signed, take back.** Reproduced first: the Lab's Escape
(Uro) and Delve (Treasure Cruise) asked `chooseEntitiesForEffect` with no
`picking`; the window listed only the cards left. The window that asks
them is the card window (`ChoiceWindow`, graveyard cards as tiles), not
`HiddenZoneTray` (that one is for a library or another player's hand);
both now keep picks.

- Worker: `pickSeveral` takes an optional `CostPicks.Pay`; with one, each
  question carries `picking` (GameHost.offerPicking, as 0070) and accepts
  `unpick:card:N` for a card picked so far, which is offered again in
  Forge's order (`CostPicks.left`). Tone by destination
  (`CostPicks.toZone`): exile -> EXILE, hand, library; graveyard and
  anything else -> the plain dot (0070 has no graveyard sign). Paths:
  `chooseCardsForZoneChange` (Escape and every other zone-change pick,
  by destination), `chooseCardsToDelve` (EXILE), plain
  `chooseEntitiesForEffect` (dot).
- Limited (`CostPicks.takesBack`): no `picking` when at most one card can
  be picked (the pick ends the question), when any option is a player
  (nothing to sign), for Fact or Fiction's split, or for Brainstorm's "to
  the top" (those windows lay their picks out themselves). Nothing Forge
  acts on happens between picks -- Forge gets the list only when the
  picking is over -- so no pick Forge already acted on can be taken back.
- Not covered: the other `pickSeveral` callers (sacrifice/destroy as an
  effect, enlist, exert, reveal from hand, splice, crank, scry's "away"
  row) keep their windows as they were. Trigger: an owner report of one.
- Pass word unchanged ("Pass"; the tray says "Done" once a pick is made,
  as before): Escape's pass short of five declines the escape, so
  "Done" there would mislead.
- Server: unchanged; `DecisionLayout.putLayout` already passes `picking`
  to the asking seat only, and `LiveMatch` accepts any take-back named in
  it.
- Page: `PickedTile` (QuestionWindows.tsx) -- dimmed, outlined in the
  sign's colour, PaySign inside the picture's top-right corner, a click
  sends the take-back; `withPicked` keeps a pick where it was among the
  cards. Used by `ChoiceWindow` and `HiddenZoneTray`.

**Tests.** CostPicksTest (toZone, takesBack, left); fixes0071.test.tsx
(F-0071-A at both sizes and at the top, -B incl. hidden backs and reduce
motion, -C in the card window and the search tray, -D); 7 of its 11 fail
with the three fixes removed. scripts/check-pay-picks.py `escape` (Uro:
two picks, the first taken back, five exiled; the one taken back stays in
the graveyard) and `delve` (Treasure Cruise, four) -- both INCONCLUSIVE
("no graveyard picking window was asked with picks") against a worker with
the take-back turned off; check-hidden-hands.py and check-hidden-log.py
clean on all four pay-picks traces. Already in CI's Lab list.
