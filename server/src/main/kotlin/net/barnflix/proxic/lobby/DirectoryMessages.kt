package net.barnflix.proxic.lobby

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import net.barnflix.proxic.room.DirectoryRoom
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
                    },
                )
            }
        }
    }

/**
 * An invitation stopped being one, told to whichever side did not end
 * it. [direction] is from the reader's side: FROM_YOU is one you sent,
 * TO_YOU one you were sent.
 */
fun invitationEndedMessage(
    invitation: Invitation,
    reason: InvitationEnd,
    direction: String,
    other: PresenceEntry?,
): JsonObject =
    envelope("INVITATION_ENDED") {
        put("roomId", invitation.roomId.toString())
        put("reason", reason.name)
        put("direction", direction)
        putJsonObject("other") {
            put("userId", (other?.userId ?: otherOf(invitation, direction)).toString())
            other?.let { put("displayName", it.displayName) }
        }
    }

private fun otherOf(
    invitation: Invitation,
    direction: String,
): UUID = if (direction == "FROM_YOU") invitation.toUserId else invitation.fromUserId
