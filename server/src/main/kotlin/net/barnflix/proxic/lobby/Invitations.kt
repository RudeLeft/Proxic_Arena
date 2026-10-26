package net.barnflix.proxic.lobby

import java.util.UUID

// Pending invitations — PHASE_05 AMENDMENT 1, PHASE_07 §7.64 and
// Amendment 11.
//
// Split from LobbyHub, which holds connections. The seam is real:
// presence is plumbing that answers "who is connected", and this is
// policy that answers "who may walk into that room".
//
// This class is the reason an invitation is not just a message.
// Without a server-side record, accepting would need only a room id
// — and now that every room is listed (§7.64), a room id is public,
// so the record is the ONLY thing standing between a list and a seat.
//
// Amendment 11 (owner decisions 2026-10-21) changed its shape:
//
// - ONE AT A TIME, both ways. A host has at most one invitation out,
//   and a player holds at most one: two rooms asking at once is a
//   choice nobody wanted to make, and chat sorts out the rest.
// - NO TIMER. It lasts until it is accepted, declined or withdrawn,
//   the seat fills, the room closes, or one of the two has been gone
//   long enough to count as signed out. Nothing ends behind anybody's
//   back, so every ending has a reason the other side is told.
//
// In memory, because owner decision D2 limits invitations to users
// who are online: after a restart there are no connections, so there
// is nobody an invitation could still be reaching.

/** Why an invitation stopped being one; the other side is told which. */
enum class InvitationEnd {
    ACCEPTED,
    DECLINED,
    WITHDRAWN,
    ROOM_CLOSED,
    SEAT_FILLED,

    /** One of the two has been gone long enough to count as signed out. */
    OFFLINE,
}

/**
 * One held seat. [fromUserId] is always the host and [toUserId] the
 * player; [asked] says who began it. Spec 0016 R3: a player asking to
 * join is the same record the other way round, so "one at a time, both
 * ways" and every ending hold for requests exactly as for invitations.
 */
data class Invitation(
    val roomId: UUID,
    val fromUserId: UUID,
    val toUserId: UUID,
    /** Spec 0016 — the player asked (Ask to join); the host answers. */
    val asked: Boolean = false,
)

/** What [Invitations.offer] decided. */
sealed interface OfferResult {
    data class Sent(val invitation: Invitation) : OfferResult

    /** The host already has one out (one at a time). */
    data object HostHasOne : OfferResult

    /** The player already holds one, from somebody else. */
    data object PlayerHasOne : OfferResult
}

class Invitations {
    // Guarded by `this`: an offer checks both directions and must not
    // interleave with another offer doing the same.
    private val byRecipient = HashMap<UUID, Invitation>()

    @Synchronized
    fun offer(
        fromUserId: UUID,
        roomId: UUID,
        toUserId: UUID,
        asked: Boolean = false,
    ): OfferResult {
        if (byRecipient.values.any { it.fromUserId == fromUserId }) return OfferResult.HostHasOne
        if (byRecipient.containsKey(toUserId)) return OfferResult.PlayerHasOne
        val invitation = Invitation(roomId, fromUserId, toUserId, asked)
        byRecipient[toUserId] = invitation
        return OfferResult.Sent(invitation)
    }

    /**
     * Spend an invitation, if there is one for this room.
     *
     * Consumed rather than merely checked: an invitation admits you
     * once. Null is what stops a listed room id from working as a
     * key.
     *
     * [asked] must match: a player cannot accept their own request
     * (spec 0016) -- only the host answers one, and an invitation is
     * only the player's to accept.
     */
    @Synchronized
    fun consume(
        userId: UUID,
        roomId: UUID,
        asked: Boolean = false,
    ): Invitation? {
        val invitation = byRecipient[userId] ?: return null
        if (invitation.roomId != roomId || invitation.asked != asked) return null
        byRecipient.remove(userId)
        return invitation
    }

    /** The player ends theirs: declines an invitation, or takes back a request ([asked]). */
    @Synchronized
    fun decline(
        userId: UUID,
        asked: Boolean = false,
    ): Invitation? = byRecipient[userId]?.takeIf { it.asked == asked }?.also { byRecipient.remove(userId) }

    /** The host ends theirs: takes back an invitation, or declines a request ([asked]). */
    @Synchronized
    fun withdraw(
        fromUserId: UUID,
        asked: Boolean = false,
    ): Invitation? {
        val invitation =
            byRecipient.values.firstOrNull { it.fromUserId == fromUserId && it.asked == asked } ?: return null
        byRecipient.remove(invitation.toUserId)
        return invitation
    }

    /** A room that closed or filled is no longer inviting anybody. */
    @Synchronized
    fun forgetRoom(roomId: UUID): List<Invitation> = removeWhere { it.roomId == roomId }

    /** Everything to or from a user who has gone. */
    @Synchronized
    fun forgetUser(userId: UUID): List<Invitation> = removeWhere { it.toUserId == userId || it.fromUserId == userId }

    /** What this player has been asked, so a reload shows it again. */
    @Synchronized
    fun incomingFor(userId: UUID): Invitation? = byRecipient[userId]

    /** What this host has out, so a reload shows it again. */
    @Synchronized
    fun outgoingFrom(userId: UUID): Invitation? = byRecipient.values.firstOrNull { it.fromUserId == userId }

    private fun removeWhere(predicate: (Invitation) -> Boolean): List<Invitation> {
        val gone = byRecipient.values.filter(predicate)
        gone.forEach { byRecipient.remove(it.toUserId) }
        return gone
    }
}
