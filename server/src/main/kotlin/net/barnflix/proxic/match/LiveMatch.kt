package net.barnflix.proxic.match

import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

// One running match, and the question it is blocked on —
// PHASE_06 §6.37, §6.38, §6.98-§6.104, §6.111, §6.112.
//
// THE MAPPING LIVES HERE, and nowhere else. §6.38 names the four
// things a decision has to keep straight:
//
//     Forge player affected by the decision
//     current Forge controller of that decision
//     Arena user authorised to answer
//     viewer receiving private decision data
//
// and §6.38's last line is the rule that puts them in this class:
// "The client never decides this mapping." A browser that says
// which seat it is speaking for is saying nothing the server may
// act on (§6.100).

/**
 * The live state of one match.
 *
 * Deliberately small and deliberately NOT a database row. The
 * pending decision is a property of a blocked call stack inside a
 * worker process, so it lives exactly as long as that process and
 * is rebuilt from the worker on restart rather than persisted
 * (§6.122 invalidates running matches after a restart precisely
 * because nothing here survives one).
 */
class LiveMatch(
    val match: Match,
    val worker: MatchWorker,
    /**
     * §6.122 — which artwork each seat may see and fetch.
     *
     * Per match and per viewer, and it dies with this object, which
     * is what makes §6.130 true without any code: a match that has
     * ended grants nothing.
     */
    val art: MatchArt = MatchArt(emptyMap()),
    /**
     * How an authorised SEARCH reaches the worker (P6-AG). Before
     * `send`, so a test's trailing lambda still means `send`.
     */
    private val find: (Long, Int, String) -> Boolean = worker::search,
    /**
     * How an authorised answer reaches the worker.
     *
     * A seam, defaulting to the real worker, so the
     * AUTHORISATION rules can be tested without spawning a 611 MB
     * JVM and playing a game of Magic to reach a priority window.
     * The rules in this class are the ones that decide whether an
     * opponent can answer your decisions; they deserve tests that
     * run in milliseconds and therefore run often.
     */
    private val send: (Long, Int, Long, String?) -> Boolean = worker::answer,
) {
    /**
     * The question Forge is currently blocked on, if any.
     *
     * Atomic because three threads touch it: the worker's pump
     * writes it, a socket handler reads it to answer, and another
     * socket handler reads it on connect to re-send (§6.111).
     */
    private val pending = AtomicReference<DecisionRequest?>()

    /**
     * The decision an answer has already been FORWARDED for.
     *
     * P6-R. The same player in two tabs can answer the same
     * question at the same instant, and `pending` cannot stop the
     * second: it is cleared only when the worker acknowledges, so
     * both answers passed every check here and both were forwarded.
     * The worker's gate refused the duplicate — Forge applied it
     * once, measured — but this method had already told the second
     * tab DECISION_ACCEPTED, because "forwarded" was being reported
     * as "accepted". The worker's refusal then arrived after the
     * question had been cleared and reached nobody.
     *
     * Claiming the decision atomically before forwarding makes the
     * server the first duplicate defence, which is where §6.102
     * puts it: refused here, truthfully, before Forge is troubled.
     */
    private val forwarded = AtomicReference<Long?>()

    fun pending(): DecisionRequest? = pending.get()

    /**
     * §6.111 — the latest state each seat was sent.
     *
     * Kept so a connection that arrives mid-game gets the board
     * before anything else. "Do not reconstruct from the
     * browser's cached state" — so the server holds the last one
     * it sent rather than asking the client what it had.
     */
    private val snapshots = java.util.concurrent.ConcurrentHashMap<Int, Any>()

    fun snapshotTaken(
        seat: Int,
        state: kotlinx.serialization.json.JsonObject,
    ) {
        snapshots[seat] = state
    }

    fun snapshotFor(userId: UUID): kotlinx.serialization.json.JsonObject? {
        val seat = seatOf(userId) ?: return null
        return snapshots[seat] as? kotlinx.serialization.json.JsonObject
    }

    fun nowAsking(request: DecisionRequest) {
        pending.set(request)
    }

    /**
     * Clear a decision that has been answered.
     *
     * By id, so a late clear cannot wipe the NEXT question. The
     * worker publishes the following DECISION_REQUEST from Forge's
     * thread the instant the answer is accepted, and the
     * DECISION_ACCEPTED for the previous one is written from the
     * same `send` by a different thread — so the two can arrive in
     * either order. An unconditional clear would silently discard
     * a live question, and the players would sit looking at a game
     * that was waiting for them.
     */
    fun answered(decisionId: Long) {
        pending.getAndUpdate { current ->
            if (current?.decisionId == decisionId) null else current
        }
    }

    /**
     * Who may answer the question outstanding right now.
     *
     * The AUTHORISED seat, never the one being acted for. §6.37
     * forbids assuming they are the same, and Mindslaver is the
     * case where assuming it hands somebody their opponent's
     * decisions.
     */
    fun authorisedUser(): UUID? {
        val question = pending.get() ?: return null
        return match.participants
            .firstOrNull { it.seatNumber == question.authorisedSeat }
            ?.userId
    }

    /**
     * Check an answer, then forward it — §6.101, §6.102.
     *
     * Returns null when the worker took it, or the reason it did
     * not. Everything checked here is checked AGAIN at the gate,
     * and that is not duplication for its own sake: this side can
     * see who is authenticated, and only the gate can see whether
     * the decision is still the one Forge is blocked on. §6.102 is
     * why the wrong user is stopped here rather than there —
     * "do not forward anything to Forge".
     */
    fun answer(
        userId: UUID,
        decisionId: Long,
        actionId: String?,
    ): DecisionRefusal? {
        val question = pending.get() ?: return DecisionRefusal.NOT_PENDING
        if (question.decisionId != decisionId) return DecisionRefusal.STALE_DECISION

        val seat = seatOf(userId) ?: return DecisionRefusal.NOT_YOURS
        if (seat != question.authorisedSeat) return DecisionRefusal.NOT_YOURS

        // Some decisions have no "no". Refused HERE as well as at
        // the gate, because §6.100 says the browser's word is not
        // authority and a pass that reached Forge would be
        // answered by nobody.
        if (actionId == null && question.mandatory) {
            return DecisionRefusal.PASS_NOT_ALLOWED
        }

        // §6.101 — the choice must be one THIS decision offered. A
        // null actionId is a pass, which is allowed unless the
        // decision says otherwise.
        if (actionId != null && question.options.none { it.actionId == actionId }) {
            return DecisionRefusal.STALE_DECISION
        }

        // The state version comes from the QUESTION, not from the
        // browser (§6.100). A client that could name its own
        // version could defeat §6.104 by naming the current one.
        // One forward per decision. getAndUpdate is the atomic
        // claim: whoever sees the PREVIOUS value already equal to
        // this decision was second.
        if (forwarded.getAndUpdate { decisionId } == decisionId) {
            return DecisionRefusal.DUPLICATE
        }

        val sent = send(decisionId, seat, question.stateVersion, actionId)
        if (!sent) release(decisionId)
        return if (sent) null else DecisionRefusal.UNREACHABLE
    }

    /**
     * Search a searchable question's options — P6-AG.
     *
     * The same authorisation as an answer: the question must be
     * outstanding, this one, searchable, and the caller the user
     * authorised to answer it. Results arrive later as a
     * [WorkerEvent.Options] and go to [offered].
     */
    fun search(
        userId: UUID,
        decisionId: Long,
        query: String,
    ): DecisionRefusal? {
        val question = pending.get() ?: return DecisionRefusal.NOT_PENDING
        if (question.decisionId != decisionId) return DecisionRefusal.STALE_DECISION
        val seat = seatOf(userId) ?: return DecisionRefusal.NOT_YOURS
        if (seat != question.authorisedSeat) return DecisionRefusal.NOT_YOURS
        if (!question.searchable) return DecisionRefusal.NOT_SEARCHABLE
        // A card name is short. A megabyte of "query" is not a search.
        val trimmed = query.trim().take(MAX_QUERY)
        return if (find(decisionId, seat, trimmed)) null else DecisionRefusal.UNREACHABLE
    }

    /**
     * Results that were shown, added to what may be answered.
     *
     * §6.101 says the answer must be one THIS decision offered, and
     * for a searchable question that means offered to this player:
     * a name they were never shown is refused here, even if Forge
     * would allow it. By id, like [answered], so results for an
     * old question cannot leak into a new one.
     */
    fun offered(
        decisionId: Long,
        options: List<DecisionOption>,
    ) {
        pending.getAndUpdate { current ->
            if (current?.decisionId != decisionId) {
                current
            } else {
                current.copy(options = (current.options + options).distinctBy { it.actionId })
            }
        }
    }

    /**
     * The worker refused what was forwarded, so the question is
     * answerable again — a stale state version is a reason to try
     * once more, not to be locked out of the decision.
     */
    fun release(decisionId: Long) {
        forwarded.compareAndSet(decisionId, null)
    }

    private companion object {
        const val MAX_QUERY = 64
    }
}

/**
 * §6.36's chain, read backwards: Arena user → seat.
 *
 * An extension rather than a member: it reads only the participant
 * list, and the class is at detekt's function ceiling.
 */
fun LiveMatch.seatOf(userId: UUID): Int? = match.participants.firstOrNull { it.userId == userId }?.seatNumber

/**
 * PHASE_07 §7.55 — [userId] concedes. Null when it went to Forge, or why
 * not. Only a seated participant, and only for their OWN seat: under
 * Mindslaver the controller still concedes for themselves, not for the
 * player they are controlling.
 */
fun LiveMatch.concede(
    userId: UUID,
    send: (Int) -> Boolean = worker::concede,
): String? {
    val seat = seatOf(userId) ?: return "NOT_A_PLAYER"
    return if (send(seat)) null else "UNREACHABLE"
}
