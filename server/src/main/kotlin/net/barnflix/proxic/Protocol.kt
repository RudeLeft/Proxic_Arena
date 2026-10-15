package net.barnflix.proxic

import kotlinx.serialization.Serializable

/**
 * Phase 1 infrastructure protocol only — no Magic concepts
 * (`PHASE_01` §1.31).
 *
 * The envelope is fixed now because every later phase inherits it, and
 * because two Phase 0A findings are structural rather than
 * game-specific:
 *
 *   - `protocolVersion` on every message, so a mismatch fails loudly
 *     instead of being interpreted (§1.32).
 *   - `messageId` on every message. Phase 0A's decision gate rejects
 *     duplicate and stale responses by identity, and that only works
 *     if identity exists from the first message.
 *
 * Canonical JSON fixtures live in `protocol/fixtures/` and are parsed
 * by BOTH the Kotlin and TypeScript test suites (§1.33), so the two
 * sides cannot drift.
 */
@Serializable
data class Envelope(
    val protocolVersion: Int = BuildInfo.PROTOCOL_VERSION,
    val type: String,
    val messageId: String,
    val payload: Map<String, String> = emptyMap(),
)

/** `GET /api/health/live` — §1.23. */
@Serializable
data class Liveness(
    val status: String = "ok",
    val service: String = "arena-server",
)

/**
 * `GET /api/health/ready` — §1.24.
 *
 * Deliberately separate from liveness: liveness must NOT fail because
 * a dependency is down, readiness must.
 */
@Serializable
data class Readiness(
    val status: String,
    val checks: Map<String, String>,
)

/** `GET /api/version` — §1.25. */
@Serializable
data class VersionInfo(
    val proxicVersion: String = BuildInfo.PROXIC_VERSION,
    val protocolVersion: Int = BuildInfo.PROTOCOL_VERSION,
    val forgeCommit: String = BuildInfo.FORGE_COMMIT,
    val forgeRelease: String = BuildInfo.FORGE_RELEASE,
    val javaVersion: String = BuildInfo.javaVersion,
    val buildId: String? = BuildInfo.buildId,
)

/** `GET /api/system/status` — §1.26. Never carries secrets or traces. */
@Serializable
data class SystemStatus(
    val server: String,
    val database: String,
    val forgeRuntime: String,
)

/**
 * The single error shape (§1.44).
 *
 * `detail` is for humans and must never carry a stack trace, a
 * connection string or anything else §1.26 and §2.76 prohibit. Clients
 * branch on `errorCode`, never on `detail` (AGENTS PROTO-006).
 */
@Serializable
data class ErrorResponse(
    val errorCode: String,
    val detail: String,
    val requestId: String? = null,
)
