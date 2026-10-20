package net.barnflix.proxic.deck

import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.match.MatchWorker
import net.barnflix.proxic.match.WorkerEvent
import net.barnflix.proxic.match.WorkerSeat
import net.barnflix.proxic.match.WorkerStart
import org.junit.jupiter.api.Assumptions.assumeTrue
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * The Mechanics Lab corpus, whole — PHASE_06 §6.4, §6.6 Layer A, P6-AS.
 *
 * PASSING THIS DOES NOT MEAN ALL MECHANICS IN THE CORPUS ARE
 * SUPPORTED. It proves the corpus is read as written, every card is
 * either resolved to the printing asked for or refused by name, Forge
 * builds a deck from it, and a real game starts with it. Whether any
 * one card then PLAYS correctly is Layer B's question, tracked per
 * card in docs/testing/MECHANICS_LAB_COVERAGE.md.
 *
 * WHY NOT THROUGH THE UPLOAD ROUTE. The corpus is 390 cards and its
 * art is 289 MB. Open Format allows 65 cards (§2.45) and a package
 * 150 MB, so the product refuses it — correctly, and that refusal is
 * asserted below rather than worked around. Each importer stage is
 * run here on its own instead: the parser, the Forge resolver, Forge
 * deck construction and the runtime are the same code the route
 * uses, minus the two limits that exist to keep this deck out.
 *
 * Runs on CI: the TXT and CSV are versioned, and CI extracts the
 * worker and Forge's resources from the image under test. The
 * artwork half needs the 275 gitignored images and lives in
 * [MechanicsLabArtTest].
 */
class MechanicsLabCorpusTest {
    private val workerJar = File("../forge-worker/target/forge-worker-0.1.0.jar")
    private val resRoot = File("../spikes/forge-phase0a/forge-upstream/forge-gui/res")

