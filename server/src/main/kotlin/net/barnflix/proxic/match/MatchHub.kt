package net.barnflix.proxic.match

import io.ktor.websocket.Frame
import kotlinx.coroutines.channels.SendChannel
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
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

private class Connection(
    val connectionId: String,
    val outgoing: SendChannel<Frame>,
)

class MatchHub : DecisionAnnouncer {
    private val log = LoggerFactory.getLogger(MatchHub::class.java)

    private val watchers =
        ConcurrentHashMap<UUID, ConcurrentHashMap<UUID, MutableSet<Connection>>>()

    fun open(
        matchId: UUID,
        userId: UUID,
        connectionId: String,
        outgoing: SendChannel<Frame>,
    ) {
        watchers
            .computeIfAbsent(matchId) { ConcurrentHashMap() }
            .computeIfAbsent(userId) { java.util.concurrent.ConcurrentHashMap.newKeySet() }
            .add(Connection(connectionId, outgoing))
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

    /** Everything leaves the building through here. */
    suspend fun sendTo(
        matchId: UUID,
        userId: UUID,
        message: JsonObject,
    ) {
        val text = message.toString()
        watchers[matchId]?.get(userId)?.toList()?.forEach { connection ->
            // A NEW Frame per connection. A Frame carries a
            // ByteBuffer whose position is consumed on write, so
            // one frame handed to several connections arrives
            // empty at every connection after the first. That is
            // not hypothetical: it shipped in the lobby hub and
            // presented as "the second player sees nothing".
            runCatching { connection.outgoing.send(Frame.Text(text)) }
                .onFailure { log.debug("match $matchId: a connection would not take a frame") }
        }
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

    override suspend fun step(
        matchId: UUID,
        userId: UUID,
        state: JsonObject,
    ) {
        sendTo(matchId, userId, stepMessage(state))
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
        putJsonArray("options") {
            request.options.forEach { option ->
                add(
                    buildJsonObject {
                        put("actionId", option.actionId)
                        put("label", option.label)
                        // PHASE_07 §7.61 B5, B8 -- the worker sent them; the
                        // first build of the board found they stopped here.
                        option.objectId?.let { put("objectId", it) }
                        if (!option.payable) put("payable", false)
                    },
                )
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
                add(
                    buildJsonObject {
                        put("actionId", option.actionId)
                        put("label", option.label)
                        // PHASE_07 §7.61 B5, B8 -- the worker sent them; the
                        // first build of the board found they stopped here.
                        option.objectId?.let { put("objectId", it) }
                        if (!option.payable) put("payable", false)
                    },
                )
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
fun snapshotMessage(state: JsonObject): JsonObject =
    envelope("MATCH_SNAPSHOT") {
        put("state", state)
    }

/** Nothing is waiting on you. Carries no game information at all. */
fun clearedMessage(): JsonObject = envelope("DECISION_CLEARED") { }

/** §6.110 — the greeting, before any decision. */
fun matchHelloMessage(
    matchId: UUID,
    seat: Int,
): JsonObject =
    envelope("MATCH_HELLO") {
        put("matchId", matchId.toString())
        put("seat", seat)
    }

/** The answer went in. Not a game event — a receipt. */
fun decisionAcceptedMessage(decisionId: Long): JsonObject =
    envelope("DECISION_ACCEPTED") {
        put("decisionId", decisionId)
    }
