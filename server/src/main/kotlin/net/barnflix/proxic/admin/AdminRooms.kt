package net.barnflix.proxic.admin

import kotlinx.serialization.Serializable
import net.barnflix.proxic.match.MatchControl
import net.barnflix.proxic.match.MatchStore
import net.barnflix.proxic.room.DirectoryRoom
import net.barnflix.proxic.room.RoomAnnouncer
import net.barnflix.proxic.room.RoomService
import net.barnflix.proxic.room.RoomStatus
import net.barnflix.proxic.room.directoryEntry
import java.util.UUID

// Rooms, as an administrator sees them — PHASE_07 §7.67.
//
// The same list everybody sees (§7.64), plus when somebody last did
// anything in each, and one action: FORCE CLOSE. A room with a match
// running has the match ended first, with NO WINNER, exactly as
// Abandon ends one (§6.162, §6.153): an administrator ending a game is
// not anybody conceding. Both players are then told the room closed
// and that an administrator closed it.

@Serializable
data class AdminRoomView(
    val room: DirectoryRoom,
    val lastActivityAt: String,
)

@Serializable
data class AdminRoomsResponse(val rooms: List<AdminRoomView>)

@Serializable
data class ServerStateView(
    val version: String,
    val database: String,
    val forgeWorker: String,
    val gamesRunning: Int,
    val uptimeSeconds: Long,
)

/** What a force close came to. */
data class ClosedRoom(val name: String, val matchEnded: Boolean)

class AdminRooms(
    private val rooms: RoomService,
    private val matches: MatchStore,
    private val control: MatchControl,
    private val announcer: RoomAnnouncer,
) {
    fun list(): List<AdminRoomView> =
        rooms.list.active().map { room ->
            AdminRoomView(room.directoryEntry(), room.lastActivityAt.toString())
        }

    /** Null when there is no such open room. */
    suspend fun forceClose(roomId: UUID): ClosedRoom? {
        val room = rooms.find(roomId) ?: return null
        if (room.status == RoomStatus.CLOSED || room.status == RoomStatus.EXPIRED) return null

        var matchEnded = false
        if (room.status == RoomStatus.IN_MATCH) {
            val match =
                room.members.firstNotNullOfOrNull { matches.activeMatchOf(it.userId) }
                    ?.takeIf { it.roomId == roomId }
            if (match != null) {
                // Stops the worker, records TERMINATED (no winner) and
                // gives the room back OPEN, telling both players.
                control.abandon(match)
                matchEnded = true
            }
        }

        val before = room.members.map { it.userId }
        if (!rooms.admin.forceClose(roomId)) return null
        announcer.roomClosed(roomId, before, "CLOSED_BY_ADMIN")
        return ClosedRoom(room.displayName(), matchEnded)
    }
}
