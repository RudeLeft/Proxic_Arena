package net.barnflix.proxic.deck

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The import pipeline, end to end — PHASE_02 §2.17, §2.18, §2.38.
 *
 * A real ZIP, a real PostgreSQL, and a real Forge worker. Slow
 * (~30 s) and worth it: every cheaper version of this test would
 * assert my beliefs about the pieces rather than their behaviour,
 * and the last three sessions found bugs precisely where my beliefs
 * were wrong.
 */
class DeckImportTest {
    private val realExport = File("../Test Deck/Basic_Mono_Red_65_Card_Deck.zip")
    private val workerJar = File("../forge-worker/target/forge-worker-0.1.0.jar")
    private val resRoot = File("../spikes/forge-phase0a/forge-upstream/forge-gui/res")

    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private lateinit var dataRoot: File
    private lateinit var importer: DeckImporter

    /**
     * PHASE_04 §4.52 — every deck has an owner, so these tests need
     * an account. The import API takes the id as a parameter rather
     * than reading it from a request, which is what makes an
     * ownerless import impossible to write by accident (§4.53).
     */
    private lateinit var owner: java.util.UUID

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        assumeTrue(realExport.isFile, "SKIPPED: no real export (PHASE_02 §2.3)")
        assumeTrue(workerJar.isFile, "SKIPPED: build the worker first")
        assumeTrue(resRoot.isDirectory, "SKIPPED: no Forge resource checkout")

        container =
            PostgreSQLContainer("postgres:16.15-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }

        dataRoot = File("build/test-import-${System.currentTimeMillis()}")
        val config =
            ServerConfig(
                host = "0.0.0.0",
                port = 0,
                databaseUrl = container!!.jdbcUrl,
                forgeWorkerJar = workerJar.path,
                dataRoot = dataRoot.path,
                forgeResRoot = resRoot.path,
                databasePasswordValue = container!!.password,
                databaseUserValue = container!!.username,
            )
        database = Database.connect(config)!!.also { it.migrate() }
        importer = DeckImporter(config, database!!.dataSource(), CardResolver(config))
        val accounts = net.barnflix.proxic.auth.Accounts(database!!.dataSource())
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", net.barnflix.proxic.auth.Role.ADMIN)
        owner = accounts.findByUsername("RudeLeft")!!.userId
    }

    @AfterTest
    fun stop() {
        database?.close()
        container?.stop()
        if (::dataRoot.isInitialized) dataRoot.deleteRecursively()
    }

    private fun rowCount(table: String): Int =
        database!!.dataSource().connection.use { connection ->
            connection.createStatement().executeQuery("SELECT count(*) FROM $table").use {
                it.next()
                it.getInt(1)
            }
        }

    @Test
    fun `the real export imports completely`() {
        val result = importer.import(realExport, realExport.name, owner)
        assertTrue(result is ImportResult.Imported, "got $result")
        result as ImportResult.Imported

        assertEquals(65, result.totalCards)
        assertEquals(11, result.distinctCards)
        assertEquals(11, result.artStored)
        assertEquals(0, result.entriesWithoutArt)

        assertEquals(1, rowCount("imported_deck"))
        assertEquals(11, rowCount("deck_entry"))
        assertEquals(11, rowCount("art_asset"))
    }

    @Test
    fun `art is written to disk and a display derivative is generated`() {
        importer.import(realExport, realExport.name, owner)

        val store = ArtStore(dataRoot)
        val hashes =
            database!!.dataSource().connection.use { connection ->
                connection.createStatement().executeQuery("SELECT content_sha256 FROM art_asset").use {
                    buildList { while (it.next()) add(it.getString(1)) }
                }
            }
        assertEquals(11, hashes.size)

        for (hash in hashes) {
            assertTrue(store.originalPath(hash).isFile, "original missing for $hash")
            // §2.134 — the derivative exists and is smaller. Serving
            // originals means decoding ~50 MP to draw ~0.9 MP.
            val derivative = store.displayPath(hash)
            assertTrue(derivative.isFile, "display derivative missing for $hash")
            // §2.134 — the derivative must be cheaper than the
            // original in BOTH respects it is kept for.
            val original = javax.imageio.ImageIO.read(store.originalPath(hash))
            val scaled = javax.imageio.ImageIO.read(derivative)
            assertTrue(
                scaled.width < original.width,
                "the derivative should have fewer pixels: " +
                    "${scaled.width}x${scaled.height} vs ${original.width}x${original.height}",
            )
            assertTrue(
                derivative.length() < store.originalPath(hash).length(),
                "the derivative should be smaller on disk: " +
                    "${derivative.length() / 1024} KB vs " +
                    "${store.originalPath(hash).length() / 1024} KB",
            )
        }
    }

