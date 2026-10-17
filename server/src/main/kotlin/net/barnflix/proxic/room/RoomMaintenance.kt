package net.barnflix.proxic.room

import kotlinx.coroutines.runBlocking
import org.slf4j.Logger
import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import javax.sql.DataSource

// The room sweep — PHASE_05 §5.124–§5.126, owner decision D4.
//
// Same shape as SessionMaintenance (carry-forward C6: mirror the
// idiom that exists rather than inventing a second one), with one
// difference worth stating because it changes how much this matters.
//
// The session sweep is HOUSEKEEPING: `authenticate` already refuses
// an expired session, so if that sweep stopped, the only cost would
// be a bigger table. This sweep is not housekeeping. Nothing else
// expires a room — the read queries ask for status, not for age — so
// a room is abandoned exactly when this says it is. If this stopped
// running, abandoned rooms would stay joinable forever, which is the
// thing D4 exists to prevent.
//
// The consequence of that honesty: a room can outlive its 24 hours
// by up to one sweep interval. That is fine for what D4 is for
// (rooms not accumulating) and the alternative — folding age into
// every room read — would put a clock in nine queries so that the
// twenty-fifth hour could be exact. Nobody is waiting on that hour.

class RoomMaintenance(
    dataSource: DataSource,
    private val announcer: RoomAnnouncer,
    private val log: Logger,
    private val lifetime: Duration = DEFAULT_LIFETIME,
    private val retention: Duration = DEFAULT_RETENTION,
    private val intervalMinutes: Long = DEFAULT_INTERVAL_MINUTES,
    /**
     * Anything else that wants an hourly tick.
     *
     * The lobby's chat limiter, today. A second scheduled executor
     * for one map eviction would be machinery; a hook on the sweep
     * that already runs is a line.
     */
    private val alsoSweep: () -> Unit = {},
) {
    private val expiry = RoomExpiry(dataSource)

    private val executor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            // Named for a thread dump, daemon so it can never hold
            // the JVM open at shutdown.
            Thread(runnable, "proxic-room-maintenance").apply { isDaemon = true }
        }

    fun start() {
        executor.scheduleWithFixedDelay(
            ::sweepQuietly,
            FIRST_RUN_MINUTES,
            intervalMinutes,
            TimeUnit.MINUTES,
        )
    }

    fun stop() {
        executor.shutdownNow()
    }

    /**
     * One sweep: expire the abandoned, then purge the long-finished.
     *
     * Internal so a test can run it directly rather than waiting an
     * hour for a scheduler to prove anything — and so a test can
     * pass a lifetime of zero and watch a room it just created
     * expire, which is the only practical way to test a 24-hour
     * rule.
     */
    internal fun sweep(): Int {
        val expired = expiry.expire(lifetime)

        for (room in expired) {
            // §5.125 — the people who were in it find out. Blocking
            // here is deliberate and cheap: this is a daemon thread
            // whose entire job is this sweep, and the alternative
            // (a coroutine scope owned by a scheduled executor) is
            // machinery for no benefit.
            runBlocking {
                announcer.roomClosed(room.roomId, room.formerMembers, "EXPIRED")
            }
        }

        // Never allowed to fail the room sweep: this is
        // housekeeping riding along, and the rooms matter more.
        runCatching { alsoSweep() }.onFailure { log.warn("lobby sweep failed", it) }

        val purged = expiry.purgeFinished(retention)
        if (purged > 0) log.info("purged $purged finished room record(s)")
        return expired.size
    }

    private fun sweepQuietly() {
        // scheduleWithFixedDelay STOPS RESCHEDULING if the task
        // throws, silently. One transient database error must not
        // end room expiry for the lifetime of the process.
        runCatching { sweep() }
            .onSuccess { if (it > 0) log.info("expired $it abandoned room(s)") }
            .onFailure { log.warn("room maintenance sweep failed; will retry", it) }
    }

    private companion object {
        /** Owner decision D4: long enough that an interrupted
         *  evening survives the night. */
        val DEFAULT_LIFETIME: Duration = Duration.ofHours(24)

        /** §5.126 — a diagnostics window, not an archive. */
        val DEFAULT_RETENTION: Duration = Duration.ofDays(7)

        const val DEFAULT_INTERVAL_MINUTES = 60L
        const val FIRST_RUN_MINUTES = 5L
    }
}
