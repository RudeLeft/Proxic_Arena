package net.barnflix.proxic

import io.ktor.client.request.HttpRequestBuilder
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
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.CSRF_HEADER
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Spec 0118 -- the body limit counts every byte, on the real routes.
 *
 * Each body here is just over or exactly at its route's limit: what is
 * tested is where the line is, never how much a server can take.
 */
class BodyLimitApiTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"
    private val dataRoot = File("build/test-body-limit-api")

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        Database.connect(config())!!.use { database ->
            database.migrate()
            Accounts(database.dataSource()).createUser("Pat", password, Role.PLAYER)
        }
        dataRoot.deleteRecursively()
    }

    @AfterTest
    fun stop() {
        container?.stop()
        dataRoot.deleteRecursively()
    }

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

    private class Signed(val token: String, val csrf: String)

    private fun HttpResponse.cookie(name: String): String =
        headers.getAll(HttpHeaders.SetCookie)!!.first { it.startsWith("$name=") }
            .substringAfter("=").substringBefore(";")

    private suspend fun ApplicationTestBuilder.signIn(): Signed {
        val response =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"Pat","password":"$password"}""")
            }
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        return Signed(response.cookie(SESSION_COOKIE), response.cookie(CSRF_COOKIE))
    }

    private fun HttpRequestBuilder.authed(who: Signed) {
        header(HttpHeaders.Cookie, "$SESSION_COOKIE=${who.token}; $CSRF_COOKIE=${who.csrf}")
        header(CSRF_HEADER, who.csrf)
    }

    private suspend fun HttpResponse.errorCode(): String? =
        runCatching { Json.parseToJsonElement(bodyAsText()).jsonObject["errorCode"]?.jsonPrimitive?.content }
            .getOrNull()

    private suspend fun HttpResponse.assertTooLarge(what: String) {
        val text = bodyAsText()
        assertEquals(HttpStatusCode.PayloadTooLarge, status, "$what: $text")
        assertEquals("BODY_TOO_LARGE", errorCode(), text)
        assertTrue(text.contains("\"That was too much to send at once.\""), text)
    }

    private val deviceLink = "/api/auth/device-link"
    private val wrongCode = """{"code":"NOT-A-CODE","deviceName":"Pat's desktop"}"""

    /** F-0118-A: the outside test's case -- chunked, just over 1 MB -- now 413, not 410. */
    @Test
    fun `device link refuses a chunked body one byte over its limit`() =
        testApplication {
            application { module(config()) }
            val limit = Limits.bodyLimitFor(deviceLink)
            client.post(deviceLink) { setBody(ChunkedBody(ChunkedBody.padded(wrongCode, limit + 1))) }
                .assertTooLarge("chunked, limit + 1")
        }

    /** F-0118-B: exactly at the limit, the route reads it and answers as it always did. */
    @Test
    fun `device link reads a chunked body exactly at its limit`() =
        testApplication {
            application { module(config()) }
            val limit = Limits.bodyLimitFor(deviceLink)
            val response = client.post(deviceLink) { setBody(ChunkedBody(ChunkedBody.padded(wrongCode, limit))) }
            assertEquals(HttpStatusCode.Gone, response.status, response.bodyAsText())
            assertEquals("CODE_INVALID", response.errorCode())
        }

    /** F-0118-C: a declared length over the limit is refused first, as before. */
    @Test
    fun `device link still refuses a declared length over its limit`() =
        testApplication {
            application { module(config()) }
            val limit = Limits.bodyLimitFor(deviceLink)
            client.post(deviceLink) {
                contentType(ContentType.Application.Json)
                setBody(String(ChunkedBody.padded(wrongCode, limit + 1)))
            }.assertTooLarge("declared, limit + 1")
        }

    /** F-0118-D: a real link, as the Deck Builder sends it, still works -- declared or chunked. */
    @Test
    fun `a real device link still works`() =
        testApplication {
            application { module(config()) }
            val pat = signIn()
            repeat(2) { attempt ->
                val made = client.post("/api/auth/device-codes") { authed(pat) }
                assertEquals(HttpStatusCode.OK, made.status, made.bodyAsText())
                val code = Json.parseToJsonElement(made.bodyAsText()).jsonObject["code"]!!.jsonPrimitive.content
                val body = """{"code":"$code","deviceName":"Pat's desktop"}"""
                val linked =
                    client.post(deviceLink) {
                        if (attempt == 0) {
                            contentType(ContentType.Application.Json)
                            setBody(body)
                        } else {
                            setBody(ChunkedBody(body.toByteArray()))
                        }
                    }
                assertEquals(HttpStatusCode.Created, linked.status, linked.bodyAsText())
            }
        }

    /** F-0118-A/B on a second route with its own limit: a problem report, 5 MB. */
    @Test
    fun `the report route counts against its own 5 MB limit`() =
        testApplication {
            application { module(config()) }
            val pat = signIn()
            val limit = Limits.bodyLimitFor("/api/reports")
            assertEquals(Limits.REPORT_BODY_BYTES, limit)
            // Says nothing happened, so the route refuses it as a report (422)
            // and nothing is saved; that answer means the body was read whole.
            val empty = """{"kind":"PROBLEM","answers":{"happened":"  "}}"""

            client.post("/api/reports") {
                authed(pat)
                setBody(ChunkedBody(ChunkedBody.padded(empty, limit + 1)))
            }.assertTooLarge("report, chunked, limit + 1")

            val atLimit =
                client.post("/api/reports") {
                    authed(pat)
                    setBody(ChunkedBody(ChunkedBody.padded(empty, limit)))
                }
            assertEquals(HttpStatusCode.UnprocessableEntity, atLimit.status, atLimit.bodyAsText())

            // Over the GLOBAL limit but under the report's: the route's limit is the one used.
            val overGlobal =
                client.post("/api/reports") {
                    authed(pat)
                    setBody(ChunkedBody(ChunkedBody.padded(empty, Limits.MAX_HTTP_BODY_BYTES + 1)))
                }
            assertEquals(HttpStatusCode.UnprocessableEntity, overGlobal.status, overGlobal.bodyAsText())
        }

    /**
     * F-0118-E: the deck import keeps its 150 MB. A 2 MB upload (twice the
     * global limit) sent chunked as multipart is read by the route, which
     * answers for itself: it isn't a deck package.
     */
    @Test
    fun `the deck import route keeps its bigger limit`() =
        testApplication {
            application { module(config()) }
            val pat = signIn()
            val boundary = "proxic-0118-boundary"
            val junk = ByteArray(2 * 1024 * 1024) { (it % 251).toByte() }
            val multipart =
                (
                    "--$boundary\r\n" +
                        "Content-Disposition: form-data; name=\"package\"; filename=\"junk.zip\"\r\n" +
                        "Content-Type: application/zip\r\n\r\n"
                ).toByteArray() + junk + "\r\n--$boundary--\r\n".toByteArray()
            val response =
                client.post("/api/decks/import") {
                    authed(pat)
                    setBody(ChunkedBody(multipart, ContentType.MultiPart.FormData.withParameter("boundary", boundary)))
                }
            val text = response.bodyAsText()
            assertNotEquals(HttpStatusCode.PayloadTooLarge, response.status, text)
            assertNotEquals("NO_FILE", response.errorCode(), "the upload must have reached the route: $text")
            assertTrue(response.status.value in 400..499, "the route's own refusal of a non-package: $text")
        }
}