    /** The owner's D3 decision, end to end. */
    @Test
    fun `importing the identical package twice is refused`() {
        val first = importer.import(realExport, realExport.name, owner)
        assertTrue(first is ImportResult.Imported)

        val second = importer.import(realExport, realExport.name, owner)
        assertTrue(second is ImportResult.Duplicate, "got $second")
        assertEquals(
            (first as ImportResult.Imported).deckId,
            (second as ImportResult.Duplicate).existingDeckId,
        )
        // Nothing was stored twice: not the deck, not 12 MB of art.
        assertEquals(1, rowCount("imported_deck"))
        assertEquals(11, rowCount("art_asset"))
    }

    /**
     * §2.18 — a deck must not appear imported when any step failed.
     *
     * An illegal deck is refused BEFORE Forge is asked anything and
     * before a row exists.
     */
    @Test
    fun `an illegal deck leaves no trace`() {
        val illegal = File("build/illegal.zip")
        ZipOutputStream(illegal.outputStream()).use { out ->
            out.putNextEntry(ZipEntry("Bad Deck.txt"))
            // Five copies, and only 10 cards.
            out.write("// Bad Deck\n\n5 Fiery Temper [INR:154]\n5 Rift Bolt [2X2:122]\n".toByteArray())
            out.closeEntry()
        }

        val result = importer.import(illegal, illegal.name, owner)
        assertTrue(result is ImportResult.Rejected, "got $result")
        result as ImportResult.Rejected
        assertEquals("DECK_NOT_LEGAL", result.code)
        // Every problem, not just the first.
        assertTrue(result.problems.size >= 2, "expected several problems: ${result.problems}")

        assertEquals(0, rowCount("imported_deck"))
        assertEquals(0, rowCount("deck_entry"))
    }

    /** §2.47, owner decision D2 — one unresolvable card rejects the deck. */
    @Test
    fun `a deck with an unknown card is refused entirely`() {
        val bogus = File("build/bogus-card.zip")
        ZipOutputStream(bogus.outputStream()).use { out ->
            out.putNextEntry(ZipEntry("Bogus.txt"))
            out.write(
                ("// Bogus\n\n59 Mountain [FRA:287]\n1 Totally Not A Real Card [ZZZ:1]\n")
                    .toByteArray(),
            )
            out.closeEntry()
        }

        val result = importer.import(bogus, bogus.name, owner)
        assertTrue(result is ImportResult.Rejected, "got $result")
        result as ImportResult.Rejected
        assertEquals("CARDS_NOT_RESOLVED", result.code)
        assertTrue(
            result.problems.single().contains("Totally Not A Real Card"),
            "the error should name the card: ${result.problems}",
        )
        assertEquals(0, rowCount("imported_deck"))
    }

