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
