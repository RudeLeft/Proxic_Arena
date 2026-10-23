package net.barnflix.proxic.deck

import org.junit.jupiter.api.Assumptions.assumeTrue
import java.io.File
import java.util.zip.ZipFile
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Decklist parsing and Open Format legality — PHASE_02 §2.39–§2.45.
 *
 * The first test runs against the REAL Deck Builder export, which
 * §2.3 requires and §2.97 keeps out of the repository (it carries
 * ~12 MB of artwork). It skips with a reason when the file is
 * absent, like the Forge worker tests, rather than passing silently.
 *
 * Everything else uses inline fixtures, so the suite still means
 * something on a machine without the export.
 */
class DeckListTest {
    private val realExport = File("../Test Deck/Basic_Mono_Red_65_Card_Deck.zip")

    @Test
    fun `parses the real Deck Builder export`() {
        assumeTrue(
            realExport.isFile,
            "SKIPPED: no real export at ${realExport.path} (see PHASE_02 §2.3)",
        )

        val text =
            ZipFile(realExport).use { zip ->
                val entry = zip.entries().asSequence().first { it.name.endsWith(".txt") }
                zip.getInputStream(entry).readBytes().toString(Charsets.UTF_8)
            }

        val result = DeckListParser.parse(text)
        assertTrue(result is DeckParseResult.Ok, "got $result")
        val deck = (result as DeckParseResult.Ok).deck

        assertEquals(11, deck.entries.size, "distinct lines")
        assertEquals(65, deck.totalCards, "total cards")

        // The multi-face line carries BOTH faces, and the artwork is
        // filed under the front only.
        val dfc = deck.entries.single { it.isMultiFace }
        assertEquals("Reckless Stormseeker // Storm-Charged Slasher", dfc.name)
        assertEquals("Reckless Stormseeker", dfc.frontFaceName)

        // Printing identity is present and parsed, not discarded.
        val mountain = deck.entries.single { it.name == "Mountain" }
        assertEquals(25, mountain.quantity)
        assertEquals("FRA", mountain.setCode)
        assertEquals("287", mountain.collectorNumber)

        // And the real deck is legal, 25 Mountains notwithstanding.
        assertEquals(emptyList(), OpenFormat.validate(deck))
    }

    @Test
    fun `the deck's own format label is ignored`() {
        // The real export declares "(commander)" for a 65-card
        // mono-red deck. Trusting that label would make Arena's
        // legality depend on a Deck Builder setting.
        val result =
            DeckListParser.parse(
                """
                // My Deck (commander)

                4 Lightning Bolt [2X2:117]
                """.trimIndent(),
            )
        val deck = (result as DeckParseResult.Ok).deck
        assertEquals("My Deck", deck.declaredName)
    }

    @Test
    fun `a card with no printing still parses`() {
        // The exporter omits the set code when a card has none.
        val deck = ok("4 Some Promo Card")
        assertEquals("Some Promo Card", deck.entries[0].name)
        assertEquals(null, deck.entries[0].setCode)
    }

    @Test
    fun `CRLF is tolerated`() {
        // The exporter writes LF, but a package can be hand-edited
        // on Windows and failing on an invisible character would be
        // a baffling error.
        val deck = ok("// D\r\n\r\n4 Lightning Bolt [2X2:117]\r\n")
        assertEquals(1, deck.entries.size)
        assertEquals("Lightning Bolt", deck.entries[0].name)
    }

    @Test
    fun `the original line is preserved verbatim`() {
        // §2.42 — the source text is kept so an error can quote what
        // the player actually wrote.
        val deck = ok("4 Fiery Temper [INR:154]")
        assertEquals("4 Fiery Temper [INR:154]", deck.entries[0].sourceText)
    }

    @Test
    fun `malformed lines are rejected with the line number`() {
        for ((text, why) in listOf(
            "Lightning Bolt" to "no quantity",
            "0 Lightning Bolt" to "zero quantity",
            "-2 Lightning Bolt" to "negative quantity",
            "4 " to "empty name",
        )) {
            val result = DeckListParser.parse("// D\n\n$text")
            assertTrue(result is DeckParseResult.Invalid, "$why should be rejected: got $result")
            assertEquals(3, (result as DeckParseResult.Invalid).line, why)
        }
    }

    @Test
    fun `an empty decklist is rejected`() {
        assertTrue(DeckListParser.parse("// Just a header\n\n") is DeckParseResult.Invalid)
    }

    private fun ok(body: String): ParsedDeck = (DeckListParser.parse("// D\n\n$body") as DeckParseResult.Ok).deck
}

/** Open Format legality — PHASE_02 §2.44, §2.45. */
class OpenFormatTest {
    private fun deckOf(vararg lines: String): ParsedDeck =
        (DeckListParser.parse("// D\n\n" + lines.joinToString("\n")) as DeckParseResult.Ok).deck

    private fun legalDeck(): ParsedDeck =
        deckOf(
            "36 Mountain [FRA:287]",
            "4 Fiery Temper [INR:154]",
            "4 Rift Bolt [2X2:122]",
            "4 Staggershock [2X2:125]",
            "4 Mardu Scout [FRF:108]",
            "4 Voldaren Epicure [INR:182]",
            "4 Rabbit Battery [NEO:157]",
        )

    @Test
    fun `a 60 to 65 card deck is legal`() {
        assertEquals(60, legalDeck().totalCards)
        assertEquals(emptyList(), OpenFormat.validate(legalDeck()))
    }

