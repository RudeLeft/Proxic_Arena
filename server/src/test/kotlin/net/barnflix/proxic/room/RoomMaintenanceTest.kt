package net.barnflix.proxic.room

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.DeckAuthorization
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.slf4j.LoggerFactory
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Duration
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Abandoned rooms expire — PHASE_05 §5.124–§5.126, owner D4.
 *
 * A 24-hour rule cannot be tested by waiting, so these drive the
 * sweep directly with a short lifetime. What is actually being
 * proved is the policy either way: WHICH rooms it takes, WHICH it
 * leaves, and what it does to the people who were in them.
 */
class RoomMaintenanceTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private val log = LoggerFactory.getLogger(RoomMaintenanceTest::class.java)

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            PostgreSQLContainer("postgres:16.4-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }
        database = Database.connect(config())!!.also { it.migrate() }

        val accounts = Accounts(database!!.dataSource())
        for (name in listOf("RudeLeft", "Pat")) {
            accounts.createUser(name, "a perfectly fine passphrase", Role.PLAYER)
        }
    }

    @AfterTest
    fun stop() {
        database?.close()
        container!!.stop()
    }

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-room-sweep",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun rooms() = RoomService(database!!.dataSource(), DeckAuthorization(database!!.dataSource()))

    private fun userId(username: String) = Accounts(database!!.dataSource()).findByUsername(username)!!.userId

    /** Records what the sweep announced, so the test can read it. */
    private class Recorder : RoomAnnouncer {
        val closed = mutableListOf<Triple<UUID, Collection<UUID>, String>>()

        override suspend fun roomChanged(room: Room) = Unit

        override suspend fun setupProblem(
            userId: UUID,
            roomId: UUID,
            code: String,
            detail: String,
        ) = Unit

        override suspend fun roomClosed(
            roomId: UUID,
            formerMembers: Collection<UUID>,
            reason: String,
        ) {
            closed += Triple(roomId, formerMembers, reason)
        }

        override suspend fun removedFromRoom(
            roomId: UUID,
            userId: UUID,
            reason: String,
        ) = Unit
    }

    private fun maintenance(
        recorder: RoomAnnouncer,
        lifetime: Duration,
        retention: Duration = Duration.ofDays(7),
    ) = RoomMaintenance(database!!.dataSource(), recorder, log, lifetime, retention)

    private fun statusOf(roomId: UUID): String? =
        database!!.dataSource().connection.use { connection ->
            connection.prepareStatement("SELECT status FROM room WHERE room_id = ?").use {
                it.setObject(1, roomId)
                it.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
            }
        }

    private fun memberCount(roomId: UUID): Int =
        database!!.dataSource().connection.use { connection ->
            connection.prepareStatement(
                "SELECT count(*) FROM room_member WHERE room_id = ?",
            ).use {
                it.setObject(1, roomId)
                it.executeQuery().use { rows ->
                    rows.next()
                    rows.getInt(1)
                }
            }
        }

    /** §5.125 — status, membership and the people who were in it. */
    @Test
    fun `an idle room expires, ends its memberships and tells its members`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)

        val recorder = Recorder()
        // A lifetime of zero: everything that exists is idle.
        val expired = maintenance(recorder, Duration.ZERO).sweep()

        assertEquals(1, expired)
        assertEquals("EXPIRED", statusOf(room.roomId))
        assertEquals(0, memberCount(room.roomId), "membership should have ended")

        assertEquals(1, recorder.closed.size)
        val (closedId, members, reason) = recorder.closed.single()
        assertEquals(room.roomId, closedId)
        assertEquals("EXPIRED", reason)
        assertEquals(setOf(host, guest), members.toSet(), "both members should be told")
    }

    /**
     * D4 — the half that matters more.
     *
     * A sweep that expires everything would pass the test above and
     * delete every live lobby on the server.
     */
    @Test
    fun `a room that was just used is left alone`() {
        val room = (rooms().create(userId("RudeLeft")) as RoomResult.Ok).room

        val expired = maintenance(Recorder(), Duration.ofHours(24)).sweep()

        assertEquals(0, expired)
        assertEquals("OPEN", statusOf(room.roomId))
        assertEquals(1, memberCount(room.roomId))
    }

    /**
     * D4 again — activity is an ACTION, not a held socket.
     *
     * The room is idle by the clock until somebody does something;
     * doing something must move the deadline.
     */
    @Test
    fun `using a room resets its deadline`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val room = (rooms.create(host) as RoomResult.Ok).room
        ageRoom(room.roomId, Duration.ofHours(30))

        // Somebody joins: that is activity, and `touch` records it.
        check(rooms.join(room.roomId, userId("Pat")) is RoomResult.Ok)

        val expired = maintenance(Recorder(), Duration.ofHours(24)).sweep()
        assertEquals(0, expired, "a room used a moment ago is not abandoned")
        assertEquals("OPEN", statusOf(room.roomId))
    }

    /** §5.126 — finished records are kept briefly, then removed. */
    @Test
    fun `closed rooms are purged only after the retention window`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.close(room.roomId, host) is RoomResult.Ok)

        // Inside the window: kept, because §5.126 wants it for
        // diagnostics.
        maintenance(Recorder(), Duration.ofHours(24), Duration.ofDays(7)).sweep()
        assertEquals("CLOSED", statusOf(room.roomId))

        ageRoom(room.roomId, Duration.ofDays(8))
        maintenance(Recorder(), Duration.ofHours(24), Duration.ofDays(7)).sweep()
        assertNull(statusOf(room.roomId), "an old closed room should be gone")
    }

    /** A sweep must be safe to run twice. It runs hourly forever. */
    @Test
    fun `sweeping twice expires nothing the second time`() {
        rooms().create(userId("RudeLeft"))

        val recorder = Recorder()
        val sweep = maintenance(recorder, Duration.ZERO)
        assertEquals(1, sweep.sweep())
        assertEquals(0, sweep.sweep(), "an expired room must not expire again")
        assertEquals(1, recorder.closed.size, "and must not be announced twice")
    }

    /** §5.5 — an expired room must not keep its members hostage. */
    @Test
    fun `after expiry a member can host again`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        rooms.create(host)

        maintenance(Recorder(), Duration.ZERO).sweep()

        assertTrue(rooms.create(host) is RoomResult.Ok, "expiry should free the member")
    }

    /** Backdate a room's activity, which is the only way to make
     *  a 24-hour rule testable without a 24-hour test. */
    private fun ageRoom(
        roomId: UUID,
        by: Duration,
    ) {
        database!!.dataSource().connection.use { connection ->
            connection.prepareStatement(
                "UPDATE room SET last_activity_at = now() - ?::interval WHERE room_id = ?",
            ).use {
                it.setString(1, "${by.toSeconds()} seconds")
                it.setObject(2, roomId)
                it.executeUpdate()
            }
        }
    }
}
