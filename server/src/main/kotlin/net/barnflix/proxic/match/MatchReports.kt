package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import net.barnflix.proxic.BuildInfo
import java.util.UUID

// Spec 0088 (Q3 C) -- a player closing their report window: the gathered
// reports up to a stamp are gone for their seat. Routed like a concession:
// [LiveMatch.reportsClosed] decides whose seat it is.

/**
 * Spec 0088 (Q3 C) — [userId] closed their report window, which showed
 * reports up to [upTo]: routed to the worker for their own seat
 * ([LiveMatch.reportsClosed]). Null when it went, or why not.
 */
fun MatchRuntime.reportsClosed(
    matchId: UUID,
    userId: UUID,
    upTo: Long,
): String? {
    val running = liveMatch(matchId) ?: return "UNREACHABLE"
    return running.reportsClosed(userId, upTo)
}

/** Spec 0088 (Q3 C) — a closed report window, for the seat the SERVER resolved. */
fun reportsClosedFrame(
    seat: Int,
    upTo: Long,
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "REPORTS_CLOSED")
        put("messageId", UUID.randomUUID().toString())
        put("seat", seat)
        put("upTo", upTo)
    }
