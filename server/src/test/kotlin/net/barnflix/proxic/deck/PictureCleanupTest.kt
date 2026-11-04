package net.barnflix.proxic.deck

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.slf4j.LoggerFactory
import org.testcontainers.DockerClientFactory
import java.io.File
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Spec 0052, F-0052-D and F-0052-E — the weekly picture clean-up keeps what
 * a deck or a running game uses, marks the rest unused, deletes it only
 * after 30 unused days, and deletes old files no picture row knows.
 */
class PictureCleanupTest {
    private var container: FreshDatabase? = null
    private lateinit var db: Database
    private val root = File("build/test-data/pictures-" + UUID.randomUUID())
    private lateinit var owner: UUID
    private val start: Instant = Instant.parse("2026-11-02T12:00:00Z")

    @BeforeTest
    fun setUp() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        val c = TestPostgres.fresh().also { container = it }
        db =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = c.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = root.path,
                    databasePasswordValue = c.password,
                    databaseUserValue = c.username,
                ),
            )!!.also { it.migrate() }
        val accounts = Accounts(db.dataSource())
        accounts.createUser("RudeLeft", "a password long enough", Role.ADMIN)
        owner = accounts.findByUsername("RudeLeft")!!.userId
    }

    @AfterTest
    fun tearDown() {
        if (::db.isInitialized) db.close()
        container?.stop()
        root.deleteRecursively()
    }

    private fun sha(n: Int) = n.toString().padStart(64, '0')

    /** A stored picture: its row and its files (original, table copy, close-up), [age] old on disk. */
    private fun picture(
        n: Int,
        age: Duration = Duration.ofDays(60),
    ): String {
        val hash = sha(n)
        db.dataSource().connection.use { connection ->
            connection.prepareStatement("INSERT INTO art_asset (content_sha256, byte_size) VALUES (?, 3)").use {
                it.setString(1, hash)
                it.executeUpdate()
            }
        }
        files(hash, age)
        return hash
    }

    private fun files(
        hash: String,
        age: Duration,
    ) {
        for ((folder, ext) in listOf("original" to "png", "display" to "jpg", "zoom" to "jpg")) {
            val file = File(root, "art/$folder/${hash.substring(0, 2)}/$hash.$ext")
            file.parentFile.mkdirs()
            file.writeBytes(byteArrayOf(1, 2, 3))
            file.setLastModified(start.minus(age).toEpochMilli())
        }
    }

    private fun stored(hash: String) = File(root, "art/original/${hash.substring(0, 2)}/$hash.png").isFile

    private fun rowExists(hash: String): Boolean =
        db.dataSource().connection.use { connection ->
            connection.prepareStatement("SELECT 1 FROM art_asset WHERE content_sha256 = ?").use {
                it.setString(1, hash)
                it.executeQuery().use { rows -> rows.next() }
            }
        }

    /** A deck using [hash] as a card picture (or, with [crop], as an art crop). */
    private fun deckUsing(
        hash: String,
        crop: Boolean = false,
    ): UUID {
        val deckId = UUID.randomUUID()
        db.dataSource().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256, total_cards,
                     distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, ?, 'd.zip', ?, 60, 1, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, "Deck $deckId")
                it.setString(3, UUID.randomUUID().toString().replace("-", "").repeat(2))
                it.setObject(4, owner)
                it.executeUpdate()
            }
            val sql =
                if (crop) {
                    "INSERT INTO deck_crop_art (deck_id, face_name, art_sha256) VALUES (?, 'mountain', ?)"
                } else {
                    """
                    INSERT INTO deck_entry (deck_id, line_number, quantity, card_name, source_text,
                                            resolution_status, art_sha256)
                    VALUES (?, 1, 60, 'Mountain', '60 Mountain', 'RESOLVED', ?)
                    """.trimIndent()
                }
            connection.prepareStatement(sql).use {
                it.setObject(1, deckId)
                it.setString(2, hash)
                it.executeUpdate()
            }
        }
        return deckId
    }

    private fun deleteDeck(deckId: UUID) {
        db.dataSource().connection.use { connection ->
            connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?").use {
                it.setObject(1, deckId)
                it.executeUpdate()
            }
        }
    }

    private fun cleanupAt(
        day: Long,
        inPlay: Set<String> = emptySet(),
    ) = PictureCleanup(
        db.dataSource(),
        root,
        { inPlay },
        Clock.fixed(start.plus(Duration.ofDays(day)), ZoneOffset.UTC),
    )

    @Test
    fun `a picture a deck uses is never touched, and an unused one goes after 30 days`() {
        val used = picture(1)
        val crop = picture(2)
        val dropped = picture(3)
        deckUsing(used)
        deckUsing(crop, crop = true)
        val gone = deckUsing(dropped)
        deleteDeck(gone)

        val first = cleanupAt(0).run()
        assertEquals(1, first.markedUnused, "only the dropped deck's picture is unused")
        assertEquals(0, first.deleted, "unused today is not unused for 30 days")
        assertTrue(stored(dropped))

        assertEquals(0, cleanupAt(29).run().deleted)
        val later = cleanupAt(31).run()
        assertEquals(1, later.deleted)
        assertFalse(stored(dropped) || rowExists(dropped), "row and files go")
        assertTrue(stored(used) && stored(crop), "a card picture and an art crop a deck uses stay")
        assertTrue(rowExists(used) && rowExists(crop))
        assertTrue(later.bytesFreed > 0)
    }

    @Test
    fun `a picture used again loses its mark`() {
        val picture = picture(4)
        cleanupAt(0).run()
        deckUsing(picture)
        val report = cleanupAt(31).run()
        assertEquals(1, report.inUseAgain)
        assertEquals(0, report.deleted)
        assertTrue(stored(picture))
    }

    @Test
    fun `a running game's picture is kept, and so is one stored again lately`() {
        val playing = picture(5)
        val resent = picture(6)
        cleanupAt(0).run()
        files(resent, Duration.ofDays(-30))
        val report = cleanupAt(31, inPlay = setOf(playing)).run()
        assertEquals(0, report.deleted)
        assertTrue(stored(playing) && stored(resent))
    }

    @Test
    fun `old files no picture row knows are deleted, new ones kept`() {
        val failedOld = sha(7)
        val failedNew = sha(8)
        files(failedOld, Duration.ofDays(40))
        files(failedNew, Duration.ofDays(2))
        val report = cleanupAt(0).run()
        assertEquals(3, report.orphanFiles, "the old one's original, table copy and close-up")
        assertFalse(stored(failedOld))
        assertTrue(stored(failedNew))
    }

    @Test
    fun `the weekly schedule runs it and says what it did`() {
        val unused = picture(9)
        val schedule = PictureCleanupSchedule(cleanupAt(0), LoggerFactory.getLogger("test"))
        schedule.runQuietly()
        db.dataSource().connection.use { connection ->
            connection.prepareStatement("SELECT unused_since FROM art_asset WHERE content_sha256 = ?").use {
                it.setString(1, unused)
                it.executeQuery().use { rows ->
                    assertTrue(rows.next() && rows.getTimestamp(1) != null, "marked by a scheduled run")
                }
            }
        }
    }
}
