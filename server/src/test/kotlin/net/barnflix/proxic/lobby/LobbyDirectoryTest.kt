package net.barnflix.proxic.lobby

import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.CSRF_HEADER
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets

/**
 * The PHASE_07 Lobby on the socket: the room list everybody sees
 * (§7.64), optional room names (Amendment 9), the list of players and
 * invitations that last until something ends them (Amendment 11).
 * Split from [LobbySocketTest], same harness.
 */
class LobbyDirectoryTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            TestPostgres.fresh()

        Database.connect(config())!!.use { database ->
            database.migrate()
            val accounts = Accounts(database.dataSource())
            for (name in listOf("RudeLeft", "Pat", "Sam")) {
                accounts.createUser(name, password, Role.PLAYER)
            }
        }
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-lobby",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private suspend fun ApplicationTestBuilder.tokenFor(username: String): String =
        client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"$username","password":"$password"}""")
        }.headers.getAll(HttpHeaders.SetCookie)!!
            .first { it.startsWith("$SESSION_COOKIE=") }
            .substringAfter("=").substringBefore(";")

    private val json = Json { ignoreUnknownKeys = true }

    /** Read frames until one of [type] arrives, or give up. */
    private suspend fun DefaultClientWebSocketSession.await(
        type: String,
        timeoutMillis: Long = 8_000,
    ): JsonObject? =
        withTimeoutOrNull(timeoutMillis) {
            while (true) {
                val frame = incoming.receive()
                if (frame !is Frame.Text) continue
                // Not every text frame is a protocol message -- an
                // empty one arrives as a connection winds down, and
                // failing to parse it would fail the test for a
                // reason that is not the test's subject.
                val raw = frame.readText()
                val message =
                    runCatching {
                        json.parseToJsonElement(raw).jsonObject
                    }.getOrNull() ?: continue
                if (message["type"]?.jsonPrimitive?.content == type) return@withTimeoutOrNull message
            }
            @Suppress("UNREACHABLE_CODE")
            null
        }

    private suspend fun DefaultClientWebSocketSession.say(text: String) {
        send(Frame.Text(text))
    }

    // --- the room list and the players (§7.64, Amendments 9 and 11) ----------

    private fun JsonObject.str(key: String): String = this[key]!!.jsonPrimitive.content

    @Test
    fun `everybody is told every room, by name, with seats and never decks`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val named = createRoom("RudeLeft", name = "  Kitchen Table  ")
            val unnamed = createRoom("Pat")
            val outsider = tokenFor("Sam")

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$outsider") }) {
                val rooms = await("ROOMS")!!["rooms"]!!.jsonArray.map { it.jsonObject }
                val byId = rooms.associateBy { it.str("roomId") }
                assertEquals("Kitchen Table", byId[named.toString()]!!.str("name"))
                assertEquals("Pat's room", byId[unnamed.toString()]!!.str("name"))
                val seat = byId[named.toString()]!!["seats"]!!.jsonArray.single().jsonObject
                assertEquals("RudeLeft", seat.str("displayName"))
                // §7.68 — seats, never decks: not a name, not even whether one is chosen.
                assertFalse(rooms.toString().contains("deck", ignoreCase = true), rooms.toString())
                assertTrue(byId[named.toString()]!!.containsKey("clearsAt"))
            }
        }

    @Test
    fun `a room name is optional, one line, at most 40 characters`() =
        testApplication {
            application { module(config()) }
            assertEquals(422, createRoomStatus("RudeLeft", "x".repeat(41)))
            assertEquals(422, createRoomStatus("RudeLeft", "two\nlines"))
            assertEquals(201, createRoomStatus("RudeLeft", "x".repeat(40)))
        }

    @Test
    fun `the players list names every active account, online or not`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            Database.connect(config())!!.use { db ->
                Accounts(db.dataSource()).setStatus(userId("Sam"), net.barnflix.proxic.auth.AccountStatus.DISABLED)
            }
            val token = tokenFor("RudeLeft")
            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token") }) {
                val names = await("PLAYERS")!!["players"]!!.jsonArray.map { it.jsonObject.str("displayName") }
                // Pat is offline and listed; Sam is disabled and is not.
                assertEquals(listOf("Pat", "RudeLeft"), names)
            }
        }

    // --- invitations: one at a time, and every ending told (Amendment 11) ------

    /** Two players connected, the first hosting; [body] gets (host, guest, roomId). */
    private suspend fun ApplicationTestBuilder.hostAndGuest(
        guestName: String = "Pat",
        body: suspend (DefaultClientWebSocketSession, DefaultClientWebSocketSession, UUID) -> Unit,
    ) {
        val client = createClient { install(ClientWebSockets) }
        val hostToken = tokenFor("RudeLeft")
        val guestToken = tokenFor(guestName)
        val roomId = createRoom("RudeLeft")
        client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$hostToken") }) {
            val host = this
            host.await("ROOMS")
            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$guestToken") }) {
                await("ROOMS")
                host.await("PRESENCE_JOINED")
                body(host, this, roomId)
            }
        }
    }

    @Test
    fun `a host has one invitation out at a time, and withdrawing it tells the player`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val samToken = tokenFor("Sam")
            hostAndGuest { host, guest, roomId ->
                client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$samToken") }) {
                    host.await("PRESENCE_JOINED")
                    host.say("""{"type":"INVITE","userId":"${userId("Pat")}"}""")
                    assertEquals(roomId.toString(), host.await("INVITATION_SENT")!!.str("roomId"))
                    assertEquals("RudeLeft's room", guest.await("INVITED")!!.str("roomName"))

                    host.say("""{"type":"INVITE","userId":"${userId("Sam")}"}""")
                    assertEquals("ONE_INVITATION_AT_A_TIME", host.await("ERROR")!!.str("errorCode"))

                    host.say("""{"type":"INVITE_WITHDRAW"}""")
                    val ended = guest.await("INVITATION_ENDED")!!
                    assertEquals("WITHDRAWN", ended.str("reason"))
                    assertEquals("TO_YOU", ended.str("direction"))
                    assertEquals("FROM_YOU", host.await("INVITATION_ENDED")!!.str("direction"))

                    // Accepting a moment too late is refused, and says why.
                    guest.say("""{"type":"INVITE_ACCEPT","roomId":"$roomId"}""")
                    assertEquals("INVITATION_GONE", guest.await("ERROR")!!.str("errorCode"))

                    // With nothing out, the host may ask somebody else.
                    host.say("""{"type":"INVITE","userId":"${userId("Sam")}"}""")
                    host.await("INVITATION_SENT")
                    await("INVITED")
                }
            }
        }

    @Test
    fun `a decline reaches the host, and an acceptance ends it for both and fills the list`() =
        testApplication {
            application { module(config()) }
            hostAndGuest { host, guest, roomId ->
                host.say("""{"type":"INVITE","userId":"${userId("Pat")}"}""")
                guest.await("INVITED")
                guest.say("""{"type":"INVITE_DECLINE"}""")
                val declined = host.await("INVITATION_ENDED")!!
                assertEquals("DECLINED", declined.str("reason"))
                assertEquals("Pat", declined["other"]!!.jsonObject.str("displayName"))

                host.say("""{"type":"INVITE","userId":"${userId("Pat")}"}""")
                guest.await("INVITED")
                guest.say("""{"type":"INVITE_ACCEPT","roomId":"$roomId"}""")
                assertEquals("ACCEPTED", host.await("INVITATION_ENDED")!!.str("reason"))
                // Everyone's list now shows both seats taken.
                var seats = 0
                while (seats < 2) {
                    val rooms = host.await("ROOMS")!!["rooms"]!!.jsonArray
                    seats = rooms.single().jsonObject["seats"]!!.jsonArray.size
                }
            }
        }

    @Test
    fun `a player already in a room cannot be invited into another`() =
        testApplication {
            application { module(config()) }
            createRoom("Pat")
            hostAndGuest { host, _, _ ->
                host.say("""{"type":"INVITE","userId":"${userId("Pat")}"}""")
                assertEquals("PLAYER_IN_A_ROOM", host.await("ERROR")!!.str("errorCode"))
            }
        }

    @Test
    fun `an invitation survives a reload and is shown again`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val guestToken = tokenFor("Pat")
            hostAndGuest { host, guest, roomId ->
                host.say("""{"type":"INVITE","userId":"${userId("Pat")}"}""")
                guest.await("INVITED")
                // A second tab stands in for the reloaded page: it is
                // told on connect, without anybody asking again.
                client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$guestToken") }) {
                    assertEquals(roomId.toString(), await("INVITED")!!.str("roomId"))
                }
            }
        }

    // --- helpers --------------------------------------------------------------

    private fun userId(username: String): UUID =
        Database.connect(config())!!.use {
            Accounts(it.dataSource()).findByUsername(username)!!.userId
        }

    /**
     * Host a room the way a browser does.
     *
     * Through the HTTP route rather than the service, so these
     * tests exercise the same door the lobby page uses. The second
     * login is deliberate: the route needs the CSRF pair (§3.51)
     * and the socket tests only ever captured the session cookie.
     */
    private suspend fun ApplicationTestBuilder.createRoom(
        username: String,
        name: String? = null,
    ): UUID {
        val cookies =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }.headers.getAll(HttpHeaders.SetCookie)!!

        fun cookie(name: String) = cookies.first { it.startsWith("$name=") }.substringAfter("=").substringBefore(";")

        val csrf = cookie(CSRF_COOKIE)
        val body =
            client.post("/api/rooms") {
                header(HttpHeaders.Cookie, "$SESSION_COOKIE=${cookie(SESSION_COOKIE)}; $CSRF_COOKIE=$csrf")
                header(CSRF_HEADER, csrf)
                if (name != null) {
                    contentType(ContentType.Application.Json)
                    setBody(Json.encodeToString(CreateRoom.serializer(), CreateRoom(name)))
                }
            }.bodyAsText()

        return UUID.fromString(
            json.parseToJsonElement(body).jsonObject["room"]!!
                .jsonObject["roomId"]!!.jsonPrimitive.content,
        )
    }

    @kotlinx.serialization.Serializable
    private data class CreateRoom(val name: String)

    /** Opening a room, for the status code alone; the room is closed again. */
    private suspend fun ApplicationTestBuilder.createRoomStatus(
        username: String,
        name: String,
    ): Int {
        val cookies =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }.headers.getAll(HttpHeaders.SetCookie)!!

        fun cookie(name: String) = cookies.first { it.startsWith("$name=") }.substringAfter("=").substringBefore(";")

        val csrf = cookie(CSRF_COOKIE)
        val auth = "$SESSION_COOKIE=${cookie(SESSION_COOKIE)}; $CSRF_COOKIE=$csrf"
        val response =
            client.post("/api/rooms") {
                header(HttpHeaders.Cookie, auth)
                header(CSRF_HEADER, csrf)
                contentType(ContentType.Application.Json)
                setBody(Json.encodeToString(CreateRoom.serializer(), CreateRoom(name)))
            }
        if (response.status.value == 201) {
            val roomId =
                json.parseToJsonElement(response.bodyAsText()).jsonObject["room"]!!
                    .jsonObject["roomId"]!!.jsonPrimitive.content
            client.post("/api/rooms/$roomId/close") {
                header(HttpHeaders.Cookie, auth)
                header(CSRF_HEADER, csrf)
            }
        }
        return response.status.value
    }
}
