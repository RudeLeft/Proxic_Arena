package net.barnflix.proxic.room

import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.deck.CardResolver
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Pre-match deck validation — PHASE_05 §5.92, §5.95–§5.99.
 *
 * Proxic's half of the preflight, which is the half that can be
 * tested without a Forge worker: the amended §2.45 makes Open
 * Format's bounds Proxic's policy rather than Magic's rules,
 * precisely because Forge cannot express them.
 *
 * Forge's half — BUILD_DECK — is PHASE_02's, tested there against a
 * real worker. What IS tested here is the boundary between them:
 * which check runs first, and what happens when Forge cannot be
 * reached at all.
 */
class MatchPreflightTest {
    private var container: FreshDatabase? = null
    private var database: Database? = null

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            TestPostgres.fresh()
        database = Database.connect(config())!!.also { it.migrate() }
        Accounts(database!!.dataSource())
            .createUser("RudeLeft", "a perfectly fine passphrase", Role.PLAYER)
    }

    @AfterTest
    fun stop() {
        database?.close()
        container!!.stop()
    }

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            // No worker. Every test here either never reaches Forge
            // or is specifically about what happens when it cannot.
            forgeWorkerJar = null,
            dataRoot = "build/test-preflight",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun preflight() = MatchPreflight(database!!.dataSource(), CardResolver(config()))

    /** §5.50 — the deck is gone, or was never theirs to begin with. */
    @Test
    fun `a deck that does not exist is reported as unavailable`() {
        val check = preflight().validate(UUID.randomUUID())
        assertEquals(DeckVerdict.ACCESS_REVOKED, check.verdict)
    }

    /**
     * §2.45, §5.94 — Open Format's deck size, re-checked HERE.
     *
     * "At import and again at match setup" is the amended §2.45's
     * wording, and this is the second place. A deck stored before a
     * rule changed is not evidence that it still passes.
     */
    @Test
    fun `an oversized deck is invalid for the preset`() {
        val deckId = deckOf(70)
        val check = preflight().validate(deckId)

        assertEquals(DeckVerdict.INVALID_FOR_PRESET, check.verdict, check.detail)
        assertTrue(check.detail.isNotBlank(), "the owner needs to know which rule")
    }

    /** §2.45 — at most four copies, basics excepted. */
    @Test
    fun `a fifth copy is invalid for the preset`() {
        val deckId = deckOf(60, fiveOfOne = true)
        val check = preflight().validate(deckId)
        assertEquals(DeckVerdict.INVALID_FOR_PRESET, check.verdict, check.detail)
    }

    /**
     * The order, and the failure mode.
     *
     * A legal-by-Proxic deck gets as far as Forge, and with no
     * worker configured it FAILS rather than passing. That is the
     * assertion worth having: a preflight that failed open would
     * launch matches with decks nothing had checked, on exactly the
     * deployment where the worker is misconfigured.
     */
    @Test
    fun `a deck Proxic accepts still needs Forge, and fails closed without it`() {
        val deckId = deckOf(60)
        val check = preflight().validate(deckId)

        assertEquals(DeckVerdict.FORGE_RESOLUTION_ERROR, check.verdict, check.detail)
        // §5.99 — a safe application-level message, not a trace.
        assertTrue(check.detail.isNotBlank())
        assertTrue(
            !check.detail.contains("Exception") && !check.detail.contains(".jar"),
            "a browser must not see internals: ${check.detail}",
        )
    }

    /**
     * Spec 0024, F-0024-D (the room's half) — a card kept in the player's
     * own printing (one Forge lacks) passes the check before a game, because
     * the check asks Forge about the printing it recorded at import, as the
     * match does. Asking with the player's printing refused it ("Not
     * supported yet") and the game could never start.
     */
    @Test
    fun `a card kept in the player's own printing passes the check`() {
        val workerJar = java.io.File("../forge-worker/target/forge-worker-0.1.0.jar")
        val resRoot = java.io.File("../spikes/forge-phase0a/forge-upstream/forge-gui/res")
        assumeTrue(workerJar.isFile, "SKIPPED: build the worker first")
        assumeTrue(resRoot.isDirectory, "SKIPPED: no Forge resource checkout")

        val deckId = deckOf(60, withEntries = false)
        database!!.dataSource().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO deck_entry
                    (deck_id, line_number, quantity, card_name, set_code, collector_number,
                     source_text, resolution_status, resolved_set, resolved_number)
                VALUES (?, 1, 59, 'Mountain', 'M10', '242', '59 Mountain', 'RESOLVED', 'M10', '242'),
                       (?, 2, 1, 'Lightning Bolt', 'ZZZ', '1', '1 Lightning Bolt [ZZZ:1]',
                        'PRINTING_MISMATCH', 'M10', '146')
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setObject(2, deckId)
                it.executeUpdate()
            }
        }
        val withWorker = config().copy(forgeWorkerJar = workerJar.path, forgeResRoot = resRoot.path)
        val check = MatchPreflight(database!!.dataSource(), CardResolver(withWorker)).validate(deckId)
        assertEquals(DeckVerdict.VALID, check.verdict, check.detail)
    }

    /**
     * A deck with 60 cards across 15 distinct names, or 61 with one
     * name appearing five times.
     */
    private fun deckOf(
        total: Int,
        fiveOfOne: Boolean = false,
        withEntries: Boolean = true,
    ): UUID {
        val deckId = UUID.randomUUID()
        val owner = Accounts(database!!.dataSource()).findByUsername("RudeLeft")!!.userId

        database!!.dataSource().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256,
                     total_cards, distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, 'Test deck', 'test.zip', ?, ?, 15, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, deckId.toString().replace("-", "").repeat(2).take(64))
                it.setInt(3, total)
                it.setObject(4, owner)
                it.executeUpdate()
            }

            if (!withEntries) return@use
            // Non-basic names, so the copy limit actually applies.
            val perEntry = if (fiveOfOne) 5 else 4
            var remaining = total
            var line = 1
            connection.prepareStatement(
                """
                INSERT INTO deck_entry
                    (deck_id, line_number, quantity, card_name, source_text,
                     resolution_status)
                VALUES (?, ?, ?, ?, ?, 'RESOLVED')
                """.trimIndent(),
            ).use { statement ->
                while (remaining > 0) {
                    val quantity = minOf(perEntry, remaining)
                    val name = "Test Creature $line"
                    statement.setObject(1, deckId)
                    statement.setInt(2, line)
                    statement.setInt(3, quantity)
                    statement.setString(4, name)
                    statement.setString(5, "$quantity $name")
                    statement.addBatch()
                    remaining -= quantity
                    line++
                }
                statement.executeBatch()
            }
        }
        return deckId
    }
}
