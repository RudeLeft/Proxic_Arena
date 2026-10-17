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

class RoomDeckWatch(
    dataSource: DataSource,
    private val deckAuthorization: DeckAuthorization,
) {
    private val store = RoomStore(dataSource)

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
