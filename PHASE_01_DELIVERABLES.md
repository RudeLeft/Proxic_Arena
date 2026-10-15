# Phase 1 Deliverables

**PHASE_01 §1.111. Prepared 2026-10-15.**

The twenty-five items §1.111 requires at completion. Phase 1 is
**not complete** — four acceptance tests need the Unraid host — so
this is the deliverable as it stands, with the open items named
rather than omitted.

`PHASE_01_EXIT_GATE.md` is the authority on what is proven; this
document is the summary §1.111 asks for.

---

## 1. Summary of what was built

A Kotlin/Ktor server that serves a React + PixiJS page, talks a
versioned JSON protocol over WebSocket, owns a PostgreSQL schema
through Flyway, and launches a Forge worker as a child JVM to
verify the pinned rules engine. The whole thing runs as a Docker
Compose stack.

No gameplay. No accounts. No deck import. Phase 1 builds the floor
and stops (§1.101–§1.105).

## 2. Final repository tree

```text
AGENTS.md  CLAUDE.md  BUILD_PLAN.md  README.md  VERSION
PHASE_*.md                      phase specs, gates, deliverables
forge-pin.properties            the Forge commit, read by both builds
Dockerfile                      4 stages: frontend, server, worker, runtime
docker-compose.yml              production: arena-server + postgres (+ edge)
docker-compose.local.yml        opt-in host port for local use
docker-compose.dev.yml          postgres only, for host-side development

server/                         Kotlin/Ktor
  src/main/kotlin/net/barnflix/proxic/
    Application.kt  BuildInfo.kt  Database.kt  ForgeWorker.kt
    HealthChecks.kt  Limits.kt  LogContext.kt  Protocol.kt
    ServerConfig.kt
  src/main/resources/db/migration/V001__application_foundation.sql
  src/test/kotlin/...            5 test classes, 45 tests
  gradle.lockfile                228 locked entries

forge-worker/                   Java/Maven, forge-core + forge-game only
  src/main/java/net/barnflix/proxic/worker/
    WorkerMain.java  WorkerInfo.java  ForgeResources.java

frontend/                       React + PixiJS + Vite
  src/   App.tsx  ErrorBoundary.tsx  routes.tsx  main.tsx
         protocol.ts  status.ts  renderer.ts  styles.css
         + 5 test files, 27 tests
  e2e/   foundation.spec.ts      7 Playwright tests

protocol/                       shared fixtures and schemas
config/detekt.yml
database/README.md              says migrations are NOT here
forge_patches/README.md         says no patches are approved
docs/
  architecture/   PHASE_00_ACCEPTED_DECISIONS, OPEN_FORMAT,
                  BATTLEFIELD_LAYOUT_CONTRACT, DECK_PACKAGE_AND_ART
  decisions/      0001-phase1-toolchain-conflict.md
  research/       phase-00a evidence
  security/       PHASE_01_BASELINE_REVIEW.md
  troubleshooting/FOUNDATION.md
spikes/           Phase 0A measurement harnesses (not production)
```

41 commits.

## 3. Phase 0 decisions imported

From `docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md`:

- **Adapter: Strategy A** — a Proxic-owned `PlayerController` on
  `forge-core` + `forge-game` only. Forge's own network layer is
  remote invocation of Swing GUI methods; a browser cannot speak it.
- **Process model: one JVM per match**, spawned on demand, no
  pre-warming. ~611 MB and ~2.8 s each; crash isolation verified.
- **Bootstrap order** — seven steps, two of which (`ImageKeys`,
  `tokenscripts`) only fail later as NPEs if skipped.
- **Protocol constraints** — typed object ids, server-authoritative
  monotonic `state_version`, responses rejected before reaching the
  waiter, both duplicate defences kept, "player acted for" distinct
  from "connection authorised", no dependence on English prompts.
- **Forge pin** — `forge-2.0.15` =
  `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`.
- **Open Format only** — 60–65 cards, max 4 of a card, basics
  unlimited, no sideboard, 2 players.

## 4. ADRs

| ADR | Status |
| --- | --- |
| `0001-phase1-toolchain-conflict.md` | **ACCEPTED** — install Docker Desktop (option A) |

Phase 7's six open battlefield decisions were also resolved
(2026-10-15) and recorded in that phase document, not as an ADR.

## 5. Technology versions

