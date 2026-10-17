package net.barnflix.proxic.room

import java.util.UUID

// Room vocabulary — PHASE_05 §5.7, §5.24–§5.27, §5.86.
//
// Types first, so the service below reads as rules rather than as
// column juggling.

/** §5.86 — the room lifecycle, as the database CHECK enforces it. */
enum class RoomStatus { OPEN, READY_FOR_MATCH, CLOSED, EXPIRED }

/** §5.130 — a snapshot's lifecycle. */
enum class SetupStatus { READY, CONSUMED, INVALIDATED }

/**
 * A seat in a room (§5.24–§5.26).
 *
 * `seatNumber` is a position, not an identity: seat 1 today and seat
 * 2 tomorrow is the same person (§5.26). The identity is `userId`.
 */
data class RoomMember(
    val userId: UUID,
    val username: String,
    val displayName: String,
    val seatNumber: Int,
    val selectedDeckId: UUID?,
    val selectedDeckName: String?,
    val ready: Boolean,
    val isHost: Boolean,
)

/**
 * A room as the server sees it.
 *
 * `revision` is the optimistic-concurrency token (§5.x). Every
 * mutation bumps it, and a client acting on revision 17 cannot apply
 * its change to revision 18. Two people clicking at the same moment
 * is the ordinary case in a lobby, not the exotic one.
 */
data class Room(
    val roomId: UUID,
    val hostUserId: UUID,
    val presetId: String,
    val desiredPlayerCount: Int,
    val status: RoomStatus,
    val revision: Long,
    val members: List<RoomMember>,
) {
    fun isHost(userId: UUID): Boolean = hostUserId == userId

    fun member(userId: UUID): RoomMember? = members.firstOrNull { it.userId == userId }

    fun isMember(userId: UUID): Boolean = member(userId) != null

    /** §5.22 — every configured seat is taken. */
    fun isFull(): Boolean = members.size >= desiredPlayerCount

    /**
     * §5.x — everyone seated, everyone ready, every seat filled.
     *
     * Deliberately requires a FULL room: a one-player Open Format
     * match is not a match, and "ready" with an empty seat opposite
     * is a lobby waiting, not a lobby finished.
     */
    fun everyoneReady(): Boolean = members.size == desiredPlayerCount && members.all { it.ready }
}

/**
 * Why an operation was refused.
 *
 * One type rather than exceptions, because every one of these is an
 * expected answer the UI must render, not a fault. The codes follow
 * the §4.101 convention.
 */
sealed interface RoomError {
    val code: String
    val detail: String

    /**
     * §5.21 — and §4.65's lesson, carried forward: a room you may
     * not see and a room that does not exist are the same answer.
     * The route turns this into 404.
     */
    data object NotFound : RoomError {
        override val code = "ROOM_NOT_FOUND"
        override val detail = "No such room."
    }

    data object NotOpen : RoomError {
        override val code = "ROOM_NOT_OPEN"
        override val detail = "That room is no longer open."
    }

    data object Full : RoomError {
        override val code = "ROOM_FULL"
        override val detail = "That room is full."
    }

    /** §5.5 — one room at a time, so leaving is an explicit act. */
    data object AlreadyInARoom : RoomError {
        override val code = "ALREADY_IN_A_ROOM"
        override val detail = "Leave your current room first."
    }

    data object AlreadyMember : RoomError {
        override val code = "ALREADY_MEMBER"
        override val detail = "You are already in that room."
    }

    /** §5.17 — the host may configure; a member may not. */
    data object HostRequired : RoomError {
        override val code = "ROOM_HOST_REQUIRED"
        override val detail = "Only the host can do that."
    }

    /** §5.42, §5.43 — the deck is not yours to use. */
    data object DeckNotUsable : RoomError {
        override val code = "DECK_NOT_USABLE"
        override val detail = "You cannot use that deck."
    }

    /** §5.41 — ready needs a deck, and the database agrees. */
    data object DeckRequired : RoomError {
        override val code = "DECK_REQUIRED"
        override val detail = "Choose a deck before readying up."
    }

    /** §5.35 — cannot shrink below the seats already occupied. */
    data class InvalidConfiguration(override val detail: String) : RoomError {
        override val code = "INVALID_ROOM_CONFIGURATION"
    }

    /**
     * §5.x — the room moved while the client was deciding.
     *
     * Not a failure of the user: the answer is to show them the room
     * as it is now and let them choose again.
     */
    data class StaleRevision(val current: Long) : RoomError {
        override val code = "ROOM_REVISION_STALE"
        override val detail = "The room changed while you were deciding."
    }
}

/** The result of any room operation: the new state, or why not. */
sealed interface RoomResult {
    data class Ok(val room: Room) : RoomResult

    data class Refused(val error: RoomError) : RoomResult
}
