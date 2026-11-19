# 0104 — You always choose: every card or player an effect has you choose is asked, even when only one fits; the reveal and victim windows

**Status:** Approved 2026-11-19 (owner, by prompt, feedback batch). Not part of a phase.
**Owner decisions** (owner feedback batch 2026-11-19; canvas `frontend/zz-canvas/feedback-1119.html`):
Q1 **A** (every card or player an effect has you choose is asked, even with one legal option; B, only cards from a hidden place, and C, colours and numbers too, not taken). With it: the only legal card is lit and the others are dimmed with the reason; the prompt is the card's own words; a hand-exile effect gives its victim the standard report window and the caster none; the play log names the right player; plain reveal and look windows stay until closed.

Canvas sections: "Q1" (decided line; "The new flow", both seats; "Where 'always click' stops", option A; "The cards it touches" table). Research: `Owner feedback 2026-11-19 research A.md`, items 1 and 1(b) (in the working folder, outside the repo).

## Why (researched)

Researched at HEAD 3370c75 (1.73.0), worker jar built 2026-11-18. Four Lab games (Appetite for Brains with one and two qualifying cards, with and without the stops rule) are research A's RUN evidence; the rest is SOURCE.

- **The shortcut** (SOURCE, RUN). `MatchController.chooseSingleEntityForEffect` returns the only candidate without asking when it cannot be declined and nothing else is shown: `if (!isOptional && candidates.size() == 1 && context.isEmpty())`. `chooseSingleCardForZoneChange` and `chooseCardsForEffect` (min = max = 1) go through it. Appetite for Brains (`cardsfolder/a/appetite_for_brains.txt`, `AlreadyRevealed$ True`) sends no `DelayedReveal` (Forge `ChangeZoneEffect.changeHiddenOriginResolve`), so `revealed(delayedReveal)` is empty and the shortcut fires. RUN: with one card of mana value 4 or more in Bob's hand, Alice was never asked; with two, she was.
- **The other "only one" shortcuts that pick a card, player, mode, target or spell** (SOURCE): `chooseModeForAbility` (`min == num && num == possible.size()`: every mode must be taken), `chooseTarget` (`allTargets.size() == 1`: Spellskite-style change of target), `chooseSingleSpellForEffect` (`spells.size() < 2`), `chooseSpellAbilitiesForEffect` (`remaining.size() == 1 || remaining.size() == num - chosen.size()`). `getAbilityToPlay` (`abilities.size() == 1`) is the card the player clicked: the click was the choice.
- **What already always asks** (SOURCE): `pickSeveral` (discard by another's choice, sacrifice, destroy: `chooseCardsToDiscardFrom`, `choosePermanentsToSacrifice`, `choosePermanentsToDestroy`), `selectTargets`, scry/surveil, optional costs. So today edicts and Thoughtseize ask with one option and Appetite does not: the inconsistency the owner found.
- **Group B stays silent** (Decided Q1 A, not C): `chooseColor`, `pickNumber`, `chooseCounterType`, `chooseKeywordForPump`, `chooseSingleCardFace`, `chooseSingleCardState`, `chooseSomeType`, `chooseProtectionType`, `chooseCardName`, `chooseReplacement`, `chooseSingleStaticAbility`, `orderMoveToZoneList`, `confirmTrigger` with a cost, `chooseStartingPlayer`.
- **The prompt** (RUN). When asked, the tray's prompt is Forge's "Select a card from Bob's hand"; it does not say "mana value 4 or greater" or "exile". Targets already use the card's words: `MatchController.targetPrompt` (Phase 9 Amendment 13 item 3, spec 0055).
- **Dimmed with why** (SOURCE). `CardTrays.tsx` `HiddenZoneTray` shows another player's hand from `board.reveal`, the cards not offered dimmed with `notOffered` (`cardPlans.ts`), which today only knows "a land", "a creature" or "can't be chosen". Working out "mana value 1" on the page would be a rules inference (UI-001), so the reason must come from the worker.
- **Bob's side** (RUN, SOURCE). No report: `ActionReports.kindOf` has no kind for `RevealHand` without `Look` nor for `ChangeZone` from Hand to Exile chosen by another player. Bob saw only his card glide to exile (spec 0081). His play log read "Bob exiled Hill Giant from their hand": `PlayLog.moved`, the `"hand-exile"` phrase, uses `player(owner)` as the actor (written for Force of Will's own-card exile).
- **The reveal window vanished** (RUN, SOURCE). `Causes.Listener.on` clears plain reveals on `GameEventTurnBegan` (`reveals.values().removeIf(...)`), while report windows have stayed until closed since spec 0088 (Q2 A). Each new reveal replaces the seat's last (`Causes.revealed`). With nothing left to do, Alice's turn passed at once and took the window with it.

