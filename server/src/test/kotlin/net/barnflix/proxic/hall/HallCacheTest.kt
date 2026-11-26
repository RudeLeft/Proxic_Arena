package net.barnflix.proxic.hall

import net.barnflix.proxic.lobby.StandingsSource
import org.postgresql.ds.PGSimpleDataSource
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertSame

/**
 * P11-E10 -- the kept Hall, on its own: kept until invalidated, never kept
 * from a read a change overtook, and the lobby's places kept only while the
 * moment they hold to (Hall.steadyUntil) is still to come. The three
 * triggers, through the real server, are HallTriggersTest.
 */
class HallCacheTest {
    private fun id(name: String) = UUID.nameUUIDFromBytes(name.toByteArray())

    private fun game(
        a: String,
        b: String,
        winner: String,
        at: Instant,
    ): HallGame {
        val seats =
            listOf(
                HallSeat(id(a), 1, HallDeck("$a deck", "$a deck", null, null)),
                HallSeat(id(b), 2, HallDeck("$b deck", "$b deck", null, null)),
            )
        return HallGame(UUID.randomUUID(), at, seats, seats.first { it.userId == id(winner) }.seat, 9, null)
    }

    @Test
    fun `the Hall is read once and kept until something invalidates it`() {
        var reads = 0
        val cache = HallCache { Hall(emptyList(), ZoneOffset.UTC) { true }.also { reads++ } }
        val first = cache.hall()
        assertSame(first, cache.hall())
        assertEquals(1, reads)
        cache.invalidate()
        assertNotEquals(first, cache.hall())
        assertEquals(2, reads)
    }

    @Test
    fun `a read that a change overtook is handed out once and never kept`() {
        var reads = 0
        lateinit var cache: HallCache
        cache =
            HallCache {
                reads++
                // A game ends while this read is under way.
                if (reads == 1) cache.invalidate()
                Hall(emptyList(), ZoneOffset.UTC) { true }
            }
        cache.hall()
        cache.hall()
        assertEquals(2, reads, "the overtaken read was not kept: the next went to the database")
        cache.hall()
        assertEquals(2, reads, "and that one was kept")
    }

    @Test
    fun `the lobby's places are kept until the season ends, then worked out again`() {
        val start = Instant.parse("2026-11-10T12:00:00Z")
        // Seven wins each for A over B (B is ranked too, with seven games).
        val games = (0 until 7).map { game("A", "B", "A", start.plusSeconds(3600L * it)) }
        val cache = HallCache { Hall(games, ZoneOffset.UTC) { true } }
        var now = Instant.parse("2026-11-30T23:59:00Z")
        val standings = StandingsSource(PGSimpleDataSource(), cache) { now }
        val november = standings.standings()
        assertEquals(listOf(id("A"), id("B")), november.podium.map { it.userId })
        assertSame(november, standings.standings(), "kept while nothing changed")

        // December: a new season, nobody ranked yet, with no game, reset or
        // account change to invalidate anything.
        now = Instant.parse("2026-12-01T00:01:00Z")
        assertEquals(emptyList(), standings.standings().podium.map { it.userId })
    }

    @Test
    fun `the places are worked out again when the Belt falls due, with nothing else changed`() {
        // A wins the Belt from B on 10 November, then plays nothing: it falls
        // due on the 17th and goes to the season's other leader, C.
        val games =
            listOf(
                game("B", "C", "C", Instant.parse("2026-11-08T12:00:00Z")),
                game("A", "C", "A", Instant.parse("2026-11-10T12:00:00Z")),
            )
        val cache = HallCache { Hall(games, ZoneOffset.UTC) { true } }
        var now = Instant.parse("2026-11-16T12:00:00Z")
        val standings = StandingsSource(PGSimpleDataSource(), cache) { now }
        assertEquals(id("A"), standings.standings().belt)
        now = Instant.parse("2026-11-17T13:00:00Z")
        assertEquals(id("C"), standings.standings().belt, "a kept answer past its defend-by date is not handed out")
    }
}
