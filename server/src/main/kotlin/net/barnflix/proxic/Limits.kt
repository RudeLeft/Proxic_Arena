package net.barnflix.proxic

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.withCharset
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.application.hooks.ReceiveRequestBytes
import io.ktor.server.application.hooks.ResponseSent
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import io.ktor.server.response.ApplicationSendPipeline
import io.ktor.server.response.respond
import io.ktor.util.AttributeKey
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.WriterScope
import io.ktor.utils.io.writer
import kotlinx.coroutines.Job
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException

/**
 * Infrastructure limits — PHASE_01 §1.99, §1.100.
 *
 * §1.100 asks for "reasonable infrastructure limits", explicitly not
 * sophisticated public-service rate limiting. These are the four it
 * names, sized against the stated ceiling of five concurrent matches
 * on one host.
 *
 * The reasoning behind each number matters more than the number: an
 * unexplained limit is one nobody dares change, so it either blocks
 * legitimate work forever or gets raised to infinity the first time
 * it fires.
 */
object Limits {
    /**
     * Largest accepted HTTP request body.
     *
     * Phase 1 accepts no uploads at all, so this is deliberately
     * small. Phase 2 imports deck packages — a ZIP with artwork,
     * hundreds of megabytes — and must raise it FOR THAT ROUTE
     * rather than globally. A single global limit wide enough for a
     * deck package would let any endpoint accept one.
     */
    const val MAX_HTTP_BODY_BYTES: Long = 1L * 1024 * 1024

    /**
     * Largest accepted WebSocket frame.
     *
     * Phase 6 sends full game-state snapshots, which are the biggest
     * legitimate frames this protocol will carry. A 130-card board
     * with stack and zones is tens of kilobytes of JSON; 1 MB leaves
     * a wide margin while still bounding a hostile client.
     */
    const val MAX_WS_FRAME_BYTES: Long = 1L * 1024 * 1024

    /**
     * Concurrent /ws/system connections.
     *
     * Five matches, two players each, plus reconnects and a spare
     * browser tab per person. 64 is far above any honest use and far
     * below what would exhaust the host.
     */
    const val MAX_SYSTEM_CONNECTIONS: Int = 64

    /** Seconds a request may take to arrive before Netty drops it. */
    const val REQUEST_READ_TIMEOUT_SECONDS: Int = 30

    /** Seconds a response may take to write. */
    const val RESPONSE_WRITE_TIMEOUT_SECONDS: Int = 30

    /** How often an idle socket is pinged, and how long it may not answer. */
    const val WS_PING_SECONDS: Long = 15
    const val WS_TIMEOUT_SECONDS: Long = 30

    /** Spec 0086, Amendment 2 -- the report route's limit: 5 MB. */
    const val REPORT_BODY_BYTES: Long = 5L * 1024 * 1024

    /**
     * Routes that accept more than [MAX_HTTP_BODY_BYTES], and how
     * much (PHASE_02 carry-forward C1).
     *
     * Deck import accepts a package of up to 150 MB. The GLOBAL
     * limit stays at 1 MB: raising it instead would let every
     * endpoint accept a deck-sized body, which is the opposite of
     * what PHASE_02 §2.30 asks for.
     *
     * Found by running it — the first version of the import endpoint
     * was refused by this plugin before the route ever saw the
     * upload, with a 413 naming the global limit.
     */
    private val ROUTE_LIMITS: List<Pair<String, Long>> =
        listOf(
            "/api/decks/import" to 150L * 1024 * 1024,
            // Spec 0022 -- the same package, sent by a linked computer.
            "/api/deck-builder/decks" to 150L * 1024 * 1024,
            // Spec 0086, Amendment 2 (owner 2026-11-14) -- a problem report:
            // its screen picture (now a JPEG) and its log, with room to spare.
            "/api/reports" to REPORT_BODY_BYTES,
        )

    fun bodyLimitFor(path: String): Long =
        ROUTE_LIMITS.firstOrNull { (prefix, _) -> path.startsWith(prefix) }?.second
            ?: MAX_HTTP_BODY_BYTES
}

/** Spec 0118 -- what a body that passed its route's limit is failed with, mid-read. */
class BodyTooLargeException(val limit: Long) : IOException("request body over $limit bytes")

/** Set on a call whose body passed its limit while it was read: how many bytes had been read. */
private val BODY_LIMIT_PASSED = AttributeKey<Long>("proxic.body-limit-passed")

/** The coroutine counting a call's body, stopped when the answer has gone (ResponseSent). */
private val BODY_COUNTER = AttributeKey<Job>("proxic.body-counter")

/** Bytes moved per read while counting; the body is never held whole. */
private const val COUNT_BUFFER_BYTES = 8 * 1024

private val BODY_LOG = LoggerFactory.getLogger("net.barnflix.proxic.Limits")

private val REFUSAL_JSON = Json { encodeDefaults = true }

/** True when this call's body passed its route's limit while being read (spec 0118). */
internal fun ApplicationCall.bodyLimitPassed(): Boolean = attributes.contains(BODY_LIMIT_PASSED)

