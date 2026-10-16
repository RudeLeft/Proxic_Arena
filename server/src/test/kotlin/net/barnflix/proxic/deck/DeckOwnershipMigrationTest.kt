package net.barnflix.proxic.deck

import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.postgresql.ds.PGSimpleDataSource
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The V004 ownership migration — PHASE_04 §4.13–§4.16, §4.88–§4.91.
 *
 * A migration that runs once, on data that already exists, in an
 * environment nobody can re-run. The tests that matter are the ones
 * about rows that are ALREADY THERE when it executes, so each of
 * these migrates to V003 first, puts data in, and only then applies
 * V004 — which is the order production experienced.
 */
class DeckOwnershipMigrationTest {
    private var container: PostgreSQLContainer<*>? = null

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            PostgreSQLContainer("postgres:16.4-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun dataSource(): DataSource =
        PGSimpleDataSource().apply {
            setUrl(container!!.jdbcUrl)
            user = container!!.username
            password = container!!.password
        }

    /** Migrate as far as a named version, the way production arrived there. */
    private fun migrateTo(
        dataSource: DataSource,
        version: String,
    ) {
        Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .target(org.flywaydb.core.api.MigrationVersion.fromVersion(version))
            .load()
            .migrate()
    }

    private fun migrateAll(dataSource: DataSource) {
        Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate()
    }

    /** `(Connection) -> Unit`: a @Test returning a value is SKIPPED by JUnit. */
    private fun withConnection(
        dataSource: DataSource,
        body: (Connection) -> Unit,
    ) {
        dataSource.connection.use(body)
    }

    /** A deck row, as Phase 2 left them: no owner column yet. */
    private fun insertLegacyDeck(
        dataSource: DataSource,
        name: String,
    ): UUID {
        val deckId = UUID.randomUUID()
        withConnection(dataSource) { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256, total_cards,
                     distinct_cards, import_schema_version)
                VALUES (?, ?, ?, ?, 65, 11, 1)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, name)
                it.setString(3, "$name.zip")
                it.setString(4, "%064x".format(java.math.BigInteger(130, java.util.Random())))
                it.executeUpdate()
            }
        }
        return deckId
    }

    private fun hasOwnerColumn(dataSource: DataSource): Boolean {
        var present = false
        withConnection(dataSource) { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery(
                    """
                    SELECT count(*) FROM information_schema.columns
                    WHERE table_name = 'imported_deck' AND column_name = 'owner_user_id'
                    """.trimIndent(),
                ).use { rows ->
                    rows.next()
                    present = rows.getInt(1) > 0
                }
            }
        }
        return present
    }

    private fun ownerOf(
        dataSource: DataSource,
        deckId: UUID,
    ): UUID? {
        var owner: UUID? = null
        withConnection(dataSource) { connection ->
            connection.prepareStatement(
                "SELECT owner_user_id FROM imported_deck WHERE deck_id = ?",
            ).use { statement ->
                statement.setObject(1, deckId)
                statement.executeQuery().use { rows ->
                    if (rows.next()) owner = rows.getObject(1, UUID::class.java)
                }
            }
        }
        return owner
    }

    /**
     * §4.13–§4.15, owner decision D1.
     *
     * The decks that existed before ownership did are assigned to the
     * named account, and to no other.
     */
    @Test
    fun `a legacy deck is assigned to the named owner`() {
        val dataSource = dataSource()
        migrateTo(dataSource, "3")

        Accounts(dataSource).createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
        val legacy = insertLegacyDeck(dataSource, "Basic_Mono_Red_65_Card_Deck")
        // The precondition is that the COLUMN does not exist yet --
        // querying it here was this test's first bug, and the error
        // was the schema being right.
        assertTrue(!hasOwnerColumn(dataSource), "owner_user_id should not exist at V003")

        migrateAll(dataSource)

        val expected = Accounts(dataSource).findByUsername("RudeLeft")!!.userId
        assertEquals(expected, ownerOf(dataSource, legacy))
    }

    /**
     * §4.14 — assignment is to a NAMED account, not to "an admin".
     *
     * The negative control for the test above: with a different
     * administrator present and no `rudeleft`, the migration must
     * refuse rather than pick the admin it can see.
     */
    @Test
    fun `without the named account the migration refuses rather than guessing`() {
        val dataSource = dataSource()
        migrateTo(dataSource, "3")

        Accounts(dataSource).createUser("SomebodyElse", "a perfectly fine passphrase", Role.ADMIN)
        insertLegacyDeck(dataSource, "Not_Mine")

        val failure = runCatching { migrateAll(dataSource) }.exceptionOrNull()
        assertTrue(failure != null, "the migration should have failed")

        val text = generateSequence(failure) { it.cause }.joinToString(" ") { it.message.orEmpty() }
        // It must say what is wrong and what to do, not just violate
        // a constraint.
        assertTrue(text.contains("RudeLeft"), text)
        assertTrue(text.contains("§4.14") || text.contains("4.14"), text)
    }

    /**
     * A fresh install has no decks, so there is nothing to assign and
     * nothing to fail.
     */
    @Test
    fun `an empty database migrates cleanly`() {
        val dataSource = dataSource()
        migrateAll(dataSource)

        withConnection(dataSource) { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery(
                    """
                    SELECT is_nullable FROM information_schema.columns
                    WHERE table_name = 'imported_deck' AND column_name = 'owner_user_id'
                    """.trimIndent(),
                ).use { rows ->
                    rows.next()
                    // §4.16 — no permanent ownerless decks.
                    assertEquals("NO", rows.getString(1))
                }
            }
        }
    }

    /**
     * §4.26 — one share per (deck, recipient), enforced by the
     * database because two requests racing would both pass a
     * check-then-insert.
     */
    @Test
    fun `a duplicate share is refused by the database`() {
        val dataSource = dataSource()
        migrateTo(dataSource, "3")
        val accounts = Accounts(dataSource)
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
        val deck = insertLegacyDeck(dataSource, "Shared_Deck")
        migrateAll(dataSource)

        accounts.createUser("Pat", "a perfectly fine passphrase", Role.PLAYER)
        val owner = accounts.findByUsername("RudeLeft")!!.userId
        val pat = accounts.findByUsername("Pat")!!.userId

        fun share() =
            withConnection(dataSource) { connection ->
                connection.prepareStatement(
                    "INSERT INTO deck_share (share_id, deck_id, shared_with_user_id, created_by_user_id) " +
                        "VALUES (?, ?, ?, ?)",
                ).use {
                    it.setObject(1, UUID.randomUUID())
                    it.setObject(2, deck)
                    it.setObject(3, pat)
                    it.setObject(4, owner)
                    it.executeUpdate()
                }
            }

        share()
        assertTrue(runCatching { share() }.isFailure, "a second identical share was accepted")
    }

    /**
     * §4.91 — deleting a deck must not leave orphan shares.
     */
    @Test
    fun `deleting a deck removes its shares`() {
        val dataSource = dataSource()
        migrateTo(dataSource, "3")
        val accounts = Accounts(dataSource)
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
        val deck = insertLegacyDeck(dataSource, "Doomed_Deck")
        migrateAll(dataSource)

        accounts.createUser("Pat", "a perfectly fine passphrase", Role.PLAYER)
        val owner = accounts.findByUsername("RudeLeft")!!.userId
        val pat = accounts.findByUsername("Pat")!!.userId

        withConnection(dataSource) { connection ->
            connection.prepareStatement(
                "INSERT INTO deck_share (share_id, deck_id, shared_with_user_id, created_by_user_id) " +
                    "VALUES (?, ?, ?, ?)",
            ).use {
                it.setObject(1, UUID.randomUUID())
                it.setObject(2, deck)
                it.setObject(3, pat)
                it.setObject(4, owner)
                it.executeUpdate()
            }
            connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?").use {
                it.setObject(1, deck)
                it.executeUpdate()
            }
        }

        var shares = -1
        withConnection(dataSource) { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT count(*) FROM deck_share").use { rows ->
                    rows.next()
                    shares = rows.getInt(1)
                }
            }
        }
        assertEquals(0, shares)
    }

    /**
     * §4.90 — a share cannot name a user who does not exist.
     */
    @Test
    fun `a share to an unknown user is refused`() {
        val dataSource = dataSource()
        migrateAll(dataSource)
        val accounts = Accounts(dataSource)
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
        val owner = accounts.findByUsername("RudeLeft")!!.userId

        // No deck and no recipient: both foreign keys should refuse.
        val failed =
            runCatching {
                withConnection(dataSource) { connection ->
                    connection.prepareStatement(
                        "INSERT INTO deck_share (share_id, deck_id, shared_with_user_id, created_by_user_id) " +
                            "VALUES (?, ?, ?, ?)",
                    ).use {
                        it.setObject(1, UUID.randomUUID())
                        it.setObject(2, UUID.randomUUID())
                        it.setObject(3, UUID.randomUUID())
                        it.setObject(4, owner)
                        it.executeUpdate()
                    }
                }
            }.isFailure
        assertTrue(failed, "a share referencing nothing was accepted")
    }

    // --- PHASE 4 AMENDMENT 4: per-owner package uniqueness ----------

    /** Insert a deck with an explicit checksum, for the two tests below. */
    private fun insertWithChecksum(
        dataSource: DataSource,
        name: String,
        owner: UUID,
        checksum: String,
    ) {
        withConnection(dataSource) { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256, total_cards,
                     distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, ?, ?, ?, 65, 11, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, UUID.randomUUID())
                it.setString(2, name)
                it.setString(3, "$name.zip")
                it.setString(4, checksum)
                it.setObject(5, owner)
                it.executeUpdate()
            }
        }
    }

    /**
     * The fault this amendment exists for.
     *
     * Globally unique checksums meant whoever imported a file first
     * owned it forever, and the refusal told the second user the
     * name and id of a deck they had no access to.
     */
    @Test
    fun `two owners may each import the same package`() {
        val dataSource = dataSource()
        migrateAll(dataSource)
        val accounts = Accounts(dataSource)
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
        accounts.createUser("Pat", "a perfectly fine passphrase", Role.PLAYER)
        val checksum = "d".repeat(64)

        insertWithChecksum(dataSource, "Mine", accounts.findByUsername("RudeLeft")!!.userId, checksum)
        insertWithChecksum(dataSource, "Also_Mine", accounts.findByUsername("Pat")!!.userId, checksum)

        var decks = 0
        withConnection(dataSource) { connection ->
            connection.prepareStatement(
                "SELECT count(*) FROM imported_deck WHERE package_sha256 = ?",
            ).use { statement ->
                statement.setString(1, checksum)
                statement.executeQuery().use { rows ->
                    rows.next()
                    decks = rows.getInt(1)
                }
            }
        }
        assertEquals(2, decks, "each owner should hold their own copy")
    }

    /**
     * The negative control. Per-owner does not mean "no rule": the
     * same owner importing the same package twice is still refused,
     * which is owner decision D3 from Phase 2 and the reason the
     * check exists at all.
     */
    @Test
    fun `one owner still cannot import the same package twice`() {
        val dataSource = dataSource()
        migrateAll(dataSource)
        val accounts = Accounts(dataSource)
        accounts.createUser("RudeLeft", "a perfectly fine passphrase", Role.ADMIN)
        val owner = accounts.findByUsername("RudeLeft")!!.userId
        val checksum = "e".repeat(64)

        insertWithChecksum(dataSource, "First", owner, checksum)
        assertTrue(
            runCatching { insertWithChecksum(dataSource, "Second", owner, checksum) }.isFailure,
            "the same owner imported one package twice",
        )
    }
}