    /**
     * §2.92–§2.94 — the Forge round trip.
     *
     * ZIP -> importer -> database -> Forge deck, with the counts
     * read from FORGE's own card pool rather than from the numbers
     * Arena sent. Comparing Arena's numbers to Arena's numbers would
     * prove nothing at all.
     */
    @Test
    fun `an imported deck becomes a Forge deck with the same cards`() {
        val result = importer.import(realExport, realExport.name, owner)
        assertTrue(result is ImportResult.Imported, "got $result")

        // Read the entries back OUT of the database, so this tests
        // what was stored rather than what was parsed.
        val sql =
            "SELECT line_number, quantity, card_name, set_code, collector_number " +
                "FROM deck_entry ORDER BY line_number"
        val stored =
            database!!.dataSource().connection.use { connection ->
                connection.prepareStatement(sql).use { statement ->
                    statement.executeQuery().use { rows ->
                        buildList {
                            while (rows.next()) {
                                add(
                                    DeckEntry(
                                        quantity = rows.getInt(2),
                                        name = rows.getString(3),
                                        setCode = rows.getString(4),
                                        collectorNumber = rows.getString(5),
                                        sourceText = "",
                                        lineNumber = rows.getInt(1),
                                    ),
                                )
                            }
                        }
                    }
                }
            }
        assertEquals(11, stored.size)

        val config =
            ServerConfig(
                host = "0.0.0.0",
                port = 0,
                databaseUrl = container!!.jdbcUrl,
                forgeWorkerJar = workerJar.path,
                dataRoot = dataRoot.path,
                forgeResRoot = resRoot.path,
            )
        val built = CardResolver(config).buildDeck(stored)

        // Forge's own pool holds every card the player wrote.
        assertEquals(emptyList(), built.unresolved, "Forge refused cards")
        assertEquals(65, built.totalCards, "Forge's deck should hold 65 cards")

        // And the right ones, in the right numbers. Forge files a
        // double-faced card under its FRONT face.
        assertEquals(25, built.countsByName["Mountain"])
        assertEquals(4, built.countsByName["Fiery Temper"])
        assertEquals(4, built.countsByName["Reckless Stormseeker"])
        assertEquals(11, built.countsByName.size, "11 distinct names")

        // §2.94 — every stored quantity survives the round trip.
        for (entry in stored) {
            assertEquals(
                entry.quantity,
                built.countsByName[entry.frontFaceName],
                "quantity drifted for ${entry.frontFaceName}",
            )
        }
    }

    /**
     * P2-M — missing artwork is NOT a failure.
     *
     * Deck Builder omits art it could not fetch and still exports,
     * deliberately and with a comment saying so. A package with
     * fewer images than cards is therefore valid, and §2.62's
     * "missing required PNG" must mean "render the fallback", never
     * "reject the import".
     *
     * Asserted here because every other test in this file uses a
     * package where every card has art, so the path was reasoned
     * about rather than exercised.
     */
    @Test
    fun `a package with missing artwork still imports`() {
        val partial = File("build/partial-art.zip")
        var kept = 0
        java.util.zip.ZipFile(realExport).use { source ->
            ZipOutputStream(partial.outputStream()).use { out ->
                for (entry in source.entries()) {
                    // Keep the decklist and only three of the images.
                    if (entry.name.endsWith(".png")) {
                        if (kept >= 3) continue
                        kept++
                    }
                    out.putNextEntry(ZipEntry(entry.name))
                    source.getInputStream(entry).use { it.copyTo(out) }
                    out.closeEntry()
                }
            }
        }

        val result = importer.import(partial, partial.name, owner)
        assertTrue(result is ImportResult.Imported, "missing art should not fail an import: $result")
        result as ImportResult.Imported

        assertEquals(65, result.totalCards, "the deck is still complete")
        assertEquals(3, result.artStored)
        // The count is reported so the page can say so plainly.
        assertEquals(8, result.entriesWithoutArt)
        assertEquals(3, rowCount("art_asset"))
    }

    /**
     * PHASE_07 §7.59, P7-W — the Deck Builder bundles each back face as its
     * own picture, filed under that face's name. The import keeps it by
     * that name (deck_face_art); a front face's picture stays on its entry.
     */
    @Test
    fun `a back face's own picture is kept by its face name`() {
        val withBack = File("build/with-back-face.zip")
        java.util.zip.ZipFile(realExport).use { source ->
            ZipOutputStream(withBack.outputStream()).use { out ->
                var firstImage: ByteArray? = null
                for (entry in source.entries()) {
                    out.putNextEntry(ZipEntry(entry.name))
                    val bytes = source.getInputStream(entry).use { it.readBytes() }
                    if (firstImage == null && entry.name.endsWith(".png")) firstImage = bytes
                    out.write(bytes)
                    out.closeEntry()
                }
                // A back face no entry names, in the exporter's shape.
                out.putNextEntry(ZipEntry("real_cards/Insectile Aberration [M21].png"))
                // Different bytes from every front, so it is its own asset.
                out.write(firstImage!! + byteArrayOf(0))
                out.closeEntry()
            }
        }

        val result = importer.import(withBack, withBack.name, owner)
        assertTrue(result is ImportResult.Imported, "a package with a back face imports: $result")

        val faces =
            database!!.dataSource().connection.use { connection ->
                connection.createStatement().executeQuery("SELECT face_name FROM deck_face_art").use { rows ->
                    buildList { while (rows.next()) add(rows.getString(1)) }
                }
            }
        assertEquals(listOf("insectile aberration"), faces, "only the face no entry names, by its name")
    }

