package net.barnflix.proxic.match

import net.barnflix.proxic.ServerConfig
import org.slf4j.LoggerFactory
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.sql.DataSource

// Live matches — PHASE_06 §6.15, §6.17, §6.159, §6.162.
//
// MatchLauncher writes a match in LAUNCHING. This is what makes it
// RUNNING, or records why it never will be.
//
// The split matters. Claiming a setup is a database transaction
// measured in milliseconds; starting Forge is a JVM, 611 MB and the
// best part of a minute. Doing the second inside the first would
// hold a row lock across a process spawn, and §6.9's race would be
// decided by whoever's Forge loaded faster.
//
// §6.162 — one match per process, so a crash takes one match with
// it. The map is the only thing that knows they exist, which is
// also why §6.122 (a restart invalidates running matches) will
// matter: after a restart there are no processes, and any match
// still claiming to be RUNNING is lying.

class MatchRuntime(
    private val dataSource: DataSource,
    private val config: ServerConfig,
    private val clock: () -> Instant = Instant::now,
    private val announcer: MatchAnnouncer = MatchAnnouncer.NONE,
    private val rooms: net.barnflix.proxic.room.RoomService? = null,
    private val roomAnnouncer: net.barnflix.proxic.room.RoomAnnouncer =
        net.barnflix.proxic.room.SilentAnnouncer,
    private val decisions: DecisionAnnouncer = DecisionAnnouncer.NONE,
) : MatchStarter {
    private val log = LoggerFactory.getLogger(MatchRuntime::class.java)

    private val records = MatchRecords(dataSource)

    /** Who gets told what the worker says. */
    private val routing = MatchDecisions(decisions)

    /** Every match this process is running. §6.159 bounds the size. */
    private val live = ConcurrentHashMap<UUID, LiveMatch>()

    /**
     * Start Forge for a match that has been claimed.
     *
     * Blocking, and the caller chooses the thread. A route must not
     * call this directly: an HTTP request that waits a minute for a
     * JVM is a request that times out at Cloudflare's 100 seconds.
     */
    fun beginBlocking(match: Match): WorkerStart {
        val seats = records.seatsFor(match)
        if (seats == null) {
            records.recordFailure(match.matchId, "DECK_UNAVAILABLE", clock())
            releaseRoom(match, "DECK_UNAVAILABLE")
            return WorkerStart.Failed("DECK_UNAVAILABLE", "A deck could not be read.")
        }

        // The worker is built with its event sink already
        // attached, because a DECISION_REQUEST can arrive before
        // `start` returns: Forge publishes the first one the
        // moment a priority window opens, which is the same
        // instant that makes the game RUNNING.
        lateinit var running: LiveMatch
        val worker =
            MatchWorker(config, match.matchId) { event -> routing.handle(running, event) }
        running = LiveMatch(match, worker)
        live[match.matchId] = running

        val result = worker.start(seats)
        when (result) {
            is WorkerStart.Running -> {
                records.recordRunning(match.matchId, clock())
                log.info("match ${match.matchId}: RUNNING at turn ${result.turn}")
                announce(match.copy(status = MatchStatus.RUNNING), null)
            }

            is WorkerStart.Failed -> {
                // §6.15 — a failed start is recorded and the
                // process cleaned up. A worker left running for a
                // match nobody can join is 611 MB of nothing.
                worker.stop()
                live.remove(match.matchId)
                records.recordFailure(match.matchId, result.code, clock())
                log.warn("match ${match.matchId}: FAILED_STARTUP ${result.code} ${result.detail}")

                // GIVE THE ROOM BACK. Without this a failed start
                // BRICKS it: the room stays IN_MATCH holding a setup
                // the claim already consumed, so the players cannot
                // prepare again and nothing frees it short of the
                // 24-hour sweep. Found by the audit rather than by
                // anything going wrong, which is the point -- it
                // only goes wrong when Forge fails to start, which
                // is exactly when the players least want to be
                // stuck.
                releaseRoom(match, result.code)
            }
        }
        return result
    }

    /**
     * [MatchStarter] — start Forge without making the caller wait.
     *
     * One thread per launch, named so a thread dump says which
     * match. Not a pool: §6.159's target is three concurrent
     * matches, and a pool sized for that would queue the fourth
     * launch behind a game rather than refusing it honestly.
     */
    override fun begin(match: Match) {
        val thread =
            Thread(
                {
                    runCatching { beginBlocking(match) }
                        .onFailure { log.error("match ${match.matchId}: start threw", it) }
                },
                "proxic-match-start-${match.matchId}",
            )
        thread.isDaemon = true
        thread.start()
    }

    /**
     * Answer a decision on a user's behalf — §6.101, §6.102.
     *
     * The authorisation is [LiveMatch]'s; this only finds the
     * match. A match this process is not running is UNREACHABLE
     * rather than NOT_PENDING: the difference matters to whoever
     * reads the log after a restart (§6.122).
     */
    fun answer(
        matchId: UUID,
        userId: UUID,
        decisionId: Long,
        actionId: String?,
    ): DecisionRefusal? = live[matchId]?.answer(userId, decisionId, actionId) ?: DecisionRefusal.UNREACHABLE

    /** §6.111 — what to re-send to a connection that just arrived. */
    fun pendingFor(
        matchId: UUID,
        userId: UUID,
    ): DecisionRequest? {
        val running = live[matchId] ?: return null
        val question = running.pending() ?: return null
        // Only to the user who may answer it. A pending decision
        // sent to the other seat is private information about what
        // their opponent is being asked (§6.39 onward).
        return question.takeIf { running.authorisedUser() == userId }
    }

    /**
     * A failed start gives the room back, and says so.
     *
     * Both halves matter and for different reasons: the UPDATE is
     * what lets the players prepare again, and the announcement is
     * what means they find that out without reloading the page.
     * Either one alone leaves somebody looking at a lie.
     */
    private fun releaseRoom(
        match: Match,
        failureCode: String,
    ) {
        records.releaseRoom(match.roomId)
        announce(match.copy(status = MatchStatus.FAILED_STARTUP), failureCode)
        rooms?.find(match.roomId)?.let { room ->
            runCatching {
                kotlinx.coroutines.runBlocking { roomAnnouncer.roomChanged(room) }
            }.onFailure { log.warn("match ${match.matchId}: room unannounced", it) }
        }
    }

    /**
     * Tell the participants, from a plain thread.
     *
     * runBlocking because the runtime is not a coroutine: it is a
     * thread per launch, and the alternative is a scope owned by
     * something that has no lifecycle of its own. Never allowed to
     * fail the start -- a match that is running but unannounced is
     * recoverable by a refresh; one that was rolled back because a
     * socket write failed is not.
     */
    private fun announce(
        match: Match,
        failureCode: String?,
    ) {
        runCatching {
            kotlinx.coroutines.runBlocking { announcer.matchChanged(match, failureCode) }
        }.onFailure { log.warn("match ${match.matchId}: could not announce", it) }
    }

    /** §6.162 — stop one match, touching no other. */
    fun terminate(matchId: UUID) {
        live.remove(matchId)?.worker?.stop()
        records.recordStatus(matchId, MatchStatus.TERMINATED, clock())
    }

    fun isRunning(matchId: UUID): Boolean = live[matchId]?.worker?.isAlive() == true

    /** How many matches this process is running. §6.159's number. */
    fun liveCount(): Int = live.size

    /** Stop everything. Called when the application stops. */
    fun stopAll() {
        live.keys.toList().forEach { matchId ->
            live.remove(matchId)?.worker?.stop()
        }
    }
}
