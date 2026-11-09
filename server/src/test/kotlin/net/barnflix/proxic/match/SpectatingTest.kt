package net.barnflix.proxic.match

import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.readReason
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.room.directoryEntry
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Spec 0067 — spectating: the result reaches the spectators and their
 * connections are closed cleanly (F-0067-C, F-0067-D), a spectator back
 * after the end can still be told it (the hub remembers), the players can
 * list who is watching by name (F-0067-H), and the lobby says a game can be
 * spectated only once it is running here (F-0067-G).
 */
class SpectatingTest {
    private val alice = UUID.randomUUID()
    private val bob = UUID.randomUUID()
    private val match =
        Match(
            matchId = UUID.randomUUID(),
            setupId = UUID.randomUUID(),
            roomId = UUID.randomUUID(),
            status = MatchStatus.ENDED,
            presetId = "OPEN_FORMAT_1V1",
            participants =
                listOf(
                    MatchParticipant(alice, 1, UUID.randomUUID(), "Mono Red", "Alice"),
                    MatchParticipant(bob, 2, UUID.randomUUID(), "Mono Green", "Bob"),
                ),
        )

    private fun Channel<Frame>.all(): List<Frame> = generateSequence { tryReceive().getOrNull() }.toList()

    private fun Frame.json(): JsonObject = Json.parseToJsonElement((this as Frame.Text).readText()).jsonObject

    @Test
    fun `spectators are told who won and why, then closed normally, and the players get nothing on this path`() =
        runBlocking {
            val hub = MatchHub()
            val carol = Channel<Frame>(Channel.UNLIMITED)
            val carolsOtherTab = Channel<Frame>(Channel.UNLIMITED)
            val player = Channel<Frame>(Channel.UNLIMITED)
            val carolId = UUID.randomUUID()
            hub.spectators.open(match.matchId, carolId, "w1", carol)
            hub.spectators.open(match.matchId, carolId, "w2", carolsOtherTab)
            hub.watchers.open(match.matchId, alice, "p1", player)

            hub.endings.ended(match, null, GameOutcome(GameOutcome.WINNER, 1, 9, lossReason = "LifeReachedZero"))

            for (tab in listOf(carol, carolsOtherTab)) {
                val frames = tab.all()
                assertEquals(2, frames.size, "the ending, then the close")
                val ended = frames[0].json()
                assertEquals("MATCH_ENDED", ended["type"]!!.jsonPrimitive.content)
                assertEquals("ENDED", ended["status"]!!.jsonPrimitive.content)
                assertEquals("WINNER", ended["outcome"]!!.jsonPrimitive.content)
                assertEquals(1, ended["winningSeat"]!!.jsonPrimitive.content.toInt())
                assertEquals(9, ended["endedOnTurn"]!!.jsonPrimitive.content.toInt())
                assertEquals("LifeReachedZero", ended["lossReason"]!!.jsonPrimitive.content)
                assertFalse(ended.toString().contains("Alice"), "by seat, never a name")
                val close = frames[1] as Frame.Close
                assertEquals(CloseReason.Codes.NORMAL.code, close.readReason()!!.code)
            }
            assertTrue(player.all().isEmpty(), "players hear the end as the lobby's MATCH")
            // A spectator whose connection dropped at the end is told it on return.
            assertEquals("WINNER", hub.endings.of(match.matchId)!!["outcome"]!!.jsonPrimitive.content)
            assertNull(hub.endings.of(UUID.randomUUID()))
        }

    @Test
    fun `a game with no result tells the spectators so, with no winner`() =
        runBlocking {
            val hub = MatchHub()
            val carol = Channel<Frame>(Channel.UNLIMITED)
            hub.spectators.open(match.matchId, UUID.randomUUID(), "w", carol)
            hub.endings.ended(match.copy(status = MatchStatus.FAILED_RUNTIME), SERVER_RESTARTED, null)
            val ended = carol.all().first().json()
            assertEquals("FAILED_RUNTIME", ended["status"]!!.jsonPrimitive.content)
            assertEquals(SERVER_RESTARTED, ended["failureCode"]!!.jsonPrimitive.content)
            assertNull(ended["winningSeat"])
        }

    @Test
    fun `the players are told who is watching, each person once however many tabs`() {
        val hub = MatchHub()
        val carol = UUID.randomUUID()
        val dave = UUID.randomUUID()
        hub.spectatorNames[carol] = "Carol"
        hub.spectatorNames[dave] = "dave"
        hub.spectators.open(match.matchId, dave, "d1", Channel(Channel.UNLIMITED))
        hub.spectators.open(match.matchId, carol, "c1", Channel(Channel.UNLIMITED))
        hub.spectators.open(match.matchId, carol, "c2", Channel(Channel.UNLIMITED))

        val message = watchingNow(match.matchId, hub)

        assertEquals("WATCHING", message["type"]!!.jsonPrimitive.content)
        assertEquals(2, message["count"]!!.jsonPrimitive.content.toInt())
        assertEquals(listOf("Carol", "dave"), message["names"]!!.jsonArray.map { it.jsonPrimitive.content })
        assertFalse(message.toString().contains(carol.toString()), "names only, never an account id")
    }

    @Test
    fun `nobody watching is an empty list`() {
        val message = watchingNow(match.matchId, MatchHub())
        assertEquals(0, message["count"]!!.jsonPrimitive.content.toInt())
        assertNotNull(message["names"])
        assertTrue(message["names"]!!.jsonArray.isEmpty())
    }

    @Test
    fun `only a running game whose worker is alive may be watched`() {
        val live =
            object : MatchAssets {
                override fun isLive(matchId: UUID) = true

                override fun mayFetch(
                    matchId: UUID,
                    userId: UUID,
                    assetId: String,
                ) = false
            }
        assertTrue(mayWatch(match.copy(status = MatchStatus.RUNNING), live))
        assertFalse(mayWatch(match.copy(status = MatchStatus.LAUNCHING), live), "still choosing hands")
        assertFalse(mayWatch(match.copy(status = MatchStatus.RUNNING), MatchAssets.NONE), "no worker here")
        assertFalse(mayWatch(match, live), "over")
    }

    @Test
    fun `a room's entry is not spectatable until the lobby says its game is running`() {
        val room =
            net.barnflix.proxic.room.Room(
                roomId = match.roomId,
                hostUserId = alice,
                presetId = "OPEN_FORMAT_1V1",
                desiredPlayerCount = 2,
                status = net.barnflix.proxic.room.RoomStatus.IN_MATCH,
                revision = 1,
                members = emptyList(),
            )
        assertFalse(room.directoryEntry().spectatable)
    }
}
