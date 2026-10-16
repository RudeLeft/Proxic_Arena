# Proxic Arena

A browser-played Magic: The Gathering table, with **Forge** as the
authoritative rules engine. Players open a page, import a deck
exported by Proxic Deck Builder, and play a real game of Magic
adjudicated by Forge — not by a hand-written approximation of the
rules.

**Current phase: 3 — Accounts and Authentication.** Phase 1
(application foundation) and Phase 2 (deck package import) have both
passed their gates — `PHASE_01_EXIT_GATE.md` and
`PHASE_02_EXIT_GATE.md` list exactly what is proven. There is **no
gameplay yet**: the phases so far build the server, the page, the
database, the Docker stack, the Forge worker handshake, deck import,
and now accounts, and deliberately stop there.

**Everything except health, version and the status page now requires
a session.** Accounts are created by an administrator with
`arena-admin`; there is no self-registration. See
`docs/architecture/AUTHENTICATION.md`, and
`docs/troubleshooting/AUTHENTICATION.md` when a login will not
work.

**One play mode: Open Format** — 60–65 cards, at most 4 copies of any
one card (basic lands unlimited), no sideboard, 2 players. Commander
and Two-Headed Giant are out of scope. See
`docs/architecture/OPEN_FORMAT.md`.

---

## Architecture

```text
Browser  ──────────────────────────────┐
  React + PixiJS                       │  same origin: /api and /ws
                                       ▼
                              ┌──────────────────┐
  Cloudflare Tunnel  ───────► │   arena-server   │  Kotlin / Ktor
                              │  HTTP, WS, state │
                              └────────┬─────────┘
                                       │
                   ┌───────────────────┼───────────────────┐
                   ▼                   ▼                   ▼
           ┌──────────────┐   ┌────────────────┐   ┌──────────────┐
           │  PostgreSQL  │   │  /data volume  │   │ forge-worker │
           │ private net  │   │ decks, images  │   │ one JVM per  │
           └──────────────┘   └────────────────┘   │    match     │
                                                   └──────────────┘
```

Three rules shape all of it:

1. **The server is never a second rules engine.** It owns HTTP,
   WebSocket, sessions and worker lifecycle. It does not depend on
   Forge at all — the worker does, behind a process boundary.
2. **Forge is used unmodified**, pinned by commit. See
   `forge_patches/README.md`.
3. **Never send a viewer data they are not entitled to.** Filtering
   in the UI is not filtering.

## Technology

| | |
| --- | --- |
| Server | Kotlin 1.9.24, Ktor 2.3.12, Java 17 |
| Database | PostgreSQL 16.4, Flyway 10.17.0, HikariCP 5.1.0 |
| Frontend | React 18.3.1, PixiJS 8.2.6, Vite 5.4.2, TypeScript 5.5.4 |
| Worker | Java 17, Maven, `forge-core` + `forge-game` only |
| Tests | Vitest, JUnit 5, Testcontainers 1.21.3, Playwright 1.47.0 |
| Analysis | ESLint 9, Prettier 3, ktlint 12.1.1, detekt 1.23.6 |

Containers run as non-root with all Linux capabilities dropped,
`no-new-privileges`, and a read-only root filesystem for the server.
See `docs/security/PHASE_01_BASELINE_REVIEW.md`.

Every version is pinned exactly. Nothing floats.

## Project locations

| | |
| --- | --- |
| **This repository** | `Proxic_Arena` — the authoritative project |
| Previous implementation | `../Proxic_Arena_OLD` — **read-only** reference and bug-history archive. Never write to it. |
| Deck Builder | `../Proxic_Deck_Builder` — a permanently separate sibling. Read and copy freely; never write. No merge is planned. |

---

## Prerequisites

- **Docker Desktop** (Engine 29+) with the WSL2 backend
- **Java 17** (a JDK, for building outside Docker)
- **Node 24** (for the frontend outside Docker)
- **Maven 3.9** (for the Forge worker)
- A local checkout of upstream Forge at the pinned commit, **if you
  want the worker to do anything** (see below)

Nothing else. If a build needs something not listed here, that is a
bug in this README (§1.77).

### Building the Forge worker

The upstream Forge checkout is ~1 GB and belongs to upstream, so it
is deliberately not in this repository (`.gitignore`). Without it the
server, the frontend, the database and the Docker stack all build and
run; only the five Forge-worker tests skip, saying why.

