package net.barnflix.proxic

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.routing.routing
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.FrameType
import io.ktor.websocket.readText
import kotlinx.coroutines.runBlocking
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.net.Socket
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import io.ktor.server.websocket.WebSockets as ServerWebSockets

/**
 * PHASE_11 P11-D2 -- the wire itself, as a browser gets it: a real
 * server on a real port, read byte by byte. (Ktor's test engine can't
 * negotiate extensions, so a test through it would pass with
 * compression silently off.)
 */
class SocketCompressionWireTest {
    private val helpers = SocketCompressionTest()

    private fun config() = ServerConfig("0.0.0.0", 0, null, null, "build/test-data")

    private fun <T> onRealServer(
        app: Application.() -> Unit,
        body: (port: Int) -> T,
    ): T {
        val server = embeddedServer(Netty, port = 0, host = "127.0.0.1", module = app).start(wait = false)
        try {
            val port = runBlocking { server.resolvedConnectors().first().port }
            return body(port)
        } finally {
            server.stop(0, 1_000)
        }
    }

    /** A websocket client written out by hand: the handshake, then raw frames. */
    private class RawSocket(port: Int, path: String, offer: String?) : AutoCloseable {
        private val socket = Socket("127.0.0.1", port).apply { soTimeout = 5_000 }
        private val input = DataInputStream(socket.getInputStream())
        val responseHeaders: Map<String, String>

        init {
            val crlf = "\r\n"
            val request =
                buildString {
                    append("GET $path HTTP/1.1${crlf}Host: 127.0.0.1:$port${crlf}Upgrade: websocket$crlf")
                    append("Connection: Upgrade${crlf}Sec-WebSocket-Version: 13$crlf")
                    append("Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==${crlf}Origin: http://127.0.0.1:$port$crlf")
                    if (offer != null) append("Sec-WebSocket-Extensions: $offer$crlf")
                    append(crlf)
                }
            socket.getOutputStream().write(request.toByteArray())
            val lines = mutableListOf<String>()
            val line = StringBuilder()
            while (true) {
                val c = input.read()
                check(c >= 0) { "closed during the handshake: $lines" }
                if (c == '\n'.code) {
                    val text = line.toString().trimEnd('\r')
                    if (text.isEmpty()) break
                    lines += text
                    line.clear()
                } else {
                    line.append(c.toChar())
                }
            }
            check(lines.first().contains(" 101 ")) { "not upgraded: $lines" }
            responseHeaders =
                lines.drop(1).associate { it.substringBefore(':').trim().lowercase() to it.substringAfter(':').trim() }
        }

        /** One frame from the server (unmasked): its first byte and its payload. */
        fun read(): Pair<Int, ByteArray> {
            val b0 = input.readUnsignedByte()
            val b1 = input.readUnsignedByte()
            val length =
                when (val l = b1 and LENGTH_BITS) {
                    LENGTH_16 -> input.readUnsignedShort().toLong()
                    LENGTH_64 -> input.readLong()
                    else -> l.toLong()
                }
            val payload = ByteArray(length.toInt()).also(input::readFully)
            return b0 to payload
        }

        /** Send one masked text frame, compressed (RSV1) or not. */
        fun send(
            payload: ByteArray,
            compressed: Boolean,
        ) {
            val out = ByteArrayOutputStream()
            out.write(FIN_TEXT or (if (compressed) RSV1 else 0))
            require(payload.size < 65_536) { "too long for this test" }
            if (payload.size < LENGTH_16) {
                out.write(MASKED or payload.size)
            } else {
                out.write(MASKED or LENGTH_16)
                out.write(payload.size shr 8)
                out.write(payload.size and 0xff)
            }
            val mask = byteArrayOf(1, 2, 3, 4)
            out.write(mask)
            out.write(ByteArray(payload.size) { (payload[it].toInt() xor mask[it % 4].toInt()).toByte() })
            socket.getOutputStream().write(out.toByteArray())
        }

        override fun close() = socket.close()
    }

