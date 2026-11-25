package net.barnflix.proxic.admin

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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.AccountStatus
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.CSRF_HEADER
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.module
import net.barnflix.proxic.room.RoomResult
import net.barnflix.proxic.room.RoomService
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.time.Instant
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * P11-E7 — the Admin page reads only the open tab's list, and its tiles and
 * tab counts from one small answer: the same numbers it counted itself from
 * all seven lists (admin.ts `overview`, `signInsByPerson`). Who may read it
 * is in AdminApiTest's every-route test.
 */
class AdminOverviewTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"

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
            val pat = accounts.createUser("Pat", password, Role.PLAYER)
            val sam = accounts.createUser("Sam", password, Role.PLAYER)
            accounts.setStatus(sam.userId, AccountStatus.DISABLED)
            val rooms = RoomService(db.dataSource(), DeckAuthorization(db.dataSource()))
            assertTrue(rooms.create(pat.userId, "Pat's table") is RoomResult.Ok)
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
            dataRoot = "build/test-admin-overview",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun database(): Database = Database.connect(config())!!.also { it.migrate() }

    private suspend fun ApplicationTestBuilder.signIn(
        username: String,
        secret: String = password,
    ): HttpResponse =
        client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"$username","password":"$secret"}""")
        }

    private suspend fun ApplicationTestBuilder.overview(
        cookies: String,
        csrf: String,
        query: String,
    ): HttpResponse =
        client.get("/api/admin/overview$query") {
            header(HttpHeaders.Cookie, cookies)
            header(CSRF_HEADER, csrf)
        }

    private fun numbers(body: String) = Json.parseToJsonElement(body) as JsonObject

    @Test
    fun `the overview counts what the lists hold, from the start of the viewer's day`() =
        testApplication {
            application { module(config()) }
            signIn("Pat", "a wrong password")
            signIn("nobody-here", "whatever it is")
            signIn("Pat")
            val admin = signIn("RudeLeft")

            fun cookie(name: String) =
                admin.headers.getAll(HttpHeaders.SetCookie)!!
                    .first { it.startsWith("$name=") }
                    .substringAfter("=").substringBefore(";")
            val csrf = cookie(CSRF_COOKIE)
            val cookies = "$SESSION_COOKIE=${cookie(SESSION_COOKIE)}; $CSRF_COOKIE=$csrf"
            val hourAgo = Instant.now().minusSeconds(3600)

            val today = overview(cookies, csrf, "?since=$hourAgo")
            assertEquals(HttpStatusCode.OK, today.status, today.bodyAsText())
            val n = numbers(today.bodyAsText())
            val expected =
                mapOf(
                    "accounts" to "2",
                    "disabled" to "1",
                    "rooms" to "1",
                    "playing" to "0",
                    "games" to "0",
                    "gamesToday" to "0",
                    // pat, nobody-here, rudeleft: by the name tried, in any case.
                    "signInNames" to "3",
                    "signedInToday" to "2",
                    "failedToday" to "2",
                    "reports" to "0",
                    "newReports" to "0",
                    "computers" to "0",
                )
            for ((key, value) in expected) assertEquals(value, n[key].toString(), key)
            assertTrue(n["server"].toString().contains("\"database\":\"PostgreSQL 16"), n.toString())

            // A day that began after every attempt counts none of them today;
            // the 24-hour list still names three.
            val tomorrow = Instant.now().plusSeconds(60)
            val later = numbers(overview(cookies, csrf, "?since=$tomorrow").bodyAsText())
            assertEquals("0", later["signedInToday"].toString())
            assertEquals("0", later["failedToday"].toString())
            assertEquals("3", later["signInNames"].toString())

            assertEquals(HttpStatusCode.BadRequest, overview(cookies, csrf, "").status)
            assertEquals(HttpStatusCode.BadRequest, overview(cookies, csrf, "?since=yesterday").status)
        }
}
