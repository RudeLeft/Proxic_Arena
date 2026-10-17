package net.barnflix.proxic.room

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.util.pipeline.PipelineContext
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.PRINCIPAL_KEY
import java.util.UUID

// Plumbing for the room routes.
//
// Split out when detekt found RoomRoutes.kt carrying both the
// endpoints and the machinery they share. The seam is worth having
// anyway: everything here answers "how do we say it", and nothing
// here decides anything.
//
// The refusal helpers exist so the privacy rule is written once.
// §4.65, carried forward as C2: a room you may not see and a room
// that does not exist give the same 404, and a rule spelled out at
// nine call sites is a rule that is wrong at one of them.

internal typealias Handler = PipelineContext<Unit, ApplicationCall>

internal fun Handler.callerId(): UUID = call.attributes[PRINCIPAL_KEY].user.userId

internal fun Handler.roomIdOrNull(): UUID? = call.parameters[ROOM_ID]?.let(::uuidOrNull)

internal fun uuidOrNull(raw: String): UUID? = runCatching { UUID.fromString(raw) }.getOrNull()

internal suspend inline fun <reified T : Any> Handler.bodyOrNull(): T? = runCatching { call.receive<T>() }.getOrNull()

/** The ordinary ending: answer the caller, then tell the room. */
internal suspend fun Handler.respondRoom(
    result: RoomResult,
    announcer: RoomAnnouncer,
) {
    when (result) {
        is RoomResult.Refused -> respondRefusal(result.error)
        is RoomResult.Ok -> {
            announcer.roomChanged(result.room)
            call.respond(RoomResponse(result.room.viewFor(callerId())))
        }
    }
}

internal suspend fun Handler.respondRefusal(error: RoomError) {
    call.respond(error.httpStatus(), ErrorResponse(error.code, error.detail, call.callId))
}

/**
 * The 404 a non-member gets.
 *
 * The body is written and then thrown away: carry-forward C2 — the
 * §1.44 StatusPages handler rewrites EVERY 404 into one shape, so
 * `ROOM_NOT_FOUND` never reaches a client. That is not a bug to fix
 * but the privacy rule in its strongest form: a non-member cannot
 * tell "no such room" from "not yours" because, on the wire, there
 * is nothing to tell apart. The code stays because the SERVER logs
 * are the better place to know which it was.
 */
internal suspend fun Handler.respondNoSuchRoom() {
    call.respond(
        HttpStatusCode.NotFound,
        ErrorResponse(RoomError.NotFound.code, RoomError.NotFound.detail, call.callId),
    )
}

internal suspend fun Handler.respondBadRoomId() {
    // Not a 404: a malformed id is a broken client, and saying so
    // leaks nothing, because no real room id has this shape.
    call.respond(
        HttpStatusCode.BadRequest,
        ErrorResponse("INVALID_ROOM_ID", "That is not a room id.", call.callId),
    )
}

internal suspend fun Handler.respondBadBody(detail: String) {
    call.respond(
        HttpStatusCode.BadRequest,
        ErrorResponse("INVALID_REQUEST", detail, call.callId),
    )
}
