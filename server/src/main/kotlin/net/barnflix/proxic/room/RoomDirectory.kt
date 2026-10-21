package net.barnflix.proxic.room

import kotlinx.serialization.Serializable
import java.time.Duration

// The room list everybody sees — PHASE_07 §7.64 and Amendment 9.
//
// Phase 5 had no directory of rooms on purpose: a room id was as good
// as a join code until AMENDMENT 1 made an invitation the only door.
// With that door in place, §7.64 lets every signed-in player see every
// room -- its name, its seats and who sits in them -- because seeing a
// room no longer lets you into it. Taking a seat still needs an
// invitation, and the server's consumed-invitation check is what says
// so, not this list.
//
// ONE shape for every viewer, which is only safe because of what it
// leaves out: no deck, not even whether one is chosen (§7.68: "the
// room list shows seats, never decks"), and nothing about who has
// been invited (that is between the host and the person asked).
// Readiness IS here: it is on Phase 5's safe list (§5.141), and the
// canvas's seat dots carry it so a stalled table explains itself.

/** Optional room names — PHASE_07 Amendment 9. */
object RoomNames {
    const val MAX_LENGTH = 40

    /**
     * A name the host typed, cleaned; null for "no name" (blank).
     * Throws nothing: [valid] says whether a non-blank name can be one.
     */
    fun typed(raw: String?): String? = raw?.trim()?.takeIf { it.isNotEmpty() }

    /** One line, 1 to [MAX_LENGTH] characters, once trimmed. */
    fun valid(name: String): Boolean = name.length <= MAX_LENGTH && name.none { it.isISOControl() }
}

@Serializable
data class DirectorySeat(
    val seatNumber: Int,
    val userId: String,
    val displayName: String,
    val ready: Boolean,
    val isHost: Boolean,
)

@Serializable
data class DirectoryRoom(
    val roomId: String,
    val name: String,
    val hostUserId: String,
    /** OPEN, READY_FOR_MATCH (starting) or IN_MATCH. */
    val status: String,
    val desiredPlayerCount: Int,
    val seats: List<DirectorySeat>,
    /**
     * When the room clears if nobody does anything (owner decision
     * D4: 24 hours of inactivity). Null while a match is on: a room
     * in a match is not swept.
     */
    val clearsAt: String? = null,
)

/**
 * Every room that is open, starting or in a match, oldest first.
 * Its own class rather than one more RoomService function: reading
 * the whole list is the directory's job, not a person's action.
 */
class RoomList internal constructor(private val store: RoomStore) {
    fun active(): List<Room> =
        store.withConnection { connection ->
            val ids =
                connection.prepareStatement(
                    "SELECT room_id FROM room WHERE status IN ('OPEN', 'READY_FOR_MATCH', 'IN_MATCH') " +
                        "ORDER BY created_at",
                ).use { statement ->
                    statement.executeQuery().use { rows ->
                        buildList { while (rows.next()) add(rows.getObject(1, java.util.UUID::class.java)) }
                    }
                }
            ids.mapNotNull { store.load(connection, it) }
        }
}

/** The lifetime the maintenance sweep applies, said once for the list too. */
val ROOM_LIFETIME: Duration = Duration.ofHours(24)

fun Room.directoryEntry(): DirectoryRoom =
    DirectoryRoom(
        roomId = roomId.toString(),
        name = displayName(),
        hostUserId = hostUserId.toString(),
        status = status.name,
        desiredPlayerCount = desiredPlayerCount,
        seats =
            members.map {
                DirectorySeat(
                    seatNumber = it.seatNumber,
                    userId = it.userId.toString(),
                    displayName = it.displayName,
                    ready = it.ready,
                    isHost = it.isHost,
                )
            },
        clearsAt = lastActivityAt.plus(ROOM_LIFETIME).toString().takeIf { status != RoomStatus.IN_MATCH },
    )