| | |
| --- | --- |
| Kotlin | 1.9.24 |
| Ktor | 2.3.12 |
| Java | 17 (toolchain); 17.0.13 in the image |
| Gradle | 8.10.2 |
| PostgreSQL | 16.4-alpine |
| Flyway | 10.17.0 |
| HikariCP | 5.1.0 |
| React | 18.3.1 |
| PixiJS | 8.2.6 |
| Vite | 5.4.2 |
| TypeScript | 5.5.4 |
| Node | 24.11.1 |
| Maven | 3.9.9 (image) |
| Vitest / Playwright / Testcontainers | 2.0.5 / 1.47.0 / 1.21.3 |
| ESLint / Prettier / ktlint / detekt | 9.9.1 / 3.3.3 / 12.1.1 / 1.23.6 |

All exact. Nothing floats. Every image is pinned by digest as well
as tag.

## 6. Forge commit

```text
forge-2.0.15 = 4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
```

Declared once, in `forge-pin.properties`. Gradle generates the
server's `build-info.properties` from it; Maven filters it into the
worker jar. The server compares the worker's reported commit against
its own and refuses a mismatch.

## 7. Upstream Forge integrity

Upstream Forge is **unmodified**. `forge_patches/README.md` records
that no patches are approved. The image clones upstream at the
pinned release tag and fails the build unless `HEAD` equals the
pinned commit, so the image cannot be built from the wrong source.

## 8. Docker services and architecture

```text
docker-compose.yml  (project: proxic-arena)
├── postgres        internal network only, no published port,
│                   named volume, ALL caps dropped
├── arena-server    serves /, /assets, /api, /ws; read-only root,
│                   ALL caps dropped, non-root, /data volume;
│                   spawns forge-worker as a child JVM
└── cloudflared     profile "edge" — NOT VERIFIED

docker-compose.local.yml   adds 127.0.0.1:8080 for local use
docker-compose.dev.yml     (project: proxic-arena-dev) postgres only
```

Per Phase 0A there is deliberately **no always-running Forge
container**: the worker is a jar inside the server image, executed
per match.

