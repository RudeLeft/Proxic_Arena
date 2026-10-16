package net.barnflix.proxic.auth

import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Login throttling — PHASE_03 §3.45–§3.47.
 *
 * Carry-forward C4: every limit in this project is tested with its
 * NEGATIVE CONTROL. A throttle that refuses everybody passes "too
 * many attempts are blocked" perfectly while locking the owner out
 * of their own server.
 */
class LoginThrottleTest {
    private var now = Instant.parse("2026-10-16T12:00:00Z")

    private fun throttle(
        max: Int = 10,
        window: Duration = Duration.ofMinutes(15),
    ) = LoginThrottle(maxAttempts = max, window = window, clock = { now })

    @Test
    fun `an honest user is never throttled`() {
        // THE negative control. If this fails, nobody can log in.
        val throttle = throttle()
        repeat(50) {
            assertNull(throttle.retryAfter("10.0.0.1", "RudeLeft"), "a clean login was throttled")
            throttle.recordSuccess("10.0.0.1", "RudeLeft")
        }
    }

    @Test
    fun `a few mistakes do not throttle`() {
        // Mistyping a password three times is normal, not an attack.
        val throttle = throttle()
        repeat(3) { throttle.recordFailure("10.0.0.1", "RudeLeft") }
        assertNull(throttle.retryAfter("10.0.0.1", "RudeLeft"))
    }

    @Test
    fun `enough failures throttle, and the wait is reported`() {
        val throttle = throttle(max = 5)
        repeat(5) { throttle.recordFailure("10.0.0.1", "RudeLeft") }

        val wait = throttle.retryAfter("10.0.0.1", "RudeLeft")
        assertNotNull(wait, "repeated failures were not throttled")
        assertTrue(wait in 1..900, "implausible wait: $wait")
    }

    @Test
    fun `the throttle forgets, rather than locking the account`() {
        // §3.47 — a counter that locks an account is a
        // denial-of-service tool handed to anyone who knows a
        // username: they cannot get in, but they can keep the owner
        // out indefinitely.
        val throttle = throttle(max = 5, window = Duration.ofMinutes(15))
        repeat(5) { throttle.recordFailure("10.0.0.1", "RudeLeft") }
        assertNotNull(throttle.retryAfter("10.0.0.1", "RudeLeft"))

        now = now.plus(Duration.ofMinutes(16))
        assertNull(throttle.retryAfter("10.0.0.1", "RudeLeft"), "the account stayed locked")
    }

    @Test
    fun `succeeding clears the counter`() {
        // Otherwise someone who mistypes nine times and then gets it
        // right stays one attempt from being throttled for the rest
        // of the window — punished for succeeding.
        val throttle = throttle(max = 10)
        repeat(9) { throttle.recordFailure("10.0.0.1", "RudeLeft") }
        throttle.recordSuccess("10.0.0.1", "RudeLeft")

        repeat(9) { throttle.recordFailure("10.0.0.1", "RudeLeft") }
        assertNull(throttle.retryAfter("10.0.0.1", "RudeLeft"), "the counter was not cleared")
    }

    @Test
    fun `one attacker cannot lock out everyone else`() {
        // §3.45 — counted per source AND username. Without the
        // pair, an attacker hammering one account would throttle
        // every other user from that address, or lock one account
        // from every address.
        val throttle = throttle(max = 5)
        repeat(5) { throttle.recordFailure("10.0.0.1", "RudeLeft") }

        assertNotNull(throttle.retryAfter("10.0.0.1", "RudeLeft"))
        assertNull(throttle.retryAfter("10.0.0.1", "SomeoneElse"), "another user was throttled")
        assertNull(throttle.retryAfter("10.0.0.9", "RudeLeft"), "another address was throttled")
    }

    @Test
    fun `username case does not create a separate bucket`() {
        // Otherwise an attacker gets a fresh allowance per casing:
        // RudeLeft, rudeleft, RUDELEFT and so on.
        val throttle = throttle(max = 5)
        repeat(3) { throttle.recordFailure("10.0.0.1", "RudeLeft") }
        repeat(2) { throttle.recordFailure("10.0.0.1", "RUDELEFT") }
        assertNotNull(throttle.retryAfter("10.0.0.1", "rudeleft"), "casing bypassed the throttle")
    }

    @Test
    fun `the map does not grow forever`() {
        val throttle = throttle(window = Duration.ofMinutes(15))
        repeat(100) { throttle.recordFailure("10.0.0.$it", "user$it") }
        assertEquals(100, throttle.size())

        now = now.plus(Duration.ofMinutes(16))
        throttle.evictExpired()
        assertEquals(0, throttle.size(), "expired entries were kept")
    }
}
