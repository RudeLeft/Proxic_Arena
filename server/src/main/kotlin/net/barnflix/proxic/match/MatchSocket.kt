package net.barnflix.proxic.match

import io.ktor.server.routing.Route
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Sessions
import net.barnflix.proxic.auth.socketPrincipal
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

// The match socket — PHASE_06 §6.107-§6.113.
//
// A SEPARATE endpoint from /ws/user, which Phase 5 deliberately
// was not. §6.107 names this one, and the reason to take it at its
// word rather than reuse the lobby socket is §6.108: the
// participation check is per MATCH, and a socket that is already
// open for the lobby would have to acquire and drop that
// authorisation as the user moves in and out of games. A
// connection whose permissions change under it is the kind of
// thing that is correct on the day it is written.
//
// §6.113 is the other half: refreshing must not launch another
// worker, create another match or lose the pending decision.
// Nothing here creates anything — it attaches to a match that
// already exists and asks the runtime what is outstanding.

private val connectionSequence = AtomicLong()

private const val MATCH_ID = "matchId"

fun Route.matchSocket(
    sessions: Sessions,
    matches: MatchStore,
    runtime: MatchRuntime,
    hub: MatchHub,
    config: ServerConfig,
) {
    webSocket("/ws/matches/{$MATCH_ID}") {
        // §3.78 — the cookie, and our own page (socketPrincipal).
        val principal = socketPrincipal(sessions, config) ?: return@webSocket

        val matchId =
            call.parameters[MATCH_ID]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        val match = matchId?.let { matches.find(it) }
        val userId = principal.user.userId
        val seat = match?.participants?.firstOrNull { it.userId == userId }?.seatNumber

        // §6.108 — knowing a match id is NOT sufficient, and there
        // is no spectator access in Phase 6. A match you are not
        // in and a match that does not exist close the same way:
        // §4.65's lesson, for the sixth phase running.
        if (match == null || seat == null) {
            close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "not a participant"))
            return@webSocket
        }

        val connectionId = "mconn-${connectionSequence.incrementAndGet()}"
        hub.open(matchId, userId, connectionId, outgoing)

        try {
            // §6.110 — hello first, and NOT a decision before it.
            send(Frame.Text(matchHelloMessage(matchId, seat).toString()))

            // §6.110, §6.48 — STATE FIRST. A decision references
            // objects by id, so the board has to arrive before
            // the question that names them.
            runtime.snapshotFor(matchId, userId)?.let { state ->
                send(Frame.Text(snapshotMessage(state).toString()))
            }

            // §6.111, §6.112 — whatever Forge is still waiting for,
            // re-sent to the connection that just arrived. The
            // decision stayed pending while nobody was listening:
            // a disconnect must never pass, concede or pick for
            // somebody. The runtime answers null for a question
            // this user may not answer, so a reconnecting opponent
            // learns nothing about what you are being asked.
            runtime.pendingFor(matchId, userId)?.let { question ->
                send(Frame.Text(decisionMessage(question).toString()))
            }
            // Spec 0002 — and who is being asked, so a returning player's
            // screen does not guess it from priority.
            runtime.askingFor(matchId)?.let { asking -> send(Frame.Text(asking.toString())) }

            for (frame in incoming) {
                val text = (frame as? Frame.Text)?.readText() ?: continue
                handle(text, matchId, userId, runtime)?.let { reply ->
                    send(Frame.Text(reply.toString()))
                }
            }
        } finally {
            hub.close(matchId, userId, connectionId)
        }
    }
}

private val json = Json { ignoreUnknownKeys = true }

/**
 * One message from a browser.
 *
 * §6.100 — the ONLY things read from it are the decision id and
 * the chosen action. Not `seat`, not `userId`, not a Forge player
 * id, not a state version: those are the server's to know, and a
 * client that could supply them could answer for somebody else or
 * defeat the staleness check by naming the current version.
 */
private fun handle(
    text: String,
    matchId: UUID,
    userId: UUID,
    runtime: MatchRuntime,
): JsonObject? {
    val message =
        runCatching { json.parseToJsonElement(text) as JsonObject }.getOrNull() ?: return null

    return when (message["type"]?.jsonPrimitive?.content) {
        "DECISION_RESPONSE" -> {
            val decisionId =
                runCatching { message.getValue("decisionId").jsonPrimitive.long }.getOrNull()
                    ?: return refusalMessage(0, DecisionRefusal.STALE_DECISION)
            // A missing actionId is a PASS, which is an answer and
            // not an absence of one.
            val actionId = message["actionId"]?.jsonPrimitive?.contentOrNullSafe()

            when (val refusal = runtime.answer(matchId, userId, decisionId, actionId)) {
                null -> decisionAcceptedMessage(decisionId)
                else -> refusalMessage(decisionId, refusal)
            }
        }

        // P6-AG — search a question's options. Only the decision id
        // and the text are read; who is searching is the session's.
        // Results come back later, as DECISION_OPTIONS.
        "DECISION_SEARCH" -> {
            val decisionId =
                runCatching { message.getValue("decisionId").jsonPrimitive.long }.getOrNull()
                    ?: return searchRefusedMessage(0, DecisionRefusal.STALE_DECISION)
            val query = message["query"]?.jsonPrimitive?.contentOrNullSafe().orEmpty()
            runtime.search(matchId, userId, decisionId, query)?.let { searchRefusedMessage(decisionId, it) }
        }

        // PHASE_07 §7.53 — the player's stops, changed mid-game (they
        // were saved over HTTP first). Only step names are read.
        "STOPS" -> {
            val settings =
                runCatching { json.decodeFromJsonElement(StopSettings.serializer(), message) }
                    .getOrNull()
                    ?.cleaned()
            settings?.let { runtime.applyStops(matchId, userId, it) }
            null
        }

        // §7.53 extra — "Pass until end of turn". Nothing is read.
        "PASS_TURN" -> {
            runtime.passTurn(matchId, userId)
            null
        }

        // PHASE_07 §7.55 — nothing is read from it at all: who
        // concedes is the session's, and for their own seat only.
        "CONCEDE" ->
            when (val refusal = runtime.concede(matchId, userId)) {
                null -> concedeAcceptedMessage()
                else -> concedeRefusedMessage(refusal)
            }

        // A newer client saying something this server has not
        // heard of is ignored rather than disconnected.
        else -> null
    }
}

private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? =
    if (this is kotlinx.serialization.json.JsonNull) null else content
