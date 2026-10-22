package net.barnflix.proxic.room

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The V006 room schema — PHASE_05 §5.128–§5.131.
 *
 * These assert the rules the DATABASE enforces, not the ones the
 * service will. The distinction matters: a rule in code is a rule
 * every future caller must remember, and Phase 4 has already shown
 * what happens when two requests race a check-then-insert.
 *
 * Each test here is a thing that should be impossible to represent,
 * not merely impossible to do through the API.
 */
class RoomSchemaTest {
    private var container: PostgreSQLContainer<*>? = null
    private lateinit var database: Database
    private lateinit var host: UUID
    private lateinit var guest: UUID
    private lateinit var deck: UUID

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            PostgreSQLContainer("postgres:16.15-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }

        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-rooms",
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }

        val accounts = Accounts(database.dataSource())
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
        accounts.createUser("Pat", "a perfectly fine passphrase", Role.PLAYER)
        host = accounts.findByUsername("RudeLeft")!!.userId
        guest = accounts.findByUsername("Pat")!!.userId
        deck = insertDeck()
    }

    @AfterTest
    fun stop() {
        database.close()
        container!!.stop()
    }

    /** `(Connection) -> Unit`: JUnit silently SKIPS a @Test that returns a value. */
    private fun withConnection(body: (Connection) -> Unit) {
        database.dataSource().connection.use(body)
    }

    private fun insertDeck(): UUID {
        val deckId = UUID.randomUUID()
        withConnection { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256, total_cards,
                     distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, 'Deck', 'Deck.zip', ?, 65, 11, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, "%064x".format(java.math.BigInteger(200, java.util.Random())))
                it.setObject(3, host)
                it.executeUpdate()
            }
        }
        return deckId
    }

    private fun room(
        status: String = "OPEN",
        players: Int = 2,
    ): UUID {
        val roomId = UUID.randomUUID()
        withConnection { connection ->
            connection.prepareStatement(
                """
                INSERT INTO room (room_id, host_user_id, preset_id, desired_player_count, status)
                VALUES (?, ?, 'OPEN_FORMAT_1V1', ?, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, roomId)
                it.setObject(2, host)
                it.setInt(3, players)
                it.setString(4, status)
                it.executeUpdate()
            }
        }
        return roomId
    }

    private fun seat(
        roomId: UUID,
        userId: UUID,
        seatNumber: Int,
        deckId: UUID? = null,
        ready: Boolean = false,
    ) {
        withConnection { connection ->
            connection.prepareStatement(
                "INSERT INTO room_member (room_id, user_id, seat_number, selected_deck_id, ready) " +
                    "VALUES (?, ?, ?, ?, ?)",
            ).use {
                it.setObject(1, roomId)
                it.setObject(2, userId)
                it.setInt(3, seatNumber)
                it.setObject(4, deckId)
                it.setBoolean(5, ready)
                it.executeUpdate()
            }
        }
    }

    private fun count(sql: String): Int {
        var n = -1
        withConnection { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery(sql).use { rows ->
                    rows.next()
                    n = rows.getInt(1)
                }
            }
        }
        return n
    }

    // --- the lifecycle ----------------------------------------------

    /** §5.86 — a status nobody decided on cannot be written. */
    @Test
    fun `a room status outside the lifecycle is refused`() {
        assertTrue(runCatching { room(status = "PLAYING") }.isFailure)
        for (valid in listOf("OPEN", "READY_FOR_MATCH", "CLOSED", "EXPIRED")) {
            room(status = valid)
        }
        assertEquals(4, count("SELECT count(*) FROM room"))
    }

    /** PHASE 5 AMENDMENT 1 — there is no code to store. */
    @Test
    fun `the room table has no join code`() {
        assertEquals(
            0,
            count(
                "SELECT count(*) FROM information_schema.columns " +
                    "WHERE table_name = 'room' AND column_name LIKE '%code%'",
            ),
        )
    }

    // --- membership --------------------------------------------------

    /**
     * §5.5, §5.6 — one membership per user per room, and several
     * browser sessions are one player.
     *
     * Enforced by the primary key because two tabs racing would both
     * pass a check-then-insert, which is how Phase 4's duplicate
     * share nearly happened.
     */
    @Test
    fun `a user cannot hold two seats in one room`() {
        val roomId = room()
        seat(roomId, host, 1)
        assertTrue(runCatching { seat(roomId, host, 2) }.isFailure)
    }

    /** Two people cannot occupy one seat. */
    @Test
    fun `a seat cannot be taken twice`() {
        val roomId = room()
        seat(roomId, host, 1)
        assertTrue(runCatching { seat(roomId, guest, 1) }.isFailure)
        seat(roomId, guest, 2)
        assertEquals(2, count("SELECT count(*) FROM room_member"))
    }

    /**
     * §5.41, §5.42 — ready without a deck is not a state that should
     * exist. The service will also refuse it, with an explanation;
     * this makes it unrepresentable rather than merely unlikely.
     */
    @Test
    fun `a member cannot be ready without a deck`() {
        val roomId = room()
        assertTrue(runCatching { seat(roomId, host, 1, deckId = null, ready = true) }.isFailure)

        seat(roomId, host, 1, deckId = deck, ready = true)
        assertEquals(1, count("SELECT count(*) FROM room_member WHERE ready"))
    }

    /**
     * §5.50, §5.51 — a deleted deck empties the seat; it does not
     * remove the player.
     *
     * The alternative (CASCADE) would mean deleting your own deck
     * silently ejects you from a room you are standing in.
     */
    @Test
    fun `deleting a selected deck clears the selection but keeps the member`() {
        val roomId = room()
        seat(roomId, host, 1, deckId = deck, ready = false)

        withConnection { connection ->
            connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?").use {
                it.setObject(1, deck)
                it.executeUpdate()
            }
        }

        assertEquals(1, count("SELECT count(*) FROM room_member"))
        assertEquals(
            1,
            count("SELECT count(*) FROM room_member WHERE selected_deck_id IS NULL"),
        )
    }

    /** Closing a room takes its members with it, not the users. */
    @Test
    fun `deleting a room removes its members and leaves the accounts`() {
        val roomId = room()
        seat(roomId, host, 1)
        seat(roomId, guest, 2)

        withConnection { connection ->
            connection.prepareStatement("DELETE FROM room WHERE room_id = ?").use {
                it.setObject(1, roomId)
                it.executeUpdate()
            }
        }

        assertEquals(0, count("SELECT count(*) FROM room_member"))
        assertEquals(2, count("SELECT count(*) FROM app_user"))
    }

    // --- match setups -------------------------------------------------

    private fun setup(
        roomId: UUID,
        status: String,
        revision: Long = 1,
    ): UUID {
        val setupId = UUID.randomUUID()
        withConnection { connection ->
            connection.prepareStatement(
                "INSERT INTO match_setup (setup_id, room_id, source_room_revision, preset_id, status) " +
                    "VALUES (?, ?, ?, 'OPEN_FORMAT_1V1', ?)",
            ).use {
                it.setObject(1, setupId)
                it.setObject(2, roomId)
                it.setLong(3, revision)
                it.setString(4, status)
                it.executeUpdate()
            }
        }
        return setupId
    }

    /**
     * One live setup per room.
     *
     * Two READY setups is a race with two winners, and the second
     * launch would start a match from a snapshot nobody is looking
     * at.
     */
    @Test
    fun `a room cannot hold two ready setups, but may hold old ones`() {
        val roomId = room()
        setup(roomId, "READY")
        assertTrue(runCatching { setup(roomId, "READY") }.isFailure)

        // The partial index only guards READY: history is fine.
        setup(roomId, "CONSUMED")
        setup(roomId, "INVALIDATED")
        assertEquals(3, count("SELECT count(*) FROM match_setup"))
    }

    /** §5.122 — a setup status outside the three is not writable. */
    @Test
    fun `a setup status outside the lifecycle is refused`() {
        val roomId = room()
        assertTrue(runCatching { setup(roomId, "PENDING") }.isFailure)
    }

    /**
     * A snapshot with a missing deck is not a launchable match, so
     * the deck reference RESTRICTS rather than nulls. The service
     * invalidates the setup first; this is what catches it when the
     * service forgets.
     */
    @Test
    fun `a deck cannot be deleted out from under a prepared setup`() {
        val roomId = room()
        val setupId = setup(roomId, "READY")
        withConnection { connection ->
            connection.prepareStatement(
                // display_name since V007 (§5.105, §5.106): the
                // snapshot keeps the name the match was prepared
                // with rather than joining the live account.
                "INSERT INTO match_setup_player " +
                    "(setup_id, user_id, seat_number, deck_id, display_name) " +
                    "VALUES (?, ?, 1, ?, 'RudeLeft')",
            ).use {
                it.setObject(1, setupId)
                it.setObject(2, host)
                it.setObject(3, deck)
                it.executeUpdate()
            }
        }

        val refused =
            runCatching {
                withConnection { connection ->
                    connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?").use {
                        it.setObject(1, deck)
                        it.executeUpdate()
                    }
                }
            }.isFailure
        assertTrue(refused, "a prepared setup lost its deck")
    }
}
