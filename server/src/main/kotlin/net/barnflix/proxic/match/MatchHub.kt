package net.barnflix.proxic.match

import io.ktor.websocket.Frame
import kotlinx.coroutines.channels.SendChannel
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import net.barnflix.proxic.BuildInfo
import org.slf4j.LoggerFactory
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Who is watching which match — PHASE_06 §6.107-§6.109.
//
// §6.109 is the rule that shapes this: one participant may have
// several connections, and they remain ONE logical participant.
// So the map is keyed by match and then by user, and a user holds
// a SET of connections. Every one of them is told; the first valid
// answer from any of them wins, which the gate enforces rather
// than this.

internal class Connection(
    val connectionId: String,
    val outgoing: SendChannel<Frame>,
    /** P11-D4 -- this connection takes MATCH_DELTA (it asked, and the server's switch allows it). */
    deltas: Boolean = false,
    /** P11-D4 (TEST ONLY, PROXIC_TEST_DELTA_CHECK) -- each delta carries the whole board too. */
    check: Boolean = false,
    limits: QueueLimits = QueueLimits(),
    clock: () -> Long = System::currentTimeMillis,
) {
    /** P11-D3 -- the history this connection's page holds; P11-D4 -- and the last board it was sent. */
    val board = BoardStream(deltas, check)

    /**
     * P11-D6 -- everything this connection is sent, in order, emptied by its
     * own coroutine (SendQueue.kt): nobody who sends to it ever waits on its
     * socket. Each board goes through [board] as it leaves.
     */
    val queue = SendQueue<Outgoing>(limits, clock) { write(it) }

    /** Queue [item] for this connection. Never suspends; false if the connection is behind or closing. */
    fun offer(item: Outgoing): Boolean = queue.offer(item)

    private suspend fun write(item: Outgoing): Boolean {
        when (item) {
            is Outgoing.Message -> deliver(item.message, item.text, item.memo)
            is Outgoing.Resend -> board.resend(outgoing) { item.stored }
            is Outgoing.Close -> {
                outgoing.send(Frame.Close(item.reason))
                return false
            }
            is Outgoing.Beat -> outgoing.send(Frame.Text(beatMessage(board.lastSent()).toString()))
        }
        return true
    }

    /**
     * P11-D6 (spec 0119) -- this connection's page said its table is live
     * again (CAUGHT_UP), at this time (ms); null before it said so. Spec
     * 0120's resume rule keeps its own, per seat (SeatLinks.caughtUp).
     */
    @Volatile
    var caughtUpAt: Long? = null
}

/** The connections watching each match, by user. */
class MatchWatchers {
    private val watchers =
        ConcurrentHashMap<UUID, ConcurrentHashMap<UUID, MutableSet<Connection>>>()

    internal fun open(
        matchId: UUID,
        userId: UUID,
        connectionId: String,
        outgoing: SendChannel<Frame>,
        deltas: Boolean = false,
        check: Boolean = false,
        // P11-D6 -- where the connection's queue is emptied (MatchSocket: the
        // socket's own session) and who is told it fell behind.
        scope: kotlinx.coroutines.CoroutineScope = SendQueue.DIRECT,
        behind: (Connection, Int, Long) -> Unit = { _, _, _ -> },
        limits: QueueLimits = QueueLimits(),
    ): Connection {
        val connection = Connection(connectionId, outgoing, deltas, check, limits)
        connection.queue.start(scope) { waiting, oldest -> behind(connection, waiting, oldest) }
        watchers
            .computeIfAbsent(matchId) { ConcurrentHashMap() }
            .computeIfAbsent(userId) { java.util.concurrent.ConcurrentHashMap.newKeySet() }
            .add(connection)
        return connection
    }

    fun close(
        matchId: UUID,
        userId: UUID,
        connectionId: String,
    ) {
        val forMatch = watchers[matchId] ?: return
        forMatch[userId]?.removeIf { it.connectionId == connectionId }
        if (forMatch[userId]?.isEmpty() == true) forMatch.remove(userId)
        if (forMatch.isEmpty()) watchers.remove(matchId)
    }

    internal fun of(
        matchId: UUID,
        userId: UUID,
    ): List<Connection> = watchers[matchId]?.get(userId)?.toList().orEmpty()

    /** Spec 0047 — every connection to one match, whoever holds it. */
    internal fun all(matchId: UUID): List<Connection> = watchers[matchId]?.values?.flatten().orEmpty()

    /** Spec 0047 — how many people (not tabs) are connected to one match. */
    fun people(matchId: UUID): Int = watchers[matchId]?.size ?: 0

    /** Spec 0067 — who (not how many tabs) is connected to one match. */
    fun users(matchId: UUID): Set<UUID> = watchers[matchId]?.keys?.toSet().orEmpty()
}

