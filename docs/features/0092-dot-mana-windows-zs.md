# 0092 — No priority dot, no mana-colour windows, summoning-sickness z's that never stack

**Status:** Approved 2026-11-16 (owner, by prompt, on the canvas "Owner list 2026-11-16", https://claude.ai/artifact/Ky53Huv37tXYsLXWLqDMZq, sections 1 and 7; item 5 by prompt from the owner's live screenshot).
**Owner decisions:** section 1 **A · remove it**; item 5 **stop mana-colour windows**; section 7 **B · floating z's, spaced**.

From the owner's list of 2026-11-16, items 1, 5 and 7.

## Why (researched)

- **The dot.** The orange dot under a player's name (`GameScreen.tsx` ~3284-3295, `game.css` ~198-205) is the *priority* dot, not a turn dot. Whose turn it is already shows through the plate's gold edge, the glowing life shield, 0086's plate light and turn sweep, and "YOUR TURN" on the steps; who must act shows through the act button, the waiting line and W-25's glow. The dot's row also makes the name hop about 10 px whenever it appears or goes.
- **"RudeLeft picked {B}."** Forge announces the colour a two-colour or any-colour mana ability made (`ManaEffect` → `GameAction.notifyOfValue`) to every other player. Since 0075 every such value opens a report window (`MatchController.notifyOfValue` → `ActionReports.valueTold`), so the other player gets a window on every tap of a gain land, guildgate, Birds of Paradise or Signet. `choiceReport` also invents a "→ battlefield" arrival for a land already on the table. 0075's decision covered real choices (Voice of All's colour, coin flips, named cards), never mana; Forge's own client only logs mana values.
- **The z's.** `Board.tsx` ~2867-2874 draws three z's on one path; the first takes the card's random offset while the other two have fixed delays, so about 2 in 5 sick creatures show two z's on top of each other. The fixed outline swamps small letters, the box overlaps the state words' band, and the z's keep moving in a hidden tab (0090's rule).

## Built

1. **No priority dot.** The dot and its row go, for players and anyone watching. The plate's hidden summary for screen readers says ", has priority" instead. The name no longer moves.
2. **No mana-colour windows.** A value Forge announces from a mana ability or mana spell (`SpellAbility#isManaAbility`, `ApiType.Mana`) is never a report window for anyone; it stays in the game log as Forge's words. Every other announced value (a colour named, a creature type, a card named, a coin flip) keeps its window (0075). `choiceReport` adds the "→ place" tag only when the card really arrived.
3. **Spaced z's.** The three z's stay, drifting as today, but always a third of a loop apart, so they never meet; their letters have a floor size and an outline that scale with the card; the box keeps clear of the state words; they pause in a hidden tab, and run in step above about 12 sick creatures (as 0090 does for flyers).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0092-A | No dot on either plate, at any moment; the name's position does not change when priority passes; the screen-reader summary says who has priority | page test |
| F-0092-B | Bob taps Dismal Backwater for {B} and Birds of Paradise for {G}: Alice gets no window. Voice of All's colour still gives one | worker test; Lab; real-game test (TEST-012) |
| F-0092-C | 8 sick creatures with random offsets: the z's never overlap on any frame; they pause in a hidden tab | page test; clip |

## Amendments
