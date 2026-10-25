package net.barnflix.proxic.lobby

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.UUID
import javax.sql.DataSource

// The game chat — spec 0013 (owner 2026-10-25).
//
// A chat line or a reaction marked `scope: "game"` goes to the players
// seated in the sender's game and to nobody else: one that is starting
// or running, or that ended within the last half hour, so the two can
// still talk on the end screen. Like the lobby chat, nothing is stored.

/** How long after a game ends its players can still talk in it. */
private const val END_SCREEN_MINUTES = 30

/** Who is seated in a player's game, for its chat. */
class GameSeats(private val dataSource: DataSource) {
    /** The players of [userId]'s game, them included; null when they have none. */
    fun of(userId: UUID): List<UUID>? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT o.user_id
                  FROM match_participant o
                 WHERE o.match_id = (
                       SELECT m.match_id
                         FROM match m
                         JOIN match_participant p ON p.match_id = m.match_id
                        WHERE p.user_id = ?
                          AND (m.status IN ('LAUNCHING', 'RUNNING')
                               OR m.ended_at > now() - make_interval(mins => ?))
                        ORDER BY m.created_at DESC
                        LIMIT 1)
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, userId)
                statement.setInt(2, END_SCREEN_MINUTES)
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                        .takeIf { it.isNotEmpty() }
                }
            }
        }
}

/** The same message, marked as the game's rather than the lobby's. */
fun JsonObject.inGame(): JsonObject = JsonObject(this + ("scope" to JsonPrimitive("game")))
