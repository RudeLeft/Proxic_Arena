package net.barnflix.proxic.match

import kotlinx.coroutines.channels.SendChannel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

// P11-D3 (2026-11-22) -- history sent once.
//
// A board carries three history lists that the worker builds as "the last
// N" and sends whole on every board: `payments` (the last 24 payment steps,
// about a sixth of every byte sent), `rolls` (the last six dice) and
// `notices` (the last six things this seat was told). On most boards the
// list is the one the board before had, so the page was sent the same
// entries again and again.
//
// Now each connection remembers the lists its page holds, and a board sent
// on it carries only the entries the page does not have, with `kept`
// saying how many of the page's own to keep: {"payments": 23} = "keep the
// last 23 of your payments, then add this board's". The page rebuilds the
// whole list (frontend `history.ts` `withHistory`) before anything reads
// the board, so the board it draws is the one the worker made.
//
// Why it cannot show a wrong or missing history (or leak anything):
//  - per CONNECTION, not per seat: a connection's first board has nothing
//    to keep, so it carries every list whole (a page that joins,
//    reconnects, a spectator arriving, a second tab);
//  - exact by construction: `kept` is m only when the last m entries the
//    page holds ARE the first m of the new list, so "keep m, add the rest"
//    is the worker's list, element for element; otherwise the list goes
//    whole. A changed entry (an id stripped because its card went into a
//    hand, HiddenIds) or a list that restarted (Karn) is therefore re-sent;
//  - what is sent is a suffix of the seat's own full list: nothing in it
//    the worker's board for that seat did not have (HID-001), and the
//    stripping is the worker's, untouched;
//  - a board older than one this connection was sent is dropped by the
//    page (`match.ts`, MATCH_SNAPSHOT: the revision check), so it goes
//    whole and leaves the memory as it was;
//  - board and memory change together, under one lock per connection, so
//    the stored board a joining connection is sent and a live one that
//    reaches it first cannot cross.
// The play log is not here: the worker already sends each line once (this
// round's lines) and the server adds the whole log to a joining
// connection's first board (LiveMatch.snapshotFor).

/** P11-D3 -- the lists sent once, by the snapshot key. */
val HISTORY_KEYS: List<String> = listOf("payments", "rolls", "notices")

/** P11-D3 -- the key that says how many of each list the page keeps. */
const val KEPT_KEY = "kept"

/** P11-D3 -- what one connection's page holds, and the board that trims against it. */
internal class BoardStream {
    private val lock = Mutex()

    /** The lists the page holds now, as it rebuilt them. */
    private var held: Map<String, List<JsonElement>> = emptyMap()

    /** The newest board revision sent on this connection; null before the first. */
    private var revision: Long? = null

    /**
     * Send [state] on [outgoing], trimmed to what this page lacks. [envelope]
     * wraps the board actually sent (the same envelope for every connection,
     * so its messageId is one).
     */
    suspend fun send(
        outgoing: SendChannel<io.ktor.websocket.Frame>,
        state: JsonObject,
        envelope: (JsonObject) -> JsonObject,
    ) {
        lock.withLock {
            val sent = next(state)
            outgoing.send(io.ktor.websocket.Frame.Text(envelope(sent).toString()))
        }
    }

    /** The board to send for [state], with the memory moved on: the step [send] makes, apart for tests. */
    fun next(state: JsonObject): JsonObject {
        val rev = (state["stateRevision"] as? JsonPrimitive)?.longOrNull
        val last = revision
        // The page drops a board older than the one it has: send it whole, remember nothing.
        if (rev != null && last != null && rev < last) return state
        if (rev != null) revision = rev
        val trimmed = BoardHistory.trim(state, held)
        held = trimmed.held
        return trimmed.board
    }
}

/**
 * P11-D3 -- one message to one connection: a MATCH_SNAPSHOT through the
 * connection's [BoardStream] (its history trimmed to what the page lacks;
 * the envelope, and so the messageId, unchanged), anything else as [text].
 */
internal suspend fun Connection.deliver(
    message: JsonObject,
    text: Lazy<String>,
) {
    val state = message["state"] as? JsonObject
    if ((message["type"] as? JsonPrimitive)?.content == "MATCH_SNAPSHOT" && state != null) {
        board.send(outgoing, state) { sent -> JsonObject(message + ("state" to sent)) }
    } else {
        outgoing.send(io.ktor.websocket.Frame.Text(text.value))
    }
}

/** P11-D3 -- the trimming itself, pure: a board and what the page holds in; what to send and hold out. */
object BoardHistory {
    class Trimmed(
        val board: JsonObject,
        val held: Map<String, List<JsonElement>>,
    )

    fun trim(
        state: JsonObject,
        held: Map<String, List<JsonElement>>,
    ): Trimmed {
        val out = state.toMutableMap()
        val kept = mutableMapOf<String, Int>()
        val holds = mutableMapOf<String, List<JsonElement>>()
        for (key in HISTORY_KEYS) {
            val now = (state[key] as? JsonArray)?.toList().orEmpty()
            holds[key] = now
            val keep = overlap(held[key].orEmpty(), now)
            if (keep == 0) continue
            kept[key] = keep
            val rest = now.drop(keep)
            if (rest.isEmpty()) out.remove(key) else out[key] = JsonArray(rest)
        }
        if (kept.isNotEmpty()) {
            out[KEPT_KEY] = buildJsonObject { kept.forEach { (key, m) -> put(key, m) } }
        }
        return Trimmed(JsonObject(out), holds)
    }

    /**
     * The largest m with the last m of [had] equal to the first m of [now]:
     * how many of the page's entries the new list starts with. Lists are
     * short (24 at most), so the plain search costs nothing.
     */
    fun overlap(
        had: List<JsonElement>,
        now: List<JsonElement>,
    ): Int {
        var m = minOf(had.size, now.size)
        while (m > 0) {
            if (had.subList(had.size - m, had.size) == now.subList(0, m)) return m
            m--
        }
        return 0
    }

    /** The page's step, for tests: [sent] rebuilt against [held] (frontend `history.ts` `withHistory`). */
    fun rebuild(
        sent: JsonObject,
        held: Map<String, List<JsonElement>>,
    ): JsonObject {
        val kept = sent[KEPT_KEY] as? JsonObject
        val out = sent.toMutableMap()
        out.remove(KEPT_KEY)
        for (key in HISTORY_KEYS) {
            val m = (kept?.get(key) as? JsonPrimitive)?.longOrNull?.toInt() ?: continue
            val had = held[key].orEmpty()
            val add = (sent[key] as? JsonArray)?.toList().orEmpty()
            out[key] = JsonArray(had.takeLast(m) + add)
        }
        return JsonObject(out)
    }
}
