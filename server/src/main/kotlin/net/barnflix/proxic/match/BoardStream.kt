package net.barnflix.proxic.match

import io.ktor.websocket.Frame
import kotlinx.coroutines.channels.SendChannel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.longOrNull

// P11-D3 (2026-11-22) -- history sent once; P11-D4 (spec 0117, 2026-11-23)
// -- only what changed. One per connection.
//
// D3: the stream remembers the history lists the page holds and trims each
// board's to what the page lacks (BoardHistory.kt).
//
// D4: it also remembers the BASE, the last whole board this connection was
// sent (after pictures, MatchArt.annotate, and after the whole play log a
// first board carries; before D3's trimming), and sends the next board as a
// MATCH_DELTA from it (BoardDelta.kt): {gameEpoch, from, to, set, unset,
// lists} plus D3's history fields. The page rebuilds the whole board from its
// own base (frontend delta.ts, match.ts) before anything reads it.
//
// A whole MATCH_SNAPSHOT goes instead when:
//  - the connection has no base: its first board (join, reconnect, reload,
//    second tab, a spectator arriving);
//  - the game changed (`gameEpoch`, Karn's restart), or a new turn began
//    (`turn`): owner decision 1's once-per-turn checkpoint. Both forget the
//    history held too, so its lists come whole and the page relies on
//    nothing it held;
//  - the page asked (MATCH_RESYNC, [resend]);
//  - the delta would be no shorter than the board ("size");
//  - deltas are off: the server's switch, the page did not ask (`?deltas=1`)
//    or a spectator while spectator deltas are off ("off": P11-D3's board,
//    exactly as before).
// A board older than the newest sent goes whole and changes no memory (D3's
// rule: the page drops it, keeping its play log lines).
//
// Hidden information (P11-R4): the base is THIS connection's own last board,
// so a seat's deltas are made from that seat's stripped boards (HiddenIds)
// and a spectator's from public views only; nothing else is an input.
// Board and memory move together under one lock, so a joining connection's
// stored board and a live one cannot cross. P11-D6: every board reaches a
// connection through its own queue (SendQueue.kt) and is stepped here only as
// it leaves, so a message still queued (or never sent, on a connection closed
// for falling behind) has moved no memory.

/**
 * What one connection's page holds, and how its next board goes. [deltas]:
 * this connection takes MATCH_DELTA. [check] (TEST ONLY,
 * PROXIC_TEST_DELTA_CHECK): each delta also carries `whole`, the full board,
 * which the page compares with what it rebuilt.
 */
