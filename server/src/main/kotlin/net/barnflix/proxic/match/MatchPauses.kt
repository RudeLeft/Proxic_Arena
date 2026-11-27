package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import net.barnflix.proxic.BuildInfo
import org.slf4j.LoggerFactory
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

// Spec 0120 -- the hard pause, wired: a player's connection opening or
// closing goes to the match's SeatLinks; what changes is told to every page
// of the match (players and spectators: MATCH_PAUSED, MATCH_RESUMED) and to
// the worker (HOLD, GO). A paused match is looked at every [LOOK_MS] for its
// resume rule (SeatLinks.tick).

/**
 * Spec 0120 -- MATCH_PAUSED: [seat] dropped at [since] (ms, the server's
 * clock); "End the game" opens at [awayAt] ([endNow]: already); [back]: it
 * has a connection again and is catching up. A seat number and times only:
 * who dropped is public already (HID-001).
 */
fun pausedMessage(
    seat: Int,
    since: Long,
    awayAt: Long,
    back: Boolean,
    now: Long = System.currentTimeMillis(),
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "MATCH_PAUSED")
        put("messageId", UUID.randomUUID().toString())
        put("seat", seat)
        put("since", since)
        put("awayAt", awayAt)
        // The server's clock as it is sent: the page turns since and awayAt into its own time.
        put("now", now)
        if (awayAt <= now) put("endNow", true)
        if (back) put("back", true)
    }

/** Spec 0120 -- MATCH_RESUMED: [seat] is back and the game goes on. */
fun resumedMessage(seat: Int): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "MATCH_RESUMED")
        put("messageId", UUID.randomUUID().toString())
        put("seat", seat)
    }

/** Spec 0120 -- HOLD or GO to the worker: no seat named. */
fun holdFrame(hold: Boolean): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", if (hold) "HOLD" else "GO")
        put("messageId", UUID.randomUUID().toString())
    }

/**
 * Spec 0120 -- the game is paused (HOLD) or goes on (GO). Not sent to a worker
 * that has gone (the game over: its players' connections close after it), so
 * an ended game logs no "could not send a pause".
 */
fun MatchWorker.hold(on: Boolean): Boolean {
    if (!isAlive()) return false
    return forward(holdFrame(on), if (on) "a pause" else "the end of a pause")
}

/**
 * Spec 0120 -- this match's process has come and gone: its game is over (or
 * failed). Not true before the process is started, which a match being
 * launched is (its players' pages connect meanwhile).
 */
fun MatchWorker.ended(): Boolean = spawned && !isAlive()

class MatchPauses internal constructor(
    /** Every connection of a match, players' and spectators', to tell. */
    private val everyone: (UUID) -> List<Connection>,
    private val clock: () -> Long = System::currentTimeMillis,
    /** Null: looked at only when asked ([look]), as the tests do. */
    ticker: ScheduledExecutorService? = defaultTicker(),
    /**
     * A match whose game is over (its worker gone): forgotten, nothing more to
     * resume. NOT a match whose worker has not started yet: one paused while
     * launching (a page reloaded during the opening hands) was forgotten here
     * and never went on, every answer refused for ever (CI run 46054823866:
     * match.spec's pregame, "The game is running" never came).
     */
    private val gone: (LiveMatch) -> Boolean = { it.worker.ended() },
) {
    private val log = LoggerFactory.getLogger(MatchPauses::class.java)

    /** The matches paused now, looked at for the resume rule. */
    private val paused = ConcurrentHashMap<UUID, PausedMatch>()

    internal class PausedMatch(
        val live: LiveMatch,
        val hold: (Boolean) -> Boolean,
        var held: Boolean = false,
        /** What the worker was last told and took (HOLD true, GO false). */
        var told: Boolean = false,
    )

    init {
        ticker?.scheduleWithFixedDelay({ runCatching { look() } }, LOOK_MS, LOOK_MS, TimeUnit.MILLISECONDS)
    }

    /** A player's connection opened. */
    internal fun opened(
        live: LiveMatch,
        seat: Int,
        connectionId: String,
        hold: (Boolean) -> Boolean = { live.worker.hold(it) },
    ) = apply(live, live.links.opened(seat, connectionId), hold)

    /** A player's connection closed (any way: closed, refreshed, timed out). */
    internal fun closed(
        live: LiveMatch,
        seat: Int,
        connectionId: String,
        hold: (Boolean) -> Boolean = { live.worker.hold(it) },
        /** The seat's other connections still open (the hub's): a seat with one is not dropped. */
        stillOpen: Collection<String> = emptyList(),
    ) = apply(live, live.links.closed(seat, connectionId, stillOpen), hold)

    /** Every paused match's resume rule, now. */
    fun look() {
        paused.entries.removeIf { gone(it.value.live) }
        paused.values.forEach { p ->
            apply(p.live, p.live.links.tick(), p.hold)
            // A HOLD the worker could not take yet (still starting): again.
            synchronized(p) { tellWorker(p) }
        }
    }

    /** What a connection that just opened is told first: every pause under way. */
    internal fun greeting(live: LiveMatch?): List<JsonObject> =
        live?.links?.pauses().orEmpty().map { pausedMessage(it.seat, it.since, it.awayAt, it.back, clock()) }

    private fun apply(
        live: LiveMatch,
        events: List<LinkEvent>,
        hold: (Boolean) -> Boolean,
    ) {
        if (events.isEmpty()) return
        val matchId = live.match.matchId
        val entry = paused.computeIfAbsent(matchId) { PausedMatch(live, hold) }
        events.forEach { event -> tell(matchId, event) }
        synchronized(entry) {
            val now = live.links.paused
            if (now != entry.held) {
                entry.held = now
                log.info("match $matchId: ${if (now) "paused (a player's connection dropped)" else "goes on"}")
            }
            tellWorker(entry)
            if (!now && entry.told == now) paused.remove(matchId)
        }
    }

    /** The worker is told HOLD or GO until it has taken what the game is now. */
    private fun tellWorker(entry: PausedMatch) {
        if (entry.told == entry.held) return
        if (entry.hold(entry.held)) entry.told = entry.held
    }

    private fun tell(
        matchId: UUID,
        event: LinkEvent,
    ) {
        val messages =
            when (event) {
                is LinkEvent.Dropped -> listOf(pausedMessage(event.seat, event.since, event.awayAt, false, clock()))
                is LinkEvent.Returning -> listOf(pausedMessage(event.seat, event.since, event.awayAt, true, clock()))
                is LinkEvent.Resumed -> event.seats.sorted().map { resumedMessage(it) }
            }
        val connections = everyone(matchId)
        messages.forEach { message ->
            val text = lazy { message.toString() }
            connections.forEach { it.offer(Outgoing.Message(message, text)) }
        }
    }

    companion object {
        /** How often a paused match's resume rule is looked at. */
        const val LOOK_MS = 100L

        private fun defaultTicker(): ScheduledExecutorService =
            Executors.newSingleThreadScheduledExecutor { r ->
                Thread(r, "proxic-match-pauses").apply { isDaemon = true }
            }
    }
}
