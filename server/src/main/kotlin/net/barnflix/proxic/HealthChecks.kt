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
class HealthChecks(private val config: ServerConfig) {

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

    fun systemStatus(): SystemStatus = SystemStatus(
        server = "ok",
        database = databaseState(),
        forgeRuntime = forgeWorkerState(),
    )

    private fun ensureDataRoot(): Boolean = try {
        val dir = File(config.dataRoot)
        if (!dir.exists()) dir.mkdirs()
        dir.isDirectory && dir.canWrite()
    } catch (e: SecurityException) {
        false
    }

    /**
     * Not yet connected. Reported as unconfigured rather than ok,
     * because Phase 1 has no driver and claiming otherwise would be
     * exactly the false-green 1.69 prohibits.
     */
    private fun databaseState(): String =
        if (config.databaseUrl.isNullOrBlank()) "unconfigured" else "configured"

    /**
     * The worker jar is built by a separate Maven build. Existence is
     * checkable now; whether it RUNS is Phase 6's problem.
     */
    private fun forgeWorkerState(): String {
        val jar = config.forgeWorkerJar
        return when {
            jar.isNullOrBlank() -> "unconfigured"
            File(jar).isFile -> "ok"
            else -> "missing"
        }
    }
}
