package net.barnflix.proxic.auth

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Timestamp
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Accounts and sessions — PHASE_03 §3.2–§3.37.
 *
 * Against a real PostgreSQL, because most of what matters here is
 * enforced in SQL: a unique normalized username, an expiry that is
 * checked in the query rather than by a caller who might forget.
 */
class AccountsTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private lateinit var accounts: Accounts
    private lateinit var sessions: Sessions

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

        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-data",
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }
        sessions = Sessions(database!!.dataSource())
        accounts = Accounts(database!!.dataSource(), sessions)
    }

    @AfterTest
    fun stop() {
        database?.close()
        container?.stop()
    }

    // --- accounts ---------------------------------------------------

    @Test
    fun `a user can log in with the password they were given`() {
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val result = accounts.login("RudeLeft", password)
        assertTrue(result is LoginResult.Success, "got $result")
        assertEquals("RudeLeft", (result as LoginResult.Success).principal.user.username)
        assertEquals(Role.ADMIN, result.principal.user.role)
    }

    @Test
    fun `login is case-insensitive but the typed name is preserved`() {
        // §3.4, §3.5 — uniqueness and login compare the normalized
        // form; the display preserves what was typed, so nobody is
        // greeted as "rudeleft" forever.
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        for (attempt in listOf("rudeleft", "RUDELEFT", "RudeLeft", "  RudeLeft  ")) {
            assertTrue(accounts.login(attempt, password) is LoginResult.Success, "failed: $attempt")
        }
        assertEquals("RudeLeft", accounts.findByUsername("rudeleft")?.username)
    }

    @Test
    fun `a username cannot be taken twice in different cases`() {
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val failure = runCatching { accounts.createUser("rudeleft", password, Role.PLAYER) }
        assertTrue(failure.isFailure, "a case variant was accepted as a second account")
    }

    @Test
    fun `every login failure looks identical`() {
        // §3.42-§3.44 — unknown user, wrong password and disabled
        // account must be indistinguishable. Anything else is a
        // username oracle wearing a generic error message.
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val disabled = accounts.createUser("Disabled", password, Role.PLAYER)
        accounts.setStatus(disabled.userId, AccountStatus.DISABLED)

        assertEquals(LoginResult.Failed, accounts.login("nobody", password))
        assertEquals(LoginResult.Failed, accounts.login("RudeLeft", "wrong password entirely"))
        assertEquals(LoginResult.Failed, accounts.login("Disabled", password))
    }

    @Test
    fun `an unknown user costs about as much as a wrong password`() {
        // §3.44 — without the dummy hash, "no such user" returns in
        // microseconds and "wrong password" takes ~100 ms. That
        // difference is measurable over a few hundred attempts and
        // turns the generic message above into an oracle anyway.
        accounts.createUser("RudeLeft", password, Role.ADMIN)

        fun timeOf(user: String): Long {
            val begin = System.nanoTime()
            accounts.login(user, "definitely the wrong password")
            return (System.nanoTime() - begin) / 1_000_000
        }
        repeat(2) { timeOf("RudeLeft") }

        val known = timeOf("RudeLeft")
        val unknown = timeOf("no-such-user")
        assertTrue(
            unknown > known / 3,
            "unknown user took ${unknown}ms against ${known}ms for a known one",
        )
    }

    // --- sessions ---------------------------------------------------

    @Test
    fun `a session token authenticates, and a wrong one does not`() {
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val token = (accounts.login("RudeLeft", password) as LoginResult.Success).token

        assertNotNull(sessions.authenticate(token))
        assertNull(sessions.authenticate("not-a-real-token"))
        assertNull(sessions.authenticate(""))
    }

    @Test
    fun `the raw token is never stored`() {
        // §3.21 — a database dump must not hand over live sessions.
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val token = (accounts.login("RudeLeft", password) as LoginResult.Success).token

        database!!.dataSource().connection.use { connection ->
            connection.createStatement().executeQuery("SELECT token_sha256 FROM user_session")
                .use { rows ->
                    assertTrue(rows.next())
                    val stored = rows.getString(1)
                    assertTrue(stored != token, "the raw token was stored")
                    assertEquals(SessionTokens.hash(token), stored)
                }
        }
    }

    @Test
    fun `logging out revokes that session and no other`() {
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val first = (accounts.login("RudeLeft", password) as LoginResult.Success)
        val second = (accounts.login("RudeLeft", password) as LoginResult.Success)

        sessions.revokeSession(first.principal.sessionId)

        assertNull(sessions.authenticate(first.token), "the revoked session still works")
        assertNotNull(sessions.authenticate(second.token), "a different session was revoked too")
    }

    @Test
    fun `changing a password revokes every session`() {
        // §3.36 — a password change is what someone does when they
        // think a session is compromised. Leaving the old sessions
        // alive makes the change cosmetic.
        val user = accounts.createUser("RudeLeft", password, Role.ADMIN)
        val a = (accounts.login("RudeLeft", password) as LoginResult.Success).token
        val b = (accounts.login("RudeLeft", password) as LoginResult.Success).token

        accounts.changePassword(user.userId, "a brand new passphrase entirely")

        assertNull(sessions.authenticate(a))
        assertNull(sessions.authenticate(b))
        assertTrue(accounts.login("RudeLeft", "a brand new passphrase entirely") is LoginResult.Success)
        assertEquals(LoginResult.Failed, accounts.login("RudeLeft", password))
    }

    @Test
    fun `disabling an account ends its sessions immediately`() {
        // §3.37 — not whenever they happen to expire.
        val user = accounts.createUser("Player", password, Role.PLAYER)
        val token = (accounts.login("Player", password) as LoginResult.Success).token
        assertNotNull(sessions.authenticate(token))

        accounts.setStatus(user.userId, AccountStatus.DISABLED)
        assertNull(sessions.authenticate(token))
    }

    @Test
    fun `re-enabling an account does not resurrect its old sessions`() {
        // §3.130. The sessions were revoked, and revocation is not
        // undone by the account coming back.
        val user = accounts.createUser("Player", password, Role.PLAYER)
        val token = (accounts.login("Player", password) as LoginResult.Success).token
        accounts.setStatus(user.userId, AccountStatus.DISABLED)
        accounts.setStatus(user.userId, AccountStatus.ACTIVE)

        assertNull(sessions.authenticate(token), "an old session came back with the account")
        assertTrue(accounts.login("Player", password) is LoginResult.Success)
    }

    @Test
    fun `an idle session expires`() {
        // §3.28. The clock is moved in the database rather than
        // waiting seven days.
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val token = (accounts.login("RudeLeft", password) as LoginResult.Success).token

        setLastActive(Instant.now().minus(SessionPolicy.IDLE.toDays() + 1, ChronoUnit.DAYS))
        assertNull(sessions.authenticate(token), "an idle session still authenticated")
    }

    @Test
    fun `an actively used session still dies at its absolute expiry`() {
        // §3.29 — the ceiling is independent of activity, so a
        // session someone uses daily cannot live forever.
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val token = (accounts.login("RudeLeft", password) as LoginResult.Success).token

        // Both timestamps move: the schema enforces
        // expires_at > created_at, and the first version of this
        // test violated it by backdating only the expiry. The
        // constraint was right and the test was wrong -- a session
        // that expired before it was created is not a state worth
        // simulating.
        database!!.dataSource().connection.use { connection ->
            connection.prepareStatement(
                "UPDATE user_session SET created_at = ?, expires_at = ?, last_active_at = now()",
            ).use {
                it.setTimestamp(1, Timestamp.from(Instant.now().minus(31, ChronoUnit.DAYS)))
                it.setTimestamp(2, Timestamp.from(Instant.now().minusSeconds(60)))
                it.executeUpdate()
            }
        }
        // Active as of a moment ago, and still refused: the absolute
        // ceiling is independent of activity.
        assertNull(sessions.authenticate(token))
    }

    @Test
    fun `using a session refreshes its idle clock`() {
        // §3.30 — otherwise every session would expire seven days
        // after login regardless of use, which is the absolute
        // ceiling wearing the idle rule's name.
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val token = (accounts.login("RudeLeft", password) as LoginResult.Success).token

        val stale = Instant.now().minus(3, ChronoUnit.DAYS)
        setLastActive(stale)
        assertNotNull(sessions.authenticate(token))

        database!!.dataSource().connection.use { connection ->
            connection.createStatement()
                .executeQuery("SELECT last_active_at FROM user_session").use { rows ->
                    rows.next()
                    val refreshed = rows.getTimestamp(1).toInstant()
                    assertTrue(refreshed.isAfter(stale.plus(1, ChronoUnit.DAYS)), "clock not refreshed")
                }
        }
    }

    @Test
    fun `multiple sessions coexist`() {
        // §3.32 — logging in on a phone must not sign you out on a
        // desktop.
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val tokens =
            (1..3).map {
                (accounts.login("RudeLeft", password) as LoginResult.Success).token
            }
        assertEquals(3, tokens.toSet().size, "tokens repeated")
        assertTrue(tokens.all { sessions.authenticate(it) != null })
    }

    @Test
    fun `a bad username or password is refused at creation`() {
        for (bad in listOf("ab", "a".repeat(40), "has spaces", "semi;colon")) {
            assertTrue(
                runCatching { accounts.createUser(bad, password, Role.PLAYER) }.isFailure,
                "accepted username: $bad",
            )
        }
        assertTrue(
            runCatching { accounts.createUser("Fine", "short", Role.PLAYER) }.isFailure,
            "accepted a short password",
        )
    }

    private fun setLastActive(instant: Instant) {
        database!!.dataSource().connection.use { connection ->
            connection.prepareStatement("UPDATE user_session SET last_active_at = ?").use {
                it.setTimestamp(1, Timestamp.from(instant))
                it.executeUpdate()
            }
        }
    }
}
