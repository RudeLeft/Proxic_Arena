package net.barnflix.proxic.deck

import net.barnflix.proxic.ServerConfig
import org.junit.jupiter.api.Assumptions.assumeTrue
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Card resolution through the Forge worker — PHASE_02 §2.46–§2.49.
 *
 * These run a real worker and load Forge's 96,916 cards, so they are
 * slow (~5 s each) and skip with a reason when the worker jar or the
 * Forge resources are absent.
 *
 * They are worth the seconds: §2.49 exists because Forge's printing
 * lookup lies, and a test that mocks the worker would assert my
 * belief about Forge rather than Forge's behaviour.
 */
class CardResolverTest {
    private val workerJar = File("../forge-worker/target/forge-worker-0.1.0.jar")
    private val resRoot = File("../spikes/forge-phase0a/forge-upstream/forge-gui/res")

    private fun resolver(): CardResolver {
        assumeTrue(workerJar.isFile, "SKIPPED: build the worker (cd forge-worker && mvn package)")
        assumeTrue(resRoot.isDirectory, "SKIPPED: no Forge resource checkout")
        return CardResolver(
            ServerConfig(
                host = "0.0.0.0",
                port = 0,
                databaseUrl = null,
                forgeWorkerJar = workerJar.path,
                dataRoot = "build/test-data",
                forgeResRoot = resRoot.path,
            ),
        )
    }

    private fun entry(
        name: String,
        set: String? = null,
        number: String? = null,
    ) = DeckEntry(4, name, set, number, "4 $name", 1)

    @Test
    fun `a real deck entry resolves`() {
        val results = resolver().resolve(listOf(entry("Fiery Temper", "INR", "154")))
        assertEquals(CardResolution.Status.RESOLVED, results.single().status)
    }

    /**
     * PHASE_07 Amendment 10 — Forge sorts each card for the Deck
     * Depot's bands. The edge cases are the ones a player would
     * argue about: Dryad Arbor is a land, an artifact creature is a
     * creature, a planeswalker and a double-faced card's front face
     * decide by their own type line, and an unknown card has none.
     */
    @Test
    fun `Forge sorts each card into land, creature or spell`() {
        val names =
            listOf(
                "Mountain" to "LAND",
                "Dryad Arbor" to "LAND",
                "Llanowar Elves" to "CREATURE",
                "Bonecrusher Giant" to "CREATURE",
                "Walking Ballista" to "CREATURE",
                "Lightning Bolt" to "SPELL",
                "Chandra, Torch of Defiance" to "SPELL",
                "Embercleave" to "SPELL",
                "Reckless Stormseeker // Storm-Charged Slasher" to "CREATURE",
            )
        val results = resolver().resolve(names.map { entry(it.first) } + entry("Not A Real Card"))
        for ((name, expected) in names) {
            assertEquals(expected, results.first { it.name == name }.category, name)
        }
        assertEquals(null, results.last().category)
    }

    /**
     * §2.49 — the finding this whole section exists for.
     *
     * Forge does NOT return null for a bad set or collector number.
     * It quietly returns another printing of the same name. For
     * gameplay that is harmless; for Proxic it is not, because the
     * printing is what the player chose and what their artwork is
     * keyed to.
     */
    @Test
    fun `a wrong printing is caught, not silently substituted`() {
        val results =
            resolver().resolve(
                listOf(
                    entry("Forest", "KTK", "261"),
                    entry("Lightning Bolt", "ZZZ", "999"),
                ),
            )
        assertTrue(
            results.all { it.status == CardResolution.Status.PRINTING_MISMATCH },
            "expected mismatches, got $results",
        )
        // The detail names what Forge returned instead, so the player
        // can see the substitution that was refused.
        assertTrue(results[0].detail!!.contains("TRK"), results[0].detail!!)
        assertEquals("TRK", results[0].actualSet)
    }

    /**
     * Regression. The first version of the worker's resolver reported
     * NOT_FOUND for every double-faced card, because Deck Builder
     * writes both faces and Forge knows only the front. That would
     * have rejected every deck containing a transforming card — and
     * the real export has one.
     */
    @Test
    fun `a double-faced card resolves by its front face`() {
        val results =
            resolver().resolve(
                listOf(entry("Reckless Stormseeker // Storm-Charged Slasher", "MID", "157")),
            )
        assertEquals(
            CardResolution.Status.RESOLVED,
            results.single().status,
            "got ${results.single().detail}",
        )
    }

    /**
     * Regression, found by resolving the real export.
     *
     * Deck Builder writes SCRYFALL set codes and Forge uses its own.
     * Hellspark Elemental was requested as CON/65 and Forge returned
     * CFX/65 — both Conflux, different vocabularies. Comparing the
     * raw strings reported a mismatch for a perfectly valid card and
     * would have rejected the whole deck.
     *
     * The fix asks Forge for the edition's aliases rather than
     * carrying a mapping table that would rot with every set.
     */
    @Test
    fun `a Scryfall set code matches Forge's own code for the same set`() {
        val results = resolver().resolve(listOf(entry("Hellspark Elemental", "CON", "65")))
        assertEquals(
            CardResolution.Status.RESOLVED,
            results.single().status,
            "CON and CFX are both Conflux: ${results.single().detail}",
        )
    }

    @Test
    fun `an unknown card is NOT_FOUND, never substituted`() {
        val results = resolver().resolve(listOf(entry("Totally Not A Real Card")))
        assertEquals(CardResolution.Status.NOT_FOUND, results.single().status)
        // §2.47: no silent substitution. The name is echoed back so
        // the error can quote it.
        assertTrue(results.single().detail!!.contains("Totally Not A Real Card"))
    }

    @Test
    fun `a whole real deck resolves in one worker`() {
        val export = File("../Test Deck/Basic_Mono_Red_65_Card_Deck.zip")
        assumeTrue(export.isFile, "SKIPPED: no real export")

        val text =
            java.util.zip.ZipFile(export).use { zip ->
                val member = zip.entries().asSequence().first { it.name.endsWith(".txt") }
                zip.getInputStream(member).readBytes().toString(Charsets.UTF_8)
            }
        val deck = (DeckListParser.parse(text) as DeckParseResult.Ok).deck

        val results = resolver().resolve(deck.entries)

        assertEquals(11, results.size, "one result per distinct entry")
        val unresolved = results.filter { it.status != CardResolution.Status.RESOLVED }
        assertEquals(emptyList(), unresolved, "the real export should resolve completely")
    }

    /** §1.66 — a missing worker is a result, not an exception. */
    @Test
    fun `no worker configured yields UNAVAILABLE rather than throwing`() {
        val resolver =
            CardResolver(
                ServerConfig("0.0.0.0", 0, null, null, "build/test-data"),
            )
        val results = resolver.resolve(listOf(entry("Fiery Temper", "INR", "154")))
        assertEquals(CardResolution.Status.UNAVAILABLE, results.single().status)
    }
}
