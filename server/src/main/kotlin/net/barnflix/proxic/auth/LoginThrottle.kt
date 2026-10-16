package net.barnflix.proxic.auth

import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Login attempt throttling — PHASE_03 §3.45–§3.47.
 *
 * In-process and in-memory. §3.45 says so explicitly: at this
 * project's scale — five concurrent matches, two players — adding
 * Redis to count login failures would be more moving parts than the
 * thing they protect.
 *
 * §3.47 forbids permanent lockout. A failed-login counter that
 * locks an account is a denial-of-service tool handed to anyone who
 * knows a username: they cannot get in, but they can keep the owner
 * out indefinitely. This throttles and then forgets.
 *
 * Counted per (source, normalized username) pair, per §3.45, so one
 * attacker hammering one account cannot lock out everyone else from
 * that address, and cannot lock one account from every address.
 */
class LoginThrottle(
    private val maxAttempts: Int = 10,
    private val window: Duration = Duration.ofMinutes(15),
    private val clock: () -> Instant = Instant::now,
) {
    private data class Attempts(val count: Int, val first: Instant)

    private val failures = ConcurrentHashMap<String, Attempts>()

    /** Seconds the caller must wait, or null when it may proceed. */
    fun retryAfter(
        source: String,
        username: String,
    ): Long? {
        val key = keyOf(source, username)
        val attempts = failures[key] ?: return null
        val elapsed = Duration.between(attempts.first, clock())

        if (elapsed >= window) {
            // The window has passed; forget and start clean (§3.47).
            failures.remove(key)
            return null
        }
        if (attempts.count < maxAttempts) return null
        return (window - elapsed).seconds.coerceAtLeast(1)
    }

    fun recordFailure(
        source: String,
        username: String,
    ) {
        val key = keyOf(source, username)
        val now = clock()
        failures.compute(key) { _, existing ->
            when {
                existing == null -> Attempts(1, now)
                Duration.between(existing.first, now) >= window -> Attempts(1, now)
                else -> existing.copy(count = existing.count + 1)
            }
        }
    }

    /**
     * Clear the counter after a successful login.
     *
     * Without this, someone who mistypes nine times and then
     * succeeds stays one attempt from being throttled for the rest
     * of the window — punished for getting it right.
     */
    fun recordSuccess(
        source: String,
        username: String,
    ) {
        failures.remove(keyOf(source, username))
    }

    /** Entries older than the window, dropped so the map cannot grow forever. */
    fun evictExpired() {
        val now = clock()
        failures.entries.removeIf { Duration.between(it.value.first, now) >= window }
    }

    internal fun size(): Int = failures.size

    private fun keyOf(
        source: String,
        username: String,
    ) = "$source|${Usernames.normalize(username)}"
}
