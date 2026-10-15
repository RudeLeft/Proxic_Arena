# Proxic Arena Build Plan

# Phase 1 — Application Foundation

**Status:** LOCKED  
**Phase Type:** Production foundation  
**Implementation Authorization:** NOT AUTHORIZED until Phase 0 execution is complete and accepted  
**Depends On:** Locked Phase 0 specification + accepted `docs/research/phase-00/FINAL_RECOMMENDATION.md`

---

## 1.0 Purpose

Phase 1 creates the permanent production foundation for the new Proxic Arena web application.

Phase 0 determines how Proxic integrates with Forge.

Phase 1 takes those accepted findings and builds the permanent application structure around them.

At the end of Phase 1, Proxic Arena will have:

```text
Browser
   ↓
Cloudflare
   ↓
Cloudflare Tunnel
   ↓
Kotlin/Ktor Arena Server
   ├── React/Vite production frontend
   ├── HTTP API
   ├── WebSocket API
   ├── PostgreSQL
   └── Phase-0-selected Forge worker boundary
```

running reproducibly through Docker.

Phase 1 does **not** implement Magic gameplay.

Phase 1 does **not** implement deck package importing.

Phase 1 does **not** implement user-facing match creation.

Phase 1 does **not** implement the final battlefield.

Phase 1 creates the infrastructure those later systems require.

---

## 1.1 Permanent Project Locations

The locked Phase 0 project-location rules remain in force.

### Old Project — Reference Only

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

The coding agent may:

```text
READ
INSPECT
COMPARE
COPY USEFUL MATERIAL FROM
```

the old project.

It MUST NOT modify it.

### New Project — Production Build

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena
```

All Phase 1 production work belongs here.

Permanent rule:

```text
READ OLD
BUILD NEW
```

---

## 1.2 Phase 0 Ingestion Gate

Before changing or creating production application code, the coding agent MUST read:

```text
docs/phases/PHASE_00_FORGE_ARCHITECTURE_VALIDATION.md

