package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonObject

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
    /**
     * PHASE_07 §7.61 B5 — what the option is about ("card:N", "stack:N",
     * "player:SEAT"), as the worker derived it. Passed through untouched:
     * the server neither reads nor checks it, and a browser that clicks
     * the board still answers with the actionId.
     */
    val objectId: String? = null,
    /** §7.61 B8 — false when Forge's payment check says it cannot be paid now. */
    val payable: Boolean = true,
    /** What a spell costs right now, Forge's reckoning ("{R}"); null for anything else. */
    val cost: String? = null,
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
    /**
     * Some decisions have no "no" — §6.105's other side.
     *
     * Discarding to hand size is the plain case: the rules say
     * discard, so only WHICH is open. Forge's own input disables
     * cancelling for it. The client must not offer a pass the
     * gate will refuse, and the server must not forward one.
     */
    val mandatory: Boolean = false,
    /**
     * Forge's own wording for the question, when it has any.
     *
     * A generic chooser is unusable without it — "choose one"
     * says nothing and "Choose a creature to sacrifice" says
     * everything. Null when the kind is self-explanatory.
     */
    val prompt: String? = null,
    /**
     * P6-AG — too many options to send, so the player searches.
     *
     * Naming any card offers ~30,000 names. The question arrives
     * with [optionCount] and no options; the browser sends
     * DECISION_SEARCH and is sent what matched. [options] then
     * grows with every result shown, because an answer is accepted
     * only if it is one this player was SHOWN (§6.101) -- never a
     * name guessed from outside the results.
     */
    val searchable: Boolean = false,
    val optionCount: Int = 0,
    /**
     * §6.70 — which Forge game of this match the question is in.
     *
     * Karn Liberated restarts the game inside the same match, and
     * Forge keeps card id numbers across it, so `card:45` may name
     * a card in either game. Decision ids keep rising across a
     * restart, which is what makes an old answer unacceptable; the
     * epoch is what lets a client tell the boards apart.
     */
    val gameEpoch: Int = 1,
    /**
     * PHASE_07 §7.61 B7 — why each of the player's cards that is NOT
     * offered cannot act now, by object id ("card:N"). Read off Forge's
     * facts by the worker; passed through untouched, to the same seat
     * the question goes to and nobody else.
     */
    val unavailable: Map<String, String> = emptyMap(),
    /**
     * Owner 2026-10-22 — what a question that can be backed out of is
     * about ("name", "kind": spell/ability/trigger/card, and a spell's
     * "from"), so Cancel can say what it undoes. The asking player's own
     * spell; passed through untouched to that seat only.
     */
    val about: Map<String, String> = emptyMap(),
    /**
     * Spec 0001 D3 — the cards the asking player is LOOKING at (a scry's,
     * a surveil's top cards), described as a snapshot describes a card to
     * that player. The worker built them for the asker alone; the server
     * adds their pictures for that seat ([MatchArt.annotateCards]) and
     * passes them to that seat only, as the whole question goes.
     */
    val looking: List<JsonObject> = emptyList(),
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

    /** There was no "no" to choose. */
    PASS_NOT_ALLOWED,

    /** A search, for a question that is not answered by searching. */
    NOT_SEARCHABLE,
}

/**
 * How a game finished — §6.149, §6.151, §6.154.
 *
 * FORGE's answer, carried verbatim. Arena never derives a winner
 * from life totals, a dropped connection or a worker exiting:
 * §6.149 lists those exact temptations and forbids all of them.
 *
 * The winner is a SEAT. Forge names the winning player and an
 * Arena display name is not an identity -- "Pat won" says nothing
 * when both players are called Pat.
 */
