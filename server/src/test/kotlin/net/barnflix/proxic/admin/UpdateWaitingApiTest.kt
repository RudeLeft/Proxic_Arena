package net.barnflix.proxic.admin

import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
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
import kotlinx.serialization.json.boolean
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
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets

/**
 * Spec 0056 — "Update waiting", through the real server: the switch is an
 * administrator's (F-0056-E), every open page hears it change at once and
 * a page opened while it is on hears it on connect (F-0056-B), and the
 * Admin page is told which games are still running -- none, here, which
 * is the page's "safe to update now" (F-0056-C).
 */
class UpdateWaitingApiTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        Database.connect(config())!!.use { db ->
            db.migrate()
            val accounts = Accounts(db.dataSource())
            accounts.createUser("RudeLeft", password, Role.ADMIN)
            accounts.createUser("Pat", password, Role.PLAYER)
            accounts.createUser("Sam", password, Role.PLAYER)
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
            dataRoot = "build/test-update-waiting",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

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

    private suspend fun ApplicationTestBuilder.switch(
        session: Session,
        on: Boolean,
        csrf: Boolean = true,
    ): HttpResponse =
        client.post("/api/admin/update-waiting") {
            header(HttpHeaders.Cookie, "$SESSION_COOKIE=${session.token}; $CSRF_COOKIE=${session.csrf}")
            if (csrf) header(CSRF_HEADER, session.csrf)
            contentType(ContentType.Application.Json)
            setBody("""{"on":$on}""")
        }

    private suspend fun ApplicationTestBuilder.state(session: Session): HttpResponse =
        client.get("/api/admin/update-waiting") {
            header(HttpHeaders.Cookie, "$SESSION_COOKIE=${session.token}; $CSRF_COOKIE=${session.csrf}")
        }

    private val json = Json { ignoreUnknownKeys = true }

    /** Read frames until one of [type] arrives, or give up. */
    private suspend fun DefaultClientWebSocketSession.await(
        type: String,
        timeoutMillis: Long = 8_000,
    ): JsonObject? =
        withTimeoutOrNull(timeoutMillis) {
            var found: JsonObject? = null
            while (found == null) {
                val frame = incoming.receive() as? Frame.Text ?: continue
                val message = runCatching { json.parseToJsonElement(frame.readText()).jsonObject }.getOrNull()
                if (message?.get("type")?.jsonPrimitive?.content == type) found = message
            }
            found
        }

    @Test
    fun `only an administrator can switch it, and only with the CSRF token`() =
        testApplication {
            application { module(config()) }
            val pat = session("Pat")
            assertEquals(HttpStatusCode.Forbidden, switch(pat, on = true).status)
            assertEquals(HttpStatusCode.Forbidden, state(pat).status)
            val admin = session("RudeLeft")
            assertEquals(HttpStatusCode.Forbidden, switch(admin, on = true, csrf = false).status)
            // Nothing moved.
            assertTrue(state(admin).bodyAsText().contains("\"on\":false"))
        }

    @Test
    fun `every open page hears it switched on and off, and a new page hears it is on`() =
        testApplication {
            application { module(config()) }
            val wsClient = createClient { install(ClientWebSockets) }
            val admin = session("RudeLeft")
            val pat = session("Pat")
            val sam = session("Sam")

            // F-0056-C — no game is running: the page's "safe to update now".
            assertEquals("""{"on":false,"games":[]}""", state(admin).bodyAsText())

            wsClient.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=${pat.token}") }) {
                // The last thing a connection is sent on arrival: its welcome is done.
                assertNotNull(await("STANDINGS"))

                assertEquals(HttpStatusCode.OK, switch(admin, on = true).status)
                val switchedOn = assertNotNull(await("UPDATE_WAITING"), "not told it is on")
                assertEquals(true, switchedOn["on"]!!.jsonPrimitive.boolean)

                // A page opened while it waits is told on connect (another
                // player's, so Pat's page hears only the switch itself).
                wsClient.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=${sam.token}") }) {
                    val told = assertNotNull(await("UPDATE_WAITING"), "a new page was not told")
                    assertEquals(true, told["on"]!!.jsonPrimitive.boolean)
                }

                assertEquals(HttpStatusCode.OK, switch(admin, on = false).status)
                val switchedOff = assertNotNull(await("UPDATE_WAITING"), "not told it is off")
                assertEquals(false, switchedOff["on"]!!.jsonPrimitive.boolean)
            }
            assertTrue(state(admin).bodyAsText().contains("\"on\":false"))
        }
}
