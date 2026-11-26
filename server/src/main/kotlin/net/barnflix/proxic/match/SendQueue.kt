package net.barnflix.proxic.match

import io.ktor.websocket.CloseReason
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

// P11-D6 (spec 0119, the per-connection queue; owner 2026-11-26, "Build it
// now") -- the server never waits on a slow page.
//
// Before: everything the worker says is handled on the match's pump thread
// (MatchWorker.startPump), which sent each message to each connection in
// turn (MatchHub.sendTo) inside runBlocking (MatchDecisions.tell). Ktor's
// `outgoing` holds 8 frames; once one connection's frames, its writer and
// the socket buffers behind it were full, `send` suspended, the pump stopped
// reading the worker, and the game froze for BOTH players until Ktor's ping
// timeout closed that connection (RUN 2026-11-26: 28.7 s, a third connection
// that never read).
//
// Now each connection has its own queue and one coroutine that empties it in
// order: the hub only ever puts a message in the queue ([offer], which never
// suspends and never blocks), so the pump and every other connection go on
// whatever one socket does. The connection's BoardStream (P11-D3/D4: what this
// page holds, the base of its next delta) runs on the emptying side, as each
// board actually leaves, so a message that never leaves never moves it.
//
// A connection that falls far behind is closed (MatchSocket: code 4002
// "behind") and its page reconnects as from any dropped connection, to the
// whole board (today's path; the board it was sent last is forgotten with
// the connection). "Far behind" is [QueueLimits]: why those numbers is there.

/**
 * When a connection is far enough behind to be closed (spec 0119, P11-D6).
 *
 * [waitMillis], 10 s: the oldest message not yet on the wire has waited this
 * long. Measured (RUN, 2026-11-26): a page on D6's poor link (1 Mbit/s, 300
 * ms each way, short stalls) never had a message wait more than a few
 * hundred milliseconds in this queue (spec 0119's As built has the numbers),
 * because a seat's whole game is about 90-96 KB on the wire (P11-D4) against
 * the link's 125 KB a second; a message waits here only once the socket's
 * own buffers (Ktor's 8 frames, the kernel's) are full, so a short stall is
 * absorbed before the clock even starts. A page silent for 10 s also gives up
 * on the connection itself in spec 0119's later part. And it is well inside
 * Ktor's ping timeout (45 s), which is what closed a stuck connection before.
 *
 * [messages], 1,000: a backstop for memory, never the usual cut. The most a
 * player's connection was sent in any 10 s of a bot-driven game (RUN, the
 * spike, both seats) was 193 messages; 1,000 is five times that. The queue
 * holds references to messages the hub already made, not copies.
 */
internal data class QueueLimits(
    val waitMillis: Long = 10_000,
    val messages: Int = 1_000,
)

/** What one connection is sent, in order (MatchHub, MatchSocket, Spectating). */
internal sealed interface Outgoing {
    /** A message as the hub sends it: a board through the connection's BoardStream, anything else as [text]. */
    class Message(
        val message: JsonObject,
        val text: Lazy<String> = lazy { message.toString() },
        val memo: DiffMemo = DiffMemo(),
    ) : Outgoing

    /**
     * MATCH_RESYNC's whole board (BoardStream.resend: the connection's memory
     * forgotten, then [stored] whole). Read when it is queued, so every live
     * board queued after it is the same or newer, and every one before it
     * older or the same.
     */
    class Resend(val stored: JsonObject?) : Outgoing

    /** The socket closed with [reason], after everything before it; nothing after it is sent. */
    class Close(val reason: CloseReason) : Outgoing
}

/** How one connection's queue went, for the line logged as it closes. */
internal data class QueueSummary(
    /** The most messages that were waiting at once. */
    val most: Int,
    /** The longest one message waited before it was on its way, in ms. */
    val longestMillis: Long,
    val behind: Boolean,
)

/**
 * One connection's queue. [offer] puts an item at the back and returns at
 * once; one coroutine ([start]) hands each item to [write] in order, the next
 * only when [write] returns. [write] answers false when nothing more may be
 * sent (a close); a failure ends the emptying too (the socket is gone).
 *
 * When an offer finds the connection behind ([QueueLimits]), nothing more is
 * queued or written, and `behind(waiting, oldestMillis)` is called once, on
 * the offering thread, for the owner to close the connection.
 */
internal class SendQueue<T : Any>(
    private val limits: QueueLimits = QueueLimits(),
    private val clock: () -> Long = System::currentTimeMillis,
    private val write: suspend (T) -> Boolean,
) {
    private class Queued<T>(
        val item: T,
        val at: Long,
    )

    /** Guarded by itself; the head is the item being written, removed once written. */
    private val pending = ArrayDeque<Queued<T>>()
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private var behindNow = false
    private var most = 0
    private var longest = 0L
    private var job: Job? = null

    @Volatile
    private var behind: (Int, Long) -> Unit = { _, _ -> }

    /** True once the connection was found behind: nothing more goes on it. */
    val isBehind: Boolean get() = synchronized(pending) { behindNow }

    /** Messages waiting now, the one being written included. */
    val waiting: Int get() = synchronized(pending) { pending.size }

    /** Start emptying the queue in [scope]; [onBehind] is told if it falls behind. */
    fun start(
        scope: CoroutineScope,
        onBehind: (waiting: Int, oldestMillis: Long) -> Unit = { _, _ -> },
    ) {
        behind = onBehind
        job = scope.launch { drain() }
    }

    /** Stop emptying (the connection is closing); what is still queued is never sent. */
    fun stop() {
        job?.cancel()
        wake.close()
    }

    /** Queue [item] behind everything before it. Never suspends. False: the connection is behind, or stopped. */
    fun offer(item: T): Boolean {
        val now = clock()
        var cut: Pair<Int, Long>? = null
        synchronized(pending) {
            if (behindNow) return false
            val oldest = pending.firstOrNull()?.let { now - it.at } ?: 0L
            if (pending.size >= limits.messages || oldest > limits.waitMillis) {
                behindNow = true
                cut = pending.size to oldest
                pending.clear()
            } else {
                pending.addLast(Queued(item, now))
                most = maxOf(most, pending.size)
            }
        }
        cut?.let { (waiting, oldest) ->
            wake.close()
            behind(waiting, oldest)
            return false
        }
        return wake.trySend(Unit).isSuccess
    }

    fun summary(): QueueSummary = synchronized(pending) { QueueSummary(most, longest, behindNow) }

    private suspend fun drain() {
        while (true) {
            val next = synchronized(pending) { if (behindNow) null else pending.firstOrNull() }
            if (next == null) {
                if (isBehind || wake.receiveCatching().isClosed) return
                continue
            }
            // runCatching: a socket that is gone ends this connection's sending, never the session.
            val more = runCatching { write(next.item) }.getOrDefault(false)
            synchronized(pending) {
                if (behindNow) return
                pending.removeFirst()
                longest = maxOf(longest, clock() - next.at)
            }
            if (!more) return
        }
    }

    companion object {
        /**
         * Where a queue made without a socket's own scope is emptied (the hub's
         * tests): Unconfined, so it is written straight away on the offering
         * thread while the channel takes it, as before the queue.
         */
        val DIRECT: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    }
}
