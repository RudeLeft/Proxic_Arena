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
import kotlinx.serialization.json.JsonNull
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
import kotlin.test.assertNotNull
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets

/**
 * Spec 0016 — a held seat on the room list (R2), and Ask to join (R3):
 * the invitation's record the other way round, with the same key rule
 * -- only the host can turn a request into a seat.
 */
class AskToJoinTest {
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
            for (name in listOf("RudeLeft", "Pat", "Sam")) accounts.createUser(name, password, Role.PLAYER)
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

    private val json = Json { ignoreUnknownKeys = true }

    private suspend fun ApplicationTestBuilder.cookiesFor(username: String): List<String> =
        client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"$username","password":"$password"}""")
        }.headers.getAll(HttpHeaders.SetCookie)!!

    private fun List<String>.value(name: String): String {
        val cookie = first { it.startsWith("$name=") }
        return cookie.substringAfter("=").substringBefore(";")
    }

    private suspend fun ApplicationTestBuilder.createRoom(username: String): UUID {
        val cookies = cookiesFor(username)
        val body =
            client.post("/api/rooms") {
                header(
                    HttpHeaders.Cookie,
                    "$SESSION_COOKIE=${cookies.value(SESSION_COOKIE)}; $CSRF_COOKIE=${cookies.value(CSRF_COOKIE)}",
                )
                header(CSRF_HEADER, cookies.value(CSRF_COOKIE))
            }.bodyAsText()
        return UUID.fromString(
            json.parseToJsonElement(body).jsonObject["room"]!!.jsonObject["roomId"]!!.jsonPrimitive.content,
        )
    }

    private fun userId(username: String): UUID =
        Database.connect(config())!!.use { Accounts(it.dataSource()).findByUsername(username)!!.userId }

    /** Read frames until one of [type] that satisfies [where] arrives, or give up. */
    private suspend fun DefaultClientWebSocketSession.await(
        type: String,
        where: (JsonObject) -> Boolean = { true },
    ): JsonObject? =
        withTimeoutOrNull(8_000) {
            while (true) {
                val frame = incoming.receive()
                if (frame !is Frame.Text) continue
                val message =
                    runCatching { json.parseToJsonElement(frame.readText()).jsonObject }.getOrNull() ?: continue
                if (message["type"]?.jsonPrimitive?.content == type && where(message)) return@withTimeoutOrNull message
            }
            @Suppress("UNREACHABLE_CODE")
            null
        }

    private suspend fun DefaultClientWebSocketSession.say(text: String) = send(Frame.Text(text))

    /** The held seat of [roomId] in a ROOMS message, or null for none. */
    private fun heldIn(
        rooms: JsonObject,
        roomId: UUID,
    ): JsonObject? {
        val all = rooms["rooms"]!!.jsonArray.map { it.jsonObject }
        val room = all.firstOrNull { it["roomId"]?.jsonPrimitive?.content == "$roomId" }
        return room?.get("held")?.takeIf { it !is JsonNull }?.jsonObject
    }

    private fun JsonObject.text(key: String) = this[key]!!.jsonPrimitive.content

    /** Three players online, RudeLeft hosting an empty room. */
    private fun withThree(
        test: suspend ApplicationTestBuilder.(
            roomId: UUID,
            host: DefaultClientWebSocketSession,
            pat: DefaultClientWebSocketSession,
            sam: DefaultClientWebSocketSession,
        ) -> Unit,
    ) = testApplication {
        application { module(config()) }
        val client = createClient { install(ClientWebSockets) }
        val tokens = listOf("RudeLeft", "Pat", "Sam").map { cookiesFor(it).value(SESSION_COOKIE) }
        client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=${tokens[0]}") }) {
            val host = this
            host.await("PRESENCE")
            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=${tokens[1]}") }) {
                val pat = this
                pat.await("PRESENCE")
                client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=${tokens[2]}") }) {
                    val sam = this
                    sam.await("PRESENCE")
                    val roomId = createRoom("RudeLeft")
                    host.await("ROOM")
                    test(roomId, host, pat, sam)
                }
            }
        }
    }

    @Test
    fun `a request holds the seat for everyone to see, and only the host turns it into a seat`() =
        withThree { roomId, host, pat, sam ->
            pat.say("""{"type":"JOIN_ASK","roomId":"$roomId"}""")

            val asked = assertNotNull(host.await("JOIN_ASKED"))
            assertEquals("Pat", asked["from"]!!.jsonObject.text("displayName"))
            assertEquals("$roomId", assertNotNull(pat.await("JOIN_ASK_SENT")).text("roomId"))
            // R2 — everybody's list says who the seat is held for, and that they asked.
            val listed = assertNotNull(sam.await("ROOMS") { heldIn(it, roomId) != null })
            val held = heldIn(listed, roomId)!!
            assertEquals("Pat" to "true", held.text("displayName") to held.text("asked"))

            // One at a time: Sam cannot ask for the held seat.
            sam.say("""{"type":"JOIN_ASK","roomId":"$roomId"}""")
            assertEquals("SEAT_HELD", assertNotNull(sam.await("ERROR")).text("errorCode"))
            // The key rule: a player cannot accept their own request, either way in.
            pat.say("""{"type":"INVITE_ACCEPT","roomId":"$roomId"}""")
            assertEquals("INVITATION_GONE", assertNotNull(pat.await("ERROR")).text("errorCode"))
            pat.say("""{"type":"JOIN_ACCEPT"}""")
            assertEquals("INVITATION_GONE", assertNotNull(pat.await("ERROR")).text("errorCode"))

            // The host says yes: Pat is seated, and both are told it ended as ACCEPTED.
            host.say("""{"type":"JOIN_ACCEPT"}""")
            val seated = assertNotNull(pat.await("ROOM"))
            assertEquals(2, seated["room"]!!.jsonObject["members"]!!.jsonArray.size)
            val ended = assertNotNull(host.await("INVITATION_ENDED"))
            assertEquals(
                listOf("ACCEPTED", "TO_YOU", "true"),
                listOf("reason", "direction", "asked").map { ended.text(it) },
            )
        }

    @Test
    fun `the host declines, the player takes a request back, and an invitation shows as held`() =
        withThree { roomId, host, pat, _ ->
            // Declined: Pat is told, and the seat is free again on the list.
            pat.say("""{"type":"JOIN_ASK","roomId":"$roomId"}""")
            host.await("JOIN_ASKED")
            host.say("""{"type":"JOIN_DECLINE"}""")
            val declined = assertNotNull(pat.await("INVITATION_ENDED"))
            assertEquals(
                listOf("DECLINED", "FROM_YOU", "true"),
                listOf("reason", "direction", "asked").map { declined.text(it) },
            )
            assertNotNull(pat.await("ROOMS") { heldIn(it, roomId) == null })

            // Taken back: the host is told it was withdrawn.
            pat.say("""{"type":"JOIN_ASK","roomId":"$roomId"}""")
            host.await("JOIN_ASKED")
            pat.say("""{"type":"JOIN_CANCEL"}""")
            val withdrawn = assertNotNull(host.await("INVITATION_ENDED"))
            assertEquals(listOf("WITHDRAWN", "TO_YOU"), listOf("reason", "direction").map { withdrawn.text(it) })

            // An invitation holds the seat too, not asked; declining it frees it and tells the host.
            host.say("""{"type":"INVITE","userId":"${userId("Pat")}"}""")
            val invited = assertNotNull(pat.await("ROOMS") { heldIn(it, roomId)?.text("asked") == "false" })
            assertEquals("false", heldIn(invited, roomId)!!.text("asked"))
            pat.await("INVITED")
            pat.say("""{"type":"INVITE_DECLINE"}""")
            val no = assertNotNull(host.await("INVITATION_ENDED") { it.text("reason") == "DECLINED" })
            assertEquals("Pat", no["other"]!!.jsonObject.text("displayName"))
            assertNotNull(host.await("ROOMS") { heldIn(it, roomId) == null })
        }
}
