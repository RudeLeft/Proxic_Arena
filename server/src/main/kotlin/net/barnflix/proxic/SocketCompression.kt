package net.barnflix.proxic

import io.ktor.util.AttributeKey
import io.ktor.websocket.Frame
import io.ktor.websocket.FrameTooBigException
import io.ktor.websocket.FrameType
import io.ktor.websocket.ProtocolViolationException
import io.ktor.websocket.WebSocketExtension
import io.ktor.websocket.WebSocketExtensionFactory
import io.ktor.websocket.WebSocketExtensionHeader
import java.io.ByteArrayOutputStream
import java.util.zip.DataFormatException
import java.util.zip.Deflater
import java.util.zip.Inflater

// PHASE_11 P11-D2 -- permessage-deflate (RFC 7692) on the sockets.
//
// A board is 12-15 KB of JSON and nearly all of it is the board before
// it, so each connection keeps its compressor's memory between messages
// (context takeover): a board then costs a small fraction of its text
// on the wire. The browser offers the extension on its own; one that
// doesn't (or a proxy that strips the header) gets no reply header and
// plain frames, exactly as before.
//
// Why not Ktor's WebSocketDeflateExtension: its inflate has no output
// limit (2.3.13 `inflateFully`), so a client could send a 1 MB frame
// (the plugin's ceiling, checked BEFORE inflating) that grows to about a
// gigabyte -- what §1.100 forbids. This one inflates at most
// [Config.maxMessageBytes] and ends the session past it. It
// also appends the RFC's empty-block tail once per message, not per
// fragment.
//
// HID-001: one compressor per connection, fed only what that connection
// is sent. Each seat's stream is that seat's own view (hidden cards
// already removed by the worker), so no stream holds a secret of
// another viewer's to be guessed at from its compressed size.

/**
 * The server's permessage-deflate: compress outgoing text and binary
 * messages of at least [Config.compressAtLeast] bytes, keep the
 * compressor's window between messages unless the client asks
 * otherwise, and always ask the client not to keep its own
 * (`client_no_context_takeover`), so each incoming message inflates
 * alone and the server holds no client window between messages.
 */
