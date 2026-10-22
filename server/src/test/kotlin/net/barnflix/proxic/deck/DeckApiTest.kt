package net.barnflix.proxic.deck

import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.delete
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The deck API — PHASE_02 §2.19, §2.59, §2.61, §2.74–§2.80.
 *
 * Driven over real HTTP with a real multipart upload, because the
 * things worth asserting live in the HTTP layer: the status code a
 * duplicate gets, the content type of an image, whether an asset id
 * can be used to escape the art directory.
 */
class DeckApiTest {
    private val realExport = File("../Test Deck/Basic_Mono_Red_65_Card_Deck.zip")
    private val workerJar = File("../forge-worker/target/forge-worker-0.1.0.jar")
    private val resRoot = File("../spikes/forge-phase0a/forge-upstream/forge-gui/res")

    private var container: PostgreSQLContainer<*>? = null
    private lateinit var dataRoot: File
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        assumeTrue(realExport.isFile, "SKIPPED: no real export (PHASE_02 §2.3)")
        assumeTrue(workerJar.isFile, "SKIPPED: build the worker first")
        assumeTrue(resRoot.isDirectory, "SKIPPED: no Forge resource checkout")

        container =
            PostgreSQLContainer("postgres:16.15-alpine")
                .withDatabaseName("proxic_test")
                .withUsername("proxic")
                .withPassword("test-only-not-a-secret")
                .also { it.start() }
        dataRoot = File("build/test-api-${System.currentTimeMillis()}")
    }

    @AfterTest
    fun stop() {
        container?.stop()
        if (::dataRoot.isInitialized) dataRoot.deleteRecursively()
    }

    private fun config(importEnabled: Boolean = true) =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = workerJar.path,
            dataRoot = dataRoot.path,
            forgeResRoot = resRoot.path,
            deckImportEnabled = importEnabled,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    /**
     * PHASE 3 AMENDMENT 1 — every deck endpoint needs a session now.
     *
     * These tests predate authentication and failed when it landed,
     * which is the rule working. They sign in rather than being
     * exempted: a test that bypasses the auth layer would stop
     * proving that the deck API is reachable by a real browser.
     */
    private fun seedUser() {
        net.barnflix.proxic.Database.connect(config())!!.use { database ->
            database.migrate()
            net.barnflix.proxic.auth.Accounts(database.dataSource())
                .createUser("RudeLeft", testPassword, net.barnflix.proxic.auth.Role.ADMIN)
        }
    }

    private val testPassword = "a perfectly fine passphrase"
    private var sessionCookie: String? = null
    private var csrfToken: String? = null

    private suspend fun io.ktor.server.testing.ApplicationTestBuilder.signIn() {
        val response =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"RudeLeft","password":"$testPassword"}""")
            }

        fun cookie(name: String) =
            response.headers
                .getAll(HttpHeaders.SetCookie)
                ?.firstOrNull { it.startsWith("$name=") }
                ?.substringAfter("=")?.substringBefore(";")
        sessionCookie = cookie(net.barnflix.proxic.auth.SESSION_COOKIE)
        csrfToken = cookie(net.barnflix.proxic.auth.CSRF_COOKIE)
    }

    /** Attach the session and CSRF token to a request. */
    private fun HttpRequestBuilder.authed() {
        header(
            HttpHeaders.Cookie,
            "${net.barnflix.proxic.auth.SESSION_COOKIE}=$sessionCookie; " +
                "${net.barnflix.proxic.auth.CSRF_COOKIE}=$csrfToken",
        )
        header(net.barnflix.proxic.auth.CSRF_HEADER, csrfToken ?: "")
    }

    private fun uploadBody(file: File = realExport) =
        MultiPartFormDataContent(
            formData {
                append(
                    "package",
                    file.readBytes(),
                    Headers.build {
                        append(HttpHeaders.ContentType, "application/zip")
                        append(HttpHeaders.ContentDisposition, "filename=\"${file.name}\"")
                    },
                )
            },
        )

    @Test
    fun `a real package imports over HTTP and is then discoverable`() =
        testApplication {
            application { module(config()) }
            seedUser()
            signIn()

            val imported =
                client.post("/api/decks/import") {
                    authed()
                    setBody(uploadBody())
                }
            assertEquals(HttpStatusCode.Created, imported.status, imported.bodyAsText())
            val accepted =
                json.decodeFromString(
                    ImportAcceptedResponse.serializer(),
                    imported.bodyAsText(),
                )
            assertEquals(65, accepted.totalCards)
            assertEquals(11, accepted.distinctCards)

            // §2.77 — the deck is listed.
            val list = client.get("/api/decks") { authed() }.bodyAsText()
            assertTrue(list.contains(accepted.deckId), list)

            // §2.78 — detail carries entries and ART URLS, never paths.
            val detail =
                json.decodeFromString(
                    DeckDetail.serializer(),
                    client.get("/api/decks/${accepted.deckId}") { authed() }.bodyAsText(),
                )
            assertEquals(11, detail.entries.size)
            val withArt = detail.entries.filter { it.artUrl != null }
            assertEquals(11, withArt.size)
            assertTrue(
                withArt.all { it.artUrl!!.startsWith("/api/decks/") },
                "art must be an Arena URL, not a filesystem path",
            )

            // §2.61 — the asset serves as a PNG, cacheable.
            val asset = client.get(withArt.first().artUrl!!) { authed() }
            assertEquals(HttpStatusCode.OK, asset.status)
            assertEquals(
                ContentType.Image.PNG.toString(),
                asset.headers[HttpHeaders.ContentType],
            )
            assertTrue(
                asset.headers[HttpHeaders.CacheControl]?.contains("max-age") == true,
                "content-addressed assets should be cacheable",
            )
        }

    /** Owner decision D3, over HTTP. */
    @Test
    fun `a duplicate package is refused with 409 and names the existing deck`() =
        testApplication {
            application { module(config()) }
            seedUser()
            signIn()

            val first =
                client.post("/api/decks/import") {
                    authed()
                    setBody(uploadBody())
                }
            val deckId =
                json.decodeFromString(
                    ImportAcceptedResponse.serializer(),
                    first.bodyAsText(),
                ).deckId

            val second =
                client.post("/api/decks/import") {
                    authed()
                    setBody(uploadBody())
                }
            assertEquals(HttpStatusCode.Conflict, second.status)
            val rejected =
                json.decodeFromString(
                    ImportRejectedResponse.serializer(),
                    second.bodyAsText(),
                )
            assertEquals("DUPLICATE_PACKAGE", rejected.errorCode)
            assertTrue(rejected.problems.contains(deckId), "should name the existing deck")
        }

    /** §2.75 — structured problems, never an opaque 500. */
    @Test
    fun `an invalid package returns structured problems`() =
        testApplication {
            application { module(config()) }
            seedUser()
            signIn()

            val notAZip = File("build/not-a-package.zip").apply { writeText("not a zip at all") }
            val response =
                client.post("/api/decks/import") {
                    authed()
                    setBody(uploadBody(notAZip))
                }

            assertEquals(HttpStatusCode.UnprocessableEntity, response.status)
            val rejected =
                json.decodeFromString(
                    ImportRejectedResponse.serializer(),
                    response.bodyAsText(),
                )
            assertEquals("NOT_A_ZIP", rejected.errorCode)
            // §2.76 — no stack trace, no server path.
            assertTrue(!rejected.detail.contains("Exception"), rejected.detail)
            assertTrue(!rejected.detail.contains("build"), rejected.detail)
        }

    /** §2.21 — the switch still works, even though it defaults on. */
    @Test
    fun `import can be disabled`() =
        testApplication {
            application { module(config(importEnabled = false)) }
            seedUser()
            signIn()

            val response =
                client.post("/api/decks/import") {
                    authed()
                    setBody(uploadBody())
                }
            assertEquals(HttpStatusCode.ServiceUnavailable, response.status)
            assertTrue(response.bodyAsText().contains("IMPORT_DISABLED"))

            // Reading stays available: disabling MUTATION is the point.
            assertEquals(HttpStatusCode.OK, client.get("/api/decks") { authed() }.status)
        }

    /**
     * An asset id is a content hash and nothing else.
     *
     * The shape is validated rather than the resolved path, so no
     * traversal is possible whatever is sent.
     */
    @Test
    fun `an asset id cannot be used to escape the art directory`() =
        testApplication {
            application { module(config()) }
            seedUser()
            signIn()

            for (id in listOf(
                "../../../etc/passwd",
                "..%2F..%2Fsecret",
                "not-a-hash",
                "a".repeat(63),
                "A".repeat(64),
            )) {
                val response = client.get("/api/decks/${java.util.UUID.randomUUID()}/assets/$id") { authed() }
                assertTrue(
                    response.status == HttpStatusCode.BadRequest ||
                        response.status == HttpStatusCode.NotFound,
                    "asset id \"$id\" returned ${response.status}",
                )
                assertTrue(
                    !response.bodyAsText().contains("root:"),
                    "an asset id served a system file",
                )
            }
        }

    /** §2.79, §2.80 — deletion removes the deck and its entries only. */
    @Test
    fun `deleting a deck removes it without touching shared art`() =
        testApplication {
            application { module(config()) }
            seedUser()
            signIn()

            val deckId =
                json.decodeFromString(
                    ImportAcceptedResponse.serializer(),
                    client.post("/api/decks/import") {
                        authed()
                        setBody(uploadBody())
                    }.bodyAsText(),
                ).deckId

            assertEquals(HttpStatusCode.NoContent, client.delete("/api/decks/$deckId") { authed() }.status)
            assertEquals(HttpStatusCode.NotFound, client.get("/api/decks/$deckId") { authed() }.status)
            // Deleting twice is a 404, not a 500.
            assertEquals(HttpStatusCode.NotFound, client.delete("/api/decks/$deckId") { authed() }.status)

            // The art survives: it is content-addressed and another deck
            // may be using it (§2.135, §2.60).
            val store = ArtStore(dataRoot)
            val anyArt = File(dataRoot, "art/original").walkTopDown().firstOrNull { it.extension == "png" }
            assertTrue(anyArt != null && anyArt.isFile, "shared art should survive a deck deletion")
            assertTrue(store.originalPath(anyArt.nameWithoutExtension).isFile)
        }

    @Test
    fun `an unknown deck id is a 404 and a malformed one is a 400`() =
        testApplication {
            application { module(config()) }
            seedUser()
            signIn()
            assertEquals(
                HttpStatusCode.NotFound,
                client.get("/api/decks/${java.util.UUID.randomUUID()}") { authed() }.status,
            )
            assertEquals(HttpStatusCode.BadRequest, client.get("/api/decks/not-a-uuid") { authed() }.status)
        }
}
