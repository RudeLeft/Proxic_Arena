# 0109 — Windows that say less: the short target window beside your own big card, no report window for what the animation showed, the report dim only on a click

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase.
**Owner decisions** (owner feedback batch 2026-11-19b, `Owner feedback 2026-11-19b decisions.md`; canvas `frontend/zz-canvas/feedback-1119b.html`):

- Item 5, canvas section "5", option **A**: **"Short window.** While your own spell's big card shows, the window only says what to do. The "Click a" hint gets fixed so it is no longer cut at the first comma. Triggers, abilities, copies and the other player's view keep the card's text." The owner asked whether the window adds value at all; it was answered in chat (several targets, "up to" Done/Skip, targets off the table), so the window stays.
- Item 7, canvas section "7", option **A**: **"Yes, that rule.** No report window when the cause's arrow pointed at the card, it landed somewhere visible, and nothing was hidden. Covers bounce, return, counter and control change. The play log keeps a line for each."
- Item 13, canvas section "13", option **A**: "Click a picture to dim the table to that card. Click it again, click the table, or close the window to undim. Pointing and the top part do nothing."

- Item 13's read-through (asked 2026-11-20, by prompt): **"Remove it"** (against the recommendation to keep it). No automatic read-through: nothing ever dims the table unless the player clicks a picture.
- **Approved 2026-11-20** (owner, by prompt: "Approve all."). Build 0108 → 0115 in that order, one at a time, then release them together as 1.75.0. The defaults below were in the spec the owner approved and stand.

Research: `Owner feedback 2026-11-19b research B.md` items 5 and 7 (in the working folder); item 13 from the canvas's own research note (section "13") and the code below.

## Why (researched)

Read at main 1f813795 (1.74.0).

- **The target window repeats the card** (SOURCE, research B item 5). `QuestionWindows.tsx` `TableQuestionWindow` (spells and abilities) and `TriggerWindows.tsx` `CopyTargetWindow` print `matchText.tsx` `targetWords(decision.prompt).said`: the worker's `MatchController.targetPrompt` (the card's own sentence) with "target X" made "a X". Spec 0055 approved this for a trigger (Boggart Shenanigans), where no card is shown. The big card (`CastingCard.tsx`, from `ViewerSnapshot`'s `casting` list) shows **only for a spell being cast**: a trigger or an activated ability chooses its targets with no big card.
- **"Click a non-Vampire."** (SOURCE; SEEN in the owner's screenshot 4). `matchText.tsx` `targetWords` ends the noun at the first `[.,;]` (`NOUN_END`), so "target non-Vampire, non-Werewolf, non-Zombie creature" becomes "a non-Vampire".
- **The bounce window** (SOURCE, research B item 7). Mist Raven's trigger is Forge's `ChangeZone` to a hand, `ActionReports.kindOf` gives `Kind.BOUNCE`, `ActionReports.bounced` writes "{who} returned {your Grizzly Bears} to {your} hand.", and `ActionReports.tells` sends it to the card's owner when someone else did it (`case BOUNCE -> reader == subject && reader != actor`), shown by `RevealTray.tsx`. The same holds for `RETURN` (Raise Dead, Unearth), `COUNTER` (Counterspell) and `CONTROL` (Act of Treason), each told to the players who did not act (spec 0097 already removed the actor's own window). Research B's table lists which kinds the animation can explain and which it can't (a library bounce, phasing, fizzles, every hidden-card kind).
- **The play log** (SOURCE). `PlayLog.moved` writes a line for every card move a player can see, report or not; the report window is extra.
- **The dim flicker** (SOURCE, canvas "13"). Spec 0103 items 1-2 made the report window point at the table: `RevealTray.tsx` `ReportBody`'s top part has `onMouseEnter={() => onPoint(reveal.cards)}`, each picture `onMouseEnter={() => onPoint([card])}`, each gathered row (`ReportRow`) `onPoint(true)`, and `RevealTray`'s `point` calls `reportLight.ts` `lightOn` / `lightOff`. Moving from the top part to a picture, or between pictures, crosses a gap with no handler, so the table goes dim, bright, dim. The canvas's note: nothing else shares this dim (trays and choosing never dim the table; the hand's split-second dim is separate), so the change touches report windows only. The read-through (`RevealTray`, "Spec 0103, item 2 -- the read-through") lights each report of a gathered window in turn, once, with no pointing.

## What the player sees

