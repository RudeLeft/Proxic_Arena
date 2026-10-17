package net.barnflix.proxic.lobby

import io.ktor.websocket.Frame
import kotlinx.coroutines.channels.SendChannel
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.auth.User
import net.barnflix.proxic.room.Room
import net.barnflix.proxic.room.RoomAnnouncer
import net.barnflix.proxic.room.RoomResult
import net.barnflix.proxic.room.RoomService
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// The lobby's half of the authenticated socket.
// PHASE_05 §5.66–§5.70, AMENDMENTS 1 and 2.
//
// The socket owns authentication and revalidation; this owns what a
// signed-in connection may say. The split keeps Phase 3's security
// in one place and stops this file from growing a second copy of it.
//
// One rule runs through everything here: the connection's identity
// comes from the session the socket already authenticated, and
// never from the message. §5.67 says so for authentication, and the
// same applies to every action -- a message asking to invite
// somebody cannot also claim who is doing the inviting.

/** What the socket calls. Kept small so auth does not depend on much. */
interface LobbySocketHandler {
    suspend fun open(
        connectionId: String,
        user: User,
        outgoing: SendChannel<Frame>,
    ): LobbySession

    suspend fun close(
        connectionId: String,
        user: User,
    )
}

/** One connection's view of the lobby. */
interface LobbySession {
    fun handles(type: String?): Boolean

    suspend fun handle(
        type: String,
        message: JsonObject,
    )
}

