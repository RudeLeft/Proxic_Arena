package net.barnflix.proxic.match

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.AccountStatus
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.deck.DeckSharing
import net.barnflix.proxic.room.DeckCheck
import net.barnflix.proxic.room.DeckVerdict
import net.barnflix.proxic.room.MatchSetupService
import net.barnflix.proxic.room.PrepareResult
import net.barnflix.proxic.room.Room
import net.barnflix.proxic.room.RoomResult
import net.barnflix.proxic.room.RoomService
import net.barnflix.proxic.room.RoomStatus
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Claiming a setup — PHASE_06 §6.9–§6.19, acceptance P6-A, P6-B,
 * P6-C.
 *
 * The one that matters is P6-B. §6.9 says a race between duplicate
 * launch requests must not start two Forge runtimes, and a test
 * that calls launch twice in sequence proves nothing about that:
 * it proves the second call sees the first call's result, which it
 * would even with a check-then-update. These launch concurrently
 * from a barrier, so both are inside the window the claim exists to
 * close.
 */
class MatchLauncherTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private val password = "a perfectly fine passphrase"

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

        val accounts = Accounts(source())
        for (name in listOf("RudeLeft", "Pat")) accounts.createUser(name, password, Role.PLAYER)
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
            dataRoot = "build/test-match-launch",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun source() = database!!.dataSource()

    private fun userId(username: String) = Accounts(source()).findByUsername(username)!!.userId

    private fun launcher() = MatchLauncher(source(), DeckAuthorization(source()))

    private fun setups() =
        MatchSetupService(
            source(),
            DeckAuthorization(source()),
            { DeckCheck(DeckVerdict.VALID, "") },
        )

    private fun insertDeck(
        ownerId: UUID,
        name: String = "A deck",
    ): UUID {
        val deckId = UUID.randomUUID()
        source().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256,
                     total_cards, distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, ?, 'test.zip', ?, 60, 15, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, name)
                it.setString(3, deckId.toString().replace("-", "").repeat(2).take(64))
                it.setObject(4, ownerId)
                it.executeUpdate()
            }
        }
        return deckId
    }

    /** A room prepared through the real Phase 5 path, ready to launch. */
    private fun preparedRoom(): Pair<Room, UUID> {
        val rooms = RoomService(source(), DeckAuthorization(source()))
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val deckId = insertDeck(host, "Mono Red")
        DeckSharing(source(), DeckAuthorization(source())).share(deckId, host, "Pat")

        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)
        for (user in listOf(host, guest)) {
            check(rooms.selectDeck(room.roomId, user, deckId) is RoomResult.Ok)
            check(rooms.setReady(room.roomId, user, true) is RoomResult.Ok)
        }
        val prepared = setups().prepare(room.roomId, host)
        val setup = assertIs<PrepareResult.Prepared>(prepared, "could not prepare: $prepared")
        return rooms.find(room.roomId)!! to UUID.fromString(setup.setup.setupId)
    }

    private fun matchCount(): Int =
        source().connection.use { connection ->
            connection.prepareStatement("SELECT count(*) FROM match").use {
                it.executeQuery().use { rows ->
                    rows.next()
                    rows.getInt(1)
                }
            }
        }

    // --- P6-A ---------------------------------------------------------------

    /** §6.18, §6.19 — one match record, with the seats as prepared. */
    @Test
    fun `a ready setup launches exactly one match`() {
        val (room, setupId) = preparedRoom()

        val result = launcher().launch(setupId, room.hostUserId)

        val launched = assertIs<LaunchResult.Launched>(result, "got: $result")
        assertEquals(MatchStatus.LAUNCHING, launched.match.status)
        assertEquals(setupId, launched.match.setupId)
        assertEquals(2, launched.match.participants.size)
        assertEquals(listOf(1, 2), launched.match.participants.map { it.seatNumber })
        assertTrue(launched.match.participants.all { it.deckId != null })
        // §6.19 — the names are SNAPSHOTS, captured at launch.
        assertEquals(
            setOf("RudeLeft", "Pat"),
            launched.match.participants.map { it.displayName }.toSet(),
        )
        assertTrue(launched.match.participants.all { it.deckName == "Mono Red" })

        assertEquals(1, matchCount())
    }

    /** §6.16 — and the room follows it. */
    @Test
    fun `launching moves the room to IN_MATCH`() {
        val (room, setupId) = preparedRoom()
        assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))

        val rooms = RoomService(source(), DeckAuthorization(source()))
        assertEquals(RoomStatus.IN_MATCH, rooms.find(room.roomId)!!.status)
    }

    // --- P6-B, the one that matters -----------------------------------------

    /**
     * §6.9 — two concurrent launches, one match.
     *
     * A barrier so both threads are inside the window at once. The
     * sequential version of this test passes against a
     * check-then-update implementation, which is exactly the
     * implementation §6.9 forbids.
     */
    @Test
    fun `two concurrent launches create exactly one match`() {
        val (room, setupId) = preparedRoom()
        val host = room.hostUserId

        val barrier = CyclicBarrier(2)
        val pool = Executors.newFixedThreadPool(2)
        val task =
            Callable {
                barrier.await(10, TimeUnit.SECONDS)
                launcher().launch(setupId, host)
            }

        val results = pool.invokeAll(listOf(task, task)).map { it.get() }
        pool.shutdown()

        val launched = results.filterIsInstance<LaunchResult.Launched>()
        val refused = results.filterIsInstance<LaunchResult.Refused>()

        assertEquals(1, launched.size, "expected exactly one winner, got: $results")
        assertEquals(1, refused.size)
        // §6.9's own words: the loser must not get a second runtime.
        assertEquals(1, matchCount(), "a second match record was created")
        // The loser is a participant, not a stranger: they are told
        // the match started, not that nothing exists.
        assertEquals(LaunchError.AlreadyLaunched, refused.single().error)
    }

    /** And sequentially, which is the ordinary case. */
    @Test
    fun `launching twice is refused the second time`() {
        val (room, setupId) = preparedRoom()
        assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))

        val again = launcher().launch(setupId, room.hostUserId)
        assertEquals(LaunchError.AlreadyLaunched, assertIs<LaunchResult.Refused>(again).error)
        assertEquals(1, matchCount())
    }

    // --- P6-C ----------------------------------------------------------------

    /**
     * §6.12 — a share revoked between preparation and launch.
     *
     * The setup is NOT consumed: it stays claimable, so the host
     * can fix the problem and launch rather than having to prepare
     * from scratch.
     */
    @Test
    fun `a deck revoked after preparation stops the launch`() {
        val (room, setupId) = preparedRoom()
        val host = room.hostUserId
        val guest = userId("Pat")
        val deckId = room.members.first { it.userId == guest }.selectedDeckId!!

        DeckSharing(source(), DeckAuthorization(source())).revoke(deckId, host, guest)

        val result = launcher().launch(setupId, host)
        val refused = assertIs<LaunchResult.Refused>(result, "got: $result")
        assertIs<LaunchError.RevalidationFailed>(refused.error)
        assertEquals(0, matchCount(), "a match was created from an unusable setup")

        // §5.101 — the host learns WHICH seat, never why.
        assertTrue(refused.error.detail.contains("Pat"))
        assertTrue(
            !refused.error.detail.contains("revok", ignoreCase = true),
            "the host was told the reason: ${refused.error.detail}",
        )
    }

    /** §6.12 — a disabled account stops it too. */
    @Test
    fun `a disabled participant stops the launch`() {
        val (room, setupId) = preparedRoom()
        Accounts(source()).setStatus(userId("Pat"), AccountStatus.DISABLED)

        val result = launcher().launch(setupId, room.hostUserId)
        assertIs<LaunchError.RevalidationFailed>(assertIs<LaunchResult.Refused>(result).error)
        assertEquals(0, matchCount())
    }

    // --- §6.11 authority -------------------------------------------------------

    /** §6.11 — a participant who is not the host cannot start it. */
    @Test
    fun `a non-host cannot launch`() {
        val (_, setupId) = preparedRoom()

        val result = launcher().launch(setupId, userId("Pat"))
        assertEquals(LaunchError.HostRequired, assertIs<LaunchResult.Refused>(result).error)
        assertEquals(0, matchCount())
    }

    /** A setup id that was never issued tells you nothing. */
    @Test
    fun `an unknown setup is refused without saying more`() {
        val result = launcher().launch(UUID.randomUUID(), userId("RudeLeft"))
        assertEquals(LaunchError.SetupNotFound, assertIs<LaunchResult.Refused>(result).error)
    }

    /** §6.185, and the Phase 5 fix it depends on: a deck that was
     *  played with is still the owner's to delete. */
    @Test
    fun `a deck can be deleted after the match that used it`() {
        val (room, setupId) = preparedRoom()
        assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        val deckId = room.members.first().selectedDeckId!!

        // The room's own reference goes first; that is Phase 5's.
        source().connection.use { connection ->
            connection.prepareStatement(
                "UPDATE room_member SET ready = FALSE, selected_deck_id = NULL " +
                    "WHERE selected_deck_id = ?",
            ).use {
                it.setObject(1, deckId)
                it.executeUpdate()
            }
        }

        val deleted =
            runCatching {
                source().connection.use { connection ->
                    connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?")
                        .use {
                            it.setObject(1, deckId)
                            it.executeUpdate()
                        }
                }
            }
        assertTrue(
            deleted.isSuccess,
            "a played match held the deck: ${deleted.exceptionOrNull()?.message}",
        )

        // And the match still says what was played.
        source().connection.use { connection ->
            connection.prepareStatement(
                "SELECT deck_name_snapshot, deck_id FROM match_participant LIMIT 1",
            ).use {
                it.executeQuery().use { rows ->
                    rows.next()
                    assertEquals("Mono Red", rows.getString(1))
                    assertEquals(null, rows.getObject(2))
                }
            }
        }
    }
}
