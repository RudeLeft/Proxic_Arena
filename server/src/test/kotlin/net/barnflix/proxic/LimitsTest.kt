package net.barnflix.proxic

import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets

/**
 * Infrastructure limits — PHASE_01 §1.99, §1.100.
 *
 * Each limit is tested with its negative control: a request just
 * under the bound must still succeed. A limit that rejects everything
 * passes a "too large is refused" test perfectly while breaking the
 * application, and that failure would not show up until Phase 2 tried
 * to import a deck.
 */
class LimitsTest {
    private fun config() = ServerConfig("0.0.0.0", 0, null, null, "build/test-data")

    @Test
    fun `an oversized body is refused before it is read`() =
        testApplication {
            application { module(config()) }

            val tooBig = "x".repeat((Limits.MAX_HTTP_BODY_BYTES + 1).toInt())
            val response = client.post("/api/does-not-exist") { setBody(tooBig) }

            assertEquals(HttpStatusCode.PayloadTooLarge, response.status)
            val body = response.bodyAsText()
            assertTrue(body.contains("BODY_TOO_LARGE"), body)
            // The refusal states the limit; otherwise a client is left
            // guessing how much smaller to go.
            assertTrue(body.contains(Limits.MAX_HTTP_BODY_BYTES.toString()), body)
        }

    @Test
    fun `a body under the limit is not refused`() =
        testApplication {
            application { module(config()) }
            // Negative control. The route does not exist, so a 404 is the
            // correct answer -- the point is that it is NOT 413.
            val response = client.post("/api/does-not-exist") { setBody("x".repeat(1024)) }
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

    @Test
    fun `ordinary GET requests are unaffected`() =
        testApplication {
            application { module(config()) }
            assertEquals(HttpStatusCode.OK, client.get("/api/health/live").status)
        }

    /**
     * The frame ceiling is configured on the server's WebSockets
     * plugin. This asserts the CONFIGURED value rather than driving a
     * 1 MB frame through the test engine: the limit that matters is
     * the one the plugin holds, and a megabyte of test traffic proves
     * the same thing far more slowly.
     */
    @Test
    fun `the websocket frame ceiling is bounded`() {
        assertTrue(Limits.MAX_WS_FRAME_BYTES in 1..(4L * 1024 * 1024))
        // Phase 6 sends whole game-state snapshots; a ceiling below
        // ~256 KB would start refusing legitimate frames.
        assertTrue(Limits.MAX_WS_FRAME_BYTES >= 256L * 1024)
    }

    @Test
    fun `a normal websocket session still works with the limits in place`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }

            client.webSocket("/ws/system") {
                val hello = withTimeoutOrNull(5_000) { (incoming.receive() as Frame.Text).readText() }
                assertTrue(hello != null && hello.contains("HELLO"), "got: $hello")
            }
        }

    /**
     * The ceiling must RELEASE slots.
     *
     * A counter incremented on open and not decremented on close
     * looks perfect until the server has been up for a day, and then
     * refuses every connection forever. Opening and closing more
     * sessions than the ceiling allows, sequentially, proves the
     * slot comes back.
     */
    @Test
    fun `connection slots are released when a session ends`() =
        testApplication {
            application { module(config()) }
            val client = createClient { install(ClientWebSockets) }

            repeat(Limits.MAX_SYSTEM_CONNECTIONS + 4) { attempt ->
                client.webSocket("/ws/system") {
                    val hello = withTimeoutOrNull(5_000) { (incoming.receive() as Frame.Text).readText() }
                    assertTrue(
                        hello != null && hello.contains("HELLO"),
                        "connection $attempt was refused: a slot leaked",
                    )
                }
            }
        }

    /**
     * The ceiling actually refuses.
     *
     * The sequential test above proves slots are RELEASED, but it
     * would pass just as happily if the counter were never
     * incremented at all. This holds connections open past a ceiling
     * of two and asserts the next one is turned away -- the guard
     * firing, observed, rather than assumed.
     */
    @Test
    fun `an extra connection past the ceiling is refused`() =
        testApplication {
            application { module(config().copy(maxSystemConnections = 2)) }
            val client = createClient { install(ClientWebSockets) }

            client.webSocket("/ws/system") {
                assertTrue((incoming.receive() as Frame.Text).readText().contains("HELLO"))
                client.webSocket("/ws/system") {
                    assertTrue((incoming.receive() as Frame.Text).readText().contains("HELLO"))

                    // Third, while two are held open.
                    client.webSocket("/ws/system") {
                        // A refusal closes the session, so receive()
                        // THROWS rather than returning a close frame.
                        // runCatching, because an exception here is the
                        // success case and the first version of this
                        // test failed for the right reason.
                        val first =
                            runCatching {
                                withTimeoutOrNull(5_000) { incoming.receive() }
                            }.getOrNull()

                        val refused =
                            first == null ||
                                first is Frame.Close ||
                                (first is Frame.Text && !first.readText().contains("HELLO"))
                        assertTrue(refused, "a third connection was accepted past a ceiling of two")
                    }
                }
            }
        }

    @Test
    fun `the connection ceiling is sized for the stated workload`() {
        // Five matches, two players, plus reconnects and spare tabs.
        // Far above honest use, far below exhausting the host.
        assertTrue(Limits.MAX_SYSTEM_CONNECTIONS >= 20, "too low for 5 concurrent matches")
        assertTrue(Limits.MAX_SYSTEM_CONNECTIONS <= 1024, "not a limit at all")
    }

    @Test
    fun `timeouts are set and finite`() {
        assertTrue(Limits.REQUEST_READ_TIMEOUT_SECONDS in 1..120)
        assertTrue(Limits.RESPONSE_WRITE_TIMEOUT_SECONDS in 1..120)
        // The ping must be shorter than the timeout, or a healthy
        // connection is closed before it is ever asked to answer.
        assertTrue(Limits.WS_PING_SECONDS < Limits.WS_TIMEOUT_SECONDS)
    }
}
