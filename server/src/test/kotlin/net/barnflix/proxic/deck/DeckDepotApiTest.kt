package net.barnflix.proxic.deck

import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.CSRF_HEADER
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The Deck Depot API — PHASE_04 §4.58–§4.68, §4.76–§4.80, §4.141–§4.156.
 *
 * Decks are inserted directly rather than imported: the import
 * pipeline needs Forge and a real package, and what is under test
 * here is who may see and do what, not how a ZIP becomes a deck.
 *
 * Three accounts, because the interesting failures need a third
 * party — a deck shared with Pat must stay invisible to Sam (§4.143).
 */
class DeckDepotApiTest {
    private var container: PostgreSQLContainer<*>? = null
    private val password = "a perfectly fine passphrase"
    private val sha = "c".repeat(64)

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
        seedUsers()
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-depot",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun database(): Database = Database.connect(config())!!.also { it.migrate() }

    private fun seedUsers() {
        database().use { db ->
            val accounts = Accounts(db.dataSource())
            accounts.createUser("RudeLeft", password, Role.ADMIN)
            accounts.createUser("Pat", password, Role.PLAYER)
            accounts.createUser("Sam", password, Role.PLAYER)
        }
    }

    private fun userId(username: String): UUID {
        return database().use { Accounts(it.dataSource()).findByUsername(username)!!.userId }
    }

    /** `(Connection) -> Unit`: JUnit silently skips a @Test returning a value. */
    private fun withConnection(body: (Connection) -> Unit) {
        database().use { it.dataSource().connection.use(body) }
    }

    /**
     * The bytes on disk, as ArtStore lays them out.
     *
     * The route serves a FILE; a database row alone answers 404,
     * correctly. Forgetting this was the other half of this test's
     * first run.
     */
    private fun writeArtFile() {
        val prefix = sha.substring(0, 2)
        val display = java.io.File("build/test-depot/art/display/" + prefix)
        display.mkdirs()
        java.io.File(display, sha + ".png").writeBytes(ByteArray(64) { 1 })
    }

