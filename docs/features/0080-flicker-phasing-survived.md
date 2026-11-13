# 0080 — Flicker, phasing, and survivors (regenerate, indestructible, prevented damage)

**Status:** Approved 2026-11-12 (owner, by prompt, on the canvas "survive-1112", https://claude.ai/artifact/VuZFCRcbYKmTAq14VKZEqL)
**Owner decisions:** Q1 flicker **A · blink via exile** (Flickerwisp's delayed return stays as it is); Q2 phasing **A · ghost in place, with the report window**; Q3 regenerate **B · shield mark**; Q4b indestructible **F1 · hex dome force field, with a small mark at rest**; Q5 prevented damage **A · a shield absorbs it, grey "0"**.

Phase 10 items A-16 (exiled and returned, phasing) and A-20 (survived: regenerated, indestructible, prevented).

## Why (researched)

- Flicker (Ephemerate, Cloudshift): Forge keeps the card's id (`GameAction.changeZone` → `CardCopyService.copyCard(false)`); the page skips a card already on the table (`fromSnapshot.ts` ~453, `Board.tsx` ~3637), so nothing shows it left -- it only untaps, loses its counters, gets zZz (and the exile tile may tick, `Board.tsx` ~3467).
- **Phasing is shown wrong:** `ViewerSnapshot.java` ~236 uses `getCardsIn(Battlefield)`, which leaves out phased-out cards; the page guesses exile (`fromSnapshot.ts` ~485-497) -- Banished plus the wipe flash -- then they fly back from the stack spot.
- Regenerate: Forge's `GameEventCardRegenerated` isn't listened to; the shield is skipped (`ViewerSnapshot.java` ~180-191); the creature just taps.
- Indestructible: `GameAction.destroy` stops at `canBeDestroyed()` with no event; the card just sits; the keyword is only in the close-up (`GameScreen.tsx` ~4042).
- Prevention: only hits above 0 are recorded (`GameHost.java` ~775, ~789) and a damage wave is sent only if there is one (~1305-1318), so under Holy Day nothing plays.

## Built

1. **Worker:** phased-out permanents are sent (flagged phased out) with phase-out/phase-in events; a flicker is told as one exile-and-return move; regeneration shields and their use (`GameEventCardRegenerated`); a destroy that failed because of indestructible (where Forge exposes it; a minimal hook or patch if not, recorded in As built); prevented damage (Forge's replacement/prevention log) with its would-be amount and target. Hidden-info rules apply; protocol docs updated.
2. **Flicker (Q1 A):** the card vanishes to its owner's exile tile (A-05's Banished), then rises out of it (0074's rise-and-show) and glides back to its spot. Flickerwisp's end-of-turn return is unchanged.
3. **Phasing (Q2 A):** phased-out cards stay in their place, see-through and grey with a soft shimmer and a small square "phased out" mark (0076's "something it is" square); they can't be clicked or aimed at; they turn solid again when they phase in. When the other player's permanents phase out (Teferi's Protection), you get the report window ("Bob's permanents phased out until his next turn. His life can't change.").
4. **Regenerate (Q3 B):** when a regeneration shield is made, a small shield mark (0076 square) appears on the creature; when something would destroy it, the blow breaks the shield with a flash instead of the creature, which taps and leaves combat; the mark goes. Shields not used go at end of turn.
5. **Indestructible (Q4b F1):** an indestructible permanent wears a small gold hexagon mark (0076 square) at all times; when something tries to destroy it (Wrath of God, Murder, lethal damage), a gold hex-grid dome flickers up round the card at the moment of the blow, sparks bounce off, and it fades -- the card stays.
6. **Prevented damage (Q5 A):** the hit lands on a pale see-through shield in front of the creature or player, which absorbs it, and a grey "0" rises (house style). Protection from a colour stopping a blow uses the same shield.
7. A click hurries everything (A-00); reduce motion: no movement; the marks still show.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0080-A | Ephemerate/Cloudshift: Banished to exile, rise-and-show back to the same spot; exile tile not left wrong | worker test; page test; Lab; clip |
| F-0080-B | Teferi's Protection (or Slip Out the Back): ghosts in place with the mark, unclickable, solid again at phase-in; your report window; never drawn as exiled | worker test; page test; Lab; hidden check; clip |
| F-0080-C | River Boa (or any regenerator) vs Murder: shield mark, shield breaks, creature taps and stays | worker test; page test; Lab; clip |
| F-0080-D | Darksteel Myr: hexagon mark at rest; Wrath of God and a lethal block: hex dome, card stays | worker test; page test; Lab; clip |
| F-0080-E | Fog/Holy Day: combat hits land on the pale shield, grey "0" rises; protection from red vs Lightning Bolt the same | worker test; page test; Lab; clip |
| F-0080-F | Hurry, reduce motion; marks never cover name, P/T or other badges | page test; e2e battlefield sweep |

## Amendments
