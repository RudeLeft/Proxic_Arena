package net.barnflix.proxic.match

import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory

// Acting on what the worker says — PHASE_06 §6.37, §6.99, §6.103.
//
// Split from MatchRuntime, which owns processes, threads and the
// database. This owns one question: when the worker says
// something about a decision, who is told?
//
// Everything here runs on the PUMP THREAD. While it is in here
// the worker's stdout is not being read, the pipe's buffer is
// filling, and behind it a Forge thread is blocked waiting for an
// answer — so nothing here may be slow and nothing here may
// throw past the runCatching.

class MatchDecisions(
    private val announcer: DecisionAnnouncer,
) {
    private val log = LoggerFactory.getLogger(MatchDecisions::class.java)

    fun handle(
        live: LiveMatch,
        event: WorkerEvent,
    ) {
        when (event) {
            is WorkerEvent.Decision -> ask(live, event.request)

            // §6.103 — the gate accepted an answer, so the
            // question is closed. Cleared by id, because the NEXT
            // question may already have arrived.
            is WorkerEvent.Answered -> live.answered(event.decisionId)

            is WorkerEvent.Snapshot -> {
                // §6.121 — the asset step, and the only place it
                // happens. Annotating BEFORE storing means a
                // reconnecting player gets the same references as
                // the one who never left, and that sending IS what
                // authorises the fetch (§6.129).
                val state = live.art.annotate(event.state, event.seat)
                live.snapshotTaken(event.seat, state)
                live.match.participants
                    .firstOrNull { it.seatNumber == event.seat }
                    ?.let { seat ->
                        tell { announcer.snapshot(live.match.matchId, seat.userId, state) }
                    }
            }

            // Not this class's business: the match LIFECYCLE
            // belongs to the runtime, which owns the database row,
            // the room and the worker process. Named rather than
            // swept into an `else` so that adding a new event
            // still breaks the build here and makes somebody
            // decide where it belongs.
            is WorkerEvent.Ended, WorkerEvent.Stopped -> Unit

            // P6-AG — shown to the asked player, and only what was
            // shown may then be answered.
            // Dropped entirely unless they are for the seat being
            // asked: results nobody was shown must not become
            // answerable.
            is WorkerEvent.Options -> {
                val asked =
                    live.match.participants
                        .firstOrNull { it.seatNumber == event.seat }
                        ?.takeIf { it.userId == live.authorisedUser() }
                if (asked != null) {
                    live.offered(event.decisionId, event.options)
                    tell { announcer.options(live.match.matchId, asked.userId, event) }
                }
            }

            // AMENDMENT 13 — public: everybody's step bar moves.
            is WorkerEvent.Step ->
                live.match.participants.map { it.userId }.distinct().forEach { user ->
                    tell { announcer.step(live.match.matchId, user, event.state) }
                }

            // §7.55 — to the player who conceded, and nobody else.
            is WorkerEvent.ConcedeRefused ->
                live.match.participants
                    .firstOrNull { it.seatNumber == event.seat }
                    ?.let { seat -> tell { announcer.concedeRefused(live.match.matchId, seat.userId, event.reason) } }

            is WorkerEvent.Refused -> {
                live.release(event.decisionId)
                // Whoever got this far WAS the authorised user:
                // anybody else is stopped before the worker is
                // troubled (§6.102).
                live.authorisedUser()?.let { user ->
                    tell {
                        announcer.refused(
                            live.match.matchId,
                            user,
                            event.decisionId,
                            event.reason,
                        )
                    }
                }
            }
        }
    }

    private fun ask(
        live: LiveMatch,
        asked: DecisionRequest,
    ) {
        // Spec 0001 D3 -- the cards being looked at wear their pictures,
        // for the asked seat only; annotated before storing, as a
        // snapshot is, so a reconnect is sent the same.
        val request =
            if (asked.looking.isEmpty()) {
                asked
            } else {
                asked.copy(looking = live.art.annotateCards(asked.looking, asked.authorisedSeat))
            }
        live.nowAsking(request)
        val user = live.authorisedUser()
        if (user == null) {
            // §6.37's failure mode, made loud rather than
            // plausible. A seat with no Arena user behind it means
            // the mapping is wrong, and the tempting recovery —
            // fall back to the seat being acted for — is exactly
            // how an opponent ends up answering your decisions.
            log.error(
                "match ${live.match.matchId}: decision ${request.decisionId} authorises " +
                    "seat ${request.authorisedSeat}, which no participant holds",
            )
            return
        }
        tell { announcer.ask(live.match.matchId, user, request) }

        // AND TELL EVERYONE ELSE IT IS NOT THEIRS. Only one
        // player holds priority, so a decision arriving for one
        // seat means every other seat's prompt is now dead. The
        // first version told only the new holder, which left the
        // previous one looking at a question that no longer
        // existed -- refused on click, which is safe, but reads
        // as the game having broken.
        live.match.participants
            .map { it.userId }
            .filterNot { it == user }
            .distinct()
            .forEach { other -> tell { announcer.cleared(live.match.matchId, other) } }
    }

    /**
     * Say something, from a thread that is not a coroutine.
     *
     * Never allowed to propagate: a socket that will not take a
     * frame must not stop the pump, because the pump is what
     * keeps Forge moving.
     */
    private fun tell(block: suspend () -> Unit) {
        runCatching { runBlocking { block() } }
            .onFailure { log.warn("a decision message was not delivered", it) }
    }
}
