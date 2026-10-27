package net.barnflix.proxic.hall

import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// The finished games the Hall of Champions is counted from — spec 0018.
//
// Everything the Hall shows is worked out from the record of finished
// games that is already kept: no table of its own, so the first season
// counts the games played before the page existed, and nothing can
// drift out of step with the games themselves. A game counts when it
// ENDED with Forge's result (spec 0011's rule); an abandoned, failed or
// administrator-closed game counts for nobody.

/** The deck a player used, as the Hall may show it (spec 0018 H8: name and icon, never cards). */
data class HallDeck(
    /** Stable for counting "decks": the deck's id, or its name when the deck has gone. */
    val key: String,
    val name: String,
    val icon: String?,
    val colors: String?,
)

data class HallSeat(
    val userId: UUID,
    val seat: Int,
    val deck: HallDeck,
)

/** One finished two-player game. [winnerSeat] null is a draw. */
data class HallGame(
    val matchId: UUID,
    val endedAt: Instant,
    val seats: List<HallSeat>,
    val winnerSeat: Int?,
    val turn: Int?,
    val concededSeat: Int?,
) {
    val winner: HallSeat? get() = seats.firstOrNull { it.seat == winnerSeat }
    val loser: HallSeat? get() = winnerSeat?.let { w -> seats.firstOrNull { it.seat != w } }

    fun seatOf(userId: UUID): HallSeat? = seats.firstOrNull { it.userId == userId }

    companion object {
        private val WIN = Regex("""^winner:seat (\d+) on turn (\d+)""")
        private val DRAW = Regex("""^draw on turn (\d+)""")
        private val CONCEDED = Regex("""\(seat (\d+) conceded\)""")

        /** The result as MatchRecords wrote it; null for anything that is not a result. */
        fun result(summary: String?): Triple<Int?, Int?, Int?>? {
            if (summary == null) return null
            val conceded = CONCEDED.find(summary)?.groupValues?.get(1)?.toInt()
            WIN.find(summary)?.let { return Triple(it.groupValues[1].toInt(), it.groupValues[2].toInt(), conceded) }
            DRAW.find(summary)?.let { return Triple(null, it.groupValues[1].toInt(), null) }
            return null
        }
    }
}

/** Every finished two-player game, oldest first; and who may appear on the boards. */
class HallGameSource(private val dataSource: DataSource) {
    /** Active accounts: a disabled one leaves the boards (spec 0011's rule, kept). */
    fun activeUsers(): Set<UUID> =
        dataSource.connection.use { connection ->
            connection.prepareStatement("SELECT user_id FROM app_user WHERE status = 'ACTIVE'").use { statement ->
                statement.executeQuery().use { rows ->
                    buildSet { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                }
            }
        }

    /** The Hall as it stands, for this server's clock. */
    fun hall(zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): Hall {
        val active = activeUsers()
        return Hall(games(), zone) { it in active }
    }

    fun games(): List<HallGame> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT m.match_id, m.ended_at, m.result_summary,
                       p.user_id, p.seat_number, p.deck_id, p.deck_name_snapshot, d.icon, d.colors
                  FROM match m
                  JOIN match_participant p ON p.match_id = m.match_id
                  LEFT JOIN imported_deck d ON d.deck_id = p.deck_id
                 WHERE m.status = 'ENDED' AND m.ended_at IS NOT NULL
                 ORDER BY m.ended_at, m.match_id, p.seat_number
                """.trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    val seats = LinkedHashMap<UUID, MutableList<HallSeat>>()
                    val heads = LinkedHashMap<UUID, Pair<Instant, String?>>()
                    while (rows.next()) {
                        val matchId = rows.getObject(1, UUID::class.java)
                        heads[matchId] = rows.getTimestamp(2).toInstant() to rows.getString(3)
                        val deckId = rows.getObject(6, UUID::class.java)
                        val name = rows.getString(7)
                        seats.getOrPut(matchId) { mutableListOf() } +=
                            HallSeat(
                                userId = rows.getObject(4, UUID::class.java),
                                seat = rows.getInt(5),
                                deck =
                                    HallDeck(
                                        key = deckId?.toString() ?: "name:$name",
                                        name = name,
                                        icon = rows.getString(8),
                                        colors = rows.getString(9),
                                    ),
                            )
                    }
                    heads.mapNotNull { (matchId, head) ->
                        val (winner, turn, conceded) = HallGame.result(head.second) ?: return@mapNotNull null
                        val players = seats.getValue(matchId)
                        if (players.size != 2) return@mapNotNull null
                        HallGame(matchId, head.first, players, winner, turn, conceded)
                    }
                }
            }
        }
}
