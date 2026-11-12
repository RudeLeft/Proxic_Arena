# 0075 — The remaining card-action words move into the report window

**Status:** Approved 2026-11-12 (owner, by prompt, on the audit canvas "pills-audit-1112", https://claude.ai/artifact/NW5kjRvFMfFneRfrJPzuvL)
**Owner decisions:** bounce **gets a window for the one it happened to**; cycling **a window only when the other player cycles**; the other player's choices and coin flips **get windows, the grey lines go** (dice keep their tumbling-die window); state words (TAPPED, ATTACKING, BLOCKING, TARGET) **stay**; counters and the Ring-bearer become **pictures** in a separate spec with its own canvas (owner: "Phase 11 is going to involve statuses that get added to cards, so we can address this further then").

Follows the owner's standing rule of spec 0074 Amendment 1: card actions are explained only in the report window (the acting player's medallion, "WHO · CARD", one plain sentence, the cards as pictures with where each went), standardized, never as word pills on the table or notices at the top; a window opens only for what the other player does or what happens to you.

## Why (researched, the audit)

- **"Cycled" pill** (`fromSnapshot.ts` ~408-414, `Board.tsx` ~3917-3960, `motion.ts` graveTagFrames; word from `Moves.graveReason` ~95) and the **"GAME · Cycled: …" notice** (`GameHost.tellGraveyards` ~973-985, `Moves.toldByOwner` ~140-160; after 0074 the only one it still sends).
- **"Back to your hand", "On top of / On the bottom of / Shuffled into … library" pills** after a bounce from the table or the stack (`Board.tsx` returnTag ~358-371, drawn ~2471-2545). `ActionReports`' RETURN kind (0074) covers only cards leaving a graveyard or exile.
- **Forge's `notifyOfValue` notices** (`MatchController` ~5955-5966): "Voice of All: Bob chose white", coin flips, "You rolled 4" (the die already tumbles in its own window).
- **Leftover "Looking at …" / "There are no cards in Bob's hand."** (`tellRevealed` ~5831-5863); the page hides some by matching names (`GameScreen.tsx` ~4420-4428), the empty-hand case gets through.

## Built

1. **Bounce:** "BOB · UNSUMMON — Bob returned your Grizzly Bears to your hand." (or "… put your Serra Angel on top of your library", "… shuffled … into your library") in the report window, for the player whose card it was when the other player did it. The return pills go. The card's flight is unchanged.
2. **Cycling:** when the other player cycles, "BOB · FORGOTTEN CAVE — Bob cycled Forgotten Cave and drew a card." Your own cycling opens nothing. The "Cycled" pill and the top notice go.
3. **Choices and coin flips:** the other player's choices ("BOB · VOICE OF ALL — Bob chose white.", with the colour as a picture) and coin flips ("Bob flipped a coin and lost.", with a coin picture) open the report window; the grey notices go. Dice keep their tumbling-die window and the grey line repeating it goes.
4. **Leftover "Looking at …" lines:** the worker stops sending them whenever a reveal or report already says it (no page text-matching); "There are no cards in Bob's hand." becomes the report window's sentence for that look.
5. Nothing else changes: state marks stay (TAPPED, ATTACKING, BLOCKING, TARGET, ×N, zZz, "Still to pay", "N attacking"); game, rules and connection notices stay.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0075-A | Unsummon on your creature: your window, no pill; Bob's window none; your Unsummon on his: his window only | worker test; page test; clip |
| F-0075-B | Bob cycles: your window; you cycle: none; no "Cycled" pill or notice anywhere | worker test; Lab; clip |
| F-0075-C | Bob's colour choice and a coin flip: window with a picture, no grey notice; a die roll: its window only | worker test; Lab; clip |
| F-0075-D | No "Looking at …" line reaches the page when a reveal/report covers it; the empty-hand look is a window | worker test; Lab |
| F-0075-E | Hidden information: no new window names a card or id the reader may not see | Lab hidden checks |

## Amendments
