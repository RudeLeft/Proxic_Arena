package net.barnflix.proxic.auth

import io.ktor.client.request.delete
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
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.BuildInfo
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.deck.DeckRules
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Spec 0021 — linking a computer, and the deck rules it may download, over HTTP. */
class DeviceLinkApiTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"
    private val dataRoot = File("build/test-device-link-api")

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        Database.connect(config())!!.use { database ->
            database.migrate()
            val accounts = Accounts(database.dataSource())
            accounts.createUser("Pat", password, Role.PLAYER)
            accounts.createUser("Sam", password, Role.PLAYER)
        }
        // A pool already kept for this Forge, so no worker is needed: the
        // route serves what DeckRules assembles from it.
        dataRoot.deleteRecursively()
        File(dataRoot, "deck-rules").mkdirs()
        File(dataRoot, "deck-rules/pool-r${DeckRules.POOL_REVISION}-${BuildInfo.FORGE_COMMIT}.json").writeText(
            """{"cards":[{"name":"Lightning Bolt","faces":["Lightning Bolt"],"printings":["M10 146"]}],""" +
                """"editions":[{"code":"M10","code2":"M10","scryfallCode":"m10","type":"CORE"}],""" +
                """"setCodes":{"M10":"M10"}}""",
        )
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = dataRoot.path,
            secureCookies = false,
            sessionSecretValue = "test-only-session-secret-0123456789abcdef",
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private class Signed(val token: String, val csrf: String) {
        val cookies get() = "$SESSION_COOKIE=$token; $CSRF_COOKIE=$csrf"
    }

    private fun HttpResponse.cookie(name: String): String =
        headers.getAll(HttpHeaders.SetCookie)!!.first { it.startsWith("$name=") }
            .substringAfter("=").substringBefore(";")

    private fun HttpResponse.field(name: String): String =
        Json.parseToJsonElement(
            kotlinx.coroutines.runBlocking { bodyAsText() },
        ).jsonObject[name]!!.jsonPrimitive.content

    private suspend fun ApplicationTestBuilder.signIn(username: String): Signed {
        val response =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }
        return Signed(response.cookie(SESSION_COOKIE), response.cookie(CSRF_COOKIE))
    }

    private suspend fun ApplicationTestBuilder.makeCode(who: Signed): String {
        val response =
            client.post("/api/auth/device-codes") {
                header(HttpHeaders.Cookie, who.cookies)
                header(CSRF_HEADER, who.csrf)
            }
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        return response.field("code")
    }

    private suspend fun ApplicationTestBuilder.link(code: String): HttpResponse =
        client.post("/api/auth/device-link") {
            contentType(ContentType.Application.Json)
            setBody("""{"code":"$code","deviceName":"Pat's desktop"}""")
        }

    private suspend fun ApplicationTestBuilder.rules(token: String?): HttpResponse =
        client.get("/api/deck-rules") { token?.let { header(HttpHeaders.Authorization, "Bearer $it") } }

    @Test
    fun `a code links a computer, whose token downloads the deck rules and opens nothing else`() =
        testApplication {
            application { module(config()) }
            val pat = signIn("Pat")
            val code = makeCode(pat)
            assertTrue(Regex("^[A-Z2-9]{4}-[A-Z2-9]{4}$").matches(code), code)

            val linked = link(code.lowercase())
            assertEquals(HttpStatusCode.Created, linked.status, linked.bodyAsText())
            val token = linked.field("token")
            assertTrue(linked.bodyAsText().contains("\"username\":\"Pat\""), linked.bodyAsText())

            // F-0021-E: nobody, 401; the token, 200 and the document.
            assertEquals(HttpStatusCode.Unauthorized, rules(null).status)
            assertEquals(HttpStatusCode.Unauthorized, rules("not-a-token").status)
            val served = rules(token)
            assertEquals(HttpStatusCode.OK, served.status, served.bodyAsText())
            val document = Json.parseToJsonElement(served.bodyAsText()).jsonObject
            assertEquals("65", document["format"]!!.jsonObject["maxCards"]!!.jsonPrimitive.content)
            assertEquals(1, document["cards"]!!.jsonArray.size)
            val etag = served.headers[HttpHeaders.ETag]!!
            assertEquals("\"${document["rulesVersion"]!!.jsonPrimitive.content}\"", etag)

            // The same version again: 304, nothing re-sent.
            val again =
                client.get("/api/deck-rules") {
                    header(HttpHeaders.Authorization, "Bearer $token")
                    header(HttpHeaders.IfNoneMatch, etag)
                }
            assertEquals(HttpStatusCode.NotModified, again.status)

            // A signed-in browser may read them too.
            val browser = client.get("/api/deck-rules") { header(HttpHeaders.Cookie, pat.cookies) }
            assertEquals(HttpStatusCode.OK, browser.status)

            // The token opens nothing else.
            for (path in listOf("/api/decks", "/api/auth/devices", "/api/rooms")) {
                val other = client.get(path) { header(HttpHeaders.Authorization, "Bearer $token") }
                assertEquals(HttpStatusCode.Unauthorized, other.status, "$path with a device token")
            }
        }

    @Test
    fun `a code works once, and a wrong code reads the same as a used one`() =
        testApplication {
            application { module(config()) }
            val code = makeCode(signIn("Pat"))
            assertEquals(HttpStatusCode.Created, link(code).status)
            val reused = link(code)
            val wrong = link("ABCD-EFGH")
            assertEquals(HttpStatusCode.Gone, reused.status)
            assertEquals(HttpStatusCode.Gone, wrong.status)
            assertEquals(reused.bodyAsText(), wrong.bodyAsText())
        }

    @Test
    fun `a new code replaces the last unused one`() =
        testApplication {
            application { module(config()) }
            val pat = signIn("Pat")
            val first = makeCode(pat)
            val second = makeCode(pat)
            assertEquals(HttpStatusCode.Gone, link(first).status)
            assertEquals(HttpStatusCode.Created, link(second).status)
        }

    @Test
    fun `linking is throttled like signing in`() =
        testApplication {
            application { module(config()) }
            repeat(10) { assertEquals(HttpStatusCode.Gone, link("ZZZZ-ZZZZ").status) }
            val throttled = link("ZZZZ-ZZZZ")
            assertEquals(HttpStatusCode.TooManyRequests, throttled.status)
            assertTrue(throttled.headers["Retry-After"] != null)
        }

    @Test
    fun `the account page lists your computers, and Remove ends one at once`() =
        testApplication {
            application { module(config()) }
            val pat = signIn("Pat")
            val token = link(makeCode(pat)).field("token")
            val listed = client.get("/api/auth/devices") { header(HttpHeaders.Cookie, pat.cookies) }
            val devices = Json.parseToJsonElement(listed.bodyAsText()).jsonObject["devices"]!!.jsonArray
            assertEquals(1, devices.size)
            assertEquals("Pat's desktop", devices[0].jsonObject["name"]!!.jsonPrimitive.content)
            val deviceId = devices[0].jsonObject["deviceId"]!!.jsonPrimitive.content

            // Somebody else's Remove finds nothing.
            val sam = signIn("Sam")
            val foreign =
                client.delete("/api/auth/devices/$deviceId") {
                    header(HttpHeaders.Cookie, sam.cookies)
                    header(CSRF_HEADER, sam.csrf)
                }
            assertEquals(HttpStatusCode.NotFound, foreign.status)
            assertEquals(HttpStatusCode.OK, rules(token).status)

            val removed =
                client.delete("/api/auth/devices/$deviceId") {
                    header(HttpHeaders.Cookie, pat.cookies)
                    header(CSRF_HEADER, pat.csrf)
                }
            assertEquals(HttpStatusCode.NoContent, removed.status)
            assertEquals(HttpStatusCode.Unauthorized, rules(token).status)
            val after = client.get("/api/auth/devices") { header(HttpHeaders.Cookie, pat.cookies) }
            assertFalse(after.bodyAsText().contains(deviceId))
        }

    @Test
    fun `signing out everywhere ends a linked computer too`() =
        testApplication {
            application { module(config()) }
            val pat = signIn("Pat")
            val token = link(makeCode(pat)).field("token")
            assertEquals(HttpStatusCode.OK, rules(token).status)
            val out =
                client.post("/api/auth/logout-all") {
                    header(HttpHeaders.Cookie, pat.cookies)
                    header(CSRF_HEADER, pat.csrf)
                }
            assertEquals(HttpStatusCode.OK, out.status, out.bodyAsText())
            assertEquals(HttpStatusCode.Unauthorized, rules(token).status)
        }

    @Test
    fun `making a code needs a session and the page's CSRF token`() =
        testApplication {
            application { module(config()) }
            val pat = signIn("Pat")
            val noCsrf = client.post("/api/auth/device-codes") { header(HttpHeaders.Cookie, pat.cookies) }
            assertEquals(HttpStatusCode.Forbidden, noCsrf.status)
            val nobody = client.post("/api/auth/device-codes")
            assertEquals(HttpStatusCode.Unauthorized, nobody.status)
        }
}
