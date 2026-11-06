package net.barnflix.proxic.match

import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Spec 0056, F-0056-D — a server stopping under a game says so on the
 * game's own socket, to both players and to anybody watching, and to no
 * other game. The runtime half (the ending recorded as SERVER_RESTARTED)
 * is MatchLauncherTest's, against a real worker process.
 */
class ServerStoppingTest {
    private val players = listOf(UUID.randomUUID(), UUID.randomUUID())
    private val match =
        Match(
            matchId = UUID.randomUUID(),
            setupId = UUID.randomUUID(),
            roomId = UUID.randomUUID(),
            status = MatchStatus.RUNNING,
            presetId = "open",
            participants =
                players.mapIndexed { index, userId ->
                    MatchParticipant(userId, index + 1, null, "Deck", "Player ${index + 1}")
                },
        )

    private fun Channel<Frame>.type(): String? =
        tryReceive().getOrNull()?.let { frame ->
            Json.parseToJsonElement((frame as Frame.Text).readText()).jsonObject["type"]?.jsonPrimitive?.content
        }

    @Test
    fun `both players and the spectators are told, and no other game is`() =
        runBlocking {
            val hub = MatchHub()
            val seats = players.map { Channel<Frame>(Channel.UNLIMITED) }
            players.zip(seats).forEachIndexed { index, (userId, channel) ->
                hub.watchers.open(match.matchId, userId, "c$index", channel)
            }
            val watcher = Channel<Frame>(Channel.UNLIMITED)
            hub.spectators.open(match.matchId, UUID.randomUUID(), "w", watcher)
            val elsewhere = Channel<Frame>(Channel.UNLIMITED)
            hub.watchers.open(UUID.randomUUID(), players[0], "other", elsewhere)

            tellServerStopping(hub, match)

            seats.forEach { assertEquals("SERVER_STOPPING", it.type()) }
            assertEquals("SERVER_STOPPING", watcher.type())
            assertNull(elsewhere.type(), "another game heard it")
        }

    @Test
    fun `the message carries no words and nothing about the server`() {
        val message = serverStoppingMessage()
        assertEquals(setOf("protocolVersion", "type", "messageId"), message.keys)
    }
}
