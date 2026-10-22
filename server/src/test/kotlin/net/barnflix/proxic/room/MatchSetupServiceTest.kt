package net.barnflix.proxic.room

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.DeckAuthorization
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Preparing and cancelling a match — PHASE_05 §5.91–§5.117.
 *
 * The Forge half of the preflight is substituted here, and that is
 * the point rather than a shortcut: these tests are about the RULES
 * of preparation — who may, when, and what happens when the room
 * moves underneath it — and a real worker would add ~2.8 s and a
 * JVM to every one of them without testing a single rule harder.
 *
 * What covers the real preflight instead: MatchPreflightTest for
 * Proxic's half, and PHASE_02's CardResolver tests for Forge's
 * BUILD_DECK, which is the call this would be making.
 */
class MatchSetupServiceTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null

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
        database = Database.connect(config())!!.also { it.migrate() }

        val accounts = Accounts(database!!.dataSource())
        for (name in listOf("RudeLeft", "Pat", "Sam")) {
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
            dataRoot = "build/test-match-setup",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun rooms() = RoomService(database!!.dataSource(), DeckAuthorization(database!!.dataSource()))

    private fun userId(username: String) = Accounts(database!!.dataSource()).findByUsername(username)!!.userId

    /** Every deck passes, unless a test says otherwise. */
    private fun setups(
        preflight: DeckPreflight = DeckPreflight { DeckCheck(DeckVerdict.VALID, "") },
        presence: Presence = EveryoneOnline,
    ) = MatchSetupService(
        database!!.dataSource(),
        DeckAuthorization(database!!.dataSource()),
        preflight,
        presence,
    )

    /**
     * A room with two seated, decked, ready players.
     *
     * Decks are inserted directly: Phase 2's import needs a real
     * package and a Forge worker, and what this file needs is a
     * deck id the owner may use.
     */
    private fun readyRoom(): Room {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)

        for (user in listOf(host, guest)) {
            val deckId = insertDeck(user, "deck for $user")
            check(rooms.selectDeck(room.roomId, user, deckId) is RoomResult.Ok)
            check(rooms.setReady(room.roomId, user, true) is RoomResult.Ok) { "could not ready" }
        }
        return (rooms.find(room.roomId))!!
    }

    private fun insertDeck(
        ownerId: UUID,
        name: String,
    ): UUID {
        val deckId = UUID.randomUUID()
        database!!.dataSource().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256,
                     total_cards, distinct_cards, import_schema_version,
                     owner_user_id)
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

    // --- the happy path -------------------------------------------------

    /** §5.102–§5.105 — the snapshot, assembled from server records. */
    @Test
    fun `preparing a ready room freezes a snapshot`() {
        val room = readyRoom()
        val result = setups().prepare(room.roomId, room.hostUserId)

        val prepared = assertIs<PrepareResult.Prepared>(result, "got: $result")
        assertEquals("READY", prepared.setup.status)
        assertEquals(RoomStatus.READY_FOR_MATCH, prepared.room.status)
        assertEquals(2, prepared.setup.players.size)
        assertEquals(room.revision, prepared.setup.sourceRoomRevision)

        // §5.105, §5.106 — identity, seat, deck and the captured
        // display name, which is the field V006 was missing.
        val seats = prepared.setup.players.sortedBy { it.seatNumber }
        assertEquals(listOf(1, 2), seats.map { it.seatNumber })
        assertTrue(seats.all { it.deckId.isNotBlank() })
        assertEquals(
            setOf("RudeLeft", "Pat"),
            seats.map { it.displayName }.toSet(),
        )
    }

    /** §5.115 — preparing twice is one preparation, not two rows. */
    @Test
    fun `preparing twice returns the same setup`() {
        val room = readyRoom()
        val service = setups()

        val first = assertIs<PrepareResult.Prepared>(service.prepare(room.roomId, room.hostUserId))
        val second = assertIs<PrepareResult.Prepared>(service.prepare(room.roomId, room.hostUserId))

        assertEquals(first.setup.setupId, second.setup.setupId)
    }

    /** §5.117 — cancel returns the room and resets readiness. */
    @Test
    fun `cancelling returns the room to open and clears readiness`() {
        val room = readyRoom()
        val service = setups()
        assertIs<PrepareResult.Prepared>(service.prepare(room.roomId, room.hostUserId))

        val cancelled = service.cancel(room.roomId, room.hostUserId)
        val ok = assertIs<RoomResult.Ok>(cancelled)
        assertEquals(RoomStatus.OPEN, ok.room.status)
        assertTrue(ok.room.members.none { it.ready }, "readiness should reset")

        // Deck selections remain: §5.117 allows it, and re-picking
        // a deck you already picked is a cost with no benefit.
        assertTrue(ok.room.members.all { it.selectedDeckId != null })

        assertNull(service.readySetup(room.roomId), "the setup should be invalidated")
    }

    // --- host authority and preconditions --------------------------------

    /** §5.91 — host-only. */
    @Test
    fun `a member cannot prepare the match`() {
        val room = readyRoom()
        val guest = room.members.first { !it.isHost }.userId

        val result = setups().prepare(room.roomId, guest)
        val refused = assertIs<PrepareResult.Refused>(result)
        assertEquals(RoomError.HostRequired, refused.error)
        assertEquals(RoomStatus.OPEN, rooms().find(room.roomId)!!.status)
    }

    /** §5.92 — the exact required number of members. */
    @Test
    fun `a half empty room cannot be prepared`() {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val room = (rooms.create(host) as RoomResult.Ok).room

        val result = setups().prepare(room.roomId, host)
        val refused = assertIs<PrepareResult.Refused>(result)
        assertIs<RoomError.InvalidConfiguration>(refused.error)
    }

    /** §5.92 — all players ready. */
    @Test
    fun `an unready player blocks preparation and is named`() {
        val room = readyRoom()
        val guest = room.members.first { !it.isHost }.userId
        check(rooms().setReady(room.roomId, guest, false) is RoomResult.Ok)

        val result = setups().prepare(room.roomId, room.hostUserId)
        val notReady = assertIs<PrepareResult.NotReady>(result, "got: $result")
        assertEquals(listOf(guest), notReady.problems.map { it.userId })
        assertEquals("NOT_READY", notReady.problems.single().code)
    }

    /** §5.92 — present, not merely seated. */
    @Test
    fun `a disconnected player blocks preparation`() {
        val room = readyRoom()
        val guest = room.members.first { !it.isHost }.userId
        val offline = Presence { it != guest }

        val result = setups(presence = offline).prepare(room.roomId, room.hostUserId)
        val notReady = assertIs<PrepareResult.NotReady>(result, "got: $result")
        assertEquals("NOT_CONNECTED", notReady.problems.single().code)
    }

    /**
     * §5.98 — Forge rejects a deck.
     *
     * The room stays OPEN, no setup is written, and the readiness
     * that rested on the rejected deck is cleared. Leaving it set
     * would show a table that is ready and cannot start.
     */
    @Test
    fun `a deck Forge rejects clears that player's readiness`() {
        val room = readyRoom()
        val guest = room.members.first { !it.isHost }.userId
        val guestDeck = room.members.first { it.userId == guest }.selectedDeckId

        val picky =
            DeckPreflight { deckId ->
                if (deckId == guestDeck) {
                    DeckCheck(DeckVerdict.FORGE_RESOLUTION_ERROR, "Forge does not recognise X.")
                } else {
                    DeckCheck(DeckVerdict.VALID, "")
                }
            }

        val result = setups(picky).prepare(room.roomId, room.hostUserId)
        val notReady = assertIs<PrepareResult.NotReady>(result, "got: $result")
        assertEquals("FORGE_RESOLUTION_ERROR", notReady.problems.single().code)

        val after = rooms().find(room.roomId)!!
        assertEquals(RoomStatus.OPEN, after.status)
        assertNull(setups().readySetup(room.roomId))
        assertTrue(
            after.members.first { it.userId == guest }.ready.not(),
            "the rejected player's readiness should be cleared",
        )
        assertTrue(
            after.members.first { it.isHost }.ready,
            "and nobody else's",
        )
    }

    /**
     * §5.93 — the room moving during the slow preflight.
     *
     * This is the case the three-step design exists for: the Forge
     * check runs outside the row lock, so something CAN change
     * while it runs. Here the preflight itself removes a player,
     * standing in for whatever happens during those seconds.
     */
    @Test
    fun `a room that changes during the preflight is refused as stale`() {
        val room = readyRoom()
        val guest = room.members.first { !it.isHost }.userId

        val meddling =
            DeckPreflight {
                // Happens while the service holds no lock.
                rooms().remove(room.roomId, room.hostUserId, guest)
                DeckCheck(DeckVerdict.VALID, "")
            }

        val result = setups(meddling).prepare(room.roomId, room.hostUserId)
        val refused = assertIs<PrepareResult.Refused>(result, "got: $result")
        assertIs<RoomError.StaleRevision>(refused.error)
        assertNull(setups().readySetup(room.roomId), "nothing should have been written")
    }

    /** §5.136 — the host's own stale click, before any of this. */
    @Test
    fun `a stale revision is refused`() {
        val room = readyRoom()
        val result = setups().prepare(room.roomId, room.hostUserId, room.revision - 1)
        val refused = assertIs<PrepareResult.Refused>(result)
        assertIs<RoomError.StaleRevision>(refused.error)
    }

    /** §5.116 — ordinary mutation is blocked once prepared. */
    @Test
    fun `a prepared room refuses ordinary changes until cancelled`() {
        val room = readyRoom()
        val service = setups()
        assertIs<PrepareResult.Prepared>(service.prepare(room.roomId, room.hostUserId))

        val rooms = rooms()
        val host = room.hostUserId
        val deck = room.members.first { it.isHost }.selectedDeckId

        assertIs<RoomResult.Refused>(rooms.selectDeck(room.roomId, host, deck))
        assertIs<RoomResult.Refused>(rooms.setPlayerCount(room.roomId, host, 2))

        assertIs<RoomResult.Ok>(service.cancel(room.roomId, host))
        assertIs<RoomResult.Ok>(rooms.setPlayerCount(room.roomId, host, 2))
    }

    /**
     * §5.114 — a cancelled setup must not hold a deck hostage.
     *
     * `match_setup_player.deck_id` is ON DELETE RESTRICT, which is
     * right for a setup that could still launch and wrong for one
     * that never will. Before this was fixed, preparing a match
     * once and cancelling it made that deck undeletable FOREVER:
     * the owner's Deck Depot delete failed with a foreign-key
     * violation and nothing on screen could explain it.
     *
     * Found by the end-to-end test on its second run, when the
     * leftover deck made a re-import look like a duplicate.
     */
    @Test
    fun `a deck can be deleted after its match setup is cancelled`() {
        val room = readyRoom()
        val service = setups()
        assertIs<PrepareResult.Prepared>(service.prepare(room.roomId, room.hostUserId))
        assertIs<RoomResult.Ok>(service.cancel(room.roomId, room.hostUserId))

        val deckId = room.members.first { it.isHost }.selectedDeckId!!
        // Clear the selection first: room_member also references the
        // deck, with SET NULL, so this is not what is under test.
        check(rooms().selectDeck(room.roomId, room.hostUserId, null) is RoomResult.Ok)

        val deleted =
            runCatching {
                database!!.dataSource().connection.use { connection ->
                    connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?")
                        .use {
                            it.setObject(1, deckId)
                            it.executeUpdate()
                        }
                }
            }
        assertTrue(
            deleted.isSuccess,
            "a cancelled setup still held the deck: ${deleted.exceptionOrNull()?.message}",
        )
    }

    /** The same, for a room that was closed rather than cancelled. */
    @Test
    fun `a deck can be deleted after its room is closed`() {
        val room = readyRoom()
        assertIs<PrepareResult.Prepared>(setups().prepare(room.roomId, room.hostUserId))
        check(rooms().close(room.roomId, room.hostUserId) is RoomResult.Ok)

        val deckId = room.members.first { it.isHost }.selectedDeckId!!
        val deleted =
            runCatching {
                database!!.dataSource().connection.use { connection ->
                    connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?")
                        .use {
                            it.setObject(1, deckId)
                            it.executeUpdate()
                        }
                }
            }
        assertTrue(deleted.isSuccess, "a closed room still held the deck")
    }

    /** §5.79 — closing a room does not leave a launchable setup. */
    @Test
    fun `closing a prepared room invalidates its setup`() {
        val room = readyRoom()
        val service = setups()
        assertIs<PrepareResult.Prepared>(service.prepare(room.roomId, room.hostUserId))
        assertNotNull(service.readySetup(room.roomId))

        check(rooms().close(room.roomId, room.hostUserId) is RoomResult.Ok)

        assertNull(
            service.readySetup(room.roomId),
            "a closed room must not leave a setup Phase 6 could launch",
        )
    }
}