docs/research/phase-00/FINAL_RECOMMENDATION.md
```

and all Phase 0 research documents referenced by the final recommendation.

The agent must not begin Phase 1 merely because the Phase 0 research files exist.

The project owner must have explicitly accepted the Phase 0 result.

---

## 1.3 Phase 0 Decision Import

Before implementation begins, create:

```text
docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md
```

This document must summarize the accepted Phase 0 results.

At minimum:

```text
Forge commit
Forge packaging model
Forge source preservation model
Forge adapter strategy
Forge worker protocol
Forge process model
Forge bootstrap requirements
Forge resource requirements
state serialization strategy
hidden-information strategy
semantic-event strategy
object identity strategy
decision ownership strategy
Commander capability
Two-Headed Giant capability
Forge update procedure
required Forge compatibility tests
```

This document must contain decisions, not the entire Phase 0 research narrative.

Its purpose is to tell later coding agents:

> These are the architectural facts established by Phase 0.

---

## 1.4 Phase 0 Unresolved-Decision Gate

If the accepted Phase 0 report contains a material item classified as:

```text
UNKNOWN
UNRESOLVED
REQUIRES USER DECISION
```

and that item affects Phase 1 implementation:

**STOP AND ASK THE PROJECT OWNER.**

Do not fill the gap with an assumption.

---

## 1.5 Approved Application Technology Stack

Unless Phase 0 reveals an actual incompatibility affecting one of these technologies, Phase 1 uses:

| Responsibility | Technology |
|---|---|
| Browser language | TypeScript |
| UI library | React |
| Build tooling | Vite |
| Battlefield renderer | PixiJS |
| Backend language | Kotlin |
| Backend framework | Ktor |
| Serialization | kotlinx.serialization |
| Database | PostgreSQL |
| Database migrations | Flyway |
| DB connection pooling | HikariCP |
| Real-time browser transport | WebSocket |
| Normal application API | HTTP/JSON |
| Containerization | Docker |
| Orchestration | Docker Compose |
| Production frontend serving | Ktor static content |
| Public hostname / TLS edge | Cloudflare |
| Secure origin connectivity | Cloudflare Tunnel / `cloudflared` |
| Frontend unit tests | Vitest |
| React component tests | Testing Library |
| Browser end-to-end tests | Playwright |
| Backend tests | JUnit/Kotlin test |
| Kotlin linting | ktlint |
| Kotlin static analysis | detekt |
| TypeScript linting | ESLint |
| Formatting | Prettier |
| Source control | Git |

The existing Cloudflare configuration provides the public HTTPS endpoint for:

```text
https://arena.barnflix.net
```

including the existing certificate and security configuration.

Exact dependency versions must be selected and pinned when Phase 1 implementation begins.

Do not use floating `latest` versions for production dependencies.

---

## 1.6 Architecture at the End of Phase 1

Production architecture:

```text
                         INTERNET
                            │
                            ▼
                       Cloudflare
              TLS / hostname / edge security
                            │
                            ▼
                    Cloudflare Tunnel
                        cloudflared
                            │
                  private Docker network
                            │
                            ▼
                    Kotlin / Ktor
                     Arena Server
              ┌─────────────┼──────────────┐
              │             │              │
              ▼             ▼              ▼
        React static      /api/*          /ws/*
           files            │              │
                             │              │
                             └──────┬───────┘
                                    │
                     ┌──────────────┴─────────────┐
                     │                            │
                     ▼                            ▼
                 PostgreSQL              Phase-0-selected
                                         Forge boundary
                                                │
                                                ▼
                                         Forge Runtime
```

The Forge side of this diagram MUST be replaced with the exact accepted Phase 0 architecture.

Do not preserve placeholder assumptions after Phase 0 provides the real answer.

---

## 1.7 Architectural Ownership

### Browser owns

```text
presentation
user interaction
local animation
responsive layout
visual state derived from server state
connection status
input collection
```

The browser does NOT own:

```text
Magic legality
card behavior
priority legality
target legality
mana legality
combat legality
hidden-information authority
game outcome
```

### Arena Server owns

```text
React static-file serving in production
HTTP API
WebSocket connections
accounts later
sessions later
authentication later
deck persistence later
client connection identity
message routing
worker lifecycle
logging
database access
server configuration
protocol enforcement
```

The Arena Server does NOT become a second Magic rules engine.

### Cloudflare owns

For the production deployment, Cloudflare is responsible for the existing public edge configuration for:

```text
arena.barnflix.net
```

including the public certificate and existing edge security policies.

`cloudflared` provides the tunnel from Cloudflare to the private Proxic Docker network.

Cloudflare configuration is infrastructure configuration.

It must not become application logic.

### Forge Worker / Adapter owns

Exactly the responsibilities accepted from Phase 0.

Expected category:

```text
Forge bootstrap
Forge match lifecycle
Forge decision adapter
state serialization
visibility-safe player views
semantic event translation
deck translation into Forge
```

### Forge owns

```text
Magic rules
cards
legality
game state
stack
priority
combat
replacement effects
triggers
state-based actions
format rules supported by Forge
```

---

## 1.8 Repository Structure

Target:

```text
Proxic_Arena/
│
├── AGENTS.md
├── README.md
├── BUILD_PLAN.md
├── VERSION
├── LICENSE
│
├── .env.example
├── .gitignore
├── .gitattributes
├── .editorconfig
│
├── docker-compose.yml
├── docker-compose.dev.yml
│
├── frontend/
│
├── server/
│
├── forge-worker/
│
├── protocol/
│
├── database/
│
├── docker/
│
├── scripts/
│
├── tests/
│
├── docs/
│   ├── phases/
│   ├── architecture/
│   ├── decisions/
│   ├── research/
│   └── troubleshooting/
│
├── third_party/
│   └── forge/
│
└── forge_patches/
```

If Phase 0 selected a different exact Forge source layout, use the Phase 0 result.

Do not duplicate Forge in multiple locations.

---

## 1.9 Root `AGENTS.md`

Phase 1 must create an authoritative:

```text
AGENTS.md
```

at the root of the new project.

Every coding agent must be instructed to read it first.

At minimum it must state:

```text
CURRENT PROJECT:
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena

OLD REFERENCE PROJECT:
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD

RULE:
READ OLD
BUILD NEW
```

It must also state:

- old project is read-only;
- Forge must remain upstream and unmodified where practical;
- project owner approval is required for Forge patches;
- Forge is authoritative for Magic rules;
- browser does not determine legality;
- locked phases cannot be silently changed;
- current active phase must be checked before implementation;
- future phases must not be started automatically;
- tests may not be claimed unless actually executed;
- conflicts with locked documents require escalation.

---

## 1.10 `BUILD_PLAN.md`

Create a lightweight master phase index.

Example:

```markdown
# Proxic Arena Build Plan

| Phase | Name | Status |
|---|---|---|
| 0 | Forge Architecture Validation | LOCKED / EXECUTED |
| 1 | Application Foundation | ACTIVE |
| 2 | Deck Package Import | NOT STARTED |
```

It should point to detailed phase documents rather than duplicate them.

---

## 1.11 Architecture Decision Records

Create:

```text
docs/decisions/
```

Phase 1 must turn accepted Phase 0 architectural results into ADRs.

Expected examples:

```text
ADR-001-web-application.md
ADR-002-typescript-react.md
ADR-003-pixijs-renderer.md
ADR-004-kotlin-ktor.md
ADR-005-postgresql.md
ADR-006-forge-authority.md
ADR-007-forge-source-strategy.md
ADR-008-forge-adapter-strategy.md
ADR-009-forge-process-model.md
ADR-010-hidden-information.md
ADR-011-worker-protocol.md
ADR-012-cloudflare-tunnel-deployment.md
```

Each ADR contains:

```text
Status
Context
Decision
Alternatives considered
Reason
Consequences
Evidence
Date
```

---

## 1.12 No ADR May Rewrite Phase 0

If an ADR contradicts accepted Phase 0 evidence:

**STOP.**

Do not use an ADR as a way to bypass a locked phase.

The contradiction must be handled as a formal Phase 0 amendment.

---

## 1.13 Frontend Project

Create:

```text
frontend/
```

using:

```text
TypeScript
React
Vite
```

Recommended structure:

```text
frontend/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── AppErrorBoundary.tsx
│   │
│   ├── pages/
│   │   ├── FoundationPage.tsx
│   │   └── NotFoundPage.tsx
│   │
│   ├── components/
│   │   ├── ConnectionStatus.tsx
│   │   ├── ServiceStatus.tsx
│   │   └── VersionDisplay.tsx
│   │
│   ├── battlefield/
│   │   ├── RendererTest.ts
│   │   └── README.md
│   │
│   ├── api/
│   │   ├── http.ts
│   │   └── websocket.ts
│   │
│   ├── protocol/
│   ├── state/
│   ├── config/
│   ├── styles/
│   ├── main.tsx
│   └── test/
│
├── public/
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
└── eslint.config.*
```

The frontend does not need its own permanent production container.

Production frontend files are built by Vite and incorporated into the Arena Server runtime.

---

## 1.14 TypeScript Rules

Enable strict TypeScript.

At minimum:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

The coding agent must not disable strictness merely to make compilation easier.

Avoid uncontrolled:

```text
any
unknown casts
non-null assertions
```

where a proper type can be defined.

---

## 1.15 Frontend Dependency Policy

Use the minimum dependencies required for Phase 1.

Do not install speculative libraries for:

```text
drag-and-drop
deck editing
charts
authentication UI
game-state management
animations
sound
matchmaking
Commander
```

until their phase needs them.

---

## 1.16 React Responsibilities in Phase 1

React will implement:

```text
application shell
foundation/status page
routing
error boundary
backend connectivity
WebSocket connectivity
basic service status
version display
```

React will NOT implement:

```text
cards
hand
battlefield
deck package import
match lobby
login
game controls
priority controls
combat
stack UI
```

---

## 1.17 PixiJS Foundation

Install PixiJS during Phase 1.

Create one isolated renderer test.

It should prove:

```text
React page
    ↓
mount PixiJS canvas
    ↓
render object
    ↓
resize with browser
    ↓
cleanly destroy/unmount renderer
```

No MTG cards.

No combat.

No battlefield model.

---

## 1.18 PixiJS Lifecycle Test

Verify that navigating away from and back to the renderer page does not create:

```text
duplicate canvases
abandoned animation loops
duplicate event listeners
obvious resource leaks
```

---

## 1.19 Responsive Foundation

Test at least:

```text
1366 × 768
1920 × 1080
2560 × 1440
```

The real battlefield layout is later.

---

## 1.20 Arena Server Project

Create:

```text
server/
```

as a Kotlin/Ktor project.

Recommended package:

```text
net.barnflix.proxicarena
```

Suggested layout:

```text
server/
├── src/main/kotlin/net/barnflix/proxicarena/
│   ├── Application.kt
│   ├── config/
│   ├── http/
│   ├── websocket/
│   ├── database/
│   ├── logging/
│   ├── worker/
│   ├── services/
│   ├── repositories/
│   ├── model/
│   └── errors/
│
├── src/main/resources/
│   └── web/
│
├── src/test/kotlin/
├── build.gradle.kts
└── Dockerfile
```

The production Vite build should ultimately be copied or packaged into an appropriate static-resource directory such as:

```text
server/src/main/resources/web/
```

or an equivalent generated build location.

Generated frontend output must not be manually maintained.

---

## 1.21 Gradle Structure

Prefer a Gradle multi-project structure if Phase 0 finds no reason against it.

Conceptually:

```text
settings.gradle.kts

include("server")
include("forge-worker")
```

Potential shared JVM-only code should live in an explicitly named module rather than being copied between projects.

Do not move upstream Forge source into a Gradle module merely for convenience.

---

## 1.22 Server Endpoints

Required infrastructure endpoints:

```text
GET /api/health/live
GET /api/health/ready
GET /api/version
GET /api/system/status
```

---

## 1.23 Liveness

`GET /api/health/live`

answers:

> Is the Arena Server process alive?

Example:

```json
{
  "status": "ok",
  "service": "arena-server"
}
```

It should not fail merely because PostgreSQL or Forge is temporarily unavailable.

---

## 1.24 Readiness

`GET /api/health/ready`

answers:

> Can the Arena Server currently perform the Phase 1 functions it is supposed to perform?

Expected dependencies may include:

```text
database
Forge worker runtime availability
required filesystem directories
```

based on Phase 0.

---

## 1.25 Version Endpoint

`GET /api/version`

must eventually expose:

```json
{
  "proxic_version": "0.1.0",
  "protocol_version": 1,
  "forge_commit": "<phase-0-pinned-commit>",
  "java_version": "<runtime>",
  "build_id": "<optional>"
}
```

Do not manually duplicate the Forge hash in unrelated source files.

---

## 1.26 System Status Endpoint

Example:

```json
{
  "server": "ok",
  "database": "ok",
  "forge_runtime": "ok"
}
```

It must not expose secrets, internal stack traces, connection strings, or sensitive infrastructure data.

---

## 1.27 Production Static Frontend Serving

Ktor is responsible for serving the compiled React/Vite application in production.

Conceptual routing:

```text
/                 React application
/assets/*         Vite-generated static assets
/api/*            HTTP API
/ws/*             WebSockets
```

Ktor must provide appropriate SPA fallback behavior for React client-side routes.

For example:

```text
/
/play
/settings
```

should eventually resolve to the React application rather than return an HTTP 404 merely because there is no physical file at that route.

API and WebSocket paths must not be swallowed by SPA fallback.

---

## 1.28 Development Frontend Serving

Development should use the Vite development server for hot reload.

Conceptually:

```text
Browser
   ↓
Vite :5173
   ├── React hot reload
   ├── /api proxy → Ktor
   └── /ws proxy → Ktor
```

Production does not run the Vite dev server.

---

## 1.29 WebSocket Foundation

Create:

```text
/ws/system
```

for:

```text
connection verification
protocol envelope verification
heartbeat verification
disconnect/reconnect plumbing
```

Example:

```json
{
  "protocol_version": 1,
  "type": "HELLO",
  "message_id": "...",
  "payload": {
    "server_version": "0.1.0"
  }
}
```

Client:

```json
{
  "protocol_version": 1,
  "type": "PING",
  "message_id": "...",
  "payload": {}
}
```

Server:

```json
{
  "protocol_version": 1,
  "type": "PONG",
  "message_id": "...",
  "payload": {}
}
```

No Magic messages.

---

## 1.30 WebSocket Connection Identity

Every WebSocket connection receives an internal connection ID.

Logging should be capable of correlating:

```text
connection_id
request/message_id
session_id later
player_id later
match_id later
```

---

## 1.31 Protocol Boundary

Create:

```text
protocol/
```

Recommended:

```text
protocol/
├── README.md
├── schemas/
├── examples/
└── fixtures/
```

Phase 1 defines only infrastructure protocol objects.

---

## 1.32 Protocol Version

Establish:

```text
PROTOCOL_VERSION = 1
```

unless Phase 0 establishes another value.

Protocol mismatch must fail clearly.

---

## 1.33 Protocol Fixtures

For every Phase 1 message type create canonical JSON fixtures.

Both Kotlin and TypeScript tests must parse the same fixtures.

---

## 1.34 No English-Prompt API

Human-readable prompt text may later exist for display/accessibility.

Client behavior must never depend on parsing English prompt text.

---

## 1.35 Database Foundation

Create PostgreSQL through Docker.

The database must not be publicly exposed.

Arena Server is the only production application service that accesses it directly unless a later locked phase changes that.

---

## 1.36 Database Migrations

Use Flyway.

First migration:

```text
V001__application_foundation.sql
```

Do not create speculative tables for:

```text
users
decks
cards
matches
friends
rankings
```

until their phase defines them.

---

## 1.37 Application Metadata

A minimal metadata table may be created if it is genuinely required.

If it is not required, Flyway history plus a database connectivity check is enough.

Do not create unnecessary schema simply to populate the database.

---

## 1.38 Database Connectivity

Use:

```text
HikariCP
```

for connection pooling.

No database credentials in code.

---

## 1.39 Database Network Rule

Production:

```text
Arena Server → private Docker network → PostgreSQL
```

There must be no public PostgreSQL binding.

A localhost-only developer mapping may be enabled in development configuration if useful.

---

## 1.40 Persistence Volumes

Create named persistent volumes for:

```text
PostgreSQL data
application data
```

Application data root:

```text
/data
```

Future directories may include:

```text
/data/decks
/data/card-images
/data/replays
/data/temp
```

Phase 1 may reserve these locations but does not implement their application behavior.

---

## 1.41 Logging

Use structured logging.

Logs should support:

```text
timestamp
level
service
request_id
connection_id
session_id
match_id
player_id
message
error_code
```

---

## 1.42 No `println` Production Logging

`println()` may be temporary debugging only.

Forge stdout handling must follow Phase 0.

---

## 1.43 HTTP Request IDs

Every incoming request receives a request ID.

Return it in the response and include it in logs.

---

## 1.44 Centralized Error Shape

Example:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred.",
    "request_id": "..."
  }
}
```

Production responses must not contain stack traces.

---

## 1.45 Configuration

Create:

```text
.env.example
```

Potential fields:

```text
APP_ENV
APP_VERSION
LOG_LEVEL

POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
DATABASE_HOST
DATABASE_PORT

PUBLIC_BASE_URL

FORGE_HOME
FORGE_COMMIT
FORGE_WORKER_CONFIG

CLOUDFLARE_TUNNEL_TOKEN
```

Actual Forge fields come from Phase 0.

The Cloudflare tunnel token appears only as a safe placeholder in `.env.example`.

---

## 1.46 Secret Handling

Never commit:

```text
.env
database passwords
Cloudflare tunnel tokens
TLS private keys
session secrets
API keys
```

Production secrets are supplied through the Unraid/Docker environment or another approved secret mechanism.

---

## 1.47 Frontend Runtime Configuration

Do not hardcode:

```text
arena.barnflix.net
localhost ports
LAN IPs
WebSocket hosts
```

through frontend source.

Production frontend should use same-origin paths:

```text
/api
/ws
```

Development Vite configuration may proxy those paths to the local Ktor development server.

---

## 1.48 Cloudflare Production Edge

The production public path is:

```text
https://arena.barnflix.net
        │
        ▼
     Cloudflare
        │
        ▼
 Cloudflare Tunnel
        │
        ▼
    cloudflared
        │
 private Docker network
        │
        ▼
 arena-server:8080
```

---

## 1.49 Existing Certificate and Security Configuration

The project owner already maintains the expected public certificate and security configuration for:

```text
arena.barnflix.net
```

including HSTS.

Phase 1 must preserve the existing public TLS/security configuration.

---

## 1.50 Tunnel Origin

In production, `cloudflared` should route directly to the Arena Server over the private Docker network.

Conceptually:

```text
cloudflared
    ↓
http://arena-server:8080
```

unless the user's existing Cloudflare/Unraid configuration requires an equivalent target.

The Arena Server does not need a host-public port merely to receive Tunnel traffic.

---

## 1.51 Production Host Port Exposure

Preferred production configuration:

```text
cloudflared → arena-server:8080
```

over an internal Docker network.

Do not publish:

```text
8080:8080
```

to the host in production unless required by the actual Unraid/tunnel configuration.

Development configuration may publish the Ktor port locally.

---

## 1.52 Docker Is Mandatory

All production services must run through Docker.

A developer may use local tooling for faster development, but Phase 1 is not complete until the production Docker stack works.

---

## 1.53 Docker Compose Services

Minimum expected production services:

```text
cloudflared
arena-server
postgres
```

plus the exact Forge runtime arrangement selected by Phase 0.

Development may add:

```text
frontend-dev
```

or run Vite directly from the host.

Do not invent an always-running Forge container if Phase 0 selected per-match child JVM processes.

---

## 1.54 Development Compose

Create:

```text
docker-compose.dev.yml
```

or equivalent.

Development goals:

```text
frontend hot reload
backend rapid rebuild/restart
PostgreSQL persistence
readable logs
optional local ports
```

`cloudflared` does not need to be required for ordinary local development.

---

## 1.55 Production Compose

Production mode must:

```text
run cloudflared
run production Ktor server
serve compiled React assets through Ktor
run PostgreSQL
use Phase-0-selected Forge runtime architecture
use persistent volumes
restart appropriate services
avoid dev servers
avoid source hot reload
avoid public DB exposure
avoid unnecessary host port exposure
```

---

## 1.56 Production Frontend Build

Recommended process:

```text
Node/Vite build stage
        ↓
npm ci
        ↓
npm run build
        ↓
frontend/dist
        ↓
copied into Ktor server build/runtime
        ↓
Ktor serves production frontend
```

The production application does not require a standalone Node server.

---

## 1.57 JVM Multi-Stage Build

Conceptually:

```text
JDK/Gradle build stage
        ↓
server artifact
        ↓
JRE runtime stage
```

Forge runtime packaging must follow Phase 0.

---

## 1.58 Docker Image Pinning

Avoid unrestricted:

```text
node:latest
postgres:latest
gradle:latest
```

Pin supported versions.

---

## 1.59 Container Permissions

Where practical:

```text
run application as non-root
mount upstream Forge resources read-only
mount only required writable paths
use internal Docker networks
```

Do not use privileged containers without documented need.

---

## 1.60 Forge Source Integration

Implement exactly the Phase 0-selected Forge source strategy.

Expected preferred outcome:

```text
third_party/forge/
```

containing an intact pinned upstream Forge checkout or the exact equivalent selected by Phase 0.

---

## 1.61 Forge Commit Verification

The project must be capable of exposing or verifying the expected Forge commit.

An unknown or mismatched Forge revision must not silently become the production build.

---

## 1.62 Forge Patch Directory

Create:

```text
forge_patches/
README.md
```

If no patches were approved:

```text
No local Forge patches are currently approved.
```

---

## 1.63 Permanent Forge Worker Module

Create:

```text
forge-worker/
```

using the exact adapter strategy selected in Phase 0.

The Phase 0 spike must not simply be renamed and declared production-ready.

---

## 1.64 Forge Worker Phase 1 Scope

Production functionality is limited to:

```text
bootstrap verification
Forge version reporting
worker startup
worker shutdown
health/diagnostic handshake
resource availability verification
```

Do not yet expose full player gameplay through the web application.

---

## 1.65 Worker Handshake

Conceptually:

```text
Arena Server
     ↓
START / CONNECT WORKER
     ↓
WORKER_READY
{
  forge_commit,
  worker_version,
  protocol_version
}
```

The exact mechanism comes from Phase 0.

---

## 1.66 Worker Failure Handling

Arena Server must recognize:

```text
worker could not start
worker exited unexpectedly
worker incompatible
Forge resources missing
protocol mismatch
```

without crashing the entire Arena Server.

---

## 1.67 Do Not Auto-Restart a Game Yet

Phase 1 should not attempt match-state recovery.

That policy belongs to a later match/session phase.

---

## 1.68 Foundation UI

Example:

```text
┌─────────────────────────────────────────────┐
│                                             │
│                PROXIC ARENA                 │
│                                             │
│           Foundation Build 0.1.0            │
│                                             │
│ Application Server      ● Ready             │
│ Database                ● Ready             │
│ WebSocket               ● Connected         │
│ Forge Runtime           ● Ready             │
│ Pixi Renderer           ● Ready             │
│                                             │
│         Application foundation ready        │
│                                             │
└─────────────────────────────────────────────┘
```

This is temporary diagnostic UI.

---

## 1.69 Status Must Be Real

Do not hardcode service-ready indicators.

Every indicator must reflect an actual backend/runtime check.

---

## 1.70 Frontend Failure States

Distinguish:

```text
loading
ready
degraded
unavailable
disconnected
version mismatch
```

---

## 1.71 Testing Philosophy

Never claim:

```text
Docker works
WebSocket works
PostgreSQL works
Forge worker works
Cloudflare Tunnel works
```

because configuration exists.

Actually test what is being claimed.

---

## 1.72 Frontend Unit Tests

Minimum:

- application mounts;
- status component renders each state;
- API client handles success;
- API client handles failure;
- WebSocket handles connect;
- WebSocket handles disconnect;
- protocol mismatch is handled;
- error boundary works;
- Pixi lifecycle test where feasible.

---

## 1.73 Backend Tests

Minimum:

```text
liveness endpoint
readiness endpoint
version endpoint
system-status endpoint
static frontend serving
SPA fallback
API routes excluded from SPA fallback
WebSocket routes excluded from SPA fallback
database connectivity
database-unavailable readiness failure
WebSocket HELLO
PING/PONG
protocol mismatch
structured error response
request ID generation
worker diagnostic success
worker diagnostic failure
```

---

## 1.74 Protocol Conformance Test

The same protocol fixtures must be consumed by:

```text
TypeScript tests
Kotlin tests
```

---

## 1.75 Database Migration Test

Automated:

```text
empty PostgreSQL
      ↓
apply migrations
      ↓
application starts
```

---

## 1.76 Docker Clean-Build Test

A clean build must not rely on:

```text
developer local Maven cache
global Node modules
host PostgreSQL
old project files
untracked Forge resources
```

unless explicitly documented Phase 0 inputs.

---

## 1.77 Clean-Machine Principle

Repository + documented external configuration/secrets must reproduce the stack.

Undocumented developer-machine dependencies fail Phase 1.

---

## 1.78 Browser End-to-End Test

Use Playwright against the actual running application.

Verify:

```text
page loads
React app served by Ktor
Proxic Arena title visible
server status becomes Ready
database status becomes Ready
WebSocket becomes Connected
Forge runtime status reflects actual state
Pixi renderer initializes
version displayed
```

---

## 1.79 Browser Console Test

Unexpected:

```text
console errors
unhandled promise rejections
fatal JavaScript errors
```

should fail or flag the E2E test.

---

## 1.80 WebSocket Disconnect Test

Test:

```text
connect
stop Arena Server or interrupt connection
client shows disconnected
restart server
foundation reconnects
```

Match reconnection is not yet required.

---

## 1.81 Service Dependency Test

Start Arena Server without PostgreSQL.

Expected:

```text
/api/health/live = healthy
/api/health/ready = unhealthy
```

Then restore PostgreSQL and verify readiness recovery.

---

## 1.82 Forge Dependency Test

If Forge is required for readiness:

```text
Arena Server alive
Forge unavailable
system/readiness reports failure
```

Restore Forge and verify recovery.

---

## 1.83 Persistence Test

Restart:

```text
postgres container
entire Docker stack
```

Verify database persistence.

---

## 1.84 Ktor Static Serving Test

Production-mode test must prove:

```text
GET / returns React index
GET /assets/<real-build-asset> returns asset
client-side React route returns index
GET /api/... reaches API
/ws/... reaches WebSocket
```

---

## 1.85 Cloudflare Tunnel Test

After local acceptance tests pass, production deployment must verify the existing hostname:

```text
https://arena.barnflix.net
```

reaches the Ktor-hosted application through the actual tunnel.

Verify:

```text
public page load
public API request
public WebSocket connection
```

The test must use the real external hostname.

---

## 1.86 Cloudflare Security Preservation Check

Phase 1 must verify that the deployment did not unintentionally remove the project's existing public security behavior.

At minimum manually or programmatically verify the expected public HTTPS behavior and the existing security configuration relevant to `arena.barnflix.net`.

---

## 1.87 Static Analysis

Frontend:

```text
TypeScript compile
ESLint
Prettier check
Vitest
```

Backend:

```text
Kotlin compile
ktlint
detekt
tests
```

---

## 1.88 Dependency Locking

Commit:

```text
package-lock.json
Gradle wrapper
Gradle version configuration
explicit JVM dependencies
Docker image versions
```

---

## 1.89 Gradle Wrapper

Include:

```text
gradlew
gradlew.bat
gradle/wrapper/
```

---

## 1.90 Node Version

Record the supported Node version using `.nvmrc` or equivalent.

Docker and documentation must agree.

---

## 1.91 Java Version

Use the Java version proven by Phase 0.

Prefer one JVM baseline across:

```text
server
forge-worker
Forge
```

where practical.

---

## 1.92 README

The root README must explain:

```text
what Proxic Arena is
current build phase
high-level architecture
technology stack
old-project reference location
new-project authoritative location
prerequisites
development startup
production-style local startup
shutdown
logs
tests
database reset
Forge version
Forge update warning
Cloudflare Tunnel deployment
folder layout
```

---

## 1.93 Developer Startup

Target local experience:

```text
git checkout
configure .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

or the exact equivalent chosen by implementation.

Cloudflare Tunnel should not be required for normal local development.

---

## 1.94 Production Startup

Target production deployment should be documented as a single understandable Docker Compose workflow using:

```text
cloudflared
arena-server
postgres
Phase-0-selected Forge runtime
```

The exact command must be recorded in the final Phase 1 deliverable.

---

## 1.95 Developer Shutdown

Document:

```text
docker compose down
```

and separately:

```text
docker compose down -v
```

with a warning that `-v` destroys persistent volumes.

---

## 1.96 Database Reset

Provide a development-only reset procedure.

It must be clearly separated from production procedures.

---

## 1.97 Logging Instructions

Document how to view:

```text
Arena Server logs
PostgreSQL logs
cloudflared logs
Forge worker logs
```

---

## 1.98 Troubleshooting

Create:

```text
docs/troubleshooting/FOUNDATION.md
```

Include:

```text
Docker won't start
database isn't ready
frontend cannot reach API
Ktor static frontend isn't loading
React route returns 404
WebSocket will not connect
Forge runtime not ready
protocol version mismatch
wrong Forge commit
missing Forge resources
port already in use
Cloudflare tunnel disconnected
arena.barnflix.net does not reach Arena Server
public HTTP works but WebSocket fails
```

---

## 1.99 Security Baseline

Even though this is a personal application:

- database is private;
- Forge workers are private;
- Ktor should remain private behind the Tunnel in production;
- public traffic uses the existing Cloudflare HTTPS endpoint;
- existing HSTS/security settings must be preserved;
- no stack traces are sent to clients;
- secrets stay outside Git;
- CORS remains same-origin/restricted;
- inputs are validated;
- JSON message size is bounded;
- HTTP body size is bounded;
- containers use minimal permissions where practical.

---

## 1.100 Rate / Resource Protection

Establish reasonable infrastructure limits for:

```text
maximum WebSocket message size
maximum HTTP request body size
connection timeout
idle connection behavior
```

No sophisticated public-service rate limiting is required yet.

---

## 1.101 No Authentication Yet

Do not implement login during Phase 1.

Authentication belongs to a later dedicated phase.

---

## 1.102 No Deck Package Import Yet

Do not implement deck package importing during Phase 1.

The existing Proxic Deck Builder exports a ZIP package containing:

```text
deck TXT file
card PNG images
```

The permanent import contract will be designed and validated in:

```text
Phase 2 — Deck Package Import
```

Phase 1 may provide only the general application/storage foundation that Phase 2 will later use.

Do not define the final TXT syntax, PNG filename rules, archive layout, card-to-image mapping, or Forge deck-conversion rules during Phase 1.

---

## 1.103 Phase 2 Deck Package Import Boundary

Phase 2 must begin by inspecting the actual current export produced by Proxic Deck Builder.

The coding agent must not invent a replacement package format before doing so.

Phase 2 will determine and validate:

```text
the exact existing ZIP structure

the exact deck TXT syntax

how main-deck and any special deck sections are represented

what card identity information Forge requires

whether the current TXT contains sufficient identity information

how included PNG files are named

how PNG files map to deck entries

how duplicate copies are handled

how double-faced or multi-face cards are represented

whether additional artwork is needed for game-created objects

what happens when an expected PNG is missing

what happens when an unexpected PNG exists

how the package is validated before acceptance

whether the existing Deck Builder export can remain unchanged
```

The preferred approach is:

> Adapt Proxic Arena to the existing Deck Builder package where practical.

Do not redesign the Deck Builder export merely because another format would be easier for Arena.

If the current package is insufficient, the coding agent must explain:

```text
what is insufficient

why it prevents correct or reliable import

the smallest change required

which application must change

compatibility consequences
```

before changing the package contract.

Phase 2 should ultimately create an authoritative specification such as:

```text
docs/architecture/DECK_PACKAGE_FORMAT.md
```

based on actual tested behavior.

---

## 1.104 No Gameplay Yet

Do not implement browser-facing:

```text
create match
join match
mulligan
play land
cast spell
attack
block
pass priority
```

---

## 1.105 No Fake Gameplay

Do not create fake Magic behavior.

Prohibited:

```typescript
if (card.name === "Lightning Bolt") {
    damage = 3;
}
```

Prohibited:

```kotlin
if (creature.hasFlying) {
    ...
}
```

All gameplay behavior belongs to Forge.

---

## 1.106 Git Rules

Do not commit:

```text
.env
secrets
database volumes
runtime logs
card-image caches
node_modules
build directories
Cloudflare tunnel token
temporary Forge artifacts
```

---

## 1.107 Generated Files

Generated frontend bundles and generated protocol artifacts must be clearly separated from authored source.

Do not manually maintain Vite output inside the repository unless the chosen build process specifically requires committed artifacts.

Prefer build-time generation.

---

## 1.108 Phase Boundaries

The coding agent must stop after Phase 1.

Do not automatically begin:

```text
deck package import
authentication
lobby
matchmaking
battlefield
gameplay
```

Phase 2 is planned as:

```text
Deck Package Import
```

but MUST NOT begin automatically.

---

## 1.109 Required Phase 1 Checklist

### Phase 0 ingestion

- [ ] Verify Phase 0 execution is accepted.
- [ ] Read Phase 0 final recommendation.
- [ ] Read referenced Phase 0 research.
- [ ] Create accepted-decisions summary.
- [ ] Create necessary ADRs.
- [ ] Resolve user-decision blockers.
- [ ] Confirm old project remains unchanged.

### Repository

- [ ] Establish permanent monorepo.
- [ ] Create root `AGENTS.md`.
- [ ] Create `BUILD_PLAN.md`.
- [ ] Create/update README.
- [ ] Create VERSION.
- [ ] Create `.gitignore`.
- [ ] Create `.gitattributes`.
- [ ] Create `.editorconfig`.
- [ ] Create `.env.example`.
- [ ] Create documentation hierarchy.

### Forge preservation

- [ ] Implement Phase 0 Forge source strategy.
- [ ] Pin exact Forge revision.
- [ ] Keep Proxic integration outside upstream Forge.
- [ ] Create `forge_patches/README.md`.
- [ ] Verify no unapproved Forge modifications.
- [ ] Expose Forge revision diagnostically.

### Frontend

- [ ] Create TypeScript project.
- [ ] Create React application.
- [ ] Configure Vite.
- [ ] Enable TypeScript strict mode.
- [ ] Add React routing.
- [ ] Add error boundary.
- [ ] Add HTTP API client.
- [ ] Add WebSocket client.
- [ ] Install PixiJS.
- [ ] Create renderer lifecycle proof.
- [ ] Create foundation/status page.
- [ ] Configure ESLint.
- [ ] Configure Prettier.
- [ ] Configure Vitest.
- [ ] Configure Testing Library.
- [ ] Configure Playwright.
- [ ] Configure Vite development proxy for `/api` and `/ws`.

### Ktor frontend serving

- [ ] Build React frontend with Vite.
- [ ] Incorporate production frontend into Arena Server artifact/image.
- [ ] Serve `/`.
- [ ] Serve `/assets/*`.
- [ ] Implement SPA fallback.
- [ ] Exclude `/api/*` from SPA fallback.
- [ ] Exclude `/ws/*` from SPA fallback.
- [ ] Test direct navigation to React routes.

### Backend

- [ ] Create Kotlin project.
- [ ] Configure Ktor.
- [ ] Configure serialization.
- [ ] Configure structured logging.
- [ ] Configure request IDs.
- [ ] Implement liveness.
- [ ] Implement readiness.
- [ ] Implement version endpoint.
- [ ] Implement system status.
- [ ] Implement system WebSocket.
- [ ] Implement HELLO/PING/PONG.
- [ ] Implement centralized errors.
- [ ] Configure ktlint.
- [ ] Configure detekt.
- [ ] Add backend tests.

### Database

- [ ] Add PostgreSQL.
- [ ] Add HikariCP.
- [ ] Add Flyway.
- [ ] Add first migration.
- [ ] Add persistent volume.
- [ ] Verify database not publicly exposed.
- [ ] Test clean migration.
- [ ] Test persistence.

### Forge worker foundation

- [ ] Create permanent `forge-worker` module.
- [ ] Port only Phase-0-approved foundation.
- [ ] Implement worker diagnostic startup.
- [ ] Implement version reporting.
- [ ] Verify Forge resources.
- [ ] Implement clean shutdown.
- [ ] Detect startup failure.
- [ ] Detect incompatible worker/protocol.
- [ ] Keep gameplay test harness separate.

### Protocol

- [ ] Create protocol directory.
- [ ] Establish protocol version.
- [ ] Define infrastructure envelope.
- [ ] Create fixture messages.
- [ ] Test fixtures in Kotlin.
- [ ] Test fixtures in TypeScript.
- [ ] Document worker boundary from Phase 0.

### Docker

- [ ] Create production Arena Server image.
- [ ] Build React inside production build process.
- [ ] Create development Docker configuration.
- [ ] Add `cloudflared`.
- [ ] Add Arena Server.
- [ ] Add PostgreSQL.
- [ ] Add exact Phase-0 Forge runtime shape.
- [ ] Configure volumes.
- [ ] Configure private networks.
- [ ] Configure health checks.
- [ ] Configure restart policies.
- [ ] Use multi-stage builds.
- [ ] Verify clean build.
- [ ] Verify clean startup.
- [ ] Verify production Ktor port is not needlessly host-published.

### Cloudflare deployment

- [ ] Configure/confirm Tunnel route for `arena.barnflix.net`.
- [ ] Route Tunnel directly to Arena Server.
- [ ] Verify public frontend load.
- [ ] Verify public `/api` request.
- [ ] Verify public WebSocket.
- [ ] Verify existing HTTPS behavior.
- [ ] Verify expected HSTS/security configuration remains present.
- [ ] Keep Tunnel credentials outside Git.

### Phase boundary

- [ ] Do not implement deck package import.
- [ ] Do not define the permanent Deck Builder ZIP contract.
- [ ] Record Phase 2 as `Deck Package Import`.
- [ ] Preserve enough general storage/application structure for Phase 2 without speculatively designing it.

### Testing

- [ ] Frontend unit tests pass.
- [ ] Backend tests pass.
- [ ] Ktor static-serving tests pass.
- [ ] SPA routing tests pass.
- [ ] Protocol conformance tests pass.
- [ ] Database migration tests pass.
- [ ] Docker clean-build test passes.
- [ ] Browser Playwright test passes.
- [ ] Browser console remains clean.
- [ ] WebSocket disconnect/reconnect foundation test passes.
- [ ] Database dependency failure test passes.
- [ ] Forge dependency failure test passes.
- [ ] Persistence test passes.
- [ ] External Cloudflare Tunnel test passes.
- [ ] Static analysis passes.

### Documentation

- [ ] README accurate.
- [ ] Architecture overview written.
- [ ] ADRs written.
- [ ] Development startup documented.
- [ ] Production startup documented.
- [ ] Shutdown documented.
- [ ] Logs documented.
- [ ] Database reset documented.
- [ ] Cloudflare Tunnel deployment documented.
- [ ] Troubleshooting guide written.
- [ ] Current Forge commit documented.
- [ ] Current phase status documented.

---

## 1.110 Mandatory Acceptance Tests

### P1-A — Fresh Checkout Build

Starting from:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena
```

the documented Docker build must succeed.

No old-project runtime dependency is allowed.

### P1-B — Full Stack Startup

Production-style foundation services start successfully.

Expected service categories:

```text
cloudflared
arena-server
postgres
Phase-0-selected Forge runtime
```

### P1-C — Local Browser Access

The documented local development URL loads Proxic Arena.

**Required evidence:** Playwright/browser test.

### P1-D — Ktor Serves Production Frontend

In production mode:

```text
GET /
```

returns the compiled React application from Ktor.

### P1-E — React Client-Side Route

Directly requesting a test React route returns the SPA successfully.

API routes must remain API routes.

### P1-F — API Health

The client successfully calls:

```text
/api/health/live
/api/health/ready
/api/version
/api/system/status
```

### P1-G — Database

Arena Server connects to PostgreSQL privately.

Stopping PostgreSQL affects readiness appropriately.

Restarting PostgreSQL allows recovery.

### P1-H — WebSocket

A client connects to:

```text
/ws/system
```

and completes HELLO/PING/PONG.

### P1-I — Protocol Compatibility

Kotlin and TypeScript both consume the same fixtures successfully.

### P1-J — Forge Runtime

Arena Server performs a real Phase-0-selected Forge diagnostic handshake.

Forge commit matches the pinned revision.

### P1-K — Forge Failure

Forge runtime failure does not kill Arena Server.

Status reports dependency failure and recovers when restored.

### P1-L — Pixi Renderer

Real browser initializes Pixi.

Navigate away and back.

No duplicate canvas or obvious lifecycle fault.

### P1-M — Docker Persistence

Restarting the stack preserves PostgreSQL data.

### P1-N — Clean Build Independence

Clean Docker build must not depend on:

```text
global Node packages
global Gradle
host PostgreSQL
host Maven cache
Proxic_Arena_OLD
untracked runtime resources
```

except specifically documented external configuration.

### P1-O — Static Analysis

All configured static analysis and tests pass.

### P1-P — Old Project Integrity

Verify:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

was not modified.

### P1-Q — Upstream Forge Integrity

Verify upstream Forge has no unapproved Proxic modifications.

### P1-R — External Production Page

Using:

```text
https://arena.barnflix.net
```

the real public Phase 1 page loads through Cloudflare Tunnel.

### P1-S — External Production API

Through the same public hostname:

```text
https://arena.barnflix.net/api/health/ready
```

or the corresponding production endpoint responds correctly.

### P1-T — External Production WebSocket

A real WebSocket connection succeeds through:

```text
wss://arena.barnflix.net/...
```

using the Phase 1 system WebSocket endpoint.

### P1-U — Public Security Preservation

Verify the deployment continues to exhibit the expected public HTTPS/security behavior already configured for `arena.barnflix.net`, including HSTS.

---

## 1.111 Required Phase 1 Deliverables

At completion provide:

```text
1. Summary of what was built.

2. Final repository tree.

3. Exact Phase 0 decisions imported.

4. List of ADRs.

5. Technology versions.

6. Exact Forge commit.

7. Confirmation upstream Forge remains intact
   or list of approved patches.

8. Docker services and architecture.

9. Cloudflare Tunnel routing architecture.

10. Development startup command.

11. Production startup command.

12. Shutdown command.

13. Test commands.

14. Local URLs/endpoints.

15. Production URL.

16. Acceptance-test results.

17. Static-analysis results.

18. Docker clean-build result.

19. Browser end-to-end result.

20. Public Cloudflare Tunnel test result.

21. Database migration result.

22. Forge diagnostic result.

23. Any deviations.

24. Any unresolved concerns.

25. Proposed requirements for Phase 2.
```

The coding agent must not start Phase 2.

---

## 1.112 Phase 1 Exit Gate

Phase 1 implementation is complete only when:

```text
Phase 0 decisions are formally imported.

Repository structure is permanent.

React/TypeScript application works.

Ktor serves the production React application.

PixiJS lifecycle works.

Kotlin/Ktor server works.

PostgreSQL works.

Database migrations work.

WebSocket foundation works.

Protocol fixtures work across Kotlin/TypeScript.

Phase-0-selected Forge runtime is reachable.

Forge revision is verifiable.

Docker is reproducible.

Cloudflare Tunnel reaches Ktor.

arena.barnflix.net works publicly.

Public HTTPS/security behavior remains intact.

Logging works.

Health/readiness works.

Tests work.

Browser E2E works.

Old project remains untouched.

Upstream Forge remains clean.

Documentation reflects reality.
```

---

## 1.113 What Phase 1 Is Intentionally Missing

These are not defects:

```text
login
user accounts
deck package import
Deck Builder ZIP upload
deck TXT parsing
card PNG import
lobby
session codes
match creation
Commander UI
2HG UI
battlefield
card rendering
hand
stack UI
turn bar
mana UI
combat UI
Forge gameplay through browser
match history
replays
spectators
chat
friends
```

---

## 1.114 Escalation Rule

If implementation conflicts with:

```text
accepted Phase 0 evidence
actual current Forge behavior
Docker environment
Ktor behavior
React/Pixi behavior
Unraid deployment
Cloudflare Tunnel behavior
existing arena.barnflix.net security behavior
security requirements
```

the coding agent must stop.

Report:

```text
CONFLICT

Phase 1 requirement:

Observed reality:

Evidence:

Impact:

Options:

Recommendation:

Question for project owner:
```

Do not silently redesign the architecture.

---

## 1.115 Prohibited Phase 1 Shortcuts

The coding agent MUST NOT:

- modify the old project;
- silently modify upstream Forge;
- advance Forge to another commit;
- invent missing Phase 0 findings;
- begin gameplay;
- implement Magic rules;
- begin deck package importing;
- invent the Deck Builder package format;
- expose PostgreSQL publicly;
- store secrets in Git;
- commit Cloudflare Tunnel credentials;
- use browser-side legality logic;
- bypass TypeScript strict mode;
- disable failing tests merely to finish;
- use a fake Forge readiness state;
- claim Docker works without running it;
- claim browser UI works without browser testing;
- claim the public Tunnel works without testing the real hostname;
- create speculative future database tables;
- automatically begin Phase 2.

---

## 1.116 Locked-Phase Amendment Rule

This Phase 1 specification is locked.

If a legitimate change to a locked Phase 1 requirement becomes necessary, do not silently edit history.

Create an explicit amendment:

```text
PHASE 1 AMENDMENT <number>

Reason:
Affected requirement:
Old decision:
New decision:
Evidence:
Affected later phases:
Approved by project owner:
Date:
```

The amendment records the change separately.

---

# Phase 1 Final Principle

Phase 1 should make Proxic Arena **boringly reliable before it makes it interesting**.

At Phase 1 completion:

```text
the browser works

Ktor serves the browser application

the server works

the database works

the WebSocket works

the renderer works

the Forge runtime boundary works

the containers work

Cloudflare Tunnel reaches Ktor

arena.barnflix.net works

the existing public security configuration remains intact

the tests work

the documentation matches reality
```

But:

```text
nobody is importing decks or playing Magic
through the web interface yet
```

That is intentional.

The next planned phase is:

```text
Phase 2 — Deck Package Import
```

Phase 2 must inspect and test the real Proxic Deck Builder ZIP export before defining the permanent import contract.
