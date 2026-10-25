package net.barnflix.proxic.auth

import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
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
import kotlin.test.assertEquals
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
            PostgreSQLContainer("postgres:16.15-alpine")
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
     * 2026-10-22 review — the cookie alone is not enough. It is
     * SameSite=Lax, so a page on any other barnflix.net subdomain is
     * the same site and the browser would send it; only the Origin
     * says the upgrade came from somewhere else.
     */
    @Test
    fun `a page on another site cannot open the socket, even with the cookie`() =
        testApplication {
            val (token, _) = seedSession()
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }

            var sawHello = false
            runCatching {
                client.webSocket("/ws/user", {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
                    header(HttpHeaders.Origin, "https://elsewhere.barnflix.net")
                }) {
                    val frame = withTimeoutOrNull(3_000) { incoming.receive() }
                    if (frame is Frame.Text) sawHello = frame.readText().contains("HELLO")
                }
            }
            assertTrue(!sawHello, "a foreign page was greeted")

            // The negative control: our own page, same cookie.
            client.webSocket("/ws/user", {
                header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
                header(HttpHeaders.Origin, config().publicOrigin)
            }) {
                val hello = withTimeoutOrNull(5_000) { (incoming.receive() as Frame.Text).readText() }
                assertTrue(hello != null && hello.contains("HELLO"), "our own page was refused: $hello")
            }
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

                val next = nextAnswer()
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
                val pong = nextAnswer()
                assertTrue(pong != null && pong.contains("PONG"), "got: $pong")
            }
        }

    @Test
    fun `the system socket is for the signed-in only`() =
        testApplication {
            // §3.83 kept /ws/system open until the owner decided, on
            // 2026-10-24, that a stranger sees the sign-in screen and
            // nothing else: its HELLO names the version.
            val (token, _) = seedSession()
            application { module(config()) }
            assertEquals(HttpStatusCode.Unauthorized, client.get("/ws/system").status)

            val client = createClient { install(ClientWebSockets) }
            client.webSocket("/ws/system", {
                header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token")
            }) {
                val hello = withTimeoutOrNull(5_000) { (incoming.receive() as Frame.Text).readText() }
                assertTrue(hello != null && hello.contains("HELLO"), "got: $hello")
            }
        }

    /**
     * The next frame that answers something we asked.
     *
     * Since PHASE_05 the authenticated socket also carries the lobby,
     * which speaks unprompted: presence on connect, and a room or a
     * chat line whenever one arrives. Those frames are correct and
     * may interleave with anything, so a test asking "what did my
     * PING get" must step over them rather than assume the socket is
     * silent until spoken to.
     *
     * Returns null when the connection closed or nothing came — both
     * are answers here, and the callers distinguish them.
     */
    private suspend fun DefaultClientWebSocketSession.nextAnswer(): String? =
        withTimeoutOrNull(10_000) {
            while (true) {
                val frame =
                    runCatching { incoming.receive() }.getOrNull() ?: return@withTimeoutOrNull null
                val text = (frame as? Frame.Text)?.readText() ?: continue
                if (UNPROMPTED.none { text.contains(""""type":"$it"""") }) return@withTimeoutOrNull text
            }
            @Suppress("UNREACHABLE_CODE")
            null
        }

    private companion object {
        /**
         * Lobby traffic nobody asked for. Not an answer to anything.
         * PHASE_07 added the room list, the players, and invitations
         * re-sent on connect (§7.64, Amendment 11).
         */
        val UNPROMPTED =
            listOf(
                "PRESENCE",
                "PRESENCE_JOINED",
                "PRESENCE_LEFT",
                "ROOM",
                "ROOMS",
                "PLAYERS",
                "INVITED",
                "INVITATION_SENT",
                "INVITATION_ENDED",
                "CHAT",
            )
    }
}
