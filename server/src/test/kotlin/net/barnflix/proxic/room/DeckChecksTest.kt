package net.barnflix.proxic.room

import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Preparation's Forge check (owner 2026-11-05): each distinct deck is
 * checked once, different decks at the same time, and every seat still
 * gets its own answer. No database and no JVM: the seam is DeckPreflight.
 */
class DeckChecksTest {
    private val host = UUID.randomUUID()
    private val guest = UUID.randomUUID()

    @Test
    fun `a deck both seats play is checked once, and both seats are told`() {
        val shared = UUID.randomUUID()
        val calls = AtomicInteger()
        val preflight =
            DeckPreflight {
                calls.incrementAndGet()
                DeckCheck(DeckVerdict.FORGE_RESOLUTION_ERROR, "Not supported yet: X.")
            }

        val problems = checkDecks(preflight, listOf(host to shared, guest to shared))

        assertEquals(1, calls.get(), "the shared deck was checked more than once")
        assertEquals(listOf(host, guest), problems.map { it.userId })
        assertTrue(problems.all { it.code == "FORGE_RESOLUTION_ERROR" && it.detail == "Not supported yet: X." })
    }

    @Test
    fun `two decks are both checked, and a problem names the right seat`() {
        val hostDeck = UUID.randomUUID()
        val guestDeck = UUID.randomUUID()
        val asked = ConcurrentHashMap.newKeySet<UUID>()
        val preflight =
            DeckPreflight { deckId ->
                asked += deckId
                if (deckId == guestDeck) {
                    DeckCheck(DeckVerdict.INVALID_FOR_PRESET, "Too many copies of Shock.")
                } else {
                    DeckCheck(DeckVerdict.VALID, "")
                }
            }

        val problems = checkDecks(preflight, listOf(host to hostDeck, guest to guestDeck))

        assertEquals(setOf(hostDeck, guestDeck), asked)
        assertEquals(listOf(guest), problems.map { it.userId })
        assertEquals("INVALID_FOR_PRESET", problems.single().code)
    }

    @Test
    fun `two decks are checked at the same time`() {
        // Each check waits for the other to have started: one after the
        // other, the first would wait out its timeout and say so.
        val bothStarted = CountDownLatch(2)
        val preflight =
            DeckPreflight {
                bothStarted.countDown()
                val together = bothStarted.await(10, TimeUnit.SECONDS)
                if (together) {
                    DeckCheck(DeckVerdict.VALID, "")
                } else {
                    DeckCheck(DeckVerdict.FORGE_RESOLUTION_ERROR, "checked one at a time")
                }
            }

        val problems = checkDecks(preflight, listOf(host to UUID.randomUUID(), guest to UUID.randomUUID()))

        assertEquals(emptyList(), problems, "the decks were not checked together")
    }

    @Test
    fun `a check that throws fails preparation as before`() {
        val preflight = DeckPreflight { throw IllegalStateException("worker vanished") }

        val thrown =
            assertFailsWith<IllegalStateException> {
                checkDecks(preflight, listOf(host to UUID.randomUUID(), guest to UUID.randomUUID()))
            }
        assertEquals("worker vanished", thrown.message)
    }
}
