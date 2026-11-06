package net.barnflix.proxic.match

import io.ktor.server.application.ApplicationStopPreparing
import io.ktor.server.application.ApplicationStopped
import io.ktor.server.routing.Route
import io.ktor.server.routing.application
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import net.barnflix.proxic.BuildInfo
import org.slf4j.LoggerFactory
import java.util.UUID

// Spec 0056 — the server stops while games are being played.
//
// Today's update ended a game with "game over" and no warning: the
// container went, every worker was force-stopped, and at the next start
// MatchRecovery marked the match SERVER_RESTARTED. The ending is the same
// now -- no result, nobody won or lost -- but it is said, and said first:
// before the engine closes any connection (Ktor raises
// ApplicationStopPreparing before it closes its channels), each game's
// players get SERVER_STOPPING on their game socket, and the match ends
// as SERVER_RESTARTED there and then, which reaches them as the lobby's
// MATCH message too. Docker gives the server 30 seconds for this
// (docker-compose.yml stop_grace_period; it used to wait 10).

/** The failure code a game cut short by a server stop carries (MatchRecovery writes it too). */
const val SERVER_RESTARTED = "SERVER_RESTARTED"

/** How long the frames are given to leave before the connections close. */
private const val FLUSH_MILLIS = 1_500L

private val log = LoggerFactory.getLogger("net.barnflix.proxic.match.ServerStopping")

/**
 * Spec 0056 — the server is stopping: this game cannot be finished. No
 * words: the page has them, in plain English ("The server is being
 * updated..."), and nothing about the server is sent.
 */
fun serverStoppingMessage(): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "SERVER_STOPPING")
        put("messageId", UUID.randomUUID().toString())
    }

/** Spec 0056 — every player of [match] and everybody watching it, told the server is stopping. */
suspend fun tellServerStopping(
    hub: MatchHub,
    match: Match,
) {
    val message = serverStoppingMessage()
    match.participants.map { it.userId }.distinct().forEach { player -> hub.sendTo(match.matchId, player, message) }
    hub.spectate(match.matchId, message)
}

/**
 * §6.162 — a stopping server takes its match workers with it. Each is
 * ~611 MB; leaving them behind would outlive the thing that knows they
 * exist. Spec 0056 — and their players are told first, while their
 * connections are still open.
 */
fun stopMatchesWithServer(
    route: Route,
    matchRuntime: MatchRuntime,
    hub: MatchHub,
) {
    route.application.environment.monitor.subscribe(ApplicationStopPreparing) {
        val stopped = matchRuntime.stopAll { match -> tellServerStopping(hub, match) }
        if (stopped > 0) {
            log.warn("server stopping: $stopped game(s) could not be finished; their players were told")
            // The frames are queued on each connection; give them a moment
            // to be written before the engine closes the sockets.
            Thread.sleep(FLUSH_MILLIS)
        }
    }
    // Whatever began after that (nothing should): stopped all the same.
    route.application.environment.monitor.subscribe(ApplicationStopped) {
        matchRuntime.stopAll()
    }
}
