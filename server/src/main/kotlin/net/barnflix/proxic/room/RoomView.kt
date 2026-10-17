package net.barnflix.proxic.room

import kotlinx.serialization.Serializable

// What a room looks like on the wire — PHASE_05 §5.138–§5.141.
//
// ONE shape, used by the HTTP routes and by the socket's ROOM
// message. A lobby learns the room two ways -- it asks after a
// refresh (§5.139) and it is told when something changes (§5.76) --
// and if those two disagreed, the disagreement would appear as a
// client bug long after the cause.
//
// §5.141 governs what is in here. Safe shared member information:
// who, where they sit, whether they are ready, and which deck they
// chose BY NAME. Deck contents never travel (a deck shared with one
// member is not shared with the table), and neither does anything
// about sessions, accounts or the share graph.

@Serializable
data class RoomMemberView(
    val userId: String,
    val username: String,
    val displayName: String,
    val seatNumber: Int,
    val ready: Boolean,
    val isHost: Boolean,
    /**
     * Null means "has not chosen", which every member may see:
     * §5.141 lists deck selected/not selected as shared state, and
     * a lobby where you cannot tell whether the other player is
     * still deciding is a lobby people stare at.
     */
    val selectedDeckId: String?,
    val selectedDeckName: String?,
)

@Serializable
data class RoomView(
    val roomId: String,
    val hostUserId: String,
    val presetId: String,
    val desiredPlayerCount: Int,
    val status: String,
    /**
     * The optimistic-concurrency token (§5.136).
     *
     * Sent so a client can hand it back on the next mutation. A
     * client that does is told 409 rather than quietly overwriting
     * a change it never saw.
     */
    val revision: Long,
    val everyoneReady: Boolean,
    val members: List<RoomMemberView>,
)

/** The one place a Room becomes JSON. */
fun Room.view(): RoomView =
    RoomView(
        roomId = roomId.toString(),
        hostUserId = hostUserId.toString(),
        presetId = presetId,
        desiredPlayerCount = desiredPlayerCount,
        status = status.name,
        revision = revision,
        everyoneReady = everyoneReady(),
        members =
            members.map { member ->
                RoomMemberView(
                    userId = member.userId.toString(),
                    username = member.username,
                    displayName = member.displayName,
                    seatNumber = member.seatNumber,
                    ready = member.ready,
                    isHost = member.isHost,
                    selectedDeckId = member.selectedDeckId?.toString(),
                    selectedDeckName = member.selectedDeckName,
                )
            },
    )

/** §5.137 — which HTTP status a refusal deserves. */
fun RoomError.httpStatus(): io.ktor.http.HttpStatusCode =
    when (this) {
        // §4.65's lesson, carried forward: a room you may not see
        // and a room that is not there are the same answer.
        RoomError.NotFound -> io.ktor.http.HttpStatusCode.NotFound

        // §5.17 — you are allowed to ask, you are not the host.
        RoomError.HostRequired -> io.ktor.http.HttpStatusCode.Forbidden

        // The request was well formed and the room disagrees: a
        // conflict with state, not a malformed ask.
        RoomError.NotOpen,
        RoomError.Full,
        RoomError.AlreadyInARoom,
        RoomError.AlreadyMember,
        is RoomError.StaleRevision,
        -> io.ktor.http.HttpStatusCode.Conflict

        // Understood, and cannot be carried out as asked.
        RoomError.DeckNotUsable,
        RoomError.DeckRequired,
        is RoomError.InvalidConfiguration,
        -> io.ktor.http.HttpStatusCode.UnprocessableEntity
    }