internal class BoardStream(
    private val deltas: Boolean = false,
    private val check: Boolean = false,
) {
    private val lock = Mutex()

    /** The lists the page holds now, as it rebuilt them. */
    private var held: Map<String, List<JsonElement>> = emptyMap()

    /** The newest board revision sent on this connection; null before the first. */
    private var revision: Long? = null

    /** The last whole board this connection was sent; null before one, and after a reset. */
    private var base: JsonObject? = null

    /** How many boards went as deltas and how many whole, by why (logged as the connection closes). */
    val counts: MutableMap<String, Int> = java.util.concurrent.ConcurrentHashMap()

    /** One board's way out: a MATCH_SNAPSHOT's `state` or a MATCH_DELTA's fields, and why. */
    class Step(
        val type: String,
        val body: JsonObject,
        val reason: String,
    )

    /**
     * Send [message] (a MATCH_SNAPSHOT) on [outgoing]: its board trimmed to
     * what this page lacks, or as a delta from the board this connection was
     * last sent. The envelope's messageId is kept either way: one message,
     * one id, whatever each connection is sent (D0's timeline joins on it).
     * [memo] shares a diff between connections with the same base.
     */
    suspend fun send(
        outgoing: SendChannel<Frame>,
        message: JsonObject,
        memo: DiffMemo = DiffMemo(),
    ) {
        val state = message["state"] as? JsonObject ?: return
        lock.withLock {
            outgoing.send(Frame.Text(text(message, step(state, memo))))
        }
    }

    /**
     * MATCH_RESYNC: the page has no board a delta can build on. Forget what
     * this connection was sent (the history held and the base), then send
     * [stored] (read under the lock, so no live board passes it) whole, as to
     * a new connection. Returns the board sent; null when there is none yet.
     */
    suspend fun resend(
        outgoing: SendChannel<Frame>,
        stored: () -> JsonObject?,
    ): JsonObject? =
        lock.withLock {
            reset()
            val state = stored() ?: return@withLock null
            val step = step(state, DiffMemo(), "resync")
            outgoing.send(Frame.Text(text(snapshotMessage(state), step)))
            state
        }

    /** The memory forgotten, as on a new connection (the newest revision sent is kept: the page has it). */
    fun reset() {
        held = emptyMap()
        base = null
    }

    /** P11-D6 -- the last board sent on this connection (the page's base), for MATCH_BEAT; null before one. */
    fun lastSent(): ResumePoint? {
        val board = base ?: return null
        val epoch = (board["gameEpoch"] as? JsonPrimitive)?.longOrNull ?: return null
        val rev = revision ?: return null
        return ResumePoint(epoch, rev)
    }

    /** The base's game and revision, for the resync's log line. */
    fun sent(): String = base?.let { "${it["gameEpoch"]}/${it["stateRevision"]}" } ?: "none"

    /** The board P11-D3 sends for [state] (deltas off), the memory moved on: for tests. */
    fun next(state: JsonObject): JsonObject = step(state, DiffMemo()).body

    /** What goes out for [state], the memory moved on: the step [send] makes, apart for tests. */
    fun step(
        state: JsonObject,
        memo: DiffMemo,
        asked: String? = null,
    ): Step {
        val rev = (state["stateRevision"] as? JsonPrimitive)?.longOrNull
        val last = revision
        // The page drops a board older than the one it has: whole, and nothing remembered.
        if (rev != null && last != null && rev < last) return whole(state, "older")
        if (rev != null) revision = rev
        val had = base
        val why =
            when {
                !deltas -> "off"
                asked != null -> asked
                had == null -> "first"
                had["gameEpoch"] != state["gameEpoch"] -> "epoch"
                had["turn"] != state["turn"] -> "turn"
                else -> null
            }
        // The game or the turn changed: the checkpoint relies on nothing the page held.
        if (why == "epoch" || why == "turn") held = emptyMap()
        val trimmed = BoardHistory.trim(state, held)
        held = trimmed.held
        base = state
        if (why != null || had == null) return whole(trimmed.board, why ?: "first")
        val delta = deltaOf(had, state, trimmed.board, memo)
        // Never more than the board: a delta no shorter goes as the board.
        if (delta.toString().length + DELTA_ENVELOPE >= trimmed.board.toString().length + SNAPSHOT_ENVELOPE) {
            return whole(trimmed.board, "size")
        }
        count("delta")
        return Step(DELTA_TYPE, if (check) JsonObject(delta + (WHOLE_KEY to state)) else delta, "delta")
    }

    private fun whole(
        board: JsonObject,
        reason: String,
    ): Step {
        count(reason)
        return Step(SNAPSHOT_TYPE, board, reason)
    }

    private fun count(reason: String) {
        counts.merge(reason, 1, Int::plus)
    }

    private fun deltaOf(
        had: JsonObject,
        state: JsonObject,
        trimmed: JsonObject,
        memo: DiffMemo,
    ): JsonObject {
        val changes = memo.diff(had, state)
        return buildJsonObject {
            state["gameEpoch"]?.let { put("gameEpoch", it) }
            had["stateRevision"]?.let { put("from", it) }
            state["stateRevision"]?.let { put("to", it) }
            changes.forEach { (key, value) -> put(key, value) }
            for (key in HISTORY_KEYS + KEPT_KEY) trimmed[key]?.let { put(key, it) }
        }
    }

    companion object {
        /**
         * What each envelope adds (protocolVersion, type, messageId: a snapshot
         * also wraps its board in "state"), so the size rule compares the two
         * messages as sent.
         */
        const val DELTA_ENVELOPE = 92
        const val SNAPSHOT_ENVELOPE = 105

        /** The text of [message]'s board as [step] sends it, the envelope kept. */
        fun text(
            message: JsonObject,
            step: Step,
        ): String {
            if (step.type != DELTA_TYPE) return JsonObject(message + ("state" to step.body)).toString()
            return buildJsonObject {
                message["protocolVersion"]?.let { put("protocolVersion", it) }
                put("type", JsonPrimitive(DELTA_TYPE))
                message["messageId"]?.let { put("messageId", it) }
                // P11-D6 -- the board's first-sent time, as the snapshot carries it.
                message["sentAt"]?.let { put("sentAt", it) }
                step.body.forEach { (key, value) -> put(key, value) }
            }.toString()
        }
    }
}

