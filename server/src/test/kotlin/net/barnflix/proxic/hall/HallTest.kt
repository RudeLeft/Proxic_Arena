package net.barnflix.proxic.hall

import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Spec 0018, F-0018-A — the Hall's rules, from a fixed list of games. */
class HallTest {
    private val ids = HashMap<String, UUID>()
    private val names = HashMap<UUID, String>()

    private fun id(name: String): UUID {
        val made = ids.getOrPut(name) { UUID.nameUUIDFromBytes(name.toByteArray()) }
        names[made] = name
        return made
    }

    private fun name(id: String?) = id?.let { names[UUID.fromString(it)] }

    private var clock = Instant.parse("2026-11-02T12:00:00Z")

    /** A game [a] against [b], an hour after the last; [won] names the winner, null for a draw. */
    private fun game(
        a: String,
        b: String,
        won: String?,
        turn: Int = 10,
        deckA: String = "$a deck",
        conceded: String? = null,
        at: Instant? = null,
    ): HallGame {
        clock = at ?: clock.plusSeconds(3600)
        val seats =
            listOf(
                HallSeat(id(a), 1, HallDeck(deckA, deckA, null, null)),
                HallSeat(id(b), 2, HallDeck("$b deck", "$b deck", null, null)),
            )
        val seatOf = { who: String? -> seats.firstOrNull { it.userId == who?.let(::id) }?.seat }
        return HallGame(UUID.randomUUID(), clock, seats, seatOf(won), turn, seatOf(conceded))
    }

    private fun hall(games: List<HallGame>) = Hall(games, ZoneOffset.UTC) { true }

    private fun HallView.boardNames() = board.map { name(it.userId) }

    @Test
    fun `a win is worth more against a stronger player, and a draw changes nothing`() {
        assertEquals(16, Elo.change(1000, 1000))
        assertEquals(15, Elo.change(1016, 984))
        assertEquals(24, Elo.change(900, 1100), "an upset: 1000 against 1000 would be 16")
        val table = RatingTable.of(listOf(game("Pat", "Ash", "Pat"), game("Pat", "Ash", null)))
        assertEquals(1016 to 984, table.line(id("Pat")).rating to table.line(id("Ash")).rating)
        assertEquals(1 to 1, table.line(id("Pat")).let { it.wins to it.draws })
    }

    @Test
    fun `playing more does not beat playing well`() {
        // Busy plays twelve and wins half; Steady plays five and wins four.
        val games =
            (1..12).map { game("Busy", "Filler", if (it % 2 == 0) "Busy" else "Filler") } +
                (1..5).map { game("Steady", "Filler", if (it <= 4) "Steady" else "Filler") }
        val view = hall(games).view(clock, id("Busy"))
        assertEquals("Steady", view.boardNames().first())
        assertTrue(view.board.first { name(it.userId) == "Busy" }.rank > 1)
    }

    @Test
    fun `five games to be ranked, and Last place is the lowest of the rest`() {
        val games =
            (1..5).flatMap { listOf(game("A", "D", "A"), game("B", "D", "B"), game("C", "D", "C")) } +
                (1..4).map { game("New", "A", "New") }
        val view = hall(games).view(clock, id("A"))
        assertEquals(listOf(1, 2, 3, 4), view.season.places.map { it.place })
        assertEquals("D", name(view.season.places.last().userId))
        assertEquals(listOf("New"), view.qualifying.map { name(it.userId) }, "4 games: still playing in")
        assertEquals(4, view.qualifying.single().games)
    }

