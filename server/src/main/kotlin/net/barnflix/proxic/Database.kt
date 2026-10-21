package net.barnflix.proxic

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.flywaydb.core.Flyway
import org.slf4j.LoggerFactory
import javax.sql.DataSource

/**
 * PostgreSQL connectivity and migrations — PHASE_01 §1.36–§1.38.
 *
 * Two rules shape this class.
 *
 * §1.38: no credentials in code. Everything comes from
 * [ServerConfig], which reads the environment and refuses to default
 * a secret to a working value.
 *
 * §1.69: an unconfigured database is NOT an error and NOT "ok". The
 * server starts without one and reports "unconfigured", because
 * during Phase 1 that is the honest state. A database that IS
 * configured and does not answer is a different thing entirely, and
 * is reported as such.
 */
class Database private constructor(
    private val dataSource: HikariDataSource,
) : AutoCloseable {
    private val log = LoggerFactory.getLogger(Database::class.java)

    /**
     * Run pending migrations and return how many were applied.
     *
     * Flyway owns the schema. Nothing else in this codebase may
     * create, alter or drop a table: a schema that two mechanisms
     * can change is a schema nobody can reason about.
     */
    fun migrate(): Int {
        val result =
            Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                // The database starts empty, so there is no legacy schema
                // to adopt. Leaving baselineOnMigrate off means an
                // UNEXPECTED pre-existing schema fails loudly instead of
                // being silently adopted as version 1.
                .baselineOnMigrate(false)
                .load()
                .migrate()
        log.info("flyway applied={} target={}", result.migrationsExecuted, result.targetSchemaVersion)
        return result.migrationsExecuted
    }

    /**
     * Observed state, for readiness (§1.24, §1.69).
     *
     * A real round trip, not a flag set at startup: a pool that was
     * healthy once and whose database has since gone away must not
     * keep reporting "ok".
     */
    fun health(): String =
        try {
            dataSource.connection.use { connection ->
                connection.createStatement().use { statement ->
                    statement.executeQuery("SELECT 1").use { rows ->
                        if (rows.next()) "ok" else "unreachable"
                    }
                }
            }
        } catch (e: Exception) {
            // The message can carry the host and, in some drivers, the
            // credentials. It goes to the log, never to a client (§1.26).
            log.warn("database health check failed: {}", e.javaClass.simpleName)
            "unreachable"
        }

    /** PHASE_07 §7.67 — "PostgreSQL 16.4" for the Admin page, or null. */
    fun serverVersion(): String? =
        runCatching {
            dataSource.connection.use { connection ->
                connection.createStatement().use { statement ->
                    statement.executeQuery("SHOW server_version").use { rows ->
                        if (rows.next()) "PostgreSQL ${rows.getString(1).substringBefore(' ')}" else null
                    }
                }
            }
        }.getOrNull()

    /** Exposed for later phases; Phase 1 itself stores nothing. */
    fun dataSource(): DataSource = dataSource

    override fun close() = dataSource.close()

    companion object {
        private val log = LoggerFactory.getLogger(Database::class.java)

        /**
         * Build a pool, or null when there isn't one to build.
         *
         * Null means either "no database configured" or "a pool could
         * not be created at all" (an unusable URL, a missing driver).
         * Both are reported by readiness — the first as
         * "unconfigured", the second as "unreachable" — and neither
         * stops the server starting.
         *
         * Two things here were found by running the tests, not by
         * reasoning:
         *
         * 1. HikariCP fail-fasts by DEFAULT: constructing the pool
         *    opens a connection and throws if the database is down.
         *    An earlier comment here claimed construction did not
         *    connect, which was simply wrong, and the server would
         *    have died at boot whenever PostgreSQL was slow to start
         *    -- the exact ordering a compose stack produces.
         *    `initializationFailTimeout = -1` makes the pool lazy, so
         *    a database that arrives late, or comes back, is picked
         *    up instead of being fatal.
         *
         * 2. An unusable JDBC URL still throws during construction,
         *    whatever that timeout says, because the driver is
         *    resolved eagerly. Hence the catch.
         */
        fun connect(config: ServerConfig): Database? {
            val url = config.databaseUrl
            if (url.isNullOrBlank()) return null

            val hikari =
                HikariConfig().apply {
                    jdbcUrl = url
                    config.databaseUser()?.let { username = it }
                    config.databasePassword()?.let { password = it }
                    // Five concurrent matches, one server. A large pool
                    // would reserve connections nothing ever uses.
                    maximumPoolSize = 10
                    minimumIdle = 2
                    connectionTimeout = 10_000
                    poolName = "proxic-pool"
                    // Negative = never fail fast; see (1) above.
                    initializationFailTimeout = -1
                }
            return runCatching { Database(HikariDataSource(hikari)) }
                .onFailure {
                    // The URL can embed a password, so only the
                    // exception TYPE is logged (§1.26).
                    log.error("could not create the connection pool: {}", it.javaClass.simpleName)
                }
                .getOrNull()
        }
    }
}
