package net.barnflix.proxic.match

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
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
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Spec 0056 — an update waits for games to finish: the launcher refuses
 * a new game while "Update waiting" is on (F-0056-A), and a server that
 * stops under a game tells its players and ends it as the server was
 * updated, never a result (F-0056-C's list, F-0056-D). Split from
 * MatchLauncherTest, which detekt found large enough; the same harness.
 */
class UpdateWaitsForGamesTest {
    private var container: FreshDatabase? = null
    private var database: Database? = null
    private val password = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            TestPostgres.fresh()
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
            dataRoot = "build/test-update-waits",
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

    private fun matchRow(matchId: UUID): Triple<String, String?, String?> =
        source().connection.use { connection ->
            connection.prepareStatement(
                "SELECT status, result_summary, failure_code FROM match WHERE match_id = ?",
            ).use {
                it.setObject(1, matchId)
                it.executeQuery().use { rows ->
                    rows.next()
                    Triple(rows.getString(1), rows.getString(2), rows.getString(3))
                }
            }
        }

    /**
     * F-0056-A — with "Update waiting" on, a game cannot start; with it off
     * again, the same room starts at once. Refused BEFORE the claim, so the
     * setup is still there to launch: nothing has to be prepared again.
     */
    @Test
    fun `a game cannot start while an update waits, and can once it is off`() {
        val (room, setupId) = preparedRoom()
        var waiting = true
        val launcher = MatchLauncher(source(), DeckAuthorization(source()), updateWaiting = { waiting })

        val refused = assertIs<LaunchResult.Refused>(launcher.launch(setupId, room.hostUserId))
        assertEquals("UPDATE_WAITING", refused.error.code)
        assertEquals(
            "An update is coming. New games can start again once it's done (usually a few minutes).",
            refused.error.detail,
        )
        val rooms = RoomService(source(), DeckAuthorization(source()))
        assertEquals(RoomStatus.READY_FOR_MATCH, rooms.find(room.roomId)!!.status, "the refusal moved the room")

        waiting = false
        assertIs<LaunchResult.Launched>(launcher.launch(setupId, room.hostUserId))
        assertEquals(RoomStatus.IN_MATCH, rooms.find(room.roomId)!!.status)
    }

    /**
     * F-0056-C, F-0056-D — a game being played is listed for the Admin page
     * (who, which turn); when the server stops under it, its players are
     * told first, then it ends as SERVER_RESTARTED with NO result, the room
     * comes back and the worker is gone.
     *
     * The real runtime and a real process (an impostor worker that starts a
     * game, sends one board on turn 3 and never ends it). Against the old
     * stopAll, which only killed the workers, every assertion after the
     * stop fails: nobody told, the row still RUNNING, the room IN_MATCH.
     */
    @Test
    fun `a server stop tells the players and ends the game as the server was updated`() {
        val (room, setupId) = preparedRoom()
        source().connection.use { connection ->
            connection.prepareStatement(
                "INSERT INTO deck_entry (deck_id, line_number, quantity, card_name, source_text, " +
                    "resolution_status) SELECT deck_id, 1, 60, 'Mountain', '60 Mountain', 'RESOLVED' " +
                    "FROM imported_deck",
            ).use { it.executeUpdate() }
        }
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        val matchId = launched.match.matchId

        val scratch = java.nio.file.Files.createTempDirectory("proxic-stop").toFile()
        val heard = java.io.File(scratch, "heard.txt")
        val version = net.barnflix.proxic.BuildInfo.PROTOCOL_VERSION
        val jar =
            ImpostorWorker.jar(
                scratch,
                greeting =
                    "{\"protocolVersion\":$version,\"type\":\"WORKER_READY\"," +
                        "\"forgeCommit\":\"${net.barnflix.proxic.BuildInfo.FORGE_COMMIT}\"}",
                afterStart =
                    listOf(
                        "{\"protocolVersion\":$version,\"type\":\"GAME_STARTED\",\"turn\":1}",
                        "{\"protocolVersion\":$version,\"type\":\"MATCH_SNAPSHOT\",\"seat\":1," +
                            "\"state\":{\"turn\":3}}",
                    ),
                pauseMillis = 500,
            )
        val rooms = RoomService(source(), DeckAuthorization(source()))
        val announced = mutableListOf<String>()
        val runtime =
            MatchRuntime(
                source(),
                config().copy(
                    forgeWorkerJar = jar.path,
                    forgeResRoot = heard.path,
                    dataRoot = java.io.File(scratch, "data").path,
                ),
                announcer = { match, code, outcome -> announced += "MATCH ${match.status} $code $outcome" },
                rooms = rooms,
            )

        try {
            assertIs<WorkerStart.Running>(runtime.beginBlocking(launched.match))
            val pid = kotlin.test.assertNotNull(ImpostorWorker.pidOf(heard), "the impostor never started")

            // F-0056-C — the Admin page's list: this game, and its turn once a board said it.
            val deadline = System.currentTimeMillis() + 30_000
            while (System.currentTimeMillis() < deadline && runtime.games.firstOrNull()?.turn != 3) {
                Thread.sleep(50)
            }
            val game = runtime.games.single()
            assertEquals(matchId, game.match.matchId)
            assertEquals(listOf("RudeLeft", "Pat"), game.match.participants.map { it.displayName })
            assertEquals(3, game.turn)

            // F-0056-D — the stop.
            val told = mutableListOf<UUID>()
            assertEquals(1, runtime.stopAll { match -> told += match.matchId })

            assertEquals(listOf(matchId), told, "the players were not told before the stop")
            assertEquals(Triple("FAILED_RUNTIME", null, "SERVER_RESTARTED"), matchRow(matchId))
            assertTrue(
                announced.contains("MATCH FAILED_RUNTIME SERVER_RESTARTED null"),
                "the ending was not announced as the update: $announced",
            )
            assertEquals(RoomStatus.OPEN, rooms.find(room.roomId)!!.status)
            assertTrue(runtime.games.isEmpty(), "the runtime still holds the game")
            val gone = System.currentTimeMillis() + 10_000
            while (System.currentTimeMillis() < gone && ProcessHandle.of(pid).map { it.isAlive }.orElse(false)) {
                Thread.sleep(50)
            }
            assertEquals(false, ProcessHandle.of(pid).map { it.isAlive }.orElse(false), "the worker outlived the stop")

            // The worker's own "stopped" afterwards is a second ending and changes nothing.
            Thread.sleep(500)
            assertEquals(Triple("FAILED_RUNTIME", null, "SERVER_RESTARTED"), matchRow(matchId))
            assertEquals(1, announced.count { it.startsWith("MATCH FAILED_RUNTIME") }, announced.toString())
        } finally {
            runtime.stopAll()
            scratch.deleteRecursively()
        }
    }
}