    private fun config(): ServerConfig {
        assumeTrue(workerJar.isFile, "SKIPPED: build the worker (cd forge-worker && mvn package)")
        assumeTrue(resRoot.isDirectory, "SKIPPED: no Forge resource checkout")
        return ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = null,
            forgeWorkerJar = workerJar.path,
            dataRoot = "build/test-mechanics-lab",
            forgeResRoot = resRoot.path,
        )
    }

    private fun corpus(): ParsedDeck = assertIs<DeckParseResult.Ok>(DeckListParser.parse(SOURCE.readText())).deck

    /**
     * §6.4 — "Do not edit, regenerate, normalize, reorder, or rewrite
     * them unless the project owner explicitly authorizes a
     * test-corpus change." This is the check that they were not.
     *
     * If the owner does authorize a change, update these two lines in
     * the same commit and say so in its message.
     */
    @Test
    fun `the source files are unchanged`() {
        assertEquals(SOURCE_SHA256, sha256(SOURCE), "Mechanics Lab TXT changed")
        assertEquals(COVERAGE_SHA256, sha256(COVERAGE), "Mechanics Lab CSV changed")
    }

    /** §6.4 — the TXT is authoritative for entries, quantities and printings. */
    @Test
    fun `the source corpus parses as written`() {
        val deck = corpus()

        assertEquals(275, deck.entries.size, "distinct entries")
        assertEquals(390, deck.totalCards, "cards")
        // Every printing named: the set code is what the artwork is
        // keyed to, so an entry that lost it would lose its picture.
        val unprinted = deck.entries.filter { it.setCode == null || it.collectorNumber == null }
        assertTrue(unprinted.isEmpty(), "entries without a printing: $unprinted")
        // Multiface names as exported, "A // B", kept whole.
        assertEquals(14, deck.entries.count { it.isMultiFace }, "multiface entries")
    }

    /**
     * And the CSV, authoritative for WHY each card is here, covers
     * exactly the TXT's cards — no card unexplained, no explanation
     * for a card that is not in the deck.
     *
     * By FRONT face: the CSV writes most two-faced cards in full but
     * Studious First-Year and Trystan by their front alone. Both
     * files are read-only (§6.4), so the comparison adapts to them.
     */
    @Test
    fun `the coverage CSV classifies exactly the corpus`() {
        val front = { name: String -> name.substringBefore(" // ").trim().lowercase() }
        val classified = coverageRows().map { front(it.card) }.toSet()
        val inDeck = corpus().entries.map { front(it.name) }.toSet()

        assertEquals(inDeck - classified, emptySet(), "in the deck, not classified")
        assertEquals(classified - inDeck, emptySet(), "classified, not in the deck")
    }

    /**
     * The upload route refuses this deck, and says why.
     *
     * Not a defect being tolerated: Open Format is 60-65 cards and
     * Proxic enforces it at import (§2.45). If this ever starts
     * passing legality, the format check has broken.
     */
    @Test
    fun `Open Format refuses the whole corpus as one deck`() {
        val problems = OpenFormat.validate(corpus()).map { it.detail }

        assertTrue(problems.any { "390" in it }, "the size is named: $problems")
    }

    /**
     * P6-AS — "card identities resolve as required".
     *
     * As required means §2.46-§2.49 and owner decision D2: a card
     * resolves to the printing that was asked for, or it is refused
     * BY NAME with a reason. Never a substitute (§2.94), and never
     * silently dropped.
     *
     * The refused list is pinned. A Forge upgrade that starts or
     * stops supporting one of these cards fails this test and names
     * the card, which is how the coverage ledger finds out.
     */
    @Test
    fun `every card resolves to its printing or is refused by name`() {
        val deck = corpus()
        val results = CardResolver(config()).resolve(deck.entries, timeoutSeconds = 300)

        assertEquals(deck.entries.size, results.size, "one answer per distinct card")
        val unreachable = results.filter { it.status == CardResolution.Status.UNAVAILABLE }
        assertTrue(unreachable.isEmpty(), "the worker did not answer: ${unreachable.take(3)}")

        report("resolution.txt") {
            results.sortedBy { it.status }.joinToString("\n") {
                "${it.status}\t${it.name}\t${it.actualSet ?: ""}:${it.actualNumber ?: ""}\t${it.detail ?: ""}"
            }
        }

        // RESOLVED already means "the printing asked for": the worker
        // compares editions through Forge's own codes and aliases
        // (Hellspark Elemental is asked for as CON and Forge files it
        // as CFX — the same printing), and refuses anything else as
        // PRINTING_MISMATCH. CardResolverTest proves that refusal.
        val refused = results.filter { it.status != CardResolution.Status.RESOLVED }
        refused.forEach { assertTrue(!it.detail.isNullOrBlank(), "refused without a reason: $it") }

        assertEquals(
            REFUSED,
            refused.map { "${it.name} — ${it.status}" }.sorted(),
            "the cards Forge refuses changed; see build/mechanics-lab/resolution.txt",
        )
    }

    /** P6-AS — "Forge deck construction succeeds", counted by FORGE. */
    @Test
    fun `Forge builds a deck from every resolvable card`() {
        val playable = resolvable()

        val built = CardResolver(config()).buildDeck(playable, timeoutSeconds = 300)

        assertTrue(built.unresolved.isEmpty(), "Forge could not build: ${built.unresolved.take(5)}")
        assertEquals(playable.sumOf { it.quantity }, built.totalCards, "Forge's own count")
    }

    /**
     * P6-AS — "runtime can load the deck".
     *
     * Both seats get the corpus and a real game is started: Forge
     * loads it into a library, deals from it, asks the pregame and
     * reaches a priority window. Every decision is answered with its
     * first option; what is being proved is the load, not the play.
     */
    @Test
    fun `a real game starts with the corpus as both libraries`() {
        val playable = resolvable()
        lateinit var worker: MatchWorker
        worker =
            MatchWorker(config(), UUID.randomUUID()) { event ->
                if (event is WorkerEvent.Decision) {
                    val request = event.request
                    worker.answer(
                        request.decisionId,
                        request.authorisedSeat,
                        request.stateVersion,
                        request.options.firstOrNull()?.actionId,
                    )
                }
            }
        try {
            val result =
                worker.start(
                    listOf(
                        WorkerSeat("Alice", 1, playable),
                        WorkerSeat("Bob", 2, playable),
                    ),
                )
            val running = assertIs<WorkerStart.Running>(result, "did not start: $result")
            assertTrue(running.turn >= 1, "reported running at turn ${running.turn}")
        } finally {
            worker.stop()
        }
    }

    /** The corpus without the cards Forge refuses — what a game can be built from. */
    private fun resolvable(): List<DeckEntry> {
        val refused = REFUSED.map { it.substringBefore(" — ").lowercase() }.toSet()
        return corpus().entries.filter { it.name.lowercase() !in refused }
    }

    private fun report(
        name: String,
        body: () -> String,
    ) {
        val dir = File("build/mechanics-lab").apply { mkdirs() }
        File(dir, name).writeText(body())
    }

    internal companion object {
        val FOLDER = File("../Test Deck/Testing Deck")
        val SOURCE = File(FOLDER, "Proxic_Arena_Mechanics_Lab_SOURCE.txt")
        val COVERAGE = File(FOLDER, "Proxic_Arena_Mechanics_Lab_Coverage.csv")

        /** Of the content with LF line endings — what git stores; see [sha256]. */
        const val SOURCE_SHA256 = "4db3de050ce6a69c40b4b52b10225942dacecce140829ab7ead473001cc7c1a4"
        const val COVERAGE_SHA256 = "bea4d0bbbbe7a6fc1b5be892195c46b9efe363f25f282cf67b82994a1828a43b"

        /**
         * Measured 2026-10-20 against the pinned Forge (4ec5f1a2):
         * NONE. All 275 entries resolve to the printing the TXT
         * names, promo and List printings included.
         *
         * PHASE_02 recorded "roughly 26 unsupported cards in the
         * Mechanics Lab corpus"; that number is the Deck Builder's
         * whole-pool gap, not this deck's, and it does not hold here.
         * Empty is a measurement, not a default: a card Forge stops
         * supporting fails the test that pins this, by name.
         */
        val REFUSED: List<String> = emptyList()

        /**
         * The CONTENT's hash, line endings normalised to LF.
         *
         * .gitattributes stores text as LF, but a Windows checkout
         * may hold CRLF. The first version hashed raw bytes, pinned
         * the CRLF hash from a Windows working copy, and failed on
         * CI's LF checkout of the very same, unchanged file.
         */
        fun sha256(file: File): String {
            val text = file.readBytes().toString(Charsets.UTF_8).replace("\r\n", "\n")
            return MessageDigest.getInstance("SHA-256")
                .digest(text.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
        }

        data class CoverageRow(val category: String, val quantity: Int, val card: String, val mechanics: String)

        /** The CSV, read as CSV: a mechanics cell may hold commas inside quotes. */
        fun coverageRows(): List<CoverageRow> {
            val lines = COVERAGE.readText(Charsets.UTF_8).removePrefix("").lines().filter { it.isNotBlank() }
            return lines.drop(1).map { line ->
                val cells = splitCsv(line)
                CoverageRow(cells[0], cells[1].toInt(), cells[2], cells.getOrElse(3) { "" })
            }
        }

        private fun splitCsv(line: String): List<String> {
            val cells = mutableListOf<String>()
            val cell = StringBuilder()
            var quoted = false
            var i = 0
            while (i < line.length) {
                val c = line[i]
                when {
                    c == '"' && quoted && line.getOrNull(i + 1) == '"' -> {
                        cell.append('"')
                        i++
                    }
                    c == '"' -> quoted = !quoted
                    c == ',' && !quoted -> {
                        cells += cell.toString()
                        cell.clear()
                    }
                    else -> cell.append(c)
                }
                i++
            }
            cells += cell.toString()
            return cells
        }
    }
}
