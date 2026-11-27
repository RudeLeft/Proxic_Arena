package net.barnflix.proxic.match

import io.ktor.server.routing.Route
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.auth.Sessions
import net.barnflix.proxic.auth.socketPrincipal
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

// The match socket — PHASE_06 §6.107-§6.113.
//
// A SEPARATE endpoint from /ws/user, which Phase 5 deliberately
// was not. §6.107 names this one, and the reason to take it at its
// word rather than reuse the lobby socket is §6.108: the
// participation check is per MATCH, and a socket that is already
// open for the lobby would have to acquire and drop that
// authorisation as the user moves in and out of games. A
// connection whose permissions change under it is the kind of
// thing that is correct on the day it is written.
//
// §6.113 is the other half: refreshing must not launch another
// worker, create another match or lose the pending decision.
// Nothing here creates anything — it attaches to a match that
// already exists and asks the runtime what is outstanding.

private val connectionSequence = AtomicLong()

private const val MATCH_ID = "matchId"

fun Route.matchSocket(
    sessions: Sessions,
    matches: MatchStore,
    runtime: MatchRuntime,
    hub: MatchHub,
    config: ServerConfig,
) {
    // Spec 0120 (D8) -- "End the game" for an away player now counts from the
    // game connection (LiveMatch.links), no longer from the lobby's presence.
    webSocket("/ws/matches/{$MATCH_ID}") {
        // §3.78 — the cookie, and our own page (socketPrincipal).
        val principal = socketPrincipal(sessions, config) ?: return@webSocket

        val matchId =
            call.parameters[MATCH_ID]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        val match = matchId?.let { matches.find(it) }
        val userId = principal.user.userId
        val seat = match?.participants?.firstOrNull { it.userId == userId }?.seatNumber

        // §6.108 — knowing a match id is NOT sufficient, and there
        // is no spectator access in Phase 6. A match you are not
        // in and a match that does not exist close the same way:
        // §4.65's lesson, for the sixth phase running.
        // Spec 0047 — not a player: a spectator, if the game is on here
        // (spec 0067: every game may be watched). Sent the public view,
        // never asked.
        // P11-D4 -- the page takes deltas (`?deltas=1`): a format choice, nothing else.
        val asks = hub.deltas.asked(call.request.queryParameters["deltas"])
        if (match != null && seat == null && mayWatch(match, runtime)) {
            // P11-D6 -- a spectator coming back resumes too, only while the switch is on (decision 2).
            val back =
                ResumePoint.parse(call.request.queryParameters["resume"])
                    .takeIf { hub.deltas.spectatorCatchup }
            spectate(matchId!!, principal.user, runtime, hub, asks.spectators, back)
            return@webSocket
        }
        // Spec 0067 — a spectator back after the game ended here.
        if (seat == null && toldTheEnd(match, hub)) return@webSocket
        if (match == null || seat == null) {
            close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "not a participant"))
            return@webSocket
        }

        // Spec 0120 (Q7 B) -- a player's connection: pinged every 2 s, closed
        // 3 s after an unanswered ping (Ktor's own pinger; the browser answers).
        pingIntervalMillis = net.barnflix.proxic.Limits.MATCH_PING_MS
        timeoutMillis = net.barnflix.proxic.Limits.MATCH_PONG_WAIT_MS

        val connectionId = "mconn-${connectionSequence.incrementAndGet()}"
        // P11-D6 (spec 0119) -- the board this page holds, when it came back
        // (`?resume=<gameEpoch>.<stateRevision>`): only ever used to choose
        // among this seat's OWN kept boards (§6.100).
        val resumeFrom = ResumePoint.parse(call.request.queryParameters["resume"])
        val live = runtime.liveMatch(matchId)
        // P11-D6 -- opened and given its first messages under the replay's
        // lock: the pump keeps and queues each board under it too
        // (MatchDecisions), so a live board cannot fall between what a resume
        // reads and what reaches this connection after it.
        val connection =
            synchronized(live?.replay ?: Any()) {
                val opened =
                    hub.watchers.open(
                        matchId,
                        userId,
                        connectionId,
                        outgoing,
                        deltas = asks.players,
                        check = hub.deltas.check,
                        // P11-D6 -- emptied on this socket's own coroutine; closed if it falls behind.
                        scope = this,
                        behind = { stuck, waiting, oldest -> fellBehind(matchId, stuck, waiting, oldest) },
                    )
                // P11-D6 -- everything below goes through the connection's queue too,
                // behind whatever live message reached it first, in order.
                // Spec 0047 — how many are watching, from the start (spec 0067: and who).
                hub.spectators.people(matchId).takeIf { it > 0 }?.let {
                    opened.offer(Outgoing.Message(watchingNow(matchId, hub)))
                }
                // §6.110 — hello first, and NOT a decision before it.
                opened.offer(Outgoing.Message(matchHelloMessage(matchId, seat)))
                // Spec 0120 -- every pause under way (a returning player's own seat
                // included: "back", catching up), right after the hello.
                hub.pauses.greeting(live).forEach { opened.offer(Outgoing.Message(it)) }

                // §6.110, §6.48 — STATE FIRST. A decision references
                // objects by id, so the board has to arrive before
                // the question that names them.
                // P11-D3: through this connection's history, so it and a live
                // board that reached the connection first cannot cross; the
                // first board on a connection carries every list whole.
                // P11-D6: or, coming back, the boards it missed (SeatReplay).
                firstBoards(opened, playerResume(live, seat, resumeFrom)) {
                    runtime.snapshotFor(matchId, userId)
                }
                opened
            }
        // P11-D6 -- MATCH_BEAT on a quiet line, from this connection's own coroutine.
        val beating = launch { beats(connection) }
        // Spec 0120 -- this seat has a game connection (again).
        live?.let { hub.pauses.opened(it, seat, connectionId) }

        try {
            // §6.111, §6.112 — whatever Forge is still waiting for,
            // re-sent to the connection that just arrived. The
            // decision stayed pending while nobody was listening:
            // a disconnect must never pass, concede or pick for
            // somebody. The runtime answers null for a question
            // this user may not answer, so a reconnecting opponent
            // learns nothing about what you are being asked.
            runtime.pendingFor(matchId, userId)?.let { question ->
                connection.offer(Outgoing.Message(decisionMessage(question)))
            }
            // Spec 0002 — and who is being asked, so a returning player's
            // screen does not guess it from priority.
            askingFor(runtime, matchId)?.let { asking -> connection.offer(Outgoing.Message(asking)) }

            listen(connection, runtime, matchId, userId) { live?.links?.caughtUp(seat, connectionId) }
        } finally {
            beating.cancel()
            connection.queue.stop()
            hub.watchers.close(matchId, userId, connectionId)
            // Spec 0120 -- its last connection gone, the seat drops: the game pauses.
            live?.let { hub.pauses.closed(it, seat, connectionId) }
            boardsSent(matchId, connection)
        }
    }
}

