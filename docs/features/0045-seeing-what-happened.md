# 0045 — Seeing what happened: reveals, triggers, counters, an empty library

**Status:** Approved 2026-10-31
**Owner decisions:** 2026-10-31, from the canvas
https://claude.ai/artifact/9zAJGg3MBjLo59aG2KjsZ5 (reports 1, 2, 3, 6):
1A, 2A, 3A, 6A.

## What the player sees

1. **Where a counter came from.** Pointing at a counter on a card says
   what put it there, in plain words: "+1/+1 from Ajani's Pridemate's
   trigger: you gained 1 life (Soul Warden)". From the game's own log.
2. **An empty library.** The Library tile turns gold at 3 or fewer cards
   and red at 0: "Empty: your next draw loses the game". The game-over box
   says why a player lost: "Pat lost: had to draw from an empty library".
3. **Revealed cards** (Goblin Ringleader, and every reveal): the cards
   face up for every player they were shown to, in the tray from the
   bottom — "Goblin Ringleader revealed:" — each marked where it went
   ("→ hand", "→ bottom"). It stays until closed or the game moves on;
   the cards then fly there. Today: a line of text that fades.
4. **A trigger on the stack.** Right-click: the card it came from, large,
   beside what it does, why it triggered, its target, whose it is, its
   place in the order and how many copies. Pointing at a stack card shows
   what it does as a small label.

## Found (2026-10-31, tested against the worker)

- Pridemate entered 2/2 alone and 3/3 with Soul Warden out: the rules are
  right; nothing said why.
- A 9-card deck: library 0 on turn 5, played on, lost on turn 7 (CR
  704.5b): right; nothing warned or explained.
- Ringleader's reveal reached both players as a fading notice "Looking at
  your library: …"; the bottom order was asked.
- Right-clicking a stack trigger showed "No picture" and its name.

## Rules and boundaries

Reveals show only what Forge revealed, to whom it revealed it (the worker's
reveal is already per player). Counter origins come from Forge's log, not
guesses. The empty-library warning states a rule; the game ends exactly as
Forge decides.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0045-A | Pointing at Pridemate's counter names the lifegain that caused it | browser |
| F-0045-B | The library tile warns at 3 and 0; the game-over box gives the reason | unit + browser |
| F-0045-C | Ringleader's four cards show face up to both players, marked hand/bottom | Lab + browser + screenshots |
| F-0045-D | Right-clicking a stack trigger shows its words, cause, target and owner | browser + screenshot |

## Built (2026-10-31)

- **Counters.** Battlefield cards show their counters as a small chip
  ("+1/+1"); pointing at it, and the right-click close-up, say where the
  last ones came from. The worker records, as Forge puts a counter on,
  what was resolving then and why that triggered (Forge's triggering
  objects; a life gain also names what was resolving when the life was
  gained -- Soul Warden). Counters put on by nothing on the stack (a card
  entering with them) say nothing more: Forge says nothing more.
- **Empty library.** The Library tile is gold at 3 or fewer, red at 0
  ("Empty: your next draw loses the game"). The game's end carries
  Forge's GameLossReason (`lossReason`, worker -> server -> page), so the
  game-over box says "Pat lost: had to draw from an empty library".
- **Reveals.** Forge's reveal to each player becomes a tray of the cards,
  face up, titled by the card resolving ("Goblin Ringleader revealed:"),
  each marked where it went once the effect has finished; at the top of
  the table while a question's window holds the bottom; gone at the next
  turn or when closed. The fading line it replaces is not shown twice.
  The cards do not fly to where they went: the tray says it instead.
- **Stack close-up.** Right-click: the source card large, what it does
  (triggers and abilities; a spell's rules text is not in the snapshot),
  why it triggered, its targets, whose, its place in the order and its
  copies. Pointing at a stack card shows what it does under the stack.
- Found while building: the card being cast (spec 0042) never had its
  picture -- the server added pictures only to battlefield, hand and
  stack cards. Revealed cards and the cast card now carry theirs.
- Found while building: two cards put on the bottom together were marked
  "bottom" and "library" (only the last card counted as the bottom); the
  Lab check had been lenient about it and is now strict.
- Evidence: `scripts/check-what-happened.py` (Lab: counters, decking,
  ringleader), `frontend/e2e/match-what-happened.spec.ts` (deck
  `protocol/fixtures/what-happened-deck`), unit tests in
  `SeeingWhatHappened.test.ts` and `stops.test.ts`, server tests in
  `MatchArtTest` and `WorkerFramesTest`, screenshots from both seats.

## Amendments

None.
