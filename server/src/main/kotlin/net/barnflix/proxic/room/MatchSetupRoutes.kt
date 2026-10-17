package net.barnflix.proxic.room

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable

// Preparing a match — PHASE_05 §5.91, §5.100, §5.101, §5.117.
//
// Two host-only endpoints and one read. Everything they decide is
// decided in MatchSetupService; what lives here is §5.101, because
// privacy is a property of WHERE an answer is sent and the service
// cannot see the sockets.
//
// The division: the host is told WHICH seats need attention, each
// affected player is told WHAT is wrong with their own deck, and
// nobody is told about anybody else's. A host who could read the
// other player's validation error would be reading something about
// a deck that was shared with that player, not with the table.

@Serializable
data class SeatAttentionView(
    val userId: String,
    /**
     * Deliberately a boolean and not a code.
     *
     * §5.101 — the table needs "ready" or "requires attention". A
     * code would leak the shape of the problem (a missing deck and
     * a revoked share are different facts about another person),
     * and a UI that renders a checklist needs no more than this.
     */
    val needsAttention: Boolean,
)

@Serializable
data class NotReadyResponse(
    val errorCode: String = "SETUP_NOT_READY",
    val detail: String,
    val seats: List<SeatAttentionView>,
)

@Serializable
data class MatchSetupResponse(
    val setup: MatchSetupView,
    val room: RoomView,
)

@Serializable
data class CurrentSetupResponse(val setup: MatchSetupView? = null)

fun Route.matchSetupRoutes(
    setups: MatchSetupService,
    rooms: RoomService,
    announcer: RoomAnnouncer = SilentAnnouncer,
) {
    // §5.91 — validate and freeze. This does not start Forge.
    post("/rooms/{$ROOM_ID}/prepare-match") {
        val roomId = roomIdOrNull() ?: return@post respondBadRoomId()
        val expected = call.request.queryParameters["expectedRoomRevision"]?.toLongOrNull()

        when (val result = setups.prepare(roomId, callerId(), expected)) {
            is PrepareResult.Refused -> respondRefusal(result.error)

            is PrepareResult.NotReady -> {
                // §5.100 — each player's own detail goes to that
                // player, over the socket they already hold.
                for (problem in result.problems) {
                    announcer.setupProblem(problem.userId, roomId, problem.code, problem.detail)
                }

                // §5.101 — and the host gets a checklist, not a
                // transcript. Every member appears, so the answer
                // does not reveal the roster by omission.
                val needingAttention = result.problems.map { it.userId }.toSet()
                val seats =
                    rooms.find(roomId)?.members.orEmpty().map { member ->
                        SeatAttentionView(
                            member.userId.toString(),
                            member.userId in needingAttention,
                        )
                    }

                call.respond(
                    HttpStatusCode.Conflict,
                    NotReadyResponse(
                        detail = "Not everyone is ready yet.",
                        seats = seats,
                    ),
                )
            }

            is PrepareResult.Prepared -> {
                announcer.roomChanged(result.room)
                call.respond(MatchSetupResponse(result.setup, result.room.view()))
            }
        }
    }

    // §5.117 — back to OPEN, readiness reset, deck choices kept.
    post("/rooms/{$ROOM_ID}/cancel-preparation") {
        val roomId = roomIdOrNull() ?: return@post respondBadRoomId()

        when (val result = setups.cancel(roomId, callerId())) {
            is RoomResult.Refused -> respondRefusal(result.error)
            is RoomResult.Ok -> {
                announcer.roomChanged(result.room)
                call.respond(RoomResponse(result.room.view()))
            }
        }
    }

    // What the lobby shows once a match is prepared. Members only,
    // on §4.65's rule: a non-member asking gets the same 404 as
    // somebody naming a room that does not exist.
    get("/rooms/{$ROOM_ID}/match-setup") {
        val roomId = roomIdOrNull() ?: return@get respondBadRoomId()
        val room = rooms.find(roomId)
        if (room == null || !room.isMember(callerId())) return@get respondNoSuchRoom()
        call.respond(CurrentSetupResponse(setups.readySetup(roomId)))
    }
}

/** §5.32, §5.94 — what this server supports, server-authoritative. */
@Serializable
data class MatchPresetView(
    val presetId: String,
    val displayName: String,
    val allowedPlayerCounts: List<Int>,
)

@Serializable
data class MatchPresetsResponse(val presets: List<MatchPresetView>)

/**
 * §5.37 — the preset list the browser may offer.
 *
 * A fixed list of one, because Open Format is the only play mode
 * (FMT-001). It is an endpoint rather than a constant in the
 * frontend so that §5.94 can be honest: the server decides what is
 * supported, and a browser holding a stale list is corrected rather
 * than believed.
 */
fun Route.matchPresetRoutes() {
    get("/match-presets") {
        call.respond(
            MatchPresetsResponse(
                listOf(
                    MatchPresetView(
                        presetId = "OPEN_FORMAT_1V1",
                        displayName = "Open Format",
                        allowedPlayerCounts = listOf(2),
                    ),
                ),
            ),
        )
    }
}
