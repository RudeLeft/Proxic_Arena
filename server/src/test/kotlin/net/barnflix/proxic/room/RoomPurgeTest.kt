package net.barnflix.proxic.room

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.deck.DeckSharing
import net.barnflix.proxic.lobby.StandingsSource
import net.barnflix.proxic.match.GameOutcome
import net.barnflix.proxic.match.LaunchResult
import net.barnflix.proxic.match.MatchLauncher
import net.barnflix.proxic.match.MatchRecords
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * §5.126 — finished rooms go after seven days, games and all (owner
 * 2026-11-04, V037): a room that played a game was kept forever, because
 * its match held RESTRICT references to the room and its setup.
 */
class RoomPurgeTest {
    private var container: FreshDatabase? = null
    private var database: Database? = null

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-room-purge",
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }
        val accounts = Accounts(source())
        for (name in listOf("RudeLeft", "Pat")) accounts.createUser(name, "a perfectly fine passphrase", Role.PLAYER)
    }

    @AfterTest
    fun stop() {
        database?.close()
        container?.stop()
    }

    private fun source() = database!!.dataSource()

    private fun userId(name: String) = Accounts(source()).findByUsername(name)!!.userId

    @Test
    fun `a finished room that played a game is purged, and the game is kept`() {
        val (roomId, matchId) = playedRoom(ended = true)
        close(roomId, daysAgo = 8)

        assertEquals(1, RoomExpiry(source()).purgeFinished(Duration.ofDays(7)))

        assertEquals(0, count("SELECT count(*) FROM room WHERE room_id = '$roomId'"), "the room was kept")
        assertEquals(0, count("SELECT count(*) FROM match_setup WHERE room_id = '$roomId'"))
        assertEquals(1, count("SELECT count(*) FROM match WHERE match_id = '$matchId' AND room_id = '$roomId'"))
        assertEquals(2, count("SELECT count(*) FROM match_participant WHERE match_id = '$matchId'"))
        val records = StandingsSource(source()).records().associateBy { it.userId }
        assertEquals(1, records.getValue(userId("Pat")).wins, "the winner lost their win")
        assertEquals(1, records.getValue(userId("RudeLeft")).games)
    }

    @Test
    fun `a room whose game is still running is never purged`() {
        val (roomId, _) = playedRoom(ended = false)
        close(roomId, daysAgo = 8)

        assertEquals(0, RoomExpiry(source()).purgeFinished(Duration.ofDays(7)))
        assertEquals(1, count("SELECT count(*) FROM room WHERE room_id = '$roomId'"))
    }

    /** A room through the real path: prepared, launched, and (if [ended]) won by Pat. */
    private fun playedRoom(ended: Boolean): Pair<UUID, UUID> {
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val deckId = UUID.randomUUID()
        source().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256,
                     total_cards, distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, 'Mono Red', 'test.zip', ?, 60, 15, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, deckId.toString().replace("-", "").repeat(2).take(64))
                it.setObject(3, host)
                it.executeUpdate()
            }
        }
        DeckSharing(source(), DeckAuthorization(source())).share(deckId, host, "Pat")
        val rooms = RoomService(source(), DeckAuthorization(source()))
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)
        for (user in listOf(host, guest)) {
            check(rooms.selectDeck(room.roomId, user, deckId) is RoomResult.Ok)
            check(rooms.setReady(room.roomId, user, true) is RoomResult.Ok)
        }
        val setups = MatchSetupService(source(), DeckAuthorization(source()), { DeckCheck(DeckVerdict.VALID, "") })
        val prepared = assertIs<PrepareResult.Prepared>(setups.prepare(room.roomId, host))
        val launched =
            assertIs<LaunchResult.Launched>(
                MatchLauncher(source(), DeckAuthorization(source()))
                    .launch(UUID.fromString(prepared.setup.setupId), host),
            )
        val records = MatchRecords(source())
        records.recordRunning(launched.match.matchId, Instant.now())
        if (ended) {
            val outcome = GameOutcome(GameOutcome.WINNER, winningSeat = 2, turn = 9)
            records.recordEnded(launched.match.matchId, outcome, Instant.now())
            records.releaseRoom(room.roomId)
        }
        return room.roomId to launched.match.matchId
    }

    /** Closed (as RoomStore.close leaves it), [daysAgo] days back. */
    private fun close(
        roomId: UUID,
        daysAgo: Int,
    ) {
        source().connection.use { connection ->
            connection.prepareStatement("DELETE FROM room_member WHERE room_id = ?").use {
                it.setObject(1, roomId)
                it.executeUpdate()
            }
            connection.prepareStatement(
                "UPDATE room SET status = 'CLOSED', last_activity_at = now() - ?::interval WHERE room_id = ?",
            ).use {
                it.setString(1, "$daysAgo days")
                it.setObject(2, roomId)
                it.executeUpdate()
            }
        }
    }

    private fun count(sql: String): Int =
        source().connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery(sql).use { rows ->
                    rows.next()
                    rows.getInt(1)
                }
            }
        }
}
