package net.barnflix.proxic.room

import java.time.Duration
import javax.sql.DataSource

// Finished room records — PHASE_05 §5.126.
//
// Closing an idle room is spec 0054's (RoomIdle, RoomMaintenance); this
// is what is left of the 24-hour expiry it replaced: removing the
// records of rooms that closed, after a diagnostics window.

internal class RoomExpiry(private val dataSource: DataSource) {
    /**
     * §5.126 — finished rooms are kept briefly, then removed.
     *
     * "Briefly" is the operative word: §5.126 also forbids building
     * permanent match history out of lobby records, so this is a
     * diagnostics window and not an archive. CASCADE takes the
     * setups and their seats with it.
     *
     * A CONSUMED setup holds the room alive, because Phase 6 will
     * have a live match pointing at it and deleting the room out
     * from under a running game is the kind of tidy-up that only
     * shows up in production.
     */
    fun purgeFinished(retention: Duration): Int =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                DELETE FROM room
                 WHERE status IN ('CLOSED', 'EXPIRED')
                   AND last_activity_at < now() - ?::interval
                   AND NOT EXISTS (
                         SELECT 1 FROM match_setup s
                          WHERE s.room_id = room.room_id AND s.status = 'CONSUMED'
                       )
                """.trimIndent(),
            ).use {
                it.setString(1, "${retention.toSeconds()} seconds")
                it.executeUpdate()
            }
        }
}
