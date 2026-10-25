package net.barnflix.proxic.lobby

import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Spec 0011, F-0011-B — the order of the Hall of Champions. */
class StandingsTest {
    private val names = mutableMapOf<UUID, String>()

    private fun player(
        name: String,
        wins: Int,
        games: Int,
        lastWin: Long? = if (wins > 0) 1_000L else null,
    ): PlayerRecord {
        val id = UUID.nameUUIDFromBytes(name.toByteArray())
        names[id] = name
        return PlayerRecord(id, wins, games, lastWin?.let { Instant.ofEpochSecond(it) })
    }

    private fun Standings.podiumNames() = podium.map { names[it.userId] }

    private fun Standings.lastName() = last?.let { names[it.userId] }

    @Test
    fun `most wins first, and dead last is the fewest wins after five games`() {
        val standings =
            Standings.of(
                listOf(
                    player("Bree", 4, 10),
                    player("Pat", 14, 19),
                    player("Dana", 1, 9),
                    player("RudeLeft", 11, 18),
                    player("Ash", 7, 12),
                ),
            )
        assertEquals(listOf("Pat", "RudeLeft", "Ash"), standings.podiumNames())
        assertEquals("Dana", standings.lastName())
    }

    @Test
    fun `on equal wins fewer games ranks higher, then whoever got there first`() {
        val standings =
            Standings.of(
                listOf(
                    player("Slow", 5, 12, lastWin = 100),
                    player("Quick", 5, 6, lastWin = 900),
                    player("Late", 5, 12, lastWin = 500),
                ),
            )
        assertEquals(listOf("Quick", "Slow", "Late"), standings.podiumNames())
    }

    @Test
    fun `a newcomer is not dead last, and nobody wins the podium without a win`() {
        val standings =
            Standings.of(
                listOf(
                    player("Pat", 3, 5),
                    player("New", 0, 1),
                    player("Winless", 0, 4),
                ),
            )
        assertEquals(listOf("Pat"), standings.podiumNames())
        assertNull(standings.last, "fewer than five games is not dead last")
    }

    @Test
    fun `dead last is never also on the podium`() {
        val standings = Standings.of(listOf(player("Pat", 6, 10), player("RudeLeft", 4, 10)))
        assertEquals(listOf("Pat", "RudeLeft"), standings.podiumNames())
        assertNull(standings.last)
    }

    @Test
    fun `on equal wins at the bottom more games is further down, then the longer there`() {
        val standings =
            Standings.of(
                listOf(
                    player("A", 9, 10),
                    player("B", 8, 10),
                    player("C", 7, 10),
                    player("Few", 1, 6, lastWin = 100),
                    player("Many", 1, 20, lastWin = 900),
                    player("Never", 0, 5),
                    player("NeverMore", 0, 8),
                ),
            )
        assertEquals("NeverMore", standings.lastName())
        val withoutZero = Standings.of(standings.podium + listOf(player("Few", 1, 6, 100), player("Many", 1, 20, 900)))
        assertEquals("Many", withoutZero.lastName())
    }

    @Test
    fun `with nobody played there is no podium and no dead last`() {
        val standings = Standings.of(emptyList())
        assertEquals(emptyList(), standings.podium)
        assertNull(standings.last)
    }

    @Test
    fun `the message carries places, wins and games`() {
        val message = standingsMessage(Standings.of(listOf(player("Pat", 2, 3), player("Dana", 0, 6))))
        val podium = message["podium"]!!.jsonArray
        assertEquals(1, podium[0].jsonObject["place"]!!.jsonPrimitive.int)
        assertEquals(2, podium[0].jsonObject["wins"]!!.jsonPrimitive.int)
        assertEquals(3, podium[0].jsonObject["games"]!!.jsonPrimitive.int)
        assertEquals(6, message["last"]!!.jsonObject["games"]!!.jsonPrimitive.int)
    }
}
