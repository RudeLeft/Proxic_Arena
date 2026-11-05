package net.barnflix.proxic

import org.flywaydb.core.Flyway
import org.postgresql.ds.PGSimpleDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager
import java.util.UUID

// One database server per test run, a fresh database per test.
//
// Every database-backed test used to start its own Postgres container:
// 550 tests at about two seconds each, most of it waiting for a server
// to boot (measured 2026-10-26: 17.6 minutes for the suite). Isolation
// never needed a new SERVER, only a new DATABASE, and Postgres makes an
// empty one in a few milliseconds. So each test still begins with a
// database of its own, on one shared server that lives as long as the
// test JVM (Testcontainers removes it when the JVM ends).
//
// And since 2026-11-05 that database is a COPY of one migrated once per
// JVM (CREATE DATABASE ... TEMPLATE), instead of each test replaying every
// migration. The test's own migrate() still runs Flyway against it, which
// finds the schema current and applies nothing: the app's migrate path is
// still exercised, only the replay is gone. Tests about migrations
// themselves -- an empty database, a migration from an older version --
// ask for [fresh] with `migrated = false` and start empty, as before.

/** The shared server, started on first use. */
object TestPostgres {
    private val server: PostgreSQLContainer<*> by lazy {
        PostgreSQLContainer("postgres:16.15-alpine")
            .withDatabaseName("proxic_admin")
            .withUsername("proxic")
            .withPassword("test-only-not-a-secret")
            .also { it.start() }
    }

    /**
     * Every migration applied once, by the same Flyway settings the app
     * uses (Database.migrate), to a database nothing connects to again:
     * Postgres copies a template only while it has no connections.
     */
    private val template: String by lazy {
        val name = "t_template_" + UUID.randomUUID().toString().replace("-", "")
        admin("CREATE DATABASE $name")
        Flyway.configure()
            .dataSource(dataSourceFor(name))
            .locations("classpath:db/migration")
            .baselineOnMigrate(false)
            .load()
            .migrate()
        name
    }

    /**
     * A new database on the shared server; [FreshDatabase.stop] drops it.
     * Already migrated unless [migrated] is false, which gives an empty one
     * (for the tests about migrating).
     */
    @Synchronized
    fun fresh(migrated: Boolean = true): FreshDatabase {
        val name = "t_" + UUID.randomUUID().toString().replace("-", "")
        admin(if (migrated) "CREATE DATABASE $name TEMPLATE $template" else "CREATE DATABASE $name")
        return FreshDatabase(
            name = name,
            jdbcUrl = urlOf(name),
            username = server.username,
            password = server.password,
        )
    }

    internal fun drop(name: String) {
        // FORCE: a test that left a pool open must not keep its database alive.
        admin("DROP DATABASE IF EXISTS $name WITH (FORCE)")
    }

    private fun urlOf(name: String) = server.jdbcUrl.replace("/proxic_admin", "/$name")

    private fun dataSourceFor(name: String) =
        PGSimpleDataSource().apply {
            setURL(urlOf(name))
            user = server.username
            password = server.password
        }

    /** One statement on the server's own database (CREATE/DROP DATABASE cannot run in the one being made). */
    private fun admin(sql: String) {
        DriverManager.getConnection(server.jdbcUrl, server.username, server.password).use { connection ->
            connection.createStatement().use { it.execute(sql) }
        }
    }
}

/** One test's own database: what the tests read from the container they used to start. */
class FreshDatabase(
    private val name: String,
    val jdbcUrl: String,
    val username: String,
    val password: String,
) {
    fun stop() = TestPostgres.drop(name)
}
