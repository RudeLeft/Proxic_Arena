package net.barnflix.proxic.deck

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
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
import net.barnflix.proxic.auth.AccountStatus
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
 * Renaming decks and one name per owner — PHASE_07 §7.65, owner
 * decisions 17 and 18. Split from [DeckDepotApiTest] when detekt
 * found that class too large; the harness is the same.
 */
class DeckDepotPhase7ApiTest {
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
            // A fourth account that is party to nothing, so the
            // stranger cases are genuinely strangers.
            accounts.createUser("Casey", password, Role.PLAYER)
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

    // --- rename and unique names (PHASE_07 §7.65) ---------------------

    private suspend fun ApplicationTestBuilder.renameAs(
        session: Session,
        deckId: UUID,
        name: String,
    ): HttpResponse =
        client.patch("/api/decks/$deckId") {
            header(HttpHeaders.Cookie, "$SESSION_COOKIE=${session.token}; $CSRF_COOKIE=${session.csrf}")
            header(CSRF_HEADER, session.csrf)
            contentType(ContentType.Application.Json)
            setBody("""{"displayName":${kotlinx.serialization.json.JsonPrimitive(name)}}""")
        }

    private fun nameOf(deckId: UUID): String {
        var name = ""
        withConnection { connection ->
            connection.prepareStatement("SELECT display_name FROM imported_deck WHERE deck_id = ?").use {
                it.setObject(1, deckId)
                it.executeQuery().use { rows -> if (rows.next()) name = rows.getString(1) }
            }
        }
        return name
    }

    @Test
    fun `the owner renames a deck, and the library shows the new name`() =
        testApplication {
            val deck = insertDeck("Old name", "RudeLeft")
            application { module(config()) }

            val me = signIn("RudeLeft")
            val renamed = renameAs(me, deck, "  New name  ")
            assertEquals(HttpStatusCode.OK, renamed.status, renamed.bodyAsText())
            // Trimmed: the spaces were not part of the name.
            assertEquals("New name", nameOf(deck))
            assertTrue(getAs(me, "/api/decks").bodyAsText().contains("\"displayName\":\"New name\""))
        }

    @Test
    fun `a name you already use is refused, whatever its capitals and spaces`() =
        testApplication {
            insertDeck("Burn", "RudeLeft")
            val other = insertDeck("Control", "RudeLeft")
            application { module(config()) }

            val me = signIn("RudeLeft")
            for (clash in listOf("Burn", "burn", " BURN ")) {
                val refused = renameAs(me, other, clash)
                assertEquals(HttpStatusCode.Conflict, refused.status, clash)
                assertTrue(refused.bodyAsText().contains("DECK_NAME_TAKEN"))
            }
            assertEquals("Control", nameOf(other))
        }

    @Test
    fun `names are unique per owner, not across players`() =
        testApplication {
            insertDeck("Burn", "Pat")
            val mine = insertDeck("Mine", "RudeLeft")
            application { module(config()) }

            assertEquals(HttpStatusCode.OK, renameAs(signIn("RudeLeft"), mine, "Burn").status)
        }

    @Test
    fun `a deck may change its own capitals`() =
        testApplication {
            val deck = insertDeck("burn", "RudeLeft")
            application { module(config()) }

            assertEquals(HttpStatusCode.OK, renameAs(signIn("RudeLeft"), deck, "Burn").status)
            assertEquals("Burn", nameOf(deck))
        }

    @Test
    fun `existing duplicates stay, but nothing can be renamed into one`() =
        testApplication {
            // Imported before the rule: left as they are (§7.65).
            val first = insertDeck("Twin", "RudeLeft")
            val second = insertDeck("Twin", "RudeLeft")
            val third = insertDeck("Other", "RudeLeft")
            application { module(config()) }

            val me = signIn("RudeLeft")
            assertEquals(HttpStatusCode.Conflict, renameAs(me, third, "Twin").status)
            // One of the pair can leave it.
            assertEquals(HttpStatusCode.OK, renameAs(me, second, "Twin 2").status)
            assertEquals("Twin", nameOf(first))
        }