private val socketLog = org.slf4j.LoggerFactory.getLogger("net.barnflix.proxic.match.MatchSocket")

/** Every message a player's page sends, answered in turn until the connection closes. */
private suspend fun io.ktor.server.websocket.DefaultWebSocketServerSession.listen(
    connection: Connection,
    runtime: MatchRuntime,
    matchId: UUID,
    userId: UUID,
    /** Spec 0120 -- the page said its table is live: the resume rule's catch-up. */
    caughtUpNow: () -> Unit,
) {
    val resyncs = Resyncs(matchId, connection.connectionId)
    for (frame in incoming) {
        val text = (frame as? Frame.Text)?.readText() ?: continue
        // P11-D4 -- a delta did not fit: the board again, whole, then the question.
        if (resyncs.asked(text, connection)) {
            resync(connection, runtime, matchId, userId)
            continue
        }
        // P11-D0 (test only): when the player's message was read; 0 while off.
        val read = MatchTiming.now()
        // P11-D6 (spec 0119) -- the page's table is live again: noted, nothing else.
        if (caughtUp(text)) {
            connection.caughtUpAt = System.currentTimeMillis()
            caughtUpNow()
            continue
        }
        handle(text, matchId, userId, runtime)?.let { reply ->
            val start = MatchTiming.now()
            connection.offer(Outgoing.Message(reply))
            MatchTiming.out(matchId, userId, reply, start, 1)
        }
        MatchTiming.answerRead(matchId, userId, text, read)
    }
}

