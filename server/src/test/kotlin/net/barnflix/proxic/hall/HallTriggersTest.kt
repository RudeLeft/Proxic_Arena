package net.barnflix.proxic.hall

import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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
import net.barnflix.proxic.auth.User
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.lobby.LobbyConnection
import net.barnflix.proxic.lobby.LobbyHub
import net.barnflix.proxic.lobby.LobbyService
import net.barnflix.proxic.lobby.StandingsSource
import net.barnflix.proxic.lobby.standingsMessage
import net.barnflix.proxic.match.Match
import net.barnflix.proxic.match.MatchStatus
import net.barnflix.proxic.module
import net.barnflix.proxic.room.RoomService
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets

/**
 * P11-E10 -- a stale standing is never served. The server keeps the Hall
 * in memory; each trigger that changes what it is counted from is driven
 * here, after the kept copy is in place, and every place that serves the
 * Hall is then compared with a fresh reading of the database:
 *
 *   the STANDINGS broadcast   (what every open page hears)
 *   a new lobby connection's  (the kept places a join is handed)
 *   GET /api/hall             (the Hall page)
 *
 * Each trigger is also checked to have changed the fresh answer, so a test
 * that passes is one in which a kept copy really was out of date.
 */
class HallTriggersTest {
    private var container: FreshDatabase? = null
    private val password = "a perfectly fine passphrase"
    private val json = Json { ignoreUnknownKeys = true }
    private lateinit var players: List<UUID>
    private lateinit var decks: List<UUID>

    @BeforeTest
    fun start() {
        assumeTrue(
            runCatching { DockerClientFactory.instance().isDockerAvailable }.getOrDefault(false),
            "SKIPPED: Docker is not available (ADR 0001)",
        )
        container = TestPostgres.fresh()
        database().use { db ->
            val source = db.dataSource()
            val accounts = Accounts(source)
            accounts.createUser("Boss", password, Role.ADMIN)
            players = listOf("Ann", "Bea", "Cal").map { accounts.createUser(it, password, Role.PLAYER).userId }
            decks = HallSeed.decks(source, players, 6)
            // This season's games, all after the Belt began: three ranked
            // players and a holder.
            val now = Instant.now()
            val monthStart = now.atZone(java.time.ZoneId.systemDefault()).toLocalDate().withDayOfMonth(1)
            val since = monthStart.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant()
            val span = Duration.between(since, now).minusMinutes(2)
            HallSeed.games(source, players, decks, 45, until = now.minusSeconds(60), span = span)
        }
    }

    @AfterTest
    fun stop() {
        container?.stop()
    }