const val SNAPSHOT_TYPE = "MATCH_SNAPSHOT"

/** P11-D4 -- the message: what changed since the board this connection was last sent. */
const val DELTA_TYPE = "MATCH_DELTA"

/** P11-D4 (TEST ONLY, PROXIC_TEST_DELTA_CHECK) -- the full board beside a delta, for the page to compare. */
const val WHOLE_KEY = "whole"

/**
 * P11-D4 -- one diff per distinct base within one send: two tabs of one
 * player usually hold the same base board (the same object), so the second
 * reuses the first's diff. By identity, never by looks.
 */
internal class DiffMemo {
    private val diffs = java.util.IdentityHashMap<JsonObject, Pair<JsonObject, JsonObject>>()

    /** How many diffs were made (tests read it). */
    var made = 0
        private set

    // P11-D6 -- each connection's queue empties on its own coroutine, so two
    // connections of one send can reach the same memo at once.
    @Synchronized
    fun diff(
        base: JsonObject,
        board: JsonObject,
    ): JsonObject {
        diffs[base]?.takeIf { it.first === board }?.let { return it.second }
        made++
        return BoardDelta.diff(base, board).also { diffs[base] = board to it }
    }
}

/**
 * P11-D3 -- one message to one connection: a MATCH_SNAPSHOT through the
 * connection's [BoardStream] (trimmed to what the page lacks, or, P11-D4, a
 * delta; the messageId unchanged), anything else as [text]. P11-D6: called
 * as the message leaves the connection's queue ([Connection.offer] queues it).
 */
internal suspend fun Connection.deliver(
    message: JsonObject,
    text: Lazy<String>,
    memo: DiffMemo = DiffMemo(),
) {
    if ((message["type"] as? JsonPrimitive)?.content == SNAPSHOT_TYPE && message["state"] is JsonObject) {
        board.send(outgoing, message, memo)
    } else {
        outgoing.send(Frame.Text(text.value))
    }
}

/**
 * P11-D4 -- the switches. [players] (PROXIC_MATCH_DELTAS, default on): a
 * player's page that asks for deltas gets them. [spectators]
 * (PROXIC_SPECTATOR_DELTAS, default OFF until owner decision 2 turns it on).
 * [check] (TEST ONLY, PROXIC_TEST_DELTA_CHECK): every delta carries the
 * whole board as well, for the page to compare (never in production).
 */
data class DeltaSettings(
    val players: Boolean = true,
    val spectators: Boolean = false,
    val check: Boolean = false,
    /**
     * P11-D6 (spec 0119, PROXIC_SPECTATOR_CATCHUP, default OFF until owner
     * decision 2 turns it on): a spectator's page that comes back is caught
     * up from the public view's kept boards, as a player's is.
     */
    val spectatorCatchup: Boolean = false,
) {
    /** Who gets deltas on a connection whose page said [deltas] (`?deltas=1`): a format choice, nothing else. */
    fun asked(deltas: String?): DeltaSettings {
        val asks = deltas == "1"
        return copy(players = asks && players, spectators = asks && spectators)
    }
}

/** P11-D4 -- the match hub, with only-what-changed behind its switches (ServerConfig). */
fun matchHubFor(
    config: net.barnflix.proxic.ServerConfig,
    log: org.slf4j.Logger,
): MatchHub {
    if (config.testDeltaCheck) {
        log.warn("PROXIC_TEST_DELTA_CHECK is on: every delta carries the whole board. Never in production.")
    }
    log.info("match deltas: players ${config.matchDeltas}, spectators ${config.spectatorDeltas}")
    return MatchHub(
        DeltaSettings(
            players = config.matchDeltas,
            spectators = config.spectatorDeltas,
            check = config.testDeltaCheck,
            spectatorCatchup = config.spectatorCatchup,
        ),
    )
}
