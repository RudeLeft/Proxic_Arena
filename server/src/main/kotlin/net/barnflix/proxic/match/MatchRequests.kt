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

/** Spec 0047 — the seat the worker sends the public view as: nobody's. */
const val PUBLIC_SEAT = 0

/** Spec 0047 — build the public view (spectators are watching), or stop. */
fun watchedFrame(on: Boolean): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "WATCHED")
        put("messageId", UUID.randomUUID().toString())
        put("on", on)
    }

/**
 * Spec 0047 — how many people are watching, for the players. Spec 0067 —
 * and who: their display names, one per person, to the players only (the
 * "2 watching" pill lists them on point).
 */
fun watchingMessage(
    count: Int,
    names: List<String> = emptyList(),
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "WATCHING")
        put("messageId", UUID.randomUUID().toString())
        put("count", count)
        put("names", namesOf(names))
    }

/** §7.55 — the concession is on its way to Forge; the game's end follows as MATCH. */
fun concedeAcceptedMessage(): JsonObject = concedeMessage("CONCEDE_ACCEPTED", null)

/** §7.55 — not taken, and why (NOT_A_PLAYER, UNREACHABLE, NOT_STARTED, GAME_OVER). */
fun concedeRefusedMessage(reason: String): JsonObject = concedeMessage("CONCEDE_REFUSED", reason)

/**
 * Spec 0054 -- "End the game" for an away player: taken (null) or not, and
 * why (NOT_AWAY, NOT_A_PLAYER, UNREACHABLE). Its own type, so the page
 * never says "You conceded" to the player who stayed.
 */
fun awayEndMessage(refusal: String?): JsonObject {
    val type = if (refusal == null) "AWAY_END_ACCEPTED" else "AWAY_END_REFUSED"
    return concedeMessage(type, refusal)
}

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
