package net.barnflix.proxic.deck

import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.CSRF_HEADER
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.imageio.ImageIO
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Spec 0022 — a linked computer sends decks: the three Deck Builder routes,
 * with a real PostgreSQL and a real Forge worker.
 *
 * The package is built here (basics and Lightning Bolt, with generated
 * pictures) rather than taken from the real export, which is gitignored:
 * this test proves the routes, so it must run on CI (ci/expected-skips.txt).
 */
class DeckBuilderApiTest {
    private val workerJar = File("../forge-worker/target/forge-worker-0.1.0.jar")
    private val resRoot = File("../spikes/forge-phase0a/forge-upstream/forge-gui/res")
    private val password = "a perfectly fine passphrase"
    private val json = Json { ignoreUnknownKeys = true }

    private var container: FreshDatabase? = null
    private lateinit var dataRoot: File

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        assumeTrue(workerJar.isFile, "SKIPPED: build the worker first")
        assumeTrue(resRoot.isDirectory, "SKIPPED: no Forge resource checkout")
        container = TestPostgres.fresh()
        dataRoot = File("build/test-deck-builder-${System.currentTimeMillis()}")
        Database.connect(config())!!.use { database ->
            database.migrate()
            val accounts = Accounts(database.dataSource())
            accounts.createUser("Pat", password, Role.PLAYER)
            accounts.createUser("Sam", password, Role.PLAYER)
        }
    }

    @AfterTest
    fun stop() {
        container?.stop()
        if (::dataRoot.isInitialized) dataRoot.deleteRecursively()
    }

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = workerJar.path,
            dataRoot = dataRoot.path,
            forgeResRoot = resRoot.path,
            secureCookies = false,
            sessionSecretValue = "test-only-session-secret-0123456789abcdef",
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    // --- a legal package, taken apart so a test can change one piece ---

    /** A solid-colour card-shaped PNG, distinct per colour. */
    private fun picture(rgb: Int): ByteArray {
        val image = BufferedImage(60, 84, BufferedImage.TYPE_INT_RGB)
        for (x in 0 until 60) for (y in 0 until 84) image.setRGB(x, y, rgb)
        return ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()
    }

    private val exportEntries: Map<String, ByteArray> by lazy {
        mapOf(
            "Builder Test.txt" to
                // By name only: a made-up set would be a printing Arena refuses.
                "// Builder Test (constructed)\n\n56 Mountain\n4 Lightning Bolt\n".toByteArray(),
            "real_cards/Mountain [CI].png" to picture(0x8a3b2a),
            "real_cards/Lightning Bolt [CI].png" to picture(0xd9a441),
        )
    }
    private val deckText get() = exportEntries.entries.single { it.key.endsWith(".txt") }
    private val images get() = exportEntries.filterKeys { it.endsWith(".png") }

    // Built once: a zip records when it was made, so two builds are two packages.
    private val packageBytes by lazy { zip(exportEntries) }

    private fun zip(entries: Map<String, ByteArray>): ByteArray =
        ByteArrayOutputStream().also { bytes ->
            ZipOutputStream(bytes).use { out ->
                for ((name, content) in entries) {
                    out.putNextEntry(ZipEntry(name))
                    out.write(content)
                    out.closeEntry()
                }
            }
        }.toByteArray()

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun withDeckText(text: String): Map<String, ByteArray> {
        val others = exportEntries - deckText.key
        return others + (deckText.key to text.toByteArray())
    }

    // --- linking, as the Account page and the Deck Builder do it ---

    private class Signed(val token: String, val csrf: String) {
        val cookies get() = "$SESSION_COOKIE=$token; $CSRF_COOKIE=$csrf"
    }

    private fun HttpResponse.cookie(name: String): String =
        headers.getAll(HttpHeaders.SetCookie)!!.first { it.startsWith("$name=") }
            .substringAfter("=").substringBefore(";")

    private suspend fun HttpResponse.field(name: String): String =
        Json.parseToJsonElement(bodyAsText()).jsonObject[name]!!.jsonPrimitive.content

    private suspend fun ApplicationTestBuilder.signIn(username: String): Signed {
        val response =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }
        return Signed(response.cookie(SESSION_COOKIE), response.cookie(CSRF_COOKIE))
    }

    private suspend fun ApplicationTestBuilder.linkedToken(who: Signed): String {
        val code =
            client.post("/api/auth/device-codes") {
                header(HttpHeaders.Cookie, who.cookies)
                header(CSRF_HEADER, who.csrf)
            }.field("code")
        return client.post("/api/auth/device-link") {
            contentType(ContentType.Application.Json)
            setBody("""{"code":"$code","deviceName":"Desktop"}""")
        }.field("token")
    }

    private suspend fun ApplicationTestBuilder.send(
        token: String?,
        packageBytes: ByteArray,
        name: String? = null,
    ): HttpResponse =
        client.post("/api/deck-builder/decks") {
            token?.let { header(HttpHeaders.Authorization, "Bearer $it") }
            setBody(
                MultiPartFormDataContent(
                    formData {
                        name?.let { append("name", it) }
                        append(
                            "package",
                            packageBytes,
                            Headers.build {
                                append(HttpHeaders.ContentType, "application/zip")
                                append(HttpHeaders.ContentDisposition, "filename=\"deck.zip\"")
                            },
                        )
                    },
                ),
            )
        }

    private suspend fun ApplicationTestBuilder.names(token: String?): HttpResponse =
        client.get("/api/deck-builder/deck-names") { token?.let { header(HttpHeaders.Authorization, "Bearer $it") } }

    private suspend fun ApplicationTestBuilder.known(
        token: String?,
        hashes: List<String>,
    ): HttpResponse =
        client.post("/api/deck-builder/pictures/known") {
            token?.let { header(HttpHeaders.Authorization, "Bearer $it") }
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(PicturesKnownRequest.serializer(), PicturesKnownRequest(hashes)))
        }

    /** F-0022-D: a token opens the routes; nobody, a wrong token or a browser session does not. */
    @Test
    fun `only a linked computer's token opens the Deck Builder routes`() =
        testApplication {
            application { module(config()) }
            val pat = signIn("Pat")
            val token = linkedToken(pat)

            assertEquals(HttpStatusCode.Unauthorized, names(null).status)
            assertEquals(HttpStatusCode.Unauthorized, names("not-a-token").status)
            val bySession = client.get("/api/deck-builder/deck-names") { header(HttpHeaders.Cookie, pat.cookies) }
            assertEquals(HttpStatusCode.Unauthorized, bySession.status, "a browser imports through the Deck Depot")
            assertEquals(HttpStatusCode.Unauthorized, known(null, emptyList()).status)
            assertEquals(HttpStatusCode.Unauthorized, send(null, packageBytes).status)

            val listed = names(token)
            assertEquals(HttpStatusCode.OK, listed.status, listed.bodyAsText())
            val names = json.decodeFromString(DeckNamesResponse.serializer(), listed.bodyAsText())
            assertEquals(DeckNamesResponse(emptyList()), names)
            assertEquals(HttpStatusCode.BadRequest, known(token, listOf("not-a-hash")).status)
        }

    /** S1, S2, F-0022-F: a send lands in the sender's Deck Depot; a taken name or the same package is refused. */
    @Test
    fun `a sent deck lands in the Deck Depot, and a taken name asks for another`() =
        testApplication {
            application { module(config()) }
            val token = linkedToken(signIn("Pat"))

            val sent = send(token, packageBytes)
            assertEquals(HttpStatusCode.Created, sent.status, sent.bodyAsText())
            val accepted = json.decodeFromString(ImportAcceptedResponse.serializer(), sent.bodyAsText())
            assertEquals(60, accepted.totalCards)
            val deckName = accepted.displayName
            assertTrue(names(token).bodyAsText().contains(deckName))

            val again = send(token, packageBytes)
            assertEquals(HttpStatusCode.Conflict, again.status)
            assertTrue(again.bodyAsText().contains("DUPLICATE_PACKAGE"), again.bodyAsText())

            // The same name, different cards: a new deck, under a new name.
            val changed = zip(withDeckText(deckText.value.decodeToString() + "\n"))
            val taken = send(token, changed)
            assertEquals(HttpStatusCode.Conflict, taken.status)
            assertTrue(taken.bodyAsText().contains("DECK_NAME_TAKEN"), taken.bodyAsText())
            val renamed = send(token, changed, name = "$deckName 2")
            assertEquals(HttpStatusCode.Created, renamed.status, renamed.bodyAsText())
            assertTrue(names(token).bodyAsText().contains("$deckName 2"))
        }

    /** F-0022-E: pictures already held need not be sent; pictures somebody else holds must be. */
    @Test
    fun `a picture already in your decks is not sent again, and another player's is not yours`() =
        testApplication {
            application { module(config()) }
            val pat = linkedToken(signIn("Pat"))
            val sam = linkedToken(signIn("Sam"))
            val hashes = images.values.map(::sha256)

            assertEquals(HttpStatusCode.Created, send(pat, packageBytes).status)
            val patKnows = json.decodeFromString(PicturesKnownResponse.serializer(), known(pat, hashes).bodyAsText())
            assertEquals(hashes.toSet(), patKnows.known.toSet())
            val samKnows = json.decodeFromString(PicturesKnownResponse.serializer(), known(sam, hashes).bodyAsText())
            assertEquals(emptyList(), samKnows.known, "a hash must not tell Sam what Pat's decks hold")

            val pictures =
                images.entries.joinToString(",", "{", "}") { (name, bytes) -> "\"$name\":\"${sha256(bytes)}\"" }
            val light =
                zip(
                    mapOf(
                        deckText.key to (deckText.value.decodeToString() + "\n").toByteArray(),
                        "pictures.json" to pictures.toByteArray(),
                    ),
                )
            val samSends = send(sam, light, name = "Sam's copy")
            assertEquals(HttpStatusCode.UnprocessableEntity, samSends.status)
            assertTrue(samSends.bodyAsText().contains("PICTURE_NOT_HELD"), samSends.bodyAsText())

            val patSends = send(pat, light, name = "Pat's light copy")
            assertEquals(HttpStatusCode.Created, patSends.status, patSends.bodyAsText())
            val accepted = json.decodeFromString(ImportAcceptedResponse.serializer(), patSends.bodyAsText())
            assertEquals(0, accepted.entriesWithoutArt, "every card has its picture without sending one")
        }

    /** F-0022-A: a token line is a picture, never a card: not resolved, not counted. */
    @Test
    fun `a token card travels as a picture and shows on the deck's page`() =
        testApplication {
            application { module(config()) }
            val pat = signIn("Pat")
            val token = linkedToken(pat)
            val apeBytes = picture(0x4f7a3a)
            val withApe =
                withDeckText(deckText.value.decodeToString().trimEnd() + "\n\n// Tokens\n1 Ape [TMH1:2]\n") +
                    ("real_cards/Ape [TMH1].png" to apeBytes)

            val sent = send(token, zip(withApe))
            assertEquals(HttpStatusCode.Created, sent.status, sent.bodyAsText())
            val accepted = json.decodeFromString(ImportAcceptedResponse.serializer(), sent.bodyAsText())
            assertEquals(60, accepted.totalCards, "the token is outside the 60 to 65")
            assertEquals(1, accepted.tokenPictures)

            val detail =
                json.decodeFromString(
                    DeckDetail.serializer(),
                    client
                        .get("/api/decks/${accepted.deckId}") { header(HttpHeaders.Cookie, pat.cookies) }
                        .bodyAsText(),
                )
            val ape = detail.tokens.single()
            assertEquals("Ape", ape.name)
            assertEquals(sha256(apeBytes), ape.artUrl?.substringAfterLast('/'))
            assertTrue(detail.entries.none { it.cardName == "Ape" })
            val picture = client.get(assertNotNull(ape.artUrl)) { header(HttpHeaders.Cookie, pat.cookies) }
            assertEquals(HttpStatusCode.OK, picture.status, "a deck's token picture is its picture too")
        }
}
