package net.barnflix.proxic.hall

import java.util.UUID

// Badges, records and rivalries — spec 0018 H4.
//
// All from the finished games, all time unless a badge says "this
// season". Only what the games record: badges that need more (life
// totals, say) wait until the games keep it.

/** A badge on the leaderboard: a key the page styles, and its words. */
data class Badge(
    val key: String,
    val label: String,
)

/** A record: what, who, the figure, and a line of detail. */
data class HallRecord(
    val key: String,
    val label: String,
    val userId: UUID,
    val value: Int,
    val detail: String,
)

/** Two players and their score; [a] has played more or is first by id. */
data class Rivalry(
    val a: UUID,
    val b: UUID,
    val aWins: Int,
    val bWins: Int,
    val draws: Int,
) {
    val games get() = aWins + bWins + draws
}

class Highlights(
    private val all: List<HallGame>,
    private val season: List<HallGame>,
) {
    /** Each player's current run of wins, all time (a draw or loss ends it). */
    val streaks: Map<UUID, Int> by lazy {
        val run = HashMap<UUID, Int>()
        for (game in all) {
            for (seat in game.seats) {
                val won = game.winner?.userId == seat.userId
                run[seat.userId] = if (won) (run[seat.userId] ?: 0) + 1 else 0
            }
        }
        run
    }

    /** Each player's best run of wins, all time. */
    private val bestStreaks: Map<UUID, Int> by lazy {
        val run = HashMap<UUID, Int>()
        val best = HashMap<UUID, Int>()
        for (game in all) {
            for (seat in game.seats) {
                val now = if (game.winner?.userId == seat.userId) (run[seat.userId] ?: 0) + 1 else 0
                run[seat.userId] = now
                best[seat.userId] = maxOf(best[seat.userId] ?: 0, now)
            }
        }
        best
    }

    /** Distinct decks each player has won with, all time. */
    private val decksWonWith: Map<UUID, Int> by lazy {
        all
            .mapNotNull { it.winner }
            .groupBy { it.userId }
            .mapValues { (_, seats) -> seats.map { it.deck.key }.distinct().size }
    }

    /** Players who beat the season's leader (as it stood just before) this season. */
    private val giantSlayers: Set<UUID> by lazy {
        val table = RatingTable()
        val slayers = HashSet<UUID>()
        for (game in season) {
            val leader = table.ranked(Seasons.RANKED).firstOrNull()?.userId
            if (leader != null && game.loser?.userId == leader) game.winner?.let { slayers += it.userId }
            table.play(game)
        }
        slayers
    }

    fun badges(
        userId: UUID,
        beltHolder: UUID?,
    ): List<Badge> =
        buildList {
            if (userId == beltHolder) add(Badge("belt", "Belt holder"))
            val streak = streaks[userId] ?: 0
            if (streak >= ON_FIRE) add(Badge("on-fire", "On fire · $streak"))
            if (userId in giantSlayers) add(Badge("giant-slayer", "Giant slayer"))
            if (season.any { it.winner?.userId == userId && (it.turn ?: Int.MAX_VALUE) <= SPEED_TURN }) {
                add(Badge("speed-demon", "Speed demon"))
            }
            val played = all.filter { it.seatOf(userId) != null }
            if (played.size >= NEVER_CONCEDED_GAMES && played.none { it.concededSeat == it.seatOf(userId)?.seat }) {
                add(Badge("never-conceded", "Never conceded"))
            }
            if ((decksWonWith[userId] ?: 0) >= DECK_MASTER) add(Badge("deck-master", "Deck master"))
        }

    fun records(counted: (UUID) -> Boolean): List<HallRecord> =
        buildList {
            all
                .filter { it.turn != null && it.winner?.userId?.let(counted) == true }
                .minWithOrNull(compareBy<HallGame> { it.turn }.thenBy { it.endedAt })
                ?.let { game ->
                    val winner = game.winner!!
                    add(HallRecord("fastest-win", "Fastest win", winner.userId, game.turn!!, winner.deck.name))
                }
            bestStreaks
                .filter { counted(it.key) && it.value > 0 }
                .maxWithOrNull(compareBy<Map.Entry<UUID, Int>> { it.value }.thenByDescending { it.key })
                ?.let { add(HallRecord("win-streak", "Longest win streak", it.key, it.value, "")) }
            all
                .filter { it.turn != null && it.winner?.userId?.let(counted) == true }
                .maxWithOrNull(compareBy<HallGame> { it.turn }.thenByDescending { it.endedAt })
                ?.let { game ->
                    val beaten = game.loser!!.userId.toString()
                    add(HallRecord("longest-game", "Longest game", game.winner!!.userId, game.turn!!, beaten))
                }
            decksWonWith
                .filter { counted(it.key) }
                .maxWithOrNull(compareBy<Map.Entry<UUID, Int>> { it.value }.thenByDescending { it.key })
                ?.let { add(HallRecord("deck-count", "Most decks won with", it.key, it.value, "")) }
        }

    /** Every pairing that has played, most games first. */
    fun rivalries(counted: (UUID) -> Boolean): List<Rivalry> =
        all
            .filter { game -> game.seats.all { counted(it.userId) } }
            .groupBy { game -> game.seats.map { it.userId }.sorted() }
            .map { (pair, games) ->
                val (a, b) = pair
                Rivalry(
                    a = a,
                    b = b,
                    aWins = games.count { it.winner?.userId == a },
                    bWins = games.count { it.winner?.userId == b },
                    draws = games.count { it.winnerSeat == null },
                )
            }.sortedWith(compareByDescending<Rivalry> { it.games }.thenBy { it.a })

    companion object {
        const val ON_FIRE = 3
        const val SPEED_TURN = 5
        const val NEVER_CONCEDED_GAMES = 10
        const val DECK_MASTER = 5
    }
}
