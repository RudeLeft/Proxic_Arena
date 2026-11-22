package net.barnflix.proxic.match

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import net.barnflix.proxic.ServerConfig
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** P11-D0 (test only) -- the server's timing marks and their switch. */
class MatchTimingTest {
    @AfterTest
    fun off() = MatchTiming.enable(false)

    private fun parsed(line: String): JsonObject {
        assertTrue(line.startsWith(MatchTiming.PREFIX), line)
        return Json.parseToJsonElement(line.removePrefix(MatchTiming.PREFIX)) as JsonObject
    }

    @Test
    fun `off by default, and off reads no clock`() {
        assertFalse(ServerConfig.fromEnvironment { null }.testTiming)
        assertFalse(ServerConfig.fromEnvironment { if (it == "PROXIC_TEST_TIMING") "yes" else null }.testTiming)
        assertTrue(ServerConfig.fromEnvironment { if (it == "PROXIC_TEST_TIMING") "true" else null }.testTiming)
        MatchTiming.enable(false)
        assertEquals(0L, MatchTiming.now())
    }

    @Test
    fun `a mark is one JSON line, times in microseconds`() {
        MatchTiming.enable(true)
        val before = System.currentTimeMillis() * 1000
        val now = MatchTiming.now()
        assertTrue(now >= before && now < before + 60_000_000, "now=$now")
        val match = UUID.randomUUID()
        val line =
            MatchTiming.line(
                "out",
                42,
                "match" to match,
                "rev" to 7L,
                "decisionId" to null,
                "ok" to true,
                "type" to "A\"B",
            )
        assertFalse(line.contains('\n'))
        val o = parsed(line)
        assertEquals("out", o.getValue("ev").jsonPrimitive.content)
        assertEquals(42, o.getValue("t").jsonPrimitive.long)
        assertEquals(match.toString(), o.getValue("match").jsonPrimitive.content)
        assertEquals(7, o.getValue("rev").jsonPrimitive.long)
        assertEquals(JsonNull, o.getValue("decisionId"))
        assertTrue(o.getValue("ok").jsonPrimitive.boolean)
        assertEquals("A\"B", o.getValue("type").jsonPrimitive.content)
    }

    @Test
    fun `frames are counted per type, as the worker counts its writes`() {
        val counts = FrameCounts()
        assertEquals(1, counts.next("MATCH_SNAPSHOT"))
        assertEquals(1, counts.next("DECISION_REQUEST"))
        assertEquals(2, counts.next("MATCH_SNAPSHOT"))
        assertEquals(3, counts.next("MATCH_SNAPSHOT"))
        assertEquals(2, counts.next("DECISION_REQUEST"))
    }
}
