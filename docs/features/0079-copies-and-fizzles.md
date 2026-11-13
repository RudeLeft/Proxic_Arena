# 0079 — Creature copies, copied spells, and spells that fizzle

**Status:** Approved 2026-11-12 (owner, by prompt, on the canvas "copies-1112", https://claude.ai/artifact/JenixgenRoKbzNqqgmcANe)
**Owner decisions:** Q1 creature copy **A · ghost lifts off** (token copies spark out of the creature they copy); Q2 copied spell **A · peels off the original**; Q3 storm **B · one card ×N**; Q4 fizzle **A · reaches, finds nothing, smoke; report window to both players**. Owner addition: the left card's **spot is held** -- a dashed outline with its name faint inside, nothing slides into it -- until the spell aimed at it has finished; only then do the cards close the gap.

Phase 10 items A-15 (copies) and the rest of A-21 (spells copied, fizzled).

## Why (researched)

- Clone: the card's name becomes the copied face, its printing stays Clone's (`ViewerSnapshot.java` ~745-772); nothing says what it copied; it leaves the stack already named Serra Angel; the log says only "cast Clone" (`PlayLog.java` ~1188). Token copies spark from the spell (0073) with no link to the original.
- Fork: stack entries carry no copy flag (`ViewerSnapshot` ~345-392); Forge makes the copy a new card id (`CardFactory.java` ~80-105) with no zone-change move, so it just slides in (`Board.tsx` ~2068-2087); the log words it as "cast" (`MagicStack` ~565 → `PlayLog.cast` ~751); when done it glides into a graveyard (`Board.tsx` ~4274-4296), though Forge simply ends it (`MagicStack` ~681-683). Storm copies: five separate cards slide in at once (only triggers group ×N, `fromSnapshot.ts` ~334-357).
- Fizzle: Forge's hasFizzled (`MagicStack` ~587-639) is read nowhere in the worker; it isn't "countered" (that needs another card, `GameHost.java` ~1098-1104); the page glows it like a spell that worked; no window, no log line (`PlayLog` ~1070-1073). When the target leaves, neighbouring cards glide to close its gap at once.

## Built

1. **Worker (small):** a creature that is a copy says what it copied (the original's id, if visible to the reader); a copied spell on the stack is marked a copy and names the entry it copies; a spell that fizzles is told as "fizzled", with a report and a play-log line. Hidden-info rules apply.
2. **Creature copy (Q1 A):** a see-through copy of the original lifts off it and glides onto the copying card, which then flips to the copied face (A-09's lift, flip, settle). A token copy (Cackling Counterpart) sparks out of the copied creature and glides to its place (0073's token look, starting from the original).
3. **Copied spell (Q2 A):** a see-through copy lifts off the original stack card and settles in front of it, becoming solid, with a small gold copy mark (0076's square "something it is" badge, a twin-card picture). When it is done it breaks into gold motes where it is -- it never goes to a graveyard.
4. **Storm (Q3 B):** the copies show as one copy card with a "×N" count that ticks down as each resolves, like grouped triggers.
5. **Fizzle (Q4 A):** the spell's beam reaches the held spot, finds nothing, the outline breaks up, and the spell dissolves into smoke (distinct from a countered spell's grey ash). The report window opens for **both** players: "Alice's Lightning Bolt did nothing: its target was gone." (the caster sees "Your …"), with the spell and, if still visible, the card that left (e.g. "in Bob's hand").
6. **Held spot (owner):** while a spell on the stack still targets a permanent that has left the battlefield, that permanent's place stays empty as a dashed outline with its name faint inside; neighbouring cards don't slide into it until every spell aimed at it has resolved, fizzled or left the stack; then the gap closes with the usual glide.
7. A click hurries everything (A-00); reduce motion: no glides or flips, the copy mark and outline still show.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0079-A | Clone of Serra Angel: ghost lifts off the Angel, glides, Clone flips; Cackling Counterpart: token sparks from the original | worker test; page test; Lab; clip |
| F-0079-B | Fork on Lightning Bolt: copy peels off with the copy mark; resolves; breaks into motes, no graveyard glide | worker test; page test; Lab; clip |
| F-0079-C | Grapeshot with storm 4: one copy card ×4 ticking down | page test; Lab; clip |
| F-0079-D | Bolt at Bears, Unsummon in response: held dashed spot, neighbours stay; beam finds nothing, smoke; window to both; then the gap closes | worker test; page test; Lab; clip |
| F-0079-E | Hurry, reduce motion, hidden info clean | page test; Lab hidden checks |

## Amendments
