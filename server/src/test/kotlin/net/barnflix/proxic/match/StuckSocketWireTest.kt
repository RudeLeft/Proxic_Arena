package net.barnflix.proxic.match

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertTimeoutPreemptively
import java.io.DataInputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.time.Duration
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * P11-D6 (spec 0119, F-0119-B) -- THE FREEZE, on a real socket. A real
 * server (Netty, a real port), two match connections opened by hand: Bob's
 * client reads everything, Alice's never reads a byte (its receive buffer
 * made small, so the server's socket fills in a few hundred KB). The "pump"
 * (one plain thread, as MatchWorker's) sends each of them 400 messages in
 * turn, through the hub, as MatchDecisions does.
 *
 * At 7a802a7a (before the per-connection queue) this FAILS: the hub sent to
 * each connection in turn and waited for Ktor's `outgoing` to take the frame,
 * so once Alice's socket was full the pump stopped and Bob got nothing more
 * (RUN 2026-11-26: this file run in a checkout of 7a802a7a). Now each
 * connection has its own queue and the pump never waits.
 *
 * Written with only what 7a802a7a already had (`MatchWatchers.open`'s first
 * four arguments, `MatchHub.sendTo`), so the same file runs on both.
 */
class StuckSocketWireTest {
    private val matchId: UUID = UUID.randomUUID()
    private val alice: UUID = UUID.randomUUID()
    private val bob: UUID = UUID.randomUUID()
    private val hub = MatchHub()

    private val app: Application.() -> Unit = {
        install(WebSockets)
        routing {
            webSocket("/m/{who}") {
                val who = call.parameters["who"]!!
                val user = if (who == "alice") alice else bob
                hub.watchers.open(matchId, user, who, outgoing)
                try {
                    incoming.consumeEach { }
                } finally {
                    hub.watchers.close(matchId, user, who)
                }
            }
        }
    }

    @Test
    fun `a socket that stops reading holds up neither the pump nor the other player`() {
        val server = embeddedServer(Netty, port = 0, host = "127.0.0.1", module = app).start(wait = false)
        try {
            val port = runBlocking { server.resolvedConnectors().first().port }
            val stuck = open(port, "alice", receiveBuffer = 4 * 1024)
            val reader = open(port, "bob")
            stuck.use {
                reader.use {
                    awaitOpen()
                    val got = CopyOnWriteArrayList<Int>()
                    val reading = Thread { readNumbers(reader, got, MESSAGES) }.apply { start() }
                    // 64 KB to Alice each time: 400 of them could never all fit in her socket.
                    val pad = JsonPrimitive("x".repeat(64 * 1024))
                    val big = JsonObject(mapOf("type" to JsonPrimitive("BIG"), "pad" to pad))
                    // The pump's rounds, timed. Where the kernel holds little (Linux), the
                    // old code blocked for good ("execution timed out"); where it holds a
                    // lot (Windows' loopback grows its buffers), it crawled.
                    var slowest = 0L
                    val start = System.nanoTime()
                    assertTimeoutPreemptively(Duration.ofSeconds(20)) {
                        repeat(MESSAGES) { n ->
                            val round = System.nanoTime()
                            runBlocking {
                                hub.sendTo(matchId, alice, big)
                                hub.sendTo(matchId, bob, JsonObject(mapOf("n" to JsonPrimitive(n))))
                            }
                            slowest = maxOf(slowest, System.nanoTime() - round)
                        }
                    }
                    val totalMs = (System.nanoTime() - start) / 1_000_000
                    val slowestMs = slowest / 1_000_000
                    println("[stuck-socket] pump: $MESSAGES rounds in $totalMs ms, slowest $slowestMs ms")
                    assertTrue(slowestMs < 500, "the pump waited $slowestMs ms on one round: on Alice's socket")
                    assertTrue(totalMs < 3_000, "the pump took $totalMs ms for $MESSAGES rounds")
                    reading.join(20_000)
                    assertEquals((0 until MESSAGES).toList(), got.toList(), "Bob got every message, in order")
                }
            }
        } finally {
            server.stop(0, 1_000)
        }
    }

    private fun awaitOpen() {
        val until = System.currentTimeMillis() + 5_000
        while (hub.watchers.users(matchId).size < 2) {
            check(System.currentTimeMillis() < until) { "the two connections never opened" }
            Thread.sleep(10)
        }
    }

    private fun readNumbers(
        socket: Socket,
        into: MutableList<Int>,
        count: Int,
    ) {
        val input = DataInputStream(socket.getInputStream())
        val number = Regex("\"n\":(\\d+)")
        runCatching {
            while (into.size < count) {
                val text = String(readFrame(input))
                number.find(text)?.let { into += it.groupValues[1].toInt() }
            }
        }
    }

    internal companion object {
        const val MESSAGES = 400

        /** A websocket opened by hand (no compression offered); [receiveBuffer] set before connecting. */
        fun open(
            port: Int,
            who: String,
            receiveBuffer: Int? = null,
            path: String = "/m",
        ): Socket {
            val socket = Socket()
            receiveBuffer?.let { socket.receiveBufferSize = it }
            socket.connect(InetSocketAddress("127.0.0.1", port))
            socket.soTimeout = 20_000
            val crlf = "\r\n"
            socket.getOutputStream().write(
                (
                    "GET $path/$who HTTP/1.1${crlf}Host: 127.0.0.1:$port${crlf}Upgrade: websocket$crlf" +
                        "Connection: Upgrade${crlf}Sec-WebSocket-Version: 13$crlf" +
                        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==$crlf$crlf"
                ).toByteArray(),
            )
            val input = socket.getInputStream()
            var last4 = 0
            while (last4 != END_OF_HEAD) {
                val c = input.read()
                check(c >= 0) { "closed during the handshake" }
                last4 = (last4 shl 8) or c
            }
            return socket
        }

        /** One frame's payload (the server's frames are unmasked and, here, never fragmented). */
        fun readFrame(input: DataInputStream): ByteArray {
            input.readUnsignedByte()
            val length =
                when (val l = input.readUnsignedByte() and 0x7f) {
                    126 -> input.readUnsignedShort().toLong()
                    127 -> input.readLong()
                    else -> l.toLong()
                }
            return ByteArray(length.toInt()).also(input::readFully)
        }

        private const val END_OF_HEAD = 0x0d0a0d0a
    }
}