Alice is you (bottom), Bob (RudeLeft in the owner's game) the other player.

1. **Your own spell** (canvas "5", option A). Alice casts Victim of Night. The big card shows its words. The window beside it says only "Victim of Night" (its "from" line), the title "Choose a target" and one line: "Choose a creature that isn't a Vampire, Werewolf or Zombie." (the canvas's words). With "up to" targets the Done / Skip button is there as today; with two targets, "Choose up to one more target".
2. **A trigger keeps its sentence.** Boggart Shenanigans' trigger: no big card, so the window keeps "Boggart Shenanigans may deal 1 damage to a player or planeswalker." and its hint. The same for an ability of a card on the table, a copy (`CopyTargetWindow`), and anything the other player sees.
3. **The hint, everywhere** (canvas "5", "The hint fixed"). Wherever the hint shows, it names the whole kind: "Click a creature that isn't a Vampire, Werewolf or Zombie." (not "Click a non-Vampire.").
4. **Mist Raven** (canvas "7", option A). Bob plays Mist Raven; its trigger goes on the stack, its line points at Alice's Chapel Geist, and Chapel Geist flies back to her hand. No window opens. Her play log reads "RudeLeft returned your Chapel Geist to your hand (Mist Raven)." The same with no window: Unsummon, Raise Dead on a card in Bob's graveyard aimed by its arrow, Counterspell on her spell (arrow, the spell to her graveyard), Act of Treason taking her creature (arrow, the card crossing the table).
5. **Still a window** (canvas "7"): Griptide (top of the library can't be seen: "RudeLeft put your Serra Angel on top of your library."), Duress, a search, a spell that fizzles, Teferi's Protection, an effect with no card on the stack (a static ability, a replacement), and one effect sending cards to different places.
6. **The report dim** (canvas "13", option A; no read-through, owner 2026-11-20). RudeLeft brings Abattoir Ghoul and Diregraf Captain back from his graveyard; Alice gets the report window. Moving the pointer over it does nothing to the table. She clicks Diregraf Captain's picture: the table dims to that card. She clicks it again, or clicks the empty table, or closes the window: the table comes back. Clicking Abattoir Ghoul's picture while dimmed moves the dim to it. The window's top part does nothing.

## Changes

### Item 5 (page)

- `QuestionWindows.tsx` `TableQuestionWindow`: when the question is a target choice for the asked player's own spell **and** that spell's big card is on screen (the board's `casting` entry for this decision's card, which `GameScreen.tsx` already holds for `CastingCard`; from the snapshot, never from prompt text, PROTO-006), the window drops the card's sentence (`targetWords(...).said`) and shows the title and one line built from the target phrase ("Choose {a / an / two / up to one} {noun}."). Everything else (several targets, `targetsTitle`, Done / Skip, the chosen line, Peek, Cancel) is unchanged.
- Default (in the approved spec; stands): a modal spell (Izzet Charm, escalate) keeps the line naming the mode being targeted now, because the big card shows every mode (research B's table: "Yes, for the chosen mode only"). A split card, adventure, kicker or X spell gets the short window (the big card shows the half being cast, spec 0100's marks show X).
- `matchText.tsx` `targetWords`: the noun phrase runs to the end of the target phrase, not to the first comma. A run of "non-A, non-B[,] [or] non-C" before the noun becomes "{noun} that isn't a A, B or C" (the canvas's words). When the phrase can't be read that way, the hint is "Click a highlighted card." (presentation only; `targetWords` already shapes the worker's words for display and decides nothing).
- **Out of this item:** `TriggerWindows.tsx` `CopyTargetWindow` and the other player's view, unchanged (owner: they keep the card's text).

### Item 7 (worker)

- `ActionReports.tells` (or the report's build) drops the window for `BOUNCE`, `RETURN`, `COUNTER` and `CONTROL` when **all** of research B's five tests hold, each read from Forge's state for the resolving ability, not from words:
  1. **The cause was visible**: the effect is a spell or ability that was on the stack with the moved card among its `targets` (the arrow). A static ability, a replacement effect, a state-based action or an untargeted effect keeps the window.
  2. **It landed where the reader can see it**: a hand, a graveyard, exile face up, the battlefield, or (for `CONTROL`) the other side. Into a library (top, bottom, shuffled) or face down keeps the window.
  3. **Nothing hidden**: no card looked at, chosen from a hidden zone or revealed in the same resolution (`Causes` reveals, `choosingNow`).
  4. **One visible result**: every card the report would show went to the same kind of place. Mixed destinations ("one to the top of its owner's library") keep the window; an extra draw or life change that shows on the table does not count against it.
  5. **Not a non-event**: `FIZZLE`, "did nothing" and "found nothing" keep their windows (they are other kinds; listed so the builder does not touch them).
- When the window is dropped, nothing else changes: the play-log line (`PlayLog.moved`) is written for every reader as today. A gathered window (spec 0088 Q3 C) simply does not gain the dropped report.
- Default (in the approved spec; stands): `CONTROL`'s "until end of turn" is shown by the card crossing back at the end of the turn and by the play log, so Act of Treason gets no window.

### Item 13 (page)

- `RevealTray.tsx`: the top part's and the pictures' `onMouseEnter` / `onMouseLeave` lighting go, and `ReportRow`'s `onPoint` stops lighting the table (a row still opens on click). A **click** on a picture calls `point(key, [card])`; a click on the lit picture again, a click on the table outside any window (one listener on the game screen while dimmed), or closing the window calls `point(key, null)`. A click on another picture moves the dim. Keyboard: Enter or Space on a focused picture does the same as a click; Esc closes the window as today.
- **The read-through goes** (owner 2026-11-20, "Remove it"): `RevealTray`'s read-through (spec 0103 item 2, the timers that light each gathered report in turn) is removed, with its order badges' lighting role; the numbered rows stay. Nothing lights or dims the table except a click on a picture.

## Rules and boundaries

- **HID-001/005 (item 7):** removing a window removes text only; tests 2 and 3 keep every window that carries a hidden-card fact (a library position, a face-down card, a look). The rule is the same for both seats (`tells` already never tells the actor).
- **PROTO-006 (item 5):** the short window keys on the snapshot's `casting` entry and the decision's kind, never on the prompt's English.
- **Approved specs amended by this one (PHASE-002):** spec 0055 (target windows say what they do: kept for triggers, shortened for your own cast spell), spec 0075 (the bounce report: kept only where the five tests fail), spec 0103 items 1-2 (pointing lights the table: now a click; the read-through removed). This spec, once approved, is the owner's decision for each.
- **House rules kept:** no pills, no top notices; windows only when the graphics can't explain (2026-11-15).

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0109-A | Page: Victim of Night's target question with its `casting` entry: the window has the title and the one short line, no card sentence; the same question without a `casting` entry (an ability) keeps the sentence; a trigger's window keeps it; Izzet Charm keeps its mode line | `fixes0109screen.test.tsx` (the real game screen from a Lab board and question, TEST-003) |
| F-0109-B | Page: `targetWords` on "target non-Vampire, non-Werewolf, non-Zombie creature" → "Click a creature that isn't a Vampire, Werewolf or Zombie."; "target creature or planeswalker", "target artifact, enchantment, or land", "two target creatures", "up to one target creature" each read whole; an unreadable phrase → "Click a highlighted card." | `matchText.test.ts` (new) |
| F-0109-C | Worker: Mist Raven, Unsummon, Raise Dead (aimed), Counterspell and Act of Treason: no report for the other player, a play-log line for both seats | new Lab `check-quiet-reports.py`, one scenario each |
| F-0109-D | Worker: Griptide (library), Evacuation-style untargeted mass bounce (test 1 fails: no arrow), a counter that also exiles from a library, a fizzle: the window stays | `check-quiet-reports.py` `griptide`, `untargeted`, `mixed`, `fizzle` |
| F-0109-E | Hidden information: in every `check-quiet-reports` trace, no report removed carried a hidden fact (the dropped reports' cards are all on the reader's board after the move); both seats' frames read (HID-003); `check-hidden-tops.py` and `check-hidden-log.py` clean | the Lab traces; bite: with test 2 removed, `griptide` loses its window and the check fails |
| F-0109-F | Page: the report window: pointer over the top part and the pictures leaves the table undimmed; a click on a picture dims it to that card; a second click, a click on the table, or Close undims; a click on another picture moves the dim; keyboard Enter does the same; a gathered window of three reports, left alone for five seconds, never dims the table (no read-through) | `fixes0109screen.test.tsx` (real report from a Lab board) |
| F-0109-G | Real-click game (TEST-012), below | `match-quiet-windows.spec.ts` |

**TEST-004 (bites):** the short window shown without a `casting` entry (A fails on the ability); the comma cut restored (B fails); each of the five tests removed in turn (C or D fails; test 2's bite is the HID-004 bite for F-0109-E); the hover lighting restored (F fails); the read-through restored (F fails on the untouched gathered window); the table click not undimming (F fails). About eight page and six worker mutations.

**Real-click game (TEST-012).** One game with spec 0098's exact deal. (1) The host **really clicks** Victim of Night in hand; the window beside the big card has the title and the short line; the host really clicks the guest's creature, pays, and it is destroyed. (2) The guest casts Mist Raven at the host's creature; the host's page shows the card return to hand and no report window opens (wait for the hand count to change, then assert no `.gs-report` window within the report's usual arrival time), and the host's play log has the line. (3) The guest casts a gathered-report spell (Raise Dead-style return of two cards for the host's report window; or the host's own Griptide on the guest, for the guest's window): the host points across the window and the table stays bright (no dim class on the screen); the host really clicks a picture and the table dims to that card; really clicks the table and it undims. Waits on states, never a fixed short delay. Clip: one normal-speed clip per seat.

## Out of scope

- Windows for other kinds (`MILL`, `PHASE`, `DISCARD`, hidden-card kinds): unchanged.
- The wording of the remaining report windows and the play log (spec 0113).
- Where the big card sits while you target (spec 0110). Item 5's short window is built against today's middle placement and must still be right after 0110 moves the card (0110 re-runs F-0109-A).

## Open questions

None. The read-through was answered 2026-11-20: removed (Owner decisions).

## Build order notes

After 0108. Item 13 first (page only), then item 5 (page), then item 7 (worker and Lab), then the real-click game.

## Amendments

None yet.
