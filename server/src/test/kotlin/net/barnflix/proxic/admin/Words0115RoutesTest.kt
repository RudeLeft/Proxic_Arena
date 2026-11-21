package net.barnflix.proxic.admin

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
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
import net.barnflix.proxic.FreshDatabase
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.CSRF_HEADER
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.match.GameOutcome
import net.barnflix.proxic.match.LiveMatch
import net.barnflix.proxic.match.Match
import net.barnflix.proxic.match.MatchAnnouncer
import net.barnflix.proxic.match.MatchEndings
import net.barnflix.proxic.match.MatchRecords
import net.barnflix.proxic.match.MatchStatus
import net.barnflix.proxic.match.MatchWorker
import net.barnflix.proxic.module
import net.barnflix.proxic.room.RoomService
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.slf4j.LoggerFactory
import org.testcontainers.DockerClientFactory
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Spec 0115 (F-0115-A, F-0115-B) -- the Admin API's sentences, exact, on a
 * real server and database (docs/features/wording/0115-wording-table.md).
 * Codes are unchanged except W3-029's, where the code and the words
 * disagreed.
 */
class Words0115RoutesTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        database().use { db ->
            val accounts = Accounts(db.dataSource())
            accounts.createUser("RudeLeft", password, Role.ADMIN)
            accounts.createUser("Pat", password, Role.PLAYER)
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
            dataRoot = "build/test-words-0115",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun database(): Database = Database.connect(config())!!.also { it.migrate() }

    private fun userId(username: String): UUID {
        database().use { return Accounts(it.dataSource()).findByUsername(username)!!.userId }
    }

    private class Session(val token: String, val csrf: String)

