package net.barnflix.proxic.deck

import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The deck authorization service — PHASE_04 §4.41–§4.47, §4.67,
 * and PHASE 4 AMENDMENT 2.
 *
 * Three users, because two cannot express the case that matters:
 * a deck shared with B must still be invisible to C (§4.143).
 */
class DeckAuthorizationTest {
    private var container: PostgreSQLContainer<*>? = null
    private val password = "a perfectly fine passphrase"

    private lateinit var database: Database
    private lateinit var auth: DeckAuthorization
    private lateinit var owner: UUID
    private lateinit var recipient: UUID
    private lateinit var stranger: UUID

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            PostgreSQLContainer("postgres:16.15-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }

        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-deck-auth",
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }

        val accounts = Accounts(database.dataSource())
        accounts.createUser("RudeLeft", password, Role.ADMIN)
        accounts.createUser("Pat", password, Role.PLAYER)
        accounts.createUser("Sam", password, Role.PLAYER)
        owner = accounts.findByUsername("RudeLeft")!!.userId
        recipient = accounts.findByUsername("Pat")!!.userId
        stranger = accounts.findByUsername("Sam")!!.userId
        auth = DeckAuthorization(database.dataSource())
    }

    @AfterTest
    fun stop() {
        database.close()
        container!!.stop()
    }

    /** `(Connection) -> Unit`: JUnit silently skips a @Test that returns a value. */
    private fun withConnection(body: (Connection) -> Unit) {
        database.dataSource().connection.use(body)
    }

    private fun dataSource(): DataSource = database.dataSource()

    private fun deck(
        name: String,
        ownedBy: UUID,
    ): UUID {
        val deckId = UUID.randomUUID()
        withConnection { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256, total_cards,
                     distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, ?, ?, ?, 65, 11, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, name)
                it.setString(3, "$name.zip")
                it.setString(4, "%064x".format(java.math.BigInteger(200, java.util.Random())))
                it.setObject(5, ownedBy)
                it.executeUpdate()
            }
        }
        return deckId
    }

    /** An art asset and a deck entry referencing it. */
    private fun artFor(
        deckId: UUID,
        sha: String,
    ) {
        withConnection { connection ->
            connection.prepareStatement(
                "INSERT INTO art_asset (content_sha256, byte_size) " +
                    "VALUES (?, 1) ON CONFLICT DO NOTHING",
            ).use {
                it.setString(1, sha)
                it.executeUpdate()
            }
            connection.prepareStatement(
                """
                INSERT INTO deck_entry
                    (deck_id, line_number, quantity, card_name, source_text,
                     resolution_status, art_sha256)
                VALUES (?, 1, 1, 'Mountain', '1 Mountain', 'resolved', ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, sha)
                it.executeUpdate()
            }
        }
    }

    private fun share(
        deckId: UUID,
        with: UUID,
        by: UUID,
    ) {
        withConnection { connection ->
            connection.prepareStatement(
                "INSERT INTO deck_share (share_id, deck_id, shared_with_user_id, created_by_user_id) " +
                    "VALUES (?, ?, ?, ?)",
            ).use {
                it.setObject(1, UUID.randomUUID())
                it.setObject(2, deckId)
                it.setObject(3, with)
                it.setObject(4, by)
                it.executeUpdate()
            }
        }
    }

    private fun revoke(
        deckId: UUID,
        from: UUID,
    ) {
        withConnection { connection ->
            connection.prepareStatement(
                "DELETE FROM deck_share WHERE deck_id = ? AND shared_with_user_id = ?",
            ).use {
                it.setObject(1, deckId)
                it.setObject(2, from)
                it.executeUpdate()
            }
        }
    }

    @Test
    fun `the owner owns it, and may do everything`() {
        val mine = deck("Mine", owner)
        val access = auth.accessFor(owner, mine)
        assertEquals(DeckAccess.OWNER, access)
        assertTrue(access.mayView() && access.mayUse() && access.mayManage())
    }

    /** §4.141 — a private deck is invisible to everybody else. */
    @Test
    fun `a private deck is invisible to another user`() {
        val mine = deck("Private", owner)
        assertEquals(DeckAccess.NO_ACCESS, auth.accessFor(recipient, mine))
        assertFalse(auth.accessFor(recipient, mine).mayView())
    }

    /** §4.22, §4.23 — a recipient may look and play, not manage. */
    @Test
    fun `a share grants viewing and use, but never management`() {
        val mine = deck("Shared", owner)
        share(mine, recipient, owner)

        val access = auth.accessFor(recipient, mine)
        assertEquals(DeckAccess.SHARED, access)
        assertTrue(access.mayView())
        assertTrue(access.mayUse())
        assertFalse(access.mayManage(), "a recipient must not be able to delete or re-share")
    }

    /** §4.143 — the third user is the one two-user tests miss. */
    @Test
    fun `a deck shared with one user stays invisible to a third`() {
        val mine = deck("Shared_With_Pat", owner)
        share(mine, recipient, owner)

        assertEquals(DeckAccess.SHARED, auth.accessFor(recipient, mine))
        assertEquals(DeckAccess.NO_ACCESS, auth.accessFor(stranger, mine))
    }

    /** §4.35, §4.144 — revocation is immediate and server-side. */
    @Test
    fun `revoking a share removes access at once`() {
        val mine = deck("Revoked", owner)
        share(mine, recipient, owner)
        assertEquals(DeckAccess.SHARED, auth.accessFor(recipient, mine))

        revoke(mine, recipient)
        assertEquals(DeckAccess.NO_ACCESS, auth.accessFor(recipient, mine))
        // §4.145 — and the owner is unaffected.
        assertEquals(DeckAccess.OWNER, auth.accessFor(owner, mine))
    }

    /**
     * §4.65 — a deck that does not exist and a deck you may not see
     * must be indistinguishable.
     */
    @Test
    fun `an unknown deck id is NO_ACCESS, exactly like a private one`() {
        val privateDeck = deck("Not_Yours", owner)
        assertEquals(auth.accessFor(stranger, privateDeck), auth.accessFor(stranger, UUID.randomUUID()))
        assertEquals(DeckAccess.NO_ACCESS, auth.accessFor(stranger, UUID.randomUUID()))
    }

    // --- PHASE 4 AMENDMENT 2: artwork -------------------------------

    private val sha = "a".repeat(64)

    @Test
    fun `artwork is visible to the owner and to a recipient`() {
        val mine = deck("With_Art", owner)
        artFor(mine, sha)
        assertTrue(auth.mayViewAsset(owner, mine, sha))

        share(mine, recipient, owner)
        assertTrue(auth.mayViewAsset(recipient, mine, sha))
    }

    /**
     * The measured hole, closed.
     *
     * Before Phase 4 the route validated the SHAPE of the asset id
     * and served the file, never consulting the deck: a valid asset
     * id under a deck id that did not exist returned 200 and 377 KB
     * of image.
     */
    @Test
    fun `an asset cannot be fetched through a deck that does not contain it`() {
        val mine = deck("Has_The_Art", owner)
        artFor(mine, sha)
        val other = deck("Has_No_Art", owner)

        // Same owner, same asset, wrong deck: still refused, because
        // the deck does not reference it.
        assertFalse(auth.mayViewAsset(owner, other, sha), "an unrelated deck must not expose the asset")

        // And through a deck id that does not exist at all.
        assertFalse(auth.mayViewAsset(owner, UUID.randomUUID(), sha))
    }

    /** §4.153 — another user's artwork, by direct reference. */
    @Test
    fun `a stranger cannot fetch artwork from a deck they cannot see`() {
        val mine = deck("Private_Art", owner)
        artFor(mine, sha)
        assertFalse(auth.mayViewAsset(stranger, mine, sha))
    }

    /** §4.154 — revocation reaches artwork, not just deck detail. */
    @Test
    fun `revoking a share also removes artwork access`() {
        val mine = deck("Art_Revoked", owner)
        artFor(mine, sha)
        share(mine, recipient, owner)
        assertTrue(auth.mayViewAsset(recipient, mine, sha))

        revoke(mine, recipient)
        assertFalse(auth.mayViewAsset(recipient, mine, sha))
    }

    // --- the library queries ----------------------------------------

    @Test
    fun `my decks and shared with me are separate lists`() {
        val mine = deck("Mine_A", owner)
        val alsoMine = deck("Mine_B", owner)
        val theirs = deck("Pats_Own", recipient)
        share(theirs, owner, recipient)

        val owned = auth.ownedBy(owner)
        val shared = auth.sharedWith(owner)

        assertTrue(owned.containsAll(listOf(mine, alsoMine)))
        assertFalse(owned.contains(theirs), "a shared deck must not appear as owned (§4.60)")
        assertEquals(listOf(theirs), shared)
    }
}
