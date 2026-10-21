package net.barnflix.proxic.room

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse

// Room routes — PHASE_05 §5.14, §5.58, §5.76–§5.81, §5.138, §5.139.
//
// Thin on purpose. Every rule about who may do what lives in
// RoomService, inside the transaction that does the writing, for the
// reason §4.45 gave about decks: a rule enforced in a route is a
// rule the next route forgets, and the forgetful one is never the
// tested one. These handlers parse, call, map the answer to a status
// code, and tell the other members.
//
// What a route DOES decide is privacy, because that differs per
// route. The rule is §4.65's, carried forward as C2: a room you may
// not see and a room that does not exist give the same 404. A
// signed-in stranger must not be able to learn which room ids are
// real by watching the shape of a refusal.
//
// Authentication is not here either. /api/rooms is gated by the same
// intercept as /api/decks (carry-forward C4): requireAuth, then
// csrfOk, then the principal is stashed. Every handler below may
// assume a caller, and none of them may assume anything else.

internal const val ROOM_ID = "roomId"
private const val EXPECTED_REVISION = "expectedRoomRevision"

@Serializable
data class RoomResponse(val room: RoomView)

/** §5.139 — null is a real answer, not a missing one: no room. */
@Serializable
data class CurrentRoomResponse(val room: RoomView? = null)

@Serializable
data class SelectDeckRequest(
    /** Null clears the selection, which §5.59 then de-readies. */
    val deckId: String? = null,
    val expectedRoomRevision: Long? = null,
)

@Serializable
data class ReadyRequest(
    val ready: Boolean = false,
    val expectedRoomRevision: Long? = null,
)

/** PHASE_07 Amendment 9 — the body is optional, and so is the name. */
@Serializable
data class CreateRoomRequest(val name: String? = null)

@Serializable
data class PlayerCountRequest(
    val playerCount: Int = 0,
    val expectedRoomRevision: Long? = null,
)

fun Route.roomRoutes(
    rooms: RoomService,
    announcer: RoomAnnouncer = SilentAnnouncer,
) {
    route("/rooms") {
        readRoutes(rooms)
        lifecycleRoutes(rooms, announcer)
        memberRoutes(rooms, announcer)
    }
}

// --- reads ---------------------------------------------------------------

private fun Route.readRoutes(rooms: RoomService) {
    // §5.139 — what the lobby asks on load, so a refresh puts you
    // back where you were rather than outside it.
    get("/current") {
        call.respond(CurrentRoomResponse(rooms.roomOf(callerId())?.viewFor(callerId())))
    }

    // §5.138 — members only. A non-member gets exactly the answer
    // somebody naming a room id that was never issued gets.
    get("/{$ROOM_ID}") {
        val roomId = roomIdOrNull() ?: return@get respondBadRoomId()
        val room = rooms.find(roomId)
        if (room == null || !room.isMember(callerId())) return@get respondNoSuchRoom()
        call.respond(RoomResponse(room.viewFor(callerId())))
    }
}

// --- lifecycle -----------------------------------------------------------

