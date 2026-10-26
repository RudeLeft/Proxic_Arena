package net.barnflix.proxic.lobby

import kotlinx.serialization.json.JsonObject
import net.barnflix.proxic.auth.User
import net.barnflix.proxic.room.Room
import net.barnflix.proxic.room.RoomResult
import net.barnflix.proxic.room.RoomService
import net.barnflix.proxic.room.RoomStatus
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
//
// Spec 0016 (owner R3, 2026-10-26) added Ask to join: the same record
// begun by the player, answered by the host. The rules are the
// invitation's, mirrored, and so is the seating step.

class InvitationDesk(
    private val hub: LobbyHub,
    private val rooms: RoomService,
    private val invitations: Invitations,
    /** A display name for anybody with an account, online or not. */
    private val nameOf: (UUID) -> String?,
    /** Spec 0016 R2 — a held seat started or ended: the room list says so. */
    private val changed: suspend () -> Unit = {},
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
        // The side that began it: the host for an invitation, the player for a request.
        val began = if (invitation.asked) invitation.toUserId else invitation.fromUserId
        val other = if (invitation.asked) invitation.fromUserId else invitation.toUserId
        hub.sendTo(began, invitationEndedMessage(invitation, reason, "FROM_YOU", other, entry(other)))
        hub.sendTo(other, invitationEndedMessage(invitation, reason, "TO_YOU", began, entry(began)))
        changed()
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
            val host = entry(invitation.fromUserId) ?: return@let
            val message =
                if (invitation.asked) {
                    joinAskSentMessage(invitation.roomId, room.displayName(), host)
                } else {
                    inviteMessage(invitation.roomId, host, room.displayName())
                }
            hub.sendTo(userId, message)
        }
        invitations.outgoingFrom(userId)?.let { invitation ->
            val player = entry(invitation.toUserId) ?: return@let
            val message =
                if (invitation.asked) {
                    joinAskedMessage(invitation.roomId, player)
                } else {
                    invitationSentMessage(player, invitation.roomId)
                }
            hub.sendTo(userId, message)
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
                    if (invitations.outgoingFrom(me)?.asked == true) {
                        errorMessage("ONE_INVITATION_AT_A_TIME", "Answer the request to join first.")
                    } else {
                        errorMessage("ONE_INVITATION_AT_A_TIME", "Withdraw your invitation before sending another.")
                    },
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
                changed()
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
        seat(invitation, reply, roomChanged)
    }

    /**
     * Spec 0016 R3 — a player asks for a room's open seat. Only into an
     * open room with a seat and nobody held, only by somebody in no
     * room, and only while the host is here to answer.
     */
    suspend fun ask(
        player: User,
        roomId: UUID,
        reply: suspend (JsonObject) -> Unit,
    ) {
        val me = player.userId
        val room = rooms.find(roomId)
        val refusal =
            when {
                room == null || room.status != RoomStatus.OPEN -> "ROOM_NOT_OPEN" to "That room is not taking players."
                room.isFull() -> "ROOM_FULL" to "That room is full."
                rooms.roomOf(me) != null -> "PLAYER_IN_A_ROOM" to "Leave your room first."
                !hub.isOnline(room.hostUserId) -> "USER_NOT_ONLINE" to "The host is not signed in."
                else -> null
            }
        if (refusal != null) return reply(errorMessage(refusal.first, refusal.second))

        when (invitations.offer(room!!.hostUserId, roomId, me, asked = true)) {
            OfferResult.HostHasOne -> reply(errorMessage("SEAT_HELD", "That seat is already held for somebody."))
            OfferResult.PlayerHasOne ->
                reply(errorMessage("ONE_AT_A_TIME", "You already have an invitation or a request waiting."))
            is OfferResult.Sent -> {
                val host = entry(room.hostUserId) ?: return
                val asker = PresenceEntry(me, player.username, player.displayName)
                hub.sendTo(host.userId, joinAskedMessage(roomId, asker))
                // Every tab the player has, not only the one that clicked.
                hub.sendTo(me, joinAskSentMessage(roomId, room.displayName(), host))
                changed()
            }
        }
    }

    /** Spec 0016 R3 — the host says yes to the request: it becomes a seat, as an accepted invitation does. */
    suspend fun admit(
        host: User,
        reply: suspend (JsonObject) -> Unit,
        roomChanged: suspend (Room) -> Unit,
    ) {
        val held = invitations.outgoingFrom(host.userId)?.takeIf { it.asked }
        val request =
            held?.let { invitations.consume(it.toUserId, it.roomId, asked = true) }
                ?: return reply(errorMessage("INVITATION_GONE", "That request is no longer open."))
        seat(request, reply, roomChanged)
    }

    /**
     * Somebody ends a held seat without taking it. [asHost] is who is
     * acting, [asked] which kind they mean. The side that began it
     * taking it back is WITHDRAWN; the other side saying no is DECLINED
     * -- the host declining a request, the player an invitation.
     */
    suspend fun drop(
        user: User,
        asHost: Boolean,
        asked: Boolean,
    ) {
        val ended =
            if (asHost) invitations.withdraw(user.userId, asked) else invitations.decline(user.userId, asked)
        ended?.let { end(it, if (asHost != asked) InvitationEnd.WITHDRAWN else InvitationEnd.DECLINED) }
    }

    /** A consumed invitation or request becomes the player's seat. */
    private suspend fun seat(
        held: Invitation,
        reply: suspend (JsonObject) -> Unit,
        roomChanged: suspend (Room) -> Unit,
    ) {
        when (val result = rooms.join(held.roomId, held.toUserId)) {
            is RoomResult.Refused -> {
                // Not anybody's answer: put it back, so neither side loses
                // it to a refusal neither of them chose. If it cannot go
                // back -- the host sent another meanwhile, or somebody
                // else invited the player -- both sides are told it ended,
                // rather than it vanishing (2026-10-24 review).
                val back = invitations.offer(held.fromUserId, held.roomId, held.toUserId, held.asked)
                if (back !is OfferResult.Sent) end(held, InvitationEnd.WITHDRAWN)
                reply(errorMessage(result.error))
            }

            is RoomResult.Ok -> {
                end(held, InvitationEnd.ACCEPTED)
                roomChanged(result.room)
            }
        }
    }
}
