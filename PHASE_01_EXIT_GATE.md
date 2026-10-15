# Phase 1 Exit Gate

**Status: NOT PASSED — 2026-10-15** (updated after the Forge worker landed)

Phase 1 is substantially built and the parts that exist are genuinely
verified, but §1.112's exit conditions are not all met. This document
disposes of all 117 sections and all 21 mandatory acceptance tests,
so what remains is a list rather than a feeling.

An earlier status note in this session said Phase 1 would close
"except Cloudflare". That was wrong, and reading §1.109–§1.112
properly is what corrected it: **§1.63–§1.67 put the Forge worker
inside Phase 1**, not Phase 6, and §1.87–§1.98 require static
analysis, Playwright and documentation that do not exist.

---

## Evidence classes

| Class | Meaning |
| --- | --- |
| `VERIFIED` | Observed working in a real run, with the run recorded |
| `DONE` | Written and unit-tested, but not exercised end to end |
| `WRITTEN` | Exists, never executed |
| `MISSING` | Not started |
| `BLOCKED` | Cannot be verified on this machine; needs the Unraid host |
| `N/A` | Prose, principle or compliance statement, nothing to build |

A `WRITTEN` artifact is never described as working (§1.71).

---

## §1.0–§1.12 — Phase 0 ingestion, repository, ADRs

| § | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1.0 | Purpose | N/A | |
| 1.1 | Permanent project locations | VERIFIED | repo at the locked path; `Proxic_Arena_OLD` untouched |
| 1.2 | Phase 0 ingestion gate | DONE | Phase 0A ACCEPTED 2026-10-15 |
| 1.3 | Phase 0 decision import | DONE | `docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md` |
| 1.4 | Unresolved-decision gate | DONE | 0B trigger register; §7.51's six resolved 2026-10-15 |
| 1.5 | Approved technology stack | DONE | `gradle.properties`, `package.json`, all exact-pinned |
| 1.6 | Architecture at end of Phase 1 | PARTIAL | server, frontend, database and Docker exist; **no Forge worker** |
| 1.7 | Architectural ownership | DONE | server owns HTTP/WS/sessions; depends on no Forge code |
| 1.8 | Repository structure | PARTIAL | missing `forge-worker/`, `third_party/forge/`, `forge_patches/` |
| 1.9 | Root `AGENTS.md` | DONE | |
| 1.10 | `BUILD_PLAN.md` | DONE | |
| 1.11 | Architecture Decision Records | DONE | ADR 0001, ACCEPTED |
| 1.12 | No ADR may rewrite Phase 0 | N/A | compliant |

## §1.13–§1.19 — Frontend

| § | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1.13 | Frontend project | DONE | Vite + React 18.3.1 |
| 1.14 | TypeScript rules | DONE | strict, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| 1.15 | Frontend dependency policy | DONE | every version exact, no ranges |
| 1.16 | React responsibilities | VERIFIED | shell renders in a browser; owns no game concepts |
| 1.17 | PixiJS foundation | VERIFIED | canvas mounts in the real browser |
| 1.18 | PixiJS lifecycle test | VERIFIED | 3 tests + browser check: 1 canvas after StrictMode double-mount |
| 1.19 | Responsive foundation | VERIFIED | 3 tests + observed resize in-browser |

§1.109's "Frontend" checklist is now complete: routing, error
boundary, ESLint, Prettier, Testing Library, Vitest and Playwright
are all present and exercised.

## §1.20–§1.34 — Server, endpoints, protocol

| § | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1.20 | Arena Server project | VERIFIED | runs as a distribution and in Docker |
| 1.21 | Gradle structure | DONE | |
| 1.22 | Server endpoints | VERIFIED | all four answered over real HTTP |
| 1.23 | Liveness | VERIFIED | independent of dependencies; proven during a DB outage |
| 1.24 | Readiness | VERIFIED | 200/503 both observed |
| 1.25 | Version endpoint | VERIFIED | reports the pinned Forge commit from one source |
| 1.26 | System status | VERIFIED | test asserts no secret or connection string leaks |
| 1.27 | Production static serving | VERIFIED | `/`, `/play`, `/assets/*` from the image |
| 1.28 | Development frontend serving | WRITTEN | Vite proxy configured; hot-reload path never exercised |
| 1.29 | WebSocket foundation | VERIFIED | real client, HELLO/PING/PONG |
| 1.30 | Connection identity | VERIFIED | `connectionId` issued and logged |
| 1.31 | Protocol boundary | DONE | infrastructure messages only |
| 1.32 | Protocol version | VERIFIED | mismatch refused and closed, both directions |
| 1.33 | Protocol fixtures | VERIFIED | same files parsed by Kotlin and TypeScript |
| 1.34 | No English-prompt API | N/A | compliant |

