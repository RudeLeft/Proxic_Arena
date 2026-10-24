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
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.CSRF_HEADER
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets

/**
 * Presence, invitations and chat on the authenticated socket.
 * PHASE_05 §5.66–§5.70, AMENDMENTS 1, 2 and 3.
 *
 * Driven through the real socket rather than against the hub,
 * because the thing worth proving is what ANOTHER connection
 * receives. A unit test of the hub can only show that a method was
 * called.
 */
class LobbySocketTest {
    private var container: PostgreSQLContainer<*>? = null
    private val password = "a perfectly fine passphrase"

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

    // --- presence --------------------------------------------------------

    @Test
    fun `a connection is told who is online, and others are told it arrived`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val first = tokenFor("RudeLeft")
            val second = tokenFor("Pat")

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$first") }) {
                val presence = await("PRESENCE")!!
                // Only RudeLeft is here so far.
                assertEquals(1, presence["users"]!!.jsonArray.size)

                client.webSocket(
                    "/ws/user",
                    { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$second") },
                ) {
                    // The newcomer sees both...
                    val theirs = await("PRESENCE")!!
                    assertEquals(2, theirs["users"]!!.jsonArray.size)
                }

                // ...and the first connection was told about the
                // arrival rather than having to poll.
                val joined = await("PRESENCE_JOINED")!!
                assertEquals("Pat", joined["displayName"]!!.jsonPrimitive.content)

                // And about the departure, when that tab closed.
                val left = await("PRESENCE_LEFT")!!
                assertEquals("Pat", left["displayName"]!!.jsonPrimitive.content)
            }
        }

    // --- invitations -------------------------------------------------------

    /**
     * The whole of AMENDMENT 1 in one test: no code is typed
     * anywhere, and the invitation is what admits the guest.
     */
    @Test
    fun `a host invites someone online and they join by accepting`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val hostToken = tokenFor("RudeLeft")
            val guestToken = tokenFor("Pat")

            client.webSocket(
                "/ws/user",
                { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$hostToken") },
            ) {
                val host = this
                host.await("PRESENCE")

                client.webSocket(
                    "/ws/user",
                    { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$guestToken") },
                ) {
                    val guest = this
                    guest.await("PRESENCE")
                    host.await("PRESENCE_JOINED")

                    // The host needs a room before inviting anyone.
                    val roomId = createRoom("RudeLeft")

                    // Creating one announces it to the host's own
                    // connections — §5.6, a second tab is the same
                    // player and must see the room too. Consume it,
                    // so the ROOM awaited below is the one that
                    // carries the guest.
                    assertEquals(
                        1,
                        host.await("ROOM")!!["room"]!!.jsonObject["members"]!!.jsonArray.size,
                    )

                    val patId = userId("Pat")
                    host.say("""{"type":"INVITE","userId":"$patId"}""")

                    val invitation = guest.await("INVITED")!!
                    assertEquals(
                        roomId.toString(),
                        invitation["roomId"]!!.jsonPrimitive.content,
                    )
                    assertEquals(
                        "RudeLeft",
                        invitation["from"]!!.jsonObject["displayName"]!!.jsonPrimitive.content,
                    )

                    guest.say("""{"type":"INVITE_ACCEPT","roomId":"$roomId"}""")

                    // BOTH sides learn the room changed, from one
                    // message with one source of truth.
                    val guestRoom = guest.await("ROOM")!!
                    val hostRoom = host.await("ROOM")!!
                    for (message in listOf(guestRoom, hostRoom)) {
                        val members = message["room"]!!.jsonObject["members"]!!.jsonArray
                        assertEquals(2, members.size, message.toString())
                    }
                }
            }
        }

    /**
     * The reason invitations are recorded server-side.
     *
     * Without it, knowing a room id would be enough to walk in — and
     * a room id passed between users is a join code with extra
     * steps, which is what AMENDMENT 1 removed.
     */
    @Test
    fun `an uninvited user cannot join by knowing the room id`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val hostToken = tokenFor("RudeLeft")
            val outsiderToken = tokenFor("Sam")
            val roomId = createRoom("RudeLeft")

            client.webSocket(
                "/ws/user",
                { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$outsiderToken") },
            ) {
                await("PRESENCE")
                say("""{"type":"INVITE_ACCEPT","roomId":"$roomId"}""")

                val error = await("ERROR")!!
                // PHASE_07 §7.64 lists every room, so a room id is no
                // secret any more; the consumed invitation is the only
                // thing between a list and a seat, and it says so.
                assertEquals("INVITATION_GONE", error["errorCode"]!!.jsonPrimitive.content)
            }
        }

    /** §5.17 — you cannot invite into a room you do not host. */
    @Test
    fun `inviting without hosting a room is refused`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val token = tokenFor("RudeLeft")

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token") }) {
                await("PRESENCE")
                say("""{"type":"INVITE","userId":"${userId("Pat")}"}""")
                assertEquals(
                    "ROOM_HOST_REQUIRED",
                    await("ERROR")!!["errorCode"]!!.jsonPrimitive.content,
                )
            }
        }

    /** D2 — invitations reach people who are here. */
    @Test
    fun `inviting someone offline is refused`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val hostToken = tokenFor("RudeLeft")
            createRoom("RudeLeft")

            client.webSocket(
                "/ws/user",
                { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$hostToken") },
            ) {
                await("PRESENCE")
                say("""{"type":"INVITE","userId":"${userId("Sam")}"}""")
                assertEquals(
                    "USER_NOT_ONLINE",
                    await("ERROR")!!["errorCode"]!!.jsonPrimitive.content,
                )
            }
        }

    // --- chat ---------------------------------------------------------------

    /** AMENDMENT 3 — one channel, and everybody signed in sees it. */
    @Test
    fun `a chat message reaches everyone online`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val first = tokenFor("RudeLeft")
            val second = tokenFor("Pat")

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$first") }) {
                val host = this
                host.await("PRESENCE")

                client.webSocket(
                    "/ws/user",
                    { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$second") },
                ) {
                    await("PRESENCE")
                    host.await("PRESENCE_JOINED")

                    host.say("""{"type":"CHAT","text":"shall we?"}""")

                    val heard = await("CHAT")!!
                    assertEquals("shall we?", heard["text"]!!.jsonPrimitive.content)
                    assertEquals(
                        "RudeLeft",
                        heard["from"]!!.jsonObject["displayName"]!!.jsonPrimitive.content,
                    )
                }
            }
        }

    /**
     * Every recipient gets the whole message, not just the first.
     *
     * The regression this guards: one Frame instance handed to
     * several connections. A Frame is backed by a buffer the writer
     * consumes, so the second connection received an EMPTY frame —
     * silently, since nothing throws. Two tabs is the everyday shape
     * of it (§5.6 makes several sessions one player), and a chat
     * line is the cheapest way to see it.
     */
    @Test
    fun `a message reaches every one of a player's connections`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val watcher = tokenFor("Pat")
            val talker = tokenFor("RudeLeft")

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$watcher") }) {
                val tabOne = this
                tabOne.await("PRESENCE")

                client.webSocket(
                    "/ws/user",
                    { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$watcher") },
                ) {
                    val tabTwo = this
                    tabTwo.await("PRESENCE")

                    client.webSocket(
                        "/ws/user",
                        { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$talker") },
                    ) {
                        await("PRESENCE")
                        say("""{"type":"CHAT","text":"both tabs, please"}""")

                        for (tab in listOf(tabOne, tabTwo)) {
                            val heard = tab.await("CHAT")
                            assertEquals(
                                "both tabs, please",
                                heard?.get("text")?.jsonPrimitive?.content,
                                "a tab received: $heard",
                            )
                        }
                    }
                }
            }
        }

    /** A wall of text is refused rather than broadcast. */
    @Test
    fun `an overlong chat message is refused`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val token = tokenFor("RudeLeft")

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token") }) {
                await("PRESENCE")
                say("""{"type":"CHAT","text":"${"x".repeat(600)}"}""")
                assertEquals(
                    "MESSAGE_TOO_LONG",
                    await("ERROR")!!["errorCode"]!!.jsonPrimitive.content,
                )
            }
        }

    // --- reactions (spec 0007) ---------------------------------------------

    /** A reaction reaches everybody, says who sent it, and can be taken back. */
    @Test
    fun `a reaction on a chat line reaches everyone, and can be taken back`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val first = tokenFor("RudeLeft")
            val second = tokenFor("Pat")

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$first") }) {
                val host = this
                host.await("PRESENCE")

                client.webSocket(
                    "/ws/user",
                    { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$second") },
                ) {
                    await("PRESENCE")
                    host.await("PRESENCE_JOINED")

                    host.say("""{"type":"CHAT","text":"gl hf"}""")
                    val line = await("CHAT")!!["messageId"]!!.jsonPrimitive.content

                    say("""{"type":"REACT","lineId":"$line","emoji":"😂","on":true}""")
                    val heard = host.await("REACTION")!!
                    assertEquals(line, heard["lineId"]!!.jsonPrimitive.content)
                    assertEquals("😂", heard["emoji"]!!.jsonPrimitive.content)
                    assertEquals("true", heard["on"]!!.jsonPrimitive.content)
                    assertEquals("Pat", heard["from"]!!.jsonObject["displayName"]!!.jsonPrimitive.content)

                    say("""{"type":"REACT","lineId":"$line","emoji":"😂","on":false}""")
                    assertEquals("false", host.await("REACTION")!!["on"]!!.jsonPrimitive.content)
                }
            }
        }

    /** Only the six, on a line id; anything else is refused, not relayed. */
    @Test
    fun `a reaction outside the six, or with no line, is refused`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val token = tokenFor("RudeLeft")

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token") }) {
                await("PRESENCE")
                val line = UUID.randomUUID()
                say("""{"type":"REACT","lineId":"$line","emoji":"<b>hi</b>"}""")
                assertEquals("INVALID_REQUEST", await("ERROR")!!["errorCode"]!!.jsonPrimitive.content)
                say("""{"type":"REACT","lineId":"not-a-line","emoji":"👍"}""")
                assertEquals("INVALID_REQUEST", await("ERROR")!!["errorCode"]!!.jsonPrimitive.content)
            }
        }

    /** Reactions spend the same allowance as chat lines: a flood is slowed. */
    @Test
    fun `reactions are rate limited like chat`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }
            val token = tokenFor("RudeLeft")

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token") }) {
                await("PRESENCE")
                val line = UUID.randomUUID()
                repeat(8) { say("""{"type":"REACT","lineId":"$line","emoji":"🔥","on":${it % 2 == 0}}""") }
                assertEquals("TOO_FAST", await("ERROR")!!["errorCode"]!!.jsonPrimitive.content)
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
    private suspend fun ApplicationTestBuilder.createRoom(username: String): UUID {
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
            }.bodyAsText()

        return UUID.fromString(
            json.parseToJsonElement(body).jsonObject["room"]!!
                .jsonObject["roomId"]!!.jsonPrimitive.content,
        )
    }
}