    private fun inflateAlone(data: ByteArray): String =
        SocketCompressionTest.Browser().read(Frame.byType(true, FrameType.TEXT, data, true, false, false))

    @Test
    fun `the real server compresses when offered, as a browser offers it`() =
        onRealServer({ module(config()) }) { port ->
            RawSocket(port, "/ws/system", "permessage-deflate; client_max_window_bits").use { ws ->
                assertEquals(
                    "permessage-deflate; client_no_context_takeover",
                    ws.responseHeaders["sec-websocket-extensions"],
                )
                val (b0, payload) = ws.read()
                assertEquals(RSV1, b0 and RSV1, "RSV1: the HELLO is compressed")
                val hello = inflateAlone(payload)
                assertTrue(hello.contains("HELLO"), hello)
                assertTrue(payload.size < hello.length, "${payload.size} on the wire for ${hello.length}")
            }
        }

    /** The proxy that strips the header, or a client that never offers it: plain frames, as before. */
    @Test
    fun `a client that offers nothing gets plain frames`() =
        onRealServer({ module(config()) }) { port ->
            RawSocket(port, "/ws/system", null).use { ws ->
                assertNull(ws.responseHeaders["sec-websocket-extensions"])
                val (b0, payload) = ws.read()
                assertEquals(0, b0 and RSV1, "no RSV1")
                assertTrue(String(payload).contains("HELLO"))
            }
            // An offer we can't honour is the same as none.
            RawSocket(port, "/ws/system", "permessage-deflate; server_no_context_takeover").use { ws ->
                assertEquals(
                    "permessage-deflate; client_no_context_takeover; server_no_context_takeover",
                    ws.responseHeaders["sec-websocket-extensions"],
                )
                assertEquals(RSV1, ws.read().first and RSV1)
            }
            RawSocket(port, "/ws/system", "permessage-deflate; server_max_window_bits=10").use { ws ->
                assertNull(ws.responseHeaders["sec-websocket-extensions"])
                assertEquals(0, ws.read().first and RSV1)
            }
        }

    private val echo: Application.() -> Unit = {
        install(ServerWebSockets) {
            maxFrameSize = Limits.MAX_WS_FRAME_BYTES
            extensions { install(SocketCompression) }
        }
        routing {
            webSocket("/echo") {
                for (frame in incoming) if (frame is Frame.Text) send(Frame.Text(frame.readText()))
            }
        }
    }

    @Test
    fun `a compressed message is read and answered, a bomb closes the socket`() =
        onRealServer(echo) { port ->
            RawSocket(port, "/echo", "permessage-deflate").use { ws ->
                val text = helpers.board(1)
                ws.send(helpers.clientDeflate(text.toByteArray()), compressed = true)
                val (b0, payload) = ws.read()
                assertEquals(RSV1, b0 and RSV1)
                assertEquals(text, inflateAlone(payload))
            }
            RawSocket(port, "/echo", "permessage-deflate").use { ws ->
                // 2 MB of zeros is about 2 KB compressed: well under the 1 MB frame ceiling.
                ws.send(helpers.clientDeflate(ByteArray(2 * 1024 * 1024)), compressed = true)
                // Closed, not answered: the extension refuses the message before
                // it is inflated past 1 MB, and the session ends. Ktor may get its
                // close frame out first or drop the connection first (CI run
                // 45048612802 read end-of-stream): both are the bomb refused. An
                // echo of any kind is the failure.
                val frame =
                    try {
                        ws.read()
                    } catch (_: java.io.EOFException) {
                        null
                    }
                if (frame != null) {
                    val (b0, payload) = frame
                    assertEquals(FIN_CLOSE, b0, "a close frame, not an echo (${payload.size} bytes)")
                }
            }
        }

    private companion object {
        const val FIN_TEXT = 0x81
        const val FIN_CLOSE = 0x88
        const val RSV1 = 0x40
        const val MASKED = 0x80
        const val LENGTH_BITS = 0x7f
        const val LENGTH_16 = 126
        const val LENGTH_64 = 127
    }
}
