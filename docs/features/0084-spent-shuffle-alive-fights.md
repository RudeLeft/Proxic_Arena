# 0084 — Spent not killed, library shuffles, coming alive, fights

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "gaps-moves-1113", https://claude.ai/artifact/Q5L7y6jZse3fMRmmJjNGZn)
**Owner decisions:** 1 **A · fold and go** · 5 **A · the existing riffle** · 6 **B · power flows in** · 9 **A · the combat fight**.

Phase 10 A-22, from the deep dive "Phase 10 graphical gaps.md" (2026-11-13), items 1, 5, 6 and 9.

## Why

- Any table card going to a graveyard gets the "defeated" look (`Board.tsx` ~4705, 4717-4724, 4824-4829), whatever the move's `why`. Three at once set off the board-wipe flash (`WIPE_AT` = 3, `Board.tsx` ~4834, `motion.ts` ~449). The worker already sends "sacrificed" (`Moves.java` ~126-131). An ability whose card was sacrificed to pay for it fades in at the stack spot (Sinister Concoction, Agent of Kotis).
- The riffle plays only for a card shuffled *into* a library (`Board.tsx` ~3358-3386, Amendment 18); a library shuffled on its own shows nothing.
- A vehicle crewed or a land animated: P/T appears with no change shown, since the old P/T was null (`sizeTicks.ts` ~86-87, 129).
- Fight and bite spells: an older burst and number at the target only (`Board.tsx` ~2636-2660).

## Built

1. **Spent, not killed (A).**
   - A permanent sacrificed or used up as a cost or by its own ability dims, folds flat and slips to its owner's graveyard. This covers Treasure, Clue, Food, Blood, fetch lands, Evolving Wilds, a finished Saga and a sacrifice outlet's fodder paid as a cost.
   - A token vanishes at the graveyard, so the number stays; a card ticks the number.
   - A Treasure gives a small coin spark as its mana flies.
   - Never the defeated look, never the board-wipe flash. Several spent at once never count toward a wipe.
   - An ability whose source was sacrificed to pay for it lifts off the card as it goes, never fading in at the stack spot.
   - A creature destroyed or dying still gets the defeated look. Where the game's record cannot tell spent from killed, keep the defeated look and record the case.
2. **Library shuffles (A).**
   - Whenever a library is shuffled (fetch land, tutor, Rampant Growth), the existing six-back riffle plays on that player's library pile, for both seats.
   - On a pile at the top of the screen it fans downward so it stays on screen.
   - Shuffling a card in keeps today's look.
3. **Comes alive (B).**
   - When a vehicle is crewed or a land or other permanent becomes a creature, gold motes run from what made it alive into the card: the crewing creatures, which tap, or the permanent's own ability.
   - A gold ring breathes, it slides to the creature line, and its P/T rises in as a green number (0078).
   - At end of turn a grey ring closes in, a grey P/T rises off, and it slides back.
4. **Fights (A).**
   - Fight spells (Prey Upon) use the combat fight: dim, rear back, lunge to meet edge to edge, claw slashes, red numbers, knocked back, step back, then any loser breaks.
   - Bite spells (Ram Through) use the same with only the biter lunging and striking.
5. A click hurries everything (A-00). Reduce motion: no movement; numbers and counts still change.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0084-A | Three Treasures pay for a spell: coin sparks, fold and go, ×3 ticks down, no wipe flash, no defeated look; a creature killed in the same game still gets the defeated look | worker test if needed; page test; Lab; jump check; clip |
| F-0084-B | Evolving Wilds and a fetch land: fold and go, land comes out tapped, library riffles | page test; Lab; clip |
| F-0084-C | Sinister Concoction / Agent of Kotis: the ability lifts off the sacrificed card | page test; jump check; clip |
| F-0084-D | Rampant Growth and a tutor: riffle on the right library, both seats | page test; Lab; clip |
| F-0084-E | Smuggler's Copter crewed, Mutavault animated: motes from the cause, rising P/T, grey reverse at end of turn | page test; Lab; clip |
| F-0084-F | Prey Upon and Ram Through: combat fight look | page test; Lab; clip |

## Amendments

### As built (2026-11-13)

Built as approved (1 A, 5 A, 6 B, 9 A); unreleased.

