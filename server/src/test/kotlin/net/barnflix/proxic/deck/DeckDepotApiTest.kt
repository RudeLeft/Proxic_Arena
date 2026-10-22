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
            PostgreSQLContainer("postgres:16.15-alpine")
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

    private suspend fun ApplicationTestBuilder.postAs(
        session: Session,
        path: String,
        json: String,
    ): HttpResponse =
        client.post(path) {
            header(HttpHeaders.Cookie, "$SESSION_COOKIE=${session.token}; $CSRF_COOKIE=${session.csrf}")
            header(CSRF_HEADER, session.csrf)
            contentType(ContentType.Application.Json)
            setBody(json)
        }

    private suspend fun ApplicationTestBuilder.shareWith(
        session: Session,
        deckId: java.util.UUID,
        username: String,
    ): HttpResponse = postAs(session, "/api/decks/$deckId/shares", """{"username":"$username"}""")

    // --- sharing (§4.29-§4.35, §4.99) --------------------------------

    @Test
    fun `the owner can share by username, and the recipient gains access`() =
        testApplication {
            val deck = insertDeck("To_Share", "RudeLeft")
            application { module(config()) }

            val created = shareWith(signIn("RudeLeft"), deck, "Pat")
            assertEquals(HttpStatusCode.Created, created.status, created.bodyAsText())
            assertTrue(created.bodyAsText().contains("\"username\":\"Pat\""))

            // Pat can now open it, and sees the relationship named.
            val detail = getAs(signIn("Pat"), "/api/decks/$deck")
            assertEquals(HttpStatusCode.OK, detail.status)
            assertTrue(detail.bodyAsText().contains("\"access\":\"SHARED\""))
        }

    /** §4.29 — usernames are matched the way accounts are. */
    @Test
    fun `sharing matches the username case-insensitively`() =
        testApplication {
            val deck = insertDeck("Case", "RudeLeft")
            application { module(config()) }

            assertEquals(HttpStatusCode.Created, shareWith(signIn("RudeLeft"), deck, "pAt").status)
            assertEquals(HttpStatusCode.OK, getAs(signIn("Pat"), "/api/decks/$deck").status)
        }

    /** §4.33 — asking twice changes nothing and is not an error. */
    @Test
    fun `sharing twice is idempotent`() =
        testApplication {
            val deck = insertDeck("Twice", "RudeLeft")
            application { module(config()) }
            val owner = signIn("RudeLeft")

            assertEquals(HttpStatusCode.Created, shareWith(owner, deck, "Pat").status)
            assertEquals(HttpStatusCode.OK, shareWith(owner, deck, "Pat").status)

            val shares = getAs(owner, "/api/decks/$deck/shares").bodyAsText()
            assertTrue(shares.contains("\"shareCount\":1"), shares)
        }

    /** §4.27 — the owner already has it. */
    @Test
    fun `the owner cannot share a deck with themselves`() =
        testApplication {
            val deck = insertDeck("Mine", "RudeLeft")
            application { module(config()) }

            val response = shareWith(signIn("RudeLeft"), deck, "RudeLeft")
            assertEquals(HttpStatusCode.UnprocessableEntity, response.status)
            assertTrue(response.bodyAsText().contains("CANNOT_SHARE_WITH_OWNER"), response.bodyAsText())
        }

    @Test
    fun `sharing with an unknown username says so without inventing a user`() =
        testApplication {
            val deck = insertDeck("Mine", "RudeLeft")
            application { module(config()) }

            val response = shareWith(signIn("RudeLeft"), deck, "NoSuchPerson")
            assertEquals(HttpStatusCode.NotFound, response.status)

            assertTrue(
                getAs(signIn("RudeLeft"), "/api/decks/$deck/shares").bodyAsText()
                    .contains("\"shareCount\":0"),
            )
        }

    /** §4.28 — no NEW share to a disabled account. */
    @Test
    fun `sharing with a disabled account is refused`() =
        testApplication {
            val deck = insertDeck("Mine", "RudeLeft")
            database().use { db ->
                val accounts = Accounts(db.dataSource())
                accounts.setStatus(accounts.findByUsername("Sam")!!.userId, AccountStatus.DISABLED)
            }
            application { module(config()) }

            val response = shareWith(signIn("RudeLeft"), deck, "Sam")
            assertEquals(HttpStatusCode.UnprocessableEntity, response.status)
            assertTrue(response.bodyAsText().contains("SHARE_USER_DISABLED"), response.bodyAsText())
        }

    /** §4.24, §4.67 — a recipient must not be able to re-share. */
    @Test
    fun `a recipient cannot share the deck onward`() =
        testApplication {
            val deck = insertDeck("Pats_Deck", "Pat")
            share(deck, with = "RudeLeft", by = "Pat")
            application { module(config()) }

            val response = shareWith(signIn("RudeLeft"), deck, "Sam")
            assertEquals(HttpStatusCode.Forbidden, response.status)
            assertTrue(response.bodyAsText().contains("DECK_OWNER_REQUIRED"), response.bodyAsText())

            // ...and Sam really did not get it.
            assertEquals(HttpStatusCode.NotFound, getAs(signIn("Sam"), "/api/decks/$deck").status)
        }

    /** §4.67 — a stranger cannot share somebody else's deck, and
     * cannot learn that it exists by trying. */
    @Test
    fun `a stranger sharing another user's deck gets the same 404 as a missing one`() =
        testApplication {
            val deck = insertDeck("Pats_Private", "Pat")
            application { module(config()) }

            val response = shareWith(signIn("Sam"), deck, "Sam")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

    /** §4.99 — the sharing graph belongs to the owner. */
    @Test
    fun `only the owner may list who a deck is shared with`() =
        testApplication {
            val deck = insertDeck("Pats_Deck", "Pat")
            share(deck, with = "RudeLeft", by = "Pat")
            share(deck, with = "Sam", by = "Pat")
            application { module(config()) }

            val asOwner = getAs(signIn("Pat"), "/api/decks/$deck/shares")
            assertEquals(HttpStatusCode.OK, asOwner.status)
            assertTrue(asOwner.bodyAsText().contains("\"shareCount\":2"))

            // A recipient may see the deck but not the other
            // recipients -- 403, because 404 would be a lie they can
            // disprove (§4.71).
            val asRecipient = getAs(signIn("RudeLeft"), "/api/decks/$deck/shares")
            assertEquals(HttpStatusCode.Forbidden, asRecipient.status)
            assertFalse(asRecipient.bodyAsText().contains("Sam"), "the other recipient leaked")

            assertEquals(
                HttpStatusCode.NotFound,
                getAs(signIn("Casey"), "/api/decks/$deck/shares").status,
            )
        }

    /** §4.35, §4.144 — revocation is immediate and total. */
    @Test
    fun `revoking a share ends deck and artwork access at once`() =
        testApplication {
            val deck = insertDeck("Revoked", "RudeLeft", withArt = true)
            application { module(config()) }
            val owner = signIn("RudeLeft")
            assertEquals(HttpStatusCode.Created, shareWith(owner, deck, "Pat").status)

            val pat = signIn("Pat")
            assertEquals(HttpStatusCode.OK, getAs(pat, "/api/decks/$deck").status)
            assertEquals(HttpStatusCode.OK, getAs(pat, "/api/decks/$deck/assets/$sha").status)

            val patId = userId("Pat")
            assertEquals(
                HttpStatusCode.NoContent,
                deleteAs(owner, "/api/decks/$deck/shares/$patId").status,
            )

            // §4.35 — detail, listing and artwork all stop together.
            assertEquals(HttpStatusCode.NotFound, getAs(pat, "/api/decks/$deck").status)
            assertEquals(HttpStatusCode.NotFound, getAs(pat, "/api/decks/$deck/assets/$sha").status)
            assertFalse(getAs(pat, "/api/decks").bodyAsText().contains(deck.toString()))

            // §4.145 — and the owner still has their deck.
            assertEquals(HttpStatusCode.OK, getAs(owner, "/api/decks/$deck").status)
        }

    /** §4.80 — a recipient cannot revoke anybody, including themselves. */
    @Test
    fun `a recipient cannot revoke shares`() =
        testApplication {
            val deck = insertDeck("Pats_Deck", "Pat")
            share(deck, with = "RudeLeft", by = "Pat")
            share(deck, with = "Sam", by = "Pat")
            application { module(config()) }

            val samId = userId("Sam")
            val response = deleteAs(signIn("RudeLeft"), "/api/decks/$deck/shares/$samId")
            assertEquals(HttpStatusCode.Forbidden, response.status)

            // Sam still has it.
            assertEquals(HttpStatusCode.OK, getAs(signIn("Sam"), "/api/decks/$deck").status)
        }

    /** §4.102 — sharing is a mutation, so CSRF applies. */
    @Test
    fun `sharing without a CSRF token is refused`() =
        testApplication {
            val deck = insertDeck("Mine", "RudeLeft")
            application { module(config()) }
            val owner = signIn("RudeLeft")

            val response =
                client.post("/api/decks/$deck/shares") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=${owner.token}; $CSRF_COOKIE=${owner.csrf}")
                    contentType(ContentType.Application.Json)
                    setBody("""{"username":"Pat"}""")
                }
            assertEquals(HttpStatusCode.Forbidden, response.status)
            assertTrue(getAs(owner, "/api/decks/$deck/shares").bodyAsText().contains("\"shareCount\":0"))
        }

    // --- gaps the §4.171 checklist found ----------------------------

    /**
     * §4.49, §4.50 — ADMIN is not a master key.
     *
     * RudeLeft is an administrator. Pat is not. The admin must not
     * see, open, delete or share Pat's private deck, and must not
     * learn it exists.
     *
     * Nothing in the authorization service consults the role, which
     * is why this passes — but "it does not do X" is only worth
     * believing when somebody has tried X.
     */
    @Test
    fun `an administrator gets no privileged access to another user's deck`() =
        testApplication {
            val pats = insertDeck("Pats_Private", "Pat", withArt = true)
            application { module(config()) }
            val admin = signIn("RudeLeft")

            assertEquals(HttpStatusCode.NotFound, getAs(admin, "/api/decks/$pats").status)
            assertEquals(HttpStatusCode.NotFound, getAs(admin, "/api/decks/$pats/assets/$sha").status)
            assertEquals(HttpStatusCode.NotFound, getAs(admin, "/api/decks/$pats/shares").status)
            assertEquals(HttpStatusCode.NotFound, deleteAs(admin, "/api/decks/$pats").status)
            assertEquals(HttpStatusCode.NotFound, shareWith(admin, pats, "Casey").status)

            // Not in the library either, under any heading.
            val library = getAs(admin, "/api/decks").bodyAsText()
            assertFalse(library.contains(pats.toString()), library)

            // ...and Pat still has it, untouched by all that.
            assertEquals(HttpStatusCode.OK, getAs(signIn("Pat"), "/api/decks/$pats").status)
        }

    /**
     * §4.140, §4.6 — a client cannot name the owner.
     *
     * The import route reads the owner from the session and never
     * from the request, so these fields are ignored rather than
     * rejected. Either satisfies §4.140; what must NOT happen is a
     * deck landing in Pat's library because the uploader said so.
     */
    @Test
    fun `a client cannot choose the owner of a deck it uploads`() =
        testApplication {
            application { module(config()) }
            val owner = signIn("RudeLeft")
            val patId = userId("Pat")

            val response =
                client.post("/api/decks/import") {
                    header(
                        HttpHeaders.Cookie,
                        "$SESSION_COOKIE=${owner.token}; $CSRF_COOKIE=${owner.csrf}",
                    )
                    header(CSRF_HEADER, owner.csrf)
                    setBody(
                        io.ktor.client.request.forms.MultiPartFormDataContent(
                            io.ktor.client.request.forms.formData {
                                append("owner_user_id", patId.toString())
                                append("ownerUserId", patId.toString())
                                append(
                                    "package",
                                    ByteArray(16),
                                    io.ktor.http.Headers.build {
                                        append(
                                            HttpHeaders.ContentDisposition,
                                            "filename=\"not-a-real.zip\"",
                                        )
                                    },
                                )
                            },
                        ),
                    )
                }

            // The upload itself is refused (it is not a real package),
            // which is fine: the point is that nothing was created
            // for Pat.
            assertTrue(response.status.value >= 400, response.status.toString())
            assertFalse(
                getAs(signIn("Pat"), "/api/decks").bodyAsText().contains("not-a-real"),
                "a deck was planted in another user's library",
            )
        }

    /** §4.146 — several recipients, each independent of the others. */
    @Test
    fun `a deck can be shared with several users, and revoked from one`() =
        testApplication {
            val deck = insertDeck("Group_Deck", "RudeLeft")
            application { module(config()) }
            val owner = signIn("RudeLeft")

            assertEquals(HttpStatusCode.Created, shareWith(owner, deck, "Pat").status)
            assertEquals(HttpStatusCode.Created, shareWith(owner, deck, "Sam").status)
            assertEquals(HttpStatusCode.OK, getAs(signIn("Pat"), "/api/decks/$deck").status)
            assertEquals(HttpStatusCode.OK, getAs(signIn("Sam"), "/api/decks/$deck").status)

            assertEquals(
                HttpStatusCode.NoContent,
                deleteAs(owner, "/api/decks/$deck/shares/${userId("Pat")}").status,
            )

            // Revoking one leaves the other alone -- a revoke that
            // took everybody with it would pass a one-recipient test.
            assertEquals(HttpStatusCode.NotFound, getAs(signIn("Pat"), "/api/decks/$deck").status)
            assertEquals(HttpStatusCode.OK, getAs(signIn("Sam"), "/api/decks/$deck").status)
        }

    /** §4.46 — the answer Phase 5 and 6 are told to rely on. */
    @Test
    fun `canUseDeck answers for owner, recipient and stranger`() =
        testApplication {
            val deck = insertDeck("Playable", "Pat")
            share(deck, with = "RudeLeft", by = "Pat")
            application { module(config()) }

            val authorization = DeckAuthorization(database().dataSource())
            assertTrue(authorization.canUseDeck(userId("Pat"), deck))
            assertTrue(authorization.canUseDeck(userId("RudeLeft"), deck))
            assertFalse(authorization.canUseDeck(userId("Casey"), deck))
            assertFalse(authorization.canUseDeck(userId("Pat"), java.util.UUID.randomUUID()))
        }
}
