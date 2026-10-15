# Proxic Arena — Build Plan

Master phase index (PHASE_01 §1.10). Each phase document is the
authority for its own contents; this file only says where things stand.
Read `AGENTS.md` first.

**One play mode: Open Format** — 60–65 cards, max 4 copies of a
specific card (basic lands unlimited), no sideboard, 2 players.
See `docs/architecture/OPEN_FORMAT.md`.

| Phase | Name | Status | Document |
|---|---|---|---|
| 0 | Forge Architecture Validation | SUPERSEDED (split into 0A/0B) | `PHASE_00_FORGE_ARCHITECTURE_VALIDATION_SUPERSEDED.md` |
| 0A | Forge Blocking Validation | **ACCEPTED** 2026-10-15 | `PHASE_00A_FORGE_BLOCKING_VALIDATION_DRAFT.md` |
| 0B | Forge Deferred Validation | OPEN (trigger register) | `PHASE_00B_FORGE_DEFERRED_VALIDATION_DRAFT.md` |
| 1 | Application Foundation | **ACTIVE** | `PHASE_01_APPLICATION_FOUNDATION_LOCKED.md` |
| 2 | Deck Package Import | PROVISIONAL | `PHASE_02_DECK_PACKAGE_IMPORT_PROVISIONAL.md` |
| 3 | Accounts & Authentication | PROVISIONAL | `PHASE_03_ACCOUNTS_AUTHENTICATION_PROVISIONAL.md` |
| 4 | Deck Depot | PROVISIONAL | `PHASE_04_DECK_DEPOT_PROVISIONAL.md` |
| 5 | Lobby, Game Rooms, Match Setup | PROVISIONAL | `PHASE_05_LOBBY_GAME_ROOMS_MATCH_SETUP_PROVISIONAL.md` |
| 6 | Forge Match Runtime & Game Protocol | PROVISIONAL | `PHASE_06_FORGE_MATCH_RUNTIME_AUTHORITATIVE_GAME_PROTOCOL_PROVISIONAL.md` |
| 7 | Battlefield Presentation & Interaction | DRAFT (6 open questions, §7.51) | `PHASE_07_BATTLEFIELD_PRESENTATION_INTERACTION_DRAFT.md` |

Accepted architectural facts live in
`docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md`; decisions taken
during build live in `docs/decisions/`.

## Phase 1 progress

| Area | Sections | State |
|---|---|---|
| Repository & toolchain | §1.1–§1.15 | done |
| Renderer lifecycle | §1.17–§1.19 | done (tested, run) |
| Health, version, status endpoints | §1.23–§1.26 | done (tested, run) |
| Static serving & SPA fallback | §1.27–§1.28 | done (tested, run) |
| WebSocket foundation & protocol | §1.29–§1.35 | done (tested, run) |
| Logging, request ids, error shape | §1.42–§1.44 | done |
| Configuration & secrets | §1.45–§1.47 | done (tested) |
| Foundation UI | §1.68–§1.70 | done (run, screenshotted) |
| Docker, Compose, Postgres, edge | §1.36–§1.41, §1.48–§1.67 | **blocked** — see `docs/decisions/0001-phase1-toolchain-conflict.md` |

Nothing above claims Docker, PostgreSQL, the Forge worker or the
Cloudflare edge works; none of it has been run (§1.71).
