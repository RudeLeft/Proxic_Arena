package net.barnflix.proxic.match

import io.ktor.websocket.readText
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Spec 0120 -- the hard pause on the server: who is connected (F-0120-A),
 * the refusal and its race (F-0120-B), the resume rule (F-0120-C), the away
 * clock and the budget, and what the pages and the worker are told.
 */
class SeatLinksTest {
    private var now = 1_000_000L
    private val away = 10 * 60_000L

    private fun links() = SeatLinks({ away }) { now }

    private fun SeatLinks.resumeAt(): Long {
        var t = 0L
        while (tick().isEmpty()) {
            now += 100
            t += 100
            check(t < 60_000) { "never resumed" }
        }
        return t
    }

    // ---- F-0120-A: connected, dropped, two tabs, the budget, the away clock

    @Test
    fun `a clean close drops at once and pauses, a seat that never connected never drops`() {
        val links = links()
        assertFalse(links.paused)
        links.opened(1, "a")
        assertEquals(emptyList(), links.closed(2, "never"), "seat 2 never connected")
        val events = links.closed(1, "a")
        assertTrue(links.paused)
        assertEquals(listOf<LinkEvent>(LinkEvent.Dropped(1, now, now + away)), events)
        assertEquals(now + away, links.awayAt(1))
        assertNull(links.awayAt(2))
    }

    @Test
    fun `two tabs - one closing keeps the seat, the last one drops it`() {
        val links = links()
        links.opened(1, "a")
        links.opened(1, "b")
        assertEquals(emptyList(), links.closed(1, "a"))
        assertFalse(links.paused)
        assertTrue(links.closed(1, "b").single() is LinkEvent.Dropped)
        assertTrue(links.paused)
    }

    @Test
    fun `paused time adds up across drops, and once it reaches the away setting the window opens at once`() {
        val links = links()
        links.opened(2, "a")
        // Bob's drops: 4, 3, 2.5 minutes, each resumed (canvas "Q6", option B).
        for ((i, minutes) in listOf(4.0, 3.0, 2.5).withIndex()) {
            links.closed(2, "c$i")
            links.closed(2, if (i == 0) "a" else "r${i - 1}")
            val dropped = now
            assertEquals(dropped + away - (links.usedMs(2)), links.awayAt(2), "drop ${i + 1}: away at")
            now += (minutes * 60_000).toLong() - 2_000
            links.opened(2, "r$i")
            links.caughtUp(2, "r$i")
            now += 2_000
            links.resumeAt()
        }
        assertEquals((9.5 * 60_000).toLong(), links.usedMs(2), "9.5 minutes paused so far")
        // The fourth drop: half a minute left in the budget.
        links.closed(2, "r2")
        val since = now
        assertEquals(since + 30_000, links.awayAt(2), "the budget: the window 30 s into the 4th drop")
        now += 30_000
        assertEquals(10 * 60_000L, links.usedMs(2))
    }

    @Test
    fun `the away window opens ten minutes after the drop, counted from the game connection`() {
        val links = links()
        val live = liveMatch(links)
        links.opened(2, "a")
        links.closed(2, "a")
        now += away - 1
        assertEquals("NOT_AWAY", live.endForAway(ALICE, now))
        now += 1
        val conceded = mutableListOf<Int>()
        assertNull(
            live.endForAway(ALICE, now) {
                conceded += it
                true
            },
        )
        assertEquals(listOf(2), conceded)
    }

    // ---- F-0120-C: the resume rule

    @Test
    fun `the game goes on 2 s after the returning page caught up, not before`() {
        val links = links()
        links.opened(2, "a")
        links.closed(2, "a")
        now += 40_000
        assertTrue(links.opened(2, "b").single() is LinkEvent.Returning)
        now += 700
        links.caughtUp(2, "b")
        now += 1_999
        assertEquals(emptyList(), links.tick(), "1.999 s after catching up")
        now += 1
        assertEquals(listOf<LinkEvent>(LinkEvent.Resumed(setOf(2))), links.tick())
        assertFalse(links.paused)
    }

    @Test
    fun `a page that never says it caught up resumes at the 8 s cap`() {
        val links = links()
        links.opened(2, "a")
        links.closed(2, "a")
        links.opened(2, "b")
        assertEquals(SeatLinks.RESUME_CAP_MS, links.resumeAt())
    }

    @Test
    fun `a page caught up at once still holds 2 s from its connection`() {
        val links = links()
        links.opened(2, "a")
        links.closed(2, "a")
        links.opened(2, "b")
        links.caughtUp(2, "b")
        assertEquals(SeatLinks.STEADY_MS, links.resumeAt())
    }