    private suspend fun ApplicationTestBuilder.session(username: String): Session {
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

    private suspend fun ApplicationTestBuilder.call(
        session: Session,
        method: String,
        path: String,
        json: String? = null,
    ): HttpResponse {
        val build: io.ktor.client.request.HttpRequestBuilder.() -> Unit = {
            header(HttpHeaders.Cookie, "$SESSION_COOKIE=${session.token}; $CSRF_COOKIE=${session.csrf}")
            header(CSRF_HEADER, session.csrf)
            json?.let {
                contentType(ContentType.Application.Json)
                setBody(it)
            }
        }
        return when (method) {
            "GET" -> client.get(path, build)
            "PUT" -> client.put(path, build)
            else -> client.post(path, build)
        }
    }

    private fun detail(body: String) = Regex(""""detail":"([^"]*)"""").find(body)?.groupValues?.get(1)

    @Test
    fun `W3-017 to W3-021 and W3-030 the Admin API answers in sentences`() =
        testApplication {
            application { module(config()) }
            val admin = session("RudeLeft")
            val pat = userId("Pat")

            // W3-018: sentences, never the audit text or the enum's name.
            val disabled = call(admin, "PUT", "/api/admin/accounts/$pat/status", """{"status":"DISABLED"}""")
            assertEquals("Pat is now disabled.", detail(disabled.bodyAsText()), disabled.bodyAsText())
            val enabled = call(admin, "PUT", "/api/admin/accounts/$pat/status", """{"status":"ACTIVE"}""")
            assertEquals("Pat is now active.", detail(enabled.bodyAsText()))
            val made = call(admin, "PUT", "/api/admin/accounts/$pat/role", """{"role":"ADMIN"}""")
            assertEquals("Pat is now an administrator.", detail(made.bodyAsText()))
            val back = call(admin, "PUT", "/api/admin/accounts/$pat/role", """{"role":"PLAYER"}""")
            assertEquals("Pat is now a player.", detail(back.bodyAsText()))
            val out = call(admin, "POST", "/api/admin/accounts/$pat/sign-out")
            assertEquals("Pat was not signed in anywhere.", detail(out.bodyAsText()))
            for (body in listOf(disabled, enabled, made, back, out).map { it.bodyAsText() }) {
                assertFalse(Regex("[A-Z]{2,}_[A-Z]+|=").containsMatchIn(detail(body)!!), body)
            }

            // W3-020, W3-021: what to choose, not the enum or the JSON.
            val badStatus = call(admin, "PUT", "/api/admin/accounts/$pat/status", """{"status":"maybe"}""")
            assertEquals("Choose Active or Disabled.", detail(badStatus.bodyAsText()))
            assertTrue(badStatus.bodyAsText().contains("INVALID_REQUEST"))
            val badRole = call(admin, "PUT", "/api/admin/accounts/$pat/role", """{"role":"KING"}""")
            assertEquals("Choose Admin or Player.", detail(badRole.bodyAsText()))
            val badSwitch = call(admin, "POST", "/api/admin/update-waiting", """{"on":"yes please"}""")
            assertEquals("Choose on or off.", detail(badSwitch.bodyAsText()), badSwitch.bodyAsText())
            val badInvite = call(admin, "POST", "/api/admin/invites", """{"email":"x@example.com","role":"KING"}""")
            assertEquals("Enter an email address and choose Player or Admin.", detail(badInvite.bodyAsText()))

            // W3-017: a sentence, not "closed; the match ended with no winner".
            val roomId =
                database().use { db ->
                    val source = db.dataSource()
                    val rooms = RoomService(source, net.barnflix.proxic.deck.DeckAuthorization(source))
                    val created = rooms.create(pat, "Pat's table")
                    (created as net.barnflix.proxic.room.RoomResult.Ok).room.roomId
                }
            val closed = call(admin, "POST", "/api/admin/rooms/$roomId/close")
            assertEquals(HttpStatusCode.OK, closed.status, closed.bodyAsText())
            assertEquals("Closed.", detail(closed.bodyAsText()))

            // W3-030: a fresh start waits for a game being played, and says what to do.
            database().use { seedRunningMatch(it) }
            val waits =
                call(admin, "POST", "/api/admin/purge", """{"scope":"everything","confirm":"PURGE"}""").bodyAsText()
            assertTrue(waits.contains("GAME_RUNNING"), waits)
            assertEquals("A game is being played. Wait for it to end.", detail(waits))
        }

    /**
     * F-0115-B (W3-022) -- a match the worker stopped, with the worker's
     * detail (a class name), reaches the Admin API as its code only; the
     * detail is in the server log, from the moment it stopped.
     */
    @Test
    fun `F-0115-B a stopped game's worker detail stays out of the reply and is in the log`() =
        testApplication {
            application { module(config()) }
            val detail = "UnsupportedOperationException: choosePermanentsToSacrifice"
            val logged = ListAppender<ILoggingEvent>().also { it.start() }
            val logger = LoggerFactory.getLogger(MatchEndings::class.java) as Logger
            logger.addAppender(logged)
            val matchId =
                database().use { db ->
                    val (id, setup, room) = seedRunningMatch(db)
                    // The real ending path: the row, then the log line (MatchEndings.finish).
                    val match = Match(id, setup, room, MatchStatus.RUNNING, "open-format", emptyList())
                    MatchEndings(MatchRecords(db.dataSource()), MatchAnnouncer.NONE, null).finish(
                        LiveMatch(match, MatchWorker(config(), id)),
                        GameOutcome(GameOutcome.FAILED, null, 10, detail = detail),
                        alreadyGone = false,
                    )
                    id
                }
            logger.detachAppender(logged)

            val body = call(session("RudeLeft"), "GET", "/api/admin/matches").bodyAsText()
            assertTrue(body.contains(matchId.toString()), body)
            assertTrue(body.contains("\"ending\":\"Stopped: WORKER_STOPPED\""), body)
            assertFalse(body.contains("UnsupportedOperationException"), body)
            assertFalse(body.contains("choosePermanentsToSacrifice"), body)
            assertTrue(
                logged.list.map { it.formattedMessage }.any { it.contains(matchId.toString()) && it.contains(detail) },
                "the worker's detail was not logged: ${logged.list.map { it.formattedMessage }}",
            )
        }

    /** A RUNNING match between RudeLeft and Pat, with its room and setup. */
    private fun seedRunningMatch(db: Database): Triple<UUID, UUID, UUID> {
        val room = UUID.randomUUID()
        val setup = UUID.randomUUID()
        val match = UUID.randomUUID()
        db.dataSource().connection.use { c ->
            fun exec(
                sql: String,
                vararg values: Any?,
            ) = c.prepareStatement(sql).use { s ->
                values.forEachIndexed { i, v -> s.setObject(i + 1, v) }
                s.executeUpdate()
            }
            exec(
                "INSERT INTO room (room_id, host_user_id, status, preset_id, desired_player_count, name) " +
                    "VALUES (?, ?, 'CLOSED', 'open-format', 2, 'Seeded')",
                room,
                userId("RudeLeft"),
            )
            exec(
                "INSERT INTO match_setup (setup_id, room_id, status, preset_id, source_room_revision) " +
                    "VALUES (?, ?, 'CONSUMED', 'open-format', 1)",
                setup,
                room,
            )
            exec(
                "INSERT INTO match (match_id, setup_id, room_id, status, preset_id, started_at, forge_commit, " +
                    "forge_release, worker_protocol_version, public_protocol_version) " +
                    "VALUES (?, ?, ?, 'RUNNING', 'open-format', now(), 'c', 'r', 1, 1)",
                match,
                setup,
                room,
            )
            for ((seat, name) in listOf(1 to "RudeLeft", 2 to "Pat")) {
                exec(
                    "INSERT INTO match_participant (match_id, user_id, seat_number, display_name_snapshot, " +
                        "deck_name_snapshot) VALUES (?, ?, ?, ?, 'Burn')",
                    match,
                    userId(name),
                    seat,
                    name,
                )
            }
        }
        return Triple(match, setup, room)
    }
}
