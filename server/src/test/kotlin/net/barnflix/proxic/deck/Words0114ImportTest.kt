package net.barnflix.proxic.deck

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * Spec 0114, F-0114-A -- the deck import's sentences, from real packages
 * through the real importer and the real worker, as the Deck Depot and the
 * Deck Builder show them: the refusal's words and each problem line,
 * exactly, with the codes unchanged (PROTO-006).
 */
class Words0114ImportTest {
    private val realExport = File("../Test Deck/Basic_Mono_Red_65_Card_Deck.zip")
    private val workerJar = File("../forge-worker/target/forge-worker-0.1.0.jar")
    private val resRoot = File("../spikes/forge-phase0a/forge-upstream/forge-gui/res")

    private var container: FreshDatabase? = null
    private var database: Database? = null
    private lateinit var dataRoot: File
    private lateinit var config: ServerConfig
    private lateinit var importer: DeckImporter
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
        container = TestPostgres.fresh()
        dataRoot = File("build/test-words-import-${System.currentTimeMillis()}")
        config =
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
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", net.barnflix.proxic.auth.Role.PLAYER)
        owner = accounts.findByUsername("RudeLeft")!!.userId
    }

    @AfterTest
    fun stop() {
        database?.close()
        container?.stop()
        if (::dataRoot.isInitialized) dataRoot.deleteRecursively()
    }

    private fun zipOf(
        name: String,
        vararg members: Pair<String, ByteArray>,
    ): File {
        val file = File(dataRoot, name).apply { parentFile.mkdirs() }
        ZipOutputStream(file.outputStream()).use { out ->
            for ((member, bytes) in members) {
                out.putNextEntry(ZipEntry(member))
                out.write(bytes)
                out.closeEntry()
            }
        }
        return file
    }

    private fun refused(
        file: File,
        with: DeckImporter = importer,
    ): ImportResult.Rejected = assertIs<ImportResult.Rejected>(with.import(file, file.name, owner))

    private val mountains = "// Words\n\n60 Mountain [FRA:287]\n"

    /** The real export's first picture, a real PNG. */
    private val realPicture: ByteArray by lazy {
        java.util.zip.ZipFile(realExport).use { source ->
            source.entries().asSequence().first { it.name.endsWith(".png") }
                .let { entry -> source.getInputStream(entry).use { it.readBytes() } }
        }
    }

    @Test
    fun `W2-001 a card Arena does not know`() {
        val result =
            refused(zipOf("unknown.zip", "Deck.txt" to "// Words\n\n59 Mountain [FRA:287]\n1 Foo\n".toByteArray()))
        assertEquals("CARDS_NOT_RESOLVED", result.code)
        assertEquals("Some cards in this deck are not supported yet.", result.detail)
        assertEquals(listOf("Line 4, Foo: Arena doesn't know this card yet."), result.problems)
    }

    @Test
    fun `W2-086 and W2-136 a picture that is not a picture, with no code in front`() {
        val result =
            refused(
                zipOf(
                    "bad-picture.zip",
                    "Deck.txt" to mountains.toByteArray(),
                    "real_cards/Mountain [FRA].png" to "not a picture at all".toByteArray(),
                ),
            )
        assertEquals("INVALID_ARTWORK", result.code)
        assertEquals("Some pictures in this deck can't be used:", result.detail)
        assertEquals(listOf("The picture for Mountain is not a PNG or JPEG file."), result.problems)
    }

    @Test
    fun `W2-088 a picture named but not sent, and not held`() {
        val sha = "ab".repeat(32)
        val named = """{"real_cards/Lightning Bolt [M10].png": "$sha"}"""
        val result =
            refused(
                zipOf(
                    "not-held.zip",
                    "Deck.txt" to "// Words\n\n56 Mountain [FRA:287]\n4 Lightning Bolt [M10:146]\n".toByteArray(),
                    "real_cards/Mountain [FRA].png" to realPicture,
                    "pictures.json" to named.toByteArray(),
                ),
            )
        assertEquals("PICTURE_NOT_HELD", result.code)
        assertEquals(
            listOf(
                "Lightning Bolt: its picture was not sent, and none of your decks has it. " +
                    "Send the deck again with its pictures.",
            ),
            result.problems,
        )
    }

    @Test
    fun `W2-089 a list of pictures that cannot be read`() {
        val result =
            refused(
                zipOf(
                    "bad-list.zip",
                    "Deck.txt" to mountains.toByteArray(),
                    "real_cards/Mountain [FRA].png" to realPicture,
                    "pictures.json" to "not json".toByteArray(),
                ),
            )
        assertEquals("PICTURE_NOT_HELD", result.code)
        assertEquals(
            listOf("The list of pictures in this deck file could not be read. Send the deck again."),
            result.problems,
        )
    }

    @Test
    fun `W2-090 too many pictures named`() {
        val named =
            (1..PackageLimits.MAX_IMAGE_COUNT).joinToString(",", "{", "}") {
                "\"real_cards/Card $it.png\": \"${"cd".repeat(32)}\""
            }
        val result =
            refused(
                zipOf(
                    "many-named.zip",
                    "Deck.txt" to mountains.toByteArray(),
                    "real_cards/Mountain [FRA].png" to realPicture,
                    "pictures.json" to named.toByteArray(),
                ),
            )
        assertEquals("PICTURE_NOT_HELD", result.code)
        assertEquals(listOf("This deck has 501 pictures, and the most a deck can have is 500."), result.problems)
    }

    @Test
    fun `W2-091 an empty list says no line number`() {
        val result = refused(zipOf("empty-list.zip", "Deck.txt" to "// Nothing\n".toByteArray()))
        assertEquals("INVALID_DECK_LIST", result.code)
        assertEquals("The deck list has no cards in it.", result.detail)
    }

    @Test
    fun `W2-091 and W2-092 a bad line says its number`() {
        val result = refused(zipOf("bad-line.zip", "Deck.txt" to "// Words\n\nLightning Bolt\n".toByteArray()))
        assertEquals("INVALID_DECK_LIST", result.code)
        assertEquals(
            "Line 3: This line should be a number of copies and then a card name, for example \"4 Lightning Bolt\".",
            result.detail,
        )
    }

    @Test
    fun `W2-098 a deck list too long`() {
        // Lines that do not compress, so the deck file's own checks pass and the list's does not.
        val random = java.util.Random(114)
        val filler = (1..60_000).joinToString("") { "// ${java.lang.Long.toHexString(random.nextLong())}\n" }
        val long = "// Words\n\n60 Mountain [FRA:287]\n$filler"
        val result = refused(zipOf("long.zip", "Deck.txt" to long.toByteArray()))
        assertEquals("DECK_TEXT_TOO_LARGE", result.code)
        assertEquals("The deck list is too long to import. Remove some lines and send it again.", result.detail)
    }

    @Test
    fun `W2-099 and W2-100 the card checker down is said once`() {
        val down = config.copy(forgeWorkerJar = File(dataRoot, "no-such-worker.jar").path)
        val result =
            refused(
                zipOf("unchecked.zip", "Deck.txt" to mountains.toByteArray()),
                DeckImporter(down, database!!.dataSource(), CardResolver(down)),
            )
        assertEquals("CARDS_NOT_RESOLVED", result.code)
        assertEquals("The cards could not be checked just now. Try sending the deck again in a minute.", result.detail)
        assertEquals(emptyList(), result.problems, "said once, never per card")
    }
}
