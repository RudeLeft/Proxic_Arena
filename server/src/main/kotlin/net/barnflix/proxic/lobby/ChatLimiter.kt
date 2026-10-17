package net.barnflix.proxic.lobby

import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Chat rate limiting — PHASE 5 AMENDMENT 3.
//
// The same shape as LoginThrottle (carry-forward C6): in-process,
// per-user, cleared by time rather than by ceremony. Mirroring the
// existing style matters more than the specific numbers -- two
// different throttling idioms in one codebase is how one of them
// ends up unmaintained.
//
// A token bucket rather than a fixed window, because chat is bursty:
// three quick lines while arranging a game is normal, thirty is not.

class ChatLimiter(
    private val burst: Int = 5,
    private val refillEvery: Duration = Duration.ofSeconds(2),
    private val clock: () -> Instant = Instant::now,
) {
    private data class Bucket(val tokens: Int, val lastRefill: Instant)

    private val buckets = ConcurrentHashMap<UUID, Bucket>()

    /** True when this message may be sent; consumes a token. */
    fun allow(userId: UUID): Boolean {
        val now = clock()
        val bucket = buckets[userId] ?: Bucket(burst, now)

        val refills = Duration.between(bucket.lastRefill, now).dividedBy(refillEvery).toInt()
        val tokens = (bucket.tokens + refills).coerceAtMost(burst)
        val lastRefill = if (refills > 0) now else bucket.lastRefill

        if (tokens <= 0) {
            buckets[userId] = Bucket(0, lastRefill)
            return false
        }
        buckets[userId] = Bucket(tokens - 1, lastRefill)
        return true
    }

    /** Drop idle buckets; called by the same sweep as session cleanup. */
    fun evictIdle() {
        val cutoff = clock().minus(Duration.ofMinutes(10))
        buckets.entries.removeIf { it.value.lastRefill.isBefore(cutoff) }
    }
}
