package net.barnflix.proxic

import io.ktor.websocket.Frame
import io.ktor.websocket.FrameTooBigException
import io.ktor.websocket.FrameType
import io.ktor.websocket.ProtocolViolationException
import io.ktor.websocket.WebSocketExtensionHeader
import io.ktor.websocket.readText
import java.io.ByteArrayOutputStream
import java.util.zip.Deflater
import java.util.zip.Inflater
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * PHASE_11 P11-D2 -- permessage-deflate on the sockets.
 *
 * Negative controls throughout: a client that offers nothing gets
 * plain frames (the "proxy drops the header" case), an offer we can't
 * honour is declined rather than half-honoured, and an incoming bomb
 * is refused while an honest compressed message still inflates.
 */
class SocketCompressionTest {
    internal fun offer(vararg parameters: String) = WebSocketExtensionHeader("permessage-deflate", parameters.toList())

    /** A fresh connection's extension, and its reply to [offers]. */
    private fun negotiate(vararg offers: WebSocketExtensionHeader) =
        SocketCompression.install {}.let { it to it.serverNegotiation(offers.toList()) }

    /** A board-like message: 12 KB of JSON whose cards repeat, as a real board's do. */
    internal fun board(revision: Int): String =
        buildString {
            append("""{"type":"MATCH_SNAPSHOT","payload":{"stateRevision":$revision,"cards":[""")
            for (i in 0 until 120) {
                if (i > 0) append(',')
                val tapped = (i + revision) % 7 == 0
                append("""{"id":$i,"name":"Grizzly Bears","tapped":$tapped,"power":2,"toughness":2}""")
            }
            append("]}}")
        }

    /** The browser's side: one inflater kept across messages (the server keeps its window). */
    internal class Browser {
        private val inflater = Inflater(true)

        fun read(frame: Frame): String {
            if (!frame.rsv1) return String(frame.data)
            inflater.setInput(frame.data + byteArrayOf(0, 0, -1, -1))
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(4096)
            while (true) {
                val n = inflater.inflate(buffer)
                if (n == 0) break
                out.write(buffer, 0, n)
            }
            return out.toString(Charsets.UTF_8)
        }
    }

    /** A client's compressed message, as a browser sends one (tail removed). */
    internal fun clientDeflate(data: ByteArray): ByteArray {
        val deflater = Deflater(Deflater.DEFAULT_COMPRESSION, true)
        deflater.setInput(data)
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        do {
            val n = deflater.deflate(buffer, 0, buffer.size, Deflater.SYNC_FLUSH)
            out.write(buffer, 0, n)
        } while (n == buffer.size)
        val bytes = out.toByteArray()
        return bytes.copyOf(bytes.size - 4)
    }

    @Test
    fun `a plain offer is accepted and the client is told not to keep its window`() {
        val (_, reply) = negotiate(offer("client_max_window_bits"))
        // As the header is written: semicolons, never Ktor's comma (see SocketCompression).
        assertEquals("permessage-deflate; client_no_context_takeover", reply.single().toString().trim())
    }

    @Test
    fun `server_no_context_takeover is honoured and answered`() {
        val (extension, reply) = negotiate(offer("server_no_context_takeover"))
        assertEquals(
            "permessage-deflate; client_no_context_takeover; server_no_context_takeover",
            reply.single().toString().trim(),
        )
        // Every message then compresses alone: the same board twice costs the same.
        val text = board(1).toByteArray()
        val first = extension.processOutgoingFrame(Frame.Text(true, text))
        val second = extension.processOutgoingFrame(Frame.Text(true, text))
        assertEquals(first.data.size, second.data.size)
    }

    @Test
    fun `offers that cannot be honoured are declined, and the next acceptable one wins`() {
        assertTrue(negotiate(offer("server_max_window_bits=10")).second.isEmpty(), "a smaller server window")
        assertTrue(negotiate(offer("x-webkit-something")).second.isEmpty(), "an unknown parameter")
        assertTrue(
            negotiate(offer("client_no_context_takeover", "client_no_context_takeover")).second.isEmpty(),
            "a parameter twice",
        )
        assertTrue(negotiate(WebSocketExtensionHeader("x-other", emptyList())).second.isEmpty(), "another extension")
        assertTrue(negotiate().second.isEmpty(), "no offer at all")
        // Negative control: the second, plainer offer is taken.
        val (_, reply) = negotiate(offer("server_max_window_bits=10"), offer("server_max_window_bits=15"))
        assertEquals(1, reply.size)
    }

    @Test
    fun `boards compress, keep their window, and read back exactly`() {
        val (extension, _) = negotiate(offer())
        val browser = Browser()
        val sizes =
            (1..5).map { revision ->
                val text = board(revision)
                val frame = extension.processOutgoingFrame(Frame.Text(true, text.toByteArray()))
                assertTrue(frame.rsv1, "a board is compressed")
                assertEquals(FrameType.TEXT, frame.frameType)
                assertEquals(text, browser.read(frame))
                frame.data.size to text.length
            }
        // The first board is a fraction of its text; the next ones, near copies, far less.
        assertTrue(sizes[0].first * 5 < sizes[0].second, "first board $sizes")
        assertTrue(sizes.drop(1).all { it.first * 2 < sizes[0].first }, "later boards $sizes")
    }

    @Test
    fun `small messages, control frames and fragments go as they are`() {
        val (extension, _) = negotiate(offer())
        val ping = Frame.Text(true, """{"type":"PING"}""".toByteArray())
        assertFalse(extension.processOutgoingFrame(ping).rsv1)
        assertFalse(extension.processOutgoingFrame(Frame.Ping(ByteArray(200))).rsv1)
        val big = board(1).toByteArray()
        assertFalse(extension.processOutgoingFrame(Frame.Text(false, big)).rsv1, "a first fragment")
        assertFalse(extension.processOutgoingFrame(Frame.Text(true, big)).rsv1, "its last fragment")
        // Negative control: the next whole message is compressed again.
        assertTrue(extension.processOutgoingFrame(Frame.Text(true, big)).rsv1)
    }

    @Test
    fun `an honest compressed message inflates, a bomb is refused, garbage is a protocol error`() {
        val extension = SocketCompression.install { maxMessageBytes = 64L * 1024 }
        extension.serverNegotiation(listOf(offer()))
        val answer = """{"type":"DECISION_RESPONSE","payload":{"choice":"pass"}}""".repeat(20)
        val honest = Frame.byType(true, FrameType.TEXT, clientDeflate(answer.toByteArray()), true, false, false)
        assertEquals(answer, (extension.processIncomingFrame(honest) as Frame.Text).readText())

        // 1 MB of zeros is about a kilobyte compressed: far under the frame
        // ceiling, far over what it may become.
        val bomb = clientDeflate(ByteArray(1024 * 1024))
        assertTrue(bomb.size < 4096)
        assertFailsWith<FrameTooBigException> {
            extension.processIncomingFrame(Frame.byType(true, FrameType.TEXT, bomb, true, false, false))
        }
        assertFailsWith<ProtocolViolationException> {
            val garbage = byteArrayOf(-1, -2, -3, -4)
            extension.processIncomingFrame(Frame.byType(true, FrameType.TEXT, garbage, true, false, false))
        }
        // And the connection's inflater still works after both.
        assertEquals(answer, (extension.processIncomingFrame(honest) as Frame.Text).readText())
        // An uncompressed message passes through untouched.
        val plain = Frame.Text(true, answer.toByteArray())
        assertContentEquals(plain.data, extension.processIncomingFrame(plain).data)
    }
}
