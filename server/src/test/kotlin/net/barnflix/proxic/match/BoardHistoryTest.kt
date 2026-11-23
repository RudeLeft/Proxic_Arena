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
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.UUID
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * P11-D3 -- history sent once: each connection is sent only the history
 * entries its page lacks, and the page's rebuild ([BoardHistory.rebuild],
 * the server's copy of `history.ts` `withHistory`) is the worker's board,
 * element for element, on every board, for every connection.
 */
class BoardHistoryTest {
    private fun pay(
        n: Int,
        from: String = "card:${100 + n}",
    ): JsonObject =
        buildJsonObject {
            put("n", n)
            put("seat", 1)
            put("for", "card:7")
            put("kind", "cast")
            put("from", from)
        }

    private fun board(
        rev: Int,
        payments: List<JsonElement>? = null,
        rolls: List<JsonElement>? = null,
        notices: List<String>? = null,
    ): JsonObject =
        buildJsonObject {
            put("stateRevision", rev)
            put("seat", 1)
            payments?.let { put("payments", JsonArray(it)) }
            rolls?.let { put("rolls", JsonArray(it)) }
            notices?.let { list -> put("notices", JsonArray(list.map { JsonPrimitive(it) })) }
        }

    private fun JsonObject.historyOf(key: String): List<JsonElement> = (get(key) as JsonArray).toList()

    /** The page's side: rebuild what was sent, hold what it rebuilt. */
    private class Page {
        var held: Map<String, List<JsonElement>> = emptyMap()
        var revision = -1L

        fun take(sent: JsonObject): JsonObject {
            val full = BoardHistory.rebuild(sent, held)
            val rev = full["stateRevision"]!!.jsonPrimitive.content.toLong()
            if (rev >= revision) {
                revision = rev
                held = HISTORY_KEYS.associateWith { key -> (full[key] as? JsonArray)?.toList().orEmpty() }
            }
            return full
        }
    }

    /** The full board and the page's rebuild agree on every history list (absent = empty). */
    private fun assertSameHistory(
        full: JsonObject,
        rebuilt: JsonObject,
    ) {
        for (key in HISTORY_KEYS) {
            assertEquals(
                (full[key] as? JsonArray)?.toList().orEmpty(),
                (rebuilt[key] as? JsonArray)?.toList().orEmpty(),
                key,
            )
        }
        assertNull(rebuilt[KEPT_KEY])
        assertEquals(full - HISTORY_KEYS.toSet(), rebuilt - HISTORY_KEYS.toSet() - KEPT_KEY)
    }

    @Test
    fun `the first board on a connection carries every list whole`() {
        val stream = BoardStream()
        val full = board(1, payments = listOf(pay(1), pay(2)), notices = listOf("You looked at Opt."))
        assertEquals(full, stream.next(full))
    }

    @Test
    fun `a new entry is sent alone, and an unchanged list not at all`() {
        val stream = BoardStream()
        stream.next(board(1, payments = (1..24).map { pay(it) }))
        val sent = stream.next(board(2, payments = (2..25).map { pay(it) }))
        assertEquals<List<JsonElement>>(listOf(pay(25)), sent.historyOf("payments"))
        assertEquals(23, sent[KEPT_KEY]!!.jsonObject["payments"]!!.jsonPrimitive.content.toInt())
        val same = stream.next(board(3, payments = (2..25).map { pay(it) }))
        assertNull(same["payments"], "nothing new: the list is not sent")
        assertEquals(24, same[KEPT_KEY]!!.jsonObject["payments"]!!.jsonPrimitive.content.toInt())
    }

    @Test
    fun `an entry changed since it was sent sends the list again (a card gone into a hand loses its id)`() {
        val stream = BoardStream()
        val page = Page()
        page.take(stream.next(board(1, payments = (1..5).map { pay(it) })))
        // Payment 3's mana came from a card now in a hand: the worker strips its id.
        val stripped = (1..5).map { if (it == 3) pay(3, from = "unseen") else pay(it) } + pay(6)
        val full = board(2, payments = stripped)
        val sent = stream.next(full)
        // By place: the page's list no longer leads into the new one, so it goes whole.
        assertNull(sent[KEPT_KEY])
        assertEquals<List<JsonElement>>(stripped, sent.historyOf("payments"))
        assertFalse(sent.toString().contains("card:103"), "the stripped id is not sent again")
        assertSameHistory(full, page.take(sent))
        assertFalse(page.held.getValue("payments").toString().contains("card:103"))
    }

    @Test
    fun `a list that starts again (Karn's restart) goes whole, and an emptied one clears`() {
        val stream = BoardStream()
        val page = Page()
        page.take(stream.next(board(1, payments = (1..4).map { pay(it) }, rolls = listOf(pay(1)))))
        val restarted = board(2, payments = listOf(pay(1, from = "card:900")))
        val sent = stream.next(restarted)
        assertNull(sent[KEPT_KEY], "nothing kept: both lists changed whole")
        assertSameHistory(restarted, page.take(sent))
        assertEquals(emptyList(), page.held.getValue("rolls"))
    }

