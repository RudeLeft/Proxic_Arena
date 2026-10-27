package net.barnflix.proxic

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.path
import io.ktor.server.response.respond

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
        )

    fun bodyLimitFor(path: String): Long =
        ROUTE_LIMITS.firstOrNull { (prefix, _) -> path.startsWith(prefix) }?.second
            ?: MAX_HTTP_BODY_BYTES
}

/**
 * Reject an oversized HTTP body before reading it.
 *
 * The check is on `Content-Length`, so the request is refused BEFORE
 * the bytes are read rather than after they are in memory. A client
 * that lies about the length, or sends chunked without one, is still
 * bounded by Netty's own frame handling; this is the cheap first
 * gate, not the only one.
 */
val BodySizeLimit =
    createApplicationPlugin(name = "BodySizeLimit") {
        onCall { call ->
            val declared = call.request.headers[HttpHeaders.ContentLength]?.toLongOrNull() ?: return@onCall
            // Per-route, not global (carry-forward C1): deck import
            // accepts a package, every other endpoint does not.
            val limit = Limits.bodyLimitFor(call.request.path())
            if (declared > limit) {
                call.respond(
                    HttpStatusCode.PayloadTooLarge,
                    ErrorResponse(
                        errorCode = "BODY_TOO_LARGE",
                        // The limit is stated. A refusal that does not say
                        // what the limit is leaves a client guessing.
                        detail = "Request body exceeds $limit bytes.",
                        requestId = call.callId,
                    ),
                )
            }
        }
    }
