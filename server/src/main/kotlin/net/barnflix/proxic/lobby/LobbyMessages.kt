package net.barnflix.proxic.lobby

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import net.barnflix.proxic.BuildInfo
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

internal fun envelope(
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

/** You have been invited. The only way into a room (AMENDMENT 1). */
fun inviteMessage(
    roomId: UUID,
    from: PresenceEntry,
    roomName: String,
): JsonObject =
    envelope("INVITED") {
        put("roomId", roomId.toString())
        put("roomName", roomName)
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
fun invitationSentMessage(
    to: PresenceEntry,
    roomId: UUID,
): JsonObject =
    envelope("INVITATION_SENT") {
        put("roomId", roomId.toString())
        putJsonObject("to") {
            put("userId", to.userId.toString())
            put("displayName", to.displayName)
        }
    }
