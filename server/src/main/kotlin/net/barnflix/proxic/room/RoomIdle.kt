package net.barnflix.proxic.room

import java.util.UUID
import javax.sql.DataSource

// Spec 0054 -- the database half of idle rooms: the rooms in the lobby,
// closing one, taking an away guest out, and "something happened" from
// a chat line or Keep it open. Its own class because RoomService and
// RoomStore are at detekt's function limit, and because these are the
// sweep's and the chat's doors, not a player's.

class RoomIdle(dataSource: DataSource) {
    private val store = RoomStore(dataSource)

    /** Every room waiting in the lobby, as it is now. */
    fun lobbyRooms(): List<Room> =
        store.withConnection { connection ->
            val ids =
                connection.prepareStatement(
                    "SELECT room_id FROM room WHERE status IN ('OPEN', 'READY_FOR_MATCH')",
                ).use { statement ->
                    statement.executeQuery().use { rows ->
                        buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                    }
                }
            ids.mapNotNull { store.load(connection, it) }
        }

    /**
     * Close a room in the lobby. The members it had, to be told; null
     * when it is no longer in the lobby (a game started in between).
     */
    fun close(roomId: UUID): List<UUID>? =
        store.inTransaction { connection ->
            val room = store.lockedRoom(connection, roomId) ?: return@inTransaction null
            if (room.status != RoomStatus.OPEN && room.status != RoomStatus.READY_FOR_MATCH) {
                return@inTransaction null
            }
            store.close(connection, roomId)
            room.members.map { it.userId }
        }

    /** Take an away guest out; the room as it now is, or null. */
    fun removeAway(
        roomId: UUID,
        userId: UUID,
    ): Room? =
        store.inTransaction { connection ->
            val room = store.lockedRoom(connection, roomId) ?: return@inTransaction null
            if (room.status != RoomStatus.OPEN && room.status != RoomStatus.READY_FOR_MATCH) {
                return@inTransaction null
            }
            if (room.isHost(userId) || !room.isMember(userId)) return@inTransaction null
            store.removeMember(connection, roomId, userId)
            store.clearReadiness(connection, roomId)
            store.touch(connection, roomId)
            store.load(connection, roomId)
        }

    /** Keep it open: a member says so. The room, or null when not theirs. */
    fun keepOpen(
        roomId: UUID,
        userId: UUID,
    ): Room? =
        store.inTransaction { connection ->
            val room = store.lockedRoom(connection, roomId) ?: return@inTransaction null
            if (!room.isMember(userId) || room.status == RoomStatus.IN_MATCH) return@inTransaction null
            store.touch(connection, roomId)
            store.load(connection, roomId)
        }

    /**
     * A chat line from a member of a room in the lobby counts as
     * something happening. Only the clock moves, not the revision: a
     * chat line must not make somebody's next room action stale. At most
     * once a minute per room, so a busy chat is not a write per line.
     * True when the clock moved (the room list should be sent again).
     */
    fun chatted(userId: UUID): Boolean =
        store.withConnection { connection ->
            connection.prepareStatement(
                """
                UPDATE room SET last_activity_at = now()
                 WHERE status IN ('OPEN', 'READY_FOR_MATCH')
                   AND last_activity_at < now() - interval '1 minute'
                   AND room_id IN (SELECT room_id FROM room_member WHERE user_id = ?)
                """.trimIndent(),
            ).use {
                it.setObject(1, userId)
                it.executeUpdate() > 0
            }
        }
}
