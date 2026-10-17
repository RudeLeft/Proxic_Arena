package net.barnflix.proxic.auth

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.LoggerContext
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.slf4j.LoggerFactory
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Authentication events — PHASE_03 §3.94–§3.97.
 *
 * Deferred at the Phase 3 gate and carried through two more. What
 * existed instead was two lines about sockets opening and closing,
 * and nothing about signing in, signing out, changing a password,
 * or an administrator disabling an account.
 *
 * The second test is the one that matters. §3.95 forbids logging a
 * password, a raw session token, a CSRF token or a password hash,
 * and a prohibition nothing checks is a prohibition until somebody
 * adds a helpful `log.info("login for $u with $p")`. This captures
 * what the server ACTUALLY wrote and reads it back.
 */
class AuthEventsTest {
    private var container: PostgreSQLContainer<*>? = null
    private val password = "a perfectly fine passphrase"
    private lateinit var appender: ListAppender<ILoggingEvent>

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

        // Attach to the ROOT logger: the events come from several
        // loggers (the Ktor application, and Accounts), and a test
        // that watched only one would pass while the other leaked.
        appender = ListAppender<ILoggingEvent>()
        appender.start()
        val root = LoggerFactory.getILoggerFactory() as LoggerContext
        root.getLogger("ROOT").apply {
            level = Level.INFO
            addAppender(appender)
        }
    }

    @AfterTest
    fun stop() {
        val root = LoggerFactory.getILoggerFactory() as LoggerContext
        root.getLogger("ROOT").detachAppender(appender)
        container!!.stop()
    }

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-auth-events",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun seed(): Accounts {
        val database = Database.connect(config())!!.also { it.migrate() }
        val sessions = Sessions(database.dataSource())
        return Accounts(database.dataSource(), sessions).also {
            it.createUser("RudeLeft", password, Role.ADMIN)
        }
    }

    private fun lines(): List<String> = appender.list.map { it.formattedMessage }

    private fun events(): List<String> = lines().filter { it.startsWith("auth event=") }

    /** §3.94 — the events it names, actually emitted. */
    @Test
    fun `signing in, out and failing are all recorded`() =
        testApplication {
            val accounts = seed()
            application { module(config()) }

            // A failure, a success, and a sign-out.
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"RudeLeft","password":"wrong"}""")
            }
            val ok =
                client.post("/api/auth/login") {
                    contentType(ContentType.Application.Json)
                    setBody("""{"username":"RudeLeft","password":"$password"}""")
                }
            val cookie =
                ok.headers.getAll(HttpHeaders.SetCookie)!!
                    .first { it.startsWith("$SESSION_COOKIE=") }
            client.post("/api/auth/logout") { header(HttpHeaders.Cookie, cookie) }

            val recorded = events()
            for (event in listOf("LOGIN_FAILURE", "LOGIN_SUCCESS", "LOGOUT", "USER_CREATED")) {
                assertTrue(
                    recorded.any { it.contains("event=$event") },
                    "no $event event; recorded: $recorded",
                )
            }

            // §3.96 — the attempted username IS recorded, which is
            // what makes a brute-force attempt legible.
            assertTrue(
                recorded.any { it.contains("event=LOGIN_FAILURE") && it.contains("rudeleft") },
                "a failed login did not name the attempted user: $recorded",
            )

            // An administrator disabling an account is an event too.
            accounts.setStatus(accounts.findByUsername("RudeLeft")!!.userId, AccountStatus.DISABLED)
            assertTrue(
                events().any { it.contains("event=USER_DISABLED") },
                "disabling an account was not recorded",
            )
        }

    /**
     * §3.95 — never the password, the raw token, the CSRF token or
     * the hash.
     *
     * Checked against everything the server wrote, not just the
     * auth events: a leak would most likely arrive as some other
     * line somebody added for debugging.
     */
    @Test
    fun `no credential of any kind reaches the log`() =
        testApplication {
            seed()
            application { module(config()) }

            val response =
                client.post("/api/auth/login") {
                    contentType(ContentType.Application.Json)
                    setBody("""{"username":"RudeLeft","password":"$password"}""")
                }
            val raw = response.headers.getAll(HttpHeaders.SetCookie)!!
            val token =
                raw.first { it.startsWith("$SESSION_COOKIE=") }
                    .substringAfter("=").substringBefore(";")
            val csrf =
                raw.first { it.startsWith("$CSRF_COOKIE=") }
                    .substringAfter("=").substringBefore(";")

            // Also exercise a wrong password, because a failure
            // handler is where a "helpful" log line tends to go.
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"RudeLeft","password":"hunter2-not-the-real-one"}""")
            }

            val everything = lines().joinToString("\n")
            for (
            (what, secret) in
            listOf(
                "the password" to password,
                "a wrong password" to "hunter2-not-the-real-one",
                "the session token" to token,
                "the CSRF token" to csrf,
            )
            ) {
                assertTrue(secret !in everything, "$what reached the log")
            }

            // And no Argon2 hash, which is neither a password nor
            // safe to scatter through a log file.
            assertTrue("\$argon2" !in everything, "a password hash reached the log")
        }
}
