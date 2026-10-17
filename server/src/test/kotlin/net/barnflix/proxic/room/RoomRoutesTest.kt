package net.barnflix.proxic.room

import io.ktor.client.HttpClient
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.delete
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The room routes — PHASE_05 §5.14, §5.58, §5.76–§5.81, §5.138,
 * §5.139.
 *
 * Driven over HTTP rather than against RoomService, because the
 * service already has its own tests and these exist to prove the
 * things only a route decides: what a stranger is told, which
 * status a refusal earns, and whether the gate is actually on.
 */
class RoomRoutesTest {
    private var container: PostgreSQLContainer<*>? = null
    private val password = "a perfectly fine passphrase"

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

        Database.connect(config())!!.use { database ->
            database.migrate()
            val accounts = Accounts(database.dataSource())
            for (name in listOf("RudeLeft", "Pat", "Sam")) {
                accounts.createUser(name, password, Role.PLAYER)
            }
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
            dataRoot = "build/test-room-routes",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * A signed-in caller: the session AND the CSRF pair.
     *
     * Both, because §3.51 requires the double submit on every
     * mutating request and /api/rooms is behind the same gate as
     * /api/decks (C4). A test that carried only the session would
     * prove the routes work for a client that cannot exist.
     */
    private data class Creds(val session: String, val csrf: String)

    private suspend fun ApplicationTestBuilder.signIn(username: String): Creds {
        val cookies =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }.headers.getAll(HttpHeaders.SetCookie)!!

        fun cookie(name: String) = cookies.first { it.startsWith("$name=") }.substringAfter("=").substringBefore(";")

        return Creds(cookie(SESSION_COOKIE), cookie(CSRF_COOKIE))
    }

    private fun HttpRequestBuilder.signedBy(creds: Creds) {
        header(HttpHeaders.Cookie, "$SESSION_COOKIE=${creds.session}; $CSRF_COOKIE=${creds.csrf}")
        header(CSRF_HEADER, creds.csrf)
    }

    private fun HttpRequestBuilder.jsonBody(body: String) {
        contentType(ContentType.Application.Json)
        setBody(body)
    }

    private suspend fun HttpResponse.room(): JsonObject {
        val body = json.parseToJsonElement(bodyAsText()).jsonObject
        return body["room"]!!.jsonObject
    }

    private fun String.withoutRequestId(): String = replace(Regex(""","requestId":"[^"]*\""""), "")

    private suspend fun HttpResponse.errorCode(): String =
        json.parseToJsonElement(bodyAsText()).jsonObject["errorCode"]!!.jsonPrimitive.content

    private suspend fun HttpClient.createRoom(creds: Creds): JsonObject = post("/api/rooms") { signedBy(creds) }.room()

    // --- the gate ---------------------------------------------------------

    /**
     * Carry-forward C4 — the same intercept as /api/decks.
     *
     * Written first because every other test here would still pass
     * if the gate were missing, and an unauthenticated room endpoint
     * is the one failure that makes all the rest pointless.
     */
    @Test
    fun `every room endpoint requires a session`() =
        testApplication {
            application { module(config()) }

            val answers =
                mapOf(
                    "GET /current" to client.get("/api/rooms/current"),
                    "GET /{id}" to client.get("/api/rooms/${UUID.randomUUID()}"),
                    "POST /" to client.post("/api/rooms"),
                    "POST /leave" to client.post("/api/rooms/${UUID.randomUUID()}/leave"),
                    "POST /close" to client.post("/api/rooms/${UUID.randomUUID()}/close"),
                    "DELETE /members" to
                        client.delete(
                            "/api/rooms/${UUID.randomUUID()}/members/${UUID.randomUUID()}",
                        ),
                )

            for ((endpoint, answer) in answers) {
                assertEquals(HttpStatusCode.Unauthorized, answer.status, "$endpoint was open")
            }
        }

    // --- creation and recovery --------------------------------------------

    /** §5.14, §5.16 — creating seats the host in one step. */
    @Test
    fun `creating a room seats the host`() =
        testApplication {
            application { module(config()) }
            val token = signIn("RudeLeft")

            val response =
                client.post("/api/rooms") { signedBy(token) }
            assertEquals(HttpStatusCode.Created, response.status)

            val room = response.room()
            assertEquals("OPEN", room["status"]!!.jsonPrimitive.content)
            val members = room["members"]!!.jsonArray
            assertEquals(1, members.size)
            assertEquals(true, members[0].jsonObject["isHost"]!!.jsonPrimitive.content.toBoolean())
            assertEquals(1, members[0].jsonObject["seatNumber"]!!.jsonPrimitive.content.toInt())
        }

