package net.barnflix.proxic.auth

import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.application.call
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The admin gate — PHASE_03 §3.19, §3.155 ("add admin-route helper").
 *
 * Tested against a route mounted here for the purpose, so the gate's
 * own shape is pinned apart from any one route. Phase 3 had no admin
 * HTTP surface at all; PHASE_07 §7.67's Admin API now stands on this
 * gate, and AdminApiTest proves every one of its routes refuses a
 * player.
 *
 * Its own file because `io.ktor.server.routing.get` and
 * `io.ktor.client.request.get` cannot both be imported, and the rest
 * of the auth API tests are clients.
 */
class AdminGateTest {
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
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-admin-gate",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun seed() {
        Database.connect(config())!!.use { database ->
            database.migrate()
            val accounts = Accounts(database.dataSource())
            accounts.createUser("RudeLeft", password, Role.ADMIN)
            accounts.createUser("Pat", password, Role.PLAYER)
        }
    }

    private suspend fun ApplicationTestBuilder.login(username: String): String =
        client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"$username","password":"$password"}""")
        }.let { response ->
            response.headers.getAll(HttpHeaders.SetCookie)!!
                .first { it.startsWith("$SESSION_COOKIE=") }
                .substringAfter("=")
                .substringBefore(";")
        }

    private suspend fun ApplicationTestBuilder.visitAdmin(token: String?): HttpResponse =
        client.request("/test-only/admin") {
            method = HttpMethod.Get
            if (token != null) header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
        }

    @Test
    fun `the admin gate admits an admin, refuses a player, and refuses nobody`() =
        testApplication {
            seed()
            application {
                val database = Database.connect(config())!!
                val sessions = Sessions(database.dataSource())
                module(config())
                routing {
                    get("/test-only/admin") {
                        val principal = call.requireAdmin(sessions) ?: return@get
                        call.respondText("hello ${principal.user.username}")
                    }
                }
            }

            // Nobody: 401, because signing in might help.
            assertEquals(HttpStatusCode.Unauthorized, visitAdmin(null).status)

            // A player: 403, because signing in again will not. The
            // distinction is the whole reason the helper exists
            // rather than a second requireAuth.
            assertEquals(HttpStatusCode.Forbidden, visitAdmin(login("Pat")).status)

            // An admin: through. Without this the test would pass
            // for a gate that refused everybody.
            val admitted = visitAdmin(login("RudeLeft"))
            assertEquals(HttpStatusCode.OK, admitted.status)
            assertTrue(admitted.bodyAsText().contains("RudeLeft"))
        }

    /**
     * §3.19 — the role comes from the SESSION, never from the client.
     *
     * A player who claims to be an admin, in every way a client can
     * claim anything, is still a player.
     */
    @Test
    fun `a player cannot claim the admin role`() =
        testApplication {
            seed()
            application {
                val database = Database.connect(config())!!
                val sessions = Sessions(database.dataSource())
                module(config())
                routing {
                    get("/test-only/admin") {
                        val principal = call.requireAdmin(sessions) ?: return@get
                        call.respondText("hello ${principal.user.username}")
                    }
                }
            }

            val player = login("Pat")
            val response =
                client.request("/test-only/admin") {
                    method = HttpMethod.Get
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$player")
                    header("X-Role", "ADMIN")
                    header("Role", "ADMIN")
                    header("X-User", "RudeLeft")
                }
            assertEquals(HttpStatusCode.Forbidden, response.status)
        }
}
