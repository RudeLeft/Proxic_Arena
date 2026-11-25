package net.barnflix.proxic.match

import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import java.io.File
import java.util.UUID
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * P11-D4 (spec 0117, F-0117-A, F-0117-B) -- only what changed. A delta made
 * from the board a connection was last sent, applied to that board as the
 * page does, is the new board exactly; whole boards go when the spec says;
 * the shared fixtures are made and applied as the page and the Lab gate make
 * them; every id a delta names is in its base or its new board (P11-R4).
 */
class BoardDeltaTest {
    private val fixtures = File("../protocol/fixtures/delta")

    private fun fixture(name: String): JsonObject {
        val text = File(fixtures, "$name.json").readText()
        return Json.parseToJsonElement(text).jsonObject
    }

    private fun boardsOf(name: String): List<JsonObject> {
        val boards = fixture(name).getValue("boards").jsonArray
        return boards.map { it.jsonObject }
    }

    private val names = listOf("big-combat", "karn-restart", "hand-bounce")

    /** The page's side: the base it holds, the history it holds, and the board it rebuilds. */
    private class Page {
        var base: JsonObject? = null
        var held: Map<String, List<JsonElement>> = emptyMap()
        var revision = Long.MIN_VALUE
        var asked = 0

        fun take(step: BoardStream.Step): JsonObject? {
            val board =
                if (step.type == DELTA_TYPE) {
                    val have = base
                    if (have == null || have["gameEpoch"] != step.body["gameEpoch"] ||
                        have["stateRevision"] != step.body["from"]
                    ) {
                        asked++
                        return null
                    }
                    BoardHistory.rebuild(BoardDelta.apply(have, step.body), held)
                } else {
                    BoardHistory.rebuild(step.body, held)
                }
            val rev = board["stateRevision"]!!.jsonPrimitive.long
            if (rev < revision) return board
            revision = rev
            base = board
            held = HISTORY_KEYS.associateWith { key -> (board[key] as? JsonArray)?.toList().orEmpty() }
            return board
        }
    }

    private fun card(
        id: String,
        tapped: Boolean = false,
    ): JsonObject =
        buildJsonObject {
            put("id", id)
            put("name", "Forest")
            put("tapped", tapped)
        }

    private fun board(
        rev: Int,
        battlefield: List<JsonObject> = (1..20).map { card("card:$it") },
        turn: Int = 3,
        epoch: Int = 1,
        extra: Map<String, JsonElement> = emptyMap(),
    ): JsonObject =
        buildJsonObject {
            put("stateRevision", rev)
            put("gameEpoch", epoch)
            put("turn", turn)
            put("seat", 1)
            put("battlefield", JsonArray(battlefield))
            put(
                "players",
                JsonArray(
                    listOf(1, 2).map {
                        buildJsonObject {
                            put("seat", it)
                            put("life", 20)
                        }
                    },
                ),
            )
            extra.forEach { (key, value) -> put(key, value) }
        }

    /** Every typed id a value names, under any key. */
    private fun ids(value: JsonElement?): Set<String> =
        when (value) {
            is JsonPrimitive -> if (value.isString && TYPED.matches(value.content)) setOf(value.content) else emptySet()
            is JsonArray -> value.flatMap { ids(it) }.toSet()
            is JsonObject -> value.values.flatMap { ids(it) }.toSet()
            else -> emptySet()
        }

    private fun assertRoundTrip(
        base: JsonObject,
        board: JsonObject,
    ) {
        val delta = BoardDelta.diff(base, board)
        val keep = board.filterKeys { it !in HISTORY_KEYS && it != KEPT_KEY }
        assertEquals(JsonObject(keep), BoardDelta.apply(base, delta))
        // P11-R4: a delta may name an id only if its base or its new board names it.
        assertTrue((ids(delta) - ids(base) - ids(board)).isEmpty(), "a delta names only ids its two boards name")
    }

    @Test
    fun `every board of the three fixture traces round-trips from the one before`() {
        for (name in names) {
            val boards = boardsOf(name)
            boards.zipWithNext().forEach { (a, b) -> assertRoundTrip(a, b) }
        }
    }

