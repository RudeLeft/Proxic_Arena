package net.barnflix.proxic.auth

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.request
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
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Spec 0014 — invitations over HTTP: who may invite, and what a stranger with a link may do. */
class InviteApiTest {
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
            accounts.createUser("RudeLeft", password, Role.ADMIN)
            accounts.createUser("Pat", password, Role.PLAYER)
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
            dataRoot = "build/test-invite-api",
            secureCookies = false,
            sessionSecretValue = "test-only-session-secret-0123456789abcdef",
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private class Signed(val token: String, val csrf: String)

    private fun HttpResponse.cookie(name: String): String =
        headers.getAll(HttpHeaders.SetCookie)!!.first { it.startsWith("$name=") }
            .substringAfter("=").substringBefore(";")

    private suspend fun ApplicationTestBuilder.signIn(username: String): Signed {
        val response =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }
        return Signed(response.cookie(SESSION_COOKIE), response.cookie(CSRF_COOKIE))
    }

    private suspend fun ApplicationTestBuilder.invite(
        who: Signed,
        email: String,
    ): HttpResponse =
        client.post("/api/admin/invites") {
            header(HttpHeaders.Cookie, "$SESSION_COOKIE=${who.token}; $CSRF_COOKIE=${who.csrf}")
            header(CSRF_HEADER, who.csrf)
            contentType(ContentType.Application.Json)
            setBody("""{"email":"$email","role":"PLAYER"}""")
        }

    private suspend fun ApplicationTestBuilder.anonymous(
        path: String,
        body: String,
    ): HttpResponse =
        client.post(path) {
            contentType(ContentType.Application.Json)
            setBody(body)
        }

    @Test
    fun `an administrator invites, and a stranger with the link makes the account and is signed in`() =
        testApplication {
            application { module(config()) }
            val sent = invite(signIn("RudeLeft"), "sam@example.com")
            assertEquals(HttpStatusCode.Created, sent.status, sent.bodyAsText())
            val body = Json.parseToJsonElement(sent.bodyAsText()).jsonObject
            // No email account in a test: not emailed, and the link to copy instead.
            assertEquals("false", body["emailed"]!!.jsonPrimitive.content)
            val link = body["link"]!!.jsonPrimitive.content
            assertTrue(link.contains("/join#"), "the code is after #: $link")
            val code = link.substringAfter("#")

            val peek = anonymous("/api/auth/join/peek", """{"token":"$code"}""")
            assertEquals(HttpStatusCode.OK, peek.status, "a stranger may ask about a live link")
            assertTrue(peek.bodyAsText().contains("\"suggestedUsername\":\"sam\""), peek.bodyAsText())

            val joined =
                anonymous(
                    "/api/auth/join",
                    """{"token":"$code","username":"sam","displayName":"Sam","password":"$password"}""",
                )
            assertEquals(HttpStatusCode.Created, joined.status, joined.bodyAsText())
            val session = joined.cookie(SESSION_COOKIE)
            val me = client.get("/api/auth/me") { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$session") }
            assertTrue(me.bodyAsText().contains("\"username\":\"sam\""), "signed in as the new account")

            // Spent: the same answer as a made-up link.
            val again = anonymous("/api/auth/join/peek", """{"token":"$code"}""")
            assertEquals(HttpStatusCode.Gone, again.status)
            assertTrue(again.bodyAsText().contains("INVITE_INVALID"), again.bodyAsText())
        }

    @Test
    fun `a player cannot invite, and a stranger gets nothing else`() =
        testApplication {
            application { module(config()) }
            assertEquals(HttpStatusCode.Forbidden, invite(signIn("Pat"), "x@example.com").status)
            // The gate still closes the Admin API to a stranger.
            assertEquals(HttpStatusCode.Unauthorized, anonymous("/api/admin/invites", "{}").status)
            assertEquals(HttpStatusCode.Gone, anonymous("/api/auth/join/peek", """{"token":"nope"}""").status)
        }

    @Test
    fun `guessing at links is slowed down like signing in`() =
        testApplication {
            application { module(config()) }
            val answers = (1..12).map { anonymous("/api/auth/join/peek", """{"token":"guess-$it"}""").status }
            assertFalse(answers.take(10).contains(HttpStatusCode.TooManyRequests), "$answers")
            assertEquals(HttpStatusCode.TooManyRequests, answers.last())
        }

    // --- the Email tab (amendment 1) ---------------------------------------

    private suspend fun ApplicationTestBuilder.asAdmin(
        who: Signed,
        method: io.ktor.http.HttpMethod,
        path: String,
        body: String? = null,
    ): HttpResponse =
        client.request(path) {
            this.method = method
            header(HttpHeaders.Cookie, "$SESSION_COOKIE=${who.token}; $CSRF_COOKIE=${who.csrf}")
            header(CSRF_HEADER, who.csrf)
            if (body != null) {
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        }

    @Test
    fun `the Email tab saves the account, never sends the password back, and a failed test says why`() =
        testApplication {
            application { module(config()) }
            val admin = signIn("RudeLeft")
            val secret = "zzzz-app-password-zzzz"
            // An address nothing listens on, so the test send fails at once.
            val settings =
                """{"host":"127.0.0.1","port":1,"security":"starttls","username":"me@example.com",""" +
                    """"from":"Proxic Arena <me@example.com>","password":"$secret"}"""
            val saved = asAdmin(admin, io.ktor.http.HttpMethod.Put, "/api/admin/email", settings)
            assertEquals(HttpStatusCode.OK, saved.status, saved.bodyAsText())
            assertFalse(saved.bodyAsText().contains(secret), "the password never comes back")
            assertTrue(saved.bodyAsText().contains("\"passwordSaved\":true"))

            val read = asAdmin(admin, io.ktor.http.HttpMethod.Get, "/api/admin/email")
            assertFalse(read.bodyAsText().contains(secret))
            val invites = asAdmin(admin, io.ktor.http.HttpMethod.Get, "/api/admin/invites")
            assertTrue(invites.bodyAsText().contains("\"emailReady\":true"), "the Email tab's account is used")

            val test =
                asAdmin(admin, io.ktor.http.HttpMethod.Post, "/api/admin/email/test", """{"to":"me@example.com"}""")
            assertTrue(test.bodyAsText().contains("\"sent\":false"), test.bodyAsText())
            assertTrue(test.bodyAsText().contains("Couldn't reach the email server"), test.bodyAsText())
            assertFalse(test.bodyAsText().contains(secret))

            // A player gets nothing; removing goes back to no email.
            val player = asAdmin(signIn("Pat"), io.ktor.http.HttpMethod.Get, "/api/admin/email")
            assertEquals(HttpStatusCode.Forbidden, player.status)
            val removed = asAdmin(admin, io.ktor.http.HttpMethod.Delete, "/api/admin/email")
            assertTrue(removed.bodyAsText().contains("\"source\":\"NONE\""), removed.bodyAsText())
        }
}
