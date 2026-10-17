package net.barnflix.proxic

import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Database and migrations — PHASE_01 §1.36–§1.38.
 *
 * Runs against a THROWAWAY PostgreSQL started by Testcontainers, so
 * the migration is proven against a clean database every time and
 * never against anyone's development data.
 *
 * Without Docker these tests are SKIPPED, loudly. They are not
 * quietly passed: a green tick for a database test that never saw a
 * database is exactly the false-green §1.69 exists to prevent, and
 * the whole point of ADR 0001 was to stop carrying unverified
 * subsystems forward.
 */
class DatabaseTest {
    private var container: PostgreSQLContainer<*>? = null

    private fun requireDocker() {
        val probe = runCatching { DockerClientFactory.instance().isDockerAvailable }
        // The REASON matters. A silent false here is how a skip
        // becomes permanent: nobody ever learns why Docker was not
        // found, and the tests quietly never run again.
        probe.exceptionOrNull()?.let { println("DOCKER PROBE FAILED: $it") }
        val available = probe.getOrDefault(false)
        if (!available) println("DOCKER PROBE: isDockerAvailable=false DOCKER_HOST=" + System.getenv("DOCKER_HOST"))
        assumeTrue(available, "SKIPPED: Docker is not available on this machine (ADR 0001)")
    }

    @BeforeTest
    fun start() {
        requireDocker()
        // Pinned tag, not `latest` (§1.5, §1.56).
        container =
            PostgreSQLContainer("postgres:16.4-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }
    }

    @AfterTest
    fun stop() {
        container?.stop()
    }

    private fun configFor(c: PostgreSQLContainer<*>) =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = c.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-data",
            databasePasswordValue = c.password,
            databaseUserValue = c.username,
        )

    @Test
    fun `migration runs once, is recorded, and is idempotent`() {
        val c = container!!
        val db = Database.connect(configFor(c))!!
        db.use {
            // Every migration in the repository applies. The count
            // grows with each phase, so this asserts "more than
            // none" rather than a number that needs editing every
            // time; the IDEMPOTENCY assertion below is the point.
            assertTrue(it.migrate() >= 1, "migrations should apply on a clean database")

            // The history row is the observable evidence that Flyway
            // owns the schema -- V001 itself creates no tables (§1.36).
            it.dataSource().connection.use { conn ->
                conn.createStatement().use { st ->
                    st.executeQuery(
                        "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank",
                    ).use { rows ->
                        assertTrue(rows.next(), "no migration was recorded")
                        assertEquals("001", rows.getString("version"))
                        assertTrue(rows.getBoolean("success"))
                        // Later migrations must have succeeded too.
                        while (rows.next()) {
                            assertTrue(
                                rows.getBoolean("success"),
                                "migration ${rows.getString("version")} failed",
                            )
                        }
                    }
                }
            }

            // Re-running must be a no-op; a server restart must not
            // re-apply migrations.
            assertEquals(0, it.migrate(), "second run should apply nothing")
        }
    }

    /**
     * §1.36/§1.37 — no speculative schema.
     *
     * Phase 1 created no tables at all. Phase 2 added exactly three.
     * The assertion is the EXACT set rather than a count, so a table
     * nobody decided on shows up as a failure the moment it appears
     * — which is the whole point of §1.36, and the reason this test
     * is updated per phase instead of deleted.
     */
    @Test
    fun `migrations create exactly the tables their phases defined`() {
        val c = container!!
        Database.connect(configFor(c))!!.use { db ->
            db.migrate()
            db.dataSource().connection.use { conn ->
                conn.createStatement().use { st ->
                    st.executeQuery(
                        """
                        SELECT table_name FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name <> 'flyway_schema_history'
                        """.trimIndent(),
                    ).use { rows ->
                        val tables = buildList { while (rows.next()) add(rows.getString(1)) }
                        // Phase 2: imported_deck, deck_entry, art_asset.
                        // Phase 3: app_user, user_session.
                        // Phase 4: deck_share. Ownership is a COLUMN
                        // on imported_deck, not a table -- §4.10.
                        // Phase 5: room, room_member, match_setup,
                        // match_setup_player. NOT a chat table:
                        // messages are ephemeral by owner decision
                        // D3, and a table would be the first step
                        // towards the retention policy that decision
                        // exists to avoid.
                        // Still forbidden until their own phases:
                        // match history, friends, ratings.
                        assertEquals(
                            listOf(
                                "app_user",
                                "art_asset",
                                "deck_entry",
                                "deck_share",
                                "imported_deck",
                                "match_setup",
                                "match_setup_player",
                                "room",
                                "room_member",
                                "user_session",
                            ),
                            tables.sorted(),
                            "unexpected schema: $tables",
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `readiness reports a live database as ok`() {
        val c = container!!
        val config = configFor(c)
        Database.connect(config)!!.use { db ->
            db.migrate()
            val ready = HealthChecks(config, db).readiness()
            assertEquals("ok", ready.checks["database"])
            assertEquals("ok", ready.status)
        }
    }

    /**
     * A database that goes away must stop being "ok".
     *
     * The failure this guards against is a health flag set once at
     * startup: the pool was fine, the database has since died, and
     * readiness keeps reporting success.
     */
    @Test
    fun `a database that stops is reported unreachable, not ok`() {
        val c = container!!
        val config = configFor(c)
        val db = Database.connect(config)!!
        db.use {
            it.migrate()
            assertEquals("ok", it.health())

            c.stop()

            assertEquals("unreachable", it.health())
            val ready = HealthChecks(config, it).readiness()
            assertEquals("unreachable", ready.checks["database"])
            assertEquals("degraded", ready.status)
        }
    }
}