/** The one 413 answer, both for a declared length and for a counted body. */
internal fun ApplicationCall.bodyTooLarge(): ErrorResponse =
    ErrorResponse(
        errorCode = "BODY_TOO_LARGE",
        // Spec 0114 (W2-138): a player's words; the limit is
        // in the log line, not the sentence.
        detail = "That was too much to send at once.",
        requestId = callId,
    )

/**
 * Bound every HTTP request body by its route's limit (`Limits.bodyLimitFor`).
 *
 * Two gates, one answer (413 `BODY_TOO_LARGE`):
 *
 * 1. **A declared `Content-Length` over the limit** is refused before a
 *    byte is read, as it always was.
 * 2. **Every body is counted as it is read** (spec 0118). The first gate
 *    alone let a body with no declared length (chunked) through whole:
 *    Netty bounds each chunk, not the body. Now the channel a route reads
 *    from is a counted copy of the request's (`ReceiveRequestBytes`):
 *    bytes are passed on as they arrive, never collected first, and the
 *    moment the count passes the limit the copy stops reading and fails
 *    with [BodyTooLargeException]. The route never sees a byte past the
 *    limit. Most routes read with `runCatching { call.receive<T>() }`, so
 *    the failure would turn into their own "could not read that" answer;
 *    instead, whatever the call answers after that is replaced, here in
 *    the send pipeline, by the same 413 the first gate gives.
 *
 * No request decompression is installed (Ktor 2.3's Compression only
 * encodes answers), so the bytes counted are the bytes the route reads.
 * WebSocket frames are bounded by `MAX_WS_FRAME_BYTES`, not here.
 */
val BodySizeLimit =
    createApplicationPlugin(name = "BodySizeLimit") {
        onCall { call ->
            val declared = call.request.headers[HttpHeaders.ContentLength]?.toLongOrNull() ?: return@onCall
            // Per-route, not global (carry-forward C1): deck import
            // accepts a package, every other endpoint does not.
            val limit = Limits.bodyLimitFor(call.request.path())
            if (declared > limit) {
                BODY_LOG.info("body of {} bytes refused at {}; the limit is {}", declared, call.request.path(), limit)
                call.respond(HttpStatusCode.PayloadTooLarge, call.bodyTooLarge())
            }
        }

        on(ReceiveRequestBytes) { call, body ->
            // A WebSocket's stream is its frames, bounded by MAX_WS_FRAME_BYTES;
            // counting it would end the socket after a megabyte of play.
            if (call.isWebSocketUpgrade()) return@on body
            val limit = Limits.bodyLimitFor(call.request.path())
            val counter = call.application.writer(autoFlush = true) { countInto(call, body, limit) }
            call.attributes.put(BODY_COUNTER, counter)
            counter.channel
        }

        // A route that stopped reading early must not leave the copy waiting.
        on(ResponseSent) { call -> call.attributes.getOrNull(BODY_COUNTER)?.cancel() }

        application.sendPipeline.intercept(ApplicationSendPipeline.Before) { message ->
            if (!call.bodyLimitPassed() || message is BodyTooLargeAnswer) return@intercept
            call.response.status(HttpStatusCode.PayloadTooLarge)
            val json = REFUSAL_JSON.encodeToString(ErrorResponse.serializer(), call.bodyTooLarge())
            proceedWith(BodyTooLargeAnswer(json))
        }
    }

/** A GET asking for a WebSocket: the only request whose stream is not counted. */
private fun ApplicationCall.isWebSocketUpgrade(): Boolean =
    request.httpMethod == HttpMethod.Get &&
        request.headers[HttpHeaders.Upgrade].equals("websocket", ignoreCase = true)

/** The 413 as JSON, already encoded, so it replaces any answer whatever that answer's type. */
private class BodyTooLargeAnswer(json: String) : OutgoingContent.ByteArrayContent() {
    private val bytes = json.toByteArray(Charsets.UTF_8)
    override val contentType = ContentType.Application.Json.withCharset(Charsets.UTF_8)
    override val contentLength = bytes.size.toLong()
    override val status = HttpStatusCode.PayloadTooLarge

    override fun bytes(): ByteArray = bytes
}

/** Copy [body] into this writer's channel, counting; fail it once [limit] is passed. */
@Suppress("TooGenericExceptionCaught") // any read failure is handed on to the reader, as unwrapped it was
private suspend fun WriterScope.countInto(
    call: ApplicationCall,
    body: ByteReadChannel,
    limit: Long,
) {
    val buffer = ByteArray(COUNT_BUFFER_BYTES)
    var total = 0L
    try {
        while (true) {
            val read = body.readAvailable(buffer, 0, buffer.size)
            if (read < 0) break
            total += read
            if (total > limit) {
                call.attributes.put(BODY_LIMIT_PASSED, total)
                BODY_LOG.info(
                    "body of at least {} bytes refused at {}; the limit is {}",
                    total,
                    call.request.path(),
                    limit,
                )
                channel.close(BodyTooLargeException(limit))
                return
            }
            channel.writeFully(buffer, 0, read)
        }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failed: Throwable) {
        channel.close(failed)
    }
}