class LobbyService(
    private val hub: LobbyHub,
    private val rooms: RoomService,
    private val invitations: Invitations = Invitations(),
    private val chat: ChatLimiter = ChatLimiter(),
) : LobbySocketHandler, RoomAnnouncer {
    private val live = ConcurrentHashMap<String, LobbyConnection>()

    // --- RoomAnnouncer: what the HTTP routes cannot say themselves ----
    //
    // §5.76 and §5.81 both describe people OTHER than the caller
    // learning that a room changed. An HTTP response reaches one
    // client; this reaches the rest of them.

    override suspend fun roomChanged(room: Room) {
        // A room that just filled is no longer inviting anybody
        // (§5.22): leaving its invitations live would let somebody
        // accept into a room with no seat, and be refused for a
        // reason they could not have known about.
        if (room.isFull()) invitations.forgetRoom(room.roomId)
        // One message PER MEMBER, not one message to all of them:
        // §5.47 and §5.140 make the room a personalized snapshot,
        // so each player's copy names only their own deck.
        for (member in room.members) hub.sendTo(member.userId, roomMessage(room, member.userId))
    }

    override suspend fun roomClosed(
        roomId: UUID,
        formerMembers: Collection<UUID>,
        reason: String,
    ) {
        // The gap this closes: an invitation outlives the room it
        // points at, and accepting it fails with ROOM_NOT_FOUND --
        // correct, and baffling to the person who was invited
        // thirty seconds ago.
        invitations.forgetRoom(roomId)
        hub.sendToAll(formerMembers, roomClosedMessage(roomId, reason))
    }

    override suspend fun setupProblem(
        userId: UUID,
        roomId: UUID,
        code: String,
        detail: String,
    ) {
        hub.sendTo(userId, setupProblemMessage(roomId, code, detail))
    }

    override suspend fun removedFromRoom(
        roomId: UUID,
        userId: UUID,
        reason: String,
    ) {
        hub.sendTo(userId, removedFromRoomMessage(roomId, reason))
    }

    override suspend fun open(
        connectionId: String,
        user: User,
        outgoing: SendChannel<Frame>,
    ): LobbySession {
        val connection = LobbyConnection(connectionId, user, outgoing)
        live[connectionId] = connection
        val firstConnection = hub.register(connection)

        // This connection learns who is here...
        hub.sendTo(user.userId, presenceMessage(hub.online()))

        // ...and everybody learns about it, but only if the user was
        // not already here in another tab (§5.6).
        if (firstConnection) {
            hub.broadcastExcept(
                user.userId,
                presenceChange(
                    PresenceEntry(user.userId, user.username, user.displayName),
                    online = true,
                ),
            )
        }

        // A refresh should land you back where you were, not outside
        // it (§5.119): the room survived, so send it.
        rooms.roomOf(user.userId)?.let { hub.sendTo(user.userId, roomMessage(it, user.userId)) }

        return Session(connection)
    }

    override suspend fun close(
        connectionId: String,
        user: User,
    ) {
        val connection = live.remove(connectionId) ?: return
        if (hub.unregister(connection)) {
            // D2 — an invitation waiting for somebody who has gone
            // is not waiting for anything, and one sent BY a host
            // who has gone leads into a room that may not exist.
            invitations.forgetUser(user.userId)
            hub.broadcastExcept(
                user.userId,
                presenceChange(
                    PresenceEntry(user.userId, user.username, user.displayName),
                    online = false,
                ),
            )
        }
    }

    /**
     * Housekeeping, on the room sweep's timer.
     *
     * `ChatLimiter.evictIdle` said in its own comment that it was
     * "called by the same sweep as session cleanup", and nothing
     * called it at all — the §5.228 audit's third instance of code
     * that exists, is tested and is wired to nothing (AGENTS
     * TEST-010). The leak was small, one map entry per user who
     * ever spoke, and small is not the same as fixed.
     */
    fun sweep() {
        chat.evictIdle()
    }

    private inner class Session(private val connection: LobbyConnection) : LobbySession {
        override fun handles(type: String?): Boolean = type in HANDLED

        override suspend fun handle(
            type: String,
            message: JsonObject,
        ) {
            when (type) {
                "INVITE" -> invite(message)
                "INVITE_ACCEPT" -> accept(message)
                "INVITE_DECLINE" -> invitations.decline(connection.user.userId)
                "CHAT" -> say(message)
            }
        }

        private val me get() = connection.user.userId

        /**
         * §5.17 — only a host invites, and only into their own room.
         *
         * The room is read from the SERVER's idea of where this user
         * is, not from the message. A client naming a room it does
         * not host would otherwise be inviting strangers into
         * somebody else's lobby.
         */
        private suspend fun invite(message: JsonObject) {
            val targetId =
                message.uuid("userId") ?: return reply(
                    errorMessage("INVALID_REQUEST", "Which player?"),
                )

            val room = rooms.roomOf(me)
            if (room == null || !room.isHost(me)) {
                return reply(errorMessage("ROOM_HOST_REQUIRED", "Host a game first."))
            }
            if (room.isFull()) {
                return reply(errorMessage("ROOM_FULL", "Your room is full."))
            }

            if (targetId == me) {
                return reply(errorMessage("CANNOT_INVITE_YOURSELF", "You are already here."))
            }

            // D2 — online only, which is what keeps an invitation a
            // message rather than a stored object with five states.
            val target =
                hub.entryFor(targetId)
                    ?: return reply(
                        errorMessage("USER_NOT_ONLINE", "That player is not signed in."),
                    )

            invitations.offer(me, room.roomId, targetId)
            hub.sendTo(
                targetId,
                inviteMessage(
                    room.roomId,
                    PresenceEntry(
                        connection.user.userId,
                        connection.user.username,
                        connection.user.displayName,
                    ),
                ),
            )
            reply(invitationSentMessage(target))
        }

        /**
         * Accepting is where an invitation becomes a seat.
         *
         * The invitation is CONSUMED first: without that check a
         * room id would be enough to join, and a room id passed
         * between users is a join code with extra steps — the thing
         * AMENDMENT 1 removed.
         */
        private suspend fun accept(message: JsonObject) {
            val roomId =
                message.uuid("roomId") ?: return reply(
                    errorMessage("INVALID_REQUEST", "Which room?"),
                )

            if (!invitations.consume(me, roomId)) {
                // Deliberately the same answer as a room that does
                // not exist (§4.65's lesson): an uninvited user must
                // not be able to probe which room ids are real.
                return reply(errorMessage("ROOM_NOT_FOUND", "No such room."))
            }

            when (val result = rooms.join(roomId, me)) {
                is RoomResult.Refused -> reply(errorMessage(result.error))

                is RoomResult.Ok ->
                    // Everyone in the room sees the new seat, the
                    // joiner included — one message, one source of
                    // truth, and the same path the HTTP routes use.
                    roomChanged(result.room)
            }
        }

        /**
         * AMENDMENT 3 — one channel, ephemeral, bounded.
         *
         * Nothing stores this. The limits are the amendment's, not
         * an implementation preference: a long message and a fast
         * typist are the two ways a chat with no storage still
         * becomes a problem.
         */
        private suspend fun say(message: JsonObject) {
            val text = message.text("text")?.trim().orEmpty()
            if (text.isEmpty()) return
            if (text.length > MAX_CHAT_LENGTH) {
                return reply(
                    errorMessage("MESSAGE_TOO_LONG", "Keep it under $MAX_CHAT_LENGTH characters."),
                )
            }
            if (!chat.allow(me)) {
                return reply(errorMessage("TOO_FAST", "Slow down a moment."))
            }

            hub.broadcast(
                chatMessage(
                    PresenceEntry(
                        connection.user.userId,
                        connection.user.username,
                        connection.user.displayName,
                    ),
                    text,
                    java.time.Instant.now().toString(),
                ),
            )
        }

        private suspend fun reply(message: JsonObject) {
            runCatching { connection.outgoing.send(Frame.Text(message.toString())) }
        }
    }

    private companion object {
        val HANDLED = setOf("INVITE", "INVITE_ACCEPT", "INVITE_DECLINE", "CHAT")

        /** Long enough for a sentence, short enough not to be a wall. */
        const val MAX_CHAT_LENGTH = 500
    }
}

private fun JsonObject.text(key: String): String? = runCatching { this[key]?.jsonPrimitive?.content }.getOrNull()

private fun JsonObject.uuid(key: String): UUID? = text(key)?.let { runCatching { UUID.fromString(it) }.getOrNull() }
