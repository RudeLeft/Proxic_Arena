package net.barnflix.proxic.room

import java.sql.Connection
import java.time.Duration
import java.util.UUID
import javax.sql.DataSource

// Expiring abandoned rooms — PHASE_05 §5.124–§5.126, owner D4.
//
// The SQL half, kept out of RoomStore because that class was
// already at detekt's function limit and because this is a
// different job: RoomStore serves one request at a time, and this
// runs over every room nobody has touched in a day.
//
// Activity is what D4 says it is — joining, leaving, configuring,
// selecting a deck, readying, a host action — and every one of
// those calls `touch`. A browser holding a socket open is NOT
// activity, which is why `last_activity_at` is never written by the
// heartbeat. A room with two people idling in it all night is an
// abandoned room that happens to have tabs open.

/** A room that just expired, and who was in it when it did. */
data class ExpiredRoom(
    val roomId: UUID,
    val formerMembers: List<UUID>,
)

internal class RoomExpiry(private val dataSource: DataSource) {
    /**
     * Expire every room idle longer than [lifetime].
     *
     * One transaction for the whole sweep, so a reader never sees a
     * half-expired room: either it is OPEN with its members, or it
     * is EXPIRED with none.
     *
     * The membership is read BEFORE the delete because that is the
     * only moment it exists. Afterwards there is nobody left to
     * tell, and "tell the members" is §5.125's whole point.
     */
    fun expire(lifetime: Duration): List<ExpiredRoom> =
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                val expired = expireWithin(connection, lifetime)
                connection.commit()
                expired
            } catch (e: Exception) {
                connection.rollback()
                throw e
            } finally {
                connection.autoCommit = true
            }
        }

    private fun expireWithin(
        connection: Connection,
        lifetime: Duration,
    ): List<ExpiredRoom> {
        // FOR UPDATE SKIP LOCKED: a room somebody is actively
        // mutating right now is not an abandoned room, and waiting
        // for its lock would be a sweep that blocks on live traffic.
        // Skipping it costs nothing — it is idle again in an hour,
        // or it is not idle at all.
        val roomIds =
            connection.prepareStatement(
                """
                SELECT room_id FROM room
                 WHERE status IN ('OPEN', 'READY_FOR_MATCH')
                   AND last_activity_at < now() - ?::interval
                 FOR UPDATE SKIP LOCKED
                """.trimIndent(),
            ).use { statement ->
                statement.setString(1, "${lifetime.toSeconds()} seconds")
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                }
            }

        if (roomIds.isEmpty()) return emptyList()

        return roomIds.map { roomId ->
            val members = membersOf(connection, roomId)
            invalidateSetups(connection, roomId)
            markExpired(connection, roomId)
            ExpiredRoom(roomId, members)
        }
    }

    private fun membersOf(
        connection: Connection,
        roomId: UUID,
    ): List<UUID> =
        connection.prepareStatement("SELECT user_id FROM room_member WHERE room_id = ?")
            .use { statement ->
                statement.setObject(1, roomId)
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                }
            }

    /**
     * §5.125 — an unconsumed setup does not outlive its room.
     *
     * Only READY ones: a CONSUMED setup is a match Phase 6 already
     * launched, and rewriting that record would be falsifying
     * history to tidy a table.
     */
    private fun invalidateSetups(
        connection: Connection,
        roomId: UUID,
    ) {
        connection.prepareStatement(
            "UPDATE match_setup SET status = 'INVALIDATED' " +
                "WHERE room_id = ? AND status = 'READY'",
        ).use {
            it.setObject(1, roomId)
            it.executeUpdate()
        }
    }

    private fun markExpired(
        connection: Connection,
        roomId: UUID,
    ) {
        connection.prepareStatement(
            "UPDATE room SET status = 'EXPIRED', revision = revision + 1 WHERE room_id = ?",
        ).use {
            it.setObject(1, roomId)
            it.executeUpdate()
        }
        // §5.125 — active membership ends. The room row survives as
        // an EXPIRED record until the purge below takes it.
        connection.prepareStatement("DELETE FROM room_member WHERE room_id = ?").use {
            it.setObject(1, roomId)
            it.executeUpdate()
        }
    }

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