private fun Route.lifecycleRoutes(
    rooms: RoomService,
    announcer: RoomAnnouncer,
) {
    // §5.14 — create a room and sit down in it. The host is a player
    // (§5.16), so there is no separate "take a seat" step.
    post {
        val name = RoomNames.typed(runCatching { call.receive<CreateRoomRequest>() }.getOrNull()?.name)
        if (name != null && !RoomNames.valid(name)) {
            return@post call.respond(
                HttpStatusCode.UnprocessableEntity,
                ErrorResponse(
                    "INVALID_ROOM_NAME",
                    "A room name is up to ${RoomNames.MAX_LENGTH} characters on one line.",
                    null,
                ),
            )
        }
        when (val result = rooms.create(callerId(), name)) {
            is RoomResult.Refused -> respondRefusal(result.error)
            is RoomResult.Ok -> {
                announcer.roomChanged(result.room)
                call.respond(HttpStatusCode.Created, RoomResponse(result.room.viewFor(callerId())))
            }
        }
    }

    // §5.76 — a member leaves. §5.18 — if that member is the host,
    // the room goes with them.
    post("/{$ROOM_ID}/leave") {
        val roomId = roomIdOrNull() ?: return@post respondBadRoomId()

        // Read the membership BEFORE the mutation. Afterwards there
        // is nobody left to tell: leaving removes the leaver, and a
        // host leaving removes everybody.
        val before = rooms.find(roomId)?.members?.map { it.userId }.orEmpty()

        when (val result = rooms.leave(roomId, callerId())) {
            is RoomResult.Refused -> respondRefusal(result.error)
            is RoomResult.Ok -> {
                if (result.room.status == RoomStatus.CLOSED) {
                    announcer.roomClosed(roomId, before, "HOST_LEFT")
                } else {
                    announcer.roomChanged(result.room)
                }
                call.respond(RoomResponse(result.room.viewFor(callerId())))
            }
        }
    }

    // §5.78, §5.79 — the host closes it.
    post("/{$ROOM_ID}/close") {
        val roomId = roomIdOrNull() ?: return@post respondBadRoomId()
        val before = rooms.find(roomId)?.members?.map { it.userId }.orEmpty()

        when (val result = rooms.close(roomId, callerId())) {
            is RoomResult.Refused -> respondRefusal(result.error)
            is RoomResult.Ok -> {
                announcer.roomClosed(roomId, before, "CLOSED_BY_HOST")
                call.respond(RoomResponse(result.room.viewFor(callerId())))
            }
        }
    }

    // §5.17 — the host chooses the player count.
    //
    // Open Format is two players (FMT-001), so the only accepted
    // value today is 2 and this endpoint cannot change anything. It
    // exists because §5.35's rule — never shrink below the seats
    // already taken — is far easier to write now than to remember
    // when a preset with a range arrives.
    put("/{$ROOM_ID}/player-count") {
        val roomId = roomIdOrNull() ?: return@put respondBadRoomId()
        val body =
            bodyOrNull<PlayerCountRequest>()
                ?: return@put respondBadBody("Expected a player count.")

        respondRoom(
            rooms.setPlayerCount(roomId, callerId(), body.playerCount, body.expectedRoomRevision),
            announcer,
        )
    }
}

// --- membership and seats -------------------------------------------------

private fun Route.memberRoutes(
    rooms: RoomService,
    announcer: RoomAnnouncer,
) {
    // §5.80 — the host removes somebody who is not the host.
    delete("/{$ROOM_ID}/members/{memberUserId}") {
        val roomId = roomIdOrNull() ?: return@delete respondBadRoomId()
        val targetId =
            call.parameters["memberUserId"]?.let(::uuidOrNull)
                ?: return@delete call.respond(
                    HttpStatusCode.BadRequest,
                    ErrorResponse("INVALID_USER_ID", "That is not a user id.", call.callId),
                )

        // A DELETE carries no body, so the revision rides in the
        // query string rather than being dropped on the floor.
        val expected = call.request.queryParameters[EXPECTED_REVISION]?.toLongOrNull()

        when (val result = rooms.remove(roomId, callerId(), targetId, expected)) {
            is RoomResult.Refused -> respondRefusal(result.error)
            is RoomResult.Ok -> {
                // §5.81 — the removed user is told separately,
                // because they are no longer in the list that gets
                // the room.
                announcer.removedFromRoom(roomId, targetId, "REMOVED_BY_HOST")
                announcer.roomChanged(result.room)
                call.respond(RoomResponse(result.room.viewFor(callerId())))
            }
        }
    }

    // §5.40 — each member chooses their OWN deck. There is no
    // parameter for whose, and that is how §5.44 is enforced: the
    // host cannot assign a deck because the endpoint cannot say it.
    put("/{$ROOM_ID}/my-deck") {
        val roomId = roomIdOrNull() ?: return@put respondBadRoomId()
        val body =
            bodyOrNull<SelectDeckRequest>()
                ?: return@put respondBadBody("Expected a deck id.")

        val raw = body.deckId
        val deckId = raw?.let(::uuidOrNull)
        if (raw != null && deckId == null) {
            return@put call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("INVALID_DECK_ID", "That is not a deck id.", call.callId),
            )
        }

        // §5.42 is deliberately NOT checked here. canUseDeck runs
        // inside the service's transaction, where the answer cannot
        // go stale between the check and the write (§5.51).
        respondRoom(
            rooms.selectDeck(roomId, callerId(), deckId, body.expectedRoomRevision),
            announcer,
        )
    }

    // §5.58 — ready, or not.
    put("/{$ROOM_ID}/ready") {
        val roomId = roomIdOrNull() ?: return@put respondBadRoomId()
        val body =
            bodyOrNull<ReadyRequest>()
                ?: return@put respondBadBody("Expected a ready flag.")

        respondRoom(
            rooms.setReady(roomId, callerId(), body.ready, body.expectedRoomRevision),
            announcer,
        )
    }
}
