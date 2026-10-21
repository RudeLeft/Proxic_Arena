package net.barnflix.proxic.lobby

import kotlinx.serialization.json.JsonObject
import net.barnflix.proxic.auth.User
import net.barnflix.proxic.room.Room
import net.barnflix.proxic.room.RoomResult
import net.barnflix.proxic.room.RoomService
import java.util.UUID

// Asking somebody into a room — PHASE_05 AMENDMENT 1, PHASE_07 §7.64
// and Amendment 11.
//
// Split from LobbyService when Amendment 11 gave invitations endings
// that both sides hear about: the service announces rooms and
// matches, and this is the conversation between one host and one
// player.
//
// Every ending is told to BOTH sides, the one who caused it included,
// because a player with two tabs open is one player (§5.6): the tab
// that did not click must stop showing the invitation too.

class InvitationDesk(
    private val hub: LobbyHub,
    private val rooms: RoomService,
    private val invitations: Invitations,
    /** A display name for anybody with an account, online or not. */
    private val nameOf: (UUID) -> String?,
) {
    private fun entry(userId: UUID): PresenceEntry? {
        val online = hub.entryFor(userId)
        return online ?: nameOf(userId)?.let { PresenceEntry(userId, "", it) }
    }

    /** Tell both sides that [invitation] is over, and why. */
    suspend fun end(
        invitation: Invitation,
        reason: InvitationEnd,
    ) {
        hub.sendTo(
            invitation.fromUserId,
            invitationEndedMessage(invitation, reason, "FROM_YOU", entry(invitation.toUserId)),
        )
        hub.sendTo(
            invitation.toUserId,
            invitationEndedMessage(invitation, reason, "TO_YOU", entry(invitation.fromUserId)),
        )
    }

    suspend fun endAll(
        ended: List<Invitation>,
        reason: InvitationEnd,
    ) = ended.forEach { end(it, reason) }

    /**
     * A reload must show what was already asked, both ways: the host's
     * "Invited" button and the player's Accept are state the server
     * holds, not something either page should have to remember.
     */
    suspend fun resend(userId: UUID) {
        invitations.incomingFor(userId)?.let { invitation ->
            val room = rooms.find(invitation.roomId) ?: return@let
            val from = entry(invitation.fromUserId) ?: return@let
            hub.sendTo(userId, inviteMessage(invitation.roomId, from, room.displayName()))
        }
        invitations.outgoingFrom(userId)?.let { invitation ->
            val to = entry(invitation.toUserId) ?: return@let
            hub.sendTo(userId, invitationSentMessage(to, invitation.roomId))
        }
    }

    /**
     * §5.17 — only a host invites, and only into their own room.
     *
     * The room is read from the SERVER's idea of where this user is,
     * not from the message. A client naming a room it does not host
     * would otherwise be inviting strangers into somebody else's room.
     */
    suspend fun invite(
        host: User,
        targetId: UUID,
        reply: suspend (JsonObject) -> Unit,
    ) {
        val me = host.userId
        val room = rooms.roomOf(me)
        val refusal =
            when {
                room == null || !room.isHost(me) -> "ROOM_HOST_REQUIRED" to "Open a room first."
                room.isFull() -> "ROOM_FULL" to "Your room is full."
                targetId == me -> "CANNOT_INVITE_YOURSELF" to "You are already here."
                // D2 — online only.
                hub.entryFor(targetId) == null -> "USER_NOT_ONLINE" to "That player is not signed in."
                // One room at a time (§5.5): accepting would be refused,
                // so the invitation is refused now, where it explains.
                rooms.roomOf(targetId) != null -> "PLAYER_IN_A_ROOM" to "That player is already in a room."
                else -> null
            }
        if (refusal != null) return reply(errorMessage(refusal.first, refusal.second))

        val target = hub.entryFor(targetId)!!
        when (invitations.offer(me, room!!.roomId, targetId)) {
            OfferResult.HostHasOne ->
                reply(
                    errorMessage("ONE_INVITATION_AT_A_TIME", "Withdraw your invitation before sending another."),
                )

            OfferResult.PlayerHasOne ->
                reply(
                    errorMessage(
                        "PLAYER_ALREADY_INVITED",
                        "${target.displayName} already has an invitation waiting.",
                    ),
                )

            is OfferResult.Sent -> {
                val from = PresenceEntry(me, host.username, host.displayName)
                hub.sendTo(targetId, inviteMessage(room.roomId, from, room.displayName()))
                // Every tab the host has, not only the one that clicked.
                hub.sendTo(me, invitationSentMessage(target, room.roomId))
            }
        }
    }

    /**
     * Accepting is where an invitation becomes a seat.
     *
     * The invitation is CONSUMED first: every room is listed now
     * (§7.64), so a room id is public, and without this check it
     * would be a key.
     */
    suspend fun accept(
        user: User,
        roomId: UUID,
        reply: suspend (JsonObject) -> Unit,
        roomChanged: suspend (Room) -> Unit,
    ) {
        val invitation =
            invitations.consume(user.userId, roomId)
                ?: return reply(errorMessage("INVITATION_GONE", "That invitation is no longer open."))

        when (val result = rooms.join(roomId, user.userId)) {
            is RoomResult.Refused -> {
                // Not the player's fault, and not an answer: put it
                // back, so neither side loses an invitation to a
                // refusal neither of them chose.
                invitations.offer(invitation.fromUserId, invitation.roomId, invitation.toUserId)
                reply(errorMessage(result.error))
            }

            is RoomResult.Ok -> {
                end(invitation, InvitationEnd.ACCEPTED)
                roomChanged(result.room)
            }
        }
    }

    suspend fun decline(user: User) {
        invitations.decline(user.userId)?.let { end(it, InvitationEnd.DECLINED) }
    }

    suspend fun withdraw(host: User) {
        invitations.withdraw(host.userId)?.let { end(it, InvitationEnd.WITHDRAWN) }
    }
}
