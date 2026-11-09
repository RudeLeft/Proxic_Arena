package net.barnflix.proxic.match

import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import net.barnflix.proxic.BuildInfo
import org.slf4j.LoggerFactory
import java.util.UUID

// Spectating -- spec 0047, made whole by spec 0067 (owner 2026-11-09).
//
// Spec 0047 let a non-player watch the public view. 0067 found what that
// left out, by reading the code: spectators were never told the result
// (their board froze; a 5-second poll said "The game is over."), their
// connections were never closed at the end, the players saw a count but
// not who, and the lobby showed Watch while the game was still choosing
// hands. What is here closes those: the ending goes to the spectators on
// the match socket and their sockets close normally; a spectator who
// comes back just after is still told; the players get the watchers'
// names; the lobby's Spectate waits for a running game.

private val log = LoggerFactory.getLogger("net.barnflix.proxic.match.Spectating")

/** How many finished games' endings are remembered for a spectator who comes back late. */
private const val ENDINGS_KEPT = 64

/**
 * Spec 0047 — may this (non-player) watch: the match is RUNNING on this
 * server (past the opening hands) and its worker is alive. Asked again at
 * every connection. Spec 0067 — every game may be watched: the room's
 * "Let people watch" is gone.
 */
fun mayWatch(
    match: Match,
    runtime: MatchAssets,
): Boolean = match.status == MatchStatus.RUNNING && runtime.isLive(match.matchId)

/**
 * Spec 0067 — [roomId]'s game can be spectated now: running here, past its
 * opening hands, its worker alive (what [mayWatch] asks of the match). The
 * lobby's room card says "Starting..." until then.
 */
fun MatchRuntime.spectatableRoom(roomId: UUID): Boolean {
    val game = games.firstOrNull { it.match.roomId == roomId } ?: return false
    return game.running && game.worker.isAlive()
}

/**
 * Spec 0067 — the latest public view with the WHOLE public play log so far
 * (only what every player may see: "Bob drew a card"), for a spectator who
 * just arrived, as [LiveMatch.snapshotFor] is for a player.
 */
fun LiveMatch.publicSnapshotWithLog(): JsonObject? {
    val state = publicSnapshot ?: return null
    val lines = playLogs.of(PUBLIC_SEAT)
    if (lines.isEmpty()) return state
    return JsonObject(state + ("playLog" to SeatPlayLogs.shownOnly(lines, state)))
}

/**
 * Spec 0067 — WATCHING for the players: how many people, and their display
 * names (each once, however many tabs), sorted so the list does not shuffle.
 */
internal fun watchingNow(
    matchId: UUID,
    hub: MatchHub,
): JsonObject {
    val people = hub.spectators.users(matchId)
    val names = people.map { hub.spectatorNames[it] ?: "Somebody" }.sortedBy { it.lowercase() }
    return watchingMessage(people.size, names)
}

/** Spec 0067 — how a spectator's socket is closed at the game's end: normally. */
fun gameOverClose(): CloseReason = CloseReason(CloseReason.Codes.NORMAL, "game over")

/**
 * Spec 0067 — the game is over, to its spectators (the players hear it as
 * the lobby's MATCH): the same fields, by seat, never a name. Sent last on
 * a spectator's socket, which the server then closes (NORMAL, "game over").
 */
fun matchEndedMessage(
    match: Match,
    failureCode: String?,
    outcome: GameOutcome?,
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "MATCH_ENDED")
        put("messageId", UUID.randomUUID().toString())
        put("matchId", match.matchId.toString())
        put("status", match.status.name)
        failureCode?.let { put("failureCode", it) }
        outcome?.let {
            put("outcome", it.kind)
            it.winningSeat?.let { seat -> put("winningSeat", seat) }
            put("endedOnTurn", it.turn)
            it.reason?.let { reason -> put("reason", reason) }
            it.concededSeat?.let { seat -> put("concededSeat", seat) }
            it.lossReason?.let { why -> put("lossReason", why) }
        }
    }

/** Spec 0067 — a match ended (any way): tell whoever was watching it. */
fun interface SpectatorsTold {
    suspend fun ended(
        match: Match,
        failureCode: String?,
        outcome: GameOutcome?,
    )

    companion object {
        val NONE = SpectatorsTold { _, _, _ -> }
    }
}

/**
 * Spec 0067 — the endings told to spectators: sent to every spectator
 * connection of the match, each then closed normally, and remembered (the
 * last [ENDINGS_KEPT]) so a spectator whose connection dropped as the game
 * ended, and who comes back to a match that can no longer be watched, is
 * told how it ended instead of nothing. The outcome is public: the Hall of
 * Champions shows it.
 */
class SpectatorEndings(private val spectators: MatchWatchers) : SpectatorsTold {
    private val kept =
        java.util.Collections.synchronizedMap(
            object : LinkedHashMap<UUID, JsonObject>() {
                override fun removeEldestEntry(eldest: MutableMap.MutableEntry<UUID, JsonObject>?) = size > ENDINGS_KEPT
            },
        )

    /** How [matchId] ended, if it ended lately here. */
    fun of(matchId: UUID): JsonObject? = kept[matchId]

    override suspend fun ended(
        match: Match,
        failureCode: String?,
        outcome: GameOutcome?,
    ) {
        val message = matchEndedMessage(match, failureCode, outcome)
        kept[match.matchId] = message
        val text = message.toString()
        spectators.all(match.matchId).forEach { connection ->
            runCatching {
                connection.outgoing.send(Frame.Text(text))
                // Closed cleanly, so the page does not report a lost connection.
                connection.outgoing.send(Frame.Close(gameOverClose()))
            }.onFailure { log.debug("match ${match.matchId}: a spectator connection would not take the ending") }
        }
    }
}

/**
 * Spec 0067 — a non-player connecting to a match that ended here lately
 * (a spectator whose connection dropped at the end): told how it ended,
 * then closed normally. False when there is nothing to tell.
 */
internal suspend fun io.ktor.server.websocket.DefaultWebSocketServerSession.toldTheEnd(
    match: Match?,
    hub: MatchHub,
): Boolean {
    val ending = match?.let { hub.endings.of(it.matchId) } ?: return false
    send(Frame.Text(ending.toString()))
    close(gameOverClose())
    return true
}

/** The names, as JSON, for [watchingMessage]. */
internal fun namesOf(names: List<String>): JsonArray = JsonArray(names.map { JsonPrimitive(it) })
