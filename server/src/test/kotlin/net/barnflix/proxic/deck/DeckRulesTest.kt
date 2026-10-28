package net.barnflix.proxic.deck

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.nio.file.Files
import java.util.zip.GZIPInputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Spec 0021 — the deck rules document: built once per Forge, from OpenFormat and the worker. */
class DeckRulesTest {
    private val pool =
        Json.parseToJsonElement(
            """{"type":"CARD_POOL","cards":[{"name":"Lightning Bolt","faces":["Lightning Bolt"],""" +
                """"printings":["M10 146"]}],"editions":[],"setCodes":{"M10":"M10"}}""",
        ).jsonObject

    private fun folder(): File = Files.createTempDirectory("deck-rules").toFile().also { it.deleteOnExit() }

    private fun parse(document: DeckRules.Document): JsonObject {
        val text = document.json.decodeToString()
        return Json.parseToJsonElement(text).jsonObject
    }

    @Test
    fun `the format is OpenFormat's own, and changing Forge changes the version`() {
        val root = folder()
        val document = parse(DeckRules(root, { pool }, forgeCommit = "aaaa").document()!!)
        val format = document["format"]!!.jsonObject
        // F-0021-C: the numbers import enforces, not a second copy of them.
        assertEquals(OpenFormat.MIN_CARDS, format["minCards"]!!.jsonPrimitive.int)
        assertEquals(OpenFormat.MAX_CARDS, format["maxCards"]!!.jsonPrimitive.int)
        assertEquals(OpenFormat.MAX_COPIES, format["maxCopies"]!!.jsonPrimitive.int)
        val unlimited = format["unlimitedCopies"]!!.jsonArray.map { it.jsonPrimitive.content }
        assertEquals(OpenFormat.BASIC_LAND_NAMES.sorted(), unlimited)
        // FMT-004: "any number" cards are not exempt.
        assertTrue("relentless rats" !in unlimited)
        val sides = format["sideDecks"]!!.jsonObject
        assertEquals(15, sides["CONTRAPTIONS"]!!.jsonObject["minCards"]!!.jsonPrimitive.int)
        assertEquals(1, sides["ATTRACTIONS"]!!.jsonObject["maxCopies"]!!.jsonPrimitive.int)
        // The worker's answer, minus its frame.
        val printing = document["cards"]!!.jsonArray[0].jsonObject["printings"]!!.jsonArray[0]
        assertEquals("M10 146", printing.jsonPrimitive.content)
        assertNull(document["type"])

        val other = parse(DeckRules(folder(), { pool }, forgeCommit = "bbbb").document()!!)
        assertNotEquals(document["rulesVersion"], other["rulesVersion"])
    }

    @Test
    fun `the worker is asked once per Forge, and a restart reads the kept pool`() {
        val root = folder()
        var asked = 0
        val counting = {
            asked++
            pool
        }
        val first = DeckRules(root, counting, forgeCommit = "cccc")
        first.document()
        first.document()
        assertEquals(1, asked, "F-0021-D: the second request is served from memory")

        val restarted = DeckRules(root, counting, forgeCommit = "cccc")
        val again = restarted.document()!!
        assertEquals(1, asked, "a restart reads the kept file, not a worker")
        assertEquals(parse(first.document()!!), parse(again))

        DeckRules(root, counting, forgeCommit = "dddd").document()
        assertEquals(2, asked, "a new Forge commit is asked again")
    }

    /**
     * Specs 0023 and 0024 (F-0023-E, F-0024-E) — neither changes the Forge
     * commit, so the pool revision is what makes a server holding the
     * revision-2 pool ask its worker again: the kept file is not read, and
     * the format says any printing of a listed card is accepted.
     */
    @Test
    fun `a pool kept by revision 2 is asked again, and any printing is accepted`() {
        val root = folder()
        File(root, "deck-rules").mkdirs()
        File(root, "deck-rules/pool-r2-ffff.json").writeText(
            """{"cards":[{"name":"Lightning Bolt","faces":["Lightning Bolt"],"printings":["SLZ 184"]}],""" +
                """"editions":[],"setCodes":{}}""",
        )
        var asked = 0
        val document =
            parse(
                DeckRules(root, {
                    asked++
                    pool
                }, forgeCommit = "ffff").document()!!,
            )
        assertEquals(3, DeckRules.POOL_REVISION)
        assertEquals(1, asked, "the revision-2 pool is not served")
        val printing = document["cards"]!!.jsonArray[0].jsonObject["printings"]!!.jsonArray[0]
        assertEquals("M10 146", printing.jsonPrimitive.content)
        assertTrue(File(root, "deck-rules/pool-r3-ffff.json").isFile)
        assertEquals("true", document["format"]!!.jsonObject["anyPrinting"]!!.jsonPrimitive.content)
    }

    @Test
    fun `no worker means no document, and nothing half-written is kept`() {
        val root = folder()
        assertNull(DeckRules(root, { null }, forgeCommit = "eeee").document())
        val partial = Json.parseToJsonElement("""{"type":"CARD_POOL","cards":[]}""").jsonObject
        assertNull(DeckRules(root, { partial }, forgeCommit = "eeee").document())
        assertTrue(File(root, "deck-rules").listFiles().orEmpty().none { it.name.startsWith("pool-") })
    }

    @Test
    fun `the gzipped bytes are the same document`() {
        val document = DeckRules(folder(), { pool }, forgeCommit = "ffff").document()!!
        val unzipped = GZIPInputStream(document.gzip.inputStream()).use { it.readBytes() }
        assertTrue(unzipped.contentEquals(document.json))
    }
}
