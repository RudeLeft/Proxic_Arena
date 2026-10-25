package net.barnflix.proxic.lobby

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.AccountStatus
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.deck.DeckSharing
import net.barnflix.proxic.match.GameOutcome
import net.barnflix.proxic.match.LaunchResult
import net.barnflix.proxic.match.MatchLauncher
import net.barnflix.proxic.match.MatchRecords
import net.barnflix.proxic.room.DeckCheck
import net.barnflix.proxic.room.DeckPreflight
import net.barnflix.proxic.room.DeckVerdict
import net.barnflix.proxic.room.MatchSetupService
import net.barnflix.proxic.room.PrepareResult
import net.barnflix.proxic.room.RoomResult
import net.barnflix.proxic.room.RoomService
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Instant
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * Spec 0011, F-0011-A — wins are Forge's results, and only finished
 * games count.
 *
 * Real games through the real launch path, in one room: Pat wins twice,
 * RudeLeft once when Pat concedes, one draw, and one the worker crashed
 * in. The draw is a game for both and a win for neither; the crash is
 * nothing at all.
 */
class StandingsSourceTest {
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
        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-standings",
                    secureCookies = false,
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }
        val accounts = Accounts(source())
        for (name in listOf("RudeLeft", "Pat")) {
            accounts.createUser(name, "a perfectly fine passphrase", Role.PLAYER)
        }
    }

    @AfterTest
    fun stop() {
        database?.close()
        container!!.stop()
    }

    private fun source() = database!!.dataSource()

    private fun userId(username: String) = Accounts(source()).findByUsername(username)!!.userId

    private fun setups(): MatchSetupService {
        val anyDeckIsLegal = DeckPreflight { DeckCheck(DeckVerdict.VALID, "") }
        return MatchSetupService(source(), DeckAuthorization(source()), anyDeckIsLegal)
    }

    private fun insertDeck(ownerId: UUID): UUID {
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
                it.setObject(3, ownerId)
                it.executeUpdate()
            }
        }
        return deckId
    }

    /** A room with both players seated on a shared deck. */
    private class Table(val rooms: RoomService, val roomId: UUID, val host: UUID, val guest: UUID)

    private fun table(): Table {
        val rooms = RoomService(source(), DeckAuthorization(source()))
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val deckId = insertDeck(host)
        DeckSharing(source(), DeckAuthorization(source())).share(deckId, host, "Pat")
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)
        for (user in listOf(host, guest)) check(rooms.selectDeck(room.roomId, user, deckId) is RoomResult.Ok)
        return Table(rooms, room.roomId, host, guest)
    }

    /** One game, prepared and launched as the app does, ended with [outcome] (by seat). */
    private fun Table.play(outcome: (patSeat: Int, hostSeat: Int) -> GameOutcome) {
        for (user in listOf(host, guest)) check(rooms.setReady(roomId, user, true) is RoomResult.Ok)
        val prepared = assertIs<PrepareResult.Prepared>(setups().prepare(roomId, host))
        val launcher = MatchLauncher(source(), DeckAuthorization(source()))
        val launched =
            assertIs<LaunchResult.Launched>(launcher.launch(UUID.fromString(prepared.setup.setupId), host))
        val seatOf = launched.match.participants.associate { it.userId to it.seatNumber }
        val records = MatchRecords(source())
        records.recordRunning(launched.match.matchId, Instant.now())
        val result = outcome(seatOf.getValue(guest), seatOf.getValue(host))
        records.recordEnded(launched.match.matchId, result, Instant.now())
        records.releaseRoom(launched.match.roomId)
    }

    @Test
    fun `wins are Forge's results, and only finished games count`() {
        val table = table()
        table.play { pat, _ -> GameOutcome(GameOutcome.WINNER, pat, 7) }
        table.play { pat, _ -> GameOutcome(GameOutcome.WINNER, pat, 9) }
        table.play { pat, mine -> GameOutcome(GameOutcome.WINNER, mine, 4, concededSeat = pat) }
        table.play { _, _ -> GameOutcome(GameOutcome.DRAW, null, 12) }
        table.play { _, _ -> GameOutcome(GameOutcome.FAILED, null, 3) }

        val counted = StandingsSource(source()).records().associateBy { it.userId }
        assertEquals(2 to 4, counted.getValue(table.guest).let { it.wins to it.games })
        assertEquals(1 to 4, counted.getValue(table.host).let { it.wins to it.games })
        assertEquals(listOf(table.guest, table.host), StandingsSource(source()).standings().podium.map { it.userId })

        // A disabled account leaves the Hall.
        Accounts(source()).setStatus(table.guest, AccountStatus.DISABLED)
        assertEquals(listOf(table.host), StandingsSource(source()).standings().podium.map { it.userId })
    }
}
