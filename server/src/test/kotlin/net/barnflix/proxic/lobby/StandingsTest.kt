package net.barnflix.proxic.lobby

import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Spec 0011's STANDINGS message. Since spec 0018 it carries the season's
 * places (HallTest proves the order); this proves the message's shape.
 */
class StandingsTest {
    private fun player(
        name: String,
        wins: Int,
        games: Int,
    ) = PlayerRecord(UUID.nameUUIDFromBytes(name.toByteArray()), wins, games, null)

    @Test
    fun `the message carries places, wins and games`() {
        val message = standingsMessage(Standings(listOf(player("Pat", 2, 3)), player("Dana", 0, 6)))
        val podium = message["podium"]!!.jsonArray
        assertEquals(1, podium[0].jsonObject["place"]!!.jsonPrimitive.int)
        assertEquals(2, podium[0].jsonObject["wins"]!!.jsonPrimitive.int)
        assertEquals(3, podium[0].jsonObject["games"]!!.jsonPrimitive.int)
        assertEquals(6, message["last"]!!.jsonObject["games"]!!.jsonPrimitive.int)
    }
}
