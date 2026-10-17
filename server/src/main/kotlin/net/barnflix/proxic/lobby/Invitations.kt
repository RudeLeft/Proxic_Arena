package net.barnflix.proxic.lobby

import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Pending invitations — PHASE_05 AMENDMENT 1.
//
// Split from LobbyHub, which holds connections. The seam is real:
// presence is plumbing that answers "who is connected", and this is
// policy that answers "who may walk into that room".
//
// This class is the reason an invitation is not just a message.
// Without a server-side record, accepting would need only a room id
// — and a room id passed from one user to another is a join code
// with extra steps, which is precisely what AMENDMENT 1 removed.
//
// In memory, because owner decision D2 limits invitations to users
// who are online. Nothing here survives a restart, and nothing
// should: after a restart there are no connections, so there is
// nobody an invitation could still be reaching.

class Invitations(private val clock: () -> Instant = Instant::now) {
    private data class Pending(
        val roomId: UUID,
        val fromUserId: UUID,
        val expiresAt: Instant,
    )

    /**
     * Keyed by who the invitation is FOR, so a user holds at most
     * one. A second invitation replaces the first: two rooms
     * shouting at once is a problem for whoever has to choose.
     */
    private val pending = ConcurrentHashMap<UUID, Pending>()

    fun offer(
        fromUserId: UUID,
        roomId: UUID,
        toUserId: UUID,
    ) {
        pending[toUserId] = Pending(roomId, fromUserId, clock().plus(LIFETIME))
    }

    /**
     * Spend an invitation, if there is a live one for this room.
     *
     * Consumed rather than merely checked: an invitation admits you
     * once. Returning false is what stops a room id from working as
     * a password.
     */
    fun consume(
        userId: UUID,
        roomId: UUID,
    ): Boolean {
        val invitation = pending[userId] ?: return false
        if (invitation.roomId != roomId) return false
        if (clock().isAfter(invitation.expiresAt)) {
            pending.remove(userId)
            return false
        }
        pending.remove(userId)
        return true
    }

    fun decline(userId: UUID) {
        pending.remove(userId)
    }

    /** A room that closed or filled is no longer inviting anybody. */
    fun forgetRoom(roomId: UUID) {
        pending.entries.removeIf { it.value.roomId == roomId }
    }

    /**
     * Forget everything to or from a user who has gone.
     *
     * D2 again: an invitation waiting for somebody who disconnected
     * is not waiting for anything, and one sent by a host who has
     * gone leads into a room that may no longer exist.
     */
    fun forgetUser(userId: UUID) {
        pending.remove(userId)
        pending.entries.removeIf { it.value.fromUserId == userId }
    }

    private companion object {
        /**
         * Long enough to notice and decide; short enough that an
         * ignored invitation cannot be accepted into a room that has
         * since filled, closed or changed.
         */
        val LIFETIME: Duration = Duration.ofMinutes(5)
    }
}
