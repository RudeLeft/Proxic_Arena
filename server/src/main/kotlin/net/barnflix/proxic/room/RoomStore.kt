package net.barnflix.proxic.room

import java.sql.Connection
import java.util.UUID
import javax.sql.DataSource

// Room persistence — PHASE_05 §5.118, §5.128–§5.130.
//
// Split from RoomService when detekt found that class past its
// function limit. The seam is deliberate rather than arbitrary:
// RoomService holds the RULES and this holds the SQL, so a rule can
// be read without stepping over a prepared statement.
//
// Everything here takes a Connection rather than opening one. The
// caller owns the transaction, because a rule that reads a room,
// decides, and writes must do all three inside the same one -- which
// is the entire reason two people cannot take the last seat.

internal class RoomStore(private val dataSource: DataSource) {
    fun <T> inTransaction(body: (Connection) -> T): T =
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                val result = body(connection)
                connection.commit()
                result
            } catch (e: Exception) {
                connection.rollback()
                throw e
            } finally {
                connection.autoCommit = true
            }
        }

    fun <T> withConnection(body: (Connection) -> T): T = dataSource.connection.use(body)

    /**
     * The room, locked for update.
     *
     * `FOR UPDATE` is the whole concurrency story: two people
     * joining the last seat at the same moment serialise here, so
     * the second one sees a full room rather than a free seat that
     * was free a millisecond ago.
     */
    fun lockedRoom(
        connection: Connection,
        roomId: UUID,
    ): Room? {
        connection.prepareStatement("SELECT room_id FROM room WHERE room_id = ? FOR UPDATE")
            .use { statement ->
                statement.setObject(1, roomId)
                statement.executeQuery().use { rows ->
                    if (!rows.next()) return null
                }
            }
        return load(connection, roomId)
    }

    /**
     * The room a user is in: open, or ready for a match -- and, with
     * [includeInMatch], one whose match is being played.
     *
     * §5.5's "one room at a time" and a refresh (§5.139) need the match
     * case: without it a player in a running match could host or join
     * another room, and a refreshed page was told it had none (found
     * on the live-site check, 2026-10-20). The deck-access watch leaves
     * it out on purpose: a share revoked mid-match must not touch the
     * room the match was launched from (P6-BC).
     */
    fun activeRoomOf(
        connection: Connection,
        userId: UUID,
        includeInMatch: Boolean = false,
    ): UUID? =
        connection.prepareStatement(
            """
            SELECT m.room_id FROM room_member m
              JOIN room r ON r.room_id = m.room_id
             WHERE m.user_id = ?
               AND (r.status IN ('OPEN', 'READY_FOR_MATCH') OR (? AND r.status = 'IN_MATCH'))
            """.trimIndent(),
        ).use { statement ->
            statement.setObject(1, userId)
            statement.setBoolean(2, includeInMatch)
            statement.executeQuery().use { rows ->
                if (rows.next()) rows.getObject(1, UUID::class.java) else null
            }
        }

    fun seat(
        connection: Connection,
        roomId: UUID,
        userId: UUID,
        seatNumber: Int,
    ) {
        connection.prepareStatement(
            "INSERT INTO room_member (room_id, user_id, seat_number) VALUES (?, ?, ?)",
        ).use {
            it.setObject(1, roomId)
            it.setObject(2, userId)
            it.setInt(3, seatNumber)
            it.executeUpdate()
        }
    }

    fun removeMember(
        connection: Connection,
        roomId: UUID,
        userId: UUID,
    ) {
        connection.prepareStatement(
            "DELETE FROM room_member WHERE room_id = ? AND user_id = ?",
        ).use {
            it.setObject(1, roomId)
            it.setObject(2, userId)
            it.executeUpdate()
        }
    }

    fun close(
        connection: Connection,
        roomId: UUID,
    ) {
        connection.prepareStatement(
            "UPDATE room SET status = 'CLOSED', revision = revision + 1, " +
                "last_activity_at = now() WHERE room_id = ?",
        ).use {
            it.setObject(1, roomId)
            it.executeUpdate()
        }
        // §5.79 — an unconsumed setup does not survive its room.
        // Found while wiring match setup: without this a closed
        // room left a READY snapshot behind, and Phase 6 would
        // happily launch a match for a room nobody is in.
        invalidateReadySetups(connection, roomId)

        // §5.18 — everyone is removed from the active room. The room
        // row survives as a CLOSED record until the sweep.
        connection.prepareStatement("DELETE FROM room_member WHERE room_id = ?").use {
            it.setObject(1, roomId)
            it.executeUpdate()
        }
    }

    fun clearReadiness(
        connection: Connection,
        roomId: UUID,
    ) {
        connection.prepareStatement(
            "UPDATE room_member SET ready = FALSE WHERE room_id = ?",
        ).use {
            it.setObject(1, roomId)
            it.executeUpdate()
        }
    }

    /**
     * §5.124 — record activity and bump the revision.
     *
     * One statement for both, because a mutation that moved the room
     * without moving its revision is how a stale client's write gets
     * accepted.
     */
    fun touch(
        connection: Connection,
        roomId: UUID,
    ) {
        connection.prepareStatement(
            "UPDATE room SET revision = revision + 1, last_activity_at = now() WHERE room_id = ?",
        ).use {
            it.setObject(1, roomId)
            it.executeUpdate()
        }
    }

    fun load(
        connection: Connection,
        roomId: UUID,
    ): Room? {
        val room =
            connection.prepareStatement(
                """
                SELECT host_user_id, preset_id, desired_player_count, status, revision,
                       name, last_activity_at
                  FROM room WHERE room_id = ?
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, roomId)
                statement.executeQuery().use { rows ->
                    if (!rows.next()) {
                        null
                    } else {
                        Room(
                            roomId = roomId,
                            hostUserId = rows.getObject(1, UUID::class.java),
                            presetId = rows.getString(2),
                            desiredPlayerCount = rows.getInt(3),
                            status = RoomStatus.valueOf(rows.getString(4)),
                            revision = rows.getLong(5),
                            members = emptyList(),
                            name = rows.getString(6),
                            lastActivityAt = rows.getTimestamp(7).toInstant(),
                        )
                    }
                }
            } ?: return null

        val members =
            connection.prepareStatement(
                """
                SELECT m.user_id, u.username, u.display_name, m.seat_number,
                       m.selected_deck_id, d.display_name, m.ready
                  FROM room_member m
                  JOIN app_user u ON u.user_id = m.user_id
                  LEFT JOIN imported_deck d ON d.deck_id = m.selected_deck_id
                 WHERE m.room_id = ?
                 ORDER BY m.seat_number
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, roomId)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            val userId = rows.getObject(1, UUID::class.java)
                            add(
                                RoomMember(
                                    userId = userId,
                                    username = rows.getString(2),
                                    displayName = rows.getString(3),
                                    seatNumber = rows.getInt(4),
                                    selectedDeckId = rows.getObject(5, UUID::class.java),
                                    selectedDeckName = rows.getString(6),
                                    ready = rows.getBoolean(7),
                                    isHost = userId == room.hostUserId,
                                ),
                            )
                        }
                    }
                }
            }

        return room.copy(members = members)
    }
}
