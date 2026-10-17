package net.barnflix.proxic.deck

import java.util.UUID

// Telling somebody that deck access changed — PHASE_05 §5.50, §5.51.
//
// Declared in `deck` and implemented in `room`, the same direction
// as RoomAnnouncer and Presence: the Deck Depot has no idea rooms
// exist, and it stays that way. What it knows is the two moments
// that matter — a deck is about to go, and a share just went — and
// it says so into an interface that does nothing by default.
//
// §5.51 is the rule behind both: "a share revoked a second ago is
// already false". Phase 4 made `canUseDeck` compute that on the
// asking, which covers every FUTURE question. It does not cover the
// player sitting in a lobby right now, already ready, with a deck
// they can no longer use. Somebody has to tell them, and this is
// how the Deck Depot does it without learning what a room is.

fun interface DeckAccessListener {
    /**
     * Something changed about who may use a deck.
     *
     * [deckId] is the deck. [beingDeleted] says whether the row is
     * about to disappear, which the implementation needs because
     * the two cases are handled at opposite moments: a deletion
     * must be reacted to BEFORE the row goes (afterwards the
     * selection has already been nulled by the foreign key, with
     * nobody told), and a revocation AFTER, because until it lands
     * `canUseDeck` still says yes.
     */
    suspend fun deckAccessChanged(
        deckId: UUID,
        beingDeleted: Boolean,
    )

    companion object {
        /** For wiring with no lobby: tests, and Phase 2's importer. */
        val NONE = DeckAccessListener { _, _ -> }
    }
}