    @Test
    fun `only the owner renames, and a stranger learns nothing`() =
        testApplication {
            val deck = insertDeck("Pats_Deck", "Pat")
            share(deck, with = "RudeLeft", by = "Pat")
            application { module(config()) }

            val recipient = renameAs(signIn("RudeLeft"), deck, "Mine now")
            assertEquals(HttpStatusCode.Forbidden, recipient.status)
            assertTrue(recipient.bodyAsText().contains("DECK_OWNER_REQUIRED"))
            // §4.65: a stranger's answer is the same as a deck that does not exist.
            assertEquals(HttpStatusCode.NotFound, renameAs(signIn("Casey"), deck, "Mine now").status)
            assertEquals(HttpStatusCode.NotFound, renameAs(signIn("Casey"), UUID.randomUUID(), "x").status)
            assertEquals("Pats_Deck", nameOf(deck))
        }

    @Test
    fun `a name must be one line of 1 to 80 characters`() =
        testApplication {
            val deck = insertDeck("Fine", "RudeLeft")
            application { module(config()) }

            val me = signIn("RudeLeft")
            for (bad in listOf("", "   ", "x".repeat(81), "two\nlines")) {
                val refused = renameAs(me, deck, bad)
                assertEquals(HttpStatusCode.UnprocessableEntity, refused.status, bad)
                assertTrue(refused.bodyAsText().contains("INVALID_DECK_NAME"))
            }
            assertEquals(HttpStatusCode.OK, renameAs(me, deck, "x".repeat(80)).status)
        }

    @Test
    fun `rename needs the CSRF header like every other change`() =
        testApplication {
            val deck = insertDeck("Fine", "RudeLeft")
            application { module(config()) }

            val me = signIn("RudeLeft")
            val forged =
                client.patch("/api/decks/$deck") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=${me.token}; $CSRF_COOKIE=${me.csrf}")
                    contentType(ContentType.Application.Json)
                    setBody("""{"displayName":"Hijacked"}""")
                }
            assertEquals(HttpStatusCode.Forbidden, forged.status)
            assertEquals("Fine", nameOf(deck))
        }

    // --- the Share list and counts (PHASE_07 Amendment 10) -----------

    @Test
    fun `the owner's share list offers every active player except themselves and current holders`() =
        testApplication {
            val deck = insertDeck("Lendable", "RudeLeft")
            share(deck, with = "Pat", by = "RudeLeft")
            database().use { Accounts(it.dataSource()).setStatus(userId("Casey"), AccountStatus.DISABLED) }
            application { module(config()) }

            val body = getAs(signIn("RudeLeft"), "/api/decks/$deck/shares").bodyAsText()
            val candidates = body.substringAfter("\"candidates\"")
            // Sam can be offered; Pat already holds it, Casey is
            // disabled, and you do not share with yourself.
            assertTrue(candidates.contains("\"username\":\"Sam\""), body)
            assertFalse(candidates.contains("\"Pat\""), body)
            assertFalse(candidates.contains("\"Casey\""), body)
            assertFalse(candidates.contains("\"RudeLeft\""), body)
            // Names only: nothing about roles or status.
            assertFalse(candidates.contains("role") || candidates.contains("status"), body)
        }

    @Test
    fun `nobody but the owner gets the list of players`() =
        testApplication {
            val deck = insertDeck("Pats_Deck", "Pat")
            share(deck, with = "RudeLeft", by = "Pat")
            application { module(config()) }

            assertEquals(HttpStatusCode.Forbidden, getAs(signIn("RudeLeft"), "/api/decks/$deck/shares").status)
            assertEquals(HttpStatusCode.NotFound, getAs(signIn("Casey"), "/api/decks/$deck/shares").status)
        }

    @Test
    fun `your decks say how many players hold them, decks lent to you do not`() =
        testApplication {
            val mine = insertDeck("Mine", "RudeLeft")
            share(mine, with = "Pat", by = "RudeLeft")
            share(mine, with = "Sam", by = "RudeLeft")
            val lent = insertDeck("Pats_Deck", "Pat")
            share(lent, with = "RudeLeft", by = "Pat")
            share(lent, with = "Sam", by = "Pat")
            application { module(config()) }

            val body = getAs(signIn("RudeLeft"), "/api/decks").bodyAsText()
            val mineSection = body.substringAfter("\"mine\"").substringBefore("\"sharedWithMe\"")
            val lentSection = body.substringAfter("\"sharedWithMe\"")
            assertTrue(mineSection.contains("\"shareCount\":2"), body)
            // Who else holds Pat's deck is Pat's business (§4.99).
            assertFalse(lentSection.contains("\"shareCount\":1"), body)
        }
}