    @Test
    fun `the shared fixtures -- the same diffs and the same messages as the page and the Lab gate`() {
        for (name in names) {
            val doc = fixture(name)
            val boards = boardsOf(name)
            val diffs = doc.getValue("diffs").jsonArray
            boards.zipWithNext().forEachIndexed { i, (a, b) ->
                assertEquals(diffs[i], BoardDelta.diff(a, b), "$name diff $i")
            }
            val stream = BoardStream(deltas = true)
            val page = Page()
            val sent = doc.getValue("sent").jsonArray
            boards.forEachIndexed { i, board ->
                val step = stream.step(board, DiffMemo())
                val (type, body) = sent[i].jsonArray
                assertEquals(type.jsonPrimitive.content, step.type, "$name sent $i")
                assertEquals(body, step.body, "$name sent $i")
                assertEquals(board, page.take(step), "$name rebuilt $i")
            }
            assertEquals(0, page.asked)
        }
    }

    @Test
    fun `300 random board pairs round-trip exactly (cards added, moved, changed, removed, keys come and go)`() {
        val random = Random(117)
        val pool = names.flatMap { boardsOf(it) }
        repeat(300) { n ->
            val base = pool[random.nextInt(pool.size)]
            val out = base.toMutableMap()
            val field = listOf("battlefield", "hand", "graveyard", "stack", "players").random(random)
            val list = (base[field] as? JsonArray)?.toMutableList() ?: mutableListOf()
            when (random.nextInt(6)) {
                0 -> if (list.isNotEmpty()) list.removeAt(random.nextInt(list.size))
                1 -> if (field != "players") list.add(random.nextInt(list.size + 1), card("card:${9000 + n}"))
                2 -> list.shuffle(random)
                3 ->
                    if (list.isNotEmpty()) {
                        val i = random.nextInt(list.size)
                        val tapped = JsonPrimitive(random.nextBoolean())
                        list[i] = JsonObject((list[i] as JsonObject) + ("tapped" to tapped))
                    }
                4 -> out["extraKey$n"] = JsonPrimitive(n)
                else -> out.remove(base.keys.filter { it !in HISTORY_KEYS }.random(random))
            }
            if (base[field] is JsonArray) out[field] = JsonArray(list)
            out["stateRevision"] = JsonPrimitive(n + 100_000)
            assertRoundTrip(base, JsonObject(out))
        }
    }

    @Test
    fun `an item that only moved is in order, never in drop or put`() {
        val a = board(1)
        val moved = a.getValue("battlefield").jsonArray.let { JsonArray(it.drop(1) + it.first()) }
        val delta = BoardDelta.diff(a, board(2, moved.map { it.jsonObject }))
        val patch = delta.getValue("lists").jsonObject.getValue("battlefield").jsonObject
        assertNull(patch["drop"])
        assertNull(patch["put"])
        assertEquals(20, patch.getValue("order").jsonArray.size)
    }

    @Test
    fun `a changed card goes whole and the rest are named nowhere`() {
        val tapped = (1..20).map { card("card:$it", tapped = it == 7) }
        val delta = BoardDelta.diff(board(1), board(2, tapped))
        assertEquals(
            buildJsonObject {
                put("battlefield", buildJsonObject { put("put", JsonArray(listOf(card("card:7", true)))) })
            },
            delta.getValue("lists"),
        )
        assertEquals(buildJsonObject { put("stateRevision", 2) }, delta.getValue("set"))
    }

    @Test
    fun `a malformed delta does not apply`() {
        val bad = buildJsonObject { put("lists", buildJsonObject { put("nope", buildJsonObject { }) }) }
        assertFailsWith<IllegalArgumentException> { BoardDelta.apply(board(1), bad) }
        val order =
            buildJsonObject {
                put(
                    "lists",
                    buildJsonObject {
                        val wrong = JsonArray(listOf(JsonPrimitive("card:99")))
                        put("battlefield", buildJsonObject { put("order", wrong) })
                    },
                )
            }
        assertFailsWith<IllegalArgumentException> { BoardDelta.apply(board(1), order) }
    }