    private fun insertDeck(
        name: String,
        owner: String,
        withArt: Boolean = false,
    ): UUID {
        val deckId = UUID.randomUUID()
        val ownerId = userId(owner)
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
                it.setObject(5, ownerId)
                it.executeUpdate()
            }
            if (withArt) {
                writeArtFile()
                connection.prepareStatement(
                    "INSERT INTO art_asset (content_sha256, byte_size) VALUES (?, 1) " +
                        "ON CONFLICT DO NOTHING",
                ).use {
                    it.setString(1, sha)
                    it.executeUpdate()
                }
                connection.prepareStatement(
                    """
                    INSERT INTO deck_entry
                        (deck_id, line_number, quantity, card_name, source_text,
                         resolution_status, art_sha256)
                    VALUES (?, 1, 1, 'Mountain', '1 Mountain', 'RESOLVED', ?)
                    """.trimIndent(),
                ).use {
                    it.setObject(1, deckId)
                    it.setString(2, sha)
                    it.executeUpdate()
                }
            }
        }
        return deckId
    }

    private fun share(
        deckId: UUID,
        with: String,
        by: String,
    ) {
        withConnection { connection ->
            connection.prepareStatement(
                "INSERT INTO deck_share (share_id, deck_id, shared_with_user_id, created_by_user_id) " +
                    "VALUES (?, ?, ?, ?)",
            ).use {
                it.setObject(1, UUID.randomUUID())
                it.setObject(2, deckId)
                it.setObject(3, userId(with))
                it.setObject(4, userId(by))
                it.executeUpdate()
            }
        }
    }

    private class Session(val token: String, val csrf: String)

    private suspend fun ApplicationTestBuilder.signIn(username: String): Session {
        val response =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }

        fun cookie(name: String) =
            response.headers.getAll(HttpHeaders.SetCookie)!!
                .first { it.startsWith("$name=") }
                .substringAfter("=").substringBefore(";")
        return Session(cookie(SESSION_COOKIE), cookie(CSRF_COOKIE))
    }

    private suspend fun ApplicationTestBuilder.getAs(
        session: Session,
        path: String,
    ): HttpResponse = client.get(path) { header(HttpHeaders.Cookie, "$SESSION_COOKIE=${session.token}") }

    private suspend fun ApplicationTestBuilder.deleteAs(
        session: Session,
        path: String,
    ): HttpResponse =
        client.delete(path) {
            header(HttpHeaders.Cookie, "$SESSION_COOKIE=${session.token}; $CSRF_COOKIE=${session.csrf}")
            header(CSRF_HEADER, session.csrf)
        }

    // --- the library ------------------------------------------------

    /**
     * §4.62, carry-forward C3 — the endpoint that used to return
     * every deck in the database now returns only yours.
     */
    @Test
    fun `the library lists my decks and the ones shared with me, and nothing else`() =
        testApplication {
            val mine = insertDeck("Mine", "RudeLeft")
            val sharedToMe = insertDeck("Pats_Shared", "Pat")
            val notMine = insertDeck("Pats_Private", "Pat")
            share(sharedToMe, with = "RudeLeft", by = "Pat")
            application { module(config()) }

            val body = getAs(signIn("RudeLeft"), "/api/decks").bodyAsText()

            assertTrue(body.contains(mine.toString()), body)
            assertTrue(body.contains(sharedToMe.toString()), body)
            assertFalse(body.contains(notMine.toString()), "a private deck leaked into the library")

            // §4.60 — the two lists are distinguishable without
            // inferring anything.
            val mineSection = body.substringAfter("\"mine\"").substringBefore("\"sharedWithMe\"")
            assertTrue(mineSection.contains(mine.toString()))
            assertFalse(mineSection.contains(sharedToMe.toString()))
        }

    /** §4.59, §4.73 — "shared by Pat" needs Pat's name. */
    @Test
    fun `a shared deck names its owner`() =
        testApplication {
            val deck = insertDeck("Pats_Deck", "Pat")
            share(deck, with = "RudeLeft", by = "Pat")
            application { module(config()) }

            val body = getAs(signIn("RudeLeft"), "/api/decks").bodyAsText()
            assertTrue(body.contains("\"ownerDisplayName\":\"Pat\""), body)
        }

    // --- detail ------------------------------------------------------

    /** §4.65 — not yours and not real are the same answer. */
    @Test
    fun `another user's deck is 404, exactly like one that does not exist`() =
        testApplication {
            val pats = insertDeck("Pats_Private", "Pat")
            application { module(config()) }
            val sam = signIn("Sam")

            val hidden = getAs(sam, "/api/decks/$pats")
            val absent = getAs(sam, "/api/decks/${UUID.randomUUID()}")

            assertEquals(HttpStatusCode.NotFound, hidden.status)
            assertEquals(HttpStatusCode.NotFound, absent.status)

            // Identical but for the request id, which is unique per
            // request. Comparing the raw bodies was this test's own
            // first bug.
            //
            // They match because the application's §1.44 handler
            // rewrites EVERY 404 to one shape, so the route's
            // DECK_NOT_FOUND never reaches a client. That is a
            // stronger §4.65 than the specification asks for: error
            // codes cannot leak the difference because there is no
            // difference to leak.
            fun withoutRequestId(body: String) = body.replace(Regex("\"requestId\":\"[^\"]*\""), "")
            assertEquals(
                withoutRequestId(absent.bodyAsText()),
                withoutRequestId(hidden.bodyAsText()),
                "a hidden deck and an absent one must answer identically",
            )
        }

    @Test
    fun `the owner and a recipient both see detail, with their relationship named`() =
        testApplication {
            val deck = insertDeck("Shared_Deck", "Pat")
            share(deck, with = "RudeLeft", by = "Pat")
            application { module(config()) }

            val asOwner = getAs(signIn("Pat"), "/api/decks/$deck").bodyAsText()
            assertTrue(asOwner.contains("\"access\":\"OWNER\""), asOwner)

            val asRecipient = getAs(signIn("RudeLeft"), "/api/decks/$deck").bodyAsText()
            assertTrue(asRecipient.contains("\"access\":\"SHARED\""), asRecipient)
        }

    // --- deletion ----------------------------------------------------

    /**
     * §4.66, §4.80 — the recipient gets 403 and the stranger 404,
     * and the difference is the point: telling someone who can see
     * the deck "no such deck" would be a lie they can disprove.
     */
    @Test
    fun `only the owner may delete`() =
        testApplication {
            val deck = insertDeck("Pats_Deck", "Pat")
            share(deck, with = "RudeLeft", by = "Pat")
            application { module(config()) }

            assertEquals(HttpStatusCode.Forbidden, deleteAs(signIn("RudeLeft"), "/api/decks/$deck").status)
            assertEquals(HttpStatusCode.NotFound, deleteAs(signIn("Sam"), "/api/decks/$deck").status)

            // ...and it is still there, which is what makes the two
            // refusals mean something.
            assertEquals(HttpStatusCode.OK, getAs(signIn("Pat"), "/api/decks/$deck").status)

            assertEquals(HttpStatusCode.NoContent, deleteAs(signIn("Pat"), "/api/decks/$deck").status)
            assertEquals(HttpStatusCode.NotFound, getAs(signIn("Pat"), "/api/decks/$deck").status)
        }

    // --- artwork (PHASE 4 AMENDMENT 2) --------------------------------

    @Test
    fun `artwork follows the deck's access policy`() =
        testApplication {
            val deck = insertDeck("With_Art", "Pat", withArt = true)
            application { module(config()) }

            // The owner may.
            assertEquals(
                HttpStatusCode.OK,
                getAs(signIn("Pat"), "/api/decks/$deck/assets/$sha").status,
            )
            // A stranger may not, and learns nothing (§4.153).
            assertEquals(
                HttpStatusCode.NotFound,
                getAs(signIn("Sam"), "/api/decks/$deck/assets/$sha").status,
            )

            share(deck, with = "Sam", by = "Pat")
            assertEquals(
                HttpStatusCode.OK,
                getAs(signIn("Sam"), "/api/decks/$deck/assets/$sha").status,
            )
        }

    /**
     * The hole measured before Phase 4: the deck id was never
     * consulted, so any valid asset id came back under any deck id.
     */
    @Test
    fun `an asset cannot be fetched through a deck that does not contain it`() =
        testApplication {
            insertDeck("Has_Art", "Pat", withArt = true)
            val empty = insertDeck("No_Art", "Pat")
            application { module(config()) }
            val pat = signIn("Pat")

            assertEquals(
                HttpStatusCode.NotFound,
                getAs(pat, "/api/decks/$empty/assets/$sha").status,
                "an unrelated deck exposed the asset",
            )
            assertEquals(
                HttpStatusCode.NotFound,
                getAs(pat, "/api/decks/${UUID.randomUUID()}/assets/$sha").status,
                "a nonexistent deck exposed the asset",
            )
        }

    /** PHASE 4 AMENDMENT 3 — shared caches must not keep deck art. */
    @Test
    fun `artwork is cached privately, never publicly`() =
        testApplication {
            val deck = insertDeck("With_Art", "Pat", withArt = true)
            application { module(config()) }

            val response = getAs(signIn("Pat"), "/api/decks/$deck/assets/$sha")
            val cacheControl = response.headers[HttpHeaders.CacheControl].orEmpty()
            assertTrue(cacheControl.contains("private"), "cache-control was: $cacheControl")
            assertFalse(cacheControl.contains("public"), cacheControl)
        }
}
