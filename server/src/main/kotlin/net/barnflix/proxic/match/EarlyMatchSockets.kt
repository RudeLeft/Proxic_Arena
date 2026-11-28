package net.barnflix.proxic.match

import io.ktor.server.routing.Route
import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.close
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Sessions
import net.barnflix.proxic.auth.socketPrincipal
import java.util.UUID

// Spec 0122 (PHASE_11 P11-E12) -- the game's connection, started early.
//
// On a reload of /game or /watch/<room>, the page opens its game connection
// beside "who am I" (frontend early.ts), before its code has run and so
// before it knows which game it is in. These two addresses let the SERVER
// say which (spec 0122 "Which game: the server decides"): the same question
// `/api/matches/current` and `/api/matches/watch/{roomId}` answer, asked at
// the moment of the connection. Each is a thin front on the id route's own
// paths (`player`, `spectate` in MatchSocket.kt): nothing about a seat, a
// view, the pings, the queue or the seat links differs. A fresh page asks
// for nothing, so `resume` is never read here (0119, owner answer 5); a
// reconnect uses `/ws/matches/{matchId}` as before.
//
// No game for the address closes with 4003 "no game" (protocol/README.md),
// and the page falls back to today's path.

/** Spec 0122 -- the close code of an early address with no game behind it (protocol/README.md). */
const val NO_GAME_CODE: Short = 4003

private fun noGame() = CloseReason(NO_GAME_CODE, "no game")

private const val ROOM_ID = "roomId"

internal fun Route.earlyMatchSockets(
    sessions: Sessions,
    matches: MatchStore,
    runtime: MatchRuntime,
    hub: MatchHub,
    config: ServerConfig,
    rooms: net.barnflix.proxic.room.RoomService? = null,
) {
    // A player: the game the signed-in user is seated in (LAUNCHING or
    // RUNNING, `MatchStore.activeMatchOf`), named in MATCH_HELLO as on the id route.
    webSocket("/ws/matches/current") {
        val principal = socketPrincipal(sessions, config) ?: return@webSocket
        val userId = principal.user.userId
        // Off the connection's event loop, as the session check is (AuthGates.kt).
        val match = withContext(Dispatchers.IO) { matches.activeMatchOf(userId) }
        val seat = match?.participants?.firstOrNull { it.userId == userId }?.seatNumber
        if (match == null || seat == null) {
            close(noGame())
            return@webSocket
        }
        val asks = hub.deltas.asked(call.request.queryParameters["deltas"])
        player(PlayerOpen(match.matchId, userId, seat, asks.players, resumeFrom = null), runtime, hub)
    }

    // A spectator: the game a room is playing, found as `/api/matches/watch/{roomId}`
    // finds it (MatchRoutes.kt `watchRoute`). The public view only.
    webSocket("/ws/matches/watch/{$ROOM_ID}") {
        val principal = socketPrincipal(sessions, config) ?: return@webSocket
        val roomId = call.parameters[ROOM_ID]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        val match = roomId?.let { roomsGame(it, rooms, matches) }
        watchEarly(roomId, match, principal.user, runtime, hub)
    }
}

/** The game [roomId] is playing (its host's active match, in that room), or null. */
private suspend fun roomsGame(
    roomId: UUID,
    rooms: net.barnflix.proxic.room.RoomService?,
    matches: MatchStore,
): Match? =
    withContext(Dispatchers.IO) {
        rooms?.find(roomId)?.let { matches.activeMatchOf(it.hostUserId) }?.takeIf { it.roomId == roomId }
    }

private suspend fun DefaultWebSocketServerSession.watchEarly(
    roomId: UUID?,
    match: Match?,
    user: net.barnflix.proxic.auth.User,
    runtime: MatchRuntime,
    hub: MatchHub,
) {
    when {
        // HID-001 -- a player of this game is never given their seat here, nor
        // the public view as a stand-in: the address is not theirs (the API
        // answers 409 "This is your own game"). Nothing is sent before the close.
        match != null && match.participants.any { it.userId == user.userId } -> close(noGame())
        match != null && mayWatch(match, runtime) -> {
            val asks = hub.deltas.asked(call.request.queryParameters["deltas"])
            spectate(match.matchId, user, runtime, hub, asks.spectators, resumeFrom = null)
        }
        // Spec 0067 -- the room's game just ended here: told how, then closed normally.
        match == null && toldTheEnd(roomId?.let { hub.endings.lastIn(it) }, hub) -> Unit
        // No room, no game, or one not yet past its opening hands.
        else -> close(noGame())
    }
}