Image size: 986 MB (≈430 MB of it is Forge's data files).

## 9. Cloudflare Tunnel routing

```text
https://arena.barnflix.net
      │  TLS terminated at the Cloudflare edge
      ▼
  cloudflared  (edge profile, same compose stack)
      │  internal `edge` network
      ▼
  arena-server:8080     no host port published
```

**NOT VERIFIED.** Written from §1.48–§1.51 and never run.

## 10. Development startup

```bash
cp .env.example .env     # fill in; generate secrets, do not keep placeholders
docker compose -f docker-compose.dev.yml up -d
./gradlew :server:run
cd frontend && npm ci && npm run dev
```

Page on <http://localhost:5173>, `/api` and `/ws` proxied to Ktor.

## 11. Production startup

```bash
docker compose up -d --build                      # on the host, behind the tunnel
docker compose --profile edge up -d               # including cloudflared
```

Locally, add the override that publishes a port:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

## 12. Shutdown

```bash
docker compose down        # containers go, volumes survive
docker compose down -v     # DESTROYS the volumes — no undo
```

## 13. Test commands

```bash
./gradlew :server:test                        # 45
cd frontend && npm test                       # 27
cd frontend && npm run e2e                    # 7 (needs a running stack)
./gradlew :server:ktlintCheck :server:detekt
cd frontend && npm run lint && npm run format
```

## 14. Local URLs

```text
http://127.0.0.1:8080/              the application
            /api/health/live        liveness
            /api/health/ready       readiness (503 when degraded)
            /api/version            versions and the Forge pin
            /api/system/status      coarse status
            /ws/system              protocol WebSocket
http://localhost:5173/              Vite dev server
```

## 15. Production URL

`https://arena.barnflix.net` — not yet reached by this build.

## 16. Acceptance-test results

**15 PASS · 1 PARTIAL · 1 N/A · 4 BLOCKED · 0 FAIL.**

Per-test detail is in `PHASE_01_EXIT_GATE.md`. The partial is P1-B
(`cloudflared` never started); the N/A is P1-Q (no Forge checkout is
vendored — the image clones and verifies instead); the four blocked
are P1-R–P1-U, the Cloudflare edge.

## 17. Static-analysis results

ESLint (type-aware), Prettier, ktlint and detekt all clean. Every
deliberate departure from the defaults is recorded with its reason in
`config/detekt.yml` and `.editorconfig`.

## 18. Docker clean-build result

`git clone` into an empty directory, `docker build --no-cache`:
**75 s, succeeded.** The stack came up healthy, `.env` was created
from `.env.example` alone, and 7/7 browser tests passed against it.
No host Maven cache, no `node_modules`, no Forge checkout, no access
to `Proxic_Arena_OLD`.

## 19. Browser end-to-end result

7/7 against the running production stack: page served by Ktor, every
indicator cross-checked against the API, version matched to
`/api/version`, Pixi initialised with one canvas after navigating
away and back, `/play` served by the SPA while `/api/*` stays JSON, an
unknown route answered as "Not found", and a dropped WebSocket
reported rather than left showing Ready. Console errors and unhandled
rejections fail the suite.

## 20. Public Cloudflare Tunnel test result

**Not run.** P1-R–P1-U remain open.

## 21. Database migration result

`V001__application_foundation.sql` applies once against a real
PostgreSQL 16.4, is recorded in `flyway_schema_history`, applies
nothing on a second run, and leaves **zero** application tables
(§1.36 forbids speculative schema). Verified both under Testcontainers
and inside the running container.

## 22. Forge diagnostic result

```json
{"type":"WORKER_READY","forgeCommit":"4ec5f1a2…","forgeRelease":"forge-2.0.15",
 "workerVersion":"0.1.0","javaVersion":"17.0.13","resourcesUsable":true}
```

Readiness reports `forgeWorker: "ok"` from inside the container. All
five §1.66 failure modes produce distinct states and none kills the
server.

## 23. Deviations

1. **Playwright uses Edge, not its bundled Chromium.** The bundled
   build needs the Microsoft Visual C++ runtime, absent here, and
   fails with a bare `spawn UNKNOWN`. Overridable with
   `PROXIC_E2E_CHANNEL`.
2. **Two Windows-specific workarounds in `server/build.gradle.kts`** —
   the Docker named-pipe path and `api.version=1.44`, both guarded so
   Linux and CI are untouched. Without the second, Testcontainers
   reports "no Docker environment" on a machine where Docker is
   running fine.
3. **ktlint does not lint the Gradle build scripts.** It cannot parse
   them; all Kotlin source is still checked.
4. **The Forge artifact version is declared in the worker POM**, not
   read from `forge-pin.properties`. Maven resolves dependency
   coordinates before any plugin runs. The commit — the pin that
   matters — still comes from the one file.
5. **`third_party/forge/` is not vendored.** The image clones
   upstream at the pin and verifies the commit, which is stronger
   than trusting a vendored copy.

## 24. Unresolved concerns

1. **Cloudflare is entirely unverified.** Four acceptance tests and
   two security properties depend on the first deployment.
2. **No authentication until Phase 3.** Anyone who can reach the
   server can use it. Acceptable while nothing is behind it; not
   acceptable once Phase 2 stores a deck. This should gate exposing
   the public hostname.
3. **The Forge build sequence in the README has not had a cold run.**
   It is reconstructed from Phase 0A; first execution on a new
   machine is its verification.
4. **PostgreSQL's root filesystem is writable** — the image needs it.
5. **Image size is 986 MB**, mostly Forge data. Fine for one host;
   worth revisiting if it is ever pulled often.

## 25. Proposed requirements for Phase 2

Phase 2 is **Deck Package Import**. From this phase's work, four
things should be settled before it starts:

1. **The upload body limit must be raised per route, never
   globally.** It is 1 MB now. A deck package with artwork is
   hundreds of megabytes, and one global limit wide enough for it
   would let every endpoint accept one.
2. **ZIP parsing needs its own security review.** Zip-slip,
   decompression bombs, path traversal on member names, and a cap on
   entry count and uncompressed size. Phase 1's review covers no
   user-supplied content because there is none; Phase 2 introduces
   the first real parser.
3. **Artwork goes to `/data/card-images`, never to the database and
   never into Git.** It is ~291 MB of copyrighted WotC material per
   corpus (AGENTS GIT-001).
4. **`V002` owns the deck tables.** No speculative schema before it,
   and the migration lives in `server/src/main/resources/db/migration/`
   — not in `database/`, which is a trap documented in its README.

Also outstanding, from Phase 1's own list: whether "any number"
cards (Relentless Rats) are exempt from the 4-copy limit. The
current default is **no**.

---

**Per §1.111, Phase 2 has not been started.**
