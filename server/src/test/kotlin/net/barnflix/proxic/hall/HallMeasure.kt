package net.barnflix.proxic.hall

import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.TestPostgres
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.SESSION_COOKIE
import net.barnflix.proxic.lobby.StandingsSource
import net.barnflix.proxic.lobby.standingsMessage
import net.barnflix.proxic.module
import org.junit.jupiter.api.condition.EnabledIfSystemProperty
import java.time.Instant
import kotlin.test.Test
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets

/**
 * P11-E10 -- the measure: what the Hall and the lobby's STANDINGS cost the
 * server, against how many finished games there are. Not a check (it
 * asserts nothing); run on purpose:
 *
 *     ./gradlew :server:test --tests '*HallMeasure*' -PmeasureHall=0,500,2000,10000
 *
 * Each size gets its own fresh test database, 8 players, 16 decks and the
 * games spread over a year. Every number is the median of [REPEAT] after
 * [WARM] warm-up rounds, in milliseconds; printed as `HALL-MEASURE` lines.
 */
@EnabledIfSystemProperty(named = "proxic.measure.hall", matches = "[0-9,]+")
class HallMeasure {
    private val password = "a perfectly fine passphrase"

    @Test
    fun `the Hall and the lobby's join, timed against the number of finished games`() {
        val sizes = System.getProperty("proxic.measure.hall").split(",").map { it.trim().toInt() }
        println(
            "HALL-MEASURE games | load hall() | view() | standings() | GET /api/hall | " +
                "join->ROOMS | join->STANDINGS | STANDINGS bytes",
        )
        for (size in sizes) measure(size)
    }

    private fun measure(size: Int) {
        val container = TestPostgres.fresh()
        try {
            val config =
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-hall-measure",
                    secureCookies = false,
                    databasePasswordValue = container.password,
                    databaseUserValue = container.username,
                )
            Database.connect(config)!!.use { database ->
                database.migrate()
                val source = database.dataSource()
                val accounts = Accounts(source)
                val players = (1..8).map { accounts.createUser("Seat$it", password, Role.PLAYER).userId }
                HallSeed.games(source, players, HallSeed.decks(source, players, 16), size)

                val hallSource = HallGameSource(source)
                val load = timed { hallSource.hall() }
                val hall = hallSource.hall()
                val view = timed { hall.view(Instant.now(), players.first()) }
                val standings = timed { StandingsSource(source).standings() }
                val bytes = standingsMessage(StandingsSource(source).standings()).toString().length

                var http = 0.0
                var rooms = 0.0
                var joined = 0.0
                testApplication {
                    application { module(config) }
                    val client = createClient { install(ClientWebSockets) }
                    val token =
                        client.post("/api/auth/login") {
                            contentType(ContentType.Application.Json)
                            setBody("""{"username":"Seat1","password":"$password"}""")
                        }.headers.getAll(HttpHeaders.SetCookie)!!
                            .first { it.startsWith("$SESSION_COOKIE=") }
                            .substringAfter("=").substringBefore(";")
                    val hallTimes = mutableListOf<Double>()
                    repeat(WARM + REPEAT) { round ->
                        val began = System.nanoTime()
                        client.get("/api/hall") { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token") }.bodyAsText()
                        if (round >= WARM) hallTimes += (System.nanoTime() - began) / 1e6
                    }
                    http = hallTimes.sorted()[REPEAT / 2]
                    val roomTimes = mutableListOf<Double>()
                    val joinTimes = mutableListOf<Double>()
                    repeat(WARM + REPEAT) { round ->
                        val began = System.nanoTime()
                        client.webSocket("/ws/user", { header(HttpHeaders.Cookie, "$SESSION_COOKIE=$token") }) {
                            while (true) {
                                val frame = incoming.receive() as? Frame.Text ?: continue
                                val text = frame.readText()
                                val at = (System.nanoTime() - began) / 1e6
                                if (round >= WARM && text.contains("\"ROOMS\"")) roomTimes += at
                                if (text.contains("\"STANDINGS\"")) {
                                    if (round >= WARM) joinTimes += at
                                    break
                                }
                            }
                        }
                    }
                    rooms = roomTimes.sorted()[roomTimes.size / 2]
                    joined = joinTimes.sorted()[REPEAT / 2]
                }
                println(
                    "HALL-MEASURE %6d | %8.2f | %8.2f | %8.2f | %8.2f | %8.2f | %8.2f | %d".format(
                        size,
                        load,
                        view,
                        standings,
                        http,
                        rooms,
                        joined,
                        bytes,
                    ),
                )
            }
        } finally {
            container.stop()
        }
    }

    private fun timed(work: () -> Any?): Double {
        val times =
            (0 until WARM + REPEAT).map {
                val began = System.nanoTime()
                work()
                (System.nanoTime() - began) / 1e6
            }.drop(WARM)
        return times.sorted()[REPEAT / 2]
    }

    private companion object {
        const val WARM = 5
        const val REPEAT = 11
    }
}