    @Test
    fun `both seats dropped - the game goes on only when both are back`() {
        val links = links()
        links.opened(1, "a")
        links.opened(2, "b")
        links.closed(1, "a")
        links.closed(2, "b")
        links.opened(1, "a2")
        links.caughtUp(1, "a2")
        now += 10_000
        assertEquals(emptyList(), links.tick(), "Bob still away")
        links.opened(2, "b2")
        links.caughtUp(2, "b2")
        now += 2_000
        assertEquals(listOf<LinkEvent>(LinkEvent.Resumed(setOf(1, 2))), links.tick())
    }

    @Test
    fun `a flap restarts the 2 s and keeps the first drop's time`() {
        val links = links()
        links.opened(2, "a")
        links.closed(2, "a")
        val first = now
        now += 5_000
        links.opened(2, "b")
        links.caughtUp(2, "b")
        now += 1_500
        val again = links.closed(2, "b").single() as LinkEvent.Dropped
        assertEquals(first, again.since, "the same pause")
        now += 500
        links.opened(2, "c")
        links.caughtUp(2, "c")
        now += 1_999
        assertEquals(emptyList(), links.tick())
        now += 1
        assertTrue(links.tick().isNotEmpty())
    }

    // ---- F-0120-B: the refusal, first, and the race

    @Test
    fun `while paused every answer is refused with PAUSED, before anything else`() {
        val sent = mutableListOf<Long>()
        val live = liveMatch(sender = { id -> sent += id })
        live.links.opened(2, "b")
        live.nowAsking(question(7))
        live.links.closed(2, "b")
        assertEquals(DecisionRefusal.PAUSED, live.answer(ALICE, 7, "action:0"))
        assertEquals(DecisionRefusal.PAUSED, live.answer(ALICE, 99, null), "even a stale one: PAUSED first")
        assertEquals(DecisionRefusal.PAUSED, live.answer(STRANGER, 7, null))
        assertEquals(emptyList(), sent)
        // And the question stays answerable once the game goes on (the claim was never taken).
        live.links.opened(2, "b2")
        live.links.caughtUp(2, "b2")
        now += 2_000
        live.links.tick()
        assertNull(live.answer(ALICE, 7, "action:0"))
        assertEquals(listOf(7L), sent)
    }

    @Test
    fun `an answer racing the drop is forwarded once or refused, never lost and never twice`() {
        repeat(1_000) { round ->
            val forwarded = AtomicInteger()
            val live = liveMatch(sender = { forwarded.incrementAndGet() })
            live.links.opened(2, "b")
            live.nowAsking(question(round.toLong()))
            val go = CountDownLatch(1)
            var refusal: DecisionRefusal? = null
            val answering =
                Thread {
                    go.await()
                    refusal = live.answer(ALICE, round.toLong(), "action:0")
                }
            answering.start()
            go.countDown()
            live.links.closed(2, "b")
            answering.join()
            when (refusal) {
                null -> assertEquals(1, forwarded.get(), "round $round: accepted means forwarded once")
                DecisionRefusal.PAUSED -> assertEquals(0, forwarded.get(), "round $round: refused means not sent")
                else -> error("round $round: $refusal")
            }
            // A second try while paused is refused; the claim is never taken twice.
            assertEquals(DecisionRefusal.PAUSED, live.answer(ALICE, round.toLong(), "action:0"))
            assertTrue(forwarded.get() <= 1)
        }
    }

    // ---- What the pages and the worker are told (MatchPauses)

    @Test
    fun `the pages are told MATCH_PAUSED, back, and MATCH_RESUMED, the worker HOLD once and GO once`() {
        val held = mutableListOf<Boolean>()
        val hold = { on: Boolean ->
            held += on
            true
        }
        val live = liveMatch()
        val page = Page()
        val pauses = MatchPauses({ listOf(page.connection) }, { now }, ticker = null, gone = { false })
        pauses.opened(live, 1, "a", hold)
        pauses.opened(live, 2, "b", hold)
        pauses.closed(live, 2, "b", hold)
        assertEquals(listOf(true), held, "HOLD")
        val paused = page.last("MATCH_PAUSED")
        assertEquals(2L, paused["seat"]!!.jsonPrimitive.long)
        assertEquals(now, paused["since"]!!.jsonPrimitive.long)
        assertEquals(now + away, paused["awayAt"]!!.jsonPrimitive.long)
        assertNull(paused["back"])
        assertNull(paused["endNow"])
        // A page that opens meanwhile is told the pause first.
        assertEquals("MATCH_PAUSED", pauses.greeting(live).single()["type"]!!.jsonPrimitive.content)
        now += 3_000
        pauses.opened(live, 2, "c", hold)
        assertEquals("true", page.last("MATCH_PAUSED")["back"]!!.jsonPrimitive.content)
        live.links.caughtUp(2, "c")
        now += 1_000
        pauses.look()
        assertEquals(listOf(true), held, "not yet: 1 s after catching up")
        now += 1_000
        pauses.look()
        assertEquals(listOf(true, false), held, "GO once")
        pauses.look()
        assertEquals(listOf(true, false), held, "and only once")
        assertEquals(2L, page.last("MATCH_RESUMED")["seat"]!!.jsonPrimitive.long)
        assertTrue(pauses.greeting(live).isEmpty())
        // Nothing in them but a seat and times (HID-001).
        val allowed = setOf("protocolVersion", "type", "messageId", "seat", "since", "awayAt", "now", "back", "endNow")
        page.told.forEach { m -> assertTrue(m.keys.all { it in allowed }, "$m") }
    }