    @Test
    fun `a new month starts everyone at 1000, and the last month keeps its places`() {
        val october = (1..5).map { game("Pat", "Ash", "Pat", at = Instant.parse("2026-10-0${it}T10:00:00Z")) }
        val november = listOf(game("Ash", "Pat", "Ash", at = Instant.parse("2026-11-03T10:00:00Z")))
        val view = hall(october + november).view(Instant.parse("2026-11-04T00:00:00Z"), id("Pat"))
        assertEquals(2, view.season.number)
        assertEquals("2026-11", view.season.month)
        assertTrue(view.board.isEmpty(), "nobody has five games this month yet")
        val past = view.past.single()
        assertEquals("2026-10" to "Pat", past.month to name(past.places.first().userId))
        // All time keeps counting.
        assertEquals(listOf("Pat", "Ash"), view.allTime.map { name(it.userId) })
    }

    @Test
    fun `the Belt starts with the champion, changes hands on a win, and counts defences`() {
        val before = listOf(game("Pat", "Ash", "Pat", at = Instant.parse("2026-10-20T10:00:00Z")))
        val after =
            listOf(
                game("Pat", "Ash", "Pat", at = Instant.parse("2026-10-28T10:00:00Z")),
                game("Bree", "Ash", "Bree"),
                game("Ash", "Pat", "Ash"),
            )
        val view = hall(before + after).view(clock, id("Pat"))
        assertEquals("Ash", name(view.belt.holder))
        assertEquals(0, view.belt.defences)
        assertTrue(view.latest.first().beltTaken, "the latest win took the Belt")

        val defended = hall(before + after.take(2)).view(clock, id("Pat"))
        assertEquals("Pat" to 1, name(defended.belt.holder) to defended.belt.defences)
    }

    @Test
    fun `an idle holder hands the Belt to the season leader after fourteen days`() {
        val start = Instant.parse("2026-10-20T10:00:00Z")
        val games =
            listOf(game("Pat", "Ash", "Pat", at = start)) +
                (1..3).map { game("Bree", "Ash", "Bree", at = Instant.parse("2026-11-0${it}T10:00:00Z")) }
        val due = Belt.START.plus(Duration.ofDays(14))
        val stillPat = hall(games).view(due.minusSeconds(60), id("Pat"))
        assertEquals("Pat", name(stillPat.belt.holder))
        val handed = hall(games).view(due.plusSeconds(60), id("Pat"))
        assertEquals("Bree", name(handed.belt.holder))
        assertEquals("belt", handed.latest.first().kind)
    }

    @Test
    fun `badges, records and rivalries come from the games`() {
        val games =
            (1..5).map { game("Pat", "Ash", "Pat", turn = 4 + it, deckA = "deck $it") } +
                (1..5).map { game("Ash", "Bree", "Bree", turn = 20) } +
                listOf(game("Bree", "Pat", "Bree", turn = 30, conceded = "Pat"))
        val view = hall(games).view(clock, id("Ash"))

        fun badges(who: String) = view.board.first { name(it.userId) == who }.badges.map { it.key }

        assertTrue("speed-demon" in badges("Pat"), "won on turn 5")
        assertTrue("deck-master" in badges("Pat"), "five decks")
        assertTrue("on-fire" in badges("Bree"), "six wins in a row")
        assertTrue("giant-slayer" in badges("Bree"), "beat the leader")
        assertTrue("never-conceded" !in badges("Pat"), "fewer than ten games, and conceded once")

        val records = view.records.associateBy { it.key }

        fun record(key: String) = records.getValue(key).let { name(it.userId) to it.value }
        assertEquals("Pat" to 5, record("fastest-win"))
        assertEquals("Bree" to 30, record("longest-game"))
        assertEquals("Bree" to 6, record("win-streak"))

        assertEquals(5, view.rivalries.first().let { it.aWins + it.bWins + it.draws })
        val rival = view.rival!!
        assertEquals("Ash", name(rival.a), "the viewer is a")
        assertEquals(0 to 5, rival.aWins to rival.bWins)
    }

    @Test
    fun `with nobody played the Hall is empty`() {
        val view = hall(emptyList()).view(clock, id("Pat"))
        assertTrue(view.board.isEmpty() && view.season.places.isEmpty() && view.latest.isEmpty())
        assertNull(view.belt.holder)
        assertNull(view.rival)
    }
}
