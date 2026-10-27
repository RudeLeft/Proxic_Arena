package net.barnflix.proxic.hall

import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.UUID

// Seasons — spec 0018 H3.
//
// A season is a calendar month by the server's clock. Everyone starts
// it at 1000; its trophies are its standings when it ends. Seasons are
// numbered from the first month with a finished game, so the games
// played before the page existed make Season 1.

class Seasons(
    private val games: List<HallGame>,
    private val zone: ZoneId,
) {
    fun monthOf(at: Instant): YearMonth = YearMonth.from(at.atZone(zone))

    private val first: YearMonth? = games.firstOrNull()?.let { monthOf(it.endedAt) }

    /** Season 1 is the first month with a finished game. */
    fun number(month: YearMonth): Int = first?.let { ChronoUnit.MONTHS.between(it, month).toInt() + 1 } ?: 1

    /** The months before [current] that had a game, oldest first. */
    fun pastMonths(current: YearMonth): List<YearMonth> {
        val months = games.map { monthOf(it.endedAt) }.distinct()
        return months.filter { it < current }
    }

    fun endsAt(month: YearMonth): Instant = month.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant()

    /** The month's games that ended by [until]. */
    fun gamesIn(
        month: YearMonth,
        until: Instant = Instant.MAX,
    ): List<HallGame> = games.filter { monthOf(it.endedAt) == month && !it.endedAt.isAfter(until) }

    fun table(
        month: YearMonth,
        until: Instant = Instant.MAX,
    ): RatingTable = RatingTable.of(gamesIn(month, until))

    companion object {
        /** Games in a season before a player is ranked. */
        const val RANKED = 5
    }
}

/** A season's four places: 1st to 3rd, and Last place (the lowest-ranked player not in the top three). */
data class Places(
    val podium: List<RatingLine>,
    val last: RatingLine?,
) {
    companion object {
        fun of(
            table: RatingTable,
            counted: (UUID) -> Boolean,
        ): Places {
            val ranked = table.ranked(Seasons.RANKED, counted)
            return Places(ranked.take(3), if (ranked.size >= 4) ranked.last() else null)
        }
    }
}
