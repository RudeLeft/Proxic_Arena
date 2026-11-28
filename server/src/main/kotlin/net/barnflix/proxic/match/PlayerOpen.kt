package net.barnflix.proxic.match

import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.UUID

// A player's game connection -- PHASE_06 §6.110-§6.112, specs 0119 and 0120.
// Split from MatchSocket.kt (spec 0122) when two addresses came to run it:
// the id route there, and `/ws/matches/current` (EarlyMatchSockets.kt).

/**
 * Spec 0122 -- one player's connection to a game they are seated in, as the
 * id route and `/ws/matches/current` (EarlyMatchSockets.kt) both run it.
 */
internal data class PlayerOpen(
    val matchId: UUID,
    val userId: UUID,
    val seat: Int,
    /** P11-D4 -- this connection takes deltas. */
    val deltas: Boolean,
    /** P11-D6 -- the board the page holds, when it came back; null for a fresh page. */
    val resumeFrom: ResumePoint?,
)

/**
 * A player's game connection, from the pings to the last close: the hello,
 * the board, the question, then every message the page sends (§6.110-§6.112,
 * spec 0119's queue and catch-up, spec 0120's seat links).
 */
internal suspend fun io.ktor.server.websocket.DefaultWebSocketServerSession.player(
    open: PlayerOpen,
    runtime: MatchRuntime,
    hub: MatchHub,
) {
    val matchId = open.matchId
    val userId = open.userId
    val seat = open.seat
    val deltas = open.deltas
    val resumeFrom = open.resumeFrom
    // Spec 0120 (Q7 B) -- a player's connection: pinged every 2 s, closed
    // 5 s after an unanswered ping (Ktor's own pinger; the browser answers).
    pingIntervalMillis = net.barnflix.proxic.Limits.MATCH_PING_MS
    timeoutMillis = net.barnflix.proxic.Limits.MATCH_PONG_WAIT_MS

    val connectionId = "mconn-${connectionSequence.incrementAndGet()}"
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
                    deltas = deltas,
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
        // The match as it is now (one being launched may have become live
        // since this connection opened), and the seat's other connections
        // the hub still has: a seat with one is not dropped.
        runtime.liveMatch(matchId)?.let {
            val others = hub.watchers.of(matchId, userId).map { c -> c.connectionId }
            hub.pauses.closed(it, seat, connectionId, stillOpen = others)
        }
        boardsSent(matchId, connection)
    }
}

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