class SocketCompression private constructor(
    private val config: Config,
) : WebSocketExtension<SocketCompression.Config> {
    /** The extension's settings. */
    class Config {
        /** Messages shorter than this go uncompressed (a 15-byte ping gains nothing). */
        var compressAtLeast: Int = DEFAULT_COMPRESS_AT_LEAST

        /** zlib's level, 1-9. */
        var level: Int = DEFAULT_LEVEL

        /** The most one incoming message may inflate to. */
        var maxMessageBytes: Long = Limits.MAX_WS_FRAME_BYTES
    }

    /** The factory Ktor installs, once per connection. */
    companion object Factory : WebSocketExtensionFactory<Config, SocketCompression> {
        const val NAME = "permessage-deflate"
        const val DEFAULT_COMPRESS_AT_LEAST = 64
        const val DEFAULT_LEVEL = 6

        private const val SERVER_NO_CONTEXT = "server_no_context_takeover"
        private const val CLIENT_NO_CONTEXT = "client_no_context_takeover"
        private const val SERVER_MAX_BITS = "server_max_window_bits"
        private const val CLIENT_MAX_BITS = "client_max_window_bits"

        /** java.util.zip always deflates with a 32 KB window. */
        private const val WINDOW_BITS = 15
        private const val BUFFER = 8 * 1024

        /** RFC 7692 §7.2.1: the 4 bytes a sync flush ends with, left off the wire. */
        private val TAIL = byteArrayOf(0, 0, -1, -1)

        override val key: AttributeKey<SocketCompression> = AttributeKey("proxic.socket-compression")
        override val rsv1: Boolean = true
        override val rsv2: Boolean = false
        override val rsv3: Boolean = false

        override fun install(config: Config.() -> Unit): SocketCompression = SocketCompression(Config().apply(config))

        /**
         * Whether one offer can be accepted as written, and if so whether
         * it asks the server not to keep its window. Null to decline it.
         */
        internal fun accept(offer: WebSocketExtensionHeader): Boolean? {
            if (!offer.name.equals(NAME, ignoreCase = true)) return null
            val seen = mutableSetOf<String>()
            var resetOutgoing = false
            for ((name, value) in offer.parseParameters()) {
                val key = name.trim().lowercase()
                if (!seen.add(key)) return null // §7: a parameter twice declines the offer
                val ok =
                    when (key) {
                        SERVER_NO_CONTEXT -> value.isEmpty().also { resetOutgoing = true }
                        CLIENT_NO_CONTEXT -> value.isEmpty()
                        // A smaller server window can't be made with java.util.zip.
                        SERVER_MAX_BITS -> value.trim('"').toIntOrNull() == WINDOW_BITS
                        // Any client window inflates with ours; nothing to answer.
                        CLIENT_MAX_BITS -> value.isEmpty() || value.trim('"').toIntOrNull() in 8..WINDOW_BITS
                        else -> false
                    }
                if (!ok) return null
            }
            return resetOutgoing
        }
    }

    override val factory: WebSocketExtensionFactory<Config, out WebSocketExtension<Config>> = Factory

    /** What a client would offer; this server never connects out. */
    override val protocols: List<WebSocketExtensionHeader> = emptyList()

    private var resetOutgoing = false
    private var sendingRaw = false
    private val deflater by lazy { Deflater(config.level, true) }
    private val inflater by lazy { Inflater(true) }

    override fun clientNegotiation(negotiatedProtocols: List<WebSocketExtensionHeader>): Boolean = false

    override fun serverNegotiation(requestedProtocols: List<WebSocketExtensionHeader>): List<WebSocketExtensionHeader> {
        // The first offer we can honour, in the client's order of preference.
        val reset = requestedProtocols.firstNotNullOfOrNull { accept(it) } ?: return emptyList()
        resetOutgoing = reset
        val parameters = listOfNotNull(CLIENT_NO_CONTEXT, SERVER_NO_CONTEXT.takeIf { reset })
        // Ktor 2.3 writes a header's parameters after a COMMA ("permessage-deflate ,
        // client_no_context_takeover"), which a browser reads as a second, unknown
        // extension and fails the connection. So the reply is written out whole as the
        // name, with RFC 7692's semicolons.
        return listOf(WebSocketExtensionHeader((listOf(NAME) + parameters).joinToString("; "), emptyList()))
    }

    override fun processOutgoingFrame(frame: Frame): Frame {
        if (frame.frameType != FrameType.TEXT && frame.frameType != FrameType.BINARY) return frame
        // A message sent in fragments (the server sends none) goes as it is, every fragment.
        if (sendingRaw || !frame.fin) {
            sendingRaw = !frame.fin
            return frame
        }
        if (frame.data.size < config.compressAtLeast) return frame
        val packed = deflate(frame.data)
        if (resetOutgoing) deflater.reset()
        return Frame.byType(true, frame.frameType, packed, true, frame.rsv2, frame.rsv3)
    }

    override fun processIncomingFrame(frame: Frame): Frame {
        // Ktor hands extensions whole messages: fragments are joined first.
        if (!frame.rsv1 || (frame.frameType != FrameType.TEXT && frame.frameType != FrameType.BINARY)) return frame
        val plain =
            try {
                inflate(frame.data + TAIL)
            } finally {
                // client_no_context_takeover: every message inflates alone.
                inflater.reset()
            }
        return Frame.byType(frame.fin, frame.frameType, plain, false, frame.rsv2, frame.rsv3)
    }

    private fun deflate(data: ByteArray): ByteArray {
        deflater.setInput(data)
        val out = ByteArrayOutputStream(data.size / 2 + TAIL.size)
        val buffer = ByteArray(BUFFER)
        // SYNC_FLUSH: a full buffer may mean more is waiting.
        do {
            val n = deflater.deflate(buffer, 0, buffer.size, Deflater.SYNC_FLUSH)
            out.write(buffer, 0, n)
        } while (n == buffer.size)
        val bytes = out.toByteArray()
        val endsWithTail =
            bytes.size >= TAIL.size && TAIL.indices.all { bytes[bytes.size - TAIL.size + it] == TAIL[it] }
        return if (endsWithTail) bytes.copyOf(bytes.size - TAIL.size) else bytes
    }

    private fun inflate(data: ByteArray): ByteArray {
        inflater.setInput(data)
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(BUFFER)
        try {
            while (!inflater.finished()) {
                val n = inflater.inflate(buffer)
                // All input read. (Raw deflate has no header, so it never asks for a dictionary.)
                if (n == 0) break
                if (out.size().toLong() + n > config.maxMessageBytes) {
                    throw FrameTooBigException(out.size().toLong() + n)
                }
                out.write(buffer, 0, n)
            }
        } catch (e: DataFormatException) {
            throw ProtocolViolationException("bad deflate data: ${e.message}")
        }
        return out.toByteArray()
    }
}
