# 0085 — Protection and gained-ability marks; what a card is holding

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "gaps-marks-1113", https://claude.ai/artifact/7HeVgwnuurE3PhCFiqvdxa)
**Owner decisions:** 2 **B · rise, then settle as a square**; fold order **protection never folds first**; 4 **A · picture tab on the holder**. (Item 3, cards playable from piles, is being redrawn on the real plate look and is not part of this spec.)

Phase 10 A-22, from the deep dive "Phase 10 graphical gaps.md" (2026-11-13), items 2 and 4.

## Why

- `CardBadges.tsx` marks only the Ring, copy, phased, regeneration shield and indestructible (~441-490). Keywords are used only for flying (hover) and haste (`Board.tsx` ~751-766), though the worker sends them all (`ViewerSnapshot.java` ~871-887).
- "Exiled by" exists only in the exile tray and the close-up (`zoneTray.ts` ~12-35, `GameScreen.tsx` ~4150); the holding card shows nothing.

## Built

1. **Gained-ability marks (2 B).**
   - When a permanent gains an ability it did not have, the ability's icon rises off the card like a +N, holds above it, then drops into a gold-rimmed square mark (0076 placement: up from the lower left, two columns, under the name, above P/T, stepping over ATTACKING).
   - Covered: hexproof, shroud, protection (in its colour or colours), ward, and keywords gained until end of turn (trample, haste, lifelink, first strike, deathtouch, vigilance, menace, flying beside its hover).
   - The mark shrinks away when the ability ends.
   - Abilities printed on the card are not marked; they are in the close-up. The exception is hexproof, shroud, protection and ward, which are marked whether printed or gained, because they decide what can be targeted. Indestructible keeps 0080's hexagon.
   - Heroic Intervention on three creatures plays on all three at once.
2. **Fold order (owner).** When marks don't fit (a small attacking card fits a counter plus three), gained keywords fold into the "··· N" badge first. Hexproof, shroud, protection, ward and indestructible never fold before them.
3. **What a card is holding (4 A).**
   - A permanent that holds an exiled card "until it leaves" (Banishing Light, Oblivion Ring, Fiend Hunter, and the like, as the game links them) carries a picture tab on its edge, in the Aura/Equipment side-tab style, with the held card's picture and name. Neighbours glide aside to make room.
   - When the holder leaves, the tab flies to the exile pile, the pile glows, and the held card rises out of it (0074's rise and show) and goes home.
   - Hidden-info rules apply: a face-down held card shows a back and no name.
4. A click hurries everything (A-00). Reduce motion: no movement; marks and tabs still show.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0085-A | Heroic Intervention on three creatures: hexproof squares rise and settle on all three; indestructible hexagon; marks go at end of turn | page test; Lab; clip |
| F-0085-B | Mother of Runes: protection from red square in red; Bolt at it does nothing (0080's pale shield) | page test; Lab; clip |
| F-0085-C | Run Amok: trample rises and settles, goes at end of turn | page test; Lab; clip |
| F-0085-D | Crowded small attacking card: protection stays, keywords fold first; nothing covers name or P/T | page test; e2e sweep |
| F-0085-E | Banishing Light and Fiend Hunter: picture tab; Disenchant / killing the Hunter: the card comes back out of exile; both seats | worker test (the link); page test; Lab; hidden check; clip |

## Amendments

### Amendment 1 — widened before building (owner, 2026-11-13, from "Phase 10 deep dive 2.md")

Approved looks only; no new canvas needed.
- **More abilities marked:** double strike, "can't be blocked" and reach join the gained-ability squares (rise, then settle). They fold like the other gained keywords.
- **Lost abilities:** under Humility, Turn to Frog or Kenrith's Transformation, a creature that has lost all its abilities wears a grey square ("lost its abilities"), using the same rise-and-settle. While it lasts, its printed marks (hexproof, protection, flying's hover) drop, and they come back when it ends.
- **Held cards that stay in exile:** the tab plays only the move the game makes. Imprint (Chrome Mox, Isochron Scepter) and Hideaway hold a card that stays in exile when the holder leaves; that tab sinks with the card into the exile pile, and the card never comes back out. Banishing Light-style holders return the card as before. A face-down held card (Hideaway) is a back with no name to the other player.
