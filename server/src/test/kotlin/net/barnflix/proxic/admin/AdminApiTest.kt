package net.barnflix.proxic.admin

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
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
import net.barnflix.proxic.auth.AccountStatus
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.CSRF_COOKIE
import net.barnflix.proxic.auth.CSRF_HEADER
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.auth.Sessions
import net.barnflix.proxic.module
import net.barnflix.proxic.room.RoomService
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * The Admin API — PHASE_07 §7.67, §7.68, Amendment 9.
 *
 * §7.68 asks two things of these tests in particular: that a player
 * cannot reach ANY admin route, and that the last-admin rule holds
 * against the API, not only the page.
 */
class AdminApiTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container =
            TestPostgres.fresh()
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
            dataRoot = "build/test-admin",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun database(): Database = Database.connect(config())!!.also { it.migrate() }

    private fun userId(username: String): UUID {
        database().use { return Accounts(it.dataSource()).findByUsername(username)!!.userId }
    }

    private fun <T> sql(
        query: String,
        read: (java.sql.ResultSet) -> T,
    ): T =
        database().use { db ->
            db.dataSource().connection.use { c -> c.createStatement().executeQuery(query).use(read) }
        }

    private class Session(val token: String, val csrf: String)

    private suspend fun ApplicationTestBuilder.signIn(
        username: String,
        secret: String = password,
        from: String? = null,
    ): HttpResponse =
        client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            from?.let { header("X-Forwarded-For", it) }
            setBody("""{"username":"$username","password":"$secret"}""")
        }

    private suspend fun ApplicationTestBuilder.session(username: String): Session {
        val response = signIn(username)

        fun cookie(name: String) =
            response.headers.getAll(HttpHeaders.SetCookie)!!
                .first { it.startsWith("$name=") }
                .substringAfter("=").substringBefore(";")
        return Session(cookie(SESSION_COOKIE), cookie(CSRF_COOKIE))
    }

    private suspend fun ApplicationTestBuilder.call(
        session: Session?,
        method: String,
        path: String,
        json: String? = null,
        csrf: Boolean = true,
    ): HttpResponse {
        val build: io.ktor.client.request.HttpRequestBuilder.() -> Unit = {
            session?.let {
                header(HttpHeaders.Cookie, "$SESSION_COOKIE=${it.token}; $CSRF_COOKIE=${it.csrf}")
                if (csrf) header(CSRF_HEADER, it.csrf)
            }
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

    private val everyRoute =
        listOf(
            "GET" to "/api/admin/accounts",
            "POST" to "/api/admin/accounts",
            "PUT" to "/api/admin/accounts/{id}/status",
            "PUT" to "/api/admin/accounts/{id}/role",
            "POST" to "/api/admin/accounts/{id}/password-reset",
            "PUT" to "/api/admin/accounts/{id}/email",
            "POST" to "/api/admin/accounts/{id}/sign-out",
            "GET" to "/api/admin/rooms",
            "POST" to "/api/admin/rooms/{room}/close",
            "GET" to "/api/admin/server",
            "GET" to "/api/admin/sign-ins",
            "GET" to "/api/admin/matches",
            "GET" to "/api/admin/matches/{room}/record",
        )

    @Test
    fun `a player reaches no admin route, and nobody signed out does either`() =
        testApplication {
            application { module(config()) }
            val pat = session("Pat")
            val target = userId("RudeLeft")
            for ((method, template) in everyRoute) {
                val path = template.replace("{id}", target.toString()).replace("{room}", UUID.randomUUID().toString())
                val asPlayer = call(pat, method, path, """{"status":"DISABLED","role":"PLAYER","password":"x"}""")
                assertEquals(HttpStatusCode.Forbidden, asPlayer.status, "$method $path as a player")
                assertEquals(HttpStatusCode.Unauthorized, call(null, method, path).status, "$method $path anonymous")
            }
            // And nothing happened to the administrator Pat aimed at.
            assertEquals(
                "ACTIVE",
                sql("SELECT status FROM app_user WHERE username = 'RudeLeft'") {
                    it.next()
                    it.getString(1)
                },
            )
        }

    @Test
    fun `the last active administrator cannot be disabled or demoted, by themselves either`() =
        testApplication {
            application { module(config()) }
            val admin = session("RudeLeft")
            val me = userId("RudeLeft")

            val disable = call(admin, "PUT", "/api/admin/accounts/$me/status", """{"status":"DISABLED"}""")
            assertEquals(HttpStatusCode.Conflict, disable.status)
            assertTrue(disable.bodyAsText().contains("LAST_ADMIN"))
            val demote = call(admin, "PUT", "/api/admin/accounts/$me/role", """{"role":"PLAYER"}""")
            assertEquals(HttpStatusCode.Conflict, demote.status)

            // With a second administrator, either may go -- and then the
            // other is the last one.
            val pat = userId("Pat")
            val promote = call(admin, "PUT", "/api/admin/accounts/$pat/role", """{"role":"ADMIN"}""")
            assertEquals(HttpStatusCode.OK, promote.status)
            val stepDown = call(admin, "PUT", "/api/admin/accounts/$me/role", """{"role":"PLAYER"}""")
            assertEquals(HttpStatusCode.OK, stepDown.status)
            val patSession = session("Pat")
            val last = call(patSession, "PUT", "/api/admin/accounts/$pat/status", """{"status":"DISABLED"}""")
            assertEquals(HttpStatusCode.Conflict, last.status)
            // The demoted administrator lost the API on the very next request (§3.19).
            assertEquals(HttpStatusCode.Forbidden, call(admin, "GET", "/api/admin/accounts").status)
        }

    @Test
    fun `two administrators disabling each other at once cannot leave none`() {
        database().use { db ->
            val source = db.dataSource()
            val sessions = Sessions(source)
            val accounts = Accounts(source, sessions)
            accounts.createUser("Sam", password, Role.ADMIN)
            val admin = AdminAccounts(source, accounts, sessions)
            val ids = listOf(userId("RudeLeft"), userId("Sam"))
            repeat(20) {
                for (id in ids) admin.setStatus(id, AccountStatus.ACTIVE)
                val start = CountDownLatch(1)
                val pool = Executors.newFixedThreadPool(2)
                val results =
                    ids.map { target ->
                        pool.submit<AdminChange> {
                            start.await()
                            admin.setStatus(target, AccountStatus.DISABLED)
                        }
                    }
                start.countDown()
                val outcomes = results.map { it.get() }
                pool.shutdown()
                assertEquals(1, outcomes.count { it is AdminChange.Done }, outcomes.toString())
                assertEquals(
                    1,
                    sql("SELECT count(*) FROM app_user WHERE role = 'ADMIN' AND status = 'ACTIVE'") {
                        it.next()
                        it.getInt(1)
                    },
                )
            }
        }
    }

    @Test
    fun `an administrator creates an account, and the rules of Phase 3 still apply`() =
        testApplication {
            application { module(config()) }
            val admin = session("RudeLeft")
            val created =
                call(
                    admin,
                    "POST",
                    "/api/admin/accounts",
                    """{"username":"kwil","displayName":"Kwil","password":"$password","role":"PLAYER"}""",
                )
            assertEquals(HttpStatusCode.Created, created.status, created.bodyAsText())
            assertTrue(call(admin, "GET", "/api/admin/accounts").bodyAsText().contains("\"username\":\"kwil\""))
            assertEquals(HttpStatusCode.OK, signIn("kwil").status)

            val again =
                call(admin, "POST", "/api/admin/accounts", """{"username":"KWIL","password":"$password"}""")
            assertEquals(HttpStatusCode.Conflict, again.status)
            val weak = call(admin, "POST", "/api/admin/accounts", """{"username":"oxbow","password":"short"}""")
            assertEquals(HttpStatusCode.UnprocessableEntity, weak.status)
            // CSRF, like every other change (§3.52).
            val forged =
                call(
                    admin,
                    "POST",
                    "/api/admin/accounts",
                    """{"username":"forged","displayName":"","password":"$password"}""",
                    csrf = false,
                )
            assertEquals(HttpStatusCode.Forbidden, forged.status)
        }

    @Test
    fun `no administrator can set a password, and an email address is the player's to have (spec 0026)`() =
        testApplication {
            application { module(config()) }
            val admin = session("RudeLeft")
            val pat = userId("Pat")
            // Owner 2026-10-28: the route that set a password is gone.
            val gone = "/api/admin/accounts/$pat/password"
            val old = call(admin, "POST", gone, """{"password":"anything at all here"}""")
            assertEquals(HttpStatusCode.NotFound, old.status)
            assertEquals(HttpStatusCode.OK, signIn("Pat").status, "the password is unchanged")

            // No address yet: the reset is refused with the reason.
            val noEmail = call(admin, "POST", "/api/admin/accounts/$pat/password-reset")
            assertEquals(HttpStatusCode.UnprocessableEntity, noEmail.status)
            assertTrue(noEmail.bodyAsText().contains("NO_EMAIL"), noEmail.bodyAsText())

            val bad = call(admin, "PUT", "/api/admin/accounts/$pat/email", """{"email":"not an address"}""")
            assertEquals(HttpStatusCode.UnprocessableEntity, bad.status)
            val saved = call(admin, "PUT", "/api/admin/accounts/$pat/email", """{"email":" Pat@Example.com "}""")
            assertEquals(HttpStatusCode.OK, saved.status, saved.bodyAsText())
            val listed = call(admin, "GET", "/api/admin/accounts").bodyAsText()
            assertTrue(listed.contains("\"email\":\"pat@example.com\""), listed)

            // An address, but no email account in a test: refused, and no link anywhere.
            val notSetUp = call(admin, "POST", "/api/admin/accounts/$pat/password-reset")
            assertEquals(HttpStatusCode.UnprocessableEntity, notSetUp.status)
            assertTrue(notSetUp.bodyAsText().contains("EMAIL_NOT_SET_UP"), notSetUp.bodyAsText())
            assertFalse(notSetUp.bodyAsText().contains("/reset#"))

            val recorded =
                sql("SELECT action || ' ' || target FROM admin_action") { rows ->
                    buildList { while (rows.next()) add(rows.getString(1)) }
                }
            assertEquals(listOf("EMAIL_CHANGED Pat"), recorded)
        }

    @Test
    fun `sign-in activity shows every attempt with its address, and never a password`() =
        testApplication {
            application { module(config()) }
            signIn("Pat", "a wrong password", from = "203.0.113.7")
            signIn("nobody-here", "whatever it is", from = "203.0.113.8")
            signIn("Pat", from = "198.51.100.2")
            val admin = session("RudeLeft")

            val body = call(admin, "GET", "/api/admin/sign-ins").bodyAsText()
            val failed = "\"kind\":\"FAILED\",\"username\":\"pat\",\"known\":true,\"address\":\"203.0.113.7\""
            assertTrue(body.contains(failed), body)
            assertTrue(body.contains("\"username\":\"nobody-here\",\"known\":false,\"address\":\"203.0.113.8\""), body)
            val signedIn = "\"kind\":\"SIGNED_IN\",\"username\":\"pat\",\"known\":true,\"address\":\"198.51.100.2\""
            assertTrue(body.contains(signedIn), body)
            assertFalse(body.contains("wrong password") || body.contains("whatever it is"))
        }

    @Test
    fun `sign out everywhere ends that account's sessions`() =
        testApplication {
            application { module(config()) }
            val pat = session("Pat")
            val admin = session("RudeLeft")
            val done = call(admin, "POST", "/api/admin/accounts/${userId("Pat")}/sign-out")
            assertEquals(HttpStatusCode.OK, done.status)
            assertTrue(done.bodyAsText().contains("sessions=1"), done.bodyAsText())
            assertEquals(HttpStatusCode.Unauthorized, call(pat, "GET", "/api/rooms/current").status)
        }

    @Test
    fun `an administrator force closes a room they are not in, and it is recorded`() =
        testApplication {
            application { module(config()) }
            val roomId =
                database().use { db ->
                    val source = db.dataSource()
                    val rooms = RoomService(source, net.barnflix.proxic.deck.DeckAuthorization(source))
                    val created = rooms.create(userId("Pat"), "Pat's table")
                    assertTrue(created is net.barnflix.proxic.room.RoomResult.Ok)
                    created.room.roomId
                }
            val admin = session("RudeLeft")
            assertTrue(call(admin, "GET", "/api/admin/rooms").bodyAsText().contains("Pat's table"))

            val closed = call(admin, "POST", "/api/admin/rooms/$roomId/close")
            assertEquals(HttpStatusCode.OK, closed.status, closed.bodyAsText())
            val status =
                sql("SELECT status FROM room WHERE room_id = '$roomId'") {
                    it.next()
                    it.getString(1)
                }
            assertEquals("CLOSED", status)
            assertNotNull(
                sql("SELECT target FROM admin_action WHERE action = 'FORCE_CLOSE_ROOM'") {
                    if (it.next()) it.getString(1) else null
                },
            )
            // Closing it again is "no such room", not a second record.
            assertEquals(HttpStatusCode.NotFound, call(admin, "POST", "/api/admin/rooms/$roomId/close").status)
        }

    @Test
    fun `the server state names the version, the database and the worker`() =
        testApplication {
            application { module(config()) }
            val body = call(session("RudeLeft"), "GET", "/api/admin/server").bodyAsText()
            assertTrue(body.contains("\"database\":\"PostgreSQL 16"), body)
            assertTrue(body.contains("\"forgeWorker\":\"unconfigured\""), body)
            assertTrue(body.contains("\"gamesRunning\":0"), body)
        }

    /**
     * PHASE_07 §7.56, P7-U — a game record holds both players' hidden
     * information, so only an administrator can download one (the player
     * case is in the every-route test above).
     */
    @Test
    fun `an administrator downloads a match's game record, and none kept is a 404`() =
        testApplication {
            application { module(config()) }
            val matchId = UUID.randomUUID()
            val record =
                net.barnflix.proxic.match.GameRecord.open(
                    config().gameRecords(),
                    matchId,
                    org.slf4j.LoggerFactory.getLogger("test"),
                )
            record.fromWorker("""{"type":"DECISION_REQUEST","decisionId":"1"}""")
            record.close()
            val admin = session("RudeLeft")

            val got = call(admin, "GET", "/api/admin/matches/$matchId/record")
            assertEquals(HttpStatusCode.OK, got.status)
            assertTrue(got.headers[HttpHeaders.ContentDisposition].orEmpty().contains("attachment"))
            val bytes = got.readBytes()
            val text = java.util.zip.GZIPInputStream(bytes.inputStream()).bufferedReader().readText()
            assertTrue(text.contains("\"from\":\"worker\""), text)
            assertTrue(text.contains("DECISION_REQUEST"), text)

            assertEquals(
                HttpStatusCode.NotFound,
                call(admin, "GET", "/api/admin/matches/${UUID.randomUUID()}/record").status,
            )
            val list = call(admin, "GET", "/api/admin/matches").bodyAsText()
            assertTrue(list.contains("\"keepDays\":30"), list)
        }
}