/**
 * P11-D4 -- MATCH_RESYNC answered as a new connection is (without the hello):
 * the stored board whole, with the whole play log (the connection's memory
 * forgotten first), then the question still waiting for this user, then who
 * is asked. State first (PROTO-002, §6.110). P11-D6: queued in that order,
 * each read now (the board first: the pump stores a board before it queues
 * it, and before the question that names it).
 */
private fun resync(
    connection: Connection,
    runtime: MatchRuntime,
    matchId: UUID,
    userId: UUID,
) {
    connection.offer(Outgoing.Resend(runtime.snapshotFor(matchId, userId)))
    runtime.pendingFor(matchId, userId)?.let { question ->
        connection.offer(Outgoing.Message(decisionMessage(question)))
    }
    askingFor(runtime, matchId)?.let { asking -> connection.offer(Outgoing.Message(asking)) }
}

/**
 * P11-D6 -- [connection]'s queue fell behind (SendQueue.kt, QueueLimits):
 * nothing more is queued for it. Closed with 4002 "behind" if the close can
 * still be written within [BEHIND_CLOSE_MS], and the session ended either way,
 * so a page that stopped reading cannot hold it open. The page reconnects as
 * from any lost connection and is sent the whole board.
 */
internal fun io.ktor.server.websocket.DefaultWebSocketServerSession.fellBehind(
    matchId: UUID,
    connection: Connection,
    waiting: Int,
    oldestMillis: Long,
) {
    socketLog.warn(
        "match $matchId: connection ${connection.connectionId} fell behind " +
            "($waiting waiting, the oldest for $oldestMillis ms): closed",
    )
    val session = this
    launch {
        connection.queue.stop()
        withTimeoutOrNull(BEHIND_CLOSE_MS) {
            session.close(CloseReason(BEHIND_CODE, "behind"))
            session.closeReason.await()
        }
        session.cancel()
    }
}

/** P11-D6 -- the close code of a connection that fell behind (protocol/README.md). */
const val BEHIND_CODE: Short = 4002

/** P11-D6 -- how long the close of a connection that fell behind may take to be written and answered. */
private const val BEHIND_CLOSE_MS = 2_000L

/**
 * P11-D4 -- MATCH_RESYNC on one connection. Nothing in it is acted on (§6.100):
 * `have` is written to the log line only, as numbers. At most one a second is
 * answered; more are logged and ignored.
 */
internal class Resyncs(
    private val matchId: UUID,
    private val connectionId: String,
) {
    private var last = 0L

    /** True when [text] is a MATCH_RESYNC to answer now (it is logged either way). */
    fun asked(
        text: String,
        connection: Connection,
    ): Boolean {
        if (!text.contains("\"MATCH_RESYNC\"")) return false
        val message = runCatching { json.parseToJsonElement(text) as JsonObject }.getOrNull() ?: return false
        if (message["type"]?.jsonPrimitive?.contentOrNullSafe() != "MATCH_RESYNC") return false
        val have = message["have"] as? JsonObject

        fun number(key: String) = runCatching { have?.get(key)?.jsonPrimitive?.long }.getOrNull()?.toString() ?: "?"
        val had = "${number("gameEpoch")}/${number("stateRevision")}"
        val now = System.currentTimeMillis()
        if (now - last < RESYNC_GAP_MS) {
            socketLog.warn("match $matchId: connection $connectionId asked for a full board again at once: ignored")
            return false
        }
        last = now
        socketLog.warn(
            "match $matchId: connection $connectionId asked for a full board " +
                "(had $had, sent ${connection.board.sent()})",
        )
        return true
    }
}

private const val RESYNC_GAP_MS = 1_000L

