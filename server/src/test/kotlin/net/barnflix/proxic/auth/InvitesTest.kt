package net.barnflix.proxic.auth

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Duration
import java.time.Instant
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Spec 0014 — accounts by invitation: once, for 48 hours, and nothing to guess. */
class InvitesTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private var now = Instant.parse("2026-10-25T20:00:00Z")
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
        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-invites",
                    secureCookies = false,
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }
        accounts().createUser("RudeLeft", password, Role.ADMIN)
    }

    @AfterTest
    fun stop() {
        database?.close()
        container!!.stop()
    }

    private fun sessions() = Sessions(database!!.dataSource())

    private fun accounts() = Accounts(database!!.dataSource(), sessions())

    private fun invites() = Invites(database!!.dataSource(), accounts(), sessions()) { now }

    private fun admin() = accounts().findByUsername("RudeLeft")!!.userId

    @Test
    fun `a link makes one account, signs them in, and is then dead`() {
        val invite = invites().create("Sam@Example.com", Role.PLAYER, admin())!!
        assertEquals("sam@example.com", invite.email)
        val peek = assertNotNull(invites().peek(invite.token))
        assertEquals("sam", peek.suggestedUsername)
        assertEquals("RudeLeft", peek.invitedBy)

        val joined = assertIs<JoinResult.Joined>(invites().join(invite.token, "sam", "Sam", password))
        assertEquals(Role.PLAYER, joined.user.role)
        assertTrue(accounts().login("sam", password) is LoginResult.Success, "the new password signs in")

        // Once: the same link again is no different from a made-up one.
        assertNull(invites().peek(invite.token))
        assertEquals(JoinResult.Invalid, invites().join(invite.token, "sam2", "Sam", password))
        assertEquals(JoinResult.Invalid, invites().join("made-up", "sam3", "Sam", password))
        assertEquals("JOINED", invites().recent().single().state)
        assertEquals("Sam", invites().recent().single().joinedAs)
    }

    @Test
    fun `48 hours, cancel, and send again each end a link`() {
        val expiring = invites().create("a@example.com", Role.PLAYER, admin())!!
        now = now.plus(Duration.ofHours(48))
        assertNull(invites().peek(expiring.token), "48 hours is the end")
        assertEquals("EXPIRED", invites().recent().single().state)

        val cancelled = invites().create("b@example.com", Role.PLAYER, admin())!!
        assertTrue(invites().cancel(cancelled.inviteId))
        assertEquals(JoinResult.Invalid, invites().join(cancelled.token, "bee", "Bee", password))

        val first = invites().create("c@example.com", Role.ADMIN, admin())!!
        val again = assertNotNull(invites().resend(first.inviteId, admin()))
        assertNull(invites().peek(first.token), "the old link died")
        val joined = assertIs<JoinResult.Joined>(invites().join(again.token, "cee", "Cee", password))
        assertEquals(Role.ADMIN, joined.user.role, "the role chosen when inviting")
    }

    @Test
    fun `a refusal the person can fix keeps the link alive`() {
        val invite = invites().create("d@example.com", Role.PLAYER, admin())!!
        val taken = assertIs<JoinResult.Refused>(invites().join(invite.token, "rudeleft", "Dee", password))
        assertEquals("USERNAME_TAKEN", taken.code)
        assertIs<JoinResult.Refused>(invites().join(invite.token, "dee", "Dee", "short"))
        assertIs<JoinResult.Joined>(invites().join(invite.token, "dee", "Dee", password))
    }

    @Test
    fun `only the code's hash is kept`() {
        val invite = invites().create("e@example.com", Role.PLAYER, admin())!!
        database!!.dataSource().connection.use { connection ->
            connection.createStatement().executeQuery("SELECT token_hash FROM account_invite").use { rows ->
                rows.next()
                assertEquals(SessionTokens.hash(invite.token), rows.getString(1))
                assertTrue(rows.getString(1) != invite.token)
            }
        }
    }

    @Test
    fun `addresses and suggested usernames`() {
        assertNull(Emails.normalize("not an email"))
        assertNull(Emails.normalize("a@b"))
        assertEquals("sam@example.com", Emails.normalize("  Sam@Example.COM "))
        assertEquals("sam.oneilx", Invites.suggestedUsername("sam.o'neil+x@example.com"))
        assertEquals("", Invites.suggestedUsername("jo@example.com"), "too short to suggest")
    }
}
