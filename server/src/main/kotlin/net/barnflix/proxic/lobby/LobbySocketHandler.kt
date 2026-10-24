package net.barnflix.proxic.lobby

import io.ktor.websocket.Frame
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.SendChannel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.auth.User
import net.barnflix.proxic.room.Room
import net.barnflix.proxic.room.RoomAnnouncer
import net.barnflix.proxic.room.RoomService
import net.barnflix.proxic.room.directoryEntry
import java.time.Duration
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
    /** Every active account, for the Players list (Amendment 11). */
    private val accounts: () -> List<PresenceEntry> = { emptyList() },
    /**
     * How long somebody may be gone before their invitations end
     * (Amendment 11: "until either of you signs out"). A reload or a
     * dropped connection is back well inside it; a closed browser is
     * not.
     */
    private val offlineGrace: Duration = Duration.ofSeconds(60),
    /** Spec 0006 — a name or an avatar changed: everybody's Players list again. */
    accountChanges: net.barnflix.proxic.auth.AccountChanges? = null,
) : LobbySocketHandler, RoomAnnouncer, net.barnflix.proxic.match.MatchAnnouncer {
    private val live = ConcurrentHashMap<String, LobbyConnection>()
    private val desk =
        InvitationDesk(hub, rooms, invitations) { userId ->
            accounts().firstOrNull { it.userId == userId }?.displayName
        }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val goneSince = ConcurrentHashMap<UUID, Job>()

    private val presenceOf = PresenceTurns()

    init {
        accountChanges?.onChange { hub.broadcast(playersMessage(accounts())) }
    }

    /**
     * PHASE_07 §7.64 — the room list, to everybody, whenever any room
     * changes. The same list for every viewer: it carries seats and
     * never decks (RoomDirectory), so there is nothing to tailor.
     */
    private suspend fun publishRooms() {
        hub.broadcast(roomsMessage(rooms.list.active().map { it.directoryEntry() }))
    }

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
        if (room.isFull()) desk.endAll(invitations.forgetRoom(room.roomId), InvitationEnd.SEAT_FILLED)
        // One message PER MEMBER, not one message to all of them:
        // §5.47 and §5.140 make the room a personalized snapshot,
        // so each player's copy names only their own deck.
        for (member in room.members) hub.sendTo(member.userId, roomMessage(room, member.userId))
        publishRooms()
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
        desk.endAll(invitations.forgetRoom(roomId), InvitationEnd.ROOM_CLOSED)
        hub.sendToAll(formerMembers, roomClosedMessage(roomId, reason))
        publishRooms()
    }

    /**
     * PHASE_06 §6.17 — the match moved, and its players hear it.
     *
     * Per participant, so a deck name only reaches the player it
     * belongs to. The audit that followed the "leave room" bug
     * found this path missing entirely: launching announced
     * nothing, and RUNNING announced nothing to anybody.
     */
    override suspend fun matchChanged(
        match: net.barnflix.proxic.match.Match,
        failureCode: String?,
        outcome: net.barnflix.proxic.match.GameOutcome?,
    ) {
        for (viewer in match.participants) {
            val seats =
                match.participants.map { seat ->
                    Triple(
                        seat.userId.toString(),
                        seat.seatNumber,
                        seat.deckName.takeIf { seat.userId == viewer.userId },
                    )
                }
            hub.sendTo(
                viewer.userId,
                matchMessage(
                    match.matchId.toString(),
                    match.status.name,
                    failureCode,
                    seats,
                    outcome,
                ),
            )
        }
        // A match starting or ending changes a room's line in the list.
        publishRooms()
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
        presenceOf.take(user.userId) {
            val firstConnection = hub.register(connection)

            // Back inside the grace period: nothing of theirs ends.
            goneSince.remove(user.userId)?.cancel()

            // This connection learns who is here, who could be, and which
            // rooms are open (Amendment 11, §7.64)...
            hub.sendTo(user.userId, presenceMessage(hub.online()))
            hub.sendTo(user.userId, playersMessage(accounts()))
            hub.sendTo(user.userId, roomsMessage(rooms.list.active().map { it.directoryEntry() }))

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
        }

        // A refresh should land you back where you were, not outside
        // it (§5.119): the room survived, so send it.
        rooms.roomOf(user.userId)?.let { hub.sendTo(user.userId, roomMessage(it, user.userId)) }
        // ...and so should an invitation, either way round.
        desk.resend(user.userId)

        return Session(connection)
    }

    override suspend fun close(
        connectionId: String,
        user: User,
    ) {
        val connection = live.remove(connectionId) ?: return
        presenceOf.take(user.userId) { departed(connection, user) }
    }

    private suspend fun departed(
        connection: LobbyConnection,
        user: User,
    ) {
        if (hub.unregister(connection)) {
            // D2 — an invitation waiting for somebody who has gone
            // is not waiting for anything. Amendment 11: "gone" means
            // gone for [offlineGrace], so a reload does not end one.
            goneSince[user.userId] =
                scope.launch {
                    delay(offlineGrace.toMillis())
                    if (!hub.isOnline(user.userId)) {
                        desk.endAll(invitations.forgetUser(user.userId), InvitationEnd.OFFLINE)
                    }
                    goneSince.remove(user.userId)
                }
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
                "INVITE_DECLINE" -> desk.decline(connection.user)
                "INVITE_WITHDRAW" -> desk.withdraw(connection.user)
                "CHAT" -> say(message)
                "REACT" -> react(message)
            }
        }

        private val me get() = connection.user.userId

        private suspend fun invite(message: JsonObject) {
            val targetId =
                message.uuid("userId") ?: return reply(
                    errorMessage("INVALID_REQUEST", "Which player?"),
                )
            desk.invite(connection.user, targetId, ::reply)
        }

        private suspend fun accept(message: JsonObject) {
            val roomId =
                message.uuid("roomId") ?: return reply(
                    errorMessage("INVALID_REQUEST", "Which room?"),
                )
            desk.accept(connection.user, roomId, ::reply, ::roomChanged)
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

        /**
         * Spec 0007 — a reaction on a chat line, relayed like a line:
         * one of the six, through the same rate limit, never stored.
         * An id nobody has is harmless; no page has that line.
         */
        private suspend fun react(message: JsonObject) {
            val lineId = message.uuid("lineId") ?: return reply(errorMessage("INVALID_REQUEST", "Which line?"))
            val emoji = message.text("emoji")
            if (emoji == null || emoji !in REACTIONS) {
                return reply(errorMessage("INVALID_REQUEST", "Not one of the reactions."))
            }
            if (!chat.allow(me)) return reply(errorMessage("TOO_FAST", "Slow down a moment."))
            val on = runCatching { message["on"]?.jsonPrimitive?.booleanOrNull }.getOrNull() ?: true
            hub.broadcast(
                reactionMessage(
                    PresenceEntry(connection.user.userId, connection.user.username, connection.user.displayName),
                    lineId.toString(),
                    emoji,
                    on,
                ),
            )
        }

        private suspend fun reply(message: JsonObject) {
            runCatching { connection.outgoing.send(Frame.Text(message.toString())) }
        }
    }

    private companion object {
        val HANDLED = setOf("INVITE", "INVITE_ACCEPT", "INVITE_DECLINE", "INVITE_WITHDRAW", "CHAT", "REACT")

        /** Spec 0007 — the six; the frontend's row (chatEmoji.ts) is the same list. */
        val REACTIONS = setOf("👍", "❤️", "😂", "😮", "😢", "🔥")

        /** Long enough for a sentence, short enough not to be a wall. */
        const val MAX_CHAT_LENGTH = 500
    }
}

private fun JsonObject.text(key: String): String? = runCatching { this[key]?.jsonPrimitive?.content }.getOrNull()

private fun JsonObject.uuid(key: String): UUID? = text(key)?.let { runCatching { UUID.fromString(it) }.getOrNull() }