    /** §5.5 — one room at a time, so a second ask is refused. */
    @Test
    fun `a second room is refused while you are in one`() =
        testApplication {
            application { module(config()) }
            val token = signIn("RudeLeft")
            client.createRoom(token)

            val second =
                client.post("/api/rooms") { signedBy(token) }
            assertEquals(HttpStatusCode.Conflict, second.status)
            assertEquals("ALREADY_IN_A_ROOM", second.errorCode())
        }

    /** §5.139 — what the lobby asks on load. Null is a real answer. */
    @Test
    fun `current room is null before, and the room after`() =
        testApplication {
            application { module(config()) }
            val token = signIn("RudeLeft")

            val before =
                client.get("/api/rooms/current") {
                    signedBy(token)
                }
            assertEquals(HttpStatusCode.OK, before.status)
            val body = before.bodyAsText()
            assertEquals(
                JsonNull,
                json.parseToJsonElement(body).jsonObject["room"],
                "expected no room: $body",
            )

            val created = client.createRoom(token)
            val after =
                client.get("/api/rooms/current") {
                    signedBy(token)
                }.room()
            assertEquals(created["roomId"], after["roomId"])
        }

    // --- privacy ------------------------------------------------------------

    /**
     * §5.138, and §4.65's lesson carried forward as C2.
     *
     * The important half is the SECOND assertion: a real room and an
     * invented one must be indistinguishable to someone outside, or
     * the 404 becomes an oracle for which room ids exist.
     */
    @Test
    fun `a non-member cannot tell a real room from an invented one`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val stranger = signIn("Pat")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content

            val real =
                client.get("/api/rooms/$roomId") {
                    signedBy(stranger)
                }
            val invented =
                client.get("/api/rooms/${UUID.randomUUID()}") {
                    signedBy(stranger)
                }

            assertEquals(HttpStatusCode.NotFound, real.status)
            assertEquals(invented.status, real.status)

            // Identical but for the request id, which is per-request
            // by design and says nothing about rooms.
            assertEquals(invented.errorCode(), real.errorCode())
            assertEquals(
                invented.bodyAsText().withoutRequestId(),
                real.bodyAsText().withoutRequestId(),
            )