data class GameOutcome(
    val kind: String,
    val winningSeat: Int?,
    val turn: Int,
    /**
     * §6.105, §6.106 — why it stopped, when it stopped badly.
     *
     * Safe technical evidence: a Forge method and message, never
     * a stack trace and never game state. Null unless the game
     * failed. The commonest value names the interaction the
     * protocol cannot yet represent, which is the single fact
     * needed to implement it.
     */
    val detail: String? = null,
    /**
     * §6.149, P6-AP — why Forge says the winner won, in Forge's
     * words: the winner's PlayerOutcome, e.g. "has won due to
     * effect of 'Laboratory Maniac'". Carried, never composed --
     * an alternate win is a rule Forge applied, and the players
     * are owed the name of it. Null when there is no winner.
     */
    val reason: String? = null,
    /**
     * PHASE_07 §7.55 — the seat that conceded, from Forge's own record
     * of why that player lost. Null when nobody conceded.
     */
    val concededSeat: Int? = null,
) {
    companion object {
        const val WINNER = "WINNER"
        const val DRAW = "DRAW"

        /** The game stopped without Forge reaching a result (§6.154). */
        const val FAILED = "FAILED"
    }
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

    /** §7.55 — the worker refused a concession (e.g. NOT_STARTED), for [seat]. */
    data class ConcedeRefused(val seat: Int, val reason: String) : WorkerEvent

    /**
     * AMENDMENT 13 — the game moved to a step nobody is asked at: turn,
     * step, active and priority seat. Public, the same for every seat.
     */
    data class Step(val state: kotlinx.serialization.json.JsonObject) : WorkerEvent

    /**
     * P6-AG — what a search of a searchable question found.
     *
     * `seat` is the one the server sent, echoed: results go to the
     * user authorised to answer, and to nobody else.
     */
    data class Options(
        val decisionId: Long,
        val seat: Int,
        val query: String,
        val options: List<DecisionOption>,
        val total: Int,
    ) : WorkerEvent

    /** §6.151 — the game is over, and this is what Forge said. */
    data class Ended(val outcome: GameOutcome) : WorkerEvent

    /**
     * §6.40 — what ONE seat can see, as the worker built it.
     *
     * Carried through unchanged. The worker removed everything
     * this viewer may not see (§6.42) before it was serialised,
     * and the server's job is routing, not filtering: a second
     * filter here would be a second opinion about visibility,
     * and the one that matters is Forge's.
     */
    data class Snapshot(val seat: Int, val state: kotlinx.serialization.json.JsonObject) :
        WorkerEvent

    /**
     * The worker stopped talking — §6.154.
     *
     * Distinct from [Ended] on purpose. A pipe that closed is not
     * a result: it is a RUNNING match whose process is gone, which
     * is FAILED_RUNTIME and never a win for the player who
     * happened to still be connected.
     */
    data object Stopped : WorkerEvent
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
    /** §6.40 — the viewer's own state, to that viewer alone. */
    suspend fun snapshot(
        matchId: java.util.UUID,
        userId: java.util.UUID,
        state: kotlinx.serialization.json.JsonObject,
    )

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

    /**
     * P6-AG — search results, to the user who searched.
     *
     * A default rather than abstract: most announcers in tests do
     * not care, and nothing is lost by a result that goes nowhere.
     */
    suspend fun options(
        matchId: java.util.UUID,
        userId: java.util.UUID,
        found: WorkerEvent.Options,
    ) = Unit

    /** AMENDMENT 13 — a step change, to every participant. A default, like [options]. */
    suspend fun step(
        matchId: java.util.UUID,
        userId: java.util.UUID,
        state: kotlinx.serialization.json.JsonObject,
    ) = Unit

    /** §7.55 — Forge would not take this player's concession, and why. A default, like [options]. */
    suspend fun concedeRefused(
        matchId: java.util.UUID,
        userId: java.util.UUID,
        reason: String,
    ) = Unit

    /**
     * Spec 0002 — which seat is being asked now, or null: nobody is, the
     * rules engine is working. Public, to every participant: who is
     * thinking is what a real table shows, and nothing about the question
     * travels. A default, like [options].
     */
    suspend fun asking(
        matchId: java.util.UUID,
        userId: java.util.UUID,
        seat: Int?,
    ) = Unit

    companion object {
        val NONE =
            object : DecisionAnnouncer {
                override suspend fun ask(
                    matchId: java.util.UUID,
                    userId: java.util.UUID,
                    request: DecisionRequest,
                ) = Unit

                override suspend fun snapshot(
                    matchId: java.util.UUID,
                    userId: java.util.UUID,
                    state: kotlinx.serialization.json.JsonObject,
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
