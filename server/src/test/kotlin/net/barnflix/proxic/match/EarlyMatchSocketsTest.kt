package net.barnflix.proxic.match

import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.LoginResult
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.auth.Sessions
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
import java.io.DataInputStream
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Spec 0122 (P11-E12) -- the two early addresses, on real sockets: a real
 * server (Netty, a real port) mounting the real `matchSocket`, a real
 * database, the real runtime with a real worker process (an impostor that
 * starts a game and sends a board for each seat, the public board and a
 * question for seat 1), and connections opened by hand so every frame,
 * pings and close codes included, can be read.
 *
 * - F-0122-A: `/ws/matches/current` gives a seated player hello (naming the
 *   game), board, question and the 2 s pings, and counts as the seat's link
 *   (SeatLinks); no game closes 4003; no session closes as today; `resume`
 *   is not read.
 * - F-0122-B: `/ws/matches/watch/{roomId}` gives a spectator the public view
 *   only; either seated player is closed 4003 and sent nothing (HID-003:
 *   both seats); an unknown room closes 4003; a just-ended game is told its end.
 */
class EarlyMatchSocketsTest {
    private var container: FreshDatabase? = null
    private var database: Database? = null
    private val password = "a perfectly fine passphrase"
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        database = Database.connect(config())!!.also { it.migrate() }
        val accounts = Accounts(source())
        for (name in listOf("RudeLeft", "Pat", "Sam")) accounts.createUser(name, password, Role.PLAYER)
    }

    @AfterTest
    fun stop() {
        database?.close()
        container?.stop()
    }

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-early-sockets",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun source() = database!!.dataSource()

    private fun userId(username: String) = Accounts(source()).findByUsername(username)!!.userId

    private fun token(username: String): String {
        val accounts = Accounts(source(), Sessions(source()))
        return (accounts.login(username, password) as LoginResult.Success).token
    }

    // --- the game ------------------------------------------------------------

    private class Game(
        val runtime: MatchRuntime,
        val hub: MatchHub,
        val match: Match,
        val room: Room,
        val port: Int,
    )

    /** RudeLeft (seat 1) and Pat (seat 2) in a RUNNING game, served on a real port. */
    private fun <T> withGame(body: (Game) -> T): T {
        val rooms = RoomService(source(), DeckAuthorization(source()))
        val (room, setupId) = preparedRoom(rooms)
        val launched =
            assertIs<LaunchResult.Launched>(
                MatchLauncher(source(), DeckAuthorization(source())).launch(setupId, room.hostUserId),
            )
        val scratch = java.nio.file.Files.createTempDirectory("proxic-early").toFile()
        val heard = File(scratch, "heard.txt")
        val v = net.barnflix.proxic.BuildInfo.PROTOCOL_VERSION
        val board = { seat: Int, secret: String ->
            "{\"protocolVersion\":$v,\"type\":\"MATCH_SNAPSHOT\",\"seat\":$seat," +
                "\"state\":{\"turn\":3,\"gameEpoch\":1,\"stateRevision\":5,\"note\":\"$secret\"}}"
        }
        val jar =
            ImpostorWorker.jar(
                scratch,
                greeting =
                    "{\"protocolVersion\":$v,\"type\":\"WORKER_READY\"," +
                        "\"forgeCommit\":\"${net.barnflix.proxic.BuildInfo.FORGE_COMMIT}\"}",
                afterStart =
                    listOf(
                        "{\"protocolVersion\":$v,\"type\":\"GAME_STARTED\",\"turn\":1}",
                        board(1, SEAT_1_SECRET),
                        board(2, SEAT_2_SECRET),
                        board(PUBLIC_SEAT, PUBLIC_NOTE),
                        "{\"protocolVersion\":$v,\"type\":\"DECISION_REQUEST\",\"decisionId\":\"7\"," +
                            "\"actedForSeat\":1,\"authorisedSeat\":1,\"kind\":\"chooseSpellAbilityToPlay\"," +
                            "\"stateVersion\":\"5\",\"options\":[{\"actionId\":\"pass\",\"label\":\"Pass\"}]}",
                    ),
                pauseMillis = 100,
            )
        val hub = MatchHub()
        val config =
            config().copy(
                forgeWorkerJar = jar.path,
                forgeResRoot = heard.path,
                dataRoot = File(scratch, "data").path,
            )
        val runtime = MatchRuntime(source(), config, rooms = rooms, decisions = hub, spectatorsTold = hub.endings)
        val sessions = Sessions(source())
        val server =
            embeddedServer(Netty, port = 0, host = "127.0.0.1") {
                install(WebSockets)
                routing { matchSocket(sessions, MatchStore(source()), runtime, hub, config, rooms) }
            }.start(wait = false)
        try {
            assertIs<WorkerStart.Running>(runtime.beginBlocking(launched.match))
            assertNotNull(ImpostorWorker.pidOf(heard), "the impostor never started")
            val live = runtime.liveMatch(launched.match.matchId)!!
            val until = System.currentTimeMillis() + 20_000
            while ((live.pending() == null || live.publicSnapshot == null) && System.currentTimeMillis() < until) {
                Thread.sleep(50)
            }
            assertNotNull(live.pending(), "the impostor's question never arrived")
            val port = runBlocking { server.resolvedConnectors().first().port }
            val match = MatchStore(source()).find(launched.match.matchId)!!
            assertEquals(MatchStatus.RUNNING, match.status)
            return body(Game(runtime, hub, match, room, port))
        } finally {
            runtime.stopAll()
            server.stop(0, 1_000)
            scratch.deleteRecursively()
        }
    }

    private fun preparedRoom(rooms: RoomService): Pair<Room, UUID> {
        val host = userId("RudeLeft")
        val guest = userId("Pat")
        val deckId = UUID.randomUUID()
        source().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256,
                     total_cards, distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, 'Mono Red', 'test.zip', ?, 60, 1, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, deckId.toString().replace("-", "").repeat(2).take(64))
                it.setObject(3, host)
                it.executeUpdate()
            }
            connection.prepareStatement(
                "INSERT INTO deck_entry (deck_id, line_number, quantity, card_name, source_text, " +
                    "resolution_status) VALUES (?, 1, 60, 'Mountain', '60 Mountain', 'RESOLVED')",
            ).use {
                it.setObject(1, deckId)
                it.executeUpdate()
            }
        }
        DeckSharing(source(), DeckAuthorization(source())).share(deckId, host, "Pat")
        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)
        for (user in listOf(host, guest)) {
            check(rooms.selectDeck(room.roomId, user, deckId) is RoomResult.Ok)
            check(rooms.setReady(room.roomId, user, true) is RoomResult.Ok)
        }
        val setups = MatchSetupService(source(), DeckAuthorization(source()), { DeckCheck(DeckVerdict.VALID, "") })
        val prepared = assertIs<PrepareResult.Prepared>(setups.prepare(room.roomId, host))
        return rooms.find(room.roomId)!! to UUID.fromString(prepared.setup.setupId)
    }

    // --- F-0122-A ------------------------------------------------------------

    @Test
    fun `F-0122-A a seated player on the current address is a player connection for their game`() =
        withGame { game ->
            // `resume` on this address is not read: a fresh page asks for nothing.
            val seen = openSocket(game.port, "/ws/matches/current?deltas=1&resume=1.5", token("RudeLeft"))
            seen.use {
                it.readFor(2_600)
                val texts = it.texts()
                val hello = texts.first()
                assertEquals("MATCH_HELLO", hello.type(), "the hello first: $texts")
                assertEquals(game.match.matchId.toString(), hello["matchId"]!!.jsonPrimitive.content)
                assertEquals(1, hello["seat"]!!.jsonPrimitive.content.toInt())
                val types = texts.map { t -> t.type() }
                val boardAt = types.indexOf("MATCH_SNAPSHOT")
                val askAt = types.indexOf("DECISION_REQUEST")
                assertTrue(boardAt > 0, "no whole board (a resume would have been a MATCH_CATCHUP): $types")
                assertFalse("MATCH_CATCHUP" in types, "the resume was read: $types")
                assertTrue(askAt > boardAt, "state first, then the question (PROTO-002): $types")
                assertTrue(it.raw().contains(SEAT_1_SECRET), "seat 1's own board")
                assertFalse(it.raw().contains(SEAT_2_SECRET), "seat 2's board sent to seat 1")
                assertFalse(it.raw().contains(PUBLIC_NOTE), "the public board sent to a player")
                // Spec 0120: a player's 2 s pings, from the open.
                assertTrue(it.pings >= 1, "no ping within 2.6 s (MATCH_PING_MS)")
                // Spec 0120: this connection is the seat's link.
                assertFalse(game.runtime.liveMatch(game.match.matchId)!!.links.paused, "paused with seat 1 linked")
            }
            // Its only connection gone: seat 1 drops, as on the id route.
            assertTrue(waitFor { game.runtime.liveMatch(game.match.matchId)!!.links.paused }, "the close was no drop")
        }

    @Test
    fun `F-0122-A the other seat gets its own view and no question, from the same address`() =
        withGame { game ->
            openSocket(game.port, "/ws/matches/current?deltas=1", token("Pat")).use {
                it.readFor(1_500)
                val hello = it.texts().first()
                assertEquals(2, hello["seat"]!!.jsonPrimitive.content.toInt())
                assertEquals(game.match.matchId.toString(), hello["matchId"]!!.jsonPrimitive.content)
                assertTrue(it.raw().contains(SEAT_2_SECRET))
                assertFalse(it.raw().contains(SEAT_1_SECRET), "seat 1's board sent to seat 2")
                assertFalse(it.texts().any { t -> t.type() == "DECISION_REQUEST" }, "seat 1's question sent to seat 2")
            }
        }

    @Test
    fun `F-0122-A no game closes 4003, and no session closes as every socket does`() =
        withGame { game ->
            openSocket(game.port, "/ws/matches/current?deltas=1", token("Sam")).use {
                it.readFor(3_000)
                assertEquals(4003, it.closeCode, "not in a game")
                assertEquals("no game", it.closeReason)
                assertTrue(it.texts().isEmpty(), "sent something before the close: ${it.texts()}")
            }
            openSocket(game.port, "/ws/matches/current?deltas=1", token = null).use {
                it.readFor(3_000)
                assertEquals(1008, it.closeCode)
                assertEquals("authentication required", it.closeReason)
            }
            // The id route is unchanged by the split (`player`).
            openSocket(game.port, "/ws/matches/${game.match.matchId}?deltas=1", token("RudeLeft")).use {
                it.readFor(1_500)
                assertEquals("MATCH_HELLO", it.texts().first().type())
                assertTrue(it.raw().contains(SEAT_1_SECRET))
            }
        }

    // --- F-0122-B ------------------------------------------------------------

    @Test
    fun `F-0122-B a spectator on the watch address gets the public view only`() =
        withGame { game ->
            openSocket(game.port, "/ws/matches/watch/${game.room.roomId}?deltas=1", token("Sam")).use {
                it.readFor(1_500)
                val hello = it.texts().first()
                assertEquals("MATCH_HELLO", hello.type())
                assertEquals(game.match.matchId.toString(), hello["matchId"]!!.jsonPrimitive.content)
                assertEquals(PUBLIC_SEAT, hello["seat"]!!.jsonPrimitive.content.toInt())
                assertTrue(it.raw().contains(PUBLIC_NOTE), "no public board: ${it.texts()}")
                assertFalse(it.raw().contains(SEAT_1_SECRET), "seat 1's board sent to a spectator")
                assertFalse(it.raw().contains(SEAT_2_SECRET), "seat 2's board sent to a spectator")
                assertFalse(it.texts().any { t -> t.type() == "DECISION_REQUEST" })
            }
        }

    /** HID-003: asserted from both seats. Neither is sent anything at all, its own view least of all. */
    @Test
    fun `F-0122-B either player of the game is closed 4003 on its watch address and sent nothing`() =
        withGame { game ->
            for ((name, secret) in listOf("RudeLeft" to SEAT_1_SECRET, "Pat" to SEAT_2_SECRET)) {
                openSocket(game.port, "/ws/matches/watch/${game.room.roomId}?deltas=1", token(name)).use {
                    it.readFor(3_000)
                    assertEquals(4003, it.closeCode, "$name was not closed")
                    assertTrue(it.texts().isEmpty(), "$name was sent ${it.texts()}")
                    assertFalse(it.raw().contains(secret), "$name was sent their seat's view")
                }
            }
        }

    @Test
    fun `F-0122-B an unknown room closes 4003, and a game that just ended is told its end`() =
        withGame { game ->
            for (room in listOf(UUID.randomUUID().toString(), "not-a-room")) {
                openSocket(game.port, "/ws/matches/watch/$room?deltas=1", token("Sam")).use {
                    it.readFor(3_000)
                    assertEquals(4003, it.closeCode, room)
                }
            }
            game.runtime.abandon(game.match)
            openSocket(game.port, "/ws/matches/watch/${game.room.roomId}?deltas=1", token("Sam")).use {
                it.readFor(3_000)
                val ended = it.texts().singleOrNull()
                assertEquals("MATCH_ENDED", ended?.type(), "${it.texts()}")
                assertEquals(game.match.matchId.toString(), ended!!["matchId"]!!.jsonPrimitive.content)
                assertEquals(1000, it.closeCode, "closed normally (game over)")
            }
            // The player's address after the end: no game.
            openSocket(game.port, "/ws/matches/current?deltas=1", token("RudeLeft")).use {
                it.readFor(3_000)
                assertEquals(4003, it.closeCode)
            }
        }

    private fun waitFor(check: () -> Boolean): Boolean {
        val until = System.currentTimeMillis() + 5_000
        while (System.currentTimeMillis() < until) {
            if (check()) return true
            Thread.sleep(50)
        }
        return check()
    }

    private fun JsonObject.type() = this["type"]?.jsonPrimitive?.content

    /** A websocket opened by hand: every frame read, pings counted, the close kept. */
    private inner class Seen(private val socket: Socket) : AutoCloseable {
        private val input = DataInputStream(socket.getInputStream())
        private val texts = mutableListOf<String>()
        var pings = 0
        var closeCode: Int? = null
        var closeReason: String? = null

        fun texts(): List<JsonObject> = texts.map { json.parseToJsonElement(it).jsonObject }

        fun raw(): String = texts.joinToString("\n")

        /** Every frame for [millis], or until the server closes. */
        fun readFor(millis: Long) {
            val until = System.currentTimeMillis() + millis
            while (closeCode == null) {
                val left = until - System.currentTimeMillis()
                if (left <= 0) return
                socket.soTimeout = left.toInt()
                val first =
                    try {
                        input.readUnsignedByte()
                    } catch (_: SocketTimeoutException) {
                        return
                    } catch (_: java.io.EOFException) {
                        return
                    }
                val length =
                    when (val l = input.readUnsignedByte() and 0x7f) {
                        126 -> input.readUnsignedShort().toLong()
                        127 -> input.readLong()
                        else -> l.toLong()
                    }
                val payload = ByteArray(length.toInt()).also(input::readFully)
                when (first and 0x0f) {
                    0x1 -> texts += String(payload)
                    0x8 -> {
                        closeCode =
                            if (payload.size >= 2) {
                                ((payload[0].toInt() and 0xff) shl 8) or
                                    (payload[1].toInt() and 0xff)
                            } else {
                                1005
                            }
                        closeReason = String(payload.drop(2).toByteArray())
                    }
                    0x9 -> pings += 1
                }
            }
        }

        override fun close() = socket.close()
    }

    private companion object {
        const val SEAT_1_SECRET = "seat-one-own-board"
        const val SEAT_2_SECRET = "seat-two-own-board"
        const val PUBLIC_NOTE = "the-public-board"
    }

    private fun openSocket(
        port: Int,
        path: String,
        token: String?,
    ): Seen {
        val socket = Socket()
        socket.connect(InetSocketAddress("127.0.0.1", port))
        socket.soTimeout = 10_000
        val crlf = "\r\n"
        val cookie = token?.let { "Cookie: $SESSION_COOKIE=$it$crlf" }.orEmpty()
        socket.getOutputStream().write(
            (
                "GET $path HTTP/1.1${crlf}Host: 127.0.0.1:$port${crlf}Upgrade: websocket$crlf" +
                    "Connection: Upgrade${crlf}Sec-WebSocket-Version: 13$crlf" +
                    "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==$crlf$cookie$crlf"
            ).toByteArray(),
        )
        val input = socket.getInputStream()
        var last4 = 0
        while (last4 != END_OF_HEAD) {
            val c = input.read()
            check(c >= 0) { "closed during the handshake" }
            last4 = (last4 shl 8) or c
        }
        return Seen(socket)
    }
}

private const val END_OF_HEAD = 0x0d0a0d0a
