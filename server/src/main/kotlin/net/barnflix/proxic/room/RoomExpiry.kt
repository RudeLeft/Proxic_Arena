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
     * A room that played a game goes too (owner 2026-11-04; V037): its
     * matches keep the room and setup ids as history, and nothing about
     * a finished game reads the room. It was kept forever before. A
     * room whose match is still starting or running is never touched --
     * deleting it out from under a live game is the kind of tidy-up
     * that only shows up in production.
     */
    fun purgeFinished(retention: Duration): Int =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                DELETE FROM room
                 WHERE status IN ('CLOSED', 'EXPIRED')
                   AND last_activity_at < now() - ?::interval
                   AND NOT EXISTS (
                         SELECT 1 FROM match m
                          WHERE m.room_id = room.room_id AND m.status IN ('LAUNCHING', 'RUNNING')
                       )
                """.trimIndent(),
            ).use {
                it.setString(1, "${retention.toSeconds()} seconds")
                it.executeUpdate()
            }
        }
}
