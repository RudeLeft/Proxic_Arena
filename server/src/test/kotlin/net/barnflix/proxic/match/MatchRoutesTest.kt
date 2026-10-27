package net.barnflix.proxic.match

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
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
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
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.deck.DeckSharing
import net.barnflix.proxic.module
import net.barnflix.proxic.room.DeckCheck
import net.barnflix.proxic.room.DeckVerdict
import net.barnflix.proxic.room.MatchSetupService
import net.barnflix.proxic.room.PrepareResult
import net.barnflix.proxic.room.RoomResult
import net.barnflix.proxic.room.RoomService
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The match routes — PHASE_06 §6.10, §6.11, §6.108, §6.114.
 *
 * The launcher has its own tests; these cover what only a route
 * decides: who is let in, what the browser is allowed to say, and
 * what a non-participant is told.
 */
class MatchRoutesTest {
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
            dataRoot = "build/test-match-routes",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private val json = Json { ignoreUnknownKeys = true }

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

    private fun io.ktor.client.request.HttpRequestBuilder.signedBy(creds: Creds) {
        header(HttpHeaders.Cookie, "$SESSION_COOKIE=${creds.session}; $CSRF_COOKIE=${creds.csrf}")
        header(CSRF_HEADER, creds.csrf)
    }

    private suspend fun HttpResponse.errorCode(): String =
        json.parseToJsonElement(bodyAsText()).jsonObject["errorCode"]!!.jsonPrimitive.content

    private fun source() = Database.connect(config())!!.dataSource()

    private fun userId(username: String) = Accounts(source()).findByUsername(username)!!.userId

    /** A prepared setup, built through the real Phase 5 path. */
    private fun preparedSetup(): String {
        val roomId = readyRoom()
        // `preflight =` by name: the trailing-lambda form binds to
        // the LAST parameter, which is the clock, and the compiler
        // was right to object.
        val setups =
            MatchSetupService(
                source(),
                DeckAuthorization(source()),
                preflight = { DeckCheck(DeckVerdict.VALID, "") },
            )
        val prepared = setups.prepare(roomId, userId("RudeLeft")) as PrepareResult.Prepared
        return prepared.setup.setupId
    }

