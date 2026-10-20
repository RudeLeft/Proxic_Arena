package net.barnflix.proxic.deck

import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.match.MatchArt
import org.junit.jupiter.api.Assumptions.assumeTrue
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * The Mechanics Lab artwork — P6-AS "assets map".
 *
 * Every one of the corpus's 275 images through the importer's own
 * validation and storage ([ArtStore]), every deck entry matched to
 * one by the importer's own rule ([frontNameOf]), and then every
 * card through the MATCH-time lookup ([MatchArt]) — because a card
 * that has art in the Deck Depot and none on the battlefield is the
 * failure a player actually sees. Two-faced cards had exactly that
 * until 2026-10-20.
 *
 * Local only: the images are Wizards artwork and never committed
 * (AGENTS GIT-001). Declared in ci/expected-skips.txt.
 */
class MechanicsLabArtTest {
    private val images = File(MechanicsLabCorpusTest.FOLDER, "real_cards")

    @Test
    fun `every card in the corpus has valid art, in the Depot and in a match`() {
        val pngs = images.listFiles { file -> file.name.endsWith(".png") }.orEmpty().sortedBy { it.name }
        assumeTrue(pngs.isNotEmpty(), "SKIPPED: the Mechanics Lab images are not present (gitignored)")

        val store = File("build/test-mechanics-lab-art").apply { deleteRecursively() }
        try {
            // The importer's stage 8: each image validated and stored,
            // filed under its front-face name.
            val artStore = ArtStore(store)
            val byFrontName = mutableMapOf<String, String>()
            val rejected = mutableListOf<String>()
            for (png in pngs) {
                val member = "real_cards/${png.name}"
                when (val stored = artStore.store(png, member)) {
                    is ArtResult.Ok -> byFrontName[frontNameOf(member)] = stored.art.sha256
                    is ArtResult.Rejected -> rejected += "${stored.code}: ${stored.detail}"
                }
            }
            assertTrue(rejected.isEmpty(), "images the importer would refuse: $rejected")

            // The importer's persist step: an entry finds its art by
            // its front face.
            val deck = assertIs<DeckParseResult.Ok>(DeckListParser.parse(MechanicsLabCorpusTest.SOURCE.readText())).deck
            val withoutArt = deck.entries.filter { byFrontName[it.frontFaceName.lowercase()] == null }
            assertTrue(withoutArt.isEmpty(), "entries with no image: ${withoutArt.map { it.name }}")

            // Every image belongs to a card: an orphan is art the
            // package carries for nothing, or an entry spelled
            // differently from its file.
            val fronts = deck.entries.map { it.frontFaceName.lowercase() }.toSet()
            assertEquals(emptySet(), byFrontName.keys - fronts, "images matching no entry")
            assertEquals(275, byFrontName.size)

            // And in a match. MatchRecords hands MatchArt the deck's
            // card_name -> art_sha256, card_name written as exported
            // ("A // B"); Forge names the card by its front face.
            val stored = deck.entries.associate { it.name to byFrontName.getValue(it.frontFaceName.lowercase()) }
            val art = MatchArt(mapOf(1 to stored))
            val cards =
                deck.entries.mapIndexed { i, entry ->
                    val name = Json.encodeToString(String.serializer(), entry.frontFaceName)
                    """{"id":"card:$i","seat":1,"name":$name,"known":true}"""
                }
            val snapshot =
                Json.parseToJsonElement("""{"battlefield":[${cards.joinToString(",")}],"hand":[]}""").jsonObject
            val seen = art.annotate(snapshot, 1)["battlefield"]!!.jsonArray
            val blank =
                seen.filter { it.jsonObject["art"] == null }.map { it.jsonObject["name"]!!.jsonPrimitive.content }
            assertTrue(blank.isEmpty(), "cards with no art in a match: $blank")
        } finally {
            store.deleteRecursively()
        }
    }
}