## §1.35–§1.47 — Database, logging, configuration

| § | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1.35 | Database foundation | VERIFIED | PostgreSQL 16.4 in Docker, private network |
| 1.36 | Database migrations | VERIFIED | V001 applies once; second run applies nothing |
| 1.37 | Application metadata | VERIFIED | no table created, by design; test asserts zero tables |
| 1.38 | Database connectivity | VERIFIED | HikariCP; no credentials in code |
| 1.39 | Database network rule | VERIFIED | `5432/tcp`, no host binding; host connection refused |
| 1.40 | Persistence volumes | VERIFIED | row survived `down`/`up`; migrations not re-applied |
| 1.41 | Logging | VERIFIED | all ten fields render; 4 MDC tests |
| 1.42 | No `println` production logging | DONE | none in `main`; one deliberate probe in a test |
| 1.43 | HTTP request IDs | VERIFIED | `requestId` observed on request log lines |
| 1.44 | Centralized error shape | VERIFIED | one shape; no stack traces to clients |
| 1.45 | Configuration | DONE | `.env.example`, placeholders only |
| 1.46 | Secret handling | VERIFIED | redaction tested; production refuses missing/placeholder secrets |
| 1.47 | Frontend runtime configuration | VERIFIED | same-origin `/api` and `/ws`; no hardcoded hosts |

## §1.48–§1.51 — Cloudflare edge

| § | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1.48 | Cloudflare production edge | BLOCKED | needs the real host |
| 1.49 | Existing certificate/security config | BLOCKED | |
| 1.50 | Tunnel origin | WRITTEN | `cloudflared` service defined, never run |
| 1.51 | Production host port exposure | PARTIAL | server published to `127.0.0.1` only, with a comment to remove it behind the tunnel |

## §1.52–§1.59 — Docker

| § | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1.52 | Docker is mandatory | VERIFIED | stack built and run |
| 1.53 | Compose services | PARTIAL | server + postgres verified; `cloudflared` written; Forge runtime absent because the worker does not exist |
| 1.54 | Development compose | WRITTEN | `docker-compose.dev.yml` never started |
| 1.55 | Production compose | VERIFIED | |
| 1.56 | Production frontend build | VERIFIED | Vite stage inside the image; no Node at runtime |
| 1.57 | JVM multi-stage build | VERIFIED | JRE runtime holds neither toolchain |
| 1.58 | Image pinning | PARTIAL | exact tags, no `latest`; **not digest-pinned** |
| 1.59 | Container permissions | VERIFIED | `uid=100(proxic)`; internal network |

## §1.60–§1.67 — Forge source and worker

**Built and run 2026-10-15.**

| § | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1.60 | Forge source integration | PARTIAL | the pinned checkout is used from the Phase 0A spike path; `third_party/forge/` is not yet the canonical location |
| 1.61 | Forge commit verification | VERIFIED | the worker reports its own commit and the server COMPARES it; a one-character difference is refused |
| 1.62 | `forge_patches/README.md` | DONE | states explicitly that no patches are approved |
| 1.63 | Permanent `forge-worker` module | VERIFIED | Maven module, not the spike renamed; `forge-core` + `forge-game` only |
| 1.64 | Worker Phase 1 scope | VERIFIED | bootstrap/version/resources/handshake/shutdown, no gameplay |
| 1.65 | Worker handshake | VERIFIED | server spawns the worker, reads WORKER_READY, reports `forgeWorker: "ok"` |
| 1.66 | Worker failure handling | VERIFIED | all five failures are distinct states; 8 tests |
| 1.67 | Do not auto-restart a game yet | N/A | no match state exists to recover |

The five §1.66 failures map to distinct, operator-actionable states
rather than one "worker unhappy": `missing`, `unreachable`,
`incompatible`, `resources-missing`, `unconfigured`. A wrong jar and
a stopped jar need different responses.

## §1.68–§1.70 — Foundation UI

| § | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1.68 | Foundation UI | VERIFIED | screenshotted against the Docker stack |
| 1.69 | Status must be real | VERIFIED | 8 tests; unconfigured dependencies never show green |
| 1.70 | Frontend failure states | DONE | all six implemented and unit-tested; not all exercised in a browser |

