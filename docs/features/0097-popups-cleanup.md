# 0097 — Pop-ups clean-up: no stuck boxes, grey notices become proper windows, fewer windows for the player who acted

**Status:** Approved 2026-11-16 (owner, by prompt, on the canvas "Pop-ups audit 2026-11-16", https://claude.ai/artifact/WUjW4sAmGEDFVUqTBmQPyr, sections 1-4).
**Owner decisions:** section 1 **A · on the act button**; sections 2-3 **approve all four**; section 4 **all three changes** (no window for your own counter/mill/bounce/phase; your own reveal to the other player only; drop "Bob is casting a spell…").

The pop-ups audit owed since 2026-11-12 (memory "explain card actions in windows, not pills"), redone on 2026-11-16 against current main.

## Why (researched)

- **Stuck "Nothing you can play this turn".** It is a grey `NoticeStack` card (worker `host.note`, `PriorityStops.java` ~185-237, `MatchController.java` ~730-735; page `useGameMessages`, `GameScreen.tsx` ~5126-5158; `NoticeStack.tsx`; `notices.ts`). Two bugs: (A) `NoticeStack` pauses fades while `pointed`; when a clickable page notice (invitation, "declined", "Reconnecting") is removed under the pointer, no `mouseleave` arrives, `pointed` stays true, and every later grey card mounts paused forever (no ×, click-through) — reproduced in jsdom; (B) on a fresh mount of the game screen `seenTotal` is null, so all kept notices (up to 6 for the whole match) replay as new.
- Other grey notices that belong elsewhere: N2 "{Card}: you can't pay {cost}, so it was skipped." (`MatchController.java` ~916); N10 "The game restarted. This is game {n} of the match." (`GameHost.java` ~1442-1449); N8/N9 refused attacks and blocks (`CombatChoices.java` ~185-199); N3 "{Name} cannot be named here." (`MatchController.java` ~4571).
- Dead or fallback-only paths: N5/N6/N7 `host.note` fallbacks (`MatchController.java` ~5879, ~5920, ~6052-6058) and the grave word pill (`Board.tsx` ~7311-7333; `Moves.java` ~107-139 `said`), never shown.
- Windows to the player who acted: `ActionReports` `toBoth` (~161-163, `tells` ~1406) gives the actor a window for MILL, COUNTER, RETURN and PHASE when the subject is the other player; the plain reveal tray (0045) shows a revealer their own reveal; "{Bob} is casting a spell…" under the rising back (`CastingCard.tsx` ~358-369).

## Built

1. **No stuck notices.** `NoticeStack` resets its hover pause when the hovered card goes or the stack empties; on the first board after mount the kept notices count as already seen (no replay).
2. **"Nothing you can play" on the act button (A).** The worker no longer sends the grey line; the snapshot carries the auto-pass state and the act button reads "Passing" with "Nothing to play · {N lands, …}" while the turn auto-passes, gone at the turn line. If attacks are possible the button still offers them.
3. **Unpayable trigger → FIZZLE report** to both (0079's precedent): "Bob's Lightning Rift did nothing: he couldn't pay {1}." / "Your Lightning Rift did nothing: you couldn't pay {1}." Grey line removed.
4. **Game restart → report window** to the other player only: "Bob restarted the game. This is game 2." with the card's picture (Karn Liberated). Grey line removed.
5. **Refused attack / block** words move to the combat button's note (where "can't go there" already shows), attackers or blockers still selected. Grey line removed.
6. **A refused name** shows in red inside the naming window that is asking again. Grey line removed.
7. **Fewer windows for the actor** (the 0086 A4 / 0089 A1 rule): MILL, COUNTER, RETURN and PHASE no longer give a window to the player who did it when the subject is the other player; FIZZLE still tells both (0079). A plain reveal (0045 tray) goes to the other player only, not the revealer.
8. **No "Bob is casting a spell…" caption** under the rising back.
9. **Dead paths removed**: the N5/N6/N7 fallbacks (logged only) and the grave word pill (page and worker `said`).
10. Kept as system messages: connection, away, errors, result, loading, "watching", report dialog, ante; the 0058 "Nothing to do with this card right now" note; state words (TAPPED, Still to pay, the stack caption).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0097-A | Close an invitation under the pointer, then a notice arrives: it fades; reload mid-game: no old notice replays | page test |
| F-0097-B | Auto-passed turn: the act button says why; nothing at the top right; gone at the next turn | page test; real-game test (TEST-012) |
| F-0097-C | Unpayable trigger and Karn restart give the windows above, to the right players | worker test; Lab |
| F-0097-D | Refused attack and refused name show where the player acted | page test; real-game test |
| F-0097-E | Counterspell, mill, bounce, phase: no window for the actor; reveal: other player only; no casting caption | worker test; page test; Lab hidden checks |

## Amendments
