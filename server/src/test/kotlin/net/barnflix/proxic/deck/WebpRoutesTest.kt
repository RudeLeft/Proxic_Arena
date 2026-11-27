package net.barnflix.proxic.deck

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.readBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import net.barnflix.proxic.Database
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.module
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.io.File
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Spec 0121, F-0121-D: with its WebP copies made, a picture answers as
 * `image/webp` at its one address (spec 0052), its close-up and the old
 * per-deck address, under the same cache rule; no session is refused and an
 * unknown picture is not found, as before. With the WebP copy gone (a picture
 * the one-time pass has not reached) the JPEG copy answers as a JPEG, and a
 * PNG copy as a PNG: one rule for all three addresses (`respondPicture`).
 *
 * The per-match address answers through the same `respondPicture`; it needs a
 * running game to be shown a picture, so its WebP answer is checked in a real
 * game (frontend/e2e/match-webp-pictures.spec.ts).
 */
class WebpRoutesTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"
    private val sha = "b".repeat(64)
    private val root = File("build/test-webp-routes-${UUID.randomUUID()}")

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        Database.connect(config())!!.use { database ->
            database.migrate()
            Accounts(database.dataSource()).createUser("Pat", password, Role.PLAYER)
        }
    }

    @AfterTest
    fun stop() {
        container?.stop()
        root.deleteRecursively()
    }

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = root.path,
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    /** Pat's deck of one Mountain wearing picture [sha]. */
    private fun deckWithPicture(): UUID {
        val deckId = UUID.randomUUID()
        Database.connect(config())!!.use { database ->
            val owner = Accounts(database.dataSource()).findByUsername("Pat")!!.userId
            database.dataSource().connection.use { connection ->
                connection.prepareStatement(
                    """
                    INSERT INTO imported_deck
                        (deck_id, display_name, source_filename, package_sha256, total_cards,
                         distinct_cards, import_schema_version, owner_user_id)
                    VALUES (?, 'WebP', 'WebP.zip', ?, 60, 1, 1, ?)
                    """.trimIndent(),
                ).use {
                    it.setObject(1, deckId)
                    it.setString(2, "a".repeat(64))
                    it.setObject(3, owner)
                    it.executeUpdate()
                }
                connection.prepareStatement("INSERT INTO art_asset (content_sha256, byte_size) VALUES (?, 1)").use {
                    it.setString(1, sha)
                    it.executeUpdate()
                }
                connection.prepareStatement(
                    """
                    INSERT INTO deck_entry (deck_id, line_number, quantity, card_name, source_text,
                                            resolution_status, art_sha256)
                    VALUES (?, 1, 60, 'Mountain', '60 Mountain', 'RESOLVED', ?)
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

    /** A file in the picture store, [bytes] long, filled with [fill]. */
    private fun art(
        folder: String,
        extension: String,
        bytes: Int,
        fill: Byte,
    ): File =
        File(root, "art/$folder/${sha.substring(0, 2)}/$sha.$extension").apply {
            parentFile.mkdirs()
            writeBytes(ByteArray(bytes) { fill })
        }

    private suspend fun ApplicationTestBuilder.signIn(): String {
        val response =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"Pat","password":"$password"}""")
            }
        return response.headers.getAll(HttpHeaders.SetCookie)!!
            .first { it.startsWith("$SESSION_COOKIE=") }
            .substringAfter("=").substringBefore(";")
    }

    private suspend fun ApplicationTestBuilder.getAs(
        token: String,
        path: String,
    ): HttpResponse = client.get(path) { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token") }

    @Test
    fun `F-0121-D every picture address answers WebP with the same cache rule`() =
        testApplication {
            val deck = deckWithPicture()
            art("original", "png", ORIGINAL, 1)
            val pngTable = art("display", "png", OLD_TABLE, 2)
            val table = art("display", "webp", TABLE, 3)
            art("zoom", "jpg", OLD_CLOSE_UP, 4)
            val closeUp = art("zoom", "webp", CLOSE_UP, 5)
            application { module(config()) }
            val pat = signIn()

            val answers =
                mapOf(
                    "/api/pictures/$sha" to TABLE,
                    "/api/pictures/$sha?size=full" to CLOSE_UP,
                    "/api/decks/$deck/assets/$sha" to TABLE,
                    "/api/decks/$deck/assets/$sha?size=full" to CLOSE_UP,
                )
            for ((address, bytes) in answers) {
                val answer = getAs(pat, address)
                assertEquals(HttpStatusCode.OK, answer.status, address)
                assertEquals("image/webp", answer.headers[HttpHeaders.ContentType], address)
                assertEquals(CACHE, answer.headers[HttpHeaders.CacheControl], address)
                assertEquals(bytes, answer.readBytes().size, "$address: the WebP copy")
            }
            assertEquals(HttpStatusCode.Unauthorized, client.get("/api/pictures/$sha").status, "no session")
            assertEquals(HttpStatusCode.NotFound, getAs(pat, "/api/pictures/${"e".repeat(64)}").status)

            // Not reached by the one-time pass yet: the older copies, said as what they are.
            closeUp.delete()
            table.delete()
            for (address in listOf("/api/pictures/$sha", "/api/decks/$deck/assets/$sha")) {
                val full = getAs(pat, "$address?size=full")
                assertEquals(ContentType.Image.JPEG.toString(), full.headers[HttpHeaders.ContentType], address)
                assertEquals(OLD_CLOSE_UP, full.readBytes().size)
                val small = getAs(pat, address)
                assertEquals(ContentType.Image.PNG.toString(), small.headers[HttpHeaders.ContentType], address)
                assertEquals(CACHE, small.headers[HttpHeaders.CacheControl], address)
                assertEquals(OLD_TABLE, small.readBytes().size)
            }
            pngTable.delete()
            assertEquals(ORIGINAL, getAs(pat, "/api/pictures/$sha").readBytes().size, "then the original")
        }

    private companion object {
        const val CACHE = "private, max-age=31536000, immutable"
        const val ORIGINAL = 300
        const val OLD_TABLE = 64
        const val TABLE = 40
        const val OLD_CLOSE_UP = 200
        const val CLOSE_UP = 120
    }
}
