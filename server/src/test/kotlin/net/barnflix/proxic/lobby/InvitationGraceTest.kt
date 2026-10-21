package net.barnflix.proxic.lobby

import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import net.barnflix.proxic.Database
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Accounts
import net.barnflix.proxic.auth.Role
import net.barnflix.proxic.auth.User
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.room.RoomService
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Duration
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * PHASE_07 Amendment 11 — an invitation lasts "until either of you
 * signs out", and a reload is not signing out.
 *
 * Against the service directly, with a short grace in place of the
 * real minute: the subject is timing, and a socket test would spend
 * that minute waiting.
 */
class InvitationGraceTest {
    private var container: PostgreSQLContainer<*>? = null
    private var database: Database? = null
    private val json = Json { ignoreUnknownKeys = true }

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
        database =
            Database.connect(
                ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = container!!.jdbcUrl,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-lobby",
                    databasePasswordValue = container!!.password,
                    databaseUserValue = container!!.username,
                ),
            )!!.also { it.migrate() }
        val accounts = Accounts(database!!.dataSource())
        for (name in listOf("RudeLeft", "Pat")) accounts.createUser(name, "a perfectly fine passphrase", Role.PLAYER)
    }

    @AfterTest
    fun stop() {
        database?.close()
        container?.stop()
    }

    private fun user(name: String): User = Accounts(database!!.dataSource()).findByUsername(name)!!

    private suspend fun Channel<Frame>.next(type: String): JsonObject? =
        withTimeoutOrNull(2_000) {
            while (true) {
                val frame = receive() as? Frame.Text ?: continue
                val message = json.parseToJsonElement(frame.readText()).jsonObject
                if (message["type"]?.jsonPrimitive?.content == type) return@withTimeoutOrNull message
            }
            @Suppress("UNREACHABLE_CODE")
            null
        }

    private fun service(): Pair<LobbyService, RoomService> {
        val source = database!!.dataSource()
        val rooms = RoomService(source, DeckAuthorization(source))
        return LobbyService(LobbyHub(), rooms, offlineGrace = Duration.ofMillis(400)) to rooms
    }

    @Test
    fun `a reload inside the grace keeps the invitation, staying gone ends it for the host`() =
        runBlocking {
            val (lobby, rooms) = service()
            val host = user("RudeLeft")
            val guest = user("Pat")
            rooms.create(host.userId)
            val hostOut = Channel<Frame>(Channel.UNLIMITED)
            val hostSession = lobby.open("h", host, hostOut)
            lobby.open("g1", guest, Channel(Channel.UNLIMITED))
            hostSession.handle(
                "INVITE",
                buildJsonObject {
                    put("type", "INVITE")
                    put("userId", guest.userId.toString())
                },
            )
            hostOut.next("INVITATION_SENT")!!

            // A reload: gone, and back before the grace runs out.
            lobby.close("g1", guest)
            delay(100)
            val reloaded = Channel<Frame>(Channel.UNLIMITED)
            lobby.open("g2", guest, reloaded)
            reloaded.next("INVITED")!!
            delay(600)
            assertNull(hostOut.next("INVITATION_ENDED"), "a reload ended the invitation")

            // Gone for good: the host hears it, and why.
            lobby.close("g2", guest)
            val ended = hostOut.next("INVITATION_ENDED")!!
            assertEquals("OFFLINE", ended["reason"]!!.jsonPrimitive.content)
        }
}
