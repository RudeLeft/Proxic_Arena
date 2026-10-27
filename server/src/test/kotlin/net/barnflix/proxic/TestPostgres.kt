package net.barnflix.proxic

import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager
import java.util.UUID

// One database server per test run, a fresh database per test.
//
// Every database-backed test used to start its own Postgres container:
// 550 tests at about two seconds each, most of it waiting for a server
// to boot (measured 2026-10-26: 17.6 minutes for the suite). Isolation
// never needed a new SERVER, only a new DATABASE, and Postgres makes an
// empty one in a few milliseconds. So each test still begins exactly as
// before -- an empty database of its own, migrated by the test itself --
// on one shared server that lives as long as the test JVM (Testcontainers
// removes it when the JVM ends).

/** The shared server, started on first use. */
object TestPostgres {
    private val server: PostgreSQLContainer<*> by lazy {
        PostgreSQLContainer("postgres:16.15-alpine")
            .withDatabaseName("proxic_admin")
            .withUsername("proxic")
            .withPassword("test-only-not-a-secret")
            .also { it.start() }
    }

    /** A new, empty database on the shared server; [FreshDatabase.stop] drops it. */
    fun fresh(): FreshDatabase {
        val name = "t_" + UUID.randomUUID().toString().replace("-", "")
        admin("CREATE DATABASE $name")
        return FreshDatabase(
            name = name,
            jdbcUrl = server.jdbcUrl.replace("/proxic_admin", "/$name"),
            username = server.username,
            password = server.password,
        )
    }

    internal fun drop(name: String) {
        // FORCE: a test that left a pool open must not keep its database alive.
        admin("DROP DATABASE IF EXISTS $name WITH (FORCE)")
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
