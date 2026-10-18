package net.barnflix.proxic.match

import java.sql.Connection
import java.util.UUID
import javax.sql.DataSource

// Reading matches — PHASE_06 §6.108, §6.114.
//
// SQL only, the same seam RoomStore has. MatchLauncher owns the one
// write that matters; this owns the reads.

class MatchStore(private val dataSource: DataSource) {
    fun find(matchId: UUID): Match? = dataSource.connection.use { connection -> load(connection, matchId) }

    /**
     * §6.114 — the match this user is currently in, if any.
     *
     * "Currently" means LAUNCHING or RUNNING. A match that ended,
     * failed or was terminated is history: returning it would put a
     * refreshing browser back into a game that is over, which is
     * the opposite of what §6.114 exists for.
     *
     * At most one, because §6.9 gives a setup one match and Phase 5
     * gives a user one room. The LIMIT is a belt rather than a
     * rule — if two ever appeared, answering with one of them
     * arbitrarily would hide the fault.
     */
    fun activeMatchOf(userId: UUID): Match? =
        dataSource.connection.use { connection ->
            val matchId =
                connection.prepareStatement(
                    """
                    SELECT m.match_id
                      FROM match m
                      JOIN match_participant p ON p.match_id = m.match_id
                     WHERE p.user_id = ?
                       AND m.status IN ('LAUNCHING', 'RUNNING')
                     ORDER BY m.created_at DESC
                     LIMIT 1
                    """.trimIndent(),
                ).use { statement ->
                    statement.setObject(1, userId)
                    statement.executeQuery().use { rows ->
                        if (rows.next()) rows.getObject(1, UUID::class.java) else null
                    }
                }
            matchId?.let { load(connection, it) }
        }

    private fun load(
        connection: Connection,
        matchId: UUID,
    ): Match? {
        val header =
            connection.prepareStatement(
                "SELECT setup_id, room_id, status, preset_id FROM match WHERE match_id = ?",
            ).use { statement ->
                statement.setObject(1, matchId)
                statement.executeQuery().use { rows ->
                    if (!rows.next()) {
                        null
                    } else {
                        Header(
                            setupId = rows.getObject(1, UUID::class.java),
                            roomId = rows.getObject(2, UUID::class.java),
                            status = MatchStatus.valueOf(rows.getString(3)),
                            presetId = rows.getString(4),
                        )
                    }
                }
            } ?: return null

        return Match(
            matchId = matchId,
            setupId = header.setupId,
            roomId = header.roomId,
            status = header.status,
            presetId = header.presetId,
            participants = participantsOf(connection, matchId),
        )
    }

    private data class Header(
        val setupId: UUID,
        val roomId: UUID,
        val status: MatchStatus,
        val presetId: String,
    )

    private fun participantsOf(
        connection: Connection,
        matchId: UUID,
    ): List<MatchParticipant> =
        connection.prepareStatement(
            """
            SELECT user_id, seat_number, deck_id, deck_name_snapshot,
                   display_name_snapshot, team_id
              FROM match_participant
             WHERE match_id = ?
             ORDER BY seat_number
            """.trimIndent(),
        ).use { statement ->
            statement.setObject(1, matchId)
            statement.executeQuery().use { rows ->
                buildList {
                    while (rows.next()) {
                        add(
                            MatchParticipant(
                                userId = rows.getObject(1, UUID::class.java),
                                seatNumber = rows.getInt(2),
                                deckId = rows.getObject(3, UUID::class.java),
                                deckName = rows.getString(4),
                                displayName = rows.getString(5),
                                teamId = rows.getObject(6) as? Int,
                            ),
                        )
                    }
                }
            }
        }
}
