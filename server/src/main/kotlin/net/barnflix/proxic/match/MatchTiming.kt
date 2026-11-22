package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.slf4j.LoggerFactory
import java.time.Instant
import java.util.UUID

// TEST ONLY -- Phase 11 P11-D0, "where the time goes, end to end".
//
// Timing marks on the server's side of a moment, beside the worker's
// (forge-worker game/Timing.java): a player's answer read off the match
// socket (`in`) and handed to the worker (`fwd`); each worker frame read
// off the pipe (`wk`, with its ordinal among frames of its type, which the
// worker counts the same way) and done with (`wkDone`); the pictures added
// to a board (`art`); and every message put on a player's socket (`out`,
// with the envelope's messageId, which the page sees, and the worker frame
// it came from). The kit's timeline measure
// (frontend/tools/measure/timeline.spec.ts) reads them from the server's
// log and joins them up.
//
// Off unless PROXIC_TEST_TIMING=true, which only docker-compose.local.yml
// sets (scripts/check-test-switch.py keeps it out of production). Off,
// every mark is a test of one boolean; nothing a player is sent changes,
// on or off: the marks go to the log, never into a message.
//
// Times are microseconds since the epoch (the container's clock, which the
// worker's marks share); durations are microseconds.

object MatchTiming {
    private val log = LoggerFactory.getLogger(MatchTiming::class.java)

    /** Every mark's log message starts with this. */
    const val PREFIX = "proxic-timing "

    @Volatile
    var on: Boolean = false
        private set

    /** The worker frame the pump thread is handling now: its type and ordinal. */
    private val handling = ThreadLocal<Pair<String, Int>?>()

    /** Turn the marks on (the server's start-up, from ServerConfig.testTiming) or off (tests). */
    fun enable(enabled: Boolean) {
        on = enabled
        if (enabled) log.warn("PROXIC_TEST_TIMING is on: match timing marks in the log. Never in production.")
    }

    /** Now, in microseconds since the epoch; 0 while off. */
    fun now(): Long {
        if (!on) return 0L
        val instant = Instant.now()
        return instant.epochSecond * MICROS_PER_SECOND + instant.nano / NANOS_PER_MICRO
    }

    /** A mark at [t]: [fields] are written as JSON numbers, booleans or strings (null as null). */
    fun mark(
        event: String,
        t: Long = now(),
        vararg fields: Pair<String, Any?>,
    ) {
        if (!on) return
        log.info(line(event, t, *fields))
    }

    /** One mark's text, without logging it. */
    internal fun line(
        event: String,
        t: Long,
        vararg fields: Pair<String, Any?>,
    ): String {
        val body =
            buildMap<String, kotlinx.serialization.json.JsonElement> {
                put("ev", JsonPrimitive(event))
                put("t", JsonPrimitive(t))
                for ((key, value) in fields) {
                    put(
                        key,
                        when (value) {
                            null -> kotlinx.serialization.json.JsonNull
                            is Number -> JsonPrimitive(value)
                            is Boolean -> JsonPrimitive(value)
                            else -> JsonPrimitive(value.toString())
                        },
                    )
                }
            }
        return PREFIX + JsonObject(body).toString()
    }

    /**
     * A player's message read off the match socket at [read] (`in`): its
     * type and decision, and how long the socket took over it (checks,
     * the answer written to the worker, the receipt sent back).
     */
    fun answerRead(
        matchId: UUID,
        userId: UUID,
        text: String,
        read: Long,
    ) {
        if (!on) return
        val message = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(text) as JsonObject }.getOrNull()
        mark(
            "in",
            read,
            "match" to matchId,
            "user" to userId,
            "type" to (message?.get("type") as? JsonPrimitive)?.content,
            "decisionId" to message?.let { number(it, "decisionId") },
            "handled" to now() - read,
        )
    }

    /** A frame written to the worker's pipe from [start] (`fwd`). */
    fun forwarded(
        matchId: UUID,
        what: String,
        start: Long,
    ) {
        if (!on) return
        mark("fwd", start, "match" to matchId, "what" to what, "dur" to now() - start)
    }

    /** The pump thread starts on the [n]-th worker frame of its [type]: messages it sends say so. */
    internal fun handlingFrame(
        type: String,
        n: Int,
    ) = handling.set(type to n)

    /** The pump thread is done with the frame (every message it caused is on its sockets). */
    fun workerFrameDone(matchId: UUID) {
        val frame = handling.get() ?: return
        handling.remove()
        mark("wkDone", now(), "match" to matchId, "type" to frame.first, "n" to frame.second)
    }

    /** A message put on [userId]'s match sockets (or a spectator's), from [start]. */
    fun out(
        matchId: UUID,
        userId: UUID?,
        message: JsonObject,
        start: Long,
        connections: Int,
    ) {
        if (!on) return
        val from = handling.get()
        val state = message["state"] as? JsonObject
        mark(
            "out",
            start,
            "match" to matchId,
            "user" to userId,
            "type" to (message["type"] as? JsonPrimitive)?.content,
            "messageId" to (message["messageId"] as? JsonPrimitive)?.content,
            "rev" to state?.let { number(it, "stateRevision") },
            "decisionId" to number(message, "decisionId"),
            "fromType" to from?.first,
            "fromN" to from?.second,
            "connections" to connections,
            "dur" to now() - start,
        )
    }

    internal fun number(
        o: JsonObject,
        key: String,
    ): Long? = (o[key] as? JsonPrimitive)?.takeIf { !it.isString }?.longOrNull

    private const val MICROS_PER_SECOND = 1_000_000L
    private const val NANOS_PER_MICRO = 1_000L
}

/**
 * Frames read from one worker, by type (P11-D0, test only): the n-th
 * frame of a type here is the n-th the worker wrote (its `sent` marks),
 * because the pipe keeps the order.
 */
class FrameCounts {
    private val counts = HashMap<String, Int>()

    @Synchronized
    fun next(type: String): Int = counts.merge(type, 1, Int::plus)!!

    /** One more frame read at [read] and parsed by [parsed]: counted and marked (`wk`), when timing is on. */
    fun mark(
        matchId: UUID,
        frame: JsonObject,
        chars: Int,
        read: Long,
        parsed: Long,
    ) {
        if (!MatchTiming.on) return
        val type = (frame["type"] as? JsonPrimitive)?.content ?: "?"
        val n = next(type)
        MatchTiming.handlingFrame(type, n)
        val state = frame["state"] as? JsonObject
        MatchTiming.mark(
            "wk",
            read,
            "match" to matchId,
            "type" to type,
            "n" to n,
            "seat" to MatchTiming.number(frame, "seat"),
            "rev" to state?.let { MatchTiming.number(it, "stateRevision") },
            "decisionId" to MatchTiming.number(frame, "decisionId"),
            "chars" to chars,
            "parse" to parsed - read,
            // The game record's line (GameRecord, gzip), written before the frame is acted on.
            "record" to MatchTiming.now() - parsed,
        )
    }
}