## §1.71–§1.91 — Testing and tooling

| § | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1.71 | Testing philosophy | DONE | nothing unrun is claimed |
| 1.72 | Frontend unit tests | VERIFIED | 27/27, including component tests |
| 1.73 | Backend tests | VERIFIED | 28/28, 0 skipped |
| 1.74 | Protocol conformance test | VERIFIED | both suites, same fixtures |
| 1.75 | Database migration test | VERIFIED | real PostgreSQL |
| 1.76 | Docker clean-build test | VERIFIED | `git clone` + `docker build --no-cache`, 75 s, no host caches |
| 1.77 | Clean-machine principle | VERIFIED (with one caveat) | the clone ran from `.env.example` alone; Forge is a documented external input, now with commands |
| 1.78 | Browser end-to-end test | VERIFIED | 7 Playwright tests against the running Docker stack |
| 1.79 | Browser console test | VERIFIED | console errors and unhandled rejections fail the test |
| 1.80 | WebSocket disconnect test | VERIFIED | a dropped socket must leave "Ready" |
| 1.81 | Service dependency test | VERIFIED | DB stopped → 503 degraded → recovered, server stayed up |
| 1.82 | Forge dependency test | MISSING | no worker to fail |
| 1.83 | Persistence test | VERIFIED | manual, recorded |
| 1.84 | Ktor static serving test | VERIFIED | automated, 5 tests |
| 1.85 | Cloudflare Tunnel test | BLOCKED | |
| 1.86 | Cloudflare security preservation | BLOCKED | |
| 1.87 | Static analysis | VERIFIED | ESLint (type-aware) + Prettier + ktlint + detekt, all clean |
| 1.88 | Dependency locking | PARTIAL | `package-lock.json` yes; no Gradle lockfile |
| 1.89 | Gradle wrapper | DONE | 8.10.2 |
| 1.90 | Node version | PARTIAL | pinned in the image; no `.nvmrc` |
| 1.91 | Java version | DONE | toolchain 17 |

## §1.92–§1.98 — Documentation

Written 2026-10-15, and the commands in them were RUN rather than
assumed.

| § | Item | Status |
| --- | --- | --- |
| 1.92 | README | DONE — all seventeen required topics |
| 1.93 | Developer startup | VERIFIED — the documented commands were executed |
| 1.94 | Production startup | VERIFIED |
| 1.95 | Shutdown | DONE — including what `-v` destroys |
| 1.96 | Database reset | DONE — development only, separated from production |
| 1.97 | Logging instructions | DONE |
| 1.98 | Troubleshooting | DONE — `docs/troubleshooting/FOUNDATION.md` |

`VERSION` and `.editorconfig` added (§1.109).

Running the documented development startup immediately found a real
defect: both compose files shared a Compose project name, so starting
the dev stack REPLACED the production `postgres` container and the
production server reported `database: unreachable`. Each file now
declares its own `name:`. This is the argument for executing
documentation rather than writing it.

## §1.99–§1.108 — Security and boundaries

| § | Item | Status |
| --- | --- | --- |
| 1.99 | Security baseline | PARTIAL — secrets, redaction, no public DB, non-root, path-traversal guard; no formal review |
| 1.100 | Rate / resource protection | MISSING |
| 1.101 | No authentication yet | COMPLIANT |
| 1.102 | No deck package import yet | COMPLIANT |
| 1.103 | Phase 2 boundary recorded | DONE |
| 1.104 | No gameplay yet | COMPLIANT |
| 1.105 | No fake gameplay | COMPLIANT |
| 1.106 | Git rules | DONE — no artwork, no secrets committed |
| 1.107 | Generated files | DONE |
| 1.108 | Phase boundaries | DONE |

---

## §1.110 Mandatory acceptance tests

