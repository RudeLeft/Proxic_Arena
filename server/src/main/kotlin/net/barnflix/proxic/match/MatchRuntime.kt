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
) : MatchStarter {
    private val log = LoggerFactory.getLogger(MatchRuntime::class.java)

    private val records = MatchRecords(dataSource)

    /** Every match this process is running. §6.159 bounds the size. */
    private val live = ConcurrentHashMap<UUID, MatchWorker>()

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
            return WorkerStart.Failed("DECK_UNAVAILABLE", "A deck could not be read.")
        }

        val worker = MatchWorker(config, match.matchId)
        live[match.matchId] = worker

        val result = worker.start(seats)
        when (result) {
            is WorkerStart.Running -> {
                records.recordRunning(match.matchId, clock())
                log.info("match ${match.matchId}: RUNNING at turn ${result.turn}")
            }

            is WorkerStart.Failed -> {
                // §6.15 — a failed start is recorded and the
                // process cleaned up. A worker left running for a
                // match nobody can join is 611 MB of nothing.
                worker.stop()
                live.remove(match.matchId)
                records.recordFailure(match.matchId, result.code, clock())
                log.warn("match ${match.matchId}: FAILED_STARTUP ${result.code} ${result.detail}")
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

    /** §6.162 — stop one match, touching no other. */
    fun terminate(matchId: UUID) {
        live.remove(matchId)?.stop()
        records.recordStatus(matchId, MatchStatus.TERMINATED, clock())
    }

    fun isRunning(matchId: UUID): Boolean = live[matchId]?.isAlive() == true

    /** How many matches this process is running. §6.159's number. */
    fun liveCount(): Int = live.size

    /** Stop everything. Called when the application stops. */
    fun stopAll() {
        live.keys.toList().forEach { matchId ->
            live.remove(matchId)?.stop()
        }
    }
}
