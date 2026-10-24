package net.barnflix.proxic.lobby

import io.ktor.websocket.Frame
import kotlinx.coroutines.channels.SendChannel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import net.barnflix.proxic.auth.User
import net.barnflix.proxic.room.Presence
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Presence and invitations — PHASE_05 AMENDMENTS 1 and 2.
//
// Join codes are gone, so this is how somebody gets into a room: the
// host sees who is online and clicks a name. That makes presence a
// feature rather than a diagnostic, and it makes an invitation the
// only door.
//
// Everything here is in MEMORY on purpose. Presence is connection
// state (§5.120), and owner decision D2 limits invitations to users
// who are online, so an invitation is a message to a live connection
// rather than a row with five states and an expiry policy.
//
// One piece of state is less obvious and is the reason this class
// exists rather than the socket just forwarding messages: a PENDING
// invitation is recorded server-side. Without it, accepting would
// only need a room id -- and a room id passed between users is a
// join code with extra steps, which is the thing AMENDMENT 1
// deleted.

/** Someone connected, as everyone else may see them (§4.31's rule). */
data class PresenceEntry(
    val userId: UUID,
    val username: String,
    val displayName: String,
    /** Spec 0006 — the avatar's name ("avatar-07"), or null for the default. */
    val avatar: String? = null,
)

/** A live connection. The hub writes to [outgoing] and nothing else. */
class LobbyConnection(
    val connectionId: String,
    val user: User,
    val outgoing: SendChannel<Frame>,
)

/**
 * Who is connected, and who has been invited where.
 *
 * Thread-safe by construction: every connection is its own coroutine
 * and all of them touch this.
 */
class LobbyHub : Presence {
    private val connections = ConcurrentHashMap<UUID, MutableSet<LobbyConnection>>()

    // --- connections --------------------------------------------------

    /**
     * Register a connection and report whether this user just became
     * visible.
     *
     * The distinction matters: a second browser tab is the same
     * person (§5.6), so it must not announce a new arrival to
     * everybody.
     */
    fun register(connection: LobbyConnection): Boolean {
        // Inside compute, so it cannot interleave with [unregister]:
        // as two steps, a reload's new connection could join the set
        // the old one was emptying, and then the whole set -- new
        // connection and all -- was dropped from the map. The player
        // was connected and, to everyone else, offline; and nothing
        // reached them until they reloaded again. Owner report
        // 2026-10-21: "I had to refresh multiple times".
        var wasEmpty = false
        connections.compute(connection.user.userId) { _, existing ->
            val set = existing ?: ConcurrentHashMap.newKeySet()
            wasEmpty = set.isEmpty()
            set.add(connection)
            set
        }
        return wasEmpty
    }

    /** Returns true when the user's LAST connection just went away. */
    fun unregister(connection: LobbyConnection): Boolean {
        var last = false
        connections.computeIfPresent(connection.user.userId) { _, set ->
            if (set.remove(connection) && set.isEmpty()) {
                last = true
                null
            } else {
                set
            }
        }
        return last
    }

    /**
     * §5.92 — is this player actually here?
     *
     * The same map presence is drawn from, deliberately: a room
     * that refuses to prepare because somebody is offline, and a
     * presence list showing them online, would be two answers to
     * one question.
     */
    override fun isOnline(userId: UUID): Boolean = connections[userId]?.isNotEmpty() == true

    fun online(): List<PresenceEntry> =
        connections.values
            .mapNotNull { it.firstOrNull() }
            .map { PresenceEntry(it.user.userId, it.user.username, it.user.displayName) }
            .sortedBy { it.displayName.lowercase() }

    /** The presence entry for a connected user, or null if they are not. */
    fun entryFor(userId: UUID): PresenceEntry? =
        connections[userId]?.firstOrNull()?.let {
            PresenceEntry(it.user.userId, it.user.username, it.user.displayName)
        }

    // --- sending ---------------------------------------------------------

    /**
     * One connection, one FRAME.
     *
     * Not an optimisation left on the table: a Frame is backed by a
     * buffer the writer CONSUMES, so handing the same instance to
     * two connections gives the second one an empty frame. Found by
     * a chat test where the message reached nobody but the sender,
     * and it would have reached a player's second tab the same way.
     *
     * A connection that has gone away mid-send is not an error worth
     * failing the sender for; the socket's own close handling
     * removes it.
     */
    private suspend fun LobbyConnection.deliver(text: String) {
        runCatching { outgoing.send(Frame.Text(text)) }
    }

    /**
     * Send to every connection a user has.
     *
     * All of them, not one: §5.6 says several sessions are one
     * player, and a player watching in two tabs should see the same
     * room in both.
     */
    suspend fun sendTo(
        userId: UUID,
        message: JsonObject,
    ) {
        val text = message.toString()
        connections[userId]?.forEach { it.deliver(text) }
    }

    /**
     * Everyone except one user.
     *
     * Arrivals and departures use this: you already received the
     * full presence list on connect, so being told that you have
     * arrived is noise — and noise a client would have to filter to
     * avoid announcing itself.
     */
    suspend fun broadcastExcept(
        userId: UUID,
        message: JsonObject,
    ) {
        val text = message.toString()
        connections.filterKeys { it != userId }.values.flatten().forEach { it.deliver(text) }
    }

    suspend fun broadcast(message: JsonObject) {
        val text = message.toString()
        connections.values.flatten().forEach { it.deliver(text) }
    }

    suspend fun sendToAll(
        userIds: Collection<UUID>,
        message: JsonObject,
    ) {
        userIds.toSet().forEach { sendTo(it, message) }
    }
}

/**
 * One user's arrivals and departures, one at a time.
 *
 * A reload closes the old connection and opens the new one at nearly
 * the same moment, on two coroutines. Unserialised, the old one's
 * "left" could be sent AFTER the new one's "arrived", and everybody
 * else then showed a player who was there as offline (owner report
 * 2026-10-21). Per user, so a slow connection holds up nobody else's.
 */
class PresenceTurns {
    private val locks = ConcurrentHashMap<UUID, Mutex>()

    suspend fun <T> take(
        userId: UUID,
        block: suspend () -> T,
    ): T = locks.computeIfAbsent(userId) { Mutex() }.withLock { block() }
}
