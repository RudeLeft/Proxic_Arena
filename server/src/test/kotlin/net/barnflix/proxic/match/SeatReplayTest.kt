package net.barnflix.proxic.match

import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * P11-D6 (spec 0119; F-0119-A, F-0119-C) -- the boards each seat keeps for a
 * page that comes back, every resume path, the first catch-up board whole,
 * a seat never given another's list, MATCH_BEAT on a quiet line only, and
 * CAUGHT_UP read and nothing else.
 */
class SeatReplayTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @AfterTest
    fun stop() = scope.cancel()

    private fun json(text: String) = Json.parseToJsonElement(text) as JsonObject

    /** One seat's board: [seat] written into it, so whose list a message came from shows. */
    private fun board(
        rev: Long,
        seat: Int = 1,
        epoch: Long = 1,
        turn: Int = 1,
    ): JsonObject {
        val cards = (1..10).joinToString(",") { """{"id":"card:$it","name":"Grizzly Bears","zone":"battlefield"}""" }
        return json(
            """{"gameEpoch":$epoch,"stateRevision":$rev,"turn":$turn,"seat":$seat,""" +
                """"life":{"1":${20 - rev}},"cards":[$cards]}""",
        )
    }

    private fun seatIn(message: JsonObject) = ((message["state"] as JsonObject)["seat"] as JsonPrimitive).content

    private fun step(phase: String) = stepMessage(json("""{"turn":1,"phase":"$phase"}"""), 5)

    private fun kept(
        replay: SeatReplay,
        seat: Int,
        vararg revs: Long,
    ) = revs.map { rev -> snapshotMessage(board(rev, seat), 1_000 + rev).also { replay.keep(seat, it) } }

    // --- F-0119-A: what is kept ------------------------------------------------------------

    @Test
    fun `forty boards per seat are kept, with the steps between them, the oldest going first`() {
        val replay = SeatReplay()
        (1L..45L).forEach { rev ->
            replay.keep(1, snapshotMessage(board(rev)))
            replay.keep(1, step("UPKEEP"))
        }
        // 40 boards and the 40 steps after each.
        assertEquals(80, replay.size(1))
        // The 5th board is gone: a resume from it is today's whole board.
        assertEquals(Resume.Whole, replay.resume(1, ResumePoint(1, 5)))
        val from6 = assertIs<Resume.Catchup>(replay.resume(1, ResumePoint(1, 6)))
        // After board 6: its step, then boards 7..45 and their steps.
        assertEquals(1 + 39 * 2, from6.after.size)
        assertEquals("MATCH_STEP", from6.after.first()["type"]!!.jsonPrimitive.content)
        assertEquals(0, replay.size(2))
    }

    @Test
    fun `kept across Karn's restart, each board with its own game`() {
        val replay = SeatReplay()
        replay.keep(1, snapshotMessage(board(30, epoch = 1)))
        replay.keep(1, snapshotMessage(board(31, epoch = 1)))
        replay.keep(1, snapshotMessage(board(1, epoch = 2)))
        replay.keep(1, snapshotMessage(board(2, epoch = 2)))
        val back = assertIs<Resume.Catchup>(replay.resume(1, ResumePoint(1, 31)))
        assertEquals(
            listOf(2L to 1L, 2L to 2L),
            back.after.map {
                val s = it["state"] as JsonObject
                s["gameEpoch"]!!.jsonPrimitive.long to s["stateRevision"]!!.jsonPrimitive.long
            },
        )
        // Game 2's revision 1 is not game 1's.
        assertEquals(Resume.Whole, replay.resume(1, ResumePoint(1, 1)))
    }

    // --- F-0119-A: each resume path ---------------------------------------------------------

    @Test
    fun `each resume path, from the seat's own list only`() {
        val replay = SeatReplay()
        val sent = kept(replay, 1, 10, 11, 12)
        kept(replay, 2, 10, 11, 12, 13)
        // In the kept boards: the ones after it, AS SENT (the same messages: id and time kept).
        val back = assertIs<Resume.Catchup>(replay.resume(1, ResumePoint(1, 10)))
        assertEquals(sent.drop(1), back.after)
        assertEquals(ResumePoint(1, 10), back.from)
        // The newest: nothing to send.
        assertEquals(Resume.Newest, replay.resume(1, ResumePoint(1, 12)))
        // Too old, another game, a number never sent to THIS seat (13 is seat 2's only), none.
        assertEquals(Resume.Whole, replay.resume(1, ResumePoint(1, 9)))
        assertEquals(Resume.Whole, replay.resume(1, ResumePoint(2, 11)))
        assertEquals(Resume.Whole, replay.resume(1, ResumePoint(1, 13)))
        assertEquals(Resume.Whole, replay.resume(1, null))
        assertEquals(Resume.Whole, replay.resume(3, ResumePoint(1, 10)))
        // A seat is never given another's list: every message is seat 1's own.
        assertTrue(back.after.all { ((it["state"] as JsonObject)["seat"] as JsonPrimitive).content == "1" })
    }

    @Test
    fun `the public view's list is the spectators', apart from every seat's`() {
        val replay = SeatReplay()
        kept(replay, 1, 10, 11)
        kept(replay, PUBLIC_SEAT, 10, 11)
        val public = assertIs<Resume.Catchup>(replay.resume(PUBLIC_SEAT, ResumePoint(1, 10)))
        assertEquals(listOf("0"), public.after.map { ((it["state"] as JsonObject)["seat"] as JsonPrimitive).content })
    }

    @Test
    fun `a player resumes from their own seat's list, a spectator from the public view's, never another's`() {
        val alice = UUID.randomUUID()
        val live = LiveMatch(match(alice, UUID.randomUUID()), worker = NO_WORKER) { _, _, _, _ -> true }
        kept(live.replay, 1, 10, 11)
        kept(live.replay, 2, 10, 11, 12)
        kept(live.replay, PUBLIC_SEAT, 10, 11, 12)
        val seatOf = {
                r: Resume ->
            assertIs<Resume.Catchup>(r).after.map { seatIn(it) }.toSet()
        }
        assertEquals(setOf("1"), seatOf(playerResume(live, 1, ResumePoint(1, 10))))
        assertEquals(setOf("0"), seatOf(spectatorResume(live, ResumePoint(1, 10))))
        // Revision 12 was sent to seat 2 and the public view, never to seat 1.
        assertEquals(Resume.Whole, playerResume(live, 1, ResumePoint(1, 12)))
        assertEquals(Resume.Whole, playerResume(null, 1, ResumePoint(1, 10)))
        assertEquals(Resume.Whole, spectatorResume(live, null))
    }

    @Test
    fun `the resume point is two whole numbers or nothing`() {
        assertEquals(ResumePoint(2, 140), ResumePoint.parse("2.140"))
        val bad = listOf(null, "", "2", "2.", ".3", "2.3.4", "-1.3", "a.b", "1 .2")
        (bad + listOf("9".repeat(50) + ".1", "99999999999999999999.1"))
            .forEach { assertNull(ResumePoint.parse(it), "\"$it\"") }
    }

    // --- F-0119-A: the first catch-up board whole --------------------------------------------

    private fun frames(socket: Channel<Frame>): List<JsonObject> =
        generateSequence { socket.tryReceive().getOrNull() }.map { json((it as Frame.Text).readText()) }.toList()

    @Test
    fun `a catch-up is MATCH_CATCHUP, the boards after the page's, the first whole, each its own time`() {
        val replay = SeatReplay()
        kept(replay, 1, 10, 11, 12)
        replay.keep(1, step("COMBAT"))
        kept(replay, 1, 13)
        val socket = Channel<Frame>(Channel.UNLIMITED)
        val connection = Connection("a", socket, deltas = true)
        connection.queue.start(SendQueue.DIRECT)
        val count = firstBoards(connection, replay.resume(1, ResumePoint(1, 10))) { error("not the whole board") }
        assertEquals(4, count)
        val out = frames(socket)
        assertEquals(
            listOf("MATCH_CATCHUP", "MATCH_SNAPSHOT", "MATCH_DELTA", "MATCH_STEP", "MATCH_DELTA"),
            out.map { it["type"]!!.jsonPrimitive.content },
        )
        assertEquals(4, out[0]["count"]!!.jsonPrimitive.long.toInt())
        assertEquals(10L, (out[0]["from"] as JsonObject)["stateRevision"]!!.jsonPrimitive.long)
        // Each board's first-sent time, kept (a delta carries it too).
        assertEquals(
            listOf(1_011L, 1_012L, 1_013L),
            listOf(out[1], out[2], out[4]).map { it["sentAt"]!!.jsonPrimitive.long },
        )
    }

    @Test
    fun `the newest needs no board, anything else is today's whole board`() {
        val replay = SeatReplay()
        kept(replay, 1, 10, 11)
        val socket = Channel<Frame>(Channel.UNLIMITED)
        val connection = Connection("a", socket, deltas = true)
        connection.queue.start(SendQueue.DIRECT)
        assertEquals(0, firstBoards(connection, replay.resume(1, ResumePoint(1, 11))) { error("no board") })
        assertTrue(frames(socket).isEmpty())
        assertEquals(-1, firstBoards(connection, replay.resume(1, ResumePoint(1, 3))) { board(11) })
        assertEquals(listOf("MATCH_SNAPSHOT"), frames(socket).map { it["type"]!!.jsonPrimitive.content })
    }

    // --- the pump keeps what it sends ---------------------------------------------------------

    @Test
    fun `the pump stamps each board and step once and keeps it for its seat, the public view's for spectators`() {
        val alice = UUID.randomUUID()
        val bob = UUID.randomUUID()
        val delivered = mutableListOf<Pair<UUID, JsonObject>>()
        val spectated = mutableListOf<JsonObject>()
        val announcer =
            object : DecisionAnnouncer {
                override suspend fun ask(
                    matchId: UUID,
                    userId: UUID,
                    request: DecisionRequest,
                ) = Unit

                override suspend fun snapshot(
                    matchId: UUID,
                    userId: UUID,
                    state: JsonObject,
                ) = error("the made message is delivered")

                override suspend fun cleared(
                    matchId: UUID,
                    userId: UUID,
                ) = Unit

                override suspend fun refused(
                    matchId: UUID,
                    userId: UUID,
                    decisionId: Long,
                    reason: DecisionRefusal,
                ) = Unit

                override suspend fun deliver(
                    matchId: UUID,
                    userId: UUID,
                    message: JsonObject,
                ) {
                    delivered += userId to message
                }

                override suspend fun spectate(
                    matchId: UUID,
                    message: JsonObject,
                ) {
                    spectated += message
                }
            }
        val live = LiveMatch(match(alice, bob), worker = NO_WORKER) { _, _, _, _ -> true }
        val decisions = MatchDecisions(announcer) { 77 }
        decisions.handle(live, WorkerEvent.Snapshot(1, board(10, 1)))
        decisions.handle(live, WorkerEvent.Snapshot(2, board(10, 2)))
        decisions.handle(live, WorkerEvent.Snapshot(PUBLIC_SEAT, board(10, 0)))
        decisions.handle(live, WorkerEvent.Step(json("""{"turn":1,"phase":"UPKEEP"}""")))
        decisions.handle(live, WorkerEvent.Snapshot(1, board(11, 1)))
        // Each seat's own: Alice's list has her two boards and her step, the same messages she was sent.
        val alices = assertIs<Resume.Catchup>(live.replay.resume(1, ResumePoint(1, 10))).after
        assertEquals(delivered.filter { it.first == alice }.map { it.second }.drop(1), alices)
        assertEquals(listOf("MATCH_STEP", "MATCH_SNAPSHOT"), alices.map { it["type"]!!.jsonPrimitive.content })
        assertTrue(alices.all { it["sentAt"]!!.jsonPrimitive.long == 77L })
        // Bob's list: his board, then his own step message (not Alice's).
        val bobs = assertIs<Resume.Catchup>(live.replay.resume(2, ResumePoint(1, 10))).after
        assertEquals(listOf(delivered.last { it.first == bob }.second), bobs)
        assertEquals("MATCH_STEP", bobs.single()["type"]!!.jsonPrimitive.content)
        val public = assertIs<Resume.Catchup>(live.replay.resume(PUBLIC_SEAT, ResumePoint(1, 10))).after
        assertEquals(spectated.drop(1), public)
    }

    // --- F-0119-C: the beat; CAUGHT_UP ---------------------------------------------------------

    @Test
    fun `a beat after a quiet spell, never while boards flow, with the board this connection was sent`() {
        val now = AtomicLong(1_000_000)
        val socket = Channel<Frame>(Channel.UNLIMITED)
        val connection = Connection("a", socket, deltas = true, clock = { now.get() })
        connection.queue.start(scope)
        val beating = scope.launch { beats(connection, clock = { now.get() }, quietMs = 2_000, lookMs = 5) }
        connection.offer(Outgoing.Message(snapshotMessage(board(10))))
        // Boards every second: no beat.
        repeat(4) { i ->
            now.addAndGet(1_000)
            connection.offer(Outgoing.Message(snapshotMessage(board(11L + i))))
            runBlocking { delay(30) }
        }
        val flowing = frames(socket)
        assertTrue(flowing.none { it["type"]!!.jsonPrimitive.content == "MATCH_BEAT" }, "$flowing")
        // Then quiet for 2 s: one beat, with the board last sent (14).
        now.addAndGet(2_000)
        val beat =
            runBlocking {
                withTimeout(5_000) {
                    var got: JsonObject? = null
                    while (got == null) {
                        got = frames(socket).firstOrNull { it["type"]!!.jsonPrimitive.content == "MATCH_BEAT" }
                        if (got == null) delay(5)
                    }
                    got
                }
            }
        assertEquals(14L, beat["stateRevision"]!!.jsonPrimitive.long)
        assertEquals(1L, beat["gameEpoch"]!!.jsonPrimitive.long)
        assertEquals(setOf("protocolVersion", "type", "messageId", "gameEpoch", "stateRevision"), beat.keys)
        beating.cancel()
    }

    @Test
    fun `CAUGHT_UP is read by its type and nothing else`() {
        assertTrue(caughtUp("""{"type":"CAUGHT_UP"}"""))
        assertTrue(caughtUp("""{"type":"CAUGHT_UP","seat":2,"decisionId":9}"""))
        assertEquals(false, caughtUp("""{"type":"DECISION_RESPONSE","actionId":"CAUGHT_UP"}"""))
        assertEquals(false, caughtUp("""{"type":"MATCH_RESYNC"}"""))
        assertEquals(false, caughtUp("CAUGHT_UP"))
    }

    private fun match(
        alice: UUID,
        bob: UUID,
    ) = Match(
        matchId = UUID.randomUUID(),
        setupId = UUID.randomUUID(),
        roomId = UUID.randomUUID(),
        status = MatchStatus.RUNNING,
        presetId = "OPEN_FORMAT_1V1",
        participants =
            listOf(
                MatchParticipant(alice, 1, UUID.randomUUID(), "Mono Red", "Alice"),
                MatchParticipant(bob, 2, UUID.randomUUID(), "Mono Blue", "Bob"),
            ),
    )

    private companion object {
        val NO_WORKER =
            MatchWorker(
                net.barnflix.proxic.ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = null,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-seat-replay",
                ),
                UUID.randomUUID(),
            )
    }
}
