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

    fun pending(): DecisionRequest? = pending.get()

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

    /** §6.36's chain, read backwards: Arena user → seat. */
    fun seatOf(userId: UUID): Int? = match.participants.firstOrNull { it.userId == userId }?.seatNumber

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
        val sent = send(decisionId, seat, question.stateVersion, actionId)
        return if (sent) null else DecisionRefusal.UNREACHABLE
    }
}
