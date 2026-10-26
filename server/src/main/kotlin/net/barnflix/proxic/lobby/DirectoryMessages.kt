package net.barnflix.proxic.lobby

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import net.barnflix.proxic.room.DirectoryHold
import net.barnflix.proxic.room.DirectoryRoom
import net.barnflix.proxic.room.Room
import java.util.UUID

// The Lobby's PHASE_07 messages — §7.64, Amendments 9 and 11.
//
// In their own file because LobbyMessages is Phase 5's vocabulary and
// these are additions to it: the room list, the list of players, and
// the endings an invitation can have. Additive only (§7.61): a client
// that ignores them still works the Phase 5 way.

private val directoryJson = Json { encodeDefaults = true }

/** Every open room, the same for everybody (§7.64: seats, never decks). */
fun roomsMessage(rooms: List<DirectoryRoom>): JsonObject =
    envelope("ROOMS") {
        put("rooms", directoryJson.encodeToJsonElement(ListSerializer(DirectoryRoom.serializer()), rooms))
    }

/** Spec 0016 R2 — who [room]'s open seat is held for, invited or asking; null when nobody. */
fun Invitations.holdIn(
    room: Room,
    nameOf: (UUID) -> String?,
): DirectoryHold? {
    val held = outgoingFrom(room.hostUserId)?.takeIf { it.roomId == room.roomId } ?: return null
    return DirectoryHold(held.toUserId.toString(), nameOf(held.toUserId) ?: "A player", held.asked)
}

/**
 * Every active account, online or not (Amendment 11: the Players list
 * shows everyone, offline greyed). Names only -- the same names the
 * Deck Depot's share list already shows (Amendment 10).
 */
fun playersMessage(players: List<PresenceEntry>): JsonObject =
    envelope("PLAYERS") {
        putJsonArray("players") {
            players.forEach { player ->
                add(
                    buildJsonObject {
                        put("userId", player.userId.toString())
                        put("username", player.username)
                        put("displayName", player.displayName)
                        // Spec 0006 — absent: the default picture.
                        player.avatar?.let { put("avatar", it) }
                        // Spec 0009 — for "last seen"; absent when no session remains.
                        player.lastSeenAt?.let { put("lastSeenAt", it) }
                    },
                )
            }
        }
    }

/**
 * An invitation (or, spec 0016, a request to join) stopped being one,
 * told to both sides. [direction] is from the reader's side: FROM_YOU
 * is one you began (an invitation you sent, a request you made), TO_YOU
 * one that came to you. [other] is the person on the other side.
 */
fun invitationEndedMessage(
    invitation: Invitation,
    reason: InvitationEnd,
    direction: String,
    otherId: UUID,
    other: PresenceEntry?,
): JsonObject =
    envelope("INVITATION_ENDED") {
        put("roomId", invitation.roomId.toString())
        put("reason", reason.name)
        put("direction", direction)
        // Spec 0016 — absent (false) for an invitation, as before.
        if (invitation.asked) put("asked", true)
        putJsonObject("other") {
            put("userId", otherId.toString())
            other?.let { put("displayName", it.displayName) }
        }
    }

/** Spec 0016 R3 — somebody asks to join your room; you, the host, answer. */
fun joinAskedMessage(
    roomId: UUID,
    from: PresenceEntry,
): JsonObject =
    envelope("JOIN_ASKED") {
        put("roomId", roomId.toString())
        putJsonObject("from") {
            put("userId", from.userId.toString())
            put("displayName", from.displayName)
        }
    }

/** Spec 0016 R3 — your request reached the host (every tab of yours hears it). */
fun joinAskSentMessage(
    roomId: UUID,
    roomName: String,
    host: PresenceEntry,
): JsonObject =
    envelope("JOIN_ASK_SENT") {
        put("roomId", roomId.toString())
        put("roomName", roomName)
        putJsonObject("host") {
            put("userId", host.userId.toString())
            put("displayName", host.displayName)
        }
    }