    // ---- CI run 46054823866: a pause while the match is still being launched

    @Test
    fun `a match paused while its worker has not started yet is not forgotten, and goes on`() {
        val told = mutableListOf<Boolean>()
        // The worker of a match being launched: no process yet (never started).
        val live = liveMatch()
        assertFalse(live.worker.isAlive())
        val page = Page()
        // The real rule for a finished match (the default `gone`).
        val pauses = MatchPauses({ listOf(page.connection) }, { now }, ticker = null)
        val hold = { on: Boolean -> told.add(on) }
        pauses.opened(live, 2, "b", hold)
        pauses.closed(live, 2, "b", hold)
        pauses.look()
        now += 1_000
        pauses.opened(live, 2, "b2", hold)
        live.links.caughtUp(2, "b2")
        now += 2_000
        pauses.look()
        assertFalse(live.links.paused, "the game goes on: answers are taken again")
        assertEquals(2L, page.last("MATCH_RESUMED")["seat"]!!.jsonPrimitive.long)
    }

    @Test
    fun `a HOLD the worker cannot take yet is told again until it does`() {
        val tries = mutableListOf<Boolean>()
        var ready = false
        val hold = { on: Boolean ->
            tries += on
            ready
        }
        val live = liveMatch()
        val pauses = MatchPauses({ emptyList() }, { now }, ticker = null, gone = { false })
        pauses.opened(live, 2, "b", hold)
        pauses.closed(live, 2, "b", hold)
        pauses.look()
        assertEquals(listOf(true, true), tries, "not taken: asked again")
        ready = true
        pauses.look()
        pauses.look()
        assertEquals(listOf(true, true, true), tries, "taken: not again")
    }

    @Test
    fun `a seat's other connection the hub still has keeps it, even one opened before the match was live`() {
        val links = links()
        links.opened(2, "registered")
        // "early" was opened while the match was launching: never counted here.
        assertEquals(emptyList(), links.closed(2, "registered", stillOpen = listOf("early")))
        assertFalse(links.paused)
        assertTrue(links.closed(2, "early").single() is LinkEvent.Dropped)
    }

    /** One page's connection, reading what it is sent. */
    private class Page {
        private val channel =
            kotlinx.coroutines.channels.Channel<io.ktor.websocket.Frame>(
                kotlinx.coroutines.channels.Channel.UNLIMITED,
            )
        val connection = Connection("page", channel).also { it.queue.start(SendQueue.DIRECT) }
        val told = mutableListOf<JsonObject>()

        fun last(type: String): JsonObject {
            while (true) {
                val frame = channel.tryReceive().getOrNull() ?: break
                val text = (frame as io.ktor.websocket.Frame.Text).readText()
                told += kotlinx.serialization.json.Json.parseToJsonElement(text) as JsonObject
            }
            return told.last { it["type"]!!.jsonPrimitive.content == type }
        }
    }

    @Test
    fun `with the budget spent the next drop's message says endNow`() {
        val links = links()
        links.opened(2, "a")
        links.closed(2, "a")
        now += away
        links.opened(2, "b")
        links.caughtUp(2, "b")
        now += 2_000
        links.tick()
        val drop = links.closed(2, "b").single() as LinkEvent.Dropped
        val message = pausedMessage(drop.seat, drop.since, drop.awayAt, false, now)
        assertEquals("true", message["endNow"]!!.jsonPrimitive.content)
    }

    private fun liveMatch(
        links: SeatLinks? = null,
        sender: (Long) -> Unit = {},
    ): LiveMatch {
        // The match's own links run on this test's clock.
        return LiveMatch(MATCH, worker = NO_WORKER, links = links ?: links()) { decisionId, _, _, _ ->
            sender(decisionId)
            true
        }
    }

    private fun question(id: Long) =
        DecisionRequest(
            decisionId = id,
            actedForSeat = 1,
            authorisedSeat = 1,
            kind = "chooseSpellAbilityToPlay",
            stateVersion = 1,
            options = listOf(DecisionOption("action:0", "Mountain")),
        )

    private companion object {
        val ALICE: UUID = UUID.randomUUID()
        val BOB: UUID = UUID.randomUUID()
        val STRANGER: UUID = UUID.randomUUID()
        val MATCH =
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
        val NO_WORKER =
            MatchWorker(
                net.barnflix.proxic.ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = null,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-seat-links",
                ),
                UUID.randomUUID(),
            )
    }
}
