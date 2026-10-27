package net.barnflix.proxic.lobby

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import net.barnflix.proxic.hall.HallGameSource
import net.barnflix.proxic.hall.RatingLine
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// Spec 0011 — the Hall of Champions; since spec 0018 the season's places
// (the Hall page has the rest).
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

/**
 * The season's places for the lobby's rings: 1st to 3rd and Last place
 * (spec 0018 replaced spec 0011's "most wins" with the season rating).
 */
data class Standings(
    val podium: List<PlayerRecord>,
    val last: PlayerRecord?,
    /** Spec 0019 F1 — who holds the Champion's Belt; null when nobody. */
    val belt: UUID? = null,
)

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

    /** This season's places (spec 0018). */
    fun standings(): Standings {
        val hall = HallGameSource(dataSource).hall()
        val now = Instant.now()
        val places = hall.places(now)

        fun record(line: RatingLine) = PlayerRecord(line.userId, line.wins, line.games, null)
        return Standings(places.podium.map(::record), places.last?.let(::record), hall.beltHolder(now))
    }
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
        // Spec 0019 F1 — absent when nobody holds the Belt.
        standings.belt?.let { put("belt", it.toString()) }
    }

private fun JsonObjectBuilder.putRecord(record: PlayerRecord) {
    put("userId", record.userId.toString())
    put("wins", record.wins)
    put("games", record.games)
}
