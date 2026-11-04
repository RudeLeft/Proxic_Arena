# Proxic Arena

A browser-played Magic: The Gathering table, with **Forge** as the
authoritative rules engine. Players open a page, import a deck
exported by Proxic Deck Builder, and play a real game of Magic
adjudicated by Forge — not by a hand-written approximation of the
rules.

**Version 1.41.0 (2026-11-04).** The main build was completed in 1.1.0,
with every question Forge can ask answered (Phase 8); 1.2.0 added the
redesigned lobby with avatars, a friendlier chat and card close-ups in
the Deck Depot; 1.3.0 added online/away badges, the Hall of Champions,
deck icons, a redesigned Admin page, and a site that shows strangers
the sign-in screen and nothing else; 1.4.0 gave the game its own page
and its own chat, with pictures by the life totals; 1.5.0 brought
accounts by invitation, emailed from an account set on the Admin page;
1.6.0 made card close-ups appear whole, never drawn from the top down;
1.7.0 polished the lobby, with room cards anybody can read and Ask to
join; 1.8.0 brought bigger, even text and the Hall of Champions page, with
monthly seasons, a fair rating and the Champion's Belt; 1.9.0 polished the
lobby, the Hall, the Deck Depot and Admin; 1.10.0 lets the Proxic Deck
Builder follow this Arena's deck rules, linked from the Account page;
1.11.0 has the Deck Builder send decks straight to the Deck Depot, with
pictures for the tokens they make; 1.12.0 lines up Admin's columns and
watches for new Forge releases; 1.13.0 keeps the printing a player
picked; 1.14.0 tidies the Hall of Champions; 1.15.0 adds password
resets by email, the Admin page's linked computers, and new avatars;
1.16.0 redraws the game screen (the stack, player plates, the turn's
steps, the opponent's hand, the card-title font and the life banner);
1.17.0 lays the battlefield in lit velvet and shows the Proxic card back;
1.18.0 gives one rule for when the game stops for you and a new action
button and turn steps; 1.19.0 stacks identical cards and tidies big
combats; 1.20.0 spaces the right-hand column evenly, with a tray for
mana, counters and markers; 1.21.0 adds a Report button for problems
and ideas, with an Admin tab to read them; 1.22.0 keeps each kind of card
on its own lines and busy boards in order; 1.23.0 answers many copies of
one trigger in two clicks (Phase 9, group 1); 1.24.0 asks every question
beside its card, floats the spell being cast in the middle and calms
trigger storms; 1.25.0 says what happened and why, shows each land's
mana, and lets friends watch a game; 1.26.0 puts the cards only you
see -- ordering, scry, searches, Fact or Fiction -- in one tray; 1.27.0
lets flyers hover, sorts out damage among blockers, adds the belt's
7-day rule and the Admin purge, and keeps every card's own picture;
1.28.0 takes decks of up to 100 cards, sent as light pictures, and shows
each card's own art on the table; 1.29.0 gives every notice one look, a
card top right of every page and of the table; 1.30.0 keeps card pictures
between games and cleans up the ones nothing uses; 1.31.0 ends a game
with a banner across the table and says whose move it is; 1.32.0 shows
each printing of a card with its own picture; 1.33.0 draws the stack
readable, each spell and trigger as its whole card; 1.34.0 opens a
graveyard or exile as pictures and says more in a card's close-up; 1.35.0
lays out the opening hand and shows a card's abilities cost first;
1.36.0 attacks and blocks by selecting creatures, then clicking where
they go; 1.37.0 closes rooms left sitting idle and lets a player left
waiting end the game; 1.38.0 says who searched, looked at or moved
cards, and what they did; 1.39.0 lets you pause the countdown and makes
the game's questions, buttons and cards clearer; 1.40.0 turns choosing a
number into a dial and splits damage in one window; 1.41.0 names a card
by clicking it on the table.
Two players
play a real game of Magic, run by Forge, on a graphical battlefield in
the style of MTG Arena — cards clicked to play, target, attack and
block, each player seeing only what Forge lets them see — with every
page built: sign in, Lobby, Deck Depot, Account, Admin. What each of
the nine phases proved is in `docs/history/phases/`; what changed in
each release is `CHANGELOG.md`; what is next, and how new features are
specified and approved, is `ROADMAP.md`.

**Phase 8 is complete** (`docs/history/phases/phase-08/`): a complete,
generated record of every question Forge can put to a player, a CI gate
so none can be skipped, a real-game proof for each, and every one built.
Who applies each Magic rule, and the proof, is
`docs/architecture/RULES_COVERAGE.md`.

**Everything requires a session** (owner, 2026-10-24): a visitor who
is not signed in is sent the sign-in screen and nothing else -- not the
version, not a health check, not the other pages' code. The health
checks answer only from inside the server's own container. Accounts
come by invitation: an administrator sends one from the Admin page and
the person creates their own account (spec 0014); an administrator can
also create one with `arena-admin create` (the server has a create route,
`POST /api/admin/accounts`, that no page uses). There is
no open sign-up. See
`docs/architecture/AUTHENTICATION.md`, and
`docs/operations/troubleshooting/AUTHENTICATION.md` when a login will not work.

**There are no join codes.** A host sees who is signed in and
invites them by clicking their name; an invitation the server
recorded is the only way into a room. Every signed-in player sees the
list of rooms and who sits in them — never their decks — but cannot
walk into one uninvited. There is no matchmaking. See `docs/architecture/LOBBY_ARCHITECTURE.md`,
and `docs/operations/troubleshooting/LOBBY.md` when a room misbehaves.

**Decks are private.** Each belongs to the account that uploaded it,
and is visible to nobody else until its owner shares it with a player
(the deck's Share panel lists every other active account to choose from).
In a room, the other player learns that you have chosen a deck —
never which one.
An administrator has no privileged access. See
`docs/architecture/DECK_DEPOT.md` and `DECK_AUTHORIZATION.md`.

**One play mode: Open Format** — 60–100 cards, at most 4 copies of any
one card (basic lands unlimited), no sideboard, 2 players. Commander
and Two-Headed Giant are not built and not offered; both are planned on
the ROADMAP (owner, 2026-10-17). See
`docs/architecture/OPEN_FORMAT.md`.

---

## Supported screens

A desktop or laptop at **1920×1080 or bigger** (owner 2026-10-30): full
screen or in a browser window, and bigger screens up to 4K and
ultrawide. Smaller screens, phones and tablets may work but are not
supported or tested (AGENTS UI-006).

## Architecture

```text
Browser  ──────────────────────────────┐
  React DOM + SVG (PixiJS installed,   │  same origin: /api and /ws
  contingency only — see               │
  docs/architecture/BATTLEFIELD_RENDERING.md)
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
2. **Forge is pinned by commit and not edited in place.** Two small
   owner-approved patches are applied to a fresh clone of the pin when
   the image is built; the vendored checkout stays unmodified. See
   `forge_patches/README.md`.
3. **Never send a viewer data they are not entitled to.** Filtering
   in the UI is not filtering.

## Technology

| | |
| --- | --- |
| Server | Kotlin 1.9.24, Ktor 2.3.13 (Netty 4.1.139), Java 17 (Temurin 17.0.20) |
| Database | PostgreSQL 16.15, Flyway 10.22.0, HikariCP 5.1.0 |
| Frontend | React 18.3.1, React Router 7.18.4, Vite 7.3.7, TypeScript 5.5.4; board is DOM + SVG. PixiJS 8.22.0 installed as a measured contingency (`docs/architecture/BATTLEFIELD_RENDERING.md`) |
| Worker | Java 17, Maven, `forge-core` + `forge-game`, and `forge-ai` for two checks (can this be paid now? what does it cost now?) |
| Tests | Vitest 5, JUnit 5, Testcontainers 1.21.3, Playwright 1.64.1 |
| Analysis | ESLint 9, Prettier 3, ktlint 1.x (Gradle plugin 12.1.1), detekt 1.23.6 |

The server container runs as non-root with every Linux capability
dropped, `no-new-privileges` and a read-only root filesystem. PostgreSQL
also drops every capability and has `no-new-privileges`, but adds back
the five its entrypoint needs to step down from root to the postgres
user (CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID). On Unraid a
short-lived `init-data` container runs as root, with the same
restrictions, only to set the data folder's owner. The optional
`cloudflared` service (profile `edge`, not used live) has no extra
hardening. See `docs/history/phases/phase-01/PHASE_01_BASELINE_REVIEW.md`.

Every library and base image version is pinned exactly. The one
exception is the app's own image, which the compose files take as
`ghcr.io/rudeleft/proxic_arena:latest`: CI promotes a build to `latest`
only after every check passes.

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
run; the tests that need the built worker or Forge's card data skip,
saying why (as the database tests skip without Docker).

To build it:

```bash
git clone https://github.com/Card-Forge/forge.git third_party/forge
cd third_party/forge
git checkout 4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
mvn install -DskipTests -pl forge-core,forge-game,forge-ai -am
cd ../..
cd forge-worker && mvn package
```

Then point the server at the jar and at Forge's data files:

```bash
export PROXIC_FORGE_WORKER_JAR=$PWD/forge-worker/target/forge-worker-0.1.0.jar
export PROXIC_FORGE_RES=$PWD/third_party/forge/forge-gui/res
```

Readiness should then report `forgeWorker: "ok"`. Any other value is
explained in `docs/operations/troubleshooting/FOUNDATION.md`.

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

`./gradlew :server:run` does not read `.env` (that file is for Docker
Compose). Without settings it runs in development mode with no
database. For one, give the host server the dev database's address in
its environment, e.g. `PROXIC_DATABASE_URL=jdbc:postgresql://127.0.0.1:5432/proxic`,
`POSTGRES_USER=proxic` and `POSTGRES_PASSWORD` set to the value in your
`.env` -- the dev database takes its password from there (`changeme` as
copied from `.env.example`, unless you changed it; `devonly` only with no
`.env`). `.env.example`'s `postgres` host name only works inside
Compose.

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
own publishes **nothing**, so the safe configuration is the default
rather than the one you have to remember (§1.51, §1.99). Live, the
Unraid file publishes host port 8765 for the tunnel, which runs outside
the stack (see "Cloudflare Tunnel deployment" below).

To include the stack's own Cloudflare edge instead (an option, unused
live and never run):

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
./gradlew :server:test                       # server tests (JUnit)
cd frontend && npm test                      # unit tests (Vitest)
cd frontend && npm run e2e                   # browser tests (Playwright)
./gradlew :server:ktlintCheck :server:detekt # Kotlin analysis
cd frontend && npm run lint                  # ESLint (types: npx tsc --noEmit)
python -I scripts/check-blocks.py <worker.jar> <forge res>  # Mechanics Lab games (menace, reasons)
```

Run the server suite and the browser tests **one at a time**: the
browser tests start real Forge games and the server suite dozens of
throwaway databases, and together they can exhaust Docker Desktop.

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

A worker's stdout is the protocol channel, and its stderr never reaches
the server's log: a match worker's goes to
`<dataRoot>/match-logs/<matchId>.log`, and the probe and card-resolver
workers' is discarded. `docker compose logs arena-server` shows no
worker output.

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

The pinned commit lives in `forge-pin.properties`, read by both build
systems (`scripts/check-integrity.py` alone reads the same commit from
`PHASE_00_ACCEPTED_DECISIONS.md`):

```text
forge.commit=4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
forge.release=forge-2.0.15
forge.maven.version=2.0.15
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

Production is reached at `https://proxic.barnflix.net` through a
Cloudflare Tunnel that terminates TLS at the edge. Live, `cloudflared`
runs as its own Unraid container, outside this stack, and reaches the
server on host port 8765 (`docker-compose.unraid.yml`; Phase 1
Amendment 2 allows this). PostgreSQL is never exposed. Acceptance tests
P1-R through P1-U passed on 2026-10-15
(`docs/history/phases/phase-01/PHASE_01_EXIT_GATE.md`);
`docs/operations/UNRAID_INSTALL.md` Step 9 repeats them from outside.

The stack's own `cloudflared` service (profile `edge`, reaching the
server over the internal network with no host port) is an option that
has **never been run**; nothing here describes it as working (§1.71).
Its token would come from the Unraid environment, never from the
repository.

