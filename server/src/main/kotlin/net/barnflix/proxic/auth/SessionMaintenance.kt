package net.barnflix.proxic.auth

import org.slf4j.Logger
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

// Expired-session cleanup — PHASE_03 §3.90, §3.155.
//
// Found during the Phase 3 gate audit: `purgeExpiredSessions()` and
// `LoginThrottle.evictExpired()` both existed, were both tested, and
// NEITHER was ever called. A cleanup function nothing runs is not
// cleanup; it is a function that looks like cleanup in a review.

/**
 * The periodic sweep.
 *
 * Deliberately boring, and deliberately not clever:
 *
 * - **Expiry is never enforced here.** The `authenticate` query
 *   already refuses expired, revoked and disabled sessions, so this
 *   sweep is housekeeping, not security. If it stopped running
 *   tomorrow the only consequence would be a larger table — which is
 *   exactly the property that makes it safe to run on a timer.
 * - Rows are deleted only **30 days past expiry** (in the SQL), long
 *   after they can be used, so the audit trail outlives the session.
 * - One thread, one job. A missed run is harmless and the next one
 *   catches up.
 */
class SessionMaintenance(
    private val sessions: Sessions,
    private val throttle: LoginThrottle,
    private val log: Logger,
    private val intervalHours: Long = DEFAULT_INTERVAL_HOURS,
    /** PHASE_07 §7.67 — old sign-in records ride this tick too. */
    private val alsoSweep: () -> Unit = {},
) {
    private val executor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            // Named, so it is identifiable in a thread dump, and a
            // daemon, so it can never hold the JVM open at shutdown.
            Thread(runnable, "proxic-session-maintenance").apply { isDaemon = true }
        }

    fun start() {
        executor.scheduleWithFixedDelay(
            ::sweepQuietly,
            // A first run shortly after boot rather than immediately:
            // startup is the busiest moment the server has.
            FIRST_RUN_MINUTES,
            TimeUnit.HOURS.toMinutes(intervalHours),
            TimeUnit.MINUTES,
        )
    }

    fun stop() {
        executor.shutdownNow()
    }

    /**
     * One sweep.
     *
     * Internal so a test can run it directly rather than waiting an
     * hour for the scheduler to prove anything.
     */
    internal fun sweep(): Int {
        val purged = sessions.purgeExpiredSessions()
        throttle.evictExpired()
        alsoSweep()
        return purged
    }

    private fun sweepQuietly() {
        // scheduleWithFixedDelay STOPS RESCHEDULING if the task
        // throws -- silently. A transient database error during one
        // sweep must not end cleanup for the lifetime of the
        // process, so nothing is allowed to escape.
        runCatching { sweep() }
            .onSuccess { if (it > 0) log.info("purged $it expired session row(s)") }
            .onFailure { log.warn("session maintenance sweep failed; will retry", it) }
    }

    private companion object {
        const val DEFAULT_INTERVAL_HOURS = 6L
        const val FIRST_RUN_MINUTES = 5L
    }
}
