package net.barnflix.proxic.deck

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * V002 deck schema — PHASE_02 §2.68, §2.71, §2.113.
 *
 * Against a real PostgreSQL, because the things worth asserting here
 * are constraints — a UNIQUE that stops a duplicate import, a
 * foreign key that stops art being deleted out from under a deck —
 * and an in-memory fake would enforce none of them.
 */
class DeckSchemaTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null

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

        val c = container!!
        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = c.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-data",
                    databasePasswordValue = c.password,
                    databaseUserValue = c.username,
                ),
            )!!.also { it.migrate() }
    }

    @AfterTest
    fun stop() {
        database?.close()
        container?.stop()
    }

    /**
     * Deliberately returns Unit rather than being generic.
     *
     * Tests here are written as `fun ...() = withConnection { }`, and
     * JUnit SILENTLY DOES NOT RUN a @Test method that returns a
     * value — not failing, not skipped, simply absent from the
     * report. Two tests vanished that way. With the lambda typed to
     * Unit, the last expression's value is discarded and the method
     * can never accidentally return one.
     */
    private fun withConnection(block: (Connection) -> Unit) {
        database!!.dataSource().connection.use(block)
    }

    private fun insertDeck(
        connection: Connection,
        checksum: String,
        name: String = "Test Deck",
    ): UUID {
        val id = UUID.randomUUID()
        connection.prepareStatement(
            """
            INSERT INTO imported_deck
              (deck_id, display_name, source_filename, package_sha256,
               total_cards, distinct_cards, import_schema_version, owner_user_id)
            VALUES (?, ?, ?, ?, 65, 11, 1, ?)
            """.trimIndent(),
        ).use { statement ->
            statement.setObject(1, id)
            statement.setString(2, name)
            statement.setString(3, "$name.zip")
            statement.setString(4, checksum)
            // PHASE_04 §4.16 — there is no such thing as an
            // ownerless deck any more, so even a schema test needs a
            // user. That constraint is the point of the phase.
            statement.setObject(5, ownerId())
            statement.executeUpdate()
        }
        return id
    }

    /** Created on first use; every deck needs an owner (§4.16). */
    private fun ownerId(): UUID {
        val accounts = net.barnflix.proxic.auth.Accounts(database!!.dataSource())
        accounts.findByUsername("RudeLeft")?.let { return it.userId }
        return accounts.createUser(
            "RudeLeft",
            "a perfectly fine passphrase",
            net.barnflix.proxic.auth.Role.ADMIN,
        ).userId
    }

    private val checksumA = "a".repeat(64)
    private val checksumB = "b".repeat(64)

    @Test
    fun `V002 applies and creates exactly the Phase 2 tables`() =
        withConnection { connection ->
            val tables = mutableListOf<String>()
            connection.createStatement().executeQuery(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name <> 'flyway_schema_history'
                ORDER BY table_name
                """.trimIndent(),
            ).use { rows -> while (rows.next()) tables += rows.getString(1) }

            // §2.68 forbids user ownership, sharing, ratings, folders,
            // tags and match history in this phase. Asserting the exact
            // set catches a speculative table as soon as it appears.
            assertEquals(
                listOf(
                    "app_user",
                    "art_asset",
                    "deck_entry",
                    "deck_share",
                    "imported_deck",
                    "user_session",
                ),
                tables,
            )
        }

    /**
     * The owner's D3 decision, enforced by the database.
     *
     * In code alone, two uploads racing would both pass a
     * check-then-insert and both succeed.
     */
    @Test
    fun `an identical package cannot be imported twice`() =
        withConnection { connection ->
            insertDeck(connection, checksumA, "First")
            val failure = runCatching { insertDeck(connection, checksumA, "Second") }.exceptionOrNull()
            assertTrue(failure != null, "the duplicate checksum was accepted")
            assertTrue(
                failure.toString().contains("package_sha256", ignoreCase = true),
                "the error should name the constraint: $failure",
            )
        }

    @Test
    fun `a different package with the same display name is allowed`() {
        // Names are not identity (§2.66).
        //
        // A BLOCK body, not `= withConnection { ... }`. An expression
        // body here returns whatever the last statement returns, and
        // JUnit SILENTLY DOES NOT RUN a @Test method that returns a
        // value. This test and the next one vanished that way: not
        // failing, not skipped, simply absent from the report.
        withConnection { connection ->
            insertDeck(connection, checksumA, "Mono Red")
            insertDeck(connection, checksumB, "Mono Red")
        }
    }

    @Test
    fun `art is shared between decks rather than copied`() =
        withConnection { connection ->
            val art = "c".repeat(64)
            connection.prepareStatement(
                "INSERT INTO art_asset (content_sha256, byte_size) VALUES (?, 123456)",
            ).use {
                it.setString(1, art)
                it.executeUpdate()
            }

            val first = insertDeck(connection, checksumA, "First")
            val second = insertDeck(connection, checksumB, "Second")
            for ((index, deck) in listOf(first, second).withIndex()) {
                connection.prepareStatement(
                    """
                    INSERT INTO deck_entry
                      (deck_id, line_number, quantity, card_name, source_text,
                       resolution_status, art_sha256)
                    VALUES (?, ?, 4, 'Lightning Bolt', '4 Lightning Bolt', 'RESOLVED', ?)
                    """.trimIndent(),
                ).use {
                    it.setObject(1, deck)
                    it.setInt(2, index + 1)
                    it.setString(3, art)
                    it.executeUpdate()
                }
            }

            // One row of art, two decks referencing it (§2.135).
            connection.createStatement().executeQuery("SELECT count(*) FROM art_asset").use {
                it.next()
                assertEquals(1, it.getInt(1))
            }
        }

    /**
     * §2.60 — imported art is immutable for a deck.
     *
     * Deleting an asset another deck still references would leave
     * that deck rendering nothing, so the database refuses.
     */
    @Test
    fun `art still in use cannot be deleted`() =
        withConnection { connection ->
            val art = "d".repeat(64)
            connection.prepareStatement(
                "INSERT INTO art_asset (content_sha256, byte_size) VALUES (?, 1)",
            ).use {
                it.setString(1, art)
                it.executeUpdate()
            }
            val deck = insertDeck(connection, checksumA)
            connection.prepareStatement(
                """
                INSERT INTO deck_entry
                  (deck_id, line_number, quantity, card_name, source_text,
                   resolution_status, art_sha256)
                VALUES (?, 1, 4, 'Lightning Bolt', '4 Lightning Bolt', 'RESOLVED', ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deck)
                it.setString(2, art)
                it.executeUpdate()
            }

            val failure =
                runCatching {
                    connection.prepareStatement("DELETE FROM art_asset WHERE content_sha256 = ?")
                        .use {
                            it.setString(1, art)
                            it.executeUpdate()
                        }
                }.exceptionOrNull()
            assertTrue(failure != null, "art in use was deleted")
        }

    /** §2.80 — deleting a deck takes its entries with it. */
    @Test
    fun `deleting a deck removes its entries`() =
        withConnection { connection ->
            val deck = insertDeck(connection, checksumA)
            connection.prepareStatement(
                """
                INSERT INTO deck_entry
                  (deck_id, line_number, quantity, card_name, source_text, resolution_status)
                VALUES (?, 1, 4, 'Fiery Temper', '4 Fiery Temper', 'RESOLVED')
                """.trimIndent(),
            ).use {
                it.setObject(1, deck)
                it.executeUpdate()
            }

            connection.prepareStatement("DELETE FROM imported_deck WHERE deck_id = ?")
                .use {
                    it.setObject(1, deck)
                    it.executeUpdate()
                }

            connection.createStatement().executeQuery("SELECT count(*) FROM deck_entry").use {
                it.next()
                assertEquals(0, it.getInt(1))
            }
        }

    @Test
    fun `an entry with no art is allowed`() {
        // The exporter omits art it could not fetch and still
        // succeeds, so a NULL here is normal, not a defect.
        withConnection { connection ->
            val deck = insertDeck(connection, checksumA)
            connection.prepareStatement(
                """
                INSERT INTO deck_entry
                  (deck_id, line_number, quantity, card_name, source_text, resolution_status)
                VALUES (?, 1, 4, 'Obscure Promo', '4 Obscure Promo', 'RESOLVED')
                """.trimIndent(),
            ).use {
                it.setObject(1, deck)
                it.executeUpdate()
            }
        }
    }

    @Test
    fun `nonsense quantities are refused by the database`() =
        withConnection { connection ->
            val deck = insertDeck(connection, checksumA)
            val failure =
                runCatching {
                    connection.prepareStatement(
                        """
                        INSERT INTO deck_entry
                          (deck_id, line_number, quantity, card_name, source_text, resolution_status)
                        VALUES (?, 1, 0, 'Fiery Temper', '0 Fiery Temper', 'RESOLVED')
                        """.trimIndent(),
                    ).use {
                        it.setObject(1, deck)
                        it.executeUpdate()
                    }
                }.exceptionOrNull()
            assertTrue(failure != null, "a quantity of zero was accepted")
        }
}
