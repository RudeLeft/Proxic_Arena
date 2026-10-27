package net.barnflix.proxic.lobby

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import net.barnflix.proxic.room.Room
import net.barnflix.proxic.room.RoomView
import net.barnflix.proxic.room.viewFor
import java.util.UUID

// What the socket says about a ROOM — PHASE_05 §5.76, §5.79, §5.81.
//
// Split from LobbyMessages, which speaks about the lobby: who is
// here, who invited whom, who said what. These three are about one
// room and its membership, and detekt was right that one file was
// carrying both vocabularies.

/**
 * Serializing the room view. `encodeDefaults` matches the socket's
 * own serializer for the reason PHASE_01 found the hard way: the
 * default Json drops a property that equals its default, and a
 * client parser is entitled to insist the field is there.
 */
private val viewJson = Json { encodeDefaults = true }

/**
 * The room, as the server holds it.
 *
 * Sent to every member on every change, carrying the revision so a
 * client can tell a stale view from a current one.
 *
 * The SAME [RoomView] the HTTP routes return, deliberately. A lobby
 * learns the room two ways — it asks after a refresh (§5.139) and it
 * is told when something changes (§5.76) — and two hand-built copies
 * of one shape disagree eventually, in a way that surfaces as a
 * client bug long after the cause.
 *
 * Built PER RECIPIENT, which is why this takes a viewer. §5.47 says
 * another participant does not need your deck's display name, and
 * §5.140 forbids one overbroad payload when deck information
 * differs by viewer. The table learns that a seat has chosen; what
 * it chose is the chooser's business.
 */
fun roomMessage(
    room: Room,
    viewerId: UUID,
): JsonObject =
    envelope("ROOM") {
        put("room", viewJson.encodeToJsonElement(RoomView.serializer(), room.viewFor(viewerId)))
    }

/** Spec 0019 — the host's Start is checking both decks (or stopped checking). */
fun roomCheckingMessage(
    roomId: UUID,
    checking: Boolean,
): JsonObject =
    envelope("ROOM_CHECKING") {
        put("roomId", roomId.toString())
        put("checking", checking)
    }

/**
 * You are out of that room, and it carries on without you (§5.81).
 *
 * Distinct from ROOM_CLOSED: the room is fine, you are not in it.
 * Telling a removed client "closed" would be a lie it could
 * disprove by being invited back a moment later.
 */
fun removedFromRoomMessage(
    roomId: UUID,
    reason: String,
): JsonObject =
    envelope("ROOM_REMOVED") {
        put("roomId", roomId.toString())
        put("reason", reason)
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

/**
 * Your deck, your problem — §5.100.
 *
 * Addressed to one player. The detail is written for them and is
 * never broadcast: §5.101 says the rest of the table needs to know
 * that somebody requires attention and nothing more.
 */
fun setupProblemMessage(
    roomId: UUID,
    code: String,
    detail: String,
): JsonObject =
    envelope("SETUP_PROBLEM") {
        put("roomId", roomId.toString())
        put("errorCode", code)
        put("detail", detail)
    }

/**
 * Your match moved — PHASE_06 §6.17.
 *
 * Built per recipient, like ROOM: a participant sees their own
 * deck by name and everybody else's as a fact (§5.47). A match is
 * not a reason to relax that — it is the moment somebody would
 * most like to know what they are facing.
 */
fun matchMessage(
    matchId: String,
    status: String,
    failureCode: String?,
    seats: List<Triple<String, Int, String?>>,
    outcome: net.barnflix.proxic.match.GameOutcome? = null,
): JsonObject =
    envelope("MATCH") {
        put("matchId", matchId)
        put("status", status)
        failureCode?.let { put("failureCode", it) }
        // §6.149 — FORGE's result, by seat. The browser turns a
        // seat into a name using the participant list it already
        // has; the server does not send "Pat won", because a
        // display name is not an identity.
        outcome?.let {
            put("outcome", it.kind)
            it.winningSeat?.let { seat -> put("winningSeat", seat) }
            put("endedOnTurn", it.turn)
            it.reason?.let { reason -> put("reason", reason) }
            // §7.55 — who conceded, by seat, as Forge recorded it.
            it.concededSeat?.let { seat -> put("concededSeat", seat) }
        }
        putJsonArray("participants") {
            seats.forEach { (userId, seat, deckName) ->
                add(
                    buildJsonObject {
                        put("userId", userId)
                        put("seatNumber", seat)
                        put("deckName", deckName)
                    },
                )
            }
        }
    }
