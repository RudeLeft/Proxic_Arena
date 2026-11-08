package net.barnflix.proxic.match

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Spec 0064 — the play log, kept per seat for the match and sent back to
 * that seat's own user on (re)connect, never to anybody else (HID-001,
 * HID-003: both seats asserted); and its cards wear pictures only for the
 * seat whose line names them.
 */
class PlayLogKeptTest {
    private val alice = UUID.randomUUID()
    private val bob = UUID.randomUUID()

    private val match =
        Match(
            matchId = UUID.randomUUID(),
            setupId = UUID.randomUUID(),
            roomId = UUID.randomUUID(),
            status = MatchStatus.RUNNING,
            presetId = "OPEN_FORMAT_1V1",
            participants =
                listOf(
                    MatchParticipant(alice, 1, UUID.randomUUID(), "Mono Red", "Alice"),
                    MatchParticipant(bob, 2, UUID.randomUUID(), "Mono Green", "Bob"),
                ),
        )

    /** Never started: these tests only store and read snapshots. */
    private val noWorker =
        MatchWorker(
            net.barnflix.proxic.ServerConfig(
                host = "0.0.0.0",
                port = 0,
                databaseUrl = null,
                forgeWorkerJar = null,
                dataRoot = "build/test-play-log",
            ),
            UUID.randomUUID(),
        )

    private fun live() = LiveMatch(match, worker = noWorker) { _, _, _, _ -> true }

    private fun state(
        seat: Int,
        rev: Int,
        vararg lines: String,
    ): JsonObject =
        Json.parseToJsonElement(
            """{"seat":$seat,"stateRevision":$rev,"battlefield":[],"hand":[],"players":[],
               "playLog":[${lines.joinToString(",")}]}""",
        ).jsonObject

    private fun line(
        n: Int,
        rev: Int,
        vararg parts: String,
    ) = """{"n":$n,"rev":$rev,"turn":1,"kind":"draw","parts":[${parts.joinToString(",")}]}"""

    private fun texts(state: JsonObject?): List<String> {
        val lines = state?.get("playLog")?.jsonArray ?: return emptyList()
        return lines.map { it.toString() }
    }

    @Test
    fun `each seat gets back its own whole log, and only its own`() {
        val live = live()
        // Round 1: Bob drew Giant Growth -- named to Bob, "a card" to Alice.
        live.snapshotTaken(1, state(1, 5, line(1, 5, """{"player":2}""", "\" drew a card\"")))
        live.snapshotTaken(
            2,
            state(
                2,
                5,
                line(1, 5, """{"player":2}""", "\" drew \"", """{"name":"Giant Growth","known":true,"id":"card:41"}"""),
            ),
        )
        // Round 2: a line each.
        live.snapshotTaken(1, state(1, 6, line(2, 6, "\"Turn 2\"")))
        live.snapshotTaken(2, state(2, 6, line(2, 6, "\"Turn 2\"")))

        val alices = live.snapshotFor(alice)
        val bobs = live.snapshotFor(bob)
        assertEquals(2, texts(alices).size, "Alice gets both rounds back, not only the last")
        assertEquals(2, texts(bobs).size)
        assertFalse(texts(alices).any { "Giant Growth" in it }, "Alice is never sent Bob's draw by name")
        assertFalse(texts(alices).any { "card:41" in it })
        assertTrue(texts(bobs).first().contains("Giant Growth"), "Bob is told his own draw")
        // The board itself is still the latest round's.
        assertEquals(6, alices!!["stateRevision"]!!.jsonPrimitive.content.toInt())
    }

    @Test
    fun `the log is bounded per seat, oldest first out`() {
        val live = live()
        for (n in 1..(PLAY_LOG_KEPT + 25)) live.snapshotTaken(1, state(1, n, line(n, n, "\"x\"")))
        val kept = live.playLogs.of(1)
        assertEquals(PLAY_LOG_KEPT, kept.size)
        assertEquals("26", kept.first().jsonObject["n"]!!.jsonPrimitive.content)
    }

    @Test
    fun `the public view keeps no log, and a seat with none is sent the board as it was`() {
        val live = live()
        live.snapshotTaken(PUBLIC_SEAT, state(0, 3, line(1, 3, "\"x\"")))
        assertEquals(0, live.playLogs.of(PUBLIC_SEAT).size)
        live.snapshotTaken(2, state(2, 3))
        assertEquals(0, texts(live.snapshotFor(bob)).size)
    }

    @Test
    fun `a card a line names wears its picture for that seat, and only that seat may fetch it`() {
        val bolt = "a".repeat(64)
        val art = MatchArt(mapOf(1 to mapOf("Lightning Bolt" to bolt)))
        val named = """{"name":"Lightning Bolt","known":true,"id":"card:12","owner":1,"seat":1}"""
        val annotated = art.annotate(state(2, 9, line(4, 9, """{"player":1}""", "\" cast \"", named)), 2)
        val part =
            annotated["playLog"]!!
                .jsonArray[0]
                .jsonObject["parts"]!!
                .jsonArray[2]
                .jsonObject
        assertEquals(bolt, part["art"]?.jsonPrimitive?.content)
        assertTrue(art.mayFetch(2, bolt))
        assertFalse(art.mayFetch(1, bolt), "shown to seat 2's line only")
        // A part the worker did not name ("a card") carries nothing.
        val hidden = art.annotate(state(1, 9, line(4, 9, """{"player":2}""", "\" drew a card\"")), 1)
        val drew = hidden["playLog"]!!.jsonArray[0].jsonObject["parts"]!!.jsonArray[1]
        assertNull((drew as? JsonObject)?.get("art"))
    }

    @Test
    fun `a line keeps a card's id only while the board it is sent with shows that card`() {
        val live = live()
        // Alice cast Lightning Bolt (public, on the stack); it then went back to
        // her hand (Krark, the Thumbless). Bob's next board does not show it.
        val bolt = """{"name":"Lightning Bolt","known":true,"id":"card:7","owner":1,"seat":1}"""
        live.snapshotTaken(2, state(2, 10, line(1, 10, """{"player":1}""", "\" cast \"", bolt)))
        live.snapshotTaken(2, state(2, 11))
        val sent = live.snapshotFor(bob)!!["playLog"]!!.jsonArray[0].jsonObject["parts"]!!.jsonArray[2].jsonObject
        assertEquals("Lightning Bolt", sent["name"]!!.jsonPrimitive.content, "the name is history")
        assertNull(sent["id"], "the id is a live handle on a card Bob can't see now")
        // While the board shows it, the id stays (a close-up can open).
        val shown =
            Json.parseToJsonElement(
                """{"seat":2,"stateRevision":12,"battlefield":[{"id":"card:7","name":"Lightning Bolt"}],"hand":[]}""",
            ).jsonObject
        live.snapshotTaken(2, shown)
        val kept = live.snapshotFor(bob)!!["playLog"]!!.jsonArray[0].jsonObject["parts"]!!.jsonArray[2].jsonObject
        assertEquals("card:7", kept["id"]!!.jsonPrimitive.content)
    }
}
