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
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * Spec 0098 (F-0098-A) -- a test deal, through the real launch: a prepared
 * room, a claimed setup, the runtime starting a REAL process (an impostor
 * worker that records what the server sent it). Fixtures as
 * MatchLauncherTest's.
 */
class TestDealLaunchTest {
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
            dataRoot = "build/test-deal-launch",
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

    /**
     * Spec 0098 (F-0098-A) -- what the worker is told to start, for a
     * match launched with [deals] as the runtime's test-deal store (null:
     * the switch off, as in production). An impostor worker records the
     * START_GAME the server really sent.
     */
    private fun startGameSent(deals: (UUID, UUID) -> TestDeals?): kotlinx.serialization.json.JsonObject {
        val (room, setupId) = preparedRoom()
        source().connection.use { connection ->
            connection.prepareStatement(
                "INSERT INTO deck_entry (deck_id, line_number, quantity, card_name, source_text, " +
                    "resolution_status) SELECT deck_id, 1, 60, 'Mountain', '60 Mountain', 'RESOLVED' " +
                    "FROM imported_deck",
            ).use { it.executeUpdate() }
        }
        val store = deals(userId("RudeLeft"), userId("Pat"))
        val launched = assertIs<LaunchResult.Launched>(launcher().launch(setupId, room.hostUserId))
        val scratch = java.nio.file.Files.createTempDirectory("proxic-deal").toFile()
        val heard = java.io.File(scratch, "heard.txt")
        val version = net.barnflix.proxic.BuildInfo.PROTOCOL_VERSION
        val jar =
            ImpostorWorker.jar(
                scratch,
                greeting =
                    "{\"protocolVersion\":$version,\"type\":\"WORKER_READY\"," +
                        "\"forgeCommit\":\"${net.barnflix.proxic.BuildInfo.FORGE_COMMIT}\"}",
                afterStart = listOf("{\"protocolVersion\":$version,\"type\":\"GAME_STARTED\",\"turn\":1}"),
            )
        val runtime =
            MatchRuntime(
                source(),
                config().copy(
                    forgeWorkerJar = jar.path,
                    forgeResRoot = heard.path,
                    dataRoot = java.io.File(scratch, "data").path,
                    testDeals = store != null,
                ),
                testDeals = store,
            )
        try {
            assertIs<WorkerStart.Running>(runtime.beginBlocking(launched.match))
            val line = ImpostorWorker.linesHeard(heard).first { it.contains("START_GAME") }
            return kotlinx.serialization.json.Json.parseToJsonElement(line) as kotlinx.serialization.json.JsonObject
        } finally {
            runtime.stopAll()
            scratch.deleteRecursively()
        }
    }

    private fun dealsBySeat(frame: kotlinx.serialization.json.JsonObject): Map<String, String?> =
        (frame.getValue("players") as kotlinx.serialization.json.JsonArray).associate { player ->
            val seat = player as kotlinx.serialization.json.JsonObject
            seat.getValue("displayName").toString().trim('"') to seat["labDeal"]?.toString()
        }

    /** With the switch on, the queued deal reaches each player's own seat, once. */
    @Test
    fun `a queued test deal reaches the worker with the switch on`() {
        lateinit var store: TestDeals
        val frame =
            startGameSent { host, guest ->
                TestDeals().also {
                    store = it
                    it.queue(
                        mapOf(host to SeatDeal(hand = listOf("Mountain")), guest to SeatDeal(top = listOf("Mountain"))),
                    )
                }
            }

        val deals = dealsBySeat(frame)
        assertEquals("""{"hand":["Mountain"],"top":[]}""", deals["RudeLeft"])
        assertEquals("""{"hand":[],"top":["Mountain"]}""", deals["Pat"])
        // Taken: the next match between them is dealt as Forge shuffles.
        assertEquals(null, store.take(setOf(userId("RudeLeft"), userId("Pat"))))
    }

    /**
     * F-0098-A, the other half: switch off (no store -- production), no
     * seat carries a deal, whatever was asked for.
     */
    @Test
    fun `no deal reaches the worker with the switch off`() {
        val frame = startGameSent { _, _ -> null }

        assertEquals(mapOf("RudeLeft" to null, "Pat" to null), dealsBySeat(frame))
    }
}
