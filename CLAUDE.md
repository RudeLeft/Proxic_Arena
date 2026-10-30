# CLAUDE.md

Read `AGENTS.md` first, every session, before inspecting, planning,
editing, testing, building or playing this project. It is the operating
contract — project locations, work discipline, evidence rules, Forge
boundaries, hidden-information rules, protocol invariants and verification
philosophy — and it maps the rest of the documents.

**The main build is COMPLETE — version 1.1.0, 2026-10-24.** Phases 0A
and 1-8 all passed their gates; Phase 8 (every Forge question, answered
and proven) was accepted by the owner 2026-10-24. Their documents are
frozen history in `docs/history/phases/` and are never edited. **Work
is one feature at a time**: only on a feature spec the owner has
approved (`docs/features/`, listed in `ROADMAP.md`), or under a locked
phase — **Phase 9 (every game window,
`PHASE_09_GAME_WINDOWS_LOCKED.md`) is LOCKED and ACTIVE**; see AGENTS.md
"Current work". Who applies each Magic rule, and the proof, is
`docs/architecture/RULES_COVERAGE.md`.
Read `docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md` before any
production code — it carries the architectural facts Phase 0A
established.

**One play mode only: Open Format** — 60-65 card deck, max 4
copies of a specific card, unrestricted card pool, 2 players.

Commander and Two-Headed Giant are **not built and not offered**,
but they are on the ROADMAP (owner decision 2026-10-17), so the
runtime is designed so they stay reachable. AGENTS.md FMT-005 draws the
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
