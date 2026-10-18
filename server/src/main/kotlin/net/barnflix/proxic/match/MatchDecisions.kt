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

            is WorkerEvent.Refused ->
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

    private fun ask(
        live: LiveMatch,
        request: DecisionRequest,
    ) {
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
