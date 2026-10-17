package net.barnflix.proxic.lobby

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import net.barnflix.proxic.BuildInfo
import net.barnflix.proxic.room.Room
import net.barnflix.proxic.room.RoomError
import java.util.UUID

// What the lobby socket says — PHASE_05 §5.66–§5.70.
//
// Built as JSON objects rather than serialized classes because the
// socket already speaks in envelopes (protocolVersion, type,
// messageId) and the Phase 1 foundation established that shape.
//
// Everything here is SERVER to client. The client's vocabulary is
// small and handled in the socket itself: PING, INVITE,
// INVITE_ACCEPT, INVITE_DECLINE, CHAT.
//
// Nothing in a message tells the client what it may DO. §5.67 is
// explicit that identity is never a client claim, and the inverse
// holds too: a client learning it is the host is being told what to
// render, not what it is allowed to ask for. Every rule is
// re-checked server-side when it asks.

private fun envelope(
    type: String,
    body: JsonObjectBuilder.() -> Unit = {},
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", type)
        put("messageId", UUID.randomUUID().toString())
        body()
    }

/** The full list, sent on connect (§5.x). */
fun presenceMessage(entries: List<PresenceEntry>): JsonObject =
    envelope("PRESENCE") {
        putJsonArray("users") {
            entries.forEach { entry ->
                add(
                    buildJsonObject {
                        put("userId", entry.userId.toString())
                        put("username", entry.username)
                        put("displayName", entry.displayName)
                    },
                )
            }
        }
    }

/**
 * One person arrived or left.
 *
 * Sent only when a user's FIRST connection opens or LAST one closes
 * (§5.6): opening a second tab is not an arrival.
 */
fun presenceChange(
    entry: PresenceEntry,
    online: Boolean,
): JsonObject =
    envelope(if (online) "PRESENCE_JOINED" else "PRESENCE_LEFT") {
        put("userId", entry.userId.toString())
        put("username", entry.username)
        put("displayName", entry.displayName)
    }

/**
 * The room, as the server holds it.
 *
 * Sent to every member on every change, carrying the revision so a
 * client can tell a stale view from a current one.
 *
 * Deck NAMES travel; deck contents do not (§5.x). Another member
 * needs to know you have chosen something and what it is called,
 * never what is in it.
 */
fun roomMessage(room: Room): JsonObject =
    envelope("ROOM") {
        putJsonObject("room") {
            put("roomId", room.roomId.toString())
            put("hostUserId", room.hostUserId.toString())
            put("presetId", room.presetId)
            put("desiredPlayerCount", room.desiredPlayerCount)
            put("status", room.status.name)
            put("revision", room.revision)
            put("everyoneReady", room.everyoneReady())
            putJsonArray("members") {
                room.members.forEach { member ->
                    add(
                        buildJsonObject {
                            put("userId", member.userId.toString())
                            put("username", member.username)
                            put("displayName", member.displayName)
                            put("seatNumber", member.seatNumber)
                            put("ready", member.ready)
                            put("isHost", member.isHost)
                            put("selectedDeckId", member.selectedDeckId?.toString())
                            put("selectedDeckName", member.selectedDeckName)
                        },
                    )
                }
            }
        }
    }

/** The room you were in is gone (§5.18 host departure, or expiry). */
fun roomClosedMessage(
    roomId: UUID,
    reason: String,
): JsonObject =
    envelope("ROOM_CLOSED") {
        put("roomId", roomId.toString())
        put("reason", reason)
    }

/** You have been invited. The only way into a room (AMENDMENT 1). */
fun inviteMessage(
    roomId: UUID,
    from: PresenceEntry,
): JsonObject =
    envelope("INVITED") {
        put("roomId", roomId.toString())
        putJsonObject("from") {
            put("userId", from.userId.toString())
            put("username", from.username)
            put("displayName", from.displayName)
        }
    }

/** A chat line (AMENDMENT 3). Ephemeral: nothing stores this. */
fun chatMessage(
    from: PresenceEntry,
    text: String,
    sentAt: String,
): JsonObject =
    envelope("CHAT") {
        putJsonObject("from") {
            put("userId", from.userId.toString())
            put("displayName", from.displayName)
        }
        put("text", text)
        put("sentAt", sentAt)
    }

/**
 * Something was refused.
 *
 * Same shape as the HTTP error model (§4.101), so the client has one
 * way of showing a refusal regardless of which door it came through.
 */
fun errorMessage(
    code: String,
    detail: String,
): JsonObject =
    envelope("ERROR") {
        put("errorCode", code)
        put("detail", detail)
    }

fun errorMessage(error: RoomError): JsonObject = errorMessage(error.code, error.detail)

/** The inviter's confirmation that it reached somebody. */
fun invitationSentMessage(to: PresenceEntry): JsonObject =
    envelope("INVITATION_SENT") {
        putJsonObject("to") {
            put("userId", to.userId.toString())
            put("displayName", to.displayName)
        }
    }
