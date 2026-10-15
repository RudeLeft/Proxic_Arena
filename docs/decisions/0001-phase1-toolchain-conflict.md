# ADR 0001 — Phase 1 cannot be fully verified on this machine

**Status:** OPEN — needs an owner decision
**Date:** 2026-10-15
**Raised under:** AGENTS PHASE-003 / `PHASE_00 §0.81` (CONFLICT procedure)

---

## CONFLICT

**Requirement**

`PHASE_01 §1.52` — "Docker Is Mandatory", plus §1.53–§1.59 (compose
services, multi-stage builds, image pinning, container permissions)
and §1.35–§1.40 (PostgreSQL, Flyway migrations, HikariCP, persistence
volumes).

**Observed reality**

```text
[RUN] node    v24.21.0      available
      npm     11.19.0       available
      java    17.0.20.1     available
      maven   3.9.16        available
      gradle  8.10.2        bootstrapped from the distribution

      docker        NOT INSTALLED  (no Docker Desktop, no WSL backend)
      postgresql    NOT INSTALLED  (and no Docker to host it)
```

**Evidence:** direct checks of `PATH`, `Program Files`, and
`wsl --status`.

**Impact**

Phase 1 splits cleanly into what can be *proven* here and what can
only be *written*:

| Area | Status |
| --- | --- |
| Repo structure, Gradle, Kotlin/Ktor server | **verified** — builds, runs, 8/8 tests |
| HTTP endpoints §1.22–§1.26 | **verified** — real HTTP against a running server |
| WebSocket foundation §1.29–§1.32 | **verified** — real client, HELLO/PING/PONG, mismatch refused |
| Protocol fixtures §1.33 | **verified** — both suites parse the same files |
| Frontend skeleton, Vitest | **verified** — 5/5 |
| Forge worker module §1.63–§1.67 | buildable (Maven, proven in Phase 0A) |
| **Database §1.35–§1.40** | **cannot be run** |
| **Docker §1.52–§1.59** | **cannot be built or run** |
| Cloudflare §1.48–§1.51 | infrastructure; needs the real host regardless |

Writing Dockerfiles and migrations I cannot execute would produce
exactly the thing this project keeps finding and rejecting: artifacts
that look done and have never been observed working. AGENTS EVID-002
and TEST-001 both forbid claiming otherwise.

## Options

**A. Install Docker Desktop on this machine.** One install unblocks
both gaps: Docker for §1.52–§1.59, and PostgreSQL as a container for
§1.35–§1.40, plus Testcontainers for integration tests. Recommended.

**B. Install PostgreSQL natively, defer Docker.** Unblocks the
database work; Docker stays unverified until deployment.

**C. Proceed, writing both unverified.** Everything gets written and
clearly marked `NOT VERIFIED`, and someone runs it later on the
Unraid host. Fastest now, and it moves the risk to the least
convenient moment.

**D. Amend Phase 1** to move Docker and the database into their own
verified step, done wherever Docker exists.

## Recommendation

**A.** The cost is one install. The alternative is carrying two
unverified subsystems through every later phase, and Phase 0A's
repeated lesson is that unverified things in this stack fail
silently rather than loudly.

Until it is answered, Phase 1 proceeds on the verifiable parts, and
nothing unverified will be described as working.

## Question for the owner

Install Docker Desktop (A), install PostgreSQL only (B), proceed
unverified (C), or amend the phase (D)?