| Test | Result |
| --- | --- |
| P1-A Fresh checkout build | **PASS** — pristine clone, `--no-cache`, 75 s |
| P1-B Full stack startup | PARTIAL — server + postgres healthy; no Forge runtime, `cloudflared` not started |
| P1-C Local browser access | **PASS** — Playwright, against the production stack |
| P1-D Ktor serves production frontend | **PASS** |
| P1-E React client-side route | **PASS** — `/play` serves the SPA, `/api/*` stays API |
| P1-F API health | **PASS** — all four endpoints |
| P1-G Database | **PASS** — private connection, stop degrades, restart recovers |
| P1-H WebSocket | **PASS** — HELLO/PING/PONG |
| P1-I Protocol compatibility | **PASS** |
| P1-J Forge runtime | **PASS** — real handshake; commit matches the pin |
| P1-K Forge failure | **PASS** — five failure modes, server survives each |
| P1-L Pixi renderer | **PASS** — away-and-back asserts one canvas and one live renderer |
| P1-M Docker persistence | **PASS** |
| P1-N Clean build independence | **PASS** — no host Maven cache, no node_modules, no Forge checkout, no `Proxic_Arena_OLD` |
| P1-O Static analysis | **PASS** — 4 analysers clean, 36 server + 20 frontend tests |
| P1-P Old project integrity | **PASS** — never written to |
| P1-Q Upstream Forge integrity | N/A — no checkout in this repo yet |
| P1-R External production page | BLOCKED |
| P1-S External production API | BLOCKED |
| P1-T External production WebSocket | BLOCKED |
| P1-U Public security preservation | BLOCKED |

**Counted exactly: 15 PASS, 1 PARTIAL, 1 N/A, 4 BLOCKED.**

No test FAILS. The one partial is P1-B: the server and database
start and are healthy, but the stack contains no Forge runtime
(the worker is built outside the image) and `cloudflared` has never
been started. P1-Q is N/A because no Forge checkout lives in this
repository to verify.

An earlier commit message in this session said "19 of 21 pass",
which was a count made from memory rather than from this table. The
table is the authority.

---

## What remains, in recommended order

1. ~~Forge worker module (§1.60–§1.67)~~ — **DONE 2026-10-15.**
   Remaining within it: move the Forge checkout to
   `third_party/forge/` (§1.60), and build the worker inside the
   Docker image so the deployed stack has one.
2. ~~Static analysis (§1.87)~~ — **DONE 2026-10-15.** Unblocked P1-O.
3. ~~Playwright E2E (§1.78–§1.80)~~ — **DONE 2026-10-15.** Closed
   P1-C and P1-L.
4. **Documentation (§1.92–§1.98)** plus `VERSION` and
   `.editorconfig`.
5. ~~Frontend gaps~~ — **DONE 2026-10-15.**
6. ~~Clean-build verification~~ — **DONE 2026-10-15.**
7. **Digest-pin the images (§1.58)**.
8. **Cloudflare (§1.48–§1.51, P1-R–P1-U)** — on the Unraid host.
   Everything else should pass first.

## Clean-build result (§1.76, §1.77, P1-A, P1-N)

Performed 2026-10-15 from a `git clone` of this repository into an
empty directory:

```text
docker build --no-cache        75 s, succeeded
docker compose up              both services healthy
.env                           created from .env.example alone
/api/health/ready              database "ok" -- migration ran in the
                               clone's own fresh volume
browser suite                  7/7 against the clone's stack
server suite                   31 passed, 5 SKIPPED
```

The clone had no `node_modules`, no host Maven cache, no Forge
checkout and no access to `Proxic_Arena_OLD`. Nothing from the
development machine leaked into the build.

The 5 skips are the Forge worker tests, which need an upstream Forge
checkout. That is a documented external input (~1 GB, belongs to
upstream, deliberately gitignored), and the README now carries the
exact clone/checkout/install commands — previously it named the
prerequisite without saying how to satisfy it, which is the gap
§1.77 is about.

## Deviations and concerns

- **Playwright cannot use its own Chromium on this machine.** The
  bundled build needs the Microsoft Visual C++ runtime, which is
  absent, and fails with a bare `spawn UNKNOWN` that names no cause.
  The suite runs against the Edge that ships with Windows instead
  (`channel: "msedge"`), overridable with `PROXIC_E2E_CHANNEL`. A
  Linux CI runner can use the bundled browser. This is a §1.77
  clean-machine smell, recorded rather than hidden.

- The Windows named-pipe and `api.version` workarounds in
  `server/build.gradle.kts` are development-machine specific. Guarded,
  but they are a §1.77 smell.
- Images are tag-pinned, not digest-pinned (§1.58 asks to avoid
  floating tags; it does not explicitly require digests).
- `docker-compose.dev.yml` has never been started.
- Phase 1 verification has so far leaned on manual browser checks.
  Item 3 above is what converts that into evidence that survives
  someone else running it.
