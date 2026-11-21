package net.barnflix.proxic

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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Spec 0114 -- the server's sentences a player reads from its routes, as
 * the pages show them word for word (F-0114-A), and `/api/version`'s
 * engine fields for an administrator only (F-0114-C). Codes unchanged
 * (PROTO-006).
 */
class Words0114RoutesTest {
    private var container: FreshDatabase? = null
    private val json = Json { ignoreUnknownKeys = true }
    private val password = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        Database.connect(config())!!.use { database ->
            database.migrate()
            Accounts(database.dataSource()).createUser("RudeLeft", password, Role.ADMIN)
            Accounts(database.dataSource()).createUser("Pat", password, Role.PLAYER)
        }
    }

    @AfterTest
    fun stop() = container!!.stop()

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-words-routes",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private suspend fun ApplicationTestBuilder.login(
        username: String,
        secret: String = password,
    ): HttpResponse =
        client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"$username","password":"$secret"}""")
        }

    private suspend fun ApplicationTestBuilder.session(username: String): String =
        login(username).headers.getAll(HttpHeaders.SetCookie)!!
            .first { it.startsWith("$SESSION_COOKIE=") }
            .substringAfter("=").substringBefore(";")

    private suspend fun ApplicationTestBuilder.getAs(
        session: String,
        path: String,
    ): HttpResponse = client.get(path) { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$session") }

    private suspend fun HttpResponse.body(): JsonObject = json.parseToJsonElement(bodyAsText()).jsonObject

    private suspend fun HttpResponse.said(): Pair<String, String> =
        body().let { it["errorCode"]!!.jsonPrimitive.content to it["detail"]!!.jsonPrimitive.content }

    private val engineFields = listOf("forgeRelease", "forgeCommit", "javaVersion")

    @Test
    fun `F-0114-C a player's version has no engine fields, an administrator's has them`() =
        testApplication {
            application { module(config()) }
            val player = getAs(session("Pat"), "/api/version").body()
            for (field in engineFields) assertFalse(field in player, "a player was sent $field: $player")
            assertEquals(BuildInfo.PROXIC_VERSION, player["proxicVersion"]!!.jsonPrimitive.content)
            assertTrue("buildId" in player, "the update check needs the build id: $player")

            val admin = getAs(session("RudeLeft"), "/api/version").body()
            for (field in engineFields) assertTrue(field in admin, "the administrator lost $field: $admin")
            assertEquals(BuildInfo.FORGE_RELEASE, admin["forgeRelease"]!!.jsonPrimitive.content)
        }

    @Test
    fun `W2-139 to W2-145 ids a player never typed are said as things`() =
        testApplication {
            application { module(config()) }
            val pat = session("Pat")
            val uuid = UUID.randomUUID()
            val sha = "ab".repeat(32)
            assertEquals("NOT_FOUND" to "That page doesn't exist.", getAs(pat, "/api/no-such-thing").said())
            assertEquals("INVALID_DECK_ID" to "That deck doesn't exist.", getAs(pat, "/api/decks/not-a-deck").said())
            assertEquals(
                "INVALID_DECK_ID" to "That deck doesn't exist.",
                getAs(pat, "/api/decks/not-a-deck/shares").said(),
            )
            assertEquals(
                "INVALID_ASSET_ID" to "That picture is no longer available.",
                getAs(pat, "/api/decks/$uuid/assets/not-a-picture").said(),
            )
            assertEquals("INVALID_ROOM_ID" to "That room doesn't exist.", getAs(pat, "/api/rooms/not-a-room").said())
            assertEquals("INVALID_REQUEST" to "That game doesn't exist.", getAs(pat, "/api/matches/not-a-game").said())
            assertEquals(
                "INVALID_REQUEST" to "That room doesn't exist.",
                getAs(pat, "/api/matches/watch/not-a-room").said(),
            )
            assertEquals(
                "INVALID_MATCH_ID" to "That game doesn't exist.",
                getAs(pat, "/api/matches/not-a-game/assets/$sha").said(),
            )
        }

    @Test
    fun `W2-114 the sign-in wait is said in minutes`() =
        testApplication {
            application { module(config()) }
            var throttled: HttpResponse? = null
            repeat(15) {
                val response = login("Pat", "wrong every time")
                if (response.status == HttpStatusCode.TooManyRequests) throttled = response
            }
            val refusal = throttled!!.said()
            assertEquals("TOO_MANY_ATTEMPTS" to "Too many sign-in attempts. Try again in about 15 minutes.", refusal)
        }
}
