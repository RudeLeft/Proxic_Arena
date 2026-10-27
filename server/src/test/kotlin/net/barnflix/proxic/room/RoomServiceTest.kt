package net.barnflix.proxic.room

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.DeckAuthorization
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.sql.Connection
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The room service — PHASE_05 §5.14–§5.27, §5.36, §5.40–§5.51.
 *
 * Four accounts, because a two-player room plus a host plus somebody
 * who should see none of it needs four. Phase 4 learned that with
 * three users and two of them involved, the "outsider" turns out to
 * be a participant.
 */
class RoomServiceTest {
    private var container: FreshDatabase? = null
    private lateinit var database: Database
    private lateinit var rooms: RoomService
    private lateinit var watch: RoomDeckWatch

    private lateinit var host: UUID
    private lateinit var guest: UUID
    private lateinit var stranger: UUID
    private lateinit var hostDeck: UUID
    private lateinit var guestDeck: UUID

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            TestPostgres.fresh()

        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-room-service",
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }

        val accounts = Accounts(database.dataSource())
        for (name in listOf("RudeLeft", "Pat", "Sam", "Casey")) {
            accounts.createUser(name, "a perfectly fine passphrase", Role.PLAYER)
        }
        host = accounts.findByUsername("RudeLeft")!!.userId
        guest = accounts.findByUsername("Pat")!!.userId
        stranger = accounts.findByUsername("Sam")!!.userId

        rooms = RoomService(database.dataSource(), DeckAuthorization(database.dataSource()))
        watch = RoomDeckWatch(database.dataSource(), DeckAuthorization(database.dataSource()))
        hostDeck = deck(host)
        guestDeck = deck(guest)
    }

    @AfterTest
    fun stop() {
        database.close()
        container!!.stop()
    }

    /** `(Connection) -> Unit`: JUnit silently SKIPS a @Test returning a value. */
    private fun withConnection(body: (Connection) -> Unit) {
        database.dataSource().connection.use(body)
    }

    private fun deck(owner: UUID): UUID {
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
                it.setObject(3, owner)
                it.executeUpdate()
            }
        }
        return deckId
    }

    private fun share(
        deckId: UUID,
        with: UUID,
        by: UUID,
    ) {
        withConnection { connection ->
            connection.prepareStatement(
                "INSERT INTO deck_share (share_id, deck_id, shared_with_user_id, created_by_user_id) " +
                    "VALUES (?, ?, ?, ?)",
            ).use {
                it.setObject(1, UUID.randomUUID())
                it.setObject(2, deckId)
                it.setObject(3, with)
                it.setObject(4, by)
                it.executeUpdate()
            }
        }
    }

    private fun ok(result: RoomResult): Room {
        assertTrue(result is RoomResult.Ok, "expected success, got $result")
        return (result as RoomResult.Ok).room
    }

    private fun refusal(result: RoomResult): RoomError {
        assertTrue(result is RoomResult.Refused, "expected a refusal, got $result")
        return (result as RoomResult.Refused).error
    }

    private fun roomWithBoth(): Room {
        val created = ok(rooms.create(host))
        ok(rooms.join(created.roomId, guest))
        return rooms.find(created.roomId)!!
    }

    // --- creating and joining ------------------------------------------

    /** §5.16 — the host is a player, seated on creation. */
    @Test
    fun `creating a room seats the host`() {
        val room = ok(rooms.create(host))
        assertEquals(1, room.members.size)
        assertEquals(host, room.members.single().userId)
        assertEquals(1, room.members.single().seatNumber)
        assertTrue(room.members.single().isHost)
        assertEquals(RoomStatus.OPEN, room.status)
    }

    /** §5.27 — the next free seat, without anybody choosing. */
    @Test
    fun `joining takes the next seat`() {
        val room = roomWithBoth()
        assertEquals(listOf(1, 2), room.members.map { it.seatNumber })
        assertEquals(listOf(host, guest), room.members.map { it.userId })
    }

    /** §5.5 — one room at a time, so leaving is a deliberate act. */
    @Test
    fun `a user cannot be in two rooms`() {
        val first = ok(rooms.create(host))
        assertEquals(RoomError.AlreadyInARoom, refusal(rooms.create(host)))

        val other = ok(rooms.create(guest))
        assertEquals(RoomError.AlreadyInARoom, refusal(rooms.join(other.roomId, host)))
        assertEquals(first.roomId, rooms.roomOf(host)!!.roomId)
    }

    /**
     * §5.5, §5.139 — a room whose match is being played is still the
     * players' room. Found on the live site's check (2026-10-20): a
     * page refreshed mid-game was told it had no room ("Host a game"),
     * and a player in a running match could host or join another one,
     * because IN_MATCH (Phase 6) was missing from "which room am I in".
     */
    @Test
    fun `a room in a match is still yours, and you cannot take another`() {
        val room = roomWithBoth()
        withConnection { connection ->
            connection.prepareStatement("UPDATE room SET status = 'IN_MATCH' WHERE room_id = ?").use {
                it.setObject(1, room.roomId)
                it.executeUpdate()
            }
        }
        assertEquals(room.roomId, rooms.roomOf(host)?.roomId, "the host's refresh lost the room")
        assertEquals(room.roomId, rooms.roomOf(guest)?.roomId, "the guest's refresh lost the room")
        assertEquals(RoomError.AlreadyInARoom, refusal(rooms.create(host)))
        val other = ok(rooms.create(stranger))
        assertEquals(RoomError.AlreadyInARoom, refusal(rooms.join(other.roomId, guest)))
    }

    /** §5.22 — a full room refuses rather than growing. */
    @Test
    fun `a full room is refused, not expanded`() {
        val room = roomWithBoth()
        assertEquals(RoomError.Full, refusal(rooms.join(room.roomId, stranger)))
        assertEquals(2, rooms.find(room.roomId)!!.members.size)
    }

    /**
     * The reason every mutation runs inside one locked transaction.
     *
     * Two users racing for the last seat: exactly one gets it, and
     * the other is told the room is full. A check-then-insert would
     * seat both and leave a three-person two-player room.
     */
    @Test
    fun `two users racing for the last seat produce one member`() {
        val room = ok(rooms.create(host))
        val casey = Accounts(database.dataSource()).findByUsername("Casey")!!.userId

        val pool = Executors.newFixedThreadPool(2)
        val results =
            listOf(guest, casey).map { user ->
                pool.submit<RoomResult> { rooms.join(room.roomId, user) }
            }.map { it.get(30, TimeUnit.SECONDS) }
        pool.shutdown()

        assertEquals(1, results.count { it is RoomResult.Ok }, "exactly one join should win")
        assertEquals(1, results.count { it is RoomResult.Refused })
        assertEquals(2, rooms.find(room.roomId)!!.members.size)
    }

    // --- leaving, removing, closing -------------------------------------

    /** §5.18 — the host leaving closes the room; no transfer. */
    @Test
    fun `the host leaving closes the room and empties it`() {
        val room = roomWithBoth()
        ok(rooms.leave(room.roomId, host))

        val after = rooms.find(room.roomId)!!
        assertEquals(RoomStatus.CLOSED, after.status)
        assertTrue(after.members.isEmpty())
        // ...and both are free to be elsewhere.
        assertEquals(null, rooms.roomOf(host))
        assertEquals(null, rooms.roomOf(guest))
    }

    @Test
    fun `a guest leaving frees their seat and leaves the room open`() {
        val room = roomWithBoth()
        ok(rooms.leave(room.roomId, guest))

        val after = rooms.find(room.roomId)!!
        assertEquals(RoomStatus.OPEN, after.status)
        assertEquals(listOf(host), after.members.map { it.userId })

        // The freed seat is reusable.
        ok(rooms.join(room.roomId, stranger))
        assertEquals(2, rooms.find(room.roomId)!!.members.size)
    }

    /** §5.17 — only the host removes people. */
    @Test
    fun `only the host may remove a member`() {
        val room = roomWithBoth()
        assertEquals(RoomError.HostRequired, refusal(rooms.remove(room.roomId, guest, host)))
        assertEquals(2, rooms.find(room.roomId)!!.members.size)

        ok(rooms.remove(room.roomId, host, guest))
        assertEquals(listOf(host), rooms.find(room.roomId)!!.members.map { it.userId })
    }

    /** Closing through a door marked "kick" would be a nasty surprise. */
    @Test
    fun `the host cannot remove themselves`() {
        val room = roomWithBoth()
        val error = refusal(rooms.remove(room.roomId, host, host))
        assertTrue(error is RoomError.InvalidConfiguration, error.toString())
        assertEquals(RoomStatus.OPEN, rooms.find(room.roomId)!!.status)
    }

    /** §4.65's lesson: a stranger learns nothing about a room. */
    @Test
    fun `a stranger acting on a room is told it does not exist`() {
        val room = roomWithBoth()
        assertEquals(RoomError.NotFound, refusal(rooms.leave(room.roomId, stranger)))
        assertEquals(RoomError.NotFound, refusal(rooms.selectDeck(room.roomId, stranger, hostDeck)))
        assertEquals(RoomError.NotFound, refusal(rooms.setReady(room.roomId, stranger, true)))
        // Not HostRequired for configuration, either: that would
        // confirm the room exists.
        assertEquals(RoomError.HostRequired, refusal(rooms.setPlayerCount(room.roomId, stranger, 2)))
    }

    // --- decks and readiness ---------------------------------------------

    /** §5.42, §5.43 — you may only pick a deck you may use. */
    @Test
    fun `a member cannot select somebody else's private deck`() {
        val room = roomWithBoth()
        assertEquals(RoomError.DeckNotUsable, refusal(rooms.selectDeck(room.roomId, guest, hostDeck)))

        // ...and a shared one is fine.
        share(hostDeck, with = guest, by = host)
        val after = ok(rooms.selectDeck(room.roomId, guest, hostDeck))
        assertEquals(hostDeck, after.member(guest)!!.selectedDeckId)
    }

    /** §5.41 — ready needs a deck. */
    @Test
    fun `a member cannot ready up without a deck`() {
        val room = roomWithBoth()
        assertEquals(RoomError.DeckRequired, refusal(rooms.setReady(room.roomId, host, true)))

        ok(rooms.selectDeck(room.roomId, host, hostDeck))
        assertTrue(ok(rooms.setReady(room.roomId, host, true)).member(host)!!.ready)
    }

    /** Changing your deck un-readies you: the others agreed to the old one. */
    @Test
    fun `changing deck clears readiness`() {
        val room = roomWithBoth()
        ok(rooms.selectDeck(room.roomId, host, hostDeck))
        ok(rooms.setReady(room.roomId, host, true))

        val second = deck(host)
        val after = ok(rooms.selectDeck(room.roomId, host, second))
        assertFalse(after.member(host)!!.ready)
    }

    /** §5.36 — a configuration change resets everyone's readiness. */
    @Test
    fun `a configuration change clears readiness for everyone`() {
        val room = roomWithBoth()
        ok(rooms.selectDeck(room.roomId, host, hostDeck))
        ok(rooms.setReady(room.roomId, host, true))
        ok(rooms.selectDeck(room.roomId, guest, guestDeck))
        ok(rooms.setReady(room.roomId, guest, true))
        assertTrue(rooms.find(room.roomId)!!.everyoneReady())

        val after = ok(rooms.setPlayerCount(room.roomId, host, 2))
        assertTrue(after.members.none { it.ready }, "readiness survived a configuration change")
    }

    /**
     * §5.50, §5.51 — the case that makes `canUseDeck` matter.
     *
     * A guest readies up with a shared deck; the owner revokes the
     * share; the guest is no longer ready and no longer holds the
     * deck. Checked through the watcher, which is what an external
     * revocation would call.
     */
    @Test
    fun `revoking a shared deck clears the borrower's selection and readiness`() {
        val room = roomWithBoth()
        share(hostDeck, with = guest, by = host)
        ok(rooms.selectDeck(room.roomId, guest, hostDeck))
        ok(rooms.setReady(room.roomId, guest, true))
        assertTrue(rooms.find(room.roomId)!!.member(guest)!!.ready)

        withConnection { connection ->
            connection.prepareStatement(
                "DELETE FROM deck_share WHERE deck_id = ? AND shared_with_user_id = ?",
            ).use {
                it.setObject(1, hostDeck)
                it.setObject(2, guest)
                it.executeUpdate()
            }
        }

        val after = watch.revalidate(room.roomId)!!
        assertEquals(null, after.member(guest)!!.selectedDeckId)
        assertFalse(after.member(guest)!!.ready)
        // The member is still seated: §5.50 invalidates a choice,
        // not a person.
        assertEquals(2, after.members.size)
    }

    /** The negative control: a valid room is left alone. */
    @Test
    fun `revalidation changes nothing when every deck is still usable`() {
        val room = roomWithBoth()
        ok(rooms.selectDeck(room.roomId, host, hostDeck))
        ok(rooms.setReady(room.roomId, host, true))

        assertEquals(null, watch.revalidate(room.roomId), "a valid room should not be touched")
        assertTrue(rooms.find(room.roomId)!!.member(host)!!.ready)
    }

    /** Readying re-checks access rather than trusting the selection. */
    @Test
    fun `readying re-checks deck access at that moment`() {
        val room = roomWithBoth()
        share(hostDeck, with = guest, by = host)
        ok(rooms.selectDeck(room.roomId, guest, hostDeck))

        withConnection { connection ->
            connection.prepareStatement("DELETE FROM deck_share WHERE deck_id = ?").use {
                it.setObject(1, hostDeck)
                it.executeUpdate()
            }
        }

        assertEquals(RoomError.DeckNotUsable, refusal(rooms.setReady(room.roomId, guest, true)))
        // And the stale selection is gone rather than lingering.
        assertEquals(null, rooms.find(room.roomId)!!.member(guest)!!.selectedDeckId)
    }

    // --- revision ----------------------------------------------------------

    /** Every mutation moves the revision; reads do not. */
    @Test
    fun `the revision advances on change and stands still otherwise`() {
        val room = ok(rooms.create(host))
        val atCreation = room.revision

        val joined = ok(rooms.join(room.roomId, guest))
        assertTrue(joined.revision > atCreation, "joining should advance the revision")

        val read = rooms.find(room.roomId)!!
        assertEquals(joined.revision, read.revision, "reading must not advance it")

        val chosen = ok(rooms.selectDeck(room.roomId, host, hostDeck))
        assertTrue(chosen.revision > joined.revision)
    }

    /** §5.x — everyone ready, every seat filled. */
    @Test
    fun `a room is only ready when every seat is filled and ready`() {
        val created = ok(rooms.create(host))
        ok(rooms.selectDeck(created.roomId, host, hostDeck))
        ok(rooms.setReady(created.roomId, host, true))
        // One ready player in a two-seat room is a lobby waiting.
        assertFalse(rooms.find(created.roomId)!!.everyoneReady())

        ok(rooms.join(created.roomId, guest))
        ok(rooms.selectDeck(created.roomId, guest, guestDeck))
        ok(rooms.setReady(created.roomId, guest, true))
        assertTrue(rooms.find(created.roomId)!!.everyoneReady())
    }
}
