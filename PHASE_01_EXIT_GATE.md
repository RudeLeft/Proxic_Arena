# Phase 1 Exit Gate

**Status: NOT PASSED — 2026-10-15**

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

**Not done in this group:** React routing, error boundary, ESLint,
Prettier, Testing Library, Playwright (§1.109 "Frontend" checklist).

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

**This whole group is MISSING, and it is Phase 1 scope, not Phase 6.**

| § | Item | Status |
| --- | --- | --- |
| 1.60 | Forge source integration (`third_party/forge/`) | MISSING |
| 1.61 | Forge commit verification | PARTIAL — `BuildInfo` exposes the pin; nothing verifies a checkout against it |
| 1.62 | `forge_patches/README.md` | MISSING |
| 1.63 | Permanent `forge-worker` module | MISSING |
| 1.64 | Worker Phase 1 scope | MISSING |
| 1.65 | Worker handshake | MISSING |
| 1.66 | Worker failure handling | MISSING |
| 1.67 | Do not auto-restart a game yet | N/A until the worker exists |

The Phase 0A spike proved this is buildable — a Maven worker on
forge-core + forge-game ran real games. None of that has been
promoted into a permanent module here.

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
| 1.72 | Frontend unit tests | VERIFIED | 20/20 |
| 1.73 | Backend tests | VERIFIED | 28/28, 0 skipped |
| 1.74 | Protocol conformance test | VERIFIED | both suites, same fixtures |
| 1.75 | Database migration test | VERIFIED | real PostgreSQL |
| 1.76 | Docker clean-build test | PARTIAL | built from this working tree, not from a pristine clone with no cache |
| 1.77 | Clean-machine principle | NOT VERIFIED | the Windows named-pipe workaround is machine-specific (guarded) |
| 1.78 | Browser end-to-end test | MISSING | browser checks were manual; **no Playwright** |
| 1.79 | Browser console test | PARTIAL | console checked manually and was clean; not automated |
| 1.80 | WebSocket disconnect test | MISSING | |
| 1.81 | Service dependency test | VERIFIED | DB stopped → 503 degraded → recovered, server stayed up |
| 1.82 | Forge dependency test | MISSING | no worker to fail |
| 1.83 | Persistence test | VERIFIED | manual, recorded |
| 1.84 | Ktor static serving test | VERIFIED | automated, 5 tests |
| 1.85 | Cloudflare Tunnel test | BLOCKED | |
| 1.86 | Cloudflare security preservation | BLOCKED | |
| 1.87 | Static analysis | MISSING | no ESLint, Prettier, ktlint or detekt |
| 1.88 | Dependency locking | PARTIAL | `package-lock.json` yes; no Gradle lockfile |
| 1.89 | Gradle wrapper | DONE | 8.10.2 |
| 1.90 | Node version | PARTIAL | pinned in the image; no `.nvmrc` |
| 1.91 | Java version | DONE | toolchain 17 |

## §1.92–§1.98 — Documentation

All MISSING: README (§1.92), developer startup (§1.93), production
startup (§1.94), shutdown (§1.95), database reset (§1.96), logging
instructions (§1.97), troubleshooting (§1.98).

Also missing from §1.109: `VERSION`, `.editorconfig`.

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
| P1-A Fresh checkout build | PARTIAL — `docker build` succeeds from this tree; not from a pristine clone |
| P1-B Full stack startup | PARTIAL — server + postgres healthy; no Forge runtime, `cloudflared` not started |
| P1-C Local browser access | PASS (manual) — required evidence is a Playwright test, which does not exist |
| P1-D Ktor serves production frontend | **PASS** |
| P1-E React client-side route | **PASS** — `/play` serves the SPA, `/api/*` stays API |
| P1-F API health | **PASS** — all four endpoints |
| P1-G Database | **PASS** — private connection, stop degrades, restart recovers |
| P1-H WebSocket | **PASS** — HELLO/PING/PONG |
| P1-I Protocol compatibility | **PASS** |
| P1-J Forge runtime | **FAIL** — no worker exists |
| P1-K Forge failure | **FAIL** — nothing to fail |
| P1-L Pixi renderer | PARTIAL — verified manually; "navigate away and back" not automated |
| P1-M Docker persistence | **PASS** |
| P1-N Clean build independence | NOT VERIFIED |
| P1-O Static analysis | **FAIL** — none configured |
| P1-P Old project integrity | **PASS** — never written to |
| P1-Q Upstream Forge integrity | N/A — no checkout in this repo yet |
| P1-R External production page | BLOCKED |
| P1-S External production API | BLOCKED |
| P1-T External production WebSocket | BLOCKED |
| P1-U Public security preservation | BLOCKED |

**14 of 21 pass or partially pass. Two fail outright (P1-J, P1-K) for
the same reason: there is no Forge worker. One fails for missing
tooling (P1-O). Four are blocked on the real host.**

---

## What remains, in recommended order

1. **Forge worker module (§1.60–§1.67)** — the largest gap and the
   only one that fails acceptance tests outright. Phase 0A proved the
   approach; this promotes it to a permanent module with a handshake,
   version reporting and clean shutdown. Unblocks P1-J and P1-K.
2. **Static analysis (§1.87)** — ESLint, Prettier, ktlint, detekt.
   Unblocks P1-O. Cheap, and cheaper now than after more code exists.
3. **Playwright E2E (§1.78–§1.80)** — the browser checks so far have
   been me looking at screenshots. §1.78 wants them automated and
   §1.79 wants console errors to fail the build.
4. **Documentation (§1.92–§1.98)** plus `VERSION` and
   `.editorconfig`.
5. **Frontend gaps** — routing, error boundary, Testing Library.
6. **Clean-build verification (§1.76, §1.77, P1-N)** — build from a
   fresh clone with `--no-cache`.
7. **Digest-pin the images (§1.58)**.
8. **Cloudflare (§1.48–§1.51, P1-R–P1-U)** — on the Unraid host.
   Everything else should pass first.

## Deviations and concerns

- The Windows named-pipe and `api.version` workarounds in
  `server/build.gradle.kts` are development-machine specific. Guarded,
  but they are a §1.77 smell.
- Images are tag-pinned, not digest-pinned (§1.58 asks to avoid
  floating tags; it does not explicitly require digests).
- `docker-compose.dev.yml` has never been started.
- Phase 1 verification has so far leaned on manual browser checks.
  Item 3 above is what converts that into evidence that survives
  someone else running it.
