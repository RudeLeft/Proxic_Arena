package net.barnflix.proxic

import java.io.File

/**
 * Liveness, readiness and status (PHASE_01 1.23-1.26, 1.69).
 *
 * 1.69 says status must be REAL. These checks therefore report what
 * they actually observe, and a dependency that is not configured is
 * reported as "unconfigured" rather than "ok" -- a green light nobody
 * earned is worse than a red one.
 *
 * Phase 1 has no database driver and no worker wired up yet, so those
 * checks are honest placeholders that say so. They become real in
 * their own phases, and the shape does not change when they do.
 */
class HealthChecks(
    private val config: ServerConfig,
    private val database: Database? = null,
    private val worker: ForgeWorker? = null,
) {
    fun readiness(): Readiness {
        val checks = linkedMapOf<String, String>()

        checks["dataRoot"] = if (ensureDataRoot()) "ok" else "unwritable"
        checks["database"] = databaseState()
        checks["forgeWorker"] = forgeWorkerState()

        // Only a genuine failure blocks readiness. "unconfigured" is
        // the expected state during Phase 1 and must not make the
        // server look broken.
        val failed = checks.filterValues { it != "ok" && it != "unconfigured" }
        return Readiness(
            status = if (failed.isEmpty()) "ok" else "degraded",
            checks = checks,
        )
    }

    fun systemStatus(): SystemStatus =
        SystemStatus(
            server = "ok",
            database = databaseState(),
            forgeRuntime = forgeWorkerState(),
        )

    private fun ensureDataRoot(): Boolean =
        try {
            val dir = File(config.dataRoot)
            if (!dir.exists()) dir.mkdirs()
            dir.isDirectory && dir.canWrite()
        } catch (e: SecurityException) {
            false
        }

    /**
     * Three distinct states, because they mean different things:
     *
     *   unconfigured  no database URL -- expected during Phase 1
     *   ok            a SELECT 1 round trip just succeeded
     *   unreachable   configured, and it did NOT answer
     *
     * "configured" used to be reported here and was a half-truth: it
     * said a setting exists, which is not the same as a database
     * that answers (1.69).
     */
    private fun databaseState(): String =
        when {
            config.databaseUrl.isNullOrBlank() -> "unconfigured"
            database == null -> "unreachable"
            else -> database.health()
        }

    /**
     * The worker's state as OBSERVED by a real handshake (§1.65),
     * not inferred from a file existing.
     *
     * An earlier version reported "ok" when the jar was present,
     * which was a false green of exactly the kind §1.69 forbids: a
     * jar can exist, start, and report an incompatible Forge commit
     * or missing card data. Those are now distinct states.
     */
    private fun forgeWorkerState(): String {
        if (worker != null) return worker.state()
        val jar = config.forgeWorkerJar
        return when {
            jar.isNullOrBlank() -> "unconfigured"
            File(jar).isFile -> "unprobed"
            else -> "missing"
        }
    }
}