    /** §2.38 — staging is cleaned up whatever happened. */
    @Test
    fun `no staging directory survives an import`() {
        importer.import(realExport, realExport.name, owner)
        val staging = File(dataRoot, "temp/deck-imports")
        val leftovers = staging.listFiles()?.toList().orEmpty()
        assertEquals(emptyList(), leftovers, "staging directories were left behind")
    }

    private fun categories(): Map<String, String?> =
        database!!.dataSource().connection.use { connection ->
            connection.createStatement()
                .executeQuery("SELECT card_name, card_category FROM deck_entry")
                .use { rows -> buildMap { while (rows.next()) put(rows.getString(1), rows.getString(2)) } }
        }

    /**
     * PHASE_07 Amendment 10 — an import stores Forge's category for
     * every card, and a deck imported before that existed gets it
     * from the one-time fill, with the same answers.
     */
    @Test
    fun `every imported card is sorted, and the fill sorts an older deck the same way`() {
        importer.import(realExport, realExport.name, owner)
        val atImport = categories()
        assertTrue(atImport.values.none { it == null }, "unsorted after import: $atImport")
        assertEquals("LAND", atImport["Mountain"])
        assertEquals("SPELL", atImport["Fiery Temper"])

        // As a deck from before V011 looks.
        database!!.dataSource().connection.use {
            it.createStatement().executeUpdate("UPDATE deck_entry SET card_category = NULL")
        }
        val config =
            ServerConfig(
                host = "0.0.0.0",
                port = 0,
                databaseUrl = container!!.jdbcUrl,
                forgeWorkerJar = workerJar.path,
                dataRoot = dataRoot.path,
                forgeResRoot = resRoot.path,
                databasePasswordValue = container!!.password,
                databaseUserValue = container!!.username,
            )
        val fill =
            DeckCategoryFill(
                database!!.dataSource(),
                CardResolver(config),
                org.slf4j.LoggerFactory.getLogger("test"),
            )
        assertEquals(1, fill.fillAll())
        assertEquals(atImport, categories())
        // Nothing left to do is nothing done -- no worker started.
        assertEquals(0, fill.fillAll())
    }

    @Test
    fun `art is shared between two decks rather than stored twice`() {
        // The same cards in a different deck: different package, so
        // not a duplicate, but the artwork is identical.
        importer.import(realExport, realExport.name, owner)
        val artAfterFirst = rowCount("art_asset")

        val second = File("build/second-deck.zip")
        java.util.zip.ZipFile(realExport).use { source ->
            ZipOutputStream(second.outputStream()).use { out ->
                for (entry in source.entries()) {
                    out.putNextEntry(ZipEntry(entry.name))
                    if (entry.name.endsWith(".txt")) {
                        // One fewer Mountain: a different deck, the
                        // same art.
                        val text =
                            source.getInputStream(entry).readBytes()
                                .toString(Charsets.UTF_8)
                                .replace("25 Mountain", "24 Mountain")
                        out.write(text.toByteArray())
                    } else {
                        source.getInputStream(entry).use { it.copyTo(out) }
                    }
                    out.closeEntry()
                }
            }
        }

        // PHASE_07 §7.65: the copy carries the same name, which this
        // owner already uses -- refused, nothing written, and the
        // refusal names the clash so the page can ask for another.
        val clash = importer.import(second, second.name, owner)
        assertTrue(clash is ImportResult.NameTaken, "got $clash")
        assertEquals(1, rowCount("imported_deck"))

        val result = importer.import(second, second.name, owner, requestedName = "Mono Red, one fewer Mountain")
        assertTrue(result is ImportResult.Imported, "got $result")
        assertEquals("Mono Red, one fewer Mountain", result.displayName)
        assertEquals(2, rowCount("imported_deck"))
        // §2.135: the second deck added no new art rows.
        assertEquals(artAfterFirst, rowCount("art_asset"))
    }
}