## What the player sees

Alice is you (bottom), Bob the other player.

1. **Appetite for Brains, one card fits.** Bob's hand: Hill Giant, Lightning Bolt, Island, Grizzly Bears, Counterspell. Alice casts Appetite for Brains at Bob. The tray opens from the bottom, "Appetite for Brains · only you see these", titled "Look at Bob's hand.", the prompt in the card's own words: "Exile a nonland card with mana value 4 or greater." Hill Giant breathes gold; the other four are dimmed, each with its reason under it ("mana value 1", "a land", "mana value 2", "mana value 2"). Nothing happens until she clicks Hill Giant. Bob's waiting line says "Choosing a card from your hand". Afterwards Alice gets no window (the house rule: the one who chose is not told again); Bob gets the standard report window, Alice's medallion and "Alice exiled your Hill Giant.", with Hill Giant's picture and "→ exile". It stays until he closes it. Both play logs: "Alice exiled Hill Giant from Bob's hand (Appetite for Brains)."
2. **No card fits.** Same spell, Bob's hand all cheap. Nothing to choose, so nothing is asked; Alice's plain reveal window, "Appetite for Brains revealed: Bob's hand", stays on screen until she closes it, even if her turn ends at once.
3. **One creature of your own.** Alice casts Divine Reckoning with only Grizzly Bears. The bubble beside the stack says, in the card's words, "Divine Reckoning: each player chooses a creature they control. Destroy the rest."; her Bears breathe gold on the table and nothing moves until she clicks them (canvas "Where 'always click' stops", option A).
4. **The same everywhere a card or player is chosen** (canvas table): "choose an opponent" (Anointed Peacekeeper: Bob is lit, she clicks his plate), a card from a graveyard without a search (one creature card there: it is lit in the graveyard tray), a mode when only one is legal (Izzet Charm with nothing to counter and no small creature: only "Draw two cards, then discard two cards" is lit), a new target when only one is possible (Spellskite), the half or spell to cast for free when only one can be.
5. **Unchanged:** colours, numbers, counter kinds, keywords, card names and the other group-B answers with one option are still given without asking; a card you clicked with one ability still just does it.

House rules kept: no pills, no top notices; no window for the one who chose (Phase 9 Amendment 13 item 7, owner 2026-11-15); no "Forge" in player text.

## Changes

### Worker