    // --- When a whole board goes (one test per rule) ---

    @Test
    fun `the first board on a connection is whole, the next a delta`() {
        val stream = BoardStream(deltas = true)
        assertEquals(SNAPSHOT_TYPE, stream.step(board(1), DiffMemo()).type)
        val next = stream.step(board(2, (1..20).map { card("card:$it", it == 3) }), DiffMemo())
        assertEquals(DELTA_TYPE, next.type)
        assertEquals(1L, next.body.getValue("from").jsonPrimitive.long)
        assertEquals(2L, next.body.getValue("to").jsonPrimitive.long)
    }

    @Test
    fun `a new game (Karn's restart) goes whole and forgets the history held`() {
        val stream = BoardStream(deltas = true)
        val pay = JsonArray(listOf(buildJsonObject { put("n", 1) }))
        stream.step(board(1, extra = mapOf("payments" to pay)), DiffMemo())
        val restarted = stream.step(board(2, epoch = 2, extra = mapOf("payments" to pay)), DiffMemo())
        assertEquals(SNAPSHOT_TYPE, restarted.type)
        assertEquals("epoch", restarted.reason)
        assertNull(restarted.body[KEPT_KEY], "its lists come whole")
    }

    @Test
    fun `a new turn is the checkpoint -- whole, its history lists whole too`() {
        val stream = BoardStream(deltas = true)
        val pay = JsonArray(listOf(buildJsonObject { put("n", 1) }))
        stream.step(board(1, extra = mapOf("payments" to pay)), DiffMemo())
        val same = stream.step(board(2, extra = mapOf("payments" to pay)), DiffMemo())
        assertEquals(DELTA_TYPE, same.type)
        assertNotNull(same.body[KEPT_KEY], "within a turn the history is kept")
        val turn = stream.step(board(3, turn = 4, extra = mapOf("payments" to pay)), DiffMemo())
        assertEquals("turn", turn.reason)
        assertEquals(SNAPSHOT_TYPE, turn.type)
        assertNull(turn.body[KEPT_KEY], "the checkpoint relies on nothing the page held")
        assertEquals(pay, turn.body["payments"])
    }

    @Test
    fun `a delta no shorter than the board goes as the board`() {
        val stream = BoardStream(deltas = true)
        stream.step(board(1), DiffMemo())
        val wiped = stream.step(board(2, (100..120).map { card("card:$it") }), DiffMemo())
        assertEquals(SNAPSHOT_TYPE, wiped.type)
        assertEquals("size", wiped.reason)
    }

    @Test
    fun `deltas off (the switch, the page did not ask, spectators while off) -- every board whole, as P11-D3`() {
        val off = BoardStream(deltas = false)
        val d3 = BoardStream()
        for (rev in 1..5) {
            val b = board(rev, (1..20).map { card("card:$it", it == rev) })
            val step = off.step(b, DiffMemo())
            assertEquals(SNAPSHOT_TYPE, step.type)
            assertEquals(d3.next(b), step.body)
        }
    }

    @Test
    fun `an older board goes whole and is left out of the memory`() {
        val stream = BoardStream(deltas = true)
        val page = Page()
        page.take(stream.step(board(5), DiffMemo()))
        val stale = stream.step(board(4), DiffMemo())
        assertEquals(SNAPSHOT_TYPE, stale.type)
        assertEquals("older", stale.reason)
        page.take(stale)
        val next = board(6, (1..20).map { card("card:$it", it == 2) })
        val step = stream.step(next, DiffMemo())
        assertEquals(DELTA_TYPE, step.type)
        assertEquals(5L, step.body.getValue("from").jsonPrimitive.long, "built on the board before the stale one")
        assertEquals(next, page.take(step))
    }