To build it:

```bash
git clone https://github.com/Card-Forge/forge.git third_party/forge
cd third_party/forge
git checkout 4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
mvn install -DskipTests -pl forge-core,forge-game -am
cd ../..
cd forge-worker && mvn package
```

Then point the server at the jar and at Forge's data files:

```bash
export PROXIC_FORGE_WORKER_JAR=$PWD/forge-worker/target/forge-worker-0.1.0.jar
export PROXIC_FORGE_RES=$PWD/third_party/forge/forge-gui/res
```

Readiness should then report `forgeWorker: "ok"`. Any other value is
explained in `docs/troubleshooting/FOUNDATION.md`.

> The Forge artifacts on this machine were installed during Phase 0A
> and the worker has been built and run against them. The clone-and-
> install sequence above is written from that work; a fully cold run
> of it has not been repeated since, so treat the first execution on
> a new machine as the verification.

## Development startup

```bash
cp .env.example .env     # then fill it in; see Secrets below
docker compose -f docker-compose.dev.yml up -d
./gradlew :server:run
cd frontend && npm ci && npm run dev
```

PostgreSQL runs in Docker; the server and Vite run on the host, where
a rebuild is seconds rather than an image build. Vite serves the page
on <http://localhost:5173> and proxies `/api` and `/ws` to Ktor on
8080, so the browser talks to one origin and no CORS config exists.

`cloudflared` is **not** required for local development.

## Production-style local startup

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Serves the whole stack on <http://127.0.0.1:8080>: Ktor serving the
compiled React app, PostgreSQL on a private network with no published
port, and named volumes for both.

The override is what publishes the port. `docker compose up` on its
own publishes **nothing** — in production the Cloudflare tunnel
reaches the server over the internal network, and the safe
configuration is the default rather than the one you have to
remember (§1.51, §1.99).

To include the Cloudflare edge (only useful on the real host):

```bash
docker compose --profile edge up -d
```

## Shutdown

```bash
docker compose down
```

Stops and removes the containers. **Volumes survive**, so your
database and `/data` are intact when you bring it back up.

```bash
docker compose down -v
```

> **`-v` DESTROYS the persistent volumes.** Every imported deck, every
> stored card image and the entire database go with it, and nothing
> asks for confirmation. There is no undo. Use it when you want a
> genuinely clean slate and never as a routine stop.

## Tests

```bash
./gradlew :server:test                       # 36 tests
cd frontend && npm test                      # 20 tests
cd frontend && npm run e2e                   # 6 browser tests
./gradlew :server:ktlintCheck :server:detekt # Kotlin analysis
cd frontend && npm run lint                  # ESLint + types
```

The database tests start a throwaway PostgreSQL through
Testcontainers, so they never touch development data. The browser
tests run against whatever `PROXIC_E2E_URL` points at — by default
the production stack on 8080.

Tests that cannot run **skip with a reason**; they never pass
silently. If you see `SKIPPED: Docker is not available`, that is the
suite telling you the truth rather than flattering you.

## Logs

```bash
docker compose logs -f arena-server     # server
docker compose logs -f postgres         # database
docker compose --profile edge logs -f cloudflared
```

Worker logs arrive on the server's stderr, because the worker's stdout
is the protocol channel.

Every server line carries `req`, `conn`, `sess`, `match`, `player` and
`err` fields, empty until the relevant phase populates them. To follow
one request end to end, grep its `req=` id.

## Database reset — development only

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
```

This destroys the **development** volume and lets Flyway rebuild the
schema from scratch on next start.

> Never run this against production. The two stacks are separated
> deliberately: different compose files, different Compose project
> names (`proxic-arena-dev` and `proxic-arena`) and different
> volumes, so a muscle-memory `down -v` in a development shell cannot
> reach the real database. The project names are not cosmetic —
> without them Compose derives the name from the directory, both
> files define a `postgres` service, and starting the dev stack
> replaces the production container. On the Unraid host, restoring
> from backup is the procedure; there is no reset.

## Forge version

The pinned commit lives in exactly one file, `forge-pin.properties`,
read by both build systems:

```text
forge-2.0.15 = 4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
```

The server reports it at `/api/version`. The worker reports its own,
and the server **compares the two** — a worker built against a
different checkout is refused rather than used.

> **Updating Forge is never a routine dependency bump.** Phase 0A's
> findings — the bootstrap order, the AI-only priority guard, the
> ~105 `PlayerController` methods, the hidden-information behaviour —
> were measured against this exact commit. Changing it invalidates
> that evidence until it is re-measured. It needs an owner decision
> and an ADR (AGENTS VEND-005), and the gates that depend on it must
> be re-run.

## Cloudflare Tunnel deployment

Production is reached at `https://arena.barnflix.net` through a
Cloudflare Tunnel that terminates TLS at the edge and forwards to
`arena-server` over the internal Docker network. No host port is
published in that configuration, and PostgreSQL is never exposed.

