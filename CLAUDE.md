# CLAUDE.md

Read `AGENTS.md` first, every session, before inspecting, planning,
editing, testing, building or playing this project. It is the operating
contract — project locations, phase discipline, evidence rules, Forge
boundaries, hidden-information rules, protocol invariants and verification
philosophy — and it maps the rest of the documents.

**Phase 0A has not been executed. No production feature work is
authorized.** See `PHASE_00A_FORGE_BLOCKING_VALIDATION_DRAFT.md`.

**One play mode only: Open Format** — 60-65 card deck, max 4
copies of a specific card, unrestricted card pool, 2 players. Commander
and Two-Headed Giant are out of scope (owner decision 2026-10-15). See
`docs/architecture/OPEN_FORMAT.md` and AGENTS.md FMT-001.

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
