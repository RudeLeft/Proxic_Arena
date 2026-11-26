package net.barnflix.proxic.match

import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertTimeoutPreemptively
import java.time.Duration
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicLong
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * P11-D6 (spec 0119, F-0119-B's server half) -- each connection its own
 * queue: order kept, nobody waits on one socket, a connection far behind is
 * cut off, and what a cut-off connection never sent moved none of its memory.
 */
class SendQueueTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @AfterTest
    fun stop() = scope.cancel()

    private fun json(text: String) = Json.parseToJsonElement(text) as JsonObject

    private fun board(
        rev: Int,
        turn: Int = 1,
    ): JsonObject {
        // Ten unchanging cards, so a delta (the life) is far shorter than the board.
        val cards = (1..10).joinToString(",") { """{"id":"c$it","name":"Grizzly Bears","zone":"battlefield"}""" }
        return json("""{"gameEpoch":1,"stateRevision":$rev,"turn":$turn,"life":{"1":${20 - rev}},"cards":[$cards]}""")
    }

    /** Order: every item reaches the socket once, in the order it was queued, from several threads at once. */
    @Test
    fun `items leave in the order they were queued`() {
        val written = CopyOnWriteArrayList<Int>()
        val queue =
            SendQueue<Int> { item ->
                written += item
                delay(if (item % 50 == 0) 5 else 0)
                true
            }
        queue.start(scope)
        val accepted = (1..500).map { queue.offer(it) }
        assertTrue(accepted.all { it })
        runBlocking { withTimeout(10_000) { while (written.size < 500) delay(5) } }
        assertEquals((1..500).toList(), written.toList())
        assertFalse(queue.summary().behind)
    }

    /** The cut: the oldest message unsent for more than the wait limit; told once; nothing queued after. */
    @Test
    fun `a connection whose oldest message waited past the limit is cut off, once`() {
        val now = AtomicLong(1_000_000)
        val never = CompletableDeferred<Unit>()
        val told = CopyOnWriteArrayList<Pair<Int, Long>>()
        val queue =
            SendQueue<Int>(QueueLimits(waitMillis = 10_000), clock = { now.get() }) {
                never.await()
                true
            }
        queue.start(scope) { waiting, oldest -> told += waiting to oldest }
        assertTrue(queue.offer(1))
        now.addAndGet(6_000)
        assertTrue(queue.offer(2))
        now.addAndGet(4_000)
        // 10 s exactly: not past it.
        assertTrue(queue.offer(3), "a message 10 s old is not yet behind")
        now.addAndGet(1)
        assertFalse(queue.offer(4), "past 10 s the connection is behind")
        assertFalse(queue.offer(5), "and nothing more is queued")
        assertEquals(listOf(3 to 10_001L), told.toList(), "told once, with how many waited and for how long")
        assertTrue(queue.isBehind)
        assertEquals(0, queue.waiting, "what waited is dropped with the connection")
    }

    /** The backstop: 1,000 messages waiting at once. */
    @Test
    fun `a connection with a thousand messages waiting is cut off`() {
        val never = CompletableDeferred<Unit>()
        var cut = 0
        val queue =
            SendQueue<Int>(clock = { 0L }) {
                never.await()
                true
            }
        queue.start(scope) { _, _ -> cut++ }
        val accepted = (1..1_001).count { queue.offer(it) }
        assertEquals(1_000, accepted)
        assertEquals(1, cut)
    }

    /** A slow but healthy socket: everything it is sent gets there, and it is never cut off. */
    @Test
    fun `a slow socket that keeps reading is never cut off`() {
        val written = CopyOnWriteArrayList<Int>()
        // About 0.2 ms a message (a spin: Windows' timers are 15 ms coarse), bursts of 40 every 100 ms.
        val queue =
            SendQueue<Int> { item ->
                val until = System.nanoTime() + 200_000
                while (System.nanoTime() < until) kotlinx.coroutines.yield()
                written += item
                true
            }
        queue.start(scope)
        runBlocking {
            repeat(10) { burst ->
                repeat(40) { assertTrue(queue.offer(burst * 40 + it)) }
                delay(100)
            }
            withTimeout(10_000) { while (written.size < 400) delay(5) }
        }
        assertEquals((0 until 400).toList(), written.toList())
        val summary = queue.summary()
        assertFalse(summary.behind)
        assertTrue(summary.most in 1..40, "a burst waited, and only a burst: ${summary.most}")
    }

    /** A close ends the sending: nothing after it leaves. */
    @Test
    fun `nothing leaves after a write that ends the connection`() {
        val written = CopyOnWriteArrayList<Int>()
        val queue =
            SendQueue<Int> { item ->
                written += item
                item != 2
            }
        queue.start(scope)
        (1..4).forEach { queue.offer(it) }
        runBlocking { delay(200) }
        assertEquals(listOf(1, 2), written.toList())
    }

    /**
     * F-0119-B: THE OTHER PLAYER NEVER WAITS. Alice's socket takes nothing
     * (a channel nobody reads: Ktor's `outgoing` behind a page that stopped
     * reading), Bob's takes everything, and a spectator's takes nothing. The
     * pump (MatchDecisions.handle, as MatchWorker's pump thread calls it) says
     * 300 things: it never waits, and Bob gets all 300, in order. Before the
     * queue, the first message to Alice's full socket blocked the pump.
     */
    @Test
    fun `one socket that stops reading holds up neither the pump nor the other player`() {
        val hub = MatchHub()
        val match = match()
        val live = LiveMatch(match, worker = NO_WORKER) { _, _, _, _ -> true }
        val stuck = Channel<Frame>(0)
        val stuckWatcher = Channel<Frame>(0)
        val bob = Channel<Frame>(Channel.UNLIMITED)
        hub.watchers.open(match.matchId, ALICE, "a", stuck, scope = scope)
        hub.watchers.open(match.matchId, BOB, "b", bob, scope = scope)
        hub.spectators.open(match.matchId, UUID.randomUUID(), "w", stuckWatcher, scope = scope)
        val decisions = MatchDecisions(hub)
        val slowest = AtomicLong()
        assertTimeoutPreemptively(Duration.ofSeconds(10)) {
            repeat(300) { n ->
                val start = System.nanoTime()
                decisions.handle(live, WorkerEvent.Step(json("""{"turn":1,"phase":"P$n","activeSeat":1}""")))
                slowest.accumulateAndGet(System.nanoTime() - start, ::maxOf)
            }
        }
        val slowestMs = slowest.get() / 1_000_000
        assertTrue(slowestMs < 50, "the pump never waits on a socket: slowest $slowestMs ms")
        val phases =
            runBlocking {
                withTimeout(10_000) {
                    (0 until 300).map {
                        val message = json((bob.receive() as Frame.Text).readText())
                        (message["state"] as JsonObject)["phase"]!!.jsonPrimitive.content
                    }
                }
            }
        assertEquals((0 until 300).map { "P$it" }, phases, "Bob got every step, in order")
    }

    /**
     * Exact memory (P11-D3/D4): a board is stepped through the connection's
     * BoardStream only as it leaves. Alice's socket takes one frame and then
     * nothing; boards 2..5 are queued; she is cut off. Her stream moved for
     * the board sent and the one being written, never for the boards still
     * queued, and a new connection of hers (her page's reconnect) starts
     * whole, from no base.
     */
    @Test
    fun `boards a cut-off connection never sent moved none of its memory`() {
        val now = AtomicLong(0)
        val socket = Channel<Frame>(1)
        val connection = Connection("a", socket, deltas = true, clock = { now.get() })
        var cut = false
        connection.queue.start(scope) { _, _ -> cut = true }
        (1..5).forEach { rev -> assertTrue(connection.offer(Outgoing.Message(snapshotMessage(board(rev))))) }
        runBlocking { delay(300) }
        now.addAndGet(10_001)
        assertFalse(connection.offer(Outgoing.Message(snapshotMessage(board(6)))))
        assertTrue(cut)
        // The page reads again: board 2 (being written) gets through; nothing queued after the cut does.
        val first = runBlocking { (socket.receive() as Frame.Text).readText() }
        assertEquals("MATCH_SNAPSHOT", json(first)["type"]!!.jsonPrimitive.content)
        runBlocking { delay(300) }
        val steps = connection.board.counts.values.sum()
        assertEquals(2, steps, "board 1 sent, board 2 being written; 3-5 never moved the stream")
        assertEquals("1/2", connection.board.sent(), "the base is the board being written, not a queued one")
        // The page's reconnect: a new connection, no base, so its first board is whole.
        val again = BoardStream(deltas = true)
        assertEquals("first", again.step(board(6), DiffMemo()).reason)
    }

    /** The resync's board is the one read when it was queued, sent whole, after what was queued before it. */
    @Test
    fun `a resync goes whole, in its place in the queue`() {
        val socket = Channel<Frame>(Channel.UNLIMITED)
        val connection = Connection("a", socket, deltas = true)
        connection.queue.start(SendQueue.DIRECT)
        connection.offer(Outgoing.Message(snapshotMessage(board(1))))
        connection.offer(Outgoing.Message(snapshotMessage(board(2))))
        connection.offer(Outgoing.Resend(board(2)))
        connection.offer(Outgoing.Message(snapshotMessage(board(3))))
        val types = (1..4).map { json((socket.tryReceive().getOrThrow() as Frame.Text).readText())["type"] }
        assertEquals(
            listOf("MATCH_SNAPSHOT", "MATCH_DELTA", "MATCH_SNAPSHOT", "MATCH_DELTA").map(::JsonPrimitive),
            types,
        )
        assertNull(socket.tryReceive().getOrNull())
    }

    private fun match() =
        Match(
            matchId = UUID.randomUUID(),
            setupId = UUID.randomUUID(),
            roomId = UUID.randomUUID(),
            status = MatchStatus.RUNNING,
            presetId = "OPEN_FORMAT_1V1",
            participants =
                listOf(
                    MatchParticipant(ALICE, 1, UUID.randomUUID(), "Mono Red", "Alice"),
                    MatchParticipant(BOB, 2, UUID.randomUUID(), "Mono Blue", "Bob"),
                ),
        )

    private companion object {
        val ALICE: UUID = UUID.randomUUID()
        val BOB: UUID = UUID.randomUUID()

        /** Never started, never spoken to (as MatchDecisionsTest's). */
        val NO_WORKER =
            MatchWorker(
                net.barnflix.proxic.ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = null,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-send-queue",
                ),
                UUID.randomUUID(),
            )
    }
}