/**
 * P11-D4 -- one line per connection as it closes: its boards, as deltas and
 * whole by why (the measure counts them). P11-D6 -- and its queue: the most
 * messages waiting at once and the longest one waited (spec 0119's numbers).
 */
private fun boardsSent(
    matchId: UUID,
    connection: Connection,
) {
    val queue = connection.queue.summary()
    socketLog.info(
        "match $matchId: connection ${connection.connectionId} queue: most waiting ${queue.most}, " +
            "longest wait ${queue.longestMillis} ms${if (queue.behind) ", fell behind" else ""}",
    )
    val counts = connection.board.counts.toSortedMap()
    if (counts.isEmpty()) return
    val told = counts.entries.joinToString { "${it.key} ${it.value}" }
    socketLog.info("match $matchId: connection ${connection.connectionId} boards sent: $told")
}

/**
 * Spec 0047 — one spectator connection: the public view (now and as it
 * changes) and the steps; nothing they send is read. The players are
 * told how many people are watching as it changes.
 */
private suspend fun io.ktor.server.websocket.DefaultWebSocketServerSession.spectate(
    matchId: UUID,
    user: net.barnflix.proxic.auth.User,
    runtime: MatchRuntime,
    hub: MatchHub,
    deltas: Boolean,
    /** P11-D6 -- the public board this page holds, when it came back and the switch is on; else null. */
    resumeFrom: ResumePoint? = null,
) {
    val userId = user.userId
    val connectionId = "mwatch-${connectionSequence.incrementAndGet()}"
    hub.spectatorNames[userId] = user.displayName
    val live = runtime.liveMatch(matchId)
    // P11-D6 -- a spectator's connection has its own queue too: nothing waits on it.
    // Opened, greeted and given its first boards under the replay's lock (as a player's).
    val connection =
        synchronized(live?.replay ?: Any()) {
            val opened =
                hub.spectators.open(
                    matchId,
                    userId,
                    connectionId,
                    outgoing,
                    deltas,
                    hub.deltas.check,
                    scope = this,
                    behind = { stuck, waiting, oldest -> fellBehind(matchId, stuck, waiting, oldest) },
                )
            opened.offer(Outgoing.Message(matchHelloMessage(matchId, PUBLIC_SEAT)))
            // Spec 0120 (D11, answer 6) -- spectators are told every pause under way too.
            hub.pauses.greeting(live).forEach { opened.offer(Outgoing.Message(it)) }
            // Spec 0067 — with the public play log so far. P11-D6: or, coming
            // back (the switch on), the public boards missed: the public view's
            // own kept list, never a seat's.
            firstBoards(opened, spectatorResume(live, resumeFrom)) { live?.publicSnapshotWithLog() }
            opened
        }
    val resyncs = Resyncs(matchId, connectionId)
    watching(runtime, matchId, userId, on = true, anyoneLeft = true)
    tellPlayers(matchId, runtime, hub)
    try {
        askingFor(runtime, matchId)?.let { asking -> connection.offer(Outgoing.Message(asking)) }
        for (frame in incoming) {
            // A spectator changes nothing: whatever arrives is dropped, but for
            // P11-D4's MATCH_RESYNC (the public view again, whole).
            val text = (frame as? Frame.Text)?.readText() ?: continue
            if (resyncs.asked(text, connection)) {
                connection.offer(Outgoing.Resend(runtime.liveMatch(matchId)?.publicSnapshotWithLog()))
                askingFor(runtime, matchId)?.let { asking -> connection.offer(Outgoing.Message(asking)) }
            }
        }
    } finally {
        connection.queue.stop()
        hub.spectators.close(matchId, userId, connectionId)
        boardsSent(matchId, connection)
        val stillWatching = hub.spectators.of(matchId, userId).isNotEmpty()
        watching(runtime, matchId, userId, on = stillWatching, anyoneLeft = hub.spectators.people(matchId) > 0)
        tellPlayers(matchId, runtime, hub)
    }
}

/**
 * Spec 0047 — somebody started (or the last one stopped) watching: they
 * may fetch the public view's pictures, and the worker builds the public
 * view only while it is wanted.
 */
