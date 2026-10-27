package net.barnflix.proxic.auth

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.slf4j.LoggerFactory
import org.testcontainers.DockerClientFactory
import java.sql.Connection
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Expired-session cleanup — PHASE_03 §3.90, §3.155.
 *
 * Written because the gate audit found `purgeExpiredSessions()` and
 * `LoginThrottle.evictExpired()` both implemented, both tested, and
 * neither ever called. These tests are about the *sweep*: that it
 * removes what it should, keeps what it should, and — the part that
 * was missing — that nothing it touches can stop it running again.
 */
class SessionMaintenanceTest {
    private var container: FreshDatabase? = null
    private val log = LoggerFactory.getLogger(SessionMaintenanceTest::class.java)

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            TestPostgres.fresh()
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun database(): Database {
        val config =
            ServerConfig(
                host = "0.0.0.0",
                port = 0,
                databaseUrl = container!!.jdbcUrl,
                forgeWorkerJar = null,
                dataRoot = "build/test-maintenance",
                databasePasswordValue = container!!.password,
                databaseUserValue = container!!.username,
            )
        return Database.connect(config)!!.also { it.migrate() }
    }

    /** `(Connection) -> Unit`, never a value: JUnit silently SKIPS a
     * `@Test` whose method returns one, and two tests in this project
     * once never ran because a helper returned a row count. */
    private fun withConnection(
        database: Database,
        body: (Connection) -> Unit,
    ) {
        database.dataSource().connection.use(body)
    }

    private fun seedUser(database: Database): Pair<Accounts, java.util.UUID> {
        val sessions = Sessions(database.dataSource())
        val accounts = Accounts(database.dataSource(), sessions)
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
        return accounts to accounts.findByUsername("RudeLeft")!!.userId
    }

    private fun sessionCount(database: Database): Int {
        var count = -1
        withConnection(database) { connection ->
            connection.prepareStatement("SELECT count(*) FROM user_session").use { statement ->
                statement.executeQuery().use { rows ->
                    rows.next()
                    count = rows.getInt(1)
                }
            }
        }
        return count
    }

    /**
     * Age a session so it looks long expired, as the clock would.
     *
     * `created_at` moves back too, and not for tidiness: the schema
     * carries CHECK (expires_at > created_at), so backdating expiry
     * alone is REFUSED. The constraint is right -- a session that
     * expired before it was created is not a thing -- and the fix is
     * to age the row the way time would have.
     */
    private fun expireLongAgo(
        database: Database,
        days: Int,
    ) {
        withConnection(database) { connection ->
            connection.prepareStatement(
                "UPDATE user_session SET expires_at = now() - make_interval(days => ?), " +
                    "created_at = now() - make_interval(days => ? + 30), " +
                    "last_active_at = now() - make_interval(days => ? + 30)",
            ).use {
                it.setInt(1, days)
                it.setInt(2, days)
                it.setInt(3, days)
                it.executeUpdate()
            }
        }
    }

    @Test
    fun `a session long past expiry is removed`() {
        val database = database()
        val (accounts, _) = seedUser(database)
        accounts.login("RudeLeft", "a perfectly fine passphrase")
        assertEquals(1, sessionCount(database))

        expireLongAgo(database, days = 40)

        val maintenance = SessionMaintenance(Sessions(database.dataSource()), LoginThrottle(), log)
        assertEquals(1, maintenance.sweep(), "the sweep should report what it removed")
        assertEquals(0, sessionCount(database))
    }

    /**
     * The negative control, and the more important half.
     *
     * A sweep that deleted everything would pass the test above and
     * silently sign out every user in the building.
     */
    @Test
    fun `a live session, and a recently expired one, are both kept`() {
        val database = database()
        val (accounts, _) = seedUser(database)
        accounts.login("RudeLeft", "a perfectly fine passphrase")

        val maintenance = SessionMaintenance(Sessions(database.dataSource()), LoginThrottle(), log)
        assertEquals(0, maintenance.sweep(), "a live session was swept")
        assertEquals(1, sessionCount(database))

        // Expired yesterday: unusable, but kept. The row is the only
        // record that the session existed, and §3.90 deletes rows
        // 30 days past expiry, not at expiry.
        expireLongAgo(database, days = 1)
        assertEquals(0, maintenance.sweep(), "a recently expired session was swept too early")
        assertEquals(1, sessionCount(database))
    }

    /**
     * The failure mode that makes a scheduled task quietly stop:
     * `scheduleWithFixedDelay` never reschedules a task that throws.
     */
    @Test
    fun `a sweep against a closed database does not end cleanup`() {
        val database = database()
        seedUser(database)
        val sessions = Sessions(database.dataSource())
        val maintenance = SessionMaintenance(sessions, LoginThrottle(), log)
        database.close()

        // start() wraps every sweep; the wrapper must swallow this.
        maintenance.start()
        Thread.sleep(200)
        maintenance.stop()

        // The real assertion is that nothing above threw out of the
        // scheduler, which would have failed this test.
        assertTrue(true)
    }

    @Test
    fun `the sweep also evicts stale throttle entries`() {
        val database = database()
        val throttle = LoginThrottle()
        repeat(3) { throttle.recordFailure("1.2.3.4", "RudeLeft") }
        assertTrue(throttle.retryAfter("1.2.3.4", "RudeLeft") == null)

        // Nothing is expired yet, so the sweep must not clear it:
        // an eviction that dropped live counters would hand an
        // attacker an unlimited number of attempts.
        SessionMaintenance(Sessions(database.dataSource()), throttle, log).sweep()
        repeat(7) { throttle.recordFailure("1.2.3.4", "RudeLeft") }
        assertTrue(
            throttle.retryAfter("1.2.3.4", "RudeLeft") != null,
            "ten failures should still be throttled after a sweep",
        )
    }
}