    private fun config() =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = container!!.jdbcUrl,
            forgeWorkerJar = null,
            dataRoot = "build/test-hall-triggers",
            secureCookies = false,
            databasePasswordValue = container!!.password,
            databaseUserValue = container!!.username,
        )

    private fun database(): Database = Database.connect(config())!!.also { it.migrate() }

    /** The Hall straight from the database, as before P11-E10. */
    private fun fresh(): Hall = database().use { HallGameSource(it.dataSource()).hall() }

    private fun freshStandings(): JsonObject {
        val standings = database().use { db -> StandingsSource(db.dataSource()).standings() }
        return standingsMessage(standings)
    }

    /** What a Hall page shows that a trigger can change: the board (who, and their deck) and the Belt. */
    private fun summary(view: HallView) = view.board.map { it.userId to it.deck } to view.belt.holder

    private class Session(val token: String, val csrf: String) {
        val cookie get() = "$SESSION_COOKIE=$token; $CSRF_COOKIE=$csrf"
    }

    private suspend fun ApplicationTestBuilder.session(username: String): Session {
        val cookies =
            client.post("/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody("""{"username":"$username","password":"$password"}""")
            }.headers.getAll(HttpHeaders.SetCookie)!!

        fun cookie(name: String) = cookies.first { it.startsWith("$name=") }.substringAfter("=").substringBefore(";")
        return Session(cookie(SESSION_COOKIE), cookie(CSRF_COOKIE))
    }

    private suspend fun ApplicationTestBuilder.served(session: Session): HallView =
        json.decodeFromString(
            HallView.serializer(),
            client.get("/api/hall") { header(HttpHeaders.Cookie, session.cookie) }.bodyAsText(),
        )

    private suspend fun DefaultClientWebSocketSession.awaitStandings(): JsonObject? =
        withTimeoutOrNull(8_000) {
            while (true) {
                val frame = incoming.receive() as? Frame.Text ?: continue
                val message =
                    runCatching { json.parseToJsonElement(frame.readText()).jsonObject }.getOrNull() ?: continue
                if (message["type"]?.jsonPrimitive?.content == "STANDINGS") return@withTimeoutOrNull message
            }
            @Suppress("UNREACHABLE_CODE")
            null
        }

    /** A new connection's STANDINGS: the kept places a join is handed. */
    private suspend fun ApplicationTestBuilder.joinStandings(session: Session): JsonObject {
        var got: JsonObject? = null
        val sockets = createClient { install(ClientWebSockets) }
        sockets.webSocket("/ws/user", { header(HttpHeaders.Cookie, session.cookie) }) {
            got = awaitStandings()
        }
        return assertNotNull(got)
    }

    /** The user id at the top (or the bottom) of a STANDINGS podium. */
    private fun placeOf(
        standings: JsonObject,
        last: Boolean = false,
    ): UUID {
        val podium = standings["podium"]!!.jsonArray
        val place = if (last) podium.last() else podium.first()
        return UUID.fromString(place.jsonObject["userId"]!!.jsonPrimitive.content)
    }

    private fun firstOf(standings: JsonObject) = placeOf(standings)

    /** STANDINGS without the envelope's own fields (its id and time), for comparing. */
    private fun JsonObject.places() = JsonObject(filterKeys { it in setOf("podium", "last", "belt", "beltDefendBy") })

    /**
     * Primes every kept copy, runs [change], and checks that the broadcast,
     * a new join and the Hall page all equal a fresh reading -- and that the
     * fresh reading moved.
     */
    private fun afterChange(
        // The administrator watches: a player's own socket may be the one a change closes.
        viewer: String = "Boss",
        change: suspend ApplicationTestBuilder.(admin: Session) -> Unit,
    ) = testApplication {
        application { module(config()) }
        val admin = session("Boss")
        val watcher = session(viewer)
        val before = freshStandings().places()
        val hallBefore = summary(fresh().view(Instant.now(), players.first()))
        // Kept: a join, and the Hall page, read and keep it.
        assertEquals(before, joinStandings(watcher).places())
        assertEquals(hallBefore, summary(served(watcher)))

        val heard = Channel<JsonObject>(Channel.UNLIMITED)
        val sockets = createClient { install(ClientWebSockets) }
        sockets.webSocket("/ws/user", { header(HttpHeaders.Cookie, watcher.cookie) }) {
            awaitStandings() // this connection's own join
            change(admin)
            heard.send(assertNotNull(awaitStandings(), "the change was broadcast"))
        }
        val after = freshStandings().places()
        val hallAfter = summary(fresh().view(Instant.now(), players.first()))
        assertNotEquals(before to hallBefore, after to hallAfter, "the change moved the Hall (else no proof)")
        assertEquals(after, heard.receive().places(), "the broadcast")
        assertEquals(after, joinStandings(watcher).places(), "a new connection")
        assertEquals(hallAfter, summary(served(watcher)), "the Hall page")
    }

    @Test
    fun `a Belt reset is never answered from the kept Hall`() =
        afterChange { admin ->
            val reset =
                client.post("/api/admin/belt/reset") {
                    header(HttpHeaders.Cookie, admin.cookie)
                    header(CSRF_HEADER, admin.csrf)
                    contentType(ContentType.Application.Json)
                    setBody("""{"scope":"belt","confirm":"RESET"}""")
                }
            assertEquals(HttpStatusCode.OK, reset.status, reset.bodyAsText())
            val holder = json.parseToJsonElement(reset.bodyAsText()).jsonObject["holder"]
            assertEquals(null, holder?.takeIf { it !is kotlinx.serialization.json.JsonNull }, "the Belt tab")
        }

    @Test
    fun `an account disabled is never answered from the kept Hall`() =
        afterChange { admin ->
            // The season's leader leaves the boards (spec 0011's rule).
            val leader = firstOf(freshStandings())
            val status =
                client.put("/api/admin/accounts/$leader/status") {
                    header(HttpHeaders.Cookie, admin.cookie)
                    header(CSRF_HEADER, admin.csrf)
                    contentType(ContentType.Application.Json)
                    setBody("""{"status":"${AccountStatus.DISABLED.name}"}""")
                }
            assertEquals(HttpStatusCode.OK, status.status, status.bodyAsText())
        }

    /** Not one of the three, but the Hall page shows it: a deck's icon. */
    @Test
    fun `a deck's new icon, or its deletion, is never answered from the kept Hall`() =
        testApplication {
            application { module(config()) }
            val leader = fresh().view(Instant.now(), players.first()).board.first().userId
            val name = listOf("Ann", "Bea", "Cal")[players.indexOf(UUID.fromString(leader))]
            val owner = session(name)
            val before = summary(served(owner))
            for (deck in decks.filterIndexed { d, _ -> d % players.size == players.indexOf(UUID.fromString(leader)) }) {
                val put =
                    client.put("/api/decks/$deck/icon") {
                        header(HttpHeaders.Cookie, owner.cookie)
                        header(CSRF_HEADER, owner.csrf)
                        contentType(ContentType.Application.Json)
                        setBody("""{"icon":"skull"}""")
                    }
                assertEquals(HttpStatusCode.OK, put.status, put.bodyAsText())
            }
            val after = summary(fresh().view(Instant.now(), players.first()))
            assertNotEquals(before, after, "the icon moved the Hall (else this proves nothing)")
            assertEquals("skull", after.first.first().second?.icon)
            assertEquals(after, summary(served(owner)))

            // And deleted: its games keep its name, nothing more.
            val gone = decks.filterIndexed { d, _ -> d % players.size == players.indexOf(UUID.fromString(leader)) }
            for (deck in gone) {
                val delete =
                    client.delete("/api/decks/$deck") {
                        header(HttpHeaders.Cookie, owner.cookie)
                        header(CSRF_HEADER, owner.csrf)
                    }
                assertEquals(HttpStatusCode.NoContent, delete.status, delete.bodyAsText())
            }
            val deleted = summary(fresh().view(Instant.now(), players.first()))
            assertNotEquals(after, deleted, "the deletion moved the Hall (else this proves nothing)")
            assertEquals(deleted, summary(served(owner)))
        }

    /**
     * A game end: the lobby is told (MatchEndings.giveTheRoomBack ->
     * matchChanged, after MatchRecords wrote the result). Driven on the
     * lobby itself, with the server's own pieces (the kept Hall, its
     * places), because no game can be played without a worker here; the
     * account test above proves the server wires the same kept Hall.
     */
    @Test
    fun `a game end is never answered from the kept Hall`() {
        database().use { db ->
            val source = db.dataSource()
            val cache = HallCache.of(HallGameSource(source))
            val standings = StandingsSource(source, cache)
            val hub = LobbyHub()
            val lobby =
                LobbyService(
                    hub,
                    RoomService(source, DeckAuthorization(source)),
                    standings = standings::standings,
                    hall = cache,
                )
            // Somebody in the lobby, to hear the broadcast.
            val outgoing = Channel<Frame>(Channel.UNLIMITED)
            val cal = User(players[2], "Cal", "Cal", Role.PLAYER, AccountStatus.ACTIVE)
            hub.register(LobbyConnection("c1", cal, outgoing))
            val before = standingsMessage(standings.standings()).places()
            cache.hall() // kept

            // The trailing player wins ten in a row, and the game is recorded as ended.
            val trailing = placeOf(before, last = true)
            val other = players.first { it != trailing }
            repeat(10) { endGame(source, winner = trailing, loser = other) }
            kotlinx.coroutines.runBlocking {
                lobby.matchChanged(
                    Match(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        MatchStatus.ENDED,
                        "open-format",
                        emptyList(),
                    ),
                    null,
                    null,
                )
            }
            val after = freshStandings().places()
            assertNotEquals(before, after, "the games moved the places (else this proves nothing)")
            val broadcast =
                generateSequence { outgoing.tryReceive().getOrNull() }
                    .filterIsInstance<Frame.Text>()
                    .map { json.parseToJsonElement(it.readText()).jsonObject }
                    .last { it["type"]?.jsonPrimitive?.content == "STANDINGS" }
            assertEquals(after, broadcast.places(), "the broadcast")
            assertEquals(after, standingsMessage(standings.standings()).places(), "the next join")
            assertEquals(
                summary(fresh().view(Instant.now(), players.first())),
                summary(cache.hall().view(Instant.now(), players.first())),
                "the Hall page",
            )
        }
    }

    /** One finished game, written as MatchRecords leaves one. */
    private fun endGame(
        source: javax.sql.DataSource,
        winner: UUID,
        loser: UUID,
    ) {
        val matchId = UUID.randomUUID()
        source.connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO match (match_id, setup_id, room_id, status, preset_id, forge_commit, forge_release,
                                   worker_protocol_version, public_protocol_version, started_at, ended_at,
                                   result_summary)
                VALUES (?, ?, ?, 'ENDED', 'open-format', 'test', 'test', 1, 1, now(), now(), 'winner:seat 1 on turn 7')
                """.trimIndent(),
            ).use {
                it.setObject(1, matchId)
                it.setObject(2, UUID.randomUUID())
                it.setObject(3, UUID.randomUUID())
                it.executeUpdate()
            }
            for ((seat, player) in listOf(winner, loser).withIndex()) {
                connection.prepareStatement(
                    "INSERT INTO match_participant " +
                        "(match_id, user_id, seat_number, deck_name_snapshot, display_name_snapshot) " +
                        "VALUES (?, ?, ?, 'Seed deck', 'x')",
                ).use {
                    it.setObject(1, matchId)
                    it.setObject(2, player)
                    it.setInt(3, seat + 1)
                    it.executeUpdate()
                }
            }
        }
    }
}
