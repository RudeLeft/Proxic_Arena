# 0076 — Counters and the Ring-bearer as picture badges

**Status:** Approved 2026-11-12 (owner, by prompt, on the canvas "counters-1112", https://claude.ai/artifact/BEqbA11StaJi4pJoF9fr1P)
**Owner decisions:** **A · One badge per kind** (with 4 or more kinds, the extras fold into a grey "··· N" badge); Ring-bearer **gold ring only**; a single counter **shows "1"**.

From the owner's audit (spec 0075: "counters and the Ring-bearer become pictures in a separate spec"). The owner plans Phase 11 to add statuses to cards, so this sets a small badge language that can grow: **a round badge with a picture and a number = something you count; a gold-rimmed square = something the card is.** Colour always comes with a picture, never colour alone.

## Why (researched)

Counters show today as one green word pill ("+1/+1 ×2 · Stun") at the card's lower left, long lists cut off with "…" (`Board.tsx` ~1631-1638, `battlefield.css` ~1754); pointing gives each kind and where the last came from (`counterWords`, `Board.tsx` ~249, spec 0045); the close-up shows the same words (`GameScreen.tsx` ~4048). The worker sends every counter kind as `{name, count}` (`ViewerSnapshot.java` ~853-861). Ring-bearer is the word across the picture (`Board.tsx` ~1640); the tempt count is the player's, already on their tray ("The Ring ×N", `StatusTray.tsx` ~183-192). Planeswalker loyalty has its own look in the bottom bar (`figure`, `Board.tsx` ~569) and is unchanged. A pile forms only from identical cards, counters included (`layout.ts` ~363), so a pile's badge is per card.

## Built

1. **One badge per kind (A):** each counter kind on a card is a round badge -- its picture and its number (always, even "1") -- stacked upward from the card's lower-left corner, the strip that stays visible on a crowded row. The kinds drawn are the canvas's (+1/+1 green up-arrow, -1/-1 red down-arrow, charge blue lightning, shield steel shield, stun yellow star, oil purple drop, lore brown book, time teal hourglass, and the rest); any other kind is a grey badge with its first letters.
2. **Four or more kinds:** the first three show, the rest fold into a grey "··· N" badge.
3. **Ring-bearer:** a small gold ring in a gold-rimmed square, no number.
4. **Words keep their place off the table:** pointing at a badge and the close-up keep spec 0045's words ("+1/+1 ×2 -- the last from …").
5. Nothing else on the card moves: P/T, TAPPED, ×N, zZz, mana pips, Aura tabs, the pay corner signs and the seen eye keep their places; badges never cover the name or P/T.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0076-A | Grizzly Bears with +1/+1 ×2 and stun: two badges "2" and "1", pictures + colours; no word pill | page test; screenshot |
| F-0076-B | Four or more kinds: three badges + "··· N"; pointing lists all | page test |
| F-0076-C | Ring-bearer: gold ring square, no word | page test; screenshot |
| F-0076-D | Smallest card size and a ×N pile: badges readable, nothing covered (layout sweep) | page test; e2e battlefield sweep |
| F-0076-E | Hover and close-up keep the 0045 words | page test |

## Amendments
