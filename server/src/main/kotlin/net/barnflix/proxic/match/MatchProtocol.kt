package net.barnflix.proxic.match

// What the worker says, as types — PHASE_06 §6.98-§6.104.
//
// The wire is line-delimited JSON on a pipe (§6.24: no port, no
// listener, not reachable from a browser). These are the frames
// that matter to the server; everything else the worker prints is
// Forge's own chatter and is dropped.

/** §6.49 — a presentation hint, never authority. */
data class DecisionOption(
    val actionId: String,
    val label: String?,
)

/**
 * One question Forge is blocked on — §6.99.
 *
 * TWO SEATS, and the server must not collapse them (§6.37):
 *
 *   actedForSeat     the Forge player the decision is ABOUT
 *   authorisedSeat   the seat whose human may answer it
 *
 * Equal in every ordinary decision; different under Mindslaver.
 * Routing on the first would hand the answer to the player being
 * controlled, which is precisely the effect's point.
 *
 * Seat NUMBERS, not names: Arena display names are not unique.
 */
data class DecisionRequest(
    val decisionId: Long,
    val actedForSeat: Int,
    val authorisedSeat: Int,
    val kind: String,
    val stateVersion: Long,
    val options: List<DecisionOption>,
)

/** Why the worker refused an answer. §6.101's list, as it comes back. */
enum class DecisionRefusal {
    NOT_PENDING,
    WRONG_SEAT,
    DUPLICATE,
    STALE_DECISION,
    STALE_STATE,

    /** The worker is gone, or never heard us. */
    UNREACHABLE,

    /** Refused by the SERVER, before the worker was troubled. */
    NOT_YOURS,
}

/**
 * Everything the worker says that the server acts on.
 *
 * A sealed type rather than three callbacks: the pump has one
 * thread and one place that decides what a frame means, so the
 * "which of these did I forget to wire" failure cannot happen
 * quietly. That failure has happened five times this phase.
 */
sealed interface WorkerEvent {
    /** Forge is blocked, waiting for a human. */
    data class Decision(val request: DecisionRequest) : WorkerEvent

    /** The gate took an answer. Authoritative; the server's own checks are a pre-filter. */
    data class Answered(val decisionId: Long) : WorkerEvent

    /** The gate refused one, and this is the reason it gave. */
    data class Refused(val decisionId: Long, val reason: DecisionRefusal) : WorkerEvent
}

/**
 * Where a decision reaches a human.
 *
 * Kept behind an interface for the reason every announcer in this
 * project is: the runtime is a thread and a pipe, the sockets are
 * coroutines and frames, and the thing that decides WHO is told
 * should not also know what a WebSocket is.
 */
interface DecisionAnnouncer {
    /** §6.99 - ask the one user authorised to answer. */
    suspend fun ask(
        matchId: java.util.UUID,
        userId: java.util.UUID,
        request: DecisionRequest,
    )

    /**
     * Nothing is being asked of you — §6.38's fourth line.
     *
     * Sent to every participant who is NOT the one being asked,
     * every time the pending decision changes. Without it a
     * player who has just been asked something keeps their
     * question on screen after priority has passed to the other
     * seat: only one player holds priority in Magic, but the
     * server was telling only the new holder and leaving the
     * previous one looking at a live-seeming prompt. Clicking it
     * is refused, which is safe but reads as the game being
     * broken.
     */
    suspend fun cleared(
        matchId: java.util.UUID,
        userId: java.util.UUID,
    )

    /**
     * The gate said no, after the server had said yes.
     *
     * Only reachable by the authorised user: anybody else was
     * stopped before the worker was troubled (§6.102).
     */
    suspend fun refused(
        matchId: java.util.UUID,
        userId: java.util.UUID,
        decisionId: Long,
        reason: DecisionRefusal,
    )

    companion object {
        val NONE =
            object : DecisionAnnouncer {
                override suspend fun ask(
                    matchId: java.util.UUID,
                    userId: java.util.UUID,
                    request: DecisionRequest,
                ) = Unit

                override suspend fun cleared(
                    matchId: java.util.UUID,
                    userId: java.util.UUID,
                ) = Unit

                override suspend fun refused(
                    matchId: java.util.UUID,
                    userId: java.util.UUID,
                    decisionId: Long,
                    reason: DecisionRefusal,
                ) = Unit
            }
    }
}
