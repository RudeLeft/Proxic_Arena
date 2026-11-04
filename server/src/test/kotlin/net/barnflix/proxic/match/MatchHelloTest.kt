package net.barnflix.proxic.match

import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import java.time.Duration
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Spec 0054 — the greeting tells the page how long "away" is, so "End
 * the game" is offered exactly when the server will accept it. It was
 * a fixed 10 minutes on the page while the server read its setting.
 */
class MatchHelloTest {
    @Test
    fun `the greeting carries the server's away setting`() {
        val hello = matchHelloMessage(UUID.randomUUID(), seat = 1, away = Duration.ofMinutes(20))

        assertEquals(1, hello["seat"]!!.jsonPrimitive.int)
        assertEquals(20, hello["awayMinutes"]!!.jsonPrimitive.long)
    }
}
