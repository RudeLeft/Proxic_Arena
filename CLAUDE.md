# CLAUDE.md

Read `AGENTS.md` first, every session, before inspecting, planning,
editing, testing, building or playing this project. It is the operating
contract — project locations, phase discipline, evidence rules, Forge
boundaries, hidden-information rules, protocol invariants and verification
philosophy — and it maps the rest of the documents.

**Phase 0A is ACCEPTED (2026-10-15). Phases 1-6 are COMPLETE
(Phase 6 gate approved by the owner 2026-10-20). Phase 7
(Battlefield Presentation & Interaction, and the application pages) is
LOCKED 2026-10-20 and is the active phase.**
Read `docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md` before any
production code — it carries the architectural facts Phase 0A
established.

**One play mode only: Open Format** — 60-65 card deck, max 4
copies of a specific card, unrestricted card pool, 2 players.

Commander and Two-Headed Giant are **not built and not offered**,
but they returned to the ROADMAP on 2026-10-17 (owner decision), so
Phase 6 designs so they stay reachable. AGENTS.md FMT-005 draws the
line: a seat model that can hold four is in scope; a game that seats
four is not. See `docs/architecture/OPEN_FORMAT.md`, FMT-001 and
FMT-005.

This session is scoped to `Proxic_Arena` (this folder) only.

- `../Proxic_Arena_OLD` is the previous implementation: **read-only
  reference**, bug-history archive and executable evidence. Never write
  to it. See AGENTS.md ISO-001.
- `../Proxic_Deck_Builder` is a permanently separate sibling project
  handled in its own session. No merge is planned or expected. Read and
  copy freely; never write. See AGENTS.md ISO-002.

```text
READ OLD
BUILD NEW
```