## Updating a base image

Every base image is pinned by **digest**, not only by tag, in
`Dockerfile`, `docker-compose.yml`, `docker-compose.unraid.yml` and
`docker-compose.dev.yml` (the app's own image is `:latest`, above). A tag is a moving
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

In production the server **refuses to start** when the session secret
is missing or still holds a placeholder (`changeme` and the like), or
the database address is missing — exit code 78. The database password
is not checked that way: `scripts/unraid-setup.sh` generates it. That is
deliberate: a server that boots with an insecure default is worse
than one that does not boot.

Generate a session secret with `openssl rand -hex 32`.

## Folder layout

```text
AGENTS.md                  operating contract — read first
ROADMAP.md                 what is built, what is next, how work happens
CHANGELOG.md               plain-English notes per release
VERSION                    the release number, for people (nothing reads it)
forge-pin.properties       the pinned Forge commit and the app version the build reads

server/                    Kotlin/Ktor — HTTP, WS, sessions
forge-worker/              Java/Maven — Forge, one JVM per match
frontend/                  React + Vite — board is DOM + SVG; PixiJS a contingency
  e2e/                     Playwright, against a running stack
protocol/                  shared fixtures (four messages, test decks)
database/                  see its README — migrations are NOT here
config/                    detekt configuration
docs/
  architecture/            how the game works today (kept current)
  features/                one spec per feature; template in README.md
  operations/              Unraid install, updating, rollback
    troubleshooting/       FOUNDATION, DECK_IMPORT, AUTHENTICATION,
                           DECK_DEPOT, LOBBY, MATCH_RUNTIME
  decisions/               ADRs
  testing/                 Mechanics Lab ledger and evidence
  assets/                  logo, icon, brand images
  history/phases/          the main build's phase documents, frozen
forge_patches/             owner-approved Forge fixes; see its README
scripts/                   Mechanics Lab scenarios (check-*.py), tools
Test Deck/                 Mechanics Lab corpus (read-only input)
spikes/                    Phase 0A measurement harnesses
```

## Where to start reading

1. `AGENTS.md` — the operating contract.
2. `docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md` — the
   architectural facts Phase 0A established, and why.
3. `ROADMAP.md` — what is built and what is next; then
   `docs/history/phases/phase-07/PHASE_07_EXIT_GATE.md` for what the
   main build proved, and the earlier exit gates for each phase.
4. `docs/operations/troubleshooting/FOUNDATION.md` — when something will not
   start.
5. `docs/history/phases/phase-01/PHASE_01_BASELINE_REVIEW.md` — the §1.99 baseline,
   checked rather than asserted.
6. `docs/architecture/DECK_PACKAGE_FORMAT.md` — the Deck Builder ↔
   Arena contract, and `DECK_IMPORT_PIPELINE.md` for how an import
   actually runs.
7. `docs/architecture/AUTHENTICATION.md` — who someone is, and
   `AUTHORIZATION.md` — what they may then do. When a login will not
   work, `docs/operations/troubleshooting/AUTHENTICATION.md`, which starts with
   the one thing that catches everybody: sign in through the tunnel,
   not the LAN port.
8. `docs/operations/UPDATING.md` — two clicks, how to tell what is
   deployed, and how to roll back.
9. `docs/operations/UNRAID_INSTALL.md` — installing on the host and
   checking it from outside through the tunnel. It has been run against
   the real host and carries the corrections that deployment found.
