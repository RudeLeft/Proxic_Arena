package net.barnflix.proxic.room

import kotlinx.serialization.Serializable
import java.util.UUID

// What a room looks like on the wire — PHASE_05 §5.138–§5.141.
//
// ONE shape, used by the HTTP routes and by the socket's ROOM
// message. A lobby learns the room two ways -- it asks after a
// refresh (§5.139) and it is told when something changes (§5.76) --
// and if those two disagreed, the disagreement would appear as a
// client bug long after the cause.
//
// §5.140, §5.46, §5.47 — THE VIEW IS PER VIEWER. This started as
// one payload sent to everybody, carrying every member's deck id
// and deck name. The §5.228 audit caught it: §5.47 says another
// participant does not need an opponent's deck display NAME, and
// §5.140 forbids exactly the shape it had -- "one overbroad
// payload to all clients when deck information differs by viewer".
//
// A deck name is not harmless. It is the title of a private object
// in somebody's Deck Depot, it may be a deck shared with them by a
// third party, and §5.46 says the snapshot should expose only what
// setup requires. What setup requires is whether a seat has chosen
// yet; the rest is the chooser's business.
//
// So: your own seat carries the deck id and name, everybody else's
// carries a boolean. §5.141's safe list is the rest of it -- who,
// where they sit, whether they are ready -- and deck contents, the
// share graph and anything about sessions never travel at all.

@Serializable
data class RoomMemberView(
    val userId: String,
    val username: String,
    val displayName: String,
    val seatNumber: Int,
    val ready: Boolean,
    val isHost: Boolean,
    /**
     * §5.46, §5.141 — what the TABLE may know.
     *
     * Whether this seat has chosen, and nothing about what. A lobby
     * where you cannot tell if the other player is still deciding
     * is a lobby people stare at; a lobby that names their deck is
     * one that leaked.
     */
    val deckSelected: Boolean,
    /**
     * §5.47 — present ONLY on the viewer's own seat.
     *
     * Null on everybody else's, which is the difference between a
     * personalized snapshot and a broadcast.
     */
    val selectedDeckId: String? = null,
    val selectedDeckName: String? = null,
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

/**
 * The one place a Room becomes JSON, for ONE viewer.
 *
 * [viewerId] is who will read it, and it is never a client claim:
 * HTTP takes it from the authenticated principal and the socket
 * from the connection's own session (§5.67).
 */
fun Room.viewFor(viewerId: UUID): RoomView =
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
                    deckSelected = member.selectedDeckId != null,
                    // §5.47 — your own deck, and only your own.
                    selectedDeckId =
                        member.selectedDeckId.takeIf { member.userId == viewerId }?.toString(),
                    selectedDeckName =
                        member.selectedDeckName.takeIf { member.userId == viewerId },
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
        RoomError.MatchInProgress,
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