    @Test
    fun `a resync forgets the base and the history held, and sends the stored board whole`() =
        runBlocking {
            val stream = BoardStream(deltas = true)
            val out = Channel<Frame>(Channel.UNLIMITED)
            val pay = JsonArray(listOf(buildJsonObject { put("n", 1) }))
            stream.send(out, snapshotMessage(board(1, extra = mapOf("payments" to pay))))
            stream.send(out, snapshotMessage(board(2, extra = mapOf("payments" to pay))))
            val stored = board(2, extra = mapOf("payments" to pay))
            stream.resend(out) { stored }
            val texts = (1..3).map { (out.tryReceive().getOrThrow() as Frame.Text).readText() }
            val types = texts.map { Json.parseToJsonElement(it).jsonObject.getValue("type").jsonPrimitive.content }
            assertEquals(listOf(SNAPSHOT_TYPE, DELTA_TYPE, SNAPSHOT_TYPE), types)
            val resent = Json.parseToJsonElement(texts[2]).jsonObject.getValue("state").jsonObject
            assertEquals(stored, resent, "whole, history lists too")
            // The next board builds on the resent one.
            val third = board(3, (1..20).map { card("card:$it", it == 1) }, extra = mapOf("payments" to pay))
            stream.send(out, snapshotMessage(third))
            val after = Json.parseToJsonElement((out.tryReceive().getOrThrow() as Frame.Text).readText()).jsonObject
            assertEquals(DELTA_TYPE, after.getValue("type").jsonPrimitive.content)
            assertEquals(2L, after.getValue("from").jsonPrimitive.long)
            assertEquals(2, stream.counts["delta"])
            assertEquals(1, stream.counts["resync"])
        }

    @Test
    fun `the test switch adds the whole board to every delta, after the size rule`() {
        val stream = BoardStream(deltas = true, check = true)
        stream.step(board(1), DiffMemo())
        val b = board(2, (1..20).map { card("card:$it", it == 1) })
        val step = stream.step(b, DiffMemo())
        assertEquals(DELTA_TYPE, step.type)
        assertEquals(b, step.body[WHOLE_KEY])
        val plain = BoardStream(deltas = true).also { it.step(board(1), DiffMemo()) }
        assertNull(plain.step(b, DiffMemo()).body[WHOLE_KEY])
    }

    // --- Through the hub ---

    private fun read(channel: Channel<Frame>): JsonObject =
        Json.parseToJsonElement((channel.tryReceive().getOrThrow() as Frame.Text).readText()).jsonObject

    @Test
    fun `each seat's delta is made from that seat's own last board, never the other's`() =
        runBlocking {
            val hub = MatchHub()
            val matchId = UUID.randomUUID()
            val alice = UUID.randomUUID()
            val bob = UUID.randomUUID()
            val toAlice = Channel<Frame>(Channel.UNLIMITED)
            val toBob = Channel<Frame>(Channel.UNLIMITED)
            hub.watchers.open(matchId, alice, "a", toAlice, deltas = true)
            hub.watchers.open(matchId, bob, "b", toBob, deltas = true)

            fun seatBoard(
                rev: Int,
                seat: Int,
            ) = board(
                rev,
                (1..20).map { card("card:$it", it == rev) },
                extra = mapOf("hand" to JsonArray((1..3).map { card("card:${seat * 100 + it + rev}") })),
            )
            val pages = mapOf(alice to Page(), bob to Page())
            for (rev in 1..6) {
                hub.snapshot(matchId, alice, seatBoard(rev, 1))
                hub.snapshot(matchId, bob, seatBoard(rev, 2))
                for ((user, channel, seat) in listOf(Triple(alice, toAlice, 1), Triple(bob, toBob, 2))) {
                    val message = read(channel)
                    val type = message.getValue("type").jsonPrimitive.content
                    val body = if (type == DELTA_TYPE) message else message.getValue("state").jsonObject
                    if (rev > 1) assertEquals(DELTA_TYPE, type)
                    assertEquals(seatBoard(rev, seat), pages.getValue(user).take(BoardStream.Step(type, body, "")))
                    val theirs = (rev - 1..rev).flatMap { r -> (1..3).map { "card:${(3 - seat) * 100 + it + r}" } }
                    assertTrue(ids(message).none { it in theirs }, "nothing of the other seat's hand")
                }
            }
        }

