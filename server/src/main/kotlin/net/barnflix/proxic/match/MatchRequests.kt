package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import net.barnflix.proxic.BuildInfo
import java.util.UUID

// Requests a player makes of a running match that are not answers:
// a search of a question's options (P6-AG) and a concession
// (PHASE_07 §7.55). Each only routes to the match this process is
// running; [LiveMatch] decides whether the player may.

/** P6-AG — a search, authorised by [LiveMatch] like an answer. */
fun MatchRuntime.search(
    matchId: UUID,
    userId: UUID,
    decisionId: Long,
    query: String,
): DecisionRefusal? {
    val running = liveMatch(matchId) ?: return DecisionRefusal.UNREACHABLE
    return running.search(userId, decisionId, query)
}

/**
 * §7.55 — a concession, authorised by [LiveMatch.concede]. Null when it
 * went to Forge; the game's end then arrives like any other (MATCH).
 */
fun MatchRuntime.concede(
    matchId: UUID,
    userId: UUID,
): String? {
    val running = liveMatch(matchId) ?: return "UNREACHABLE"
    return running.concede(userId)
}

/**
 * §7.55 — a concession the SERVER authorised. The seat is the server's,
 * resolved from the session, never the browser's.
 */
fun concedeFrame(seat: Int): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "CONCEDE")
        put("messageId", UUID.randomUUID().toString())
        put("seat", seat)
    }

/** §7.55 — the concession is on its way to Forge; the game's end follows as MATCH. */
fun concedeAcceptedMessage(): JsonObject = concedeMessage("CONCEDE_ACCEPTED", null)

/** §7.55 — not taken, and why (NOT_A_PLAYER, UNREACHABLE, NOT_STARTED, GAME_OVER). */
fun concedeRefusedMessage(reason: String): JsonObject = concedeMessage("CONCEDE_REFUSED", reason)

private fun concedeMessage(
    type: String,
    reason: String?,
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", type)
        put("messageId", UUID.randomUUID().toString())
        reason?.let { put("reason", it) }
    }

/** AMENDMENT 13 — a step nobody is asked at, for the step bar (public). */
fun stepMessage(state: JsonObject): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "MATCH_STEP")
        put("messageId", UUID.randomUUID().toString())
        put("state", state)
    }
