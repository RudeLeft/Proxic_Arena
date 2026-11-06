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
    rooms: net.barnflix.proxic.room.RoomService? = null,
    /** Spec 0054 — who is offline, for "End the game" when the other player is away. */
    presence: net.barnflix.proxic.room.Presence = net.barnflix.proxic.room.EveryoneOnline,
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
        // Spec 0047 — not a player: a spectator, if the game is on here and
        // its room lets people watch. Sent the public view, never asked.
        if (match != null && seat == null && mayWatch(match, runtime, rooms)) {
            spectate(matchId!!, userId, runtime, hub)
            return@webSocket
        }
        if (match == null || seat == null) {
            close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "not a participant"))
            return@webSocket
        }

        val connectionId = "mconn-${connectionSequence.incrementAndGet()}"
        hub.watchers.open(matchId, userId, connectionId, outgoing)

        try {
            // Spec 0047 — how many are watching, from the start.
            hub.spectators.people(matchId).takeIf { it > 0 }?.let { count ->
                send(Frame.Text(watchingMessage(count).toString()))
            }
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
            askingFor(runtime, matchId)?.let { asking -> send(Frame.Text(asking.toString())) }

            for (frame in incoming) {
                val text = (frame as? Frame.Text)?.readText() ?: continue
                handle(text, matchId, userId, runtime, presence)?.let { reply ->
                    send(Frame.Text(reply.toString()))
                }
            }
        } finally {
            hub.watchers.close(matchId, userId, connectionId)
        }
    }
}

/**
 * Spec 0047 — may this (non-player) watch: the match is RUNNING on this
 * server and its room says people may watch. Asked again at every
 * connection, so a host who closes the room ends it too.
 */
fun mayWatch(
    match: Match,
    runtime: MatchAssets,
    rooms: net.barnflix.proxic.room.RoomService?,
): Boolean =
    match.status == MatchStatus.RUNNING &&
        runtime.isLive(match.matchId) &&
        rooms?.find(match.roomId)?.watchable == true

/**
 * Spec 0047 — one spectator connection: the public view (now and as it
 * changes) and the steps; nothing they send is read. The players are
 * told how many people are watching as it changes.
 */
private suspend fun io.ktor.server.websocket.DefaultWebSocketServerSession.spectate(
    matchId: UUID,
    userId: UUID,
    runtime: MatchRuntime,
    hub: MatchHub,
) {
    val connectionId = "mwatch-${connectionSequence.incrementAndGet()}"
    hub.spectators.open(matchId, userId, connectionId, outgoing)
    watching(runtime, matchId, userId, on = true, anyoneLeft = true)
    tellPlayers(matchId, runtime, hub)
    try {
        send(Frame.Text(matchHelloMessage(matchId, PUBLIC_SEAT).toString()))
        runtime.liveMatch(matchId)?.publicSnapshot?.let { state ->
            send(Frame.Text(snapshotMessage(state).toString()))
        }
        askingFor(runtime, matchId)?.let { asking -> send(Frame.Text(asking.toString())) }
        for (frame in incoming) {
            // A spectator changes nothing: whatever arrives is dropped.
        }
    } finally {
        hub.spectators.close(matchId, userId, connectionId)
        val stillWatching = hub.spectators.of(matchId, userId).isNotEmpty()
        watching(runtime, matchId, userId, on = stillWatching, anyoneLeft = hub.spectators.people(matchId) > 0)
        tellPlayers(matchId, runtime, hub)
    }
}

/**
 * Spec 0047 — somebody started (or the last one stopped) watching: they
 * may fetch the public view's pictures, and the worker builds the public
 * view only while it is wanted.
 */
private fun watching(
    runtime: MatchRuntime,
    matchId: UUID,
    userId: UUID,
    on: Boolean,
    anyoneLeft: Boolean,
) {
    val running = runtime.liveMatch(matchId) ?: return
    if (on) running.spectators.add(userId) else running.spectators.remove(userId)
    running.worker?.watched(on || anyoneLeft)
}

private suspend fun tellPlayers(
    matchId: UUID,
    runtime: MatchRuntime,
    hub: MatchHub,
) {
    val players = runtime.liveMatch(matchId)?.match?.participants?.map { it.userId }?.distinct().orEmpty()
    val message = watchingMessage(hub.spectators.people(matchId))
    players.forEach { player -> hub.sendTo(matchId, player, message) }
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
    presence: net.barnflix.proxic.room.Presence,
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

        // PHASE_07 §7.55 — nothing is read from it at all: who
        // concedes is the session's, and for their own seat only.
        "CONCEDE" ->
            when (val refusal = runtime.concede(matchId, userId)) {
                null -> concedeAcceptedMessage()
                else -> concedeRefusedMessage(refusal)
            }

        // Spec 0054 — the other player has been offline long enough:
        // the player still here ends the game, as the other's
        // concession, so the game names the winner. Nothing but the
        // type is read: who is away, and for how long, is the server's.
        "END_FOR_AWAY" -> {
            val live = runtime.liveMatch(matchId) ?: return awayEndMessage("UNREACHABLE")
            awayEndMessage(
                live.endForAway(
                    userId,
                    presence::offlineSince,
                    net.barnflix.proxic.room.RoomTimeouts.active.away,
                    java.time.Instant.now(),
                ),
            )
        }

        // A newer client saying something this server has not
        // heard of is ignored rather than disconnected.
        else -> null
    }
}

private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? =
    if (this is kotlinx.serialization.json.JsonNull) null else content
// §6.162's stopMatchesWithServer lives in ServerStopping.kt (spec 0056).