    @Test
    fun `basic lands are unlimited`() {
        val deck = deckOf("56 Mountain [FRA:287]", "4 Fiery Temper [INR:154]")
        assertEquals(emptyList(), OpenFormat.validate(deck))
    }

    @Test
    fun `any-number cards are NOT exempt`() {
        // Owner decision 2026-10-15. Forge's canHaveAnyNumberOf()
        // would permit these; Open Format does not.
        for (card in listOf("Relentless Rats", "Dragon's Approach", "Persistent Petitioners")) {
            val deck = deckOf("30 $card [X:1]", "30 Mountain [FRA:287]")
            val violations = OpenFormat.validate(deck)
            assertTrue(
                violations.any { it.code == "TOO_MANY_COPIES" },
                "$card should be limited to 4 copies, got $violations",
            )
        }
    }

    @Test
    fun `copies are counted across lines, not within one`() {
        // Three plus two is five, even split across printings.
        val deck = deckOf("3 Fiery Temper [INR:154]", "2 Fiery Temper [MH2:120]", "55 Mountain [FRA:287]")
        val violations = OpenFormat.validate(deck)
        assertTrue(violations.any { it.code == "TOO_MANY_COPIES" }, "got $violations")
    }

    @Test
    fun `deck size bounds are enforced at both ends`() {
        assertTrue(
            OpenFormat.validate(deckOf("59 Mountain [FRA:287]")).any { it.code == "DECK_TOO_SMALL" },
        )
        assertTrue(
            OpenFormat.validate(deckOf("66 Mountain [FRA:287]")).any { it.code == "DECK_TOO_LARGE" },
        )
    }

    @Test
    fun `every violation is reported, not just the first`() {
        // A player fixing one problem per upload is a worse
        // experience than one list of everything wrong.
        val deck = deckOf("5 Fiery Temper [INR:154]", "5 Rift Bolt [2X2:122]")
        val violations = OpenFormat.validate(deck)
        assertEquals(1, violations.count { it.code == "DECK_TOO_SMALL" })
        assertEquals(2, violations.count { it.code == "TOO_MANY_COPIES" })
    }

    @Test
    fun `a violation names the card and the line`() {
        val deck = deckOf("55 Mountain [FRA:287]", "5 Fiery Temper [INR:154]")
        val violation = OpenFormat.validate(deck).single { it.code == "TOO_MANY_COPIES" }
        assertTrue(violation.detail.contains("Fiery Temper"), violation.detail)
        assertEquals(4, violation.line)
    }

    // Phase 8 Amendment 3 — Contraptions and Attractions go to their own
    // decks, as Forge reads the card (the sections map), outside the 60–65.

    /** Fifteen distinct Contraption names, one copy each. */
    private val contraptions = (1..15).map { "Contraption $it" }

    @Test
    fun `contraptions are not in the 60 to 65 and a fifteen-card contraption deck is legal`() {
        val deck = deckOf(*(listOf("60 Mountain [FRA:287]") + contraptions.map { "1 $it" }).toTypedArray())
        assertEquals(emptyList(), OpenFormat.validate(deck, contraptions.associateWith { "CONTRAPTIONS" }))
        // Without Forge's reading they would be counted, and the deck is 75.
        assertTrue(OpenFormat.validate(deck).any { it.code == "DECK_TOO_LARGE" })
    }

    @Test
    fun `a contraption deck needs fifteen and one copy of each`() {
        val few = contraptions.take(14)
        val small = deckOf(*(listOf("60 Mountain [FRA:287]") + few.map { "1 $it" }).toTypedArray())
        assertTrue(
            OpenFormat.validate(small, few.associateWith { "CONTRAPTIONS" })
                .any { it.code == "CONTRAPTIONS_DECK_TOO_SMALL" },
        )
        val lines = listOf("60 Mountain [FRA:287]", "2 Contraption 1") + contraptions.drop(1).map { "1 $it" }
        val twice = deckOf(*lines.toTypedArray())
        val violation =
            OpenFormat.validate(twice, contraptions.associateWith { "CONTRAPTIONS" })
                .single { it.code == "TOO_MANY_COPIES" }
        assertTrue(violation.detail.contains("Contraption 1"), violation.detail)
    }

    @Test
    fun `what is illegal whatever Forge says is known before Forge is asked`() {
        // Too few and too many copies stand however Forge reads the cards...
        val short = deckOf("40 Mountain [FRA:287]", "5 Fiery Temper [INR:154]")
        assertEquals(
            setOf("DECK_TOO_SMALL", "TOO_MANY_COPIES"),
            OpenFormat.certainViolations(short).map { it.code }.toSet(),
        )
        // ...but 75 cards may be 60 and fifteen Contraptions: that waits for Forge.
        val big = deckOf(*(listOf("60 Mountain [FRA:287]") + contraptions.map { "1 $it" }).toTypedArray())
        assertEquals(emptyList(), OpenFormat.certainViolations(big))
    }

    @Test
    fun `an attraction deck needs ten`() {
        val attractions = (1..9).map { "Attraction $it" }
        val deck = deckOf(*(listOf("60 Mountain [FRA:287]") + attractions.map { "1 $it" }).toTypedArray())
        assertTrue(
            OpenFormat.validate(deck, attractions.associateWith { "ATTRACTIONS" })
                .any { it.code == "ATTRACTIONS_DECK_TOO_SMALL" },
        )
    }
}