    @Test
    fun `notices are kept by place, as the six the worker keeps slide`() {
        val stream = BoardStream()
        val page = Page()
        val six = (1..6).map { "notice $it" }
        page.take(stream.next(board(1, notices = six)))
        // The same words twice in a row, as a coin flipped twice: by place, not by text.
        val next = six.drop(2) + listOf("notice 6", "notice 7")
        val full = board(2, notices = next)
        val sent = stream.next(full)
        assertSameHistory(full, page.take(sent))
    }

    @Test
    fun `a board older than one sent goes whole and changes nothing held`() {
        val stream = BoardStream()
        val page = Page()
        page.take(stream.next(board(5, payments = (1..3).map { pay(it) })))
        // The stored board a joining connection reads, overtaken by a live one.
        val stale = board(4, payments = (1..2).map { pay(it) })
        assertEquals(stale, stream.next(stale))
        page.take(stale)
        val full = board(6, payments = (1..4).map { pay(it) })
        val sent = stream.next(full)
        assertEquals<List<JsonElement>>(listOf(pay(4)), sent.historyOf("payments"))
        assertSameHistory(full, page.take(sent))
    }

    @Test
    fun `random histories rebuild exactly, and nothing sent is outside the full board`() {
        val random = Random(1122)
        repeat(200) {
            val stream = BoardStream()
            val page = Page()
            var payments = listOf<JsonElement>()
            var notices = listOf<String>()
            var next = 1
            for (rev in 1..60) {
                when (random.nextInt(6)) {
                    0, 1 -> payments = (payments + pay(next++)).takeLast(24)
                    2 ->
                        if (payments.isNotEmpty()) {
                            val i = random.nextInt(payments.size)
                            payments = payments.toMutableList().also { it[i] = pay(1000 + i, from = "unseen") }
                        }
                    3 -> notices = (notices + "notice ${random.nextInt(3)}").takeLast(6)
                    4 -> if (random.nextInt(10) == 0) payments = emptyList()
                    else -> Unit
                }
                val full = board(rev, payments = payments, notices = notices)
                val sent = stream.next(full)
                val fullEntries = HISTORY_KEYS.flatMap { (full[it] as? JsonArray).orEmpty() }
                HISTORY_KEYS.flatMap { (sent[it] as? JsonArray).orEmpty() }.forEach { entry ->
                    assertTrue(entry in fullEntries, "sent only what the full board holds")
                }
                assertSameHistory(full, page.take(sent))
            }
        }
    }

    @Test
    fun `through the hub, each connection is trimmed to its own page, and one that opens late gets it whole`() =
        runBlocking {
            val hub = MatchHub()
            val matchId = UUID.randomUUID()
            val alice = UUID.randomUUID()
            val first = Channel<Frame>(Channel.UNLIMITED)
            val late = Channel<Frame>(Channel.UNLIMITED)
            val firstPage = Page()
            val latePage = Page()

            fun read(channel: Channel<Frame>): JsonObject {
                val text = (channel.tryReceive().getOrThrow() as Frame.Text).readText()
                return Json.parseToJsonElement(text).jsonObject.getValue("state").jsonObject
            }
            hub.watchers.open(matchId, alice, "c1", first)
            val one = board(1, payments = (1..3).map { pay(it) })
            hub.snapshot(matchId, alice, one)
            assertSameHistory(one, firstPage.take(read(first)))
            hub.watchers.open(matchId, alice, "c2", late)
            val two = board(2, payments = (1..4).map { pay(it) })
            hub.snapshot(matchId, alice, two)
            val toFirst = read(first)
            val toLate = read(late)
            assertEquals<List<JsonElement>>(listOf(pay(4)), toFirst.historyOf("payments"))
            assertEquals(two, toLate, "a connection's first board is the whole board")
            assertSameHistory(two, firstPage.take(toFirst))
            assertSameHistory(two, latePage.take(toLate))
        }

    @Test
    fun `spectators are trimmed the same way, per connection`() =
        runBlocking {
            val hub = MatchHub()
            val matchId = UUID.randomUUID()
            val watcher = Channel<Frame>(Channel.UNLIMITED)
            hub.spectators.open(matchId, UUID.randomUUID(), "w1", watcher)
            val page = Page()
            for (rev in 1..5) {
                val full = board(rev, payments = (1..rev).map { pay(it) }, notices = emptyList())
                hub.spectate(matchId, snapshotMessage(full))
                val text = (watcher.tryReceive().getOrThrow() as Frame.Text).readText()
                val message = Json.parseToJsonElement(text).jsonObject
                assertEquals("MATCH_SNAPSHOT", message.getValue("type").jsonPrimitive.content)
                val sent = message.getValue("state").jsonObject
                if (rev > 1) assertEquals<List<JsonElement>>(listOf(pay(rev)), sent.historyOf("payments"))
                assertSameHistory(full, page.take(sent))
            }
        }
}
