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
| 1 | Application Foundation | **COMPLETE** 2026-10-15 — gate PASSED, deployed and verified at `https://proxic.barnflix.net` | `PHASE_01_APPLICATION_FOUNDATION_LOCKED.md` |
| 2 | Deck Package Import | **COMPLETE** 2026-10-15 — gate PASSED, 20/20 acceptance tests | `PHASE_02_DECK_PACKAGE_IMPORT_LOCKED.md` |
| 3 | Accounts & Authentication | **COMPLETE** 2026-10-16 — gate PASSED, deployed and signed into at `https://proxic.barnflix.net` | `PHASE_03_ACCOUNTS_AUTHENTICATION_LOCKED.md` |
| 4 | Deck Depot | **COMPLETE** 2026-10-16 — gate PASSED, deployed; a deck shared and revoked between two accounts on the live host | `PHASE_04_DECK_DEPOT_LOCKED.md` |
| 5 | Lobby, Game Rooms, Match Setup | **COMPLETE** 2026-10-17 — gate PASSED, 26/26 acceptance including the production run. 4 amendments: no join codes, presence, invitations, ephemeral chat | `PHASE_05_EXIT_GATE.md` |
| 6 | Forge Match Runtime & Game Protocol | **LOCKED** 2026-10-17 — two-pass review, 7 owner decisions. **ACTIVE** | `PHASE_06_FORGE_MATCH_RUNTIME_AUTHORITATIVE_GAME_PROTOCOL_LOCKED.md` |
| 7 | Battlefield Presentation & Interaction | DRAFT — §7.51's six questions RESOLVED 2026-10-15; **renderer decided 2026-10-19: React DOM + SVG overlays, PixiJS a measured contingency** (`docs/architecture/BATTLEFIELD_RENDERING.md`, Phase 1 Amendment 3) | `PHASE_07_BATTLEFIELD_PRESENTATION_INTERACTION_DRAFT.md` |
| 8+ | Commander | **INTENDED** — owner decision 2026-10-17. Not scoped, not scheduled. | — |
| 8+ | Two-Headed Giant | **INTENDED** — owner decision 2026-10-17. Not scoped, not scheduled. | — |

Commander and Two-Headed Giant were removed from scope on 2026-10-15
and put back on the ROADMAP on 2026-10-17. The difference matters:
they are not being built, and nothing offers them, but Phase 6 now
designs so they remain reachable without rework. AGENTS FMT-001 and
FMT-005 draw that line — a seat model that can hold four is in
scope; a game that seats four is not.

Phase 2 added deck import: `docs/architecture/DECK_PACKAGE_FORMAT.md`
is the Deck Builder contract and `DECK_IMPORT_PIPELINE.md` is how an
import runs.

Phase 3 added accounts: `docs/architecture/AUTHENTICATION.md` is how
identity works and `AUTHORIZATION.md` is what an identity may do.

Phase 4 added deck ownership: `docs/architecture/DECK_DEPOT.md` is
the feature and `DECK_AUTHORIZATION.md` is the rule set later phases
must ask rather than trust a client for.
Owner decisions: **D1** every deck endpoint requires a session,
**D2** the LAN port stays for diagnostics while login goes through
the tunnel, **D3** the first administrator is `RudeLeft`.

Phase 5 added the lobby: `docs/architecture/LOBBY_ARCHITECTURE.md`
is the model, `LOBBY_PROTOCOL.md` is the wire, and
`MATCH_SETUP_CONTRACT.md` is the handoff Phase 6 launches from.
Owner decisions: **D1** no join codes — presence, invitations and
chat instead, **D2** invitations reach online users only, **D3** one
global ephemeral chat channel, **D4** rooms expire after 24 hours of
inactivity.

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
| Database, Flyway, HikariCP | §1.35–§1.40 | done (run against a real PostgreSQL 16.4) |
| Structured logging | §1.41 | done (tested, rendered) |
| Docker image & compose stack | §1.52–§1.59 | done (built, run, outage and recovery tested) |
| Forge worker module | §1.60–§1.67 | not started — Phase 6 |
| Cloudflare edge | §1.48–§1.51 | **written, NOT VERIFIED** — needs the real host |

§1.71 status: Docker, PostgreSQL and the WebSocket foundation have
each been RUN and are claimed on that basis. The Forge worker and the
Cloudflare Tunnel have not, and are not claimed.
