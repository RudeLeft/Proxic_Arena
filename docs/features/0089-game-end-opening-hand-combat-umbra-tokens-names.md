# 0089 — Game end, opening hand and mulligans, extra combat, umbra saves, token waves, stack names that fit

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "deep2-gameflow-1113", https://claude.ai/artifact/38TfLFjfhnn8cnorXRyqiv)
**Owner decisions:**
- Q1 game end: **A · hold the banner, break the loser's shield, flare the winner**.
- Q2 opening hand: **A · dealt from the library**.
- Q3 extra combat: **A · the report window**.
- Q4 umbra: **B · the umbra becomes a shield**, made obvious with Q4b variant **b · the tab unfolds into a shield**.
- Q5 tokens: **B · waves of 8**.
- Q6 stack names: **A · shrink to fit**.

Phase 10 A-22, from the second deep dive ("Phase 10 deep dive 2.md", 2026-11-13). Covers missed gaps 5-8 and improvements 4 and 7.

## Built

1. **Game end (Q1 A).**
   - The result banner waits until the last hit has landed and the count reads 0.
   - Then the loser's life shield cracks apart into pieces and dims, the loser's plate dims, and the winner's plate flares gold (0086's plate light). Only then does the banner fade in.
   - Poison: the poison badge's ring closes and glows, and the shield only dims, with no crack.
   - A concession dims the plate with no hit.
   - Both seats. The banner's own words are unchanged.
2. **Opening hand and mulligans (Q2 A).**
   - The 7 cards are dealt from the Library tile into the opening-hand window, with the count −7.
   - A mulligan sweeps them back into the library (+7). The existing riffle plays, and 7 are dealt again.
   - The cards put back go to the bottom (+N).
   - Keep glides the hand into place.
   - The other player sees the backs go and come, and is never shown a card.
3. **Extra combat (Q3 A).**
   - The report window says "Extra combat: Alice attacks again." with the card's picture (Aurelia, the Warleader; Relentless Assault), like 0086's extra turn.
   - The turn ladder's light glides back to Combat; with Aurelia it is already there.
4. **Umbra saves (Q4 B, variant b).**
   - As the effect that would destroy the creature resolves, the umbra's side tab swings out and unfolds into a gold heater-shield shape with the umbra's picture inside, covering the creature.
   - The flash cracks the shield and it shatters into the umbra owner's graveyard (+1). The creature stays.
   - The other player gets the report window: "Hyena Umbra was destroyed instead of Alice's Grizzly Bears."
   - The worker tells it from the game's own replacement record (umbra armor), never by name.
5. **Token waves (Q5 B).**
   - When many tokens arrive at once (Scute Swarm, Krenko, Avenger), they come in waves of 8 onto their ×N pile (0073), each wave with a rising +8 (or the remainder).
   - Up to 8 tokens behave as today.
6. **Stack names fit (Q6 A).**
   - A stack card's name shrinks in 5% steps until it fits its top bar, never below 60%, and only then is cut with "…". This is the FitName rule of spec 0041.
   - It applies to the casting card's name bar too, where the same cut happens.
7. **Hurry and reduce motion.** A click hurries everything (A-00). With reduce motion there is no deal, sweep, crack, flare, unfold or wave; the end states and numbers still show.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0089-A | Lethal Bolt, tenth poison counter, concession: banner after the last hit; shield breaks or badge closes; winner flares; both seats | page test; Lab; clip |
| F-0089-B | Mulligan once, put one on the bottom: dealt, swept, riffled, dealt, put back, kept; the other seat sees backs only | page test; Lab; hidden check; clip |
| F-0089-C | Aurelia and Relentless Assault: extra-combat window; ladder light | worker test; page test; Lab; clip |
| F-0089-D | Hyena Umbra on Grizzly Bears, then Wrath of God: the tab unfolds into a shield, cracks and shatters; the Bears stay; report to the other player | worker test; page test; Lab; clip |
| F-0089-E | Scute Swarm doubling and Krenko: waves of 8 with +8 | page test; Lab; clip |
| F-0089-F | Sudden Shock, Lightning Helix, Kozilek's Return: full names on the stack card | page test; screenshot |

## Amendments