class MatchHub(
    /** P11-D4 -- who may be sent deltas (ServerConfig: PROXIC_MATCH_DELTAS, PROXIC_SPECTATOR_DELTAS). */
    val deltas: DeltaSettings = DeltaSettings(),
) : DecisionAnnouncer {
    private val log = LoggerFactory.getLogger(MatchHub::class.java)

    val watchers = MatchWatchers()

    /**
     * Spec 0047 — the people WATCHING a match, apart from its players.
     * Kept apart so nothing addressed to a player can reach one: they
     * are sent the public view and the steps, and nothing else.
     */
    val spectators = MatchWatchers()

    /** Spec 0067 — each spectator's display name, for the players' "2 watching" list. */
    val spectatorNames = ConcurrentHashMap<UUID, String>()

    /** Spec 0067 — the endings told to spectators, kept for one who comes back late. */
    val endings = SpectatorEndings(spectators)

    /**
     * Spec 0120 -- the hard pause: players' connections opening and closing,
     * told to every page of the match and to the worker (MatchPauses.kt).
     */
    val pauses = MatchPauses({ matchId -> watchers.all(matchId) + spectators.all(matchId) })

    override suspend fun spectate(
        matchId: UUID,
        message: JsonObject,
    ) {
        val start = MatchTiming.now()
        val text = lazy { message.toString() }
        val connections = spectators.all(matchId)
        val memo = DiffMemo()
        connections.forEach { connection ->
            // P11-D3 -- a board through the connection's history (BoardStream).
            // P11-D4 -- or as a delta from the board this connection was last sent.
            // P11-D6 -- into the connection's own queue: never waits on its socket.
            if (!connection.offer(Outgoing.Message(message, text, memo))) {
                log.debug("match $matchId: a spectator connection is closing: not queued")
            }
        }
        MatchTiming.out(matchId, null, message, start, connections.size)
    }

    /** Everything leaves the building through here. */
    suspend fun sendTo(
        matchId: UUID,
        userId: UUID,
        message: JsonObject,
    ) {
        // P11-D0 (test only): 0 while timing is off.
        val start = MatchTiming.now()
        val text = lazy { message.toString() }
        val connections = watchers.of(matchId, userId)
        // P11-D4 -- one diff per distinct base: two tabs usually share theirs.
        val memo = DiffMemo()
        connections.forEach { connection ->
            // A NEW Frame per connection. A Frame carries a
            // ByteBuffer whose position is consumed on write, so
            // one frame handed to several connections arrives
            // empty at every connection after the first. That is
            // not hypothetical: it shipped in the lobby hub and
            // presented as "the second player sees nothing".
            // P11-D3 -- and a board goes through the connection's
            // history: each page is sent only the entries it lacks.
            // P11-D4 -- and only what changed since its own last board.
            // P11-D6 -- and into the connection's own queue, so neither the
            // worker's pump nor the next connection waits on this one's socket.
            if (!connection.offer(Outgoing.Message(message, text, memo))) {
                log.debug("match $matchId: a connection is closing: not queued")
            }
        }
        MatchTiming.out(matchId, userId, message, start, connections.size)
    }

    override suspend fun ask(
        matchId: UUID,
        userId: UUID,
        request: DecisionRequest,
    ) {
        sendTo(matchId, userId, decisionMessage(request))
    }

    override suspend fun snapshot(
        matchId: UUID,
        userId: UUID,
        state: JsonObject,
    ) {
        sendTo(matchId, userId, snapshotMessage(state))
    }

    override suspend fun cleared(
        matchId: UUID,
        userId: UUID,
    ) {
        sendTo(matchId, userId, clearedMessage())
    }

    override suspend fun refused(
        matchId: UUID,
        userId: UUID,
        decisionId: Long,
        reason: DecisionRefusal,
    ) {
        sendTo(matchId, userId, refusalMessage(decisionId, reason))
    }

    // P11-D6 -- the message as made (and kept for a resume): its id and time kept.
    override suspend fun deliver(
        matchId: UUID,
        userId: UUID,
        message: JsonObject,
    ) {
        sendTo(matchId, userId, message)
    }

    override suspend fun concedeRefused(
        matchId: UUID,
        userId: UUID,
        reason: String,
    ) {
        sendTo(matchId, userId, concedeRefusedMessage(reason))
    }

    override suspend fun options(
        matchId: UUID,
        userId: UUID,
        found: WorkerEvent.Options,
    ) {
        sendTo(matchId, userId, decisionOptionsMessage(found))
    }

    override suspend fun asking(
        matchId: UUID,
        userId: UUID,
        seat: Int?,
        doing: String?,
    ) {
        sendTo(matchId, userId, askingMessage(seat, doing))
    }
}

private fun envelope(
    type: String,
    body: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit,
): JsonObject =
    buildJsonObject {
        put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
        put("type", type)
        put("messageId", UUID.randomUUID().toString())
        body()
    }