- **`MatchController.chooseSingleEntityForEffect`**: remove the one-candidate shortcut. A required choice with one candidate is asked like any other: one id offered, `!isOptional` as today. This covers `chooseSingleCardForZoneChange` and `chooseCardsForEffect` (one card).
- **`chooseModeForAbility`**: remove the "every mode must be taken" return; ask each round as today (one mode lit in the last rounds). Decision default (owner may change): when the card's own text takes every mode (`min == num == possible.size()` with more than one mode), the modes are still asked one by one, so the player sees and clicks each. **`chooseTarget`**: ask with one option. **`chooseSingleSpellForEffect`**: ask when `spells.size() == 1` (none still returns null). **`chooseSpellAbilitiesForEffect`**: ask when one remains or all remaining must be taken.
- **Not changed:** `getAbilityToPlay` and every group-B method above. `RULES_COVERAGE.md`'s "One legal answer" row is rewritten by the builder: "a colour, number, counter kind, keyword, face, type, protection, name, replacement or cost reduction with one legal answer: that answer. A card or player an effect has you choose, a mode, a new target or a spell to cast: always asked, even with one (spec 0104)". This reverses part of that row as accepted at the Phase 8 exit gate; this spec is the owner's decision for it.
- **The card's own words.** The prompt of every question above is the effect's own description, built like `targetPrompt` (the ability's `getDescription`, a trigger's text, "Next, you'll..." where a cost follows), instead of Forge's title. Appetite's ChangeZone sub-ability reads "Exile a nonland card with mana value 4 or greater" (or whatever Forge's own description of that sub-ability is: the words are Forge's, never written by Arena). The tray title for another player's hand stays the tray's ("Look at Bob's hand.").
- **Why a shown card can't be chosen.** For a choice from a hand or a pile where the tray also shows cards not offered, the worker sends, per shown card, Forge's reason in plain words where Forge's own valid-card test names it: the `ChangeType` restriction (`Card.cmcGE4` → "mana value 1", from the card's current mana value; `nonLand` → "a land"), read with Forge's `CardView`/`Card` values, never parsed from Oracle text (ARCH-006). Where no reason can be read, "can't be chosen" as today. `notOffered` on the page stops inferring and shows the worker's words (UI-001). The shown cards travel **with the question** (in its `arrange`, beside the offered ones), not only through `board.reveal`: once `HAND_EXILE` is a reported kind, `tellRevealed` may skip the chooser's reveal (`ActionReports.choosingNow`), and the tray's `shownOnly` would then lose the dimmed cards. Builder check: the two-card Appetite case still shows the whole hand.
- **The victim's report (`ActionReports`).** A new kind, `HAND_EXILE`: a card moved from a player's hand to exile (or any zone) by an effect whose chooser is another player (Appetite for Brains, Castigate, Agonizing Remorse, Brain Maggot, Kitesail Freebooter, Counterbore, Covetous Urge, Cackling Observer). `kindOf` gives it for a `ChangeZone` with `Origin$ Hand`, `DefinedPlayer`/`Chooser` naming someone other than the card's owner. `tells` sends it to the hand's owner only; the chooser gets none (`choosingNow`, Amendment 13 item 7). Words: "Alice exiled your Hill Giant." (`PlainWords`), the card's picture and "→ exile". Kitesail Freebooter's "until it leaves" is still the same window ("Alice exiled your Lightning Bolt."). A spectator gets what `tells` gives a spectator for any reported kind today (builder confirms; no hand card that Forge did not show to all).
- **`PlayLog.moved`, `"hand-exile"`**: the actor is the effect's controller when it is not the card's owner: "Alice exiled Hill Giant from Bob's hand (Appetite for Brains)"; a player's own card stays "Bob exiled Force of Will from their hand".
- **Reveals stay until closed (`Causes`).** `Causes.Listener.on` no longer clears plain reveals at `GameEventTurnBegan`; a plain reveal ends when its seat closes it (the same close message report windows use) or the game ends. A newer reveal for the same seat still replaces the older one as today (spec 0045) — decision default, the owner can change it to "gathered under it" like reports. The turn-0 exception kept by that `removeIf` (opening-hand reveals) stays as it is.

### Server

