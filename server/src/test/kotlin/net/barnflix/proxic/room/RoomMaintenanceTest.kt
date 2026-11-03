package net.barnflix.proxic.room

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.DeckAuthorization
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.slf4j.LoggerFactory
import org.testcontainers.DockerClientFactory
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Idle rooms close — PHASE_05 §5.124–§5.126, and spec 0054 (owner
 * 2026-11-03), which replaced D4's 24 hours: 30 minutes with the host
 * alone, 2 hours with two players, a host offline 10 minutes closes the
 * room, a guest offline 10 minutes leaves it.
 *
 * These drive the sweep directly, backdating a room's activity and
 * giving it a presence that says who is offline since when. What is
 * proved is the policy: WHICH rooms it takes, WHICH it leaves, and what
 * it does to the people who were in them.
 */
class RoomMaintenanceTest {
    private var container: FreshDatabase? = null
    private var database: Database? = null
    private val log = LoggerFactory.getLogger(RoomMaintenanceTest::class.java)

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            TestPostgres.fresh()
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
        val removed = mutableListOf<Pair<UUID, String>>()

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
        ) {
            removed += userId to reason
        }
    }

    /** Everything that exists is idle: the harshest the sweep can be. */
    private val noTime = RoomTimeouts(alone = Duration.ZERO, together = Duration.ZERO)

    private fun maintenance(
        recorder: RoomAnnouncer,
        timeouts: RoomTimeouts = RoomTimeouts(),
        offline: Map<UUID, Duration> = emptyMap(),
    ): RoomMaintenance {
        val now = Instant.now()
        val presence =
            object : Presence {
                override fun isOnline(userId: UUID) = userId !in offline

                override fun offlineSince(userId: UUID) = offline[userId]?.let { now.minus(it) }
            }
        return RoomMaintenance(
            database!!.dataSource(),
            recorder,
            log,
            presence = presence,
            timeouts = { timeouts },
            clock = { now },
        )
    }

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

    /**
     * A room with a match in it is never closed, however idle it looks
     * and whoever is offline: these are lobby rules, not game rules
     * (spec 0054). A long game looks exactly like an abandoned room to
     * the clock, because nothing touches the room while it is played.
     */
    @Test
    fun `a room that is in a match is not swept, however idle it looks`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val room = (rooms.create(host) as RoomResult.Ok).room

        // Straight to IN_MATCH, which is what launching does.
        database!!.dataSource().connection.use { connection ->
            connection.prepareStatement(
                "UPDATE room SET status = 'IN_MATCH' WHERE room_id = ?",
            ).use {
                it.setObject(1, room.roomId)
                it.executeUpdate()
            }
        }

        val recorder = Recorder()
        val expired = maintenance(recorder, noTime, offline = mapOf(host to Duration.ofHours(5))).sweep()

        assertEquals(0, expired, "a live match's room was swept")
        assertEquals("IN_MATCH", statusOf(room.roomId), "a live match's room changed status")
        assertEquals(1, memberCount(room.roomId), "a player lost their seat mid-match")
        assertTrue(recorder.closed.isEmpty(), "players were told their room closed mid-match")
    }

    /** Two players: 2 hours. Status, membership, and who is told. */
    @Test
    fun `two players, 2 hours with nothing happening - closed, and both told`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)

        ageRoom(room.roomId, Duration.ofMinutes(119))
        assertEquals(0, maintenance(Recorder()).sweep(), "two players get 2 hours, not 30 minutes")

        ageRoom(room.roomId, Duration.ofMinutes(121))
        val recorder = Recorder()
        assertEquals(1, maintenance(recorder).sweep())
        assertEquals("CLOSED", statusOf(room.roomId))
        assertEquals(0, memberCount(room.roomId), "membership should have ended")

        val (closedId, members, reason) = recorder.closed.single()
        assertEquals(room.roomId, closedId)
        assertEquals("IDLE_120", reason)
        assertEquals(setOf(host, guest), members.toSet(), "both members should be told")
    }

    /** The host alone (an invitation may be waiting): 30 minutes. */
    @Test
    fun `the host alone, 30 minutes with nothing happening - closed`() {
        val room = (rooms().create(userId("RudeLeft")) as RoomResult.Ok).room

        ageRoom(room.roomId, Duration.ofMinutes(29))
        assertEquals(0, maintenance(Recorder()).sweep())
        assertEquals("OPEN", statusOf(room.roomId))

        ageRoom(room.roomId, Duration.ofMinutes(31))
        val recorder = Recorder()
        assertEquals(1, maintenance(recorder).sweep())
        assertEquals("IDLE_30", recorder.closed.single().third)
    }

    /** The host offline 10 minutes closes it, with the guest still in it. */
    @Test
    fun `the host offline 10 minutes closes the room, and the guest is told`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)

        assertEquals(0, maintenance(Recorder(), offline = mapOf(host to Duration.ofMinutes(9))).sweep())
        assertEquals("OPEN", statusOf(room.roomId), "a refresh or a short drop does not lose the room")

        val recorder = Recorder()
        assertEquals(1, maintenance(recorder, offline = mapOf(host to Duration.ofMinutes(10))).sweep())
        assertEquals("CLOSED", statusOf(room.roomId))
        val (_, members, reason) = recorder.closed.single()
        assertEquals("HOST_AWAY", reason)
        assertEquals(setOf(host, guest), members.toSet())
    }

    /** A guest offline 10 minutes leaves; the host keeps the room. */
    @Test
    fun `a guest offline 10 minutes is taken out, and the host keeps the room`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)
        ageRoom(room.roomId, Duration.ofMinutes(50))

        val recorder = Recorder()
        assertEquals(0, maintenance(recorder, offline = mapOf(guest to Duration.ofMinutes(11))).sweep())
        assertEquals("OPEN", statusOf(room.roomId))
        assertEquals(1, memberCount(room.roomId), "the guest should be out")
        assertEquals(listOf(guest to "AWAY"), recorder.removed)
        assertTrue(recorder.closed.isEmpty())

        // Taking the guest out is something happening: a fresh 30 minutes.
        assertEquals(0, maintenance(Recorder()).sweep(), "the host-alone clock starts again")
    }

    /** Keep it open starts the clock again; only a member can press it. */
    @Test
    fun `keep it open starts the clock again`() {
        val host = userId("RudeLeft")
        val room = (rooms().create(host) as RoomResult.Ok).room
        ageRoom(room.roomId, Duration.ofMinutes(31))

        val idle = RoomIdle(database!!.dataSource())
        assertNull(idle.keepOpen(room.roomId, userId("Pat")), "only a member keeps it open")
        assertNotNull(idle.keepOpen(room.roomId, host))

        assertEquals(0, maintenance(Recorder()).sweep())
        assertEquals("OPEN", statusOf(room.roomId))
    }

    /** Chatting counts, at most once a minute, without staling anybody's revision. */
    @Test
    fun `a chat line from a member keeps the room open`() {
        val host = userId("RudeLeft")
        val room = (rooms().create(host) as RoomResult.Ok).room
        val revision = rooms().find(room.roomId)!!.revision
        ageRoom(room.roomId, Duration.ofMinutes(31))

        val idle = RoomIdle(database!!.dataSource())
        assertTrue(idle.chatted(host))
        assertEquals(false, idle.chatted(host), "once a minute is enough")
        assertEquals(false, idle.chatted(userId("Pat")), "somebody in no room keeps nothing open")
        assertEquals(revision, rooms().find(room.roomId)!!.revision, "a chat line must not make actions stale")

        assertEquals(0, maintenance(Recorder()).sweep())
        assertEquals("OPEN", statusOf(room.roomId))
    }

    /**
     * The half that matters more.
     *
     * A sweep that closes everything would pass the tests above and
     * delete every live lobby on the server.
     */
    @Test
    fun `a room that was just used is left alone`() {
        val room = (rooms().create(userId("RudeLeft")) as RoomResult.Ok).room

        val expired = maintenance(Recorder()).sweep()

        assertEquals(0, expired)
        assertEquals("OPEN", statusOf(room.roomId))
        assertEquals(1, memberCount(room.roomId))
    }

    /**
     * Activity is an ACTION, not a held socket.
     *
     * The room is idle by the clock until somebody does something;
     * doing something must move the deadline.
     */
    @Test
    fun `using a room resets its deadline`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val room = (rooms.create(host) as RoomResult.Ok).room
        ageRoom(room.roomId, Duration.ofHours(3))

        // Somebody joins: that is activity, and `touch` records it.
        check(rooms.join(room.roomId, userId("Pat")) is RoomResult.Ok)

        val expired = maintenance(Recorder()).sweep()
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
        maintenance(Recorder()).sweep()
        assertEquals("CLOSED", statusOf(room.roomId))

        ageRoom(room.roomId, Duration.ofDays(8))
        maintenance(Recorder()).sweep()
        assertNull(statusOf(room.roomId), "an old closed room should be gone")
    }

    /** A sweep must be safe to run twice. It runs every minute forever. */
    @Test
    fun `sweeping twice closes nothing the second time`() {
        rooms().create(userId("RudeLeft"))

        val recorder = Recorder()
        val sweep = maintenance(recorder, noTime)
        assertEquals(1, sweep.sweep())
        assertEquals(0, sweep.sweep(), "a closed room must not close again")
        assertEquals(1, recorder.closed.size, "and must not be announced twice")
    }

    /** §5.5 — a closed room must not keep its members hostage. */
    @Test
    fun `after closing a member can host again`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        rooms.create(host)

        maintenance(Recorder(), noTime).sweep()

        assertTrue(rooms.create(host) is RoomResult.Ok, "closing should free the member")
    }

    /** Backdate a room's activity, which is the only way to test
     *  a time limit without waiting for it. */
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
