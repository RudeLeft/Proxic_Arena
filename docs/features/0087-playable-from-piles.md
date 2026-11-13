# 0087 — Cards you may still play from your piles

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "gaps-marks-1113" v2, sections 6-9, redrawn on the real plate look, https://claude.ai/artifact/7HeVgwnuurE3PhCFiqvdxa)
**Owner decision:** **A · glow and a fan beside the plate**.

Phase 10 A-22, from the deep dive "Phase 10 graphical gaps.md" (2026-11-13), item 3.

## Why

The exile and graveyard tiles show only a count (`GameScreen.tsx` ~2750-2763). "You may play it", time counters and "Exiled by" appear only inside the opened tray or the close-up (`zoneTray.ts` ~12-35, `GameScreen.tsx` ~4150; worker `ViewerSnapshot.java` ~336-342 already sends playable). A suspended card's time counter coming off each upkeep is invisible.

## Built

1. **Glow.** When a player has cards they may play from their graveyard or exile, those tiles glow gold. This covers adventure, foretell, Light Up the Stage-style "until end of turn", flashback, escape, suspend, and cards the game marks playable from there.
2. **Fan beside the plate.**
   - A small fan of those cards stands on the table just left of the plate, level with the Graveyard and Exile tiles. For your own plate that is the bottom-right corner of the table; for the other player's, the top-right corner.
   - Each card rises out of its tile into the fan when it becomes playable. Each wears its pile's corner sign (graveyard or exile).
   - It leaves the fan (back into its tile) when it stops being playable.
   - You cast straight from the fan, with the same click and rise as from the hand (0072/0081). The fan closes the gap.
3. **Suspend.** A suspended card stands in the fan, dimmed (not castable), with a round time badge. Each upkeep the badge ticks with a rising −1. At zero it is cast for free and rises from the fan.
4. **Hidden information.** The other player sees only what is public. A foretold card is a face-down back in their view of your fan, with no name. A card exiled face down and unknown to them is never named.
5. A click hurries everything (A-00). Reduce motion: no movement; the glow, fan and badge still show. Nothing covers the hand, the plate or the act button. Real-screen placement as on the canvas (1920x1080 and above, UI-006).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0087-A | Light Up the Stage: two cards rise from Exile into the fan; tiles glow; they leave when the window ends | page test; Lab; clip |
| F-0087-B | Bonecrusher Giant on its adventure: in the fan, cast from it; Think Twice flashback from the graveyard | page test; Lab; clip |
| F-0087-C | Foretell: face down in the other player's view | page test; Lab hidden check; clip |
| F-0087-D | Suspend (Ancestral Vision): dimmed, badge −1 each upkeep, free cast at zero | page test; Lab; clip |
| F-0087-E | Both seats; nothing overlaps hand, plate or act button at 1920x1080 | page test; e2e sweep; screenshot |

## Amendments
