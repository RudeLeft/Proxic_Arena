package net.barnflix.proxic.match

// Spec 0120 (P11, the hard pause; owner 2026-11-26, Amendment 1 2026-11-27)
// -- which seats have a game connection, which have dropped, and when the
// game may go on.
//
// A seat is DROPPED when its user has no open player connection to the match
// any more (the last tab closed, a refresh, a ping timeout: Ktor closes a
// player's connection 5 s after its last pong, MatchSocket). Two tabs: either
// one open keeps the seat. A seat that never connected never drops (the game
// waits on its questions anyway). Spectators never count: only players'
// connections come here.
//
// The game is PAUSED from the moment a seat drops (the safe side) until the
// resume rule holds for every dropped seat (owner Q3 A): it has an open
// connection again; that connection's page said its table is live
// (CAUGHT_UP, spec 0119) at least 2 s ago and the connection is at least 2 s
// old -- or, a cap, the connection is 8 s old; and no other seat is dropped.
//
// The away clock (D8) and the budget (Q6 B): "End the game · you win" is
// offered `away` after the drop, or sooner once the seat's paused time this
// game reaches `away` in all (budget); [awayAt].

/** Spec 0120 -- what changed in [SeatLinks], for the hub to tell. */
sealed interface LinkEvent {
    /** [seat] dropped at [since] (ms, the server's clock); the away window opens at [awayAt]. */
    data class Dropped(
        val seat: Int,
        val since: Long,
        val awayAt: Long,
    ) : LinkEvent

    /** [seat], dropped, has a connection again (its page is catching up). */
    data class Returning(
        val seat: Int,
        val since: Long,
        val awayAt: Long,
    ) : LinkEvent

    /** [seats] are back and the game goes on. */
    data class Resumed(
        val seats: Set<Int>,
    ) : LinkEvent
}

/** Spec 0120 -- one dropped seat's pause, as the pages are told it. */
data class SeatPause(
    val seat: Int,
    val since: Long,
    val awayAt: Long,
    val back: Boolean,
)

class SeatLinks(
    /** The away setting (RoomTimeouts.active.away), ms: the away clock and the budget. */
    private val awayMs: () -> Long,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private class Link(
        val openedAt: Long,
        var caughtUpAt: Long? = null,
    )

    private class Seat {
        val links = LinkedHashMap<String, Link>()
        var droppedSince: Long? = null
        var usedMs = 0L
    }

    private val seats = HashMap<Int, Seat>()

    @Volatile
    private var pausedNow = false

    /** The game is paused: some seat is dropped. Read without the lock (G1's first check). */
    val paused: Boolean get() = pausedNow

    private fun seat(n: Int) = seats.getOrPut(n) { Seat() }

    @Synchronized
    fun opened(
        seat: Int,
        connectionId: String,
    ): List<LinkEvent> {
        val s = seat(seat)
        val first = s.links.isEmpty()
        s.links[connectionId] = Link(clock())
        val since = s.droppedSince ?: return emptyList()
        return if (first) listOf(LinkEvent.Returning(seat, since, awayAt(s, since))) else emptyList()
    }

    @Synchronized
    fun closed(
        seat: Int,
        connectionId: String,
    ): List<LinkEvent> {
        val s = seats[seat] ?: return emptyList()
        if (s.links.remove(connectionId) == null || s.links.isNotEmpty()) return emptyList()
        // A flap: dropped again before the game went on keeps the first drop's time.
        val since = s.droppedSince ?: clock().also { s.droppedSince = it }
        pausedNow = true
        return listOf(LinkEvent.Dropped(seat, since, awayAt(s, since)))
    }

    /** The connection's page said its table is live (CAUGHT_UP). */
    @Synchronized
    fun caughtUp(
        seat: Int,
        connectionId: String,
    ) {
        seats[seat]?.links?.get(connectionId)?.let { it.caughtUpAt = it.caughtUpAt ?: clock() }
    }

    /** The resume rule, looked at now: Resumed when every dropped seat is back and steady. */
    @Synchronized
    fun tick(): List<LinkEvent> {
        val dropped = seats.filterValues { it.droppedSince != null }
        if (dropped.isEmpty()) return emptyList()
        val now = clock()
        if (!dropped.values.all { s -> s.links.values.any { ready(it, now) } }) return emptyList()
        dropped.values.forEach { s ->
            s.usedMs += now - s.droppedSince!!
            s.droppedSince = null
        }
        pausedNow = false
        return listOf(LinkEvent.Resumed(dropped.keys.toSet()))
    }

    private fun ready(
        link: Link,
        now: Long,
    ): Boolean {
        val age = now - link.openedAt
        if (age < STEADY_MS) return false
        val caught = link.caughtUpAt
        return age >= RESUME_CAP_MS || (caught != null && now - caught >= STEADY_MS)
    }

    /** Every dropped seat's pause now, for a connection that just opened. */
    @Synchronized
    fun pauses(): List<SeatPause> =
        seats.entries.mapNotNull { (n, s) ->
            s.droppedSince?.let { SeatPause(n, it, awayAt(s, it), s.links.isNotEmpty()) }
        }

    /** When "End the game" opens against [seat] (ms), or null: not dropped now. */
    @Synchronized
    fun awayAt(seat: Int): Long? = seats[seat]?.let { s -> s.droppedSince?.let { awayAt(s, it) } }

    /** [seat]'s paused time this game so far (ms), the pause under way included. */
    @Synchronized
    fun usedMs(seat: Int): Long = seats[seat]?.let { s -> s.usedMs + (s.droppedSince?.let { clock() - it } ?: 0) } ?: 0

    /** The away clock from the drop (D8), or sooner when the budget runs out (Q6 B). */
    private fun awayAt(
        s: Seat,
        since: Long,
    ): Long {
        val away = awayMs()
        return since + minOf(away, maxOf(0L, away - s.usedMs))
    }

    companion object {
        /** Owner Q3 A -- the returning connection holds this long after its catch-up. */
        const val STEADY_MS = 2_000L

        /** Owner Q3 A -- and the game goes on this long after it opened at most. */
        const val RESUME_CAP_MS = 8_000L
    }
}
