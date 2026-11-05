package net.barnflix.proxic.admin

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.LoggerContext
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.CSRF_HEADER
import net.barnflix.proxic.auth.Renames
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.slf4j.LoggerFactory
import org.testcontainers.DockerClientFactory
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets

/**
 * Spec 0041 Amendment 3 — an administrator renames a player (owner
 * 2026-11-04, canvas choices A/A): the display name only, the sign-up
 * rule, logged, and the player told once -- at once, or next time.
 */
class AdminRenameTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"
    private lateinit var appender: ListAppender<ILoggingEvent>
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        database().use { db ->
            val accounts = Accounts(db.dataSource())
            accounts.createUser("RudeLeft", password, Role.ADMIN)
            accounts.createUser("Pat", password, Role.PLAYER)
        }
        appender = ListAppender<ILoggingEvent>().also { it.start() }
        (LoggerFactory.getILoggerFactory() as LoggerContext).getLogger("ROOT").apply {
            level = Level.INFO
            addAppender(appender)
        }
    }

    @AfterTest
    fun stop() {
        (LoggerFactory.getILoggerFactory() as LoggerContext).getLogger("ROOT").detachAppender(appender)
        container!!.stop()
    }

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-admin-rename",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun database(): Database = Database.connect(config())!!.also { it.migrate() }

    private fun user(username: String) = database().use { Accounts(it.dataSource()).findByUsername(username)!! }

    private fun pending(userId: UUID): String? =
        database().use { db ->
            db.dataSource().connection.use { c ->
                c.prepareStatement("SELECT renamed_notice FROM app_user WHERE user_id = ?").use {
                    it.setObject(1, userId)
                    it.executeQuery().use { rows -> rows.next().let { rows.getString(1) } }
                }
            }
        }

    private class Session(val token: String, val csrf: String)

    private suspend fun ApplicationTestBuilder.session(username: String): Session {
        val response =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }

        fun cookie(name: String) =
            response.headers.getAll(HttpHeaders.SetCookie)!!
                .first { it.startsWith("$name=") }
                .substringAfter("=").substringBefore(";")
        return Session(cookie(SESSION_COOKIE), cookie(CSRF_COOKIE))
    }

    private suspend fun ApplicationTestBuilder.rename(
        session: Session,
        userId: Any,
        name: String,
    ): HttpResponse =
        client.put("/api/admin/accounts/$userId/display-name") {
            header(HttpHeaders.Cookie, "$SESSION_COOKIE=${session.token}; $CSRF_COOKIE=${session.csrf}")
            header(CSRF_HEADER, session.csrf)
            contentType(ContentType.Application.Json)
            setBody("""{"displayName":"$name"}""")
        }

    private suspend fun DefaultClientWebSocketSession.await(type: String): JsonObject? =
        withTimeoutOrNull(8_000) {
            var found: JsonObject? = null
            while (found == null) {
                val frame = incoming.receive()
                if (frame !is Frame.Text) continue
                val message = runCatching { json.parseToJsonElement(frame.readText()).jsonObject }.getOrNull()
                if (message?.get("type")?.jsonPrimitive?.content == type) found = message
            }
            found
        }

    @Test
    fun `an administrator renames a player, by the sign-up rule, and it is logged`() =
        testApplication {
            application { module(config()) }
            val admin = session("RudeLeft")
            val pat = user("Pat")

            assertEquals(HttpStatusCode.Forbidden, rename(session("Pat"), pat.userId, "Patty").status)
            val tooLong = rename(admin, pat.userId, "Thirteen chrs")
            assertEquals(HttpStatusCode.UnprocessableEntity, tooLong.status)
            assertTrue(tooLong.bodyAsText().contains("INVALID_DISPLAY_NAME"), tooLong.bodyAsText())
            assertEquals(HttpStatusCode.NotFound, rename(admin, UUID.randomUUID(), "Patty").status)

            val done = rename(admin, pat.userId, "  Patty ")
            assertEquals(HttpStatusCode.OK, done.status, done.bodyAsText())
            assertTrue(done.bodyAsText().contains("Pat is now Patty."), done.bodyAsText())
            val after = user("Pat")
            assertEquals("Patty", after.displayName)
            assertEquals("Pat", after.username, "the username must never change")

            val events = appender.list.map { it.formattedMessage }.filter { it.startsWith("auth event=") }
            assertTrue(
                events.any { it.contains("DISPLAY_NAME_CHANGED") && it.contains("by=RudeLeft") },
                "no DISPLAY_NAME_CHANGED by=RudeLeft: $events",
            )
            assertEquals("Patty", pending(pat.userId), "the player's notice should wait")
        }

    @Test
    fun `a player renamed while away is told once when they connect`() =
        testApplication {
            application { module(config()) }
            val pat = user("Pat")
            assertEquals(HttpStatusCode.OK, rename(session("RudeLeft"), pat.userId, "Patty").status)
            val client = createClient { install(ClientWebSockets) }
            val patToken = session("Pat").token

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$patToken") }) {
                val told = assertNotNull(await("RENAMED"), "no RENAMED on connect")
                assertEquals("Patty", told["displayName"]!!.jsonPrimitive.content)
            }
            assertNull(pending(pat.userId), "told, so the notice must be gone")
            assertNull(database().use { Renames(it.dataSource()).takeNotice(pat.userId) })
        }

    @Test
    fun `a player renamed while here is told at once`() =
        testApplication {
            application { module(config()) }
            val pat = user("Pat")
            val admin = session("RudeLeft")
            val client = createClient { install(ClientWebSockets) }
            val patToken = session("Pat").token

            client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$patToken") }) {
                await("PRESENCE")
                assertEquals(HttpStatusCode.OK, rename(admin, pat.userId, "Patty").status)
                val told = assertNotNull(await("RENAMED"), "no RENAMED while online")
                assertEquals("Patty", told["displayName"]!!.jsonPrimitive.content)
            }
            assertNull(pending(pat.userId), "told, so the notice must be gone")
        }

    @Test
    fun `an administrator renaming themselves is not told`() =
        testApplication {
            application { module(config()) }
            val me = user("RudeLeft")
            assertEquals(HttpStatusCode.OK, rename(session("RudeLeft"), me.userId, "Rude").status)
            assertEquals("Rude", user("RudeLeft").displayName)
            assertNull(pending(me.userId))
        }
}
