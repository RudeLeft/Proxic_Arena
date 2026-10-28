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
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.module
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.MigrationVersion
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Spec 0026 — password reset by email: the link, its limits, the page, the notices. */
class PasswordResetTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"
    private val newPassword = "a brand new passphrase"

    /** What the fake mail account was asked to send. */
    private class Sent(val to: String, val subject: String, val text: String, val html: String)

    private val outbox = mutableListOf<Sent>()
    private var mailWorks = true
    private val mailer =
        Mailer { to, subject, text, html, _ ->
            if (mailWorks) {
                outbox += Sent(to, subject, text, html)
                Delivery.Sent
            } else {
                Delivery.Failed("The email server refused the message.")
            }
        }
    private var now = Instant.parse("2026-10-28T20:00:00Z")

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-password-reset",
            secureCookies = false,
            sessionSecretValue = "test-only-session-secret-0123456789abcdef",
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun <T> withAccounts(block: (Database, Accounts) -> T): T =
        Database.connect(config())!!.use { database ->
            database.migrate()
            val accounts = Accounts(database.dataSource())
            if (accounts.findByUsername("Pat") == null) {
                accounts.createUser("RudeLeft", password, Role.ADMIN)
                accounts.createUser("Pat", password, Role.PLAYER)
            }
            block(database, accounts)
        }

    private fun desk(
        database: Database,
        accounts: Accounts,
        ready: Boolean = true,
    ): ResetDesk {
        val sessions = Sessions(database.dataSource())
        return ResetDesk(
            PasswordResets(database.dataSource(), accounts, sessions) { now },
            EmailAddresses(database.dataSource()),
            mailer,
            { ready },
            "https://arena.example.org",
        ) { now }
    }

    private fun pat(accounts: Accounts): UUID = accounts.findByUsername("Pat")!!.userId

    /** The code after "#" in the last email's link. */
    private fun lastCode(): String = Regex("/reset#([A-Za-z0-9_-]+)").find(outbox.last().text)!!.groupValues[1]

    @Test
    fun `F-0026-A invited accounts take their invitation's address, at migration and on joining`() {
        val dataSource =
            org.postgresql.ds.PGSimpleDataSource().apply {
                setUrl(container!!.jdbcUrl)
                user = container!!.username
                password = container!!.password
            }
        Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
            .target(MigrationVersion.fromVersion("25")).load().migrate()
        val accounts = Accounts(dataSource)
        val admin = accounts.createUser("RudeLeft", password, Role.ADMIN)
        val sam = accounts.createUser("Sam", password, Role.PLAYER)
        accounts.createUser("Old", password, Role.PLAYER)
        dataSource.connection.use { c ->
            c.createStatement().executeUpdate(
                """
                INSERT INTO account_invite (invite_id, token_hash, email, role, invited_by, expires_at, used_at, used_by)
                VALUES ('${UUID.randomUUID()}', 'h1', 'sam.old@example.com', 'PLAYER', '${admin.userId}', now(),
                        now() - interval '2 days', '${sam.userId}'),
                       ('${UUID.randomUUID()}', 'h2', 'sam@example.com', 'PLAYER', '${admin.userId}', now(),
                        now() - interval '1 day', '${sam.userId}')
                """.trimIndent(),
            )
        }
        Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate()
        assertEquals("sam@example.com", EmailAddresses(dataSource).of(sam.userId), "the newest invitation's address")
        assertNull(EmailAddresses(dataSource).of(accounts.findByUsername("Old")!!.userId), "no invitation, no address")

        val invites = accounts.invites()
        val invite = invites.create("Kim@Example.com", Role.PLAYER, admin.userId)!!
        val joined = invites.join(invite.token, "kim", "Kim", password)
        assertIs<JoinResult.Joined>(joined)
        assertEquals("kim@example.com", EmailAddresses(dataSource).of(joined.user.userId))
    }

    @Test
    fun `F-0026-B a link works once, for an hour, and a newer reset or a password change ends it`() =
        withAccounts { database, accounts ->
            val desk = desk(database, accounts)
            EmailAddresses(database.dataSource()).set(pat(accounts), "pat@example.com")
            assertIs<ResetSend.Sent>(desk.send(pat(accounts), null))
            val first = lastCode()

            // Only the hash is stored.
            database.dataSource().connection.use { c ->
                c.createStatement().executeQuery("SELECT token_hash FROM password_reset").use { rows ->
                    rows.next()
                    assertEquals(SessionTokens.hash(first), rows.getString(1))
                    assertFalse(rows.getString(1).contains(first))
                }
            }

            assertEquals("Pat", desk.resets.peek(first))
            now = now.plus(Duration.ofMinutes(61))
            assertNull(desk.resets.peek(first), "an hour and a minute later")
            assertEquals(ResetResult.Invalid, desk.resets.redeem(first, newPassword))

            assertIs<ResetSend.Sent>(desk.send(pat(accounts), null))
            val second = lastCode()
            now = now.plus(Duration.ofMinutes(6))
            assertIs<ResetSend.Sent>(desk.send(pat(accounts), null))
            val third = lastCode()
            assertNull(desk.resets.peek(second), "a newer reset ends the older link")

            accounts.changePassword(pat(accounts), "changed on the Account page")
            assertNull(desk.resets.peek(third), "a password change ends the link")

            now = now.plus(Duration.ofMinutes(6))
            assertIs<ResetSend.Sent>(desk.send(pat(accounts), null))
            val fourth = lastCode()
            assertIs<ResetResult.Refused>(desk.resets.redeem(fourth, "short"), "a weak password keeps the link")
            assertIs<ResetResult.Done>(desk.resets.redeem(fourth, newPassword))
            assertEquals(ResetResult.Invalid, desk.resets.redeem(fourth, "and another passphrase"), "once only")
            assertTrue(accounts.login("Pat", newPassword) is LoginResult.Success)
        }

    @Test
    fun `F-0026-C resets are limited, and refused with the reason when they can't be sent`() =
        withAccounts { database, accounts ->
            val desk = desk(database, accounts)
            val refused = desk.send(pat(accounts), null)
            assertEquals("NO_EMAIL", (refused as ResetSend.Refused).code)

            EmailAddresses(database.dataSource()).set(pat(accounts), "pat@example.com")
            assertEquals(
                "EMAIL_NOT_SET_UP",
                (desk(database, accounts, ready = false).send(pat(accounts), null) as ResetSend.Refused).code,
            )

            mailWorks = false
            assertEquals("EMAIL_FAILED", (desk.send(pat(accounts), null) as ResetSend.Refused).code)
            assertEquals(0, desk.resets.sentSince(pat(accounts), now.minusSeconds(60)), "an unsent link is forgotten")
            mailWorks = true

            val sent = desk.send(pat(accounts), null)
            assertEquals(ResetSend.Sent("p•••@example.com"), sent)
            assertEquals("TOO_SOON", (desk.send(pat(accounts), null) as ResetSend.Refused).code)
            repeat(4) {
                now = now.plus(Duration.ofMinutes(6))
                assertIs<ResetSend.Sent>(desk.send(pat(accounts), null))
            }
            now = now.plus(Duration.ofMinutes(6))
            assertEquals("TOO_MANY", (desk.send(pat(accounts), null) as ResetSend.Refused).code)

            accounts.setStatus(pat(accounts), AccountStatus.DISABLED)
            now = now.plus(Duration.ofDays(2))
            assertEquals("ACCOUNT_DISABLED", (desk.send(pat(accounts), null) as ResetSend.Refused).code)
        }

    private suspend fun ApplicationTestBuilder.anonymous(
        path: String,
        body: String,
    ): HttpResponse =
        client.post(path) {
            contentType(ContentType.Application.Json)
            setBody(body)
        }

    private fun HttpResponse.cookie(name: String): String =
        headers.getAll(HttpHeaders.SetCookie)!!.first { it.startsWith("$name=") }
            .substringAfter("=").substringBefore(";")

    @Test
    fun `F-0026-D the link's page sets the password, ends every session and signs the player in`() =
        testApplication {
            now = Instant.now() // the server reads this link with its own clock
            val code =
                withAccounts { database, accounts ->
                    EmailAddresses(database.dataSource()).set(pat(accounts), "pat@example.com")
                    assertIs<ResetSend.Sent>(desk(database, accounts).send(pat(accounts), null))
                    lastCode()
                }
            application { module(config()) }
            val before = anonymous("/api/auth/login", """{"username":"Pat","password":"$password"}""")
            val oldSession = before.cookie(SESSION_COOKIE)

            assertEquals(HttpStatusCode.Gone, anonymous("/api/auth/reset/peek", """{"token":"made-up"}""").status)
            val peek = anonymous("/api/auth/reset/peek", """{"token":"$code"}""")
            assertEquals(HttpStatusCode.NoContent, peek.status, "a stranger with the link may ask if it works")
            assertEquals("", peek.bodyAsText(), "and is not told whose account it is (owner 2026-10-28)")

            val weak = anonymous("/api/auth/reset", """{"token":"$code","password":"short"}""")
            assertEquals(HttpStatusCode.UnprocessableEntity, weak.status)
            val done = anonymous("/api/auth/reset", """{"token":"$code","password":"$newPassword"}""")
            assertEquals(HttpStatusCode.OK, done.status, done.bodyAsText())
            val signedIn = done.cookie(SESSION_COOKIE)
            val me = client.get("/api/auth/me") { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$signedIn") }
            assertTrue(me.bodyAsText().contains("\"username\":\"Pat\""), "signed in")
            val stale = client.get("/api/auth/me") { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$oldSession") }
            assertEquals(HttpStatusCode.NoContent, stale.status, "the old session ended")

            val replay = anonymous("/api/auth/reset", """{"token":"$code","password":"$newPassword"}""")
            assertEquals(HttpStatusCode.Gone, replay.status, "once only")
            val signIn = anonymous("/api/auth/login", """{"username":"Pat","password":"$newPassword"}""")
            assertEquals(HttpStatusCode.OK, signIn.status)
        }

    @Test
    fun `F-0026-D the player is told the password changed, and the old address is told of a new one`() =
        withAccounts { database, accounts ->
            val desk = desk(database, accounts)
            val user = accounts.findByUsername("Pat")!!
            desk.passwordChanged(user)
            assertTrue(outbox.isEmpty(), "no address, no notice")
            EmailAddresses(database.dataSource()).set(user.userId, "pat@example.com")
            desk.passwordChanged(user)
            assertEquals("Your Proxic Arena password was changed", outbox.last().subject)
            assertEquals("pat@example.com", outbox.last().to)
            desk.emailChanged(user, "pat.old@example.com")
            assertEquals("pat.old@example.com", outbox.last().to)
            assertEquals("Your Proxic Arena email address was changed", outbox.last().subject)
        }

    @Test
    fun `F-0026-F the player changes their address only with their password`() =
        testApplication {
            withAccounts { _, _ -> }
            application { module(config()) }
            val login = anonymous("/api/auth/login", """{"username":"Pat","password":"$password"}""")
            val session = login.cookie(SESSION_COOKIE)
            val csrf = login.cookie(CSRF_COOKIE)

            suspend fun change(body: String) =
                client.post("/api/auth/email") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$session; $CSRF_COOKIE=$csrf")
                    header(CSRF_HEADER, csrf)
                    contentType(ContentType.Application.Json)
                    setBody(body)
                }

            val none = client.get("/api/auth/email") { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$session") }
            assertEquals("""{"email":null}""", none.bodyAsText())
            assertEquals(
                HttpStatusCode.Unauthorized,
                change("""{"email":"pat@example.com","currentPassword":"not my password"}""").status,
            )
            assertEquals(
                HttpStatusCode.UnprocessableEntity,
                change("""{"email":"no","currentPassword":"$password"}""").status,
            )
            val ok = change("""{"email":"Pat@Example.com","currentPassword":"$password"}""")
            assertEquals(HttpStatusCode.OK, ok.status, ok.bodyAsText())
            assertEquals("""{"email":"pat@example.com"}""", ok.bodyAsText())
            val still = client.get("/api/auth/email") { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$session") }
            assertEquals(HttpStatusCode.OK, still.status, "checking the password opened and ended no session")
        }

    @Test
    fun `F-0026-G the emails carry the username and the link, never a password, and escape what they show`() {
        val at = Instant.parse("2026-10-28T20:15:00Z")
        val link = "https://arena.example.org/reset#abc"
        val reset = AccountEmails.passwordReset("Pat<b>", link, at, "https://arena.example.org")
        assertEquals("Reset your Proxic Arena password", reset.subject)
        assertTrue(reset.text.contains("Your username is Pat<b>") && reset.text.contains(link))
        assertTrue(reset.html.contains("Pat&lt;b&gt;") && !reset.html.contains("Pat<b>"))
        assertTrue(reset.html.contains("src=\"cid:${EmailFrame.LOGO_ID}\""))
        assertTrue(reset.html.contains("Didn't ask for this?"))
        assertEquals(listOf(EmailFrame.LOGO_ID), reset.images.map { it.contentId })
        for (email in listOf(reset, AccountEmails.passwordChanged("Pat", at, "https://arena.example.org"))) {
            assertFalse(email.text.contains(password) || email.html.contains(password))
            assertFalse(email.html.lowercase().contains("your password is"), "never a password")
        }
        assertNotNull(AccountEmails.emailChanged("Pat", at, "https://arena.example.org").html)
    }
}