            // C2 — and it is the GENERIC shape, not ROOM_NOT_FOUND.
            // The §1.44 handler rewrites every 404, so a member's
            // room and a path that was never a route are the same
            // answer. Asserted rather than assumed: a later change
            // that let ROOM_NOT_FOUND through would weaken the
            // privacy rule without failing anything else.
            assertEquals("NOT_FOUND", real.errorCode())
        }

    /** §5.43 — a deck id you do not hold is not a key to anything. */
    @Test
    fun `selecting a deck you cannot use is refused`() =
        testApplication {
            application { module(config()) }
            val token = signIn("RudeLeft")
            val roomId = client.createRoom(token)["roomId"]!!.jsonPrimitive.content

            val response =
                client.put("/api/rooms/$roomId/my-deck") {
                    signedBy(token)
                    jsonBody("""{"deckId":"${UUID.randomUUID()}"}""")
                }

            assertEquals(HttpStatusCode.UnprocessableEntity, response.status)
            assertEquals("DECK_NOT_USABLE", response.errorCode())
        }

    /** §5.41 — and the database CHECK agrees: ready needs a deck. */
    @Test
    fun `readying without a deck is refused`() =
        testApplication {
            application { module(config()) }
            val token = signIn("RudeLeft")
            val roomId = client.createRoom(token)["roomId"]!!.jsonPrimitive.content

            val response =
                client.put("/api/rooms/$roomId/ready") {
                    signedBy(token)
                    jsonBody("""{"ready":true}""")
                }

            assertEquals(HttpStatusCode.UnprocessableEntity, response.status)
            assertEquals("DECK_REQUIRED", response.errorCode())
        }

    // --- host authority -----------------------------------------------------

    /** §5.17 — a member asking for host powers is told no, not 404. */
    @Test
    fun `a non-host cannot close the room`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val other = signIn("Pat")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content
            seat(roomId, "Pat")

            val response =
                client.post("/api/rooms/$roomId/close") {
                    signedBy(other)
                }
            assertEquals(HttpStatusCode.Forbidden, response.status)
            assertEquals("ROOM_HOST_REQUIRED", response.errorCode())

            // The refusal must not have moved anything.
            val still =
                client.get("/api/rooms/$roomId") {
                    signedBy(host)
                }.room()
            assertEquals("OPEN", still["status"]!!.jsonPrimitive.content)
        }

    /** §5.80 — and §5.81: the removed user is out of the room. */
    @Test
    fun `the host removes a member`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val guest = signIn("Pat")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content
            val guestId = seat(roomId, "Pat")

            val response =
                client.delete("/api/rooms/$roomId/members/$guestId") {
                    signedBy(host)
                }
            assertEquals(HttpStatusCode.OK, response.status)
            assertEquals(1, response.room()["members"]!!.jsonArray.size)

            // §5.82 — the removed user's view is no longer
            // authoritative, and asking again says so.
            val after =
                client.get("/api/rooms/$roomId") {
                    signedBy(guest)
                }
            assertEquals(HttpStatusCode.NotFound, after.status)
        }

    /** §5.80 — the host cannot kick themselves into a closed room. */
    @Test
    fun `the host cannot remove themselves`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val room = client.createRoom(host)
            val roomId = room["roomId"]!!.jsonPrimitive.content
            val hostId = room["hostUserId"]!!.jsonPrimitive.content

            val response =
                client.delete("/api/rooms/$roomId/members/$hostId") {
                    signedBy(host)
                }
            assertEquals(HttpStatusCode.UnprocessableEntity, response.status)
            assertEquals("INVALID_ROOM_CONFIGURATION", response.errorCode())
        }

    /** §5.18 — the host leaving ends the room rather than orphaning it. */
    @Test
    fun `the host leaving closes the room for everyone`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val guest = signIn("Pat")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content
            seat(roomId, "Pat")

            val response =
                client.post("/api/rooms/$roomId/leave") {
                    signedBy(host)
                }
            assertEquals(HttpStatusCode.OK, response.status)
            assertEquals("CLOSED", response.room()["status"]!!.jsonPrimitive.content)

            // §5.81 — and the other member is free to host their own.
            val theirs =
                client.post("/api/rooms") { signedBy(guest) }
            assertEquals(HttpStatusCode.Created, theirs.status)
        }

    // --- optimistic concurrency ---------------------------------------------

    /**
     * §5.135–§5.137 — the host's second click, on a room that moved.
     *
     * The scenario is ordinary rather than exotic: a lobby is two
     * people clicking at once by definition.
     */
    @Test
    fun `a stale revision is a conflict, not a silent overwrite`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val room = client.createRoom(host)
            val roomId = room["roomId"]!!.jsonPrimitive.content
            val staleRevision = room["revision"]!!.jsonPrimitive.content.toLong()

            // Something else happens first, which bumps the revision.
            seat(roomId, "Pat")

            val response =
                client.put("/api/rooms/$roomId/player-count") {
                    signedBy(host)
                    jsonBody("""{"playerCount":2,"expectedRoomRevision":$staleRevision}""")
                }

            assertEquals(HttpStatusCode.Conflict, response.status)
            assertEquals("ROOM_REVISION_STALE", response.errorCode())
        }

    /** Omitting the revision is allowed (§5.136 says MAY include). */
    @Test
    fun `a request without a revision is not refused`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content

            val response =
                client.put("/api/rooms/$roomId/player-count") {
                    signedBy(host)
                    jsonBody("""{"playerCount":2}""")
                }
            assertEquals(HttpStatusCode.OK, response.status)
        }

    /** §5.35 — never shrink below the seats already occupied. */
    @Test
    fun `the player count cannot drop below the people in the room`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content
            seat(roomId, "Pat")

            val response =
                client.put("/api/rooms/$roomId/player-count") {
                    signedBy(host)
                    jsonBody("""{"playerCount":1}""")
                }
            assertEquals(HttpStatusCode.UnprocessableEntity, response.status)
            assertEquals("INVALID_ROOM_CONFIGURATION", response.errorCode())
        }

    // --- match setup --------------------------------------------------------

    /** §5.91 — host-only, like every other configuration action. */
    @Test
    fun `a member cannot prepare the match`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val guest = signIn("Pat")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content
            seat(roomId, "Pat")

            val response =
                client.post("/api/rooms/$roomId/prepare-match") { signedBy(guest) }
            assertEquals(HttpStatusCode.Forbidden, response.status)
            assertEquals("ROOM_HOST_REQUIRED", response.errorCode())
        }

    /**
     * §5.101 — the privacy rule that only exists at the route.
     *
     * The host is told WHICH seats need attention and nothing
     * about why. The why goes to the player it is about, over
     * their own socket. A host who could read it would be reading
     * something about a deck shared with that player, not with the
     * table — which is the Phase 4 rule this phase must not undo.
     */
    @Test
    fun `the host is told which seats need attention, never why`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            signIn("Pat")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content
            val guestId = seat(roomId, "Pat")

            val response =
                client.post("/api/rooms/$roomId/prepare-match") { signedBy(host) }

            assertEquals(HttpStatusCode.Conflict, response.status)
            val body = json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("SETUP_NOT_READY", body["errorCode"]!!.jsonPrimitive.content)

            // Every member appears, so the answer does not reveal
            // the roster by omission.
            val seats = body["seats"]!!.jsonArray.map { it.jsonObject }
            assertEquals(2, seats.size)
            val guestSeat = seats.first { it["userId"]!!.jsonPrimitive.content == "$guestId" }
            assertEquals(true, guestSeat["needsAttention"]!!.jsonPrimitive.content.toBoolean())

            // And nothing about WHAT is wrong. The seat entries
            // carry a boolean and an id, full stop — checked on the
            // seats themselves rather than the whole body, because
            // the envelope's own SETUP_NOT_READY is a room-level
            // fact the host is entitled to.
            for (seat in seats) {
                assertEquals(
                    setOf("userId", "needsAttention"),
                    seat.keys,
                    "a seat carried more than the table may know: $seat",
                )
            }
        }

    /** §5.117 — cancelling a room that was never prepared. */
    @Test
    fun `cancelling preparation is host-only`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val guest = signIn("Pat")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content
            seat(roomId, "Pat")

            val response =
                client.post("/api/rooms/$roomId/cancel-preparation") { signedBy(guest) }
            assertEquals(HttpStatusCode.Forbidden, response.status)
        }

    /** §5.138's rule again: a non-member learns nothing. */
    @Test
    fun `a non-member cannot read the match setup`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val stranger = signIn("Pat")
            val roomId = client.createRoom(host)["roomId"]!!.jsonPrimitive.content

            val response =
                client.get("/api/rooms/$roomId/match-setup") { signedBy(stranger) }
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

    /** §5.37, §5.94 — the server owns the preset list. */
    @Test
    fun `the preset list is Open Format only`() =
        testApplication {
            application { module(config()) }
            val token = signIn("RudeLeft")

            val response = client.get("/api/match-presets") { signedBy(token) }
            assertEquals(HttpStatusCode.OK, response.status)

            val presets =
                json.parseToJsonElement(response.bodyAsText())
                    .jsonObject["presets"]!!.jsonArray
            assertEquals(1, presets.size)
            assertEquals(
                "OPEN_FORMAT_1V1",
                presets[0].jsonObject["presetId"]!!.jsonPrimitive.content,
            )
            assertEquals(
                listOf(2),
                presets[0].jsonObject["allowedPlayerCounts"]!!.jsonArray.map {
                    it.jsonPrimitive.content.toInt()
                },
            )
        }

    // --- malformed input ------------------------------------------------------

    /** A broken client gets 400, which is not a privacy leak: no
     *  room id has this shape, so nothing is revealed by saying so. */
    @Test
    fun `a malformed room id is a bad request, not a not-found`() =
        testApplication {
            application { module(config()) }
            val token = signIn("RudeLeft")

            val response =
                client.get("/api/rooms/not-a-uuid") {
                    signedBy(token)
                }
            assertEquals(HttpStatusCode.BadRequest, response.status)
            assertEquals("INVALID_ROOM_ID", response.errorCode())
        }

    /** A body that is not the expected shape must not 500. */
    @Test
    fun `a nonsense body is refused cleanly`() =
        testApplication {
            application { module(config()) }
            val token = signIn("RudeLeft")
            val roomId = client.createRoom(token)["roomId"]!!.jsonPrimitive.content

            val response =
                client.put("/api/rooms/$roomId/ready") {
                    signedBy(token)
                    jsonBody("""not json at all""")
                }
            assertTrue(
                response.status == HttpStatusCode.BadRequest,
                "got ${response.status}: ${response.bodyAsText()}",
            )
        }

    // --- helpers ---------------------------------------------------------------

    /**
     * Seat somebody through the service.
     *
     * Joining is an invitation over the socket (AMENDMENT 1), which
     * is LobbySocketTest's subject, not this file's. Reaching for
     * the service here keeps these tests about the routes.
     */
    private fun seat(
        roomId: String,
        username: String,
    ): UUID =
        Database.connect(config())!!.use { database ->
            val userId = Accounts(database.dataSource()).findByUsername(username)!!.userId
            val rooms =
                RoomService(
                    database.dataSource(),
                    net.barnflix.proxic.deck.DeckAuthorization(database.dataSource()),
                )
            check(rooms.join(UUID.fromString(roomId), userId) is RoomResult.Ok) {
                "could not seat $username"
            }
            userId
        }
}
