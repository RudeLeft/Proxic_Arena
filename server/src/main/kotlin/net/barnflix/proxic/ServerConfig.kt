package net.barnflix.proxic

/**
 * Configuration from the environment (PHASE_01 §1.45).
 *
 * No secret is ever defaulted to a working value (§1.46): a missing
 * secret must fail loudly at startup rather than silently running with
 * something insecure. Non-secret settings get sensible defaults so a
 * developer can run the server with no setup.
 *
 * Secret-bearing fields are declared `private` and read through
 * accessors, and `toString` is overridden, because the generated
 * data-class `toString` would otherwise print every secret the moment
 * anyone logged the config — the most common way secrets escape.
 */
data class ServerConfig(
    val host: String,
    val port: Int,
    val databaseUrl: String?,
    val forgeWorkerJar: String?,
    val dataRoot: String,
    val appEnv: String = "development",
    /** Directory holding the built Vite output (§1.27). */
    val staticRoot: String = "frontend/dist",
    private val sessionSecretValue: String? = null,
    private val databasePasswordValue: String? = null,
    val databaseUserValue: String? = null,
) {
    val isProduction: Boolean get() = appEnv.equals("production", ignoreCase = true)

    fun sessionSecret(): String? = sessionSecretValue
    fun databasePassword(): String? = databasePasswordValue

    /** Not a secret on its own, but it belongs with the rest. */
    fun databaseUser(): String? = databaseUserValue

    /**
     * Problems that must stop startup, as a list rather than a throw,
     * so every one is reported in a single run instead of one per
     * restart.
     *
     * Only production is gated. Phase 1 development legitimately runs
     * with nothing configured, and that state is reported honestly by
     * readiness (§1.69) rather than hidden behind a fake default.
     */
    fun startupProblems(): List<String> {
        if (!isProduction) return emptyList()
        val problems = mutableListOf<String>()
        if (sessionSecretValue.isNullOrBlank()) {
            problems += "PROXIC_SESSION_SECRET is not set"
        }
        if (databaseUrl.isNullOrBlank()) {
            problems += "PROXIC_DATABASE_URL is not set"
        }
        // A secret that exists but is the example value is worse than
        // a missing one: it looks configured.
        if (sessionSecretValue != null && sessionSecretValue in PLACEHOLDERS) {
            problems += "PROXIC_SESSION_SECRET still holds the .env.example placeholder"
        }
        return problems
    }

    /** Redacted on purpose — see the class comment. */
    override fun toString(): String =
        "ServerConfig(host=$host, port=$port, appEnv=$appEnv, " +
            "databaseUrl=${redactUrl(databaseUrl)}, " +
            "forgeWorkerJar=$forgeWorkerJar, dataRoot=$dataRoot, " +
            "staticRoot=$staticRoot, " +
            "sessionSecret=${mask(sessionSecretValue)}, " +
            "databasePassword=${mask(databasePasswordValue)})"

    companion object {
        private val PLACEHOLDERS = setOf("changeme", "replace-me", "example", "secret")

        fun fromEnvironment(getenv: (String) -> String? = System::getenv): ServerConfig =
            ServerConfig(
                host = getenv("PROXIC_HOST") ?: "0.0.0.0",
                port = getenv("PROXIC_PORT")?.toIntOrNull() ?: 8080,
                // Absent rather than defaulted: readiness reports the
                // dependency as unconfigured instead of pretending.
                databaseUrl = getenv("PROXIC_DATABASE_URL"),
                forgeWorkerJar = getenv("PROXIC_FORGE_WORKER_JAR"),
                dataRoot = getenv("PROXIC_DATA_ROOT") ?: "data",
                appEnv = getenv("APP_ENV") ?: "development",
                staticRoot = getenv("PROXIC_STATIC_ROOT") ?: "frontend/dist",
                sessionSecretValue = getenv("PROXIC_SESSION_SECRET"),
                databasePasswordValue = getenv("POSTGRES_PASSWORD"),
                databaseUserValue = getenv("POSTGRES_USER"),
            )

        private fun mask(value: String?): String = if (value.isNullOrBlank()) "<unset>" else "<set>"

        /**
         * A connection string carries a password. The host is useful
         * in a log line; the credentials are not.
         */
        internal fun redactUrl(url: String?): String {
            if (url.isNullOrBlank()) return "<unset>"
            val at = url.lastIndexOf('@')
            val scheme = url.indexOf("://")
            if (at < 0 || scheme < 0 || at < scheme) return url
            return url.substring(0, scheme + 3) + "<redacted>" + url.substring(at)
        }
    }
}
