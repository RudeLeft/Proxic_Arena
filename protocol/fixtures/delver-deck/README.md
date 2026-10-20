# The two-faced test deck

A legal 60-card Open Format deck that exists to turn one card over:
**Delver of Secrets // Insectile Aberration** (PHASE_06 §6.79, §6.81,
P6-BF, P6-AJ).

```text
Delver Test Deck.txt   32 Island
                       4 Delver of Secrets // Insectile Aberration
                       24 instants and sorceries (Opt, Brainstorm, Think
                          Twice, Counterspell, Impulse, Consider)
```

Delver looks at the top card each upkeep and transforms if it reveals
an instant or sorcery -- about two upkeeps in five with this deck.
The instants are never cast; they are there to be on top.

Written as the export writes a two-faced card, "A // B", so the
import, the art file name (front face only, as the real exporter
names it) and the match-time lookup all meet the real shape.

Used by `frontend/e2e/match-multiface.spec.ts`; the worker-level check
(`scripts/check-multiface.py`) uses its own non-legal deck.
