package net.barnflix.proxic.room

import kotlinx.coroutines.runBlocking
import org.slf4j.Logger
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import javax.sql.DataSource

// The room sweep — PHASE_05 §5.124–§5.126, and spec 0054 (owner
// 2026-11-03), which replaced owner decision D4's 24 hours.
//
// Same shape as SessionMaintenance (carry-forward C6: mirror the
// idiom that exists rather than inventing a second one), with one
// difference worth stating because it changes how much this matters.
//
// The session sweep is HOUSEKEEPING: `authenticate` already refuses
// an expired session, so if that sweep stopped, the only cost would
// be a bigger table. This sweep is not housekeeping. Nothing else
// closes an idle room — the read queries ask for status, not for age —
// so a room is abandoned exactly when this says it is.
//
// Spec 0054: every minute, each room in the lobby is checked against the
// owner's rules (RoomTimeouts, idleSteps): 30 minutes with nothing
// happening while the host is alone, 2 hours with two players, a host
// offline 10 minutes closes it, a guest offline 10 minutes leaves it.
// A room with a game in it is never touched. The page warns 5 minutes
// before an idle close from the same clock (the room list's clearsAt).

class RoomMaintenance(
    dataSource: DataSource,
    private val announcer: RoomAnnouncer,
    private val log: Logger,
    /** Who is offline, and since when (the lobby). */
    private val presence: Presence = EveryoneOnline,
    private val timeouts: () -> RoomTimeouts = { RoomTimeouts.active },
    private val retention: Duration = DEFAULT_RETENTION,
    private val clock: () -> Instant = Instant::now,
    /**
     * Anything else that wants an hourly tick.
     *
     * The lobby's chat limiter and the game records, today. A second
     * scheduled executor for them would be machinery; a hook on the
     * sweep that already runs is a line.
     */
    private val alsoSweep: () -> Unit = {},
) {
    private val expiry = RoomExpiry(dataSource)
    private val idle = RoomIdle(dataSource)
    private var ticks = 0L

    private val executor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            // Named for a thread dump, daemon so it can never hold
            // the JVM open at shutdown.
            Thread(runnable, "proxic-room-maintenance").apply { isDaemon = true }
        }

    fun start() {
        executor.scheduleWithFixedDelay(::sweepQuietly, 1, 1, TimeUnit.MINUTES)
    }

    fun stop() {
        executor.shutdownNow()
    }

    /**
     * One sweep: the rooms in the lobby against the owner's rules, then
     * (once an hour) the long-finished purged and the hourly hooks.
     * Internal so a test can run it directly with a clock. The rooms
     * closed this time.
     */
    internal fun sweep(): Int {
        var closed = 0
        val now = clock()
        for (room in idle.lobbyRooms()) {
            for (step in idleSteps(room, now, presence::offlineSince, timeouts())) {
                closed += apply(room, step)
            }
        }
        if (ticks++ % HOURLY_TICKS == 0L) {
            // Never allowed to fail the room sweep: this is
            // housekeeping riding along, and the rooms matter more.
            runCatching { alsoSweep() }.onFailure { log.warn("lobby sweep failed", it) }
            val purged = expiry.purgeFinished(retention)
            if (purged > 0) log.info("purged $purged finished room record(s)")
        }
        return closed
    }

    /**
     * One step for one room, and the people in it told. Blocking here is
     * deliberate and cheap: this is a daemon thread whose entire job is
     * this sweep.
     */
    private fun apply(
        room: Room,
        step: IdleStep,
    ): Int =
        runBlocking {
            when (step) {
                IdleStep.HostAway -> {
                    val members = idle.close(room.roomId) ?: return@runBlocking 0
                    announcer.roomClosed(room.roomId, members, "HOST_AWAY")
                    1
                }
                is IdleStep.Idle -> {
                    val members = idle.close(room.roomId) ?: return@runBlocking 0
                    announcer.roomClosed(room.roomId, members, "IDLE_${step.limit.toMinutes()}")
                    1
                }
                is IdleStep.GuestAway -> {
                    val now = idle.removeAway(room.roomId, step.userId) ?: return@runBlocking 0
                    announcer.removedFromRoom(room.roomId, step.userId, "AWAY")
                    announcer.roomChanged(now)
                    0
                }
            }
        }

    private fun sweepQuietly() {
        // scheduleWithFixedDelay STOPS RESCHEDULING if the task
        // throws, silently. One transient database error must not
        // end room maintenance for the lifetime of the process.
        runCatching { sweep() }
            .onSuccess { if (it > 0) log.info("closed $it idle room(s)") }
            .onFailure { log.warn("room maintenance sweep failed; will retry", it) }
    }

    private companion object {
        /** §5.126 — a diagnostics window, not an archive. */
        val DEFAULT_RETENTION: Duration = Duration.ofDays(7)

        /** The hourly hooks, on a one-minute sweep. */
        const val HOURLY_TICKS = 60L
    }
}
