package net.barnflix.proxic.admin

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.match.GameRecords
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.io.File
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Spec 0048 — the Admin purge, on a real database: what each kind counts
 * is exactly what it deletes, games being played are never touched, and a
 * fresh start keeps the accounts (F-0048-D, E, F).
 */
class AdminPurgeTest {
    private var container: FreshDatabase? = null
    private lateinit var db: Database
    private val root = File("build/test-data/purge-" + UUID.randomUUID())

    @BeforeTest
    fun start() {
        assumeTrue(runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false))
        val c = TestPostgres.fresh().also { container = it }
        val config =
            ServerConfig(
                host = "0.0.0.0",
                port = 0,
                databaseUrl = c.jdbcUrl,
                forgeWorkerJar = null,
                dataRoot = root.path,
                databasePasswordValue = c.password,
                databaseUserValue = c.username,
            )
        db = Database.connect(config)!!.also { it.migrate() }
    }

    @AfterTest
    fun stop() {
        if (::db.isInitialized) db.close()
        container?.stop()
        root.deleteRecursively()
    }

    private val records by lazy { GameRecords(root.path, Duration.ofDays(30)) }

    private fun purge(live: Set<UUID> = emptySet()): AdminPurge {
        val isLive = { id: UUID -> id in live }
        return AdminPurge(db.dataSource(), records, root.path, isLive) { live.size }
    }

    // --- a small world: accounts, a room, finished and running games ---------

    private val pat = UUID.randomUUID()
    private val rude = UUID.randomUUID()
    private val ash = UUID.randomUUID()

    private fun seedPeople() {
        for ((id, name) in listOf(pat to "Pat", rude to "RudeLeft", ash to "Ash")) {
            insert(
                "app_user",
                mapOf(
                    "user_id" to id,
                    "username" to name,
                    "username_normalized" to name.lowercase(),
                    "status" to "ACTIVE",
                    "role" to "PLAYER",
                ),
            )
        }
    }

    private fun game(
        a: UUID,
        b: UUID,
        status: String = "ENDED",
        endedAt: Instant = Instant.parse("2026-10-20T10:00:00Z"),
    ): UUID {
        val room = UUID.randomUUID()
        val setup = UUID.randomUUID()
        val match = UUID.randomUUID()
        insert(
            "room",
            mapOf(
                "room_id" to room,
                "host_user_id" to a,
                "status" to "CLOSED",
                "preset_id" to "open-format",
                "desired_player_count" to 2,
            ),
        )
        insert(
            "match_setup",
            mapOf("setup_id" to setup, "room_id" to room, "status" to "CONSUMED", "preset_id" to "open-format"),
        )
        insert(
            "match",
            mapOf(
                "match_id" to match,
                "setup_id" to setup,
                "room_id" to room,
                "status" to status,
                "preset_id" to "open-format",
                "started_at" to java.sql.Timestamp.from(endedAt.minusSeconds(3600)),
                "ended_at" to if (status == "ENDED") java.sql.Timestamp.from(endedAt) else null,
            ),
        )
        for ((seat, user) in listOf(1 to a, 2 to b)) {
            insert("match_participant", mapOf("match_id" to match, "user_id" to user, "seat_number" to seat))
        }
        records.fileFor(match).apply { parentFile.mkdirs() }.writeText("record")
        return match
    }

    /** Inserts a row, filling any other required column with a harmless value of its type. */
    private fun insert(
        table: String,
        given: Map<String, Any?>,
    ) {
        val values = given.toMutableMap()
        val jsonColumns = mutableSetOf<String>()
        db.dataSource().connection.use { c ->
            c.prepareStatement(
                """
                SELECT column_name, data_type FROM information_schema.columns
                 WHERE table_name = ? AND is_nullable = 'NO' AND column_default IS NULL
                """.trimIndent(),
            ).use { s ->
                s.setString(1, table)
                s.executeQuery().use { rows ->
                    while (rows.next()) {
                        val name = rows.getString(1)
                        if (name in values) continue
                        values[name] =
                            when (rows.getString(2)) {
                                "uuid" -> UUID.randomUUID()
                                "integer", "bigint", "smallint" -> 1
                                "boolean" -> false
                                "timestamp with time zone" -> java.sql.Timestamp.from(Instant.now())
                                "jsonb", "json" -> "{}".also { jsonColumns += name }
                                else -> "x" + UUID.randomUUID().toString().take(8)
                            }
                    }
                }
            }
            val columns = values.keys.toList()
            val marks = columns.joinToString { if (it in jsonColumns) "?::jsonb" else "?" }
            c.prepareStatement("INSERT INTO $table (${columns.joinToString()}) VALUES ($marks)").use { s ->
                columns.forEachIndexed { i, k -> s.setObject(i + 1, values[k]) }
                s.executeUpdate()
            }
        }
    }

    private fun count(sql: String): Int =
        db.dataSource().connection.use { c ->
            c.createStatement().use { s -> s.executeQuery(sql).use { r -> if (r.next()) r.getInt(1) else 0 } }
        }

    private fun exists(match: UUID) = count("SELECT count(*) FROM match WHERE match_id = '$match'") == 1

    // --- the tests --------------------------------------------------------------

    @Test
    fun `a player purge removes that player's finished games from both sides, and nothing else`() {
        seedPeople()
        val patRude = (1..3).map { game(pat, rude) }
        val patAsh = game(ash, pat)
        val rudeAsh = game(rude, ash)
        val patPlaying = game(pat, rude, status = "RUNNING")

        val preview = purge(setOf(patPlaying)).preview(PurgeScope.Player(pat))
        assertEquals(4, preview.games, "Pat's four finished games, never the one being played")
        assertEquals(mapOf("RudeLeft" to 3, "Ash" to 1), preview.against)

        val done = purge(setOf(patPlaying)).purge(PurgeScope.Player(pat))
        assertEquals(preview, done, "it deletes exactly what it showed")
        assertTrue((patRude + patAsh).none(::exists))
        assertTrue(exists(rudeAsh) && exists(patPlaying))
        assertTrue((patRude + patAsh).none { records.fileFor(it).exists() }, "their recordings too")
        assertTrue(records.fileFor(rudeAsh).exists())
        assertEquals(3, count("SELECT count(*) FROM app_user"), "accounts stay")
    }

    @Test
    fun `a date purge removes the finished games that ended before it`() {
        seedPeople()
        val old = game(pat, rude, endedAt = Instant.parse("2026-10-01T10:00:00Z"))
        val recent = game(pat, rude, endedAt = Instant.parse("2026-10-30T10:00:00Z"))
        val at = PurgeScope.Before(Instant.parse("2026-10-15T00:00:00Z"))
        assertEquals(1, purge().preview(at).games)
        purge().purge(at)
        assertFalse(exists(old))
        assertTrue(exists(recent))
    }

    @Test
    fun `a fresh start keeps the accounts and clears the rest, and waits while a game is played`() {
        seedPeople()
        game(pat, rude)
        val playing = game(rude, ash, status = "RUNNING")
        insert("sign_in_event", mapOf("user_id" to pat, "kind" to "SIGNED_IN", "username" to "Pat"))
        insert("bug_report", mapOf("user_id" to pat, "kind" to "PROBLEM", "status" to "NEW"))
        insert("belt_reset", mapOf("reset_by" to rude))
        File(root, "art/original/ab").mkdirs()
        File(root, "art/original/ab/picture.png").writeText("png")

        val refused = purge(setOf(playing)).preview(PurgeScope.Everything)
        assertNotNull(refused.refused, "refused while a game is played")
        assertNull(purge(setOf(playing)).purge(PurgeScope.Everything))
        assertEquals(2, count("SELECT count(*) FROM match"))

        db.dataSource().connection.use { c ->
            c.createStatement().use {
                it.executeUpdate("UPDATE match SET status = 'TERMINATED' WHERE match_id = '$playing'")
            }
        }
        val preview = purge().preview(PurgeScope.Everything)
        assertNull(preview.refused)
        assertEquals(2, preview.games)
        assertEquals(3, preview.accountsKept)
        val done = purge().purge(PurgeScope.Everything)
        assertEquals(preview, done)
        for (table in listOf(
            "match",
            "match_participant",
            "room",
            "imported_deck",
            "art_asset",
            "bug_report",
            "sign_in_event",
            "belt_reset",
        )) {
            assertEquals(0, count("SELECT count(*) FROM $table"), "$table is empty")
        }
        assertEquals(3, count("SELECT count(*) FROM app_user"), "accounts stay")
        assertFalse(File(root, "art/original/ab/picture.png").exists(), "the pictures are gone")
        assertTrue(File(root, "match-records").listFiles().orEmpty().isEmpty(), "the recordings are gone")
    }

    @Suppress("unused")
    private val keep: DataSource? = null
}