    /** A room with both players seated, decks chosen and ready. */
    private fun readyRoom(): UUID {
        val rooms = RoomService(source(), DeckAuthorization(source()))
        val host = userId("RudeLeft")
        val guest = userId("Pat")

        val deckId = UUID.randomUUID()
        source().connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO imported_deck
                    (deck_id, display_name, source_filename, package_sha256,
                     total_cards, distinct_cards, import_schema_version, owner_user_id)
                VALUES (?, 'Mono Red', 'test.zip', ?, 60, 15, 1, ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, deckId)
                it.setString(2, deckId.toString().replace("-", "").repeat(2).take(64))
                it.setObject(3, host)
                it.executeUpdate()
            }
        }
        DeckSharing(source(), DeckAuthorization(source())).share(deckId, host, "Pat")

        val room = (rooms.create(host) as RoomResult.Ok).room
        check(rooms.join(room.roomId, guest) is RoomResult.Ok)
        for (user in listOf(host, guest)) {
            check(rooms.selectDeck(room.roomId, user, deckId) is RoomResult.Ok)
            check(rooms.setReady(room.roomId, user, true) is RoomResult.Ok)
        }
        return room.roomId
    }

    /** Direct manipulation: a stored preset rewritten behind the server's back. */
    private fun tamper(
        table: String,
        key: String,
        id: String,
        preset: String,
    ) = source().connection.use { connection ->
        connection.prepareStatement("UPDATE $table SET preset_id = ? WHERE $key = ?").use {
            it.setString(1, preset)
            it.setObject(2, UUID.fromString(id))
            check(it.executeUpdate() == 1) { "nothing to tamper with" }
        }
    }

    private fun matchesFor(setupId: String): Int =
        source().connection.use { connection ->
            connection.prepareStatement("SELECT count(*) FROM match WHERE setup_id = ?").use {
                it.setObject(1, UUID.fromString(setupId))
                it.executeQuery().use { rows ->
                    rows.next()
                    rows.getInt(1)
                }
            }
        }

    // --- the gate -------------------------------------------------------------

    /**
     * EVERY gated prefix, enumerated.
     *
     * This test exists because `/api/match-presets` shipped open to
     * the world: the intercept matches on prefixes, that route
     * shared none of them, and the suite's gate test enumerated
     * ROOM routes only. It was found by probing the deployed
     * server. One list, every family, so the next omission fails a
     * build instead of reaching production.
     */
    @Test
    fun `every authenticated API family requires a session`() =
        testApplication {
            application { module(config()) }

            val answers =
                mapOf(
                    "GET /api/decks" to client.get("/api/decks"),
                    "GET /api/rooms/current" to client.get("/api/rooms/current"),
                    "GET /api/match-presets" to client.get("/api/match-presets"),
                    "POST /api/matches" to client.post("/api/matches"),
                    "GET /api/matches/current" to client.get("/api/matches/current"),
                    "GET /api/matches/{id}" to client.get("/api/matches/${UUID.randomUUID()}"),
                    "GET /api/matches/stops" to client.get("/api/matches/stops"),
                    "PUT /api/matches/stops" to client.put("/api/matches/stops"),
                    // Spec 0018.
                    "GET /api/hall" to client.get("/api/hall"),
                )

            for ((endpoint, answer) in answers) {
                assertEquals(HttpStatusCode.Unauthorized, answer.status, "$endpoint was open")
            }
        }

    /**
     * PHASE_07 §7.53, AMENDMENT 13 — a player's stops: the Arena-style
     * defaults until changed, then theirs; only Forge's step names, in
     * turn order, each once.
     */
    @Test
    fun `a player's stops default, save, and refuse what is not a step`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")

            val first = client.get("/api/matches/stops") { signedBy(host) }
            assertEquals(HttpStatusCode.OK, first.status)
            val defaults = json.parseToJsonElement(first.bodyAsText()).jsonObject
            assertEquals(
                listOf("MAIN1", "COMBAT_DECLARE_BLOCKERS", "MAIN2"),
                defaults["own"]!!.jsonArray.map { it.jsonPrimitive.content },
            )

            val saved =
                client.put("/api/matches/stops") {
                    signedBy(host)
                    contentType(ContentType.Application.Json)
                    setBody("""{"own":["MAIN2","MAIN1","MAIN1"],"opponent":["END_OF_TURN"]}""")
                }
            assertEquals(HttpStatusCode.OK, saved.status)
            val reread = client.get("/api/matches/stops") { signedBy(host) }.bodyAsText()
            val again = json.parseToJsonElement(reread).jsonObject
            assertEquals(listOf("MAIN1", "MAIN2"), again["own"]!!.jsonArray.map { it.jsonPrimitive.content })
            assertEquals(listOf("END_OF_TURN"), again["opponent"]!!.jsonArray.map { it.jsonPrimitive.content })

            val refused =
                client.put("/api/matches/stops") {
                    signedBy(host)
                    contentType(ContentType.Application.Json)
                    setBody("""{"own":["MAIN1","ATTACK_NOW"],"opponent":[]}""")
                }
            assertEquals(HttpStatusCode.BadRequest, refused.status)
        }

    /** §3.51 — and a mutation needs the CSRF pair, not just a session. */
    @Test
    fun `launching without the CSRF header is refused`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")

            val response =
                client.post("/api/matches") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE=${host.session}")
                    contentType(ContentType.Application.Json)
                    setBody("""{"setupId":"${UUID.randomUUID()}"}""")
                }
            assertEquals(HttpStatusCode.Forbidden, response.status)
        }

    // --- launching ------------------------------------------------------------

    /** §6.10 — the host launches, and gets the match back. */
    @Test
    fun `the host launches a prepared setup`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val setupId = preparedSetup()

            val response =
                client.post("/api/matches") {
                    signedBy(host)
                    contentType(ContentType.Application.Json)
                    setBody("""{"setupId":"$setupId"}""")
                }

            assertEquals(HttpStatusCode.Created, response.status, response.bodyAsText())
            val match = json.parseToJsonElement(response.bodyAsText()).jsonObject["match"]!!.jsonObject
            assertEquals("LAUNCHING", match["status"]!!.jsonPrimitive.content)
            assertEquals(2, match["participants"]!!.jsonArray.size)
        }

    /** §6.11 — a participant who is not the host cannot start it. */
    @Test
    fun `a non-host cannot launch`() =
        testApplication {
            application { module(config()) }
            val guest = signIn("Pat")
            val setupId = preparedSetup()

            val response =
                client.post("/api/matches") {
                    signedBy(guest)
                    contentType(ContentType.Application.Json)
                    setBody("""{"setupId":"$setupId"}""")
                }
            assertEquals(HttpStatusCode.Forbidden, response.status)
            assertEquals("MATCH_HOST_REQUIRED", response.errorCode())
        }

    /**
     * §6.10 — the browser supplies ONLY the setup reference.
     *
     * A body naming participants, seats, decks and a preset must
     * change none of them: they come from the immutable setup. The
     * endpoint has no fields for any of it, and this proves adding
     * them does not work either.
     */
    @Test
    fun `extra fields in the launch body are ignored`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val setupId = preparedSetup()
            val stranger = userId("Sam")

            val response =
                client.post("/api/matches") {
                    signedBy(host)
                    contentType(ContentType.Application.Json)
                    setBody(
                        """
                        {"setupId":"$setupId",
                         "participants":["$stranger"],
                         "presetId":"COMMANDER",
                         "playerCount":4,
                         "seats":[{"userId":"$stranger","seatNumber":1}]}
                        """.trimIndent(),
                    )
                }

            assertEquals(HttpStatusCode.Created, response.status, response.bodyAsText())
            val match = json.parseToJsonElement(response.bodyAsText()).jsonObject["match"]!!.jsonObject
            assertEquals("OPEN_FORMAT_1V1", match["presetId"]!!.jsonPrimitive.content)
            assertEquals(2, match["participants"]!!.jsonArray.size)
            assertTrue(
                match["participants"]!!.jsonArray.none {
                    it.jsonObject["userId"]!!.jsonPrimitive.content == "$stranger"
                },
                "a user named in the body got a seat",
            )
        }

    // --- presets the server does not support — P6-BI, P6-BJ -------------------

    /**
     * P6-BJ — Two-Headed Giant is not supported, so nothing can
     * launch it: not the browser, and not a setup row rewritten to
     * name it after preparation. The launcher re-reads the preset
     * from the stored setup and refuses before any match row, and
     * so before any worker, exists.
     */
    @Test
    fun `a setup rewritten to Two-Headed Giant cannot be launched`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val setupId = preparedSetup()
            tamper("match_setup", "setup_id", setupId, "TWO_HEADED_GIANT")

            val response =
                client.post("/api/matches") {
                    signedBy(host)
                    contentType(ContentType.Application.Json)
                    setBody("""{"setupId":"$setupId"}""")
                }

            assertEquals(HttpStatusCode.UnprocessableEntity, response.status, response.bodyAsText())
            assertEquals("LAUNCH_REVALIDATION_FAILED", response.errorCode())
            assertEquals(0, matchesFor(setupId), "a match was created for it")
        }

    /** P6-BI — the same for any preset the server does not offer. */
    @Test
    fun `a setup rewritten to an unsupported preset cannot be launched`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val setupId = preparedSetup()
            tamper("match_setup", "setup_id", setupId, "COMMANDER")

            val response =
                client.post("/api/matches") {
                    signedBy(host)
                    contentType(ContentType.Application.Json)
                    setBody("""{"setupId":"$setupId"}""")
                }

            assertEquals(HttpStatusCode.UnprocessableEntity, response.status, response.bodyAsText())
            assertEquals(0, matchesFor(setupId), "a match was created for it")
        }

    /**
     * P6-BJ, one step earlier — a ROOM rewritten to Two-Headed Giant
     * cannot even be prepared, so no setup for it exists to launch.
     */
    @Test
    fun `a room rewritten to Two-Headed Giant cannot be prepared`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val roomId = readyRoom()
            tamper("room", "room_id", roomId.toString(), "TWO_HEADED_GIANT")

            val response =
                client.post("/api/rooms/$roomId/prepare-match") {
                    signedBy(host)
                }

            assertEquals(HttpStatusCode.UnprocessableEntity, response.status, response.bodyAsText())
            assertEquals("INVALID_ROOM_CONFIGURATION", response.errorCode())
        }

    // --- discovery and privacy -------------------------------------------------

    /**
     * §6.114 — null when you are in no match.
     *
     * Only the BEFORE half is asserted here, deliberately. These
     * tests run a server with no Forge worker configured, so the
     * runtime records FAILED_STARTUP moments after a launch and
     * `current` correctly stops returning the match — §6.114 is
     * about the match you are IN, and a failed one is not it.
     *
     * Asserting the "after" half through `current` would be racing
     * that async failure, which is how a test becomes flaky for
     * reasons that have nothing to do with the code. The launch
     * answer and `/matches/{id}` carry the same facts without the
     * race, and the tests below use those.
     */
    @Test
    fun `current match is null when there is no match`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")

            val before = client.get("/api/matches/current") { signedBy(host) }
            assertEquals(
                JsonNull,
                json.parseToJsonElement(before.bodyAsText()).jsonObject["match"],
            )
        }

    /** §6.108 — knowing a match id is not sufficient. */
    @Test
    fun `a non-participant cannot read a match`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val stranger = signIn("Sam")
            val setupId = preparedSetup()

            val launched =
                client.post("/api/matches") {
                    signedBy(host)
                    contentType(ContentType.Application.Json)
                    setBody("""{"setupId":"$setupId"}""")
                }
            val matchId =
                json.parseToJsonElement(launched.bodyAsText())
                    .jsonObject["match"]!!.jsonObject["matchId"]!!.jsonPrimitive.content

            val real = client.get("/api/matches/$matchId") { signedBy(stranger) }
            val invented = client.get("/api/matches/${UUID.randomUUID()}") { signedBy(stranger) }

            assertEquals(HttpStatusCode.NotFound, real.status)
            assertEquals(invented.status, real.status)
        }

    /**
     * §5.47's rule, carried into the match.
     *
     * The lobby settled that an opponent's deck NAME is not yours
     * to see, and a match is not a reason to unsettle it — if
     * anything the stakes are higher, because this is the moment
     * somebody would most like to know what they are facing.
     */
    @Test
    fun `a player sees their own deck name and not their opponent's`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")
            val setupId = preparedSetup()

            val launched =
                client.post("/api/matches") {
                    signedBy(host)
                    contentType(ContentType.Application.Json)
                    setBody("""{"setupId":"$setupId"}""")
                }
            val matchId =
                json.parseToJsonElement(launched.bodyAsText())
                    .jsonObject["match"]!!.jsonObject["matchId"]!!.jsonPrimitive.content

            val guest = signIn("Pat")
            // By id rather than `current`: see the note above about
            // racing the async FAILED_STARTUP on a worker-less
            // server. This route does not filter on status.
            val seen = client.get("/api/matches/$matchId") { signedBy(guest) }
            val guestId = userId("Pat")
            val seats =
                json.parseToJsonElement(seen.bodyAsText())
                    .jsonObject["match"]!!.jsonObject["participants"]!!.jsonArray
                    .map { it.jsonObject }

            val mine = seats.first { it["userId"]!!.jsonPrimitive.content == "$guestId" }
            val theirs = seats.first { it["userId"]!!.jsonPrimitive.content != "$guestId" }
            assertEquals("Mono Red", mine["deckName"]!!.jsonPrimitive.content)
            assertEquals(JsonNull, theirs["deckName"])
        }

    /** Spec 0018, F-0018-B — the Hall answers a signed-in player, even before anybody has played. */
    @Test
    fun `the Hall of Champions answers a signed-in player`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")

            val response = client.get("/api/hall") { signedBy(host) }
            assertEquals(HttpStatusCode.OK, response.status)
            val hall = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals(1, hall["season"]!!.jsonObject["number"]!!.jsonPrimitive.int)
            assertEquals(0, hall["board"]!!.jsonArray.size)
        }

    /** A broken client gets 400, which reveals nothing. */
    @Test
    fun `a malformed setup id is a bad request`() =
        testApplication {
            application { module(config()) }
            val host = signIn("RudeLeft")

            val response =
                client.post("/api/matches") {
                    signedBy(host)
                    contentType(ContentType.Application.Json)
                    setBody("""{"setupId":"not-a-uuid"}""")
                }
            assertEquals(HttpStatusCode.BadRequest, response.status)
            assertEquals("INVALID_REQUEST", response.errorCode())
        }
}