private fun watching(
    runtime: MatchRuntime,
    matchId: UUID,
    userId: UUID,
    on: Boolean,
    anyoneLeft: Boolean,
) {
    val running = runtime.liveMatch(matchId) ?: return
    if (on) running.spectators.add(userId) else running.spectators.remove(userId)
    running.worker?.watched(on || anyoneLeft)
}

private suspend fun tellPlayers(
    matchId: UUID,
    runtime: MatchRuntime,
    hub: MatchHub,
) {
    val players = runtime.liveMatch(matchId)?.match?.participants?.map { it.userId }?.distinct().orEmpty()
    val message = watchingNow(matchId, hub)
    players.forEach { player -> hub.sendTo(matchId, player, message) }
}

private val json = Json { ignoreUnknownKeys = true }

/**
 * One message from a browser.
 *
 * §6.100 — the ONLY things read from it are the decision id and
 * the chosen action. Not `seat`, not `userId`, not a Forge player
 * id, not a state version: those are the server's to know, and a
 * client that could supply them could answer for somebody else or
 * defeat the staleness check by naming the current version.
 */
private fun handle(
    text: String,
    matchId: UUID,
    userId: UUID,
    runtime: MatchRuntime,
): JsonObject? {
    val message =
        runCatching { json.parseToJsonElement(text) as JsonObject }.getOrNull() ?: return null

    return when (message["type"]?.jsonPrimitive?.content) {
        "DECISION_RESPONSE" -> {
            val decisionId =
                runCatching { message.getValue("decisionId").jsonPrimitive.long }.getOrNull()
                    ?: return refusalMessage(0, DecisionRefusal.STALE_DECISION)
            // A missing actionId is a PASS, which is an answer and
            // not an absence of one.
            val actionId = message["actionId"]?.jsonPrimitive?.contentOrNullSafe()

            when (val refusal = runtime.answer(matchId, userId, decisionId, actionId)) {
                null -> decisionAcceptedMessage(decisionId)
                else -> refusalMessage(decisionId, refusal)
            }
        }

        // P6-AG — search a question's options. Only the decision id
        // and the text are read; who is searching is the session's.
        // Results come back later, as DECISION_OPTIONS.
        "DECISION_SEARCH" -> {
            val decisionId =
                runCatching { message.getValue("decisionId").jsonPrimitive.long }.getOrNull()
                    ?: return searchRefusedMessage(0, DecisionRefusal.STALE_DECISION)
            val query = message["query"]?.jsonPrimitive?.contentOrNullSafe().orEmpty()
            runtime.search(matchId, userId, decisionId, query)?.let { searchRefusedMessage(decisionId, it) }
        }

        // PHASE_07 §7.55 — nothing is read from it at all: who
        // concedes is the session's, and for their own seat only.
        "CONCEDE" ->
            when (val refusal = runtime.concede(matchId, userId)) {
                null -> concedeAcceptedMessage()
                else -> concedeRefusedMessage(refusal)
            }

        // Spec 0088 (Q3 C) — the player closed their report window, which
        // showed reports up to `upTo` (a stamp the worker gave). Only that
        // is read: whose window it was is the session's. No reply.
        "REPORTS_CLOSED" -> {
            val upTo = runCatching { message.getValue("upTo").jsonPrimitive.long }.getOrNull() ?: return null
            runtime.reportsClosed(matchId, userId, upTo)
            null
        }

        // Spec 0054 — the other player has been offline long enough:
        // the player still here ends the game, as the other's
        // concession, so the game names the winner. Nothing but the
        // type is read: who is away, and for how long, is the server's.
        // Spec 0120 (D8) -- "away" is the GAME connection's drop.
        "END_FOR_AWAY" -> {
            val live = runtime.liveMatch(matchId) ?: return awayEndMessage("UNREACHABLE")
            awayEndMessage(live.endForAway(userId))
        }

        // A newer client saying something this server has not
        // heard of is ignored rather than disconnected.
        else -> null
    }
}

private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? =
    if (this is kotlinx.serialization.json.JsonNull) null else content
// §6.162's stopMatchesWithServer lives in ServerStopping.kt (spec 0056).