- `AskingWords.doingWord`: a choice from another player's hand reads "Choosing a card from your hand" on that player's waiting line (from the tray's `arrange` zone and owner, not from English prompt text, PROTO-006).

### Protocol

`protocol/README.md`, `match.ts`: per shown-but-not-offered card in a choice, `why` (the worker's words); the `HAND_EXILE` report kind (no new fields beyond a report's). The plain reveal's close uses the report close message.

### Page

- `CardTrays.tsx` `HiddenZoneTray`: a single offered card is lit and the tray waits for its click (no auto-answer anywhere on the page: grep for a one-option auto-click in `cardPlans.ts`/`CardTrays.tsx` and remove any). The reason under a dimmed card is the worker's `why`.
- `GameScreen.tsx`: `latestReveal` / `reveal` no longer drop a plain reveal at a turn change; `closeReports` closes it.
- The board: a single on-table candidate breathes gold (the existing choosable look) and its click answers; the bubble carries the card's words.

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0104-A | Worker: Appetite for Brains against a hand with one card of mana value 4 or more: Alice IS asked, one option, required, prompt in Forge's own words for the exile sub-ability; with two, two options; with none, no question and a plain reveal of the hand | worker unit; new Lab `check-always-choose.py`, scenario `appetite-one` / `appetite-two` / `appetite-none` |
| F-0104-B | Worker: Divine Reckoning with one creature, Anointed Peacekeeper's opponent, a one-card graveyard return, Izzet Charm with one legal mode, Spellskite with one new target, an adventure cast for free with one half: each asked with one option. `chooseColor` with one colour and `getAbilityToPlay` with one ability: not asked | Lab `check-always-choose.py` (one scenario each) |
| F-0104-C | Worker: the dimmed cards' `why`: Lightning Bolt "mana value 1", Island "a land"; a card Forge gives no readable reason for: "can't be chosen" | worker unit |
| F-0104-D | Worker: `HAND_EXILE` report reaches Bob only ("Alice exiled your Hill Giant."), never Alice; Bob's and Alice's play log line names Alice and Bob's hand | worker unit; Lab trace read by `check-always-choose.py` |
| F-0104-E | **Hidden information (HID-001..005).** (1) Both seats (HID-003): Alice's frames hold Bob's hand only from Forge's reveal to her (the tray, the reveal) and never any card Forge did not reveal; Bob's frames hold no tray for Alice's choice and no `why` lines (they describe his own hand only to Alice). (2) A spectator's frames: no tray, no `why`. (3) Bob's report holds his own exiled card only. (4) Presentation (HID-005): Bob's page has no element for Alice's tray in its DOM, and his waiting line is the same "Choosing a card from your hand" whether one or two cards fit (the count of qualifying cards does not leak by timing or words). (5) Bite (HID-004): with the per-seat filter on the tray removed, the check fails | `check-hidden-tops.py` (extended) over the Lab traces; the real-click game's guest page; the bite recorded in As built |
| F-0104-F | Worker: a plain reveal survives the next turn line and is gone after its seat closes it; a newer reveal replaces it | worker unit; Lab |
| F-0104-G | Page: the one-option tray from a real snapshot: Hill Giant lit, four dimmed with the worker's reasons, nothing answered until a real click; after the click the caster's screen has no report | `fixes0104screen.test.tsx` (the real game screen from a real snapshot, TEST-003) |
| F-0104-H | Page: a plain reveal stays across a turn-change snapshot and closes on Close | `fixes0104screen.test.tsx` |
| F-0104-I | Real game (TEST-012), below | `match-always-choose.spec.ts` |

**TEST-004 (bites):** one per row above; always one for the hidden-information guard (F-0104-E). About a dozen page and half a dozen worker mutations in all (TEST-004 scope).

**Real-click game (TEST-012).** One game with 0098's exact deal: the host casts Appetite for Brains with the guest holding one card of mana value 4 or more; the host's tray shows the guest's hand with one card lit and the rest dimmed with reasons; the host **really clicks** the lit tile (the click point clamped inside the visible part of the card with `hitPoint`, as `match-spell-choices.spec.ts` does; the builder may move `hitPoint` into `match-helpers.ts` for 0104-0107 to share); the guest's page shows the report window and it is still there after the next turn begins; the guest **really clicks** Close. The test waits on states (the tray present, the report present, the turn number changed), never on an animation frame or a fixed short delay, so CI's slower frames cannot break it. Clip: one normal-speed clip of each seat (what they may see differs).

## Risks

- **Hidden information.** Asking shows the tray: it goes to the chooser's seat only, as the two-card case already does (RUN). The new `why` words describe cards of Bob's hand to Alice; they are sent only with the tray, to the chooser, and only for cards Forge revealed to her. F-0104-E.
- **More clicks.** Each is a real moment; edicts already work this way. The Lab's scripted answers ("first option" for a required choice) meet one more question in scenarios that relied on the shortcut; any that stall need a policy line, not a worker change. Run the full Lab once locally before pushing (TEST-013 says CI is the RUN, but a Lab stall is cheaper to find here).
- **Speed budgets.** None touched (no new animation). `match-speed.spec.ts` unchanged.
- **The jump check.** No new movement; the hand-exile glide is 0081's.
- **e2e timing.** Browser specs whose scripted games cast a "choose one" card now meet a question they did not before. `match-helpers.ts`'s `answerCardTray` / `answer` already handle a tray; grep the e2e decks for the affected families and run those specs.
- **Reveals that stay.** A long game could pile up unclosed reveals: a newer one replaces the older (default above), so there is at most one per seat.

## Build order notes

First of the four (0104 → 0105 → 0106 → 0107, one at a time). It changes no timing, so 0105 and 0106's timing changes land on top of a settled question flow. Inside: the worker shortcuts and `RULES_COVERAGE.md` row first (with the Lab scenarios), then the card's words and `why`, then `HAND_EXILE` and the play-log line, then the reveal lifetime, then the page, then the real-click game.

## Amendments

None yet.

*Owner confirmed 2026-11-19: the caster gets no window (only the victim), per the house rule.*
