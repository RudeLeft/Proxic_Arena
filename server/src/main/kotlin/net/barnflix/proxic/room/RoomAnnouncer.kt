package net.barnflix.proxic.room

import java.util.UUID

// Telling the members — PHASE_05 §5.76, §5.79, §5.81.
//
// A room mutation that only answers the caller is half an answer:
// §5.76 says the REMAINING members receive the update, and §5.81
// says a removed user's view must stop being authoritative. The
// lobby socket is how that reaches them.
//
// Declared here, in `room`, and implemented over in `lobby`. That
// direction is the point: the room rules already have no idea a
// WebSocket exists, and this keeps it that way. A route calls a
// service and then announces the result; neither the service nor
// this interface knows what a frame is.

interface RoomAnnouncer {
    /** Everyone seated now sees the room as it now is. */
    suspend fun roomChanged(room: Room)

    /**
     * The room is gone, and these people were in it.
     *
     * The membership has to be passed in because by the time this
     * is called there is nobody left to look up: closing ends the
     * memberships, so a snapshot taken AFTER the close would tell
     * nobody.
     */
    suspend fun roomClosed(
        roomId: UUID,
        formerMembers: Collection<UUID>,
        reason: String,
    )

    /**
     * One player's own validation problem — §5.100, §5.101.
     *
     * Sent to THAT PLAYER and nobody else. §5.101 is explicit: the
     * rest of the table learns that somebody needs attention, never
     * what is wrong with their deck. Routing it here rather than
     * returning it to the host is what makes that true by
     * construction instead of by everyone remembering.
     */
    suspend fun setupProblem(
        userId: UUID,
        roomId: UUID,
        code: String,
        detail: String,
    )

    /** One person is out; the room continues without them (§5.81). */
    suspend fun removedFromRoom(
        roomId: UUID,
        userId: UUID,
        reason: String,
    )
}

/** For wiring that has no socket: tests, and a server with no lobby. */
object SilentAnnouncer : RoomAnnouncer {
    override suspend fun roomChanged(room: Room) = Unit

    override suspend fun setupProblem(
        userId: UUID,
        roomId: UUID,
        code: String,
        detail: String,
    ) = Unit

    override suspend fun roomClosed(
        roomId: UUID,
        formerMembers: Collection<UUID>,
        reason: String,
    ) = Unit

    override suspend fun removedFromRoom(
        roomId: UUID,
        userId: UUID,
        reason: String,
    ) = Unit
}