The token comes from the Unraid environment and never from the
repository.

> **NOT YET VERIFIED.** The `cloudflared` service is written from the
> Phase 1 specification and has never been run. Its first run on the
> Unraid host is its verification, and acceptance tests P1-R through
> P1-U remain open until then. Nothing in this project describes
> unrun configuration as working (§1.71).

## Updating a base image

Every image is pinned by **digest**, not only by tag, in `Dockerfile`,
`docker-compose.yml` and `docker-compose.dev.yml`. A tag is a moving
pointer — `postgres:16.4-alpine` can be republished — so a tag-only
pin means the build that worked yesterday is not necessarily the one
that runs today.

To move to a new image, change the tag and refresh its digest:

```bash
docker buildx imagetools inspect postgres:16.5-alpine | head -2
```

Take the `Digest:` line and write `tag@sha256:...`. Keep the tag
alongside the digest: a bare digest tells a reader nothing about what
the image is.

These are manifest-**list** digests, so they still resolve per
architecture — amd64 here and on the Unraid host.

> This does not apply to the Forge pin, which is a different kind of
> decision entirely. See the Forge update warning above.

## Secrets

`.env` is gitignored and must stay that way. `.env.example` holds
placeholders only.

In production the server **refuses to start** when a secret is
missing or still holds its placeholder — exit code 78. That is
deliberate: a server that boots with an insecure default is worse
than one that does not boot.

Generate a session secret with `openssl rand -hex 32`.

## Folder layout

```text
AGENTS.md                  operating contract — read first
BUILD_PLAN.md              phase index and status
PHASE_*.md                 phase specifications and gates
forge-pin.properties       the pinned Forge commit (one source)

server/                    Kotlin/Ktor — HTTP, WS, sessions
forge-worker/              Java/Maven — Forge, one JVM per match
frontend/                  React + PixiJS + Vite
  e2e/                     Playwright, against a running stack
protocol/                  shared fixtures and schemas
database/                  see its README — migrations are NOT here
config/                    detekt configuration
docs/
  architecture/            accepted decisions, layout contract
  decisions/               ADRs
  research/                phase evidence
  troubleshooting/         FOUNDATION.md, DECK_IMPORT.md,
                           AUTHENTICATION.md
forge_patches/             empty on purpose; see its README
spikes/                    Phase 0A measurement harnesses
```

## Where to start reading

1. `AGENTS.md` — the operating contract.
2. `docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md` — the
   architectural facts Phase 0A established, and why.
3. `PHASE_01_EXIT_GATE.md` — what is actually proven today.
4. `docs/troubleshooting/FOUNDATION.md` — when something will not
   start.
5. `docs/security/PHASE_01_BASELINE_REVIEW.md` — the §1.99 baseline,
   checked rather than asserted.
6. `docs/architecture/DECK_PACKAGE_FORMAT.md` — the Deck Builder ↔
   Arena contract, and `DECK_IMPORT_PIPELINE.md` for how an import
   actually runs.
7. `docs/architecture/AUTHENTICATION.md` — who someone is, and
   `AUTHORIZATION.md` — what they may then do. When a login will not
   work, `docs/troubleshooting/AUTHENTICATION.md`, which starts with
   the one thing that catches everybody: sign in through the tunnel,
   not the LAN port.
8. `docs/deployment/UNRAID_INSTALL.md` — installing on the host, and
   `docs/deployment/UNRAID_CHECKLIST.md` — going public through the
   tunnel. Both have since been run against the real host, and
   carry the three corrections that deployment found.
