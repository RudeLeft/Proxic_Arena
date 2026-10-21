package net.barnflix.proxic.room

import net.barnflix.proxic.deck.DeckAuthorization
import java.util.UUID
import javax.sql.DataSource

// Reacting to deck access changing underneath a room.
// PHASE_05 §5.50, §5.51.
//
// Its own class rather than another method on RoomService, and not
// only because detekt counted. Everything in RoomService is
// something a PERSON did in a room: joining, choosing, readying.
// This is the room reacting to something that happened elsewhere --
// a share revoked in the Deck Depot, a deck deleted, an account
// disabled. Different trigger, different caller, different test.
//
// THE §5.228 AUDIT FOUND THIS CLASS CALLED BY NOTHING. It existed,
// it was tested, and no production path invoked it -- the same
// finding the Phase 3 gate made about `purgeExpiredSessions`, in
// the same shape. A rule that only a unit test exercises is not a
// rule the server enforces, and §5.51 says a revoked share must
// invalidate the selection it was holding up.

class RoomDeckWatch(
    dataSource: DataSource,
    private val deckAuthorization: DeckAuthorization,
) {
    private val store = RoomStore(dataSource)

    /**
     * §5.51 — re-check one USER's room after their access changed.
     *
     * The shape a share revocation has: the Deck Depot knows whose
     * access just went away, not which room they are sitting in.
     */
    fun revalidateUser(userId: UUID): Room? {
        val roomId =
            store.withConnection { connection -> store.activeRoomOf(connection, userId) }
                ?: return null
        return revalidate(roomId)
    }

    /**
     * §5.50, §5.77 — a deck is about to be deleted.
     *
     * Called BEFORE the delete, and clears by DECK ID rather than by
     * asking `canUseDeck`. That distinction is the whole method:
     * until the row is gone the deck is still perfectly usable, so a
     * revalidation run beforehand would find nothing wrong, and one
     * run afterwards would find the selection already nulled by the
     * foreign key — with nobody told.
     *
     * Returns the rooms that changed, so the caller can tell them.
     */
    fun releaseDeck(deckId: UUID): List<Room> =
        store.inTransaction { connection ->
            val roomIds =
                connection.prepareStatement(
                    """
                    SELECT DISTINCT m.room_id
                      FROM room_member m
                      JOIN room r ON r.room_id = m.room_id
                     WHERE m.selected_deck_id = ?
                       AND r.status IN ('OPEN', 'READY_FOR_MATCH')
                    """.trimIndent(),
                ).use { statement ->
                    statement.setObject(1, deckId)
                    statement.executeQuery().use { rows ->
                        buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                    }
                }

            roomIds.mapNotNull { roomId ->
                connection.prepareStatement(
                    "UPDATE room_member SET ready = FALSE, selected_deck_id = NULL " +
                        "WHERE room_id = ? AND selected_deck_id = ?",
                ).use {
                    it.setObject(1, roomId)
                    it.setObject(2, deckId)
                    it.executeUpdate()
                }
                store.touch(connection, roomId)
                store.load(connection, roomId)
            }
        }

    /** PHASE_07 §7.65 — the active rooms where somebody has this deck selected, unchanged. */
    fun roomsHolding(deckId: UUID): List<Room> =
        store.withConnection { connection ->
            val roomIds =
                connection.prepareStatement(
                    """
                    SELECT DISTINCT m.room_id
                      FROM room_member m
                      JOIN room r ON r.room_id = m.room_id
                     WHERE m.selected_deck_id = ?
                       AND r.status IN ('OPEN', 'READY_FOR_MATCH')
                    """.trimIndent(),
                ).use { statement ->
                    statement.setObject(1, deckId)
                    statement.executeQuery().use { rows ->
                        buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                    }
                }
            roomIds.mapNotNull { store.load(connection, it) }
        }

    /**
     * §5.50, §5.51 — re-check every selection in a room.
     *
     * Called when something outside the room changes deck access: a
     * share revoked, a deck deleted, an account disabled. A member
     * whose deck is no longer usable loses the selection and the
     * readiness, which is the rule stated rather than hoped for.
     *
     * Returns the room if anything changed, so a caller knows
     * whether to tell the room about it.
     */
    fun revalidate(roomId: UUID): Room? =
        store.inTransaction { connection ->
            val room = store.lockedRoom(connection, roomId) ?: return@inTransaction null
            var changed = false

            for (member in room.members) {
                val deckId = member.selectedDeckId ?: continue
                if (deckAuthorization.canUseDeck(member.userId, deckId)) continue

                connection.prepareStatement(
                    "UPDATE room_member SET selected_deck_id = NULL, ready = FALSE " +
                        "WHERE room_id = ? AND user_id = ?",
                ).use {
                    it.setObject(1, roomId)
                    it.setObject(2, member.userId)
                    it.executeUpdate()
                }
                changed = true
            }

            if (!changed) {
                null
            } else {
                store.touch(connection, roomId)
                store.load(connection, roomId)
            }
        }
}