/**
 * §6.99 — the question, as the browser sees it.
 *
 * `actedForSeat` is included and `authorisedSeat` is not, which is
 * deliberate rather than an omission. The client is told WHOSE
 * decision this is, because under Mindslaver you need to know you
 * are playing somebody else's turn. It is not told who is
 * authorised, because that is the server's conclusion and the
 * client never gets to act on it (§6.38, §6.100) — this frame
 * only ever reaches the authorised user in the first place.
 */
fun decisionMessage(request: DecisionRequest): JsonObject =
    envelope("DECISION_REQUEST") {
        put("decisionId", request.decisionId)
        put("actedForSeat", request.actedForSeat)
        put("kind", request.kind)
        put("stateVersion", request.stateVersion)
        put("gameEpoch", request.gameEpoch)
        put("mandatory", request.mandatory)
        request.prompt?.let { put("prompt", it) }
        if (request.searchable) {
            put("searchable", true)
            put("optionCount", request.optionCount)
        }
        if (request.unavailable.isNotEmpty()) {
            putJsonObject("unavailable") { request.unavailable.forEach { (id, why) -> put(id, why) } }
        }
        request.notNow?.let { put("notNow", it) }
        request.owing?.let { put("owing", it) }
        // Spec 0097 -- why the last answer was refused, where the player acted.
        request.refused?.let { put("refused", it) }
        if (request.about.isNotEmpty()) {
            putJsonObject("about") { request.about.forEach { (key, value) -> put(key, value) } }
        }
        // Spec 0005 — a response window: the asked player's own spell or
        // trigger is on top; their page counts down (Phase 8 Amendment 4).
        if (request.window) put("window", true)
        if (request.looking.isNotEmpty()) {
            putJsonArray("looking") { request.looking.forEach { add(it) } }
        }
        putLayout(request)
        putJsonArray("options") {
            request.options.forEach { option ->
                add(option.toJson())
            }
        }
    }

/**
 * P6-AG — what a search matched.
 *
 * `total` is how many names matched, of which `options` are the
 * best few: "and 212 more" tells the player to type more.
 */
fun decisionOptionsMessage(found: WorkerEvent.Options): JsonObject =
    envelope("DECISION_OPTIONS") {
        put("decisionId", found.decisionId)
        put("query", found.query)
        put("total", found.total)
        putJsonArray("options") {
            found.options.forEach { option ->
                add(option.toJson())
            }
        }
    }

/** A search that could not be made. Not an answer refused: nothing was answered. */
fun searchRefusedMessage(
    decisionId: Long,
    reason: DecisionRefusal,
): JsonObject =
    envelope("DECISION_SEARCH_REFUSED") {
        put("decisionId", decisionId)
        put("reason", reason.name)
    }

fun refusalMessage(
    decisionId: Long,
    reason: DecisionRefusal,
): JsonObject =
    envelope("DECISION_REFUSED") {
        put("decisionId", decisionId)
        put("reason", reason.name)
    }

/**
 * §6.40 — the viewer's own state, forwarded as the worker built it.
 *
 * Not rebuilt and not re-filtered. The worker removed what this
 * viewer may not see before serialising it (§6.42); re-deriving
 * anything here would be a second opinion about visibility.
 */
fun snapshotMessage(
    state: JsonObject,
    sentAt: Long? = null,
): JsonObject =
    envelope("MATCH_SNAPSHOT") {
        // P11-D6 (spec 0119) -- when this board was first sent to the seat
        // (ms, the server's clock): kept with it, so a board resent on a
        // resume carries the time it really happened. A time, nothing else.
        sentAt?.let { put("sentAt", it) }
        put("state", state)
    }

/** Nothing is waiting on you. Carries no game information at all. */
fun clearedMessage(): JsonObject = envelope("DECISION_CLEARED") { }

/**
 * Spec 0002 — the seat being asked, or `null`: nobody, the rules engine
 * is working. A seat number, and (Phase 9 Amendment 21) a fixed word for
 * what they are doing ([doingWord]); the question itself goes only to the
 * player it is for.
 */
fun askingMessage(
    seat: Int?,
    doing: String? = null,
): JsonObject =
    envelope("MATCH_ASKING") {
        if (seat == null) put("seat", kotlinx.serialization.json.JsonNull) else put("seat", seat)
        if (seat != null && doing != null) put("doing", doing)
    }

/** §6.110 — the greeting, before any decision. */
fun matchHelloMessage(
    matchId: UUID,
    seat: Int,
    away: java.time.Duration = net.barnflix.proxic.room.RoomTimeouts.active.away,
): JsonObject =
    envelope("MATCH_HELLO") {
        put("matchId", matchId.toString())
        put("seat", seat)
        // Spec 0047 — seat 0 is nobody's: a spectator.
        if (seat == 0) put("spectator", true)
        // Spec 0054 — when the page may offer "End the game": the
        // server's own setting, so the offer and the check agree.
        put("awayMinutes", away.toMinutes())
    }

/** The answer went in. Not a game event — a receipt. */
fun decisionAcceptedMessage(decisionId: Long): JsonObject =
    envelope("DECISION_ACCEPTED") {
        put("decisionId", decisionId)
    }
