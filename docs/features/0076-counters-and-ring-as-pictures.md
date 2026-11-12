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

### As built (2026-11-12)

- **Where:** `frontend/src/battlefield/CardBadges.tsx` (the canvas's pictures, colours and order: +1/+1 and -1/-1 first, then the most), drawn by `Board.tsx` in place of the word pill and the "Ring-bearer" word; styles `.bf-badges`, `.bf-badge`, `.bf-mark` in `battlefield.css`, at the canvas's sizes (badge 0.15 of the card's height, number 0.098, ring square 0.17, column from 0.15 above the bottom edge). Page only: the snapshot already carried every counter `{name, count}` and the Ring-bearer.
- **Four or more kinds:** as item 2 says -- the first three, then "··· N" for the rest (the canvas's mock folded after two; the spec's words were followed).
- **Kinds seen in Lab games that are not drawn** get the grey lettered badge: keyword counters arrive with their own spelling ("Vigilance" shows "Vi"), and a battle's DEFENSE counters ("DE") -- these were in the word pill before too. Loyalty stays the planeswalker's number.
- **Nothing covered, nothing under (owner review via coordinator, same day):** each badge goes up its column from just above the bottom bar, stepping over the state word (TAPPED, ATTACKING, BLOCKING, TARGET), the zZz and a sector word, staying below the name (or a pile's ×N) and above a land's mana symbols; when a column is full the next badge starts a second column to its right (`CardBadges.placeBadges`). An attacking card with four kinds shows two badges below its ATTACKING word and two above, in two columns. Two columns always fit inside the card; if even they cannot hold everything (a tapped pile that came in this turn), fewer kinds show and the rest go into "··· N". A first build let ATTACKING paint over a badge; that is gone.
- **Pointing:** spec 0045's words on the whole column, plus "Ring-bearer"; on a pile, "on each" (the canvas's "What it costs"). The close-up and the card's spoken name are unchanged.
- **No animation** (the number does not pop): nothing to respect under Reduce motion.
- **Tests:** `fixes0076.test.tsx` (F-0076-A..E: all six fail with `Board.tsx` and `battlefield.css` put back; F-0076-D also fails with the band-stepping removed); `battlefield.spec.ts`'s sweep measures every badge, at every board size, against the name bar, the bottom bar, P/T, ×N, mana pill, state word, zZz, sector word and the other badges (it failed on the first build: "a badge covers bf-state"). The synthetic boards' counters now take turns at one, two and four kinds. `match-what-happened` and `match-ring` look for the badge and the ring instead of the words.
