package net.barnflix.proxic

import org.slf4j.MDC

/**
 * Structured log fields — PHASE_01 §1.41.
 *
 * §1.41 names ten fields. Four are supplied by the logging framework
 * itself (timestamp, level, message) or by configuration (service);
 * the rest are context that the code must attach as it becomes known:
 *
 *   request_id     Ktor CallId, per HTTP request (§1.43)
 *   connection_id  per WebSocket connection (§1.30)
 *   session_id     Phase 3
 *   match_id       Phase 6
 *   player_id      Phase 6
 *   error_code     attached when a failure is reported
 *
 * The later ones are declared here now, unused, on purpose. A log
 * field added after the code that should set it tends to be
 * populated in some paths and not others, and the gap is invisible
 * until the day a match misbehaves and the lines that matter have no
 * match_id on them.
 *
 * MDC is thread-local. Ktor handlers are coroutines that can resume
 * on a different thread, so a value PUT and never REMOVED can leak
 * into an unrelated request's log lines — attributing one player's
 * errors to another. [withFields] therefore always restores what it
 * found, including on an exception.
 */
object LogContext {
    const val REQUEST_ID = "requestId"
    const val CONNECTION_ID = "connectionId"
    const val SESSION_ID = "sessionId"
    const val MATCH_ID = "matchId"
    const val PLAYER_ID = "playerId"
    const val ERROR_CODE = "errorCode"

    /** Every field §1.41 expects the code to attach. */
    val ALL = listOf(REQUEST_ID, CONNECTION_ID, SESSION_ID, MATCH_ID, PLAYER_ID, ERROR_CODE)

    /**
     * Run [block] with [fields] attached, restoring the previous
     * state afterwards.
     *
     * Restores rather than clears: nesting is normal (a connection
     * inside a request, a match inside a connection), and clearing
     * would silently strip the outer context.
     */
    inline fun <T> withFields(
        vararg fields: Pair<String, String?>,
        block: () -> T,
    ): T {
        val previous = fields.map { (key, _) -> key to MDC.get(key) }
        fields.forEach { (key, value) ->
            if (value == null) MDC.remove(key) else MDC.put(key, value)
        }
        return try {
            block()
        } finally {
            previous.forEach { (key, old) ->
                if (old == null) MDC.remove(key) else MDC.put(key, old)
            }
        }
    }
}
