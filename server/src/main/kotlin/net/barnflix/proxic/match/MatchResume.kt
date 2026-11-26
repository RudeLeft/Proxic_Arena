package net.barnflix.proxic.match

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import net.barnflix.proxic.BuildInfo
import java.util.UUID

// P11-D6 (spec 0119, catch-up after a stall) -- what a connection that comes
// back is sent first (MatchSocket), the quiet line's beat, and the page's
// "my table is live" (CAUGHT_UP). The kept boards themselves: SeatReplay.kt.

/**
 * P11-D6 (spec 0119) -- a resume's catch-up follows: [count] board and step
 * messages, oldest first, after the board the page holds ([from]).
 */
fun catchupMessage(
    from: ResumePoint,
    count: Int,
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "MATCH_CATCHUP")
        put("messageId", UUID.randomUUID().toString())
        putJsonObject("from") {
            put("gameEpoch", from.gameEpoch)
            put("stateRevision", from.stateRevision)
        }
        put("count", count)
    }

/**
 * P11-D6 (spec 0119) -- nothing else was sent on this connection for
 * [BEAT_QUIET_MS]: the board it was last sent, by game and revision (the
 * page's own; a page behind it asks for the whole board). No card, no seat.
 */
fun beatMessage(sent: ResumePoint?): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", "MATCH_BEAT")
        put("messageId", UUID.randomUUID().toString())
        sent?.let {
            put("gameEpoch", it.gameEpoch)
            put("stateRevision", it.stateRevision)
        }
    }

/**
 * P11-D6 (spec 0119) -- a connection's first boards: the stored board whole
 * (today's path, [stored]), or, for a page that came back with a board this
 * seat kept, MATCH_CATCHUP and the messages after it (the first board whole
 * through the new connection's BoardStream, then deltas), or nothing at all
 * when the page holds the newest. Returns how many catch-up messages were
 * queued (-1: the whole board).
 */
internal fun firstBoards(
    connection: Connection,
    resume: Resume,
    stored: () -> JsonObject?,
): Int =
    when (resume) {
        is Resume.Catchup -> {
            connection.offer(Outgoing.Message(catchupMessage(resume.from, resume.after.size)))
            resume.after.forEach { message -> connection.offer(Outgoing.Message(message)) }
            resume.after.size
        }
        Resume.Newest -> 0
        Resume.Whole -> {
            stored()?.let { state -> connection.offer(Outgoing.Message(snapshotMessage(state))) }
            -1
        }
    }

/**
 * P11-D6 (P11-R4) -- a player's resume reads its OWN seat's kept boards only:
 * the seat is the session's (§6.108), never anything the page said.
 */
internal fun playerResume(
    live: LiveMatch?,
    seat: Int,
    point: ResumePoint?,
): Resume = live?.replay?.resume(seat, point) ?: Resume.Whole

/** P11-D6 (P11-R4) -- a spectator's resume reads the public view's kept boards only, never a seat's. */
internal fun spectatorResume(
    live: LiveMatch?,
    point: ResumePoint?,
): Resume = live?.replay?.resume(PUBLIC_SEAT, point) ?: Resume.Whole

/** P11-D6 (spec 0119) -- how long a player's connection is quiet before MATCH_BEAT, and how often that is looked at. */
const val BEAT_QUIET_MS = 2_000L
private const val BEAT_LOOK_MS = 250L

/**
 * P11-D6 -- MATCH_BEAT whenever nothing has been written on [connection] for
 * [BEAT_QUIET_MS] and nothing waits: the page hears a quiet line is alive
 * (its silence check). Queued like anything else, so never ahead of a board.
 */
internal suspend fun beats(
    connection: Connection,
    clock: () -> Long = System::currentTimeMillis,
    quietMs: Long = BEAT_QUIET_MS,
    lookMs: Long = BEAT_LOOK_MS,
) {
    while (true) {
        kotlinx.coroutines.delay(lookMs)
        val queue = connection.queue
        if (queue.isBehind) return
        if (queue.waiting == 0 && clock() - queue.lastWritten >= quietMs) connection.offer(Outgoing.Beat)
    }
}

/** P11-D6 (spec 0119) -- [text] is the page's CAUGHT_UP (only its type is read). */
internal fun caughtUp(text: String): Boolean {
    if (!text.contains("\"CAUGHT_UP\"")) return false
    val message = runCatching { Json.parseToJsonElement(text) as JsonObject }.getOrNull() ?: return false
    return (message["type"] as? JsonPrimitive)?.takeIf { it.isString }?.content == "CAUGHT_UP"
}