**Worker** (`Spent.java`, `GameHost.java`, `Moves.java`).
- **Spent or killed, from the game's own record (never a card name).** Forge fires its "sacrificed" event inside the sacrifice, just before the move. At that moment a sacrifice is **spent** when Forge is paying a cost (its cost-payment stack is not empty: a Treasure, Clue, Food, fetch land, Evolving Wilds, Village Rites' or Fling's creature, a sacrifice outlet's fodder), when the spell or ability resolving IS the sacrificed card (Ball Lightning's end step, a failed echo), or when nothing resolves and no cost is paid and the card is a Saga (the rules ending it). Anything else is not spent: Diabolic Edict, Innocent Blood, Liliana's −2, annihilator (another card's effect made its controller sacrifice it). The move off the battlefield then says `spent: true` (with the card only). This is how the review's concern ("the game cannot tell a cost from an edict") was answered: Forge does record it, in the cost-payment stack; no case was found where the record cannot tell. If reading it ever fails, the answer is "not spent" and the defeated look stays.
- `shuffles`: the seats whose library Forge shuffled this round (public). The game's own opening shuffles arrive with the first boards, which the page never animates.
- `crewed`: each vehicle crewed this round and the creatures tapped to crew it (Forge's paid "Tapped" list, what it records as the crew). Public.
- A fight or bite spell's damage wave says `fight: true` with `fights` in the combat step's shape: a fight (Forge's Fight effect anywhere in the resolving spell's chain: Prey Upon) has the other creature as its blocker, so both strike; a bite (a DealDamage whose damage source is another creature: Ram Through) has no blockers. A creature pinging with its own ability (Prodigal Sorcerer) is not a bite.
- Protocol: `protocol/README.md`, `MATCH_PROTOCOL.md`. `HiddenIds` strips `spent` with the card, like `why`.

**Page.**
- **1 A, fold and go** (`motion.ts` fate "spent"): the card dims and greys and folds flat to 0.14 of its height over 0.32 s, then glides flat to its owner's graveyard, fading as it arrives (a token vanishes there, so the number stays; a card ticks it). No flash, shake or cracks. Several spent in one update go 0.22 s apart. Spent cards never count toward the board-wipe flash, and never wait for it. A spent Treasure (by its type line) gives a coin spark: a gold coin flips up off it as it starts to fold (0.6 s). Out of a pile it peels off first (0073). In the Lab game the three Treasures were each sacrificed in their own payment step, so they leave one board at a time, ×3 → ×2 → gone, each with its mana ball.
- **The ability lifts off its card.** An ability or trigger whose card left the table as it was played (fromSnapshot's `leftFrom`) rises from where the card was last drawn, as the canvas's lift: never a slide-in at the stack spot. This covers every card that left the battlefield in that update (a Clue, Sinister Concoction, Evolving Wilds, Village Rites' creature, Karn at 0 loyalty) and a card from your own hand (cycling, channel), because both were drawn on the board before. **Not covered:** a card from the other player's hidden hand (no card id is sent for it; it still slides in) and a card used from a graveyard or exile pile (Agent of Kotis's Renew: the pile's cards are not drawn on the board; it still fades in). Recorded as the jump check's 2 remaining findings.
- **5 A, the riffle** on that player's library pile for any shuffle, for both seats: six backs, Amendment 18's frames. On the pile at the top of the screen it fans downward. When a card came out of that library in the same update it starts 0.85 s later, once the card has landed. A card shuffled in keeps today's riffle (one riffle, not two).
- **6 B, power flows in** (`alive.ts`): a permanent whose kind becomes "creature" (from the game) gets 12 gold motes per cause running into it over 0.5 s, from the creatures that crewed it (`crewed`) or from its own ability's stack spot; then a gold ring opens from it and it breathes (×1.08, gold glow, 0.35 s); only then does it slide to the creature line; its power/toughness pops in as a green "3/3" rises beside it. When it stops being a creature (end of turn): a grey ring closes in on it, a grey "3/3" rises off, and it slides back 0.3 s later.
- **9 A, the combat fight** for fight and bite spells: the combat fights code plays the `fights` (the table dims, they rear back and lunge to meet, claw slashes, red −N, knocked back, step back; the dead break after). A bite has only the biter lunging and striking. It starts once the spell's spark has reached them (0.38 s). There is no caption (combat's "Damage · ..." line): nothing on the table is words. Each card's power/toughness changes as its own blow lands, with its slashes and number (combat still changes them at the fight's end, unchanged). The spell itself resolves and goes to its graveyard first; it is no longer held on the stack through the fight.
- Everything is a Web Animation on the board's clock, so a click hurries it (A-00). Reduce motion: no fold, coin, riffle, motes, ring or lunge; the cards, counts and numbers are simply as the game says.

**Deviations.**
- A spent card folds from where it stands; out of a pile it first peels off (0073), as any card leaving a pile does. The canvas's Treasures had no peel.
- The Treasures in a real game leave in separate boards (Forge sacrifices each as its mana is paid), so the 0.22 s stagger only applies when several are spent in one board.
- The crew ability is still a stack card that resolves and flies into the vehicle (A-14's ability return) while the motes run; the canvas has no stack card for crewing.
- Fight spells have no caption; combat keeps its own.
- A fight or bite wave that also holds other damage (a second spell in the same round) plays only the fight; the other hits are not cracked. A bite with trample's excess to a player (Ram Through) shows that player's slash and the life shield's own change together. Neither came up in the Lab games.

**Evidence.**
- Worker: `SpentTest` (4) and the existing suite: `mvn -o test` green (158 run, 0 failed); `mvn -o package -DskipTests` built.
- New Lab script `scripts/check-spent.py`, added to CI's Lab list: treasures (three Treasures pay for Hill Giant: each `spent`, both seats; a Shocked Bear not), wilds (Evolving Wilds and Windswept Heath `spent`, two Forests in, the Wilds' tapped, `shuffles: [1]` both seats), clue (the Clue `spent`, its ability's source the Clue), rampant (Rampant Growth and Sylvan Scrying each `shuffles: [1]`), copter (`crewed` by the Elves, a 3/3 then not), mutavault (a 2/2 for the turn), prey (one fight, both striking), ram (one bite, no blockers), edict (Diabolic Edict's sacrifice is never `spent`). All OK.
- Every Lab script in CI's list, run locally with the new worker (60 scripts), exits 0, none needing a second game. Over their traces: `check-snapshot-first` (33,113 questions), `check-hidden-hands` (9,952 sightings), `check-hidden-log` (16,039 lines) and `check-kinds` are OK.
- Page: `fixes0084.test.tsx` (20 tests). TEST-004: each piece taken out in turn fails a test: 28 page mutations (spent fate on the table and in piles, never a wipe, the beat, the coin, the fold frames, the lift-off and its parser, the riffle, its fan down, its wait, one riffle when shuffled in, motes from the crew and from the ability, the slide's wait, the ring unseen while it waits, the grey ring, the rising number, the breath, fight spells fighting, no caption, the spark wait, P/T with the blow, the spell leaving before its fight, and the four parsers) and 6 worker mutations run against the Lab (the cost-payment read, "everything sacrificed is spent" against the edict, shuffles, crews, the fight kind, fight versus bite): all caught.
- Jump check (rebuilt local stack, both seats; traces `spent-*` (9), `cost-mill-yes`, `agent-of-kotis`). Before: 10 findings, all abilities fading in at the stack spot with their card already gone (Sinister Concoction, the Clue, Evolving Wilds, Windswept Heath, Agent of Kotis's Renew). After: 2, Agent of Kotis's Renew (its card in the graveyard pile; see "Not covered"). The wilds trace was re-recorded after its search was fixed (the first one never fetched): 0 findings.
- Clips at 1920x1080, normal and quarter speed with stills, in `Arrow videos/0084/` (23 moments, both seats where it matters): 01 three Treasures (Alice, Bob), 01c the Shocked Bear still defeated; 02 Evolving Wilds (Alice, Bob), 02c Windswept Heath; 03 the Clue's ability lifting off (Alice, Bob), 03c Sinister Concoction, 03d Village Rites with Agent of Kotis; 04 Rampant Growth (Alice, Bob: the riffle fans down on the top pile), 04c Sylvan Scrying; 05 Copter crewed (Alice, Bob), 05c its end of turn; 06 Mutavault (Alice, Bob); 07 Prey Upon (Alice, Bob); 08 Ram Through (Alice, Bob); 09 Diabolic Edict (Bob: defeated). They are Lab boards replayed on the rebuilt stack; the Lab deck has no card pictures. I read frames at 10 per second of game time around each moment. Two things were fixed and refilmed: the gold ring showed at the card while the motes were still running (a mark is held at its first frame while it waits), and Prey Upon sat glowing on the stack through its whole fight. Checked: the Courser's −2, its slashes and its 3/1 land in the same frame; the spent Treasures never crack or flash red.
