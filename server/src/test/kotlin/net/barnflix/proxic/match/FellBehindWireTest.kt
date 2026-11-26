package net.barnflix.proxic.match

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import net.barnflix.proxic.match.StuckSocketWireTest.Companion.open
import net.barnflix.proxic.match.StuckSocketWireTest.Companion.readFrame
import java.io.DataInputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * P11-D6 (spec 0119, F-0119-B) -- the cut-off, on a real socket, wired as
 * MatchSocket wires it (the session's own scope, `fellBehind`): a connection
 * that never reads is closed once its oldest message has waited past the
 * limit (1 s here; 10 s in production, QueueLimits), and the session ends
 * even though the close itself can't be written: the client, reading at
 * last, finds the connection gone. A connection that reads is never cut.
 */
class FellBehindWireTest {
    private val matchId: UUID = UUID.randomUUID()
    private val alice: UUID = UUID.randomUUID()
    private val bob: UUID = UUID.randomUUID()
    private val hub = MatchHub()
    private val ended = ConcurrentHashMap<String, CompletableDeferred<Long>>()
    private val connections = ConcurrentHashMap<String, Connection>()

    private val app: Application.() -> Unit = {
        install(WebSockets)
        routing {
            webSocket("/cut/{who}") {
                val who = call.parameters["who"]!!
                val user = if (who == "alice") alice else bob
                val connection =
                    hub.watchers.open(
                        matchId,
                        user,
                        who,
                        outgoing,
                        scope = this,
                        behind = { stuck, waiting, oldest -> fellBehind(matchId, stuck, waiting, oldest) },
                        limits = QueueLimits(waitMillis = LIMIT_MS),
                    )
                connections[who] = connection
                try {
                    incoming.consumeEach { }
                } finally {
                    connection.queue.stop()
                    hub.watchers.close(matchId, user, who)
                    ended.getOrPut(who) { CompletableDeferred() }.complete(System.currentTimeMillis())
                }
            }
        }
    }

    @Test
    fun `a socket that stops reading is cut off and its connection ends`() {
        val server = embeddedServer(Netty, port = 0, host = "127.0.0.1", module = app).start(wait = false)
        try {
            val port = runBlocking { server.resolvedConnectors().first().port }
            val stuck = open(port, "alice", receiveBuffer = 4 * 1024, path = "/cut")
            val reader = open(port, "bob", path = "/cut")
            stuck.use {
                reader.use {
                    val until = System.currentTimeMillis() + 5_000
                    while (connections.size < 2) {
                        check(System.currentTimeMillis() < until) { "never opened" }
                        Thread.sleep(10)
                    }
                    val bobIn = DataInputStream(reader.getInputStream())
                    var bobGot = 0
                    val bobReads = Thread { runCatching { while (true) readFrame(bobIn).also { bobGot++ } } }
                    bobReads.start()
                    val big = JsonObject(mapOf("pad" to JsonPrimitive("x".repeat(64 * 1024))))
                    val start = System.currentTimeMillis()
                    var sent = 0
                    // A message every 20 ms to both, until Alice's connection is gone (at most 30 s).
                    val stuckOne = connections.getValue("alice")
                    while (!stuckOne.queue.isBehind && System.currentTimeMillis() - start < 30_000) {
                        runBlocking {
                            hub.sendTo(matchId, alice, big)
                            hub.sendTo(matchId, bob, JsonObject(mapOf("n" to JsonPrimitive(sent))))
                        }
                        sent++
                        Thread.sleep(20)
                    }
                    assertTrue(stuckOne.queue.isBehind, "Alice's connection was found behind")
                    val aliceEnded = ended.getOrPut("alice") { CompletableDeferred() }
                    val endedAt = runBlocking { withTimeout(10_000) { aliceEnded.await() } }
                    val cutAfter = endedAt - start
                    // Her socket's buffers fill in a moment; then 1 s of waiting, then at most 2 s for the close.
                    assertTrue(cutAfter < 15_000, "the session ended $cutAfter ms after the sending began")
                    // Alice reads at last: whatever was in her buffers, then the end of the connection.
                    val aliceIn = DataInputStream(stuck.getInputStream())
                    val gone =
                        try {
                            while (true) readFrame(aliceIn)
                            @Suppress("UNREACHABLE_CODE")
                            false
                        } catch (_: java.net.SocketTimeoutException) {
                            false // still open: nothing more came, and no end either
                        } catch (_: IOException) {
                            true
                        }
                    assertTrue(gone, "Alice's client finds the connection gone")
                    // Bob was never cut off and got everything.
                    assertTrue(!connections.getValue("bob").queue.isBehind, "Bob's connection is not behind")
                    val bobUntil = System.currentTimeMillis() + 5_000
                    while (bobGot < sent && System.currentTimeMillis() < bobUntil) Thread.sleep(10)
                    assertEquals(sent, bobGot, "Bob got all $sent messages")
                    val queue = stuckOne.queue.summary()
                    println("[fell-behind] cut after $cutAfter ms; Alice's queue $queue; $sent sent")
                }
            }
        } finally {
            server.stop(0, 1_000)
        }
    }

    private companion object {
        const val LIMIT_MS = 1_000L
    }
}
