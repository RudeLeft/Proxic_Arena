package net.barnflix.proxic.room

import kotlinx.serialization.Serializable
import java.util.UUID

// The match-setup snapshot — PHASE_05 §5.102–§5.114.
//
// A frozen copy of the room at the moment every player was ready,
// and the handoff Phase 6 launches from. It is separate from the
// room because the room keeps changing and a match must not start
// from a moving target.
//
// §5.104 is the rule that shapes every field: assembled entirely
// from server-authoritative records. Nothing here is copied from a
// request. §5.109 is the other: no hands, no battlefield, no life
// totals, no priority. This says WHO is playing WHAT in WHICH seat,
// and stops.

/** §5.105, §5.106 — a seat, as it stood at preparation. */
@Serializable
data class MatchSetupPlayer(
    val userId: String,
    /**
     * §5.106 — captured, not joined.
     *
     * A player who renames their account after preparation keeps
     * the name the match was prepared with. A join to the account
     * table would silently give the new one, which is a different
     * promise from the one §5.106 makes.
     */
    val displayName: String,
    val seatNumber: Int,
    val deckId: String,
)

@Serializable
data class MatchSetupView(
    val setupId: String,
    val roomId: String,
    /**
     * §5.111 — which revision this was taken from.
     *
     * Phase 6's guard against launching a snapshot of a room that
     * has since moved on, and Phase 5's idempotency key (§5.115):
     * preparing twice at the same revision is the same preparation.
     */
    val sourceRoomRevision: Long,
    val presetId: String,
    val playerCount: Int,
    val status: String,
    val createdAt: String,
    val players: List<MatchSetupPlayer>,
)

/** §5.100, §5.101 — one seat's answer, for that seat's owner. */
data class SeatProblem(
    val userId: UUID,
    val code: String,
    /** Written for the owning player. Never shown to the table. */
    val detail: String,
)

/**
 * What a preparation attempt produced.
 *
 * Three outcomes rather than two, because "the host may not do
 * this" and "the table is not ready yet" are different answers that
 * a UI renders differently: one is an error, the other is a
 * checklist.
 */
sealed interface PrepareResult {
    data class Prepared(
        val setup: MatchSetupView,
        val room: Room,
    ) : PrepareResult

    /** A room- or host-level refusal: §5.92's first two lines. */
    data class Refused(val error: RoomError) : PrepareResult

    /**
     * The table is not ready. §5.101 governs who sees what: the
     * host learns WHICH seats need attention, and each problem's
     * detail goes only to the player it is about.
     */
    data class NotReady(val problems: List<SeatProblem>) : PrepareResult
}

/**
 * Who is connected right now — §5.92's "all required members are
 * connected".
 *
 * Declared here and implemented by the lobby, the same direction as
 * [RoomAnnouncer]: presence is connection state living in memory
 * (§5.120), and the room rules must not learn what a socket is to
 * ask about it.
 */
fun interface Presence {
    fun isOnline(userId: UUID): Boolean
}

/** For wiring with no lobby: tests, and a server with no socket. */
object EveryoneOnline : Presence {
    override fun isOnline(userId: UUID): Boolean = true
}
