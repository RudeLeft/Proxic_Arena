package net.barnflix.proxic.match

import kotlinx.coroutines.runBlocking
import net.barnflix.proxic.room.RoomAnnouncer
import net.barnflix.proxic.room.RoomService
import net.barnflix.proxic.room.SilentAnnouncer
import org.slf4j.LoggerFactory
import java.time.Instant

// How a match stops — PHASE_06 §6.15, §6.149, §6.151, §6.154.
//
// Split from MatchRuntime, which owns processes and the live map.
// This owns one question and answers it the same way every time:
// when a match stops, WHAT IS WRITTEN DOWN AND WHO IS TOLD?
//
// Two things end a match and they are not the same thing:
//
//   a FAILED START   no game ever existed (§6.15)
//   a FINISH         Forge played one and reported a result, or
//                    the worker died under it (§6.151, §6.154)
//
// Both share a tail -- give the room back, say so -- and that
// shared tail is why this is one class. The room coming back is
// the owner's D4 amendment to §6.151: OPEN with both players
// still seated and readiness reset, not CLOSED.

internal class MatchEndings(
    private val records: MatchRecords,
    private val announcer: MatchAnnouncer,
    private val rooms: RoomService?,
    private val roomAnnouncer: RoomAnnouncer = SilentAnnouncer,
    private val clock: () -> Instant = Instant::now,
) {
    private val log = LoggerFactory.getLogger(MatchEndings::class.java)

    /**
     * §6.17 — Forge is up and the game is real.
     *
     * Not an ending, and it lives here because this class owns
     * every "the match moved, tell the participants" message.
     * Having one of them somewhere else is how the launch
     * announcement came to be missing in the first place.
     */
    fun running(match: Match) {
        tell("match") { announcer.matchChanged(match, null, null) }
    }

    /**
     * §6.151 — the sequence a finished game runs.
     *
     * Persist what Forge said, give the room back, shut the
     * worker down, tell both players. Order matters: the record
     * is written FIRST, so a server that dies halfway through
     * still knows the game is over. The announcements are
     * best-effort; the row is not.
     *
     * [alreadyGone] is how a SECOND ending is recognised, and
     * there will often be one: GAME_ENDED followed by the pipe
     * closing as the worker exits is the NORMAL ending, not an
     * unusual one. The UPDATE is also conditional on RUNNING, so
     * even a racing second call cannot turn a real result into
     * FAILED_RUNTIME.
     */
    fun finish(
        live: LiveMatch,
        outcome: GameOutcome,
        alreadyGone: Boolean,
    ) {
        if (alreadyGone) return
        val match = live.match
        val failed = outcome.kind == GameOutcome.FAILED

        records.recordEnded(match.matchId, outcome, clock())
        log.info("match ${match.matchId}: ${outcome.kind} on turn ${outcome.turn}")
        live.worker.stop()

        val status = if (failed) MatchStatus.FAILED_RUNTIME else MatchStatus.ENDED
        giveTheRoomBack(
            match.copy(status = status),
            // §6.154 — a worker that stopped is a fault, and the
            // players are told that rather than being told
            // somebody won.
            if (failed) "WORKER_STOPPED" else null,
            outcome,
        )
    }

    /**
     * §6.162 — a match somebody ended on purpose.
     *
     * NOT a concession and NOT a result. §6.153 forbids declaring
     * the opponent the winner without Forge's, and Forge did not
     * report one, so nobody won: TERMINATED with no summary.
     *
     * The room comes back the same way it does after a real
     * ending, which is the entire point of the feature -- a room
     * whose match has wedged was previously unleavable,
     * unclosable and unpreparable until the 24-hour sweep.
     */
    fun abandoned(match: Match) {
        if (!records.recordTerminated(match.matchId, clock())) {
            // Already over. Someone else abandoned it, or it
            // finished between the check and here.
            return
        }
        log.info("match ${match.matchId}: TERMINATED by a participant")
        giveTheRoomBack(match.copy(status = MatchStatus.TERMINATED), null, null)
    }

    /**
     * §6.15 — a start that never became a game.
     *
     * Without this a failed start BRICKS the room: the claim
     * consumed the setup and locked the room, so the players
     * could neither start nor prepare again, and only the 24-hour
     * expiry sweep ever freed it.
     */
    fun failedStart(
        match: Match,
        failureCode: String,
    ) {
        giveTheRoomBack(match.copy(status = MatchStatus.FAILED_STARTUP), failureCode, null)
    }

    /**
     * The shared tail: the room is usable again, and everybody
     * who cares is told.
     *
     * Both halves matter, for different reasons. The UPDATE is
     * what lets the players prepare again; the announcements are
     * what mean they find that out without reloading the page.
     * Either alone leaves somebody looking at a lie.
     */
    private fun giveTheRoomBack(
        match: Match,
        failureCode: String?,
        outcome: GameOutcome?,
    ) {
        // D4 (lock review) — OPEN, both players still seated with
        // their decks, readiness reset. The locked §6.151 says
        // CLOSED; the owner decision in the same document
        // supersedes it, because two people who have just
        // finished a game are the likeliest to want another.
        records.releaseRoom(match.roomId)

        tell("match") { announcer.matchChanged(match, failureCode, outcome) }
        rooms?.find(match.roomId)?.let { room ->
            tell("room") { roomAnnouncer.roomChanged(room) }
        }
    }

    /**
     * Say something, from a thread that is not a coroutine.
     *
     * Never allowed to propagate. A match that ended but was not
     * announced is recoverable by a reload; one that was rolled
     * back because a socket write failed is not.
     */
    private fun tell(
        what: String,
        block: suspend () -> Unit,
    ) {
        runCatching { runBlocking { block() } }
            .onFailure { log.warn("a $what message was not delivered", it) }
    }
}
