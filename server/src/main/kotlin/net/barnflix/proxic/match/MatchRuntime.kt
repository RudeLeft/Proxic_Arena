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
) : MatchStarter, MatchControl, MatchAssets {
    private val log = LoggerFactory.getLogger(MatchRuntime::class.java)

    private val records = MatchRecords(dataSource)

    /** Who gets told what the worker says. */
    private val routing = MatchDecisions(decisions)

    /** What is written down, and who is told, when a match stops. */
    private val endings = MatchEndings(records, announcer, rooms, roomAnnouncer, clock)

    /** Every match this process is running. §6.159 bounds the size. */
    private val live = ConcurrentHashMap<UUID, LiveMatch>()

    /**
     * §6.122, §6.129 — only what this viewer has been shown.
     *
     * A match this process is not running answers false rather
     * than looking anything up: §6.130 means a finished match
     * grants nothing, and `live` is exactly the set of matches
     * that still exist.
     */
    override fun mayFetch(
        matchId: java.util.UUID,
        userId: java.util.UUID,
        assetId: String,
    ): Boolean {
        val running = live[matchId] ?: return false
        val seat =
            running.match.participants.firstOrNull { it.userId == userId }?.seatNumber
                ?: return false
        return running.art.mayFetch(seat, assetId)
    }

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
            endings.failedStart(match, "DECK_UNAVAILABLE")
            return WorkerStart.Failed("DECK_UNAVAILABLE", "A deck could not be read.")
        }

        // The worker is built with its event sink already
        // attached, because a DECISION_REQUEST can arrive before
        // `start` returns: Forge publishes the first one the
        // moment a priority window opens, which is the same
        // instant that makes the game RUNNING.
        lateinit var running: LiveMatch
        val worker =
            MatchWorker(config, match.matchId) { event ->
                when (event) {
                    // §6.151 — the match lifecycle is the
                    // runtime's: the database row, the room and
                    // the process. Decisions are routing's.
                    is WorkerEvent.Ended ->
                        endings.finish(
                            running,
                            event.outcome,
                            alreadyGone = live.remove(match.matchId) == null,
                        )

                    // §6.154 — a pipe that closed is not a result.
                    // A RUNNING match whose process is gone is
                    // FAILED_RUNTIME, and never a win for whoever
                    // happened to still be connected.
                    WorkerEvent.Stopped ->
                        endings.finish(
                            running,
                            GameOutcome(GameOutcome.FAILED, null, 0),
                            alreadyGone = live.remove(match.matchId) == null,
                        )

                    else -> routing.handle(running, event)
                }
            }
        // §6.126 — the art each seat brought, read once. A deck
        // cannot change mid-match (§6.33 froze the printing at
        // setup), so there is nothing to re-read.
        val art = records.artFor(match)
        // Worth a line: artwork silently not appearing looks like a
        // rendering problem and is usually a deck that carried none.
        log.info("match ${match.matchId}: art for ${art.map { it.key to it.value.size }}")
        running = LiveMatch(match, worker, MatchArt(art))
        live[match.matchId] = running

        val result = worker.start(seats)
        when (result) {
            is WorkerStart.Running -> {
                records.recordRunning(match.matchId, clock())
                log.info("match ${match.matchId}: RUNNING at turn ${result.turn}")
                endings.running(match.copy(status = MatchStatus.RUNNING))
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
                endings.failedStart(match, result.code)
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
    ): DecisionRefusal? {
        val running = live[matchId]
        if (running == null) {
            // Worth a line, because the player is shown "the game
            // did not receive that" and the two causes look
            // identical from the browser: a match this process
            // never started (a restart threw its workers away,
            // §6.122) or one that has already ended.
            log.warn("match $matchId: an answer arrived for a match this process is not running")
            return DecisionRefusal.UNREACHABLE
        }
        return running.answer(userId, decisionId, actionId)
    }

    /** P6-AG — a search, authorised by [LiveMatch] like an answer. */
    fun search(
        matchId: UUID,
        userId: UUID,
        decisionId: Long,
        query: String,
    ): DecisionRefusal? {
        val running = live[matchId] ?: return DecisionRefusal.UNREACHABLE
        return running.search(userId, decisionId, query)
    }

    /**
     * §6.110, §6.111 — the board, before any decision.
     *
     * "Send complete viewer snapshot" on connect, and §6.48 is
     * why the order matters: a decision names objects by id, and
     * a client that has not been told what those ids are can
     * only guess by name.
     */
    fun snapshotFor(
        matchId: UUID,
        userId: UUID,
    ): kotlinx.serialization.json.JsonObject? = live[matchId]?.snapshotFor(userId)

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
     * §6.162 — end ONE match, touching no other.
     *
     * Works whether or not this process is running it, and that
     * is the case it exists for: after a restart the row says
     * RUNNING and no worker exists, so a version that required a
     * live match would refuse exactly when the players are most
     * stuck. The worker is stopped if there is one; the record
     * and the room are put right either way.
     */
    override fun abandon(match: Match) {
        live.remove(match.matchId)?.worker?.stop()
        endings.abandoned(match)
    }

    fun isRunning(matchId: UUID): Boolean = live[matchId]?.worker?.isAlive() == true

    /** PHASE_07 §7.67 — how many games this server is playing right now. */
    val runningCount: Int get() = live.values.count { it.worker?.isAlive() == true }

    /** Stop everything. Called when the application stops. */
    fun stopAll() {
        live.keys.toList().forEach { matchId ->
            live.remove(matchId)?.worker?.stop()
        }
    }
}
