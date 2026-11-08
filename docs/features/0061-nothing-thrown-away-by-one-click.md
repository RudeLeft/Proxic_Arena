# 0061 — Nothing thrown away by one click; say why a card left

**Status:** Approved 2026-11-07 (owner, on the canvas "cast-1107", sent as a file)
**Owner decisions:** all five; the end-of-turn discard way (a)

## Why (the owner's game record, 2026-11-07)

Forgotten Cave (a land with cycling): with the land drop used, cycling
was the card's only choice, and a click with exactly one choice answers
at once (frontend/src/battlefield/interaction.ts clickOn) -- spec 0057's
menu (play in gold, cycling red: "You won't have it as a land") never
opened; the card was cycled and a "Pay the mana" window titled
"Forgotten Cave ability" took {R}. Elvish Warrior: with one Forest and no
land in hand nothing could be paid for, so the whole turn was passed for
the player in about 0.1 s with no question (PriorityStops); at end of turn,
with 8 cards, each hand card was one click from the discard, and the new
Elvish Warrior was clicked and discarded. No rules bug in either.

## Built

1. A card whose only choice right now throws it away (cycling,
   landcycling, channel) never goes with one click: its menu opens, with
   the play shown greyed and why ("Play it as your land -- You've already
   played a land this turn"; the worker sends the reason per option).
2. A turn passed for you says so: "Nothing you can play this turn -- 1
   land, no land in hand. Passing your turn." and the turn's steps move
   visibly.
3. The end-of-turn discard is deliberate (way a): click a card to pick it,
   then "Discard Elvish Warrior".
4. Every card going to a graveyard says why, on its way there and in what
   the game tells the player: "Cycled", "Discarded: too many cards",
   "Countered by <card>", "Died" (the move record carries the reason).
5. The payment window for an ability says what it is for: "Pay {R} to
   cycle Forgotten Cave".

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0061-A | A cycling card with only cycling offered opens its menu, the play greyed with its reason | page test; Lab |
| F-0061-B | A turn passed for want of anything playable shows the notice | Lab; screenshot |
| F-0061-C | The hand-size discard needs pick + Discard | page test; e2e |
| F-0061-D | Moves to a graveyard carry and show why | Lab check-moves; screenshot |
| F-0061-E | The ability payment title names the ability | worker test; screenshot |

## Amendments

### Amendment 1 -- As built (2026-11-07)

**Item 1 (one click never throws a card away).** Page:
`interaction.ts clickOn` answers a lone option on a click only when its
`use.kind` is not cycling, landcycling or channel (`throwsAway`); such a
card always opens its menu. Worker: `MatchController.missingPlays` -- a
hand card whose every offered option throws it away gets its play as a
`notNow` row, first: {"Play it as your land" | "Cast it", WhyNot's reason
without the full stop ("You've already played a land this turn"), `use`
"land" | "spell"}; `WorkerMain` sends `use`. `ActionPopup` draws that row
first, greyed, title and why (the canvas's `.menu .no`), above the red
"Cycle it instead: {R}". Lab: `check-thrown-away.py cave`.

**Item 2 (a turn passed for you is said).** Worker: `PriorityStops.passedTurn`
-- at the seat's own Main 1, stack empty, nothing worth stopping for (the
same test `shouldAsk` uses): once per turn, the notice, then the snapshot
goes out at once. Words, adapted to the case (`nothingToPlay`): "Nothing
you can play this turn -- 1 land, no land in hand. Passing your turn.";
"... 3 lands, you've already played a land this turn. ..."; "No lands";
"Passing your turn (you can still attack)." when a creature could attack
(that question is still asked). `pausing`: the rest of that turn, each
step it is passed for waits 0.4 s (`STEP_PAUSE_MS`). **Chosen: the pause,
plus the notice in the usual notice stack** -- the steps then really move
on the step ladder (MATCH_STEP frames already go out per step), rather
than a page-side animation of steps the board had already left. 0.4 s,
not the canvas's "about half a second", because the brief capped it; only
on the passed player's own turn, never on the opponent's, never with
anything on the stack. A turn passed this way now takes about 1.2 s
(measured by the Lab: 1.22 s from the notice's board to the next).
The page shows a notice with " -- " as a title and a line ("Nothing you
can play this turn" / "1 land, no land in hand. Passing your turn.").
**Found on the way:** the page counted new notices by the list's length,
and the worker keeps only the last six -- after a seat's sixth notice no
notice ever showed again. Snapshots now carry `noticesTotal`; the page
(`notices.ts newNotices`) counts by it. Lab: `check-thrown-away.py passed`.

**Item 3 (way a).** Worker: the discard question carries
`arrange.discard` (how many are still to go). Page (`discard.ts`,
`GameScreen`): during `chooseCardsToDiscardToMaximumHandSize` a click on a
hand card only picks it (`data-picked`, red outline, lifted; a click on
another changes it; with N to go, N are picked); the act button
(`DiscardAct`) is grey "Discard 1 · Click a card to pick it", then red
"Discard Elvish Warrior · Or click another card" ("Discard 2 cards" for
two); only it discards -- the first pick at once, the rest as the game
asks. No window over the board (the canvas's way a); "List choices" still
lists every card (UI-002). e2e: `discardIfAsked` in `match-helpers.ts`
picks then presses Discard; every game loop that met a discard uses it,
and `passButton` and the "act button" selectors skip the discard button.
Lab bots answer by actionId and are unchanged.

**Item 4 (why a card went to a graveyard).** Worker: `Moves.graveReason`
from Forge's facts read as the move is reported (`GameHost.graveFacts`):
from the hand, a discard (Forge records it just before the move,
`Player#getDiscardedThisTurn`) -- "Cycled" when it is the cost of the
cycling ability being played (`MatchController.playChosenSpellAbility`
marks the card), "Discarded: too many cards" in the cleanup step,
otherwise "Discarded"; from the stack while another card's spell or
ability resolves, "Countered by <that card>"; from the battlefield,
"Sacrificed", a creature "Died", any other destroyed permanent
"Destroyed". The move carries `why` (new: cycled, discarded, countered,
died; A-00's destroyed/sacrificed kept) and `said` (the tag). Both
players are told, one line per owner and reason: "Cycled: Forgotten
Cave", "Discarded, too many cards: Elvish Warrior", "Countered by
Counterspell: Giant Growth", "Died: Grizzly Bears (Bob's)" (the other
player's cards say whose). The canvas's extras ("(you drew a card)",
"(3 damage from Shock)") are not built. Page: `Board` draws the tag in
A-14's look on each card leaving the table, the hand or the stack for a
graveyard with a reason: it rides at the card's own pace and bow
(`graveTagFrames`), stops just left of the pile, holds 1.4 s and fades.
A card the board never drew (the other player's hidden hand, a mill) has
no tag; its notice still says it. Lab: `check-thrown-away.py cycled
(cave), handsize, countered`; `check-moves.py destroy` now also expects
"Died".

**Item 5 (payment title).** "Forgotten Cave ability" was never a title in
the page: the window's title was "Pay the mana" under the small gold
"Forgotten Cave"; the owner read the two together. Worker:
`ManaPayment.offerPurpose` -> `about.pay`/`about.then` for an activated
ability (`PlainWords.payFor`): cycling "to cycle Forgotten Cave" / "Then
Forgotten Cave goes to your graveyard and you draw a card."; equip "to
equip a creature with Bonesplitter"; an effect that reads on after "to"
"to draw a card with Jayemdae Tome"; anything else "for Prodigal
Sorcerer's ability" with its words under it. Page: `payTitle` "Pay {R} to
cycle Forgotten Cave" (the mana still due), `payLine` under it. A spell's
payment keeps "Pay the mana". e2e loops that found the payment by "Pay
the mana" also accept a title starting "Pay {".

**Tests.** Worker `ThrownAwayTest` (10). Page `fixes0061.test.tsx` (16):
clickOn never answers a throw-away option (fails with the old line, 2
tests), the greyed play row, the discard pick and button, the tags on a
card from the table and the hand, the move record's tag, the payment
title, notices after the sixth. Lab `check-thrown-away.py` (cave,
handsize, countered, passed), added to the CI list; against a worker from before this change
cave and handsize fail.
