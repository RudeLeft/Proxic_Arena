package net.barnflix.proxic.lobby

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// Spec 0011 — the Hall of Champions.
//
// Wins are FORGE's: a finished game (status ENDED) whose recorded result
// names the player's seat ("winner:seat N ..."). A draw is a game played
// and won by nobody; an abandoned, failed or administrator-closed game is
// not ENDED and counts for nobody (§6.153: Arena declares no winner).

/** One player's record: finished games, and how many of them they won. */
data class PlayerRecord(
    val userId: UUID,
    val wins: Int,
    val games: Int,
    /** When they reached their current number of wins; null with none. */
    val lastWinAt: Instant?,
)

/** The podium (up to three) and dead last, if anybody qualifies. */
data class Standings(
    val podium: List<PlayerRecord>,
    val last: PlayerRecord?,
) {
    companion object {
        /** C3 — dead last needs this many finished games. */
        const val GAMES_FOR_LAST = 5

        /**
         * Spec 0011's order. Most wins first; on equal wins fewer games
         * (more wins per game); then whoever reached that many wins first.
         * Dead last: the fewest wins among players with 5+ games; on equal
         * wins more games is further down, then whoever has been there
         * longer. Never also on the podium.
         */
        fun of(records: List<PlayerRecord>): Standings {
            val podium =
                records
                    .filter { it.wins > 0 }
                    .sortedWith(
                        compareByDescending<PlayerRecord> { it.wins }
                            .thenBy { it.games }
                            .thenBy { it.lastWinAt ?: Instant.MAX }
                            .thenBy { it.userId },
                    ).take(3)
            val onPodium = podium.map { it.userId }.toSet()
            val last =
                records
                    .filter { it.games >= GAMES_FOR_LAST && it.userId !in onPodium }
                    .sortedWith(
                        compareBy<PlayerRecord> { it.wins }
                            .thenByDescending { it.games }
                            .thenBy { it.lastWinAt ?: Instant.MIN }
                            .thenBy { it.userId },
                    ).firstOrNull()
            return Standings(podium, last)
        }
    }
}

/** Every active account's record, from the matches table. */
class StandingsSource(private val dataSource: DataSource) {
    fun records(): List<PlayerRecord> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT p.user_id,
                       count(*) FILTER (WHERE m.result_summary LIKE 'winner:seat ' || p.seat_number || ' %'),
                       count(*),
                       max(m.ended_at) FILTER (WHERE m.result_summary LIKE 'winner:seat ' || p.seat_number || ' %')
                  FROM match_participant p
                  JOIN match m ON m.match_id = p.match_id
                  JOIN app_user u ON u.user_id = p.user_id
                 WHERE m.status = 'ENDED' AND u.status = 'ACTIVE'
                 GROUP BY p.user_id
                """.trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            add(
                                PlayerRecord(
                                    userId = rows.getObject(1, UUID::class.java),
                                    wins = rows.getInt(2),
                                    games = rows.getInt(3),
                                    lastWinAt = rows.getTimestamp(4)?.toInstant(),
                                ),
                            )
                        }
                    }
                }
            }
        }

    fun standings(): Standings = Standings.of(records())
}

/** `STANDINGS` — the same for everybody (spec 0011). */
fun standingsMessage(standings: Standings): JsonObject =
    envelope("STANDINGS") {
        putJsonArray("podium") {
            standings.podium.forEachIndexed { index, record ->
                add(
                    buildJsonObject {
                        put("place", index + 1)
                        putRecord(record)
                    },
                )
            }
        }
        standings.last?.let { record -> putJsonObject("last") { putRecord(record) } }
    }

private fun JsonObjectBuilder.putRecord(record: PlayerRecord) {
    put("userId", record.userId.toString())
    put("wins", record.wins)
    put("games", record.games)
}
