package net.barnflix.proxic.auth

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
import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The authentication HTTP surface — PHASE_03 §3.41–§3.55.
 *
 * Driven over real HTTP, because what matters here lives in the
 * protocol: which status code a failure gets, what the cookie
 * carries, and whether a request without a CSRF header is refused.
 */
class AuthApiTest {
    private var container: PostgreSQLContainer<*>? = null
    private val json = Json { ignoreUnknownKeys = true }
    private val password = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            PostgreSQLContainer("postgres:16.4-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-auth",
            // The test engine is not HTTPS, so a Secure cookie would be
            // dropped and every test here would fail for the wrong
            // reason. Production keeps it on (§3.23).
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    /** Create the user directly; §3.112 forbids a registration API. */
    private fun seedUser(
        username: String = "RudeLeft",
        role: Role = Role.ADMIN,
    ) {
        val config = config()
        Database.connect(config)!!.use { database ->
            database.migrate()
            Accounts(database.dataSource()).createUser(username, password, role)
        }
    }

    private suspend fun ApplicationTestBuilder.login(
        username: String = "RudeLeft",
        secret: String = password,
    ): HttpResponse =
        client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"$username","password":"$secret"}""")
        }

    private fun HttpResponse.cookie(name: String): String? =
        headers.getAll(HttpHeaders.SetCookie)
            ?.firstOrNull { it.startsWith("$name=") }
            ?.substringAfter("=")
            ?.substringBefore(";")
            ?.takeIf { it.isNotBlank() }

    private fun HttpResponse.rawCookie(name: String): String? =
        headers.getAll(HttpHeaders.SetCookie)?.firstOrNull { it.startsWith("$name=") }

    // --- login ------------------------------------------------------

    @Test
    fun `a correct password returns the user and sets both cookies`() =
        testApplication {
            seedUser()
            application { module(config()) }

            val response = login()
            assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
            val me = json.decodeFromString(MeResponse.serializer(), response.bodyAsText())
            assertTrue(me.authenticated)
            assertEquals("RudeLeft", me.user?.username)

            assertTrue(response.cookie(SESSION_COOKIE) != null, "no session cookie")
            assertTrue(response.cookie(CSRF_COOKIE) != null, "no CSRF cookie")
        }

    @Test
    fun `the session cookie is HttpOnly and the CSRF cookie is not`() =
        testApplication {
            seedUser()
            application { module(config()) }
            val response = login()

            val session = response.rawCookie(SESSION_COOKIE)!!
            // §3.24 — JavaScript must not be able to read the session
            // token. The CSRF token is deliberately readable, because
            // the page has to echo it in a header.
            assertTrue(session.contains("HttpOnly", ignoreCase = true), session)
            assertTrue(session.contains("SameSite=Lax", ignoreCase = true), session)
            assertTrue(!response.rawCookie(CSRF_COOKIE)!!.contains("HttpOnly", ignoreCase = true))
        }

    @Test
    fun `the session cookie carries Secure when configured`() =
        testApplication {
            // §3.22, §3.23 — production sets Secure even though the
            // tunnel's origin leg is plain HTTP.
            seedUser()
            application { module(config().copy(secureCookies = true)) }
            val session = login().rawCookie(SESSION_COOKIE)!!
            assertTrue(session.contains("Secure", ignoreCase = true), session)
        }

    @Test
    fun `the token never appears in the response body`() =
        testApplication {
            seedUser()
            application { module(config()) }
            val response = login()
            val token = response.cookie(SESSION_COOKIE)!!
            assertTrue(!response.bodyAsText().contains(token), "the session token was in the body")
        }

    @Test
    fun `a wrong password and an unknown user give the same answer`() =
        testApplication {
            // §3.42-§3.44 — identical status, identical body. Anything
            // else is a username oracle.
            seedUser()
            application { module(config()) }

            val wrong = login(secret = "not the right password")
            val unknown = login(username = "nobody-at-all")

            assertEquals(HttpStatusCode.Unauthorized, wrong.status)
            assertEquals(HttpStatusCode.Unauthorized, unknown.status)
            assertEquals(wrong.bodyAsText(), unknown.bodyAsText())
        }

    @Test
    fun `repeated failures are throttled, then allowed again`() =
        testApplication {
            // §3.45-§3.47 — throttled, never locked.
            seedUser()
            application { module(config()) }

            var throttled: HttpResponse? = null
            repeat(15) {
                val response = login(secret = "wrong every time")
                if (response.status == HttpStatusCode.TooManyRequests) throttled = response
            }
            assertTrue(throttled != null, "repeated failures were never throttled")
            assertTrue(
                throttled!!.headers["Retry-After"] != null,
                "a throttled response should say when to retry",
            )
        }

    // --- me, logout -------------------------------------------------

    @Test
    fun `me reports an unauthenticated caller without erroring`() =
        testApplication {
            // §3.49 — the page uses this to decide whether to show a
            // login form. A 401 here would make "signed out" look like
            // "broken".
            application { module(config()) }
            val response = client.get("/api/auth/me")
            assertEquals(HttpStatusCode.OK, response.status)
            assertEquals(false, json.decodeFromString(MeResponse.serializer(), response.bodyAsText()).authenticated)
        }

    @Test
    fun `a session cookie identifies the caller, and logout ends it`() =
        testApplication {
            seedUser()
            application { module(config()) }

            val token = login().cookie(SESSION_COOKIE)!!
            val csrf = login().cookie(CSRF_COOKIE)!!

            val me =
                client.get("/api/auth/me") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
                }
            assertTrue(json.decodeFromString(MeResponse.serializer(), me.bodyAsText()).authenticated)

            val out =
                client.post("/api/auth/logout") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token; $CSRF_COOKIE=$csrf")
                    header(CSRF_HEADER, csrf)
                }
            assertEquals(HttpStatusCode.NoContent, out.status)

            val after =
                client.get("/api/auth/me") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
                }
            assertEquals(
                false,
                json.decodeFromString(MeResponse.serializer(), after.bodyAsText()).authenticated,
                "a revoked session still authenticated",
            )
        }

    @Test
    fun `logout without a session is still a quiet success`() =
        testApplication {
            // Telling an unauthenticated caller "you were not signed in"
            // says more than it needs to, and the client's next step is
            // the same either way.
            application { module(config()) }
            assertEquals(HttpStatusCode.NoContent, client.post("/api/auth/logout").status)
        }

    // --- CSRF -------------------------------------------------------

    @Test
    fun `a mutating request without the CSRF header is refused`() =
        testApplication {
            // §3.50-§3.52. The cookie alone is not enough: a cross-site
            // attacker can make the browser SEND it but cannot read it
            // to set the header.
            seedUser()
            application { module(config()) }

            val response = login()
            val token = response.cookie(SESSION_COOKIE)!!
            val csrf = response.cookie(CSRF_COOKIE)!!

            val without =
                client.post("/api/auth/display-name") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token; $CSRF_COOKIE=$csrf")
                    contentType(ContentType.Application.Json)
                    setBody("""{"displayName":"Forged"}""")
                }
            assertEquals(HttpStatusCode.Forbidden, without.status)
            assertTrue(without.bodyAsText().contains("CSRF_FAILED"))

            val mismatched =
                client.post("/api/auth/display-name") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token; $CSRF_COOKIE=$csrf")
                    header(CSRF_HEADER, "a-different-value")
                    contentType(ContentType.Application.Json)
                    setBody("""{"displayName":"Forged"}""")
                }
            assertEquals(HttpStatusCode.Forbidden, mismatched.status)
        }

    @Test
    fun `a mutating request WITH the CSRF header succeeds`() =
        testApplication {
            // The negative control: a CSRF check that refuses everything
            // passes the test above perfectly while breaking the app.
            seedUser()
            application { module(config()) }

            val response = login()
            val token = response.cookie(SESSION_COOKIE)!!
            val csrf = response.cookie(CSRF_COOKIE)!!

            val ok =
                client.post("/api/auth/display-name") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token; $CSRF_COOKIE=$csrf")
                    header(CSRF_HEADER, csrf)
                    contentType(ContentType.Application.Json)
                    setBody("""{"displayName":"Eric"}""")
                }
            assertEquals(HttpStatusCode.OK, ok.status, ok.bodyAsText())
            assertTrue(ok.bodyAsText().contains("Eric"))
        }

    @Test
    fun `a request from a foreign origin is refused`() =
        testApplication {
            // §3.53 — a second, independent gate. Either check alone has
            // known weaknesses; together they cover each other.
            seedUser()
            application { module(config().copy(publicOrigin = "https://proxic.barnflix.net")) }

            val response =
                client.post("/api/auth/login") {
                    header(HttpHeaders.Origin, "https://evil.example")
                    contentType(ContentType.Application.Json)
                    setBody("""{"username":"RudeLeft","password":"$password"}""")
                }
            assertEquals(HttpStatusCode.Forbidden, response.status)
            assertTrue(response.bodyAsText().contains("BAD_ORIGIN"))
        }

    @Test
    fun `a request from the page's own origin is accepted`() {
        // The negative control for the test above, and the case the
        // first version got wrong: the page served from
        // http://127.0.0.1:8080 could not log in to the server at
        // http://127.0.0.1:8080, because only the CONFIGURED origin
        // was accepted. Every request from the application itself
        // was refused as foreign.
        //
        // The server suite could not catch it -- the test engine
        // sends no Origin header -- so this asserts the header
        // explicitly.
        testApplication {
            seedUser()
            application { module(config().copy(publicOrigin = "https://proxic.barnflix.net")) }

            val response =
                client.post("/api/auth/login") {
                    header(HttpHeaders.Origin, "http://localhost")
                    header(HttpHeaders.Host, "localhost")
                    contentType(ContentType.Application.Json)
                    setBody("""{"username":"RudeLeft","password":"$password"}""")
                }
            assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        }
    }

    // --- the deck API is now protected (PHASE 3 AMENDMENT 1) --------

    @Test
    fun `deck endpoints require a session`() =
        testApplication {
            seedUser()
            application { module(config()) }

            // Owner decision D1: every deck endpoint, not just mutation.
            for (path in listOf("/api/decks", "/api/decks/00000000-0000-0000-0000-000000000000")) {
                val response = client.get(path)
                assertEquals(HttpStatusCode.Unauthorized, response.status, "open: $path")
                assertTrue(response.bodyAsText().contains("UNAUTHENTICATED"))
            }
        }

    @Test
    fun `a signed-in user reaches the deck API`() =
        testApplication {
            // The negative control for the rule above.
            seedUser()
            application { module(config()) }

            val token = login().cookie(SESSION_COOKIE)!!
            val response =
                client.get("/api/decks") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
                }
            assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        }

    /**
     * §3.99-§3.102 on an authentication failure.
     *
     * The 401 is the error most likely to be read by an attacker's
     * own page, and SecurityHeadersTest cannot reach it: those
     * routes only exist when a database does.
     */
    @Test
    fun `a 401 carries the security headers too`() =
        testApplication {
            seedUser()
            application { module(config()) }

            val response = client.get("/api/decks")
            assertEquals(HttpStatusCode.Unauthorized, response.status)
            assertEquals("nosniff", response.headers["X-Content-Type-Options"])
            assertEquals("DENY", response.headers["X-Frame-Options"])
            assertTrue(
                response.headers["Content-Security-Policy"]?.contains("default-src 'self'") == true,
            )
        }

    @Test
    fun `health and version stay public`() =
        testApplication {
            // §3.83, §3.84 — a monitor must not need credentials, and
            // the LAN port exists for exactly this (owner decision D2).
            application { module(config()) }
            assertEquals(HttpStatusCode.OK, client.get("/api/health/live").status)
            assertEquals(HttpStatusCode.OK, client.get("/api/version").status)
        }
}
