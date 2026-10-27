package net.barnflix.proxic.hall

import java.time.Instant
import java.util.UUID
import kotlin.math.pow
import kotlin.math.roundToInt

// The rating — spec 0018 H2.
//
// Elo: everyone starts at 1000, and a finished game moves the winner up
// and the loser down by K times how unexpected the result was. Playing
// more never raises a rating by itself; only winning does, and beating
// a stronger player is worth more than beating a weaker one. A draw
// changes nothing (owner, 2026-10-26).

object Elo {
    const val START = 1000
    const val K = 32

    /** The chance [rating] beats [other], as Elo has it. */
    fun expected(
        rating: Int,
        other: Int,
    ): Double = 1.0 / (1.0 + 10.0.pow((other - rating) / 400.0))

    /** What the winner gains and the loser loses. */
    fun change(
        winner: Int,
        loser: Int,
    ): Int = (K * (1.0 - expected(winner, loser))).roundToInt()
}

/** One player's line in a table: a season's, or all time. */
class RatingLine(
    val userId: UUID,
) {
    var rating = Elo.START
    var wins = 0
    var losses = 0
    var draws = 0

    /** The last change, + or -; 0 after a draw. */
    var lastChange = 0

    /** When the line last changed: the tie-break goes to whoever got there first. */
    var lastAt: Instant = Instant.MIN

    /** W, L or D, oldest first. */
    val form = StringBuilder()
    val deckPlays = LinkedHashMap<String, Pair<HallDeck, Int>>()

    val games get() = wins + losses + draws

    /** The deck played most (the latest on a tie). */
    val favourite: HallDeck? get() = deckPlays.values.maxWithOrNull(compareBy { it.second })?.first

    internal fun played(
        deck: HallDeck,
        mark: Char,
        change: Int,
        at: Instant,
    ) {
        form.append(mark)
        lastChange = change
        rating += change
        lastAt = at
        val before = deckPlays.remove(deck.key)?.second ?: 0
        deckPlays[deck.key] = deck to before + 1
    }
}

/** A table of ratings, fed games in the order they ended. */
class RatingTable {
    private val lines = LinkedHashMap<UUID, RatingLine>()

    fun line(userId: UUID): RatingLine = lines.getOrPut(userId) { RatingLine(userId) }

    val all: Collection<RatingLine> get() = lines.values

    /** Plays one game; returns the winner's gain (0 for a draw). */
    fun play(game: HallGame): Int {
        val winner = game.winner
        val loser = game.loser
        if (winner == null || loser == null) {
            for (seat in game.seats) line(seat.userId).also { it.draws++ }.played(seat.deck, 'D', 0, game.endedAt)
            return 0
        }
        val w = line(winner.userId)
        val l = line(loser.userId)
        val change = Elo.change(w.rating, l.rating)
        w.wins++
        l.losses++
        w.played(winner.deck, 'W', change, game.endedAt)
        l.played(loser.deck, 'L', -change, game.endedAt)
        return change
    }

    /** Players with [minGames] or more, best first: rating, then wins, then whoever got there first. */
    fun ranked(
        minGames: Int,
        counted: (UUID) -> Boolean = { true },
    ): List<RatingLine> =
        lines.values
            .filter { it.games >= minGames && counted(it.userId) }
            .sortedWith(
                compareByDescending<RatingLine> { it.rating }
                    .thenByDescending { it.wins }
                    .thenBy { it.lastAt }
                    .thenBy { it.userId },
            )

    companion object {
        /** A table from [games], in order. */
        fun of(games: List<HallGame>): RatingTable = RatingTable().also { table -> games.forEach { table.play(it) } }
    }
}
