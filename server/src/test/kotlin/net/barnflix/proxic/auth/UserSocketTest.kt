package net.barnflix.proxic.auth

import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.withTimeoutOrNull
import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertTrue
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets

/**
 * The authenticated WebSocket — PHASE_03 §3.77–§3.82.
 *
 * A WebSocket is long-lived by nature, so "authorised at connect"
 * is not the same as "authorised now". The case these exist for is
 * a session revoked WHILE someone is connected, which is precisely
 * what revocation is for.
 */
class UserSocketTest {
    private var container: PostgreSQLContainer<*>? = null
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
            dataRoot = "build/test-ws",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    /** Create a user and open a session, returning its token. */
    private fun seedSession(): Pair<String, Accounts> {
        val config = config()
        val database = Database.connect(config)!!.also { it.migrate() }
        val sessions = Sessions(database.dataSource())
        val accounts = Accounts(database.dataSource(), sessions)
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        val token = (accounts.login("RudeLeft", password) as LoginResult.Success).token
        return token to accounts
    }

    @Test
    fun `a session cookie authenticates the upgrade`() =
        testApplication {
            val (token, _) = seedSession()
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }

            client.webSocket("/ws/user", {
                header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
            }) {
                val hello = withTimeoutOrNull(5_000) { (incoming.receive() as Frame.Text).readText() }
                assertTrue(hello != null && hello.contains("HELLO"), "got: $hello")
                // §3.79 — safe identity only. Who, never what they may do.
                assertTrue(hello.contains("RudeLeft"), hello)
                // §3.82 — and never the token itself.
                assertTrue(!hello.contains(token), "the session token was sent to the client")
            }
        }

    @Test
    fun `an anonymous connection is refused`() =
        testApplication {
            seedSession()
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }

            // §3.80. The connection closes rather than hanging open
            // unauthenticated.
            var sawHello = false
            runCatching {
                client.webSocket("/ws/user") {
                    val frame = withTimeoutOrNull(3_000) { incoming.receive() }
                    if (frame is Frame.Text) sawHello = frame.readText().contains("HELLO")
                }
            }
            assertTrue(!sawHello, "an anonymous client was greeted")
        }

    @Test
    fun `a bogus cookie is refused like no cookie at all`() =
        testApplication {
            seedSession()
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }

            var sawHello = false
            runCatching {
                client.webSocket("/ws/user", {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=not-a-real-token")
                }) {
                    val frame = withTimeoutOrNull(3_000) { incoming.receive() }
                    if (frame is Frame.Text) sawHello = frame.readText().contains("HELLO")
                }
            }
            assertTrue(!sawHello, "a forged cookie was accepted")
        }

    /**
     * §3.81 — the case this endpoint exists to prove.
     *
     * Revoking a session must end connections already open, not
     * only refuse new ones. Otherwise "sign out everywhere" leaves
     * the most dangerous connection — the live one — untouched.
     */
    @Test
    fun `revoking the session ends an open connection`() =
        testApplication {
            val (token, accounts) = seedSession()
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }

            client.webSocket("/ws/user", {
                header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
            }) {
                val hello = withTimeoutOrNull(5_000) { (incoming.receive() as Frame.Text).readText() }
                assertTrue(hello != null && hello.contains("HELLO"))

                // Pull the session out from under the live connection.
                val user = accounts.findByUsername("RudeLeft")!!
                accounts.setStatus(user.userId, AccountStatus.DISABLED)

                // A PING forces the loop round, which revalidates. The
                // connection must not answer it as though nothing
                // happened.
                send(Frame.Text("""{"type":"PING"}"""))

                val next =
                    withTimeoutOrNull(10_000) {
                        runCatching { (incoming.receive() as? Frame.Text)?.readText() }.getOrNull()
                    }
                assertTrue(
                    next == null || next.contains("SESSION_ENDED"),
                    "a revoked session kept answering: $next",
                )
            }
        }

    @Test
    fun `an authenticated connection answers PING`() =
        testApplication {
            // The negative control: a revalidation that killed every
            // connection would pass the test above and make the
            // endpoint useless.
            val (token, _) = seedSession()
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }

            client.webSocket("/ws/user", {
                header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
            }) {
                withTimeoutOrNull(5_000) { incoming.receive() } // HELLO
                send(Frame.Text("""{"type":"PING"}"""))
                val pong = withTimeoutOrNull(5_000) { (incoming.receive() as Frame.Text).readText() }
                assertTrue(pong != null && pong.contains("PONG"), "got: $pong")
            }
        }

    @Test
    fun `the anonymous system socket still works`() =
        testApplication {
            // §3.83 — /ws/system stays open infrastructure. Requiring a
            // session there would break the foundation page's status
            // display for a signed-out visitor.
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }

            client.webSocket("/ws/system") {
                val hello = withTimeoutOrNull(5_000) { (incoming.receive() as Frame.Text).readText() }
                assertTrue(hello != null && hello.contains("HELLO"), "got: $hello")
            }
        }
}