    @Test
    fun `one message keeps one messageId, and two tabs with one base share one diff`() =
        runBlocking {
            val hub = MatchHub()
            val matchId = UUID.randomUUID()
            val alice = UUID.randomUUID()
            val one = Channel<Frame>(Channel.UNLIMITED)
            val two = Channel<Frame>(Channel.UNLIMITED)
            hub.watchers.open(matchId, alice, "t1", one, deltas = true)
            hub.watchers.open(matchId, alice, "t2", two, deltas = true)
            val first = board(1)
            hub.snapshot(matchId, alice, first)
            read(one)
            read(two)
            val memo = DiffMemo()
            val next = snapshotMessage(board(2, (1..20).map { card("card:$it", it == 4) }))
            hub.watchers.of(matchId, alice).forEach { it.deliver(next, lazy { next.toString() }, memo) }
            assertEquals(1, memo.made, "one diff for the two tabs' one base")
            val a = read(one)
            val b = read(two)
            assertEquals(DELTA_TYPE, a.getValue("type").jsonPrimitive.content)
            assertEquals(a, b)
            assertEquals(next.getValue("messageId"), a.getValue("messageId"))
        }

    @Test
    fun `spectators get public boards only, as deltas when switched on and whole when off`() =
        runBlocking {
            for (on in listOf(true, false)) {
                val hub = MatchHub(DeltaSettings(spectators = on))
                val matchId = UUID.randomUUID()
                val watcher = Channel<Frame>(Channel.UNLIMITED)
                hub.spectators.open(matchId, UUID.randomUUID(), "w", watcher, deltas = hub.deltas.spectators)
                val page = Page()
                for (rev in 1..4) {
                    val public = board(rev, (1..20).map { card("card:$it", it == rev) })
                    hub.spectate(matchId, snapshotMessage(public))
                    val message = read(watcher)
                    val type = message.getValue("type").jsonPrimitive.content
                    val body = if (type == DELTA_TYPE) message else message.getValue("state").jsonObject
                    assertEquals(if (rev > 1 && on) DELTA_TYPE else SNAPSHOT_TYPE, type, "spectator deltas $on")
                    assertEquals(public, page.take(BoardStream.Step(type, body, "")))
                }
            }
        }

    @Test
    fun `the switches -- players on and spectators off unless set, the test check off unless set`() {
        val none = net.barnflix.proxic.ServerConfig.fromEnvironment { null }
        assertTrue(none.matchDeltas)
        assertFalse(none.spectatorDeltas)
        assertFalse(none.testDeltaCheck)
        val set =
            net.barnflix.proxic.ServerConfig.fromEnvironment {
                mapOf(
                    "PROXIC_MATCH_DELTAS" to "false",
                    "PROXIC_SPECTATOR_DELTAS" to "true",
                    "PROXIC_TEST_DELTA_CHECK" to "true",
                )[it]
            }
        // A page that asks (`?deltas=1`) gets them as the switches allow; one that does not, never.
        assertEquals(DeltaSettings(players = true, spectators = false), DeltaSettings().asked("1"))
        assertEquals(DeltaSettings(players = false, spectators = false), DeltaSettings(spectators = true).asked(null))
        assertEquals(DeltaSettings(players = false, spectators = true), DeltaSettings(false, true).asked("1"))
        assertFalse(set.matchDeltas)
        assertTrue(set.spectatorDeltas)
        assertTrue(set.testDeltaCheck)
    }

    @Test
    fun `a resync is answered at most once a second, and nothing in it is acted on`() {
        val resyncs = Resyncs(UUID.randomUUID(), "c1")
        val connection = Connection("c1", Channel(Channel.UNLIMITED))
        val ask = """{"type":"MATCH_RESYNC","have":{"gameEpoch":1,"stateRevision":"drop table"}}"""
        assertTrue(resyncs.asked(ask, connection))
        assertFalse(resyncs.asked(ask, connection), "a second within the second is ignored")
        val other = """{"type":"DECISION_RESPONSE","note":"MATCH_RESYNC"}"""
        assertFalse(Resyncs(UUID.randomUUID(), "c2").asked(other, connection))
    }

    private companion object {
        val TYPED = Regex("^(card|stack|known|copying):.*")
    }
}
