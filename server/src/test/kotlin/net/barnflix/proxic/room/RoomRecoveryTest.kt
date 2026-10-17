package net.barnflix.proxic.room

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.deck.DeckSharing
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.slf4j.LoggerFactory
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * What happens to a room when something outside it changes —
 * PHASE_05 §5.50, §5.51, §5.77, §5.120, §5.122, §5.198, §5.213.
 *
 * Every test here exists because the §5.228 checklist audit found
 * the rule unenforced rather than wrong. The code for §5.51 was
 * written and tested and called by NOTHING; the restart rules were
 * not written at all; and deleting a deck somebody was ready with
 * failed outright on a constraint.
 */
class RoomRecoveryTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private val log = LoggerFactory.getLogger(RoomRecoveryTest::class.java)
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

        val accounts = Accounts(database!!.dataSource())
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
            dataRoot = "build/test-room-recovery",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun source() = database!!.dataSource()

    private fun rooms() = RoomService(source(), DeckAuthorization(source()))

    private fun watch() = RoomDeckWatch(source(), DeckAuthorization(source()))

    private fun userId(username: String) = Accounts(source()).findByUsername(username)!!.userId

    private fun insertDeck(ownerId: UUID): UUID {
        val deckId = UUID.randomUUID()
        source().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256,
                     total_cards, distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, 'A deck', 'test.zip', ?, 60, 15, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, deckId.toString().replace("-", "").repeat(2).take(64))
                it.setObject(3, ownerId)
                it.executeUpdate()
            }
        }
        return deckId
    }

    /**
     * A room where both players are seated, decked and ready.
     *
     * Both on the SAME deck, which means sharing it: §5.41 makes
     * the selectable library owned plus shared, and a deck the
     * guest cannot use is one `selectDeck` refuses. Sharing here is
     * also what makes the revocation test's subject reachable.
     */
    private fun readyRoom(deckId: UUID): Room {
        val rooms = rooms()
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val sharing = DeckSharing(source(), DeckAuthorization(source()))
        sharing.share(deckId, host, "Pat")
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)
        for (user in listOf(host, guest)) {
            check(rooms.selectDeck(room.roomId, user, deckId) is RoomResult.Ok)
            check(rooms.setReady(room.roomId, user, true) is RoomResult.Ok)
        }
        return rooms.find(room.roomId)!!
    }

    // --- §5.77, §5.51: a deck is deleted -----------------------------------

    /**
     * The constraint collision the audit found.
     *
     * `selected_deck_id` is ON DELETE SET NULL and
     * `room_member_ready_needs_deck` forbids ready-with-no-deck, so
     * deleting a deck a READY member had selected made the foreign
     * key write a row the CHECK rejected — and the DELETE failed.
     * An owner could not remove their own deck while anybody was
     * ready with it, and the Deck Depot answered 500.
     */
    @Test
    fun `a deck can be deleted while somebody is ready with it`() {
        val deckId = insertDeck(userId("RudeLeft"))
        readyRoom(deckId)

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
        assertTrue(deleted.isSuccess, "the delete failed: ${deleted.exceptionOrNull()?.message}")
    }

    /** §5.50 — and the room is left in a state it can act on. */
    @Test
    fun `releasing a deck clears the selection and the readiness`() {
        val deckId = insertDeck(userId("RudeLeft"))
        val room = readyRoom(deckId)

        val changed = watch().releaseDeck(deckId)

        assertEquals(1, changed.size, "the room should have been reported as changed")
        val after = changed.single()
        assertTrue(after.members.none { it.ready }, "readiness should be gone")
        assertTrue(after.members.none { it.selectedDeckId != null }, "selections should be gone")
        assertTrue(after.revision > room.revision, "the revision should move so clients refresh")
    }

    /** Nothing to do is not an event: an untouched room is silent. */
    @Test
    fun `releasing a deck nobody selected changes nothing`() {
        val selected = insertDeck(userId("RudeLeft"))
        readyRoom(selected)
        val other = insertDeck(userId("RudeLeft"))

        assertTrue(watch().releaseDeck(other).isEmpty())
    }

    // --- §5.51: a share is revoked -----------------------------------------

    /**
     * §5.51 — "a share revoked a second ago is already false".
     *
     * Phase 4 made `canUseDeck` compute that on the asking, which
     * covers every future question and not the player who is
     * already sitting in a lobby, ready, with that deck.
     */
    @Test
    fun `revoking a share clears the recipient's selection and readiness`() {
        val owner = userId("RudeLeft")
        val recipient = userId("Pat")
        val deckId = insertDeck(owner)

        // readyRoom shares it, which is what lets Pat select it.
        val room = readyRoom(deckId)
        check(room.members.all { it.ready })

        DeckSharing(source(), DeckAuthorization(source())).revoke(deckId, owner, recipient)

        val changed = watch().revalidateUser(recipient)
        assertTrue(changed != null, "the room should have been reported as changed")

        val them = changed!!.members.first { it.userId == recipient }
        assertNull(them.selectedDeckId, "the revoked deck should be deselected")
        assertTrue(!them.ready, "and the readiness should be gone")

        // The OWNER keeps theirs: a revocation is about one person.
        val host = changed.members.first { it.userId == owner }
        assertEquals(deckId, host.selectedDeckId)
        assertTrue(host.ready)
    }

    // --- §5.120, §5.198, §5.213: a restart ----------------------------------

    /**
     * §5.198 — readiness is reset conservatively.
     *
     * "Ready" is a claim about a person who is watching, and after
     * a restart nobody is: every socket died with the old process.
     * A table showing itself ready, in front of two people who have
     * gone to bed, is the state this prevents.
     */
    @Test
    fun `a restart clears readiness but keeps the room and the decks`() {
        val deckId = insertDeck(userId("RudeLeft"))
        val room = readyRoom(deckId)

        RoomRecovery(source(), log).recover()

        val after = rooms().find(room.roomId)!!
        assertEquals(RoomStatus.OPEN, after.status)
        assertEquals(2, after.members.size, "§5.120 — members remain")
        assertTrue(after.members.none { it.ready }, "§5.198 — readiness is reset")
        // §5.120 lists deck selections among what remains, and
        // re-picking a deck you already picked buys nothing.
        assertTrue(after.members.all { it.selectedDeckId == deckId })
    }

    /** §5.122, §5.213 — never "probably still fine". */
    @Test
    fun `a restart invalidates a prepared setup and reopens the room`() {
        val deckId = insertDeck(userId("RudeLeft"))
        val room = readyRoom(deckId)
        val setups =
            MatchSetupService(
                source(),
                DeckAuthorization(source()),
                { DeckCheck(DeckVerdict.VALID, "") },
            )
        assertIs<PrepareResult.Prepared>(setups.prepare(room.roomId, room.hostUserId))

        RoomRecovery(source(), log).recover()

        assertNull(setups.readySetup(room.roomId), "the setup must not survive a restart")
        assertEquals(RoomStatus.OPEN, rooms().find(room.roomId)!!.status)
    }

    /** §5.124, owner D4 — a restart is not activity in a room. */
    @Test
    fun `a restart does not extend a room's life`() {
        val deckId = insertDeck(userId("RudeLeft"))
        val room = readyRoom(deckId)
        source().connection.use { connection ->
            connection.prepareStatement(
                "UPDATE room SET last_activity_at = now() - interval '30 hours' WHERE room_id = ?",
            ).use {
                it.setObject(1, room.roomId)
                it.executeUpdate()
            }
        }

        RoomRecovery(source(), log).recover()

        // Still abandoned: a server bounced every night must not
        // keep dead rooms alive forever.
        val expired =
            RoomMaintenance(source(), SilentAnnouncer, log, java.time.Duration.ofHours(24))
                .sweep()
        assertEquals(1, expired)
    }

    /** Recovery runs on every boot, including boring ones. */
    @Test
    fun `recovery on a clean database does nothing and does not throw`() {
        RoomRecovery(source(), log).recover()
        RoomRecovery(source(), log).recover()
    }
}
