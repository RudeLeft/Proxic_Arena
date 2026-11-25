package net.barnflix.proxic

import io.ktor.http.ContentType
import io.ktor.http.content.OutgoingContent
import io.ktor.utils.io.ByteWriteChannel
import io.ktor.utils.io.writeFully

/**
 * Spec 0118 -- a request body sent with no declared length (chunked), in
 * pieces, the way a client that leaves out `Content-Length` sends it.
 */
class ChunkedBody(
    private val bytes: ByteArray,
    override val contentType: ContentType = ContentType.Application.Json,
) : OutgoingContent.WriteChannelContent() {
    // No contentLength: that is the point.
    override suspend fun writeTo(channel: ByteWriteChannel) {
        var at = 0
        while (at < bytes.size) {
            val size = minOf(PIECE_BYTES, bytes.size - at)
            channel.writeFully(bytes, at, size)
            channel.flush()
            at += size
        }
    }

    companion object {
        private const val PIECE_BYTES = 64 * 1024

        /** [json], padded with trailing spaces (still the same JSON) to exactly [size] bytes. */
        fun padded(
            json: String,
            size: Long,
        ): ByteArray {
            val head = json.toByteArray()
            require(head.size <= size) { "the JSON alone is over $size bytes" }
            return head + ByteArray((size - head.size).toInt()) { ' '.code.toByte() }
        }
    }
}
