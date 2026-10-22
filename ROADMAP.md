# Proxic Arena — Roadmap

What is built, what is next, and how new work happens. Read `AGENTS.md`
first.

**One play mode today: Open Format** — 60–65 cards, max 4 copies of a
specific card (basic lands unlimited), no sideboard, 2 players. See
`docs/architecture/OPEN_FORMAT.md`.

## How work happens now

The main build ran as eight locked phases and finished on 2026-10-22
with version **1.0.0**. From here the project grows **one feature at a
time** (owner decision, 2026-10-22):

1. **Spec.** A short document in `docs/features/NNNN-name.md`: what the
   player sees, the tests that prove it, and any decisions for the owner.
   `docs/features/README.md` has the template.
2. **Approval.** The owner approves the spec. An approved spec is what a
   locked phase used to be; a big feature (Commander) simply has a long
   one.
3. **Build and ship.** Built and verified under every rule in
   `AGENTS.md`, released with a plain-English entry in `CHANGELOG.md`,
   and marked Done below.

## Features

| # | Feature | Status | Spec |
|---|---|---|---|
| 0001 | Sacrifice and surveil — "which creature do you sacrifice?" (Eldrazi Monument, Diabolic Edict) and "surveil N"; the two unbuilt questions most likely to stop a game | Draft — for approval | `docs/features/0001-sacrifice-and-surveil.md` |
| — | The other unbuilt Forge questions — a game that reaches one ends with an error. Next most likely: choosing what to destroy, ordering your own triggers and blockers, piles (Fact or Fiction), exert/enlist, attack taxes (Ghostly Prison), voting, splice. The full list and how likely each is: `docs/history/phases/phase-06/PHASE_06_EXIT_GATE.md` ("Unsupported Forge paths") | Planned | — |
| — | Commander | Planned (owner decision 2026-10-17; not scoped) | — |
| — | Two-Headed Giant | Planned (owner decision 2026-10-17; not scoped) | — |
| — | A match that survives a server restart (today it ends with no winner; P6-AZ) | Idea | — |
| — | A computer opponent | Owner question | — |
| — | Web server framework: Ktor 2.3 (end of its line) → Ktor 3 | Planned (maintenance) | — |
| — | Offer Forge patches 0001 and 0002 upstream | Idea | — |

Commander and Two-Headed Giant are not built and nothing offers them,
but the runtime is designed so they stay reachable without rework.
AGENTS FMT-001 and FMT-005 draw that line — a seat model that can hold
four is in scope; a game that seats four is not.

## Built: the main build, 2026-10-15 → 2026-10-22

Each phase's specification, amendments, audit, exit gate and research
are kept, unedited, in `docs/history/phases/phase-NN/`. The code cites
their sections by name ("PHASE_06 §6.17").

| Phase | Name | Result |
|---|---|---|
| 0 / 0A / 0B | Forge architecture validation | 0 superseded by 0A + 0B; 0A **ACCEPTED** 2026-10-15; 0B is a standing register of deferred questions, each with its trigger |
| 1 | Application Foundation | **COMPLETE** 2026-10-15 — deployed and verified at `https://proxic.barnflix.net` |
| 2 | Deck Package Import | **COMPLETE** 2026-10-15 — 20/20 acceptance tests |
| 3 | Accounts & Authentication | **COMPLETE** 2026-10-16 |
| 4 | Deck Depot | **COMPLETE** 2026-10-16 — private decks, sharing by username |
| 5 | Lobby, Game Rooms, Match Setup | **COMPLETE** 2026-10-17 — 26/26; no join codes: presence, invitations, chat |
| 6 | Forge Match Runtime & Game Protocol | **COMPLETE** 2026-10-20 — 65/65 (63 met, 2 classified); 48/48 required Mechanics Lab cards |
| 7 | Battlefield Presentation & Interaction, and the application pages | **COMPLETE** 2026-10-22 — 27/27, signed off by the owner; a 2026-10-22 security review fixed and recorded |

How the game works today — the living reference, kept current — is
`docs/architecture/`; the locked architectural facts from Phase 0A are
`docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md`; lasting decisions
are in `docs/decisions/`.
