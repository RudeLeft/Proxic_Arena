# 0088 — Triggers from anywhere, reports that stay and gather, the top of the library, "targeted" versus "you can pick this"

**Status:** Approved 2026-11-13 (owner, by prompt, on the canvas "deep2-triggers-reports-1113", https://claude.ai/artifact/N3FQrXsUv5vKSy17ZqEKLc)
**Owner decisions:** Q1 **A · rise from where the card is now** · Q2 **A · the report stays until closed** · Q3 **C · gathered in one window** · Q4 **C · big when it changes, then small on the tile** · Q5 **C · sight corners**.

Phase 10 A-22, from the second deep dive ("Phase 10 deep dive 2.md", 2026-11-13): missed gaps 1-4 and improvement 1.

## Why (researched)

- A trigger rises only when its source is on the battlefield (`Board.tsx` ~2552-2566). Otherwise it slides in from the right: Solemn Simulacrum's death draw, cascade, cycling triggers, Unearth, rebound. The last full jump run had 16 games doing this. 0084 covered sources that left the table as part of the same update; this spec covers the rest.
- The worker keeps one latest report (`ActionReports.java` ~166) and clears it when a turn begins (~214-218). So a report from the end of a turn vanishes, and each report replaces the last.
- The page gets only a library count; a public or playable top card (Future Sight, Courser of Kruphix, Bolas's Citadel) is invisible.
- "You can pick this" and "a spell targets this" are two near-identical breathing gold glows.

## Built

1. **Triggers from anywhere (Q1 A).** A trigger or ability whose source is not on the battlefield rises out of wherever the card is now:
   - from the graveyard or exile tile: the tile glows, and 0074's rise-and-show is followed by the lift;
   - from the spell being cast (cascade, "when you cast");
   - from the hand (cycling): a back from the middle of the fan for the other player, turning face up as it becomes public;
   - from 0087's fan (Unearth and other graveyard abilities).

   A source never seen by the viewer still uses the stack-spot entrance, never a guess.
2. **End-of-turn reports stay (Q2 A).** A report window is no longer cleared at the turn line. It stays until the player closes it, or until a newer report gathers it (item 3).
3. **Reports gather (Q3 C).** When a new report arrives while one is open, the older ones fold into one-line rows at the top of the same window (medallion, WHO · CARD, the sentence), and the newest shows in full. A click on a row opens it. Closing the window clears the gathered set. The worker keeps every report since the window was last closed, for every reader, with the hidden-info rules applied.
4. **The top of the library (Q4 C).** When the top card is public (Courser, Future Sight) or the viewer may look at it or play it (Bolas's Citadel), each new top card rises out of the Library tile and shows enlarged (0074's rise-and-show), then settles small on the tile's right end, clear of the count. It glows when playable, and a cast rises from it like 0087's fan. A card only its owner may look at is shown to the owner only; the other player sees nothing new.
5. **Targeted versus pickable (Q5 C).** A card a spell or ability on the stack is targeting wears four still gold corners just outside it, like a sight. The "you can pick this" breath is unchanged. The corners never animate, so they read with motion turned down and without colour.
6. A click hurries everything (A-00). Reduce motion: no rise or glide; the tile card, the corners and the window contents still show. No word pills or top notices.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0088-A | Solemn Simulacrum dies: its draw trigger rises from the graveyard tile; cascade lifts off the cast spell; Gempalm's cycling trigger lifts off the hand; Unearth from the fan; both seats | page test; Lab; jump check (no trigger slides in from nowhere where the source is known); clip |
| F-0088-B | Bob's Opt in Alice's end step: the report stays through the turn change until closed | worker test; page test; Lab; clip |
| F-0088-C | Two fetch lands then Consider: one window, older reports as rows, newest in full | worker test; page test; Lab; hidden check; clip |
| F-0088-D | Courser (both see the top card), Citadel (owner only, playable): big then small on the tile; cast from it | worker test; page test; Lab; hidden check; clip |
| F-0088-E | Murder targeting the Bears while Alice picks a Bolt target: corners on the Bears, breath on the pickable cards | page test; clip |

## Amendments
