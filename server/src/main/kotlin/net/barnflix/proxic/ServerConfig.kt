package net.barnflix.proxic

/**
 * Configuration from the environment (PHASE_01 1.45).
 *
 * No secret is ever defaulted to a working value (1.46): a missing
 * secret must fail loudly at startup rather than silently running with
 * something insecure. Non-secret settings get sensible defaults so a
 * developer can run the server with no setup.
 */
data class ServerConfig(
    val host: String,
    val port: Int,
    val databaseUrl: String?,
    val forgeWorkerJar: String?,
    val dataRoot: String,
) {
    companion object {
        fun fromEnvironment(): ServerConfig = ServerConfig(
            host = System.getenv("PROXIC_HOST") ?: "0.0.0.0",
            port = System.getenv("PROXIC_PORT")?.toIntOrNull() ?: 8080,
            // Absent rather than defaulted: readiness reports the
            // dependency as unconfigured instead of pretending.
            databaseUrl = System.getenv("PROXIC_DATABASE_URL"),
            forgeWorkerJar = System.getenv("PROXIC_FORGE_WORKER_JAR"),
            dataRoot = System.getenv("PROXIC_DATA_ROOT") ?: "data",
        )
    }
}
