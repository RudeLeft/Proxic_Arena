# 0003 — Big boards stay playable

**Status:** Approved 2026-10-23
**Owner decisions:** 2026-10-23 — identical tokens attacking the same
thing stay one pile (chosen over "separate cards, fewer lines" and over
leaving combat as it was). 2026-10-23 — measure where a big board's time
goes before changing anything for speed.

## What the player sees

RudeLeft has 300 Goblin tokens from Krenko, Mob Boss and attacks Pat with
all of them. Before this spec the pile broke into 300 separate cards the
moment they attacked, each with its own glowing fire line, fanned into its
own lane, so the lines shot across the whole screen and the page stalled
(owner report, 2026-10-23). Now the table shows **one card, "Goblin ×300",
attacking, with one fire line to Pat**, and combat damage swoops it once.
When Pat blocks, clicking the pile blocks one Goblin; that Goblin steps out
of the pile with its own shield line, and the rest stay piled.

Also reported the same day: with 100+ cards on the battlefield, tapping
and answering feels slow. Forge alone is not it at that size (CI,
2026-10-23: 127 Goblins in 0.1 s, 255 in 0.2 s); where the rest goes is
being measured.

## Scope

In:
- **Combat piles.** Amends Phase 7 §7.52a L5 ("identical tokens pile …
  not in combat"): identical tokens that attack the same player or
  permanent and are not blocked pile together. Blocked attackers and
  blockers stand alone, so every block can be drawn and chosen.
- **One line per drawn card.** Relationship lines (attack, block, target,
  attach) are drawn once per pile → target, not once per object, and a
  pile's attackers swoop once, not once per member on the same card.
- **The measurement** (owner-approved 2026-10-23): click → server answer
  → page painted, at 100, 250 and 500 Goblins, before any speed change.

Out (and why):
- Any speed change before the measurement says where the time goes
  (EVID-005: measure, never estimate).
- Piling blockers: each blocker blocks its own attacker, a choice the
  player must be able to see and change.

## Rules and boundaries

- **The browser decides nothing (UI-001, ARCH-002).** What attacks what,
  and what is blocked, is Forge's (§7.61 B4); the pile only draws it.
  Clicking a pile answers with one of its members, exactly as tapping a
  pile of lands does (§7.58), so every Goblin remains choosable (UI-002).
- **Frozen history (PHASE-002).** §7.52a L5 is not edited; this spec is
  the amendment, and `layout.ts` cites it.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0003-A | 300 identical unblocked attackers: one pile of 300, one fire line (count 300), one swoop, one damage number of −300. | client unit (fails without the change) |
| F-0003-B | One of them blocked: it stands alone with its own fire and shield line; the other 299 stay piled. | client unit (fails without the change) |
| F-0003-C | A real game: Krenko's Goblins attack; screenshot shows one pile and one line. | browser + owner's eyes |
| F-0003-D | Timings at 100 / 250 / 500 Goblins, split engine + server vs page. | browser measurement |

## Amendments

None.
